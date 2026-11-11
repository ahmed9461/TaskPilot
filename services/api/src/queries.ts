import { z } from "zod";
import type pg from "pg";
import { transaction } from "./db.js";
import { assignmentStatus, id } from "../../../packages/contracts/src/index.js";
export const querySchema = z.object({
  search: z.string().max(200).default(""),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  page: z.enum(["true", "false"]).default("false"),
  namespace: z.string().trim().max(200).optional(),
  archived: z.enum(["all", "active", "archived"]).default("all"),
  status: assignmentStatus.optional(),
  sessionId: id.optional(),
  groupId: id.optional(),
  taskTypeId: id.optional(),
  accountId: id.optional(),
  periodKey: z.string().max(200).optional(),
  minPriority: z.coerce.number().int().min(0).max(100).optional(),
});
export type Resource = "accounts" | "assignments" | "inbox";
export async function queryResource(
  pool: pg.Pool,
  resource: Resource,
  raw: unknown,
) {
  const p = querySchema.parse(raw);
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return "$" + params.length;
  };
  const where: string[] = [];
  const account =
    resource === "accounts" ? "ac" : resource === "assignments" ? "ac" : null;
  if (account) {
    where.push(
      `(${account}.display_name ILIKE ${add("%" + p.search.replace(/[\\%_]/g, "\\$&") + "%")} OR ${account}.username_normalized ILIKE $${params.length})`,
    );
    if (p.namespace)
      where.push(
        `ac.namespace=${add(p.namespace.normalize("NFKC").toLowerCase())}`,
      );
    if (p.archived !== "all")
      where.push(
        `ac.archived_at IS ${p.archived === "active" ? "NULL" : "NOT NULL"}`,
      );
  }
  if (resource === "assignments") {
    for (const [key, column] of [
      ["status", "a.status"],
      ["taskTypeId", "a.task_type_id"],
      ["accountId", "a.account_id"],
      ["periodKey", "a.period_key"],
    ] as const)
      if (p[key] !== undefined) where.push(`${column}=${add(p[key])}`);
    if (p.minPriority !== undefined)
      where.push(`a.priority>=${add(p.minPriority)}`);
    const scope: string[] = [];
    if (p.sessionId) scope.push(`s.session_id=${add(p.sessionId)}`);
    if (p.groupId) scope.push(`s.group_id=${add(p.groupId)}`);
    if (scope.length)
      where.push(
        `EXISTS(SELECT 1 FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id WHERE x.assignment_id=a.id AND ${scope.join(" AND ")})`,
      );
  }
  if (resource === "inbox") {
    where.push("s.state='REVIEW'");
    if (p.sessionId) where.push(`s.session_id=${add(p.sessionId)}`);
    if (p.groupId) where.push(`s.group_id=${add(p.groupId)}`);
  }
  const from =
    resource === "accounts"
      ? "accounts ac"
      : resource === "assignments"
        ? "assignments a JOIN accounts ac ON ac.id=a.account_id JOIN task_types t ON t.id=a.task_type_id"
        : "source_messages s JOIN groups g ON g.id=s.group_id";
  const select =
    resource === "accounts"
      ? "ac.id,ac.namespace,ac.username_normalized,ac.display_name,ac.archived_at,ac.version,ac.created_at"
      : resource === "assignments"
        ? `a.*,ac.namespace,ac.display_name,ac.username_normalized,t.name task_name,COALESCE((SELECT json_agg(json_build_object('id',s.id,'sessionId',s.session_id,'groupId',s.group_id,'externalMessageId',s.external_message_id)) FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id WHERE x.assignment_id=a.id),'[]') sources`
        : "s.id,s.session_id,s.group_id,s.external_message_id,s.state,s.version,s.received_at,s.routing_task_type_id,s.routing_ambiguous,g.namespace,g.title group_title";
  const condition = where.length ? " WHERE " + where.join(" AND ") : "";
  const order =
    resource === "accounts"
      ? "ac.created_at DESC,ac.id"
      : resource === "assignments"
        ? "a.priority DESC,a.created_at DESC,a.id"
        : "s.received_at,s.id";
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number(
      (await c.query(`SELECT count(*) FROM ${from}${condition}`, params))
        .rows[0].count,
    );
    const pageParams = [...params, p.limit, p.offset];
    const items = (
      await c.query(
        `SELECT ${select} FROM ${from}${condition} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        pageParams,
      )
    ).rows;
    return { items, total, limit: p.limit, offset: p.offset };
  });
}
export function exportCsv(
  resource: "accounts" | "assignments",
  rows: Record<string, unknown>[],
) {
  const columns =
    resource === "accounts"
      ? [
          "id",
          "namespace",
          "username_normalized",
          "display_name",
          "archived_at",
        ]
      : [
          "id",
          "namespace",
          "username_normalized",
          "display_name",
          "task_name",
          "period_key",
          "status",
          "priority",
        ];
  const cell = (value: unknown) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      columns.join(","),
      ...rows.map((r) => columns.map((c) => cell(r[c])).join(",")),
    ].join("\r\n")
  );
}
