import { z } from "zod";

export const assistantTool = z.enum([
  "overview",
  "accounts",
  "account_details",
  "intake",
  "tasks",
  "reviews",
  "replies",
  "suggestions",
  "ai_usage",
  "help",
]);
export const assistantPeriod = z.enum([
  "TODAY",
  "YESTERDAY",
  "LAST_7_DAYS",
  "THIS_MONTH",
  "ALL",
]);
export const assistantStatus = z.enum([
  "ANY",
  "OPEN",
  "NEW",
  "NEEDS_REVIEW",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
]);
export const assistantPlan = z
  .object({
    tool: assistantTool,
    period: assistantPeriod,
    status: assistantStatus,
    sort: z.enum(["RECENT", "PRIORITY", "OLDEST"]),
    action: z.enum(["NONE", "SET_STATUS", "SET_PRIORITY"]),
    actionStatus: z
      .enum(["NEW", "NEEDS_REVIEW", "IN_PROGRESS", "COMPLETED", "CANCELED"])
      .nullable(),
    priority: z.number().int().min(0).max(100).nullable(),
  })
  .strict();
export type AssistantPlan = z.infer<typeof assistantPlan>;
export const normalizeAssistant = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (n) => String(n.charCodeAt(0) - 0x660))
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .trim();

// This is a fixed product vocabulary, never an arbitrary substring/redaction of personal text.
const vocabulary = new Set(
  normalizeAssistant(
    `انا انت لي عن في من على الى هذا هذه هو هي لهم له لها كل جميع اليوم امس الاسبوع الشهر الحالي السابق اخر خلال جديد جديده وصلت وصل وصلتني استلمت استلمتها استقبلت تلقينا تلقاها حساب الحساب حسابات الحسابات يوزر اليوزر ابحث ابحثلي بحث دور دورلي وين اين اي ما ماهي ماذا كم مين اسم باسم تفاصيل معلومات ملخص موجز تقرير صباح صباحي يومي اعمال عمل شغل المشروع المهام مهمه المهمه مهام تكليف تكليفات منجز منجزه المنجزه مكتمل مكتمله المكتمله انتهت انتهي انتهى خلصت اكمال غير لم باقي الباقي المتبقي متبقي المفتوحه مفتوحه مفتوح قيد التنفيذ جاري جارية متوقف متعطل محظور قديم قديمه الاقدم اولويه الاولويه عاجل عاجله عاليه متوسطه منخفضه صفر حاله الحالات حالته حالتها غيره تغيير غير عدل اجعل خلي خل خلها خليه حط حدد حدث ارفع اخفض اوقف الغي الغاء ملغي ملغاه جديده جديد احتاج يحتاج تحتاج مراجعه المراجعه صندوق الوارد الردود رد الرد ردي ارسل ارسلت ارسال منتظره انتظار طابور فشل فاشل فاشله نجح ناجح مرسل مرسله مجهول مجهوله تسليم مصدر مصادر المجموعه مجموعه المجموعات مجموعات ينتمي يتبع الاقتراحات اقتراح اقترح تنصح نصائح رتب اول اولويات الاولويات ابدا ابدأ بماذا مساعد مساعده تساعدني تستطيع قدراتك كيف استخدام استخدم اقدر ذكاء اصطناعي الذكاء الاصطناعي استهلاك استخدام تكلفه كلفه صرف ميزانيه حدود توكن توكنات طلب طلبات اعرض عرض وريني عطيني هات اعطني احصائيه احصائيات عدد اعداد فقط وكذلك ايضا ثم و او لكن بدون لا ليست ليس هل فيه يوجد عندي عندنا للي الي اللي حق حقت عنها عنه تمت تم انجز انهي حالة حالات تكتمل اتمام finish complete completed tasks accounts account search find group groups today yesterday week month pending open priority oldest recent review reviews reply replies sent failed unknown overview briefing help budget usage cost status set change cancel canceled new in progress`,
  ).split(" "),
);

for (const word of normalizeAssistant(
  "وش ايش وشهي وشو ماهو ممكن تقدر فضلا رجاء عندك طيب تمام سوي سو سويلي ابغا ابغى ابي ودي ارجو اريد لو سمحت بالنسبة استلم استقبل تلقى وصل اكمل غير المكتملة اكتملت انجزت ماذا وينها وينه ذي هذي هذيك هذاك تبع تابع تابعها متابعة بشكل نفس ايضا هاي هالحساب هالمهام",
).split(" "))
  vocabulary.add(word);
for (const word of [
  "التي",
  "الذي",
  "الذين",
  "وصول",
  "مستلم",
  "مستلمة",
  "استقبال",
  "متابعة",
  "المتابعة",
  "افعل",
  "ينقص",
  "ناقص",
  "تفصيلي",
  "مفصل",
  "احترافي",
])
  vocabulary.add(normalizeAssistant(word));
