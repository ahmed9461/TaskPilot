import {
  readFile,
  writeFile,
  rename,
  open,
  lstat,
  readdir,
} from "node:fs/promises";
import { join, dirname } from "node:path";
import { createPublicKey } from "node:crypto";
import {
  newOwnerPair,
  newRecoveryCode,
  sealOwnerPrivate,
  openOwnerPrivate,
} from "./owner-recovery-crypto.mjs";
import { recipientId } from "./recovery-crypto.mjs";
export const defaultCodeFile = "D:\\TaskPilot-Recovery-Key\\recovery-code.txt";
export async function readBounded(path, limit) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit)
    throw Error("PRIVATE_RECOVERY_FILE_REQUIRED");
  const b = await readFile(path);
  if (b.length > limit) throw Error("PRIVATE_RECOVERY_FILE_REQUIRED");
  return b;
}
export async function ownerPublic(root) {
  let packet;
  try {
    packet = JSON.parse(
      (
        await readBounded(join(root, "owner-recovery-key.json"), 32768)
      ).toString(),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    try {
      await lstat(join(root, "owner-recovery-public.pem"));
      throw Error("OWNER_RECOVERY_KEY_MISSING");
    } catch (x) {
      if (x.code !== "ENOENT") throw x;
      return null;
    }
  }
  const publicKey = (
    await readBounded(join(root, "owner-recovery-public.pem"), 4096)
  ).toString();
  if (
    packet.format !== "taskpilot-owner-key-v1" ||
    recipientId(publicKey) !== packet.recipientKeyId
  )
    throw Error("OWNER_RECOVERY_RECIPIENT_MISMATCH");
  return publicKey;
}
export async function initOwner(root, protectFolder) {
  await protectFolder(dirname(defaultCodeFile));
  let code;
  try {
    code = (await readBounded(defaultCodeFile, 128)).toString().trim();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    code = newRecoveryCode();
    const f = await open(defaultCodeFile, "wx");
    try {
      await f.writeFile(code + "\n");
      await f.sync();
    } finally {
      await f.close();
    }
  }
  const keyPath = join(root, "owner-recovery-key.json");
  let key;
  try {
    key = await openOwnerPrivate(
      JSON.parse((await readBounded(keyPath, 32768)).toString()),
      code,
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    if (
      (await readdir(root)).some(
        (f) => f.endsWith(".owner.json") || f === "owner-recovery-public.pem",
      )
    )
      throw Error("OWNER_RECOVERY_KEY_MISSING");
    key = newOwnerPair().privateKey;
    const packet = await sealOwnerPrivate(key, code),
      temp = keyPath + ".prepare";
    await writeFile(temp, JSON.stringify(packet), { mode: 0o600 });
    const f = await open(temp, "r+");
    try {
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(temp, keyPath);
  }
  const pub = createPublicKey(key).export({ type: "spki", format: "pem" }),
    path = join(root, "owner-recovery-public.pem");
  try {
    if (
      recipientId((await readBounded(path, 4096)).toString()) !==
      recipientId(key)
    )
      throw Error("OWNER_RECOVERY_RECIPIENT_MISMATCH");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    await writeFile(path, pub, { flag: "wx", mode: 0o600 });
  }
  code = null;
  return {
    ownerRecovery: "INITIALIZED",
    recipientKeyId: recipientId(key),
    codeSavedSeparately: true,
    codeFile: defaultCodeFile,
    codeUploaded: false,
  };
}
export async function ownerPrivate(root, codeFile) {
  const packet = JSON.parse(
    (
      await readBounded(join(root, "owner-recovery-key.json"), 32768)
    ).toString(),
  );
  const code = await readBounded(codeFile, 128);
  try {
    return await openOwnerPrivate(packet, code.toString().trim());
  } finally {
    code.fill(0);
  }
}
