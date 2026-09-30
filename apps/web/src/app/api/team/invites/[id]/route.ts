/**
 * DELETE & POST /api/team/invites/:id
 *
 * Revoke or resend an organization invitation.
 */
import { NextResponse } from "next/server";
import { getDb, invitations } from "@campaign/db";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { newToken, hashToken } from "@campaign/core/tokens";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { id: inviteId } = await context.params;
  const { orgId } = session;
  const db = getDb();

  try {
    const [revoked] = await db
      .update(invitations)
      .set({ status: "revoked" })
      .where(and(eq(invitations.id, inviteId), eq(invitations.org_id, orgId)))
      .returning({ id: invitations.id, email: invitations.email });

    if (!revoked) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: `Invitation for ${revoked.email} has been revoked.`,
    });
  } catch (err) {
    console.error("[team-invites] Error revoking invite:", err);
    return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { id: inviteId } = await context.params;
  const { orgId } = session;
  const db = getDb();

  try {
    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [updated] = await db
      .update(invitations)
      .set({
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
      })
      .where(and(eq(invitations.id, inviteId), eq(invitations.org_id, orgId)))
      .returning({ id: invitations.id, email: invitations.email });

    if (!updated) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const baseUrl = process.env["APP_BASE_URL"] || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/auth/invite?token=${rawToken}`;

    return NextResponse.json({
      data: {
        id: updated.id,
        email: updated.email,
        expires_at: expiresAt,
        inviteUrl,
      },
      message: `Invitation reissued for ${updated.email}`,
    });
  } catch (err) {
    console.error("[team-invites] Error resending invite:", err);
    return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 });
  }
}
