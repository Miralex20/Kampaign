/**
 * Unsubscribe route — RFC 8058 one-click unsubscribe
 *
 * GET  /unsubscribe?messageId=... — show confirmation page
 * POST /unsubscribe               — add suppression, return 200
 *
 * Both modes (A + B) — token resolves to a messages row regardless of mode.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, messages, campaigns, suppressions, recipients } from "@campaign/db";
import { eq } from "drizzle-orm";

const QuerySchema = z.object({
  messageId: z.string().uuid(),
});

const SECURITY_HEADERS = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "Content-Type": "text/html; charset=utf-8",
};

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));

  if (!parsed.success) {
    return new NextResponse(
      renderCard("Invalid Link", "This unsubscribe link is invalid or incomplete.", null),
      { status: 400, headers: SECURITY_HEADERS },
    );
  }

  const { messageId } = parsed.data;

  const html = renderCard(
    "Unsubscribe Confirmation",
    "Please confirm that you no longer wish to receive email notifications from this campaign sender.",
    `<form method="POST" action="/unsubscribe" style="margin-top: 24px;">
      <input type="hidden" name="messageId" value="${messageId}">
      <button type="submit" style="width: 100%; background: #dc2626; color: white; border: none; padding: 12px 24px; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: background 0.2s;">
        Confirm Unsubscribe
      </button>
    </form>`,
  );

  return new NextResponse(html, {
    status: 200,
    headers: SECURITY_HEADERS,
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let messageId: string;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    messageId = params.get("messageId") ?? "";
  } else {
    // RFC 8058 one-click: body is "List-Unsubscribe=One-Click"
    // messageId should come from the URL search param set in List-Unsubscribe header
    const url = new URL(request.url);
    messageId = url.searchParams.get("messageId") ?? "";
  }

  if (!messageId) {
    return new NextResponse("Invalid request", { status: 400 });
  }

  const db = getDb();

  const [message] = await db
    .select({
      id: messages.id,
      recipient_id: messages.recipient_id,
      campaign_id: messages.campaign_id,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [recipient] = await db
    .select({ email: recipients.email })
    .from(recipients)
    .where(eq(recipients.id, message.recipient_id))
    .limit(1);

  const [campaign] = await db
    .select({ org_id: campaigns.org_id })
    .from(campaigns)
    .where(eq(campaigns.id, message.campaign_id))
    .limit(1);

  if (!recipient || !campaign) {
    return new NextResponse("Not found", { status: 404 });
  }

  await db
    .insert(suppressions)
    .values({
      org_id: campaign.org_id,
      email: recipient.email,
      reason: "unsubscribe",
    })
    .onConflictDoNothing();

  const html = renderCard(
    "Unsubscribed Successfully",
    `Your email (<strong>${recipient.email}</strong>) has been removed. You will not receive any further communications from this sender.`,
    `<div style="margin-top: 24px; text-align: center;">
      <span style="display: inline-block; background: #064e3b; color: #6ee7b7; padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 600;">
        ✓ Preference Saved
      </span>
    </div>`,
  );

  return new NextResponse(html, {
    status: 200,
    headers: SECURITY_HEADERS,
  });
}

function renderCard(title: string, bodyText: string, actionHtml: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Campaign Messaging</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #090d16;
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 16px;
      padding: 36px;
      width: 100%;
      max-width: 460px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #ffffff;">${title}</h1>
    <p style="font-size: 14px; color: #9ca3af; line-height: 1.6;">${bodyText}</p>
    ${actionHtml ?? ""}
  </div>
</body>
</html>`;
}
