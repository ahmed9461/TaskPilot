import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { Service } from "../../src/service.js";
import { Vault } from "../../src/security.js";
import { AiRuntime } from "../../src/ai-runtime.js";
import { ChatProvider } from "../../src/ai.js";
import { createApp } from "../../src/app.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("unlabelled student reception and bounded automatic structural AI", async (t) => {
  await migrate(url);
  const encryptionKey = randomBytes(32).toString("base64");
  const pool = createPool(url),
    vault = new Vault(encryptionKey),
    service = new Service(pool, vault);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,ai_requests CASCADE",
  );
  await pool.query(
    "UPDATE ai_settings SET enabled=false,outbound_approved=false,automatic_fallback=false,version=1,daily_request_limit=20,daily_token_limit=10000",
  );
  let calls = 0,
    invalid = false,
    payload = "";
  const ai = new AiRuntime(
    pool,
    vault,
    async () => "synthetic-only",
    (c) =>
      new ChatProvider(c, (async (_url, init) => {
        if (!init?.body)
          return Response.json({ data: [{ id: "deepseek-flash" }] });
        calls++;
        payload = String(init.body);
        await new Promise((r) => setTimeout(r, 15));
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  taskCode: null,
                  confidence: 0.9,
                  fieldSelection: {
                    username: 1,
                    displayName: 0,
                    password: invalid ? 99 : 3,
                  },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 30 },
        });
      }) as typeof fetch),
  );
  const apiToken = randomBytes(32).toString("hex"),
    reauthSecret = randomBytes(32).toString("hex");
  const app = await createApp(
    pool,
    { apiToken, reauthSecret, encryptionKey, mockEnabled: true },
    undefined,
    ai,
  );
  t.after(async () => {
    await app.close();
    await pool.query(
      "UPDATE ai_settings SET enabled=false,outbound_approved=false,automatic_fallback=false",
    );
    await pool.end();
  });
  const session = randomUUID(),
    group = randomUUID(),
    task = randomUUID();
  await pool.query(
    "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'Synthetic student session','mock')",
    [session],
  );
  await pool.query(
    "INSERT INTO task_types(id,code,name) VALUES($1,'student_fixture','Synthetic task')",
    [task],
  );
  await pool.query(
    "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,'synthetic-student','Synthetic student group',$3,'synthetic-student','test')",
    [group, session, task],
  );
  const ingest = (text: string, key = randomUUID()) =>
    service.ingest({
      sessionId: session,
      groupId: group,
      externalMessageId: key,
      text,
    });
  const count = async (table: string) =>
    Number((await pool.query(`SELECT count(*) n FROM ${table}`)).rows[0].n);
  const name = "اسم اختبار معزول",
    user = "S299999991",
    password = "Fixture9***!";

  await t.test(
    "all input orders persist one account/task and multiple distinct sources, with replay dedupe",
    async () => {
      for (const order of [
        [name, user, password],
        [password, user, name],
        [user, password, name],
        [name, password, user],
        [password, name, user],
        [user, name, password],
      ])
        assert.equal((await ingest(order.join("\r"))).state, "PROCESSED");
      assert.equal(await count("accounts"), 1);
      assert.equal(await count("assignments"), 1);
      assert.equal(await count("assignment_sources"), 6);
      const key = randomUUID();
      await ingest([user, password].join("\n"), key);
      assert.equal(
        (await ingest([user, password].join("\n"), key)).duplicate,
        true,
      );
      const row = (
        await pool.query(
          "SELECT a.id,c.ciphertext FROM accounts a JOIN account_credentials c ON c.account_id=a.id",
        )
      ).rows[0];
      assert.equal(
        vault.open(row.ciphertext, `credential:${row.id}`),
        password,
      );
      assert.equal(await count("reply_jobs"), 0);
    },
  );
  await t.test(
    "course lines do not become passwords and missing names become identifier display labels",
    async () => {
      const received = await ingest(
        "Law121\nMath003\nS299999992\nOtherFixture8!",
      );
      assert.equal(received.state, "PROCESSED");
      assert.equal(
        (
          await pool.query(
            "SELECT display_name FROM accounts WHERE username_normalized='s299999992'",
          )
        ).rows[0].display_name,
        "S299999992",
      );
    },
  );
  await t.test(
    "partial account-like content stays encrypted in review while unrelated chatter is ignored",
    async () => {
      const partial = await ingest("S26000...\nFixture8!"),
        ignored = await ingest("السلام عليكم");
      assert.equal(partial.state, "REVIEW");
      assert.equal(ignored.state, "IGNORED");
      const rows = (
        await pool.query(
          "SELECT id,state,encrypted_payload FROM source_messages WHERE id=ANY($1::uuid[])",
          [[partial.id, ignored.id]],
        )
      ).rows;
      assert.ok(rows.find((r) => r.id === partial.id).encrypted_payload);
      assert.equal(
        rows.find((r) => r.id === ignored.id).encrypted_payload,
        null,
      );
      // Keep the next worker test scoped to its new ambiguous fixture.
      await pool.query(
        "UPDATE source_messages SET state='IGNORED',encrypted_payload=NULL WHERE id=$1",
        [partial.id],
      );
    },
  );
  let reviewId = "";
  await t.test(
    "automatic fallback opt-in sends only structure once under parallel claims, creates no business data",
    async () => {
      reviewId = (
        await ingest(`${name}\nS299999993\nFirstCanary9!\nSecondCanary8!`)
      ).id!;
      const accounts = await count("accounts"),
        tasks = await count("assignments");
      assert.equal(await ai.drainFallbackOnce(), false);
      assert.equal(calls, 0);
      await pool.query(
        "UPDATE ai_settings SET enabled=true,outbound_approved=true,automatic_fallback=true",
      );
      await Promise.all(
        Array.from({ length: 5 }, () => ai.drainFallbackOnce()),
      );
      assert.equal(calls, 1);
      assert.equal(await ai.drainFallbackOnce(), false);
      assert.equal(
        (await ai.analyze(reviewId, "manual-after-automatic-001")).reused,
        true,
      );
      assert.equal(calls, 1);
      for (const secret of [
        name,
        "S299999993",
        "FirstCanary9!",
        "SecondCanary8!",
      ])
        assert.equal(payload.includes(secret), false);
      assert.equal(await count("accounts"), accounts);
      assert.equal(await count("assignments"), tasks);
      assert.equal(await count("reply_jobs"), 0);
      assert.equal(
        (
          await pool.query("SELECT state FROM source_messages WHERE id=$1", [
            reviewId,
          ])
        ).rows[0].state,
        "REVIEW",
      );
      const fields = await ai.fieldsForReview(
        reviewId,
        1,
        `${name}\nS299999993\nFirstCanary9!\nSecondCanary8!`,
      );
      assert.equal(fields.password, "SecondCanary8!");
      assert.equal(fields.origin, "ai-review-only");
    },
  );
  await t.test(
    "field suggestions are revealed only after reauth, including eight concurrent bounded reads",
    async () => {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/v1/inbox/${reviewId}/reveal`,
            payload: {},
          })
        ).statusCode,
        401,
      );
      const headers = { authorization: `Bearer ${apiToken}` };
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/v1/inbox/${reviewId}/reveal`,
            headers,
            payload: {},
          })
        ).statusCode,
        403,
      );
      const reads = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.inject({
            method: "POST",
            url: `/v1/inbox/${reviewId}/reveal`,
            headers: { ...headers, "x-reauth-secret": reauthSecret },
            payload: {},
          }),
        ),
      );
      for (const response of reads) {
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().fields.password, "SecondCanary8!");
      }
      const list = await app.inject({ url: "/v1/inbox", headers });
      assert.equal(list.body.includes("SecondCanary8!"), false);
      assert.equal(list.json()[0].ai_status, "SUCCEEDED");
    },
  );
  await t.test(
    "invalid provider indices are unavailable, retained as one attempt and never retried automatically",
    async () => {
      invalid = true;
      await ingest(`${name}\nS299999994\nFirstCanary9!\nSecondCanary8!`);
      await ai.drainFallbackOnce();
      assert.equal(calls, 2);
      assert.equal(await ai.drainFallbackOnce(), false);
      assert.equal(calls, 2);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM ai_requests WHERE status='UNAVAILABLE'",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "local abstention is durable, costs no request and cannot invent a truncated identifier",
    async () => {
      await ingest("S26000...\nFixture8!");
      const before = (await ai.usage()).today.requests;
      await ai.drainFallbackOnce();
      assert.equal(calls, 2);
      assert.equal((await ai.usage()).today.requests, before);
      assert.equal(await ai.drainFallbackOnce(), false);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM ai_requests WHERE status='ABSTAINED'",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "daily request limits and disabled settings stop fallback without provider calls",
    async () => {
      await ingest(`${name}\nS299999995\nFirstCanary9!\nSecondCanary8!`);
      await pool.query("UPDATE ai_settings SET daily_request_limit=1");
      await assert.rejects(() => ai.drainFallbackOnce(), /AI_DAILY_LIMIT/);
      assert.equal(calls, 2);
      await pool.query("UPDATE ai_settings SET automatic_fallback=false");
      assert.equal(await ai.drainFallbackOnce(), false);
      assert.equal(calls, 2);
    },
  );
  await t.test(
    "source and settings version fences exclude stale field suggestions",
    async () => {
      const raw = `${name}\nS299999993\nFirstCanary9!\nSecondCanary8!`;
      assert.equal(
        (await ai.fieldsForReview(reviewId, 2, raw)).password,
        undefined,
      );
      await pool.query("UPDATE ai_settings SET version=version+1");
      assert.equal(
        (await ai.fieldsForReview(reviewId, 1, raw)).password,
        undefined,
      );
    },
  );
});
