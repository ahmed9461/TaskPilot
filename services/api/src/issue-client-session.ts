import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPool, transaction, event } from "./db.js";
import { hash, token } from "./security.js";
// This CLI is reachable through an already-authenticated SSH channel, never through HTTP.
// It never reads/exports the permanent owner API or reauthentication keys.
if (process.getuid?.() !== 0) throw new Error("LOCAL_ROOT_REQUIRED");
const lines = (await readFile("/etc/taskpilot/pilot.env", "utf8")).split("\n");
const db = lines.find((l) => l.startsWith("DATABASE_URL="))?.slice(13);
if (!db) throw new Error("DATABASE_CONFIGURATION_REQUIRED");
const pool = createPool(db);
try {
  const mode = process.argv[2];
  if (mode === "--reauth") {
    const id = process.argv[3];
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_SESSION");
    const grant = token();
    const row = (
      await pool.query(
        "UPDATE client_sessions SET reauth_hash=$2,reauth_expires_at=now()+interval '60 seconds' WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING reauth_expires_at",
        [id, hash(grant)],
      )
    ).rows[0];
    if (!row) throw Error("SESSION_EXPIRED");
    process.stdout.write(
      JSON.stringify({ grant, expiresAt: row.reauth_expires_at }),
    );
  } else if (mode === undefined) {
    const id = randomUUID(),
      value = token();
    const row = await transaction(pool, async (c) => {
      const r = (
        await c.query(
          "INSERT INTO client_sessions(id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes') RETURNING expires_at",
          [id, hash(value)],
        )
      ).rows[0];
      await event(c, "CLIENT_SESSION_CREATED", id);
      return r;
    });
    process.stdout.write(
      JSON.stringify({ id, token: value, expiresAt: row.expires_at }),
    );
  } else throw Error("INVALID_MODE");
} catch {
  process.stderr.write("CLIENT_SESSION_ISSUANCE_FAILED\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
