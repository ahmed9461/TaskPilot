// Dedicated *_test database only. Two DB connections, one unique+replayed fictitious ingest/2s.
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile, rename } from "node:fs/promises";
import pg from "pg";
import { Vault } from "../dist/services/api/src/security.js";
import { Service } from "../dist/services/api/src/service.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL,
  seconds = Number(process.argv[2] ?? 1800),
  report = process.argv[3];
let pool,
  state,
  started,
  reportValidated = false,
  stage = "initialization";
try {
  if (
    !url ||
    !/^\/taskpilot_endurance_0[0-9]{2}_test$/.test(new URL(url).pathname) ||
    !Number.isInteger(seconds) ||
    seconds < 60 ||
    seconds > 7200 ||
    !/^\/var\/lib\/taskpilot\/soaks\/[a-z0-9_-]+\.json$/.test(report ?? "")
  )
    throw Error();
  reportValidated = true;
  pool = new pg.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  if (
    (await pool.query("SELECT count(*)::int n FROM whatsapp_sessions")).rows[0]
      .n
  )
    throw Error();
  const session = randomUUID(),
    types = [randomUUID(), randomUUID()],
    groups = [randomUUID(), randomUUID()];
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'Synthetic endurance','mock')",
    [session],
  );
  for (let i = 0; i < 2; i++) {
    await pool.query("INSERT INTO task_types(id,code,name) VALUES($1,$2,$3)", [
      types[i],
      "endurance_" + i,
      "Synthetic task " + i,
    ]);
    await pool.query(
      "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,$3,'Synthetic endurance',$4,'synthetic-endurance-070','soak-070')",
      [groups[i], session, "synthetic-" + i, types[i]],
    );
  }
  const vault = new Vault(
      JSON.stringify({
        format: "taskpilot-keyring-v1",
        active: 2,
        keys: { 2: randomBytes(32).toString("base64") },
      }),
    ),
    service = new Service(pool, vault),
    startedAt = Date.now();
  started = startedAt;
  state = {
    status: "RUNNING",
    seconds,
    elapsedSeconds: 0,
    rounds: 0,
    duplicates: 0,
    errors: 0,
    maxProcessRssBytes: 0,
    scope:
      "isolated synthetic core ingest/replay; two connections/one round per2s; no provider/API/AI; not capacity proof",
  };
  async function save() {
    state.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    await writeFile(report + ".tmp", JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
    await rename(report + ".tmp", report);
  }
  console.log(
    JSON.stringify({ load: "STARTED", seconds, dedicatedDatabase: true }),
  );
  await save();
  stage = "ingest";
  while (Date.now() - started < seconds * 1000) {
    const i = state.rounds,
      group = groups[Math.floor(i / 8) % 2];
    const input = {
      sessionId: session,
      groupId: group,
      externalMessageId: "synthetic-endurance-" + i,
      text: `name: Synthetic fixture\nuser: endurance-${i % 8}\npassword: synthetic-endurance-only`,
    };
    const results = await Promise.all([
      service.ingest(input),
      service.ingest(input),
    ]);
    if (results.filter((r) => r.duplicate).length !== 1) throw Error();
    state.rounds++;
    state.duplicates++;
    state.maxProcessRssBytes = Math.max(
      state.maxProcessRssBytes,
      process.memoryUsage().rss,
    );
    if (state.rounds % 15 === 0) await save();
    await new Promise((r) =>
      setTimeout(
        r,
        Math.min(2000, Math.max(1, seconds * 1000 - (Date.now() - started))),
      ),
    );
  }
  stage = "final-counts";
  const counts = (
    await pool.query(
      'SELECT (SELECT count(*)::int FROM accounts) accounts,(SELECT count(*)::int FROM assignments) assignments,(SELECT count(*)::int FROM source_messages) sources,(SELECT count(*)::int FROM reply_jobs) replies,(SELECT count(*)::int FROM account_credentials WHERE key_version=2) "encryptedCredentials"',
    )
  ).rows[0];
  if (
    counts.accounts !== 8 ||
    counts.assignments !== 16 ||
    counts.sources !== state.rounds ||
    counts.replies !== 0 ||
    counts.encryptedCredentials !== 8
  )
    throw Error();
  stage = "credential-aead";
  const rows = (
    await pool.query("SELECT account_id,ciphertext FROM account_credentials")
  ).rows;
  for (const row of rows)
    if (
      vault.open(row.ciphertext, `credential:${row.account_id}`) !==
      "synthetic-endurance-only"
    )
      throw Error();
  state.status = "PASS";
  Object.assign(state, counts, {
    encryptedCredentialsValid: true,
    providerConnections: 0,
    outboundMessages: 0,
  });
  await save();
  console.log(JSON.stringify(state));
} catch {
  if (state && reportValidated) {
    state.status = "FAIL";
    state.errors++;
    state.failureStage = stage;
    state.elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    await writeFile(report + ".tmp", JSON.stringify(state, null, 2), {
      mode: 0o600,
    });
    await rename(report + ".tmp", report);
  }
  console.error("ISOLATED_ENDURANCE_FAILED:" + stage);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
