import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Vault } from "../src/security.js";
const a = randomBytes(32).toString("base64"),
  b = randomBytes(32).toString("base64");
const ring = (active: number, keys: Record<string, string>) =>
  JSON.stringify({ format: "taskpilot-keyring-v1", active, keys });
test("versioned keyring bridges legacy/current ciphertext then rejects retired keys", () => {
  const old = new Vault(a),
    transition = new Vault(ring(2, { "1": a, "2": b })),
    current = new Vault(ring(2, { "2": b }));
  const legacy = old.seal("synthetic value", "context");
  assert.equal(transition.open(legacy, "context"), "synthetic value");
  const next = transition.seal("synthetic value", "context");
  assert.ok(next.startsWith("2.2."));
  assert.equal(current.open(next, "context"), "synthetic value");
  assert.equal(current.keyVersion, 2);
  assert.throws(() => current.open(legacy, "context"));
  assert.throws(() => old.open(next, "context"));
});
test("cipher format/key identifier/context are authenticated and cannot be downgraded", () => {
  const v = new Vault(ring(2, { "1": a, "2": b })),
    sealed = v.seal("synthetic value", "account-one");
  assert.throws(() => v.open(sealed, "account-two"));
  assert.throws(() => v.open(sealed.replace("2.2.", "2.1."), "account-one"));
  assert.throws(() => v.open(sealed.replace("2.2.", "1."), "account-one"));
  assert.throws(() => v.open(sealed + ".extra", "account-one"));
  assert.throws(() => v.open(sealed.replace("2.2.", "2.02."), "account-one"));
});
test("invalid/missing/oversized keyrings and noncanonical key bytes fail closed", () => {
  for (const value of [
    ring(3, { "2": b }),
    ring(0, { "2": b }),
    ring(2, { "2": "invalid" }),
    JSON.stringify({ format: "other", active: 2, keys: { "2": b } }),
    JSON.stringify({
      format: "taskpilot-keyring-v1",
      active: 2,
      keys: { "2": b },
      unknown: true,
    }),
    "x".repeat(4097),
  ])
    assert.throws(() => new Vault(value));
});
