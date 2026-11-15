import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  lstat,
  mkdir,
  rename,
  rmdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, fork } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  CommittedSendingPolicy,
  policyHash,
} from "../../src/sending-policy.js";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { hash } from "../../src/security.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("privileged sending control uses isolated files, PostgreSQL and fake service callbacks", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE",
  );
  const root = await mkdtemp(join(tmpdir(), "taskpilot-policy-"));
  t.after(async () => {
    await pool.end();
    await rm(root, { recursive: true, force: true });
  });
  const modulePath = pathToFileURL(resolve("ops/sending-policy-core.mjs")).href;
  const { executeSendingPolicy: run } = await import(modulePath);
  const envPath = join(root, "policy.env"),
    directory = join(root, "previews");
  const original = `DATABASE_URL=${url}\nCANARY=synthetic-preserved\r\nWHATSAPP_CONNECTION_ENABLED=true\r\nWHATSAPP_SENDING_ENABLED=false\r\n`;
  await writeFile(envPath, original, { mode: 0o640 });
  const statePath = envPath + ".sending-state.json";
  async function resetState() {
    await writeFile(envPath, original);
    await writeFile(
      statePath,
      JSON.stringify({
        version: 1,
        phase: "COMMITTED",
        enabled: false,
        operationId: randomUUID(),
        envHash: policyHash(original),
      }),
      { mode: 0o600 },
    );
  }
  await resetState();
  const gate = new CommittedSendingPolicy(
    true,
    () => readFileSync(envPath, "utf8"),
    () => readFileSync(statePath, "utf8"),
  );
  let effective = false,
    signals = 0,
    stops = 0;
  const io = {
    envPath,
    directory,
    owner: process.getuid?.() ?? 0,
    health: async () => ({ version: 2, ...gate.current() }),
    async signal() {
      signals++;
      effective = (await readFile(envPath, "utf8")).includes(
        "SENDING_ENABLED=true",
      );
    },
    async stop() {
      stops++;
    },
  };
  const client = randomBytes(32).toString("hex"),
    clientId = randomUUID();
  await pool.query(
    "INSERT INTO client_sessions(id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
    [clientId, hash(client)],
  );
  const session = randomUUID(),
    group = randomUUID(),
    task = randomUUID();
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider,status,connect_requested) VALUES($1,'Synthetic policy','baileys','CONNECTED',true)",
    [session],
  );
  await pool.query(
    "INSERT INTO task_types(id,code,name) VALUES($1,'synthetic-policy','Synthetic policy')",
    [task],
  );
  await pool.query(
    "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'synthetic-policy','Synthetic policy',$3,'synthetic-policy','085')",
    [group, session, task],
  );
  const command = (action: string, values = {}) =>
    run({ action, clientToken: client, ...values }, io);
  async function grant() {
    const value = randomBytes(32).toString("hex");
    await pool.query(
      "UPDATE client_sessions SET reauth_hash=$2,reauth_expires_at=now()+interval '60 seconds' WHERE id=$1",
      [clientId, hash(value)],
    );
    return value;
  }
  async function apply(p: any) {
    return command("apply", {
      token: p.token,
      confirmation: p.confirmation,
      reauth: await grant(),
    });
  }

  await t.test(
    "preview/discard never mutate policy or signal; invalid client cannot view it",
    async () => {
      await assert.rejects(
        run(
          { action: "preview", clientToken: "x".repeat(64), enabled: true },
          io,
        ),
        /SESSION_EXPIRED/,
      );
      const p = await command("preview", { enabled: true });
      assert.equal(p.connected, 1);
      assert.equal(p.groups, 1);
      assert.equal(p.unsettled, 0);
      assert.equal((await lstat(directory)).mode & 0o777, 0o700);
      assert.equal(
        (await lstat(join(directory, p.token + ".json"))).mode & 0o777,
        0o600,
      );
      await command("discard", { token: p.token });
      assert.equal(await readFile(envPath, "utf8"), original);
      assert.equal(signals, 0);
    },
  );
  await t.test(
    "stale group/config, wrong phrase and expired preview refuse writes",
    async () => {
      for (const change of ["group", "config", "phrase", "expiry"]) {
        const p = await command("preview", { enabled: true });
        if (change === "group")
          await pool.query("UPDATE groups SET version=version+1 WHERE id=$1", [
            group,
          ]);
        if (change === "config")
          await writeFile(envPath, original + "UNRELATED=synthetic-change\n");
        if (change === "phrase") p.confirmation = "wrong";
        if (change === "expiry") {
          const path = join(directory, p.token + ".json"),
            stored = JSON.parse(await readFile(path, "utf8"));
          await writeFile(
            path,
            JSON.stringify({ ...stored, expiresAt: Date.now() - 1 }),
          );
        }
        await assert.rejects(apply(p), /SENDING_POLICY_STALE/);
        assert.equal(signals, 0);
        await writeFile(envPath, original);
      }
    },
  );
  await t.test(
    "same admin lock as rotation prevents concurrent policy changes",
    async () => {
      const lock = await pool.connect();
      try {
        await lock.query("SELECT pg_advisory_lock(8240008)");
        await assert.rejects(
          command("preview", { enabled: true }),
          /SENDING_POLICY_BUSY/,
        );
      } finally {
        await lock.query("SELECT pg_advisory_unlock(8240008)");
        lock.release();
      }
    },
  );
  await t.test(
    "reauth is client-bound, single-use; enable/disable preserve unrelated env and mode",
    async () => {
      const p = await command("preview", { enabled: true });
      await assert.rejects(
        command("apply", {
          token: p.token,
          confirmation: p.confirmation,
          reauth: "wrong",
        }),
        /REAUTH_REQUIRED/,
      );
      assert.equal(signals, 0);
      assert.deepEqual(await apply(p), { enabled: true });
      assert.equal(effective, true);
      assert.equal(signals, 1);
      assert.equal(stops, 0);
      assert.equal(
        await readFile(envPath, "utf8"),
        original.replace("SENDING_ENABLED=false", "SENDING_ENABLED=true"),
      );
      assert.equal((await lstat(envPath)).mode & 0o777, 0o640);
      assert.equal(
        (
          await pool.query(
            "SELECT reauth_hash FROM client_sessions WHERE id=$1",
            [clientId],
          )
        ).rows[0].reauth_hash,
        null,
      );
      const off = await command("preview", { enabled: false });
      await apply(off);
      assert.equal(effective, false);
      assert.equal(signals, 2);
      assert.equal(await readFile(envPath, "utf8"), original);
      const same = await command("preview", { enabled: false });
      await apply(same);
      assert.equal(signals, 2);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM audit_events WHERE action='LIVE_SENDING_CHANGE_AUTHORIZED'",
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await t.test(
    "queued and uncertain live replies block enable before any write",
    async () => {
      const account = randomUUID(),
        assignment = randomUUID(),
        source = randomUUID(),
        template = randomUUID();
      await pool.query(
        "INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,'synthetic-policy','synthetic-policy','Synthetic policy')",
        [account],
      );
      await pool.query(
        "INSERT INTO assignments(id,account_id,task_type_id,period_key) VALUES($1,$2,$3,'085')",
        [assignment, account, task],
      );
      await pool.query(
        "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state) VALUES($1,$2,$3,'synthetic-policy','PROCESSED')",
        [source, session, group],
      );
      await pool.query(
        "INSERT INTO reply_templates(id,code,body) VALUES($1,'synthetic-policy','Synthetic reply')",
        [template],
      );
      const job = randomUUID();
      await pool.query(
        "INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key) VALUES($1,$2,$3,$4,$5,'Synthetic reply','APPROVED',$6)",
        [job, assignment, source, session, template, job],
      );
      for (const status of ["APPROVED", "SENDING", "UNKNOWN_DELIVERY"]) {
        await pool.query("UPDATE reply_jobs SET status=$2 WHERE id=$1", [
          job,
          status,
        ]);
        await assert.rejects(
          command("preview", { enabled: true }),
          /SENDING_POLICY_NOT_SAFE/,
        );
      }
      const p = await command("preview", { enabled: false });
      await command("discard", { token: p.token });
      assert.equal(signals, 2);
      assert.equal(effective, false);
      await pool.query("UPDATE reply_jobs SET status='CANCELED' WHERE id=$1", [
        job,
      ]);
    },
  );

  await t.test(
    "SIGKILL at durable checkpoints never enables an uncommitted change and preserves a committed decision",
    { skip: process.platform === "win32" },
    async () => {
      for (const killAt of [
        "PENDING_DURABLE",
        "ENV_DURABLE",
        "AUTHORIZATION_DURABLE",
        "COMMIT_DURABLE",
      ]) {
        await resetState();
        const preview = await command("preview", { enabled: true });
        const child = fork(
          resolve("services/api/test/fixtures/sending-control-child.mjs"),
          [],
          { stdio: ["ignore", "ignore", "ignore", "ipc"] },
        );
        const reached = new Promise<void>((yes, no) => {
          const timer = setTimeout(
            () => no(Error("SYNTHETIC_CHECKPOINT_TIMEOUT")),
            10000,
          );
          child.on("message", (raw: any) => {
            clearTimeout(timer);
            raw.stage === killAt
              ? yes()
              : no(Error("SYNTHETIC_CHECKPOINT_NOT_REACHED"));
          });
          child.once("exit", () => {
            clearTimeout(timer);
            no(Error("SYNTHETIC_CHILD_EXITED_EARLY"));
          });
        });
        child.send({
          input: {
            action: "apply",
            clientToken: client,
            token: preview.token,
            confirmation: preview.confirmation,
            reauth: await grant(),
          },
          envPath,
          directory,
          statePath,
          killAt,
        });
        try {
          await reached;
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
            await new Promise<void>((r) => child.once("exit", () => r()));
          }
        }
        // Wait for the dead child's DB connection to release the same admin lock.
        const barrier = await pool.connect();
        try {
          await barrier.query("SELECT pg_advisory_lock(8240008)");
          await barrier.query("SELECT pg_advisory_unlock(8240008)");
        } finally {
          barrier.release();
        }
        const fresh = new CommittedSendingPolicy(
          true,
          () => readFileSync(envPath, "utf8"),
          () => readFileSync(statePath, "utf8"),
        ).current();
        assert.equal(fresh.enabled, killAt === "COMMIT_DURABLE");
        assert.equal(fresh.recoveryRequired, killAt !== "COMMIT_DURABLE");
        const durable = JSON.parse(await readFile(statePath, "utf8"));
        const events = (
          await pool.query(
            "SELECT count(*)::int n FROM audit_events WHERE action='LIVE_SENDING_CHANGE_AUTHORIZED' AND target_id=$1",
            [durable.operationId],
          )
        ).rows[0].n;
        assert.equal(
          events,
          ["AUTHORIZATION_DURABLE", "COMMIT_DURABLE"].includes(killAt) ? 1 : 0,
        );
        if (killAt !== "COMMIT_DURABLE")
          await assert.rejects(
            command("preview", { enabled: true }),
            /SENDING_POLICY_RECOVERY_REQUIRED/,
          );
        // Explicit disable/recovery uses a new preview and grant, never resumes the killed command.
        await apply(await command("preview", { enabled: false }));
        assert.equal(gate.current().enabled, false);
        assert.equal(gate.current().phase, "COMMITTED");
        assert.equal(await readFile(envPath, "utf8"), original);
        assert.equal(
          (
            await pool.query(
              "SELECT reauth_hash FROM client_sessions WHERE id=$1",
              [clientId],
            )
          ).rows[0].reauth_hash,
          null,
        );
      }
    },
  );

  await t.test(
    "audit failure before commit rolls back authorization and durably disables sending",
    async () => {
      await resetState();
      const preview = await command("preview", { enabled: true });
      await pool.query(
        "CREATE FUNCTION synthetic_policy_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic policy audit failure' USING ERRCODE='40001'; END $$",
      );
      await pool.query(
        "CREATE TRIGGER synthetic_policy_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.action='LIVE_SENDING_CHANGE_AUTHORIZED') EXECUTE FUNCTION synthetic_policy_audit_failure()",
      );
      try {
        await assert.rejects(
          apply(preview),
          /SENDING_POLICY_DISABLED_AFTER_FAILURE/,
        );
        assert.equal(gate.current().enabled, false);
        assert.equal(gate.current().phase, "COMMITTED");
        assert.equal(await readFile(envPath, "utf8"), original);
      } finally {
        await pool.query(
          "DROP TRIGGER synthetic_policy_audit_failure ON audit_events",
        );
        await pool.query("DROP FUNCTION synthetic_policy_audit_failure()");
      }
    },
  );
  await t.test(
    "unwritable commit journal cannot enable transport and stops only the injected owned service",
    async () => {
      await resetState();
      const preview = await command("preview", { enabled: true });
      let stopped = false;
      try {
        await assert.rejects(
          run(
            {
              action: "apply",
              clientToken: client,
              token: preview.token,
              confirmation: preview.confirmation,
              reauth: await grant(),
            },
            {
              ...io,
              async checkpoint(stage: string) {
                if (stage === "AUTHORIZATION_DURABLE") {
                  await rename(statePath, statePath + ".saved");
                  await mkdir(statePath);
                }
              },
              async stop() {
                stopped = true;
              },
            },
          ),
          /SENDING_POLICY_SERVICE_STOPPED/,
        );
        assert.equal(stopped, true);
        assert.equal(gate.current().enabled, false);
      } finally {
        await rmdir(statePath);
        await rename(statePath + ".saved", statePath);
        await resetState();
      }
    },
  );

  await t.test(
    "main process starts disabled from an interrupted enable and survives restart without provider connection",
    { skip: process.platform === "win32" },
    async () => {
      await pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=false,status='STOPPED'",
      );
      const listener = createServer();
      await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
      const port = (listener.address() as { port: number }).port;
      await new Promise<void>((r, j) =>
        listener.close((e) => (e ? j(e) : r())),
      );
      const key = join(root, "key"),
        api = join(root, "api"),
        reauth = join(root, "reauth"),
        policy = join(root, "child.env"),
        childState = policy + ".state.json";
      const text =
        "WHATSAPP_CONNECTION_ENABLED=true\nWHATSAPP_SENDING_ENABLED=true\n";
      const operationId = randomUUID();
      async function phase(value: string) {
        await writeFile(policy, text);
        await writeFile(
          childState,
          JSON.stringify({
            version: 1,
            phase: value,
            operationId,
            enabled: true,
            envHash: policyHash(text),
          }),
          { mode: 0o600 },
        );
      }
      for (const [path, value] of [
        [key, randomBytes(32).toString("base64")],
        [api, randomBytes(32).toString("hex")],
        [reauth, randomBytes(32).toString("hex")],
      ])
        await writeFile(path!, value!, { mode: 0o600 });
      await phase("PENDING");
      function launch() {
        return spawn(
          process.execPath,
          [resolve("dist/services/api/src/main.js")],
          {
            stdio: "ignore",
            env: {
              PATH: process.env.PATH,
              DATABASE_URL: url,
              TASKPILOT_BIND_PORT: String(port),
              TASKPILOT_API_TOKEN_FILE: api,
              TASKPILOT_REAUTH_SECRET_FILE: reauth,
              TASKPILOT_ENCRYPTION_KEY_FILE: key,
              TASKPILOT_SENDING_POLICY_FILE: policy,
              TASKPILOT_SENDING_STATE_FILE: childState,
              WHATSAPP_CONNECTION_ENABLED: "true",
              TASKPILOT_MOCK_ENABLED: "false",
            },
          },
        );
      }
      let child = launch();
      async function waitReady(ready: boolean, enabled: boolean) {
        for (let n = 0; n < 80; n++) {
          try {
            const h = (await (
              await fetch(`http://127.0.0.1:${port}/health`)
            ).json()) as any;
            if (
              h.sendingPolicyReady === ready &&
              h.liveSendingEnabled === enabled
            )
              return h;
          } catch {}
          await delay(50);
        }
        assert.fail("ISOLATED_CHILD_POLICY_NOT_READY");
      }
      try {
        const pid = child.pid;
        assert.equal((await waitReady(true, false)).policyPhase, "PENDING");
        await writeFile(policy, "invalid");
        child.kill("SIGHUP");
        await waitReady(false, false);
        await phase("COMMITTED");
        await waitReady(true, true); // No signal is required to observe the durable commit.
        assert.equal(child.pid, pid);
        assert.equal(child.exitCode, null);
        await phase("PENDING");
        await waitReady(true, false);
        child.kill("SIGKILL");
        await new Promise<void>((r) => child.once("exit", () => r()));
        const barrier = await pool.connect();
        try {
          for (const lock of [8240002, 8240004]) {
            await barrier.query("SELECT pg_advisory_lock($1)", [lock]);
            await barrier.query("SELECT pg_advisory_unlock($1)", [lock]);
          }
        } finally {
          barrier.release();
        }
        child = launch();
        const restarted = await waitReady(true, false);
        assert.equal(restarted.policyPhase, "PENDING");
        assert.equal(restarted.policyOperationId, operationId);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int n FROM whatsapp_sessions WHERE connect_requested",
            )
          ).rows[0].n,
          0,
        );
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
          await new Promise<void>((r) => child.once("exit", () => r()));
        }
      }
    },
  );
});
