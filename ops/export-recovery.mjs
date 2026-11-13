// Root-only export: encrypted dump plus hybrid-encrypted key escrow to an owner public key.
import { readFile } from "node:fs/promises";
import {
  createCipheriv,
  createPublicKey,
  publicEncrypt,
  randomBytes,
  createHash,
  constants,
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
try {
  if (process.getuid?.() !== 0) throw Error();
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 10000) throw Error();
  }
  const key = createPublicKey(JSON.parse(input).publicKey);
  if (
    key.asymmetricKeyType !== "rsa" ||
    (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
  )
    throw Error();
  const names = [
    "backup-key",
    "encryption-key",
    "api-token",
    "reauth-secret",
    "deepseek-key",
  ];
  const recovery = {};
  for (const name of names)
    recovery[name] = (await readFile(`/etc/taskpilot/${name}`, "utf8")).trim();
  const name = `offhost-${new Date().toISOString().replace(/[^0-9]/g, "")}.tpg`,
    path = `/var/lib/taskpilot/backups/${name}`;
  await exec(process.execPath, ["ops/backup.mjs", "backup", path]);
  for (const n of names)
    if ((await readFile(`/etc/taskpilot/${n}`, "utf8")).trim() !== recovery[n])
      throw Error();
  const dump = await readFile(path);
  const dataKey = randomBytes(32),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  cipher.setAAD(Buffer.from("TaskPilot-recovery-v1"));
  const plain = Buffer.from(JSON.stringify(recovery));
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  plain.fill(0);
  const wrapped = publicEncrypt(
    { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    dataKey,
  );
  dataKey.fill(0);
  process.stdout.write(
    JSON.stringify({
      name,
      sha256: createHash("sha256").update(dump).digest("hex"),
      backup: dump.toString("base64"),
      escrow: {
        version: 1,
        wrapped: wrapped.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      },
    }),
  );
} catch {
  console.error("PRIVATE_RECOVERY_EXPORT_FAILED");
  process.exitCode = 1;
}
