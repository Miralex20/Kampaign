/**
 * Suppression management API
 *
 * POST /api/suppressions  — manually suppress an email address
 * GET  /api/suppressions  — list suppressed addresses for the org
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, suppressions } from "@campaign/db";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/session";

const AddSuppressionSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  reason: z
    .enum(["hard_bounce", "soft_bounce", "complaint", "unsubscribe", "manual"])
    .default("manual"),
  bounce_type: z.enum(["hard", "soft"]).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddSuppressionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { email, reason, bounce_type } = parsed.data;

  const db = getDb();
  await db
    .insert(suppressions)
    .values({
      org_id: orgId,
      email: email.toLowerCase().trim(),
      reason,
      bounce_type: bounce_type ?? null,
    })
    .onConflictDoNothing(); // First suppression reason is canonical

  return NextResponse.json({ ok: true, email: email.toLowerCase().trim() });
}

export async function GET(request: Request): Promise<NextResponse> {
  let session: Awaited<ReturnType<typeof requireSession>>;
  try {
    session = await requireSession();
  } catch (res) {
    return res as NextResponse;
  }
  const { orgId } = session;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const db = getDb();
  const rows = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.org_id, orgId))
    .orderBy(desc(suppressions.created_at))
    .limit(limit)
    .offset((page - 1) * limit);

  return NextResponse.json({ data: rows, page, limit });
}
