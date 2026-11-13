import test from "node:test";
import assert from "node:assert/strict";
import {
  textEvent,
  inspectTextEvent,
  packetFlags,
  baileysFactory,
} from "../src/whatsapp/socket.js";
import { WhatsAppConnector } from "../src/whatsapp/connector.js";
import { Vault } from "../src/security.js";
import { randomBytes } from "node:crypto";

test("WhatsApp ingress accepts only new incoming direct group text", () => {
  const base = {
    key: {
      id: "fixture",
      remoteJid: "123-456@g.us",
      participant: "123@lid",
      fromMe: false,
    },
    messageTimestamp: 100,
    message: { conversation: "name: Synthetic\nuser: synthetic" },
  };
  assert.equal(textEvent(base, 100)?.key.id, "fixture");
  for (const key of [
    { ...base.key, fromMe: true },
    { ...base.key, fromMe: undefined },
    { ...base.key, remoteJid: "123@s.whatsapp.net" },
    { ...base.key, remoteJid: "status@broadcast" },
    { ...base.key, participant: undefined },
    { ...base.key, id: "x".repeat(201) },
  ])
    assert.equal(textEvent({ ...base, key }, 100), null);
  for (const message of [
    { imageMessage: { caption: "user: synthetic" } },
    { ephemeralMessage: { message: base.message } },
    { viewOnceMessage: { message: base.message } },
    { protocolMessage: { editedMessage: base.message } },
    {
      extendedTextMessage: {
        text: "synthetic",
        contextInfo: { expiration: 60 },
      },
    },
    { conversation: "x".repeat(16001) },
    { conversation: " " },
  ])
    assert.equal(textEvent({ ...base, message }, 100), null);
  assert.equal(textEvent(base, 101), null);
  assert.equal(textEvent(null, 0), null);
});

test("SDK text with sender-key metadata is accepted without retaining key material", async () => {
  const { proto } = await import("baileys");
  const message = proto.Message.decode(
    proto.Message.encode(
      proto.Message.fromObject({
        conversation: "name: Synthetic\nuser: synthetic-metadata",
        senderKeyDistributionMessage: {
          groupId: "123-456@g.us",
          axolotlSenderKeyDistributionMessage: Buffer.from([1, 2, 3]),
        },
      }),
    ).finish(),
  );
  const base = {
    key: {
      id: "metadata-fixture",
      remoteJid: "123-456@g.us",
      participant: "123@lid",
      fromMe: false,
    },
    messageTimestamp: 100,
    message,
  };
  const result = inspectTextEvent(base, 100);
  const legacyKeys = [
    "conversation",
    "extendedTextMessage",
    "messageContextInfo",
  ];
  assert.equal(
    Object.keys(message).some(
      (k) => (message as any)[k] != null && !legacyKeys.includes(k),
    ),
    true,
  );
  assert.equal(packetFlags(base), 3);
  assert.equal(result.reason, "ACCEPTED_TEXT");
  assert.equal(result.item?.text, message.conversation);
  assert.equal(JSON.stringify(result).includes("axolotl"), false);
  assert.equal(
    textEvent(
      {
        ...base,
        message: {
          ...message,
          viewOnceMessage: { message: { conversation: "synthetic" } },
        },
      },
      100,
    ),
    null,
  );
  assert.equal(
    textEvent(
      {
        ...base,
        message: {
          senderKeyDistributionMessage: message.senderKeyDistributionMessage,
        },
      },
      100,
    ),
    null,
  );
  assert.equal(
    inspectTextEvent({ ...base, message: undefined }, 100).reason,
    "NO_CONTENT",
  );
  assert.equal(
    inspectTextEvent({ ...base, key: { ...base.key, fromMe: true } }, 100)
      .reason,
    "FROM_SELF",
  );
});

test("disabled live policy never touches DB or constructs a socket", async () => {
  let imports = 0;
  const c = new WhatsAppConnector(
    {} as any,
    new Vault(randomBytes(32).toString("base64")),
    { connectionEnabled: false, sendingEnabled: false },
    async () => {
      imports++;
      throw Error("must not load");
    },
  );
  await c.restore();
  await assert.rejects(c.connect("fixture"), /LIVE_WHATSAPP_NOT_AUTHORIZED/);
  await assert.rejects(c.pairing("fixture"), /LIVE_WHATSAPP_NOT_AUTHORIZED/);
  assert.equal(imports, 0);
  assert.equal(c.canSend("fixture"), false);
  assert.throws(
    () =>
      new WhatsAppConnector({} as any, {} as any, {
        connectionEnabled: false,
        sendingEnabled: true,
      }),
    /SENDING_REQUIRES_CONNECTION_APPROVAL/,
  );
});

test("pinned real SDK imports and serializes auth offline without creating any socket", async () => {
  const factory = await baileysFactory();
  const creds = factory.codec.fresh();
  const restored = factory.codec.decode(factory.codec.encode(creds));
  assert.equal(restored.registered, false);
  assert.ok(Buffer.isBuffer(restored.noiseKey.private));
  assert.deepEqual(restored.noiseKey.private, creds.noiseKey.private);
  const key = factory.codec.appKey({ keyData: Buffer.from([1, 2, 3]) });
  assert.deepEqual(Buffer.from(key.keyData!), Buffer.from([1, 2, 3]));
});
