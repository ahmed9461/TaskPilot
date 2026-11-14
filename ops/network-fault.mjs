// Explicit root-only TaskPilot cgroup fault. No global firewall, restart or message send.
import { readFile, writeFile, rename, mkdir, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const unit = "taskpilot.service";
const run = "network-" + new Date().toISOString().replace(/\D/g, "");
const watchdog = "taskpilot-network-restore-" + run.slice(8);
const report = "/var/lib/taskpilot/network-tests/" + run + ".json";
let pool,
  restoreNeeded = false,
  timerCreated = false,
  baseline,
  identities;
const state = {
  status: "PREFLIGHT",
  heldSeconds: 90,
  samples: 0,
  apiFailures: 0,
  pidChanges: 0,
  disconnectedObserved: false,
  transitions: [],
  scope:
    "TaskPilot cgroup only; no new WhatsApp message, API/provider capacity, host reboot or 24h acceptance",
};
const command = (name, args) =>
  execFileSync(name, args, {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const properties = () =>
  command("systemctl", [
    "show",
    unit,
    "-p",
    "IPAddressAllow",
    "-p",
    "IPAddressDeny",
  ]);
const pid = () =>
  command("systemctl", ["show", unit, "-p", "MainPID", "--value"]);
const clear = () =>
  command("systemctl", [
    "set-property",
    "--runtime",
    unit,
    "IPAddressAllow=",
    "IPAddressDeny=",
  ]);
const save = async () => {
  await writeFile(report + ".tmp", JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
  await rename(report + ".tmp", report);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const counts = async () =>
  await pool
    .query(
      `SELECT
  (SELECT count(*)::int FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE g.enabled AND s.provider='baileys') groups,
  (SELECT count(*)::int FROM source_messages m JOIN whatsapp_sessions s ON s.id=m.session_id WHERE s.provider='baileys') sources,
  (SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status='SENT') sent,
  (SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')) unsettled,
  (SELECT count(*)::int FROM whatsapp_ingress WHERE state IN ('PENDING','ERROR')) queued,
  (SELECT count(*)::int FROM accounts) accounts,
  (SELECT count(*)::int FROM assignments) assignments`,
    )
    .then((r) => r.rows[0]);
const sessionState = async () => {
  const rows = (
    await pool.query(
      "SELECT status FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested",
    )
  ).rows;
  if (rows.length !== 1) return "NOT_REQUESTED";
  return [
    "CONNECTED",
    "RECONNECTING",
    "CONNECTING",
    "ERROR",
    "REAUTH_REQUIRED",
    "STOPPED",
  ].includes(rows[0].status)
    ? rows[0].status
    : "OTHER";
};
const health = async () => {
  const r = await fetch("http://127.0.0.1:8240/health", {
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok || (await r.json()).status !== "ok") throw Error();
};
try {
  if (
    process.getuid?.() !== 0 ||
    process.argv.length !== 3 ||
    !["--preflight", "--apply"].includes(process.argv[2])
  )
    throw Error();
  const release = await realpath("/opt/taskpilot/current");
  if (
    !/^\/opt\/taskpilot\/releases\/[a-f0-9]{40}$/.test(release) ||
    JSON.parse(await readFile(release + "/package.json", "utf8")).version !==
      "0.7.0"
  )
    throw Error();
  const env = Object.fromEntries(
    (await readFile("/etc/taskpilot/pilot.env", "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
  if (
    env.WHATSAPP_CONNECTION_ENABLED !== "true" ||
    env.WHATSAPP_SENDING_ENABLED !== "false"
  )
    throw Error();
  const { default: pg } = await import(
    pathToFileURL(release + "/node_modules/pg/lib/index.js")
  );
  const { Vault } = await import(
    pathToFileURL(release + "/dist/services/api/src/security.js")
  );
  const vault = new Vault(
    (await readFile(env.TASKPILOT_ENCRYPTION_KEY_FILE, "utf8")).trim(),
  );
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  if (
    !(await pool.query("SELECT pg_try_advisory_lock(8240009) locked")).rows[0]
      .locked
  )
    throw Error();
  const auth = async () => {
    const rows = (
      await pool.query(
        "SELECT session_id,category,id_hash,encrypted_payload FROM whatsapp_auth",
      )
    ).rows;
    const ids = [];
    for (const r of rows) {
      const value = JSON.parse(
        vault.open(
          r.encrypted_payload,
          `wa-auth:${r.session_id}:${r.category}:${r.id_hash}`,
        ),
      );
      if (r.category === "creds" && typeof value.me?.id === "string")
        ids.push(value.me.id);
    }
    if (ids.length !== 1 || !rows.length) throw Error();
    return { rows: rows.length, ids: ids.sort().join("\n") };
  };
  const beforeAuth = await auth();
  identities = beforeAuth.ids;
  baseline = { pid: pid(), filters: properties(), counts: await counts() };
  if (
    !/^[1-9]\d*$/.test(baseline.pid) ||
    baseline.filters.split("\n").some((l) => l.split("=").slice(1).join("=")) ||
    baseline.counts.groups !== 1 ||
    baseline.counts.unsettled ||
    baseline.counts.queued ||
    (await sessionState()) !== "CONNECTED"
  )
    throw Error();
  await health();
  state.before = baseline.counts;
  state.authRowsBefore = beforeAuth.rows;
  if (process.argv[2] === "--preflight") {
    console.log(
      JSON.stringify({
        status: "PREFLIGHT_PASS",
        ownFiltersEmpty: true,
        sendingEnabled: false,
        authValid: true,
        authRows: beforeAuth.rows,
        counts: baseline.counts,
      }),
    );
  } else {
    await mkdir("/var/lib/taskpilot/network-tests", {
      recursive: true,
      mode: 0o700,
    });
    await save();
    // Independent systemd timer restores even if SSH/this operator disappears.
    command("systemd-run", [
      "--quiet",
      "--collect",
      "--unit=" + watchdog,
      "--on-active=125s",
      "--timer-property=AccuracySec=1s",
      "/usr/bin/systemctl",
      "set-property",
      "--runtime",
      unit,
      "IPAddressAllow=",
      "IPAddressDeny=",
    ]);
    timerCreated = true;
    if (command("systemctl", ["is-active", watchdog + ".timer"]) !== "active")
      throw Error();
    restoreNeeded = true;
    command("systemctl", [
      "set-property",
      "--runtime",
      unit,
      "IPAddressAllow=localhost",
      "IPAddressDeny=any",
    ]);
    state.status = "BLOCKED";
    await save();
    console.log(
      JSON.stringify({
        phase: "BLOCKED",
        seconds: 90,
        watchdogSeconds: 125,
        sendingEnabled: false,
      }),
    );
    const started = Date.now();
    while (Date.now() - started < 90000) {
      try {
        await health();
      } catch {
        state.apiFailures++;
      }
      if (pid() !== baseline.pid) state.pidChanges++;
      const s = await sessionState();
      if (s !== "CONNECTED") state.disconnectedObserved = true;
      if (state.transitions.at(-1)?.status !== s)
        state.transitions.push({
          seconds: Math.floor((Date.now() - started) / 1000),
          status: s,
        });
      state.samples++;
      await save();
      if (state.samples % 3 === 0)
        console.log(
          JSON.stringify({
            phase: "BLOCKED",
            elapsedSeconds: Math.floor((Date.now() - started) / 1000),
            sessionStatus: s,
            apiFailures: state.apiFailures,
          }),
        );
      await sleep(Math.min(5000, Math.max(1, 90000 - (Date.now() - started))));
    }
    clear();
    restoreNeeded = false;
    if (properties() !== baseline.filters) throw Error();
    state.runtimeFiltersRestored = true;
    state.status = "RECOVERING";
    await save();
    const recovered = Date.now();
    while (
      (await sessionState()) !== "CONNECTED" &&
      Date.now() - recovered < 90000
    )
      await sleep(2000);
    state.recoverySeconds = Math.floor((Date.now() - recovered) / 1000);
    state.connectedAfter = (await sessionState()) === "CONNECTED";
    const afterAuth = await auth();
    state.sameIdentity = identities === afterAuth.ids;
    state.authRowsAfter = afterAuth.rows;
    state.encryptedAuthValid = true;
    state.after = await counts();
    state.samePid = pid() === baseline.pid;
    await health();
    if (
      !state.disconnectedObserved ||
      !state.connectedAfter ||
      !state.sameIdentity ||
      !state.samePid ||
      state.apiFailures ||
      state.pidChanges ||
      JSON.stringify(state.before) !== JSON.stringify(state.after)
    )
      throw Error();
    state.status = "PASS";
    await save();
    console.log(JSON.stringify(state));
  }
} catch {
  state.status = "FAIL";
  if (baseline && process.argv[2] === "--apply") await save().catch(() => {});
  console.error("TASKPILOT_NETWORK_FAULT_FAILED");
  process.exitCode = 1;
} finally {
  if (restoreNeeded) {
    try {
      clear();
      state.runtimeFiltersRestored = properties() === baseline.filters;
    } catch {
      state.runtimeFiltersRestored = false;
    }
    await save().catch(() => {});
  }
  if (timerCreated && state.runtimeFiltersRestored) {
    try {
      command("systemctl", ["stop", watchdog + ".timer"]);
    } catch {
      /* Timer may already have elapsed. */
    }
  }
  await pool?.end();
}
