import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import { event, transaction } from "./db.js";
import {
  normalize,
  messageLines,
  messageSegments,
  studentUsername,
} from "./parser.js";
import { Fault } from "./service.js";

const label = z.string().trim().min(1).max(160);
export const followupState = z
  .object({
    groupId: id,
    active: z.boolean(),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const followupActivity = z
  .object({
    groupId: id,
    taskTypeId: id,
    activity: label,
    periodKey: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export async function followupGroups(pool: pg.Pool, accountId: string) {
  const rows = (
    await pool.query(
      `SELECT DISTINCT g.id,g.title,g.period_key,g.task_type_id,
        COALESCE(f.active,false) active,COALESCE(f.version,0) version
      FROM assignments a JOIN accounts ac ON ac.id=a.account_id
      JOIN assignment_sources x ON x.assignment_id=a.id
      JOIN source_messages s ON s.id=x.source_message_id
      JOIN groups g ON g.id=s.group_id
      LEFT JOIN account_followups f ON f.account_id=ac.id AND f.group_id=g.id
      JOIN whatsapp_sessions ws ON ws.id=g.session_id
      WHERE ac.id=$1 AND ac.archived_at IS NULL AND g.enabled AND ws.forgotten_at IS NULL
      ORDER BY g.title,g.id LIMIT 100`,
      [accountId],
    )
  ).rows;
  return { items: rows };
}

async function lockMembership(
  c: pg.PoolClient,
  accountId: string,
  groupId: string,
) {
  const account = (
    await c.query(
      "SELECT archived_at,namespace FROM accounts WHERE id=$1 FOR UPDATE",
      [accountId],
    )
  ).rows[0];
  const group = (
    await c.query(
      `SELECT g.period_key,g.namespace,ws.forgotten_at,
       (SELECT s.id FROM source_messages s JOIN assignment_sources x ON x.source_message_id=s.id
        JOIN assignments a ON a.id=x.assignment_id WHERE s.group_id=g.id AND a.account_id=$1
        AND s.state='PROCESSED' ORDER BY s.received_at DESC,s.id DESC LIMIT 1) source_id
     FROM groups g JOIN whatsapp_sessions ws ON ws.id=g.session_id
     WHERE g.id=$2 AND g.enabled FOR SHARE OF g`,
      [accountId, groupId],
    )
  ).rows[0];
  if (
    !account ||
    account.archived_at ||
    !group ||
    normalize(account.namespace) !== normalize(group.namespace) ||
    group.forgotten_at ||
    !group.source_id
  )
    throw new Fault("FOLLOWUP_SCOPE_UNAVAILABLE");
  return group;
}

export async function setFollowup(
  pool: pg.Pool,
  accountId: string,
  p: z.infer<typeof followupState>,
) {
  return transaction(pool, async (c) => {
    await lockMembership(c, accountId, p.groupId);
    const prior = (
      await c.query(
        "SELECT active,version FROM account_followups WHERE account_id=$1 AND group_id=$2 FOR UPDATE",
        [accountId, p.groupId],
      )
    ).rows[0];
    if ((prior?.version ?? 0) !== p.version) throw new Fault("CONFLICT");
    if (prior?.active === p.active) return prior;
    const result = (
      await c.query(
        `INSERT INTO account_followups(account_id,group_id,active) VALUES($1,$2,$3)
       ON CONFLICT(account_id,group_id) DO UPDATE SET active=EXCLUDED.active,version=account_followups.version+1,updated_at=now()
       RETURNING active,version`,
        [accountId, p.groupId, p.active],
      )
    ).rows[0];
    await event(
      c,
      p.active ? "FOLLOWUP_ENABLED" : "FOLLOWUP_PAUSED",
      accountId,
    );
    return result;
  });
}

export async function createActivity(
  c: pg.PoolClient,
  p: {
    accountId: string;
    taskTypeId: string;
    periodKey: string;
    activity: string;
    sourceId: string;
    priority?: number;
  },
) {
  const activityKey = normalize(p.activity).replace(/\s+/g, " ");
  const row = (
    await c.query(
      `INSERT INTO assignments(id,account_id,task_type_id,period_key,activity_key,activity_label,priority)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(account_id,task_type_id,period_key,activity_key) DO NOTHING RETURNING id`,
      [
        randomUUID(),
        p.accountId,
        p.taskTypeId,
        p.periodKey,
        activityKey,
        p.activity,
        p.priority ?? 0,
      ],
    )
  ).rows[0];
  const assignmentId =
    row?.id ??
    (
      await c.query(
        "SELECT id FROM assignments WHERE account_id=$1 AND task_type_id=$2 AND period_key=$3 AND activity_key=$4",
        [p.accountId, p.taskTypeId, p.periodKey, activityKey],
      )
    ).rows[0].id;
  const source = await c.query(
    "INSERT INTO assignment_sources VALUES($1,$2) ON CONFLICT DO NOTHING",
    [assignmentId, p.sourceId],
  );
  if (row || source.rowCount)
    await c.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
      p.accountId,
    ]);
  if (row) await event(c, "FOLLOWUP_ACTIVITY_CREATED", assignmentId);
  return { assignmentId, created: !!row };
}

export async function addFollowupActivity(
  pool: pg.Pool,
  accountId: string,
  p: z.infer<typeof followupActivity>,
) {
  return transaction(pool, async (c) => {
    const group = await lockMembership(c, accountId, p.groupId);
    const link = await c.query(
      "SELECT 1 FROM account_followups WHERE account_id=$1 AND group_id=$2 AND active",
      [accountId, p.groupId],
    );
    if (!link.rowCount) throw new Fault("FOLLOWUP_NOT_ACTIVE");
    if (
      !(await c.query("SELECT 1 FROM task_types WHERE id=$1", [p.taskTypeId]))
        .rowCount
    )
      throw new Fault("NOT_FOUND", 404);
    return createActivity(c, {
      accountId,
      taskTypeId: p.taskTypeId,
      periodKey: p.periodKey ?? group.period_key,
      activity: p.activity,
      sourceId: group.source_id,
    });
  });
}

export async function acceptIncomingActivity(
  c: pg.PoolClient,
  raw: string,
  sourceId: string,
  group: {
    id: string;
    namespace: string;
    task_type_id: string;
    period_key: string;
  },
  taskTypeId: string,
  priority: number,
) {
  const lines = messageLines(raw)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 2) return null;
  const [activityLine] = lines.filter((line) =>
    /^(?:نشاط|التكليف|activity)\s*[:：]/iu.test(line),
  );
  if (!activityLine) return null;
  const activity = label.safeParse(activityLine.replace(/^[^:：]+[:：]/, ""));
  if (
    !activity.success ||
    !/^[\p{L}\p{M}\p{N} _.-]+$/u.test(activity.data) ||
    !/\s/.test(activity.data) ||
    studentUsername(activity.data)
  )
    return null;
  const other = lines.find((line) => line !== activityLine);
  const parts = messageSegments(other ?? "");
  const username =
    parts.length === 1 ? studentUsername(parts[0]!.value) : undefined;
  if (!username) return null;
  const candidates = (
    await c.query(
      `SELECT ac.id FROM accounts ac
     WHERE ac.namespace=$1 AND ac.username_normalized=ANY($2::text[]) AND ac.archived_at IS NULL
     ORDER BY ac.username_normalized FOR UPDATE OF ac`,
      [
        normalize(group.namespace),
        [normalize(username), normalize(username) + "@seu.edu.sa"],
      ],
    )
  ).rows;
  if (candidates.length !== 1) return null;
  const account = candidates[0];
  // Recheck the state after taking the account lock used by the follow-up editor.
  if (
    !(
      await c.query(
        "SELECT 1 FROM account_followups WHERE account_id=$1 AND group_id=$2 AND active",
        [account.id, group.id],
      )
    ).rowCount
  )
    return null;
  await c.query(
    "UPDATE source_messages SET state='PROCESSED',encrypted_payload=NULL,version=version+1 WHERE id=$1",
    [sourceId],
  );
  const created = await createActivity(c, {
    accountId: account.id,
    taskTypeId,
    periodKey: group.period_key,
    activity: activity.data,
    sourceId,
    priority,
  });
  return { id: sourceId, state: "PROCESSED", duplicate: undefined, ...created };
}
