/**
 * PATCH / DELETE /api/admin/campaigns/:id
 *
 * Superadmin endpoint to update campaign status or delete campaigns.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, campaigns, organizations } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

type RouteContext = { params: Promise<{ id: string }> };

const UpdateCampaignSchema = z.object({
  status: z.enum(["draft", "review", "approved", "live", "suspended", "archived", "completed"]),
});

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { id: campaignId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { status } = parsed.data;
  const db = getDb();

  try {
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!existingCampaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(campaigns)
        .set({
          status,
          updated_at: now,
        })
        .where(eq(campaigns.id, campaignId));

      // If approving a campaign in review, also approve the organization review state
      if (status === "approved" || status === "live") {
        await tx
          .update(organizations)
          .set({ review_state: "approved" })
          .where(eq(organizations.id, existingCampaign.org_id));
      }
    });

    return NextResponse.json({
      data: {
        id: campaignId,
        status,
        updated_at: now,
      },
      message: `Campaign status changed to ${status}`,
    });
  } catch (err) {
    console.error("[admin-campaigns] Error updating campaign:", err);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { id: campaignId } = await context.params;
  const db = getDb();

  try {
    const [deleted] = await db
      .delete(campaigns)
      .where(eq(campaigns.id, campaignId))
      .returning({ id: campaigns.id, name: campaigns.name });

    if (!deleted) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: deleted,
      message: `Campaign "${deleted.name}" deleted successfully`,
    });
  } catch (err) {
    console.error("[admin-campaigns] Error deleting campaign:", err);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
