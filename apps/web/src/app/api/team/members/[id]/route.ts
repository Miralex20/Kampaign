/**
 * PATCH / DELETE /api/team/members/:id
 *
 * Updates or removes a team member within the organization.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, users } from "@campaign/db";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";

type RouteContext = { params: Promise<{ id: string }> };

const UpdateMemberSchema = z.object({
  role: z.enum(["owner", "admin", "editor", "viewer"]).optional(),
  name: z.string().max(100).optional(),
  permissions: z.record(z.boolean()).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { id: targetUserId } = await context.params;
  const { orgId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const updates = parsed.data;
  const db = getDb();

  try {
    // 1. Fetch target user to ensure tenant boundary
    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.org_id, orgId)))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // 2. Owner demotion guard: If target user is owner and role is changing, ensure another owner exists
    if (targetUser.role === "owner" && updates.role && updates.role !== "owner") {
      const owners = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.org_id, orgId), eq(users.role, "owner")));

      if (owners.length <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the only owner. Transfer ownership first." },
          { status: 400 },
        );
      }
    }

    // 3. Apply update
    const [updated] = await db
      .update(users)
      .set({
        ...(updates.role ? { role: updates.role } : {}),
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.permissions ? { permissions: updates.permissions } : {}),
        ...(updates.status ? { status: updates.status } : {}),
      })
      .where(and(eq(users.id, targetUserId), eq(users.org_id, orgId)))
      .returning();

    return NextResponse.json({
      data: updated,
      message: "Team member updated successfully",
    });
  } catch (err) {
    console.error("[team-members] Error updating member:", err);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
    assertCapability(session, "can_manage_team");
  } catch (res) {
    return res as NextResponse;
  }

  const { id: targetUserId } = await context.params;
  const { orgId, userId } = session;

  if (targetUserId === userId) {
    return NextResponse.json(
      { error: "You cannot remove yourself from the organization" },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    const [targetUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, targetUserId), eq(users.org_id, orgId)))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (targetUser.role === "owner") {
      const owners = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.org_id, orgId), eq(users.role, "owner")));

      if (owners.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the only owner of the organization" },
          { status: 400 },
        );
      }
    }

    await db.delete(users).where(and(eq(users.id, targetUserId), eq(users.org_id, orgId)));

    return NextResponse.json({
      message: `Team member ${targetUser.email} has been removed.`,
    });
  } catch (err) {
    console.error("[team-members] Error deleting member:", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
