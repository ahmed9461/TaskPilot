import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMessage,
  hasAccountHint,
  messageSegments,
  selectedMessageFields,
} from "../src/parser.js";
import { routeTask } from "../src/rules.js";

const user = "S299999991";
const password = "Fixture9***!";
const name = "اسم تجريبي فقط";
test("unlabelled complete student credentials accept each order and common line endings", () => {
  for (const order of [
    [name, user, password],
    [name, password, user],
    [user, name, password],
    [user, password, name],
    [password, name, user],
    [password, user, name],
  ]) {
    for (const ending of ["\n", "\r", "\r\n"]) {
      assert.deepEqual(parseMessage(order.join(ending)), {
        username: user,
        displayName: name,
        password,
        needsReview: false,
      });
    }
  }
});
test("course lists are context, not credentials, and absent names use the identifier label", () => {
  const courses = [
    "Law121",
    "Law122",
    "Law123",
    "Islam101",
    "Comm003",
    "Math003",
  ];
  assert.deepEqual(
    parseMessage([name, ...courses, user, password].join("\n\n")),
    { username: user, displayName: name, password, needsReview: false },
  );
  assert.deepEqual(parseMessage(`${password}\n${user}`), {
    username: user,
    displayName: user,
    password,
    needsReview: false,
  });
  assert.equal(parseMessage(`${name}\n${user}\nLaw121`).needsReview, true);
});
test("inline separated fields, WhatsApp formatting and localized identifiers preserve secret bytes", () => {
  for (const body of [
    `${name} ${user} ${password}`,
    `${user} ${password} ${name}`,
    `${password} ${user} ${name}`,
    `**${user}**\n*${name}*\n${password}`,
    `Ｓ２９９９９９９９１\n${password}`,
    `S٢٩٩٩٩٩٩٩١\n${password}`,
  ]) {
    const parsed = parseMessage(body);
    assert.equal(parsed.username, user);
    assert.equal(parsed.password, password);
    assert.equal(parsed.needsReview, false);
  }
  assert.equal(
    parseMessage(`${name}\n${user}\n*Fixture9***!`).password,
    "*Fixture9***!",
  );
});
test("partial, conflicting and multiple candidates remain reviewable without inferred missing digits", () => {
  for (const body of [
    `${name}\nS26000...\n${password}`,
    `${user}\nS299999992\n${password}`,
    `${name}\n${user}\n${password}\nOther8!secret`,
    `${name}\n${user}\n${password}\nاسم تجريبي آخر`,
    `${user}\n${password}\nS26000...`,
  ]) {
    assert.equal(hasAccountHint(body), true);
    assert.equal(parseMessage(body).needsReview, true);
  }
  assert.equal(hasAccountHint("السلام عليكم"), false);
  assert.equal(hasAccountHint("S26000..."), true);
  assert.equal(hasAccountHint("اسم اختبار S26000..."), true);
});
test("student identity/password lines cannot choose a task even if they contain rule keywords", () => {
  const rules = [
    {
      task_type_id: "secret-task",
      keywords: ["Fixture9", "اسم تجريبي"],
      priority: 99,
      enabled: true,
    },
    {
      task_type_id: "math",
      keywords: ["Math003"],
      priority: 20,
      enabled: true,
    },
  ];
  assert.deepEqual(
    routeTask([name, user, password, "Math003"].join("\n"), rules, "default"),
    { taskTypeId: "math", priority: 20, ambiguous: false },
  );
  assert.equal(
    routeTask([name, user, password].join("\n"), rules, "default").taskTypeId,
    "default",
  );
});
test("AI field pointers map locally, reject wrong kinds and never fabricate credential values", () => {
  const body = [name, user, password, "Law121"].join("\n");
  assert.deepEqual(
    selectedMessageFields(body, { username: 1, displayName: 0, password: 2 }),
    { username: user, displayName: name, password },
  );
  assert.throws(() =>
    selectedMessageFields(body, { username: 1, displayName: 0, password: 3 }),
  );
  assert.throws(() =>
    selectedMessageFields(body, { username: 2, displayName: 0, password: 2 }),
  );
  assert.throws(() =>
    selectedMessageFields(body, { username: 1, displayName: 0, password: 99 }),
  );
  assert.equal(messageSegments(body).length, 4);
});
