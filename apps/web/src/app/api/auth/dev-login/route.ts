/**
 * GET /api/auth/dev-login
 *
 * Developer shortcut route for local testing.
 * Sets the NextAuth session cookie to the seeded active admin session and redirects.
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
  const email = url.searchParams.get("email") ?? "admin@campaign.local";

  const db = getDb();

  // Find user
  const [authUser] = await db.select().from(auth_users).where(eq(auth_users.email, email)).limit(1);

  if (!authUser) {
    return NextResponse.json(
      { error: `User ${email} not found. Please run seed script first.` },
      { status: 404 },
    );
  }

  // Find or create session
  const sessionToken = "dev_session_token_campaign_2026";
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db
    .insert(auth_sessions)
    .values({
      session_token: sessionToken,
      user_id: authUser.id,
      expires,
    })
    .onConflictDoUpdate({
      target: auth_sessions.session_token,
      set: { expires },
    });

  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  // NextAuth v5 session cookie name in development (HTTP) is "authjs.session-token"
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });

  return response;
}
