import type pg from "pg";
import { Vault, hash } from "./security.js";
// Operator passes an already-open transaction with all API/provider writers stopped.
export async function rewrapFields(
  db: pg.PoolClient,
  previous: Vault,
  next: Vault,
) {
  if (next.keyVersion <= previous.keyVersion)
    throw Error("KEY_VERSION_MUST_ADVANCE");
  const descriptors = [
    {
      table: "account_credentials",
      column: "ciphertext",
      keys: ["account_id"],
      context: (r: any) => `credential:${r.account_id}`,
    },
    {
      table: "source_messages",
      column: "encrypted_payload",
      keys: ["id"],
      context: (r: any) => `message:${r.id}`,
    },
    {
      table: "source_messages",
      column: "encrypted_transport_key",
      keys: ["id"],
      context: (r: any) => `wa-source:${r.id}`,
    },
    {
      table: "whatsapp_ingress",
      column: "encrypted_payload",
      keys: ["id"],
      context: (r: any) =>
        `wa-ingress:${r.session_id}:${r.group_id}:${hash(r.external_message_id)}`,
    },
    {
      table: "whatsapp_auth",
      column: "encrypted_payload",
      keys: ["session_id", "category", "id_hash"],
      context: (r: any) => `wa-auth:${r.session_id}:${r.category}:${r.id_hash}`,
    },
  ];
  const counts: Record<string, number> = {};
  for (const d of descriptors) {
    const rows = (
      await db.query(
        `SELECT * FROM ${d.table} WHERE ${d.column} IS NOT NULL LIMIT 100001 FOR UPDATE`,
      )
    ).rows;
    if (rows.length > 100000) throw Error("ROTATION_BATCH_TOO_LARGE");
    for (const row of rows) {
      const aad = d.context(row),
        plain = previous.open(row[d.column], aad),
        sealed = next.seal(plain, aad);
      if (next.open(sealed, aad) !== plain)
        throw Error("ROTATION_VALIDATION_FAILED");
      const where = d.keys.map((k, i) => `${k}=$${i + 2}`).join(" AND ");
      await db.query(
        `UPDATE ${d.table} SET ${d.column}=$1${["account_credentials", "whatsapp_auth"].includes(d.table) ? `,key_version=${next.keyVersion}` : ""} WHERE ${where}`,
        [sealed, ...d.keys.map((k) => row[k])],
      );
    }
    counts[`${d.table}.${d.column}`] = rows.length;
  }
  return { keyVersion: next.keyVersion, counts };
}
