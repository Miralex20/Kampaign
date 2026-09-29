/**
 * Drizzle database client factory.
 *
 * Uses node-postgres (pg) with a connection pool.
 * PgBouncer sits in front of Postgres in production; pool size here is small
 * because PgBouncer multiplexes connections. Max 5 app-level connections per
 * process — PgBouncer handles the fan-out to Postgres.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string): ReturnType<typeof drizzle<typeof schema>> {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return drizzle(pool, { schema, logger: process.env["NODE_ENV"] === "development" });
}

/** Singleton for use in Next.js (avoids multiple Pool instances in dev HMR). */
let _db: ReturnType<typeof createDb> | undefined;

export function getDb(): ReturnType<typeof createDb> {
  if (!_db) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL environment variable is not set");
    _db = createDb(url);
  }
  return _db;
}
