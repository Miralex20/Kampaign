/**
 * POST /api/campaigns/:id/export-links
 *
 * Export or re-export links CSV for Mode B (link_per_recipient) campaigns.
 *
 * Requirements:
 * - Org-scoped via requireSession()
 * - Only valid for campaign_mode = 'link_per_recipient'
 * - Preserves existing tokens for messages that are already viewed/active
 * - Generates fresh tokens for pending ones
 * - Returns { exportUrl, csv, generatedAt }
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, messages, recipients } from "@campaign/db";
import { eq, and, sql } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { newToken, hashToken } from "@campaign/core/tokens";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
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
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.campaign_mode !== "link_per_recipient") {
    return NextResponse.json(
      { error: "export-links is only supported for link_per_recipient campaigns" },
      { status: 400 },
    );
  }

  // Idempotency: return existing export if generated < 1 hour ago
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  if (
    campaign.link_export_url &&
    campaign.link_export_generated_at &&
    campaign.link_export_generated_at > oneHourAgo
  ) {
    return NextResponse.json({
      data: {
        exportUrl: campaign.link_export_url,
        generatedAt: campaign.link_export_generated_at,
        cached: true,
      },
    });
  }

  const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";

  // Query existing messages joined with recipients
  const messageRows = await db
    .select({
      messageId: messages.id,
      status: messages.status,
      firstViewedAt: messages.first_viewed_at,
      tokenHash: messages.token_hash,
      email: recipients.email,
      firstName: recipients.first_name,
    })
    .from(messages)
    .innerJoin(recipients, eq(messages.recipient_id, recipients.id))
    .where(eq(messages.campaign_id, campaignId));

  const linkRows: Array<{ email: string; first_name: string | null; landing_link: string }> = [];

  await db.transaction(async (tx) => {
    for (const row of messageRows) {
      // If message is pending (not yet viewed), generate a fresh token
      if (!row.firstViewedAt) {
        const rawToken = newToken();
        const th = hashToken(rawToken);

        await tx
          .update(messages)
          .set({ token_hash: th })
          .where(eq(messages.id, row.messageId));

        linkRows.push({
          email: row.email,
          first_name: row.firstName,
          landing_link: `${LINK_BASE_URL}/m/${rawToken}`,
        });
      } else {
        // If already viewed, link already used; show placeholder indicating active message
        linkRows.push({
          email: row.email,
          first_name: row.firstName,
          landing_link: `${LINK_BASE_URL}/m/[already-viewed-${row.messageId.slice(0, 8)}]`,
        });
      }
    }
  });

  // Build CSV
  const csvLines = [
    "email,first_name,landing_link",
    ...linkRows.map(
      (r) =>
        `"${r.email}","${(r.first_name ?? "").replace(/"/g, '""')}","${r.landing_link}"`,
    ),
  ];
  const csvContent = csvLines.join("\n");

  // Save to /tmp
  const filename = `links_${campaignId}_${Date.now()}.csv`;
  const tmpDir = "/tmp";
  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, filename), csvContent, "utf-8");
  } catch (err) {
    console.error("[export-links] Failed to write temp file:", err);
  }

  const exportUrl = `/api/campaigns/${campaignId}/export-links/download?file=${filename}`;
  const now = new Date();

  await db
    .update(campaigns)
    .set({
      link_export_url: exportUrl,
      link_export_generated_at: now,
      updated_at: now,
    })
    .where(eq(campaigns.id, campaignId));

  return NextResponse.json({
    data: {
      exportUrl,
      generatedAt: now,
      totalLinks: linkRows.length,
    },
  });
}
