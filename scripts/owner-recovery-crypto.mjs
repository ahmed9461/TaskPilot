import {
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scrypt,
} from "node:crypto";
import { promisify } from "node:util";
import {
  decryptGcm,
  recipientId,
  sealEnvelope,
  openEnvelope,
} from "./recovery-crypto.mjs";
const derive = promisify(scrypt);
const params = { N: 32768, r: 8, p: 1 };
function bytes(value, size, max = size) {
  if (
    typeof value !== "string" ||
    value.length > max * 2 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw Error("OWNER_RECOVERY_INVALID");
  const b = Buffer.from(value, "base64");
  if (b.length < size || b.length > max || b.toString("base64") !== value)
    throw Error("OWNER_RECOVERY_INVALID");
  return b;
}
export const newRecoveryCode = () => randomBytes(32).toString("base64url");
async function codeKey(code, salt) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code))
    throw Error("OWNER_RECOVERY_CODE_INVALID");
  const password = Buffer.from(code, "base64url");
  if (password.length !== 32 || password.toString("base64url") !== code)
    throw Error("OWNER_RECOVERY_CODE_INVALID");
  try {
    return await derive(password, salt, 32, {
      ...params,
      maxmem: 64 * 1024 * 1024,
    });
  } finally {
    password.fill(0);
  }
}
export function newOwnerPair() {
  return generateKeyPairSync("rsa", { modulusLength: 4096 });
}
export async function sealOwnerPrivate(privateKey, code) {
  const recipientKeyId = recipientId(privateKey),
    salt = randomBytes(16),
    iv = randomBytes(12),
    key = await codeKey(code, salt);
  const plain = privateKey.export({ type: "pkcs8", format: "der" });
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("TaskPilot-owner-key-v1:" + recipientKeyId));
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return {
      format: "taskpilot-owner-key-v1",
      recipientKeyId,
      kdf: { name: "scrypt", ...params },
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  } finally {
    plain.fill(0);
    key.fill(0);
  }
}
export async function openOwnerPrivate(packet, code) {
  if (
    packet?.format !== "taskpilot-owner-key-v1" ||
    !/^[a-f0-9]{64}$/.test(packet.recipientKeyId ?? "") ||
    packet.kdf?.name !== "scrypt" ||
    packet.kdf.N !== params.N ||
    packet.kdf.r !== params.r ||
    packet.kdf.p !== params.p
  )
    throw Error("OWNER_RECOVERY_INVALID");
  const salt = bytes(packet.salt, 16),
    iv = bytes(packet.iv, 12),
    tag = bytes(packet.tag, 16),
    cipher = bytes(packet.ciphertext, 1024, 8192),
    key = await codeKey(code, salt);
  let plain;
  try {
    plain = decryptGcm(
      key,
      iv,
      tag,
      cipher,
      "TaskPilot-owner-key-v1:" + packet.recipientKeyId,
    );
    const result = createPrivateKey({
      key: plain,
      type: "pkcs8",
      format: "der",
    });
    if (
      result.asymmetricKeyType !== "rsa" ||
      result.asymmetricKeyDetails.modulusLength !== 4096 ||
      recipientId(result) !== packet.recipientKeyId
    )
      throw Error("OWNER_RECOVERY_INVALID");
    return result;
  } finally {
    plain?.fill(0);
    key.fill(0);
  }
}
function snapshotHash(sha) {
  if (!/^[a-f0-9]{64}$/.test(sha ?? "")) throw Error("OWNER_SNAPSHOT_INVALID");
}
export function sealOwnerSnapshot(plain, publicKey, sha) {
  snapshotHash(sha);
  const key = createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== "rsa" ||
    key.asymmetricKeyDetails.modulusLength !== 4096
  )
    throw Error("OWNER_RECOVERY_INVALID");
  return {
    snapshotSha256: sha,
    ...sealEnvelope(plain, publicKey, "TaskPilot-owner-snapshot-v1:" + sha),
  };
}
export function openOwnerSnapshot(packet, privateKey, sha) {
  snapshotHash(sha);
  if (
    packet.snapshotSha256 !== sha ||
    packet.version !== 1 ||
    packet.recipientKeyId !== recipientId(privateKey)
  )
    throw Error("OWNER_SNAPSHOT_INVALID");
  bytes(packet.wrapped, 512);
  bytes(packet.iv, 12);
  bytes(packet.tag, 16);
  bytes(packet.ciphertext, 1, 65536);
  return openEnvelope(packet, privateKey, "TaskPilot-owner-snapshot-v1:" + sha);
}
