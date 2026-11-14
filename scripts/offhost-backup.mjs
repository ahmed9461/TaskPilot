import {
  initOwner,
  ownerPublic,
  ownerPrivate,
  defaultCodeFile,
} from "./owner-recovery-files.mjs";
import {
  sealOwnerSnapshot,
  openOwnerSnapshot,
} from "./owner-recovery-crypto.mjs";
import {
  recipientId,
  openEnvelope,
  openField,
  sealEnvelope,
} from "./recovery-crypto.mjs";
// Windows-only: encrypted snapshots with DPAPI, VPS and independent owner recipients.
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
const independentRecovery = process.argv[2] === "--recover-independent";
const initIndependent = process.argv[2] === "--init-independent";
const upgradeOwner = process.argv[2] === "--upgrade-owner-escrows";
const rotateProtector = process.argv[2] === "--rotate-protector";
const localRestore = process.argv[2] === "--restore";
const upgradeEscrows = process.argv[2] === "--upgrade-escrows";
const root = resolve(
  process.env.TASKPILOT_RECOVERY_ROOT ?? "E:\\TaskPilot-Backups",
);
if (
  process.env.TASKPILOT_RECOVERY_ROOT &&
  !(
    independentRecovery
      ? /^[A-Z]:\\TaskPilot-Recovery-[A-Za-z0-9_-]{1,40}$/i
      : /^E:\\TaskPilot-Recovery-[A-Za-z0-9_-]{1,40}$/i
  ).test(root)
)
  throw Error("PRIVATE_RECOVERY_DIRECTORY_REQUIRED");
if (
  process.env.TASKPILOT_RECOVERY_ROOT &&
  !profileRecovery &&
  !independentRecovery
)
  throw Error("PROFILE_RECOVERY_ROOT_ONLY");
const image =
  "postgres@sha256:d4bb0a8c1b7bb2e29f976d099e7bfb9a5d8858cffe9e46b35cd302cd1f1f8168";
