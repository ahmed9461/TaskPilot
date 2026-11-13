import type { PoolClient, Pool } from "pg";
import { hash } from "../security.js";
export async function recordReceipt(
  c: PoolClient,
  session: string,
  group: string,
  externalId: unknown,
  reason: string,
  flags: number,
  eventType: string = "notify",
) {
  if (typeof externalId !== "string" || !externalId || externalId.length > 200)
    return;
  await c.query("SELECT pg_advisory_xact_lock(8240006)");
  // Bounded diagnostic retention only; ingress dedupe tombstones are never pruned here.
  await c.query(
    "DELETE FROM whatsapp_receipts WHERE last_seen<now()-interval '7 days'",
  );
  await c.query(
    "DELETE FROM whatsapp_receipts WHERE id IN (SELECT id FROM whatsapp_receipts ORDER BY last_seen DESC,id DESC OFFSET 9999)",
  );
  await c.query(
    `INSERT INTO whatsapp_receipts(session_id,group_id,message_hash,first_reason,last_reason,first_flags,last_flags,accepted_at,first_event_type,last_event_type)
    VALUES($1,$2,$3,$4,$4,$5,$5,CASE WHEN $4='ACCEPTED_TEXT' THEN now() END,$6,$6)
    ON CONFLICT(session_id,group_id,message_hash) DO UPDATE SET last_reason=EXCLUDED.last_reason,last_flags=EXCLUDED.last_flags,
    last_event_type=EXCLUDED.last_event_type,observations=LEAST(1000000,whatsapp_receipts.observations+1),last_seen=now(),accepted_at=COALESCE(whatsapp_receipts.accepted_at,EXCLUDED.accepted_at)`,
    [
      session,
      group,
      hash(externalId),
      reason,
      flags,
      ["notify", "append"].includes(eventType) ? eventType : "other",
    ],
  );
}
export async function receiptSummary(pool: Pool, session: string) {
  return (
    await pool.query(
      `SELECT count(*)::int recorded,
    count(*) FILTER(WHERE accepted_at IS NOT NULL)::int accepted,
    count(*) FILTER(WHERE (first_reason='ACCEPTED_TEXT' AND first_event_type='append') OR (last_reason='ACCEPTED_TEXT' AND last_event_type='append'))::int "acceptedAppendReceipts",
    count(*) FILTER(WHERE (first_flags & 2)>0 OR (last_flags & 2)>0)::int "withSenderKeyMetadata",
    count(*) FILTER(WHERE accepted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_ingress q WHERE q.session_id=r.session_id AND q.group_id=r.group_id AND encode(sha256(convert_to(q.external_message_id,'UTF8')),'hex')=r.message_hash))::int "acceptedWithoutIngress",
    max(last_seen) "lastRecordedAt",
    (SELECT COALESCE(json_object_agg(first_reason,n),'{}'::json) FROM (SELECT first_reason,count(*)::int n FROM whatsapp_receipts WHERE session_id=$1 GROUP BY first_reason) a) "firstReasons",
    (SELECT COALESCE(json_object_agg(last_reason,n),'{}'::json) FROM (SELECT last_reason,count(*)::int n FROM whatsapp_receipts WHERE session_id=$1 GROUP BY last_reason) a) "lastReasons"
    FROM whatsapp_receipts r WHERE session_id=$1`,
      [session],
    )
  ).rows[0];
}
