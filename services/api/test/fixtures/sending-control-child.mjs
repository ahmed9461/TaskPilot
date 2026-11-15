// Parent may SIGKILL this owned child at a durable checkpoint. No real service calls.
import { readFileSync } from "node:fs";
import { executeSendingPolicy } from "../../../../ops/sending-policy-core.mjs";
import { CommittedSendingPolicy } from "../../../../dist/services/api/src/sending-policy.js";
process.once(
  "message",
  async ({ input, envPath, directory, statePath, killAt }) => {
    const gate = new CommittedSendingPolicy(
      true,
      () => readFileSync(envPath, "utf8"),
      () => readFileSync(statePath, "utf8"),
    );
    try {
      const result = await executeSendingPolicy(input, {
        envPath,
        directory,
        statePath,
        owner: process.getuid(),
        health: async () => ({ version: 2, ...gate.current() }),
        async signal() {},
        async stop() {
          throw Error("SYNTHETIC_SERVICE_STOP");
        },
        async checkpoint(stage) {
          if (stage === killAt) {
            process.send({ stage });
            await new Promise(() => {});
          }
        },
      });
      process.send({ completed: true, enabled: result.enabled });
    } catch {
      process.send({ failed: true });
    }
  },
);
