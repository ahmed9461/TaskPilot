import { z } from "zod";
import type pg from "pg";
import { transaction } from "./db.js";
import { id } from "../../../packages/contracts/src/index.js";

const eventCode = z.string().regex(/^[A-Z_]{1,80}$/);
const page = z.object({
  page: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
const notificationsQuery = page.extend({
  type: eventCode.optional(),
  read: z.enum(["all", "unread", "read"]).default("all"),
});
const auditQuery = page
  .extend({
    action: eventCode.optional(),
    targetId: id.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine((p) => !p.from || !p.to || Date.parse(p.from) <= Date.parse(p.to));

export async function queryActivity(
  pool: pg.Pool,
  kind: "notifications" | "audit",
  raw: unknown,
) {
  const p =
    kind === "notifications"
      ? notificationsQuery.parse(raw)
      : auditQuery.parse(raw);
  const params: unknown[] = [],
    conditions: string[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return "$" + params.length;
  };
  if ("read" in p) {
    if (p.type) conditions.push(`type=${add(p.type)}`);
    if (p.read !== "all")
      conditions.push(
        `read_at IS ${p.read === "unread" ? "NULL" : "NOT NULL"}`,
      );
  } else {
    if (p.action) conditions.push(`action=${add(p.action)}`);
    if (p.targetId) conditions.push(`target_id=${add(p.targetId)}`);
    if (p.from) conditions.push(`created_at>=${add(p.from)}::timestamptz`);
    if (p.to) conditions.push(`created_at<=${add(p.to)}::timestamptz`);
  }
  const table = kind === "notifications" ? "notifications" : "audit_events";
  const fields =
    kind === "notifications"
      ? "id,type,subject_id,read_at,created_at"
      : "id,actor_id,action,target_id,created_at";
  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number(
      (await c.query(`SELECT count(*) FROM ${table}${where}`, params)).rows[0]
        .count,
    );
    const items = (
      await c.query(
        `SELECT ${fields} FROM ${table}${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, p.limit, p.offset],
      )
    ).rows;
    return { items, total, limit: p.limit, offset: p.offset };
  });
}

export async function notificationState(pool: pg.Pool) {
  return (
    await pool.query(
      `SELECT (SELECT COALESCE(max(id),0)::text FROM notifications) "newestId",(SELECT count(*)::int FROM notifications WHERE read_at IS NULL) "unreadCount"`,
    )
  ).rows[0];
}

export async function operationsSnapshot(pool: pg.Pool) {
  const snapshot = (
    await pool.query(`SELECT now() "observedAt",
    (SELECT count(*)::int FROM schema_migrations) migrations,
    json_build_object(
      'accounts',(SELECT count(*)::int FROM accounts),
      'assignments',(SELECT count(*)::int FROM assignments),
      'review',(SELECT count(*)::int FROM source_messages WHERE state='REVIEW'),
      'unread',(SELECT count(*)::int FROM notifications WHERE read_at IS NULL),
      'approvedReplies',(SELECT count(*)::int FROM reply_jobs WHERE status='APPROVED'),
      'sendingReplies',(SELECT count(*)::int FROM reply_jobs WHERE status='SENDING'),
      'unknownReplies',(SELECT count(*)::int FROM reply_jobs WHERE status='UNKNOWN_DELIVERY'),
      'failedReplies',(SELECT count(*)::int FROM reply_jobs WHERE status='FAILED'),
      'enabledGroups',(SELECT count(*)::int FROM groups WHERE enabled=true)
    ) counts,
    COALESCE((SELECT greatest(0,floor(extract(epoch FROM now()-min(received_at))))::int FROM source_messages WHERE state='REVIEW'),0) "oldestReviewSeconds",
    COALESCE((SELECT greatest(0,floor(extract(epoch FROM now()-min(approved_at))))::int FROM reply_jobs WHERE status='APPROVED'),0) "oldestApprovedSeconds"`)
  ).rows[0];
  return {
    ...snapshot,
    processUptimeSeconds: Math.floor(process.uptime()),
    provider: "mock",
    liveSendingEnabled: false,
  };
}
