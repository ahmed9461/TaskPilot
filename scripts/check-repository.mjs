import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const blocked = [];
for (const file of files) {
  if (
    /(^|\/)(\.env(\..+)?|credentials\.json|tokens\.json)$/.test(file) &&
    !file.endsWith(".env.example")
  )
    blocked.push(file);
  if (/\.(pem|key|pfx|p12|dump|backup|sqlite|db|log)$/.test(file))
    blocked.push(file);
  if (/\.(png|ico)$/.test(file)) continue;
  let data;
  try {
    data = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file));
  } catch {
    blocked.push(file + " (invalid UTF-8)");
    continue;
  }
  if (
    data.includes("\ufffd") ||
    (data.match(/\u0637\u00a7|\u0638\u201e|\u0638\u2026/g) ?? []).length > 1
  )
    blocked.push(file + " (text encoding corruption)");
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(data) ||
    /sk-(?:proj|or-v1)-[A-Za-z0-9_-]{24,}/.test(data)
  )
    blocked.push(file);
}
if (blocked.length) {
  console.error("REPOSITORY_SCAN_FAILED: " + [...new Set(blocked)].join(", "));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} tracked files checked for forbidden runtime files and known secret patterns.`,
  );
