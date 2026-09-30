/**
 * GET /api/admin/campaigns
 *
 * Lists all campaigns system-wide with organization metadata, filters, and performance metrics.
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, organizations, messages, replies } from "@campaign/db";
import { eq, ilike, or, and, desc, sql } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const statusFilter = searchParams.get("status")?.trim() ?? "";
  const modeFilter = searchParams.get("mode")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const db = getDb();

  try {
    const conditions = [];

    if (search) {
      conditions.push(
        or(ilike(campaigns.name, `%${search}%`), ilike(organizations.name, `%${search}%`)),
      );
    }

    if (statusFilter && statusFilter !== "all") {
      conditions.push(eq(campaigns.status, statusFilter));
    }

    if (modeFilter && modeFilter !== "all") {
      conditions.push(eq(campaigns.campaign_mode, modeFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const campaignRows = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        campaign_mode: campaigns.campaign_mode,
        status: campaigns.status,
        subject: campaigns.subject,
        preheader: campaigns.preheader,
        email_html: campaigns.email_html,
        page_html: campaigns.page_html,
        universal_view_count: campaigns.universal_view_count,
        require_otp: campaigns.require_otp,
        allow_replies: campaigns.allow_replies,
        created_at: campaigns.created_at,
        updated_at: campaigns.updated_at,
        org_id: campaigns.org_id,
        org_name: organizations.name,
        org_sending_domain: organizations.sending_domain,
        org_review_state: organizations.review_state,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(campaigns.org_id, organizations.id))
      .where(whereClause)
      .orderBy(desc(campaigns.created_at))
      .limit(limit)
      .offset(offset);

    // Enrich campaigns with message count, read count, and reply count
    const enriched = await Promise.all(
      campaignRows.map(async (c) => {
        const [msgStats] = await db
          .select({
            totalMessages: sql<number>`count(*)::int`,
            totalViews: sql<number>`coalesce(sum(${messages.view_count}), 0)::int`,
          })
          .from(messages)
          .where(eq(messages.campaign_id, c.id));

        const [replyStats] = await db
          .select({
            totalReplies: sql<number>`count(*)::int`,
          })
          .from(replies)
          .where(eq(replies.campaign_id, c.id));

        const verifiedReads =
          c.campaign_mode === "link_universal"
            ? c.universal_view_count
            : (msgStats?.totalViews ?? 0);

        return {
          ...c,
          totalMessages: msgStats?.totalMessages ?? 0,
          verifiedReads,
          totalReplies: replyStats?.totalReplies ?? 0,
        };
      }),
    );

    return NextResponse.json({
      data: enriched,
      pagination: {
        limit,
        offset,
        count: enriched.length,
      },
    });
  } catch (err) {
    console.error("[admin-campaigns] Error listing campaigns:", err);
    return NextResponse.json({ error: "Failed to list campaigns" }, { status: 500 });
  }
}
