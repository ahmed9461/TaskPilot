// Root-only, additive tailnet HTTPS listener. Never reset Serve or enable Funnel.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const run = (...args) =>
  execFileSync("tailscale", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
const canonical = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
let created = false;
try {
  if (process.getuid?.() !== 0 || process.argv.length !== 2) throw Error();
  const status = JSON.parse(run("status", "--json"));
  if (status.BackendState !== "Running" || status.Self?.Online !== true)
    throw Error();
  const host = status.Self.DNSName.replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.ts\.net$/i.test(host)) throw Error();
  const webKey = host + ":9443",
    address = "https://" + webKey;
  const before = JSON.parse(run("serve", "status", "--json"));
  if (before.AllowFunnel?.[webKey] === true) throw Error();
  const own = { Proxy: "http://127.0.0.1:8240" };
  if (
    before.TCP?.["9443"] &&
    (before.TCP["9443"].HTTPS !== true ||
      canonical(before.Web?.[webKey]?.Handlers) !== canonical({ "/": own }))
  )
    throw Error();
  await mkdir("/etc/taskpilot", { recursive: true, mode: 0o700 });
  if (!before.TCP?.["9443"]) {
    await writeFile(
      "/etc/taskpilot/tailscale-serve-before-089.json",
      JSON.stringify(before),
      { flag: "wx", mode: 0o600 },
    );
    created = true;
    run("serve", "--bg", "--https=9443", "http://127.0.0.1:8240");
  }
  const after = JSON.parse(run("serve", "status", "--json"));
  const withoutOwn = (value) => {
    const result = structuredClone(value);
    delete result.TCP?.["9443"];
    delete result.Web?.[webKey];
    delete result.AllowFunnel?.[webKey];
    for (const key of ["TCP", "Web", "AllowFunnel"])
      if (result[key] && Object.keys(result[key]).length === 0)
        delete result[key];
    return result;
  };
  if (
    after.TCP?.["9443"]?.HTTPS !== true ||
    canonical(after.Web?.[webKey]?.Handlers) !== canonical({ "/": own }) ||
    after.AllowFunnel?.[webKey] === true ||
    canonical(withoutOwn(before)) !== canonical(withoutOwn(after))
  )
    throw Error();
  let old;
  try {
    old = JSON.parse(
      await readFile("/etc/taskpilot/desktop-connection.json", "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (old && old.address !== address) throw Error();
  if (!old)
    await writeFile(
      "/etc/taskpilot/desktop-connection.json",
      JSON.stringify({ version: 1, address }),
      { mode: 0o600, flag: "wx" },
    );
  console.log(
    JSON.stringify({
      tailscaleHttps: "PASS",
      port: 9443,
      tailnetOnly: true,
      funnelEnabled: false,
      existingHandlersUnchanged: true,
      apiLoopbackPort: 8240,
      deviceProfileConfigured: true,
    }),
  );
} catch {
  if (created)
    try {
      run("serve", "--https=9443", "off");
    } catch {}
  console.log("TAILSCALE_SETUP_FAILED_NO_GLOBAL_RESET");
  process.exitCode = 1;
}
