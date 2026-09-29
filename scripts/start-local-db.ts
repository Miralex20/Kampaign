/**
 * Local PostgreSQL server runner.
 * Spawns an embedded PostgreSQL 18 instance on port 5432 and configures
 * the campaign role, databases, and required extensions.
 */
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { Client } from "pg";

const port = Number(process.env["PGPORT"] ?? 5432);
const databaseDir = path.resolve("./.pgdata");

async function main() {
  console.log(`[local-db] Starting PostgreSQL on port ${port}...`);

  const pg = new EmbeddedPostgres({
    port,
    databaseDir,
    user: "postgres",
    password: "password",
  });

  try {
    await pg.initialise();
  } catch (err: unknown) {
    // If already initialized, ignore error
    const msg = String(err);
    if (!msg.includes("already exists") && !msg.includes("not empty")) {
      console.log("[local-db] Database directory already initialized.");
    }
  }

  await pg.start();
  console.log(`[local-db] PostgreSQL server is ready on port ${port}`);

  // Configure user & database
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: "password",
    database: "postgres",
  });

  await client.connect();

  try {
    // 1. Create campaign user
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'campaign') THEN
          CREATE ROLE campaign WITH LOGIN SUPERUSER PASSWORD 'campaign_dev';
        END IF;
      END
      $$;
    `);

    // 2. Create campaign_db
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'campaign_db'");
    if (res.rows.length === 0) {
      await client.query("CREATE DATABASE campaign_db OWNER campaign");
      console.log("[local-db] Created database 'campaign_db'");
    }

    // 3. Create campaign_test_db
    const testRes = await client.query("SELECT 1 FROM pg_database WHERE datname = 'campaign_test_db'");
    if (testRes.rows.length === 0) {
      await client.query("CREATE DATABASE campaign_test_db OWNER campaign");
      console.log("[local-db] Created database 'campaign_test_db'");
    }
  } finally {
    await client.end();
  }

  // Connect to campaign_db to install extensions
  const campaignDbClient = new Client({
    host: "127.0.0.1",
    port,
    user: "campaign",
    password: "campaign_dev",
    database: "campaign_db",
  });

  await campaignDbClient.connect();
  try {
    await campaignDbClient.query("CREATE EXTENSION IF NOT EXISTS citext");
    await campaignDbClient.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    console.log("[local-db] Enabled extensions 'citext' and 'pgcrypto' on campaign_db");
  } finally {
    await campaignDbClient.end();
  }

  console.log("[local-db] Database setup complete. Running...");

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\n[local-db] Stopping PostgreSQL...");
    await pg.stop();
    console.log("[local-db] Stopped.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process running
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[local-db] Fatal error:", err);
  process.exit(1);
});
