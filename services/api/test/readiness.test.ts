import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { waitForHealth } from "../src/readiness.js";

test("deploy health wait tolerates startup/old version but rejects an unready release within a bound", async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    if (requests === 1) {
      response.writeHead(503).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        status: "ok",
        version: requests === 2 ? "old" : "synthetic-new",
        provider: "mock",
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port;
    await waitForHealth(base, "synthetic-new", 2000, 5);
    assert.ok(requests >= 3);
    await assert.rejects(waitForHealth(base, "never-ready", 100, 5), {
      message: "PILOT_READINESS_TIMEOUT",
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
