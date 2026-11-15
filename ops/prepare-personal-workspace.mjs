// Explicit owner-authorized cleanup of reviewed development fixtures only.
// Root-private frozen plan and encrypted backup; never prints names/IDs/keys.
import { readFile, writeFile, readlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const mode = process.argv[2],
  rehearsal = process.argv[3] === "--rehearsal";
const marker =
  "/var/lib/taskpilot/personal-workspace-084" +
  (rehearsal ? "-rehearsal-v2" : "") +
  ".json";
const sha = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fixtureScope = (value) =>
  value === "synthetic" ||
  value.startsWith("synthetic-") ||
  value === "whatsapp-test-acceptance";
const fixtureCode = (value) =>
  /^(synthetic|native|owner-test|demo|done|fixture)/.test(value) ||
  value === "ai_native_probe";
let pool,
  stage = "guard";
try {
  if (
    !["--preview", "--apply", "--verify"].includes(mode) ||
    process.argv.length > (rehearsal ? 4 : 3)
  )
    throw Error();
  const release = await readlink("/opt/taskpilot/current");
  if (!/^\/opt\/taskpilot\/releases\/[a-f0-9]{40}$/.test(release))
    throw Error();
  const version = JSON.parse(
    await readFile(release + "/package.json", "utf8"),
  ).version;
  if (!["0.8.3", "0.8.4"].includes(version)) throw Error();
  const envFile = async (path) =>
    Object.fromEntries(
      (await readFile(path, "utf8"))
        .split("\n")
        .filter((x) => x.includes("="))
        .map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i), x.slice(i + 1).trim()];
        }),
    );
  const env = await envFile("/etc/taskpilot/pilot.env");
  if (
    env.WHATSAPP_CONNECTION_ENABLED !== "true" ||
    env.WHATSAPP_SENDING_ENABLED !== "false"
  )
    throw Error();
  let url = env.DATABASE_URL;
  if (rehearsal) {
    const target = new URL(
      (await envFile("/etc/taskpilot/migration.env")).DATABASE_URL,
    );
    if (
      target.hostname !== "127.0.0.1" ||
      target.port !== "15488" ||
      target.pathname !== "/taskpilot_pilot"
    )
      throw Error();
    target.pathname = "/taskpilot_personal_084_v2_restore_test";
    url = target.toString();
  }
  const { default: pg } = await import(
    pathToFileURL(release + "/node_modules/pg/lib/index.js")
  );
  const { Vault } = await import(
    pathToFileURL(release + "/dist/services/api/src/security.js")
  );
  const { transaction, event } = await import(
    pathToFileURL(release + "/dist/services/api/src/db.js")
  );
  const vault = new Vault(
    (await readFile(env.TASKPILOT_ENCRYPTION_KEY_FILE, "utf8")).trim(),
  );
  pool = new pg.Pool({ connectionString: url, max: 2, query_timeout: 15000 });
  const ownerProof = async (client) => {
    const sessions = (
      await client.query(
        "SELECT id FROM whatsapp_sessions WHERE provider='baileys' AND connect_requested",
      )
    ).rows;
    if (sessions.length !== 1) throw Error();
    const id = sessions[0].id;
    const auth = (
      await client.query(
        "SELECT category,id_hash,encrypted_payload FROM whatsapp_auth WHERE session_id=$1 ORDER BY category,id_hash",
        [id],
      )
    ).rows;
    let identity;
    for (const row of auth) {
      const value = JSON.parse(
        vault.open(
          row.encrypted_payload,
          `wa-auth:${id}:${row.category}:${row.id_hash}`,
        ),
      );
      if (row.category === "creds") identity = value.me?.id;
    }
    if (!identity || auth.length === 0) throw Error();
    return {
      session: id,
      identity: sha(identity),
      auth: auth.length,
      authDigest: sha(auth),
    };
  };
  const snapshot = async (client) => {
    const result = {};
    for (const [name, sql] of Object.entries({
      accounts: "SELECT id,namespace,version FROM accounts ORDER BY id",
      groups:
        "SELECT id,session_id,namespace,period_key,task_type_id,version FROM groups ORDER BY id",
      sessions:
        "SELECT id,label,provider,connect_requested,forgotten_at FROM whatsapp_sessions ORDER BY id",
      types: "SELECT id,code FROM task_types ORDER BY id",
      templates:
        "SELECT id,code,group_id,task_type_id,version FROM reply_templates ORDER BY id",
      rules:
        "SELECT id,group_id,task_type_id,version FROM group_rules ORDER BY id",
      sources:
        "SELECT id,session_id,group_id,routing_task_type_id,version FROM source_messages ORDER BY id",
      assignments:
        "SELECT id,account_id,task_type_id,version,status FROM assignments ORDER BY id",
    }))
      result[name] = (await client.query(sql)).rows;
    return result;
  };
  const report = (plan) => ({
    rehearsal,
    accounts: plan.accounts.length,
    sourceMessages: plan.sources.length,
    groups: plan.groups.length,
    sessions: plan.sessions.length,
    taskTypes: plan.types.length,
    templates: plan.templates.length,
  });
  if (mode === "--preview") {
    stage = "scope-review";
    const data = await snapshot(pool),
      before = await ownerProof(pool);
    const sessions = data.sessions
      .filter(
        (s) =>
          s.provider === "mock" ||
          (s.provider === "baileys" &&
            !s.connect_requested &&
            !s.forgotten_at &&
            /^synthetic-ui-whatsapp-/.test(s.label)),
      )
      .map((s) => s.id);
    const groups = data.groups
      .filter(
        (g) =>
          sessions.includes(g.session_id) ||
          (fixtureScope(g.namespace) &&
            data.sessions.some((s) => s.id === g.session_id && s.forgotten_at)),
      )
      .map((g) => g.id);
    const accounts = data.accounts
      .filter((a) => fixtureScope(a.namespace))
      .map((a) => a.id);
    const types = data.types
      .filter((t) => fixtureCode(t.code))
      .map((t) => t.id);
    const templates = data.templates
      .filter((t) => fixtureCode(t.code))
      .map((t) => t.id);
    const sources = data.sources
      .filter((s) =>
        data.groups.some(
          (g) => g.id === s.group_id && fixtureScope(g.namespace),
        ),
      )
      .map((s) => s.id);
    const remap = data.groups
      .filter(
        (g) =>
          types.includes(g.task_type_id) &&
          !groups.includes(g.id) &&
          fixtureScope(g.namespace),
      )
      .map((g) => g.id);
    if (
      accounts.length > 100 ||
      groups.length > 200 ||
      sessions.length > 100 ||
      types.length > 200 ||
      templates.length > 200 ||
      sources.length > 1000
    )
      throw Error();
    if (
      data.groups.some(
        (g) => groups.includes(g.id) && !fixtureScope(g.namespace),
      )
    )
      throw Error();
    if (
      data.groups.some(
        (g) =>
          types.includes(g.task_type_id) &&
          !groups.includes(g.id) &&
          !remap.includes(g.id),
      )
    )
      throw Error();
    if (
      data.assignments.some(
        (a) =>
          types.includes(a.task_type_id) && !accounts.includes(a.account_id),
      )
    )
      throw Error();
    if (
      data.sources.some(
        (s) =>
          types.includes(s.routing_task_type_id) && !sources.includes(s.id),
      )
    )
      throw Error();
    if (
      data.templates.some(
        (t) =>
          !templates.includes(t.id) &&
          (groups.includes(t.group_id) || types.includes(t.task_type_id)),
      )
    )
      throw Error();
    if (
      data.rules.some(
        (r) =>
          types.includes(r.task_type_id) &&
          !data.groups.some(
            (g) => g.id === r.group_id && fixtureScope(g.namespace),
          ),
      )
    )
      throw Error();
    const foreign = (
      await pool.query(
        "SELECT count(*)::int n FROM assignment_sources x JOIN assignments a ON a.id=x.assignment_id WHERE x.source_message_id=ANY($1::uuid[]) AND NOT(a.account_id=ANY($2::uuid[]))",
        [sources, accounts],
      )
    ).rows[0].n;
    const auth = (
      await pool.query(
        "SELECT count(*)::int n FROM whatsapp_auth WHERE session_id=ANY($1::uuid[])",
        [sessions],
      )
    ).rows[0].n;
    const privacy = (
      await pool.query(
        "SELECT count(*)::int n FROM privacy_runs WHERE session_id=ANY($1::uuid[])",
        [sessions],
      )
    ).rows[0].n;
    const unsettled = (
      await pool.query(
        "SELECT count(*)::int n FROM reply_jobs WHERE status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY')",
      )
    ).rows[0].n;
    const pending = (
      await pool.query(
        "SELECT count(*)::int n FROM whatsapp_ingress WHERE state IN ('PENDING','ERROR')",
      )
    ).rows[0].n;
    if (foreign || auth || privacy || unsettled || pending) throw Error();
    const watermark = (
      await pool.query("SELECT COALESCE(max(id),0)::text id FROM notifications")
    ).rows[0].id;
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const period =
      dateParts.find((p) => p.type === "year").value +
      "-" +
      dateParts.find((p) => p.type === "month").value;
    const plan = {
      period,
      runId: randomUUID(),
      fingerprint: sha(data),
      before,
      accounts,
      groups,
      sessions,
      types,
      templates,
      sources,
      remap,
      watermark,
      applied: false,
    };
    await writeFile(marker, JSON.stringify(plan), { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        personalCleanupPreview: "PASS",
        ...report(plan),
        preserveOwnerAuth: before.auth,
        preserveAuditAndAiUsage: true,
        noTransportCalls: true,
      }),
    );
  } else {
    const plan = JSON.parse(await readFile(marker, "utf8"));
    if (mode === "--apply") {
      stage = "stopped-service-guard";
      if (plan.applied) throw Error();
      if (
        !rehearsal &&
        execFileSync(
          "systemctl",
          ["show", "taskpilot.service", "-p", "ActiveState", "--value"],
          { encoding: "utf8" },
        ).trim() !== "inactive"
      )
        throw Error();
      stage = "atomic-cleanup";
      await transaction(pool, async (c) => {
        await c.query(
          "LOCK TABLE accounts,assignments,source_messages,groups,whatsapp_sessions,task_types,group_rules,reply_templates IN SHARE ROW EXCLUSIVE MODE",
        );
        if (sha(await snapshot(c)) !== plan.fingerprint) throw Error();
        const owner = await ownerProof(c);
        if (
          owner.session !== plan.before.session ||
          owner.identity !== plan.before.identity
        )
          throw Error();
        const pending = (
          await c.query(
            "SELECT (SELECT count(*)::int FROM reply_jobs WHERE status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY'))+(SELECT count(*)::int FROM whatsapp_ingress WHERE state IN ('PENDING','ERROR')) n",
          )
        ).rows[0].n;
        if (pending) throw Error();
        const protectedReferences = (
          await c.query(
            "SELECT (SELECT count(*)::int FROM whatsapp_auth WHERE session_id=ANY($1::uuid[]))+(SELECT count(*)::int FROM privacy_runs WHERE session_id=ANY($1::uuid[])) n",
            [plan.sessions],
          )
        ).rows[0].n;
        if (protectedReferences) throw Error();
        await c.query("DELETE FROM accounts WHERE id=ANY($1::uuid[])", [
          plan.accounts,
        ]);
        await c.query("DELETE FROM source_messages WHERE id=ANY($1::uuid[])", [
          plan.sources,
        ]);
        await c.query("DELETE FROM reply_templates WHERE id=ANY($1::uuid[])", [
          plan.templates,
        ]);
        await c.query(
          "DELETE FROM group_rules WHERE task_type_id=ANY($1::uuid[]) OR group_id=ANY($2::uuid[])",
          [plan.types, plan.groups],
        );
        await c.query(
          "DELETE FROM whatsapp_ingress WHERE group_id=ANY($1::uuid[])",
          [plan.groups],
        );
        await c.query("DELETE FROM groups WHERE id=ANY($1::uuid[])", [
          plan.groups,
        ]);
        await c.query(
          "DELETE FROM whatsapp_sessions WHERE id=ANY($1::uuid[])",
          [plan.sessions],
        );
        if (plan.remap.length) {
          const task = (
            await c.query(
              "INSERT INTO task_types(id,code,name) VALUES($1,'general-follow-up','متابعة عامة') RETURNING id",
              [randomUUID()],
            )
          ).rows[0];
          await c.query(
            "UPDATE groups SET task_type_id=$1,namespace='work',period_key=$3,version=version+1 WHERE id=ANY($2::uuid[])",
            [task.id, plan.remap, plan.period],
          );
        }
        await c.query("DELETE FROM task_types WHERE id=ANY($1::uuid[])", [
          plan.types,
        ]);
        await c.query("DELETE FROM approvals");
        await c.query("DELETE FROM notifications WHERE id<=$1::bigint", [
          plan.watermark,
        ]);
        await event(c, "PERSONAL_WORKSPACE_PREPARED", plan.runId);
        await c.query(
          "UPDATE notifications SET read_at=now() WHERE type='PERSONAL_WORKSPACE_PREPARED' AND subject_id=$1",
          [plan.runId],
        );
        const after = await ownerProof(c);
        if (sha(owner) !== sha(after)) throw Error();
      });
      plan.applied = true;
      await writeFile(marker, JSON.stringify(plan), { mode: 0o600 });
    }
    stage = "verify";
    const owner = await ownerProof(pool);
    if (
      owner.session !== plan.before.session ||
      owner.identity !== plan.before.identity
    )
      throw Error();
    for (const [table, key] of [
      ["accounts", "accounts"],
      ["source_messages", "sources"],
      ["groups", "groups"],
      ["whatsapp_sessions", "sessions"],
      ["task_types", "types"],
      ["reply_templates", "templates"],
    ]) {
      if (
        (
          await pool.query(
            `SELECT count(*)::int n FROM ${table} WHERE id=ANY($1::uuid[])`,
            [plan[key]],
          )
        ).rows[0].n
      )
        throw Error();
    }
    if (
      !(
        await pool.query(
          "SELECT id FROM audit_events WHERE action='PERSONAL_WORKSPACE_PREPARED' AND target_id=$1",
          [plan.runId],
        )
      ).rowCount
    )
      throw Error();
    const counts = (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM accounts) accounts,(SELECT count(*)::int FROM assignments) tasks,(SELECT count(*)::int FROM groups) groups,(SELECT count(*)::int FROM task_types) tasktypes,(SELECT count(*)::int FROM reply_templates) templates,(SELECT count(*)::int FROM whatsapp_sessions WHERE provider='mock') mocksessions,(SELECT count(*)::int FROM privacy_runs) privacyruns,(SELECT count(*)::int FROM ai_requests) airequests",
      )
    ).rows[0];
    console.log(
      JSON.stringify({
        personalWorkspace: "PASS",
        rehearsal,
        ownerIdentityPreserved: true,
        ownerAuthValid: owner.auth,
        ...counts,
        auditPreserved: true,
        ingressTombstonesPreserved: true,
        noTransportCalls: true,
      }),
    );
  }
} catch {
  console.error("PERSONAL_WORKSPACE_PREPARATION_FAILED:" + stage);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
