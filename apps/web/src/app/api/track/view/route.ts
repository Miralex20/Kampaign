/**
 * POST /api/track/view
 *
 * Called by the inline beacon script on the landing page after 2 seconds of
 * visibility or on the first user interaction.
 *
 * Idempotent — uses the pending_view:{messageId} Redis key set by the server
 * render. The key is deleted on first confirmation to prevent double-counting.
 *
 * Request body: { messageId: string }
 *
 * Response: 200 OK on success, 404 if not found, 409 if already confirmed.
 *
 * No authentication required — the pending_view key acts as the gate.
 * No raw token in the request body — messageId is not sensitive.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Redis } from "ioredis";
import { getDb, messages, events } from "@campaign/db";
import { eq, isNull, sql } from "drizzle-orm";

const BodySchema = z.object({
  messageId: z.string().uuid(),
});

let _redis: Redis | undefined;
function getRedis(): Redis {
  if (!_redis) {
    const url = process.env["REDIS_URL"];
    if (!url) throw new Error("REDIS_URL is not set");
    _redis = new Redis(url);
  }
  return _redis;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { messageId } = parsed.data;
  const redis = getRedis();
  const pendingKey = `pending_view:${messageId}`;

  // Atomically check and delete the pending_view key
  const deleted = await redis.del(pendingKey);
  if (deleted === 0) {
    // Either already confirmed (key deleted) or was never set (scanner bypassed)
    return NextResponse.json({ ok: false, reason: "already_confirmed_or_not_pending" });
  }

  const db = getDb();
  const now = new Date();

  // Update message: set first_viewed_at (only if null), increment view_count
  await db
    .update(messages)
    .set({
      view_count: sql`${messages.view_count} + 1`,
      first_viewed_at: sql`COALESCE(${messages.first_viewed_at}, ${now.toISOString()})`,
    })
    .where(eq(messages.id, messageId));

  // Insert view event
  await db.insert(events).values({
    message_id: messageId,
    type: "view",
    meta: { confirmed_at: now.toISOString() },
  });

  return NextResponse.json({ ok: true });
}
