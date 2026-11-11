import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import pg from "pg";
const env = Object.fromEntries(
  (await readFile("/etc/taskpilot/pilot.env", "utf8"))
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
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
  await assert.rejects(
    () => pool.query("CREATE TABLE forbidden_pilot_permission_check(id int)"),
    (e) => e.code === "42501",
  );
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
  const before = services();
  const counts = await pool.query(
    "SELECT (SELECT count(*) FROM accounts) accounts,(SELECT count(*) FROM assignments) assignments,(SELECT count(*) FROM source_messages) messages",
  );
  const pidBefore = execFileSync(
    "systemctl",
    ["show", "taskpilot.service", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  execFileSync("systemctl", ["restart", "taskpilot.service"]);
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      ready = (await fetch("http://127.0.0.1:8240/health")).ok;
      if (ready) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(ready, true);
  const pidAfter = execFileSync(
    "systemctl",
    ["show", "taskpilot.service", "-p", "MainPID", "--value"],
    { encoding: "utf8" },
  ).trim();
  assert.notEqual(pidBefore, pidAfter);
  assert.deepEqual(services(), before);
  assert.deepEqual(
    (
      await pool.query(
        "SELECT (SELECT count(*) FROM accounts) accounts,(SELECT count(*) FROM assignments) assignments,(SELECT count(*) FROM source_messages) messages",
      )
    ).rows,
    counts.rows,
  );
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
      otherRunningServicesUnchanged: true,
      startupEnabled: true,
      release: execFileSync("readlink", ["/opt/taskpilot/current"], {
        encoding: "utf8",
      })
        .trim()
        .split("/")
        .at(-1),
    }),
  );
} catch {
  console.error("PILOT_VERIFICATION_FAILED");
  process.exitCode = 1;
} finally {
  await pool.end();
}
