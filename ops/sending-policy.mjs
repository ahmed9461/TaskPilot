// Root-only fixed SSH entry point. No path or command overrides from stdin/env/argv.
import { execFileSync } from "node:child_process";
import { executeSendingPolicy } from "./sending-policy-core.mjs";
async function health() {
  try {
    const r = await fetch("http://127.0.0.1:8240/health", {
      signal: AbortSignal.timeout(1500),
    });
    const h = await r.json();
    if (
      r.ok &&
      h.livePolicyControl === true &&
      h.sendingPolicyReady === true &&
      typeof h.liveSendingEnabled === "boolean"
    )
      return h.liveSendingEnabled;
  } catch {
    /* No raw response/error is returned. */
  }
  return null;
}
try {
  if (process.getuid?.() !== 0 || process.argv.length !== 2)
    throw Error("SENDING_POLICY_UNAVAILABLE");
  let input = "";
  for await (const part of process.stdin) {
    input += part;
    if (Buffer.byteLength(input) > 8192) throw Error("SENDING_POLICY_INVALID");
  }
  const result = await executeSendingPolicy(JSON.parse(input), {
    envPath: "/etc/taskpilot/pilot.env",
    directory: "/var/lib/taskpilot/sending-policy/previews",
    health,
    async signal() {
      execFileSync(
        "systemctl",
        ["kill", "--kill-who=main", "--signal=HUP", "taskpilot.service"],
        { stdio: "ignore", timeout: 5000 },
      );
    },
    async stop() {
      execFileSync("systemctl", ["stop", "taskpilot.service"], {
        stdio: "ignore",
        timeout: 15000,
      });
    },
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const safe = new Set([
    "SENDING_POLICY_UNAVAILABLE",
    "SENDING_POLICY_INVALID",
    "SENDING_POLICY_STALE",
    "SENDING_POLICY_BUSY",
    "SENDING_POLICY_NOT_SAFE",
    "SENDING_POLICY_DISABLED_AFTER_FAILURE",
    "SENDING_POLICY_SERVICE_STOPPED",
    "SESSION_EXPIRED",
    "REAUTH_REQUIRED",
  ]);
  console.log(
    JSON.stringify({
      code: safe.has(error?.message)
        ? error.message
        : "SENDING_POLICY_UNAVAILABLE",
    }),
  );
  process.exitCode = 1;
}
