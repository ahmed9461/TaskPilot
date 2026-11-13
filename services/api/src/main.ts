import { readFile } from "node:fs/promises";
import { createPool } from "./db.js";
import { createApp } from "./app.js";
import { startMockWorker } from "./outbox.js";
import { MockTransport } from "./transport.js";
import { Vault } from "./security.js";
import { WhatsAppConnector } from "./whatsapp/connector.js";
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
const whatsapp = new WhatsAppConnector(pool, new Vault(encryptionKey), {
  connectionEnabled: process.env.WHATSAPP_CONNECTION_ENABLED === "true",
  sendingEnabled: process.env.WHATSAPP_SENDING_ENABLED === "true",
});
const app = await createApp(
  pool,
  {
    apiToken: await secret("TASKPILOT_API_TOKEN"),
    reauthSecret: await secret("TASKPILOT_REAUTH_SECRET"),
    encryptionKey,
    mockEnabled: process.env.TASKPILOT_MOCK_ENABLED === "true",
  },
  whatsapp,
);
const stop = await startMockWorker(pool, new MockTransport());
// Recover interrupted live SENDING jobs even when live use is disabled.
// canSend keeps the worker dormant until both policy and session are ready.
const stopLive = await startMockWorker(pool, whatsapp);
if (!whatsapp.connectionEnabled)
  await pool.query(
    "UPDATE whatsapp_sessions SET status='STOPPED',last_error_code='WHATSAPP_POLICY_DISABLED' WHERE provider='baileys' AND status IN ('CONNECTING','CONNECTED','QR_AVAILABLE','RECONNECTING')",
  );
const stopIngress = whatsapp.startIngressWorker();
await app.listen({
  host,
  port: Number(process.env.TASKPILOT_BIND_PORT ?? 8240),
});
await whatsapp.restore();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    await stopIngress();
    await stopLive();
    await stop();
    await whatsapp.close();
    await pool.end();
    process.exit(0);
  });
