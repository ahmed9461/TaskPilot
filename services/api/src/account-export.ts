import type pg from "pg";
import { transaction, event } from "./db.js";
import { Fault } from "./service.js";
import type { Vault } from "./security.js";

export function markdownAccount(
  name: string,
  username: string,
  password: string | null,
) {
  const title = name
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "\\$&");
  const lines = `${username}\n${password ?? "(كلمة المرور غير مسجلة)"}`;
  const fence = "`".repeat(
    Math.max(3, ...Array.from(lines.matchAll(/`+/g), (m) => m[0].length + 1)),
  );
  return `${title}\n${fence}\n${lines}\n${fence}`;
}

export async function exportGroupAccounts(
  pool: pg.Pool,
  vault: Vault,
  groupId: string,
) {
  return transaction(pool, async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const group = (
      await db.query("SELECT title FROM groups WHERE id=$1", [groupId])
    ).rows[0];
    if (!group) throw new Fault("NOT_FOUND", 404);
    const accounts = (
      await db.query(
        `
      SELECT a.id,a.display_name,a.username_normalized,c.ciphertext
      FROM accounts a LEFT JOIN account_credentials c ON c.account_id=a.id
      WHERE EXISTS (
        SELECT 1 FROM assignments t JOIN assignment_sources src ON src.assignment_id=t.id
        JOIN source_messages msg ON msg.id=src.source_message_id
        WHERE t.account_id=a.id AND msg.group_id=$1
      )
      ORDER BY a.display_name,a.username_normalized,a.id LIMIT 2001`,
        [groupId],
      )
    ).rows;
    if (accounts.length > 2000) throw new Fault("ACCOUNT_MD_EXPORT_LIMIT", 413);
    if (!accounts.length) throw new Fault("ACCOUNT_MD_EXPORT_EMPTY", 409);
    const content =
      accounts
        .map((a) =>
          markdownAccount(
            a.display_name,
            a.username_normalized,
            a.ciphertext === null
              ? null
              : vault.open(a.ciphertext, `credential:${a.id}`),
          ),
        )
        .join("\n\n---\n\n") + "\n";
    if (Buffer.byteLength(content, "utf8") > 4 * 1024 * 1024)
      throw new Fault("ACCOUNT_MD_EXPORT_LIMIT", 413);
    await event(db, "GROUP_CREDENTIALS_EXPORTED", groupId);
    return { content, count: accounts.length };
  });
}
