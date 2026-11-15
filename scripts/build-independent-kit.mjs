// Explicit owner operation. No code, DPAPI, custodian, original escrow or plaintext key is read.
import { readFile, writeFile, lstat, readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { ownerPublic, readBounded } from "./owner-recovery-files.mjs";
import { recipientId } from "./recovery-crypto.mjs";
const root = "E:\\TaskPilot-Backups";
const scripts = dirname(fileURLToPath(import.meta.url));
const withApp = process.argv[2] === "--app-bundle";
const appSource = withApp ? resolve(process.argv[3] ?? "") : null;
const snapshots = process.argv.slice(withApp ? 4 : 2);
function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
try {
  if (
    process.platform !== "win32" ||
    !snapshots.length ||
    snapshots.length > 10 ||
    new Set(snapshots).size !== snapshots.length ||
    snapshots.some((name) => !/^offhost-[0-9]+\.tpg$/.test(name))
  )
    throw Error();
  const folder = await lstat(root);
  if (!folder.isDirectory() || folder.isSymbolicLink()) throw Error();
  const pub = await ownerPublic(root);
  if (!pub) throw Error();
  const entries = [];
  const add = async (path, name, limit) => {
    const bytes = await readBounded(path, limit);
    entries.push({ path, name, sha256: digest(bytes) });
    return bytes;
  };
  for (const name of snapshots) {
    const data = await add(join(root, name), name, 64 * 1024 * 1024);
    if (data.subarray(0, 4).toString() !== "TPG1") throw Error();
    const manifest = JSON.parse(
      await add(
        join(root, name + ".manifest.json"),
        name + ".manifest.json",
        4096,
      ),
    );
    const packet = JSON.parse(
      await add(join(root, name + ".owner.json"), name + ".owner.json", 131072),
    );
    if (
      manifest.name !== name ||
      manifest.bytes !== data.length ||
      manifest.sha256 !== digest(data) ||
      packet.snapshotSha256 !== manifest.sha256 ||
      packet.recipientKeyId !== recipientId(pub) ||
      packet.version !== 1
    )
      throw Error();
  }
  await add(
    join(root, "owner-recovery-key.json"),
    "owner-recovery-key.json",
    32768,
  );
  await add(
    join(root, "owner-recovery-public.pem"),
    "owner-recovery-public.pem",
    4096,
  );
  for (const name of [
    "offhost-backup.mjs",
    "recovery-crypto.mjs",
    "owner-recovery-crypto.mjs",
    "owner-recovery-files.mjs",
  ])
    await add(join(scripts, name), name, 131072);
  if (withApp) {
    if (
      !/^[A-Z]:\\TaskPilot-Recovery-[A-Za-z0-9_-]{1,40}\\app$/i.test(appSource)
    )
      throw Error("PRIVATE_PUBLIC_APP_SOURCE_REQUIRED");
    if ((await lstat(appSource)).isSymbolicLink()) throw Error();
    for (const required of [
      "package.json",
      "dist/services/api/src/app.js",
      "ops/recovery-api-check.mjs",
    ])
      await readBounded(join(appSource, required), 1024 * 1024);
    await add(join(scripts, "recovery-app.mjs"), "recovery-app.mjs", 131072);
    let total = 0,
      count = 0;
    const walk = async (path, relative = "") => {
      for (const name of await readdir(path)) {
        const next = relative ? relative + "/" + name : name;
        if (
          !relative &&
          !["dist", "node_modules", "package.json", "ops"].includes(name)
        )
          throw Error("PUBLIC_APP_ALLOWLIST_REQUIRED");
        if (
          /[\\:]/.test(name) ||
          name === ".." ||
          /^\.env/i.test(name) ||
          /\.(?:tpg|dpapi|db|sqlite|key|pem|pfx|log)$/i.test(name)
        )
          throw Error("PRIVATE_APP_ENTRY_REJECTED");
        const source = join(path, name),
          info = await lstat(source);
        if (info.isSymbolicLink()) throw Error("APP_LINK_REJECTED");
        if (info.isDirectory()) await walk(source, next);
        else {
          if (
            !info.isFile() ||
            ++count > 10000 ||
            (total += info.size) > 256 * 1024 * 1024
          )
            throw Error("PUBLIC_APP_BOUNDS");
          await add(source, "app/" + next, 32 * 1024 * 1024);
        }
      }
    };
    await walk(appSource);
  }
  const readme = `TaskPilot independent encrypted recovery kit\n\nThe separate recovery code is NOT included. Keep it offline and outside this laptop/kit. No SSH, DPAPI, original Windows profile or provider process is used by independent mode.\n\nRequirements: Windows, Node.js24, Docker Desktop running, pinned PostgreSQL17 image in offhost-backup.mjs available locally (first pull requires network). Extract into a NEW private directory, for example E:\\TaskPilot-Recovery-OwnerDrill.\n\nFrom PowerShell inside that directory:\n$env:TASKPILOT_RECOVERY_ROOT='E:\\TaskPilot-Recovery-OwnerDrill'\nnode .\\offhost-backup.mjs --recover-independent ${snapshots.at(-1)} 'X:\\private-folder\\recovery-code.txt'\n\nUse the actual separate code-file path. Never paste its value in a command, Git, chat or report. Choose another included snapshot by its exact name if needed.\n\nThe runner enforces owner+SYSTEM folder access, validates snapshot SHA/AEAD/field domains and replay, restores only into a temporary PG container (network=none, no ports, bounded resources), removes it afterward and writes an aggregate receipt. It does NOT deploy a recovered API, replace a live database, reconnect WhatsApp or send messages. A real cutover needs a separate target and rollback procedure. Wrong code/tampered packet fails before container startup.\n\nLocal forgetting is not retroactive in older snapshots or the phone's linked devices. Originals are retained. Total laptop loss requires a separate owner-held copy of the code; cryptographic drills do not prove physical custody or a fresh-machine cutover.\n`;
  const appReadme = withApp
    ? "\nThis kit also includes the public compiled API/dependencies/probe. Add --verify-app to the independent command to verify API HTTP auth, masked reads, fake ingress/dedupe/completion and one MOCK reply with replay rejection. Cache the pinned official Node24 image from recovery-app.mjs first. The app shares only the PG network-none namespace, has a read-only public bundle and logs disabled. Only the field key is passed on private stdin; original API/AI keys are unused. Both containers are removed. This remains an isolated drill, not live deployment/WhatsApp reconnection.\n"
    : "";
  const label = new Date().toISOString().replace(/[^0-9]/g, "");
  const destination = join(root, `TaskPilot-Independent-Recovery-${label}.zip`);
  const spec = { root, destination, entries, readme: readme + appReadme };
  const ps = `
$ErrorActionPreference='Stop'
$spec=[Console]::In.ReadToEnd() | ConvertFrom-Json
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl=Get-Acl -LiteralPath $spec.root
if(!$acl.AreAccessRulesProtected){throw 'PRIVATE_ACL_REQUIRED'}
foreach($r in $acl.Access){if($r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -notin @($sid,'S-1-5-18')){throw 'PRIVATE_ACL_REQUIRED'}}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$file=[IO.File]::Open($spec.destination,[IO.FileMode]::CreateNew)
try {
 $zip=[IO.Compression.ZipArchive]::new($file,[IO.Compression.ZipArchiveMode]::Create,$true)
 try {
  foreach($item in $spec.entries){
   if((Get-FileHash -LiteralPath $item.path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.sha256){throw 'SOURCE_CHANGED'}
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$item.path,$item.name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $entry=$zip.CreateEntry('RECOVER.txt')
  $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
  try{$writer.Write($spec.readme)}finally{$writer.Dispose()}
 } finally{$zip.Dispose()}
} finally{$file.Dispose()}
$check=[IO.Compression.ZipFile]::OpenRead($spec.destination)
try {
 if($check.Entries.Count -ne $spec.entries.Count+1){throw 'KIT_COUNT'}
 foreach($item in $spec.entries){
  $stream=$check.GetEntry($item.name).Open()
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$hash=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose();$stream.Dispose()}
  if($hash -ne $item.sha256){throw 'KIT_ENTRY_CHANGED'}
 }
} finally{$check.Dispose()}
`;
  // Remove case-insensitive inherited duplicates before overriding Windows variables.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key.toLowerCase() !== "psmodulepath",
    ),
  );
  env.PSModulePath =
    process.env.SystemRoot + "\\System32\\WindowsPowerShell\\v1.0\\Modules";
  await new Promise((resolve, reject) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { windowsHide: true, env, timeout: 120000, maxBuffer: 1024 * 1024 },
      (error) => (error ? reject(Error("KIT_BUILD_FAILED")) : resolve()),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(spec));
  });
  const zip = await readFile(destination);
  const receipt = {
    kit: "PASS",
    file: destination,
    bytes: zip.length,
    sha256: digest(zip),
    snapshots: snapshots.length,
    files: entries.length + 1,
    entryHashesVerified: true,
    recoveryCodeIncluded: false,
    plaintextMasterKeysIncluded: false,
    applicationBundleIncluded: withApp,
    upload: "NOT_RUN; explicit private storage copy required",
  };
  await writeFile(
    destination + ".receipt.json",
    JSON.stringify(receipt, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify(receipt));
} catch {
  console.error(
    "INDEPENDENT_KIT_BUILD_FAILED; existing snapshots and keys preserved",
  );
  process.exitCode = 1;
}
