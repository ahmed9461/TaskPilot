// Root-only export: encrypted dump plus hybrid-encrypted key escrow to an owner public key.
import { readFile } from "node:fs/promises";
import { createPublicKey, createHash } from "node:crypto";
import { sealEnvelope, decryptGcm } from "../scripts/recovery-crypto.mjs";
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
  // Validate the exact snapshot against the captured backup key before exporting it.
  decryptGcm(
    Buffer.from(recovery["backup-key"], "base64"),
    dump.subarray(4, 16),
    dump.subarray(16, 32),
    dump.subarray(32),
    "TPG1",
  ).fill(0);
  const plain = Buffer.from(JSON.stringify(recovery));
  const custodian = await readFile(
    "/etc/taskpilot/recovery-custodian.pem",
    "utf8",
  );
  const escrow = sealEnvelope(
    plain,
    key.export({ type: "spki", format: "pem" }),
  );
  const custodianEscrow = sealEnvelope(
    plain,
    createPublicKey(custodian).export({ type: "spki", format: "pem" }),
    "TaskPilot-custodian-v1",
  );
  plain.fill(0);
  process.stdout.write(
    JSON.stringify({
      name,
      sha256: createHash("sha256").update(dump).digest("hex"),
      backup: dump.toString("base64"),
      escrow,
      custodianEscrow,
    }),
  );
} catch {
  console.error("PRIVATE_RECOVERY_EXPORT_FAILED");
  process.exitCode = 1;
}
