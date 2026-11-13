import type pg from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import { Fault } from "./service.js";

const query = z
  .object({
    section: z.enum(["tasks", "sources", "flags", "history"]).default("tasks"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict();

// Explicit projections only: encrypted/raw payloads and credentials are never selected.
export async function accountDetails(
  pool: pg.Pool,
  accountId: string,
  raw: unknown,
) {
  const p = query.parse(raw);
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const account = (
      await c.query(
        "SELECT id,namespace,username_normalized,display_name,version,created_at,archived_at FROM accounts WHERE id=$1",
        [accountId],
      )
    ).rows[0];
    if (!account) throw new Fault("NOT_FOUND", 404);
    const related = `WITH related_sources AS (
      SELECT DISTINCT s.id FROM source_messages s LEFT JOIN assignment_sources x ON x.source_message_id=s.id LEFT JOIN assignments a ON a.id=x.assignment_id
      WHERE a.account_id=$1 OR s.review_account_id=$1
    ), targets AS (
      SELECT $1::uuid id UNION SELECT id FROM assignments WHERE account_id=$1 UNION SELECT id FROM related_sources
      UNION SELECT r.id FROM reply_jobs r JOIN assignments a ON a.id=r.assignment_id WHERE a.account_id=$1
      UNION SELECT id FROM issue_flags WHERE account_id=$1
    )`;
    const specs = {
      tasks: {
        from: "assignments a JOIN task_types t ON t.id=a.task_type_id",
        where: "a.account_id=$1",
        fields:
          "a.id,a.status,a.version,a.period_key,a.priority,a.created_at,a.completed_at,t.code task_code,t.name task_name,(SELECT count(*)::int FROM assignment_sources x WHERE x.assignment_id=a.id) source_count,(SELECT count(*)::int FROM reply_jobs r WHERE r.assignment_id=a.id) reply_count",
        order: "a.created_at DESC,a.id",
        prefix: "",
      },
      sources: {
        from: "source_messages s JOIN groups g ON g.id=s.group_id JOIN whatsapp_sessions ws ON ws.id=s.session_id",
        where: "s.id IN (SELECT id FROM related_sources)",
        fields:
          "s.id,s.state,s.received_at,s.external_message_id,g.id group_id,g.title group_title,ws.id session_id,ws.label session_label,ws.provider,(SELECT count(*)::int FROM assignment_sources x JOIN assignments a ON a.id=x.assignment_id WHERE x.source_message_id=s.id AND a.account_id=$1) task_count",
        order: "s.received_at DESC,s.id",
        prefix: related,
      },
      flags: {
        from: "issue_flags f",
        where: "f.account_id=$1",
        fields: "f.id,f.kind,f.verified,f.evidence_kind,f.created_at",
        order: "f.created_at DESC,f.id",
        prefix: "",
      },
      history: {
        from: "audit_events e",
        where: "e.target_id IN (SELECT id FROM targets)",
        fields: "e.id,e.actor_id,e.action,e.target_id,e.created_at",
        order: "e.id DESC",
        prefix: related,
      },
    };
    const s = specs[p.section];
    const total = Number(
      (
        await c.query(
          `${s.prefix} SELECT count(*) FROM ${s.from} WHERE ${s.where}`,
          [accountId],
        )
      ).rows[0].count,
    );
    const items = (
      await c.query(
        `${s.prefix} SELECT ${s.fields} FROM ${s.from} WHERE ${s.where} ORDER BY ${s.order} LIMIT $2 OFFSET $3`,
        [accountId, p.limit, p.offset],
      )
    ).rows;
    return {
      account,
      section: p.section,
      items,
      total,
      limit: p.limit,
      offset: p.offset,
    };
  });
}
