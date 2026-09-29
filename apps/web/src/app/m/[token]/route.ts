/**
 * /m/[token] — personalised message landing page
 *
 * Resolution order:
 * 1. Hash token → query messages (Modes A/B per-recipient path)
 * 2. If not found → query campaigns.universal_token_hash (Mode C path)
 * 3. If neither found → serve 'invalid' page; increment per-IP miss counter
 *
 * Security:
 * - Raw token never logged
 * - Scanner/bot filter: no DB writes for confirmed scanner hits
 * - IP rate limiting via Redis sliding window (30 req / 10 min)
 * - Invalid-token miss counter (10 misses → 30 min block)
 * - Response headers: no-store, no-referrer, noindex, strict CSP
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { getDb, messages, campaigns, campaign_page_versions, recipients } from "@campaign/db";
import { eq, desc } from "drizzle-orm";
import { hashToken } from "@campaign/core/tokens";
import { render } from "@campaign/core/render";
import { isScannerUA, isScannerTiming } from "@campaign/core/tracking";
import { Redis } from "ioredis";

// ---------------------------------------------------------------------------
// Redis client (singleton)
// ---------------------------------------------------------------------------
let _redis: Redis | undefined;
function getRedis(): Redis {
  if (!_redis) {
    const url = process.env["REDIS_URL"];
    if (!url) throw new Error("REDIS_URL is not set");
    _redis = new Redis(url);
  }
  return _redis;
}

// ---------------------------------------------------------------------------
// Rate limiting helpers
// ---------------------------------------------------------------------------
const RATE_WINDOW_SECONDS = 10 * 60; // 10 minutes
const RATE_MAX_REQUESTS = 30;
const MISS_THRESHOLD = 10;
const MISS_BLOCK_SECONDS = 30 * 60; // 30 minutes

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

async function checkRateLimit(ip: string): Promise<"ok" | "blocked"> {
  const redis = getRedis();
  const hash = ipHash(ip);
  const key = `rl:ip:${hash}`;
  const blockKey = `rl:miss:block:${hash}`;

  // Check if IP is blocked due to too many misses
  const blocked = await redis.get(blockKey);
  if (blocked) return "blocked";

  const now = Date.now();
  const windowStart = now - RATE_WINDOW_SECONDS * 1000;

  // Sliding window using sorted set
  await redis.zremrangebyscore(key, "-inf", windowStart);
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, RATE_WINDOW_SECONDS);

  const count = await redis.zcard(key);
  if (count > RATE_MAX_REQUESTS) return "blocked";

  return "ok";
}

async function recordMiss(ip: string): Promise<void> {
  const redis = getRedis();
  const hash = ipHash(ip);
  const missKey = `rl:miss:${hash}`;
  const blockKey = `rl:miss:block:${hash}`;

  const count = await redis.incr(missKey);
  await redis.expire(missKey, RATE_WINDOW_SECONDS);

  if (count >= MISS_THRESHOLD) {
    await redis.set(blockKey, "1", "EX", MISS_BLOCK_SECONDS);
  }
}

async function writePendingView(messageId: string): Promise<void> {
  const redis = getRedis();
  await redis.set(`pending_view:${messageId}`, "1", "EX", 60);
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------
const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'",
};

// ---------------------------------------------------------------------------
// Page templates
// ---------------------------------------------------------------------------
function invalidPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Page Not Found</title></head><body><h1>This link is not valid.</h1></body></html>`;
}

function expiredPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Link Expired</title></head><body><h1>This link has expired.</h1></body></html>`;
}

interface LandingPageProps {
  content: string;
  messageId?: string | null;
  campaignId?: string | null;
  allowReplies?: boolean;
  isBroadcast?: boolean;
}

function landingPage({
  content,
  messageId,
  campaignId,
  allowReplies = true,
  isBroadcast = false,
}: LandingPageProps): string {
  const beacon = messageId
    ? `<script>
(function() {
  var fired = false;
  function fire() {
    if (fired) return;
    fired = true;
    fetch('/api/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: '${messageId}' })
    }).catch(function(){});
  }
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        setTimeout(fire, 2000);
      }
    });
  });
  observer.observe(document.body);
  ['click','keydown','scroll'].forEach(function(ev) {
    document.addEventListener(ev, fire, { once: true });
  });
})();
</script>`
    : "";

  let replyForm = "";
  if (allowReplies) {
    if (isBroadcast && campaignId) {
      replyForm = `
<div style="max-width: 600px; margin: 40px auto 20px auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
    <span style="font-size: 20px;">💬</span>
    <h3 style="margin: 0; font-size: 17px; font-weight: 600; color: #1e293b;">Reply to this message</h3>
  </div>
  <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">
    This is a public message link. Please include your name and email so the creator knows who replied.
  </p>
  <form id="campaign-reply-form" onsubmit="handleUniversalReply(event)" style="display: flex; flex-direction: column; gap: 12px;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <input id="reply-name" type="text" placeholder="Your Full Name" required style="padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none;" />
      <input id="reply-email" type="email" placeholder="Your Email Address" required style="padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none;" />
    </div>
    <textarea id="reply-body" placeholder="Write your response to the sender..." required rows="3" style="width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; resize: vertical;"></textarea>
    <div style="display: flex; justify-content: flex-end;">
      <button id="reply-btn" type="submit" style="background: #4f46e5; color: #ffffff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;">
        Send Reply →
      </button>
    </div>
    <div id="reply-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 13px; margin-top: 4px;"></div>
  </form>
</div>
<script>
async function handleUniversalReply(e) {
  e.preventDefault();
  var btn = document.getElementById('reply-btn');
  var statusDiv = document.getElementById('reply-status');
  var name = document.getElementById('reply-name').value.trim();
  var email = document.getElementById('reply-email').value.trim();
  var body = document.getElementById('reply-body').value.trim();
  if (!name || !email || !body) return;
  btn.disabled = true;
  btn.innerText = 'Sending...';
  try {
    var res = await fetch('/api/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: '${campaignId}', name: name, email: email, body: body })
    });
    var data = await res.json();
    if (res.ok) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#ecfdf5';
      statusDiv.style.color = '#065f46';
      statusDiv.innerText = '✓ Your reply has been delivered to the sender!';
      document.getElementById('reply-body').value = '';
      btn.innerText = 'Sent ✓';
    } else {
      throw new Error(data.error || 'Failed to send');
    }
  } catch(err) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#fef2f2';
    statusDiv.style.color = '#991b1b';
    statusDiv.innerText = err.message || 'Error sending reply. Please try again.';
    btn.disabled = false;
    btn.innerText = 'Send Reply →';
  }
}
</script>
`;
    } else if (messageId) {
      replyForm = `
<div style="max-width: 600px; margin: 40px auto 20px auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); font-family: system-ui, -apple-system, sans-serif;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
    <span style="font-size: 20px;">💬</span>
    <h3 style="margin: 0; font-size: 17px; font-weight: 600; color: #1e293b;">Reply privately to the sender</h3>
  </div>
  <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">
    Your response will be delivered directly and securely to the campaign owner.
  </p>
  <form id="campaign-reply-form" onsubmit="handlePersonalReply(event)" style="display: flex; flex-direction: column; gap: 12px;">
    <textarea id="reply-body" placeholder="Write your reply here..." required rows="3" style="width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px; border: 1px solid #cbd5e1; border-radius: 8px; outline: none; resize: vertical;"></textarea>
    <div style="display: flex; justify-content: flex-end;">
      <button id="reply-btn" type="submit" style="background: #4f46e5; color: #ffffff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;">
        Send Reply →
      </button>
    </div>
    <div id="reply-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 13px; margin-top: 4px;"></div>
  </form>
</div>
<script>
async function handlePersonalReply(e) {
  e.preventDefault();
  var btn = document.getElementById('reply-btn');
  var statusDiv = document.getElementById('reply-status');
  var body = document.getElementById('reply-body').value.trim();
  if (!body) return;
  btn.disabled = true;
  btn.innerText = 'Sending...';
  try {
    var res = await fetch('/api/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: '${messageId}', body: body })
    });
    var data = await res.json();
    if (res.ok) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#ecfdf5';
      statusDiv.style.color = '#065f46';
      statusDiv.innerText = '✓ Your reply has been sent safely!';
      document.getElementById('reply-body').value = '';
      btn.innerText = 'Sent ✓';
    } else {
      throw new Error(data.error || 'Failed to send');
    }
  } catch(err) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#fef2f2';
    statusDiv.style.color = '#991b1b';
    statusDiv.innerText = err.message || 'Error sending reply. Please try again.';
    btn.disabled = false;
    btn.innerText = 'Send Reply →';
  }
}
</script>
`;
    }
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Message</title></head><body style="margin: 0; background-color: #f8fafc;">${content}${replyForm}${beacon}</body></html>`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Get client IP
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    "unknown";

  // Rate limit check
  const rateLimitResult = await checkRateLimit(ip).catch(() => "ok" as const);
  if (rateLimitResult === "blocked") {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: SECURITY_HEADERS,
    });
  }

  // Get user-agent for scanner detection
  const ua = headersList.get("user-agent") ?? "";

  const tokenHash = hashToken(token);
  const db = getDb();

  // -----------------------------------------------------------------------
  // Try per-recipient message lookup (Modes A/B)
  // -----------------------------------------------------------------------
  const [message] = await db
    .select({
      id: messages.id,
      status: messages.status,
      campaign_id: messages.campaign_id,
      recipient_id: messages.recipient_id,
      expires_at: messages.expires_at,
      sent_at: messages.sent_at,
      delivered_at: messages.delivered_at,
      first_viewed_at: messages.first_viewed_at,
    })
    .from(messages)
    .where(eq(messages.token_hash, tokenHash))
    .limit(1);

  if (message) {
    // Check status
    const terminalStatuses = new Set(["bounced", "complained", "suppressed", "failed"]);
    if (terminalStatuses.has(message.status)) {
      return new NextResponse(invalidPage(), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Check expiry (message-level takes precedence over campaign-level)
    const [campaign] = await db
      .select({ expires_at: campaigns.expires_at, page_html: campaigns.page_html, allow_replies: campaigns.allow_replies })
      .from(campaigns)
      .where(eq(campaigns.id, message.campaign_id))
      .limit(1);

    const expiry = message.expires_at ?? campaign?.expires_at ?? null;
    if (expiry && new Date() > expiry) {
      return new NextResponse(expiredPage(), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Scanner/bot detection
    const isScanner =
      isScannerUA(ua) ||
      isScannerTiming(
        message.delivered_at,
        message.sent_at,
        new Date(),
      );

    if (isScanner) {
      // Serve page but write no DB events
      const [recipient] = await db
        .select({ first_name: recipients.first_name, email: recipients.email, fields: recipients.fields })
        .from(recipients)
        .where(eq(recipients.id, message.recipient_id))
        .limit(1);

      const [latestVersion] = await db
        .select({ page_html: campaign_page_versions.page_html })
        .from(campaign_page_versions)
        .where(eq(campaign_page_versions.campaign_id, message.campaign_id))
        .orderBy(desc(campaign_page_versions.created_at))
        .limit(1);

      const pageTemplate = latestVersion?.page_html ?? campaign?.page_html ?? "";
      const fields: Record<string, string> = {
        email: recipient?.email ?? "",
        first_name: recipient?.first_name ?? "",
        ...(typeof recipient?.fields === "object" && recipient.fields !== null
          ? (recipient.fields as Record<string, string>)
          : {}),
      };

      return new NextResponse(
        landingPage({
          content: render(pageTemplate, fields),
          messageId: null,
          campaignId: message.campaign_id,
          allowReplies: false,
          isBroadcast: false,
        }),
        {
          status: 200,
          headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
        },
      );
    }

    // Real visitor — write pending_view Redis entry for beacon
    await writePendingView(message.id).catch(() => undefined);

    // Render personalised page
    const [recipient] = await db
      .select({ first_name: recipients.first_name, email: recipients.email, fields: recipients.fields })
      .from(recipients)
      .where(eq(recipients.id, message.recipient_id))
      .limit(1);

    const [latestVersion] = await db
      .select({ page_html: campaign_page_versions.page_html })
      .from(campaign_page_versions)
      .where(eq(campaign_page_versions.campaign_id, message.campaign_id))
      .orderBy(desc(campaign_page_versions.created_at))
      .limit(1);

    const pageTemplate = latestVersion?.page_html ?? campaign?.page_html ?? "";
    const fields: Record<string, string> = {
      email: recipient?.email ?? "",
      first_name: recipient?.first_name ?? "",
      ...(typeof recipient?.fields === "object" && recipient.fields !== null
        ? (recipient.fields as Record<string, string>)
        : {}),
    };

    return new NextResponse(
      landingPage({
        content: render(pageTemplate, fields),
        messageId: message.id,
        campaignId: message.campaign_id,
        allowReplies: campaign?.allow_replies ?? true,
        isBroadcast: false,
      }),
      {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  // -----------------------------------------------------------------------
  // Try universal campaign token lookup (Mode C)
  // -----------------------------------------------------------------------
  const [modeCCampaign] = await db
    .select({
      id: campaigns.id,
      status: campaigns.status,
      expires_at: campaigns.expires_at,
      page_html: campaigns.page_html,
      allow_replies: campaigns.allow_replies,
    })
    .from(campaigns)
    .where(eq(campaigns.universal_token_hash, tokenHash))
    .limit(1);

  if (modeCCampaign) {
    // Expiry check
    if (modeCCampaign.expires_at && new Date() > modeCCampaign.expires_at) {
      return new NextResponse(expiredPage(), {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Scanner check — no increment if scanner
    const isScanner = isScannerUA(ua);

    if (!isScanner) {
      // Atomically increment universal view counter
      await db
        .update(campaigns)
        .set({ universal_view_count: campaigns.universal_view_count })
        .where(eq(campaigns.id, modeCCampaign.id))
        .catch(() => undefined);

      // Use raw SQL increment to avoid race conditions
      await db.execute(
        `UPDATE campaigns SET universal_view_count = universal_view_count + 1 WHERE id = '${modeCCampaign.id}'`,
      );
    }

    // Render with all fallbacks (no recipient data)
    const [latestVersion] = await db
      .select({ page_html: campaign_page_versions.page_html })
      .from(campaign_page_versions)
      .where(eq(campaign_page_versions.campaign_id, modeCCampaign.id))
      .orderBy(desc(campaign_page_versions.created_at))
      .limit(1);

    const pageTemplate = latestVersion?.page_html ?? modeCCampaign.page_html;

    return new NextResponse(
      landingPage({
        content: render(pageTemplate, {}),
        messageId: null,
        campaignId: modeCCampaign.id,
        allowReplies: modeCCampaign.allow_replies ?? true,
        isBroadcast: true,
      }),
      {
        status: 200,
        headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  // -----------------------------------------------------------------------
  // Not found — record miss, return invalid page
  // -----------------------------------------------------------------------
  await recordMiss(ip).catch(() => undefined);

  return new NextResponse(invalidPage(), {
    status: 200, // Always 200 — don't reveal whether token exists
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
