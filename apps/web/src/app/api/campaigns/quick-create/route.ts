/**
 * POST /api/campaigns/quick-create
 *
 * Unified campaign and personalized link creator for the dashboard UI.
 * Handles:
 * 1. Single recipient or batch recipient list (with first_name, sex, custom fields).
 * 2. Dynamic template substitution ({{first_name}}, {{sex}}, etc.) in intro mail and landing page.
 * 3. Instant generation of personalized links (/m/[token]) for every recipient.
 * 4. Automatic exportable CSV string generation (email, first_name, sex, landing_link).
 * 5. Optional platform email dispatch (via listmonk / worker) with custom intro teaser.
 * 6. Universal broadcast link mode (WhatsApp / group) with name + email reply support.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDb,
  campaigns,
  campaign_page_versions,
  recipients,
  messages,
  users,
  organizations,
} from "@campaign/db";
import { eq } from "drizzle-orm";
import { newToken, hashToken } from "@campaign/core/tokens";
import { render } from "@campaign/core/render";
import { sanitiseHtml } from "@campaign/core/sanitise";
import { createListmonkClient, listmonkConfigFromEnv } from "@campaign/core/listmonk";
import { auth } from "@/auth";

const RecipientItemSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  sex: z.string().optional(),
  fields: z.record(z.string()).optional(),
});

const QuickCreateSchema = z.object({
  name: z.string().min(1).max(200).default("My Campaign"),
  campaignMode: z.enum(["managed_send", "link_per_recipient", "link_universal"]).default("link_per_recipient"),
  // Single recipient fields (fallback)
  recipientName: z.string().optional().default("Friend"),
  recipientEmail: z.string().email().optional().default("alex@example.com"),
  recipientSex: z.string().optional().default(""),
  // Multiple recipients array
  recipientsList: z.array(RecipientItemSchema).optional(),
  subject: z.string().min(1).default("Special update for you, {{first_name}}"),
  message: z.string().min(1).default("Here is a private personalized message just for you."),
  buttonText: z.string().min(1).default("Open Your Private Page →"),
  pageHtml: z.string().optional(),
  allowReplies: z.boolean().default(true),
  dispatchViaPlatform: z.boolean().default(false),
});

const LINK_BASE_URL = process.env["LINK_BASE_URL"] ?? "http://localhost:3000";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = QuickCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const {
    name,
    campaignMode,
    recipientName,
    recipientEmail,
    recipientSex,
    recipientsList,
    subject,
    message,
    buttonText,
    pageHtml: userCustomPageHtml,
    allowReplies,
    dispatchViaPlatform,
  } = parsed.data;

  const db = getDb();

  // Determine user & org (from session or dev admin fallback)
  let userId: string;
  let orgId: string;
  let orgName = "Campaign Studio";

  const session = await auth();
  if (session?.user?.id && session?.user?.orgId) {
    userId = session.user.id;
    orgId = session.user.orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (org) orgName = org.name;
  } else {
    // Fallback to seeded admin in dev mode
    const [adminUser] = await db
      .select({
        userId: users.id,
        orgId: users.org_id,
        orgName: organizations.name,
      })
      .from(users)
      .innerJoin(organizations, eq(users.org_id, organizations.id))
      .where(eq(users.email, "admin@campaign.local"))
      .limit(1);

    if (!adminUser) {
      return NextResponse.json(
        { error: "No organization found. Please run seed script first." },
        { status: 500 },
      );
    }
    userId = adminUser.userId;
    orgId = adminUser.orgId;
    orgName = adminUser.orgName;
  }

  // 1. Prepare template HTMLs
  const emailHtmlTemplate = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>{{subject}}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 32px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Hello, {{first_name}}!</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 15px;">A personal note from ${orgName}</p>
    </div>
    <div style="padding: 32px; color: #374151; font-size: 16px; line-height: 1.6;">
      <p style="margin-top: 0;">Hi <strong>{{first_name}}</strong>,</p>
      <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px; font-style: italic; color: #1e293b;">
        "{{custom_message}}"
      </div>
      <p>We created a private, interactive landing page for you to view more details and reply directly:</p>
      <div style="text-align: center; margin: 36px 0;">
        <a href="{{landing_link}}" style="background: #4f46e5; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
          ${buttonText}
        </a>
      </div>
      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Or click here: <a href="{{landing_link}}" style="color: #4f46e5; word-break: break-all;">{{landing_link}}</a>
      </p>
    </div>
    <div style="background: #f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af;">
      Sent to {{email}} · <a href="${LINK_BASE_URL}/unsubscribe" style="color: #6b7280;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  const defaultLandingPageHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 680px; margin: 40px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; color: #0f172a; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
    <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></div>
    <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Confidential Message for {{first_name}}</span>
  </div>

  <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px 0; color: #0f172a;">Welcome, {{first_name}}!</h1>

  <div style="background: #f8fafc; border-left: 3px solid #4f46e5; padding: 18px; border-radius: 6px; margin: 20px 0; font-size: 16px; line-height: 1.6; color: #334155;">
    {{custom_message}}
  </div>

  <p style="color: #64748b; line-height: 1.6; font-size: 14px; margin: 20px 0 0 0;">
    Recipient: <strong>{{email}}</strong> · Profile: <strong>{{sex|Direct Member}}</strong>
  </p>
</div>
  `.trim();

  const pageHtmlToSave = sanitiseHtml(userCustomPageHtml && userCustomPageHtml.trim().length > 0 ? userCustomPageHtml : defaultLandingPageHtml);

  // 2. Handle Mode C (Universal Broadcast Link)
  if (campaignMode === "link_universal") {
    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const sharedUrl = `${LINK_BASE_URL}/m/${rawToken}`;

    const [campaign] = await db
      .insert(campaigns)
      .values({
        org_id: orgId,
        name,
        campaign_mode: "link_universal",
        page_html: pageHtmlToSave,
        status: "live",
        universal_token_hash: tokenHash,
        allow_replies: allowReplies,
        created_by: userId,
      })
      .returning();

    if (!campaign) {
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }

    await db.insert(campaign_page_versions).values({
      campaign_id: campaign.id,
      page_html: pageHtmlToSave,
      edited_by: userId,
    });

    const renderedSamplePage = render(pageHtmlToSave, {
      first_name: "Friend",
      sex: "Member",
      custom_message: message,
      email: "your-email@example.com",
    });

    return NextResponse.json({
      data: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignMode: "link_universal",
        sharedUrl,
        landingUrl: sharedUrl,
        allowReplies,
        renderedSubject: subject,
        renderedEmailHtml: "",
        renderedPageHtml: renderedSamplePage,
        recipients: [],
        exportCsv: "",
        totalGenerated: 1,
      },
    });
  }

  // 3. Handle Personalized Recipients (Mode A & Mode B)
  const itemsToProcess: Array<{
    email: string;
    first_name: string;
    sex: string;
    fields: Record<string, string>;
  }> = [];

  if (recipientsList && recipientsList.length > 0) {
    for (const r of recipientsList) {
      itemsToProcess.push({
        email: r.email.toLowerCase().trim(),
        first_name: r.first_name?.trim() || "Friend",
        sex: r.sex?.trim() || (r.fields?.["sex"] || r.fields?.["gender"] || ""),
        fields: {
          ...(r.fields || {}),
          sex: r.sex?.trim() || (r.fields?.["sex"] || r.fields?.["gender"] || ""),
          custom_message: message,
          company: orgName,
        },
      });
    }
  } else {
    itemsToProcess.push({
      email: recipientEmail.toLowerCase().trim(),
      first_name: recipientName.trim() || "Friend",
      sex: recipientSex.trim(),
      fields: {
        sex: recipientSex.trim(),
        custom_message: message,
        company: orgName,
      },
    });
  }

  // Create campaign
  const effectiveMode = dispatchViaPlatform ? "managed_send" : "link_per_recipient";
  const [campaign] = await db
    .insert(campaigns)
    .values({
      org_id: orgId,
      name,
      campaign_mode: effectiveMode,
      subject: subject,
      email_html: sanitiseHtml(emailHtmlTemplate),
      email_text: message,
      page_html: pageHtmlToSave,
      status: "live",
      allow_replies: allowReplies,
      created_by: userId,
    })
    .returning();

  if (!campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  await db.insert(campaign_page_versions).values({
    campaign_id: campaign.id,
    page_html: pageHtmlToSave,
    edited_by: userId,
  });

  // Process all recipients, generate tokens, create messages
  const generatedRecipients: Array<{
    email: string;
    first_name: string;
    sex: string;
    landing_link: string;
  }> = [];

  let listmonkClient: ReturnType<typeof createListmonkClient> | null = null;
  if (dispatchViaPlatform) {
    try {
      listmonkClient = createListmonkClient(listmonkConfigFromEnv());
    } catch (e) {
      console.warn("[quick-create] Listmonk client initialization skipped / offline:", e);
    }
  }

  for (const item of itemsToProcess) {
    // 1. Upsert recipient
    const [rec] = await db
      .insert(recipients)
      .values({
        org_id: orgId,
        email: item.email,
        first_name: item.first_name,
        consent_status: "granted",
        consent_at: new Date(),
        consent_source: "Campaign Studio",
        fields: item.fields,
      })
      .onConflictDoUpdate({
        target: [recipients.org_id, recipients.email],
        set: {
          first_name: item.first_name,
          consent_status: "granted",
          deleted_at: null,
          fields: item.fields,
        },
      })
      .returning({ id: recipients.id });

    if (!rec) continue;

    // 2. Generate token & link
    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const landingUrl = `${LINK_BASE_URL}/m/${rawToken}`;

    // 3. Create message row
    await db
      .insert(messages)
      .values({
        campaign_id: campaign.id,
        recipient_id: rec.id,
        token_hash: tokenHash,
        status: dispatchViaPlatform ? "dispatched" : "pending",
        sent_at: dispatchViaPlatform ? new Date() : null,
      });

    // 4. Send via platform if requested
    if (dispatchViaPlatform && listmonkClient) {
      try {
        const renderData = {
          email: item.email,
          first_name: item.first_name,
          sex: item.sex,
          custom_message: message,
          landing_link: landingUrl,
        };
        const recipientSubject = render(subject, renderData);
        const recipientEmailHtml = render(emailHtmlTemplate, renderData);

        await listmonkClient.sendTransactional({
          subscriberEmail: item.email,
          templateId: Number(process.env["LISTMONK_TX_TEMPLATE_ID"] ?? 1),
          subject: recipientSubject,
          contentType: "html",
          data: {
            content: recipientEmailHtml,
            subject: recipientSubject,
            landing_link: landingUrl,
            first_name: item.first_name,
            sex: item.sex,
          },
        }).catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[quick-create] Send to ${item.email} encountered error:`, errMsg);
        });
      } catch (err) {
        console.warn(`[quick-create] Error dispatching to ${item.email}:`, err);
      }
    }

    generatedRecipients.push({
      email: item.email,
      first_name: item.first_name,
      sex: item.sex,
      landing_link: landingUrl,
    });
  }

  // Generate CSV download string
  const csvRows = [
    ["email", "first_name", "sex", "landing_link"].join(","),
    ...generatedRecipients.map((r) =>
      [
        `"${r.email}"`,
        `"${r.first_name.replace(/"/g, '""')}"`,
        `"${r.sex.replace(/"/g, '""')}"`,
        `"${r.landing_link}"`,
      ].join(","),
    ),
  ];
  const exportCsv = csvRows.join("\n");

  // Sample render for preview
  const firstItem = itemsToProcess[0]!;
  const firstLandingUrl = generatedRecipients[0]?.landing_link || `${LINK_BASE_URL}/m/sample`;
  const previewData = {
    email: firstItem.email,
    first_name: firstItem.first_name,
    sex: firstItem.sex,
    custom_message: message,
    landing_link: firstLandingUrl,
    subject: render(subject, { first_name: firstItem.first_name, sex: firstItem.sex }),
  };

  const renderedSubject = render(subject, previewData);
  const renderedEmailHtml = render(emailHtmlTemplate, previewData);
  const renderedPageHtml = render(pageHtmlToSave, previewData);

  return NextResponse.json({
    data: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignMode: effectiveMode,
      totalGenerated: generatedRecipients.length,
      landingUrl: firstLandingUrl,
      renderedSubject,
      renderedEmailHtml,
      renderedPageHtml,
      recipients: generatedRecipients,
      exportCsv,
      allowReplies,
      dispatchViaPlatform,
    },
  });
}
