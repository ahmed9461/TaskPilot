import type {
  AuthenticationState,
  AuthenticationCreds,
  WAMessage,
} from "baileys";
import type { AuthCodec } from "./auth-store.js";
export interface QuoteKey {
  id: string;
  remoteJid: string;
  participant?: string;
  fromMe: false;
}
export interface IncomingText {
  key: QuoteKey;
  text: string;
  timestamp: number;
}
export interface SocketUpdate {
  connection?: "open" | "close";
  qr?: string;
  code?: number;
}
export interface LiveSocket {
  onUpdate(fn: (u: SocketUpdate) => void): void;
  onCreds(fn: (u: Partial<AuthenticationCreds>) => void): void;
  onMessages(fn: (messages: unknown[], type: string) => void): void;
  groups(): Promise<{ id: string; title: string }[]>;
  send(
    jid: string,
    text: string,
    key: QuoteKey,
    messageId: string,
  ): Promise<string>;
  end(): Promise<void>;
}
export interface SocketFactory {
  codec: AuthCodec;
  create(auth: AuthenticationState): LiveSocket;
}

// Conservative allowlist: text only; no private/self/history/media/edited/ephemeral/view-once content.
export type ReceiveReason =
  | "ACCEPTED_TEXT"
  | "INVALID_KEY"
  | "NO_CONTENT"
  | "FROM_SELF"
  | "STALE_TIMESTAMP"
  | "UNSUPPORTED_CONTENT"
  | "EXPIRING_CONTENT"
  | "INVALID_TEXT";
export function inspectTextEvent(
  raw: unknown,
  since: number,
): {
  item: IncomingText | null;
  reason: ReceiveReason;
} {
  const m = raw as Partial<WAMessage> | null;
  const key = m?.key,
    content = m?.message;
  const timestamp = Number(m?.messageTimestamp);
  if (
    !key ||
    typeof key.id !== "string" ||
    !key.id ||
    key.id.length > 200 ||
    typeof key.remoteJid !== "string" ||
    !/^\d[\d-]*@g\.us$/.test(key.remoteJid) ||
    typeof key.participant !== "string" ||
    !/^\d+(?::\d+)?@(lid|s\.whatsapp\.net)$/.test(key.participant) ||
    !Number.isFinite(timestamp)
  )
    return { item: null, reason: "INVALID_KEY" };
  if (key.fromMe !== false) return { item: null, reason: "FROM_SELF" };
  if (!content) return { item: null, reason: "NO_CONTENT" };
  if (timestamp < since) return { item: null, reason: "STALE_TIMESTAMP" };
  const keys = Object.keys(content).filter(
    (k) => content[k as keyof typeof content] != null,
  );
  if (
    keys.some(
      (k) =>
        ![
          "conversation",
          "extendedTextMessage",
          "messageContextInfo",
          "senderKeyDistributionMessage",
        ].includes(k),
    )
  )
    return { item: null, reason: "UNSUPPORTED_CONTENT" };
  if ((content.extendedTextMessage?.contextInfo?.expiration ?? 0) > 0)
    return { item: null, reason: "EXPIRING_CONTENT" };
  const text = content.conversation ?? content.extendedTextMessage?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 16000)
    return { item: null, reason: "INVALID_TEXT" };
  return {
    reason: "ACCEPTED_TEXT",
    item: {
      key: {
        id: key.id,
        remoteJid: key.remoteJid,
        participant: key.participant,
        fromMe: false,
      },
      text,
      timestamp,
    },
  };
}
export function textEvent(raw: unknown, since: number): IncomingText | null {
  return inspectTextEvent(raw, since).item;
}
// Fixed shape bits only. Never serialize arbitrary content keys or values.
export function packetFlags(raw: unknown): number {
  const m = raw as Partial<WAMessage> | null,
    c = m?.message;
  if (!c) return m?.messageStubType != null ? 128 : 0;
  let bits = 0;
  if (
    typeof c.conversation === "string" ||
    typeof c.extendedTextMessage?.text === "string"
  )
    bits |= 1;
  if (c.senderKeyDistributionMessage) bits |= 2;
  if (c.messageContextInfo) bits |= 4;
  if (c.ephemeralMessage) bits |= 8;
  if (c.viewOnceMessage || c.viewOnceMessageV2 || c.viewOnceMessageV2Extension)
    bits |= 16;
  if (c.protocolMessage) bits |= 32;
  if (
    Object.keys(c).some(
      (k) =>
        c[k as keyof typeof c] != null &&
        ![
          "conversation",
          "extendedTextMessage",
          "senderKeyDistributionMessage",
          "messageContextInfo",
          "ephemeralMessage",
          "viewOnceMessage",
          "viewOnceMessageV2",
          "viewOnceMessageV2Extension",
          "protocolMessage",
        ].includes(k),
    )
  )
    bits |= 64;
  if (m?.messageStubType != null) bits |= 128;
  return bits;
}

// This is the only runtime import/socket construction boundary for the real library.
export async function baileysFactory(): Promise<SocketFactory> {
  const [
    { default: makeSocket, initAuthCreds, BufferJSON, proto },
    { default: pino },
  ] = await Promise.all([import("baileys"), import("pino")]);
  const codec: AuthCodec = {
    fresh: initAuthCreds,
    encode: (v) => JSON.stringify(v, BufferJSON.replacer),
    decode: (v) => JSON.parse(v, BufferJSON.reviver),
    appKey: (v) => proto.Message.AppStateSyncKeyData.fromObject(v as object),
  };
  return {
    codec,
    create: (auth) => {
      const socket = makeSocket({
        auth,
        connectTimeoutMs: 15000,
        defaultQueryTimeoutMs: 15000,
        logger: pino({ level: "silent" }),
        markOnlineOnConnect: false,
        emitOwnEvents: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: (jid) => !jid.endsWith("@g.us"),
        maxMsgRetryCount: 0,
        enableRecentMessageCache: false,
        getMessage: async () => undefined,
      });
      return {
        onUpdate: (fn) =>
          socket.ev.on("connection.update", (u) =>
            fn({
              connection:
                u.connection === "open" || u.connection === "close"
                  ? u.connection
                  : undefined,
              qr: u.qr,
              code: (
                u.lastDisconnect?.error as { output?: { statusCode?: number } }
              )?.output?.statusCode,
            }),
          ),
        onCreds: (fn) => socket.ev.on("creds.update", fn),
        onMessages: (fn) =>
          socket.ev.on("messages.upsert", (u) => fn(u.messages, u.type)),
        groups: async () =>
          Object.values(await socket.groupFetchAllParticipating()).map((g) => ({
            id: g.id,
            title: g.subject,
          })),
        send: async (jid, text, key, messageId) => {
          const result = await socket.sendMessage(
            jid,
            { text, linkPreview: null },
            {
              messageId,
              quoted: {
                key,
                message: { conversation: "رسالة مصدر TaskPilot" },
              },
            },
          );
          if (!result?.key.id) throw new Error("RELAY_RESULT_UNKNOWN");
          return result.key.id;
        },
        end: async () => socket.end(new Error("TASKPILOT_STOP")),
      };
    },
  };
}
