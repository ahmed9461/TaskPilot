import { startTaskReminders } from "./task-reminders.js";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { AiRuntime } from "./ai-runtime.js";
import { AssistantService } from "./assistant.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { startMockWorker } from "./outbox.js";
import { MockTransport } from "./transport.js";
import { Vault } from "./security.js";
import { WhatsAppConnector } from "./whatsapp/connector.js";
import { CommittedSendingPolicy } from "./sending-policy.js";
const secret = async (name: string) => {
  const path = process.env[`${name}_FILE`];
  if (!path) throw new Error(`MISSING_${name}_FILE`);
  return (await readFile(path, "utf8")).trim();
};

const host = process.env.TASKPILOT_BIND_HOST ?? "127.0.0.1";
if (!["127.0.0.1", "::1"].includes(host))
  throw new Error("LOOPBACK_REQUIRED_FOR_PILOT");
const pool = createPool(process.env.DATABASE_URL ?? "");
const encryptionKey = await secret("TASKPILOT_ENCRYPTION_KEY");
const ai = new AiRuntime(pool, new Vault(encryptionKey));
await ai.recoverInterrupted();
const assistant = new AssistantService(pool, ai);
await assistant.recoverInterrupted();
const whatsapp = new WhatsAppConnector(pool, new Vault(encryptionKey), {
  connectionEnabled: process.env.WHATSAPP_CONNECTION_ENABLED === "true",
  sendingEnabled: false,
});
const sendingPolicy = new CommittedSendingPolicy(
  whatsapp.connectionEnabled,
  () =>
    readFileSync(
      process.env.TASKPILOT_SENDING_POLICY_FILE ?? "/etc/taskpilot/pilot.env",
      "utf8",
    ),
  () =>
    readFileSync(
      process.env.TASKPILOT_SENDING_STATE_FILE ??
        "/etc/taskpilot/sending-state.json",
      "utf8",
    ),
);
whatsapp.setSendingPolicyGuard(() => sendingPolicy.current().enabled);
process.on("SIGHUP", () => {
  sendingPolicy.current(); // Wake/probe only; every send checks the durable decision directly.
});
const app = await createApp(
  pool,
  {
    apiToken: await secret("TASKPILOT_API_TOKEN"),
    reauthSecret: await secret("TASKPILOT_REAUTH_SECRET"),
    encryptionKey,
    mockEnabled: process.env.TASKPILOT_MOCK_ENABLED === "true",
    sendingPolicyReady: () => sendingPolicy.current().ready,
    sendingPolicyState: () => sendingPolicy.current(),
  },
  whatsapp,
  ai,
  assistant,
);
const stop = await startMockWorker(
  pool,
  new MockTransport(false),
  new Vault(encryptionKey),
);
// Recover interrupted live SENDING jobs even when live use is disabled.
// canSend keeps the worker dormant until both policy and session are ready.
const stopLive = await startMockWorker(
  pool,
  whatsapp,
  new Vault(encryptionKey),
);
if (!whatsapp.connectionEnabled)
  await pool.query(
    "UPDATE whatsapp_sessions SET status='STOPPED',last_error_code='WHATSAPP_POLICY_DISABLED' WHERE provider='baileys' AND status IN ('CONNECTING','CONNECTED','QR_AVAILABLE','RECONNECTING')",
  );
const stopIngress = whatsapp.startIngressWorker();
const stopAi = ai.startFallbackWorker();
const stopReminders = startTaskReminders(pool);
await app.listen({
  host,
  port: Number(process.env.TASKPILOT_BIND_PORT ?? 8240),
});
await whatsapp.restore();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    await stopIngress();
    await stopAi();
    await stopReminders();
    await stopLive();
    await stop();
    await whatsapp.close();
    await pool.end();
    process.exit(0);
  });
