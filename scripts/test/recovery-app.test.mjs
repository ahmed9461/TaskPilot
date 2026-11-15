import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { verifyRecoveredApp } from "../recovery-app.mjs";

async function bundle(t) {
  const root = await mkdtemp(join(tmpdir(), "taskpilot-recovery-check-"));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.match(basename(root), /^taskpilot-recovery-check-/);
    await rm(root, { recursive: true, force: true });
  });
  for (const dir of ["node_modules", "dist/services/api/src", "ops"])
    await mkdir(join(root, "app", dir), { recursive: true });
  for (const file of [
    "dist/services/api/src/app.js",
    "ops/recovery-api-check.mjs",
  ])
    await writeFile(join(root, "app", file), "// synthetic placeholder");
  return root;
}
const database = {
  HostConfig: { NetworkMode: "none", PortBindings: {} },
  Config: { Labels: { "com.taskpilot.purpose": "offhost-recovery" } },
  State: { Running: true },
};

test("recovery refuses reachable, published, unowned or stopped DB before transferring a key", async (t) => {
  const root = await bundle(t);
  const cases = [
    {
      ...database,
      HostConfig: { ...database.HostConfig, NetworkMode: "bridge" },
    },
    {
      ...database,
      HostConfig: {
        ...database.HostConfig,
        PortBindings: { "5432/tcp": [{}] },
      },
    },
    { ...database, Config: { Labels: {} } },
    { ...database, State: { Running: false } },
  ];
  for (const state of cases) {
    let calls = 0;
    await assert.rejects(
      verifyRecoveredApp({
        root,
        container: "a".repeat(64),
        encryptionKey: "synthetic-canary",
        run: async (_file, args, input) => {
          calls++;
          assert.deepEqual(args, ["inspect", "a".repeat(64)]);
          assert.equal(input, undefined);
          return Buffer.from(JSON.stringify([state]));
        },
      }),
      /ISOLATED_DATABASE_REQUIRED/,
    );
    assert.equal(calls, 1);
  }
});

test("failed app command cleans only its labelled UUID container and wipes private stdin", async (t) => {
  const root = await bundle(t),
    calls = [],
    ownId = "b".repeat(64);
  let sentInput, name;
  await assert.rejects(
    verifyRecoveredApp({
      root,
      container: "a".repeat(64),
      encryptionKey: "synthetic-canary",
      run: async (_file, args, input) => {
        calls.push(args[0]);
        assert.equal(args.join(" ").includes("synthetic-canary"), false);
        if (args[0] === "inspect")
          return Buffer.from(JSON.stringify([database]));
        if (args[0] === "run") {
          name = args[args.indexOf("--name") + 1];
          assert.match(name, /^taskpilot-recovery-app-[a-f0-9-]{36}$/);
          assert.equal(
            JSON.parse(input.toString()).encryptionKey,
            "synthetic-canary",
          );
          sentInput = input;
          throw Error("SYNTHETIC_DOCKER_CLI_TIMEOUT");
        }
        if (args[0] === "ps") {
          assert.ok(args.includes("name=^" + name + "$"));
          assert.ok(
            args.includes("label=com.taskpilot.purpose=offhost-app-recovery"),
          );
          return Buffer.from(ownId);
        }
        assert.deepEqual(args, ["rm", "-f", ownId]);
        return Buffer.alloc(0);
      },
    }),
    /SYNTHETIC_DOCKER_CLI_TIMEOUT/,
  );
  assert.deepEqual(calls, ["inspect", "run", "ps", "rm"]);
  assert.ok(sentInput.every((byte) => byte === 0));
});
