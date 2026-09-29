/**
 * BullMQ dispatch worker.
 *
 * Processes one job per message for Mode A (managed_send) campaigns.
 *
 * Job payload: { messageId: string, encryptedToken: string }
 *
 * Per-job steps (per AGENT_PLAN.md section 8):
 * 1. Load message row. If status != 'pending' → skip (idempotency).
 * 2. Check suppression. If suppressed → update status, log event, ack.
 * 3. Decrypt encryptedToken → raw token.
 * 4. Build landing URL: ${LINK_BASE_URL}/m/${rawToken}
 * 5. Call listmonkClient.sendTransactional(...) with link + recipient data.
 * 6. On success: update messages.status = 'dispatched'. Never store raw token.
 * 7. On failure: increment dispatch_attempts. <5 → throw (retry). >=5 → 'failed'.
 * 8. Zero out raw token variable before returning.
 */
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";
import { getDb, messages, events, recipients, campaigns, suppressions, otp_codes } from "@campaign/db";
import { eq, and, lt } from "drizzle-orm";
import { decryptToken, loadEncryptionKey } from "@campaign/core/tokens";
import {
  createListmonkClient,
  listmonkConfigFromEnv,
} from "@campaign/core/listmonk";

const REDIS_URL = process.env["REDIS_URL"];
if (!REDIS_URL) {
  console.error("[worker] REDIS_URL is not set");
  process.exit(1);
}

