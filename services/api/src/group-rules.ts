import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { PoolClient } from "pg";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import { transaction, event } from "./db.js";
import { Fault } from "./service.js";

const ruleInput = z
  .object({
    taskTypeId: id,
    keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    priority: z.number().int().min(0).max(100),
  })
  .strict();
const updateInput = z
  .object({
    version: z.number().int().positive(),
    enabled: z.boolean().optional(),
    taskTypeId: id.optional(),
    keywords: ruleInput.shape.keywords.optional(),
    priority: ruleInput.shape.priority.optional(),
  })
  .strict();
const validUpdate = (u: z.infer<typeof updateInput>) =>
  u.enabled !== undefined ||
  u.taskTypeId !== undefined ||
  u.keywords !== undefined ||
  u.priority !== undefined;
const batchInput = z
  .object({
    groupVersion: z.number().int().positive(),
    updates: z.array(updateInput.extend({ id })).max(100),
    create: ruleInput.optional(),
  })
  .strict()
  .refine((p) => p.updates.every(validUpdate))
  .refine((p) => p.updates.length > 0 || p.create !== undefined)
  .refine((p) => new Set(p.updates.map((u) => u.id)).size === p.updates.length);

// Session -> group -> rules lock order also fences concurrent session forgetting.
async function lockGroup(c: PoolClient, groupId: string, write: boolean) {
  const owner = (
    await c.query("SELECT session_id FROM groups WHERE id=$1", [groupId])
  ).rows[0];
  if (!owner) throw new Fault("NOT_FOUND", 404);
  const session = (
    await c.query(
      "SELECT forgotten_at FROM whatsapp_sessions WHERE id=$1 FOR SHARE",
      [owner.session_id],
    )
  ).rows[0];
  const group = (
    await c.query(
      `SELECT id,title,version FROM groups WHERE id=$1 AND session_id=$2 FOR ${write ? "UPDATE" : "SHARE"}`,
      [groupId, owner.session_id],
    )
  ).rows[0];
  if (!group) throw new Fault("NOT_FOUND", 404);
  const readOnly = !!session?.forgotten_at;
  if (write && readOnly) throw new Fault("SESSION_FORGOTTEN");
  return { ...group, readOnly };
}
const rulesSql =
  "SELECT r.*,t.name task_name FROM group_rules r JOIN task_types t ON t.id=r.task_type_id WHERE r.group_id=$1 ORDER BY priority DESC,r.id";
export async function ruleEditor(pool: pg.Pool, groupId: string) {
  return transaction(pool, async (c) => {
    const group = await lockGroup(c, groupId, false);
    const rules = (await c.query(rulesSql, [groupId])).rows;
    const taskTypes = (
      await c.query(
        "SELECT id,code,name FROM task_types ORDER BY name,id LIMIT 100",
      )
    ).rows;
    return { group, rules, taskTypes };
  });
}
async function insertRule(
  c: PoolClient,
  groupId: string,
  p: z.infer<typeof ruleInput>,
) {
  return (
    await c.query(
      "INSERT INTO group_rules(id,group_id,task_type_id,keywords,priority) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [randomUUID(), groupId, p.taskTypeId, p.keywords, p.priority],
    )
  ).rows[0];
}
export async function saveGroupRules(
  pool: pg.Pool,
  groupId: string,
  input: unknown,
) {
  const p = batchInput.parse(input);
  return transaction(pool, async (c) => {
    const group = await lockGroup(c, groupId, true);
    if (group.version !== p.groupVersion) throw new Fault("CONFLICT");
    const current = (
      await c.query(
        "SELECT id,version,enabled,task_type_id,keywords,priority FROM group_rules WHERE group_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE",
        [groupId, p.updates.map((u) => u.id)],
      )
    ).rows;
    const byId = new Map(current.map((r) => [r.id, r]));
    if (
      current.length !== p.updates.length ||
      p.updates.some((u) => byId.get(u.id)?.version !== u.version)
    )
      throw new Fault("CONFLICT");
    let changed = 0;
    for (const u of p.updates) {
      const old = byId.get(u.id)!;
      const next = {
        enabled: u.enabled ?? old.enabled,
        taskTypeId: u.taskTypeId ?? old.task_type_id,
        keywords: u.keywords ?? old.keywords,
        priority: u.priority ?? old.priority,
      };
      if (
        old.enabled === next.enabled &&
        old.task_type_id === next.taskTypeId &&
        old.priority === next.priority &&
        JSON.stringify(old.keywords) === JSON.stringify(next.keywords)
      )
        continue;
      await c.query(
        "UPDATE group_rules SET enabled=$2,task_type_id=$3,keywords=$4,priority=$5,version=version+1 WHERE id=$1",
        [u.id, next.enabled, next.taskTypeId, next.keywords, next.priority],
      );
      await event(c, "GROUP_RULE_UPDATED", u.id);
      changed++;
    }
    if (p.create) {
      const row = await insertRule(c, groupId, p.create);
      await event(c, "GROUP_RULE_CREATED", row.id);
      changed++;
    }
    const updated = changed
      ? (
          await c.query(
            "UPDATE groups SET version=version+1 WHERE id=$1 RETURNING id,title,version",
            [groupId],
          )
        ).rows[0]
      : group;
    return {
      group: { ...updated, readOnly: false },
      rules: (await c.query(rulesSql, [groupId])).rows,
      changed,
    };
  });
}
// Legacy single-rule routes use the same lock order as the atomic editor.
export async function createGroupRule(pool: pg.Pool, input: unknown) {
  const p = ruleInput.extend({ groupId: id }).parse(input);
  return transaction(pool, async (c) => {
    await lockGroup(c, p.groupId, true);
    const row = await insertRule(c, p.groupId, p);
    await c.query("UPDATE groups SET version=version+1 WHERE id=$1", [
      p.groupId,
    ]);
    await event(c, "GROUP_RULE_CREATED", row.id);
    return row;
  });
}
export async function updateGroupRule(
  pool: pg.Pool,
  ruleId: string,
  input: unknown,
) {
  const p = updateInput.refine(validUpdate).parse(input);
  return transaction(pool, async (c) => {
    const owner = (
      await c.query("SELECT group_id FROM group_rules WHERE id=$1", [ruleId])
    ).rows[0];
    if (!owner) throw new Fault("CONFLICT");
    await lockGroup(c, owner.group_id, true);
    const row = (
      await c.query(
        "UPDATE group_rules SET enabled=COALESCE($2,enabled),task_type_id=COALESCE($4,task_type_id),keywords=COALESCE($5,keywords),priority=COALESCE($6,priority),version=version+1 WHERE id=$1 AND version=$3 RETURNING *",
        [
          ruleId,
          p.enabled ?? null,
          p.version,
          p.taskTypeId ?? null,
          p.keywords ?? null,
          p.priority ?? null,
        ],
      )
    ).rows[0];
    if (!row) throw new Fault("CONFLICT");
    await c.query("UPDATE groups SET version=version+1 WHERE id=$1", [
      row.group_id,
    ]);
    await event(c, "GROUP_RULE_UPDATED", row.id);
    return row;
  });
}
