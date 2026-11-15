import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSendingPolicy,
  replaceSendingPolicy,
  applySendingPolicy,
  CommittedSendingPolicy,
  policyHash,
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
test("only a matching durable commit enables the gate, including a fresh process view", () => {
  let env = config,
    journal = "";
  const id = "11111111-1111-4111-8111-111111111111";
  const gate = new CommittedSendingPolicy(
    true,
    () => env,
    () => journal,
  );
  assert.equal(gate.current().enabled, false);
  env = replaceSendingPolicy(config, true);
  journal = JSON.stringify({
    version: 1,
    phase: "PENDING",
    operationId: id,
    enabled: true,
    envHash: policyHash(config),
  });
  assert.equal(gate.current().recoveryRequired, true);
  assert.equal(gate.current().enabled, false);
  assert.equal(
    new CommittedSendingPolicy(
      true,
      () => env,
      () => journal,
    ).current().enabled,
    false,
  );
  journal = JSON.stringify({
    version: 1,
    phase: "COMMITTED",
    operationId: id,
    enabled: true,
    envHash: policyHash(env),
  });
  assert.equal(gate.current().enabled, true);
  assert.equal(
    new CommittedSendingPolicy(
      false,
      () => env,
      () => journal,
    ).current().enabled,
    false,
  );
  env += "UNRELATED=changed\n";
  assert.equal(gate.current().phase, "INVALID");
  assert.equal(gate.current().enabled, false);
  journal = "broken";
  assert.equal(gate.current().enabled, false);
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
