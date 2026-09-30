/**
 * PATCH /api/admin/users/:id
 *
 * Superadmin endpoint to update user roles.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, users } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

type RouteContext = { params: Promise<{ id: string }> };

const UpdateUserSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { id: userId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { role } = parsed.data;
  const db = getDb();

  try {
    const [updatedUser] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        org_id: users.org_id,
      });

    if (!updatedUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: updatedUser,
      message: `User role updated to ${role}`,
    });
  } catch (err) {
    console.error("[admin-users] Error updating user role:", err);
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 });
  }
}
