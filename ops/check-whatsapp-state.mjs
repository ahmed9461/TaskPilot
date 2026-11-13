// Server-local, read-only aggregate proof. Never prints credentials, JIDs, QR or group metadata.
import { readFile, readlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { Vault } from "../dist/services/api/src/security.js";
let pool;
try {
  const env = Object.fromEntries(
    (await readFile("/etc/taskpilot/pilot.env", "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
  const expected = process.argv.includes("--expect-connection");
  if (
    (env.WHATSAPP_CONNECTION_ENABLED === "true") !== expected ||
    env.WHATSAPP_SENDING_ENABLED !== "false"
  )
    throw Error();
  const pid = execFileSync(
    "systemctl",
    ["show", "taskpilot.service", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  if (
    !/^[1-9]\d*$/.test(pid) ||
    (await readlink(`/proc/${pid}/fd/1`)) !== "/dev/null" ||
    (await readlink(`/proc/${pid}/fd/2`)) !== "/dev/null"
  )
    throw Error();
  const vault = new Vault(
    (await readFile(env.TASKPILOT_ENCRYPTION_KEY_FILE, "utf8")).trim(),
  );
  const restoreArg = process.argv.find((v) => v.startsWith("--restore-db="));
  let connectionString = env.DATABASE_URL;
  if (restoreArg) {
    const name = restoreArg.slice("--restore-db=".length);
    if (!/^taskpilot_[a-z0-9_]+_restore_test$/.test(name)) throw Error();
    const migrationEnv = Object.fromEntries(
      (await readFile("/etc/taskpilot/migration.env", "utf8"))
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [
          l.slice(0, l.indexOf("=")),
          l.slice(l.indexOf("=") + 1).trim(),
        ]),
    );
    const address = new URL(migrationEnv.DATABASE_URL);
    address.pathname = "/" + name;
    connectionString = address.toString();
  }
  pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const rows = (
    await pool.query(
      "SELECT session_id,category,id_hash,encrypted_payload FROM whatsapp_auth",
    )
  ).rows;
  let pairedSessions = 0;
  for (const row of rows) {
    const value = JSON.parse(
      vault.open(
        row.encrypted_payload,
        `wa-auth:${row.session_id}:${row.category}:${row.id_hash}`,
      ),
    );
    if (
      row.category === "creds" &&
      typeof value.me?.id === "string" &&
      value.me.id.length > 0
    )
      pairedSessions++;
  }
  const summary = (
    await pool.query(`SELECT
    (SELECT count(*)::int FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested) "requestedSessions",
    (SELECT count(*)::int FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE s.provider='baileys' AND g.enabled) "monitoredGroups",
    (SELECT count(*)::int FROM source_messages m JOIN whatsapp_sessions s ON s.id=m.session_id WHERE s.provider='baileys') "liveSourceMessages",
    (SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys') "liveReplyJobs"`)
  ).rows[0];
  console.log(
    JSON.stringify({
      check: "PASS",
      databaseScope: restoreArg ? "isolated restore drill" : "pilot",
      connectionEnabled: expected,
      sendingEnabled: false,
      providerOutputDiscarded: true,
      authRows: rows.length,
      encryptedAuthValid: true,
      pairedSessions,
      ...summary,
    }),
  );
} catch {
  console.error("WHATSAPP_STATE_CHECK_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
