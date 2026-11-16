import { readFile } from "node:fs/promises";
import { createPool } from "./db.js";
import {
  issueClientSession,
  issueClientReauth,
  tailscaleAddress,
} from "./client-sessions.js";
// This CLI is reachable through an already-authenticated SSH channel, never through HTTP.
// It never reads/exports the permanent owner API or reauthentication keys.
if (process.getuid?.() !== 0) throw new Error("LOCAL_ROOT_REQUIRED");
const lines = (await readFile("/etc/taskpilot/pilot.env", "utf8")).split("\n");
const db = lines.find((l) => l.startsWith("DATABASE_URL="))?.slice(13);
if (!db) throw new Error("DATABASE_CONFIGURATION_REQUIRED");
const pool = createPool(db);
try {
  const mode = process.argv[2];
  if (mode === "--reauth") {
    const id = process.argv[3];
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_SESSION");
    process.stdout.write(JSON.stringify(await issueClientReauth(pool, id)));
  } else if (mode === undefined) {
    process.stdout.write(JSON.stringify(await issueClientSession(pool)));
  } else if (
    (mode === "--persistent" || mode === "--connection-info") &&
    process.argv.length === 3
  ) {
    const profile = JSON.parse(
      await readFile("/etc/taskpilot/desktop-connection.json", "utf8"),
    );
    const address = tailscaleAddress(profile.address);
    process.stdout.write(
      JSON.stringify(
        mode === "--connection-info"
          ? { address }
          : await issueClientSession(pool, address),
      ),
    );
  } else throw Error("INVALID_MODE");
} catch {
  process.stderr.write("CLIENT_SESSION_ISSUANCE_FAILED\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
