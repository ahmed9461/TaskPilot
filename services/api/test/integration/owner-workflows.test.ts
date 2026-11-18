import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { Service } from "../../src/service.js";
import { Vault } from "../../src/security.js";
import { dispatchOne } from "../../src/outbox.js";
import { MockTransport } from "../../src/transport.js";
import { finishFragmentWindow } from "../../src/split-intake.js";
import { fireTaskReminders } from "../../src/task-reminders.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("owner workflows preserve preview boundaries, quote identity and ongoing tasks", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
    mockEnabled: true,
  };
  const app = await createApp(pool, config);
  const vault = new Vault(config.encryptionKey),
    service = new Service(pool, vault);
  t.after(async () => {
    await app.close();
    await pool.end();
  });
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,notifications,audit_events CASCADE",
  );
  async function request(
    method: "GET" | "POST" | "PATCH" | "PUT",
    url: string,
    payload?: object,
    reauth = true,
  ) {
    return app.inject({
      method,
      url,
      headers: {
        authorization: "Bearer " + config.apiToken,
        ...(reauth ? { "x-reauth-secret": config.reauthSecret } : {}),
      },
      payload,
    });
  }
  async function ok(
    method: Parameters<typeof request>[0],
    url: string,
    payload?: object,
  ) {
    const r = await request(method, url, payload);
    assert.equal(r.statusCode, 200, `${method} ${url} ${r.body}`);
    return r.json();
  }
  const session = await ok("POST", "/v1/sessions", {
    label: "Workflow mock session",
  });
  const type = await ok("POST", "/v1/task-types", {
    code: "fixture-work",
    name: "Synthetic homework",
  });
  const alternate = await ok("POST", "/v1/task-types", {
    code: "fixture-alt",
    name: "Synthetic discussion",
  });
  const addGroup = (title: string) =>
    ok("POST", "/v1/groups", {
      sessionId: session.id,
      externalGroupId: randomUUID(),
      title,
      taskTypeId: type.id,
      namespace: "workflows",
      periodKey: "synthetic",
    });
  const group = await addGroup("مجموعة اختبار أولى");
  const otherGroup = await addGroup("مجموعة اختبار ثانية");
  const ingest = (
    text: string,
    groupId = group.id,
    participant?: string,
    key = randomUUID(),
  ) =>
    service.ingest(
      {
        sessionId: session.id,
        groupId,
        externalMessageId: key,
        text,
      },
      participant
        ? { id: key, remoteJid: "1@g.us", participant, fromMe: false }
        : undefined,
      Math.floor(Date.now() / 1000),
    );
  const first = await ingest("الاسم: طالب اختباري\nS298765001\nSynthPass9!");
  const second = await ingest("طالب افتراضي\nS298765002\nSynthPass8!");
  await ingest("حساب خارجي\nS298765003\nSynthPass7!", otherGroup.id);
  const template = await ok("POST", "/v1/reply-templates", {
    code: "fixture-workflow-done",
    body: "تم {displayName}",
  });
  const account = (
    await pool.query("SELECT id FROM assignments WHERE id=$1", [
      first.assignmentId,
    ])
  ).rows[0];
  const accountId = (
    await pool.query("SELECT account_id FROM assignments WHERE id=$1", [
      account.id,
    ])
  ).rows[0].account_id;

  await t.test(
    "batch queues exactly one reply per account in an approved group, with drift and replay protection",
    async () => {
      const scope = { groupId: group.id, templateId: template.id };
      const stale = await ok("POST", "/v1/reply-batches/preview", scope);
      assert.equal(stale.accountCount, 2);
      assert.equal(stale.targets.length, 2);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
      assert.equal(
        (
          await request(
            "POST",
            "/v1/reply-batches/approve",
            { approvalToken: stale.approvalToken },
            false,
          )
        ).statusCode,
        403,
      );
      await ingest("طالب افتراضي\nS298765002\nSynthPass8!");
      assert.equal(
        (
          await request("POST", "/v1/reply-batches/approve", {
            approvalToken: stale.approvalToken,
          })
        ).json().code,
        "STALE_PREVIEW",
      );
      const p = await ok("POST", "/v1/reply-batches/preview", scope);
      const outcomes = await Promise.all(
        Array.from({ length: 2 }, () =>
          request("POST", "/v1/reply-batches/approve", {
            approvalToken: p.approvalToken,
          }),
        ),
      );
      assert.equal(outcomes.filter((r) => r.statusCode === 200).length, 1);
      const receipt = await ok("GET", "/v1/reply-batches/" + p.batchId);
      assert.deepEqual(receipt.counts, [{ status: "APPROVED", count: 2 }]);
      const again = await ok("POST", "/v1/reply-batches/preview", scope);
      assert.equal(again.targets.length, 0);
      assert.equal(again.alreadyReplied, 2);
      const transport = new MockTransport();
      await dispatchOne(pool, transport);
      await dispatchOne(pool, transport);
      assert.equal(transport.sent.length, 2);
      assert.ok(
        transport.sent.every(
          (target) => target.groupId === group.id && target.sourceMessageId,
        ),
      );
      assert.equal(
        (await ok("GET", "/v1/reply-batches/" + p.batchId)).counts[0].status,
        "SENT",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM assignments WHERE status='COMPLETED'",
          )
        ).rows[0].n,
        0,
      );
    },
  );

  await t.test(
    "image approval ties uploaded bytes to preview and queue expires encrypted images after delivery",
    async () => {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCeEAAAAASUVORK5CYII=",
        "base64",
      );
      const images = [png, png].map((bytes) => ({
        mime: "image/png",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }));
      const p = await ok("POST", "/v1/reply-jobs/preview", {
        assignmentId: second.assignmentId,
        sourceMessageId: second.id,
        templateId: template.id,
        images,
      });
      assert.equal(p.imageCount, 2);
      const job = {
        approvalToken: p.approvalToken,
        idempotencyKey: randomUUID(),
      };
      assert.equal(
        (
          await request("POST", "/v1/reply-jobs/approve", {
            ...job,
            images: [png.toString("base64")],
          })
        ).json().code,
        "REPLY_IMAGE_MISMATCH",
      );
      const approved = await ok("POST", "/v1/reply-jobs/approve", {
        ...job,
        images: [png.toString("base64"), png.toString("base64")],
      });
      const storage = (
        await pool.query(
          "SELECT ciphertext FROM reply_job_images WHERE job_id=$1",
          [approved.id],
        )
      ).rows[0].ciphertext;
      assert.ok(!storage.includes(png.toString("base64")));
      const transport = new MockTransport();
      await dispatchOne(pool, transport, vault);
      assert.equal(transport.sent[0]?.images?.length, 2);
      assert.deepEqual(transport.sent[0]?.images?.[0]?.bytes, png);
      assert.equal(
        (
          await pool.query("SELECT 1 FROM reply_job_images WHERE job_id=$1", [
            approved.id,
          ])
        ).rowCount,
        0,
      );
    },
  );

  await t.test(
    "split intake scopes each encrypted window and keeps username quote for review",
    async () => {
      const sender = "10001@lid";
      await ingest("BundleTest7!", group.id, sender);
      await ingest("اسم منفصل", otherGroup.id, sender);
      await ingest("اسم دخيل", group.id, "22002@lid");
      const id = await ingest("S298765004@seu.edu.sa", group.id, sender);
      await ingest("اسم تجريبي", group.id, sender);
      assert.equal(id.state, "FRAGMENT_PENDING");
      await pool.query(
        "UPDATE source_messages SET fragment_expires=now() WHERE fragment_expires IS NOT NULL",
      );
      while (await finishFragmentWindow(pool, vault)) {}
      const row = (
        await pool.query(
          "SELECT state,fragment_count,encrypted_transport_key,encrypted_payload FROM source_messages WHERE id=$1",
          [id.id],
        )
      ).rows[0];
      assert.equal(row.state, "REVIEW");
      assert.equal(row.fragment_count, 3);
      const body = vault.open(row.encrypted_payload, "message:" + id.id);
      assert.ok(body.includes("اسم تجريبي"));
      assert.ok(!/اسم دخيل|اسم منفصل/.test(body));
      const result = await ok("POST", "/v1/inbox/" + id.id + "/reveal", {});
      assert.equal(result.fields.username, "S298765004");
      assert.equal(result.fields.password, "BundleTest7!");
      assert.ok(row.encrypted_transport_key);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM accounts WHERE username_normalized='s298765004'",
          )
        ).rows[0].n,
        0,
      );
    },
  );

  await t.test(
    "two usernames from one sender remain separate review rows",
    async () => {
      const sender = "14001@lid";
      const id1 = await ingest("S298765005", group.id, sender);
      await ingest("BundleTest6!", group.id, sender);
      const id2 = await ingest("S298765006@seu.edu.sa", group.id, sender);
      await pool.query(
        "UPDATE source_messages SET fragment_expires=now() WHERE fragment_expires IS NOT NULL",
      );
      while (await finishFragmentWindow(pool, vault)) {}
      const rows = (
        await pool.query(
          "SELECT id,state,fragment_count,encrypted_payload FROM source_messages WHERE id=ANY($1::uuid[])",
          [[id1.id, id2.id]],
        )
      ).rows;
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.equal(row.state, "REVIEW");
        assert.equal(row.fragment_count, 1);
        assert.ok(
          !vault
            .open(row.encrypted_payload, "message:" + row.id)
            .includes("BundleTest6!"),
        );
      }
    },
  );

  await t.test(
    "standing follow-up survives completing one item and deduplicates later items without resetting status",
    async () => {
      const path = "/v1/accounts/" + accountId;
      await ok("PATCH", path + "/followups", {
        groupId: group.id,
        active: true,
        version: 0,
      });
      assert.equal(
        (
          await request("PATCH", path + "/followups", {
            groupId: otherGroup.id,
            active: true,
            version: 0,
          })
        ).json().code,
        "FOLLOWUP_SCOPE_UNAVAILABLE",
      );
      const firstActivity = await ingest(
        "نشاط: واجب اختبار 1\nS298765001@seu.edu.sa",
      );
      const version = (
        await pool.query("SELECT version FROM assignments WHERE id=$1", [
          firstActivity.assignmentId,
        ])
      ).rows[0].version;
      await ok(
        "PATCH",
        "/v1/assignments/" + firstActivity.assignmentId + "/status",
        { status: "COMPLETED", version },
      );
      const duplicate = await ingest("S298765001\nنشاط: واجب  اختبار 1");
      assert.equal(duplicate.assignmentId, firstActivity.assignmentId);
      assert.equal(
        (
          await pool.query("SELECT status FROM assignments WHERE id=$1", [
            firstActivity.assignmentId,
          ])
        ).rows[0].status,
        "COMPLETED",
      );
      const next = await ok("POST", path + "/followup-activities", {
        groupId: group.id,
        taskTypeId: type.id,
        activity: "واجب اختبار 2",
      });
      assert.notEqual(next.assignmentId, firstActivity.assignmentId);
      await ok("PATCH", path + "/followups", {
        groupId: group.id,
        active: false,
        version: 1,
      });
      const afterPause = await ingest("S298765001\nنشاط: واجب اختبار 3");
      assert.equal(afterPause.state, "REVIEW");
    },
  );

  await t.test(
    "group task creation, read-only rule simulation and Riyadh work briefing",
    async () => {
      const requestBody = {
        groupId: group.id,
        taskTypeId: type.id,
        activity: "مناقشة تجربة 1",
        todayOnly: true,
      };
      const preview = await ok(
        "POST",
        "/v1/workflows/tasks/preview",
        requestBody,
      );
      assert.equal(preview.targets.length, 2);
      assert.equal(
        (
          await ok("POST", "/v1/workflows/tasks/apply", {
            approvalToken: preview.approvalToken,
          })
        ).created,
        2,
      );
      assert.equal(
        (await ok("POST", "/v1/workflows/tasks/preview", requestBody))
          .approvalToken,
        null,
      );
      const rule = await ok(
        "POST",
        "/v1/groups/" + group.id + "/rules/simulate",
        {
          taskTypeId: alternate.id,
          priority: 50,
          keywords: ["Law121"],
          examples: ["Law121", "Math003"],
        },
      );
      assert.equal(rule.items[0].after.name, alternate.name);
      assert.equal(rule.items[1].after.name, type.name);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int n FROM group_rules WHERE group_id=$1",
            [group.id],
          )
        ).rows[0].n,
        0,
      );
      const report = await ok(
        "GET",
        "/v1/workflows/briefing?groupId=" + group.id,
      );
      assert.equal(report.inbox.combined, 1);
      assert.equal(report.task.completed, 1);
      assert.equal(report.task.without_reply, 1);
      assert.ok(report.first.length > 0);
    },
  );

  await t.test(
    "encrypted task note creates a single due notification and points at the exact assignment",
    async () => {
      const path = "/v1/assignments/" + first.assignmentId + "/note";
      const dueAt = new Date(Date.now() + 3_600_000).toISOString();
      const value = "Synthetic note text";
      await ok("PUT", path, { note: value, dueAt, version: 0 });
      const row = (
        await pool.query(
          "SELECT ciphertext FROM task_followup_notes WHERE assignment_id=$1",
          [first.assignmentId],
        )
      ).rows[0];
      assert.ok(!row.ciphertext.includes(value));
      assert.equal((await ok("POST", path + "/read", {})).note, value);
      await pool.query(
        "UPDATE task_followup_notes SET due_at=now()-interval '1 second' WHERE assignment_id=$1",
        [first.assignmentId],
      );
      assert.equal(await fireTaskReminders(pool), 1);
      assert.equal(await fireTaskReminders(pool), 0);
      const notifications = await ok("GET", "/v1/notifications");
      assert.ok(
        notifications.some(
          (item: { type: string; subject_id: string }) =>
            item.type === "TASK_REMINDER_DUE" &&
            item.subject_id === first.assignmentId,
        ),
      );
      const assignment = await ok(
        "GET",
        "/v1/assignments?assignmentId=" + first.assignmentId,
      );
      assert.deepEqual(
        assignment.map((item: { id: string }) => item.id),
        [first.assignmentId],
      );
    },
  );
  await t.test(
    "mixed fragments are held for review and distant messages do not join",
    async () => {
      const sender = "34001@lid";
      await ingest("TestBundle73!", group.id, sender);
      const pair = await ingest(
        "اسم اختبار آخر\nS298765007@seu.edu.sa",
        group.id,
        sender,
      );
      const sender2 = "35001@lid";
      await ingest("اسم منفصل زمنيًا\nFarBundle59!", group.id, sender2);
      const distant = await ingest("S298765008", group.id, sender2);
      await pool.query(
        "UPDATE source_messages SET fragment_message_at=now()-interval '100 seconds' WHERE id=$1",
        [distant.id],
      );
      await pool.query(
        "UPDATE source_messages SET fragment_expires=now() WHERE fragment_expires IS NOT NULL",
      );
      while (await finishFragmentWindow(pool, vault)) {}
      const fetchCount = async (id: string | undefined) =>
        (
          await pool.query(
            "SELECT fragment_count FROM source_messages WHERE id=$1",
            [id],
          )
        ).rows[0].fragment_count;
      assert.equal(await fetchCount(pair.id), 2);
      assert.equal(await fetchCount(distant.id), 1);
    },
  );

  await t.test(
    "canceling a batch preserves sent jobs and skips waiting jobs",
    async () => {
      const newTemplate = await ok("POST", "/v1/reply-templates", {
        code: "fixture-batch-cancel",
        body: "متابعة اختبار",
      });
      const p = await ok("POST", "/v1/reply-batches/preview", {
        groupId: group.id,
        templateId: newTemplate.id,
      });
      assert.equal(p.targets.length, 2);
      await ok("POST", "/v1/reply-batches/approve", {
        approvalToken: p.approvalToken,
      });
      const transport = new MockTransport();
      await dispatchOne(pool, transport);
      assert.equal(
        (
          await request(
            "POST",
            "/v1/reply-batches/" + p.batchId + "/cancel",
            {},
            false,
          )
        ).statusCode,
        403,
      );
      assert.equal(
        (await ok("POST", "/v1/reply-batches/" + p.batchId + "/cancel", {}))
          .canceled,
        1,
      );
      assert.deepEqual(
        (await ok("GET", "/v1/reply-batches/" + p.batchId)).counts,
        [
          { status: "CANCELED", count: 1 },
          { status: "SENT", count: 1 },
        ],
      );
      assert.equal(await dispatchOne(pool, transport), null);
    },
  );

  await t.test(
    "preexisting full email accounts retain identity for short-ID and email intake",
    async () => {
      const legacyId = randomUUID();
      await pool.query(
        "INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,'workflows','s298765009@seu.edu.sa','حساب اختبار قديم')",
        [legacyId],
      );
      const variant = await ingest(
        "اسم تجريبي قديم\nS298765009\nLegacyBundle3!",
      );
      const result = (
        await pool.query("SELECT account_id FROM assignments WHERE id=$1", [
          variant.assignmentId,
        ])
      ).rows[0];
      assert.equal(result.account_id, legacyId);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int count FROM accounts WHERE username_normalized LIKE 's298765009%'",
          )
        ).rows[0].count,
        1,
      );
    },
  );
  await t.test(
    "a live batch with valid quoted targets still requires the live sending policy",
    async () => {
      const target = await ingest(
        "اسم اختبار الإرسال\nS298765010\nLiveFixture39!",
        group.id,
        "50005@lid",
      );
      assert.equal(target.state, "PROCESSED");
      await pool.query(
        "UPDATE whatsapp_sessions SET provider='baileys' WHERE id=$1",
        [session.id],
      );
      try {
        const p = await ok("POST", "/v1/reply-batches/preview", {
          groupId: group.id,
          templateId: template.id,
        });
        assert.equal(p.targets.length, 1);
        assert.equal(p.targets[0].sourceId, target.id);
        const rejected = await request("POST", "/v1/reply-batches/approve", {
          approvalToken: p.approvalToken,
        });
        assert.equal(rejected.statusCode, 403);
        assert.equal(rejected.json().code, "LIVE_SENDING_NOT_AUTHORIZED");
        assert.equal(
          (
            await pool.query(
              "SELECT 1 FROM reply_jobs WHERE source_message_id=$1",
              [target.id],
            )
          ).rowCount,
          0,
        );
      } finally {
        await pool.query(
          "UPDATE whatsapp_sessions SET provider='mock' WHERE id=$1",
          [session.id],
        );
      }
    },
  );
});