const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";
const LISTMONK_TX_TEMPLATE_ID = Number(process.env["LISTMONK_TX_TEMPLATE_ID"] ?? 0);
const QUEUE_NAME = "dispatch";
const MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Job payload schema
// ---------------------------------------------------------------------------
const JobPayloadSchema = z.object({
  messageId: z.string().uuid(),
  encryptedToken: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const encKey = loadEncryptionKey();
const listmonk = createListmonkClient(listmonkConfigFromEnv());

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job): Promise<void> => {
    const parsed = JobPayloadSchema.safeParse(job.data);
    if (!parsed.success) {
      console.error(`[worker] Invalid job payload for job ${job.id}:`, parsed.error.issues);
      return; // Don't retry malformed jobs
    }
    const { messageId, encryptedToken } = parsed.data;

    const db = getDb();

    // 1. Load message row
    const [message] = await db
      .select({
        id: messages.id,
        status: messages.status,
        dispatch_attempts: messages.dispatch_attempts,
        recipient_id: messages.recipient_id,
        campaign_id: messages.campaign_id,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      console.warn(`[worker] Message ${messageId} not found — skipping`);
      return;
    }

    // Idempotency: skip if already dispatched or beyond
    if (message.status !== "pending") {
      console.log(
        `[worker] Message ${messageId} already in status '${message.status}' — skipping`,
      );
      return;
    }

    // 2. Load recipient for suppression check
    const [recipient] = await db
      .select({ email: recipients.email, first_name: recipients.first_name })
      .from(recipients)
      .where(eq(recipients.id, message.recipient_id))
      .limit(1);

    if (!recipient) {
      console.warn(`[worker] Recipient for message ${messageId} not found — marking failed`);
      await markFailed(messageId, "Recipient not found");
      return;
    }

    // Load org for suppression check
    const [campaign] = await db
      .select({ org_id: campaigns.org_id, subject: campaigns.subject })
      .from(campaigns)
      .where(eq(campaigns.id, message.campaign_id))
      .limit(1);

    if (!campaign) {
      await markFailed(messageId, "Campaign not found");
      return;
    }

    // 3. Check suppression
    const [suppressed] = await db
      .select({ id: suppressions.id })
      .from(suppressions)
      .where(
        and(
          eq(suppressions.org_id, campaign.org_id),
          eq(suppressions.email, recipient.email),
        ),
      )
      .limit(1);

    if (suppressed) {
      console.log(`[worker] ${recipient.email} suppressed — skipping message ${messageId}`);
      await db
        .update(messages)
        .set({ status: "suppressed" })
        .where(eq(messages.id, messageId));
      await db.insert(events).values({
        message_id: messageId,
        type: "suppressed",
        meta: { reason: "suppressed_at_dispatch" },
      });
      return;
    }

    // 4. Decrypt token (raw token now in memory — zeroize before return)
    let rawToken: string;
    try {
      rawToken = decryptToken(encryptedToken, encKey);
    } catch (err) {
      console.error(`[worker] Failed to decrypt token for message ${messageId}:`, err);
      await markFailed(messageId, "Token decryption failed");
      return;
    }

    // 5. Build landing URL
    const landingUrl = `${LINK_BASE_URL}/m/${rawToken}`;

    // 6. Call listmonk
    try {
      await listmonk.sendTransactional({
        subscriberEmail: recipient.email,
        templateId: LISTMONK_TX_TEMPLATE_ID,
        data: {
          link: landingUrl,
          first_name: recipient.first_name ?? "",
          preheader: "",
        },
        ...(campaign.subject ? { subject: campaign.subject } : {}),
        contentType: "html",
        headers: [
          {
            "List-Unsubscribe": `<${LINK_BASE_URL}/unsubscribe?messageId=${messageId}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        ],
      });
    } catch (err) {
      // Zeroize raw token before propagating error
      rawToken = "";

      const attempts = (message.dispatch_attempts ?? 0) + 1;
      await db
        .update(messages)
        .set({ dispatch_attempts: attempts })
        .where(eq(messages.id, messageId));

      if (attempts >= MAX_ATTEMPTS) {
        await markFailed(messageId, String(err));
        console.error(
          `[worker] Message ${messageId} failed after ${attempts} attempts:`,
          err,
        );
        return; // Don't throw — move to dead-letter implicitly
      }

      throw err; // BullMQ will retry with exponential backoff
    }

    // 7. Update status to 'dispatched'. Never log or store raw token.
    await db
      .update(messages)
      .set({
        status: "dispatched",
        dispatch_attempts: (message.dispatch_attempts ?? 0) + 1,
      })
      .where(eq(messages.id, messageId));

    await db.insert(events).values({
      message_id: messageId,
      type: "dispatched",
      meta: {},
    });

    // 8. Zeroize raw token
    rawToken = "";
  },
  {
    connection,
    concurrency: Number(process.env["LISTMONK_DISPATCH_CONCURRENCY"] ?? 10),
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markFailed(messageId: string, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(messages)
    .set({ status: "failed" })
    .where(eq(messages.id, messageId));
  await db.insert(events).values({
    message_id: messageId,
    type: "failed",
    meta: { reason },
  });
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id ?? "unknown"} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id ?? "unknown"} failed: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Periodic cleanup: purge expired OTP codes every 15 minutes
// ---------------------------------------------------------------------------
const OTP_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

async function cleanupExpiredOtps(): Promise<void> {
  try {
    const db = getDb();
    const deleted = await db
      .delete(otp_codes)
      .where(lt(otp_codes.expires_at, new Date()))
      .returning({ id: otp_codes.id });
    if (deleted.length > 0) {
      console.log(`[worker] Purged ${deleted.length} expired OTP codes`);
    }
  } catch (err) {
    console.error("[worker] Error purging expired OTP codes:", err);
  }
}

const otpCleanupTimer = setInterval(() => {
  void cleanupExpiredOtps();
}, OTP_CLEANUP_INTERVAL_MS);

// Run initial cleanup on startup
void cleanupExpiredOtps();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — draining jobs (max 30 s)`);
  clearInterval(otpCleanupTimer);
  await worker.close();
  await connection.quit();
  console.log("[worker] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log(
  `[worker] Started. Queue: ${QUEUE_NAME}, concurrency: ${process.env["LISTMONK_DISPATCH_CONCURRENCY"] ?? 10}`,
);

