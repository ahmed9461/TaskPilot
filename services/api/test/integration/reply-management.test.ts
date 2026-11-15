import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import { dispatchOne } from "../../src/outbox.js";
import { MockTransport } from "../../src/transport.js";
import { hash } from "../../src/security.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("daily reply management keeps preview, cancellation and delivery separate", async (t) => {
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
  async function request(
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
    reauth = true,
  ) {
    return app.inject({
      method,
      url: path,
      headers: {
        ...headers,
        "content-type": "application/json",
        ...(reauth ? { "x-reauth-secret": config.reauthSecret } : {}),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  }
  async function api(path: string, payload?: unknown) {
    const r = await request(
      payload === undefined ? "GET" : "POST",
      path,
      payload,
    );
    assert.equal(r.statusCode, 200, `SYNTHETIC_REPLY_STATUS_${r.statusCode}`);
    return r.json();
  }
  const session = await api("/v1/sessions", {
    label: "Synthetic daily session",
  });
  const task = await api("/v1/task-types", {
    code: "synthetic-daily-replies",
    name: "Synthetic daily task",
  });
  const group = await api("/v1/groups", {
    sessionId: session.id,
    externalGroupId: "synthetic-daily-group",
    title: "Synthetic daily group",
    taskTypeId: task.id,
    namespace: "synthetic-daily-replies",
    periodKey: "085",
  });
  const source = await api("/v1/mock/messages", {
    sessionId: session.id,
    groupId: group.id,
    externalMessageId: "synthetic-daily-source",
    text: "name: Synthetic daily account\nuser: synthetic-daily-085",
  });
  const template = await api("/v1/reply-templates", {
    code: "synthetic-daily-reply",
    body: "Done {displayName}: {taskName}",
  });
  async function preview() {
    return api("/v1/reply-jobs/preview", {
      assignmentId: source.assignmentId,
      sourceMessageId: source.id,
      templateId: template.id,
    });
  }
  async function seed() {
    return api("/v1/reply-jobs/approve", {
      approvalToken: (await preview()).approvalToken,
      idempotencyKey: randomUUID(),
    });
  }
  async function state(id: string) {
    return (
      await pool.query(
        "SELECT status,provider_message_id FROM reply_jobs WHERE id=$1",
        [id],
      )
    ).rows[0];
  }
  async function cancellationEvents(id: string) {
    return (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM audit_events WHERE target_id=$1 AND action='REPLY_CANCELED') audit,(SELECT count(*)::int FROM notifications WHERE subject_id=$1 AND type='REPLY_CANCELED') notifications",
        [id],
      )
    ).rows[0];
  }

  await t.test(
    "disabled real transport still offers readable preview without creating a job",
    async () => {
      await pool.query(
        "UPDATE whatsapp_sessions SET provider='baileys' WHERE id=$1",
        [session.id],
      );
      const p = await preview();
      assert.equal(p.provider, "baileys");
      assert.equal(p.groupTitle, group.title);
      assert.equal(p.sessionLabel, session.label);
      assert.ok(p.receivedAt);
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
      assert.equal(
        (
          await request("POST", "/v1/reply-jobs/approve", {
            approvalToken: p.approvalToken,
            idempotencyKey: randomUUID(),
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (await pool.query("SELECT count(*)::int n FROM reply_jobs")).rows[0].n,
        0,
      );
      await pool.query(
        "UPDATE whatsapp_sessions SET provider='mock' WHERE id=$1",
        [session.id],
      );
    },
  );
  await t.test(
    "cancel requires auth/reauth; repeat is idempotent and never calls transport",
    async () => {
      const job = await seed();
      const path = `/v1/reply-jobs/${job.id}/cancel`;
      assert.equal(
        (await app.inject({ method: "POST", url: path, payload: {} }))
          .statusCode,
        401,
      );
      assert.equal((await request("POST", path, {}, false)).statusCode, 403);
      assert.equal(
        (await request("POST", path, { unexpected: true })).statusCode,
        400,
      );
      assert.equal((await state(job.id)).status, "APPROVED");
      const assignment = (
        await pool.query("SELECT status,version FROM assignments WHERE id=$1", [
          source.assignmentId,
        ])
      ).rows[0];
      assert.equal((await api(path, {})).status, "CANCELED");
      assert.equal((await api(path, {})).status, "CANCELED");
      assert.deepEqual(await cancellationEvents(job.id), {
        audit: 1,
        notifications: 1,
      });
      assert.deepEqual(
        (
          await pool.query(
            "SELECT status,version FROM assignments WHERE id=$1",
            [source.assignmentId],
          )
        ).rows[0],
        assignment,
      );
      const transport = new MockTransport();
      let calls = 0;
      transport.replyToMessage = async () => {
        calls++;
        return { providerMessageId: "synthetic-receipt" };
      };
      await dispatchOne(pool, transport);
      assert.equal(calls, 0);
      const listed = (await api("/v1/reply-jobs")).find(
        (j: any) => j.id === job.id,
      );
      assert.equal(listed.display_name, "Synthetic daily account");
      assert.equal(listed.task_name, task.name);
      assert.equal(listed.group_title, group.title);
      const assignmentList = await api("/v1/assignments");
      assert.equal(assignmentList[0].sources[0].groupTitle, group.title);
    },
  );
  await t.test(
    "SENDING and settled/uncertain outcomes cannot be relabeled as canceled",
    async () => {
      for (const status of ["SENDING", "SENT", "FAILED", "UNKNOWN_DELIVERY"]) {
        const job = await seed();
        await pool.query("UPDATE reply_jobs SET status=$2 WHERE id=$1", [
          job.id,
          status,
        ]);
        const before = await state(job.id);
        const r = await request("POST", `/v1/reply-jobs/${job.id}/cancel`, {});
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().code, "REPLY_NOT_PENDING");
        assert.deepEqual(await state(job.id), before);
        assert.deepEqual(await cancellationEvents(job.id), {
          audit: 0,
          notifications: 0,
        });
      }
    },
  );
  await t.test(
    "worker that claims before cancellation preserves the single real outcome",
    async () => {
      const job = await seed();
      const transport = new MockTransport();
      let entered!: () => void, finish!: () => void;
      const started = new Promise<void>((r) => {
        entered = r;
      });
      const gate = new Promise<void>((r) => {
        finish = r;
      });
      let calls = 0;
      transport.replyToMessage = async () => {
        calls++;
        entered();
        await gate;
        return { providerMessageId: "synthetic-race-receipt" };
      };
      const dispatch = dispatchOne(pool, transport);
      try {
        await started;
        assert.equal(
          (await request("POST", `/v1/reply-jobs/${job.id}/cancel`, {}))
            .statusCode,
          409,
        );
      } finally {
        finish();
        await dispatch;
      }
      assert.equal(calls, 1);
      assert.deepEqual(await state(job.id), {
        status: "SENT",
        provider_message_id: "synthetic-race-receipt",
      });
    },
  );
  await t.test(
    "temporary client cancellation consumes only its own single-use grant",
    async () => {
      const job = await seed(),
        client = randomBytes(32).toString("hex"),
        grant = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO client_sessions(id,token_hash,expires_at,reauth_hash,reauth_expires_at) VALUES($1,$2,now()+interval '1 minute',$3,now()+interval '60 seconds')",
        [randomUUID(), hash(client), hash(grant)],
      );
      const req = {
        method: "POST" as const,
        url: `/v1/reply-jobs/${job.id}/cancel`,
        payload: {},
        headers: {
          authorization: `Bearer ${client}`,
          "x-reauth-secret": grant,
        },
      };
      assert.equal((await app.inject(req)).statusCode, 200);
      assert.equal((await app.inject(req)).statusCode, 403);
    },
  );
});
