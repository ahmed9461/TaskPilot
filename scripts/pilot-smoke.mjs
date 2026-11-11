import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.TASKPILOT_SMOKE_BASE_URL ?? "http://127.0.0.1:8240";
const token =
  process.env.TASKPILOT_SMOKE_TOKEN ??
  (await readFile("/etc/taskpilot/api-token", "utf8")).trim();
async function api(method, path, body) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
}
assert.equal((await fetch(base + "/v1/accounts")).status, 401);
assert.equal((await api("GET", "/ready")).status, "ready");
assert.equal((await api("GET", "/v1/me")).liveSendingEnabled, false);
let sessions = await api("GET", "/v1/sessions");
let session = sessions.find((s) => s.label === "عرض تجريبي");
session ??= await api("POST", "/v1/sessions", { label: "عرض تجريبي" });
let tasks = await api("GET", "/v1/task-types");
let task = tasks.find((t) => t.code === "synthetic-self");
task ??= await api("POST", "/v1/task-types", {
  code: "synthetic-self",
  name: "مراجعة مهمة تجريبية",
});
let groups = await api("GET", "/v1/groups");
let group = groups.find((g) => g.external_group_id === "synthetic-demo");
group ??= await api("POST", "/v1/groups", {
  sessionId: session.id,
  externalGroupId: "synthetic-demo",
  title: "مجموعة العرض الوهمية",
  taskTypeId: task.id,
  namespace: "synthetic-demo",
  periodKey: "2026-T1",
});
let templates = await api("GET", "/v1/reply-templates");
if (!templates.some((t) => t.code === "synthetic-done"))
  await api("POST", "/v1/reply-templates", {
    code: "synthetic-done",
    body: "تمت {taskName} ✅",
  });
const message = {
  sessionId: session.id,
  groupId: group.id,
  externalMessageId: "synthetic-smoke-001",
  text: "الاسم: حساب تجريبي أول\nاليوزر: demo-001\nكلمة المرور: synthetic-fixture-only",
};
await api("POST", "/v1/mock/messages", message);
assert.equal((await api("POST", "/v1/mock/messages", message)).duplicate, true);
await api("POST", "/v1/mock/messages", {
  ...message,
  externalMessageId: "synthetic-review-001",
  text: "اليوزر: demo-review",
});
const assignments = await api("GET", "/v1/assignments");
assert.equal(
  assignments.filter((a) => a.username_normalized === "demo-001").length,
  1,
);
console.log(
  JSON.stringify({
    health: "PASS",
    auth: "PASS",
    ready: "PASS",
    liveSending: false,
    replay: "PASS",
    syntheticAssignments: 1,
    review: "SEEDED",
  }),
);