const entropy = Buffer.from("TaskPilot-recovery-v1").toString("base64");
let sshCalls = 0;
function run(file, args, input, env = {}) {
  if (file.toLowerCase() === "ssh.exe") {
    if (independentRecovery)
      throw Error("SSH_NOT_ALLOWED_IN_INDEPENDENT_RECOVERY");
    sshCalls++;
  }
  // Windows selects only one of differently cased environment keys. Python and
  // other launchers may normalize inherited keys to uppercase.
  const overridden = new Set(Object.keys(env).map((key) => key.toLowerCase()));
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !overridden.has(key.toLowerCase()),
    ),
  );
  return new Promise((ok, no) => {
    const p = execFile(
      file,
      args,
      {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        timeout: 120000,
        env: { ...inherited, ...env },
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
  if (profileRecovery || independentRecovery)
    throw Error("DPAPI_NOT_ALLOWED_IN_INDEPENDENT_RECOVERY");
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
  if (initIndependent) {
    stage = "owner-init";
    const protectFolder = async (path) => {
      if (path !== "D:\\TaskPilot-Recovery-Key") throw Error();
      await mkdir(path, { recursive: true });
      await ps(
        "$p=$env:TASKPILOT_CODE_FOLDER; $i=Get-Item -LiteralPath $p; if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_POINT'}; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; & icacls.exe $p '/inheritance:r' '/grant:r' ('*'+$sid+':(OI)(CI)F') '*S-1-5-18:(OI)(CI)F' | Out-Null; if($LASTEXITCODE -ne 0){throw 'ACL_FAILED'}; $a=Get-Acl -LiteralPath $p; foreach($r in $a.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')){throw 'UNEXPECTED_ACL'}}",
        undefined,
        { TASKPILOT_CODE_FOLDER: path },
      );
    };
    console.log(JSON.stringify(await initOwner(root, protectFolder)));
    process.exit(0);
  }
  stage = "protected-key";
  let rsa;
  if (
    !profileRecovery &&
    !independentRecovery &&
    !localRestore &&
    !upgradeEscrows &&
    !upgradeOwner
  ) {
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
    if (activeId && recipientId(rsa) !== activeId)
      throw Error("RECOVERY_REGISTRY_KEY_MISMATCH");
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
  if (upgradeEscrows) {
    stage = "legacy-escrow-upgrade";
    const { readdir } = await import("node:fs/promises");
    const command =
      "node --input-type=module -e \"import {readFileSync} from 'node:fs';import {createPublicKey} from 'node:crypto';process.stdout.write(createPublicKey(readFileSync('/etc/taskpilot/recovery-custodian.pem')).export({type:'spki',format:'pem'}));\"";
    const publicKey = (
      await run("ssh.exe", [
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "New-VPS",
        command,
      ])
    ).toString();
    let upgraded = 0,
      alreadyDual = 0;
    for (const file of (await readdir(root)).filter((f) =>
      /^offhost-[0-9]+\.tpg\.manifest\.json$/.test(f),
    )) {
      const name = file.slice(0, -".manifest.json".length),
        target = join(root, name + ".custodian.json");
      try {
        const existing = JSON.parse(await readFile(target, "utf8"));
        if (existing.recipientKeyId !== recipientId(publicKey))
          throw Error("OTHER_CUSTODIAN_REQUIRES_REVIEW");
        alreadyDual++;
        continue;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const escrow = JSON.parse(
        await readFile(join(root, name + ".escrow.json"), "utf8"),
      );
      if (
        escrow.recipientKeyId &&
        !/^[a-f0-9]{64}$/.test(escrow.recipientKeyId)
      )
        throw Error();
      let protectedKey;
      try {
        protectedKey = await readFile(
          escrow.recipientKeyId
            ? join(root, `recovery-${escrow.recipientKeyId}.dpapi`)
            : join(root, "recovery-current-user.dpapi"),
        );
      } catch (e) {
        if (e.code !== "ENOENT" || !escrow.recipientKeyId) throw e;
        protectedKey = await readFile(
          join(root, "recovery-current-user.dpapi"),
        );
      }
      const bytes = await dpapi("Unprotect", protectedKey),
        key = createPrivateKey({ key: bytes, type: "pkcs8", format: "der" });
      bytes.fill(0);
      const plain = openEnvelope(escrow, key);
      try {
        await writeFile(
          target,
          JSON.stringify(
            sealEnvelope(plain, publicKey, "TaskPilot-custodian-v1"),
          ),
          { flag: "wx" },
        );
      } finally {
        plain.fill(0);
      }
      upgraded++;
    }
    console.log(
      JSON.stringify({
        legacyEscrowUpgrade: "PASS",
        upgraded,
        alreadyDual,
        oldSnapshotsUnchanged: true,
        plainMasterKeysOnDisk: false,
        dpapiCalls,
      }),
    );
    process.exit(0);
  }
  if (upgradeOwner) {
    stage = "owner-upgrade";
    const publicKey = await ownerPublic(root);
    if (!publicKey) throw Error();
    const ownerKey = await ownerPrivate(root, defaultCodeFile);
    const { readdir } = await import("node:fs/promises");
    let upgraded = 0,
      alreadyOwner = 0;
    for (const manifest of (await readdir(root)).filter((f) =>
      /^offhost-[0-9]+\.tpg\.manifest\.json$/.test(f),
    )) {
      const name = manifest.slice(0, -".manifest.json".length),
        meta = JSON.parse(await readFile(join(root, manifest), "utf8")),
        target = join(root, name + ".owner.json");
      const dump = await readFile(join(root, name));
      if (
        meta.name !== name ||
        createHash("sha256").update(dump).digest("hex") !== meta.sha256
      )
        throw Error();
      try {
        const packet = JSON.parse(await readFile(target, "utf8"));
        const plain = openOwnerSnapshot(packet, ownerKey, meta.sha256);
        plain.fill(0);
        alreadyOwner++;
        continue;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const packet = JSON.parse(
        await readFile(join(root, name + ".escrow.json"), "utf8"),
      );
      let protectedBytes;
      try {
        protectedBytes = await readFile(
          join(
            root,
            packet.recipientKeyId
              ? `recovery-${packet.recipientKeyId}.dpapi`
              : "recovery-current-user.dpapi",
          ),
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        protectedBytes = await readFile(
          join(root, "recovery-current-user.dpapi"),
        );
      }
      const der = await dpapi("Unprotect", protectedBytes),
        privateKey = createPrivateKey({
          key: der,
          type: "pkcs8",
          format: "der",
        });
      der.fill(0);
      const plain = openEnvelope(packet, privateKey);
      try {
        const captured = JSON.parse(plain.toString());
        const d = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(captured["backup-key"], "base64"),
          dump.subarray(4, 16),
        );
        d.setAAD(Buffer.from("TPG1"));
        d.setAuthTag(dump.subarray(16, 32));
        Buffer.concat([d.update(dump.subarray(32)), d.final()]).fill(0);
        await writeFile(
          target,
          JSON.stringify(sealOwnerSnapshot(plain, publicKey, meta.sha256)),
          { flag: "wx" },
        );
        upgraded++;
      } finally {
        plain.fill(0);
      }
    }
    console.log(
      JSON.stringify({
        ownerEscrowUpgrade: "PASS",
        upgraded,
        alreadyOwner,
        dpapiCalls,
        sshCalls,
        originalDumpsUnchanged: true,
        codeUploaded: false,
      }),
    );
    process.exit(0);
  }
  stage = "export";
  const { createPublicKey } = await import("node:crypto");
  const publicKey = rsa
    ? createPublicKey(rsa).export({ type: "spki", format: "pem" })
    : null;
  const restoreOnly =
    process.argv[2] === "--restore" || profileRecovery || independentRecovery;
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
    const ownerPublicKey = await ownerPublic(root);
    if (ownerPublicKey) {
      const plain = openEnvelope(result.escrow, rsa);
      try {
        await writeFile(
          join(root, result.name + ".owner.json"),
          JSON.stringify(
            sealOwnerSnapshot(plain, ownerPublicKey, result.sha256),
          ),
          { flag: "wx" },
        );
      } finally {
        plain.fill(0);
      }
    }
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
  if (independentRecovery) {
    const codeFile = process.argv[4];
    if (!codeFile) throw Error("RECOVERY_CODE_FILE_REQUIRED");
    const key = await ownerPrivate(root, codeFile),
      packet = JSON.parse(
        await readFile(join(root, result.name + ".owner.json"), "utf8"),
      );
    const plain = openOwnerSnapshot(packet, key, result.sha256);
    try {
      keys = JSON.parse(plain.toString());
    } finally {
      plain.fill(0);
    }
  } else if (profileRecovery) {
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
  let privacy = null;
  if (counts.migrations >= 13) {
    privacy = await sql(
      "SELECT json_build_object('policyRows',(SELECT count(*) FROM retention_policy),'runs',(SELECT count(*) FROM privacy_runs),'forgottenSessions',(SELECT count(*) FROM whatsapp_sessions WHERE forgotten_at IS NOT NULL),'forgottenAuthRows',(SELECT count(*) FROM whatsapp_auth a JOIN whatsapp_sessions s ON s.id=a.session_id WHERE s.forgotten_at IS NOT NULL));",
    );
    if (privacy.policyRows !== 1 || privacy.forgottenAuthRows !== 0)
      throw Error("RESTORED_PRIVACY_INVARIANT_FAILED");
  }
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
    privacy,
    authRows: rows.length,
    credentials: credentials.length,
    encryptedAuthValid: true,
    encryptedFieldDomainsValidated: fieldDomains,
    replayInserted: 0,
    providerConnections: 0,
    outboundMessages: 0,
    dpapiScope: independentRecovery
      ? "NOT_USED; independent owner key and separate recovery code, no VPS/DPAPI dependency"
      : profileRecovery
        ? "NOT_USED; independent surviving VPS custodian, no original field/backup keys read"
        : "CurrentUser; alternate custodian requires the snapshot's matching custodian envelope",
    profileRecovery,
    independentRecovery,
    dpapiCalls,
    sshCalls,
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
