import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { Service, Fault } from "./service.js";
import { Vault, equal } from "./security.js";
import { transaction, event } from "./db.js";
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
const cursorQuery = z.object({
  cursor: z.coerce
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .default(0),
});
const listQuery = z.object({
  search: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export async function createApp(pool: pg.Pool, config: AppConfig) {
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
    if (!equal(supplied, config.apiToken))
      return res.code(401).send({ code: "PERMISSION_DENIED" });
  });
  function reauth(req: { headers: Record<string, unknown> }) {
    if (
      typeof req.headers["x-reauth-secret"] !== "string" ||
      !equal(req.headers["x-reauth-secret"], config.reauthSecret)
    )
      throw new Fault("REAUTH_REQUIRED", 403);
  }
  app.get("/health", async () => ({
    status: "ok",
    version: "0.1.0",
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
    liveSendingEnabled: false,
  }));
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
          "SELECT * FROM whatsapp_sessions ORDER BY created_at LIMIT 100",
        )
      ).rows,
  );
  app.post("/v1/sessions", async (req) => {
    if (!config.mockEnabled) throw new Fault("MOCK_DISABLED", 403);
    const input = z.object({ label: text }).strict().parse(req.body);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,$2,'mock') RETURNING *",
          [randomUUID(), input.label],
        )
      ).rows[0];
      await event(c, "MOCK_SESSION_CREATED", row.id);
      return row;
    });
  });
  app.post("/v1/sessions/pairing-request", async () => {
    throw new Fault("LIVE_WHATSAPP_NOT_AUTHORIZED", 403);
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
            p.namespace,
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
  app.post("/v1/mock/messages", async (req) => {
    if (!config.mockEnabled) throw new Fault("MOCK_DISABLED", 403);
    return service.ingest(messageInput.parse(req.body));
  });
  app.get("/v1/inbox", async (req) => {
    const p = listQuery.parse(req.query);
    return (
      await pool.query(
        "SELECT s.id,s.session_id,s.group_id,s.external_message_id,s.state,s.version,s.received_at,g.title group_title FROM source_messages s JOIN groups g ON g.id=s.group_id WHERE s.state='REVIEW' ORDER BY received_at LIMIT $1 OFFSET $2",
        [p.limit, p.offset],
      )
    ).rows;
  });
  app.post("/v1/inbox/:id/reveal", async (req) => {
    reauth(req);
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
    reauth(req);
    const { id: messageId } = uuidParam.parse(req.params);
    const p = z
      .object({ version: z.number().int().positive(), account: accountInput })
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
      if (!row.enabled || p.account.namespace !== row.namespace)
        throw new Fault("REVIEW_SCOPE_MISMATCH");
      const assignment = await service.materialize(
        c,
        messageId,
        row,
        p.account,
      );
      await event(c, "REVIEW_RESOLVED", messageId);
      return { assignmentId: assignment.id };
    });
  });
  app.get("/v1/accounts", async (req) => {
    const p = listQuery.parse(req.query);
    return (
      await pool.query(
        `SELECT id,namespace,username_normalized,display_name,archived_at,version,created_at FROM accounts
    WHERE display_name ILIKE $1 OR username_normalized ILIKE $1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
        [`%${p.search}%`, p.limit, p.offset],
      )
    ).rows;
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
    if (p.password) reauth(req);
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
    reauth(req);
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
    const p = listQuery.parse(req.query);
    return (
      await pool.query(
        `SELECT a.*,ac.display_name,ac.username_normalized,t.name task_name,
    COALESCE((SELECT json_agg(json_build_object('id',s.id,'sessionId',s.session_id,'groupId',s.group_id,'externalMessageId',s.external_message_id)) FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id WHERE x.assignment_id=a.id),'[]') sources
    FROM assignments a JOIN accounts ac ON ac.id=a.account_id JOIN task_types t ON t.id=a.task_type_id
    WHERE ac.display_name ILIKE $1 OR ac.username_normalized ILIKE $1 ORDER BY a.created_at DESC,a.id LIMIT $2 OFFSET $3`,
        [`%${p.search}%`, p.limit, p.offset],
      )
    ).rows;
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
  app.get(
    "/v1/reply-templates",
    async () =>
      (
        await pool.query(
          "SELECT * FROM reply_templates ORDER BY code LIMIT 100",
        )
      ).rows,
  );
  app.post("/v1/reply-templates", async (req) => {
    const p = z
      .object({ code: text, body: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(req.body);
    if (
      /\{(?!(displayName|taskName)\})/.test(p.body) ||
      p.body
        .replaceAll("{displayName}", "")
        .replaceAll("{taskName}", "")
        .includes("}")
    )
      throw new Fault("UNSAFE_TEMPLATE", 400);
    return transaction(pool, async (c) => {
      const row = (
        await c.query(
          "INSERT INTO reply_templates(id,code,body) VALUES($1,$2,$3) RETURNING *",
          [randomUUID(), p.code, p.body],
        )
      ).rows[0];
      await event(c, "TEMPLATE_CREATED", row.id);
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
    reauth(req);
    const p = z
      .object({ approvalToken: text, idempotencyKey: text })
      .strict()
      .parse(req.body);
    return service.approveReply(p.approvalToken, p.idempotencyKey);
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
      reauth(req);
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
    reauth(req);
    const p = z
      .object({ approvalToken: text, confirmation: text })
      .strict()
      .parse(req.body);
    return service.deleteAccounts(p.approvalToken, p.confirmation);
  });
  app.get("/v1/notifications", async (req) => {
    const { cursor } = cursorQuery.parse(req.query);
    return (
      await pool.query(
        "SELECT * FROM notifications WHERE id>$1 ORDER BY id LIMIT 500",
        [cursor],
      )
    ).rows;
  });
  app.post("/v1/notifications/:id/read", async (req) => {
    const p = z
      .object({ id: z.coerce.number().int().positive() })
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
    return { items, cursor: items.at(-1)?.id ?? String(cursor) };
  });
  app.get(
    "/v1/audit",
    async () =>
      (
        await pool.query(
          "SELECT * FROM audit_events ORDER BY id DESC LIMIT 500",
        )
      ).rows,
  );
  return app;
}
