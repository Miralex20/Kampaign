/**
 * Production Superadmin Bootstrap CLI
 *
 * Creates or elevates a superadmin account in any environment (including production).
 *
 * Usage:
 *   pnpm superadmin:bootstrap --email=admin@yourdomain.com [--name="Admin Name"] [--org="Operations"]
 *
 * Actions performed:
 * 1. Finds or creates an approved organization with enterprise limits.
 * 2. Creates or elevates the user to role: 'admin' with full platform permissions.
 * 3. Pre-verifies the user in auth_users.
 * 4. Generates a secure, 1-hour direct login URL (using auth_verification_tokens)
 *    so the administrator can log in immediately even if SMTP is still being configured.
 */
import { Client } from "pg";
import { randomUUID, randomBytes } from "node:crypto";

function parseArgs(): { email?: string; name?: string; org?: string } {
  const args = process.argv.slice(2);
  const result: { email?: string; name?: string; org?: string } = {};

  for (const arg of args) {
    if (arg.startsWith("--email=")) {
      result.email = arg.split("=")[1]?.trim();
    } else if (arg.startsWith("--name=")) {
      result.name = arg.split("=")[1]?.trim();
    } else if (arg.startsWith("--org=")) {
      result.org = arg.split("=")[1]?.trim();
    }
  }

  return result;
}

async function main() {
  const { email, name = "Platform Administrator", org: orgNameArg } = parseArgs();

  if (!email) {
    console.error(`
❌ Missing required argument: --email

Usage:
  pnpm superadmin:bootstrap --email=admin@yourdomain.com [--name="Super Admin"] [--org="Platform Org"]

Examples:
  pnpm superadmin:bootstrap --email=ops@company.com
  pnpm superadmin:bootstrap --email=miracle@proptii.com --name="Miracle Ohuka"
`);
    process.exit(1);
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is not defined.");
    process.exit(1);
  }

  const appBaseUrl = (process.env["APP_BASE_URL"] || "http://localhost:3000").replace(/\/$/, "");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log(`\n======================================================`);
    console.log(`🛡️  PROVISIONING SUPERADMIN: ${email}`);
    console.log(`======================================================\n`);

    const normalizedEmail = email.toLowerCase().trim();
    const defaultOrgName =
      orgNameArg ?? `${normalizedEmail.split("@")[0]?.toUpperCase() ?? "SYSTEM"} Admin Org`;

    // 1. Check if user already exists
    const userLookup = await client.query(
      `SELECT u.id, u.org_id, u.role, u.name, o.name as org_name
       FROM users u
       JOIN organizations o ON u.org_id = o.id
       WHERE LOWER(u.email) = $1`,
      [normalizedEmail],
    );

    let finalUserId: string;
    let finalOrgId: string;
    let finalOrgName: string;

    const fullPermissions = JSON.stringify({
      can_create_campaigns: true,
      can_edit_campaigns: true,
      can_view_analytics: true,
      can_invite_members: true,
    });

    if (userLookup.rows.length > 0) {
      const existing = userLookup.rows[0]!;
      finalUserId = existing.id;
      finalOrgId = existing.org_id;
      finalOrgName = existing.org_name;

      console.log(
        `ℹ️ User already exists (current role: ${existing.role}). Elevating to superadmin...`,
      );

      // Elevate user role and ensure active status
      await client.query(
        `UPDATE users
         SET role = 'admin',
             permissions = $1::jsonb,
             status = 'active',
             name = COALESCE($2, name)
         WHERE id = $3`,
        [fullPermissions, name, finalUserId],
      );

      // Ensure organization is approved with high limit
      await client.query(
        `UPDATE organizations
         SET review_state = 'approved',
             daily_cap = GREATEST(daily_cap, 100000),
             plan = 'enterprise'
         WHERE id = $1`,
        [finalOrgId],
      );

      console.log(`✓ User role updated to 'admin' (superadmin).`);
      console.log(`✓ Organization '${finalOrgName}' updated to 'approved' (enterprise plan).`);
    } else {
      console.log(`Creating new administrative organization '${defaultOrgName}'...`);
      finalOrgId = randomUUID();
      finalUserId = randomUUID();
      finalOrgName = defaultOrgName;

      await client.query(
        `INSERT INTO organizations (id, name, review_state, plan, daily_cap)
         VALUES ($1, $2, 'approved', 'enterprise', 100000)`,
        [finalOrgId, defaultOrgName],
      );

      await client.query(
        `INSERT INTO users (id, org_id, email, name, role, permissions, status)
         VALUES ($1, $2, $3, $4, 'admin', $5::jsonb, 'active')`,
        [finalUserId, finalOrgId, normalizedEmail, name, fullPermissions],
      );

      console.log(`✓ New superadmin user record created.`);
      console.log(`✓ Approved organization '${defaultOrgName}' created.`);
    }

    // 2. Ensure Auth.js auth_users row exists with verified timestamp
    await client.query(
      `INSERT INTO auth_users (id, name, email, email_verified)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (email)
       DO UPDATE SET email_verified = now(), name = COALESCE($2, auth_users.name)`,
      [finalUserId, name, normalizedEmail],
    );
    console.log(`✓ Auth user record synchronized & email verified.`);

    // 3. Generate a secure single-use NextAuth magic token for instant emergency/setup access
    const rawToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    await client.query(
      `INSERT INTO auth_verification_tokens (identifier, token, expires)
       VALUES ($1, $2, $3)`,
      [normalizedEmail, rawToken, expires],
    );

    const directLoginUrl = `${appBaseUrl}/api/auth/callback/nodemailer?callbackUrl=${encodeURIComponent(
      "/admin",
    )}&token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

    console.log(`\n======================================================`);
    console.log(`🎉 SUPERADMIN PROVISIONING COMPLETE!`);
    console.log(`======================================================`);
    console.log(`Email:        ${normalizedEmail}`);
    console.log(`Name:         ${name}`);
    console.log(`Role:         admin (Platform Superadmin)`);
    console.log(`Organization: ${finalOrgName}`);
    console.log(`Console URL:  ${appBaseUrl}/admin`);
    console.log(`------------------------------------------------------`);
    console.log(`🔑 Direct 1-Hour Activation / Sign-In Link (No SMTP required):`);
    console.log(directLoginUrl);
    console.log(`------------------------------------------------------`);
    console.log(
      `\nNote: You can also sign in at ${appBaseUrl}/auth/signin anytime via SMTP email magic link.\n`,
    );
  } catch (err) {
    console.error("❌ Failed to provision superadmin:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
