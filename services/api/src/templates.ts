import { z } from "zod";
import type pg from "pg";
import { id, text } from "../../../packages/contracts/src/index.js";
import { transaction } from "./db.js";
export const templateBody = z.string().trim().min(1).max(2000);
export const templateCreate = z
  .object({
    code: text,
    body: templateBody,
    enabled: z.boolean().default(true),
    groupId: id.nullable().optional(),
    taskTypeId: id.nullable().optional(),
  })
  .strict();
export const templateUpdate = z
  .object({
    version: z.number().int().positive(),
    body: templateBody.optional(),
    enabled: z.boolean().optional(),
    groupId: id.nullable().optional(),
    taskTypeId: id.nullable().optional(),
  })
  .strict()
  .refine(
    (p) =>
      p.body !== undefined ||
      p.enabled !== undefined ||
      p.groupId !== undefined ||
      p.taskTypeId !== undefined,
  );
export const validTemplateBody = (body: string) =>
  !(
    /\{(?!(displayName|taskName)\})/.test(body) ||
    body
      .replaceAll("{displayName}", "")
      .replaceAll("{taskName}", "")
      .includes("}")
  );
const query = z.object({
  page: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  enabled: z.enum(["all", "true", "false"]).default("all"),
  groupId: id.optional(),
  taskTypeId: id.optional(),
  search: z.string().max(200).default(""),
});
export async function queryTemplates(pool: pg.Pool, raw: unknown) {
  const p = query.parse(raw),
    values: unknown[] = [],
    conditions: string[] = [];
  const add = (v: unknown) => {
    values.push(v);
    return "$" + values.length;
  };
  if (p.enabled !== "all")
    conditions.push(`t.enabled=${add(p.enabled === "true")}`);
  if (p.groupId)
    conditions.push(`(t.group_id IS NULL OR t.group_id=${add(p.groupId)})`);
  if (p.taskTypeId)
    conditions.push(
      `(t.task_type_id IS NULL OR t.task_type_id=${add(p.taskTypeId)})`,
    );
  if (p.search)
    conditions.push(
      `t.code ILIKE ${add("%" + p.search.replace(/[\\%_]/g, "\\$&") + "%")}`,
    );
  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  const result = await transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number(
      (await c.query("SELECT count(*) FROM reply_templates t" + where, values))
        .rows[0].count,
    );
    const items = (
      await c.query(
        `SELECT t.*,g.title group_title,tt.name task_name FROM reply_templates t LEFT JOIN groups g ON g.id=t.group_id LEFT JOIN task_types tt ON tt.id=t.task_type_id${where} ORDER BY t.code,t.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, p.limit, p.offset],
      )
    ).rows;
    return { items, total, limit: p.limit, offset: p.offset };
  });
  return p.page === "true" ? result : result.items;
}
