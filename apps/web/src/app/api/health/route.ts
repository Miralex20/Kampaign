/**
 * GET /api/health
 *
 * Checks connectivity to Postgres (via DATABASE_URL) and Redis (via REDIS_URL).
 * Returns 200 with status "ok" when all checks pass, or 503 with status "degraded"
 * when one or more checks fail.
 *
 * Response shape:
 *   { status: "ok" | "degraded", checks: { db: "ok" | "fail", redis: "ok" | "fail" } }
 */
import { NextResponse } from "next/server";

type CheckResult = "ok" | "fail";

interface HealthResponse {
  status: "ok" | "degraded";
  checks: {
    db: CheckResult;
    redis: CheckResult;
  };
}

async function checkDb(): Promise<CheckResult> {
  try {
    const { getDb } = await import("@campaign/db");
    const { sql } = await import("drizzle-orm");
    const db = getDb();
    // Execute a minimal query to confirm the connection is live
    await db.execute(sql`SELECT 1`);
    return "ok";
  } catch (err) {
    console.error("[health] DB check error:", err);
    return "fail";
  }
}

async function checkRedis(): Promise<CheckResult> {
  try {
    const mod = await import("ioredis");
    const Redis = mod.default ?? mod.Redis;
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    const redis = new Redis(url, { lazyConnect: true, connectTimeout: 3000 });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return "ok";
  } catch (err) {
    console.error("[health] Redis check error:", err);
    return "fail";
  }
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);

  const status: HealthResponse["status"] =
    db === "ok" && redis === "ok" ? "ok" : "degraded";

  return NextResponse.json({ status, checks: { db, redis } }, { status: status === "ok" ? 200 : 503 });
}