function domainWord(word: string): string | null {
  if (vocabulary.has(word)) return word;
  const bases = [word, word.replace(/^[وف]/, "")];
  for (const base of bases)
    for (const stem of [
      base,
      base.replace(/^ال/, ""),
      base.replace(/(?:ها|هم|هن|نا|ني|كم|كن|ه|ك)$/, ""),
      base.replace(/^ال/, "").replace(/(?:ها|هم|هن|نا|ني|كم|كن|ه|ك)$/, ""),
    ])
      if (vocabulary.has(stem)) return stem;
  if (/^(?:و|ف)?(?:ال)?(?:استلم|استقبل|تلق|وصل)/.test(word)) return "استلم";
  if (/^(?:و|ف)?(?:ال)?(?:مكتمل|اكتمل|منجز|انجز|خلص|انته)/.test(word))
    return "مكتمل";
  return null;
}
export function localAssistantIntent(
  question: string,
  hasFocus = false,
): AssistantPlan {
  const n = normalizeAssistant(question);
  const has = (...xs: string[]) =>
    xs.some((x) => n.includes(normalizeAssistant(x)));
  const period: AssistantPlan["period"] = has("أمس", "yesterday")
    ? "YESTERDAY"
    : has("أسبوع", "week")
      ? "LAST_7_DAYS"
      : has("شهر", "month")
        ? "THIS_MONTH"
        : has("اليوم", "today")
          ? "TODAY"
          : "ALL";
  let status: AssistantPlan["status"] =
    /(?:غير|لم)\s+(?:ال)?(?:مكتمل|منجز|تكتمل|تنجز)/.test(n) ||
    has(
      "غير مكتمل",
      "غير منجز",
      "لم تكتمل",
      "لم تنجز",
      "المتبقي",
      "باقي",
      "المفتوح",
      "open",
      "pending",
    )
      ? "OPEN"
      : has("قيد التنفيذ", "جاري", "in progress")
        ? "IN_PROGRESS"
        : has("مكتمل", "منجز", "خلص", "انته", "completed", "complete")
          ? "COMPLETED"
          : has("ملغي", "ملغى", "canceled", "cancel")
            ? "CANCELED"
            : has("مراجعة", "review")
              ? "NEEDS_REVIEW"
              : "ANY";
  const imperative =
    /^(?:(?:ارجو|اريد|ابغا|ابغي|ابي|ودي|لو|سمحت|فضلا|رجاء|ان|ممكن|طيب)\s+){0,6}(?:غير|عدل|اجعل|خلي|خل|خلها|خليه|حط|حدد|حدث|ارفع|اخفض|اكمل|انجز|انهي|الغ|الغي|سوي|سو|set|change|finish|complete)(?:\s|$)/.test(
      n,
    ) && !/^غير\s+(?:مكتمل|منجز)/.test(n);
  const action = imperative
    ? has("أولوية", "priority")
      ? "SET_PRIORITY"
      : has(
            "حالة",
            "مكتمل",
            "انجز",
            "انهي",
            "إكمال",
            "اكمل",
            "الغ",
            "جديد",
            "قيد التنفيذ",
            "finish",
            "status",
            "complete",
            "cancel",
          )
        ? "SET_STATUS"
        : "NONE"
    : "NONE";
  const number = n.match(
    /(?:اولويه|priority)(?:\s+[\p{L}]+){0,4}\s+(\d{1,3})(?:\s|$)/u,
  )?.[1];
  const priority =
    action === "SET_PRIORITY"
      ? number && Number(number) <= 100
        ? Number(number)
        : has("عالي", "عاجل", "ارفع")
          ? 100
          : has("متوسط")
            ? 50
            : has("منخفض", "اخفض", "صفر")
              ? 0
              : null
      : null;
  const clauses = n.split(/\s+(?:الي|الى|to)\s+/),
    desired = clauses.at(-1)!;
  const wants = (...values: string[]) =>
    values.some((s) => desired.includes(normalizeAssistant(s)));
  const actionStatus =
    action === "SET_STATUS"
      ? wants("الغ", "cancel")
        ? "CANCELED"
        : wants("جديد", "new")
          ? "NEW"
          : wants("قيد التنفيذ", "جاري", "in progress")
            ? "IN_PROGRESS"
            : wants("مراجعة", "review")
              ? "NEEDS_REVIEW"
              : wants(
                    "مكتمل",
                    "انجز",
                    "انهي",
                    "إكمال",
                    "اكمل",
                    "finish",
                    "complete",
                  )
                ? "COMPLETED"
                : null
      : null;
  if (action !== "NONE") {
    const target = clauses.length > 1 ? clauses.slice(0, -1).join(" ") : "";
    status =
      /(?:المكتمل|المنجز|completed)/.test(target) &&
      !/(?:غير\s+(?:ال)?(?:مكتمل|منجز)|لم\s)/.test(target)
        ? "COMPLETED"
        : "OPEN";
  }
  const tool: AssistantPlan["tool"] =
    action !== "NONE"
      ? "tasks"
      : has("استهلاك", "تكلفة", "ميزانية", "توكن", "usage", "cost", "budget")
        ? "ai_usage"
        : has("ردود", "الرد", "reply", "replies")
          ? "replies"
          : has("مراجعة", "review") && !has("مهمة", "مهام", "tasks")
            ? "reviews"
            : has("وصل", "استلم", "استقبل", "تلقي", "today", "yesterday") &&
                has("حساب", "accounts", "account")
              ? "intake"
              : has(
                    "مهام",
                    "مهمة",
                    "تكليف",
                    "tasks",
                    "مكتمل",
                    "منجز",
                    "المتبقي",
                  )
                ? "tasks"
                : has("ابحث", "بحث", "دور", "حساب", "account", "search", "find")
                  ? hasFocus
                    ? "account_details"
                    : "accounts"
                  : has(
                        "تنصح",
                        "اقترح",
                        "اقتراح",
                        "اولويات",
                        "ابدا",
                        "قديمة",
                        "الأقدم",
                      )
                    ? "suggestions"
                    : has("كيف", "مساعدة", "قدرات", "help")
                      ? "help"
                      : hasFocus
                        ? "account_details"
                        : "overview";
  return {
    tool,
    period,
    status,
    sort: has("قديم", "الأقدم", "oldest")
      ? "OLDEST"
      : has("أولوية", "اولويات", "priority")
        ? "PRIORITY"
        : "RECENT",
    action,
    actionStatus,
    priority,
  };
}
export function projectAssistantQuestion(question: string) {
  return [
    ...new Set(
      normalizeAssistant(question)
        .split(" ")
        .map(domainWord)
        .filter((word): word is string => word !== null),
    ),
  ].slice(0, 80);
}
export function assistantSearchTerms(question: string) {
  const n = normalizeAssistant(question);
  const username = n.match(/\bs2\d{7,10}\b/i)?.[0];
  if (username) return [username];
  return n
    .split(" ")
    .filter((s) => !domainWord(s) && !/^\d+$/.test(s) && s.length >= 2)
    .slice(0, 5);
}
export const safeAssistantInput = z
  .object({
    vocabulary: z.array(z.string().refine((s) => vocabulary.has(s))).max(80),
    baseline: assistantPlan,
    accountRefs: z.array(z.string().regex(/^A(?:[0-9]|1[0-9])$/)).max(20),
    hasFocus: z.boolean(),
    lookupRequested: z.boolean(),
    counts: z
      .object({
        accounts: z.number().int().nonnegative(),
        open: z.number().int().nonnegative(),
        reviews: z.number().int().nonnegative(),
        pendingReplies: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();
export type SafeAssistantInput = z.infer<typeof safeAssistantInput>;
export interface AssistantModelResult {
  plan: AssistantPlan;
  promptTokens: number | null;
  completionTokens: number | null;
  cacheHitTokens?: number | null;
  reportedCostUsd?: number | null;
}
export function validateAssistantPlan(
  value: unknown,
  safe: SafeAssistantInput,
) {
  const plan = assistantPlan.parse(value);
  // The model cannot authorize writes, change a requested action or widen an explicit date.
  if (
    plan.action !== safe.baseline.action ||
    plan.actionStatus !== safe.baseline.actionStatus ||
    plan.priority !== safe.baseline.priority ||
    plan.period !== safe.baseline.period ||
    (plan.action !== "NONE" && plan.status !== safe.baseline.status) ||
    (plan.action !== "NONE" && plan.tool !== "tasks")
  )
    throw new Error("AI_PLAN_REJECTED");
  return plan;
}

export function riyadhRange(period: AssistantPlan["period"], anchor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor))
    throw new Error("INVALID_ANCHOR_DATE");
  const end = new Date(`${anchor}T00:00:00+03:00`),
    start = new Date(end);
  if (period === "ALL") return { start: null, end: null };
  if (period === "YESTERDAY") start.setUTCDate(start.getUTCDate() - 1);
  else {
    end.setUTCDate(end.getUTCDate() + 1);
    if (period === "LAST_7_DAYS") start.setUTCDate(start.getUTCDate() - 6);
    if (period === "THIS_MONTH")
      start.setTime(Date.parse(`${anchor.slice(0, 7)}-01T00:00:00+03:00`));
  }
  return { start: start.toISOString(), end: end.toISOString() };
}
export const riyadhDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
