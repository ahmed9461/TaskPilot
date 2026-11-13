import type pg from "pg";
import { transaction, event } from "./db.js";
import { DefinitelyNotSent, type WhatsAppTransport } from "./transport.js";
export async function dispatchOne(pool: pg.Pool, transport: WhatsAppTransport) {
  const job = await transaction(pool, async (c) => {
    const r = (
      await c.query(
        `SELECT r.*,s.external_message_id,s.group_id,g.enabled,ac.archived_at FROM reply_jobs r
      JOIN source_messages s ON s.id=r.source_message_id JOIN groups g ON g.id=s.group_id
      JOIN assignments a ON a.id=r.assignment_id JOIN accounts ac ON ac.id=a.account_id
      JOIN whatsapp_sessions ws ON ws.id=r.session_id
      WHERE r.status='APPROVED' AND ws.provider=$1 AND ($1='mock' OR ws.status='CONNECTED') ORDER BY r.approved_at FOR UPDATE OF r SKIP LOCKED LIMIT 1`,
        [transport.provider],
      )
    ).rows[0];
    if (!r) return null;
    if (!r.enabled || r.archived_at) {
      await c.query("UPDATE reply_jobs SET status='CANCELED' WHERE id=$1", [
        r.id,
      ]);
      return null;
    }
    if (transport.canSend && !transport.canSend(r.session_id)) return null;
    await c.query("UPDATE reply_jobs SET status='SENDING' WHERE id=$1", [r.id]);
    return r;
  });
  if (!job) return null;
  try {
    const result = await transport.replyToMessage({
      sessionId: job.session_id,
      groupId: job.group_id,
      externalMessageId: job.external_message_id,
      body: job.body,
      jobId: job.id,
      sourceMessageId: job.source_message_id,
    });
    await transaction(pool, async (c) => {
      await c.query(
        "UPDATE reply_jobs SET status='SENT',provider_message_id=$2 WHERE id=$1",
        [job.id, result.providerMessageId],
      );
      await event(c, "REPLY_SENT", job.id);
    });
  } catch (error) {
    const status =
      error instanceof DefinitelyNotSent ? "FAILED" : "UNKNOWN_DELIVERY";
    // Any ambiguous transport exception, including a timeout, is terminal until human reconciliation.
    await transaction(pool, async (c) => {
      await c.query("UPDATE reply_jobs SET status=$2 WHERE id=$1", [
        job.id,
        status,
      ]);
      await event(
        c,
        status === "FAILED" ? "REPLY_FAILED" : "REPLY_DELIVERY_UNKNOWN",
        job.id,
      );
    });
  }
  return job.id;
}
export async function startMockWorker(
  pool: pg.Pool,
  transport: WhatsAppTransport,
) {
  const lease = await pool.connect();
  const leaseKey = transport.provider === "mock" ? 8240002 : 8240004;
  if (
    !(await lease.query("SELECT pg_try_advisory_lock($1) locked", [leaseKey]))
      .rows[0].locked
  ) {
    lease.release();
    throw new Error("WORKER_ALREADY_RUNNING");
  }
  await pool.query(
    "UPDATE reply_jobs r SET status='UNKNOWN_DELIVERY' FROM whatsapp_sessions s WHERE r.session_id=s.id AND s.provider=$1 AND r.status='SENDING'",
    [transport.provider],
  );
  let running = false;
  let stopped = false;
  const timer = setInterval(async () => {
    if (running || stopped) return;
    running = true;
    try {
      await dispatchOne(pool, transport);
    } catch {
      /* No payloads or credentials in logs. */
    } finally {
      running = false;
    }
  }, 1000);
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((r) => setTimeout(r, 20));
    await lease.query("SELECT pg_advisory_unlock($1)", [leaseKey]);
    lease.release();
  };
}
