import test from "node:test";
import assert from "node:assert/strict";
import { tailscaleAddress } from "../src/client-sessions.js";
import {
  notificationTypes,
  notificationDetails,
} from "../src/notification-catalog.js";
test("persistent desktop endpoint is tailnet HTTPS with no injected routing", () => {
  assert.equal(
    tailscaleAddress("https://synthetic.example.ts.net:9443/"),
    "https://synthetic.example.ts.net:9443",
  );
  for (const value of [
    undefined,
    "http://synthetic.ts.net:9443",
    "https://example.invalid:9443",
    "https://synthetic.ts.net",
    "https://user:secret@synthetic.ts.net:9443",
    "https://synthetic.ts.net:9443/path",
    "https://synthetic.ts.net:9443/?x=1",
    "https://synthetic.ts.net:9443/#x",
  ])
    assert.throws(() => tailscaleAddress(value));
});
test("notification catalog contains work outcomes, never technical session/audit events", () => {
  for (const type of [
    "CLIENT_SESSION_CREATED",
    "CLIENT_DEVICE_CREATED",
    "CLIENT_SESSION_REVOKED",
    "REPORT_EXPORTED",
    "REVIEW_REVEALED",
    "ACCOUNT_UPDATED",
    "__proto__",
  ])
    assert.equal(notificationDetails(type), null);
  for (const type of [
    "MESSAGE_PROCESSED",
    "MESSAGE_MISSING_FIELDS",
    "AI_SUGGESTION_READY",
    "REPLY_SENT",
    "REPLY_FAILED",
    "REPLY_DELIVERY_UNKNOWN",
  ]) {
    assert(notificationTypes.includes(type));
    const info = notificationDetails(type)!;
    assert(info.title && info.detail && info.destination);
  }
});
