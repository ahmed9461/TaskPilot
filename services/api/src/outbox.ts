import type pg from "pg";
import { transaction, event } from "./db.js";
import { DefinitelyNotSent, type WhatsAppTransport } from "./transport.js";

type Settlement = Readonly<{
  jobId: string;
  status: "SENT" | "FAILED" | "UNKNOWN_DELIVERY";
  providerMessageId?: string;
}>;
const action = {
  SENT: "REPLY_SENT",
  FAILED: "REPLY_FAILED",
  UNKNOWN_DELIVERY: "REPLY_DELIVERY_UNKNOWN",
} as const;

// No raw provider/DB errors, bodies or credentials are attached to this error.
// Private outcome data stays in the single serialized worker until DB recovery.
class PendingSettlement extends Error {
  readonly #outcome: Settlement;
  constructor(outcome: Settlement) {
    super("REPLY_SETTLEMENT_PENDING");
    this.#outcome = Object.freeze(outcome);
  }
  get outcome() {
    return this.#outcome;
  }
}
async function settle(pool: pg.Pool, outcome: Settlement) {
  await transaction(pool, async (c) => {
    const changed = await c.query(
      "UPDATE reply_jobs SET status=$2,provider_message_id=COALESCE($3,provider_message_id) WHERE id=$1 AND status='SENDING' RETURNING id",
      [outcome.jobId, outcome.status, outcome.providerMessageId ?? null],
    );
    // A committed result whose ACK was lost must not be downgraded or re-notified.
    if (changed.rowCount) await event(c, action[outcome.status], outcome.jobId);
  });
}
export async function dispatchOne(pool: pg.Pool, transport: WhatsAppTransport) {
  let claimed: string | undefined;
  let job;
  try {
    job = await transaction(pool, async (c) => {
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
      await c.query("UPDATE reply_jobs SET status='SENDING' WHERE id=$1", [
        r.id,
      ]);
      claimed = r.id;
      return r;
    });
  } catch (error) {
    // No provider call has occurred. If claim committed but its ACK was lost,
    // publish a definite unsent outcome; a rolled-back APPROVED row is unchanged.
    if (claimed)
      throw new PendingSettlement({ jobId: claimed, status: "FAILED" });
    throw error;
  }
  if (!job) return null;
  let outcome: Settlement;
  try {
    const result = await transport.replyToMessage({
      sessionId: job.session_id,
      groupId: job.group_id,
      externalMessageId: job.external_message_id,
      body: job.body,
      jobId: job.id,
      sourceMessageId: job.source_message_id,
    });
    outcome = {
      jobId: job.id,
      status: "SENT",
      providerMessageId: result.providerMessageId,
    };
  } catch (error) {
    outcome = {
      jobId: job.id,
      status:
        error instanceof DefinitelyNotSent ? "FAILED" : "UNKNOWN_DELIVERY",
    };
  }
  try {
    await settle(pool, outcome);
  } catch {
    // Retry the outcome persistence only. Never reinterpret DB failure as send failure.
    throw new PendingSettlement(outcome);
  }
  return job.id;
}
export async function startMockWorker(
  pool: pg.Pool,
  transport: WhatsAppTransport,
) {
  const lease = await pool.connect();
  const leaseKey = transport.provider === "mock" ? 8240002 : 8240004;
  try {
    if (
      !(await lease.query("SELECT pg_try_advisory_lock($1) locked", [leaseKey]))
        .rows[0].locked
    )
      throw new Error("WORKER_ALREADY_RUNNING");
    await transaction(pool, async (c) => {
      const interrupted = await c.query(
        "UPDATE reply_jobs r SET status='UNKNOWN_DELIVERY' FROM whatsapp_sessions s WHERE r.session_id=s.id AND s.provider=$1 AND r.status='SENDING' RETURNING r.id",
        [transport.provider],
      );
      for (const row of interrupted.rows)
        await event(c, "REPLY_DELIVERY_UNKNOWN", row.id);
    });
  } catch (error) {
    lease.release(true);
    throw error;
  }
  let running = false,
    stopped = false;
  let pending: Settlement | undefined;
  const timer = setInterval(async () => {
    if (running || stopped) return;
    running = true;
    try {
      if (pending) {
        await settle(pool, pending);
        pending = undefined;
      } else {
        await dispatchOne(pool, transport);
      }
    } catch (error) {
      if (error instanceof PendingSettlement) pending = error.outcome;
      // No raw error/client/payload logging. Durable SENDING survives process loss.
    } finally {
      running = false;
    }
  }, 1000);
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((r) => setTimeout(r, 20));
    try {
      await lease.query("SELECT pg_advisory_unlock($1)", [leaseKey]);
    } finally {
      lease.release();
    }
  };
}
