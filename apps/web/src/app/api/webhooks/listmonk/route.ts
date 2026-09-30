/**
 * POST /api/webhooks/listmonk
 *
 * Receives delivery event webhooks from listmonk (Mode A only).
 *
 * Security:
 * - HMAC-SHA256 signature verified against raw body using EMAIL_WEBHOOK_SECRET
 * - Reject 401 on failure; log attempt without body content
 * - Dedupe by listmonk event ID (stored in events.meta.providerEventId)
 *
 * Supported event types:
 * - sent       → messages.status = 'sent'
 * - delivered  → messages.status = 'delivered'
 * - hard_bounce → status = 'bounced', suppress (hard)
 * - soft_bounce → write event only (do NOT suppress)
 * - complaint  → status = 'complained', suppress, rate alert
 * - unsubscribe → suppress
 */
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDb, messages, events, campaigns, organizations, suppressions } from "@campaign/db";
import { eq, and, count, sql } from "drizzle-orm";
import { suppress } from "@campaign/core/suppression";

// ---------------------------------------------------------------------------
// Webhook event schema (listmonk format — simplified)
// ---------------------------------------------------------------------------
const WebhookEventSchema = z.object({
  event: z.enum(["sent", "delivered", "hard_bounce", "soft_bounce", "complaint", "unsubscribe"]),
  id: z.string(), // listmonk message ID
  campaign_id: z.number().optional(),
  subscriber: z.object({
    email: z.string().email(),
  }),
  meta: z.record(z.unknown()).optional(),
});

type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Read raw body for HMAC verification
  const rawBody = await request.text().catch(() => null);
  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  // 2. Verify HMAC-SHA256 signature
  const webhookSecret = process.env["EMAIL_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    console.error("[webhook] EMAIL_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-listmonk-signature") ?? "";
  const expectedSig = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  let sigMatch = false;
  try {
    sigMatch = timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    sigMatch = false;
  }

  if (!sigMatch) {
    console.warn("[webhook] Invalid signature received — rejecting");
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // 3. Parse body
  let parsed: WebhookEvent;
  try {
    const json: unknown = JSON.parse(rawBody);
    const result = WebhookEventSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event: eventType, id: listmonkMsgId, subscriber } = parsed;

  const db = getDb();

  // 4. Find message by listmonk_message_id
  const [message] = await db
    .select({
      id: messages.id,
      status: messages.status,
      campaign_id: messages.campaign_id,
      recipient_id: messages.recipient_id,
    })
    .from(messages)
    .where(eq(messages.listmonk_message_id, listmonkMsgId))
    .limit(1);

  if (!message) {
    // Event for an unknown message — acknowledge without error
    return NextResponse.json({ ok: true, note: "message_not_found" });
  }

  // 5. Dedupe: check if event with this providerEventId already exists
  const providerEventId = `listmonk:${listmonkMsgId}:${eventType}`;
  const [existingEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.message_id, message.id),
        sql`${events.meta}->>'providerEventId' = ${providerEventId}`,
      ),
    )
    .limit(1);

  if (existingEvent) {
    return NextResponse.json({ ok: true, note: "duplicate_event" });
  }

  // 6. Load campaign for org_id
  const [campaign] = await db
    .select({ org_id: campaigns.org_id })
    .from(campaigns)
    .where(eq(campaigns.id, message.campaign_id))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ ok: true, note: "campaign_not_found" });
  }

  const { org_id: orgId } = campaign;
  const email = subscriber.email;

  // 7. Handle event type
  const db_suppress = {
    async isSuppressed(oId: string, e: string) {
      const [row] = await db
        .select({ id: suppressions.id })
        .from(suppressions)
        .where(and(eq(suppressions.org_id, oId), eq(suppressions.email, e)))
        .limit(1);
      return !!row;
    },
    async suppress(oId: string, e: string, reason: string, bounceType?: string) {
      await db
        .insert(suppressions)
        .values({
          org_id: oId,
          email: e,
          reason,
          bounce_type: bounceType ?? null,
        })
        .onConflictDoNothing();
    },
  };

  switch (eventType) {
    case "sent":
      await db
        .update(messages)
        .set({ status: "sent", sent_at: new Date() })
        .where(eq(messages.id, message.id));
      break;

    case "delivered":
      await db
        .update(messages)
        .set({ status: "delivered", delivered_at: new Date() })
        .where(eq(messages.id, message.id));
      break;

    case "hard_bounce":
      await db.update(messages).set({ status: "bounced" }).where(eq(messages.id, message.id));
      await db_suppress.suppress(orgId, email, "hard_bounce", "hard");
      await checkRateAlert(orgId, "bounce");
      break;

    case "soft_bounce":
      // Write event only — do NOT suppress (mailbox-full is temporary)
      break;

    case "complaint":
      await db.update(messages).set({ status: "complained" }).where(eq(messages.id, message.id));
      await db_suppress.suppress(orgId, email, "complaint");
      await checkRateAlert(orgId, "complaint");
      break;

    case "unsubscribe":
      await db_suppress.suppress(orgId, email, "unsubscribe");
      break;
  }

  // 8. Insert event row
  await db.insert(events).values({
    message_id: message.id,
    type: eventType,
    meta: { providerEventId, email },
  });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Complaint/bounce rate alert
// ---------------------------------------------------------------------------
async function checkRateAlert(orgId: string, type: "complaint" | "bounce"): Promise<void> {
  const db = getDb();

  const [sentCount] = await db
    .select({ count: count() })
    .from(messages)
    .innerJoin(campaigns, eq(messages.campaign_id, campaigns.id))
    .where(
      and(
        eq(campaigns.org_id, orgId),
        sql`${messages.status} IN ('sent', 'delivered', 'bounced', 'complained')`,
      ),
    );

  const total = sentCount?.count ?? 0;
  if (total < 100) return; // Not enough data for meaningful rate

  const COMPLAINT_THRESHOLD = 0.003; // 0.3%
  const BOUNCE_THRESHOLD = 0.05; // 5%

  const [rateCount] = await db
    .select({ count: count() })
    .from(messages)
    .innerJoin(campaigns, eq(messages.campaign_id, campaigns.id))
    .where(
      and(
        eq(campaigns.org_id, orgId),
        eq(messages.status, type === "complaint" ? "complained" : "bounced"),
      ),
    );

  const rate = (rateCount?.count ?? 0) / total;
  const threshold = type === "complaint" ? COMPLAINT_THRESHOLD : BOUNCE_THRESHOLD;

  if (rate > threshold) {
    console.warn(
      `[webhook] Org ${orgId}: ${type} rate ${(rate * 100).toFixed(2)}% exceeds threshold — suspending`,
    );
    await db
      .update(organizations)
      .set({ review_state: "suspended" })
      .where(eq(organizations.id, orgId));
    // TODO: notify org owner via listmonk /api/tx (M6 full implementation)
  }
}
