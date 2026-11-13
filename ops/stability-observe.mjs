// Read-only bounded own-application observer. No raw logs, auth or identifiers.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import pg from "pg";
let pool;
try {
  const seconds = Number(process.argv[2] ?? 300);
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > 600)
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
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  const before = (
    await pool.query(
      "SELECT count(*)::int n FROM whatsapp_receipts WHERE accepted_at IS NOT NULL",
    )
  ).rows[0].n;
  const started = Date.now();
  let samples = 0,
    failed = 0,
    disconnected = 0,
    maxMemory = 0,
    pendingPeak = 0,
    errorPeak = 0;
  console.log(
    JSON.stringify({
      observation: "STARTED",
      seconds,
      scope: "own service only",
    }),
  );
  while (Date.now() - started < seconds * 1000) {
    samples++;
    try {
      const health = await fetch("http://127.0.0.1:8240/health", {
        signal: AbortSignal.timeout(5000),
      }).then((r) => r.json());
      if (health.status !== "ok") throw Error();
      const row = (
        await pool.query(
          "SELECT (SELECT count(*)::int FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested AND status='CONNECTED') connected,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='PENDING') pending,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='ERROR') errors",
        )
      ).rows[0];
      disconnected += row.connected !== 1 ? 1 : 0;
      pendingPeak = Math.max(pendingPeak, row.pending);
      errorPeak = Math.max(errorPeak, row.errors);
      const memory = Number(
        execFileSync(
          "systemctl",
          ["show", "taskpilot.service", "-p", "MemoryCurrent", "--value"],
          { encoding: "utf8" },
        ).trim(),
      );
      if (Number.isFinite(memory)) maxMemory = Math.max(maxMemory, memory);
    } catch {
      failed++;
    }
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(15000, Math.max(1, seconds * 1000 - (Date.now() - started))),
      ),
    );
  }
  const after = (
    await pool.query(
      "SELECT count(*)::int n FROM whatsapp_receipts WHERE accepted_at IS NOT NULL",
    )
  ).rows[0].n;
  const pendingFinal = (
    await pool.query(
      "SELECT count(*)::int n FROM whatsapp_ingress WHERE state='PENDING'",
    )
  ).rows[0].n;
  console.log(
    JSON.stringify({
      observation:
        failed || disconnected || errorPeak || pendingFinal ? "FAIL" : "PASS",
      seconds,
      samples,
      failedSamples: failed,
      disconnectedSamples: disconnected,
      maxMemoryBytes: maxMemory,
      pendingPeak,
      pendingFinal,
      errorPeak,
      acceptedReceiptDelta: after - before,
      scope: "bounded observation, not a sustained production guarantee",
    }),
  );
  if (failed || disconnected || errorPeak || pendingFinal) process.exitCode = 1;
} catch {
  console.error("STABILITY_OBSERVATION_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
