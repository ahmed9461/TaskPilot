import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type pg from "pg";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { startMockWorker } from "../../src/outbox.js";
import { DefinitelyNotSent, MockTransport } from "../../src/transport.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("outbox database recovery persists outcomes without replaying transport", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE",
  );
  t.after(async () => {
    await pool.end();
  });
  const session = randomUUID(),
    group = randomUUID(),
    task = randomUUID(),
    account = randomUUID(),
    assignment = randomUUID(),
    source = randomUUID(),
    template = randomUUID();
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'Synthetic outbox recovery','mock')",
    [session],
  );
  await pool.query(
    "INSERT INTO task_types(id,code,name) VALUES($1,'synthetic-outbox-recovery','Synthetic recovery')",
    [task],
  );
  await pool.query(
    "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'synthetic-outbox-group','Synthetic outbox',$3,'synthetic-outbox-recovery','082')",
    [group, session, task],
  );
  await pool.query(
    "INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,'synthetic-outbox-recovery','synthetic-outbox','Synthetic outbox')",
    [account],
  );
  await pool.query(
    "INSERT INTO assignments(id,account_id,task_type_id,period_key) VALUES($1,$2,$3,'082')",
    [assignment, account, task],
  );
  await pool.query(
    "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state) VALUES($1,$2,$3,'synthetic-outbox-source','PROCESSED')",
    [source, session, group],
  );
  await pool.query(
    "INSERT INTO assignment_sources(assignment_id,source_message_id) VALUES($1,$2)",
    [assignment, source],
  );
  await pool.query(
    "INSERT INTO reply_templates(id,code,body) VALUES($1,'synthetic-outbox-recovery','Synthetic reply')",
    [template],
  );

  async function seed(status = "APPROVED") {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key) VALUES($1,$2,$3,$4,$5,'Synthetic reply',$6,$7)",
      [id, assignment, source, session, template, status, id],
    );
    return id;
  }
  async function row(id: string) {
    return (
      await pool.query(
        "SELECT status,provider_message_id FROM reply_jobs WHERE id=$1",
        [id],
      )
    ).rows[0];
  }
  async function events(id: string) {
    return (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM audit_events WHERE target_id=$1 AND action LIKE 'REPLY_%') audit,(SELECT count(*)::int FROM notifications WHERE subject_id=$1 AND type LIKE 'REPLY_%') notifications",
        [id],
      )
    ).rows[0];
  }
  async function waitFor(check: () => Promise<boolean>, code: string) {
    for (let n = 0; n < 180; n++) {
      if (await check()) return;
      await delay(25);
    }
    assert.fail(code);
  }
  async function removeFault() {
    await pool.query(
      "DROP TRIGGER IF EXISTS synthetic_outbox_unavailable ON reply_jobs",
    );
    await pool.query("DROP FUNCTION IF EXISTS synthetic_outbox_unavailable()");
  }
  async function clean(ids: string[]) {
    await removeFault();
    await pool.query(
      "UPDATE reply_jobs SET status='CANCELED' WHERE id=ANY($1::uuid[]) AND status IN ('APPROVED','SENDING')",
      [ids],
    );
  }

  for (const status of ["SENT", "UNKNOWN_DELIVERY", "FAILED"]) {
    await t.test(
      `${status} settles after DB recovery while transport is called once`,
      async () => {
        const id = await seed();
        const transport = new MockTransport();
        let calls = 0;
        transport.replyToMessage = async () => {
          calls++;
          if (status === "UNKNOWN_DELIVERY")
            throw Error("synthetic ambiguous timeout");
          if (status === "FAILED")
            throw new DefinitelyNotSent("synthetic not sent");
          return { providerMessageId: "synthetic-provider-receipt" };
        };
        // Real PostgreSQL rollback of all terminal writes, scoped to this synthetic job.
        assert.match(id, /^[a-f0-9-]{36}$/);
        await pool.query(
          "CREATE FUNCTION synthetic_outbox_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic unavailable result store' USING ERRCODE='40001'; END $$",
        );
        await pool.query(
          `CREATE TRIGGER synthetic_outbox_unavailable BEFORE UPDATE ON reply_jobs FOR EACH ROW WHEN (NEW.id='${id}'::uuid AND NEW.status IN ('SENT','FAILED','UNKNOWN_DELIVERY')) EXECUTE FUNCTION synthetic_outbox_unavailable()`,
        );
        const stop = await startMockWorker(pool, transport);
        try {
          await waitFor(
            async () => calls === 1,
            "SYNTHETIC_TRANSPORT_NOT_CALLED",
          );
          await delay(1250);
          assert.equal(calls, 1);
          assert.equal((await row(id)).status, "SENDING");
          assert.deepEqual(await events(id), { audit: 0, notifications: 0 });
          await removeFault();
          await waitFor(
            async () => (await row(id)).status === status,
            "RESULT_DID_NOT_RECOVER_WITHOUT_RESTART",
          );
          assert.equal(calls, 1);
          assert.equal(
            (await row(id)).provider_message_id,
            status === "SENT" ? "synthetic-provider-receipt" : null,
          );
          assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
          await delay(1100);
          assert.equal(calls, 1);
        } finally {
          await stop();
          await clean([id]);
        }
      },
    );
  }

  function lostCommitAcknowledgement(
    armed: () => boolean,
    consumed: () => void,
    beforeCommit = false,
  ): pg.Pool {
    return {
      query: pool.query.bind(pool),
      async connect() {
        const client = await pool.connect();
        return {
          async query(...args: any[]) {
            if (beforeCommit && args[0] === "COMMIT" && armed()) {
              consumed();
              throw Object.assign(Error("synthetic commit not submitted"), {
                code: "ECONNRESET",
              });
            }
            const result = await (client.query as any)(...args);
            if (args[0] === "COMMIT" && armed()) {
              consumed();
              // The real DB commit succeeded, but its response is lost to this caller.
              throw Object.assign(
                Error("synthetic lost commit acknowledgement"),
                { code: "ECONNRESET" },
              );
            }
            return result;
          },
          release: client.release.bind(client),
        };
      },
    } as unknown as pg.Pool;
  }

  await t.test(
    "lost result commit acknowledgement cannot downgrade SENT or duplicate activity",
    async () => {
      const id = await seed();
      let armed = false,
        injected = 0,
        calls = 0;
      const wrapped = lostCommitAcknowledgement(
        () => armed,
        () => {
          armed = false;
          injected++;
        },
      );
      const transport = new MockTransport();
      transport.replyToMessage = async () => {
        calls++;
        armed = true;
        return { providerMessageId: "synthetic-committed-receipt" };
      };
      const stop = await startMockWorker(wrapped, transport);
      try {
        await waitFor(
          async () => injected === 1,
          "COMMIT_ACK_FAULT_NOT_INJECTED",
        );
        await delay(1250);
        assert.deepEqual(await row(id), {
          status: "SENT",
          provider_message_id: "synthetic-committed-receipt",
        });
        assert.equal(calls, 1);
        assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
      } finally {
        await stop();
        await clean([id]);
      }
    },
  );

  await t.test(
    "lost claim commit acknowledgement never invokes provider and leaves a resolvable result",
    async () => {
      const id = await seed();
      let armed = true,
        injected = 0,
        calls = 0;
      // Arm only after startup recovery, so the next lost COMMIT is the actual claim.
      const wrapped = lostCommitAcknowledgement(
        () => armed,
        () => {
          armed = false;
          injected++;
        },
      );
      const transport = new MockTransport();
      transport.replyToMessage = async () => {
        calls++;
        return { providerMessageId: "synthetic-must-not-send" };
      };
      // No interrupted rows exist; current startup has no transaction on the old implementation.
      armed = false;
      const stop = await startMockWorker(wrapped, transport);
      armed = true;
      try {
        await waitFor(
          async () => injected === 1,
          "CLAIM_ACK_FAULT_NOT_INJECTED",
        );
        await waitFor(
          async () => (await row(id)).status === "FAILED",
          "UNSENT_CLAIM_STUCK",
        );
        assert.equal(calls, 0);
        assert.equal((await row(id)).provider_message_id, null);
        assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
      } finally {
        await stop();
        await clean([id]);
      }
    },
  );

  await t.test(
    "restart recovery publishes one durable unknown-delivery event and never resends",
    async () => {
      const id = await seed("SENDING"),
        transport = new MockTransport();
      let calls = 0;
      transport.replyToMessage = async () => {
        calls++;
        return { providerMessageId: "synthetic-must-not-replay" };
      };
      try {
        const stop = await startMockWorker(pool, transport);
        await stop();
        const again = await startMockWorker(pool, transport);
        await again();
        assert.equal((await row(id)).status, "UNKNOWN_DELIVERY");
        assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
        assert.equal(calls, 0);
      } finally {
        await clean([id]);
      }
    },
  );

  await t.test(
    "a rolled-back claim remains approved and eventually sends exactly once",
    async () => {
      const id = await seed();
      let armed = false,
        injected = 0,
        calls = 0;
      const wrapped = lostCommitAcknowledgement(
        () => armed,
        () => {
          armed = false;
          injected++;
        },
        true,
      );
      const transport = new MockTransport();
      transport.replyToMessage = async () => {
        calls++;
        return { providerMessageId: "synthetic-after-rollback" };
      };
      const stop = await startMockWorker(wrapped, transport);
      armed = true;
      try {
        await waitFor(
          async () => injected === 1,
          "ROLLBACK_FAULT_NOT_INJECTED",
        );
        await waitFor(
          async () => (await row(id)).status === "SENT",
          "ROLLED_BACK_APPROVAL_LOST",
        );
        assert.equal(calls, 1);
        assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
      } finally {
        await stop();
        await clean([id]);
      }
    },
  );

  await t.test(
    "pending result persistence blocks the next send until DB recovery",
    async () => {
      const first = await seed(),
        second = await seed();
      const calls: string[] = [];
      const transport = new MockTransport();
      transport.replyToMessage = async (target) => {
        calls.push(target.jobId);
        return { providerMessageId: "synthetic-queue-" + target.jobId };
      };
      await pool.query(
        "CREATE FUNCTION synthetic_outbox_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic unavailable result store' USING ERRCODE='40001'; END $$",
      );
      await pool.query(
        `CREATE TRIGGER synthetic_outbox_unavailable BEFORE UPDATE ON reply_jobs FOR EACH ROW WHEN (NEW.id='${first}'::uuid AND NEW.status IN ('SENT','FAILED','UNKNOWN_DELIVERY')) EXECUTE FUNCTION synthetic_outbox_unavailable()`,
      );
      const stop = await startMockWorker(pool, transport);
      try {
        await waitFor(async () => calls.length === 1, "FIRST_SEND_NOT_CALLED");
        await delay(1250);
        assert.deepEqual(calls, [first]);
        assert.equal((await row(second)).status, "APPROVED");
        await removeFault();
        await waitFor(
          async () => (await row(second)).status === "SENT",
          "QUEUE_DID_NOT_CONTINUE",
        );
        assert.deepEqual(calls, [first, second]);
        assert.equal((await row(first)).status, "SENT");
        assert.deepEqual(await events(first), { audit: 1, notifications: 1 });
        assert.deepEqual(await events(second), { audit: 1, notifications: 1 });
      } finally {
        await stop();
        await clean([first, second]);
      }
    },
  );

  await t.test(
    "failed startup recovery rolls back notification and releases the provider lease",
    async () => {
      const id = await seed("SENDING");
      await pool.query(
        "CREATE FUNCTION synthetic_outbox_start_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic recovery transaction failure' USING ERRCODE='40001'; END $$",
      );
      await pool.query(
        `CREATE TRIGGER synthetic_outbox_start_failure BEFORE INSERT ON audit_events FOR EACH ROW WHEN (NEW.target_id='${id}'::uuid AND NEW.action='REPLY_DELIVERY_UNKNOWN') EXECUTE FUNCTION synthetic_outbox_start_failure()`,
      );
      let unexpectedStop: (() => Promise<void>) | undefined;
      try {
        await assert.rejects(
          async () => {
            unexpectedStop = await startMockWorker(pool, new MockTransport());
          },
          { code: "40001" },
        );
        assert.equal((await row(id)).status, "SENDING");
        assert.deepEqual(await events(id), { audit: 0, notifications: 0 });
        await pool.query(
          "DROP TRIGGER synthetic_outbox_start_failure ON audit_events",
        );
        await pool.query("DROP FUNCTION synthetic_outbox_start_failure()");
        await waitFor(
          async () =>
            (
              await pool.query(
                "SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=8240002 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
              )
            ).rows[0].n === 0,
          "FAILED_START_LEASE_RETAINED",
        );
        const stop = await startMockWorker(pool, new MockTransport());
        await stop();
        assert.equal((await row(id)).status, "UNKNOWN_DELIVERY");
        assert.deepEqual(await events(id), { audit: 1, notifications: 1 });
      } finally {
        if (unexpectedStop) await unexpectedStop();
        await pool.query(
          "DROP TRIGGER IF EXISTS synthetic_outbox_start_failure ON audit_events",
        );
        await pool.query(
          "DROP FUNCTION IF EXISTS synthetic_outbox_start_failure()",
        );
        await clean([id]);
      }
    },
  );
});
