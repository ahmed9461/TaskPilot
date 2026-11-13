import { generateKeyPairSync } from "node:crypto";
import { readFile, writeFile, lstat } from "node:fs/promises";
import { recipientId } from "../scripts/recovery-crypto.mjs";
try {
  if (process.getuid?.() !== 0) throw Error();
  const path = "/etc/taskpilot/recovery-custodian.pem";
  let key;
  try {
    const s = await lstat(path);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== 0 ||
      (s.mode & 0o077) !== 0
    )
      throw Error();
    key = await readFile(path, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    key = generateKeyPairSync("rsa", { modulusLength: 4096 }).privateKey.export(
      { type: "pkcs8", format: "pem" },
    );
    await writeFile(path, key, { flag: "wx", mode: 0o600 });
  }
  console.log(
    JSON.stringify({
      custodian: "READY",
      privateKeyRootOnly: true,
      profileIndependent: true,
      recipientId: recipientId(key),
    }),
  );
} catch {
  console.error("RECOVERY_CUSTODIAN_INIT_FAILED");
  process.exitCode = 1;
}
