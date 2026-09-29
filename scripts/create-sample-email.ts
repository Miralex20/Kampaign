/**
 * Create a Sample Email with a Custom Message and Link
 *
 * Usage:
 *   npx tsx scripts/create-sample-email.ts [options]
 *
 * Options:
 *   --email    Recipient email (default: your.email@example.com)
 *   --name     Recipient name (default: Friend)
 *   --message  Custom message to include in email & landing page
 *   --subject  Email subject line
 */
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { newToken, hashToken } from "@campaign/core/tokens";
import { render } from "@campaign/core/render";

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1]!;
  }
  return fallback;
}

const recipientEmail = getArg("--email", "dev@example.com");
const recipientName = getArg("--name", "Alex");
const customMessage = getArg(
  "--message",
  "We are excited to share your exclusive personalized campaign update! Click your private link below to view your personalized dashboard, leave a reply, or respond.",
);
const subjectLine = getArg("--subject", "Special Update Just for You, {{first_name}}");

const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";
const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://campaign:campaign_dev@localhost:5432/campaign_db";

async function main() {
  console.log("\n=======================================================");
  console.log("   🚀 Generating Sample Email & Personalized Link");
  console.log("=======================================================\n");

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // 1. Get org and admin user
    const userRes = await client.query(
      `SELECT u.id as user_id, u.org_id, o.name as org_name 
       FROM users u 
       JOIN organizations o ON u.org_id = o.id 
       WHERE u.email = 'admin@campaign.local' 
       LIMIT 1;`
    );

    if (!userRes.rows[0]) {
      throw new Error("Admin user not found. Please run scripts/seed.ts first.");
    }
    const { user_id: userId, org_id: orgId, org_name: orgName } = userRes.rows[0];

    // 2. Insert or update the recipient
    console.log(`[1/4] Setting up recipient: ${recipientName} <${recipientEmail}>...`);
    const recipientRes = await client.query(
      `
      INSERT INTO recipients (org_id, email, first_name, consent_status, consent_at, consent_source, fields)
      VALUES ($1, $2, $3, 'granted', now(), 'Direct Self-Test', $4)
      ON CONFLICT (org_id, email) DO UPDATE
        SET first_name = EXCLUDED.first_name,
            consent_status = 'granted',
            fields = EXCLUDED.fields,
            deleted_at = NULL
      RETURNING id;
      `,
      [
        orgId,
        recipientEmail,
        recipientName,
        JSON.stringify({
          custom_message: customMessage,
          company: orgName,
        }),
      ]
    );
    const recipientId = recipientRes.rows[0].id;

    // 3. Create or use test campaign
    console.log("[2/4] Creating campaign with custom email & landing page template...");
    const emailHtmlTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{subject}}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Hello, {{first_name}}!</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 15px;">A personal message from ${orgName}</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px; color: #374151; font-size: 16px; line-height: 1.6;">
      <p style="margin-top: 0;">Hi <strong>{{first_name}}</strong>,</p>
      
      <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px; font-style: italic; color: #1e293b;">
        "{{custom_message}}"
      </div>

      <p>We created a secure, interactive private page for you to view more details and reply directly:</p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 36px 0;">
        <a href="{{landing_link}}" style="background: #4f46e5; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
          Open Your Private Page →
        </a>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Or copy and paste this link into your browser:<br/>
        <a href="{{landing_link}}" style="color: #4f46e5; word-break: break-all;">{{landing_link}}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af;">
      Sent to {{email}} · <a href="${LINK_BASE_URL}/unsubscribe" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>
    `.trim();

    const pageHtmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Personal Message for {{first_name}}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f19; color: #f9fafb; margin: 0; padding: 40px 20px; min-height: 100vh;">
  <div style="max-width: 680px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 40px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
      <div style="width: 14px; height: 14px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981;"></div>
      <span style="font-size: 13px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Verified Private Page</span>
    </div>

    <h1 style="font-size: 28px; font-weight: 800; margin: 0 0 16px 0; color: #ffffff;">Welcome, {{first_name}}!</h1>

    <div style="background: #1f2937; border-left: 4px solid #6366f1; padding: 20px; border-radius: 8px; margin: 24px 0; font-size: 17px; line-height: 1.6; color: #e5e7eb;">
      {{custom_message}}
    </div>

    <p style="color: #9ca3af; line-height: 1.6;">
      This page was generated specifically for <strong>{{email}}</strong>. You can interact with the options below or send a private reply.
    </p>

    <!-- Reply Box -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #374151;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #f3f4f6;">Send a Reply</h3>
      <textarea id="replyText" placeholder="Type your response or thoughts here..." rows="3" style="width: 100%; box-sizing: border-box; background: #182234; border: 1px solid #374151; color: #fff; padding: 12px; border-radius: 8px; font-size: 14px; resize: vertical;"></textarea>
      <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
        <button onclick="submitReply()" id="replyBtn" style="background: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Send Response
        </button>
      </div>
      <div id="replyStatus" style="margin-top: 10px; font-size: 13px; display: none;"></div>
    </div>
  </div>

  <script>
    async function submitReply() {
      const text = document.getElementById('replyText').value.trim();
      const status = document.getElementById('replyStatus');
      const btn = document.getElementById('replyBtn');
      if (!text) return;
      btn.disabled = true;
      btn.innerText = 'Sending...';

      try {
        const res = await fetch(window.location.pathname + '/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text })
        });
        if (res.ok) {
          status.style.display = 'block';
          status.style.color = '#34d399';
          status.innerText = '✓ Your reply has been received! Thank you.';
          document.getElementById('replyText').value = '';
        } else {
          status.style.display = 'block';
          status.style.color = '#f87171';
          status.innerText = 'Error sending reply. Please try again.';
        }
      } catch (err) {
        status.style.display = 'block';
        status.style.color = '#f87171';
        status.innerText = 'Network error.';
      } finally {
        btn.disabled = false;
        btn.innerText = 'Send Response';
      }
    }
  </script>
</body>
</html>
    `.trim();

    const campaignRes = await client.query(
      `
      INSERT INTO campaigns (org_id, name, campaign_mode, subject, email_html, email_text, page_html, status, created_by)
      VALUES ($1, $2, 'managed_send', $3, $4, $5, $6, 'live', $7)
      RETURNING id;
      `,
      [
        orgId,
        `Self-Test Campaign (${new Date().toLocaleTimeString()})`,
        subjectLine,
        emailHtmlTemplate,
        customMessage,
        pageHtmlTemplate,
        userId,
      ]
    );
    const campaignId = campaignRes.rows[0].id;

    // 4. Generate unique secure token and message record
    console.log("[3/4] Generating unique recipient token & message record...");
    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const landingUrl = `${LINK_BASE_URL}/m/${rawToken}`;

    await client.query(
      `
      INSERT INTO messages (campaign_id, recipient_id, token_hash, status, sent_at)
      VALUES ($1, $2, $3, 'dispatched', now())
      ON CONFLICT (campaign_id, recipient_id) DO NOTHING;
      `,
      [campaignId, recipientId, tokenHash]
    );

    // 5. Render personalized email
    console.log("[4/4] Rendering personalized email...");
    const renderData = {
      email: recipientEmail,
      first_name: recipientName,
      custom_message: customMessage,
      landing_link: landingUrl,
      subject: render(subjectLine, { first_name: recipientName }),
    };

    const renderedSubject = render(subjectLine, renderData);
    const renderedEmailHtml = render(emailHtmlTemplate, renderData);

    // Save rendered email to sample-email.html for one-click browser preview
    const sampleHtmlPath = resolve(process.cwd(), "sample-email.html");
    writeFileSync(sampleHtmlPath, renderedEmailHtml, "utf-8");

    console.log("\n=======================================================");
    console.log("   ✅ SAMPLE EMAIL READY!");
    console.log("=======================================================");
    console.log(`\n📧 Recipient:     ${recipientName} <${recipientEmail}>`);
    console.log(`🏷️  Subject:       ${renderedSubject}`);
    console.log(`🔗 Landing Link:  ${landingUrl}`);
    console.log(`📄 Saved to HTML: ${sampleHtmlPath}`);
    console.log("\n-------------------------------------------------------");
    console.log("👉 How to view / test this immediately:");
    console.log(`1. Click or open your personal landing page link:`);
    console.log(`   ${landingUrl}`);
    console.log(`\n2. Open the rendered email in your browser:`);
    console.log(`   file://${sampleHtmlPath}`);
    console.log(`\n3. You can also view the campaign in your dashboard at:`);
    console.log(`   http://localhost:3000`);
    console.log("=======================================================\n");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error generating sample email:", err);
  process.exit(1);
});
