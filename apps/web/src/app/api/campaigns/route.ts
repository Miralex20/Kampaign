/**
 * Campaign CRUD API
 *
 * GET  /api/campaigns         — list campaigns (paginated, filterable)
 * POST /api/campaigns         — create campaign
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, campaign_page_versions } from "@campaign/db";
import { eq, and, desc, count } from "drizzle-orm";
import { sanitiseHtml } from "@campaign/core/sanitise";
import { screenContent } from "@campaign/core/screening";
import { requireSession } from "@/lib/session";
import {
  CreateCampaignSchema,
  ListCampaignsSchema,
} from "@/lib/schemas/campaign";

// ---------------------------------------------------------------------------
// GET /api/campaigns
// ---------------------------------------------------------------------------
export async function GET(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  const url = new URL(request.url);
  const queryParse = ListCampaignsSchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!queryParse.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", issues: queryParse.error.issues },
      { status: 400 },
    );
  }

  const { status, mode, page, limit } = queryParse.data;
  const db = getDb();

  const conditions = [eq(campaigns.org_id, orgId)];
  if (status) conditions.push(eq(campaigns.status, status));
  if (mode) conditions.push(eq(campaigns.campaign_mode, mode));

  const where = and(...conditions);

  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(where)
      .orderBy(desc(campaigns.created_at))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: count() }).from(campaigns).where(where),
  ]);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      limit,
      total: total?.count ?? 0,
      pages: Math.ceil((total?.count ?? 0) / limit),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/campaigns
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId, userId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Screen for phishing keywords (M8 safeguard)
  const pageScreen = screenContent(data.page_html);
  if (!pageScreen.passed) {
    return NextResponse.json(
      { error: "Content blocked: detected prohibited phishing keyword", matched: pageScreen.matched },
      { status: 422 },
    );
  }
  if (data.campaign_mode === "managed_send") {
    const emailScreen = screenContent(data.email_html);
    if (!emailScreen.passed) {
      return NextResponse.json(
        { error: "Content blocked: detected prohibited phishing keyword", matched: emailScreen.matched },
        { status: 422 },
      );
    }
  }

  // Sanitise HTML fields on save
  const sanitisedPageHtml = sanitiseHtml(data.page_html);
  const sanitisedEmailHtml =
    data.campaign_mode === "managed_send" ? sanitiseHtml(data.email_html) : undefined;


  const db = getDb();

  const [campaign] = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(campaigns)
      .values({
        org_id: orgId,
        name: data.name,
        campaign_mode: data.campaign_mode,
        subject: data.campaign_mode === "managed_send" ? data.subject : null,
        preheader: data.campaign_mode === "managed_send" ? (data.preheader ?? null) : null,
        email_html: sanitisedEmailHtml ?? null,
        email_text: data.campaign_mode === "managed_send" ? data.email_text : null,
        page_html: sanitisedPageHtml,
        status: "draft",
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
        require_otp: data.require_otp ?? false,
        created_by: userId,
      })
      .returning();

    // Record initial page version
    if (inserted[0]) {
      await tx.insert(campaign_page_versions).values({
        campaign_id: inserted[0].id,
        page_html: sanitisedPageHtml,
        edited_by: userId,
      });
    }

    return inserted;
  });

  if (!campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  return NextResponse.json({ data: campaign }, { status: 201 });
}
