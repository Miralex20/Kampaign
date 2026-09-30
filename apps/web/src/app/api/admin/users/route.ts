/**
 * GET /api/admin/users
 *
 * Lists all users across all organizations with optional search and role filtering.
 */
import { NextResponse } from "next/server";
import { getDb, users, organizations } from "@campaign/db";
import { eq, ilike, or, desc, and } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const roleFilter = searchParams.get("role")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const db = getDb();

  try {
    const conditions = [];

    if (search) {
      conditions.push(
        or(ilike(users.email, `%${search}%`), ilike(organizations.name, `%${search}%`)),
      );
    }

    if (roleFilter && ["owner", "admin", "member"].includes(roleFilter)) {
      conditions.push(eq(users.role, roleFilter));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        created_at: users.created_at,
        org_id: users.org_id,
        org_name: organizations.name,
        org_plan: organizations.plan,
        org_daily_cap: organizations.daily_cap,
        org_review_state: organizations.review_state,
        org_sending_domain: organizations.sending_domain,
        org_domain_verified_at: organizations.domain_verified_at,
      })
      .from(users)
      .innerJoin(organizations, eq(users.org_id, organizations.id))
      .where(whereClause)
      .orderBy(desc(users.created_at))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data: userRows,
      pagination: {
        limit,
        offset,
        count: userRows.length,
      },
    });
  } catch (err) {
    console.error("[admin-users] Error listing users:", err);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
