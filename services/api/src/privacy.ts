import type pg from "pg";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction, event } from "./db.js";
import { Service, Fault } from "./service.js";
import { hash } from "./security.js";

export const retentionInput = z
  .object({
    version: z.number().int().positive(),
    reviewDays: z.number().int().min(1).max(365),
    failedIngressDays: z.number().int().min(1).max(90),
    expiredAccessDays: z.number().int().min(1).max(30),
    readNotificationDays: z.number().int().min(7).max(365),
  })
  .strict();
const specs = {
  reviews: {
    table: "source_messages",
    key: "id",
    type: "uuid",
    field: "review_days",
    where:
      "state='REVIEW' AND encrypted_payload IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ai_requests a WHERE a.source_id=t.id AND a.status='REQUESTED')",
    age: "received_at",
    stamp: "id,version,encrypted_payload,received_at",
  },
  failedIngress: {
    table: "whatsapp_ingress",
    key: "id",
    type: "bigint",
    field: "failed_ingress_days",
    where: "state='ERROR' AND encrypted_payload IS NOT NULL",
    age: "received_at",
    stamp: "id,state,attempts,encrypted_payload,received_at",
  },
  expiredApprovals: {
    table: "approvals",
    key: "token_hash",
    type: "text",
    field: "expired_access_days",
    where: "true",
    age: "expires_at",
    stamp: "token_hash,purpose,payload,expires_at,consumed_at",
  },
  expiredClients: {
    table: "client_sessions",
    key: "id",
    type: "uuid",
    field: "expired_access_days",
    where: "true",
    age: "LEAST(expires_at,COALESCE(revoked_at,expires_at))",
    stamp: "id,expires_at,revoked_at,reauth_hash,reauth_expires_at",
  },
  readNotifications: {
    table: "notifications",
    key: "id",
    type: "bigint",
    field: "read_notification_days",
    where: "read_at IS NOT NULL",
    age: "read_at",
    stamp: "id,read_at,created_at",
  },
  diagnostics: {
    table: "whatsapp_receipts",
    key: "id",
    type: "bigint",
    field: "diagnostic_days",
    where: "true",
    age: "last_seen",
    stamp: "id,last_seen,observations",
  },
} as const;
type Kind = keyof typeof specs;
type Selection = { ids: string[]; stamp: string; more: boolean };
const digest = (v: unknown) => hash(JSON.stringify(v));
export class PrivacyService {
  constructor(
    private pool: pg.Pool,
    private service: Service,
  ) {}
  private async locks(c: PoolClient) {
    await c.query("SELECT pg_advisory_xact_lock(8240005)");
    await c.query("SELECT pg_advisory_xact_lock(8240006)");
    await c.query("SELECT pg_advisory_xact_lock(8240010)");
  }
  private async policy(c: PoolClient) {
    return (
      await c.query(
        "SELECT *,7 diagnostic_days FROM retention_policy WHERE id=true FOR SHARE",
      )
    ).rows[0];
  }
  async getPolicy() {
    return transaction(this.pool, async (c) => ({
      ...(await this.policy(c)),
      execution: "EXPLICIT_PREVIEW_AND_CONFIRMATION",
      batchLimitPerClass: 1000,
      retainedUntilExplicitRemoval: [
        "accounts",
        "assignments",
        "credentials",
        "source_metadata",
        "source_quote",
        "audit",
        "unread_notifications",
        "ai_usage",
        "whatsapp_auth",
        "backups",
      ],
    }));
  }
  async updatePolicy(raw: unknown) {
    const p = retentionInput.parse(raw);
    return transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(8240010)");
      const row = (
        await c.query(
          "UPDATE retention_policy SET review_days=$2,failed_ingress_days=$3,expired_access_days=$4,read_notification_days=$5,version=version+1,updated_at=now() WHERE id=true AND version=$1 RETURNING *",
          [
            p.version,
            p.reviewDays,
            p.failedIngressDays,
            p.expiredAccessDays,
            p.readNotificationDays,
          ],
        )
      ).rows[0];
      if (!row) throw new Fault("CONFLICT");
      await event(c, "RETENTION_POLICY_UPDATED");
      return row;
    });
  }
  private async select(
    c: PoolClient,
    kind: Kind,
    policy: Record<string, number>,
    at: string,
    ids?: string[],
  ): Promise<Selection> {
    const s = specs[kind];
    // Identifiers/predicates come only from the fixed map above, never request data.
    const rows = (
      await c.query(
        `SELECT ${s.key}::text key,jsonb_build_array(${s.stamp})::text fingerprint FROM ${s.table} t WHERE ${s.where} AND ${s.age}<$1::timestamptz-($2::int*interval '1 day') AND ($3::${s.type}[] IS NULL OR ${s.key}=ANY($3::${s.type}[])) ORDER BY ${s.key} LIMIT 1001 FOR UPDATE`,
        [at, policy[s.field], ids ?? null],
      )
    ).rows;
    const chosen = rows.slice(0, 1000);
    return {
      ids: chosen.map((r) => r.key),
      stamp: digest(chosen),
      more: rows.length > 1000,
    };
  }
  async retentionPreview() {
    return transaction(this.pool, async (c) => {
      await this.locks(c);
      const policy = await this.policy(c),
        at = (await c.query("SELECT now() stamp")).rows[0].stamp.toISOString();
      const selections = {} as Record<Kind, Selection>;
      for (const kind of Object.keys(specs) as Kind[])
        selections[kind] = await this.select(c, kind, policy, at);
      const approvalToken = await this.service.approval(c, "retention", {
        policyVersion: policy.version,
        at,
        selections,
      });
      return {
        approvalToken,
        confirmation: "CLEAN RETENTION",
        policyVersion: policy.version,
        cutoffAt: at,
        expiresInSeconds: 300,
        counts: Object.fromEntries(
          Object.entries(selections).map(([k, v]) => [k, v.ids.length]),
        ),
        more: Object.fromEntries(
          Object.entries(selections).map(([k, v]) => [k, v.more]),
        ),
      };
    });
  }
  async retentionExecute(token: string, confirmation: string) {
    if (confirmation !== "CLEAN RETENTION")
      throw new Fault("DELETION_REQUIRES_CONFIRMATION", 400);
    return transaction(this.pool, async (c) => {
      const p = await this.service.consume(c, token, "retention");
      await this.locks(c);
      const policy = await this.policy(c);
      if (policy.version !== p.policyVersion) throw new Fault("STALE_PREVIEW");
      const counts: Record<string, number> = {};
      for (const kind of Object.keys(specs) as Kind[]) {
        const previous = p.selections[kind] as Selection;
        const current = await this.select(c, kind, policy, p.at, previous.ids);
        if (current.stamp !== previous.stamp) throw new Fault("STALE_PREVIEW");
        counts[kind] = current.ids.length;
      }
      await c.query(
        "UPDATE source_messages SET encrypted_payload=NULL,state='IGNORED',version=version+1 WHERE id=ANY($1::uuid[])",
        [p.selections.reviews.ids],
      );
      await c.query(
        "UPDATE whatsapp_ingress SET encrypted_payload=NULL,state='DROPPED',last_error_code='RETENTION_EXPIRED' WHERE id=ANY($1::bigint[])",
        [p.selections.failedIngress.ids],
      );
      for (const kind of [
        "expiredApprovals",
        "expiredClients",
        "readNotifications",
        "diagnostics",
      ] as const) {
        const s = specs[kind];
        await c.query(
          `DELETE FROM ${s.table} WHERE ${s.key}=ANY($1::${s.type}[])`,
          [p.selections[kind].ids],
        );
      }
      const runId = randomUUID();
      await c.query(
        "INSERT INTO privacy_runs(id,kind,counts) VALUES($1,'RETENTION',$2)",
        [runId, JSON.stringify(counts)],
      );
      await event(c, "RETENTION_EXECUTED", runId);
      return { runId, counts };
    });
  }
  private async stoppedSession(c: PoolClient, id: string) {
    // Same key as the connector process lease: fail closed rather than race a socket.
    if (
      !(
        await c.query(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) locked",
          ["taskpilot-wa:" + id],
        )
      ).rows[0].locked
    )
      throw new Fault("WHATSAPP_SESSION_IN_USE");
    const s = (
      await c.query(
        "SELECT id,label,provider,status,version,connect_requested,forgotten_at FROM whatsapp_sessions WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!s) throw new Fault("NOT_FOUND", 404);
    if (s.provider !== "baileys") throw new Fault("LIVE_SESSION_REQUIRED", 400);
    if (s.forgotten_at) throw new Fault("SESSION_FORGOTTEN");
    if (
      s.connect_requested ||
      !["STOPPED", "ERROR", "REAUTH_REQUIRED"].includes(s.status)
    )
      throw new Fault("STOP_SESSION_BEFORE_FORGETTING");
    return s;
  }
  private async forgetSnapshot(c: PoolClient, id: string) {
    const groups = (
      await c.query(
        "SELECT id,version,enabled FROM groups WHERE session_id=$1 ORDER BY id FOR UPDATE",
        [id],
      )
    ).rows;
    const auth = (
      await c.query(
        "SELECT category,id_hash,encrypted_payload FROM whatsapp_auth WHERE session_id=$1 ORDER BY category,id_hash FOR UPDATE",
        [id],
      )
    ).rows;
    const quotes = (
      await c.query(
        "SELECT id,version,encrypted_transport_key FROM source_messages WHERE session_id=$1 AND encrypted_transport_key IS NOT NULL ORDER BY id FOR UPDATE",
        [id],
      )
    ).rows;
    const ingress = (
      await c.query(
        "SELECT id,state,encrypted_payload,attempts FROM whatsapp_ingress WHERE session_id=$1 AND (encrypted_payload IS NOT NULL OR state IN ('PENDING','ERROR')) ORDER BY id FOR UPDATE",
        [id],
      )
    ).rows;
    const replies = (
      await c.query(
        "SELECT id,status FROM reply_jobs WHERE session_id=$1 AND status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY') ORDER BY id FOR UPDATE",
        [id],
      )
    ).rows;
    if (replies.some((r) => r.status !== "APPROVED"))
      throw new Fault("DELIVERY_REQUIRES_RECONCILIATION");
    return {
      stamp: digest({ groups, auth, quotes, ingress, replies }),
      counts: {
        auth: auth.length,
        quotes: quotes.length,
        queuedRaw: ingress.length,
        enabledGroups: groups.filter((g) => g.enabled).length,
        approvedReplies: replies.length,
      },
    };
  }
  async forgetPreview(id: string) {
    return transaction(this.pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(8240005)");
      const s = await this.stoppedSession(c, id),
        snapshot = await this.forgetSnapshot(c, id);
      const approvalToken = await this.service.approval(c, "forget-session", {
        id,
        version: s.version,
        stamp: snapshot.stamp,
      });
      return {
        approvalToken,
        sessionId: id,
        label: s.label,
        confirmation: "FORGET " + id,
        counts: snapshot.counts,
        historyPreserved: true,
        expiresInSeconds: 300,
      };
    });
  }
  async forgetExecute(token: string, confirmation: string) {
    return transaction(this.pool, async (c) => {
      const p = await this.service.consume(c, token, "forget-session");
      if (confirmation !== "FORGET " + p.id)
        throw new Fault("DELETION_REQUIRES_CONFIRMATION", 400);
      await c.query("SELECT pg_advisory_xact_lock(8240005)");
      const s = await this.stoppedSession(c, p.id),
        snapshot = await this.forgetSnapshot(c, p.id);
      if (s.version !== p.version || snapshot.stamp !== p.stamp)
        throw new Fault("STALE_PREVIEW");
      await c.query(
        "UPDATE groups SET enabled=false,version=version+1 WHERE session_id=$1",
        [p.id],
      );
      await c.query(
        "UPDATE reply_jobs SET status='CANCELED' WHERE session_id=$1 AND status='APPROVED'",
        [p.id],
      );
      await c.query(
        "UPDATE source_messages SET encrypted_transport_key=NULL,version=version+1 WHERE session_id=$1 AND encrypted_transport_key IS NOT NULL",
        [p.id],
      );
      await c.query(
        "UPDATE whatsapp_ingress SET encrypted_payload=NULL,state='DROPPED',last_error_code='SESSION_FORGOTTEN' WHERE session_id=$1 AND (encrypted_payload IS NOT NULL OR state IN ('PENDING','ERROR'))",
        [p.id],
      );
      await c.query("DELETE FROM whatsapp_auth WHERE session_id=$1", [p.id]);
      await c.query(
        "UPDATE approvals SET expires_at=LEAST(expires_at,now()) WHERE purpose='reply' AND payload->>'sessionId'=$1",
        [p.id],
      );
      await c.query(
        "UPDATE whatsapp_sessions SET status='FORGOTTEN',connect_requested=false,forgotten_at=now(),auth_epoch=$2,last_error_code=NULL,version=version+1 WHERE id=$1",
        [p.id, randomUUID()],
      );
      const runId = randomUUID();
      await c.query(
        "INSERT INTO privacy_runs(id,kind,session_id,counts) VALUES($1,'FORGET_SESSION',$2,$3)",
        [runId, p.id, JSON.stringify(snapshot.counts)],
      );
      await event(c, "WHATSAPP_SESSION_FORGOTTEN", p.id);
      return { runId, counts: snapshot.counts, historyPreserved: true };
    });
  }
}
