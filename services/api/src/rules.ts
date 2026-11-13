import { normalize } from "./parser.js";
export interface Rule {
  task_type_id: string;
  keywords: string[];
  priority: number;
  enabled: boolean;
}
export function routingContext(raw: string) {
  // Identity/credential lines cannot determine task routing.
  return normalize(
    normalize(raw)
      .split(/\r?\n/)
      .filter(
        (line) =>
          !/^\s*(name|user(?:name)?|password|pass|otp|code|email|phone|الاسم|اليوزر|المستخدم|كلمة المرور|الرمز|رمز|الهاتف|البريد)\s*[:：]/i.test(
            line,
          ),
      )
      .join("\n"),
  );
}
export function routeTask(raw: string, rules: Rule[], defaultTask: string) {
  const context = routingContext(raw);
  const matches = rules.filter(
    (r) => r.enabled && r.keywords.some((k) => context.includes(normalize(k))),
  );
  const top = Math.max(0, ...matches.map((r) => r.priority));
  const selected = [
    ...new Set(
      matches.filter((r) => r.priority === top).map((r) => r.task_type_id),
    ),
  ];
  return {
    taskTypeId: selected.length === 1 ? selected[0]! : defaultTask,
    priority: top,
    ambiguous: selected.length > 1,
  };
}
