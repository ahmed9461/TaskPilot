import test from "node:test";
import assert from "node:assert/strict";
import type pg from "pg";
import { isRetryableDatabaseError, transaction } from "../src/db.js";

test("database retry classification separates infrastructure failures from poison data", () => {
  for (const code of [
    "08006",
    "08P01",
    "40001",
    "40P01",
    "53300",
    "55P03",
    "57014",
    "57P01",
    "57P02",
    "57P03",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENETUNREACH",
    "EHOSTUNREACH",
  ])
    assert.equal(
      isRetryableDatabaseError(Object.assign(new Error(), { code })),
      true,
      code,
    );
  for (const message of [
    "Connection terminated",
    "Connection terminated unexpectedly",
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
  ])
    assert.equal(isRetryableDatabaseError(new Error(message)), true);
  for (const error of [
    null,
    undefined,
    "57014",
    new Error("invalid ciphertext"),
    { code: "23505" },
    { code: "42501" },
    { code: "42601" },
    { code: "CREDENTIAL_CONFLICT" },
    { code: "UNKNOWN_DELIVERY" },
    { message: "synthetic unknown failure" },
  ])
    assert.equal(isRetryableDatabaseError(error), false);
});

for (const rollbackFails of [false, true]) {
  test(`transaction preserves original failure and ${rollbackFails ? "discards a broken" : "returns a healthy"} client`, async () => {
    const original = Object.assign(new Error("synthetic transaction failure"), {
      code: "40001",
    });
    const calls: string[] = [],
      releases: unknown[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql === "ROLLBACK" && rollbackFails)
          throw new Error("synthetic broken connection");
      },
      release(error: unknown) {
        releases.push(error);
      },
    };
    const pool = {
      async connect() {
        return client;
      },
    } as unknown as pg.Pool;
    await assert.rejects(
      transaction(pool, async () => {
        throw original;
      }),
      (error) => error === original,
    );
    assert.deepEqual(calls, ["BEGIN", "ROLLBACK"]);
    assert.deepEqual(releases, [rollbackFails]);
  });
}
