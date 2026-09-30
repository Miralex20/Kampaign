/**
 * POST /api/messages/:id/reply
 *
 * Reply submission from the landing page.
 * - Rate-limited: max 3 replies per message_id.
 * - Stores to `replies` table with IP hash.
 * - Debounces notifications: at most one notification per message per 5 minutes via Redis.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { headers } from "next/headers";
import { getDb, replies, messages, campaigns, users } from "@campaign/db";
import { eq, count } from "drizzle-orm";
import { Redis } from "ioredis";
import { createListmonkClient } from "@campaign/core/listmonk";

const ReplySchema = z.object({
  body: z.string().min(1, "Reply body is required").max(5000),
});

type RouteContext = { params: Promise<{ id: string }> };

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    redisClient = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return redisClient;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const { id: messageId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { body: replyBody } = parsed.data;
  const db = getDb();

  // 1. Verify message exists and fetch campaign + org owner info
  const [row] = await db
    .select({
      message: messages,
      campaign: campaigns,
      owner: users,
    })
    .from(messages)
    .innerJoin(campaigns, eq(messages.campaign_id, campaigns.id))
    .innerJoin(users, eq(campaigns.created_by, users.id))
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // 2. Rate limit: max 3 replies per message_id
  const [replyCountResult] = await db
    .select({ total: count() })
    .from(replies)
    .where(eq(replies.message_id, messageId));

  const totalReplies = Number(replyCountResult?.total ?? 0);
  if (totalReplies >= 3) {
    return NextResponse.json(
      { error: "Maximum number of replies (3) reached for this message" },
      { status: 429 },
    );
  }

  // 3. Hash client IP (never store raw IP)
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");

  // 4. Insert reply
  const [createdReply] = await db
    .insert(replies)
    .values({
      message_id: messageId,
      body: replyBody,
      ip_hash: ipHash,
    })
    .returning();

  // 5. Debounced notification to campaign owner (at most one per 5 minutes per message)
  try {
    const redis = getRedis();
    const debounceKey = `reply_notify_debounced:${messageId}`;
    const acquired = await redis.set(debounceKey, "1", "EX", 300, "NX");
    if (acquired && process.env["LISTMONK_URL"] && row.owner.email) {
      const listmonk = createListmonkClient({
        baseUrl: process.env["LISTMONK_URL"],
        apiUser: process.env["LISTMONK_API_USER"] ?? process.env["LISTMONK_USERNAME"] ?? "listmonk",
        apiToken:
          process.env["LISTMONK_API_TOKEN"] ?? process.env["LISTMONK_PASSWORD"] ?? "listmonk",
      });
      const templateId = Number(process.env["LISTMONK_TX_TEMPLATE_ID"] ?? 1);
      const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";

      await listmonk.sendTransactional({
        subscriberEmail: row.owner.email,
        templateId,
        subject: `New reply on campaign "${row.campaign.name}"`,
        data: {
          link: `${appUrl}/campaigns/${row.campaign.id}`,
          first_name: row.owner.email.split("@")[0] ?? "User",
          preheader: "A recipient has submitted a reply.",
        },
      });
    }
  } catch (err) {
    // Non-blocking for client response
    console.error("[reply] Notification error:", err);
  }

  return NextResponse.json({ ok: true, id: createdReply?.id });
}
