import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { querySchema, queryResource, exportCsv } from "./queries.js";
import { normalize } from "./parser.js";
import type { WhatsAppConnector } from "./whatsapp/connector.js";
import {
  queryTemplates,
  templateCreate,
  templateUpdate,
  validTemplateBody,
} from "./templates.js";
import { Service, Fault } from "./service.js";
import { Vault, equal, hash } from "./security.js";
import { transaction, event } from "./db.js";
import {
  queryActivity,
  notificationState,
  operationsSnapshot,
} from "./activity.js";
import {
  accountInput,
  assignmentStatus,
  id,
  messageInput,
  text,
} from "../../../packages/contracts/src/index.js";
export interface AppConfig {
  apiToken: string;
  reauthSecret: string;
  encryptionKey: string;
  mockEnabled: boolean;
}
const uuidParam = z.object({ id });
declare module "fastify" {
  interface FastifyRequest {
    clientSessionId: string | null;
  }
}
const cursorQuery = z.object({
  cursor: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
const listQuery = querySchema;
export async function createApp(
  pool: pg.Pool,
  config: AppConfig,
  whatsapp?: WhatsAppConnector,
) {
  if (
    config.apiToken.length < 32 ||
    config.reauthSecret.length < 32 ||
    equal(config.apiToken, config.reauthSecret)
  )
    throw new Error("INVALID_AUTH_CONFIGURATION");
  const app = Fastify({
    logger: false,
    bodyLimit: 32768,
    trustProxy: false,
    requestTimeout: 20000,
  });
  const service = new Service(pool, new Vault(config.encryptionKey));
  app.decorateRequest("clientSessionId", null);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.setErrorHandler((err, _req, res) => {
    if (err instanceof z.ZodError)
      return res.code(400).send({ code: "VALIDATION_ERROR" });
    if (err instanceof Fault)
      return res.code(err.statusCode).send({ code: err.code });
    const e = err as { code?: string; statusCode?: number };
    if (e.code === "23505") return res.code(409).send({ code: "CONFLICT" });
    if (e.code === "23503")
      return res.code(409).send({ code: "RELATED_RESOURCE_UNAVAILABLE" });
    if (e.statusCode && e.statusCode < 500)
      return res.code(e.statusCode).send({
        code: e.statusCode === 429 ? "RATE_LIMITED" : "VALIDATION_ERROR",
      });
    return res.code(503).send({ code: "SERVICE_UNAVAILABLE" });
  });
  app.addHook("onRequest", async (req, res) => {
    res
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff");
    if (req.url === "/health") return;
    const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (equal(supplied, config.apiToken)) return;
    if (!supplied || supplied.length > 256)
      return res.code(401).send({ code: "PERMISSION_DENIED" });
    const session = (
      await pool.query(
        "SELECT id FROM client_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
        [hash(supplied)],
      )
    ).rows[0];
    if (!session) return res.code(401).send({ code: "PERMISSION_DENIED" });
    req.clientSessionId = session.id;
  });
  async function reauth(req: {
    headers: Record<string, unknown>;
    clientSessionId?: string | null;
  }) {
    if (req.clientSessionId) {
      const grant = req.headers["x-reauth-secret"];
      if (typeof grant !== "string" || grant.length > 256)
        throw new Fault("REAUTH_REQUIRED", 403);
      const result = await pool.query(
        "UPDATE client_sessions SET reauth_hash=NULL,reauth_expires_at=NULL WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() AND reauth_hash=$2 AND reauth_expires_at>now() RETURNING id",
        [req.clientSessionId, hash(grant)],
      );
      if (!result.rowCount) throw new Fault("REAUTH_REQUIRED", 403);
      return;
    }
    if (
      typeof req.headers["x-reauth-secret"] !== "string" ||
      !equal(req.headers["x-reauth-secret"], config.reauthSecret)
    )
      throw new Fault("REAUTH_REQUIRED", 403);
  }
  app.get("/health", async () => ({
    status: "ok",
    version: "0.5.0",
    provider: "mock",
  }));
  app.get("/ready", async () => {
    await pool.query("SELECT 1");
    return { status: "ready" };
  });
  app.get("/v1/me", async () => ({
    id: "owner",
    role: "owner",
    provider: "mock",
    liveSendingEnabled: whatsapp?.sendingEnabled ?? false,
    liveConnectionEnabled: whatsapp?.connectionEnabled ?? false,
  }));
  app.post("/v1/client-session/revoke", async (req) => {
    if (!req.clientSessionId) throw new Fault("CLIENT_SESSION_REQUIRED", 400);
    return transaction(pool, async (c) => {
      await c.query(
        "UPDATE client_sessions SET revoked_at=now(),reauth_hash=NULL WHERE id=$1",
        [req.clientSessionId],
      );
      await event(c, "CLIENT_SESSION_REVOKED", req.clientSessionId!);
      return { ok: true };
    });
  });
  app.get(
    "/v1/dashboard",
    async () =>
      (
        await pool.query(`SELECT
    (SELECT count(*)::int FROM accounts WHERE archived_at IS NULL) accounts,
    (SELECT count(*)::int FROM assignments WHERE status NOT IN ('COMPLETED','CANCELED')) open,
    (SELECT count(*)::int FROM assignments WHERE status='COMPLETED') completed,
    (SELECT count(*)::int FROM source_messages WHERE state='REVIEW') review,
    (SELECT count(*)::int FROM reply_jobs WHERE status='UNKNOWN_DELIVERY') unknown_delivery`)
      ).rows[0],
  );
  app.get(
    "/v1/sessions",
    async () =>
      (
        await pool.query(
          "SELECT id,label,provider,status,version,connect_requested,receiving_since,connected_at,last_error_code,created_at FROM whatsapp_sessions ORDER BY created_at LIMIT 100",
        )
      ).rows,
  );
  app.post("/v1/sessions", async (req) => {
    const input = z
      .object({
        label: text,
        provider: z.enum(["mock", "baileys"]).default("mock"),
      })
      .strict()
      .parse(req.body);
    if (input.provider === "mock" && !config.mockEnabled)
      throw new Fault("MOCK_DISABLED", 403);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO whatsapp_sessions(id,label,provider,status) VALUES($1,$2,$3,$4) RETURNING id,label,provider,status,version,created_at",
          [
            randomUUID(),
            input.label,
            input.provider,
            input.provider === "mock" ? "MOCK" : "STOPPED",
          ],
        )
      ).rows[0];
      await event(
        c,
        input.provider === "mock"
          ? "MOCK_SESSION_CREATED"
          : "WHATSAPP_SESSION_CREATED",
        row.id,
      );
      return row;
    });
  });
  app.post("/v1/sessions/pairing-request", async () => {
    throw new Fault("LIVE_WHATSAPP_NOT_AUTHORIZED", 403);
  });
  const connector = () => {
    if (!whatsapp) throw new Fault("LIVE_WHATSAPP_NOT_AUTHORIZED", 403);
    return whatsapp;
  };
  app.get(
    "/v1/whatsapp/capabilities",
    async () =>
      whatsapp?.capabilities() ?? {
        implemented: false,
        connectionEnabled: false,
        sendingEnabled: false,
        provider: "baileys",
      },
  );
  app.post("/v1/sessions/:id/connect", async (req) => {
    await reauth(req);
    const sessionId = uuidParam.parse(req.params).id;
    z.object({
      confirmation: z.literal("CONNECT WHATSAPP"),
      acknowledgeUnofficial: z.literal(true),
    })
      .strict()
      .parse(req.body);
    await connector().connect(sessionId);
    return { ok: true };
  });
  app.post("/v1/sessions/:id/disconnect", async (req) => {
    await reauth(req);
    const sessionId = uuidParam.parse(req.params).id;
    const row = (
      await pool.query(
        "SELECT id FROM whatsapp_sessions WHERE id=$1 AND provider='baileys'",
        [sessionId],
      )
    ).rows[0];
    if (!row) throw new Fault("LIVE_SESSION_REQUIRED", 400);
    await connector().disconnect(sessionId);
    return { ok: true };
  });
  app.post("/v1/sessions/:id/pairing", async (req) => {
    await reauth(req);
    return connector().pairing(uuidParam.parse(req.params).id);
  });
  app.post("/v1/sessions/:id/available-groups", async (req) => {
    await reauth(req);
    return connector().listGroups(uuidParam.parse(req.params).id);
  });
  app.get(
    "/v1/whatsapp/ingress-errors",
    async () =>
      (
        await pool.query(
          "SELECT id,session_id,group_id,attempts,last_error_code,received_at FROM whatsapp_ingress WHERE state='ERROR' ORDER BY id LIMIT 100",
        )
      ).rows,
  );
  app.post("/v1/whatsapp/ingress-errors/:id/retry", async (req) => {
    await reauth(req);
    const rowId = z
      .object({ id: z.string().regex(/^[1-9]\d{0,15}$/) })
      .parse(req.params).id;
    z.object({ confirmation: z.literal("RETRY INGRESS") })
      .strict()
      .parse(req.body);
    return transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(8240005)");
      const row = (
        await c.query(
          "UPDATE whatsapp_ingress SET state='PENDING',attempts=0,last_error_code=NULL WHERE id=$1 AND state='ERROR' RETURNING session_id",
          [rowId],
        )
      ).rows[0];
      if (!row) throw new Fault("NOT_FOUND", 404);
      await event(c, "WHATSAPP_INGRESS_RETRY_REQUESTED", row.session_id);
      return { ok: true };
    });
  });

  app.get(
    "/v1/task-types",
    async () =>
      (await pool.query("SELECT * FROM task_types ORDER BY code LIMIT 100"))
        .rows,
  );
  app.post("/v1/task-types", async (req) => {
    const p = z.object({ code: text, name: text }).strict().parse(req.body);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO task_types(id,code,name) VALUES($1,$2,$3) RETURNING *",
          [randomUUID(), p.code, p.name],
        )
      ).rows[0];
      await event(c, "TASK_TYPE_CREATED", row.id);
      return row;
    });
  });
  app.get(
    "/v1/groups",
    async () =>
      (await pool.query("SELECT * FROM groups ORDER BY title LIMIT 500")).rows,
  );
  app.post("/v1/groups", async (req) => {
    const p = z
      .object({
        sessionId: id,
        externalGroupId: text,
        title: text,
        taskTypeId: id,
        namespace: text,
        periodKey: text,
      })
      .strict()
      .parse(req.body);
    const session = (
      await pool.query("SELECT provider FROM whatsapp_sessions WHERE id=$1", [
        p.sessionId,
      ])
    ).rows[0];
    if (!session) throw new Fault("NOT_FOUND", 404);
    if (session.provider === "baileys") {
      await reauth(req);
      if (!connector().knownGroup(p.sessionId, p.externalGroupId))
        throw new Fault("WHATSAPP_GROUP_NOT_DISCOVERED", 409);
    }
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            p.sessionId,
            p.externalGroupId,
            p.title,
            p.taskTypeId,
            normalize(p.namespace),
            p.periodKey,
          ],
        )
      ).rows[0];
      await event(c, "GROUP_CREATED", row.id);
      return row;
    });
  });
  app.patch("/v1/groups/:id", async (req) => {
    const { id: groupId } = uuidParam.parse(req.params);
    const p = z
      .object({ version: z.number().int().positive(), enabled: z.boolean() })
      .strict()
      .parse(req.body);
    const provider = (
      await pool.query(
        "SELECT s.provider FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE g.id=$1",
        [groupId],
      )
    ).rows[0]?.provider;
    if (provider === "baileys") await reauth(req);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "UPDATE groups SET enabled=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING *",
          [groupId, p.enabled, p.version],
        )
      ).rows[0];
      if (!row) throw new Fault("CONFLICT");
      await event(c, "GROUP_UPDATED", row.id);
      return row;
    });
  });

  app.get("/v1/group-rules", async (req) => {
    const p = z.object({ groupId: id }).parse(req.query);
    return (
      await pool.query(
        "SELECT r.*,t.name task_name FROM group_rules r JOIN task_types t ON t.id=r.task_type_id WHERE r.group_id=$1 ORDER BY priority DESC,r.id",
        [p.groupId],
      )
    ).rows;
  });
  app.post("/v1/group-rules", async (req) => {
    const p = z
      .object({
        groupId: id,
        taskTypeId: id,
        keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
        priority: z.number().int().min(0).max(100),
      })
      .strict()
      .parse(req.body);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO group_rules(id,group_id,task_type_id,keywords,priority) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [randomUUID(), p.groupId, p.taskTypeId, p.keywords, p.priority],
        )
      ).rows[0];
      await c.query("UPDATE groups SET version=version+1 WHERE id=$1", [
        p.groupId,
      ]);
      await event(c, "GROUP_RULE_CREATED", row.id);
      return row;
    });
  });
  app.patch("/v1/group-rules/:id", async (req) => {
    const { id: ruleId } = uuidParam.parse(req.params);
    const p = z
      .object({ version: z.number().int().positive(), enabled: z.boolean() })
      .strict()
      .parse(req.body);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "UPDATE group_rules SET enabled=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING *",
          [ruleId, p.enabled, p.version],
        )
      ).rows[0];
      if (!row) throw new Fault("CONFLICT");
      await c.query("UPDATE groups SET version=version+1 WHERE id=$1", [
        row.group_id,
      ]);
      await event(c, "GROUP_RULE_UPDATED", row.id);
      return row;
    });
  });
  app.post("/v1/reports/export", async (req) => {
    await reauth(req);
    const p = z
      .object({
        resource: z.enum(["accounts", "assignments"]),
        query: querySchema.optional(),
      })
      .strict()
      .parse(req.body);
    const result = await queryResource(pool, p.resource, p.query ?? {});
    await transaction(pool, async (c) => event(c, "REPORT_EXPORTED"));
    return {
      filename: `TaskPilot-${p.resource}.csv`,
      content: exportCsv(p.resource, result.items),
      rowsCount: result.items.length,
      total: result.total,
    };
  });
  app.post("/v1/mock/messages", async (req) => {
    if (!config.mockEnabled) throw new Fault("MOCK_DISABLED", 403);
    const p = messageInput.parse(req.body);
    if (
      !(
        await pool.query(
          "SELECT id FROM whatsapp_sessions WHERE id=$1 AND provider='mock'",
          [p.sessionId],
        )
      ).rowCount
    )
      throw new Fault("MOCK_SESSION_REQUIRED", 403);
    return service.ingest(p);
  });

  app.get("/v1/inbox", async (req) => {
    const q = listQuery.parse(req.query);
    const result = await queryResource(pool, "inbox", q);
    return q.page === "true" ? result : result.items;
  });
  app.post("/v1/inbox/:id/reveal", async (req) => {
    await reauth(req);
    const { id: messageId } = uuidParam.parse(req.params);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "SELECT encrypted_payload FROM source_messages WHERE id=$1 AND state='REVIEW'",
          [messageId],
        )
      ).rows[0];
      if (!row) throw new Fault("NOT_FOUND", 404);
      await event(c, "REVIEW_REVEALED", messageId);
      return {
        text: row.encrypted_payload
          ? service.vault.open(row.encrypted_payload, `message:${messageId}`)
          : "",
        expiresInSeconds: 30,
      };
    });
  });
  app.post("/v1/inbox/:id/resolve", async (req) => {
    await reauth(req);
    const { id: messageId } = uuidParam.parse(req.params);
    const p = z
      .object({
        version: z.number().int().positive(),
        account: accountInput,
        taskTypeId: id.optional(),
      })
      .strict()
      .parse(req.body);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "SELECT s.*,g.namespace,g.task_type_id,g.period_key,g.enabled FROM source_messages s JOIN groups g ON g.id=s.group_id WHERE s.id=$1 FOR UPDATE OF s",
          [messageId],
        )
      ).rows[0];
      if (!row || row.state !== "REVIEW" || row.version !== p.version)
        throw new Fault("CONFLICT");
      if (
        !row.enabled ||
        normalize(p.account.namespace) !== normalize(row.namespace)
      )
        throw new Fault("REVIEW_SCOPE_MISMATCH");
      if (row.routing_ambiguous && !p.taskTypeId)
        throw new Fault("TASK_TYPE_REVIEW_REQUIRED", 400);
      const assignment = await service.materialize(
        c,
        messageId,
        {
          ...row,
          task_type_id:
            p.taskTypeId ?? row.routing_task_type_id ?? row.task_type_id,
          priority: row.routing_priority,
        },
        p.account,
      );
      await event(c, "REVIEW_RESOLVED", messageId);
      return { assignmentId: assignment.id };
    });
  });
  app.get("/v1/accounts", async (req) => {
    const q = listQuery.parse(req.query);
    const result = await queryResource(pool, "accounts", q);
    return q.page === "true" ? result : result.items;
  });
  app.post("/v1/accounts", async (req) => {
    const p = accountInput.parse(req.body);
    return transaction(pool, async (c) => {
      const row = await service.account(c, p);
      await event(c, "ACCOUNT_SAVED", row.id);
      return row;
    });
  });
  app.patch("/v1/accounts/:id", async (req) => {
    const { id: accountId } = uuidParam.parse(req.params);
    const p = z
      .object({
        version: z.number().int().positive(),
        displayName: text,
        password: z.string().min(1).max(1024).optional(),
      })
      .strict()
      .parse(req.body);
    if (p.password) await reauth(req);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "UPDATE accounts SET display_name=$2,version=version+1 WHERE id=$1 AND version=$3 RETURNING *",
          [accountId, p.displayName, p.version],
        )
      ).rows[0];
      if (!row) throw new Fault("CONFLICT");
      if (p.password)
        await service.account(
          c,
          {
            namespace: row.namespace,
            username: row.username_normalized,
            displayName: row.display_name,
            password: p.password,
          },
          true,
        );
      await event(c, "ACCOUNT_UPDATED", accountId);
      return row;
    });
  });
  app.post("/v1/accounts/:id/reveal", async (req) => {
    await reauth(req);
    const { id: accountId } = uuidParam.parse(req.params);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "SELECT ciphertext FROM account_credentials WHERE account_id=$1",
          [accountId],
        )
      ).rows[0];
      if (!row) throw new Fault("NOT_FOUND", 404);
      await event(c, "CREDENTIAL_REVEALED", accountId);
      return {
        password: service.vault.open(row.ciphertext, `credential:${accountId}`),
        expiresInSeconds: 30,
      };
    });
  });
  for (const action of ["archive", "restore"] as const)
    app.post(`/v1/accounts/:id/${action}`, async (req) => {
      const { id: accountId } = uuidParam.parse(req.params);
      const p = z
        .object({ version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      return transaction(pool, async (c) => {
        const row = (
          await c.query(
            `UPDATE accounts SET archived_at=${action === "archive" ? "now()" : "NULL"},version=version+1 WHERE id=$1 AND version=$2 RETURNING *`,
            [accountId, p.version],
          )
        ).rows[0];
        if (!row) throw new Fault("CONFLICT");
        if (action === "archive")
          await c.query(
            "UPDATE reply_jobs SET status='CANCELED' WHERE assignment_id IN (SELECT id FROM assignments WHERE account_id=$1) AND status='APPROVED'",
            [accountId],
          );
        await event(c, `ACCOUNT_${action.toUpperCase()}`, accountId);
        return row;
      });
    });
  app.get("/v1/assignments", async (req) => {
    const q = listQuery.parse(req.query);
    const result = await queryResource(pool, "assignments", q);
    return q.page === "true" ? result : result.items;
  });
  app.patch("/v1/assignments/:id/status", async (req) => {
    const { id: assignmentId } = uuidParam.parse(req.params);
    const p = z
      .object({
        status: assignmentStatus,
        version: z.number().int().positive(),
      })
      .strict()
      .parse(req.body);
    return transaction(pool, async (c) => {
      await c.query(
        "SELECT ac.id FROM accounts ac JOIN assignments a ON a.account_id=ac.id WHERE a.id=$1 FOR UPDATE OF ac",
        [assignmentId],
      );
      const row = (
        await c.query(
          "UPDATE assignments SET status=$2,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END,version=version+1 WHERE id=$1 AND version=$3 RETURNING *",
          [assignmentId, p.status, p.version],
        )
      ).rows[0];
      if (!row) throw new Fault("CONFLICT");
      await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
        row.account_id,
      ]);
      await event(c, "ASSIGNMENT_STATUS_CHANGED", assignmentId);
      return row;
    });
  });
  app.post("/v1/assignments/:id/deletion-preview", async (req) =>
    service.assignmentDeletionPreview(uuidParam.parse(req.params).id),
  );
  app.post("/v1/assignments/:id/delete", async (req) => {
    await reauth(req);
    const p = z
      .object({ approvalToken: text, confirmation: text })
      .strict()
      .parse(req.body);
    return service.deleteAssignment(
      uuidParam.parse(req.params).id,
      p.approvalToken,
      p.confirmation,
    );
  });
  app.get("/v1/reply-templates", async (req) =>
    queryTemplates(pool, req.query),
  );
  app.post("/v1/reply-templates", async (req) => {
    const p = templateCreate.parse(req.body);
    if (!validTemplateBody(p.body)) throw new Fault("UNSAFE_TEMPLATE", 400);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO reply_templates(id,code,body,group_id,task_type_id,enabled) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            randomUUID(),
            p.code,
            p.body,
            p.groupId ?? null,
            p.taskTypeId ?? null,
            p.enabled,
          ],
        )
      ).rows[0];
      await event(c, "TEMPLATE_CREATED", row.id);
      return row;
    });
  });
  app.patch("/v1/reply-templates/:id", async (req) => {
    const templateId = uuidParam.parse(req.params).id,
      p = templateUpdate.parse(req.body);
    if (p.body !== undefined && !validTemplateBody(p.body))
      throw new Fault("UNSAFE_TEMPLATE", 400);
    return transaction(pool, async (c) => {
      // Approval locks source groups before template rows. Acquire FK group locks in
      // the same order before updating a scope, avoiding a group/template lock cycle.
      const before = (
        await c.query(
          "SELECT group_id,version FROM reply_templates WHERE id=$1",
          [templateId],
        )
      ).rows[0];
      if (!before) throw new Fault("NOT_FOUND", 404);
      if (before.version !== p.version) throw new Fault("CONFLICT");
      const groupIds = [
        ...new Set(
          [before.group_id, p.groupId].filter(
            (v): v is string => typeof v === "string",
          ),
        ),
      ].sort();
      if (groupIds.length)
        await c.query(
          "SELECT id FROM groups WHERE id=ANY($1::uuid[]) ORDER BY id FOR KEY SHARE",
          [groupIds],
        );
      const prior = (
        await c.query("SELECT * FROM reply_templates WHERE id=$1 FOR UPDATE", [
          templateId,
        ])
      ).rows[0];
      if (!prior) throw new Fault("NOT_FOUND", 404);
      if (prior.version !== p.version) throw new Fault("CONFLICT");
      const row = (
        await c.query(
          "UPDATE reply_templates SET body=$2,enabled=$3,group_id=$4,task_type_id=$5,version=version+1 WHERE id=$1 RETURNING *",
          [
            templateId,
            p.body ?? prior.body,
            p.enabled ?? prior.enabled,
            p.groupId === undefined ? prior.group_id : p.groupId,
            p.taskTypeId === undefined ? prior.task_type_id : p.taskTypeId,
          ],
        )
      ).rows[0];
      await event(c, "TEMPLATE_UPDATED", row.id);
      return row;
    });
  });
  app.get(
    "/v1/reply-jobs",
    async () =>
      (
        await pool.query(
          "SELECT * FROM reply_jobs ORDER BY approved_at DESC LIMIT 500",
        )
      ).rows,
  );
  app.post("/v1/reply-jobs/preview", async (req) =>
    service.replyPreview(
      z
        .object({ assignmentId: id, sourceMessageId: id, templateId: id })
        .strict()
        .parse(req.body),
    ),
  );
  app.post("/v1/reply-jobs/approve", async (req) => {
    await reauth(req);
    const p = z
      .object({ approvalToken: text, idempotencyKey: text })
      .strict()
      .parse(req.body);
    return service.approveReply(
      p.approvalToken,
      p.idempotencyKey,
      whatsapp?.sendingEnabled === true,
    );
  });
  app.post("/v1/reply-jobs/:id/reconcile", async (req) => {
    await reauth(req);
    const { id: jobId } = uuidParam.parse(req.params);
    const p = z
      .object({
        outcome: z.enum(["CONFIRMED_SENT", "CONFIRMED_NOT_SENT"]),
        evidenceKind: z.enum(["MANUAL", "PROVIDER_RECEIPT"]),
        providerMessageId: text.optional(),
      })
      .strict()
      .parse(req.body);
    if (p.outcome === "CONFIRMED_NOT_SENT" && p.providerMessageId)
      throw new Fault("VALIDATION_ERROR", 400);
    if (p.evidenceKind === "PROVIDER_RECEIPT" && !p.providerMessageId)
      throw new Fault("EVIDENCE_REQUIRED", 400);
    return transaction(pool, async (c) => {
      const account = (
        await c.query(
          "SELECT ac.id FROM accounts ac JOIN assignments a ON a.account_id=ac.id JOIN reply_jobs r ON r.assignment_id=a.id WHERE r.id=$1 FOR UPDATE OF ac",
          [jobId],
        )
      ).rows[0];
      if (!account) throw new Fault("NOT_FOUND", 404);
      const job = (
        await c.query(
          "UPDATE reply_jobs SET status=$2,reconciled_at=now(),reconciliation_evidence=$3,provider_message_id=COALESCE($4,provider_message_id) WHERE id=$1 AND status='UNKNOWN_DELIVERY' RETURNING *",
          [
            jobId,
            p.outcome === "CONFIRMED_SENT" ? "SENT" : "FAILED",
            p.evidenceKind,
            p.providerMessageId ?? null,
          ],
        )
      ).rows[0];
      if (!job) throw new Fault("CONFLICT");
      await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
        account.id,
      ]);
      await event(
        c,
        p.outcome === "CONFIRMED_SENT"
          ? "REPLY_RECONCILED_SENT"
          : "REPLY_RECONCILED_NOT_SENT",
        job.id,
      );
      return job;
    });
  });
  app.post("/v1/issue-flags", async (req) => {
    const p = z
      .object({
        accountId: id,
        kind: z.enum([
          "INVALID_ACCOUNT_PASSWORD",
          "INVALID_ACCOUNT_CODE",
          "UNVERIFIED_CREDENTIALS",
        ]),
        evidenceKind: z.enum(["MANUAL", "AUTHORIZED_CHECK", "UNVERIFIED"]),
      })
      .strict()
      .parse(req.body);
    const verified = p.kind !== "UNVERIFIED_CREDENTIALS";
    if (verified) {
      await reauth(req);
      if (p.evidenceKind === "UNVERIFIED")
        throw new Fault("UNVERIFIED_CREDENTIALS");
    }
    return transaction(pool, async (c) => {
      await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
        p.accountId,
      ]);
      const row = (
        await c.query(
          "INSERT INTO issue_flags(id,account_id,kind,verified,evidence_kind) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [randomUUID(), p.accountId, p.kind, verified, p.evidenceKind],
        )
      ).rows[0];
      await c.query(
        "UPDATE assignments SET status='NEEDS_REVIEW',completed_at=NULL,version=version+1 WHERE account_id=$1 AND status<>'CANCELED'",
        [p.accountId],
      );
      await event(
        c,
        verified
          ? "CREDENTIAL_ERROR_VERIFIED"
          : "ACCOUNT_CREDENTIALS_UNVERIFIED",
        p.accountId,
      );
      return row;
    });
  });
  app.post("/v1/deletions/preview", async (req) => {
    const p = z
      .object({
        ids: z.array(id).min(1).max(1000).optional(),
        all: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    if ((p.all && p.ids) || (!p.all && !p.ids))
      throw new Fault("VALIDATION_ERROR", 400);
    return service.deletionPreview(p.ids, p.all);
  });
  app.post("/v1/deletions/confirm", async (req) => {
    await reauth(req);
    const p = z
      .object({ approvalToken: text, confirmation: text })
      .strict()
      .parse(req.body);
    return service.deleteAccounts(p.approvalToken, p.confirmation);
  });
  app.get("/v1/notifications", async (req) => {
    const paged = z
      .object({ page: z.enum(["true", "false"]).default("false") })
      .parse(req.query);
    if (paged.page === "true")
      return queryActivity(pool, "notifications", req.query);
    const { cursor } = cursorQuery.parse(req.query);
    return (
      await pool.query(
        "SELECT * FROM notifications WHERE id>$1 ORDER BY id LIMIT 500",
        [cursor],
      )
    ).rows;
  });
  app.get("/v1/notifications/state", async () => notificationState(pool));
  app.post("/v1/notifications/read", async (req) => {
    const { ids } = z
      .object({
        ids: z
          .array(
            z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(req.body);
    const result = await pool.query(
      "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=ANY($1::bigint[]) RETURNING id",
      [ids],
    );
    return { updated: result.rowCount };
  });
  app.get("/v1/operations", async () => ({
    ...(await operationsSnapshot(pool)),
    liveConnectionEnabled: whatsapp?.connectionEnabled ?? false,
    liveSendingEnabled: whatsapp?.sendingEnabled ?? false,
  }));
  app.post("/v1/notifications/:id/read", async (req) => {
    const p = z
      .object({
        id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      })
      .parse(req.params);
    await pool.query("UPDATE notifications SET read_at=now() WHERE id=$1", [
      p.id,
    ]);
    return { ok: true };
  });
  app.get("/v1/changes", async (req) => {
    const { cursor } = cursorQuery.parse(req.query);
    const items = (
      await pool.query(
        "SELECT * FROM notifications WHERE id>$1 ORDER BY id LIMIT 500",
        [cursor],
      )
    ).rows;
    return {
      items,
      cursor: items.at(-1)?.id ?? String(cursor),
      hasMore: items.length === 500,
    };
  });
  app.get("/v1/audit", async (req) => {
    const result = await queryActivity(pool, "audit", req.query);
    return z
      .object({ page: z.enum(["true", "false"]).default("false") })
      .parse(req.query).page === "true"
      ? result
      : result.items;
  });
  return app;
}
