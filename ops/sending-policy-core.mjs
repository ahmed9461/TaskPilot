// Privileged, fixed-command SSH control. No HTTP mutation or credentials in argv.
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  lstat,
  readdir,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import {
  parseSendingPolicy,
  replaceSendingPolicy,
  applySendingPolicy,
} from "../dist/services/api/src/sending-policy.js";
import { transaction, event } from "../dist/services/api/src/db.js";
import { durableReplace, journalStamp } from "./durable-policy.mjs";
import { CommittedSendingPolicy } from "../dist/services/api/src/sending-policy.js";

const digest = (text) => createHash("sha256").update(text).digest("hex");
const phrase = (enabled) => (enabled ? "تفعيل الردود اليدوية" : "إيقاف الردود");
const fail = (code) => {
  throw Error(code);
};

// Dependency boundary permits isolated file/DB acceptance without production signals.
export async function executeSendingPolicy(
  p,
  {
    envPath,
    directory,
    health,
    signal,
    stop,
    owner = 0,
    statePath = envPath + ".sending-state.json",
    checkpoint = async () => {},
  },
) {
  let pool, lease;
  let actorId;
  async function observe() {
    const h = await health();
    if (!h || h.version !== 2 || typeof h.enabled !== "boolean")
      fail("SENDING_POLICY_UNAVAILABLE");
    return h;
  }
  async function envFile() {
    const stat = await lstat(envPath);
    if (!stat.isFile() || stat.uid !== owner || stat.mode & 0o022)
      fail("SENDING_POLICY_UNAVAILABLE");
    const text = await readFile(envPath, "utf8");
    const parsed = parseSendingPolicy(text);
    return { text, stat, parsed };
  }
  async function snapshot() {
    const sessions = (
      await lease.query(
        "SELECT id,status,connect_requested FROM whatsapp_sessions WHERE provider='baileys' ORDER BY id",
      )
    ).rows;
    const groups = (
      await lease.query(
        "SELECT g.id,g.version,g.enabled,g.session_id FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE s.provider='baileys' ORDER BY g.id",
      )
    ).rows;
    const jobs = (
      await lease.query(
        "SELECT r.id,r.status FROM reply_jobs r JOIN whatsapp_sessions s ON s.id=r.session_id WHERE s.provider='baileys' AND r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY') ORDER BY r.id",
      )
    ).rows;
    const connected = sessions
      .filter((s) => s.status === "CONNECTED" && s.connect_requested)
      .map((s) => s.id);
    return {
      hash: digest(JSON.stringify({ sessions, groups, jobs })),
      connected: connected.length,
      groups: groups.filter(
        (g) => g.enabled && connected.includes(g.session_id),
      ).length,
      unsettled: jobs.length,
    };
  }
  async function apply(enabled) {
    let previousOperationId,
      operationId,
      recovery = false;
    async function store(phase, value) {
      const file = await envFile();
      if (phase === "COMMITTED" && file.parsed.sending !== value)
        fail("SENDING_POLICY_STALE");
      await durableReplace(
        statePath,
        JSON.stringify({
          version: 1,
          phase,
          operationId,
          previousOperationId,
          enabled: value,
          envHash: digest(file.text),
          actorId,
          recovery,
          recordedAt: new Date().toISOString(),
        }),
        { ...file.stat, mode: 0o640 },
      );
    }
    await applySendingPolicy(enabled, {
      async prepare(value) {
        const previous = await journalStamp(statePath, owner);
        let parsed;
        try {
          parsed = JSON.parse(previous.text);
        } catch {}
        previousOperationId = parsed?.operationId ?? null;
        recovery = !!operationId || parsed?.phase !== "COMMITTED";
        operationId = randomUUID();
        await store("PENDING", value);
        await checkpoint("PENDING_DURABLE");
      },
      async write(value) {
        const file = await envFile();
        await durableReplace(
          envPath,
          replaceSendingPolicy(file.text, value),
          file.stat,
        );
        await checkpoint("ENV_DURABLE");
      },
      async authorize() {
        await transaction(pool, (c) =>
          event(c, "LIVE_SENDING_CHANGE_AUTHORIZED", operationId),
        );
        await checkpoint("AUTHORIZATION_DURABLE");
      },
      async commit(value) {
        await store("COMMITTED", value);
        await checkpoint("COMMIT_DURABLE");
      },
      signal,
      async verify(value) {
        for (let n = 0; n < 20; n++) {
          const h = await observe();
          if (
            h.ready &&
            h.enabled === value &&
            h.phase === "COMMITTED" &&
            h.operationId === operationId
          ) {
            await checkpoint("ACK_VERIFIED");
            return true;
          }
          await delay(250);
        }
        return false;
      },
      stop,
    });
  }
  async function run() {
    if (
      !p ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      !["preview", "apply", "discard"].includes(p.action) ||
      typeof p.clientToken !== "string" ||
      p.clientToken.length < 32 ||
      p.clientToken.length > 256
    )
      fail("SENDING_POLICY_INVALID");
    const file = await envFile();
    const lines = file.text
      .split(/\r?\n/)
      .filter((x) => x.startsWith("DATABASE_URL="));
    if (lines.length !== 1) fail("SENDING_POLICY_UNAVAILABLE");
    pool = new pg.Pool({
      connectionString: lines[0].slice(13),
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
    lease = await pool.connect();
    if (
      !(await lease.query("SELECT pg_try_advisory_lock(8240008) locked"))
        .rows[0].locked
    )
      fail("SENDING_POLICY_BUSY");
    const client = (
      await lease.query(
        "SELECT id FROM client_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()",
        [digest(p.clientToken)],
      )
    ).rows[0];
    if (!client) fail("SESSION_EXPIRED");
    actorId = client.id;
    const journal = await journalStamp(statePath, owner);
    const persisted = new CommittedSendingPolicy(
      true,
      () => file.text,
      () => journal.text,
    ).current();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const ds = await lstat(directory);
    if (!ds.isDirectory() || ds.uid !== owner || ds.mode & 0o077)
      fail("SENDING_POLICY_UNAVAILABLE");
    if (p.action === "preview") {
      if (typeof p.enabled !== "boolean") fail("SENDING_POLICY_INVALID");
      const effective = await observe();
      if (
        p.enabled &&
        (persisted.phase !== "COMMITTED" ||
          persisted.recoveryRequired ||
          !effective.ready ||
          effective.phase !== "COMMITTED" ||
          effective.operationId !== persisted.operationId ||
          effective.enabled !== file.parsed.sending)
      )
        fail("SENDING_POLICY_RECOVERY_REQUIRED");
      const state = await snapshot();
      if (
        p.enabled &&
        (!file.parsed.connection ||
          state.connected !== 1 ||
          state.groups < 1 ||
          state.unsettled > 0)
      )
        fail("SENDING_POLICY_NOT_SAFE");
      // Expired UUID previews only; never traverse or remove other files.
      for (const name of await readdir(directory)) {
        if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
        const path = directory + "/" + name,
          stat = await lstat(path);
        if (stat.isFile() && Date.now() - stat.mtimeMs > 120000)
          await unlink(path);
      }
      const token = randomUUID();
      await writeFile(
        directory + "/" + token + ".json",
        JSON.stringify({
          clientId: client.id,
          enabled: p.enabled,
          envHash: digest(file.text),
          policyHash: journal.hash,
          stateHash: state.hash,
          expiresAt: Date.now() + 60000,
        }),
        { flag: "wx", mode: 0o600 },
      );
      return {
        token,
        enabled: p.enabled,
        currentEnabled: effective.enabled,
        phase: effective.phase,
        confirmation: phrase(p.enabled),
        expiresInSeconds: 60,
        connected: state.connected,
        groups: state.groups,
        unsettled: state.unsettled,
      };
    }
    if (typeof p.token !== "string" || !/^[a-f0-9-]{36}$/.test(p.token))
      fail("SENDING_POLICY_STALE");
    const path = directory + "/" + p.token + ".json";
    const ps = await lstat(path);
    if (!ps.isFile() || ps.uid !== owner || ps.mode & 0o077)
      fail("SENDING_POLICY_STALE");
    const preview = JSON.parse(await readFile(path, "utf8"));
    if (preview.clientId !== client.id) fail("SENDING_POLICY_STALE");
    if (p.action === "discard") {
      await unlink(path);
      return { discarded: true };
    }
    if (typeof p.reauth !== "string" || p.reauth.length > 256)
      fail("REAUTH_REQUIRED");
    if (
      !(
        await lease.query(
          "UPDATE client_sessions SET reauth_hash=NULL,reauth_expires_at=NULL WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() AND reauth_hash=$2 AND reauth_expires_at>now() RETURNING id",
          [client.id, digest(p.reauth)],
        )
      ).rowCount
    )
      fail("REAUTH_REQUIRED");
    await unlink(path); // Single-use even if a subsequent check fails.
    if (
      preview.expiresAt < Date.now() ||
      preview.envHash !== digest(file.text) ||
      preview.policyHash !== journal.hash ||
      preview.stateHash !== (await snapshot()).hash ||
      p.confirmation !== phrase(preview.enabled)
    )
      fail("SENDING_POLICY_STALE");
    const observed = await observe();
    if (
      digest((await envFile()).text) !== preview.envHash ||
      (await journalStamp(statePath, owner)).hash !== preview.policyHash
    )
      fail("SENDING_POLICY_STALE");
    if (
      preview.enabled !== file.parsed.sending ||
      persisted.recoveryRequired ||
      !observed.ready ||
      observed.phase !== "COMMITTED" ||
      observed.operationId !== persisted.operationId ||
      observed.enabled !== preview.enabled
    ) {
      await apply(preview.enabled);
    }
    return { enabled: preview.enabled };
  }
  try {
    return await run();
  } finally {
    lease?.release();
    await pool?.end();
  }
}
