import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";

const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");

test("atomic group rule editor preserves all-or-nothing configuration", async (t) => {
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
  async function request(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
    auth = true,
  ) {
    return app.inject({
      method,
      url: path,
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${config.apiToken}` } : {}),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    });
  }
  async function api(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ) {
    const r = await request(method, path, body);
    assert.equal(
      r.statusCode,
      200,
      `SYNTHETIC_CONFIG_API_STATUS_${r.statusCode}`,
    );
    return r.json();
  }
  const a = await api("POST", "/v1/task-types", {
    code: "synthetic-rule-a",
    name: "Synthetic A",
  });
  const b = await api("POST", "/v1/task-types", {
    code: "synthetic-rule-b",
    name: "Synthetic B",
  });
  async function seed() {
    const s = await api("POST", "/v1/sessions", {
      label: "Synthetic rule editor",
    });
    const g = await api("POST", "/v1/groups", {
      sessionId: s.id,
      externalGroupId: randomUUID(),
      title: "Synthetic rules",
      taskTypeId: a.id,
      namespace: "synthetic-rule-editor",
      periodKey: "082",
    });
    const first = await api("POST", "/v1/group-rules", {
      groupId: g.id,
      taskTypeId: a.id,
      keywords: ["alpha"],
      priority: 10,
    });
    const second = await api("POST", "/v1/group-rules", {
      groupId: g.id,
      taskTypeId: b.id,
      keywords: ["beta"],
      priority: 20,
    });
    return { s, g, first, second };
  }
  async function editor(g: string) {
    return api("GET", `/v1/groups/${g}/rule-editor`);
  }
  async function snapshot(g: string) {
    return {
      editor: await editor(g),
      activity: (
        await pool.query(
          "SELECT (SELECT count(*)::int FROM audit_events) audit,(SELECT count(*)::int FROM notifications) notifications",
        )
      ).rows[0],
    };
  }
  function toggle(row: any, enabled: boolean) {
    return { id: row.id, version: row.version, enabled };
  }
  const create = { taskTypeId: a.id, keywords: ["new-rule"], priority: 30 };

  await t.test(
    "authentication and invalid new-rule inputs cannot partially apply toggles",
    async () => {
      const { g, first } = await seed(),
        before = await snapshot(g.id),
        path = `/v1/groups/${g.id}/rules`;
      assert.equal(
        (
          await request(
            "GET",
            `/v1/groups/${g.id}/rule-editor`,
            undefined,
            false,
          )
        ).statusCode,
        401,
      );
      assert.equal(
        (
          await request(
            "POST",
            path,
            { groupVersion: before.editor.group.version, updates: [] },
            false,
          )
        ).statusCode,
        401,
      );
      for (const bad of [
        { ...create, taskTypeId: "" },
        { ...create, keywords: [] },
        { ...create, keywords: Array(21).fill("too-many") },
        { ...create, keywords: ["x".repeat(101)] },
        { ...create, priority: 1.5 },
        { ...create, unexpected: "synthetic" },
      ]) {
        const r = await request("POST", path, {
          groupVersion: before.editor.group.version,
          updates: [toggle(first, false)],
          create: bad,
        });
        assert.equal(r.statusCode, 400);
        assert.deepEqual(await snapshot(g.id), before);
      }
      const missingTask = await request("POST", path, {
        groupVersion: before.editor.group.version,
        updates: [toggle(first, false)],
        create: { ...create, taskTypeId: randomUUID() },
      });
      assert.equal(missingTask.statusCode, 409);
      assert.deepEqual(await snapshot(g.id), before);
      assert.equal(
        (await request("GET", `/v1/groups/${randomUUID()}/rule-editor`))
          .statusCode,
        404,
      );
    },
  );

  await t.test(
    "one batch saves toggles and creation together with one group-version advance",
    async () => {
      const { g, first, second } = await seed(),
        before = await snapshot(g.id);
      const saved = await api("POST", `/v1/groups/${g.id}/rules`, {
        groupVersion: before.editor.group.version,
        updates: [toggle(first, false), toggle(second, false)],
        create,
      });
      assert.equal(saved.changed, 3);
      assert.equal(saved.group.version, before.editor.group.version + 1);
      assert.equal(saved.rules.length, 3);
      assert.ok(
        saved.rules
          .filter((r: any) => [first.id, second.id].includes(r.id))
          .every((r: any) => !r.enabled && r.version === 2),
      );
      const after = await snapshot(g.id);
      assert.equal(after.activity.audit, before.activity.audit + 3);
      assert.equal(
        after.activity.notifications,
        before.activity.notifications + 3,
      );
      const unchanged = await api("POST", `/v1/groups/${g.id}/rules`, {
        groupVersion: saved.group.version,
        updates: [
          toggle(
            saved.rules.find((r: any) => r.id === first.id),
            false,
          ),
        ],
      });
      assert.equal(unchanged.changed, 0);
      assert.deepEqual(await snapshot(g.id), after);
    },
  );

  await t.test(
    "stale group/rule versions, duplicate IDs and another group's rule leave all rows unchanged",
    async () => {
      const { g, first, second } = await seed(),
        other = await seed(),
        before = await snapshot(g.id),
        otherBefore = await editor(other.g.id),
        version = before.editor.group.version;
      for (const payload of [
        { groupVersion: version - 1, updates: [toggle(first, false)] },
        {
          groupVersion: version,
          updates: [
            toggle(first, false),
            { ...toggle(second, false), version: second.version + 1 },
          ],
        },
        {
          groupVersion: version,
          updates: [toggle(first, false), toggle(other.first, false)],
        },
      ]) {
        assert.equal(
          (await request("POST", `/v1/groups/${g.id}/rules`, payload))
            .statusCode,
          409,
        );
        assert.deepEqual(await snapshot(g.id), before);
        assert.deepEqual(await editor(other.g.id), otherBefore);
      }
      assert.equal(
        (
          await request("POST", `/v1/groups/${g.id}/rules`, {
            groupVersion: version,
            updates: [toggle(first, false), toggle(first, true)],
          })
        ).statusCode,
        400,
      );
      assert.deepEqual(await snapshot(g.id), before);
    },
  );

  await t.test(
    "database failure after toggles rolls back rule versions, group and activity",
    async () => {
      const { g, first, second } = await seed(),
        before = await snapshot(g.id);
      await pool.query(
        "CREATE FUNCTION synthetic_rule_save_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic batch insertion failure' USING ERRCODE='40001'; END $$",
      );
      await pool.query(
        `CREATE TRIGGER synthetic_rule_save_failure BEFORE INSERT ON group_rules FOR EACH ROW WHEN (NEW.group_id='${g.id}'::uuid) EXECUTE FUNCTION synthetic_rule_save_failure()`,
      );
      try {
        assert.equal(
          (
            await request("POST", `/v1/groups/${g.id}/rules`, {
              groupVersion: before.editor.group.version,
              updates: [toggle(first, false), toggle(second, false)],
              create,
            })
          ).statusCode,
          503,
        );
        assert.deepEqual(await snapshot(g.id), before);
      } finally {
        await pool.query(
          "DROP TRIGGER synthetic_rule_save_failure ON group_rules",
        );
        await pool.query("DROP FUNCTION synthetic_rule_save_failure()");
      }
    },
  );

  await t.test(
    "parallel same-snapshot saves accept one writer and reject stale replay",
    async () => {
      const { g, first, second } = await seed(),
        before = await snapshot(g.id);
      const responses = await Promise.all([
        request("POST", `/v1/groups/${g.id}/rules`, {
          groupVersion: before.editor.group.version,
          updates: [toggle(first, false)],
        }),
        request("POST", `/v1/groups/${g.id}/rules`, {
          groupVersion: before.editor.group.version,
          updates: [toggle(second, false)],
        }),
      ]);
      assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
      const after = await snapshot(g.id);
      assert.equal(after.editor.group.version, before.editor.group.version + 1);
      assert.equal(after.editor.rules.filter((r: any) => !r.enabled).length, 1);
      assert.equal(after.activity.audit, before.activity.audit + 1);
    },
  );

  await t.test(
    "legacy single-rule and atomic saves share lock order without partial updates",
    async () => {
      const { g, first, second } = await seed(),
        before = await editor(g.id);
      const responses = await Promise.all([
        request("PATCH", `/v1/group-rules/${first.id}`, {
          version: first.version,
          enabled: false,
        }),
        request("POST", `/v1/groups/${g.id}/rules`, {
          groupVersion: before.group.version,
          updates: [toggle(second, false)],
        }),
      ]);
      assert.equal(responses[0]!.statusCode, 200);
      assert.ok([200, 409].includes(responses[1]!.statusCode));
      const after = await editor(g.id);
      assert.equal(
        after.rules.find((r: any) => r.id === first.id).enabled,
        false,
      );
      assert.equal(
        after.rules.find((r: any) => r.id === second.id).enabled,
        responses[1]!.statusCode !== 200,
      );
    },
  );

  await t.test(
    "forgotten session rules are readable but every write route refuses mutation",
    async () => {
      const { s, g, first } = await seed();
      await pool.query(
        "UPDATE whatsapp_sessions SET provider='baileys',connect_requested=false,forgotten_at=now(),status='FORGOTTEN' WHERE id=$1",
        [s.id],
      );
      const before = await snapshot(g.id);
      assert.equal(before.editor.group.readOnly, true);
      for (const [path, payload, method] of [
        [
          `/v1/groups/${g.id}/rules`,
          {
            groupVersion: before.editor.group.version,
            updates: [toggle(first, false)],
          },
          "POST",
        ],
        ["/v1/group-rules", { groupId: g.id, ...create }, "POST"],
        [
          `/v1/group-rules/${first.id}`,
          { version: first.version, enabled: false },
          "PATCH",
        ],
      ] as const) {
        const r = await request(method, path, payload);
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().code, "SESSION_FORGOTTEN");
        assert.deepEqual(await snapshot(g.id), before);
      }
    },
  );
});
