import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createPool, transaction, event } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { dispatchOne, startMockWorker } from "../../src/outbox.js";
import { MockTransport } from "../../src/transport.js";
import { Service } from "../../src/service.js";
import { Vault } from "../../src/security.js";
import { hash, token } from "../../src/security.js";
import { randomUUID } from "node:crypto";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("PostgreSQL synthetic end-to-end and adversarial workflows", async (t) => {
  await migrate(url);
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
  const app = await createApp(pool, config);
  t.after(async () => {
    await app.close();
    await pool.end();
  });
  const headers = { authorization: `Bearer ${config.apiToken}` };
  const sensitive = { ...headers, "x-reauth-secret": config.reauthSecret };
  await t.test(
    "SSH-issued sessions expire/revoke and sensitive grants are single-use and session-bound",
    async () => {
      const value = token(),
        grant = token(),
        sessionId = randomUUID();
      await pool.query(
        "INSERT INTO client_sessions(id,token_hash,expires_at,reauth_hash,reauth_expires_at) VALUES($1,$2,now()+interval '30 minutes',$3,now()+interval '60 seconds')",
        [sessionId, hash(value), hash(grant)],
      );
      const h = { authorization: `Bearer ${value}` };
      assert.equal(
        (await app.inject({ url: "/v1/me", headers: h })).statusCode,
        200,
      );
      const request = {
        method: "POST" as const,
        url: "/v1/deletions/confirm",
        payload: { approvalToken: "unused-token", confirmation: "DELETE 1" },
      };
      assert.equal(
        (
          await app.inject({
            ...request,
            headers: { ...h, "x-reauth-secret": config.reauthSecret },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            ...request,
            headers: { ...h, "x-reauth-secret": grant },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await app.inject({
            ...request,
            headers: { ...h, "x-reauth-secret": grant },
          })
        ).statusCode,
        403,
      );
      await pool.query(
        "UPDATE client_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
        [sessionId],
      );
      assert.equal(
        (await app.inject({ url: "/v1/me", headers: h })).statusCode,
        401,
      );
      await pool.query(
        "UPDATE client_sessions SET expires_at=now()+interval '1 minute' WHERE id=$1",
        [sessionId],
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/client-session/revoke",
            headers: h,
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await app.inject({ url: "/v1/me", headers: h })).statusCode,
        401,
      );
    },
  );
  async function api(method: any, path: string, body?: any, reauth = false) {
    const r = await app.inject({
      method,
      url: path,
      headers: reauth ? sensitive : headers,
      ...(body ? { payload: body } : {}),
    });
    assert.ok(r.statusCode < 300, `${path}: ${r.statusCode} ${r.body}`);
    return r.json();
  }
  const session = await api("POST", "/v1/sessions", {
    label: "Synthetic session A",
  });
  const session2 = await api("POST", "/v1/sessions", {
    label: "Synthetic session B",
  });
  const task = await api("POST", "/v1/task-types", {
    code: "self",
    name: "الذاتي",
  });
  const task2 = await api("POST", "/v1/task-types", {
    code: "periodic",
    name: "الدوري",
  });
  const group = await api("POST", "/v1/groups", {
    sessionId: session.id,
    externalGroupId: "mock-group-a",
    title: "مجموعة وهمية أ",
    taskTypeId: task.id,
    namespace: "synthetic",
    periodKey: "2026-T1",
  });
  const group2 = await api("POST", "/v1/groups", {
    sessionId: session2.id,
    externalGroupId: "mock-group-b",
    title: "مجموعة وهمية ب",
    taskTypeId: task2.id,
    namespace: "synthetic",
    periodKey: "2026-T1",
  });
  const message = {
    sessionId: session.id,
    groupId: group.id,
    externalMessageId: "fixture-1",
    text: "name: حساب تجريبي\nuser: DEMO-A\npassword: fixture-secret",
  };
  let assignment: any;
  let account: any;
  let template: any;
  let job: any;
  await t.test(
    "authentication, reauthentication, validation and secret-free errors",
    async () => {
      assert.equal((await app.inject({ url: "/v1/accounts" })).statusCode, 401);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/accounts",
            headers,
            payload: { password: "sensitive-canary" },
          })
        ).body.includes("sensitive-canary"),
        false,
      );
      assert.equal((await app.inject({ url: "/ready" })).statusCode, 401);
      assert.equal((await api("GET", "/v1/me")).liveSendingEnabled, false);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/sessions/pairing-request",
            headers,
          })
        ).statusCode,
        403,
      );
    },
  );
  await t.test(
    "concurrent replay produces exactly one source and assignment",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          api("POST", "/v1/mock/messages", message),
        ),
      );
      assert.equal(results.filter((x) => !x.duplicate).length, 1);
      assert.equal((await api("GET", "/v1/assignments")).length, 1);
      const more = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api("POST", "/v1/mock/messages", {
            ...message,
            externalMessageId: `concurrent-${i}`,
          }),
        ),
      );
      assert.equal(more.length, 6);
      assignment = (await api("GET", "/v1/assignments"))[0];
      assert.equal(assignment.sources.length, 7);
    },
  );
  await t.test(
    "same account has distinct tasks, periods and namespaces; cross-session spoof denied",
    async () => {
      await api("POST", "/v1/mock/messages", {
        ...message,
        sessionId: session2.id,
        groupId: group2.id,
      });
      assert.equal((await api("GET", "/v1/accounts")).length, 1);
      assert.equal((await api("GET", "/v1/assignments")).length, 2);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/mock/messages",
            headers,
            payload: { ...message, sessionId: session2.id },
          })
        ).statusCode,
        403,
      );
      const third = await api("POST", "/v1/groups", {
        sessionId: session.id,
        externalGroupId: "period-2",
        title: "فترة ثانية",
        taskTypeId: task.id,
        namespace: "synthetic",
        periodKey: "2026-T2",
      });
      await api("POST", "/v1/mock/messages", { ...message, groupId: third.id });
      assert.equal((await api("GET", "/v1/assignments")).length, 3);
      await api("POST", "/v1/accounts", {
        namespace: "other",
        username: "demo-a",
        displayName: "Namespace fixture",
      });
      assert.equal((await api("GET", "/v1/accounts")).length, 2);
      account = (await api("GET", "/v1/accounts")).find(
        (a: any) => a.namespace === "synthetic",
      );
    },
  );
  await t.test(
    "credentials and raw message minimized, encrypted and never in list/audit/notifications",
    async () => {
      const stored = (
        await pool.query(
          "SELECT ciphertext FROM account_credentials WHERE account_id=$1",
          [account.id],
        )
      ).rows[0].ciphertext;
      assert.equal(stored.includes("fixture-secret"), false);
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT count(*) FROM source_messages WHERE encrypted_payload IS NOT NULL",
            )
          ).rows[0].count,
        ),
        0,
      );
      for (const path of ["/v1/accounts", "/v1/audit", "/v1/notifications"])
        assert.equal(
          JSON.stringify(await api("GET", path)).includes("fixture-secret"),
          false,
        );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/v1/accounts/${account.id}/reveal`,
            headers,
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (await api("POST", `/v1/accounts/${account.id}/reveal`, {}, true))
          .password,
        "fixture-secret",
      );
    },
  );
  await t.test(
    "incomplete and changed-password messages require explicit review",
    async () => {
      const result = await api("POST", "/v1/mock/messages", {
        ...message,
        externalMessageId: "incomplete",
        text: "user: REVIEW-A",
      });
      assert.equal(result.state, "REVIEW");
      const changed = await api("POST", "/v1/mock/messages", {
        ...message,
        externalMessageId: "changed",
        text: "name: Test\nuser: DEMO-A\npassword: conflicting",
      });
      assert.equal(changed.state, "REVIEW");
      const inbox = await api("GET", "/v1/inbox");
      const review = inbox.find((x: any) => x.id === result.id);
      await api(
        "POST",
        `/v1/inbox/${review.id}/resolve`,
        {
          version: review.version,
          account: {
            namespace: "synthetic",
            username: "review-a",
            displayName: "Reviewed fixture",
          },
        },
        true,
      );
      assert.equal((await api("GET", "/v1/accounts")).length, 3);
    },
  );
  await t.test(
    "optimistic concurrency and completed assignment never sends",
    async () => {
      assignment = await api(
        "PATCH",
        `/v1/assignments/${assignment.id}/status`,
        { version: assignment.version, status: "COMPLETED" },
      );
      assert.equal(
        (
          await app.inject({
            method: "PATCH",
            url: `/v1/assignments/${assignment.id}/status`,
            headers,
            payload: { version: 1, status: "NEW" },
          })
        ).statusCode,
        409,
      );
      assert.equal((await api("GET", "/v1/reply-jobs")).length, 0);
    },
  );
  await t.test(
    "quoted reply approval is scoped, short-lived, single-use and idempotent",
    async () => {
      template = await api("POST", "/v1/reply-templates", {
        code: "done",
        body: "تم {taskName} ✅",
      });
      const preview = await api("POST", "/v1/reply-jobs/preview", {
        assignmentId: assignment.id,
        sourceMessageId:
          assignment.sources?.[0]?.id ??
          (await api("GET", "/v1/assignments")).find(
            (a: any) => a.id === assignment.id,
          ).sources[0].id,
        templateId: template.id,
      });
      assert.equal(preview.sessionId, session.id);
      assert.equal(preview.groupId, group.id);
      job = await api(
        "POST",
        "/v1/reply-jobs/approve",
        {
          approvalToken: preview.approvalToken,
          idempotencyKey: "fixture-reply-1",
        },
        true,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/reply-jobs/approve",
            headers: sensitive,
            payload: {
              approvalToken: preview.approvalToken,
              idempotencyKey: "fixture-reply-2",
            },
          })
        ).statusCode,
        409,
      );
      const transport = new MockTransport();
      await dispatchOne(pool, transport);
      await dispatchOne(pool, transport);
      assert.equal(transport.sent.length, 1);
      assert.equal(transport.sent[0]!.sessionId, session.id);
      assert.equal((await api("GET", "/v1/reply-jobs"))[0].status, "SENT");
    },
  );
  await t.test(
    "ambiguous send never retries and crash recovery becomes UNKNOWN_DELIVERY",
    async () => {
      const source = (await api("GET", "/v1/assignments")).find(
        (a: any) => a.id === assignment.id,
      ).sources[0].id;
      const preview = await api("POST", "/v1/reply-jobs/preview", {
        assignmentId: assignment.id,
        sourceMessageId: source,
        templateId: template.id,
      });
      const ambiguous = await api(
        "POST",
        "/v1/reply-jobs/approve",
        { approvalToken: preview.approvalToken, idempotencyKey: "ambiguous" },
        true,
      );
      const broken = new MockTransport();
      broken.replyToMessage = async () => {
        throw new Error("timeout");
      };
      await dispatchOne(pool, broken);
      assert.equal(await dispatchOne(pool, broken), null);
      assert.equal(
        (
          await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
            ambiguous.id,
          ])
        ).rows[0].status,
        "UNKNOWN_DELIVERY",
      );
      await pool.query("UPDATE reply_jobs SET status='SENDING' WHERE id=$1", [
        job.id,
      ]);
      const stop = await startMockWorker(pool, new MockTransport());
      await stop();
      assert.equal(
        (
          await pool.query("SELECT status FROM reply_jobs WHERE id=$1", [
            job.id,
          ])
        ).rows[0].status,
        "UNKNOWN_DELIVERY",
      );
    },
  );
  await t.test(
    "wrong credential claims require manual/authorized evidence",
    async () => {
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/issue-flags",
            headers: sensitive,
            payload: {
              accountId: account.id,
              kind: "INVALID_ACCOUNT_CODE",
              evidenceKind: "UNVERIFIED",
            },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await api("POST", "/v1/issue-flags", {
            accountId: account.id,
            kind: "UNVERIFIED_CREDENTIALS",
            evidenceKind: "UNVERIFIED",
          })
        ).verified,
        false,
      );
      assert.equal(
        (
          await api(
            "POST",
            "/v1/issue-flags",
            {
              accountId: account.id,
              kind: "INVALID_ACCOUNT_PASSWORD",
              evidenceKind: "MANUAL",
            },
            true,
          )
        ).verified,
        true,
      );
    },
  );
  await t.test(
    "expired and stale reply previews are rejected; fresh preview reuses its idempotency key",
    async () => {
      const a = (await api("GET", "/v1/assignments")).find(
        (x: any) => x.id === assignment.id,
      );
      const body = {
        assignmentId: a.id,
        sourceMessageId: a.sources[0].id,
        templateId: template.id,
      };
      let p = await api("POST", "/v1/reply-jobs/preview", body);
      await pool.query(
        "UPDATE approvals SET expires_at=now()-interval '1 second' WHERE consumed_at IS NULL",
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/reply-jobs/approve",
            headers: sensitive,
            payload: {
              approvalToken: p.approvalToken,
              idempotencyKey: "expired",
            },
          })
        ).statusCode,
        409,
      );
      p = await api("POST", "/v1/reply-jobs/preview", body);
      const g = (await api("GET", "/v1/groups")).find(
        (x: any) => x.id === group.id,
      );
      const disabled = await api("PATCH", `/v1/groups/${g.id}`, {
        version: g.version,
        enabled: false,
      });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/reply-jobs/approve",
            headers: sensitive,
            payload: {
              approvalToken: p.approvalToken,
              idempotencyKey: "stale",
            },
          })
        ).statusCode,
        409,
      );
      await api("PATCH", `/v1/groups/${g.id}`, {
        version: disabled.version,
        enabled: true,
      });
      p = await api("POST", "/v1/reply-jobs/preview", body);
      assert.equal(
        (
          await api(
            "POST",
            "/v1/reply-jobs/approve",
            {
              approvalToken: p.approvalToken,
              idempotencyKey: "fixture-reply-1",
            },
            true,
          )
        ).id,
        job.id,
      );
      const del = await api("POST", "/v1/deletions/preview", {
        ids: [account.id],
      });
      await api("POST", "/v1/mock/messages", {
        ...message,
        externalMessageId: "new-after-delete-preview",
      });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/deletions/confirm",
            headers: sensitive,
            payload: {
              approvalToken: del.approvalToken,
              confirmation: del.confirmation,
            },
          })
        ).statusCode,
        409,
      );
    },
  );
  await t.test(
    "purge blocks uncertain delivery, stale snapshot, wrong confirmation and unauthenticated requests",
    async () => {
      let preview = await api("POST", "/v1/deletions/preview", {
        ids: [account.id],
      });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/deletions/confirm",
            headers,
            payload: {
              approvalToken: preview.approvalToken,
              confirmation: preview.confirmation,
            },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/deletions/confirm",
            headers: sensitive,
            payload: {
              approvalToken: preview.approvalToken,
              confirmation: "DELETE 99",
            },
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/deletions/confirm",
            headers: sensitive,
            payload: {
              approvalToken: preview.approvalToken,
              confirmation: preview.confirmation,
            },
          })
        ).statusCode,
        409,
      );
      const uncertain = (await api("GET", "/v1/reply-jobs")).filter(
        (j: any) => j.status === "UNKNOWN_DELIVERY",
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/v1/reply-jobs/${job.id}/reconcile`,
            headers,
            payload: { outcome: "CONFIRMED_SENT", evidenceKind: "MANUAL" },
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/v1/reply-jobs/${job.id}/reconcile`,
            headers: sensitive,
            payload: {
              outcome: "CONFIRMED_SENT",
              evidenceKind: "PROVIDER_RECEIPT",
            },
          })
        ).statusCode,
        400,
      );
      for (const [i, j] of uncertain.entries()) {
        const result = await api(
          "POST",
          `/v1/reply-jobs/${j.id}/reconcile`,
          {
            outcome: i === 0 ? "CONFIRMED_SENT" : "CONFIRMED_NOT_SENT",
            evidenceKind: "MANUAL",
          },
          true,
        );
        assert.ok(result.reconciled_at);
        assert.equal(result.status, i === 0 ? "SENT" : "FAILED");
      }
      assert.equal(await dispatchOne(pool, new MockTransport()), null);
      await api("PATCH", `/v1/accounts/${account.id}`, {
        version: (await api("GET", "/v1/accounts")).find(
          (a: any) => a.id === account.id,
        ).version,
        displayName: "Updated fixture",
      });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/deletions/confirm",
            headers: sensitive,
            payload: {
              approvalToken: preview.approvalToken,
              confirmation: preview.confirmation,
            },
          })
        ).statusCode,
        409,
      );
      preview = await api("POST", "/v1/deletions/preview", {
        ids: [account.id],
      });
      assert.equal(
        (
          await api(
            "POST",
            "/v1/deletions/confirm",
            {
              approvalToken: preview.approvalToken,
              confirmation: preview.confirmation,
            },
            true,
          )
        ).deleted,
        1,
      );
      assert.equal(
        (await pool.query("SELECT count(*) FROM account_credentials")).rows[0]
          .count,
        "0",
      );
      assert.equal(
        (await pool.query("SELECT count(*) FROM reply_jobs")).rows[0].count,
        "0",
      );
    },
  );
  await t.test(
    "archive and restore preserve task records; all deletion uses concrete snapshot",
    async () => {
      let a = (await api("GET", "/v1/accounts"))[0];
      a = await api("POST", `/v1/accounts/${a.id}/archive`, {
        version: a.version,
      });
      assert.ok(a.archived_at);
      a = await api("POST", `/v1/accounts/${a.id}/restore`, {
        version: a.version,
      });
      assert.equal(a.archived_at, null);
      const preview = await api("POST", "/v1/deletions/preview", { all: true });
      assert.equal(
        (
          await api(
            "POST",
            "/v1/deletions/confirm",
            {
              approvalToken: preview.approvalToken,
              confirmation: preview.confirmation,
            },
            true,
          )
        ).deleted,
        2,
      );
    },
  );
  await t.test(
    "durable ordered changes survive client reconnection",
    async () => {
      const first = await api("GET", "/v1/changes?cursor=0");
      assert.ok(first.items.length > 0);
      const second = await api("GET", `/v1/changes?cursor=${first.cursor}`);
      assert.equal(second.items.length, 0);
      assert.equal((await api("GET", "/v1/dashboard")).accounts, 0);
    },
  );
  await t.test(
    "custom routing/review, paged filters, safe CSV and assignment-only purge preserve identities",
    async () => {
      const feature = await createApp(pool, config);
      try {
        async function f(
          method: any,
          path: string,
          body?: any,
          sensitiveAction = false,
        ) {
          const r = await feature.inject({
            method,
            url: path,
            headers: sensitiveAction ? sensitive : headers,
            ...(body ? { payload: body } : {}),
          });
          assert.ok(r.statusCode < 300, `${path}: ${r.statusCode} ${r.body}`);
          return r.json();
        }
        const a = await f("POST", "/v1/task-types", {
            code: "route-a",
            name: "Routing A",
          }),
          b = await f("POST", "/v1/task-types", {
            code: "route-b",
            name: "Routing B",
          });
        const g = await f("POST", "/v1/groups", {
          sessionId: session.id,
          externalGroupId: "routing-test",
          title: "Routing fixture",
          taskTypeId: a.id,
          namespace: "ROUTING_TEST",
          periodKey: "p1",
        });
        assert.equal(g.namespace, "routing_test");
        const rule = await f("POST", "/v1/group-rules", {
          groupId: g.id,
          taskTypeId: b.id,
          keywords: ["دوري"],
          priority: 60,
        });
        const ingest = (externalMessageId: string, username: string) =>
          f("POST", "/v1/mock/messages", {
            sessionId: session.id,
            groupId: g.id,
            externalMessageId,
            text: `name: Routing fixture\nuser: ${username}\npassword: synthetic-feature-secret\nالمهمة: دوري`,
          });
        const ignored = await f("POST", "/v1/mock/messages", {
          sessionId: session.id,
          groupId: g.id,
          externalMessageId: "unrelated",
          text: "hello, unrelated chat",
        });
        assert.equal(ignored.state, "IGNORED");
        assert.equal(
          (
            await pool.query(
              "SELECT encrypted_payload FROM source_messages WHERE id=$1",
              [ignored.id],
            )
          ).rows[0].encrypted_payload,
          null,
        );
        await ingest("route1", "routing_fixture_a");
        let found = await f(
          "GET",
          `/v1/assignments?page=true&sessionId=${session.id}&groupId=${g.id}&taskTypeId=${b.id}&periodKey=p1&minPriority=50`,
        );
        assert.equal(found.total, 1);
        const routed = found.items[0];
        assert.equal(routed.priority, 60);
        await f("POST", "/v1/group-rules", {
          groupId: g.id,
          taskTypeId: a.id,
          keywords: ["دوري"],
          priority: 60,
        });
        const review = await ingest("route2", "routing_fixture_b");
        assert.equal(review.state, "REVIEW");
        const inbox = await f("GET", `/v1/inbox?page=true&groupId=${g.id}`);
        assert.equal(inbox.total, 1);
        assert.equal(inbox.items[0].routing_ambiguous, true);
        const resolve = {
          version: inbox.items[0].version,
          account: {
            namespace: g.namespace,
            username: "routing_fixture_b",
            displayName: "Reviewed route",
          },
        };
        assert.equal(
          (
            await feature.inject({
              method: "POST",
              url: `/v1/inbox/${review.id}/resolve`,
              headers: sensitive,
              payload: resolve,
            })
          ).statusCode,
          400,
        );
        await f(
          "POST",
          `/v1/inbox/${review.id}/resolve`,
          { ...resolve, taskTypeId: a.id },
          true,
        );
        await f("PATCH", `/v1/group-rules/${rule.id}`, {
          version: rule.version,
          enabled: false,
        });
        assert.equal(
          (await f("GET", `/v1/group-rules?groupId=${g.id}`)).filter(
            (r: any) => r.enabled,
          ).length,
          1,
        );
        const first = await f(
            "GET",
            "/v1/accounts?page=true&namespace=routing_test&limit=1",
          ),
          second = await f(
            "GET",
            "/v1/accounts?page=true&namespace=routing_test&limit=1&offset=1",
          );
        assert.equal(first.total, 2);
        assert.equal(second.total, 2);
        assert.notEqual(first.items[0].id, second.items[0].id);
        assert.equal(
          (
            await f(
              "GET",
              "/v1/accounts?page=true&search=" +
                encodeURIComponent("%' OR 1=1 --"),
            )
          ).total,
          0,
        );
        await f("POST", "/v1/accounts", {
          namespace: g.namespace,
          username: "routing_fixture_formula",
          displayName: "=SUM(1,2)",
        });
        assert.equal(
          (
            await feature.inject({
              method: "POST",
              url: "/v1/reports/export",
              headers,
              payload: { resource: "accounts" },
            })
          ).statusCode,
          403,
        );
        const report = await f(
          "POST",
          "/v1/reports/export",
          {
            resource: "accounts",
            query: { namespace: g.namespace, limit: 100 },
          },
          true,
        );
        assert.equal(report.rowsCount, 3);
        assert.equal(
          report.content.includes("synthetic-feature-secret"),
          false,
        );
        assert.ok(report.content.includes("'=SUM(1,2)"));
        const g2 = await f("POST", "/v1/groups", {
          sessionId: session.id,
          externalGroupId: "routing-period2",
          title: "Other task fixture",
          taskTypeId: a.id,
          namespace: g.namespace,
          periodKey: "p2",
        });
        await f("POST", "/v1/mock/messages", {
          sessionId: session.id,
          groupId: g2.id,
          externalMessageId: "other-task",
          text: "name: Routing fixture\nuser: routing_fixture_a\npassword: synthetic-feature-secret",
        });
        const account = (
          await f("GET", "/v1/accounts?search=routing_fixture_a")
        )[0];
        assert.equal(
          (await f("GET", `/v1/assignments?accountId=${account.id}`)).length,
          2,
        );
        const preview = await f(
          "POST",
          `/v1/assignments/${routed.id}/deletion-preview`,
          {},
        );
        assert.equal(
          (
            await feature.inject({
              method: "POST",
              url: `/v1/assignments/${routed.id}/delete`,
              headers,
              payload: {
                approvalToken: preview.approvalToken,
                confirmation: "DELETE TASK",
              },
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await f(
              "POST",
              `/v1/assignments/${routed.id}/delete`,
              {
                approvalToken: preview.approvalToken,
                confirmation: "DELETE TASK",
              },
              true,
            )
          ).accountPreserved,
          true,
        );
        assert.equal(
          (await f("GET", `/v1/assignments?accountId=${account.id}`)).length,
          1,
        );
        assert.equal(
          (await f("POST", `/v1/accounts/${account.id}/reveal`, {}, true))
            .password,
          "synthetic-feature-secret",
        );
        const ids = (await f("GET", "/v1/accounts?namespace=routing_test")).map(
          (x: any) => x.id,
        );
        const deletion = await f("POST", "/v1/deletions/preview", { ids });
        await f(
          "POST",
          "/v1/deletions/confirm",
          {
            approvalToken: deletion.approvalToken,
            confirmation: deletion.confirmation,
          },
          true,
        );
      } finally {
        await feature.close();
      }
    },
  );
  await t.test(
    "activity pages expose recent/unread records beyond500 with bounded read and filtered redacted audit",
    async () => {
      const activity = await createApp(pool, config);
      try {
        const request = async (method: any, path: string, payload?: any) => {
          const result = await activity.inject({
            method,
            url: path,
            headers,
            ...(payload ? { payload } : {}),
          });
          assert.equal(result.statusCode, 200, `${path}: ${result.statusCode}`);
          return result.json();
        };
        for (const url of [
          "/v1/operations",
          "/v1/notifications/state",
          "/v1/audit?page=true",
        ])
          assert.equal((await activity.inject({ url })).statusCode, 401);
        const before = await request("GET", "/v1/notifications/state");
        await pool.query(
          "INSERT INTO notifications(type) SELECT 'SYNTHETIC_ACTIVITY_TEST' FROM generate_series(1,530)",
        );
        const state = await request("GET", "/v1/notifications/state");
        const first = await request(
          "GET",
          "/v1/notifications?page=true&type=SYNTHETIC_ACTIVITY_TEST&limit=50",
        );
        assert.equal(first.total, 530);
        assert.equal(first.items.length, 50);
        assert.equal(first.items[0].id, state.newestId);
        const tail = await request(
          "GET",
          "/v1/notifications?page=true&type=SYNTHETIC_ACTIVITY_TEST&limit=50&offset=500",
        );
        assert.equal(tail.items.length, 30);
        assert.notEqual(tail.items[0].id, first.items[0].id);
        const changes = await request(
          "GET",
          "/v1/changes?cursor=" + before.newestId,
        );
        assert.equal(changes.items.length, 500);
        assert.equal(changes.hasMore, true);
        const next = await request(
          "GET",
          "/v1/changes?cursor=" + changes.cursor,
        );
        assert.equal(next.items.length, 30);
        assert.equal(next.hasMore, false);
        assert.equal(next.cursor, state.newestId);
        assert.equal(
          new Set([...changes.items, ...next.items].map((x: any) => x.id)).size,
          530,
        );
        const ids = first.items.slice(0, 5).map((x: any) => x.id);
        assert.equal(
          (await request("POST", "/v1/notifications/read", { ids })).updated,
          5,
        );
        const readAt = (
          await pool.query("SELECT read_at FROM notifications WHERE id=$1", [
            ids[0],
          ])
        ).rows[0].read_at;
        await request("POST", "/v1/notifications/read", { ids });
        assert.deepEqual(
          (
            await pool.query("SELECT read_at FROM notifications WHERE id=$1", [
              ids[0],
            ])
          ).rows[0].read_at,
          readAt,
        );
        assert.equal(
          (
            await request(
              "GET",
              "/v1/notifications?page=true&type=SYNTHETIC_ACTIVITY_TEST&read=unread",
            )
          ).total,
          525,
        );
        assert.equal(
          (await request("GET", "/v1/notifications/state")).unreadCount,
          state.unreadCount - 5,
        );
        const target = randomUUID();
        await pool.query(
          "INSERT INTO audit_events(action,target_id,created_at) VALUES('SYNTHETIC_AUDIT_TEST',$1,'2026-01-02T00:00:00Z'),('SYNTHETIC_AUDIT_TEST',$1,'2026-02-02T00:00:00Z')",
          [target],
        );
        const audit = await request(
          "GET",
          `/v1/audit?page=true&action=SYNTHETIC_AUDIT_TEST&targetId=${target}&from=2026-01-01T00:00:00Z&to=2026-01-31T00:00:00Z`,
        );
        assert.equal(audit.total, 1);
        assert.equal(audit.items[0].target_id, target);
        assert.deepEqual(
          Object.keys(audit.items[0]).sort(),
          ["id", "actor_id", "action", "target_id", "created_at"].sort(),
        );
        for (const path of [
          "/v1/audit?action=x%27%20OR%201=1",
          "/v1/audit?page=true&from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z",
          "/v1/notifications?page=true&limit=501",
          "/v1/notifications?page=garbage",
        ])
          assert.equal(
            (await activity.inject({ url: path, headers })).statusCode,
            400,
          );
        assert.equal(
          (
            await activity.inject({
              method: "POST",
              url: "/v1/notifications/read",
              headers,
              payload: { ids: [] },
            })
          ).statusCode,
          400,
        );
        const operations = await request("GET", "/v1/operations");
        assert.equal(operations.provider, "mock");
        assert.equal(operations.liveSendingEnabled, false);
        assert.ok(operations.migrations >= 6);
        assert.ok(operations.oldestReviewSeconds >= 0);
        assert.ok(operations.processUptimeSeconds >= 0);
        assert.equal(
          operations.counts.accounts,
          Number(
            (await pool.query("SELECT count(*) FROM accounts")).rows[0].count,
          ),
        );
        for (const secret of [
          "ciphertext",
          "password",
          "username",
          "DATABASE_URL",
          "token_hash",
          "synthetic-feature-secret",
        ])
          assert.equal(JSON.stringify(operations).includes(secret), false);
      } finally {
        await activity.close();
      }
    },
  );
  await t.test(
    "notification head never skips transactions that commit after reconnect baseline",
    async () => {
      const activity = await createApp(pool, config),
        writer = await pool.connect();
      let waiting: Promise<unknown> | undefined;
      try {
        const state = (
          await activity.inject({ url: "/v1/notifications/state", headers })
        ).json();
        await writer.query("BEGIN");
        await event(writer, "SYNTHETIC_LATE_COMMIT", randomUUID());
        waiting = transaction(pool, async (c) =>
          event(c, "SYNTHETIC_SECOND_COMMIT", randomUUID()),
        );
        assert.equal(
          (
            await activity.inject({ url: "/v1/notifications/state", headers })
          ).json().newestId,
          state.newestId,
        );
        await writer.query("COMMIT");
        await waiting;
        const changes = (
          await activity.inject({
            url: "/v1/changes?cursor=" + state.newestId,
            headers,
          })
        ).json();
        assert.deepEqual(
          changes.items.map((x: any) => x.type),
          ["SYNTHETIC_LATE_COMMIT", "SYNTHETIC_SECOND_COMMIT"],
        );
        assert.ok(Number(changes.items[1].id) > Number(changes.items[0].id));
      } finally {
        await writer.query("ROLLBACK");
        writer.release();
        if (waiting) await waiting;
        await activity.close();
      }
    },
  );
  await t.test(
    "editable scoped templates invalidate previews and keep already-approved snapshots immutable",
    async () => {
      const feature = await createApp(pool, config);
      const req = async (
        method: any,
        url: string,
        payload?: any,
        reauth = false,
      ) =>
        feature.inject({
          method,
          url,
          headers: reauth ? sensitive : headers,
          ...(payload ? { payload } : {}),
        });
      const ok = async (
        method: any,
        url: string,
        payload?: any,
        reauth = false,
      ) => {
        const r = await req(method, url, payload, reauth);
        assert.equal(r.statusCode, 200, `${url}: ${r.statusCode}`);
        return r.json();
      };
      try {
        const source = await ok("POST", "/v1/mock/messages", {
          sessionId: session.id,
          groupId: group.id,
          externalMessageId: "synthetic-template-source",
          text: "name: Synthetic template account\nuser: synthetic_template_user",
        });
        const a = (
          await ok("GET", "/v1/assignments?search=synthetic_template_user")
        )[0];
        let scoped = await ok("POST", "/v1/reply-templates", {
          code: "synthetic-template-scoped",
          body: "قبل {taskName}",
          groupId: group.id,
          taskTypeId: task.id,
        });
        const global = await ok("POST", "/v1/reply-templates", {
          code: "synthetic-template-global",
          body: "عام {taskName}",
        });
        const other = await ok("POST", "/v1/reply-templates", {
          code: "synthetic-template-other",
          body: "نطاق آخر",
          groupId: group2.id,
          taskTypeId: task2.id,
        });
        const disabled = await ok("POST", "/v1/reply-templates", {
          code: "synthetic-template-disabled",
          body: "متوقف",
          enabled: false,
        });
        const matches = await ok(
          "GET",
          `/v1/reply-templates?enabled=true&groupId=${group.id}&taskTypeId=${task.id}&search=synthetic-template`,
        );
        assert.deepEqual(
          matches.map((n: any) => n.id).sort(),
          [global.id, scoped.id].sort(),
        );
        const previewBody = (templateId: string) => ({
          assignmentId: a.id,
          sourceMessageId: source.id,
          templateId,
        });
        assert.equal(
          (
            await req("POST", "/v1/reply-jobs/preview", previewBody(other.id))
          ).json().code,
          "TEMPLATE_SCOPE_MISMATCH",
        );
        assert.equal(
          (
            await req(
              "POST",
              "/v1/reply-jobs/preview",
              previewBody(disabled.id),
            )
          ).json().code,
          "TEMPLATE_NOT_AVAILABLE",
        );
        const preview = await ok(
          "POST",
          "/v1/reply-jobs/preview",
          previewBody(scoped.id),
        );
        scoped = await ok("PATCH", "/v1/reply-templates/" + scoped.id, {
          version: scoped.version,
          body: "بعد {taskName}",
        });
        assert.equal(
          (
            await req("PATCH", "/v1/reply-templates/" + scoped.id, {
              version: 1,
              body: "stale edit",
            })
          ).statusCode,
          409,
        );
        assert.equal(
          (
            await req("PATCH", "/v1/reply-templates/" + scoped.id, {
              version: scoped.version,
              body: "unsafe {password}",
            })
          ).json().code,
          "UNSAFE_TEMPLATE",
        );
        const stale = await req(
          "POST",
          "/v1/reply-jobs/approve",
          {
            approvalToken: preview.approvalToken,
            idempotencyKey: "synthetic-template-stale",
          },
          true,
        );
        assert.equal(stale.statusCode, 409);
        assert.equal(stale.json().code, "STALE_PREVIEW");
        assert.equal(
          Number(
            (
              await pool.query(
                "SELECT count(*) FROM reply_jobs WHERE idempotency_key='synthetic-template-stale'",
              )
            ).rows[0].count,
          ),
          0,
        );
        const legacy = await ok(
          "POST",
          "/v1/reply-jobs/preview",
          previewBody(scoped.id),
        );
        await pool.query(
          "UPDATE approvals SET payload=payload-'templateVersion' WHERE token_hash=$1",
          [hash(legacy.approvalToken)],
        );
        assert.equal(
          (
            await req(
              "POST",
              "/v1/reply-jobs/approve",
              {
                approvalToken: legacy.approvalToken,
                idempotencyKey: "synthetic-template-legacy",
              },
              true,
            )
          ).json().code,
          "STALE_PREVIEW",
        );
        const fresh = await ok(
          "POST",
          "/v1/reply-jobs/preview",
          previewBody(scoped.id),
        );
        const approved = await ok(
          "POST",
          "/v1/reply-jobs/approve",
          {
            approvalToken: fresh.approvalToken,
            idempotencyKey: "synthetic-template-approved",
          },
          true,
        );
        scoped = await ok("PATCH", "/v1/reply-templates/" + scoped.id, {
          version: scoped.version,
          body: "ثالث {taskName}",
          enabled: false,
        });
        assert.equal(
          (
            await req("POST", "/v1/reply-jobs/preview", previewBody(scoped.id))
          ).json().code,
          "TEMPLATE_NOT_AVAILABLE",
        );
        await dispatchOne(pool, new MockTransport());
        const sent = (
          await pool.query("SELECT body,status FROM reply_jobs WHERE id=$1", [
            approved.id,
          ])
        ).rows[0];
        assert.equal(sent.status, "SENT");
        assert.equal(sent.body, fresh.body);
        assert.notEqual(sent.body, "ثالث " + task.name);
        scoped = await ok("PATCH", "/v1/reply-templates/" + scoped.id, {
          version: scoped.version,
          enabled: true,
        });
        scoped = await ok("PATCH", "/v1/reply-templates/" + scoped.id, {
          version: scoped.version,
          groupId: null,
        });
        const racing = await ok(
          "POST",
          "/v1/reply-jobs/preview",
          previewBody(scoped.id),
        );
        const [edit, approve] = await Promise.all([
          req("PATCH", "/v1/reply-templates/" + scoped.id, {
            version: scoped.version,
            body: "رابع {taskName}",
            groupId: group.id,
          }),
          req(
            "POST",
            "/v1/reply-jobs/approve",
            {
              approvalToken: racing.approvalToken,
              idempotencyKey: "synthetic-template-race",
            },
            true,
          ),
        ]);
        assert.equal(edit.statusCode, 200);
        assert.ok([200, 409].includes(approve.statusCode));
        if (approve.statusCode === 200)
          assert.equal(approve.json().body, racing.body);
        else assert.equal(approve.json().code, "STALE_PREVIEW");
        await pool.query(
          "INSERT INTO reply_templates(id,code,body) SELECT gen_random_uuid(),'synthetic-template-page-'||n,'synthetic body' FROM generate_series(1,120) n",
        );
        const page = await ok(
          "GET",
          "/v1/reply-templates?page=true&search=synthetic-template-page&limit=50&offset=100",
        );
        assert.equal(page.total, 120);
        assert.equal(page.items.length, 20);
        const deletion = await ok("POST", "/v1/deletions/preview", {
          ids: [a.account_id],
        });
        await ok(
          "POST",
          "/v1/deletions/confirm",
          {
            approvalToken: deletion.approvalToken,
            confirmation: deletion.confirmation,
          },
          true,
        );
      } finally {
        await feature.close();
      }
    },
  );
  await t.test(
    "account details page isolates tasks/sources/flags/current-record history and never reveals secrets",
    async () => {
      const body = {
        ...message,
        externalMessageId: "details-one",
        text: "name: Synthetic details\nuser: synthetic-details\npassword: synthetic-details-secret",
      };
      await api("POST", "/v1/mock/messages", body);
      await api("POST", "/v1/mock/messages", {
        ...body,
        sessionId: session2.id,
        groupId: group2.id,
        externalMessageId: "details-two",
      });
      await api("POST", "/v1/mock/messages", {
        ...body,
        externalMessageId: "details-conflict",
        text: body.text.replace(
          "synthetic-details-secret",
          "synthetic-conflict-secret",
        ),
      });
      const account = (
        await pool.query(
          "SELECT id FROM accounts WHERE username_normalized='synthetic-details'",
        )
      ).rows[0];
      const other = await api("POST", "/v1/accounts", {
        namespace: "synthetic-other-details",
        username: "synthetic-details",
        displayName: "Synthetic unrelated",
        password: "synthetic-unrelated-secret",
      });
      await api(
        "POST",
        "/v1/issue-flags",
        {
          accountId: account.id,
          kind: "INVALID_ACCOUNT_PASSWORD",
          evidenceKind: "MANUAL",
        },
        true,
      );
      await pool.query(
        "INSERT INTO issue_flags(id,account_id,kind,verified,evidence_kind) SELECT gen_random_uuid(),$1,'UNVERIFIED_CREDENTIALS',false,'UNVERIFIED' FROM generate_series(1,54)",
        [account.id],
      );
      const tasks = await api(
        "GET",
        `/v1/accounts/${account.id}/details?section=tasks`,
      );
      assert.equal(tasks.total, 2);
      assert.equal(
        tasks.items.every((r: any) => r.source_count === 1),
        true,
      );
      const sources = await api(
        "GET",
        `/v1/accounts/${account.id}/details?section=sources`,
      );
      assert.equal(sources.total, 3);
      assert.equal(
        sources.items.filter((r: any) => r.state === "REVIEW").length,
        1,
      );
      const first = await api(
        "GET",
        `/v1/accounts/${account.id}/details?section=flags&limit=50`,
      );
      const second = await api(
        "GET",
        `/v1/accounts/${account.id}/details?section=flags&limit=50&offset=50`,
      );
      assert.equal(first.total, 55);
      assert.equal(second.total, 55);
      assert.equal(second.items.length, 5);
      assert.equal(
        new Set([...first.items, ...second.items].map((r) => r.id)).size,
        55,
      );
      const history = await api(
        "GET",
        `/v1/accounts/${account.id}/details?section=history&limit=100`,
      );
      assert.ok(
        history.items.some(
          (r: any) => r.action === "CREDENTIAL_ERROR_VERIFIED",
        ),
      );
      assert.ok(
        history.items.some((r: any) => r.action === "MESSAGE_PROCESSED"),
      );
      assert.equal(
        history.items.some((r: any) => r.target_id === other.id),
        false,
      );
      const serialized = JSON.stringify([
        tasks,
        sources,
        first,
        second,
        history,
      ]);
      for (const secret of [
        "synthetic-details-secret",
        "synthetic-conflict-secret",
        "synthetic-unrelated-secret",
        "encrypted_payload",
        "encrypted_transport_key",
        "ciphertext",
      ])
        assert.equal(serialized.includes(secret), false);
      assert.equal(
        (await app.inject({ url: `/v1/accounts/${account.id}/details` }))
          .statusCode,
        401,
      );
      for (const q of [
        "section=bad",
        "section=flags&limit=101",
        "section=flags&offset=-1",
        "section=tasks&raw=true",
      ])
        assert.equal(
          (
            await app.inject({
              url: `/v1/accounts/${account.id}/details?${q}`,
              headers,
            })
          ).statusCode,
          400,
        );
      assert.equal(
        (
          await app.inject({
            url: `/v1/accounts/${randomUUID()}/details`,
            headers,
          })
        ).statusCode,
        404,
      );
    },
  );
  await t.test(
    "bounded eight-worker replay burst preserves identity, both tasks and every source",
    { timeout: 60000 },
    async () => {
      const sessionId = randomUUID(),
        tasks = [randomUUID(), randomUUID()],
        groups = [randomUUID(), randomUUID()];
      await pool.query(
        "INSERT INTO whatsapp_sessions(id,label,provider) VALUES($1,'Synthetic bounded load','mock')",
        [sessionId],
      );
      for (let i = 0; i < 2; i++) {
        await pool.query(
          "INSERT INTO task_types(id,code,name) VALUES($1,$2,'Synthetic load task')",
          [tasks[i], `synthetic-load-task-${i}`],
        );
        await pool.query(
          "INSERT INTO groups(id,session_id,external_group_id,title,task_type_id,namespace,period_key) VALUES($1,$2,$3,'Synthetic load group',$4,'synthetic-bounded-load','test')",
          [groups[i], sessionId, `synthetic-load-group-${i}`, tasks[i]],
        );
      }
      const service = new Service(pool, new Vault(config.encryptionKey));
      let next = 0,
        created = 0,
        duplicates = 0;
      const started = performance.now();
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (next < 192) {
            const n = next++,
              message = n % 96,
              groupIndex = Math.floor(message / 24) % 2;
            const r = await service.ingest({
              sessionId,
              groupId: groups[groupIndex]!,
              externalMessageId: `synthetic-load-${message}`,
              text: `name: Synthetic load\nuser: synthetic-load-${message % 24}`,
            });
            if (r.duplicate) duplicates++;
            else created++;
          }
        }),
      );
      assert.equal(created, 96);
      assert.equal(duplicates, 96);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM accounts WHERE namespace='synthetic-bounded-load'",
          )
        ).rows[0].n,
        24,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM assignments a JOIN accounts ac ON ac.id=a.account_id WHERE ac.namespace='synthetic-bounded-load'",
          )
        ).rows[0].n,
        48,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM source_messages WHERE session_id=$1 AND state='PROCESSED' AND encrypted_payload IS NULL",
            [sessionId],
          )
        ).rows[0].n,
        96,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM assignment_sources x JOIN source_messages s ON s.id=x.source_message_id WHERE s.session_id=$1",
            [sessionId],
          )
        ).rows[0].n,
        96,
      );
      t.diagnostic(
        `Bounded synthetic burst:192 ingests/8 workers/96 sources/24 accounts/48 tasks; elapsedMs=${Math.round(performance.now() - started)}. Not production capacity proof.`,
      );
    },
  );
});
