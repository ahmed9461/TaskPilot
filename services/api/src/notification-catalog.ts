// User notifications are separate from the complete technical change/audit stream.
const catalog = {
  TASK_REMINDER_DUE: {
    title: "حان موعد متابعة مهمة",
    detail: "افتح المهمة لقراءة ملاحظتها ومتابعة العمل.",
    destination: "assignments",
    severity: "info",
  },
  FOLLOWUP_ACTIVITY_CREATED: {
    title: "نشاط جديد لحساب متابعة",
    detail: "أُضيف تكليف مستقل لحساب تحت المتابعة.",
    destination: "assignments",
    severity: "info",
  },
  MESSAGE_PROCESSED: {
    title: "وصل عمل جديد",
    detail: "تم استقبال بيانات الحساب وإنشاء التكليف. افتح المهام لمتابعته.",
    destination: "assignments",
    severity: "info",
  },
  MESSAGE_MISSING_FIELDS: {
    title: "رسالة تحتاج مراجعتك",
    detail:
      "لم تكتمل بيانات الرسالة أو لم تتضح مهمتها. راجعها لإكمال الاستقبال.",
    destination: "inbox",
    severity: "warning",
  },
  CREDENTIAL_REVIEW_REQUIRED: {
    title: "بيانات دخول تحتاج مراجعة",
    detail: "تختلف البيانات الواردة عن المحفوظة. تحقق منها قبل التعديل.",
    destination: "inbox",
    severity: "warning",
  },
  AI_SUGGESTION_READY: {
    title: "اقتراح جاهز للمراجعة",
    detail: "اكتمل تحليل الرسالة. راجع الحقول المقترحة ثم احفظها.",
    destination: "inbox",
    severity: "info",
  },
  CREDENTIAL_ERROR_VERIFIED: {
    title: "مشكلة مؤكدة في بيانات الدخول",
    detail: "سُجلت مشكلة اعتماد مثبتة. راجع الحساب لمعالجتها.",
    destination: "accounts",
    severity: "warning",
  },
  ACCOUNT_CREDENTIALS_UNVERIFIED: {
    title: "بيانات دخول تنتظر التحقق",
    detail: "توجد بيانات اعتماد غير متحقق منها. افتح الحساب للمراجعة.",
    destination: "accounts",
    severity: "warning",
  },
  REPLY_SENT: {
    title: "أُرسل الرد",
    detail: "سُجل إرسال الرد المعتمد. يمكنك مراجعة نتيجته في سجل الردود.",
    destination: "replies",
    severity: "success",
  },
  REPLY_FAILED: {
    title: "تعذر إرسال رد",
    detail: "فشل إرسال الرد. راجع نتيجته قبل اتخاذ إجراء جديد.",
    destination: "replies",
    severity: "error",
  },
  REPLY_DELIVERY_UNKNOWN: {
    title: "تسليم رد يحتاج تحققًا",
    detail: "لم تُحسم نتيجة التسليم. تحقق من واتساب قبل إعادة الإرسال.",
    destination: "replies",
    severity: "warning",
  },
} as const;
export const notificationTypes = Object.keys(catalog);
export function notificationDetails(type: string) {
  return Object.hasOwn(catalog, type)
    ? catalog[type as keyof typeof catalog]
    : null;
}
