// One-time deployment bootstrap. Never enables, never overwrites an existing decision.
import { lstat, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { durableReplace } from "./durable-policy.mjs";
import {
  parseSendingPolicy,
  policyHash,
} from "../dist/services/api/src/sending-policy.js";
let pool, lease;
try {
  if (process.getuid?.() !== 0 || process.argv.length !== 2) throw Error();
  const envPath = "/etc/taskpilot/pilot.env",
    path = "/etc/taskpilot/sending-state.json";
  const stat = await lstat(envPath);
  if (!stat.isFile() || stat.uid !== 0 || stat.mode & 0o022) throw Error();
  let env = await readFile(envPath, "utf8");
  const lines = env.split(/\r?\n/).filter((s) => s.startsWith("DATABASE_URL="));
  if (lines.length !== 1) throw Error();
  pool = new pg.Pool({
    connectionString: lines[0].slice(13),
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  lease = await pool.connect();
  if (
    !(await lease.query("SELECT pg_try_advisory_lock(8240008) locked")).rows[0]
      .locked
  )
    throw Error();
  env = await readFile(envPath, "utf8");
  if (parseSendingPolicy(env).sending) throw Error();
  try {
    await lstat(path);
    throw Error("ALREADY_EXISTS");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await durableReplace(
    path,
    JSON.stringify({
      version: 1,
      phase: "COMMITTED",
      enabled: false,
      operationId: randomUUID(),
      envHash: policyHash(env),
      actorId: null,
      reason: "DEPLOYMENT_DISABLED_BOOTSTRAP",
    }),
    { ...stat, mode: 0o640 },
  );
  console.log(
    JSON.stringify({ sendingPolicyInitialized: true, enabled: false }),
  );
} catch {
  console.log("SENDING_POLICY_BOOTSTRAP_REFUSED");
  process.exitCode = 1;
} finally {
  lease?.release();
  await pool?.end();
}
