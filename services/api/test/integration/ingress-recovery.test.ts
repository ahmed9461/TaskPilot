import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { Vault, hash } from "../../src/security.js";
import { WhatsAppConnector } from "../../src/whatsapp/connector.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("durable ingress survives transient PostgreSQL faults without losing work", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE",
  );
  const vault = new Vault(randomBytes(32).toString("base64"));
  const connector = new WhatsAppConnector(pool, vault, {
    connectionEnabled: false,
    sendingEnabled: false,
  });
  const session = randomUUID(),
    group = randomUUID(),
    task = randomUUID();
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'Synthetic DB recovery','mock')",
    [session],
  );
  await pool.query(
    "INSERT INTO task_types(id,code,name) VALUES($1,'synthetic-db-recovery','Synthetic DB recovery')",
    [task],
  );
  await pool.query(
    "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'synthetic-db-group','Synthetic DB group',$3,'synthetic-db-recovery','recovery-081')",
    [group, session, task],
  );
  t.after(async () => {
    await connector.close();
    await pool.end();
  });

  async function seed(external: string, username: string) {
    const payload = vault.seal(
      JSON.stringify({
        text: `name: Database fixture\nuser: ${username}`,
        key: {
          id: external,
          remoteJid: "123-456@g.us",
          participant: "123@lid",
          fromMe: false,
        },
      }),
      `wa-ingress:${session}:${group}:${hash(external)}`,
    );
    await pool.query(
      "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,encrypted_payload) VALUES($1,$2,$3,$4)",
      [session, group, external, payload],
    );
    return payload;
  }
  async function row(external: string) {
    return (
      await pool.query(
        "SELECT state,attempts,encrypted_payload,last_error_code FROM whatsapp_ingress WHERE session_id=$1 AND external_message_id=$2",
        [session, external],
      )
    ).rows[0];
  }
  async function work(external: string, username: string) {
    return (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM source_messages WHERE session_id=$1 AND external_message_id=$2) sources,(SELECT count(*)::int FROM accounts WHERE namespace='synthetic-db-recovery' AND username_normalized=$3) accounts,(SELECT count(*)::int FROM assignments a JOIN accounts ac ON ac.id=a.account_id WHERE ac.namespace='synthetic-db-recovery' AND ac.username_normalized=$3) assignments",
        [session, external, username],
      )
    ).rows[0];
  }
  async function removeFault(table: string) {
    assert.ok(["source_messages", "whatsapp_ingress"].includes(table));
    await pool.query(
      `DROP TRIGGER IF EXISTS synthetic_ingress_unavailable ON ${table}`,
    );
    await pool.query("DROP FUNCTION IF EXISTS synthetic_ingress_unavailable()");
  }

  await t.test(
    "serialization failures before materialization retain the encrypted queue past the poison limit",
    async () => {
      const external = "synthetic-transient-before-commit",
        username = "synthetic-db-before";
      const sealed = await seed(external, username);
      await pool.query(
        "CREATE FUNCTION synthetic_ingress_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic transient database failure' USING ERRCODE='40001'; END $$",
      );
      await pool.query(
        "CREATE TRIGGER synthetic_ingress_unavailable BEFORE INSERT ON source_messages FOR EACH ROW WHEN (NEW.external_message_id='synthetic-transient-before-commit') EXECUTE FUNCTION synthetic_ingress_unavailable()",
      );
      try {
        for (let attempt = 0; attempt < 3; attempt++)
          await assert.rejects(connector.drainOnce(), { code: "40001" });
        assert.equal((await row(external)).state, "PENDING");
        assert.equal((await row(external)).attempts, 0);
        assert.equal(
          (await row(external)).last_error_code,
          "INGRESS_DATABASE_RETRY",
        );
        assert.equal((await row(external)).encrypted_payload, sealed);
        assert.deepEqual(await work(external, username), {
          sources: 0,
          accounts: 0,
          assignments: 0,
        });
        await removeFault("source_messages");
        assert.equal(await connector.drainOnce(), true);
        assert.equal((await row(external)).state, "DONE");
        assert.equal((await row(external)).encrypted_payload, null);
        assert.equal((await row(external)).last_error_code, null);
        assert.deepEqual(await work(external, username), {
          sources: 1,
          accounts: 1,
          assignments: 1,
        });
        assert.equal(await connector.drainOnce(), false);
      } finally {
        await removeFault("source_messages");
        await pool.query(
          "UPDATE whatsapp_ingress SET state='DROPPED',encrypted_payload=NULL WHERE session_id=$1 AND external_message_id=$2 AND state<>'DONE'",
          [session, external],
        );
      }
    },
  );

  await t.test(
    "acknowledgement timeout after business commit replays once without duplicate tasks",
    async () => {
      const external = "synthetic-transient-after-commit",
        username = "synthetic-db-after";
      const sealed = await seed(external, username);
      await pool.query(
        "CREATE FUNCTION synthetic_ingress_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic cancelled acknowledgement' USING ERRCODE='57014'; END $$",
      );
      await pool.query(
        "CREATE TRIGGER synthetic_ingress_unavailable BEFORE UPDATE ON whatsapp_ingress FOR EACH ROW WHEN (NEW.external_message_id='synthetic-transient-after-commit' AND NEW.state='DONE') EXECUTE FUNCTION synthetic_ingress_unavailable()",
      );
      try {
        for (let attempt = 0; attempt < 3; attempt++)
          await assert.rejects(connector.drainOnce(), { code: "57014" });
        assert.equal((await row(external)).state, "PENDING");
        assert.equal((await row(external)).attempts, 0);
        assert.equal(
          (await row(external)).last_error_code,
          "INGRESS_DATABASE_RETRY",
        );
        assert.equal((await row(external)).encrypted_payload, sealed);
        assert.deepEqual(await work(external, username), {
          sources: 1,
          accounts: 1,
          assignments: 1,
        });
        await removeFault("whatsapp_ingress");
        assert.equal(await connector.drainOnce(), true);
        assert.equal((await row(external)).state, "DONE");
        assert.equal((await row(external)).encrypted_payload, null);
        assert.equal((await row(external)).last_error_code, null);
        assert.deepEqual(await work(external, username), {
          sources: 1,
          accounts: 1,
          assignments: 1,
        });
        assert.equal(await connector.drainOnce(), false);
      } finally {
        await removeFault("whatsapp_ingress");
      }
    },
  );

  await t.test(
    "terminated owned idle connection does not crash the worker process and reconnects",
    () => {
      const script = `
        import assert from 'node:assert/strict';
        import pg from 'pg';
        import {createPool} from ${JSON.stringify(new URL("../../src/db.ts", import.meta.url).href)};
        const url = process.env.TASKPILOT_TEST_DATABASE_URL;
        if (!url || !new URL(url).pathname.endsWith('_test')) throw Error('DEDICATED_TEST_DATABASE_REQUIRED');
        const observer = new pg.Client({connectionString:url});
        await observer.connect();
        const worker = createPool(url);
        let removed = 0;
        worker.on('remove', () => { removed++; });
        try {
          const client = await worker.connect();
          const original = (await client.query("SELECT pg_backend_pid()::int pid,current_database() db,set_config('application_name','synthetic-taskpilot-recovery-081',false)")).rows[0];
          client.release();
          assert.equal(original.db, new URL(url).pathname.slice(1));
          const killed = await observer.query("SELECT pg_terminate_backend(pid) stopped FROM pg_stat_activity WHERE pid=$1 AND datname=current_database() AND application_name='synthetic-taskpilot-recovery-081'",[original.pid]);
          assert.equal(killed.rowCount,1);
          assert.equal(killed.rows[0].stopped,true);
          for (let i=0;i<100 && removed===0;i++) await new Promise(r=>setTimeout(r,20));
          assert.equal(removed,1);
          assert.equal(worker.totalCount,0);
          const next = (await worker.query('SELECT pg_backend_pid()::int pid')).rows[0];
          assert.notEqual(next.pid,original.pid);
          console.log('OWNED_IDLE_POOL_RECOVERED');
        } finally {
          await worker.end();
          await observer.end();
        }
      `;
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          env: process.env,
          encoding: "utf8",
          timeout: 15000,
          maxBuffer: 100000,
        },
      );
      // Never include the child error/client object, connection string or environment.
      if (result.status !== 0)
        t.diagnostic(
          JSON.stringify({
            ownedIdleChildExit: result.status,
            unhandledPoolError: result.stderr.includes(
              "Unhandled 'error' event",
            ),
            databaseAdminTermination: result.stderr.includes(
              "terminating connection due to administrator command",
            ),
          }),
        );
      assert.equal(result.status, 0, "OWNED_IDLE_POOL_RECOVERY_CHILD_EXIT");
      assert.equal(result.stdout.trim(), "OWNED_IDLE_POOL_RECOVERED");
    },
  );
});
