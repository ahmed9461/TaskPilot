import test from "node:test";
import assert from "node:assert/strict";
import { routeTask } from "../src/rules.js";
import { exportCsv } from "../src/queries.js";
test("routing prioritizes explicit task context and ties require review", () => {
  const rules = [
    { task_type_id: "a", keywords: ["الذاتي"], priority: 20, enabled: true },
    { task_type_id: "b", keywords: ["الدوري"], priority: 30, enabled: true },
  ];
  assert.equal(
    routeTask("password: الدوري\nالذاتي", rules, "default").taskTypeId,
    "a",
  );
  assert.equal(routeTask("الذاتي والدوري", rules, "default").taskTypeId, "b");
  assert.equal(routeTask("hello", rules, "default").taskTypeId, "default");
  assert.equal(
    routeTask(
      "الذاتي والدوري",
      rules.map((r) => ({ ...r, priority: 20 })),
      "default",
    ).ambiguous,
    true,
  );
  assert.equal(
    routeTask(
      "الذاتي",
      rules.map((r) => ({ ...r, enabled: false })),
      "default",
    ).taskTypeId,
    "default",
  );
});
test("CSV uses explicit safe columns and neutralizes spreadsheet formulas", () => {
  const csv = exportCsv("accounts", [
    {
      id: "fixture",
      display_name: " =SUM(1,2)",
      username_normalized: "@cmd",
      ciphertext: "secret-canary",
      password: "secret-canary",
      encrypted_payload: "secret-canary",
    },
  ]);
  assert.equal(csv.includes("secret-canary"), false);
  assert.ok(csv.includes("' =SUM(1,2)"));
  assert.ok(csv.includes("'@cmd"));
  assert.equal(csv[0], "\uFEFF");
});

test("CR and mixed line endings keep credential values out of routing context", () => {
  const rules = [
    {
      task_type_id: "a",
      keywords: ["actual-task"],
      priority: 10,
      enabled: true,
    },
    {
      task_type_id: "b",
      keywords: ["credential-canary"],
      priority: 99,
      enabled: true,
    },
  ];
  for (const ending of ["\n", "\r\n", "\r"]) {
    const body = [
      "name: credential-canary",
      "user: credential-canary",
      "password: credential-canary",
      "actual-task",
    ].join(ending);
    assert.deepEqual(routeTask(body, rules, "fallback"), {
      taskTypeId: "a",
      priority: 10,
      ambiguous: false,
    });
  }
  assert.equal(
    routeTask(
      "name: credential-canary\r\nuser: test\ractual-task\n",
      rules,
      "fallback",
    ).taskTypeId,
    "a",
  );
});
