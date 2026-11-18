import type pg from "pg";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import { event, transaction } from "./db.js";
import { hash } from "./security.js";
import { Fault, type Service } from "./service.js";
import { createActivity } from "./followups.js";
import { normalize } from "./parser.js";
import { routeTask } from "./rules.js";

export const groupWorkInput = z
  .object({
    groupId: id,
    taskTypeId: id,
    activity: z.string().trim().min(1).max(160),
    todayOnly: z.boolean().default(true),
  })
  .strict();
type GroupWork = z.infer<typeof groupWorkInput>;
const riyadhToday =
  "date_trunc('day',now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh'";

async function planGroupWork(c: pg.PoolClient, p: GroupWork) {
  const group = (
    await c.query(
      `SELECT g.title,g.version,g.period_key,g.session_id,t.name task_name FROM groups g
     JOIN whatsapp_sessions ws ON ws.id=g.session_id JOIN task_types t ON t.id=$2
     WHERE g.id=$1 AND g.enabled AND ws.forgotten_at IS NULL`,
      [p.groupId, p.taskTypeId],
    )
  ).rows[0];
  if (!group) throw new Fault("FOLLOWUP_SCOPE_UNAVAILABLE");
  const targets = (
    await c.query<{
      id: string;
      display_name: string;
      source_id: string;
      version: number;
      existing: boolean;
    }>(
      `SELECT DISTINCT ON (ac.id) ac.id,ac.display_name,ac.version,s.id source_id, EXISTS(
       SELECT 1 FROM assignments a2 WHERE a2.account_id=ac.id AND a2.task_type_id=$3
        AND a2.period_key=$4 AND a2.activity_key=$5) existing
     FROM source_messages s JOIN assignment_sources x ON x.source_message_id=s.id
     JOIN assignments a ON a.id=x.assignment_id JOIN accounts ac ON ac.id=a.account_id
     WHERE s.group_id=$1 AND s.state='PROCESSED' AND ac.archived_at IS NULL
       AND (NOT $2::boolean OR s.received_at>=${riyadhToday})
     ORDER BY ac.id,s.received_at DESC,s.id DESC LIMIT 101`,
      [
        p.groupId,
        p.todayOnly,
        p.taskTypeId,
        group.period_key,
        normalize(p.activity).replace(/\s+/g, " "),
      ],
    )
  ).rows;
  if (targets.length > 100) throw new Fault("BATCH_TOO_LARGE");
  return { group, targets };
}

export async function previewGroupWork(service: Service, p: GroupWork) {
  return transaction(service.pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const { group, targets } = await planGroupWork(c, p);
    const approvalToken = targets.some((row) => !row.existing)
      ? await service.approval(c, "group-work", {
          input: p,
          sessionId: group.session_id,
          snapshot: hash(JSON.stringify({ group, targets })),
        })
      : null;
    return { group, targets, approvalToken };
  });
}

export async function applyGroupWork(service: Service, token: string) {
  return transaction(service.pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const saved = await service.consume(c, token, "group-work");
    const p = groupWorkInput.parse(saved.input);
    const { group, targets } = await planGroupWork(c, p);
    if (hash(JSON.stringify({ group, targets })) !== saved.snapshot)
      throw new Fault("STALE_PREVIEW");
    const selected = targets.filter((item) => !item.existing);
    await c.query(
      "SELECT id FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [selected.map((row) => row.id)],
    );
    await c.query("SELECT id FROM groups WHERE id=$1 FOR SHARE", [p.groupId]);
    for (const target of selected)
      await createActivity(c, {
        accountId: target.id,
        taskTypeId: p.taskTypeId,
        periodKey: group.period_key,
        activity: p.activity,
        sourceId: target.source_id,
      });
    await event(c, "GROUP_WORK_CREATED", p.groupId);
    return { created: selected.length };
  });
}

