// Runs only inside the isolated restore container. Key arrives on stdin, never
// through argv, environment, files or Docker logs. Output is fixed aggregates.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createPool } from "../dist/services/api/src/db.js";
import { createApp } from "../dist/services/api/src/app.js";
import { matchesMigration } from "../dist/services/api/src/migrate.js";
import { AiRuntime } from "../dist/services/api/src/ai-runtime.js";
import { Vault } from "../dist/services/api/src/security.js";
import { WhatsAppConnector } from "../dist/services/api/src/whatsapp/connector.js";
import { startMockWorker } from "../dist/services/api/src/outbox.js";
import { MockTransport } from "../dist/services/api/src/transport.js";

let stage = "isolation",
  pool,
  app,
  whatsapp;
const stops = [];
let providerConnections = 0,
  aiCalls = 0;
try {
  assert.equal(process.platform, "linux");
  assert.equal(process.env.TASKPILOT_ISOLATED_RECOVERY, "1");
  const interfaces = networkInterfaces();
  assert.ok(Object.keys(interfaces).length > 0);
  assert.ok(
    Object.entries(interfaces).every(
      ([name, addresses]) =>
        name === "lo" && addresses.every((address) => address.internal),
    ),
  );
  stage = "private-input";
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 131072) throw Error();
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const keys = JSON.parse(input.toString());
  input.fill(0);
  for (const chunk of chunks) chunk.fill(0);
  assert.deepEqual(Object.keys(keys), ["encryptionKey"]);
  const vault = new Vault(keys.encryptionKey);
  pool = createPool(
    "postgresql://taskpilot@127.0.0.1:5432/taskpilot_offhost_restore_test",
  );
  assert.equal(
    (await pool.query("SELECT current_database() db")).rows[0].db,
    "taskpilot_offhost_restore_test",
  );
  stage = "migration-integrity";
  const dir = new URL("../dist/services/api/migrations/", import.meta.url);
  const migrations = (await readdir(dir))
    .filter((x) => x.endsWith(".sql"))
    .sort();
  const recorded = (
    await pool.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  assert.equal(migrations.length, 15);
  assert.deepEqual(
    recorded.map((x) => x.name),
    migrations,
  );
  for (const row of recorded)
    assert.ok(
      matchesMigration(
        await readFile(new URL(row.name, dir), "utf8"),
        row.checksum,
      ),
    );

  const counts = async () =>
    (
      await pool.query(`SELECT
    (SELECT count(*)::int FROM accounts) accounts,
    (SELECT count(*)::int FROM assignments) tasks,
    (SELECT count(*)::int FROM reply_jobs WHERE status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')) unsettled,
    (SELECT count(*)::int FROM whatsapp_ingress WHERE state='PENDING') pending`)
    ).rows[0];
  const owner = async () => {
    const rows = (
      await pool.query(
        "SELECT session_id,category,id_hash,encrypted_payload FROM whatsapp_auth ORDER BY session_id,category,id_hash",
      )
    ).rows;
    for (const row of rows)
      JSON.parse(
        vault.open(
          row.encrypted_payload,
          `wa-auth:${row.session_id}:${row.category}:${row.id_hash}`,
        ),
      );
    const totals = (
      await pool.query(`SELECT
      (SELECT count(*)::int FROM source_messages m JOIN whatsapp_sessions s ON s.id=m.session_id WHERE s.provider='baileys') sources,
      (SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status='SENT') sent`)
    ).rows[0];
    return {
      auth: rows.length,
      digest: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      ...totals,
    };
  };
  stage = "restored-baseline";
  const before = await counts(),
    ownerBefore = await owner();
  assert.equal(before.unsettled, 0);
  assert.equal(before.pending, 0);
  assert.ok(before.accounts >= 0 && before.tasks >= 0 && ownerBefore.auth > 0);
  const forbiddenAi = () => {
    aiCalls++;
    throw Error("RECOVERY_AI_FORBIDDEN");
  };
  const ai = new AiRuntime(pool, vault, forbiddenAi, forbiddenAi);
  whatsapp = new WhatsAppConnector(
    pool,
    vault,
    { connectionEnabled: false, sendingEnabled: false },
    async () => {
      providerConnections++;
      throw Error("RECOVERY_SOCKET_FORBIDDEN");
    },
  );
  stage = "application-startup";
  await ai.recoverInterrupted();
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: keys.encryptionKey,
    mockEnabled: true,
  };
  app = await createApp(pool, config, whatsapp, ai);
  const mock = new MockTransport();
  stops.push(await startMockWorker(pool, mock));
  stops.push(await startMockWorker(pool, whatsapp));
  await pool.query(
    "UPDATE whatsapp_sessions SET status='STOPPED',last_error_code='WHATSAPP_POLICY_DISABLED' WHERE provider='baileys' AND status IN ('CONNECTING','CONNECTED','QR_AVAILABLE','RECONNECTING')",
  );
  stops.push(whatsapp.startIngressWorker());
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  await whatsapp.restore();
  const api = async (
    method,
    path,
    body,
    sensitive = false,
    auth = true,
    expected = 200,
  ) => {
    const response = await fetch(base + path, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${config.apiToken}` } : {}),
        ...(sensitive ? { "x-reauth-secret": config.reauthSecret } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, expected, "RESTORED_HTTP_STATUS");
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  };
  const release = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    (await api("GET", "/health", undefined, false, false)).version,
    release.version,
  );
  await api("GET", "/ready", undefined, false, false, 401);
  assert.equal((await api("GET", "/ready")).status, "ready");
  await api("GET", "/v1/dashboard");
  assert.equal(
    (await api("GET", "/v1/accounts?limit=1")).length,
    Math.min(1, before.accounts),
  );

  stage = "restored-business-workflow";
  const suffix = randomUUID(),
    namespace = "synthetic-recovery-" + suffix;
  const session = await api("POST", "/v1/sessions", {
    label: "Synthetic isolated recovery",
  });
  const task = await api("POST", "/v1/task-types", {
    code: namespace,
    name: "Synthetic recovery task",
  });
  const group = await api("POST", "/v1/groups", {
    sessionId: session.id,
    externalGroupId: suffix,
    title: "Synthetic recovery group",
    taskTypeId: task.id,
    namespace,
    periodKey: "083",
  });
  const message = {
    sessionId: session.id,
    groupId: group.id,
    externalMessageId: suffix,
    text: "name: Synthetic recovered account\ruser: recovery-owner-test\rpassword: synthetic-recovery-only",
  };
  stage = "mock-message";
  const received = await api("POST", "/v1/mock/messages", message);
  assert.equal(received.state, "PROCESSED");
  assert.equal(
    (await api("POST", "/v1/mock/messages", message)).duplicate,
    true,
  );
  stage = "task-lookup";
  const assignments = await api(
    "GET",
    "/v1/assignments?search=recovery-owner-test",
  );
  const assignment = assignments.find((x) => x.id === received.assignmentId);
  assert.ok(assignment);
  stage = "task-completion";
  await api("PATCH", `/v1/assignments/${assignment.id}/status`, {
    version: assignment.version,
    status: "COMPLETED",
  });
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM reply_jobs WHERE assignment_id=$1",
        [assignment.id],
      )
    ).rows[0].n,
    0,
  );
  stage = "masked-account-read";
  const masked = await api("GET", "/v1/accounts?search=recovery-owner-test");
  assert.equal(masked.length, 1);
  assert.equal(
    JSON.stringify(masked).includes("synthetic-recovery-only"),
    false,
  );
  stage = "mock-reply-preview";
  const template = await api("POST", "/v1/reply-templates", {
    code: namespace,
    body: "Synthetic completion {taskName}",
  });
  const preview = await api("POST", "/v1/reply-jobs/preview", {
    assignmentId: assignment.id,
    sourceMessageId: received.id,
    templateId: template.id,
  });
  const approval = {
    approvalToken: preview.approvalToken,
    idempotencyKey: namespace,
  };
  stage = "mock-reply-approval";
  const job = await api("POST", "/v1/reply-jobs/approve", approval, true);
  stage = "mock-reply-dispatch";
  for (let i = 0; ; i++) {
    if (
      (await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [job.id]))
        .rows[0]?.status === "SENT"
    )
      break;
    if (i >= 100) throw Error("MOCK_DISPATCH_TIMEOUT");
    await delay(100);
  }
  stage = "approval-replay";
  assert.equal(
    (await api("POST", "/v1/reply-jobs/approve", approval, true, true, 409))
      .code,
    "APPROVAL_EXPIRED_OR_CONSUMED",
  );
  const nextPreview = await api("POST", "/v1/reply-jobs/preview", {
    assignmentId: assignment.id,
    sourceMessageId: received.id,
    templateId: template.id,
  });
  assert.equal(
    (
      await api(
        "POST",
        "/v1/reply-jobs/approve",
        {
          approvalToken: nextPreview.approvalToken,
          idempotencyKey: namespace,
        },
        true,
      )
    ).id,
    job.id,
  );
  assert.equal(mock.sent.length, 1);
  assert.equal(mock.sent[0].sourceMessageId, received.id);
  stage = "restored-invariants";
  assert.equal(providerConnections, 0);
  assert.equal(aiCalls, 0);
  assert.deepEqual(await owner(), ownerBefore);
  const after = await counts();
  assert.deepEqual(after, {
    accounts: before.accounts + 1,
    tasks: before.tasks + 1,
    unsettled: 0,
    pending: 0,
  });
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM source_messages WHERE group_id=$1",
        [group.id],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    JSON.stringify({
      application: "PASS",
      apiVersion: release.version,
      migrations: migrations.length,
      restoredAccounts: before.accounts,
      restoredTasks: before.tasks,
      restoredAuth: ownerBefore.auth,
      actualIdentityCiphertextUnchanged: true,
      apiListen: "isolated loopback only",
      networkInterfaces: "loopback only",
      httpAuth: "PASS",
      maskedReads: "PASS",
      mockIngestion: "PASS",
      duplicateInserted: 0,
      completionWithoutAutomaticReply: true,
      mockReplies: 1,
      approvalReplayExtraReplies: 0,
      providerConnections,
      externalMessages: 0,
      aiCalls,
      schemaWrites: 0,
      originalApiKeysUsed: false,
      originalWindowsProfileUsed: false,
    }),
  );
} catch {
  console.error("RECOVERED_APPLICATION_CHECK_FAILED:" + stage);
  process.exitCode = 1;
} finally {
  try {
    await app?.close();
    for (const stop of stops.reverse()) await stop();
    await whatsapp?.close();
    await pool?.end();
  } catch {
    console.error("RECOVERED_APPLICATION_STOP_FAILED");
    process.exitCode = 1;
  }
}
