// Root SSH IPC only. Secret result is consumed in memory by the Windows operator, never logged.
import { readFile, lstat } from "node:fs/promises";
import { openEnvelope } from "../scripts/recovery-crypto.mjs";
try {
  if (process.getuid?.() !== 0) throw Error();
  let input = "";
  for await (const b of process.stdin) {
    input += b;
    if (input.length > 65536) throw Error();
  }
  const path = "/etc/taskpilot/recovery-custodian.pem",
    s = await lstat(path);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.uid !== 0 ||
    (s.mode & 0o077) !== 0
  )
    throw Error();
  const plain = openEnvelope(
    JSON.parse(input),
    await readFile(path, "utf8"),
    "TaskPilot-custodian-v1",
  );
  const keys = JSON.parse(plain.toString());
  if (
    Object.keys(keys).sort().join(",") !==
    "api-token,backup-key,deepseek-key,encryption-key,reauth-secret"
  )
    throw Error();
  process.stdout.write(plain);
  plain.fill(0);
} catch {
  console.error("CUSTODIAN_RECOVERY_FAILED");
  process.exitCode = 1;
}
