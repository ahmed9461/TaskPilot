// Explicit synthetic fault injection for native reconciliation acceptance. No transport calls.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { transaction, event } from "../dist/services/api/src/db.js";
let pool;
try {
  if (process.argv[2] !== "--synthetic-ui-only") throw Error();
  const env = Object.fromEntries(
    (await readFile("/etc/taskpilot/pilot.env", "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  if (env.WHATSAPP_SENDING_ENABLED !== "false") throw Error();
  pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const seeded = await transaction(pool, async (c) => {
    if (
      (
        await c.query(
          "SELECT count(*)::int n FROM groups g JOIN whatsapp_sessions s ON s.id=g.session_id WHERE s.provider='baileys' AND g.enabled",
        )
      ).rows[0].n !== 0
    )
      throw Error();
    const fixture = (
      await c.query(`SELECT a.id assignment_id,s.id source_id,s.session_id,t.id template_id
      FROM assignments a JOIN accounts ac ON ac.id=a.account_id JOIN assignment_sources x ON x.assignment_id=a.id
      JOIN source_messages s ON s.id=x.source_message_id JOIN groups g ON g.id=s.group_id
      JOIN whatsapp_sessions ws ON ws.id=s.session_id JOIN reply_templates t ON t.code=replace(s.external_message_id,'synthetic-ui-message-','synthetic-ui-')
      WHERE ac.namespace='synthetic-ui-acceptance' AND ac.username_normalized='synthetic-ui-051'
      AND ws.provider='mock' AND s.external_message_id LIKE 'synthetic-ui-message-%'
      ORDER BY s.received_at DESC LIMIT 1`)
    ).rows[0];
    if (!fixture) throw Error();
    const r = await c.query(
      "INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key) VALUES($1,$2,$3,$4,$5,'رد محاكاة لاختبار حسم التسليم','UNKNOWN_DELIVERY',$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id",
      [
        randomUUID(),
        fixture.assignment_id,
        fixture.source_id,
        fixture.session_id,
        fixture.template_id,
        "synthetic-ui-reconciliation:" + fixture.source_id,
      ],
    );
    if (r.rowCount) await event(c, "SYNTHETIC_UI_UNKNOWN_SEEDED", r.rows[0].id);
    const current = (
      await c.query("SELECT status FROM reply_jobs WHERE idempotency_key=$1", [
        "synthetic-ui-reconciliation:" + fixture.source_id,
      ])
    ).rows[0];
    return { count: r.rowCount, status: current.status };
  });
  console.log(
    JSON.stringify({
      fixture: "synthetic fault injection",
      namespace: "synthetic-ui-acceptance",
      unknownJobsSeeded: seeded.count,
      fixtureStatus: seeded.status,
      realTransportUsed: false,
    }),
  );
} catch {
  console.error("SYNTHETIC_RECONCILIATION_SEED_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
