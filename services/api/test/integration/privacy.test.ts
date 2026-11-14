import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { Service } from "../../src/service.js";
import { PrivacyService } from "../../src/privacy.js";
import { Vault, hash } from "../../src/security.js";
import { PgAuthStore } from "../../src/whatsapp/auth-store.js";
import { WhatsAppConnector } from "../../src/whatsapp/connector.js";
import { baileysFactory } from "../../src/whatsapp/socket.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("privacy retention and stopped-session forgetting with synthetic data only", async (t) => {
  await migrate(url);
  const pool = createPool(url),
    config = {
      apiToken: randomBytes(32).toString("hex"),
      reauthSecret: randomBytes(32).toString("hex"),
      encryptionKey: randomBytes(32).toString("base64"),
      mockEnabled: true,
    };
  const vault = new Vault(config.encryptionKey),
    service = new Service(pool, vault),
    privacy = new PrivacyService(pool, service),
    codec = (await baileysFactory()).codec;
  let loads = 0;
  const connector = new WhatsAppConnector(
    pool,
    vault,
    { connectionEnabled: true, sendingEnabled: false },
    async () => {
      loads++;
      throw Error("NO_NETWORK_ALLOWED");
    },
  );
  const app = await createApp(pool, config, connector);
  t.after(async () => {
    await connector.close();
    await app.close();
    await pool.end();
  });
  const req = (method: any, path: string, body?: any, sensitive = false) =>
    app.inject({
      method,
      url: path,
      headers: {
        authorization: "Bearer " + config.apiToken,
        ...(sensitive ? { "x-reauth-secret": config.reauthSecret } : {}),
      },
      ...(body === undefined ? {} : { payload: body }),
    });
  async function ok(method: any, path: string, body?: any, sensitive = false) {
    const r = await req(method, path, body, sensitive);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  }
  let session: string,
    other: string,
    group: string,
    task: string,
    account: string,
    source: string,
    review: string;
  async function reset() {
    await pool.query(
      "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,client_sessions,notifications,audit_events CASCADE",
    );
    await pool.query(
      "UPDATE retention_policy SET review_days=30,failed_ingress_days=14,expired_access_days=1,read_notification_days=90,version=1 WHERE id=true",
    );
    session = randomUUID();
    other = randomUUID();
    group = randomUUID();
    task = randomUUID();
    account = randomUUID();
    source = randomUUID();
    review = randomUUID();
    await pool.query(
      "INSERT INTO whatsapp_sessions(id,label,provider,status,auth_epoch) VALUES($1,'Synthetic privacy','baileys','STOPPED',$3),($2,'Synthetic other','baileys','STOPPED',$4)",
      [session, other, randomUUID(), randomUUID()],
    );
    await pool.query(
      "INSERT INTO task_types(id,code,name) VALUES($1,'privacy_fixture','Synthetic privacy task')",
      [task],
    );
    await pool.query(
      "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'123-456@g.us','Synthetic group',$3,'synthetic-privacy','test')",
      [group, session, task],
    );
    await service.ingest(
      {
        sessionId: session,
        groupId: group,
        externalMessageId: "synthetic-processed",
        text: "الاسم: حساب وهمي\nاليوزر: synthetic-privacy\nكلمة المرور: synthetic-private-only",
      },
      {
        remoteJid: "123-456@g.us",
        id: "synthetic-processed",
        participant: "123@lid",
        fromMe: false,
      },
    );
    const a = (await pool.query("SELECT id FROM accounts")).rows[0];
    account = a.id;
    source = (await pool.query("SELECT id FROM source_messages")).rows[0].id;
    await pool.query(
      "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_payload,received_at) VALUES($1,$2,$3,'synthetic-review','REVIEW',$4,now()-interval '40 days')",
      [
        review,
        session,
        group,
        vault.seal("synthetic-private-review-only", `message:${review}`),
      ],
    );
    for (const id of [session, other])
      await new PgAuthStore(pool, vault, id, codec).load();
  }
  async function seedExpired() {
    await pool.query(
      "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,state,encrypted_payload,received_at) VALUES($1,$2,'synthetic-error','ERROR','synthetic-encrypted-error',now()-interval '20 days'),($1,$2,'synthetic-pending','PENDING','synthetic-encrypted-pending',now()-interval '40 days')",
      [session, group],
    );
    await pool.query(
      "INSERT INTO approvals(token_hash,purpose,payload,expires_at) VALUES($1,'synthetic','{}',now()-interval '2 days')",
      [hash("synthetic-expired-approval")],
    );
    await pool.query(
      "INSERT INTO client_sessions(id,token_hash,expires_at) VALUES($1,$2,now()-interval '2 days')",
      [randomUUID(), hash("synthetic-expired-client")],
    );
    await pool.query(
      "INSERT INTO notifications(type,read_at,created_at) VALUES('SYNTHETIC',now()-interval '100 days',now()-interval '100 days'),('SYNTHETIC',NULL,now()-interval '100 days')",
    );
    await pool.query(
      "INSERT INTO whatsapp_receipts(session_id,group_id,message_hash,first_reason,last_reason,first_flags,last_flags,first_seen,last_seen) VALUES($1,$2,$3,'NO_CONTENT','NO_CONTENT',0,0,now()-interval '8 days',now()-interval '8 days')",
      [session, group, hash("synthetic-diagnostic")],
    );
  }
  await t.test(
    "policy requires auth/reauth, validates limits and rejects stale versions",
    async () => {
      await reset();
      assert.equal(
        (await app.inject({ url: "/v1/privacy/retention" })).statusCode,
        401,
      );
      const policy = await ok("GET", "/v1/privacy/retention");
      assert.equal(policy.review_days, 30);
      assert.equal(policy.execution, "EXPLICIT_PREVIEW_AND_CONFIRMATION");
      const p = {
        version: 1,
        reviewDays: 7,
        failedIngressDays: 7,
        expiredAccessDays: 1,
        readNotificationDays: 30,
      };
      assert.equal(
        (await req("PATCH", "/v1/privacy/retention", p)).statusCode,
        403,
      );
      assert.equal(
        (
          await req(
            "PATCH",
            "/v1/privacy/retention",
            { ...p, reviewDays: 0 },
            true,
          )
        ).statusCode,
        400,
      );
      assert.equal(
        (await ok("PATCH", "/v1/privacy/retention", p, true)).version,
        2,
      );
      assert.equal(
        (await req("PATCH", "/v1/privacy/retention", p, true)).statusCode,
        409,
      );
    },
  );
  await t.test(
    "explicit bounded cleanup removes expired raw/access only and keeps business/unread/auth",
    async () => {
      await reset();
      await seedExpired();
      const p = await ok("POST", "/v1/privacy/retention-preview", {});
      assert.deepEqual(p.counts, {
        reviews: 1,
        failedIngress: 1,
        expiredApprovals: 1,
        expiredClients: 1,
        readNotifications: 1,
        diagnostics: 1,
      });
      assert.ok(!JSON.stringify(p).includes("synthetic-private"));
      assert.equal(
        (
          await req("POST", "/v1/privacy/retention-execute", {
            approvalToken: p.approvalToken,
            confirmation: p.confirmation,
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await req(
            "POST",
            "/v1/privacy/retention-execute",
            { approvalToken: p.approvalToken, confirmation: "wrong" },
            true,
          )
        ).statusCode,
        400,
      );
      await ok(
        "POST",
        "/v1/privacy/retention-execute",
        { approvalToken: p.approvalToken, confirmation: p.confirmation },
        true,
      );
      const row = (
        await pool.query(
          "SELECT state,encrypted_payload FROM source_messages WHERE id=$1",
          [review],
        )
      ).rows[0];
      assert.deepEqual(row, { state: "IGNORED", encrypted_payload: null });
      const counts = (
        await pool.query(
          "SELECT (SELECT count(*)::int FROM accounts) accounts,(SELECT count(*)::int FROM assignments) assignments,(SELECT count(*)::int FROM account_credentials) credentials,(SELECT count(*)::int FROM whatsapp_auth) auth,(SELECT count(*)::int FROM source_messages WHERE encrypted_transport_key IS NOT NULL) quotes,(SELECT count(*)::int FROM whatsapp_ingress WHERE state='PENDING' AND encrypted_payload IS NOT NULL) pending,(SELECT count(*)::int FROM notifications WHERE type='SYNTHETIC' AND read_at IS NULL) unread",
        )
      ).rows[0];
      assert.deepEqual(counts, {
        accounts: 1,
        assignments: 1,
        credentials: 1,
        auth: 2,
        quotes: 1,
        pending: 1,
        unread: 1,
      });
      assert.equal(
        (
          await req(
            "POST",
            "/v1/privacy/retention-execute",
            { approvalToken: p.approvalToken, confirmation: p.confirmation },
            true,
          )
        ).statusCode,
        409,
      );
    },
  );
  await t.test(
    "changed review invalidates all cleanup and transaction consumes no approval",
    async () => {
      await reset();
      await seedExpired();
      const p = await privacy.retentionPreview();
      await pool.query(
        "UPDATE source_messages SET version=version+1 WHERE id=$1",
        [review],
      );
      await assert.rejects(
        privacy.retentionExecute(p.approvalToken, p.confirmation),
        /STALE_PREVIEW/,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM client_sessions"))
          .rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT consumed_at FROM approvals WHERE token_hash=$1",
            [hash(p.approvalToken)],
          )
        ).rows[0].consumed_at,
        null,
      );
    },
  );
  await t.test(
    "new policy invalidates preview and expired token cannot execute",
    async () => {
      await reset();
      const p = await privacy.retentionPreview();
      await pool.query(
        "UPDATE retention_policy SET version=version+1 WHERE id=true",
      );
      await assert.rejects(
        privacy.retentionExecute(p.approvalToken, p.confirmation),
        /STALE_PREVIEW/,
      );
      const q = await privacy.retentionPreview();
      await pool.query(
        "UPDATE approvals SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
        [hash(q.approvalToken)],
      );
      await assert.rejects(
        privacy.retentionExecute(q.approvalToken, q.confirmation),
        /APPROVAL_EXPIRED_OR_CONSUMED/,
      );
    },
  );
  await t.test(
    "in-flight AI excludes raw review and newly eligible rows stay outside frozen IDs",
    async () => {
      await reset();
      await pool.query(
        "INSERT INTO ai_requests(id,idempotency_hash,source_id,source_version,settings_version,provider,model,status,candidate_codes,reserved_tokens) VALUES($1,$2,$3,1,1,'deepseek','synthetic','REQUESTED','[]',100)",
        [randomUUID(), hash("synthetic-ai"), review],
      );
      const p = await privacy.retentionPreview();
      assert.equal(p.counts.reviews, 0);
      await pool.query(
        "UPDATE ai_requests SET status='UNAVAILABLE' WHERE source_id=$1",
        [review],
      );
      await privacy.retentionExecute(p.approvalToken, p.confirmation);
      assert.ok(
        (
          await pool.query(
            "SELECT encrypted_payload FROM source_messages WHERE id=$1",
            [review],
          )
        ).rows[0].encrypted_payload,
      );
    },
  );
  await t.test("1000-row per-class limit and explicit next batch", async () => {
    await reset();
    await pool.query("DELETE FROM source_messages WHERE id=$1", [review]);
    const rows = Array.from({ length: 1001 }, () => {
      const id = randomUUID();
      return { id, cipher: vault.seal("synthetic-review", `message:${id}`) };
    });
    await pool.query(
      "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_payload,received_at) SELECT x.id,$1,$2,x.id::text,'REVIEW',x.cipher,now()-interval '40 days' FROM jsonb_to_recordset($3::jsonb) x(id uuid,cipher text)",
      [session, group, JSON.stringify(rows)],
    );
    const p = await privacy.retentionPreview();
    assert.equal(p.counts.reviews, 1000);
    assert.equal(p.more.reviews, true);
    await privacy.retentionExecute(p.approvalToken, p.confirmation);
    assert.equal((await privacy.retentionPreview()).counts.reviews, 1);
  });
  await t.test(
    "active connection or another process lease prevents forgetting",
    async () => {
      await reset();
      await pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=true,status='CONNECTED' WHERE id=$1",
        [session],
      );
      await assert.rejects(
        privacy.forgetPreview(session),
        /STOP_SESSION_BEFORE_FORGETTING/,
      );
      await pool.query(
        "UPDATE whatsapp_sessions SET connect_requested=false,status='STOPPED' WHERE id=$1",
        [session],
      );
      const lease = await pool.connect();
      try {
        await lease.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
          "taskpilot-wa:" + session,
        ]);
        await assert.rejects(
          privacy.forgetPreview(session),
          /WHATSAPP_SESSION_IN_USE/,
        );
      } finally {
        await lease.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
          "taskpilot-wa:" + session,
        ]);
        lease.release();
      }
    },
  );
  async function job(status: string) {
    const template = randomUUID();
    await pool.query(
      "INSERT INTO reply_templates(id,code,body) VALUES($1,$2,'synthetic reply')",
      [template, "synthetic-" + template],
    );
    const assignment = (await pool.query("SELECT id FROM assignments")).rows[0]
      .id;
    const id = randomUUID();
    await pool.query(
      "INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key) VALUES($1,$2,$3,$4,$5,'synthetic reply',$6,$7)",
      [id, assignment, source, session, template, status, "synthetic-" + id],
    );
    return id;
  }
  await t.test(
    "uncertain/in-progress delivery prevents forgetting",
    async () => {
      for (const status of ["SENDING", "UNKNOWN_DELIVERY"]) {
        await reset();
        await job(status);
        await assert.rejects(
          privacy.forgetPreview(session),
          /DELIVERY_REQUIRES_RECONCILIATION/,
        );
      }
    },
  );
  await t.test(
    "forget removes selected auth/quote/queued raw, cancels approval, preserves history and other identity",
    async () => {
      await reset();
      await seedExpired();
      const pending = await job("APPROVED"),
        sent = await job("SENT");
      const store = new PgAuthStore(pool, vault, session, codec),
        old = await store.load();
      const p = await ok("POST", `/v1/sessions/${session}/forget-preview`, {});
      assert.equal(p.counts.auth, 1);
      assert.equal(p.historyPreserved, true);
      assert.equal(
        (
          await req("POST", "/v1/privacy/forget-session", {
            approvalToken: p.approvalToken,
            confirmation: p.confirmation,
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await req(
            "POST",
            "/v1/privacy/forget-session",
            { approvalToken: p.approvalToken, confirmation: "FORGET " + other },
            true,
          )
        ).statusCode,
        400,
      );
      await ok(
        "POST",
        "/v1/privacy/forget-session",
        { approvalToken: p.approvalToken, confirmation: p.confirmation },
        true,
      );
      assert.equal(
        (
          await pool.query("SELECT status FROM whatsapp_sessions WHERE id=$1", [
            session,
          ])
        ).rows[0].status,
        "FORGOTTEN",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM whatsapp_auth WHERE session_id=$1",
            [session],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM whatsapp_auth WHERE session_id=$1",
            [other],
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
            pending,
          ])
        ).rows[0].status,
        "CANCELED",
      );
      assert.equal(
        (await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [sent]))
          .rows[0].status,
        "SENT",
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM accounts")).rows[0].n,
        1,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM assignments")).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM source_messages WHERE session_id=$1 AND encrypted_transport_key IS NOT NULL",
            [session],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM whatsapp_ingress WHERE session_id=$1 AND encrypted_payload IS NOT NULL",
            [session],
          )
        ).rows[0].n,
        0,
      );
      await assert.rejects(
        old.saveCreds({ registered: true }),
        /SESSION_FORGOTTEN/,
      );
      await assert.rejects(connector.connect(session), /SESSION_FORGOTTEN/);
      assert.equal(loads, 0);
      const g = (
        await pool.query("SELECT version FROM groups WHERE id=$1", [group])
      ).rows[0];
      assert.equal(
        (
          await req(
            "PATCH",
            `/v1/groups/${group}`,
            { version: g.version, enabled: true },
            true,
          )
        ).statusCode,
        409,
      );
      await assert.rejects(privacy.forgetPreview(session), /SESSION_FORGOTTEN/);
    },
  );
  await t.test(
    "auth changes and late approved reply invalidate forgetting snapshot",
    async () => {
      await reset();
      const p = await privacy.forgetPreview(session);
      await pool.query(
        "UPDATE whatsapp_auth SET encrypted_payload=$2 WHERE session_id=$1",
        [session, vault.seal("synthetic-changed", "synthetic")],
      );
      await assert.rejects(
        privacy.forgetExecute(p.approvalToken, p.confirmation),
        /STALE_PREVIEW/,
      );
      const q = await privacy.forgetPreview(session);
      await job("APPROVED");
      await assert.rejects(
        privacy.forgetExecute(q.approvalToken, q.confirmation),
        /STALE_PREVIEW/,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM whatsapp_auth")).rows[0]
          .n,
        2,
      );
    },
  );
  await t.test(
    "mid-transaction run-record failure rolls back forgetting and retention",
    async () => {
      await reset();
      await pool.query(
        "CREATE FUNCTION synthetic_privacy_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER synthetic_privacy_failure BEFORE INSERT ON privacy_runs FOR EACH ROW EXECUTE FUNCTION synthetic_privacy_failure()",
      );
      try {
        const p = await privacy.forgetPreview(session);
        await assert.rejects(
          privacy.forgetExecute(p.approvalToken, p.confirmation),
        );
        assert.equal(
          (await pool.query("SELECT count(*)::int n FROM whatsapp_auth"))
            .rows[0].n,
          2,
        );
        assert.equal(
          (await pool.query("SELECT enabled FROM groups WHERE id=$1", [group]))
            .rows[0].enabled,
          true,
        );
        const q = await privacy.retentionPreview();
        await assert.rejects(
          privacy.retentionExecute(q.approvalToken, q.confirmation),
        );
        assert.equal(
          (
            await pool.query("SELECT state FROM source_messages WHERE id=$1", [
              review,
            ])
          ).rows[0].state,
          "REVIEW",
        );
      } finally {
        await pool.query(
          "DROP TRIGGER synthetic_privacy_failure ON privacy_runs; DROP FUNCTION synthetic_privacy_failure()",
        );
      }
    },
  );
});
