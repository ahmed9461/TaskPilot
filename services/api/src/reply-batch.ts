import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { id } from "../../../packages/contracts/src/index.js";
import { transaction, event } from "./db.js";
import { hash } from "./security.js";
import { Fault, type Service } from "./service.js";

export const batchReplyInput = z
  .object({
    groupId: id,
    templateId: id,
    completedOnly: z.boolean().default(false),
  })
  .strict();
type BatchInput = z.infer<typeof batchReplyInput>;
const limit = 100;

async function buildPlan(c: PoolClient, p: BatchInput) {
  const scope = (
    await c.query(
      `SELECT g.title, g.version, g.session_id, ws.provider, ws.label session_label,
            t.code, t.body, t.version template_version, t.task_type_id
       FROM groups g JOIN whatsapp_sessions ws ON ws.id=g.session_id
       JOIN reply_templates t ON t.id=$2
      WHERE g.id=$1 AND g.enabled AND ws.forgotten_at IS NULL
        AND t.enabled AND (t.group_id IS NULL OR t.group_id=g.id)`,
      [p.groupId, p.templateId],
    )
  ).rows[0];
  if (!scope) throw new Fault("BATCH_SCOPE_UNAVAILABLE");
  const rows = (
    await c.query<{
      account_id: string;
      account_version: number;
      display_name: string;
      task_name: string;
      assignment_id: string;
      assignment_version: number;
      source_id: string;
      source_version: number;
      received_at: Date;
      quoted: boolean;
      scope_matches: boolean;
      prior_reply: boolean;
    }>(
      `WITH source_targets AS (
       SELECT DISTINCT ON (ac.id) ac.id account_id, ac.version account_version, ac.display_name,
          a.id assignment_id, a.version assignment_version, tt.name task_name,
          s.id source_id, s.version source_version, s.received_at,
          (s.encrypted_transport_key IS NOT NULL OR $2='mock') AND NOT EXISTS (
            SELECT 1 FROM assignment_sources other JOIN assignments oa ON oa.id=other.assignment_id
             WHERE other.source_message_id=s.id AND oa.account_id<>ac.id
          ) quoted,
          ($3::uuid IS NULL OR $3=a.task_type_id) scope_matches
       FROM source_messages s JOIN assignment_sources axs ON axs.source_message_id=s.id
       JOIN assignments a ON a.id=axs.assignment_id JOIN accounts ac ON ac.id=a.account_id
       JOIN task_types tt ON tt.id=a.task_type_id
       WHERE s.group_id=$1 AND s.state='PROCESSED' AND ac.archived_at IS NULL
         AND ($4=false OR a.status='COMPLETED')
       ORDER BY ac.id, ($3 IS NULL OR $3=a.task_type_id) DESC,
                (s.encrypted_transport_key IS NOT NULL OR $2='mock') DESC,
                s.received_at DESC,s.id DESC,a.id
     ) SELECT st.*, EXISTS (
       SELECT 1 FROM reply_jobs r JOIN assignments a2 ON a2.id=r.assignment_id
        WHERE a2.account_id=st.account_id AND r.source_message_id=st.source_id
          AND r.template_id=$5
     ) prior_reply
     FROM source_targets st ORDER BY account_id LIMIT $6`,
      [
        p.groupId,
        scope.provider,
        scope.task_type_id,
        p.completedOnly,
        p.templateId,
        limit + 1,
      ],
    )
  ).rows;
  if (rows.length > limit) throw new Fault("BATCH_TOO_LARGE");
  const targets = rows
    .filter((r) => r.quoted && r.scope_matches && !r.prior_reply)
    .map((row) => ({
      accountId: row.account_id,
      accountVersion: row.account_version,
      displayName: row.display_name,
      assignmentId: row.assignment_id,
      assignmentVersion: row.assignment_version,
      sourceId: row.source_id,
      sourceVersion: row.source_version,
      receivedAt: row.received_at,
      body: (scope.body as string)
        .replaceAll("{displayName}", () => row.display_name)
        .replaceAll("{taskName}", () => row.task_name),
    }));
  // A source quoted by multiple accounts cannot identify each recipient separately.
  const frequency = new Map<string, number>();
  for (const row of rows)
    frequency.set(row.source_id, (frequency.get(row.source_id) ?? 0) + 1);
  const unique = targets.filter((row) => frequency.get(row.sourceId) === 1);
  return {
    sessionId: scope.session_id as string,
    groupTitle: scope.title as string,
    groupVersion: scope.version as number,
    sessionLabel: scope.session_label as string,
    provider: scope.provider as string,
    template: scope.code as string,
    templateVersion: scope.template_version as number,
    targets: unique,
    accountCount: rows.length,
    alreadyReplied: rows.filter((r) => r.prior_reply).length,
    unavailable:
      rows.length - unique.length - rows.filter((r) => r.prior_reply).length,
  };
}

