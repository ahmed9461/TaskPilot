import { readFile, writeFile, chmod } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
try {
  const path = "/etc/taskpilot/pilot.env";
  const original = await readFile(path, "utf8");
  const line = original.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw Error();
  const admin = new URL(line.slice("DATABASE_URL=".length));
  if (admin.username === "taskpilot_runtime") {
    await readFile("/etc/taskpilot/migration.env");
    console.log("Runtime database role already separated.");
  } else {
    if (
      admin.username !== "taskpilot" ||
      admin.hostname !== "127.0.0.1" ||
      admin.port !== "15488" ||
      admin.pathname !== "/taskpilot_pilot"
    )
      throw Error();
    const password = randomBytes(32).toString("base64url");
    const sql = `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='taskpilot_runtime') THEN CREATE ROLE taskpilot_runtime; END IF; END $$;
ALTER ROLE taskpilot_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}';`;
    await new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          "taskpilot-db",
          "psql",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "taskpilot",
          "-d",
          "taskpilot_pilot",
        ],
        { stdio: ["pipe", "ignore", "ignore"] },
      );
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(Error())));
      child.stdin.end(sql);
    });
    await writeFile("/etc/taskpilot/migration.env", line + "\n", {
      mode: 0o600,
    });
    await chmod("/etc/taskpilot/migration.env", 0o600);
    admin.username = "taskpilot_runtime";
    admin.password = password;
    await writeFile(
      path,
      original.replace(line, "DATABASE_URL=" + admin.toString()),
      { mode: 0o640 },
    );
    console.log(
      "Runtime database role separated; migration credential remains root-only.",
    );
  }
} catch {
  console.error("RUNTIME_ROLE_SETUP_FAILED");
  process.exitCode = 1;
}
