import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { Vault, hash } from "../../src/security.js";
import { Service } from "../../src/service.js";
import { PgAuthStore } from "../../src/whatsapp/auth-store.js";
import { WhatsAppConnector } from "../../src/whatsapp/connector.js";
import {
  baileysFactory,
  type LiveSocket,
  type SocketUpdate,
  type SocketFactory,
} from "../../src/whatsapp/socket.js";
import { dispatchOne, startMockWorker } from "../../src/outbox.js";
import { MockTransport } from "../../src/transport.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

class FakeSocket implements LiveSocket {
  update = (_: SocketUpdate) => {};
  creds = (_: any) => {};
  messages = (_: unknown[], _type: string) => {};
  sent: any[] = [];
  ended = 0;
  fail = false;
  onUpdate(fn: typeof this.update) {
    this.update = fn;
  }
  onCreds(fn: typeof this.creds) {
    this.creds = fn;
  }
  onMessages(fn: typeof this.messages) {
    this.messages = fn;
  }
  async groups() {
    return [
      { id: "123-456@g.us", title: "Synthetic selected" },
      { id: "456-789@g.us", title: "Synthetic unselected" },
    ];
  }
  async send(...args: any[]) {
    this.sent.push(args);
    if (this.fail) throw Error("ambiguous synthetic relay");
    return "synthetic-provider-id";
  }
  async end() {
    this.ended++;
  }
}

