import { createHash } from "node:crypto";

export const policyHash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export interface SendingState {
  phase: "COMMITTED" | "PENDING" | "INVALID";
  operationId: string | null;
  enabled: boolean;
  ready: boolean;
  recoveryRequired: boolean;
}
// Read at approval and immediately before each transport call, never cached across a change.
export class CommittedSendingPolicy {
  constructor(
    private connectionAllowed: boolean,
    private env: () => string,
    private journal: () => string,
  ) {}
  current(): SendingState {
    const invalid: SendingState = {
      phase: "INVALID",
      operationId: null,
      enabled: false,
      ready: false,
      recoveryRequired: true,
    };
    try {
      const env = this.env(),
        text = this.journal();
      if (Buffer.byteLength(env) > 65536 || Buffer.byteLength(text) > 4096)
        return invalid;
      const policy = parseSendingPolicy(env),
        state = JSON.parse(text);
      if (
        !state ||
        state.version !== 1 ||
        !["COMMITTED", "PENDING"].includes(state.phase) ||
        !/^[a-f0-9-]{36}$/.test(state.operationId) ||
        typeof state.enabled !== "boolean" ||
        !/^[a-f0-9]{64}$/.test(state.envHash)
      )
        return invalid;
      if (state.phase === "PENDING")
        return {
          phase: "PENDING",
          operationId: state.operationId,
          enabled: false,
          ready: true,
          recoveryRequired: true,
        };
      if (state.envHash !== policyHash(env) || state.enabled !== policy.sending)
        return invalid;
      return {
        phase: "COMMITTED",
        operationId: state.operationId,
        enabled: this.connectionAllowed && policy.connection && policy.sending,
        ready: true,
        recoveryRequired: false,
      };
    } catch {
      return invalid;
    }
  }
}

// Only these two literal booleans may affect the live sending gate.
export function parseSendingPolicy(text: string) {
  function value(key: string) {
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith(key + "="));
    if (
      lines.length !== 1 ||
      ![key + "=true", key + "=false"].includes(lines[0]!)
    )
      throw Error("SENDING_POLICY_INVALID");
    return lines[0] === key + "=true";
  }
  return {
    connection: value("WHATSAPP_CONNECTION_ENABLED"),
    sending: value("WHATSAPP_SENDING_ENABLED"),
  };
}
export function replaceSendingPolicy(text: string, enabled: boolean) {
  parseSendingPolicy(text);
  return text.replace(
    /^WHATSAPP_SENDING_ENABLED=(true|false)(?=\r?$)/m,
    "WHATSAPP_SENDING_ENABLED=" + enabled,
  );
}

// A failed ACK is not evidence of a successful change. Never roll back to true.
export async function applySendingPolicy(
  enabled: boolean,
  io: {
    prepare?: (value: boolean) => Promise<void>;
    write: (value: boolean) => Promise<void>;
    authorize?: (value: boolean) => Promise<void>;
    commit?: (value: boolean) => Promise<void>;
    signal: () => Promise<void>;
    verify: (value: boolean) => Promise<boolean>;
    stop: () => Promise<void>;
  },
) {
  try {
    await io.prepare?.(enabled);
    await io.write(enabled);
    await io.authorize?.(enabled);
    await io.commit?.(enabled);
    await io.signal();
    if (!(await io.verify(enabled))) throw Error();
    return;
  } catch {
    try {
      await io.prepare?.(false);
      await io.write(false);
      await io.commit?.(false);
      await io.signal();
      if (await io.verify(false))
        throw Error("SENDING_POLICY_DISABLED_AFTER_FAILURE");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "SENDING_POLICY_DISABLED_AFTER_FAILURE"
      )
        throw error;
    }
    await io.stop();
    throw Error("SENDING_POLICY_SERVICE_STOPPED");
  }
}
