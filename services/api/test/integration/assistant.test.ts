import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { Vault } from "../../src/security.js";
import { AiRuntime } from "../../src/ai-runtime.js";
import { ChatProvider } from "../../src/ai.js";
import { AssistantService } from "../../src/assistant.js";
import { riyadhDate, riyadhRange } from "../../src/assistant-plan.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("project secretary grounded reads, privacy, shared budget and atomic commanded actions", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE assistant_turns,assistant_action_receipts,whatsapp_sessions,task_types,accounts,source_messages,ai_requests,approvals CASCADE",
  );
  await pool.query(
    "UPDATE ai_settings SET enabled=true,outbound_approved=true,version=1,daily_request_limit=100,daily_token_limit=100000",
  );
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
    mockEnabled: true,
  };
  let calls = 0,
    body = "",
    fail = false,
    corrupt = false;
  const ai = new AiRuntime(
    pool,
    new Vault(config.encryptionKey),
    async () => "synthetic-only",
    (c) =>
      new ChatProvider(c, (async (_url, init) => {
        calls++;
        body = String(init!.body);
        if (fail) throw Error("provider-private-body");
        const payload = JSON.parse(body),
          safe = JSON.parse(payload.messages[1].content);
        await new Promise((r) => setTimeout(r, 30));
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(
                  corrupt
                    ? {
                        ...safe.baseline,
                        action: "SET_STATUS",
                        actionStatus: "COMPLETED",
                      }
                    : safe.baseline,
                ),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 35,
            prompt_cache_hit_tokens: 10,
          },
        });
      }) as typeof fetch),
  );
  const assistant = new AssistantService(pool, ai),
    app = await createApp(pool, config, undefined, ai, assistant);
  t.after(async () => {
    await app.close();
    await pool.query(
      "UPDATE ai_settings SET enabled=false,outbound_approved=false",
    );
    await pool.end();
  });
  const h = { authorization: `Bearer ${config.apiToken}` },
    sensitive = { ...h, "x-reauth-secret": config.reauthSecret };
  const req = (method: any, path: string, payload?: any, headers = h) =>
    app.inject({ method, url: path, headers, ...(payload ? { payload } : {}) });
  const ok = async (method: any, path: string, payload?: any, headers = h) => {
    const r = await req(method, path, payload, headers);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const threadId = randomUUID();
  const ask = (question: string, extra: any = {}) =>
    ok("POST", "/v1/assistant/turns", {
      requestId: randomUUID(),
      threadId,
      question,
      ...extra,
    });
  const session = await ok("POST", "/v1/sessions", {
    label: "Secretary synthetic",
  });
  const task = await ok("POST", "/v1/task-types", {
    code: "secretary_synthetic",
    name: "مهمة سرية وهمية",
  });
  const group = await ok("POST", "/v1/groups", {
    sessionId: session.id,
    taskTypeId: task.id,
    title: "مجموعة سرية وهمية",
    externalGroupId: "secretary-fixture",
    namespace: "secretary-test",
    periodKey: "2026-11",
  });
  const account = await ok(
    "POST",
    "/v1/accounts",
    {
      namespace: "secretary-test",
      username: "S240000000",
      displayName: "حسن الوهمي",
      password: "Synthetic-Pass!42",
    },
    sensitive,
  );
  const account2 = await ok(
    "POST",
    "/v1/accounts",
    {
      namespace: "secretary-test",
      username: "S240000001",
      displayName: "حسن الثاني",
      password: "Synthetic-Other!43",
    },
    sensitive,
  );
  for (const a of [account, account2])
    await ok("POST", "/v1/mock/messages", {
      sessionId: session.id,
      groupId: group.id,
      externalMessageId: `sec-${a.id}`,
      text: `الاسم: ${a.display_name}\nاليوزر: ${a.username_normalized}\nالباسورد: ${a.id === account.id ? "Synthetic-Pass!42" : "Synthetic-Other!43"}`,
    });
  const assignments = (
    await pool.query(
      "SELECT id,account_id,version FROM assignments ORDER BY id",
    )
  ).rows;
  const first = assignments.find((a) => a.account_id === account.id)!;

  await t.test("unauthorized chat and actions stay denied", async () => {
    assert.equal(
      (await req("GET", "/v1/assistant/threads", undefined, {} as any))
        .statusCode,
      401,
    );
    assert.equal(
      (await req("POST", "/v1/assistant/actions/apply", {})).statusCode,
      403,
    );
  });
  let focused: any;
  await t.test(
    "finds by identifier, groups and tasks without forwarding identities or storing chat",
    async () => {
      focused = await ask("ابحث عن S240000000");
      assert.equal(focused.contextAccountId, account.id);
      assert.equal(focused.origin, "AI_TOOL_PLAN");
      assert.ok(JSON.stringify(focused).includes("مجموعة سرية وهمية"));
      assert.ok(JSON.stringify(focused).includes("مهمة سرية وهمية"));
      for (const forbidden of [
        "S240000000",
        "s240000000",
        "حسن",
        "مجموعة سرية",
        "Synthetic",
        account.id,
        group.id,
      ])
        assert.ok(!body.includes(forbidden), forbidden);
      const saved = JSON.stringify(
        (await pool.query("SELECT * FROM assistant_turns")).rows,
      );
      for (const forbidden of [
        "S240000000",
        "حسن",
        "Synthetic-Pass",
        "ابحث عن",
      ])
        assert.ok(!saved.includes(forbidden), forbidden);
      assert.ok(!JSON.stringify(focused).includes("Synthetic-Pass"));
    },
  );
  await t.test(
    "follow-up uses current focus and ambiguity requests selection, missing names never list everyone",
    async () => {
      const follow = await ask("ماهي مجموعاته ومهامه؟", {
        parentId: focused.id,
      });
      assert.equal(follow.contextAccountId, account.id);
      const before = calls,
        ambiguous = await ask("ابحث عن حسن");
      assert.equal(calls, before);
      assert.equal(ambiguous.action, null);
      assert.ok(ambiguous.summary.includes("أكثر من حساب"));
      const missing = await ask("ابحث عن غيرموجودالوهمي");
      assert.ok(missing.summary.includes("لم أجد"));
      assert.equal(missing.sections[0].items.length, 0);
      const selected = await ask("تفاصيل الحساب", {
        parentId: ambiguous.id,
        focusAccountId: account2.id,
      });
      assert.equal(selected.contextAccountId, account2.id);
    },
  );
  await t.test(
    "Riyadh intake counts repeated accounts separately from newly created accounts",
    async () => {
      const range = riyadhRange("TODAY", riyadhDate());
      await pool.query(
        "UPDATE accounts SET created_at=$2::timestamptz-interval '2 days' WHERE id=$1",
        [account.id, range.start],
      );
      await pool.query(
        "UPDATE source_messages SET received_at=$1::timestamptz+interval '1 minute'",
        [range.start],
      );
      const intake = await ask("ماهي الحسابات الي تلقيتها اليوم وايش مهامها");
      assert.equal(intake.title, "الحسابات المستلمة");
      assert.ok(intake.summary.includes("2 حسابات"));
      assert.ok(intake.summary.includes("1 حسابات أُنشئت"));
      assert.ok(JSON.stringify(intake).includes("مهمة سرية وهمية"));
    },
  );
  await t.test(
    "same request and lost response never repeat a provider call; changed payload conflicts",
    async () => {
      const payload = {
          requestId: randomUUID(),
          threadId,
          question: "ملخص العمل اليوم",
        },
        before = calls;
      const responses = await Promise.all([
        ok("POST", "/v1/assistant/turns", payload),
        ok("POST", "/v1/assistant/turns", payload),
      ]);
      assert.equal(calls, before + 1);
      assert.equal(
        (await ok("GET", "/v1/assistant/turns/" + payload.requestId)).state,
        "READY",
      );
      await ok("POST", "/v1/assistant/turns", payload);
      assert.equal(calls, before + 1);
      assert.equal(
        (
          await req("POST", "/v1/assistant/turns", {
            ...payload,
            question: "شيء آخر",
          })
        ).statusCode,
        409,
      );
      assert.ok(responses.some((r) => r.summary.includes("لديك")));
    },
  );
  await t.test(
    "provider failure or injected unsafe plan falls back to explicit local tools with no retry",
    async () => {
      fail = true;
      const failed = await ask("ملخص العمل اليوم");
      fail = false;
      assert.equal(failed.origin, "LOCAL_TOOLS");
      assert.ok(failed.summary.includes("لديك"));
      corrupt = true;
      const rejected = await ask("ملخص العمل اليوم");
      corrupt = false;
      assert.equal(rejected.origin, "LOCAL_TOOLS");
      assert.equal(rejected.action, null);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "credentials and unsupported sending/deletion are rejected without provider or mutations",
    async () => {
      const before = calls;
      assert.equal(
        (
          await req("POST", "/v1/assistant/turns", {
            requestId: randomUUID(),
            threadId,
            question: "اليوزر: S240000000\nالباسورد: Synthetic-Pass!42",
          })
        ).statusCode,
        400,
      );
      const blocked = await ask("ارسل رد واحذف الحساب");
      assert.equal(blocked.title, "كيف أساعدك");
      assert.equal(blocked.action, null);
      assert.equal(calls, before);
    },
  );
  await t.test(
    "shared daily budget limits assistant and keeps local reads usable",
    async () => {
      const requests = (
        await pool.query(
          "SELECT count(*)::int n FROM ai_requests WHERE status<>'ABSTAINED' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
        )
      ).rows[0].n;
      await pool.query("UPDATE ai_settings SET daily_request_limit=$1", [
        requests,
      ]);
      const before = calls,
        limited = await ask("ملخص العمل اليوم");
      assert.equal(limited.modelStatus, "AI_DAILY_LIMIT");
      assert.equal(calls, before);
      assert.ok(limited.summary.includes("لديك"));
      await pool.query("UPDATE ai_settings SET daily_request_limit=100");
    },
  );
  let preview: any;
  await t.test(
    "command prepares specific current rows; preview changes nothing and displays before/after",
    async () => {
      const action = await ask("غير حالة المهام إلى مكتملة", {
        focusAccountId: account.id,
      });
      assert.equal(action.action.kind, "SET_STATUS");
      assert.equal(action.action.status, "COMPLETED");
      assert.equal(action.action.targets.length, 1);
      preview = await ok(
        "POST",
        "/v1/assistant/actions/preview",
        action.action
          ? {
              kind: action.action.kind,
              status: action.action.status,
              priority: action.action.priority,
              targets: action.action.targets,
            }
          : {},
      );
      assert.equal(preview.changes[0].before, "جديد");
      assert.equal(preview.changes[0].after, "مكتمل");
      assert.equal(
        (
          await pool.query("SELECT status FROM assignments WHERE id=$1", [
            first.id,
          ])
        ).rows[0].status,
        "NEW",
      );
    },
  );
  await t.test(
    "atomic approval is reauthed, single-use, idempotent, independent of sending and survives unknown acknowledgement",
    async () => {
      const requestId = randomUUID(),
        payload = {
          requestId,
          approvalToken: preview.approvalToken,
          confirmation: "تطبيق التغييرات",
        };
      assert.equal(
        (await req("POST", "/v1/assistant/actions/apply", payload)).statusCode,
        403,
      );
      const receipt = await ok(
        "POST",
        "/v1/assistant/actions/apply",
        payload,
        sensitive,
      );
      assert.equal(receipt.status, "APPLIED");
      assert.equal(receipt.count, 1);
      assert.equal(receipt.replyJobsCreated, 0);
      assert.deepEqual(
        await ok("GET", "/v1/assistant/actions/" + requestId),
        receipt,
      );
      assert.deepEqual(
        await ok("POST", "/v1/assistant/actions/apply", payload, sensitive),
        receipt,
      );
      assert.equal(
        (
          await req(
            "POST",
            "/v1/assistant/actions/apply",
            { ...payload, requestId: randomUUID() },
            sensitive,
          )
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT status,completed_at FROM assignments WHERE id=$1",
            [first.id],
          )
        ).rows[0].status,
        "COMPLETED",
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "stale account or task invalidates entire batch; priority edit is versioned and expired previews fail",
    async () => {
      const rows = (
        await pool.query("SELECT id,version FROM assignments ORDER BY id")
      ).rows;
      const batch = await ok("POST", "/v1/assistant/actions/preview", {
        kind: "SET_PRIORITY",
        status: null,
        priority: 75,
        targets: rows,
      });
      await pool.query("UPDATE accounts SET version=version+1 WHERE id=$1", [
        account2.id,
      ]);
      assert.equal(
        (
          await req(
            "POST",
            "/v1/assistant/actions/apply",
            {
              requestId: randomUUID(),
              approvalToken: batch.approvalToken,
              confirmation: "تطبيق التغييرات",
            },
            sensitive,
          )
        ).statusCode,
        409,
      );
      assert.ok(
        (await pool.query("SELECT priority FROM assignments")).rows.every(
          (r) => r.priority === 0,
        ),
      );
      const fresh = await ok("POST", "/v1/assistant/actions/preview", {
        kind: "SET_PRIORITY",
        status: null,
        priority: 75,
        targets: rows,
      });
      assert.equal(
        (
          await ok(
            "POST",
            "/v1/assistant/actions/apply",
            {
              requestId: randomUUID(),
              approvalToken: fresh.approvalToken,
              confirmation: "تطبيق التغييرات",
            },
            sensitive,
          )
        ).count,
        2,
      );
      const expired = await ok("POST", "/v1/assistant/actions/preview", {
        kind: "SET_PRIORITY",
        status: null,
        priority: 25,
        targets: (await pool.query("SELECT id,version FROM assignments")).rows,
      });
      await pool.query(
        "UPDATE approvals SET expires_at=now()-interval '1 second' WHERE purpose='assistant-action'",
      );
      assert.equal(
        (
          await req(
            "POST",
            "/v1/assistant/actions/apply",
            {
              requestId: randomUUID(),
              approvalToken: expired.approvalToken,
              confirmation: "تطبيق التغييرات",
            },
            sensitive,
          )
        ).statusCode,
        409,
      );
    },
  );
  await t.test(
    "date/group scope, completed time, ordinary questions and restart receipts stay precise",
    async () => {
      const emptyGroup = await ok("POST", "/v1/groups", {
        sessionId: session.id,
        taskTypeId: task.id,
        title: "مجموعة فارغة وهمية",
        externalGroupId: "secretary-empty-fixture",
        namespace: "secretary-test",
        periodKey: "2026-11",
      });
      const scoped = await ask("ملخص العمل اليوم", { groupId: emptyGroup.id });
      assert.ok(scoped.summary.includes("0 حسابًا"));
      assert.ok(scoped.summary.includes("0 مهمة"));
      await pool.query(
        "UPDATE assignments SET created_at=now()-interval '9 days' WHERE id=$1",
        [first.id],
      );
      const completed = await ask("اعرض المهام المكتملة اليوم", {
        groupId: group.id,
      });
      assert.equal(completed.sections[0].total, 1);
      assert.ok(completed.summary.includes("وقت الإكمال"));
      const open = await ask("ما المهام غير المكتملة؟");
      assert.equal(open.action, null);
      assert.equal(open.sections[0].total, 1);
      const before = calls;
      assert.equal(
        (
          await req("POST", "/v1/assistant/turns", {
            requestId: randomUUID(),
            threadId,
            question: "ابحث عن S240000000 و S240000001",
          })
        ).statusCode,
        400,
      );
      assert.equal(calls, before);
      const receipts = await ok("GET", "/v1/assistant/actions");
      assert.equal(receipts.items.length, 2);
      assert.ok(
        receipts.items.every((r: any) => r.result.status === "APPLIED"),
      );
      assert.equal(
        (
          await req("POST", "/v1/assistant/actions/preview", {
            kind: "SET_PRIORITY",
            status: null,
            priority: 5,
            targets: Array.from({ length: 21 }, () => ({
              id: randomUUID(),
              version: 1,
            })),
          })
        ).statusCode,
        400,
      );
    },
  );
  await t.test(
    "history rereads current data and safely recovers interrupted planning",
    async () => {
      await pool.query(
        "UPDATE accounts SET display_name='اسم محدث وهمي' WHERE id=$1",
        [account.id],
      );
      const history = await ok("GET", "/v1/assistant/threads/" + threadId);
      assert.equal(history.historyMode, "safe-plans-current-records");
      assert.ok(JSON.stringify(history).includes("اسم محدث وهمي"));
      await pool.query(
        "UPDATE assistant_turns SET state='PLANNING' WHERE id=$1",
        [focused.id],
      );
      const before = calls;
      await assistant.recoverInterrupted();
      assert.equal(
        (await ok("GET", "/v1/assistant/turns/" + focused.id)).modelStatus,
        "INTERRUPTED",
      );
      assert.equal(calls, before);
      await pool.query("DELETE FROM accounts WHERE id=$1", [account.id]);
      assert.ok(
        (await ok("GET", "/v1/assistant/turns/" + focused.id)).summary.includes(
          "لم يعد متاحًا",
        ),
      );
    },
  );
});
