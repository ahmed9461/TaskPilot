import type pg from "pg";
import { event, transaction } from "./db.js";
import {
  messageSegments,
  opaqueCredentialCandidate,
  studentUsername,
} from "./parser.js";
import { hash, type Vault } from "./security.js";

function fragmentRole(body: string) {
  if (body.length > 1024) return null;
  const parts = messageSegments(body);
  if (parts.length < 1 || parts.length > 2) return null;
  const roles = parts.map((segment) => {
    if (studentUsername(segment.value)) return "username";
    if (segment.kind === "name") return "name";
    if (
      segment.kind === "credential" ||
      (segment.kind === "text" && opaqueCredentialCandidate(segment.value))
    )
      return "credential";
    return null;
  });
  if (roles.length === 1) return roles[0];
  if (!roles.includes("name")) return null;
  if (roles.includes("username")) return "username";
  if (roles.includes("credential")) return "credential";
  return null;
}

export async function stageFragment(
  c: pg.PoolClient,
  messageId: string,
  sessionId: string,
  groupId: string,
  body: string,
  participant: string,
  timestamp: number,
) {
  const role = fragmentRole(body);
  const now = Date.now();
  if (
    !role ||
    !Number.isFinite(timestamp) ||
    !/^\d+(?::\d+)?@(lid|s\.whatsapp\.net)$/.test(participant) ||
    timestamp * 1000 < now - 120_000 ||
    timestamp * 1000 > now + 10_000
  )
    return false;
  const sender = hash(JSON.stringify([sessionId, groupId, participant]));
  await c.query("SELECT pg_advisory_xact_lock(8240007)");
  await c.query(
    `UPDATE source_messages SET state='IGNORED', fragment_sender=$2, fragment_role=$3,
       fragment_message_at=to_timestamp($4),fragment_expires=clock_timestamp()+interval '15 seconds'
     WHERE id=$1`,
    [messageId, sender, role, timestamp],
  );
  await c.query(
    `WITH pending AS (
       SELECT min(received_at) oldest FROM source_messages WHERE session_id=$1 AND group_id=$2 AND fragment_sender=$3
         AND fragment_expires > clock_timestamp() AND received_at > clock_timestamp()-interval '45 seconds'
     )
     UPDATE source_messages s SET fragment_expires=LEAST(clock_timestamp()+interval '15 seconds',pending.oldest+interval '45 seconds')
     FROM pending WHERE s.session_id=$1 AND s.group_id=$2 AND s.fragment_sender=$3
       AND s.fragment_expires > clock_timestamp() AND s.received_at > clock_timestamp()-interval '45 seconds'`,
    [sessionId, groupId, sender],
  );
  return true;
}

export async function finishFragmentWindow(
  pool: pg.Pool,
  vault: Vault,
): Promise<boolean> {
  return transaction(pool, async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await c.query("SELECT pg_advisory_xact_lock(8240007)");
    const scope = (
      await c.query(
        `SELECT id,session_id,group_id,fragment_sender,received_at,fragment_message_at FROM source_messages
       WHERE fragment_expires<=clock_timestamp() ORDER BY fragment_expires,id LIMIT 1`,
      )
    ).rows[0];
    if (!scope) return false;
    const rows = (
      await c.query(
        `SELECT s.id,s.fragment_role,s.encrypted_payload,s.fragment_message_at,
              g.enabled, ws.forgotten_at
       FROM source_messages s JOIN groups g ON g.id=s.group_id
       JOIN whatsapp_sessions ws ON ws.id=s.session_id
       WHERE s.session_id=$1 AND s.group_id=$2 AND s.fragment_sender=$3
         AND s.fragment_expires IS NOT NULL AND s.received_at BETWEEN $4::timestamptz - interval '45 seconds'
            AND $4::timestamptz + interval '45 seconds'
         AND s.fragment_message_at BETWEEN $5::timestamptz - interval '45 seconds' AND $5::timestamptz + interval '45 seconds'
       ORDER BY s.received_at,s.id FOR UPDATE OF s`,
        [
          scope.session_id,
          scope.group_id,
          scope.fragment_sender,
          scope.received_at,
          scope.fragment_message_at,
        ],
      )
    ).rows;
    const anchors = rows.filter((r) => r.fragment_role === "username");
    const candidates = rows.filter((r) => r.encrypted_payload);
    const times = rows.map((row) => row.fragment_message_at.getTime());
    const canJoin =
      rows.length <= 6 &&
      Math.max(...times) - Math.min(...times) <= 45_000 &&
      anchors.length === 1 &&
      candidates.some((r) => r.fragment_role === "credential") &&
      candidates.length === rows.length &&
      rows.every((r) => r.enabled && !r.forgotten_at);
    if (canJoin) {
      const anchor = anchors[0]!;
      const combined = rows
        .map((r) => vault.open(r.encrypted_payload, `message:${r.id}`))
        .join("\n");
      await c.query(
        `UPDATE source_messages SET state='REVIEW',encrypted_payload=$2,fragment_count=$3,
           fragment_sender=NULL,fragment_role=NULL,fragment_expires=NULL,fragment_message_at=NULL,version=version+1 WHERE id=$1`,
        [anchor.id, vault.seal(combined, `message:${anchor.id}`), rows.length],
      );
      await c.query(
        `UPDATE source_messages SET encrypted_payload=NULL,encrypted_transport_key=NULL,
           fragment_sender=NULL,fragment_role=NULL,fragment_expires=NULL,fragment_message_at=NULL,version=version+1 WHERE id=ANY($1::uuid[])`,
        [rows.filter((r) => r.id !== anchor.id).map((r) => r.id)],
      );
      await event(c, "MESSAGE_MISSING_FIELDS", anchor.id);
    } else {
      const row = rows.find((r) => r.id === scope.id)!;
      // Discard the entire window if two distinct login messages made association ambiguous.
      const resolved = anchors.length > 1 ? rows : [row];
      for (const item of resolved) {
        const review =
          item.fragment_role === "username" &&
          item.enabled &&
          !item.forgotten_at;
        await c.query(
          `UPDATE source_messages SET state=$2,encrypted_payload=CASE WHEN $3 THEN encrypted_payload END,
             encrypted_transport_key=CASE WHEN $3 THEN encrypted_transport_key END,
             fragment_sender=NULL,fragment_role=NULL,fragment_expires=NULL,fragment_message_at=NULL,version=version+1 WHERE id=$1`,
          [item.id, review ? "REVIEW" : "IGNORED", review],
        );
        if (review) await event(c, "MESSAGE_MISSING_FIELDS", item.id);
      }
    }
    return true;
  });
}
