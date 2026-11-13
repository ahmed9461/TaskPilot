import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { sealEnvelope, openEnvelope, openField } from "../recovery-crypto.mjs";
import { Vault } from "../../dist/services/api/src/security.js";
const a = generateKeyPairSync("rsa", { modulusLength: 3072 }),
  b = generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicPem = (k) => k.export({ type: "spki", format: "pem" });
test("two independent custodians recover same bytes without DPAPI or original master keys", () => {
  const secret = Buffer.from(JSON.stringify({ synthetic: "recovery-secret" }));
  const first = sealEnvelope(secret, publicPem(a.publicKey)),
    second = sealEnvelope(
      secret,
      publicPem(b.publicKey),
      "TaskPilot-custodian-v1",
    );
  assert.deepEqual(openEnvelope(first, a.privateKey), secret);
  assert.deepEqual(
    openEnvelope(second, b.privateKey, "TaskPilot-custodian-v1"),
    secret,
  );
  assert.throws(() =>
    openEnvelope(second, a.privateKey, "TaskPilot-custodian-v1"),
  );
  assert.throws(() => openEnvelope(second, b.privateKey));
  const changed = {
    ...second,
    ciphertext: Buffer.from("tampered").toString("base64"),
  };
  assert.throws(() =>
    openEnvelope(changed, b.privateKey, "TaskPilot-custodian-v1"),
  );
});
test("portable recovery opens both legacy and rotated runtime fields with AAD binding", () => {
  const old = randomBytes(32).toString("base64"),
    next = JSON.stringify({
      format: "taskpilot-keyring-v1",
      active: 2,
      keys: { 2: randomBytes(32).toString("base64") },
    });
  for (const key of [old, next]) {
    const value = new Vault(key).seal("synthetic-plaintext", "context");
    assert.equal(
      openField(key, value, "context").toString(),
      "synthetic-plaintext",
    );
    assert.throws(() => openField(key, value, "wrong-context"));
  }
});
