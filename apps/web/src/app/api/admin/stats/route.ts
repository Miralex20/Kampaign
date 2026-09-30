/**
 * GET /api/admin/stats
 *
 * Returns aggregate metrics across all organizations for the admin overview dashboard.
 */
import { NextResponse } from "next/server";
import {
  getDb,
  users,
  campaigns,
  organizations,
  recipients,
  messages,
  replies,
} from "@campaign/db";
import { eq, sql, desc } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const db = getDb();

  try {
    const [
      userCountRes,
      campaignCountRes,
      reviewCampaignsRes,
      orgCountRes,
      suspendedOrgRes,
      recipientCountRes,
      messageCountRes,
      replyCountRes,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(campaigns),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(campaigns)
        .where(eq(campaigns.status, "review")),
      db.select({ count: sql<number>`count(*)::int` }).from(organizations),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(organizations)
        .where(eq(organizations.review_state, "suspended")),
      db.select({ count: sql<number>`count(*)::int` }).from(recipients),
      db.select({ count: sql<number>`count(*)::int` }).from(messages),
      db.select({ count: sql<number>`count(*)::int` }).from(replies),
    ]);

    // Sum of per-recipient view counts + universal view counts
    const [readsRes] = await db
      .select({
        totalViews: sql<number>`coalesce(sum(${messages.view_count}), 0)::int`,
      })
      .from(messages);

    const [universalReadsRes] = await db
      .select({
        totalUniversalViews: sql<number>`coalesce(sum(${campaigns.universal_view_count}), 0)::int`,
      })
      .from(campaigns);

    const totalVerifiedReads =
      (readsRes?.totalViews ?? 0) + (universalReadsRes?.totalUniversalViews ?? 0);

    // Fetch up to 5 campaigns needing review
    const pendingReviewList = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        campaign_mode: campaigns.campaign_mode,
        status: campaigns.status,
        created_at: campaigns.created_at,
        org_id: campaigns.org_id,
        org_name: organizations.name,
      })
      .from(campaigns)
      .innerJoin(organizations, eq(campaigns.org_id, organizations.id))
      .where(eq(campaigns.status, "review"))
      .orderBy(desc(campaigns.created_at))
      .limit(5);

    return NextResponse.json({
      data: {
        totalUsers: userCountRes[0]?.count ?? 0,
        totalCampaigns: campaignCountRes[0]?.count ?? 0,
        campaignsInReview: reviewCampaignsRes[0]?.count ?? 0,
        totalOrganizations: orgCountRes[0]?.count ?? 0,
        suspendedOrganizations: suspendedOrgRes[0]?.count ?? 0,
        totalRecipients: recipientCountRes[0]?.count ?? 0,
        totalMessages: messageCountRes[0]?.count ?? 0,
        totalReplies: replyCountRes[0]?.count ?? 0,
        totalVerifiedReads,
        pendingReviewList,
      },
    });
  } catch (err) {
    console.error("[admin-stats] Error retrieving statistics:", err);
    return NextResponse.json({ error: "Failed to load admin statistics" }, { status: 500 });
  }
}
