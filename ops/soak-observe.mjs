// Root-only read-only observer. Private aggregate checkpoint survives a lost SSH client.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import pg from "pg";
const seconds = Number(process.argv[2] ?? 3600);
const report = process.argv[3];
let pool;
try {
  if (
    process.getuid?.() !== 0 ||
    !Number.isInteger(seconds) ||
    seconds < 60 ||
    seconds > 86400 ||
    !/^\/var\/lib\/taskpilot\/soaks\/[a-z0-9_-]+\.json$/.test(report ?? "")
  )
    throw Error();
  await mkdir("/var/lib/taskpilot/soaks", { recursive: true, mode: 0o700 });
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
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const baseline = Number(
    execFileSync(
      "systemctl",
      ["show", "taskpilot.service", "-p", "MainPID", "--value"],
      { encoding: "utf8" },
    ).trim(),
  );
  if (!baseline) throw Error();
  const started = Date.now();
  const state = {
    status: "RUNNING",
    startedAt: new Date(started).toISOString(),
    plannedSeconds: seconds,
    elapsedSeconds: 0,
    samples: 0,
    failedSamples: 0,
    disconnectedSamples: 0,
    pidChanges: 0,
    pendingPeak: 0,
    pendingFinal: 0,
    errorPeak: 0,
    unsettledLiveReplyPeak: 0,
    maxMemoryBytes: 0,
    minMemoryBytes: 0,
    acceptedWithoutIngressPeak: 0,
    scope:
      "own service read-only; quiet live connection and concurrent separately recorded synthetic/native tests; not capacity or 24-hour proof",
  };
  async function save() {
    state.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    await writeFile(report + ".tmp", JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
    await rename(report + ".tmp", report);
  }
  await save();
  console.log(JSON.stringify({ soak: "STARTED", plannedSeconds: seconds }));
  while (Date.now() - started < seconds * 1000) {
    state.samples++;
    try {
      const response = await fetch("http://127.0.0.1:8240/health", {
        signal: AbortSignal.timeout(5000),
      });
      const health = await response.json();
      if (!response.ok || health.status !== "ok") throw Error();
      const row = (
        await pool.query(
          "SELECT (SELECT count(*)::int FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested AND status='CONNECTED') connected,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='PENDING') pending,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='ERROR') errors,(SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')) unsettled,(SELECT count(*)::int FROM whatsapp_receipts r WHERE accepted_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_ingress i WHERE i.session_id=r.session_id AND i.group_id=r.group_id AND encode(sha256(convert_to(i.external_message_id,'UTF8')),'hex')=r.message_hash)) gaps",
        )
      ).rows[0];
      state.disconnectedSamples += row.connected !== 1 ? 1 : 0;
      state.pendingPeak = Math.max(state.pendingPeak, row.pending);
      state.pendingFinal = row.pending;
      state.errorPeak = Math.max(state.errorPeak, row.errors);
      state.unsettledLiveReplyPeak = Math.max(
        state.unsettledLiveReplyPeak,
        row.unsettled,
      );
      state.acceptedWithoutIngressPeak = Math.max(
        state.acceptedWithoutIngressPeak,
        row.gaps,
      );
      const info = Object.fromEntries(
        execFileSync(
          "systemctl",
          ["show", "taskpilot.service", "-p", "MainPID", "-p", "MemoryCurrent"],
          { encoding: "utf8" },
        )
          .trim()
          .split("\n")
          .map((l) => l.split("=")),
      );
      state.pidChanges += Number(info.MainPID) !== baseline ? 1 : 0;
      const memory = Number(info.MemoryCurrent);
      if (Number.isFinite(memory) && memory > 0) {
        state.maxMemoryBytes = Math.max(state.maxMemoryBytes, memory);
        state.minMemoryBytes = state.minMemoryBytes
          ? Math.min(state.minMemoryBytes, memory)
          : memory;
      }
    } catch {
      state.failedSamples++;
    }
    if (state.samples % 4 === 0) await save();
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(15000, Math.max(1, seconds * 1000 - (Date.now() - started))),
      ),
    );
  }
  state.status =
    state.failedSamples ||
    state.disconnectedSamples ||
    state.pidChanges ||
    state.errorPeak ||
    state.unsettledLiveReplyPeak ||
    state.pendingFinal ||
    state.acceptedWithoutIngressPeak
      ? "FAIL"
      : "PASS";
  await save();
  console.log(JSON.stringify(state));
  if (state.status !== "PASS") process.exitCode = 1;
} catch {
  console.error("SOAK_OBSERVATION_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
