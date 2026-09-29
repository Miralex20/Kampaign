/**
 * Database Seed Script
 *
 * Populates:
 * - Approved organization with verified domain
 * - Admin user & NextAuth user
 * - Active session token for instant browser login
 * - Sample campaigns (Mode A, Mode B, Mode C)
 * - Sample recipients with granted consent
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { newToken, hashToken } from "@campaign/core/tokens";

async function seed() {
  const url = process.env["DATABASE_URL"] ?? "postgres://campaign:campaign_dev@localhost:5432/campaign_db";
  console.log(`[seed] Connecting to ${url}...`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    console.log("[seed] Seeding database...");

    const orgId = randomUUID();
    const userId = randomUUID();
    const sessionToken = "dev_session_token_campaign_2026";
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // 1. Create Organization (Approved, verified domain)
    const orgRes = await client.query(
      `
      INSERT INTO organizations (id, name, sending_domain, domain_verified_at, plan, daily_cap, review_state)
      VALUES ($1, 'Acme Global Corp', 'campaign.local', now(), 'enterprise', 5000, 'approved')
      ON CONFLICT DO NOTHING
      RETURNING id;
      `,
      [orgId],
    );
    const activeOrgId = orgRes.rows[0]?.id ?? orgId;

    // 2. Create App User
    await client.query(
      `
      INSERT INTO users (id, org_id, email, role)
      VALUES ($1, $2, 'admin@campaign.local', 'admin')
      ON CONFLICT (email) DO NOTHING;
      `,
      [userId, activeOrgId],
    );

    // 3. Create Auth.js user & session
    await client.query(
      `
      INSERT INTO auth_users (id, name, email, email_verified)
      VALUES ($1, 'Admin User', 'admin@campaign.local', now())
      ON CONFLICT (email) DO UPDATE SET email_verified = now();
      `,
      [userId],
    );

    await client.query(
      `
      INSERT INTO auth_sessions (session_token, user_id, expires)
      VALUES ($1, $2, $3)
      ON CONFLICT (session_token) DO UPDATE SET expires = $3;
      `,
      [sessionToken, userId, expires],
    );

    // 4. Create sample recipients
    const rec1Id = randomUUID();
    const rec2Id = randomUUID();
    await client.query(
      `
      INSERT INTO recipients (id, org_id, email, first_name, fields, consent_status, consent_at, consent_source)
      VALUES 
        ($1, $3, 'alice@example.com', 'Alice', '{"company": "Acme", "tier": "VIP"}'::jsonb, 'granted', now(), 'web_form'),
        ($2, $3, 'bob@example.com', 'Bob', '{"company": "Beta Corp", "tier": "Standard"}'::jsonb, 'granted', now(), 'web_form')
      ON CONFLICT (org_id, email) DO NOTHING;
      `,
      [rec1Id, rec2Id, activeOrgId],
    );

    // 5. Create Sample Campaign Mode C (Broadcast / Share Anywhere)
    const modeCToken = newToken();
    const modeCHash = hashToken(modeCToken);
    const campCId = randomUUID();

    await client.query(
      `
      INSERT INTO campaigns (id, org_id, name, campaign_mode, status, page_html, universal_token_hash, created_by)
      VALUES (
        $1, $2, 'Public Community Announcement', 'link_universal', 'live',
        '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;border-radius:8px;background:#f9fafb;"><h1>Welcome to Acme Community!</h1><p>This is a broadcast landing page visible to everyone with the link.</p><div style="margin-top:20px;padding:15px;background:#fff;border-radius:6px;border:1px solid #e5e7eb;"><strong>Status:</strong> Active Announcement</div></body></html>',
        $3, $4
      )
      ON CONFLICT DO NOTHING;
      `,
      [campCId, activeOrgId, modeCHash, userId],
    );

    // 6. Create Sample Campaign Mode A (We Send It)
    const campAId = randomUUID();
    await client.query(
      `
      INSERT INTO campaigns (id, org_id, name, campaign_mode, status, subject, email_html, email_text, page_html, created_by)
      VALUES (
        $1, $2, 'Q4 Strategic Update', 'managed_send', 'approved',
        'Important update regarding Q4 roadmap',
        '<p>Hello {{first_name}}, please review our strategic roadmap here: <a href="{{link}}">View Personalized Briefing</a></p>',
        'Hello {{first_name}}, please review our strategic roadmap here: {{link}}',
        '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:40px auto;padding:20px;background:#18181b;color:#f4f4f5;border-radius:12px;"><h1>Confidential Executive Briefing</h1><p>Welcome, {{first_name}}.</p><p>We are excited to share our Q4 plans exclusively with {{company}} leadership.</p><div style="margin-top:24px;"><button data-action="confirm" data-value="acknowledged" style="background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">Acknowledge Read</button></div></body></html>',
        $3
      )
      ON CONFLICT DO NOTHING;
      `,
      [campAId, activeOrgId, userId],
    );

    console.log("[seed] Seeding completed successfully!");
    console.log(`[seed] Admin Email: admin@campaign.local`);
    console.log(`[seed] Session Token: ${sessionToken}`);
    console.log(`[seed] Mode C Demo Landing URL: http://localhost:3000/m/${modeCToken}`);
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
