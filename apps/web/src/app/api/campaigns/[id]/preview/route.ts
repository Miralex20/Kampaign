/**
 * GET /api/campaigns/:id/preview
 *
 * Renders a preview of the campaign for a given recipient (or with fallbacks only).
 *
 * Query params:
 *   recipientId?: UUID — if provided, renders with that recipient's fields
 *
 * Response:
 *   {
 *     mode: "managed_send" | "link_per_recipient" | "link_universal"
 *     pageHtml: string        — rendered page HTML
 *     emailHtml?: string      — rendered email HTML (managed_send only)
 *     emailText?: string      — plain-text alt (managed_send only)
 *     subject?: string        — rendered subject line (managed_send only)
 *     allFallbacksHtml: string — synthetic "all fields missing" render
 *   }
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, campaign_page_versions, recipients } from "@campaign/db";
import { eq, and, desc } from "drizzle-orm";
import { render } from "@campaign/core/render";
import { requireSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;
  const { id } = await context.params;

  const url = new URL(request.url);
  const recipientId = url.searchParams.get("recipientId");

  const db = getDb();

  // Fetch campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Fetch latest page version
  const [latestVersion] = await db
    .select()
    .from(campaign_page_versions)
    .where(eq(campaign_page_versions.campaign_id, id))
    .orderBy(desc(campaign_page_versions.created_at))
    .limit(1);

  const pageTemplate = latestVersion?.page_html ?? campaign.page_html;

  // Build field data for rendering
  let fields: Record<string, string> = {};
  let recipientEmail = "";

  if (
    recipientId &&
    (campaign.campaign_mode === "managed_send" || campaign.campaign_mode === "link_per_recipient")
  ) {
    const [recipient] = await db
      .select()
      .from(recipients)
      .where(and(eq(recipients.id, recipientId), eq(recipients.org_id, orgId)))
      .limit(1);

    if (recipient) {
      recipientEmail = recipient.email;
      fields = {
        email: recipient.email,
        first_name: recipient.first_name ?? "",
        ...(typeof recipient.fields === "object" && recipient.fields !== null
          ? (recipient.fields as Record<string, string>)
          : {}),
      };
    }
  }

  // Render page HTML with fields
  const pageHtml = render(pageTemplate, fields);

  // Synthetic "all fallbacks" render — empty fields object reveals unfallbacked placeholders
  const allFallbacksHtml = render(pageTemplate, {});

  const response: Record<string, unknown> = {
    mode: campaign.campaign_mode,
    pageHtml,
    allFallbacksHtml,
    ...(recipientEmail ? { recipientEmail } : {}),
  };

  // Email preview (managed_send only)
  if (campaign.campaign_mode === "managed_send") {
    response["emailHtml"] = campaign.email_html ? render(campaign.email_html, fields) : null;
    response["emailText"] = campaign.email_text ? render(campaign.email_text, fields) : null;
    response["subject"] = campaign.subject ? render(campaign.subject, fields) : null;
  }

  return NextResponse.json({ data: response });
}
