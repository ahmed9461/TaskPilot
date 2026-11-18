import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import { id, assignmentStatus } from "../../../packages/contracts/src/index.js";
import { transaction, event } from "./db.js";
import { hash, token } from "./security.js";
import { Fault } from "./service.js";
import { parseMessage } from "./parser.js";
import { AiRuntime, assistantModelInput } from "./ai-runtime.js";
import {
  assistantPlan,
  assistantSearchTerms,
  localAssistantIntent,
  normalizeAssistant,
  projectAssistantQuestion,
  riyadhDate,
  riyadhRange,
  type AssistantPlan,
  type SafeAssistantInput,
} from "./assistant-plan.js";

const askInput = z
  .object({
    requestId: id,
    threadId: id,
    parentId: id.nullable().default(null),
    question: z.string().trim().min(1).max(1200),
    focusAccountId: id.nullable().default(null),
    groupId: id.nullable().default(null),
    modelChoice: assistantModelInput.optional(),
  })
  .strict();
const actionInput = z
  .object({
    kind: z.enum(["SET_STATUS", "SET_PRIORITY"]),
    status: assignmentStatus.nullable(),
    priority: z.number().int().min(0).max(100).nullable(),
    targets: z
      .array(z.object({ id, version: z.number().int().positive() }).strict())
      .min(1)
      .max(20),
  })
  .strict();
const applyInput = z
  .object({
    requestId: id,
    approvalToken: z.string().min(32).max(128),
    confirmation: z.literal("تطبيق التغييرات"),
  })
  .strict();
const titles: Record<AssistantPlan["tool"], string> = {
  overview: "ملخص العمل",
  accounts: "البحث في الحسابات",
  account_details: "ملف الحساب",
  intake: "الحسابات المستلمة",
  tasks: "متابعة المهام",
  reviews: "ما يحتاج مراجعتك",
  replies: "متابعة الردود",
  suggestions: "أولويات مقترحة من السجلات",
  ai_usage: "استهلاك الذكاء الاصطناعي",
  help: "كيف أساعدك",
};
const statusNames: Record<string, string> = {
  NEW: "جديد",
  NEEDS_REVIEW: "بحاجة مراجعة",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELED: "ملغى",
  APPROVED: "منتظر الإرسال",
  SENDING: "جارٍ الإرسال",
  SENT: "تم الإرسال",
  FAILED: "فشل الإرسال",
  UNKNOWN_DELIVERY: "تسليم غير محسوم",
  REVIEW: "مراجعة",
};
type Item = {
  id?: string;
  kind?: string;
  title: string;
  detail: string;
  accountId?: string;
  assignmentId?: string;
  version?: number;
  status?: string;
  priority?: number;
  destination?: string;
};
type Section = { title: string; items: Item[]; total?: number };
const accountProjection =
  "a.id,a.namespace,a.username_normalized,a.display_name,a.version,a.created_at,a.archived_at";
