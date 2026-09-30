/**
 * GET /api/auth/dev-login
 *
 * Developer shortcut route for local testing.
 * Supports switching personas, auto-provisioning test users, and logging out.
 * Strictly blocked when NODE_ENV === 'production'.
 */
import { NextResponse } from "next/server";
import { getDb, auth_sessions, auth_users, users, organizations } from "@campaign/db";
import { eq } from "drizzle-orm";

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env["NODE_ENV"] === "production") {
    return NextResponse.json(
      { error: "Developer login bypass is disabled in production environments" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirect") ?? "/";
  const action = url.searchParams.get("action");
  const email = url.searchParams.get("email");
  const role = url.searchParams.get("role") ?? "admin";
  const name = url.searchParams.get("name") ?? (role === "admin" ? "Platform Administrator" : "Dev Tester");

  // 1. Handle Logout
  if (action === "logout") {
    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    response.cookies.delete("authjs.session-token");
    return response;
  }

  const targetEmail = email ?? "admin@campaign.local";
  const db = getDb();

  // 2. Ensure test organization exists
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.name, "Acme Global Corp"))
    .limit(1);

  if (!org) {
    const [createdOrg] = await db
      .insert(organizations)
      .values({
        name: "Acme Global Corp",
        sending_domain: "campaign.local",
        domain_verified_at: new Date(),
        plan: "enterprise",
        daily_cap: 10000,
        review_state: "approved",
      })
      .returning();
    org = createdOrg;
  }

  if (!org) {
    return NextResponse.json({ error: "Failed to initialize organization" }, { status: 500 });
  }

  // 3. Define capability permissions for test persona
  const permissions =
    role === "admin"
      ? { can_create_campaigns: true, can_edit_campaigns: true, can_view_analytics: true, can_invite_members: true }
      : role === "owner"
        ? { can_create_campaigns: true, can_edit_campaigns: true, can_view_analytics: true, can_invite_members: true }
        : role === "editor"
          ? { can_create_campaigns: true, can_edit_campaigns: true, can_view_analytics: true, can_invite_members: false }
          : { can_create_campaigns: false, can_edit_campaigns: false, can_view_analytics: true, can_invite_members: false };

  const dbRole = role === "admin" ? "admin" : role === "owner" ? "owner" : "member";

  // 4. Find or create app user
  let [userRow] = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);

  if (!userRow) {
    const [createdUser] = await db
      .insert(users)
      .values({
        org_id: org.id,
        email: targetEmail,
        name,
        role: dbRole,
        permissions,
        status: "active",
      })
      .returning();
    userRow = createdUser;
  } else if (role && userRow.role !== dbRole) {
    await db
      .update(users)
      .set({ role: dbRole, permissions, name })
      .where(eq(users.id, userRow.id));
  }

  // 5. Find or create auth_users row
  let [authUser] = await db.select().from(auth_users).where(eq(auth_users.email, targetEmail)).limit(1);

  if (!authUser) {
    const [createdAuthUser] = await db
      .insert(auth_users)
      .values({
        name,
        email: targetEmail,
        email_verified: new Date(),
      })
      .returning();
    authUser = createdAuthUser;
  }

  if (!authUser) {
    return NextResponse.json({ error: "Failed to initialize auth user" }, { status: 500 });
  }

  // 6. Create active database session token
  const sessionToken = `dev_${Buffer.from(targetEmail).toString("hex").slice(0, 16)}_${Date.now()}`;
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(auth_sessions).values({
    session_token: sessionToken,
    user_id: authUser.id,
    expires,
  });

  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });

  return response;
}
