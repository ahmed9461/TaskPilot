import { readFile } from "node:fs/promises";
import { waitForHealth } from "../dist/services/api/src/readiness.js";
try {
  const { version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  await waitForHealth("http://127.0.0.1:8240", version);
  console.log(JSON.stringify({ readiness: "PASS", version, provider: "mock" }));
} catch {
  console.error("PILOT_READINESS_TIMEOUT");
  process.exitCode = 1;
}
