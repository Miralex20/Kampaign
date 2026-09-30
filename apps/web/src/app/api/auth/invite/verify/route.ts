/**
 * GET /api/auth/invite/verify
 *
 * Validates an invitation token and returns organization metadata for the acceptance UI.
 */
import { NextResponse } from "next/server";
import { getDb, invitations, organizations, users } from "@campaign/db";
import { eq } from "drizzle-orm";
import { hashToken } from "@campaign/core/tokens";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ error: "Missing invitation token" }, { status: 400 });
  }

  const db = getDb();

  try {
    const tokenHash = hashToken(token);

    const [invite] = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        permissions: invitations.permissions,
        status: invitations.status,
        expires_at: invitations.expires_at,
        org_id: invitations.org_id,
        org_name: organizations.name,
        inviter_email: users.email,
      })
      .from(invitations)
      .innerJoin(organizations, eq(invitations.org_id, organizations.id))
      .innerJoin(users, eq(invitations.invited_by, users.id))
      .where(eq(invitations.token_hash, tokenHash))
      .limit(1);

    if (!invite) {
      return NextResponse.json({ error: "Invalid invitation link" }, { status: 404 });
    }

    if (invite.status !== "pending") {
      return NextResponse.json(
        { error: `This invitation has already been ${invite.status}` },
        { status: 410 },
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This invitation has expired. Please ask your administrator to resend it." },
        { status: 410 },
      );
    }

    return NextResponse.json({
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        permissions: invite.permissions,
        orgName: invite.org_name,
        inviterEmail: invite.inviter_email,
        valid: true,
      },
    });
  } catch (err) {
    console.error("[invite-verify] Error verifying token:", err);
    return NextResponse.json({ error: "Failed to verify invitation" }, { status: 500 });
  }
}
