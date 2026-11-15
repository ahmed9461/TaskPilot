// Optional independent restore acceptance. Never installs/replaces the daily runner.
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const image =
  "node@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5";

export async function verifyRecoveredApp({
  root,
  container,
  encryptionKey,
  run,
}) {
  if (!/^[a-f0-9]{64}$/.test(container) || typeof encryptionKey !== "string")
    throw Error("INVALID_RECOVERY_INPUT");
  const app = join(root, "app");
  for (const path of [
    app,
    join(app, "node_modules"),
    join(app, "dist/services/api/src/app.js"),
    join(app, "ops/recovery-api-check.mjs"),
  ]) {
    if ((await lstat(path)).isSymbolicLink())
      throw Error("RECOVERY_APP_LINK_REJECTED");
  }
  const [database] = JSON.parse(
    (await run("docker.exe", ["inspect", container])).toString(),
  );
  if (
    database.HostConfig.NetworkMode !== "none" ||
    Object.keys(database.HostConfig.PortBindings ?? {}).length !== 0 ||
    database.Config.Labels?.["com.taskpilot.purpose"] !== "offhost-recovery" ||
    !database.State.Running
  )
    throw Error("ISOLATED_DATABASE_REQUIRED");
  const name = "taskpilot-recovery-app-" + randomUUID();
  const input = Buffer.from(JSON.stringify({ encryptionKey }));
  try {
    const output = await run(
      "docker.exe",
      [
        "run",
        "--rm",
        "-i",
        "--name",
        name,
        "--label",
        "com.taskpilot.purpose=offhost-app-recovery",
        "--network",
        "container:" + container,
        "--log-driver",
        "none",
        "--read-only",
        "--user",
        "node",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "96",
        "--memory",
        "256m",
        "--cpus",
        "0.5",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=16777216",
        "--mount",
        `type=bind,source=${app},target=/app,readonly`,
        "--workdir",
        "/app",
        "-e",
        "TASKPILOT_ISOLATED_RECOVERY=1",
        "--entrypoint",
        "node",
        image,
        "ops/recovery-api-check.mjs",
      ],
      input,
    );
    const result = JSON.parse(output.toString());
    if (
      result.application !== "PASS" ||
      result.providerConnections !== 0 ||
      result.externalMessages !== 0 ||
      result.aiCalls !== 0 ||
      result.mockReplies !== 1
    )
      throw Error("RECOVERY_APP_CHECK_FAILED");
    return result;
  } finally {
    input.fill(0);
    // A timed-out Docker CLI may leave its process running: remove only our UUID
    // container with our purpose label before the parent stops the database.
    const remaining = (
      await run("docker.exe", [
        "ps",
        "-aq",
        "--filter",
        "name=^" + name + "$",
        "--filter",
        "label=com.taskpilot.purpose=offhost-app-recovery",
      ])
    )
      .toString()
      .trim();
    if (remaining) {
      if (!/^[a-f0-9]{12,64}$/.test(remaining))
        throw Error("RECOVERY_APP_CLEANUP_SCOPE_FAILED");
      await run("docker.exe", ["rm", "-f", remaining]);
    }
  }
}
