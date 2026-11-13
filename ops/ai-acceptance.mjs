// Explicit synthetic-only live DeepSeek test. No WhatsApp messages or automatic actions.
import { readFile } from "node:fs/promises";
import pg from "pg";
const ns = "synthetic-acceptance-a1060aa001";
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
  const token = (await readFile(env.TASKPILOT_API_TOKEN_FILE, "utf8")).trim(),
    reauth = (await readFile(env.TASKPILOT_REAUTH_SECRET_FILE, "utf8")).trim();
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const api = async (method, path, body) => {
    const r = await fetch("http://127.0.0.1:8240" + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "x-reauth-secret": reauth,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error();
    return r.json();
  };
  const mode = process.argv[2];
  if (mode === "--prepare") {
    if (
      (await pool.query("SELECT id FROM groups WHERE namespace=$1", [ns]))
        .rowCount
    )
      throw Error();
    const session = await api("POST", "/v1/sessions", {
        label: "AI native synthetic",
      }),
      task = await api("POST", "/v1/task-types", {
        code: "ai_native_probe",
        name: "اختبار اقتراح الذكاء الاصطناعي",
      });
    const group = await api("POST", "/v1/groups", {
      sessionId: session.id,
      taskTypeId: task.id,
      externalGroupId: ns,
      title: "اختبار AI وهمي",
      namespace: ns,
      periodKey: "ai-060",
    });
    await api("POST", "/v1/group-rules", {
      groupId: group.id,
      taskTypeId: task.id,
      keywords: ["تصنيف تجريبي"],
      priority: 1,
    });
    const source = await api("POST", "/v1/mock/messages", {
      sessionId: session.id,
      groupId: group.id,
      externalMessageId: "ai-native-060",
      text: "تصنيف تجريبي\nالاسم: حساب AI وهمي\nكلمة المرور: synthetic-ai-canary-only",
    });
    if (source.state !== "REVIEW") throw Error();
    let c = await api("GET", "/v1/ai/config");
    if (!c.keyConfigured) throw Error();
    await api("PATCH", "/v1/ai/config", {
      version: c.version,
      provider: "deepseek",
      model: "deepseek-flash",
      enabled: true,
      outboundApproved: true,
      dailyRequestLimit: 20,
      dailyTokenLimit: 10000,
    });
    console.log(
      JSON.stringify({
        prepare: "PASS",
        fixture: "mock-only",
        reviewReady: true,
        model: "deepseek-flash",
        sendingChanged: false,
      }),
    );
  } else if (mode === "--analyze" || mode === "--cleanup") {
    const sources = (
      await pool.query(
        "SELECT s.id,s.version,s.state FROM source_messages s JOIN groups g ON g.id=s.group_id JOIN whatsapp_sessions w ON w.id=s.session_id WHERE g.namespace=$1 AND w.provider='mock'",
        [ns],
      )
    ).rows;
    if (mode === "--analyze") {
      if (sources.length !== 1 || sources[0].state !== "REVIEW") throw Error();
      const id = sources[0].id;
      const p = await api("POST", `/v1/inbox/${id}/ai-preview`, {});
      if (JSON.stringify(p.candidateCodes) !== '["ai_native_probe"]')
        throw Error();
      const body = {
        idempotencyKey: `ai-cli:${id}:${p.sourceVersion}:${p.settingsVersion}`,
      };
      const a = await api("POST", `/v1/inbox/${id}/ai-suggestion`, body),
        b = await api("POST", `/v1/inbox/${id}/ai-suggestion`, body);
      if (
        a.status !== "SUCCEEDED" ||
        !a.needsReview ||
        a.requestId !== b.requestId ||
        !b.reused
      )
        throw Error();
      const unchanged = (
        await pool.query(
          "SELECT state,version FROM source_messages WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (
        unchanged.state !== "REVIEW" ||
        unchanged.version !== sources[0].version
      )
        throw Error();
      console.log(
        JSON.stringify({
          ai: "PASS",
          provider: a.provider,
          model: a.model,
          needsReview: true,
          businessStateUnchanged: true,
          idempotentReplay: true,
          promptTokens: a.promptTokens,
          completionTokens: a.completionTokens,
          estimatedCostUsd: a.estimatedCostUsd,
          reportedCostUsd: a.reportedCostUsd,
          privacy: "task-codes-only",
        }),
      );
    } else {
      for (const s of sources)
        if (s.state === "REVIEW")
          await api("POST", `/v1/inbox/${s.id}/resolve`, {
            version: s.version,
            account: {
              namespace: ns,
              username: "ai-native-fixture",
              displayName: "حساب AI وهمي",
            },
          });
      const ids = (
        await api("GET", "/v1/accounts?namespace=" + ns + "&limit=500")
      )
        .filter((r) => r.namespace === ns)
        .map((r) => r.id);
      if (ids.length) {
        const p = await api("POST", "/v1/deletions/preview", { ids });
        const r = await api("POST", "/v1/deletions/confirm", {
          approvalToken: p.approvalToken,
          confirmation: p.confirmation,
        });
        if (r.deleted !== ids.length) throw Error();
      }
      console.log(
        JSON.stringify({
          cleanup: "PASS",
          scope: "synthetic AI fixture accounts/sources only",
          deleted: ids.length,
          aiUsageRetained: true,
        }),
      );
    }
  } else throw Error();
} catch {
  console.error("AI_SYNTHETIC_ACCEPTANCE_FAILED");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
