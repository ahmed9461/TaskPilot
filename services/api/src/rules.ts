import { normalize } from "./parser.js";
export interface Rule {
  task_type_id: string;
  keywords: string[];
  priority: number;
  enabled: boolean;
}
export function routeTask(raw: string, rules: Rule[], defaultTask: string) {
  // Identity/credential lines cannot determine task routing.
  const context = normalize(
    normalize(raw)
      .split(/\r?\n/)
      .filter(
        (line) =>
          !/^\s*(name|user(?:name)?|password|pass|الاسم|اليوزر|المستخدم|كلمة المرور)\s*[:：]/i.test(
            line,
          ),
      )
      .join("\n"),
  );
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
