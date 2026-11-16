import type pg from "pg";
import { randomUUID } from "node:crypto";
import { event, transaction } from "./db.js";
import { hash, token } from "./security.js";

export function tailscaleAddress(value: unknown): string {
  if (typeof value !== "string") throw Error("INVALID_TAILSCALE_ADDRESS");
  const uri = new URL(value);
  if (
    uri.protocol !== "https:" ||
    !uri.hostname.endsWith(".ts.net") ||
    uri.port !== "9443" ||
    uri.pathname !== "/" ||
    uri.username ||
    uri.password ||
    uri.search ||
    uri.hash
  )
    throw Error("INVALID_TAILSCALE_ADDRESS");
  return uri.origin;
}

export async function issueClientSession(pool: pg.Pool, address?: string) {
  const persistent = address !== undefined;
  const endpoint = persistent ? tailscaleAddress(address) : undefined;
  const id = randomUUID(),
    value = token();
  const row = await transaction(pool, async (c) => {
    const result = (
      await c.query(
        "INSERT INTO client_sessions(id,token_hash,expires_at) VALUES($1,$2,CASE WHEN $3 THEN 'infinity'::timestamptz ELSE now()+interval '30 minutes' END) RETURNING expires_at",
        [id, hash(value), persistent],
      )
    ).rows[0];
    await event(
      c,
      persistent ? "CLIENT_DEVICE_CREATED" : "CLIENT_SESSION_CREATED",
      id,
    );
    return result;
  });
  return {
    id,
    token: value,
    expiresAt: persistent ? null : row.expires_at,
    persistent,
    ...(endpoint ? { address: endpoint } : {}),
  };
}

export async function issueClientReauth(pool: pg.Pool, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_SESSION");
  const grant = token();
  const row = (
    await pool.query(
      "UPDATE client_sessions SET reauth_hash=$2,reauth_expires_at=now()+interval '60 seconds' WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING reauth_expires_at",
      [id, hash(grant)],
    )
  ).rows[0];
  if (!row) throw Error("SESSION_EXPIRED");
  return { grant, expiresAt: row.reauth_expires_at };
}
