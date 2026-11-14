import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { createApp } from "../src/app.js";

const expected = JSON.parse(
  await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
).version;
for (const variant of ["source", "built"]) {
  test(`${variant} API health reports the actual release version without a database`, async () => {
    const factory =
      variant === "source"
        ? createApp
        : ((
            await import(
              new URL("../../../dist/services/api/src/app.js", import.meta.url)
                .href
            )
          ).createApp as typeof createApp);
    const app = await factory({} as pg.Pool, {
      apiToken: randomBytes(32).toString("hex"),
      reauthSecret: randomBytes(32).toString("hex"),
      encryptionKey: randomBytes(32).toString("base64"),
      mockEnabled: true,
    });
    try {
      const response = await app.inject({ url: "/health" });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        status: "ok",
        version: expected,
        provider: "mock",
      });
    } finally {
      await app.close();
    }
  });
}