// Same normalization as the local resolver; parameters remain values, never SQL fragments.
const searchable = (column: string) =>
  `regexp_replace(translate(lower(${column}),'أإآىة','ااايه'),'[ً-ٰٟـ]','','g')`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export class AssistantService {
  constructor(
    private pool: pg.Pool,
    private ai: AiRuntime,
  ) {}
  async recoverInterrupted() {
    await this.pool.query(
      "UPDATE assistant_turns SET state='LOCAL',model_status='INTERRUPTED' WHERE state='PLANNING'",
    );
  }
  private async counts(
    db: pg.Pool | pg.PoolClient = this.pool,
    focus: string | null = null,
    group: string | null = null,
  ) {
    return (
      await db.query(
        `SELECT
      (SELECT count(*)::int FROM accounts a WHERE a.archived_at IS NULL AND ($1::uuid IS NULL OR a.id=$1) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM assignments t JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id WHERE t.account_id=a.id AND s.group_id=$2))) accounts,
      (SELECT count(*)::int FROM assignments t JOIN accounts a ON a.id=t.account_id WHERE a.archived_at IS NULL AND t.status NOT IN ('COMPLETED','CANCELED') AND ($1::uuid IS NULL OR t.account_id=$1) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM assignment_sources az JOIN source_messages s ON s.id=az.source_message_id WHERE az.assignment_id=t.id AND s.group_id=$2))) open,
      (SELECT count(*)::int FROM source_messages s WHERE s.state='REVIEW' AND ($2::uuid IS NULL OR s.group_id=$2) AND ($1::uuid IS NULL OR s.review_account_id=$1)) reviews,
      (SELECT count(*)::int FROM reply_jobs r JOIN assignments t ON t.id=r.assignment_id JOIN source_messages s ON s.id=r.source_message_id WHERE r.status IN ('APPROVED','SENDING','UNKNOWN_DELIVERY','FAILED') AND ($1::uuid IS NULL OR t.account_id=$1) AND ($2::uuid IS NULL OR s.group_id=$2)) "pendingReplies"`,
        [focus, group],
      )
    ).rows[0];
  }
  private async resolve(
    question: string,
    focus: string | null,
    includeArchived = false,
    groupId: string | null = null,
  ) {
    const terms = assistantSearchTerms(question);
    const scope = `($1::boolean OR a.archived_at IS NULL) AND ($2::uuid IS NULL OR EXISTS(
      SELECT 1 FROM assignments t JOIN assignment_sources az ON az.assignment_id=t.id
      JOIN source_messages s ON s.id=az.source_message_id WHERE t.account_id=a.id AND s.group_id=$2))`;
    if (terms.length) {
      const params: (string | boolean | null)[] = [includeArchived, groupId];
      const where = terms
        .map((term) => {
          params.push(`%${escapeLike(term)}%`);
          return `(${searchable("a.display_name")} LIKE $${params.length} ESCAPE '\\' OR lower(a.username_normalized) LIKE $${params.length} ESCAPE '\\')`;
        })
        .join(" AND ");
      return {
        accounts: (
          await this.pool.query(
            `SELECT ${accountProjection} FROM accounts a WHERE ${scope} AND ${where} ORDER BY a.display_name,a.id LIMIT 20`,
            params,
          )
        ).rows,
        searched: true,
      };
    }
    if (focus)
      return {
        accounts: (
          await this.pool.query(
            `SELECT ${accountProjection} FROM accounts a WHERE ${scope} AND a.id=$3`,
            [includeArchived, groupId, focus],
          )
        ).rows,
        searched: true,
      };
    return { accounts: [], searched: false };
  }
  async ask(raw: unknown) {
    const p = askInput.parse(raw),
      fingerprint = hash(JSON.stringify(p));
    if (
      new Set(p.question.match(/\bs2\d{7,10}\b/gi)?.map((s) => s.toLowerCase()))
        .size > 1
    )
      throw new Fault("ASSISTANT_ONE_ACCOUNT_AT_A_TIME", 400);
    // Credentials pasted as a message bundle never enter planning, storage or provider input.
    if (
      parseMessage(p.question).password ||
      /(?:password|باسورد|كلمه\s*المرور)\s*[:=]/i.test(
        normalizeAssistant(p.question),
      )
    )
      throw new Fault("ASSISTANT_CREDENTIAL_INPUT_REJECTED", 400);
    const prior = (
      await this.pool.query(
        "SELECT id,request_hash FROM assistant_turns WHERE id=$1",
        [p.requestId],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_hash !== fingerprint)
        throw new Fault("ASSISTANT_IDEMPOTENCY_CONFLICT");
      return this.turn(p.requestId);
    }
    let parent: any = null;
    if (p.parentId) {
      parent = (
        await this.pool.query(
          "SELECT * FROM assistant_turns WHERE id=$1 AND thread_id=$2",
          [p.parentId, p.threadId],
        )
      ).rows[0];
      if (!parent || parent.state === "PLANNING")
        throw new Fault("ASSISTANT_CONTEXT_UNAVAILABLE");
    }
    const normalized = normalizeAssistant(p.question);
    const global =
      /(?:كل الحسابات|جميع الحسابات|ملخص|موجز|وصلتني اليوم|استلمت اليوم|overview|briefing)/.test(
        normalized,
      );
    const inherited =
      !global && parent?.account_ids?.length === 1
        ? parent.account_ids[0]
        : null;
    const accountCommand = normalized.match(
      /^(?:من فضلك )?(ارشف|ارشفة|ارشفه|استرجع|استرجاع) (?:هذا )?الحساب(?: (.+))?$/u,
    );
    const revealCommand = normalized.match(
      /^(?:اعرض|اظهر|وريني) (?:بيانات الحساب(?: الكامله)?|كلمه المرور(?: للحساب)?|الباسورد(?: للحساب)?)(?: (.+))?$/u,
    );
    const accountOperation = accountCommand
      ? accountCommand[1]!.startsWith("استرج")
        ? "restore"
        : "archive"
      : revealCommand
        ? "reveal"
        : null;
    const lookup = accountOperation
      ? (accountCommand?.[2] ?? revealCommand?.[1] ?? "")
      : p.question;
    const resolved = await this.resolve(
      lookup,
      global ? null : (p.focusAccountId ?? inherited),
      accountOperation !== null,
      p.groupId,
    );
    let plan = localAssistantIntent(p.question, resolved.accounts.length === 1);
    if (resolved.searched && resolved.accounts.length !== 1)
      plan = {
        ...plan,
        tool: "accounts",
        action: "NONE",
        actionStatus: null,
        priority: null,
      };
    if (
      /(?:ارسل|ارسال|احذف|حذف|الباسورد|كلمه المرور|password|delete|send)/.test(
        normalized,
      )
    )
      plan = {
        ...plan,
        tool: "help",
        action: "NONE",
        actionStatus: null,
        priority: null,
      };
    if (accountOperation)
      plan = {
        ...plan,
        tool: resolved.accounts.length === 1 ? "account_details" : "accounts",
        action: "NONE",
        actionStatus: null,
        priority: null,
      };
    if (
      p.groupId &&
      !(await this.pool.query("SELECT id FROM groups WHERE id=$1", [p.groupId]))
        .rowCount
    )
      throw new Fault("NOT_FOUND", 404);
    const safe: SafeAssistantInput = {
      vocabulary: projectAssistantQuestion(p.question),
      baseline: plan,
      accountRefs: resolved.accounts.map((_, i) => `A${i}`),
      hasFocus: resolved.accounts.length === 1,
      lookupRequested: resolved.searched,
      counts: await this.counts(),
    };
    const inserted = await this.pool.query(
      "INSERT INTO assistant_turns(id,thread_id,parent_id,request_hash,safe_input,plan,account_ids,group_id,anchor_date,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PLANNING') ON CONFLICT(id) DO NOTHING RETURNING id",
      [
        p.requestId,
        p.threadId,
        p.parentId,
        fingerprint,
        JSON.stringify(accountOperation ? { ...safe, accountOperation } : safe),
        JSON.stringify(plan),
        resolved.accounts.map((a) => a.id),
        p.groupId,
        riyadhDate(),
      ],
    );
    if (!inserted.rowCount) {
      const row = (
        await this.pool.query(
          "SELECT request_hash FROM assistant_turns WHERE id=$1",
          [p.requestId],
        )
      ).rows[0];
      if (row.request_hash !== fingerprint)
        throw new Fault("ASSISTANT_IDEMPOTENCY_CONFLICT");
      return this.turn(p.requestId);
    }
    let modelStatus = "LOCAL",
      aiRequestId: string | null = null;
    // Ambiguity/unsupported actions are answered locally, without a paid model call.
    if (
      !accountOperation &&
      plan.tool !== "help" &&
      !(resolved.searched && resolved.accounts.length !== 1)
    ) {
      try {
        const result = await this.ai.assistantPlan(
          safe,
          p.requestId,
          p.modelChoice,
        );
        aiRequestId = result.requestId;
        modelStatus = result.status;
        if (result.plan) plan = result.plan;
      } catch (e) {
        modelStatus =
          e instanceof Fault &&
          [
            "AI_DISABLED",
            "AI_DAILY_LIMIT",
            "AI_CONFIGURATION_REQUIRED",
            "AI_MODEL_UNAVAILABLE",
            "CONFLICT",
          ].includes(e.code)
            ? e.code
            : "UNAVAILABLE";
      }
    }
    await this.pool.query(
      "UPDATE assistant_turns SET plan=$2,state=$3,model_status=$4,ai_request_id=$5 WHERE id=$1 AND state='PLANNING'",
      [
        p.requestId,
        JSON.stringify(plan),
        modelStatus === "SUCCEEDED" ? "READY" : "LOCAL",
        modelStatus,
        aiRequestId,
      ],
    );
    // No raw chat retention: only safe enum plans, UUID references and fingerprints.
    await this.pool.query(
      "DELETE FROM assistant_turns WHERE created_at < now()-interval '90 days'",
    );
    return this.turn(p.requestId);
  }
  async threads() {
    return {
      items: (
        await this.pool.query(
          "SELECT * FROM (SELECT DISTINCT ON(thread_id) thread_id,id,plan->>'tool' tool,created_at FROM assistant_turns ORDER BY thread_id,created_at DESC,id DESC) latest ORDER BY created_at DESC,thread_id LIMIT 20",
        )
      ).rows
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 20)
        .map((r) => ({
          threadId: r.thread_id,
          lastTurnId: r.id,
          title: titles[r.tool as AssistantPlan["tool"]] ?? titles.overview,
          updatedAt: r.created_at,
        })),
    };
  }
  async history(threadId: string) {
    const rows = (
      await this.pool.query(
        "SELECT id FROM assistant_turns WHERE thread_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20",
        [id.parse(threadId)],
      )
    ).rows.reverse();
    const items = [];
    for (const row of rows) items.push(await this.turn(row.id));
    return {
      items,
      historyMode: "safe-plans-current-records",
      timezone: "Asia/Riyadh",
    };
  }
  async turn(turnId: string) {
    const row = (
      await this.pool.query(
        "SELECT t.*,t.anchor_date::text anchor,r.provider,r.model FROM assistant_turns t LEFT JOIN ai_requests r ON r.id=t.ai_request_id WHERE t.id=$1",
        [id.parse(turnId)],
      )
    ).rows[0];
    if (!row) throw new Fault("NOT_FOUND", 404);
    const plan = assistantPlan.parse(row.plan),
      range = riyadhRange(plan.period, row.anchor),
      sections: Section[] = [];
    const result: any = {
      id: row.id,
      threadId: row.thread_id,
      title: titles[plan.tool],
      provider: row.provider ?? null,
      model: row.model ?? null,
      requestLabel: titles[assistantPlan.parse(row.safe_input.baseline).tool],
      state: row.state,
      modelStatus: row.model_status,
      origin: row.state === "READY" ? "AI_TOOL_PLAN" : "LOCAL_TOOLS",
      observedAt: new Date().toISOString(),
      requestedAt: row.created_at,
      anchorDate: row.anchor,
      timezone: "Asia/Riyadh",
      period: plan.period,
      range,
      summary: "",
      sections,
      action: null,
      accountAction: null,
      accountReference: null,
      contextAccountId:
        row.account_ids.length === 1 ? row.account_ids[0] : null,
    };
    if (row.state === "PLANNING") {
      result.summary = "الطلب قيد المعالجة. استعلم عن نتيجته دون إعادة إرساله.";
      return result;
    }
    await transaction(this.pool, async (db) => {
      await db.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const accountIds: string[] = row.account_ids;
      const operation = row.safe_input.accountOperation;
      if (operation === "reveal") result.requestLabel = "عرض بيانات الحساب";
      if (operation === "archive") result.requestLabel = "أرشفة الحساب";
      if (operation === "restore") result.requestLabel = "استرجاع الحساب";
      const selected = accountIds.length
        ? (
            await db.query(
              `SELECT ${accountProjection} FROM accounts a WHERE a.id=ANY($1::uuid[]) AND ($2::boolean OR a.archived_at IS NULL) ORDER BY a.display_name,a.id`,
              [
                accountIds,
                ["archive", "restore", "reveal"].includes(operation),
              ],
            )
          ).rows
        : [];
      if (accountIds.length && !selected.length) {
        result.summary =
          "الحساب المحدد لم يعد متاحًا. ابحث من جديد؛ لا تُعرض نسخة شخصية قديمة.";
        return;
      }
      const focus = selected.length === 1 ? selected[0].id : null;
      if (focus) {
        const account = selected[0];
        result.accountReference = {
          id: focus,
          name: account.display_name,
          username: account.username_normalized,
        };
        if (
          (operation === "archive" && account.archived_at === null) ||
          (operation === "restore" && account.archived_at !== null)
        )
          result.accountAction = {
            ...result.accountReference,
            kind: operation,
            version: account.version,
          };
        if (["archive", "restore", "reveal"].includes(operation)) {
          result.summary = `${account.display_name} • ${account.username_normalized}`;
          if (operation === "archive" && !result.accountAction)
            result.summary += " • الحساب مؤرشف بالفعل";
          if (operation === "restore" && !result.accountAction)
            result.summary += " • الحساب نشط بالفعل";
          return;
        }
      }
      const counts = await this.counts(db, focus, row.group_id);
      const params = [focus, row.group_id, range.start, range.end, plan.status];
      const taskDate =
        plan.status === "COMPLETED" && plan.action === "NONE"
          ? "t.completed_at"
          : "t.created_at";
      const taskWhere = `a.archived_at IS NULL AND ($1::uuid IS NULL OR a.id=$1) AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM assignment_sources az JOIN source_messages sz ON sz.id=az.source_message_id WHERE az.assignment_id=t.id AND sz.group_id=$2)) AND ($3::timestamptz IS NULL OR ${taskDate} >= $3) AND ($4::timestamptz IS NULL OR ${taskDate} < $4) AND ($5='ANY' OR ($5='OPEN' AND t.status NOT IN ('COMPLETED','CANCELED')) OR t.status=$5)`;
      const taskOrder =
        plan.sort === "PRIORITY"
          ? "t.priority DESC,t.created_at,t.id"
          : plan.sort === "OLDEST"
            ? "t.created_at,t.id"
            : "t.created_at DESC,t.id";
      const getTasks = async () =>
        (
          await db.query(
            `SELECT t.id,t.version,t.status,t.priority,t.period_key,t.created_at,t.completed_at,a.id account_id,a.display_name,a.username_normalized,tt.name task_name,COALESCE((SELECT string_agg(DISTINCT g.title,'، ' ORDER BY g.title) FROM assignment_sources az JOIN source_messages sz ON sz.id=az.source_message_id JOIN groups g ON g.id=sz.group_id WHERE az.assignment_id=t.id),'بلا مصدر مجموعة') groups FROM assignments t JOIN accounts a ON a.id=t.account_id JOIN task_types tt ON tt.id=t.task_type_id WHERE ${taskWhere} ORDER BY ${taskOrder} LIMIT 20`,
            params,
          )
        ).rows;
      const taskItem = (t: any): Item => ({
        id: t.id,
        kind: "assignment",
        title: `${t.display_name} • ${t.task_name}`,
        detail: `${t.username_normalized} • ${statusNames[t.status]} • أولوية ${t.priority} • ${t.period_key}\nالمجموعات: ${t.groups}`,
        accountId: t.account_id,
        assignmentId: t.id,
        version: t.version,
        status: t.status,
        priority: t.priority,
        destination: "account-details",
      });
      if (plan.tool === "help") {
        result.summary =
          "أبحث في حساباتك ومصادرها ومهامها، وألخص الاستقبال والعمل والمراجعات والردود. أجهّز تغيير حالة أو أولوية مهام محددة ثم أعرض المعاينة لتأكيدك. لا أرسل واتساب أو أحذف بيانات أو أكشف كلمات مرور.";
        sections.push({
          title: "أمثلة مفيدة",
          items: [
            "ملخص العمل اليوم",
            "الحسابات التي وصلتني اليوم وما مهامها",
            "ابحث عن حساب ثم اسأل عن مجموعاته ومهامه المكتملة",
            "اعرض المهام المفتوحة حسب الأولوية",
            "ما الأعمال القديمة التي تحتاج متابعة؟",
            "غيّر حالة مهام الحساب المحدد إلى قيد التنفيذ",
            "كم استهلاك الذكاء الاصطناعي اليوم؟",
          ].map((title) => ({ title, detail: "" })),
        });
      } else if (plan.tool === "overview" || plan.tool === "suggestions") {
        result.summary = `لديك ${counts.accounts} حسابًا، ${counts.open} مهمة مفتوحة، ${counts.reviews} رسالة للمراجعة، و${counts.pendingReplies} ردًا يحتاج متابعة.`;
        const workRange = riyadhRange(
          plan.period === "ALL" ? "TODAY" : plan.period,
          row.anchor,
        );
        const daily = Object.values(workRange);
        const dayStart = new Date(Date.parse(workRange.start!) + 10800000)
          .toISOString()
          .slice(0, 10);
        const dayEnd = new Date(Date.parse(workRange.end!) + 10800000 - 1)
          .toISOString()
          .slice(0, 10);
        const stats = (
          await db.query(
            "SELECT count(*) FILTER(WHERE t.priority>=50 AND t.status NOT IN ('COMPLETED','CANCELED'))::int urgent,count(*) FILTER(WHERE t.created_at<now()-interval '7 days' AND t.status NOT IN ('COMPLETED','CANCELED'))::int old,count(*) FILTER(WHERE t.status='COMPLETED' AND t.completed_at >= $1 AND t.completed_at < $2)::int completed FROM assignments t WHERE ($3::uuid IS NULL OR t.account_id=$3) AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM assignment_sources az JOIN source_messages s ON s.id=az.source_message_id WHERE az.assignment_id=t.id AND s.group_id=$4))",
            [...daily, focus, row.group_id],
          )
        ).rows[0];
        const received = (
          await db.query(
            "SELECT count(DISTINCT t.account_id)::int count FROM assignment_sources az JOIN assignments t ON t.id=az.assignment_id JOIN source_messages s ON s.id=az.source_message_id WHERE s.received_at >= $1 AND s.received_at < $2 AND ($3::uuid IS NULL OR t.account_id=$3) AND ($4::uuid IS NULL OR s.group_id=$4)",
            [...daily, focus, row.group_id],
          )
        ).rows[0].count;
        sections.push({
          title: `حركة العمل من ${dayStart} إلى ${dayEnd} (الرياض)`,
          items: [
            {
              title: `حسابات مستلمة: ${received}`,
              detail:
                "حسابات مرتبطة بمصادر وصلت في اليوم المحدد، بما فيها المتكرر.",
              destination: "accounts",
            },
            {
              title: `مهام اكتملت: ${stats.completed}`,
              detail: "بحسب وقت إكمال المهمة في اليوم المحدد.",
              destination: "assignments",
            },
          ],
        });
        const todo: Item[] = [];
        if (counts.reviews)
          todo.push({
            title: `${counts.reviews} رسالة تحتاج مراجعة`,
            detail: "أكمل البيانات أو تحقق من التعارض قبل اعتماد الحساب.",
            destination: "inbox",
          });
        const unknown = (
          await db.query(
            "SELECT r.status,count(*)::int count FROM reply_jobs r JOIN assignments t ON t.id=r.assignment_id JOIN source_messages s ON s.id=r.source_message_id WHERE r.status IN ('UNKNOWN_DELIVERY','FAILED','APPROVED','SENDING') AND ($1::uuid IS NULL OR t.account_id=$1) AND ($2::uuid IS NULL OR s.group_id=$2) GROUP BY r.status",
            [focus, row.group_id],
          )
        ).rows;
        for (const r of unknown)
          todo.push({
            title: `${r.count} • ${statusNames[r.status]}`,
            detail:
              r.status === "UNKNOWN_DELIVERY"
                ? "تحقق من التسليم؛ لا تعد إرسال رد مجهول تلقائيًا."
                : "راجع الردود وحالتها بصورة مستقلة عن إنجاز المهام.",
            destination: "replies",
          });
        if (stats.urgent)
          todo.push({
            title: `${stats.urgent} مهام ذات أولوية 50 فأعلى`,
            detail: "رتب العمل حسب الأولوية المسجلة.",
            destination: "assignments",
          });
        if (stats.old)
          todo.push({
            title: `${stats.old} مهام مفتوحة منذ أكثر من 7 أيام`,
            detail:
              "هذه قديمة ومفتوحة؛ لا يوجد موعد تسليم مسجل للحكم بأنها متأخرة.",
            destination: "assignments",
          });
        if (!todo.length)
          todo.push({
            title: "لا توجد تنبيهات متابعة ضمن المؤشرات الحالية",
            detail: "يمكنك مراجعة المهام أو إعداد مجموعاتك وقواعدها.",
            destination: "assignments",
          });
        sections.push({ title: "ما أنصح بمتابعته", items: todo });
      } else if (plan.tool === "accounts") {
        const searched = (row.safe_input as SafeAssistantInput).lookupRequested;
        const accounts = selected.length
          ? selected
          : searched
            ? []
            : (
                await db.query(
                  `SELECT ${accountProjection} FROM accounts a WHERE a.archived_at IS NULL AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM assignments t JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id WHERE t.account_id=a.id AND s.group_id=$1)) ORDER BY a.created_at DESC,a.id LIMIT 20`,
                  [row.group_id],
                )
              ).rows;
        result.summary =
          accounts.length > 1 && accountIds.length
            ? "وجدت أكثر من حساب محتمل. اختر الحساب المطلوب قبل تنفيذ أي إجراء."
            : accounts.length
              ? `هذه ${accounts.length} حسابات من النتائج المتاحة (حتى20).`
              : "لم أجد حسابًا مطابقًا. جرّب اليوزر الكامل أو جزءًا واضحًا من الاسم.";
        sections.push({
          title: "الحسابات",
          items: accounts.map((a) => ({
            id: a.id,
            kind: "account",
            title: a.display_name,
            detail: `${a.username_normalized} • ${a.namespace}`,
            accountId: a.id,
            version: a.version,
            destination: "account-details",
          })),
        });
      } else if (plan.tool === "account_details") {
        if (!focus) {
          result.summary =
            "حدد الحساب أولًا باليوزر أو الاسم، أو اختره من نتائج البحث.";
          return;
        }
        const a = selected[0];
        result.summary = `${a.display_name} • ${a.username_normalized} • ${a.namespace}`;
        const stats = (
          await db.query(
            "SELECT status,count(*)::int count FROM assignments WHERE account_id=$1 GROUP BY status",
            [focus],
          )
        ).rows;
        sections.push({
          title: "حالة العمل",
          items: stats.map((s) => ({
            title: `${statusNames[s.status]}: ${s.count}`,
            detail: "",
            accountId: focus,
            destination: "account-details",
          })),
        });
        const groups = (
          await db.query(
            "SELECT g.id,g.title,count(DISTINCT s.id)::int messages,max(s.received_at) last_received FROM assignments t JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id JOIN groups g ON g.id=s.group_id WHERE t.account_id=$1 GROUP BY g.id ORDER BY last_received DESC,g.id LIMIT 20",
            [focus],
          )
        ).rows;
        sections.push({
          title: "مجموعات ومصادر الحساب",
          items: groups.map((g) => ({
            id: g.id,
            kind: "group",
            title: g.title,
            detail: `${g.messages} رسائل مصدر • آخر استقبال ${g.last_received.toISOString()}`,
            accountId: focus,
            destination: "account-details",
          })),
        });
        sections.push({
          title: "المهام (حتى20)",
          items: (await getTasks()).map(taskItem),
        });
        const flags = (
          await db.query(
            "SELECT kind,verified,evidence_kind,created_at FROM issue_flags WHERE account_id=$1 ORDER BY created_at DESC LIMIT 5",
            [focus],
          )
        ).rows;
        if (flags.length)
          sections.push({
            title: "ملاحظات التحقق المسجلة",
            items: flags.map((f) => ({
              title: f.verified
                ? "مشكلة بيانات دخول مثبتة بسجل تحقق"
                : "بيانات تحتاج تحققًا",
              detail: `${f.evidence_kind} • ${f.created_at.toISOString()}`,
              accountId: focus,
              destination: "account-details",
            })),
          });
      } else if (plan.tool === "tasks") {
        const rows = await getTasks(),
          total = (
            await db.query(
              `SELECT count(*)::int count FROM assignments t JOIN accounts a ON a.id=t.account_id WHERE ${taskWhere}`,
              params,
            )
          ).rows[0].count;
        result.summary = `المهام المطابقة: ${total}؛ المعروض ${rows.length}. الفترة بحسب ${taskDate === "t.completed_at" ? "وقت الإكمال" : "إنشاء التكليف"}، والحالة الحالية موضحة لكل مهمة.`;
        sections.push({
          title:
            plan.sort === "OLDEST"
              ? "الأقدم أولًا"
              : plan.sort === "PRIORITY"
                ? "الأولوية الأعلى أولًا"
                : "الأحدث أولًا",
          total,
          items: rows.map(taskItem),
        });
        if (plan.action !== "NONE") {
          const missing =
            plan.action === "SET_STATUS"
              ? plan.actionStatus === null
              : plan.priority === null;
          if (missing)
            result.summary +=
              " حدد الحالة الجديدة أو الأولوية من0إلى100 قبل المعاينة.";
          else if (!rows.length)
            result.summary += " لا توجد مهام يمكن تعديلها ضمن النطاق.";
          else if (total > 20)
            result.summary +=
              " النطاق أكبر من20؛ حدد حسابًا أو مجموعة/فترة أضيق قبل تنفيذ تغيير جماعي.";
          else
            result.action = {
              kind: plan.action,
              status: plan.actionStatus,
              priority: plan.priority,
              targets: rows.map((t) => ({ id: t.id, version: t.version })),
              description:
                plan.action === "SET_STATUS"
                  ? `تغيير الحالة إلى ${statusNames[plan.actionStatus!]}`
                  : `تغيير الأولوية إلى ${plan.priority}`,
            };
        }
      } else if (plan.tool === "intake") {
        const intakeParams = [range.start, range.end, focus, row.group_id];
        const where =
          "($1::timestamptz IS NULL OR s.received_at>=$1) AND ($2::timestamptz IS NULL OR s.received_at<$2) AND ($3::uuid IS NULL OR a.id=$3) AND ($4::uuid IS NULL OR g.id=$4) AND a.archived_at IS NULL";
        const all = (
          await db.query(
            `SELECT count(DISTINCT a.id)::int accounts,count(DISTINCT s.id)::int messages,count(DISTINCT a.id) FILTER(WHERE ($1::timestamptz IS NULL OR a.created_at>=$1) AND ($2::timestamptz IS NULL OR a.created_at<$2))::int new FROM assignments t JOIN accounts a ON a.id=t.account_id JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id JOIN groups g ON g.id=s.group_id WHERE ${where}`,
            intakeParams,
          )
        ).rows[0];
        result.summary = `${all.accounts} حسابات مرتبطة بـ${all.messages} رسائل مصدر خلال الفترة؛ منها ${all.new} حسابات أُنشئت خلالها، والباقي سبق وجوده.`;
        const intake = (
          await db.query(
            `SELECT a.id,a.display_name,a.username_normalized,string_agg(DISTINCT g.title,'، ') groups,max(s.received_at) received_at FROM assignments t JOIN accounts a ON a.id=t.account_id JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id JOIN groups g ON g.id=s.group_id WHERE ${where} GROUP BY a.id ORDER BY received_at DESC,a.id LIMIT 20`,
            intakeParams,
          )
        ).rows;
        for (const a of intake) {
          const tasks = (
            await db.query(
              "SELECT DISTINCT tt.name,t.status FROM assignments t JOIN task_types tt ON tt.id=t.task_type_id JOIN assignment_sources az ON az.assignment_id=t.id JOIN source_messages s ON s.id=az.source_message_id WHERE t.account_id=$1 AND ($2::timestamptz IS NULL OR s.received_at>=$2) AND ($3::timestamptz IS NULL OR s.received_at<$3) AND ($4::uuid IS NULL OR s.group_id=$4) ORDER BY tt.name,t.status LIMIT 20",
              [a.id, range.start, range.end, row.group_id],
            )
          ).rows;
          sections.push({
            title: a.display_name,
            items: [
              {
                id: a.id,
                kind: "account",
                title: a.username_normalized,
                detail: `المجموعات: ${a.groups}\nآخر استقبال: ${a.received_at.toISOString()}\nالمهام المرتبطة بمصادر الفترة: ${tasks.map((t) => `${t.name} (${statusNames[t.status]})`).join("، ")}`,
                accountId: a.id,
                destination: "account-details",
              },
            ],
          });
        }
      } else if (plan.tool === "reviews") {
        const reviews = (
          await db.query(
            "SELECT s.id,s.received_at,g.title FROM source_messages s JOIN groups g ON g.id=s.group_id WHERE s.state='REVIEW' AND ($1::uuid IS NULL OR g.id=$1) AND ($2::uuid IS NULL OR s.review_account_id=$2) AND ($3::timestamptz IS NULL OR s.received_at>=$3) AND ($4::timestamptz IS NULL OR s.received_at<$4) ORDER BY s.received_at,s.id LIMIT 20",
            [row.group_id, focus, range.start, range.end],
          )
        ).rows;
        result.summary = `${counts.reviews} رسائل تحتاج مراجعة في نطاق الحساب/المجموعة؛ المعروض ${reviews.length} وفق الفترة. النص والاعتمادات لا يقرؤها المساعد.`;
        sections.push({
          title: "الأقدم أولًا",
          items: reviews.map((s) => ({
            id: s.id,
            kind: "review",
            title: s.title,
            detail: `استقبال ${s.received_at.toISOString()}`,
            destination: "inbox",
          })),
        });
      } else if (plan.tool === "replies") {
        const replies = (
          await db.query(
            "SELECT r.id,r.status,r.approved_at,a.id account_id,a.display_name,tt.name,g.title group_title FROM reply_jobs r JOIN assignments t ON t.id=r.assignment_id JOIN accounts a ON a.id=t.account_id JOIN task_types tt ON tt.id=t.task_type_id JOIN source_messages s ON s.id=r.source_message_id JOIN groups g ON g.id=s.group_id WHERE ($1::uuid IS NULL OR a.id=$1) AND ($2::uuid IS NULL OR g.id=$2) AND ($3::timestamptz IS NULL OR r.approved_at>=$3) AND ($4::timestamptz IS NULL OR r.approved_at<$4) ORDER BY CASE WHEN r.status='UNKNOWN_DELIVERY' THEN 0 WHEN r.status IN ('FAILED','APPROVED','SENDING') THEN 1 ELSE 2 END,r.approved_at DESC,r.id LIMIT 20",
            [focus, row.group_id, range.start, range.end],
          )
        ).rows;
        result.summary =
          "حالة الرد مستقلة عن حالة المهمة. التسليم غير المحسوم يحتاج تحققًا، ولا يعاد إرساله تلقائيًا. لا يرسل المساعد ردودًا.";
        sections.push({
          title: "الردود التي تحتاج متابعة أولًا (حتى20)",
          items: replies.map((r) => ({
            id: r.id,
            kind: "reply",
            title: `${r.display_name} • ${r.name}`,
            detail: `${statusNames[r.status]} • ${r.group_title} • ${r.approved_at.toISOString()}`,
            accountId: r.account_id,
            destination: "replies",
          })),
        });
      } else if (plan.tool === "ai_usage") {
        const usage = await this.ai.usage(db),
          settings = await this.ai.settings(db),
          today = usage.today;
        result.summary = `استخدام اليوم UTC: ${today.requests} طلبات من حد${settings.dailyRequestLimit}؛ نجحت ${today.succeeded}. الحد مشترك بين المساعد وتحليل الوارد.`;
        sections.push({
          title: "الاستهلاك والحجز",
          items: [
            {
              title: `توكنات المزود: ${today.promptTokens} إدخال / ${today.completionTokens} إخراج`,
              detail: `حجوزات غير محسومة: ${today.unresolvedReservedTokens} من حد${settings.dailyTokenLimit}. الحجز ليس مبلغًا مدفوعًا.`,
            },
            {
              title: `تكلفة تقديرية: ${today.estimatedCostUsd ?? "غير معلومة"} USD`,
              detail: `تكلفة أبلغ بها المزود: ${today.reportedCostUsd ?? "غير معلومة"} USD. التقدير ليس فاتورة.`,
              destination: "ai",
            },
          ],
        });
      }
    });
    return result;
  }
  async previewAction(raw: unknown) {
    const p = actionInput.parse(raw);
    if (
      new Set(p.targets.map((t) => t.id)).size !== p.targets.length ||
      (p.kind === "SET_STATUS"
        ? p.status === null || p.priority !== null
        : p.priority === null || p.status !== null)
    )
      throw new Fault("VALIDATION_ERROR", 400);
    return transaction(this.pool, async (db) => {
      const rows = (
        await db.query(
          "SELECT t.id,t.version,t.account_id,t.status,t.priority,a.version account_version,a.archived_at,a.display_name,a.username_normalized,tt.name task_name FROM assignments t JOIN accounts a ON a.id=t.account_id JOIN task_types tt ON tt.id=t.task_type_id WHERE t.id=ANY($1::uuid[]) ORDER BY t.id",
          [p.targets.map((t) => t.id)],
        )
      ).rows;
      if (
        rows.length !== p.targets.length ||
        rows.some(
          (r) =>
            r.archived_at ||
            p.targets.find((t) => t.id === r.id)!.version !== r.version,
        )
      )
        throw new Fault("CONFLICT");
      const changes = rows.filter((r) =>
        p.kind === "SET_STATUS"
          ? r.status !== p.status
          : r.priority !== p.priority,
      );
      if (!changes.length) throw new Fault("ASSISTANT_NO_CHANGES");
      const approval = token(),
        payload = {
          kind: p.kind,
          status: p.status,
          priority: p.priority,
          targets: changes.map((r) => ({
            id: r.id,
            version: r.version,
            accountId: r.account_id,
            accountVersion: r.account_version,
          })),
        };
      await db.query(
        "INSERT INTO approvals(token_hash,purpose,payload,expires_at) VALUES($1,'assistant-action',$2,now()+interval '2 minutes')",
        [hash(approval), JSON.stringify(payload)],
      );
      return {
        approvalToken: approval,
        expiresInSeconds: 120,
        confirmation: "تطبيق التغييرات",
        count: changes.length,
        kind: p.kind,
        status: p.status,
        priority: p.priority,
        changes: changes.map((r) => ({
          id: r.id,
          account: r.display_name,
          username: r.username_normalized,
          task: r.task_name,
          before:
            p.kind === "SET_STATUS"
              ? statusNames[r.status]
              : String(r.priority),
          after:
            p.kind === "SET_STATUS"
              ? statusNames[p.status!]
              : String(p.priority),
        })),
      };
    });
  }
  async actionReceipt(requestId: string) {
    const row = (
      await this.pool.query(
        "SELECT result FROM assistant_action_receipts WHERE request_id=$1",
        [id.parse(requestId)],
      )
    ).rows[0];
    if (!row) throw new Fault("NOT_FOUND", 404);
    return row.result;
  }
  async receipts() {
    return {
      items: (
        await this.pool.query(
          "SELECT request_id,created_at,result FROM assistant_action_receipts ORDER BY created_at DESC,request_id LIMIT 10",
        )
      ).rows,
    };
  }
  async applyAction(raw: unknown) {
    const p = applyInput.parse(raw),
      approvalHash = hash(p.approvalToken);
    return transaction(this.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(8240010)");
      const prior = (
        await db.query(
          "SELECT approval_hash,result FROM assistant_action_receipts WHERE request_id=$1",
          [p.requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.approval_hash !== approvalHash)
          throw new Fault("ASSISTANT_IDEMPOTENCY_CONFLICT");
        return prior.result;
      }
      const approval = (
        await db.query(
          "SELECT payload FROM approvals WHERE token_hash=$1 AND purpose='assistant-action' AND consumed_at IS NULL AND expires_at>now() FOR UPDATE",
          [approvalHash],
        )
      ).rows[0];
      if (!approval) throw new Fault("APPROVAL_EXPIRED");
      const payload = approval.payload;
      // Match the established account->assignment lock order, and freeze account versions as well.
      const accountIds = [
        ...new Set(payload.targets.map((r: any) => r.accountId)),
      ].sort();
      const accounts = (
        await db.query(
          "SELECT id,version,archived_at FROM accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [accountIds],
        )
      ).rows;
      const assignments = (
        await db.query(
          "SELECT id,account_id,version FROM assignments WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
          [payload.targets.map((r: any) => r.id)],
        )
      ).rows;
      if (
        assignments.length !== payload.targets.length ||
        payload.targets.some((t: any) => {
          const a = accounts.find((a) => a.id === t.accountId),
            assignment = assignments.find((a) => a.id === t.id);
          return (
            !a ||
            a.archived_at ||
            a.version !== t.accountVersion ||
            !assignment ||
            assignment.account_id !== t.accountId ||
            assignment.version !== t.version
          );
        })
      )
        throw new Fault("CONFLICT");
      const updated = [];
      for (const target of payload.targets) {
        const row = (
          await db.query(
            payload.kind === "SET_STATUS"
              ? "UPDATE assignments SET status=$2,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END,version=version+1 WHERE id=$1 RETURNING id,account_id,version,status,priority"
              : "UPDATE assignments SET priority=$2,version=version+1 WHERE id=$1 RETURNING id,account_id,version,status,priority",
            [
              target.id,
              payload.kind === "SET_STATUS" ? payload.status : payload.priority,
            ],
          )
        ).rows[0];
        updated.push(row);
        await event(
          db,
          payload.kind === "SET_STATUS"
            ? "ASSIGNMENT_STATUS_CHANGED"
            : "ASSIGNMENT_PRIORITY_CHANGED",
          target.id,
        );
      }
      await db.query(
        "UPDATE accounts SET version=version+1 WHERE id=ANY($1::uuid[])",
        [accountIds],
      );
      await db.query(
        "UPDATE approvals SET consumed_at=now() WHERE token_hash=$1",
        [approvalHash],
      );
      const receipt = {
        requestId: p.requestId,
        status: "APPLIED",
        count: updated.length,
        assignments: updated,
        replyJobsCreated: 0,
      };
      await db.query(
        "INSERT INTO assistant_action_receipts(request_id,approval_hash,result) VALUES($1,$2,$3)",
        [p.requestId, approvalHash, JSON.stringify(receipt)],
      );
      return receipt;
    });
  }
}
