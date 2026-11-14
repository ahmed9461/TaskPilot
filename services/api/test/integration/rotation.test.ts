import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool, transaction } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { Vault, hash } from "../../src/security.js";
import { rewrapFields } from "../../src/key-rotation.js";
import { Service } from "../../src/service.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("transactional encryption rotation with rollback and all AAD domains", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  t.after(() => pool.end());
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,key_rotation_runs CASCADE",
  );
  const oldKey = randomBytes(32).toString("base64"),
    newKey = randomBytes(32).toString("base64");
  const old = new Vault(oldKey),
    next = new Vault(
      JSON.stringify({
        format: "taskpilot-keyring-v1",
        active: 2,
        keys: { 2: newKey },
      }),
    );
  const session = randomUUID(),
    task = randomUUID(),
    group = randomUUID(),
    source = randomUUID(),
    account = randomUUID(),
    authId = hash("synthetic-auth"),
    external = "synthetic-queued";
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'rotation fixture','mock')",
    [session],
  );
  await pool.query(
    "INSERT INTO task_types(id,code,name) VALUES($1,'rotation_fixture','Rotation')",
    [task],
  );
  await pool.query(
    "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'rotation','Rotation',$3,'synthetic-rotation','test')",
    [group, session, task],
  );
  await pool.query(
    "INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,'synthetic-rotation','synthetic-fixture','Fixture')",
    [account],
  );
  const vectors = [
    {
      table: "account_credentials",
      field: "ciphertext",
      aad: `credential:${account}`,
      value: "synthetic-credential",
    },
    {
      table: "source_messages",
      field: "encrypted_payload",
      aad: `message:${source}`,
      value: "synthetic-review",
    },
    {
      table: "source_messages",
      field: "encrypted_transport_key",
      aad: `wa-source:${source}`,
      value: '{"synthetic":"quote"}',
    },
    {
      table: "whatsapp_ingress",
      field: "encrypted_payload",
      aad: `wa-ingress:${session}:${group}:${hash(external)}`,
      value: '{"synthetic":"ingress"}',
    },
    {
      table: "whatsapp_auth",
      field: "encrypted_payload",
      aad: `wa-auth:${session}:creds:${authId}`,
      value: '{"me":{"id":"synthetic-identity"}}',
    },
  ];
  await pool.query(
    "INSERT INTO account_credentials(account_id,ciphertext,key_version) VALUES($1,$2,1)",
    [account, old.seal(vectors[0]!.value, vectors[0]!.aad)],
  );
  await pool.query(
    "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_payload,encrypted_transport_key) VALUES($1,$2,$3,'review','REVIEW',$4,$5)",
    [
      source,
      session,
      group,
      old.seal(vectors[1]!.value, vectors[1]!.aad),
      old.seal(vectors[2]!.value, vectors[2]!.aad),
    ],
  );
  await pool.query(
    "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,encrypted_payload) VALUES($1,$2,$3,$4)",
    [session, group, external, old.seal(vectors[3]!.value, vectors[3]!.aad)],
  );
  await pool.query(
    "INSERT INTO whatsapp_auth(session_id,category,id_hash,encrypted_payload) VALUES($1,'creds',$2,$3)",
    [session, authId, old.seal(vectors[4]!.value, vectors[4]!.aad)],
  );
  async function ciphertext(v: (typeof vectors)[number]) {
    return (await pool.query(`SELECT ${v.field} value FROM ${v.table} LIMIT 1`))
      .rows[0].value;
  }
  await t.test(
    "failure after rewrap rolls every field back and keeps old snapshots readable",
    async () => {
      await assert.rejects(() =>
        transaction(pool, async (c) => {
          await rewrapFields(c, old, next);
          throw Error("simulated crash before commit");
        }),
      );
      for (const v of vectors)
        assert.equal(old.open(await ciphertext(v), v.aad), v.value);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM key_rotation_runs"))
          .rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "corrupt auth ciphertext cannot commit a partial rotation",
    async () => {
      const original = await ciphertext(vectors[4]!);
      await pool.query("UPDATE whatsapp_auth SET encrypted_payload='invalid'");
      await assert.rejects(() =>
        transaction(pool, (c) => rewrapFields(c, old, next)),
      );
      assert.equal(
        old.open(await ciphertext(vectors[0]!), vectors[0]!.aad),
        vectors[0]!.value,
      );
      await pool.query("UPDATE whatsapp_auth SET encrypted_payload=$1", [
        original,
      ]);
    },
  );
  const bridge = new Vault(
    JSON.stringify({
      format: "taskpilot-keyring-v1",
      active: 2,
      keys: { 1: oldKey, 2: newKey },
    }),
  );
  await t.test(
    "resume accepts mixed legacy and new writes after precommit failure",
    async () => {
      await pool.query(
        "UPDATE whatsapp_auth SET encrypted_payload=$1,key_version=2",
        [bridge.seal(vectors[4]!.value, vectors[4]!.aad)],
      );
      await assert.rejects(() =>
        transaction(pool, (c) => rewrapFields(c, bridge, next)),
      );
      await assert.rejects(() =>
        transaction(pool, async (c) => {
          await rewrapFields(c, bridge, next, true);
          throw Error("resume transaction interrupted");
        }),
      );
      for (const v of vectors)
        assert.equal(bridge.open(await ciphertext(v), v.aad), v.value);
    },
  );
  await t.test(
    "committed rotation preserves content and identity, retires old key and writes key versions",
    async () => {
      await transaction(pool, async (c) => {
        const result = await rewrapFields(c, bridge, next, true);
        assert.equal(
          Object.values(result.counts).reduce((a, b) => a + b, 0),
          5,
        );
        await c.query(
          "INSERT INTO key_rotation_runs(id,key_version,counts) VALUES('rotation-123',2,$1)",
          [JSON.stringify(result.counts)],
        );
      });
      for (const v of vectors) {
        const sealed = await ciphertext(v);
        assert.equal(next.open(sealed, v.aad), v.value);
        assert.throws(() => old.open(sealed, v.aad));
      }
      assert.equal(
        (await pool.query("SELECT key_version FROM whatsapp_auth")).rows[0]
          .key_version,
        2,
      );
      assert.equal(
        (await pool.query("SELECT key_version FROM account_credentials"))
          .rows[0].key_version,
        2,
      );
      await transaction(pool, (c) =>
        new Service(pool, next).account(c, {
          namespace: "synthetic-rotation",
          username: "next-write",
          displayName: "New fixture",
          password: "synthetic-new-credential",
        }),
      );
      assert.equal(
        (await pool.query("SELECT min(key_version) v FROM account_credentials"))
          .rows[0].v,
        2,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM source_messages WHERE state='REVIEW'",
          )
        ).rows[0].n,
        1,
      );
    },
  );
});