export async function previewReplyBatch(service: Service, p: BatchInput) {
  return transaction(service.pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const plan = await buildPlan(c, p);
    const batchId = randomUUID();
    const approvalToken = plan.targets.length
      ? await service.approval(c, "reply-batch", {
          input: p,
          sessionId: plan.sessionId,
          batchId,
          fingerprint: hash(JSON.stringify(plan)),
        })
      : null;
    return { ...plan, batchId, approvalToken };
  });
}

export async function approveReplyBatch(
  service: Service,
  token: string,
  allowLive: boolean,
) {
  return transaction(service.pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const saved = await service.consume(c, token, "reply-batch");
    const p = batchReplyInput.parse(saved.input);
    const plan = await buildPlan(c, p);
    if (plan.provider !== "mock" && !allowLive)
      throw new Fault("LIVE_SENDING_NOT_AUTHORIZED", 403);
    if (hash(JSON.stringify(plan)) !== saved.fingerprint)
      throw new Fault("STALE_PREVIEW");
    await c.query(
      "SELECT id FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [plan.targets.map((r) => r.accountId)],
    );
    await c.query("SELECT id FROM groups WHERE id=$1 FOR SHARE", [p.groupId]);
    await c.query("SELECT id FROM reply_templates WHERE id=$1 FOR SHARE", [
      p.templateId,
    ]);
    for (const target of plan.targets) {
      await c.query(
        `INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key,batch_id)
         VALUES($1,$2,$3,$4,$5,$6,'APPROVED',$7,$8)`,
        [
          randomUUID(),
          target.assignmentId,
          target.sourceId,
          plan.sessionId,
          p.templateId,
          target.body,
          "batch:" +
            hash(`${target.accountId}:${target.sourceId}:${p.templateId}`),
          saved.batchId,
        ],
      );
    }
    await c.query(
      "UPDATE accounts SET version=version+1 WHERE id=ANY($1::uuid[])",
      [plan.targets.map((r) => r.accountId)],
    );
    await event(c, "REPLY_BATCH_APPROVED", saved.batchId);
    return { batchId: saved.batchId, queued: plan.targets.length };
  });
}

export async function getReplyBatch(service: Service, batchId: string) {
  const rows = (
    await service.pool.query(
      "SELECT status,count(*)::int AS count FROM reply_jobs WHERE batch_id=$1 GROUP BY status ORDER BY status",
      [batchId],
    )
  ).rows;
  if (!rows.length) throw new Fault("NOT_FOUND", 404);
  return { batchId, counts: rows };
}

export async function cancelPendingBatch(service: Service, batchId: string) {
  return transaction(service.pool, async (c) => {
    const affected = (
      await c.query(
        `SELECT ac.id FROM accounts ac WHERE EXISTS (
         SELECT 1 FROM assignments a JOIN reply_jobs r ON r.assignment_id=a.id
         WHERE a.account_id=ac.id AND r.batch_id=$1 AND r.status='APPROVED')
       ORDER BY ac.id FOR UPDATE`,
        [batchId],
      )
    ).rows;
    if (!affected.length) return { canceled: 0 };
    const result = await c.query(
      `UPDATE reply_jobs r SET status='CANCELED' FROM assignments a
       WHERE r.assignment_id=a.id AND r.batch_id=$1 AND r.status='APPROVED'
           AND a.account_id=ANY($2::uuid[]) RETURNING a.account_id`,
      [batchId, affected.map((row) => row.id)],
    );
    if (result.rowCount) {
      await c.query(
        "UPDATE accounts SET version=version+1 WHERE id=ANY($1::uuid[])",
        [result.rows.map((row) => row.account_id)],
      );
      await event(c, "REPLY_BATCH_CANCELED", batchId);
    }
    return { canceled: result.rowCount };
  });
}
