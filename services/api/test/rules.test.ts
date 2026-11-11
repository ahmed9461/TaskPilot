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
