import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { createApp } from "../src/app.js";

for (const mockEnabled of [false, true])
  test(`workspace advertises mock policy ${mockEnabled}; personal mode rejects fixture creation before DB access`, async () => {
    let queries = 0;
    const pool = {
      query: async () => {
        queries++;
        throw Error("UNEXPECTED_DATABASE_ACCESS");
      },
    } as unknown as pg.Pool;
    const config = {
      apiToken: randomBytes(32).toString("hex"),
      reauthSecret: randomBytes(32).toString("hex"),
      encryptionKey: randomBytes(32).toString("base64"),
      mockEnabled,
    };
    const app = await createApp(pool, config);
    try {
      const headers = { authorization: `Bearer ${config.apiToken}` };
      const me = await app.inject({ method: "GET", url: "/v1/me", headers });
      assert.equal(me.statusCode, 200);
      assert.equal(me.json().mockEnabled, mockEnabled);
      if (!mockEnabled)
        for (const [url, payload] of [
          ["/v1/sessions", { label: "Synthetic disabled", provider: "mock" }],
          ["/v1/mock/messages", {}],
        ] as const) {
          const result = await app.inject({
            method: "POST",
            url,
            headers,
            payload,
          });
          assert.equal(result.statusCode, 403);
          assert.equal(result.json().code, "MOCK_DISABLED");
        }
      assert.equal(queries, 0);
    } finally {
      await app.close();
    }
  });
