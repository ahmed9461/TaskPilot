import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  createHash,
  constants,
} from "node:crypto";
export const recipientId = (key) =>
  createHash("sha256")
    .update(createPublicKey(key).export({ type: "spki", format: "der" }))
    .digest("hex");
export function sealEnvelope(plain, publicKey, aad = "TaskPilot-recovery-v1") {
  const key = createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== "rsa" ||
    (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw Error("RECOVERY_KEY_INVALID");
  const dataKey = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const wrapped = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    dataKey,
  );
  dataKey.fill(0);
  return {
    version: 1,
    recipientKeyId: recipientId(publicKey),
    wrapped: wrapped.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function decryptGcm(key, iv, tag, data, aad) {
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}
export function openEnvelope(envelope, key, aad = "TaskPilot-recovery-v1") {
  if (
    envelope.version !== 1 ||
    (envelope.recipientKeyId && envelope.recipientKeyId !== recipientId(key))
  )
    throw Error("RECOVERY_RECIPIENT_MISMATCH");
  const dek = privateDecrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(envelope.wrapped, "base64"),
  );
  try {
    return decryptGcm(
      dek,
      Buffer.from(envelope.iv, "base64"),
      Buffer.from(envelope.tag, "base64"),
      Buffer.from(envelope.ciphertext, "base64"),
      aad,
    );
  } finally {
    dek.fill(0);
  }
}
export function openField(serializedKey, ciphertext, context) {
  const p = ciphertext.split("."),
    version = p.shift(),
    rawId = version === "2" ? p.shift() : "1",
    id = Number(rawId);
  if (
    !["1", "2"].includes(version) ||
    p.length !== 3 ||
    !Number.isSafeInteger(id) ||
    String(id) !== rawId ||
    id < 1
  )
    throw Error("INVALID_CIPHERTEXT");
  const cfg = serializedKey.trim().startsWith("{")
    ? JSON.parse(serializedKey)
    : { keys: { 1: serializedKey.trim() } };
  const key = Buffer.from(cfg.keys?.[id] ?? "", "base64");
  if (key.length !== 32) throw Error("RECOVERY_KEY_MISSING");
  try {
    return decryptGcm(
      key,
      Buffer.from(p[0], "base64"),
      Buffer.from(p[1], "base64"),
      Buffer.from(p[2], "base64"),
      version === "2" ? `TaskPilot:2:${id}:${context}` : context,
    );
  } finally {
    key.fill(0);
  }
}
