/**
 * POST /api/auth/invite/accept
 *
 * Accepts an invitation token, provisions the team member account,
 * sets the active session cookie, and logs the user directly in.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, invitations, users, auth_users, auth_sessions } from "@campaign/db";
import { eq } from "drizzle-orm";
import { hashToken, newToken } from "@campaign/core/tokens";

const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  name: z.string().max(100).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = AcceptInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { token, name } = parsed.data;
  const db = getDb();

  try {
    const tokenHash = hashToken(token);

    const [invite] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token_hash, tokenHash))
      .limit(1);

    if (!invite) {
      return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status}` },
        { status: 410 },
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired. Please ask for a new invite." },
        { status: 410 },
      );
    }

    const sessionToken = newToken();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    let newUserId: string;

    await db.transaction(async (tx) => {
      // 1. Ensure auth_users row exists
      let [authUser] = await tx
        .select({ id: auth_users.id })
        .from(auth_users)
        .where(eq(auth_users.email, invite.email))
        .limit(1);

      if (!authUser) {
        const [createdAuthUser] = await tx
          .insert(auth_users)
          .values({
            email: invite.email,
            name: name ?? null,
            email_verified: new Date(),
          })
          .returning({ id: auth_users.id });
        if (!createdAuthUser) throw new Error("Failed to create auth user");
        authUser = createdAuthUser;
      }

      if (!authUser) {
        throw new Error("Auth user could not be resolved");
      }

      // 2. Insert into users table
      const [createdAppUser] = await tx
        .insert(users)
        .values({
          org_id: invite.org_id,
          email: invite.email,
          name: name ?? null,
          role: invite.role,
          permissions: invite.permissions,
          status: "active",
          invited_by: invite.invited_by,
          last_active_at: new Date(),
        })
        .returning({ id: users.id });

      if (!createdAppUser) {
        throw new Error("Failed to create user record");
      }

      newUserId = createdAppUser.id;

      // 3. Mark invite as accepted
      await tx.update(invitations).set({ status: "accepted" }).where(eq(invitations.id, invite.id));

      // 4. Create active session
      await tx.insert(auth_sessions).values({
        session_token: sessionToken,
        user_id: authUser.id,
        expires,
      });
    });

    const response = NextResponse.json({
      success: true,
      message: "Invitation accepted successfully",
      redirect: "/",
    });

    // Set authentication cookie
    response.cookies.set("authjs.session-token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
    });

    return response;
  } catch (err) {
    console.error("[invite-accept] Error accepting invite:", err);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
