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
    write: (value: boolean) => Promise<void>;
    signal: () => Promise<void>;
    verify: (value: boolean) => Promise<boolean>;
    stop: () => Promise<void>;
  },
) {
  try {
    await io.write(enabled);
    await io.signal();
    if (!(await io.verify(enabled))) throw Error();
    return;
  } catch {
    try {
      await io.write(false);
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

export class SendingPolicyReloader {
  private generation = 0;
  ready = false;
  constructor(
    private connectionAllowed: boolean,
    private read: () => Promise<string>,
    private set: (enabled: boolean) => void,
  ) {}
  async reload() {
    const mine = ++this.generation;
    this.ready = false;
    this.set(false);
    try {
      const parsed = parseSendingPolicy(await this.read());
      if (mine !== this.generation) return;
      this.set(this.connectionAllowed && parsed.connection && parsed.sending);
      this.ready = true;
    } catch {
      /* Receiving remains available; sending stays disabled. */
    }
  }
}
