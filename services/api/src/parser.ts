export const normalize = (v: string) =>
  v.normalize("NFKC").trim().toLocaleLowerCase("en-US");
// WinUI TextBox uses CR; accept the common wire line endings consistently.
export const messageLines = (body: string) => body.split(/\r\n|\r|\n/);
type Role = "displayName" | "username" | "password";
const aliases: Record<string, Role> = {
  الاسم: "displayName",
  name: "displayName",
  اليوزر: "username",
  المستخدم: "username",
  username: "username",
  user: "username",
  "كلمة المرور": "password",
  password: "password",
  pass: "password",
  "رقم الطالب": "username",
  "الرقم الجامعي": "username",
  "اسم المستخدم": "username",
  يوزر: "username",
  الباسورد: "password",
  باسورد: "password",
  الباسوورد: "password",
  الباس: "password",
  "pass word": "password",
};
export type SegmentKind =
  "username" | "name" | "credential" | "course" | "text" | "partial";
export interface MessageSegment {
  index: number;
  value: string;
  kind: SegmentKind;
  explicit?: Role;
}
const asciiDigits = (v: string) =>
  v
    .normalize("NFKC")
    .replace(/[٠-٩۰-۹]/g, (c) =>
      String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0)),
    );
const unformat = (v: string) => v.trim().replace(/^(\*{1,2}|_|`)(.+)\1$/, "$2");
export function studentUsername(value: string): string | undefined {
  const compact = asciiDigits(unformat(value))
    .replace(/[ \t\u061c\u200e\u200f]/g, "")
    .replace(/@seu\.edu\.sa$/i, "");
  return /^s2\d{7,10}$/i.test(compact) ? "S" + compact.slice(1) : undefined;
}
const course =
  /^(?:law|islam|islm|comm|math|eng|it|cs|mgt|stat|fin|acc|biol|phys|chem|arab|hcm|mis|econ?)[-_ ]?\d{2,4}$/i;
const courseLine = (v: string) =>
  v.split(/[\s,،]+/).every((t) => course.test(t));
const contextual = (v: string) =>
  /^(?:المطلوب|المهمة|الماده|المادة|مواد|واجب|اختبار|حل|عندي|أبغى|ابغى|السلام|وعليكم|شكرا|شكرًا|لو سمحت|task|please|homework|quiz)(?:\s|[:：]|$)/iu.test(
    v,
  );
function kind(value: string): SegmentKind {
  if (studentUsername(value)) return "username";
  if (/^s[2٢۲][\d٠-٩۰-۹.\s…_-]*$/i.test(asciiDigits(unformat(value))))
    return "partial";
  if (courseLine(value)) return "course";
  if (contextual(value)) return "text";
  const plain = unformat(value);
  if (
    plain.length <= 200 &&
    !/[\p{N}:：=]/u.test(plain) &&
    (/^[\p{Script=Arabic}\p{M} '-]{2,200}$/u.test(plain) ||
      /^[A-Za-z]+(?:[ '-][A-Za-z]+){1,6}$/.test(plain))
  )
    return "name";
  if (
    value.length >= 4 &&
    value.length <= 1024 &&
    !/\s|https?:/i.test(value) &&
    !/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(value) &&
    /[A-Za-z]/.test(value) &&
    /[\d\p{P}\p{S}]/u.test(value)
  )
    return "credential";
  return "text";
}
// Values remain local. Password candidates are never normalized or unformatted.
export function messageSegments(body: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const add = (value: string, explicit?: Role) => {
    value = value.trim();
    if (!value) return;
    segments.push({
      index: segments.length,
      value,
      kind: explicit
        ? (
            {
              username: "username",
              displayName: "name",
              password: "credential",
            } as const
          )[explicit]
        : kind(value),
      ...(explicit ? { explicit } : {}),
    });
  };
  for (const raw of messageLines(body)) {
    const line = raw.trim();
    if (!line) continue;
    const labelled = /^([^:：=]{1,40})\s*[:：=]\s*(.+)$/.exec(line);
    const role = labelled ? aliases[normalize(labelled[1]!)] : undefined;
    if (role) {
      add(labelled![2]!, role);
      continue;
    }
    // Split only complete, separated identifiers; dots/truncated IDs are not repaired.
    const tokens = line.split(/\s+/);
    const studentTokens = tokens.filter((t) => studentUsername(t));
    if (studentTokens.length && tokens.length > 1) {
      let remainder: string[] = [];
      const flush = () => {
        if (!remainder.length) return;
        const joined = remainder.join(" ");
        if (kind(joined) === "name" || kind(joined) === "course") add(joined);
        else {
          let names: string[] = [];
          const flushNames = () => {
            if (names.length) add(names.join(" "));
            names = [];
          };
          for (const t of remainder) {
            if (kind(t) === "name") names.push(t);
            else {
              flushNames();
              add(t);
            }
          }
          flushNames();
        }
        remainder = [];
      };
      for (const t of tokens) {
        if (studentUsername(t)) {
          flush();
          add(t);
        } else remainder.push(t);
      }
      flush();
    } else add(line);
  }
  return segments;
}
export function hasAccountHint(body: string): boolean {
  return (
    /\bs2\d/i.test(asciiDigits(body)) ||
    messageSegments(body).some(
      (s) => s.explicit || s.kind === "username" || s.kind === "partial",
    )
  );
}
export function parseMessage(body: string) {
  const segments = messageSegments(body);
  const values = new Map<Role, string>();
  let ambiguous = false;
  for (const s of segments.filter((s) => s.explicit)) {
    if (values.has(s.explicit!)) ambiguous = true;
    values.set(s.explicit!, s.value);
  }
  const students = segments.filter(
    (s) => s.kind === "username" && studentUsername(s.value),
  );
  if (students.length) {
    if (segments.some((s) => s.kind === "partial")) ambiguous = true;
    const ids = new Set(students.map((s) => studentUsername(s.value)!));
    if (
      ids.size !== 1 ||
      (values.has("username") &&
        studentUsername(values.get("username")!) !== [...ids][0])
    )
      ambiguous = true;
    else values.set("username", [...ids][0]!);
    for (const [role, category] of [
      ["displayName", "name"],
      ["password", "credential"],
    ] as const) {
      const candidates = segments.filter(
        (s) => !s.explicit && s.kind === category,
      );
      if (!values.has(role)) {
        if (candidates.length === 1)
          values.set(
            role,
            role === "displayName"
              ? unformat(candidates[0]!.value)
              : candidates[0]!.value,
          );
        else if (candidates.length > 1) ambiguous = true;
      }
    }
    // The username is a display label, not an invented person's name.
    if (!values.has("displayName") && !ambiguous && values.has("password"))
      values.set("displayName", values.get("username")!);
    if (
      !values.has("password") &&
      !segments.some(
        (s) => s.explicit === "username" && values.has("displayName"),
      )
    )
      ambiguous = true;
  }
  return {
    username: values.get("username"),
    displayName: values.get("displayName"),
    password: values.get("password"),
    needsReview:
      ambiguous || !values.has("username") || !values.has("displayName"),
  };
}

export type FieldSelection = {
  username: number | null;
  displayName: number | null;
  password: number | null;
};
// Opaque single tokens are AI review candidates only, never automatic credentials.
export function opaqueCredentialCandidate(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length <= 1024 &&
    !/\s|https?:/i.test(value) &&
    !/^[^@]+@[^@]+\.[a-z]{2,}$/i.test(value) &&
    !contextual(value) &&
    !courseLine(value) &&
    !studentUsername(value) &&
    /^[A-Za-z0-9\p{P}\p{S}]+$/u.test(value)
  );
}
export function selectedMessageFields(body: string, selected: FieldSelection) {
  const segments = messageSegments(body);
  const result: { username?: string; displayName?: string; password?: string } =
    {};
  const used = new Set<number>();
  for (const [role, category] of [
    ["username", "username"],
    ["displayName", "name"],
    ["password", "credential"],
  ] as const) {
    const index = selected[role];
    if (index === null) continue;
    const s = segments[index];
    if (
      !Number.isSafeInteger(index) ||
      !s ||
      (s.kind !== category &&
        !(
          role === "password" &&
          s.kind === "text" &&
          opaqueCredentialCandidate(s.value)
        )) ||
      used.has(index) ||
      (s.explicit && s.explicit !== role)
    )
      throw new Error("AI_FIELD_SELECTION_REJECTED");
    const value =
      role === "username"
        ? (studentUsername(s.value) ??
          (s.explicit === "username" ? s.value : undefined))
        : role === "displayName"
          ? unformat(s.value)
          : s.value;
    if (!value || value.length > (role === "password" ? 1024 : 200))
      throw new Error("AI_FIELD_SELECTION_REJECTED");
    result[role] = value;
    used.add(index);
  }
  return result;
}
