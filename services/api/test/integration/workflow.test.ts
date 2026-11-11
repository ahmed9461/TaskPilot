import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { dispatchOne, startMockWorker } from "../../src/outbox.js";
import { MockTransport } from "../../src/transport.js";
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
});
