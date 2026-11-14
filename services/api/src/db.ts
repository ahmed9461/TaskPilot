import pg from "pg";
import type { PoolClient } from "pg";
export function createPool(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 8,
    connectionTimeoutMillis: 20000,
    statement_timeout: 15000,
  });
  // pg removes the failed idle client before emitting this event. Keep the worker
  // alive to reconnect, without logging the error's attached client/credentials.
  // Active query failures still reject normally; readiness checks query the DB.
  pool.on("error", () => {});
  return pool;
}
// These are infrastructure/transaction failures, not evidence of a poison message.
// Classification never retries a transaction or an outbound provider call itself.
export function isRetryableDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === "string")
    return (
      /^(08|40|53)[A-Z0-9]{3}$/.test(code) ||
      [
        "55P03",
        "57014",
        "57P01",
        "57P02",
        "57P03",
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "EPIPE",
        "ENETUNREACH",
        "EHOSTUNREACH",
      ].includes(code)
    );
  return [
    "Connection terminated",
    "Connection terminated unexpectedly",
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
  ].includes(typeof message === "string" ? message : "");
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  let discard = false;
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await c.query("ROLLBACK");
    } catch {
      // Preserve the original error and keep a broken connection out of the pool.
      discard = true;
    }
    throw e;
  } finally {
    c.release(discard);
  }
}
export async function event(c: PoolClient, action: string, target?: string) {
  // Serialize event allocation until commit so a reconnect cursor cannot skip a late commit.
  await c.query("SELECT pg_advisory_xact_lock(8240003)");
  await c.query("INSERT INTO audit_events(action,target_id) VALUES($1,$2)", [
    action,
    target ?? null,
  ]);
  await c.query("INSERT INTO notifications(type,subject_id) VALUES($1,$2)", [
    action,
    target ?? null,
  ]);
}
