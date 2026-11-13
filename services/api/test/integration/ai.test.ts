import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { Vault } from "../../src/security.js";
import { AiRuntime, estimatedAiCost } from "../../src/ai-runtime.js";
import { ChatProvider } from "../../src/ai.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("AI manual runtime privacy, budget and replay acceptance", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,ai_requests CASCADE",
  );
  await pool.query(
    "UPDATE ai_settings SET enabled=false,outbound_approved=false,version=1,daily_request_limit=20,daily_token_limit=10000",
  );
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
    mockEnabled: true,
  };
  const vault = new Vault(config.encryptionKey);
  let calls = 0,
    fail = false,
    body = "";
  const ai = new AiRuntime(
    pool,
    vault,
    async () => "synthetic-only",
    (c) =>
      new ChatProvider(c, (async (_url, init) => {
        if (!init?.body)
          return Response.json({ data: [{ id: "deepseek-flash" }] });
        calls++;
        body = String(init.body);
        await new Promise((r) => setTimeout(r, 20));
        if (fail) throw Error("provider-secret");
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"taskCode":"task_a","confidence":0.6}' },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 20,
            prompt_cache_hit_tokens: 32,
          },
        });
      }) as typeof fetch),
  );
  const app = await createApp(pool, config, undefined, ai);
  t.after(async () => {
    await pool.query("TRUNCATE ai_requests");
    await pool.query(
      "UPDATE ai_settings SET enabled=false,outbound_approved=false",
    );
    await app.close();
    await pool.end();
  });
  const h = { authorization: `Bearer ${config.apiToken}` },
    sensitive = { ...h, "x-reauth-secret": config.reauthSecret };
  async function req(method: any, path: string, payload?: any, auth = true) {
    return app.inject({
      method,
      url: path,
      headers: auth ? sensitive : h,
      ...(payload ? { payload } : {}),
    });
  }
  async function ok(method: any, path: string, payload?: any) {
    const r = await req(method, path, payload);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  }
  const session = await ok("POST", "/v1/sessions", { label: "AI synthetic" }),
    task = await ok("POST", "/v1/task-types", {
      code: "task_a",
      name: "Task A",
    });
  const group = await ok("POST", "/v1/groups", {
    sessionId: session.id,
    taskTypeId: task.id,
    externalGroupId: "ai-fixture",
    title: "AI fixture",
    namespace: "synthetic-ai",
    periodKey: "test",
  });
  await pool.query(
    "INSERT INTO group_rules(id,group_id,task_type_id,keywords,priority) VALUES($1,$2,$3,$4,1)",
    [randomUUID(), group.id, task.id, ["classify"]],
  );
  async function source(
    text = "classify\nuser: PRIVATE_CANARY\npassword: SECRET_CANARY",
  ) {
    const id = randomUUID();
    await pool.query(
      "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_payload) VALUES($1,$2,$3,$4,'REVIEW',$5)",
      [
        id,
        session.id,
        group.id,
        randomUUID(),
        vault.seal(text, `message:${id}`),
      ],
    );
    return id;
  }
  const id = await source();
  let settings = await ai.settings();
  const configure = async (limit = 20, tokens = 10000) => {
    settings = await ai.settings();
    return ok("PATCH", "/v1/ai/config", {
      ...{
        version: settings.version,
        provider: "deepseek",
        model: "deepseek-flash",
        enabled: true,
        outboundApproved: true,
        dailyRequestLimit: limit,
        dailyTokenLimit: tokens,
      },
    });
  };
  await t.test(
    "default disabled, auth/reauth, local projection never raw text",
    async () => {
      assert.equal(
        (await app.inject({ url: "/v1/ai/config" })).statusCode,
        401,
      );
      assert.equal(
        (
          await req("POST", `/v1/inbox/${id}/ai-suggestion`, {
            idempotencyKey: "disabled-request-001",
          })
        ).statusCode,
        403,
      );
      const preview = await ok("POST", `/v1/inbox/${id}/ai-preview`, {});
      assert.deepEqual(preview.candidateCodes, ["task_a"]);
      assert.equal(preview.providerRequestSent, false);
      assert.equal(calls, 0);
      assert.deepEqual(
        (await ai.preview(await source("password: classify"))).candidateCodes,
        [],
      );
      assert.equal(
        (await req("PATCH", "/v1/ai/config", {}, false)).statusCode,
        403,
      );
      await configure();
      assert.equal(
        (
          await req("POST", `/v1/inbox/${id}/ai-suggestion`, {
            idempotencyKey: "strict-request-001",
            text: "SECRET_CANARY",
          })
        ).statusCode,
        400,
      );
    },
  );
  await t.test(
    "parallel same-key requests reserve once, no business mutation and safe usage",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          ok("POST", `/v1/inbox/${id}/ai-suggestion`, {
            idempotencyKey: "parallel-request-001",
          }),
        ),
      );
      assert.equal(new Set(results.map((r) => r.requestId)).size, 1);
      assert.equal(calls, 1);
      assert.equal(
        (await ai.analyze(id, "parallel-request-001")).needsReview,
        true,
      );
      for (const secret of ["SECRET_CANARY", "PRIVATE_CANARY", "password"])
        assert.equal(body.includes(secret), false);
      assert.deepEqual(JSON.parse(body).thinking, { type: "disabled" });
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM accounts")).rows[0].n,
        0,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query("SELECT state FROM source_messages WHERE id=$1", [
            id,
          ])
        ).rows[0].state,
        "REVIEW",
      );
      const usage = await ai.usage();
      assert.equal(usage.today.promptTokens, 120);
      assert.equal(usage.today.reportedCostUsd, null);
      assert.ok(Number(usage.today.estimatedCostUsd) > 0);
    },
  );
  await t.test(
    "serialized daily caps, failure retained reservation and no automatic retries",
    async () => {
      await configure(2);
      fail = true;
      const next = await source();
      const result = await ai.analyze(next, "failure-request-001");
      assert.equal(result.status, "UNAVAILABLE");
      assert.equal(calls, 2);
      assert.equal(
        (await ai.analyze(next, "failure-request-001")).reused,
        true,
      );
      assert.equal(calls, 2);
      assert.ok((await ai.usage()).today.unresolvedReservedTokens > 0);
      assert.equal(
        (
          await req("POST", `/v1/inbox/${id}/ai-suggestion`, {
            idempotencyKey: "over-limit-request-001",
          })
        ).statusCode,
        429,
      );
      assert.equal(calls, 2);
      await configure(20, 1000);
      assert.equal(
        (
          await req("POST", `/v1/inbox/${id}/ai-suggestion`, {
            idempotencyKey: "token-limit-request-001",
          })
        ).statusCode,
        429,
      );
    },
  );
  await t.test(
    "interrupted request reserved across restart and stale source rejected",
    async () => {
      await configure();
      fail = false;
      const next = await source();
      await ai.analyze(next, "interrupted-request-001");
      const n = calls;
      await pool.query(
        "UPDATE ai_requests SET status='REQUESTED',prompt_tokens=NULL,completion_tokens=NULL WHERE source_id=$1",
        [next],
      );
      await ai.recoverInterrupted();
      assert.equal(
        (await ai.analyze(next, "interrupted-request-001")).status,
        "UNAVAILABLE",
      );
      assert.equal(calls, n);
      await pool.query(
        "UPDATE source_messages SET state='IGNORED',version=version+1 WHERE id=$1",
        [next],
      );
      assert.equal(
        (
          await req("POST", `/v1/inbox/${next}/ai-suggestion`, {
            idempotencyKey: "stale-source-request-001",
          })
        ).statusCode,
        409,
      );
      assert.equal(calls, n);
      assert.equal(estimatedAiCost("deepseek", "unknown", 120, 20), null);
      assert.equal(estimatedAiCost("openrouter", "any", 120, 20), null);
    },
  );
});
