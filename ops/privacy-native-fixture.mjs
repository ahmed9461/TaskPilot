// Root-only, strict synthetic scope; never connects a socket or sends a message.
import { readFile, writeFile, realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";
const marker = "/var/lib/taskpilot/privacy-native-080.json";
let pool;
try {
  if (
    process.getuid?.() !== 0 ||
    process.argv.length !== 3 ||
    ![
      "--seed-synthetic",
      "--verify-synthetic",
      "--verify-cleaned-synthetic",
    ].includes(process.argv[2])
  )
    throw Error();
  const release = await realpath("/opt/taskpilot/current");
  if (
    !/^\/opt\/taskpilot\/releases\/[a-f0-9]{40}$/.test(release) ||
    JSON.parse(await readFile(release + "/package.json", "utf8")).version !==
      "0.8.0"
  )
    throw Error();
  const env = Object.fromEntries(
    (await readFile("/etc/taskpilot/pilot.env", "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).trim(),
      ]),
  );
  if (
    env.WHATSAPP_SENDING_ENABLED !== "false" ||
    env.WHATSAPP_CONNECTION_ENABLED !== "true"
  )
    throw Error();
  const { default: pg } = await import(
    pathToFileURL(release + "/node_modules/pg/lib/index.js")
  );
  const { Vault, hash } = await import(
    pathToFileURL(release + "/dist/services/api/src/security.js")
  );
  const vault = new Vault(
    (await readFile(env.TASKPILOT_ENCRYPTION_KEY_FILE, "utf8")).trim(),
  );
  pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    query_timeout: 5000,
  });
  const ownerProof = async () => {
    const rows = (
      await pool.query(
        "SELECT s.id,s.status,a.id_hash,a.encrypted_payload FROM whatsapp_sessions s JOIN whatsapp_auth a ON a.session_id=s.id AND a.category='creds' WHERE s.provider='baileys' AND s.connect_requested",
      )
    ).rows;
    if (rows.length !== 1 || rows[0].status !== "CONNECTED") throw Error();
    const r = rows[0],
      value = JSON.parse(
        vault.open(r.encrypted_payload, `wa-auth:${r.id}:creds:${r.id_hash}`),
      );
    if (!value.me?.id) throw Error();
    const counts = (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM source_messages WHERE session_id=$1) sources,(SELECT count(*)::int FROM reply_jobs WHERE session_id=$1 AND status='SENT') sent,(SELECT count(*)::int FROM reply_jobs WHERE session_id=$1 AND status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')) unsettled,(SELECT count(*)::int FROM whatsapp_auth WHERE session_id=$1) auth",
        [r.id],
      )
    ).rows[0];
    return {
      session: r.id,
      identity: createHash("sha256").update(value.me.id).digest("hex"),
      ...counts,
    };
  };
  if (process.argv[2] === "--seed-synthetic") {
    if (
      (
        await pool.query(
          "SELECT count(*)::int n FROM accounts WHERE namespace='synthetic-ui-acceptance'",
        )
      ).rows[0].n
    )
      throw Error();
    const before = await ownerProof();
    const ids = Object.fromEntries(
      [
        "session",
        "group",
        "task",
        "account",
        "assignment",
        "processed",
        "review",
        "template",
        "reply",
      ].map((k) => [k, randomUUID()]),
    );
    await pool.query("BEGIN");
    try {
      await pool.query(
        "INSERT INTO whatsapp_sessions(id,label,provider,status,auth_epoch) VALUES($1,'نسيان تجريبي 0.8','baileys','STOPPED',$2)",
        [ids.session, randomUUID()],
      );
      await pool.query(
        "INSERT INTO task_types(id,code,name) VALUES($1,'native-privacy-080','مهمة الخصوصية الوهمية')",
        [ids.task],
      );
      await pool.query(
        "INSERT INTO groups(id,session_id,external_group_id,title,enabled,task_type_id,namespace,period_key) VALUES($1,$2,'native-privacy-080','مجموعة خصوصية وهمية',false,$3,'synthetic-ui-acceptance','native-privacy-080')",
        [ids.group, ids.session, ids.task],
      );
      await pool.query(
        "INSERT INTO accounts(id,namespace,username_normalized,display_name) VALUES($1,'synthetic-ui-acceptance','native-privacy-080','حساب خصوصية وهمي')",
        [ids.account],
      );
      await pool.query(
        "INSERT INTO account_credentials(account_id,ciphertext,key_version) VALUES($1,$2,$3)",
        [
          ids.account,
          vault.seal("synthetic-privacy-only", `credential:${ids.account}`),
          vault.keyVersion,
        ],
      );
      await pool.query(
        "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_transport_key) VALUES($1,$2,$3,'native-privacy-processed','PROCESSED',$4)",
        [
          ids.processed,
          ids.session,
          ids.group,
          vault.seal(
            JSON.stringify({
              id: "synthetic-only",
              fromMe: false,
              remoteJid: "synthetic-only",
            }),
            `wa-source:${ids.processed}`,
          ),
        ],
      );
      await pool.query(
        "INSERT INTO source_messages(id,session_id,group_id,external_message_id,state,encrypted_payload,received_at,review_account_id) VALUES($1,$2,$3,'native-privacy-review','REVIEW',$4,now()-interval '40 days',$5)",
        [
          ids.review,
          ids.session,
          ids.group,
          vault.seal(
            JSON.stringify({ text: "synthetic private review only" }),
            `message:${ids.review}`,
          ),
          ids.account,
        ],
      );
      await pool.query(
        "INSERT INTO assignments(id,account_id,task_type_id,period_key) VALUES($1,$2,$3,'native-privacy-080')",
        [ids.assignment, ids.account, ids.task],
      );
      await pool.query(
        "INSERT INTO assignment_sources(assignment_id,source_message_id) VALUES($1,$2),($1,$3)",
        [ids.assignment, ids.processed, ids.review],
      );
      for (const [external, days] of [
        ["native-privacy-old-error", 20],
        ["native-privacy-recent-error", 1],
      ])
        await pool.query(
          "INSERT INTO whatsapp_ingress(session_id,group_id,external_message_id,state,encrypted_payload,received_at) VALUES($1,$2,$3,'ERROR',$4,now()-($5::int*interval '1 day'))",
          [
            ids.session,
            ids.group,
            external,
            vault.seal(
              JSON.stringify({ text: "synthetic private ingress only" }),
              `wa-ingress:${ids.session}:${ids.group}:${hash(external)}`,
            ),
            days,
          ],
        );
      const authId = hash(ids.session + ":creds:main");
      await pool.query(
        "INSERT INTO whatsapp_auth(session_id,category,id_hash,encrypted_payload,key_version) VALUES($1,'creds',$2,$3,$4)",
        [
          ids.session,
          authId,
          vault.seal(
            JSON.stringify({ synthetic: true }),
            `wa-auth:${ids.session}:creds:${authId}`,
          ),
          vault.keyVersion,
        ],
      );
      await pool.query(
        "INSERT INTO reply_templates(id,code,body) VALUES($1,'native-privacy-080','اختبار وهمي دون إرسال')",
        [ids.template],
      );
      await pool.query(
        "INSERT INTO reply_jobs(id,assignment_id,source_message_id,session_id,template_id,body,status,idempotency_key) VALUES($1,$2,$3,$4,$5,'اختبار وهمي دون إرسال','APPROVED','native-privacy-080')",
        [ids.reply, ids.assignment, ids.processed, ids.session, ids.template],
      );
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
    await writeFile(marker, JSON.stringify({ ids, before }), {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        fixture: "SEEDED",
        namespace: "synthetic-ui-acceptance",
        stoppedSyntheticSession: 1,
        accounts: 1,
        assignments: 1,
        sources: 2,
        syntheticAuth: 1,
        syntheticApproved: 1,
        actualOwnerUnchanged:
          JSON.stringify(before) === JSON.stringify(await ownerProof()),
        providerConnections: 0,
        outboundMessages: 0,
      }),
    );
  } else {
    const cleaned = process.argv[2] === "--verify-cleaned-synthetic";
    const { ids, before } = JSON.parse(await readFile(marker, "utf8"));
    const r = (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM accounts WHERE id=$1) accounts,(SELECT count(*)::int FROM assignments WHERE id=$2) assignments,(SELECT count(*)::int FROM source_messages WHERE session_id=$3) sources,(SELECT count(*)::int FROM whatsapp_auth WHERE session_id=$3) auth,(SELECT count(*)::int FROM source_messages WHERE session_id=$3 AND encrypted_transport_key IS NOT NULL) quotes,(SELECT count(*)::int FROM whatsapp_ingress WHERE session_id=$3 AND encrypted_payload IS NOT NULL) ingressRaw,(SELECT status FROM whatsapp_sessions WHERE id=$3) sessionStatus,(SELECT status FROM reply_jobs WHERE id=$4) replyStatus,(SELECT state FROM source_messages WHERE id=$5) reviewState,(SELECT encrypted_payload IS NULL FROM source_messages WHERE id=$5) reviewMinimized",
        [ids.account, ids.assignment, ids.session, ids.reply, ids.review],
      )
    ).rows[0];
    if (
      r.accounts !== (cleaned ? 0 : 1) ||
      r.assignments !== (cleaned ? 0 : 1) ||
      r.sources !== (cleaned ? 0 : 2) ||
      r.auth !== 0 ||
      r.quotes !== 0 ||
      r.ingressraw !== 0 ||
      r.sessionstatus !== "FORGOTTEN" ||
      r.replystatus !== (cleaned ? null : "CANCELED") ||
      r.reviewstate !== (cleaned ? null : "IGNORED") ||
      (!cleaned && !r.reviewminimized) ||
      JSON.stringify(before) !== JSON.stringify(await ownerProof())
    )
      throw Error();
    console.log(
      JSON.stringify({
        privacyNative: "PASS",
        selectedHistoryPreserved: cleaned
          ? "VERIFIED_BEFORE_SCOPED_CLEANUP"
          : true,
        scopedSyntheticCleanupVerified: cleaned,
        selectedAuthRemoved: true,
        quotesAndQueuedRawRemoved: true,
        approvedReplyCanceled: true,
        expiredReviewMinimized: true,
        actualOwnerUnchanged: true,
        actualOwnerAuth: before.auth,
        actualOwnerSources: before.sources,
        actualOwnerSent: before.sent,
        sendingEnabled: false,
        providerConnections: 0,
        outboundMessages: 0,
      }),
    );
  }
} catch {
  console.error("PRIVACY_NATIVE_FIXTURE_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
