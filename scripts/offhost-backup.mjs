import { recipientId, openEnvelope, openField } from "./recovery-crypto.mjs";
// Windows-only: no plaintext dump/master keys on disk, current-user DPAPI recovery escrow.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  generateKeyPairSync,
  createPrivateKey,
  privateDecrypt,
  createDecipheriv,
  createHash,
  constants,
} from "node:crypto";
import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const profileRecovery = process.argv[2] === "--recover-profile";
const rotateProtector = process.argv[2] === "--rotate-protector";
const root = resolve(
  process.env.TASKPILOT_RECOVERY_ROOT ?? "E:\\TaskPilot-Backups",
);
if (
  process.env.TASKPILOT_RECOVERY_ROOT &&
  !/^E:\\TaskPilot-Recovery-[A-Za-z0-9_-]{1,40}$/i.test(root)
)
  throw Error("PRIVATE_RECOVERY_DIRECTORY_REQUIRED");
if (process.env.TASKPILOT_RECOVERY_ROOT && !profileRecovery)
  throw Error("PROFILE_RECOVERY_ROOT_ONLY");
const image =
  "postgres@sha256:d4bb0a8c1b7bb2e29f976d099e7bfb9a5d8858cffe9e46b35cd302cd1f1f8168";
const entropy = Buffer.from("TaskPilot-recovery-v1").toString("base64");
function run(file, args, input, env = {}) {
  return new Promise((ok, no) => {
    const p = execFile(
      file,
      args,
      {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        timeout: 120000,
        env: { ...process.env, ...env },
      },
      (e, out) => (e ? no(Error("PRIVATE_OPERATION_FAILED")) : ok(out)),
    );
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}
const ps = (script, input, env) =>
  run(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; " + script,
    ],
    input,
    {
      PSModulePath:
        process.env.SystemRoot + "\\System32\\WindowsPowerShell\\v1.0\\Modules",
      ...env,
    },
  );
let dpapiCalls = 0;
async function dpapi(mode, input) {
  if (profileRecovery) throw Error("DPAPI_NOT_ALLOWED_IN_PROFILE_RECOVERY");
  dpapiCalls++;
  const code = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $e=[Convert]::FromBase64String('${entropy}'); $v=[Security.Cryptography.ProtectedData]::${mode}($b,$e,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($v));`;
  return Buffer.from(
    (await ps(code, input.toString("base64"))).toString(),
    "base64",
  );
}
let container;
let stage = "platform";
try {
  if (
    process.platform !== "win32" ||
    resolve(root).toLowerCase().includes("codex\\tasks")
  )
    throw Error();
  stage = "folder";
  await mkdir(root, { recursive: true });
  stage = "acl";
  await ps(
    "$p=$env:TASKPILOT_PRIVATE_FOLDER; $i=Get-Item -LiteralPath $p; if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_POINT'}; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; & icacls.exe $p '/inheritance:r' '/grant:r' ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null; if($LASTEXITCODE -ne 0){throw 'ACL_FAILED'}; $acl=Get-Acl -LiteralPath $p; if(!$acl.AreAccessRulesProtected){throw 'ACL_INHERITANCE'}; foreach($r in $acl.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')){throw 'UNEXPECTED_ACL'}}",
    undefined,
    { TASKPILOT_PRIVATE_FOLDER: root },
  );
  stage = "protected-key";
  let rsa;
  if (!profileRecovery) {
    const registryPath = join(root, "recovery-active.json");
    let activeId = null;
    try {
      activeId = JSON.parse(await readFile(registryPath, "utf8")).active;
      if (!/^[a-f0-9]{64}$/.test(activeId)) throw Error();
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const privatePath = join(
      root,
      activeId ? `recovery-${activeId}.dpapi` : "recovery-current-user.dpapi",
    );
    try {
      const bytes = await dpapi("Unprotect", await readFile(privatePath));
      rsa = createPrivateKey({ key: bytes, type: "pkcs8", format: "der" });
      bytes.fill(0);
    } catch (e) {
      if (e.code !== "ENOENT" || activeId || process.argv[2] === "--restore")
        throw e;
      const generated = generateKeyPairSync("rsa", { modulusLength: 3072 });
      rsa = generated.privateKey;
      const bytes = rsa.export({ type: "pkcs8", format: "der" });
      await writeFile(privatePath, await dpapi("Protect", bytes), {
        flag: "wx",
      });
      bytes.fill(0);
    }
    if (rotateProtector) {
      const fresh = generateKeyPairSync("rsa", {
          modulusLength: 3072,
        }).privateKey,
        id = recipientId(fresh),
        bytes = fresh.export({ type: "pkcs8", format: "der" });
      await writeFile(
        join(root, `recovery-${id}.dpapi`),
        await dpapi("Protect", bytes),
        { flag: "wx" },
      );
      bytes.fill(0);
      const { rename } = await import("node:fs/promises");
      await writeFile(registryPath + ".tmp", JSON.stringify({ active: id }), {
        flag: "wx",
      });
      await rename(registryPath + ".tmp", registryPath);
      console.log(
        JSON.stringify({
          protectorRotation: "PASS",
          oldProtectedKeysRetained: true,
          plainPrivateKeyOnDisk: false,
        }),
      );
      process.exit(0);
    }
  }
  stage = "export";
  const { createPublicKey } = await import("node:crypto");
  const publicKey = rsa
    ? createPublicKey(rsa).export({ type: "spki", format: "pem" })
    : null;
  const restoreOnly = process.argv[2] === "--restore" || profileRecovery;
  const backupOnly = process.argv[2] === "--backup-only";
  if (process.argv.length > 2 && !restoreOnly && !backupOnly) throw Error();
  let result;
  if (restoreOnly) {
    const name = process.argv[3];
    if (!/^offhost-[0-9]+\.tpg$/.test(name ?? "")) throw Error();
    result = JSON.parse(
      await readFile(join(root, name + ".manifest.json"), "utf8"),
    );
    if (result.name !== name) throw Error();
  } else {
    result = JSON.parse(
      (
        await run(
          "ssh.exe",
          [
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=yes",
            "New-VPS",
            "cd /opt/taskpilot/current && node ops/export-recovery.mjs",
          ],
          JSON.stringify({ publicKey }),
        )
      ).toString(),
    );
    if (!/^offhost-[0-9]+\.tpg$/.test(result.name)) throw Error();
    const sealed = Buffer.from(result.backup, "base64");
    if (createHash("sha256").update(sealed).digest("hex") !== result.sha256)
      throw Error();
    await writeFile(join(root, result.name), sealed, { flag: "wx" });
    await writeFile(
      join(root, result.name + ".escrow.json"),
      JSON.stringify(result.escrow),
      { flag: "wx" },
    );
    await writeFile(
      join(root, result.name + ".custodian.json"),
      JSON.stringify(result.custodianEscrow),
      { flag: "wx" },
    );
    await writeFile(
      join(root, result.name + ".manifest.json"),
      JSON.stringify({
        name: result.name,
        sha256: result.sha256,
        bytes: sealed.length,
      }),
      { flag: "wx" },
    );
    if (backupOnly) {
      console.log(
        JSON.stringify({
          backup: "PASS",
          bytes: sealed.length,
          sha256: result.sha256,
          restore: "NOT_RUN",
          scope: "encrypted off-host snapshot and protected escrow",
        }),
      );
      process.exit(0);
    }
  }
  const sealed = await readFile(join(root, result.name));
  if (createHash("sha256").update(sealed).digest("hex") !== result.sha256)
    throw Error();
  stage = "decrypt";
  const decrypt = (key, iv, tag, data, aad) => {
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]);
  };
  // Reload every local file; recovery below uses no server-side original key.
  let keys;
  if (profileRecovery) {
    const envelope = await readFile(
      join(root, result.name + ".custodian.json"),
    );
    const recovered = await run(
      "ssh.exe",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "New-VPS",
        "cd /opt/taskpilot/current && node ops/unseal-recovery.mjs",
      ],
      envelope,
    );
    keys = JSON.parse(recovered.toString());
    recovered.fill(0);
  } else {
    const escrow = JSON.parse(
      await readFile(join(root, result.name + ".escrow.json"), "utf8"),
    );
    const path = escrow.recipientKeyId
      ? join(root, `recovery-${escrow.recipientKeyId}.dpapi`)
      : join(root, "recovery-current-user.dpapi");
    // Legacy snapshots used a single pre-registry DPAPI file.
    let sealedKey;
    try {
      sealedKey = await readFile(path);
    } catch (e) {
      if (e.code !== "ENOENT" || !escrow.recipientKeyId) throw e;
      sealedKey = await readFile(join(root, "recovery-current-user.dpapi"));
    }
    const bytes = await dpapi("Unprotect", sealedKey);
    const snapshotKey = createPrivateKey({
      key: bytes,
      type: "pkcs8",
      format: "der",
    });
    bytes.fill(0);
    const recovered = openEnvelope(escrow, snapshotKey);
    keys = JSON.parse(recovered.toString());
    recovered.fill(0);
  }
  const backup = await readFile(join(root, result.name));
  if (backup.subarray(0, 4).toString() !== "TPG1") throw Error();
  const dump = decrypt(
    Buffer.from(keys["backup-key"], "base64"),
    backup.subarray(4, 16),
    backup.subarray(16, 32),
    backup.subarray(32),
    "TPG1",
  );
  stage = "isolated-container";
  const name = "taskpilot-recovery-" + Date.now();
  const id = (
    await run("docker.exe", [
      "run",
      "--rm",
      "-d",
      "--name",
      name,
      "--label",
      "com.taskpilot.purpose=offhost-recovery",
      "--network",
      "none",
      "--memory",
      "384m",
      "--cpus",
      "0.5",
      "--tmpfs",
      "/var/lib/postgresql/data:rw,size=134217728",
      "-e",
      "POSTGRES_USER=taskpilot",
      "-e",
      "POSTGRES_DB=taskpilot_offhost_restore_test",
      "-e",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      image,
    ])
  )
    .toString()
    .trim();
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error();
  container = id;
  for (let i = 0; ; i++) {
    try {
      await run("docker.exe", [
        "exec",
        id,
        "pg_isready",
        "-U",
        "taskpilot",
        "-d",
        "taskpilot_offhost_restore_test",
      ]);
      break;
    } catch {
      if (i >= 29) throw Error();
      await delay(1000);
    }
  }
  await run(
    "docker.exe",
    [
      "exec",
      "-i",
      id,
      "pg_restore",
      "-U",
      "taskpilot",
      "-d",
      "taskpilot_offhost_restore_test",
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
    ],
    dump,
  );
  dump.fill(0);
  const sql = async (q) =>
    JSON.parse(
      (
        await run(
          "docker.exe",
          [
            "exec",
            "-i",
            id,
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "taskpilot",
            "-d",
            "taskpilot_offhost_restore_test",
          ],
          q,
        )
      ).toString(),
    );
  stage = "restored-data-check";
  const counts = await sql(
    `SELECT json_build_object('accounts',(SELECT count(*) FROM accounts),'assignments',(SELECT count(*) FROM assignments),'migrations',(SELECT count(*) FROM schema_migrations),'liveSources',(SELECT count(*) FROM source_messages s JOIN whatsapp_sessions w ON w.id=s.session_id WHERE w.provider='baileys'),'sent',(SELECT count(*) FROM reply_jobs WHERE status='SENT'),'sending',(SELECT count(*) FROM reply_jobs WHERE status='SENDING'),'aiRequests',(SELECT count(*) FROM ai_requests));`,
  );
  if (counts.migrations < 11 || counts.sending !== 0) throw Error();
  const rows = await sql(
    "SELECT COALESCE(json_agg(json_build_object('v',encrypted_payload,'aad','wa-auth:'||session_id||':'||category||':'||id_hash)),'[]'::json) FROM whatsapp_auth;",
  );
  for (const row of rows) {
    const opened = openField(keys["encryption-key"], row.v, row.aad);
    JSON.parse(opened.toString());
    opened.fill(0);
  }
  const credentials = await sql(
    "SELECT COALESCE(json_agg(json_build_object('v',ciphertext,'aad','credential:'||account_id)),'[]'::json) FROM account_credentials;",
  );
  for (const row of credentials)
    openField(keys["encryption-key"], row.v, row.aad).fill(0);
  const remainingFields = await sql(
    "SELECT COALESCE(json_agg(x),'[]'::json) FROM (SELECT encrypted_payload v,'message:'||id aad,'review' domain FROM source_messages WHERE encrypted_payload IS NOT NULL UNION ALL SELECT encrypted_transport_key,'wa-source:'||id,'sourceQuote' FROM source_messages WHERE encrypted_transport_key IS NOT NULL UNION ALL SELECT encrypted_payload,'wa-ingress:'||session_id||':'||group_id||':'||encode(sha256(convert_to(external_message_id,'UTF8')),'hex'),'ingress' FROM whatsapp_ingress WHERE encrypted_payload IS NOT NULL) x;",
  );
  const fieldDomains = {
    auth: rows.length,
    credentials: credentials.length,
    review: 0,
    sourceQuote: 0,
    ingress: 0,
  };
  for (const row of remainingFields) {
    openField(keys["encryption-key"], row.v, row.aad).fill(0);
    fieldDomains[row.domain]++;
  }
  const replay = await sql(
    "BEGIN; WITH original AS (SELECT * FROM source_messages LIMIT 1), inserted AS (INSERT INTO source_messages(id,session_id,group_id,external_message_id,state) SELECT id,session_id,group_id,external_message_id,state FROM original ON CONFLICT DO NOTHING RETURNING id) SELECT json_build_object('inserted',(SELECT count(*) FROM inserted)); ROLLBACK;",
  );
  if (replay.inserted !== 0) throw Error();
  const report = {
    backup: "PASS",
    restore: "PASS",
    location: "owner Windows, outside Git and outputs",
    bytes: sealed.length,
    sha256: result.sha256,
    ...counts,
    authRows: rows.length,
    credentials: credentials.length,
    encryptedAuthValid: true,
    encryptedFieldDomainsValidated: fieldDomains,
    replayInserted: 0,
    providerConnections: 0,
    outboundMessages: 0,
    dpapiScope: profileRecovery
      ? "NOT_USED; independent surviving VPS custodian, no original field/backup keys read"
      : "CurrentUser; alternate custodian recovery also available",
    profileRecovery,
    dpapiCalls,
    containerNetwork: "none",
    plaintextDumpOnDisk: false,
  };
  await writeFile(
    join(root, result.name + ".receipt.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} catch {
  console.error("OFFHOST_BACKUP_OR_RECOVERY_FAILED:" + stage);
  process.exitCode = 1;
} finally {
  if (container)
    try {
      await run("docker.exe", ["stop", container]);
    } catch {
      console.error("OWN_RESTORE_CONTAINER_STOP_FAILED");
      process.exitCode = 1;
    }
}
