import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("live service discards provider console streams and forbids process core dumps", () => {
  const unit = readFileSync("ops/taskpilot.service", "utf8");
  const entries = new Map(
    unit
      .split(/\r?\n/)
      .filter((l) => !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  assert.equal(entries.get("StandardOutput"), "null");
  assert.equal(entries.get("StandardError"), "null");
  assert.equal(entries.get("LimitCORE"), "0");
  assert.equal(entries.get("UMask"), "0077");
  assert.equal(entries.get("User"), "taskpilot");
});
