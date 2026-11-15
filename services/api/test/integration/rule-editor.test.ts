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
  let fixtureClient = 1;
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
      remoteAddress: `127.0.0.${fixtureClient}`,
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
    fixtureClient++;
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
    "existing rule task, keywords and priority update atomically and route future messages only",
    async () => {
      const { s, g, first, second } = await seed();
      const message = {
        sessionId: s.id,
        groupId: g.id,
        externalMessageId: randomUUID(),
        text: "name: Synthetic rule edit\nuser: synthetic-edit-085\nalpha",
      };
      const old = await api("POST", "/v1/mock/messages", message);
      const before = await snapshot(g.id);
      const update = {
        id: first.id,
        version: first.version,
        enabled: true,
        taskTypeId: b.id,
        keywords: ["  changed  "],
        priority: 90,
      };
      for (const bad of [
        { ...update, keywords: [" "] },
        { ...update, taskTypeId: randomUUID() },
        { ...update, priority: 101 },
        { id: first.id, version: first.version },
      ]) {
        const result = await request("POST", `/v1/groups/${g.id}/rules`, {
          groupVersion: before.editor.group.version,
          updates: [toggle(second, false), bad],
        });
        assert.ok([400, 409].includes(result.statusCode));
        assert.deepEqual(await snapshot(g.id), before);
      }
      const saved = await api("POST", `/v1/groups/${g.id}/rules`, {
        groupVersion: before.editor.group.version,
        updates: [update, toggle(second, false)],
      });
      assert.equal(saved.changed, 2);
      assert.equal(saved.group.version, before.editor.group.version + 1);
      const row = saved.rules.find((r: any) => r.id === first.id);
      assert.equal(row.task_type_id, b.id);
      assert.equal(row.priority, 90);
      assert.deepEqual(row.keywords, ["changed"]);
      const stable = await snapshot(g.id);
      const same = await api("POST", `/v1/groups/${g.id}/rules`, {
        groupVersion: saved.group.version,
        updates: [{ ...update, version: row.version }],
      });
      assert.equal(same.changed, 0);
      assert.deepEqual(await snapshot(g.id), stable);
      const next = await api("POST", "/v1/mock/messages", {
        ...message,
        externalMessageId: randomUUID(),
        text: message.text.replace("alpha", "changed"),
      });
      assert.notEqual(next.assignmentId, old.assignmentId);
      const assignments = (
        await pool.query(
          "SELECT id,task_type_id,priority FROM assignments WHERE id=ANY($1::uuid[])",
          [[old.assignmentId, next.assignmentId]],
        )
      ).rows;
      assert.equal(
        assignments.find((r) => r.id === old.assignmentId).task_type_id,
        a.id,
      );
      assert.equal(
        assignments.find((r) => r.id === next.assignmentId).task_type_id,
        b.id,
      );
      assert.equal(
        assignments.find((r) => r.id === next.assignmentId).priority,
        90,
      );
      assert.equal(
        (
          await api("PATCH", `/v1/group-rules/${first.id}`, {
            version: row.version,
            keywords: ["legacy-edit"],
            priority: 75,
          })
        ).priority,
        75,
      );
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
    "changing the default task affects new sources only and invalidates stale configuration",
    async () => {
      const { s, g, first } = await seed();
      const before = await editor(g.id);
      const message = {
        sessionId: s.id,
        groupId: g.id,
        externalMessageId: randomUUID(),
        text: "name: Synthetic default task\ruser: synthetic-default-084",
      };
      const old = await api("POST", "/v1/mock/messages", message);
      assert.equal(
        (
          await pool.query("SELECT task_type_id FROM assignments WHERE id=$1", [
            old.assignmentId,
          ])
        ).rows[0].task_type_id,
        a.id,
      );
      const saved = await api("PATCH", `/v1/groups/${g.id}`, {
        version: before.group.version,
        taskTypeId: b.id,
      });
      assert.equal(saved.enabled, before.group.enabled ?? true);
      assert.equal(saved.task_type_id, b.id);
      assert.equal(
        (
          await request("PATCH", `/v1/groups/${g.id}`, {
            version: before.group.version,
            taskTypeId: a.id,
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await request("PATCH", `/v1/groups/${g.id}`, {
            version: saved.version,
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (
          await request("PATCH", `/v1/groups/${g.id}`, {
            version: saved.version,
            taskTypeId: randomUUID(),
          })
        ).statusCode,
        409,
      );
      assert.equal(
        (
          await request("POST", `/v1/groups/${g.id}/rules`, {
            groupVersion: before.group.version,
            updates: [{ id: first.id, version: first.version, enabled: false }],
          })
        ).statusCode,
        409,
      );
      const next = await api("POST", "/v1/mock/messages", {
        ...message,
        externalMessageId: randomUUID(),
      });
      assert.notEqual(next.assignmentId, old.assignmentId);
      assert.equal(
        (
          await pool.query("SELECT task_type_id FROM assignments WHERE id=$1", [
            next.assignmentId,
          ])
        ).rows[0].task_type_id,
        b.id,
      );
      assert.equal(
        (
          await pool.query("SELECT task_type_id FROM assignments WHERE id=$1", [
            old.assignmentId,
          ])
        ).rows[0].task_type_id,
        a.id,
      );
      assert.equal(
        (await api("GET", `/v1/groups/${g.id}/rule-editor`)).group.version,
        saved.version,
      );
    },
  );

  await t.test(
    "WinUI CR input materializes once and credentials cannot choose the task",
    async () => {
      const { s, g } = await seed();
      const password = "private-credential-beta-canary-083";
      const message = {
        sessionId: s.id,
        groupId: g.id,
        externalMessageId: "synthetic-cr-" + randomUUID(),
        text: [
          "name: Synthetic CR fixture",
          "user: synthetic-cr-native-083",
          `password: ${password}`,
          "alpha",
        ].join("\r"),
      };
      const received = await api("POST", "/v1/mock/messages", message);
      assert.equal(received.state, "PROCESSED");
      const assignment = (
        await pool.query(
          "SELECT task_type_id,priority FROM assignments WHERE id=$1",
          [received.assignmentId],
        )
      ).rows[0];
      assert.equal(assignment.task_type_id, a.id);
      assert.equal(assignment.priority, 10);
      assert.equal(
        (await api("POST", "/v1/mock/messages", message)).duplicate,
        true,
      );
      const counts = (
        await pool.query(
          "SELECT (SELECT count(*)::int FROM accounts WHERE namespace='synthetic-rule-editor' AND username_normalized='synthetic-cr-native-083') accounts,(SELECT count(*)::int FROM source_messages WHERE group_id=$1) sources,(SELECT count(*)::int FROM assignment_sources WHERE source_message_id=$2) links",
          [g.id, received.id],
        )
      ).rows[0];
      assert.deepEqual(counts, { accounts: 1, sources: 1, links: 1 });
      assert.equal(
        JSON.stringify(
          await api("GET", "/v1/accounts?search=synthetic-cr-native-083"),
        ).includes(password),
        false,
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
