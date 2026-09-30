/**
 * POST /api/campaigns/:id/launch
 *
 * Launches a campaign. Branches on campaign_mode:
 *
 * Mode A (managed_send):
 *   - Gates: org review_state must be 'approved', daily_cap enforced
 *   - Per eligible recipient: generate token → hash → encrypt → messages row
 *   - Enqueue one BullMQ job per message
 *   - Status → 'launching'
 *
 * Mode B (link_per_recipient):
 *   - No review/cap gates
 *   - Per eligible recipient: generate token → hash → messages row
 *   - Build links_export.csv download
 *   - Status → 'live'
 *   - No BullMQ jobs
 *
 * Mode C (link_universal):
 *   - No recipient list needed
 *   - Generate one shared token → universal_token_hash on campaign
 *   - Status → 'live'
 *   - No messages rows, no BullMQ jobs
 */
import { NextResponse } from "next/server";
import { getDb, campaigns, messages, recipients, suppressions, organizations } from "@campaign/db";
import { eq, and, count, sql } from "drizzle-orm";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { newToken, hashToken, encryptToken, loadEncryptionKey } from "@campaign/core/tokens";
import { requireSession } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";

let _queue: Queue | undefined;
function getQueue(): Queue {
  if (!_queue) {
    const redisUrl = process.env["REDIS_URL"];
    if (!redisUrl) throw new Error("REDIS_URL is not set");
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    _queue = new Queue("dispatch", { connection });
  }
  return _queue;
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;
  const { id: campaignId } = await context.params;

  const db = getDb();

  // 1. Load campaign (org-scoped)
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.org_id, orgId)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Only draft/approved campaigns can be launched
  const launchableStatuses = new Set(["draft", "approved"]);
  if (!launchableStatuses.has(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot launch campaign with status '${campaign.status}'` },
      { status: 409 },
    );
  }

  // -----------------------------------------------------------------------
  // Mode C — link_universal: single shared token
  // -----------------------------------------------------------------------
  if (campaign.campaign_mode === "link_universal") {
    // Re-launch idempotency: if already live with a token, return existing URL
    if (campaign.status === "live" && campaign.universal_token_hash) {
      return NextResponse.json({
        data: { mode: "link_universal", message: "Already launched", status: "live" },
      });
    }

    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const sharedUrl = `${LINK_BASE_URL}/m/${rawToken}`;

    await db
      .update(campaigns)
      .set({
        universal_token_hash: tokenHash,
        status: "live",
        updated_at: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    // Discard raw token — only the URL is needed by the caller
    return NextResponse.json({
      data: {
        mode: "link_universal",
        sharedUrl,
        status: "live",
      },
    });
  }

  // -----------------------------------------------------------------------
  // Mode A — managed_send: org review gate + daily cap
  // -----------------------------------------------------------------------
  if (campaign.campaign_mode === "managed_send") {
    const [org] = await db
      .select({ review_state: organizations.review_state, daily_cap: organizations.daily_cap })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 500 });
    }

    if (org.review_state !== "approved") {
      return NextResponse.json(
        { error: "Campaign pending manual review — org not yet approved for sending" },
        { status: 403 },
      );
    }

    // Count messages dispatched today for this org (daily cap enforcement)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [sentToday] = await db
      .select({ count: count() })
      .from(messages)
      .innerJoin(campaigns, eq(messages.campaign_id, campaigns.id))
      .where(and(eq(campaigns.org_id, orgId), sql`${messages.sent_at} >= ${todayStart}`));

    const dispatchedToday = sentToday?.count ?? 0;
    const remaining = Math.max(0, org.daily_cap - dispatchedToday);

    if (remaining === 0) {
      return NextResponse.json(
        { error: "Daily sending cap reached. Messages will be dispatched after midnight UTC." },
        { status: 429 },
      );
    }

    return launchPerRecipient(campaignId, orgId, "managed_send", remaining);
  }

  // -----------------------------------------------------------------------
  // Mode B — link_per_recipient: generate tokens, produce CSV
  // -----------------------------------------------------------------------
  return launchPerRecipient(campaignId, orgId, "link_per_recipient", Infinity);
}

// ---------------------------------------------------------------------------
// Shared per-recipient launch logic (Modes A and B)
// ---------------------------------------------------------------------------

async function launchPerRecipient(
  campaignId: string,
  orgId: string,
  mode: "managed_send" | "link_per_recipient",
  cap: number,
): Promise<NextResponse> {
  const db = getDb();

  // Load eligible recipients: consented, not deleted, not suppressed
  const eligibleRecipients = await db
    .select({
      id: recipients.id,
      email: recipients.email,
      first_name: recipients.first_name,
    })
    .from(recipients)
    .where(
      and(
        eq(recipients.org_id, orgId),
        eq(recipients.consent_status, "granted"),
        sql`${recipients.deleted_at} IS NULL`,
      ),
    );

  // Filter out suppressed emails
  const suppressedRows = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.org_id, orgId));
  const suppressedEmails = new Set(suppressedRows.map((r) => r.email.toLowerCase()));

  const eligible = eligibleRecipients.filter((r) => !suppressedEmails.has(r.email.toLowerCase()));

  const batch = eligible.slice(0, Math.min(eligible.length, cap));

  if (batch.length === 0) {
    return NextResponse.json({ error: "No eligible recipients to dispatch" }, { status: 422 });
  }

  // Load encryption key (Mode A only — needed to encrypt tokens for BullMQ)
  let encKey: Buffer | undefined;
  if (mode === "managed_send") {
    try {
      encKey = loadEncryptionKey();
    } catch {
      return NextResponse.json({ error: "TOKEN_ENCRYPTION_KEY not configured" }, { status: 500 });
    }
  }

  // Build link export rows (Mode B) or job payloads (Mode A)
  const linkRows: Array<{ email: string; first_name: string | null; landing_link: string }> = [];
  const jobPayloads: Array<{ messageId: string; encryptedToken: string }> = [];

  await db.transaction(async (tx) => {
    for (const recipient of batch) {
      const rawToken = newToken();
      const tokenHash = hashToken(rawToken);

      // Idempotent: skip if message row already exists for this (campaign, recipient)
      const existing = await tx
        .select({ id: messages.id, status: messages.status })
        .from(messages)
        .where(and(eq(messages.campaign_id, campaignId), eq(messages.recipient_id, recipient.id)))
        .limit(1);

      let messageId: string;
      if (existing[0]) {
        messageId = existing[0].id;
        // Re-launch: only re-enqueue if still pending
        if (existing[0].status !== "pending") continue;
      } else {
        const [inserted] = await tx
          .insert(messages)
          .values({
            campaign_id: campaignId,
            recipient_id: recipient.id,
            token_hash: tokenHash,
            status: "pending",
          })
          .returning({ id: messages.id });

        if (!inserted) continue;
        messageId = inserted.id;
      }

      const landingLink = `${LINK_BASE_URL}/m/${rawToken}`;

      if (mode === "managed_send" && encKey) {
        const encryptedToken = encryptToken(rawToken, encKey);
        jobPayloads.push({ messageId, encryptedToken });
      } else {
        linkRows.push({
          email: recipient.email,
          first_name: recipient.first_name ?? null,
          landing_link: landingLink,
        });
      }
    }

    // Update campaign status
    const newStatus = mode === "managed_send" ? "launching" : "live";
    await tx
      .update(campaigns)
      .set({ status: newStatus, updated_at: new Date() })
      .where(eq(campaigns.id, campaignId));
  });

  // After transaction: enqueue BullMQ jobs (Mode A)
  if (mode === "managed_send" && jobPayloads.length > 0) {
    const queue = getQueue();
    await queue.addBulk(
      jobPayloads.map(({ messageId, encryptedToken }) => ({
        name: "dispatch",
        data: { messageId, encryptedToken },
        opts: {
          jobId: messageId, // idempotent — same jobId = no duplicate
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
        },
      })),
    );

    return NextResponse.json({
      data: {
        mode: "managed_send",
        dispatched: jobPayloads.length,
        status: "launching",
      },
    });
  }

  // Mode B: return the export data inline
  if (mode === "link_per_recipient") {
    // Build CSV content
    const csvLines = [
      "email,first_name,landing_link",
      ...linkRows.map(
        (r) => `"${r.email}","${(r.first_name ?? "").replace(/"/g, '""')}","${r.landing_link}"`,
      ),
    ];
    const csvContent = csvLines.join("\n");

    // Store export URL on campaign (simplified — full signed URL in full M4)
    const db2 = getDb();
    await db2
      .update(campaigns)
      .set({
        link_export_generated_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(campaigns.id, campaignId));

    return NextResponse.json({
      data: {
        mode: "link_per_recipient",
        recipientCount: linkRows.length,
        status: "live",
        csvContent, // Caller downloads this
      },
    });
  }

  return NextResponse.json({ error: "Unexpected launch state" }, { status: 500 });
}
