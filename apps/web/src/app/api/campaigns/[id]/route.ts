/**
 * Campaign single-item CRUD
 *
 * GET    /api/campaigns/:id  — get campaign
 * PATCH  /api/campaigns/:id  — update campaign (mode immutable after launch)
 * DELETE /api/campaigns/:id  — soft-delete (set status = 'cancelled')
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, campaign_page_versions } from "@campaign/db";
import { eq, and, desc } from "drizzle-orm";
import { sanitiseHtml } from "@campaign/core/sanitise";
import { screenContent } from "@campaign/core/screening";
import { requireSession } from "@/lib/session";
import { UpdateCampaignSchema } from "@/lib/schemas/campaign";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/campaigns/:id
// ---------------------------------------------------------------------------
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
  const { id } = await context.params;

  const db = getDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ data: campaign });
}

// ---------------------------------------------------------------------------
// PATCH /api/campaigns/:id
// ---------------------------------------------------------------------------
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId, userId } = session;
  const { id } = await context.params;

  const db = getDb();
  const [existing] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Guard: campaign_mode is immutable after first launch
  const postLaunchStatuses = new Set([
    "launching", "live", "paused", "completed",
  ]);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "campaign_mode" in body &&
    postLaunchStatuses.has(existing.status)
  ) {
    return NextResponse.json(
      { error: "campaign_mode cannot be changed after campaign has launched" },
      { status: 409 },
    );
  }

  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Screening for phishing keywords
  if (data.page_html) {
    const pageScreen = screenContent(data.page_html);
    if (!pageScreen.passed) {
      return NextResponse.json(
        { error: "Content blocked: detected prohibited phishing keyword", matched: pageScreen.matched },
        { status: 422 },
      );
    }
  }
  if (data.email_html) {
    const emailScreen = screenContent(data.email_html);
    if (!emailScreen.passed) {
      return NextResponse.json(
        { error: "Content blocked: detected prohibited phishing keyword", matched: emailScreen.matched },
        { status: 422 },
      );
    }
  }

  // Sanitise HTML on update
  const sanitisedPageHtml = data.page_html ? sanitiseHtml(data.page_html) : undefined;
  const sanitisedEmailHtml = data.email_html ? sanitiseHtml(data.email_html) : undefined;

  const [updated] = await db.transaction(async (tx) => {
    const result = await tx
      .update(campaigns)
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.subject !== undefined ? { subject: data.subject } : {}),
        ...(data.preheader !== undefined ? { preheader: data.preheader } : {}),
        ...(sanitisedEmailHtml !== undefined ? { email_html: sanitisedEmailHtml } : {}),
        ...(data.email_text !== undefined ? { email_text: data.email_text } : {}),
        ...(sanitisedPageHtml !== undefined ? { page_html: sanitisedPageHtml } : {}),
        ...(data.scheduled_at !== undefined
          ? { scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null }
          : {}),
        ...(data.expires_at !== undefined
          ? { expires_at: data.expires_at ? new Date(data.expires_at) : null }
          : {}),
        ...(data.require_otp !== undefined ? { require_otp: data.require_otp } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(campaigns.id, id), eq(campaigns.org_id, orgId)))
      .returning();

    // On page_html update, append a version row
    if (sanitisedPageHtml && result[0]) {
      await tx.insert(campaign_page_versions).values({
        campaign_id: id,
        page_html: sanitisedPageHtml,
        edited_by: userId,
      });
    }

    return result;
  });

  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}

// ---------------------------------------------------------------------------
// DELETE /api/campaigns/:id — soft delete
// ---------------------------------------------------------------------------
export async function DELETE(
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
  const { id } = await context.params;

  const db = getDb();
  const [updated] = await db
    .update(campaigns)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(and(eq(campaigns.id, id), eq(campaigns.org_id, orgId)))
    .returning({ id: campaigns.id });

  if (!updated) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ data: { id: updated.id, status: "cancelled" } });
}
