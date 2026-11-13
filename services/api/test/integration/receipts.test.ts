import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool, transaction } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { recordReceipt, receiptSummary } from "../../src/whatsapp/receipts.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("durable receive diagnostic ledger without bodies or provider sockets", async (t) => {
  await migrate(url);
  const pool = createPool(url),
    session = randomUUID(),
    group = randomUUID(),
    task = randomUUID();
  try {
    await pool.query(
      "INSERT INTO whatsapp_sessions(id,label,provider,status) VALUES($1,'Synthetic receipt','baileys','STOPPED')",
      [session],
    );
    await pool.query(
      "INSERT INTO task_types(id,code,name) VALUES($1,$2,'Synthetic receipt')",
      [task, "receipt-" + task],
    );
    await pool.query(
      "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'123-456@g.us','Synthetic receipt',$3,'synthetic-receipt','test')",
      [group, session, task],
    );
    await t.test(
      "accepted receipt rolls back with ingress and preserves first rejection on recovery",
      async () => {
        await assert.rejects(
          transaction(pool, async (c) => {
            await recordReceipt(
              c,
              session,
              group,
              "synthetic-private-message",
              "ACCEPTED_TEXT",
              3,
            );
            throw Error("synthetic rollback");
          }),
        );
        assert.equal((await receiptSummary(pool, session)).recorded, 0);
        await transaction(pool, (c) =>
          recordReceipt(
            c,
            session,
            group,
            "synthetic-private-message",
            "NO_CONTENT",
            128,
          ),
        );
        await transaction(pool, async (c) => {
          await recordReceipt(
            c,
            session,
            group,
            "synthetic-private-message",
            "ACCEPTED_TEXT",
            3,
          );
          await c.query(
            "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,state) VALUES($1,$2,'synthetic-private-message','DONE')",
            [session, group],
          );
        });
        const summary = await receiptSummary(pool, session);
        assert.equal(summary.recorded, 1);
        assert.equal(summary.accepted, 1);
        assert.equal(summary.acceptedWithoutIngress, 0);
        assert.equal(summary.withSenderKeyMetadata, 1);
        assert.deepEqual(summary.firstReasons, { NO_CONTENT: 1 });
        assert.deepEqual(summary.lastReasons, { ACCEPTED_TEXT: 1 });
        const rows = (
          await pool.query(
            "SELECT * FROM whatsapp_receipts WHERE session_id=$1",
            [session],
          )
        ).rows;
        assert.equal(rows[0].observations, 2);
        assert.equal(rows[0].first_flags, 128);
        assert.equal(rows[0].last_flags, 3);
        assert.equal(
          JSON.stringify(rows).includes("synthetic-private-message"),
          false,
        );
        assert.equal(JSON.stringify(summary).includes("@"), false);
      },
    );
    await t.test(
      "receipt remains available through an independent connection",
      async () => {
        const fresh = createPool(url);
        try {
          assert.equal((await receiptSummary(fresh, session)).accepted, 1);
        } finally {
          await fresh.end();
        }
      },
    );
    await t.test(
      "new diagnostic retention evicts aged/overflow receipts without deleting ingress",
      async () => {
        await pool.query(
          "INSERT INTO whatsapp_receipts(session_id,group_id,message_hash,first_reason,last_reason,first_flags,last_flags,last_seen) SELECT $1,$2,encode(sha256(convert_to('synthetic-overflow-'||i,'UTF8')),'hex'),'OTHER_EVENT','OTHER_EVENT',0,0,now() FROM generate_series(1,10001) i",
          [session, group],
        );
        await pool.query(
          "UPDATE whatsapp_receipts SET last_seen=now()-interval '8 days' WHERE session_id=$1 AND first_reason='NO_CONTENT'",
          [session],
        );
        await transaction(pool, (c) =>
          recordReceipt(
            c,
            session,
            group,
            "synthetic-retention",
            "OTHER_EVENT",
            0,
          ),
        );
        assert.ok(
          (await pool.query("SELECT count(*)::int n FROM whatsapp_receipts"))
            .rows[0].n <= 10000,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int n FROM whatsapp_receipts WHERE last_seen<now()-interval '7 days'",
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int n FROM whatsapp_ingress WHERE session_id=$1",
              [session],
            )
          ).rows[0].n,
          1,
        );
      },
    );
  } finally {
    await pool.query("DELETE FROM whatsapp_ingress WHERE session_id=$1", [
      session,
    ]);
    await pool.query("DELETE FROM groups WHERE id=$1", [group]);
    await pool.query("DELETE FROM whatsapp_sessions WHERE id=$1", [session]);
    await pool.query("DELETE FROM task_types WHERE id=$1", [task]);
    await pool.end();
  }
});
