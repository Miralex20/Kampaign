/**
 * /api/replies
 *
 * POST: Submit a reply from the landing page.
 *   - For per-recipient links: { messageId, body }
 *   - For universal / broadcast links: { campaignId, name, email, body }
 *
 * GET: Retrieve replies for a given campaign (for dashboard inbox view).
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { headers } from "next/headers";
import { getDb, replies, messages, campaigns, recipients } from "@campaign/db";
import { eq, desc, or } from "drizzle-orm";

const ReplySubmitSchema = z.union([
  z.object({
    messageId: z.string().uuid(),
    body: z.string().min(1, "Message cannot be empty").max(5000),
  }),
  z.object({
    campaignId: z.string().uuid(),
    name: z.string().min(1, "Name is required").max(120),
    email: z.string().email("Valid email is required"),
    body: z.string().min(1, "Message cannot be empty").max(5000),
  }),
]);

import { Redis } from "ioredis";

let _redis: Redis | undefined;
function getRedis(): Redis | null {
  if (!_redis && process.env["REDIS_URL"]) {
    try {
      _redis = new Redis(process.env["REDIS_URL"]);
    } catch {
      return null;
    }
  }
  return _redis ?? null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ReplySubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const db = getDb();
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";
  const ipHash = createHash("sha256").update(ip).digest("hex");

  // IP sliding window rate limit: max 5 replies per 10 minutes
  const redis = getRedis();
  if (redis) {
    const key = `rl:reply:${ipHash}`;
    const now = Date.now();
    const windowStart = now - 10 * 60 * 1000;
    try {
      await redis.zremrangebyscore(key, "-inf", windowStart);
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, 10 * 60);
      const count = await redis.zcard(key);
      if (count > 5) {
        return NextResponse.json(
          { error: "Too many replies submitted. Please wait a few minutes." },
          { status: 429 },
        );
      }
    } catch {
      // Graceful fallback if Redis is unavailable
    }
  }

  if ("messageId" in parsed.data) {
    const { messageId, body: replyBody } = parsed.data;

    // Verify message exists
    const [msg] = await db
      .select({ id: messages.id, campaign_id: messages.campaign_id })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Insert reply
    const [inserted] = await db
      .insert(replies)
      .values({
        message_id: messageId,
        campaign_id: msg.campaign_id,
        body: replyBody,
        ip_hash: ipHash,
      })
      .returning({ id: replies.id, created_at: replies.created_at });

    return NextResponse.json({ ok: true, replyId: inserted?.id });
  } else {
    const { campaignId, name, email, body: replyBody } = parsed.data;

    // Verify campaign exists and allow_replies is enabled
    const [camp] = await db
      .select({ id: campaigns.id, allow_replies: campaigns.allow_replies })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!camp) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (camp.allow_replies === false) {
      return NextResponse.json({ error: "Replies are disabled for this campaign" }, { status: 403 });
    }

    // Insert universal reply with author_name and author_email
    const [inserted] = await db
      .insert(replies)
      .values({
        campaign_id: campaignId,
        author_name: name,
        author_email: email.toLowerCase().trim(),
        body: replyBody,
        ip_hash: ipHash,
      })
      .returning({ id: replies.id, created_at: replies.created_at });

    return NextResponse.json({ ok: true, replyId: inserted?.id });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId query parameter is required" }, { status: 400 });
  }

  const db = getDb();

  // Load replies for this campaign
  // Handles both per-recipient replies (with recipient joined) and universal replies
  const rawReplies = await db
    .select({
      id: replies.id,
      body: replies.body,
      createdAt: replies.created_at,
      authorName: replies.author_name,
      authorEmail: replies.author_email,
      messageId: replies.message_id,
      recipientName: recipients.first_name,
      recipientEmail: recipients.email,
      recipientFields: recipients.fields,
    })
    .from(replies)
    .leftJoin(messages, eq(replies.message_id, messages.id))
    .leftJoin(recipients, eq(messages.recipient_id, recipients.id))
    .where(
      or(
        eq(replies.campaign_id, campaignId),
        eq(messages.campaign_id, campaignId),
      ),
    )
    .orderBy(desc(replies.created_at))
    .limit(100);

  const formatted = rawReplies.map((r) => {
    const fields = (r.recipientFields as Record<string, string>) || {};
    return {
      id: r.id,
      body: r.body,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      name: r.authorName || r.recipientName || "Anonymous",
      email: r.authorEmail || r.recipientEmail || "",
      sex: fields["sex"] || fields["gender"] || null,
      customFields: fields,
      isBroadcast: !r.messageId,
    };
  });

  return NextResponse.json({ replies: formatted });
}
