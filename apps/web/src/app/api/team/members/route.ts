/**
 * GET /api/team/members
 *
 * Lists all team members within the authenticated user's organization.
 */
import { NextResponse } from "next/server";
import { getDb, users, organizations } from "@campaign/db";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/session";

export async function GET(): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { orgId } = session;
  const db = getDb();

  try {
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        permissions: users.permissions,
        status: users.status,
        last_active_at: users.last_active_at,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.org_id, orgId))
      .orderBy(desc(users.created_at));

    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        sending_domain: organizations.sending_domain,
        plan: organizations.plan,
        daily_cap: organizations.daily_cap,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return NextResponse.json({
      data: {
        organization: org,
        members,
        currentUserId: session.userId,
      },
    });
  } catch (err) {
    console.error("[team-members] Error listing members:", err);
    return NextResponse.json({ error: "Failed to list team members" }, { status: 500 });
  }
}
