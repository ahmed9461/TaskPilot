import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import {
  newRecoveryCode,
  newOwnerPair,
  sealOwnerPrivate,
  openOwnerPrivate,
  sealOwnerSnapshot,
  openOwnerSnapshot,
} from "../owner-recovery-crypto.mjs";
import { recipientId } from "../recovery-crypto.mjs";
const pair = newOwnerPair(),
  code = newRecoveryCode(),
  sha = createHash("sha256").update("synthetic encrypted backup").digest("hex");
test("owner key survives independent code recovery with no DPAPI/SSH and randomized ciphertext", async () => {
  const a = await sealOwnerPrivate(pair.privateKey, code),
    b = await sealOwnerPrivate(pair.privateKey, code);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.notEqual(a.salt, b.salt);
  const key = await openOwnerPrivate(a, code);
  assert.equal(recipientId(key), recipientId(pair.privateKey));
  assert.ok(!JSON.stringify(a).includes(code));
});
test("wrong code, key metadata, AEAD tamper and unbounded KDF parameters fail closed", async () => {
  const p = await sealOwnerPrivate(pair.privateKey, code);
  await assert.rejects(openOwnerPrivate(p, newRecoveryCode()));
  for (const field of ["salt", "iv", "tag", "ciphertext"]) {
    const b = Buffer.from(p[field], "base64");
    b[0] ^= 1;
    await assert.rejects(
      openOwnerPrivate({ ...p, [field]: b.toString("base64") }, code),
    );
  }
  await assert.rejects(
    openOwnerPrivate({ ...p, recipientKeyId: "0".repeat(64) }, code),
  );
  await assert.rejects(
    openOwnerPrivate({ ...p, kdf: { ...p.kdf, N: 2 ** 30 } }, code),
  );
  await assert.rejects(openOwnerPrivate({ ...p, iv: p.iv + "\n" }, code));
  await assert.rejects(openOwnerPrivate(p, "short"));
});
test("snapshot packets authenticate backup identity and reject ciphertext/recipient substitution", async () => {
  const privateKey = await openOwnerPrivate(
    await sealOwnerPrivate(pair.privateKey, code),
    code,
  );
  const publicKey = createPublicKey(privateKey).export({
      type: "spki",
      format: "pem",
    }),
    plain = Buffer.from('{"synthetic-captured-key":"test-only"}');
  const envelope = sealOwnerSnapshot(plain, publicKey, sha);
  assert.deepEqual(openOwnerSnapshot(envelope, privateKey, sha), plain);
  assert.throws(() => openOwnerSnapshot(envelope, privateKey, "f".repeat(64)));
  assert.throws(() =>
    openOwnerSnapshot(
      { ...envelope, recipientKeyId: "0".repeat(64) },
      privateKey,
      sha,
    ),
  );
  const data = Buffer.from(envelope.ciphertext, "base64");
  data[0] ^= 1;
  assert.throws(() =>
    openOwnerSnapshot(
      { ...envelope, ciphertext: data.toString("base64") },
      privateKey,
      sha,
    ),
  );
});
