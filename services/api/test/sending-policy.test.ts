import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSendingPolicy,
  replaceSendingPolicy,
  applySendingPolicy,
  SendingPolicyReloader,
} from "../src/sending-policy.js";
const config =
  "OTHER=synthetic-canary$literal\r\nWHATSAPP_CONNECTION_ENABLED=true\r\nWHATSAPP_SENDING_ENABLED=false\r\n";

test("sending policy changes only a single literal flag and rejects ambiguous configuration", () => {
  assert.deepEqual(parseSendingPolicy(config), {
    connection: true,
    sending: false,
  });
  assert.equal(
    replaceSendingPolicy(config, true),
    config.replace("SENDING_ENABLED=false", "SENDING_ENABLED=true"),
  );
  for (const text of [
    config + "WHATSAPP_SENDING_ENABLED=true\n",
    config.replace("=false", "=1"),
    config.replace("=false", "=false "),
    config.replace("WHATSAPP_CONNECTION_ENABLED=true\r\n", ""),
  ])
    assert.throws(() => parseSendingPolicy(text));
});
test("reload disables first, rejects stale reads, and cannot enable an unauthorized connection", async () => {
  const pending: Array<(value: string) => void> = [],
    changes: boolean[] = [];
  const gate = new SendingPolicyReloader(
    true,
    () => new Promise((r) => pending.push(r)),
    (value) => changes.push(value),
  );
  const first = gate.reload(),
    second = gate.reload();
  assert.deepEqual(changes, [false, false]);
  pending[1]!(config);
  await second;
  pending[0]!(replaceSendingPolicy(config, true));
  await first;
  assert.deepEqual(changes, [false, false, false]);
  assert.equal(gate.ready, true);
  const disabled = new SendingPolicyReloader(
    false,
    async () => replaceSendingPolicy(config, true),
    (value) => changes.push(value),
  );
  await disabled.reload();
  assert.equal(changes.at(-1), false);
  const invalid = new SendingPolicyReloader(
    true,
    async () => "broken",
    (value) => changes.push(value),
  );
  await invalid.reload();
  assert.equal(invalid.ready, false);
  assert.equal(changes.at(-1), false);
});
test("policy writes and signal/ACK failures fall back to false or stop only the owned service", async () => {
  for (const fault of ["none", "write", "signal", "ack", "recovery"]) {
    const calls: string[] = [];
    let writes = 0;
    const io = {
      async write(value: boolean) {
        calls.push("write:" + value);
        writes++;
        if (fault === "write" && writes === 1) throw Error();
      },
      async signal() {
        calls.push("signal");
        if (fault === "signal" && writes === 1) throw Error();
      },
      async verify(value: boolean) {
        calls.push("verify:" + value);
        return fault !== "recovery" && !(fault === "ack" && value);
      },
      async stop() {
        calls.push("stop:taskpilot");
      },
    };
    if (fault === "none") {
      await applySendingPolicy(true, io);
      assert.deepEqual(calls, ["write:true", "signal", "verify:true"]);
    } else {
      await assert.rejects(
        applySendingPolicy(true, io),
        new RegExp(
          fault === "recovery" ? "SERVICE_STOPPED" : "DISABLED_AFTER_FAILURE",
        ),
      );
      assert.ok(calls.includes("write:false"));
      assert.equal(calls.filter((x) => x === "write:true").length, 1);
      assert.equal(calls.includes("stop:taskpilot"), fault === "recovery");
    }
  }
});
