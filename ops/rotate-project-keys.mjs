// Explicit root-only maintenance; API0.7+ must be deployed before invoking.
// A dual keyring is published before DB commit; DB marker makes resume safe after a crash.
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  realpath,
  lstat,
  chown,
  chmod,
  rename,
  open,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { Vault } from "../dist/services/api/src/security.js";
import { rewrapFields } from "../dist/services/api/src/key-rotation.js";
import { transaction, event } from "../dist/services/api/src/db.js";
let pool,
  stopped = false,
  journalPath;
const unit = (action) =>
  execFileSync("systemctl", [action, "taskpilot.service"], { stdio: "ignore" });
try {
  if (
    process.getuid?.() !== 0 ||
    !["--apply", "--resume"].includes(process.argv[2])
  )
    throw Error();
  if (
    (await realpath(process.cwd())) !==
    (await realpath("/opt/taskpilot/current"))
  )
    throw Error("ACTIVE_RELEASE_REQUIRED");
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
  const applying = process.argv[2] === "--apply";
  const apiHealth = applying
    ? await fetch("http://127.0.0.1:8240/health").then((r) => r.json())
    : JSON.parse(await readFile("package.json", "utf8"));
  if (apiHealth.version !== "0.7.0") throw Error();
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60000,
  });
  if (
    !(await pool.query("SELECT pg_try_advisory_lock(8240008) locked")).rows[0]
      .locked
  )
    throw Error();
  const risk = (
    await pool.query(
      "SELECT (SELECT count(*)::int FROM reply_jobs WHERE status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')) jobs,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='PENDING') pending,(SELECT count(*)::int FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested AND status='CONNECTED') connected",
    )
  ).rows[0];
  if (risk.jobs || risk.pending || (applying && risk.connected !== 1))
    throw Error();
  const names = ["encryption-key", "backup-key", "api-token", "reauth-secret"];
  const id =
    process.argv[2] === "--resume"
      ? process.argv[3]
      : `rotation-${new Date().toISOString().replace(/[^0-9]/g, "")}`;
  if (!/^rotation-[0-9]+$/.test(id ?? "")) throw Error();
  await mkdir("/var/lib/taskpilot/key-rotations", {
    recursive: true,
    mode: 0o700,
  });
  journalPath = `/var/lib/taskpilot/key-rotations/${id}.json`;
  if (applying) {
    for (const name of await readdir("/var/lib/taskpilot/key-rotations")) {
      if (/^rotation-[0-9]+\.json$/.test(name)) {
        const prior = JSON.parse(
          await readFile("/var/lib/taskpilot/key-rotations/" + name, "utf8"),
        );
        if (prior.phase !== "COMPLETE")
          throw Error("RESUME_PENDING_ROTATION_FIRST");
      }
    }
  }
  let journal;
  if (process.argv[2] === "--resume")
    journal = JSON.parse(await readFile(journalPath, "utf8"));
  else {
    const previous = {},
      metadata = {};
    for (const name of names) {
      const p = `/etc/taskpilot/${name}`,
        s = await lstat(p);
      if (!s.isFile() || s.isSymbolicLink() || s.uid !== 0 || s.mode & 0o007)
        throw Error();
      previous[name] = (await readFile(p, "utf8")).trim();
      metadata[name] = { uid: s.uid, gid: s.gid, mode: s.mode & 0o777 };
    }
    const current = new Vault(previous["encryption-key"]);
    const newId = current.keyVersion + 1;
    const keyring = previous["encryption-key"].startsWith("{")
      ? JSON.parse(previous["encryption-key"])
      : {
          format: "taskpilot-keyring-v1",
          active: 1,
          keys: { 1: previous["encryption-key"] },
        };
    const fresh = randomBytes(32).toString("base64");
    const next = {
      "encryption-key": JSON.stringify({
        format: "taskpilot-keyring-v1",
        active: newId,
        keys: { [newId]: fresh },
      }),
      "backup-key": randomBytes(32).toString("base64"),
      "api-token": randomBytes(32).toString("base64url"),
      "reauth-secret": randomBytes(32).toString("base64url"),
    };
    const bridge = JSON.stringify({
      ...keyring,
      active: newId,
      keys: { ...keyring.keys, [newId]: fresh },
    });
    new Vault(next["encryption-key"]);
    new Vault(bridge);
    execFileSync(
      process.execPath,
      ["ops/backup.mjs", "backup", `/var/lib/taskpilot/backups/pre-${id}.tpg`],
      { stdio: "ignore" },
    );
    journal = {
      id,
      phase: "PREPARED",
      keyVersion: newId,
      previous,
      next,
      bridge,
      metadata,
    };
    const prepared = journalPath + ".prepare.tmp";
    const initial = await open(prepared, "wx", 0o600);
    try {
      await initial.writeFile(JSON.stringify(journal));
      await initial.sync();
    } finally {
      await initial.close();
    }
    await rename(prepared, journalPath);
    const parent = await open("/var/lib/taskpilot/key-rotations", "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  }
  if (
    journal.id !== id ||
    !journal.previous ||
    !journal.next ||
    !journal.metadata
  )
    throw Error();
  const latest = (
    await pool.query(
      "SELECT COALESCE(max(key_version),1)::int v FROM key_rotation_runs",
    )
  ).rows[0].v;
  const activeVersion = new Vault(
    (await readFile("/etc/taskpilot/encryption-key", "utf8")).trim(),
  ).keyVersion;
  if (latest > journal.keyVersion || activeVersion > journal.keyVersion)
    throw Error("OLDER_ROTATION_CANNOT_BE_RESUMED");
  async function checkpoint() {
    const temp = journalPath + ".tmp";
    const h = await open(temp, "w", 0o600);
    try {
      await h.writeFile(JSON.stringify(journal));
      await h.sync();
    } finally {
      await h.close();
    }
    await rename(temp, journalPath);
    const d = await open("/var/lib/taskpilot/key-rotations", "r");
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  }
  async function publish(name, value) {
    if (!names.includes(name)) throw Error();
    const path = `/etc/taskpilot/${name}`,
      tmp = path + "." + id,
      meta = journal.metadata[name];
    let exists = false;
    try {
      const st = await lstat(tmp);
      if (!st.isFile() || st.isSymbolicLink() || st.uid !== 0) throw Error();
      exists = true;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const h = await open(tmp, exists ? "w" : "wx", meta.mode);
    try {
      await h.writeFile(value + "\n");
      await h.sync();
    } finally {
      await h.close();
    }
    await chown(tmp, meta.uid, meta.gid);
    await chmod(tmp, meta.mode);
    const persisted = await open(tmp, "r");
    try {
      await persisted.sync();
    } finally {
      await persisted.close();
    }
    await rename(tmp, path);
    const dir = await open("/etc/taskpilot", "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }
  stopped = true;
  unit("stop");
  // Recheck after all provider/API writers have stopped; no new ingress may be missed silently.
  const pending = (
    await pool.query(
      "SELECT count(*)::int n FROM whatsapp_ingress WHERE state='PENDING'",
    )
  ).rows[0].n;
  if (pending) throw Error();
  await publish("encryption-key", journal.bridge);
  const committed = await transaction(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(8240008)");
    const prior = (
      await c.query(
        "SELECT key_version,counts FROM key_rotation_runs WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (prior) {
      if (prior.key_version !== journal.keyVersion) throw Error();
      return {
        keyVersion: prior.key_version,
        counts: prior.counts,
        resumed: true,
      };
    }
    const result = await rewrapFields(
      c,
      new Vault(journal.bridge),
      new Vault(journal.next["encryption-key"]),
      true,
    );
    await c.query(
      "UPDATE client_sessions SET revoked_at=COALESCE(revoked_at,now()),reauth_hash=NULL,reauth_expires_at=NULL",
    );
    await c.query(
      "UPDATE approvals SET expires_at=LEAST(expires_at,now()) WHERE consumed_at IS NULL",
    );
    await c.query(
      "INSERT INTO key_rotation_runs(id,key_version,counts) VALUES($1,$2,$3)",
      [id, result.keyVersion, JSON.stringify(result.counts)],
    );
    await event(c, "PROJECT_KEYS_ROTATED");
    return { ...result, resumed: false };
  });
  for (const name of names) await publish(name, journal.next[name]);
  journal.phase = "PUBLISHED";
  await checkpoint();
  unit("start");
  stopped = false;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8240/ready", {
        headers: { authorization: "Bearer " + journal.next["api-token"] },
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw Error();
  let connected = false;
  for (let i = 0; i < 45; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8240/v1/sessions", {
        headers: { authorization: "Bearer " + journal.next["api-token"] },
        signal: AbortSignal.timeout(2000),
      });
      const sessions = await r.json();
      if (
        r.ok &&
        sessions.filter(
          (s) =>
            s.provider === "baileys" &&
            s.connect_requested &&
            s.status === "CONNECTED",
        ).length === 1
      ) {
        connected = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!connected) throw Error();
  const oldAuth = await fetch("http://127.0.0.1:8240/ready", {
    headers: { authorization: "Bearer " + journal.previous["api-token"] },
  });
  if (oldAuth.status !== 401) throw Error();
  const reauth = await fetch("http://127.0.0.1:8240/v1/deletions/confirm", {
    method: "POST",
    headers: {
      authorization: "Bearer " + journal.next["api-token"],
      "x-reauth-secret": journal.previous["reauth-secret"],
      "content-type": "application/json",
    },
    body: JSON.stringify({
      approvalToken: "rotation-negative-probe",
      confirmation: "DELETE 0",
    }),
  });
  if (reauth.status !== 403) throw Error();
  journal.phase = "COMPLETE";
  await checkpoint();
  console.log(
    JSON.stringify({
      rotation: "PASS",
      id,
      ...committed,
      oldApiTokenRejected: true,
      oldReauthSecretRejected: true,
      previousClientSessionsRevokedAtRotation: true,
      pairedSessionConnectedAgain: true,
      oldBackupKeysRetainedInProtectedJournal: true,
      whatsappIdentityReplaced: false,
      providerKeyRotated: false,
      sendingEnabled: false,
    }),
  );
} catch {
  console.error(
    "PROJECT_KEY_ROTATION_FAILED; protected journal and dual-reader state retained for review/resume",
  );
  process.exitCode = 1;
} finally {
  if (stopped)
    try {
      unit("start");
    } catch {
      console.error("TASKPILOT_SERVICE_START_REQUIRED");
    }
  await pool?.end();
}
