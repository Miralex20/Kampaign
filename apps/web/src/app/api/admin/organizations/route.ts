/**
 * GET /api/admin/organizations
 *
 * Lists all organizations with domain verification, caps, review states, and stats.
 */
import { NextResponse } from "next/server";
import { getDb, organizations, users, campaigns } from "@campaign/db";
import { eq, ilike, desc, sql } from "drizzle-orm";
import { requireAdminSession } from "@/lib/admin";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAdminSession();
  } catch (res) {
    return res as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const reviewFilter = searchParams.get("review_state")?.trim() ?? "";

  const db = getDb();

  try {
    let query = db
      .select({
        id: organizations.id,
        name: organizations.name,
        sending_domain: organizations.sending_domain,
        domain_verified_at: organizations.domain_verified_at,
        plan: organizations.plan,
        daily_cap: organizations.daily_cap,
        review_state: organizations.review_state,
        created_at: organizations.created_at,
      })
      .from(organizations)
      .orderBy(desc(organizations.created_at));

    const orgRows = await query;

    const filtered = orgRows.filter((o) => {
      if (search && !o.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (reviewFilter && reviewFilter !== "all" && o.review_state !== reviewFilter) {
        return false;
      }
      return true;
    });

    // Enrich with user count and campaign count
    const enriched = await Promise.all(
      filtered.map(async (org) => {
        const [userCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.org_id, org.id));

        const [campaignCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(campaigns)
          .where(eq(campaigns.org_id, org.id));

        return {
          ...org,
          userCount: userCount?.count ?? 0,
          campaignCount: campaignCount?.count ?? 0,
        };
      }),
    );

    return NextResponse.json({ data: enriched });
  } catch (err) {
    console.error("[admin-orgs] Error listing organizations:", err);
    return NextResponse.json({ error: "Failed to list organizations" }, { status: 500 });
  }
}
