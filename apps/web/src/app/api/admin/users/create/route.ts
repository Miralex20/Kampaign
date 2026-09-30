/**
 * POST /api/admin/users/create
 *
 * Superadmin endpoint to directly provision new user accounts across existing or new organizations.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, users, organizations, auth_users } from "@campaign/db";
import { eq } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";
import { DEFAULT_ROLE_PERMISSIONS, type UserRole } from "@/lib/permissions";

const CreateUserAdminSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
  role: z.enum(["owner", "admin", "editor", "viewer"]).default("owner"),
  org_id: z.string().uuid().optional(),
  new_org_name: z.string().min(2).max(100).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateUserAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, name, role, org_id, new_org_name } = parsed.data;

  if (!org_id && !new_org_name) {
    return NextResponse.json(
      { error: "Must specify either an existing org_id or a new_org_name" },
      { status: 400 },
    );
  }

  const db = getDb();

  try {
    // 1. Check if user already exists
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: `User with email ${email} already exists.` },
        { status: 409 },
      );
    }

    let targetOrgId = org_id;

    // 2. Transactionally provision organization and user
    const result = await db.transaction(async (tx) => {
      if (new_org_name) {
        const [createdOrg] = await tx
          .insert(organizations)
          .values({
            name: new_org_name,
            review_state: "approved",
            plan: "growth",
            daily_cap: 2500,
          })
          .returning();
        if (!createdOrg) throw new Error("Failed to create organization");
        targetOrgId = createdOrg.id;
      }

      if (!targetOrgId) {
        throw new Error("Target organization not resolved");
      }

      // Ensure auth_users row
      let [authUser] = await tx
        .select({ id: auth_users.id })
        .from(auth_users)
        .where(eq(auth_users.email, email))
        .limit(1);

      if (!authUser) {
        const [createdAuth] = await tx
          .insert(auth_users)
          .values({
            email,
            name: name ?? null,
            email_verified: new Date(),
          })
          .returning({ id: auth_users.id });
        if (!createdAuth) throw new Error("Failed to create auth user");
        authUser = createdAuth;
      }

      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role as UserRole] ?? {};

      // Insert app user
      const [newUser] = await tx
        .insert(users)
        .values({
          org_id: targetOrgId,
          email,
          name: name ?? null,
          role,
          permissions: defaultPerms,
          status: "active",
        })
        .returning();

      if (!newUser) throw new Error("Failed to create user record");

      return newUser;
    });

    return NextResponse.json({
      data: result,
      message: `User ${email} created successfully in organization.`,
    });
  } catch (err) {
    console.error("[admin-create-user] Error creating user:", err);
    return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
  }
}
