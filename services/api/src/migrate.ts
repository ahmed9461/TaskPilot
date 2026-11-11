import { readdir, readFile } from "node:fs/promises";
import { createPool, transaction } from "./db.js";
import { hash } from "./security.js";
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
          if (prior.rows[0].checksum !== hash(sql))
            throw new Error("MIGRATION_CHECKSUM_MISMATCH");
          continue;
        }
        await c.query(sql);
        await c.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, hash(sql)],
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
