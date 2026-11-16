import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createPool, event, transaction } from "../../src/db.js";
import { migrate } from "../../src/migrate.js";
import { createApp } from "../../src/app.js";
import {
  issueClientSession,
  issueClientReauth,
} from "../../src/client-sessions.js";
const url = process.env.TASKPILOT_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw Error("DEDICATED_TEST_DATABASE_REQUIRED");
test("persistent desktop auth and user notification separation", async (t) => {
  await migrate(url);
  const pool = createPool(url);
  await pool.query(
    "TRUNCATE whatsapp_sessions,task_types,accounts,source_messages,reply_templates,approvals,client_sessions,notifications,audit_events CASCADE",
  );
  const config = {
    apiToken: randomBytes(32).toString("hex"),
    reauthSecret: randomBytes(32).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
    mockEnabled: false,
  };
  let app = await createApp(pool, config);
  const device = await issueClientSession(
    pool,
    "https://synthetic.ts.net:9443",
  );
  const auth = { authorization: "Bearer " + device.token };
  const owner = { authorization: "Bearer " + config.apiToken };
  try {
    await t.test(
      "per-device token is hashed, non-expiring and not a permanent owner key",
      async () => {
        assert.equal(device.expiresAt, null);
        assert.equal(device.persistent, true);
        const row = (
          await pool.query(
            "SELECT token_hash,expires_at::text expiry FROM client_sessions WHERE id=$1",
            [device.id],
          )
        ).rows[0];
        assert.equal(row.expiry, "infinity");
        assert.notEqual(row.token_hash, device.token);
        assert.notEqual(device.token, config.apiToken);
        assert.equal(
          (await app.inject({ url: "/v1/me", headers: auth })).statusCode,
          200,
        );
        assert.equal((await app.inject({ url: "/v1/me" })).statusCode, 401);
      },
    );
    await t.test(
      "restart and elapsed days retain the same authorized device",
      async () => {
        await pool.query(
          "UPDATE client_sessions SET created_at=now()-interval '40 days' WHERE id=$1",
          [device.id],
        );
        await app.close();
        app = await createApp(pool, config);
        assert.equal(
          (await app.inject({ url: "/v1/me", headers: auth })).statusCode,
          200,
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::int n FROM client_sessions WHERE id=$1",
              [device.id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "sensitive approval still consumes a short single-use reauth grant",
      async () => {
        const payload = {
          approvalToken: randomBytes(32).toString("hex"),
          idempotencyKey: randomUUID(),
        };
        const request = (grant?: string) =>
          app.inject({
            method: "POST",
            url: "/v1/reply-jobs/approve",
            headers: {
              ...auth,
              ...(grant ? { "x-reauth-secret": grant } : {}),
            },
            payload,
          });
        assert.equal((await request()).statusCode, 403);
        const grant = await issueClientReauth(pool, device.id);
        assert(Date.parse(grant.expiresAt) <= Date.now() + 61000);
        assert.equal((await request(grant.grant)).statusCode, 409); // passes reauth; fake approval does not exist
        assert.equal((await request(grant.grant)).statusCode, 403);
        const expired = await issueClientReauth(pool, device.id);
        await pool.query(
          "UPDATE client_sessions SET reauth_expires_at=now()-interval '1 second' WHERE id=$1",
          [device.id],
        );
        assert.equal((await request(expired.grant)).statusCode, 403);
      },
    );
    await t.test(
      "technical changes remain in audit/cursor but not notifications or badges",
      async () => {
        const before = (
          await app.inject({ url: "/v1/notifications/state", headers: owner })
        ).json();
        for (const type of [
          "CLIENT_SESSION_CREATED",
          "REPORT_EXPORTED",
          "ACCOUNT_UPDATED",
        ])
          await transaction(pool, (c) => event(c, type));
        const state = (
          await app.inject({ url: "/v1/notifications/state", headers: owner })
        ).json();
        assert.equal(state.unreadCount, before.unreadCount);
        assert(BigInt(state.newestId) > BigInt(before.newestId));
        const changes = (
          await app.inject({
            url: "/v1/changes?cursor=" + before.newestId,
            headers: owner,
          })
        ).json();
        assert.equal(changes.items.length, 3);
        assert.equal(
          (
            await app.inject({
              url: "/v1/notifications?page=true",
              headers: owner,
            })
          ).json().total,
          0,
        );
        assert.equal(
          (
            await app.inject({ url: "/v1/notifications", headers: owner })
          ).json().length,
          0,
        );
        assert(
          (
            await app.inject({ url: "/v1/audit?page=true", headers: owner })
          ).json().total >= 3,
        );
        const technicalId = changes.items[0].id;
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/v1/notifications/read",
              headers: owner,
              payload: { ids: [technicalId] },
            })
          ).json().updated,
          0,
        );
      },
    );
    await t.test(
      "actionable work notifications have explanations, destinations and consistent unread counts",
      async () => {
        for (const type of [
          "MESSAGE_PROCESSED",
          "AI_SUGGESTION_READY",
          "REPLY_FAILED",
        ])
          await transaction(pool, (c) => event(c, type));
        const page = (
          await app.inject({
            url: "/v1/notifications?page=true",
            headers: owner,
          })
        ).json();
        assert.equal(page.total, 3);
        for (const row of page.items)
          assert(row.title && row.detail && row.destination && row.severity);
        assert.equal(
          (
            await app.inject({ url: "/v1/notifications/state", headers: owner })
          ).json().unreadCount,
          3,
        );
        assert.equal(
          (await app.inject({ url: "/v1/dashboard", headers: owner })).json()
            .unread,
          3,
        );
        assert.equal(
          (await app.inject({ url: "/v1/operations", headers: owner })).json()
            .counts.unread,
          3,
        );
        await app.inject({
          method: "POST",
          url: "/v1/notifications/" + page.items[0].id + "/read",
          headers: owner,
        });
        assert.equal(
          (
            await app.inject({ url: "/v1/notifications/state", headers: owner })
          ).json().unreadCount,
          2,
        );
        await app.inject({
          method: "POST",
          url: "/v1/notifications/read",
          headers: owner,
          payload: { ids: page.items.map((x: { id: string }) => x.id) },
        });
        assert.equal(
          (
            await app.inject({ url: "/v1/notifications/state", headers: owner })
          ).json().unreadCount,
          0,
        );
      },
    );
    await t.test(
      "explicit logout revokes persistent access and future reauth",
      async () => {
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/v1/client-session/revoke",
              headers: auth,
            })
          ).statusCode,
          200,
        );
        assert.equal(
          (await app.inject({ url: "/v1/me", headers: auth })).statusCode,
          401,
        );
        await assert.rejects(
          issueClientReauth(pool, device.id),
          /SESSION_EXPIRED/,
        );
      },
    );
    await t.test(
      "temporary fallback retains expiry and does not become persistent",
      async () => {
        const temporary = await issueClientSession(pool);
        assert.equal(temporary.persistent, false);
        assert(temporary.expiresAt);
        await pool.query(
          "UPDATE client_sessions SET expires_at=now()-interval '1 second' WHERE id=$1",
          [temporary.id],
        );
        assert.equal(
          (
            await app.inject({
              url: "/v1/me",
              headers: { authorization: "Bearer " + temporary.token },
            })
          ).statusCode,
          401,
        );
      },
    );
  } finally {
    await app.close();
    await pool.end();
  }
});
