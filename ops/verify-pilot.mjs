import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";
import { Vault } from "../dist/services/api/src/security.js";
const env = Object.fromEntries(
  (await readFile("/etc/taskpilot/pilot.env", "utf8"))
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});
const vault = new Vault(
  (await readFile(env.TASKPILOT_ENCRYPTION_KEY_FILE, "utf8")).trim(),
);
async function pairedIdentities() {
  const rows = (
    await pool.query(
      "SELECT s.id,a.id_hash,a.encrypted_payload FROM whatsapp_sessions s JOIN whatsapp_auth a ON a.session_id=s.id WHERE s.provider='baileys' AND s.connect_requested AND a.category='creds'",
    )
  ).rows;
  const identities = new Map();
  for (const r of rows) {
    const creds = JSON.parse(
      vault.open(r.encrypted_payload, `wa-auth:${r.id}:creds:${r.id_hash}`),
    );
    if (typeof creds.me?.id === "string" && creds.me.id.length > 0)
      identities.set(r.id, creds.me.id);
  }
  return identities;
}
let stage = "runtime-role";
try {
  const role = (
    await pool.query(
      "SELECT current_user,rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
    )
  ).rows[0];
  assert.equal(role.current_user, "taskpilot_runtime");
  assert.equal(role.rolsuper, false);
  assert.equal(role.rolcreatedb, false);
  assert.equal(role.rolcreaterole, false);
  stage = "runtime-ddl-denial";
  await assert.rejects(
    () => pool.query("CREATE TABLE forbidden_pilot_permission_check(id int)"),
    (e) => e.code === "42501",
  );
  stage = "migration-write-denial";
  await assert.rejects(
    () => pool.query("UPDATE schema_migrations SET checksum=checksum"),
    (e) => e.code === "42501",
  );
  const services = () =>
    execFileSync(
      "systemctl",
      [
        "list-units",
        "--type=service",
        "--state=running",
        "--no-legend",
        "--no-pager",
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((x) => x && x !== "taskpilot.service")
      .sort();
  stage = "snapshot";
  const before = services();
  const pairedBefore = await pairedIdentities();
  const counts = await pool.query(
    "SELECT (SELECT count(*) FROM accounts) accounts,(SELECT count(*) FROM assignments) assignments,(SELECT count(*) FROM source_messages) messages",
  );
  const pidBefore = execFileSync(
    "systemctl",
    ["show", "taskpilot.service", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  stage = "restart";
  execFileSync("systemctl", ["restart", "taskpilot.service"]);
  stage = "readiness";
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      ready = (
        await fetch("http://127.0.0.1:8240/health", {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(ready, true);
  stage = "provider-output-privacy";
  for (const stream of ["StandardOutput", "StandardError"])
    assert.equal(
      execFileSync(
        "systemctl",
        ["show", "taskpilot.service", "-p", stream, "--value"],
        { encoding: "utf8" },
      ).trim(),
      "null",
    );
  stage = "whatsapp-recovery";
  if (pairedBefore.size) {
    let recovered = false;
    for (let n = 0; n < 120; n++) {
      const r = await pool.query(
        "SELECT count(*)::int n FROM whatsapp_sessions WHERE id=ANY($1::uuid[]) AND status='CONNECTED' AND connect_requested",
        [[...pairedBefore.keys()]],
      );
      if (r.rows[0].n === pairedBefore.size) {
        recovered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(recovered, true);
    const afterIdentities = await pairedIdentities();
    for (const [session, identity] of pairedBefore)
      assert.equal(afterIdentities.get(session), identity);
  }
  stage = "pid-change";
  const pidAfter = execFileSync(
    "systemctl",
    ["show", "taskpilot.service", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  assert.notEqual(pidBefore, pidAfter);
  stage = "other-services";
  const after = services();
  const otherServicesUnchanged =
    JSON.stringify(after) === JSON.stringify(before);
  stage = "data-preservation";
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM accounts) accounts,(SELECT count(*) FROM assignments) assignments,(SELECT count(*) FROM source_messages) messages",
      )
    ).rows,
    counts.rows,
  );
  stage = "startup";
  assert.equal(
    execFileSync("systemctl", ["is-enabled", "taskpilot.service"], {
      encoding: "utf8",
    }).trim(),
    "enabled",
  );
  console.log(
    JSON.stringify({
      runtimeRole: "least-privilege PASS",
      ddlDenied: true,
      migrationWriteDenied: true,
      restart: "PASS",
      dataPreserved: true,
      otherRunningServicesUnchanged: otherServicesUnchanged,
      addedServiceCount: after.filter((unit) => !before.includes(unit)).length,
      removedServiceCount: before.filter((unit) => !after.includes(unit))
        .length,
      overall: otherServicesUnchanged ? "PASS" : "EXTERNAL_SERVICE_DRIFT",
      startupEnabled: true,
      providerOutputDiscarded: true,
      whatsappContinuity: pairedBefore.size
        ? "same paired identity restored CONNECTED without QR"
        : "NOT_EXERCISED",
      recoveredPairedSessions: pairedBefore.size,
      release: execFileSync("readlink", ["/opt/taskpilot/current"], {
        encoding: "utf8",
      })
        .trim()
        .split("/")
        .at(-1),
    }),
  );
  if (!otherServicesUnchanged) {
    console.error("PILOT_VERIFICATION_EXTERNAL_SERVICE_DRIFT");
    process.exitCode = 2;
  }
} catch {
  console.error("PILOT_VERIFICATION_FAILED: " + stage);
  process.exitCode = 1;
} finally {
  await pool.end();
}
