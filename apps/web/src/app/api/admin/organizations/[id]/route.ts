/**
 * PATCH /api/admin/organizations/:id
 *
 * Superadmin endpoint to update organization review states, daily caps, or plans.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, organizations } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

type RouteContext = { params: Promise<{ id: string }> };

const UpdateOrgSchema = z.object({
  review_state: z.enum(["approved", "suspended", "pending"]).optional(),
  daily_cap: z.number().int().min(0).max(1000000).optional(),
  plan: z.enum(["trial", "starter", "growth", "enterprise"]).optional(),
});

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { id: orgId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const db = getDb();

  try {
    const [updated] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, orgId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({
      data: updated,
      message: `Organization "${updated.name}" updated successfully`,
    });
  } catch (err) {
    console.error("[admin-orgs] Error updating organization:", err);
    return NextResponse.json({ error: "Failed to update organization" }, { status: 500 });
  }
}
