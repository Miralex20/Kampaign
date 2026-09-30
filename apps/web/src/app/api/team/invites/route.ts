/**
 * GET & POST /api/team/invites
 *
 * Manages organization invitations with cryptographic single-use tokens.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, invitations, users, organizations } from "@campaign/db";
import { eq, and, desc } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { newToken, hashToken } from "@campaign/core/tokens";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "editor", "viewer"]).default("editor"),
  permissions: z.record(z.boolean()).optional(),
});

export async function GET(): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { orgId } = session;
  const db = getDb();

  try {
    const list = await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        permissions: invitations.permissions,
        status: invitations.status,
        expires_at: invitations.expires_at,
        created_at: invitations.created_at,
      })
      .from(invitations)
      .where(eq(invitations.org_id, orgId))
      .orderBy(desc(invitations.created_at));

    return NextResponse.json({ data: list });
  } catch (err) {
    console.error("[team-invites] Error listing invites:", err);
    return NextResponse.json({ error: "Failed to list invitations" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { orgId, userId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, role, permissions = {} } = parsed.data;
  const db = getDb();

  try {
    // 1. Check if user is already a member of this org
    const [existingMember] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.org_id, orgId), eq(users.email, email)))
      .limit(1);

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
        { status: 400 },
      );
    }

    // 2. Generate 128-bit cryptographic token (never stored raw)
    const rawToken = newToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 3. Insert or update pending invite
    const [invite] = await db
      .insert(invitations)
      .values({
        org_id: orgId,
        email,
        role,
        permissions,
        token_hash: tokenHash,
        invited_by: userId,
        status: "pending",
        expires_at: expiresAt,
      })
      .returning();

    if (!invite) {
      throw new Error("Failed to create invitation record");
    }

    const baseUrl = process.env["APP_BASE_URL"] || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/auth/invite?token=${rawToken}`;

    console.log(`[invite] New invite created for ${email}: ${inviteUrl}`);

    return NextResponse.json({
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
        inviteUrl,
      },
      message: `Invitation generated for ${email}`,
    });
  } catch (err) {
    console.error("[team-invites] Error creating invite:", err);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}
