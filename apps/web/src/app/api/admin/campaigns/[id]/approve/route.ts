/**
 * POST /api/admin/campaigns/:id/approve
 *
 * Admin endpoint to approve campaigns pending manual review.
 * - Updates campaign.status from 'review' to 'approved'
 * - Updates org.review_state to 'approved' (enabling Mode A launches)
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, organizations } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }

  // In production, check session.role === 'admin'
  if (session.role !== "admin" && process.env["NODE_ENV"] === "production") {
    return NextResponse.json({ error: "Unauthorized: admin role required" }, { status: 403 });
  }

  const { id: campaignId } = await context.params;
  const db = getDb();

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({
        status: "approved",
        updated_at: now,
      })
      .where(eq(campaigns.id, campaignId));

    await tx
      .update(organizations)
      .set({
        review_state: "approved",
      })
      .where(eq(organizations.id, campaign.org_id));
  });

  return NextResponse.json({
    data: {
      campaignId,
      status: "approved",
      orgReviewState: "approved",
      approvedAt: now,
    },
  });
}
