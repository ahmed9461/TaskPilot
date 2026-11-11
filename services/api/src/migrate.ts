import { readdir, readFile } from "node:fs/promises";
import { createPool, transaction } from "./db.js";
import { hash } from "./security.js";
export const migrationChecksum = (sql: string) =>
  hash(sql.replaceAll("\r\n", "\n"));
export function matchesMigration(sql: string, checksum: string) {
  const normalized = sql.replaceAll("\r\n", "\n");
  // Accept only historical LF/CRLF byte variants; SQL edits still fail integrity checks.
  return [
    hash(sql),
    hash(normalized),
    hash(normalized.replaceAll("\n", "\r\n")),
  ].includes(checksum);
}
export async function migrate(url: string) {
  const pool = createPool(url);
  try {
    await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(8240001)");
      await c.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())",
      );
      const dir = new URL("../migrations/", import.meta.url);
      for (const name of (await readdir(dir))
        .filter((x) => x.endsWith(".sql"))
        .sort()) {
        const sql = await readFile(new URL(name, dir), "utf8");
        const prior = await c.query(
          "SELECT checksum FROM schema_migrations WHERE name=$1",
          [name],
        );
        if (prior.rowCount) {
          if (!matchesMigration(sql, prior.rows[0].checksum))
            throw new Error("MIGRATION_CHECKSUM_MISMATCH");
          await c.query(
            "UPDATE schema_migrations SET checksum=$2 WHERE name=$1",
            [name, migrationChecksum(sql)],
          );
          continue;
        }
        await c.query(sql);
        await c.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, migrationChecksum(sql)],
        );
      }
    });
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  await migrate(process.env.DATABASE_URL ?? "");
  console.log("Migrations applied");
}
