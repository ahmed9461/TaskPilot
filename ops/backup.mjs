import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, stat } from "node:fs/promises";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
const exec = promisify(execFile);
const magic = Buffer.from("TPG1");
const docker = async (args) =>
  exec("docker", ["exec", "-i", "taskpilot-db", ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
try {
  const key = Buffer.from(
    (await readFile("/etc/taskpilot/backup-key", "utf8")).trim(),
    "base64",
  );
  if (key.length !== 32) throw Error();
  const [mode, path, target] = process.argv.slice(2);
  if (
    !path ||
    !path.startsWith("/var/lib/taskpilot/backups/") ||
    path.includes("..")
  )
    throw Error();
  if (mode === "backup") {
    const dump = (
      await docker([
        "pg_dump",
        "-U",
        "taskpilot",
        "-d",
        "taskpilot_pilot",
        "-Fc",
        "--no-owner",
        "--no-acl",
      ])
    ).stdout;
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(magic);
    const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
    dump.fill(0);
    await writeFile(
      path,
      Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]),
      { flag: "wx", mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        backup: "PASS",
        bytes: (await stat(path)).size,
        encrypted: true,
      }),
    );
  } else if (mode === "restore-test") {
    if (!target || !/^[a-z0-9_]+_restore_test$/.test(target)) throw Error();
    const sealed = await readFile(path);
    if (!sealed.subarray(0, 4).equals(magic)) throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(4, 16),
    );
    decipher.setAAD(magic);
    decipher.setAuthTag(sealed.subarray(16, 32));
    const dump = Buffer.concat([
      decipher.update(sealed.subarray(32)),
      decipher.final(),
    ]);
    // createdb fails safely if the target already exists; no production restore or overwrite path.
    await docker(["createdb", "-U", "taskpilot", target]);
    await new Promise((resolve, reject) => {
      const child = execFile(
        "docker",
        [
          "exec",
          "-i",
          "taskpilot-db",
          "pg_restore",
          "-U",
          "taskpilot",
          "-d",
          target,
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-acl",
        ],
        { maxBuffer: 1024 * 1024 },
        (err) => (err ? reject(Error()) : resolve()),
      );
      child.stdin.end(dump);
    });
    dump.fill(0);
    const check = (
      await docker([
        "psql",
        "-U",
        "taskpilot",
        "-d",
        target,
        "-Atc",
        "SELECT count(*) FROM accounts;SELECT count(*) FROM assignments;SELECT count(*) FROM schema_migrations;SELECT count(*) FROM reply_jobs WHERE status='SENDING';",
      ])
    ).stdout
      .toString()
      .trim()
      .split("\n");
    if (Number(check[2]) < 2 || Number(check[3]) !== 0) throw Error();
    console.log(
      JSON.stringify({
        restore: "PASS",
        accounts: Number(check[0]),
        assignments: Number(check[1]),
        migrations: Number(check[2]),
        sending: 0,
        scope: "isolated synthetic database",
      }),
    );
  } else throw Error();
} catch {
  console.error("BACKUP_OR_RESTORE_FAILED");
  process.exitCode = 1;
}
