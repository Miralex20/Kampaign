/**
 * GET /api/campaigns/:id/results
 *
 * Campaign analytics and results dashboard endpoint.
 * Returns tailored metrics and per-recipient status timeline based on campaign_mode:
 *
 * - Mode A (managed_send):
 *   sent, delivered, bounced, complaints, verified reads, replies, action counts, recipients timeline
 *
 * - Mode B (link_per_recipient):
 *   links generated, link_export_generated_at, verified reads, replies, action counts, landing timeline
 *   (delivery/bounce fields marked "N/A — email sent externally")
 *
 * - Mode C (link_universal):
 *   sharedUrl, universal_view_count, reply count, action counts (aggregate only, no per-person rows)
 */
import { NextResponse } from "next/server";
import {
  getDb,
  campaigns,
  messages,
  recipients,
  replies,
  events,
} from "@campaign/db";
import { eq, and, sql, count } from "drizzle-orm";
import { requireSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;
  const { id: campaignId } = await context.params;

  const db = getDb();

  // Load campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Mode C: Broadcast Link (aggregate only)
  // -------------------------------------------------------------------------
  if (campaign.campaign_mode === "link_universal") {
    const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";

    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        name: campaign.name,
        mode: "link_universal",
        status: campaign.status,
        universal_view_count: campaign.universal_view_count,
        expires_at: campaign.expires_at,
        created_at: campaign.created_at,
        note: "Mode C tracking is aggregate only. No per-recipient identity is recorded.",
      },
    });
  }

  // -------------------------------------------------------------------------
  // Modes A and B: Per-recipient campaign stats
  // -------------------------------------------------------------------------

  // 1. Message status counts
  const statusCounts = await db
    .select({
      status: messages.status,
      count: count(),
    })
    .from(messages)
    .where(eq(messages.campaign_id, campaignId))
    .groupBy(messages.status);

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) {
    statusMap[s.status] = Number(s.count);
  }

  // 2. Verified reads: messages with first_viewed_at not null
  const [verifiedReadsResult] = await db
    .select({ total: count() })
    .from(messages)
    .where(
      and(
        eq(messages.campaign_id, campaignId),
        sql`${messages.first_viewed_at} IS NOT NULL`,
      ),
    );

  // 3. Total replies for messages in this campaign
  const [repliesResult] = await db
    .select({ total: count() })
    .from(replies)
    .innerJoin(messages, eq(replies.message_id, messages.id))
    .where(eq(messages.campaign_id, campaignId));

  // 4. Action counts grouped by block
  const actionCounts = await db
    .select({
      block: sql<string>`${events.meta}->>'block'`,
      count: count(),
    })
    .from(events)
    .innerJoin(messages, eq(events.message_id, messages.id))
    .where(
      and(
        eq(messages.campaign_id, campaignId),
        eq(events.type, "action"),
      ),
    )
    .groupBy(sql`${events.meta}->>'block'`);

  // 5. Per-recipient timeline rows (up to 500 for the results view)
  const timelineRows = await db
    .select({
      messageId: messages.id,
      email: recipients.email,
      firstName: recipients.first_name,
      status: messages.status,
      sentAt: messages.sent_at,
      deliveredAt: messages.delivered_at,
      firstViewedAt: messages.first_viewed_at,
      viewCount: messages.view_count,
    })
    .from(messages)
    .innerJoin(recipients, eq(messages.recipient_id, recipients.id))
    .where(eq(messages.campaign_id, campaignId))
    .limit(500);

  const totalRecipients = timelineRows.length;
  const verifiedReads = Number(verifiedReadsResult?.total ?? 0);
  const totalReplies = Number(repliesResult?.total ?? 0);

  if (campaign.campaign_mode === "link_per_recipient") {
    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        name: campaign.name,
        mode: "link_per_recipient",
        status: campaign.status,
        link_export_generated_at: campaign.link_export_generated_at,
        total_links: totalRecipients,
        verified_reads: verifiedReads,
        replies: totalReplies,
        actions: actionCounts,
        recipients: timelineRows.map((r) => ({
          email: r.email,
          first_name: r.firstName,
          delivery_status: "N/A — email sent externally",
          first_viewed_at: r.firstViewedAt,
          view_count: r.viewCount,
        })),
      },
    });
  }

  // Mode A (managed_send)
  return NextResponse.json({
    data: {
      campaignId: campaign.id,
      name: campaign.name,
      mode: "managed_send",
      status: campaign.status,
      total_recipients: totalRecipients,
      pending: statusMap["pending"] ?? 0,
      dispatched: statusMap["dispatched"] ?? 0,
      sent: statusMap["sent"] ?? 0,
      delivered: statusMap["delivered"] ?? 0,
      bounced: statusMap["bounced"] ?? 0,
      complained: statusMap["complained"] ?? 0,
      failed: statusMap["failed"] ?? 0,
      verified_reads: verifiedReads,
      replies: totalReplies,
      actions: actionCounts,
      recipients: timelineRows,
    },
  });
}
