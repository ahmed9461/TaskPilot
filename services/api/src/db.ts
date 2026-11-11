import pg from 'pg';
import type { PoolClient } from 'pg';
export const createPool = (connectionString: string) => new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 20000, statement_timeout: 15000 });
export async function transaction<T>(pool: pg.Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function event(c: PoolClient, action: string, target?: string) {
  // Serialize event allocation until commit so a reconnect cursor cannot skip a late commit.
  await c.query('SELECT pg_advisory_xact_lock(8240003)');
  await c.query('INSERT INTO audit_events(action,target_id) VALUES($1,$2)', [action, target ?? null]);
  await c.query('INSERT INTO notifications(type,subject_id) VALUES($1,$2)', [action, target ?? null]);
}