export async function workBriefing(pool: pg.Pool, groupId?: string) {
  const values = [groupId ?? null];
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const inbox = (
      await c.query(
        `SELECT count(*)::int total,
         count(*) FILTER (WHERE fragment_count>1)::int combined,
         count(*) FILTER (WHERE routing_ambiguous)::int routing,
         count(*) FILTER (WHERE review_account_id IS NOT NULL)::int credential_conflict,
         count(*) FILTER (WHERE EXISTS(SELECT 1 FROM ai_requests ar WHERE ar.source_id=s.id
           AND ar.source_version=s.version AND ar.status='SUCCEEDED'
           AND ar.settings_version=(SELECT version FROM ai_settings WHERE id=true)))::int suggested
       FROM source_messages s WHERE state='REVIEW' AND ($1::uuid IS NULL OR s.group_id=$1)`,
        values,
      )
    ).rows[0];
    const task = (
      await c.query(
        `WITH scoped AS (
        SELECT a.id,a.status,a.completed_at FROM assignments a JOIN accounts ac ON ac.id=a.account_id
         WHERE ac.archived_at IS NULL AND ($1::uuid IS NULL OR EXISTS(
          SELECT 1 FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id
          WHERE x.assignment_id=a.id AND s.group_id=$1))
      ) SELECT count(*) FILTER(WHERE status NOT IN ('COMPLETED','CANCELED'))::int open,
          count(*) FILTER(WHERE status='COMPLETED' AND completed_at>=${riyadhToday})::int completed,
          count(*) FILTER(WHERE status='COMPLETED' AND completed_at>=${riyadhToday} AND NOT EXISTS(
            SELECT 1 FROM reply_jobs r JOIN source_messages s ON s.id=r.source_message_id
            WHERE r.assignment_id=scoped.id AND r.status IN ('APPROVED','SENDING','SENT','UNKNOWN_DELIVERY')
             AND ($1::uuid IS NULL OR s.group_id=$1)))::int without_reply
        FROM scoped`,
        values,
      )
    ).rows[0];
    const first = (
      await c.query(
        `SELECT a.id,ac.display_name,t.name task_name,a.activity_label,a.priority FROM assignments a
        JOIN accounts ac ON ac.id=a.account_id JOIN task_types t ON t.id=a.task_type_id
        WHERE ac.archived_at IS NULL AND a.status NOT IN ('COMPLETED','CANCELED')
          AND ($1::uuid IS NULL OR EXISTS(
            SELECT 1 FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id
            WHERE x.assignment_id=a.id AND s.group_id=$1))
        ORDER BY a.priority DESC,a.created_at,a.id LIMIT 8`,
        values,
      )
    ).rows;
    return { inbox, task, first };
  });
}

export const trialRule = z
  .object({
    taskTypeId: id,
    keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    priority: z.number().int().min(0).max(100),
    examples: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  })
  .strict();

export async function simulateRule(
  pool: pg.Pool,
  groupId: string,
  p: z.infer<typeof trialRule>,
) {
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const group = (
      await c.query(
        `SELECT g.version,g.task_type_id FROM groups g JOIN whatsapp_sessions ws ON ws.id=g.session_id
        WHERE g.id=$1 AND ws.forgotten_at IS NULL`,
        [groupId],
      )
    ).rows[0];
    if (!group) throw new Fault("FOLLOWUP_SCOPE_UNAVAILABLE");
    const types = (await c.query("SELECT id,name FROM task_types")).rows;
    const names = new Map(types.map((t) => [t.id, t.name]));
    if (!names.has(p.taskTypeId)) throw new Fault("NOT_FOUND", 404);
    const current = (
      await c.query(
        "SELECT task_type_id,keywords,priority,enabled FROM group_rules WHERE group_id=$1 AND enabled",
        [groupId],
      )
    ).rows;
    const proposed = [
      ...current,
      {
        task_type_id: p.taskTypeId,
        keywords: p.keywords,
        priority: p.priority,
        enabled: true,
      },
    ];
    const describe = (r: ReturnType<typeof routeTask>) => ({
      name: names.get(r.taskTypeId),
      priority: r.priority,
      ambiguous: r.ambiguous,
    });
    return {
      groupVersion: group.version,
      items: p.examples.map((sample) => ({
        before: describe(routeTask(sample, current, group.task_type_id)),
        after: describe(routeTask(sample, proposed, group.task_type_id)),
      })),
    };
  });
}
