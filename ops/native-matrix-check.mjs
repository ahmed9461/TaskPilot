import { readFile } from "node:fs/promises";
import pg from "pg";
let pool;
try {
  const env = Object.fromEntries(
    (await readFile("/etc/taskpilot/pilot.env", "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
  if (env.WHATSAPP_SENDING_ENABLED !== "false") throw Error();
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const row = (
    await pool.query(`SELECT
 (SELECT count(*)::int FROM accounts WHERE namespace='synthetic-ui-acceptance') accounts,
 (SELECT count(*)::int FROM assignments a JOIN accounts c ON c.id=a.account_id WHERE c.namespace='synthetic-ui-acceptance') assignments,
 (SELECT count(*)::int FROM assignments a JOIN accounts c ON c.id=a.account_id WHERE c.namespace='synthetic-ui-acceptance' AND c.username_normalized='synthetic-ui-051') "alphaTasks",
 (SELECT count(*)::int FROM issue_flags f JOIN accounts c ON c.id=f.account_id WHERE c.namespace='synthetic-ui-acceptance' AND f.verified) "verifiedFlags",
 (SELECT count(*)::int FROM issue_flags f JOIN accounts c ON c.id=f.account_id WHERE c.namespace='synthetic-ui-acceptance' AND NOT f.verified) "unverifiedFlags",
 (SELECT count(*)::int FROM reply_jobs r JOIN assignments a ON a.id=r.assignment_id JOIN accounts c ON c.id=a.account_id JOIN source_messages s ON s.id=r.source_message_id JOIN groups g ON g.id=s.group_id JOIN whatsapp_sessions w ON w.id=r.session_id WHERE c.namespace='synthetic-ui-acceptance' AND w.provider='mock' AND r.status='SENT' AND r.body LIKE 'رد الواجهة b %' AND g.title='مصدر الواجهة ب' AND s.external_message_id LIKE 'native-alpha-b-%') "mockSourceBReplySent",
 (SELECT count(*)::int FROM source_messages s JOIN whatsapp_sessions w ON w.id=s.session_id WHERE w.provider='baileys') "liveSources",
 (SELECT count(*)::int FROM reply_jobs r JOIN whatsapp_sessions w ON w.id=r.session_id WHERE w.provider='baileys' AND r.status='SENT') "liveSentReplies"`)
  ).rows[0];
  console.log(
    JSON.stringify({
      scope: "synthetic UI namespace plus aggregate live invariance",
      sendingEnabled: false,
      ...row,
    }),
  );
} catch {
  console.error("NATIVE_MATRIX_STATE_CHECK_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
