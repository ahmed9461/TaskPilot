import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
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
  let effective = false,
    signals = 0,
    stops = 0;
  const io = {
    envPath,
    directory,
    owner: process.getuid?.() ?? 0,
    health: async () => effective,
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
            "SELECT count(*)::int n FROM audit_events WHERE action IN ('LIVE_SENDING_ENABLED','LIVE_SENDING_DISABLED')",
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
    "real main process reloads only the sending gate on HUP without restart or provider connection",
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
        policy = join(root, "child.env");
      for (const [path, value] of [
        [key, randomBytes(32).toString("base64")],
        [api, randomBytes(32).toString("hex")],
        [reauth, randomBytes(32).toString("hex")],
        [
          policy,
          "WHATSAPP_CONNECTION_ENABLED=false\nWHATSAPP_SENDING_ENABLED=false\n",
        ],
      ])
        await writeFile(path!, value!, { mode: 0o600 });
      const child = spawn(
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
            WHATSAPP_CONNECTION_ENABLED: "false",
            TASKPILOT_MOCK_ENABLED: "false",
          },
        },
      );
      async function waitReady(ready: boolean) {
        for (let n = 0; n < 80; n++) {
          try {
            const h = (await (
              await fetch(`http://127.0.0.1:${port}/health`)
            ).json()) as any;
            if (h.sendingPolicyReady === ready) {
              assert.equal(h.liveSendingEnabled, false);
              return;
            }
          } catch {}
          await delay(50);
        }
        assert.fail("ISOLATED_CHILD_POLICY_NOT_READY");
      }
      try {
        const pid = child.pid;
        await waitReady(true);
        await writeFile(policy, "invalid");
        child.kill("SIGHUP");
        await waitReady(false);
        await writeFile(
          policy,
          "WHATSAPP_CONNECTION_ENABLED=true\nWHATSAPP_SENDING_ENABLED=true\n",
        );
        child.kill("SIGHUP");
        await waitReady(true);
        assert.equal(child.pid, pid);
        assert.equal(child.exitCode, null);
      } finally {
        child.kill("SIGTERM");
        await new Promise<void>((r) => child.once("exit", () => r()));
      }
    },
  );
});
