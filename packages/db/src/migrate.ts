/**
 * Migration runner.
 *
 * Applies all *.sql files in ./migrations/ in lexicographic order.
 * Idempotent — uses a simple migrations tracking table.
 *
 * Usage:
 *   pnpm --filter @campaign/db db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id        serial PRIMARY KEY,
        filename  text   NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = join(__dirname, "migrations");
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();

    for (const filename of files) {
      const { rows } = await client.query(
        "SELECT 1 FROM _migrations WHERE filename = $1",
        [filename],
      );
      if (rows.length > 0) {
        console.log(`[migrate] already applied: ${filename}`);
        continue;
      }

      console.log(`[migrate] applying: ${filename}`);
      const sql = await readFile(join(migrationsDir, filename), "utf8");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.log(`[migrate] done: ${filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("[migrate] all migrations applied");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err: unknown) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
