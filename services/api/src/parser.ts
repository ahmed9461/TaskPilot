export const normalize = (v: string) =>
  v.normalize("NFKC").trim().toLocaleLowerCase("en-US");
// Deliberately conservative: no fuzzy identities or inference of missing credentials.
export function parseMessage(body: string) {
  const values = new Map<string, string>();
  let ambiguous = false;
  const aliases: Record<string, string> = {
    الاسم: "displayName",
    name: "displayName",
    اليوزر: "username",
    المستخدم: "username",
    username: "username",
    user: "username",
    "كلمة المرور": "password",
    password: "password",
    pass: "password",
  };
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s*([^:：]+)[:：]\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const key = aliases[normalize(match[1]!)];
    if (key) {
      if (values.has(key)) ambiguous = true;
      values.set(key, match[2]!);
    }
  }
  return {
    username: values.get("username"),
    displayName: values.get("displayName"),
    password: values.get("password"),
    needsReview:
      ambiguous || !values.has("username") || !values.has("displayName"),
  };
}