test("WhatsApp adapter PostgreSQL acceptance with fake sockets only", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE",
  );
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
    mockEnabled: true,
  };
  const vault = new Vault(config.encryptionKey);
  const service = new Service(pool, vault);
  const codec = (await baileysFactory()).codec;
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; delay: number; canceled: boolean }[] = [];
  let now = Date.now(),
    loads = 0;
  const factory: SocketFactory = {
    codec,
    create() {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  };
  const connector = new WhatsAppConnector(
    pool,
    vault,
    { connectionEnabled: true, sendingEnabled: false },
    async () => {
      loads++;
      return factory;
    },
    (fn, delay) => {
      const item = { fn, delay, canceled: false };
      timers.push(item);
      return () => {
        item.canceled = true;
      };
    },
    () => now,
  );
  const app = await createApp(pool, config, connector);
  const h = { authorization: `Bearer ${config.apiToken}` },
    sensitive = { ...h, "x-reauth-secret": config.reauthSecret };
  async function req(method: any, path: string, body?: any, auth = false) {
    return app.inject({
      method,
      url: path,
      headers: auth ? sensitive : h,
      ...(body ? { payload: body } : {}),
    });
  }
  async function ok(method: any, path: string, body?: any, auth = false) {
    const r = await req(method, path, body, auth);
    assert.equal(r.statusCode, 200, `${path}: ${r.body}`);
    return r.json();
  }
  t.after(async () => {
    await connector.close();
    await app.close();
    await pool.end();
  });
  const session = await ok("POST", "/v1/sessions", {
    label: "Synthetic live adapter",
    provider: "baileys",
  });
  const task = await ok("POST", "/v1/task-types", {
    code: "synthetic-wa",
    name: "Synthetic task",
  });
  let group: any;
  await t.test(
    "API requires reauth and explicit unofficial acknowledgement; policy false never imports",
    async () => {
      const disabled = new WhatsAppConnector(
        pool,
        vault,
        { connectionEnabled: false, sendingEnabled: false },
        async () => {
          throw Error("must not load");
        },
      );
      const disabledApp = await createApp(pool, config, disabled);
      const payload = {
        confirmation: "CONNECT WHATSAPP",
        acknowledgeUnofficial: true,
      };
      assert.equal(
        (
          await disabledApp.inject({
            method: "POST",
            url: `/v1/sessions/${session.id}/connect`,
            headers: sensitive,
            payload,
          })
        ).json().code,
        "LIVE_WHATSAPP_NOT_AUTHORIZED",
      );
      await disabledApp.close();
      assert.equal(
        (await req("POST", `/v1/sessions/${session.id}/connect`, payload))
          .statusCode,
        403,
      );
      assert.equal(
        (
          await req(
            "POST",
            `/v1/sessions/${session.id}/connect`,
            { confirmation: "CONNECT WHATSAPP" },
            true,
          )
        ).statusCode,
        400,
      );
      assert.equal(loads, 0);
      await ok("POST", `/v1/sessions/${session.id}/connect`, payload, true);
      assert.equal(sockets.length, 1);
      assert.equal(
        (await req("POST", `/v1/sessions/${session.id}/pairing`)).statusCode,
        403,
      );
    },
  );
  await t.test(
    "QR is ephemeral/reauthed and never appears in session lists/audit/auth plaintext",
    async () => {
      sockets[0]!.update({ qr: "synthetic-qr-not-a-real-pairing-code" });
      await connector.settled(session.id);
      const qr = await ok(
        "POST",
        `/v1/sessions/${session.id}/pairing`,
        {},
        true,
      );
      assert.ok(qr.image.startsWith("data:image/png;base64,"));
      assert.equal(qr.expiresInSeconds, 45);
      assert.equal(
        JSON.stringify(await ok("GET", "/v1/sessions")).includes(
          "synthetic-qr",
        ),
        false,
      );
      assert.equal(
        JSON.stringify(
          (await pool.query("SELECT * FROM audit_events")).rows,
        ).includes("synthetic-qr"),
        false,
      );
      now += 46000;
      assert.equal(
        (
          await req("POST", `/v1/sessions/${session.id}/pairing`, {}, true)
        ).json().code,
        "PAIRING_QR_EXPIRED",
      );
      sockets[0]!.update({ connection: "open" });
      await connector.settled(session.id);
    },
  );
  await t.test(
    "discover/bind selected groups; mock endpoint cannot forge a live source",
    async () => {
      const payload = {
        sessionId: session.id,
        externalGroupId: "123-456@g.us",
        title: "Synthetic selected",
        taskTypeId: task.id,
        namespace: "synthetic-wa",
        periodKey: "test",
      };
      assert.equal(
        (await req("POST", "/v1/groups", payload, true)).json().code,
        "WHATSAPP_GROUP_NOT_DISCOVERED",
      );
      assert.equal(
        (
          await ok(
            "POST",
            `/v1/sessions/${session.id}/available-groups`,
            {},
            true,
          )
        ).length,
        2,
      );
      group = await ok("POST", "/v1/groups", payload, true);
      assert.equal(
        (
          await req("POST", "/v1/mock/messages", {
            sessionId: session.id,
            groupId: group.id,
            externalMessageId: "spoof",
            text: "user: synthetic",
          })
        ).json().code,
        "MOCK_SESSION_REQUIRED",
      );
    },
  );
  const raw = (
    id: string,
    user = "synthetic-wa-account",
    jid = "123-456@g.us",
  ) => ({
    key: { id, remoteJid: jid, participant: "123@lid", fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1000) + 1,
    message: {
      conversation: `name: Synthetic fixture\nuser: ${user}\npassword: synthetic-wa-secret`,
      senderKeyDistributionMessage: {
        groupId: jid,
        axolotlSenderKeyDistributionMessage: Buffer.from([1, 2, 3]),
      },
    },
  });
  async function enqueue(id: string, user?: string, type = "notify") {
    sockets.at(-1)!.messages([raw(id, user)], type);
    await connector.settled(session.id);
  }
  await t.test(
    "selected new text enters encrypted durable inbox exactly once and replays safely",
    async () => {
      const s = sockets[0]!;
      s.messages([raw("unselected", undefined, "456-789@g.us")], "notify");
      s.messages([{ ...raw("historical"), messageTimestamp: 0 }], "append");
      s.messages(
        [{ ...raw("self"), key: { ...raw("self").key, fromMe: true } }],
        "notify",
      );
      await enqueue("selected", undefined, "append");
      await enqueue("selected");
      assert.equal(
        (
          await app.inject({
            method: "GET",
            url: `/v1/sessions/${session.id}/receive-diagnostics`,
          })
        ).statusCode,
        401,
      );
      const diagnostics = await ok(
        "GET",
        `/v1/sessions/${session.id}/receive-diagnostics`,
      );
      assert.deepEqual(diagnostics.counts, {
        STALE_TIMESTAMP: 1,
        FROM_SELF: 1,
        ACCEPTED_TEXT: 2,
      });
      assert.equal(diagnostics.scope, "enabled-groups-only");
      assert.equal(diagnostics.resetOnProcessRestart, true);
      assert.equal(diagnostics.durable.acceptedAppendReceipts, 1);
      assert.equal(diagnostics.durable.acceptedWithoutIngress, 0);
      assert.equal(JSON.stringify(diagnostics).includes("@"), false);
      assert.equal(
        JSON.stringify(diagnostics).includes("synthetic-wa-secret"),
        false,
      );
      const pending = (await pool.query("SELECT * FROM whatsapp_ingress")).rows;
      assert.equal(pending.length, 1);
      assert.equal(pending[0].state, "PENDING");
      assert.equal(
        pending[0].encrypted_payload.includes("synthetic-wa-secret"),
        false,
      );
      assert.equal(await connector.drainOnce(), true);
      assert.equal(await connector.drainOnce(), false);
      const source = (await pool.query("SELECT * FROM source_messages"))
        .rows[0];
      assert.equal(source.state, "PROCESSED");
      assert.equal(source.encrypted_payload, null);
      assert.ok(source.encrypted_transport_key);
      assert.equal(source.encrypted_transport_key.includes("123@lid"), false);
      await enqueue("selected");
      assert.equal(await connector.drainOnce(), false);
      // Simulated crash after business commit but before inbox acknowledgement.
      const sealed = vault.seal(
        JSON.stringify({
          text: raw("selected").message.conversation,
          key: raw("selected").key,
        }),
        `wa-ingress:${session.id}:${group.id}:${hash("selected")}`,
      );
      await pool.query(
        "UPDATE whatsapp_ingress SET state='PENDING',encrypted_payload=$1",
        [sealed],
      );
      await connector.drainOnce();
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM assignment_sources"))
          .rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "rejected history burst cannot backpressure or populate the durable receive queue",
    async () => {
      const before = (
        await pool.query("SELECT count(*)::int n FROM source_messages")
      ).rows[0].n;
      sockets.at(-1)!.messages(
        Array.from({ length: 500 }, (_, i) => ({
          ...raw(`history-burst-${i}`),
          messageTimestamp: 0,
        })),
        "append",
      );
      await connector.settled(session.id);
      assert.equal(await connector.getSessionHealth(session.id), "CONNECTED");
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM source_messages"))
          .rows[0].n,
        before,
      );
      assert.equal(await connector.drainOnce(), false);
      const diagnostics = await ok(
        "GET",
        `/v1/sessions/${session.id}/receive-diagnostics`,
      );
      assert.equal(diagnostics.bestEffort, true);
      assert.ok(
        diagnostics.counts.STALE_TIMESTAMP > 1 &&
          diagnostics.counts.STALE_TIMESTAMP <= 11,
      );
    },
  );
  await t.test(
    "disabled bindings and pre-resume append packets cannot recreate old work",
    async () => {
      group = (await ok("GET", "/v1/groups")).find(
        (g: any) => g.id === group.id,
      );
      const disabled = await ok(
        "PATCH",
        `/v1/groups/${group.id}`,
        { version: group.version, enabled: false },
        true,
      );
      sockets.at(-1)!.messages([raw("while-disabled")], "notify");
      await connector.settled(session.id);
      group = await ok(
        "PATCH",
        `/v1/groups/${group.id}`,
        { version: disabled.version, enabled: true },
        true,
      );
      const row = (
        await pool.query(
          "UPDATE groups SET receive_after=now()+interval '5 seconds' WHERE id=$1 RETURNING receive_after",
          [group.id],
        )
      ).rows[0];
      await connector.refreshBindings(session.id);
      sockets.at(-1)!.messages(
        [
          {
            ...raw("pre-resume"),
            messageTimestamp:
              Math.floor(new Date(row.receive_after).getTime() / 1000) - 1,
          },
        ],
        "append",
      );
      await connector.settled(session.id);
      assert.equal(await connector.drainOnce(), false);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM whatsapp_ingress WHERE external_message_id IN ('while-disabled','pre-resume')",
          )
        ).rows[0].n,
        0,
      );
      await pool.query("UPDATE groups SET receive_after=now() WHERE id=$1", [
        group.id,
      ]);
      await connector.refreshBindings(session.id);
    },
  );
  await t.test(
    "auth key Buffer roundtrip, await durability, deletion, corrupt-state and epoch fencing",
    async () => {
      const store = new PgAuthStore(pool, vault, session.id, codec);
      const loaded = await store.load();
      await loaded.state.keys.set({
        "app-state-sync-key": {
          "synthetic-key": { keyData: Buffer.from([4, 5, 6]) },
        },
      });
      const keys = await (
        await new PgAuthStore(pool, vault, session.id, codec).load()
      ).state.keys.get("app-state-sync-key", ["synthetic-key"]);
      assert.deepEqual(
        Buffer.from(keys["synthetic-key"]!.keyData!),
        Buffer.from([4, 5, 6]),
      );
      await Promise.all([
        loaded.saveCreds({ registered: true }),
        loaded.saveCreds({ registered: false }),
      ]);
      assert.equal(await store.paired(), false);
      await loaded.state.keys.set({
        "app-state-sync-key": { "synthetic-key": null },
      });
      assert.deepEqual(
        await loaded.state.keys.get("app-state-sync-key", ["synthetic-key"]),
        {},
      );
      const epoch = randomUUID();
      await pool.query(
        "UPDATE whatsapp_sessions SET auth_epoch=$2 WHERE id=$1",
        [session.id, epoch],
      );
      const fenced = await new PgAuthStore(
        pool,
        vault,
        session.id,
        codec,
        epoch,
      ).load();
      await pool.query(
        "UPDATE whatsapp_sessions SET auth_epoch=$2 WHERE id=$1",
        [session.id, randomUUID()],
      );
      await assert.rejects(
        fenced.saveCreds({ registered: true }),
        /AUTH_LEASE_CHANGED/,
      );
      const auth = (
        await pool.query("SELECT * FROM whatsapp_auth WHERE session_id=$1", [
          session.id,
        ])
      ).rows[0];
      assert.equal(auth.encrypted_payload.includes("noiseKey"), false);
      await assert.rejects(
        new PgAuthStore(
          pool,
          new Vault(randomBytes(32).toString("base64")),
          session.id,
          codec,
        ).load(),
      );
    },
  );
  let job: any;
  await t.test(
    "mock worker cannot claim live replies; sending disabled leaves approval untouched",
    async () => {
      const assignment = (await ok("GET", "/v1/assignments"))[0];
      const template = await ok("POST", "/v1/reply-templates", {
        code: "synthetic-wa",
        body: "Synthetic approved reply",
      });
      const preview = await ok("POST", "/v1/reply-jobs/preview", {
        assignmentId: assignment.id,
        sourceMessageId: assignment.sources[0].id,
        templateId: template.id,
      });
      const denied = await req(
        "POST",
        "/v1/reply-jobs/approve",
        {
          approvalToken: preview.approvalToken,
          idempotencyKey: "synthetic-wa-job",
        },
        true,
      );
      assert.equal(denied.json().code, "LIVE_SENDING_NOT_AUTHORIZED");
      // Deliberate fixture only: seed an approved live job to verify provider isolation.
      job = await service.approveReply(
        preview.approvalToken,
        "synthetic-wa-job",
        true,
      );
      assert.equal(await dispatchOne(pool, new MockTransport()), null);
      assert.equal(await dispatchOne(pool, connector), null);
      assert.equal(
        (
          await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
            job.id,
          ])
        ).rows[0].status,
        "APPROVED",
      );
      assert.equal(sockets[0]!.sent.length, 0);
    },
  );
  await t.test(
    "transient retry is bounded/generation-safe; process lease prevents another connector",
    async () => {
      const competing = new WhatsAppConnector(
        pool,
        vault,
        { connectionEnabled: true, sendingEnabled: false },
        async () => factory,
      );
      await assert.rejects(
        competing.connect(session.id),
        /WHATSAPP_SESSION_IN_USE/,
      );
      sockets[0]!.update({ connection: "close", code: 408 });
      await connector.settled(session.id);
      assert.equal(timers.at(-1)!.delay, 2000);
      timers.at(-1)!.fn();
      await connector.settled(session.id);
      assert.equal(sockets.length, 2);
      sockets[0]!.update({ qr: "obsolete" });
      await connector.settled(session.id);
      assert.equal(
        await connector.getSessionHealth(session.id),
        "RECONNECTING",
      );
      sockets[1]!.update({ connection: "open" });
      await connector.settled(session.id);
    },
  );
  await t.test(
    "purge invalidates stale ingress preview and drops only matching pending identities",
    async () => {
      const account = (
        await pool.query(
          "SELECT * FROM accounts WHERE username_normalized='synthetic-wa-account'",
        )
      ).rows[0];
      const stale = await service.deletionPreview([account.id], false);
      await enqueue("pending-same");
      await enqueue("pending-other", "synthetic-other");
      await assert.rejects(
        service.deleteAccounts(stale.approvalToken, stale.confirmation),
        /STALE_PREVIEW/,
      );
      const fresh = await service.deletionPreview([account.id], false);
      assert.equal(fresh.pendingIngress, 2);
      await service.deleteAccounts(fresh.approvalToken, fresh.confirmation);
      const rows = (
        await pool.query(
          "SELECT external_message_id,state,encrypted_payload FROM whatsapp_ingress ORDER BY id",
        )
      ).rows;
      assert.equal(
        rows.find((r) => r.external_message_id === "pending-same").state,
        "DROPPED",
      );
      assert.equal(
        rows.find((r) => r.external_message_id === "pending-same")
          .encrypted_payload,
        null,
      );
      assert.equal(
        rows.find((r) => r.external_message_id === "pending-other").state,
        "PENDING",
      );
      await connector.drainOnce();
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM accounts WHERE username_normalized='synthetic-wa-account'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM accounts WHERE username_normalized='synthetic-other'",
          )
        ).rows[0].n,
        1,
      );
      // A received replay of the purged record is still a durable tombstone.
      await enqueue("pending-same");
      assert.equal(await connector.drainOnce(), false);
    },
  );
  await t.test(
    "task-only purge preserves account and discards matching pending ingress",
    async () => {
      await enqueue("task-first", "synthetic-task-only");
      await connector.drainOnce();
      const account = (
        await pool.query(
          "SELECT id FROM accounts WHERE username_normalized='synthetic-task-only'",
        )
      ).rows[0];
      const a = (
        await pool.query("SELECT id FROM assignments WHERE account_id=$1", [
          account.id,
        ])
      ).rows[0];
      await enqueue("task-pending", "synthetic-task-only");
      const p = await service.assignmentDeletionPreview(a.id);
      await service.deleteAssignment(a.id, p.approvalToken, p.confirmation);
      assert.equal(
        (
          await pool.query(
            "SELECT state,encrypted_payload FROM whatsapp_ingress WHERE external_message_id='task-pending'",
          )
        ).rows[0].state,
        "DROPPED",
      );
      assert.equal(await connector.drainOnce(), false);
      assert.equal(
        (
          await pool.query("SELECT count(*)::int n FROM accounts WHERE id=$1", [
            account.id,
          ])
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM assignments WHERE account_id=$1",
            [account.id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "poison ingress is quarantined after three attempts; unrelated queue continues and retry is reauthed",
    async () => {
      await pool.query(
        "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,encrypted_payload) VALUES($1,$2,'synthetic-corrupt','synthetic-invalid-ciphertext')",
        [session.id, group.id],
      );
      await enqueue("after-poison", "synthetic-other");
      for (let n = 0; n < 3; n++) await assert.rejects(connector.drainOnce());
      const row = (
        await pool.query(
          "SELECT * FROM whatsapp_ingress WHERE external_message_id='synthetic-corrupt'",
        )
      ).rows[0];
      assert.equal(row.state, "ERROR");
      assert.equal(row.attempts, 3);
      assert.equal(row.last_error_code, "INGRESS_PROCESSING_FAILED");
      assert.equal(await connector.drainOnce(), true);
      const errors = await ok("GET", "/v1/whatsapp/ingress-errors");
      assert.equal(errors.length, 1);
      assert.equal(JSON.stringify(errors).includes("encrypted_payload"), false);
      assert.equal(
        (
          await req("POST", `/v1/whatsapp/ingress-errors/${row.id}/retry`, {
            confirmation: "RETRY INGRESS",
          })
        ).statusCode,
        403,
      );
      await ok(
        "POST",
        `/v1/whatsapp/ingress-errors/${row.id}/retry`,
        { confirmation: "RETRY INGRESS" },
        true,
      );
      assert.equal(
        (
          await pool.query("SELECT state FROM whatsapp_ingress WHERE id=$1", [
            row.id,
          ])
        ).rows[0].state,
        "PENDING",
      );
      await pool.query(
        "UPDATE whatsapp_ingress SET state='DROPPED',encrypted_payload=NULL WHERE id=$1",
        [row.id],
      );
    },
  );
  await t.test(
    "fake authorized transport quotes exact source; ambiguous relay is terminal with no retry",
    async () => {
      await connector.disconnect(session.id);
      const sending = new WhatsAppConnector(
        pool,
        vault,
        { connectionEnabled: true, sendingEnabled: true },
        async () => factory,
      );
      try {
        await sending.connect(session.id);
        const s = sockets.at(-1)!;
        s.update({ connection: "open" });
        await sending.settled(session.id);
        const source = (
          await pool.query(
            "SELECT s.id,a.id assignment_id FROM source_messages s JOIN assignment_sources x ON x.source_message_id=s.id JOIN assignments a ON a.id=x.assignment_id WHERE s.external_message_id='pending-other' LIMIT 1",
          )
        ).rows[0];
        const template = (
          await pool.query("SELECT id FROM reply_templates LIMIT 1")
        ).rows[0];
        const p = await service.replyPreview({
          assignmentId: source.assignment_id,
          sourceMessageId: source.id,
          templateId: template.id,
        });
        const j = await service.approveReply(
          p.approvalToken,
          "synthetic-wa-relay",
          true,
        );
        s.fail = true;
        assert.equal(await dispatchOne(pool, sending), j.id);
        assert.equal(
          (
            await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
              j.id,
            ])
          ).rows[0].status,
          "UNKNOWN_DELIVERY",
        );
        assert.equal(s.sent.length, 1);
        assert.equal(s.sent[0][0], "123-456@g.us");
        assert.equal(s.sent[0][2].id, "pending-other");
        assert.equal(s.sent[0][3].length, 32);
        assert.equal(await dispatchOne(pool, sending), null);
        assert.equal(s.sent.length, 1);
        // Restart recovery is provider-scoped: mock recovery cannot alter a live SENDING job.
        await pool.query("UPDATE reply_jobs SET status='SENDING' WHERE id=$1", [
          j.id,
        ]);
        const stopMock = await startMockWorker(pool, new MockTransport());
        await stopMock();
        assert.equal(
          (
            await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
              j.id,
            ])
          ).rows[0].status,
          "SENDING",
        );
        const stopLive = await startMockWorker(pool, sending);
        await stopLive();
        assert.equal(
          (
            await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
              j.id,
            ])
          ).rows[0].status,
          "UNKNOWN_DELIVERY",
        );
        s.update({ connection: "close", code: 401 });
        await sending.settled(session.id);
        assert.equal(
          await sending.getSessionHealth(session.id),
          "REAUTH_REQUIRED",
        );
        assert.equal(sending.canSend(session.id), false);
      } finally {
        await sending.close();
      }
    },
  );
  await t.test(
    "QR-paired identity restarts despite registered=false; unpaired auth and retry exhaustion require owner action",
    async () => {
      const store = await new PgAuthStore(
        pool,
        vault,
        session.id,
        codec,
      ).load();
      await store.saveCreds({
        registered: false,
        me: { id: "123:1@s.whatsapp.net", name: "Synthetic paired identity" },
      });
      await pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=true WHERE id=$1",
        [session.id],
      );
      const recovery = new WhatsAppConnector(
        pool,
        vault,
        { connectionEnabled: true, sendingEnabled: false },
        async () => factory,
      );
      const before = sockets.length;
      await recovery.restore();
      assert.equal(sockets.length, before + 1);
      await recovery.close();
      await (
        await new PgAuthStore(pool, vault, session.id, codec).load()
      ).saveCreds({ registered: false, me: undefined });
      const unpaired = new WhatsAppConnector(
        pool,
        vault,
        { connectionEnabled: true, sendingEnabled: false },
        async () => factory,
      );
      await unpaired.restore();
      assert.equal(sockets.length, before + 1);
      assert.equal(
        await unpaired.getSessionHealth(session.id),
        "REAUTH_REQUIRED",
      );
      await unpaired.close();
      await connector.connect(session.id);
      for (let attempt = 1; attempt <= 6; attempt++) {
        sockets.at(-1)!.update({ connection: "close", code: 408 });
        await connector.settled(session.id);
        if (attempt <= 5) {
          assert.equal(timers.at(-1)!.delay, 2000 * 2 ** (attempt - 1));
          timers.at(-1)!.fn();
          await connector.settled(session.id);
        }
      }
      assert.equal(await connector.getSessionHealth(session.id), "ERROR");
      assert.equal(
        (
          await pool.query(
            "SELECT connect_requested FROM whatsapp_sessions WHERE id=$1",
            [session.id],
          )
        ).rows[0].connect_requested,
        false,
      );
    },
  );
});
