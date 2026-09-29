/**
 * Authenticated session helper.
 *
 * Use `requireSession()` inside any API route handler to get the validated
 * session. The orgId is sourced exclusively from the session (never from the
 * request body or URL params — see AGENT_PLAN.md section 2, rule 6).
 *
 * Usage:
 *   const session = await requireSession();
 *   const { orgId, userId } = session;
 */
import { auth } from "../auth";
import { NextResponse } from "next/server";

export interface AuthenticatedSession {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

/**
 * Returns the validated session or throws a NextResponse 401.
 * Use inside Next.js App Router API route handlers (server-side only).
 */
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (
    !session?.user?.id ||
    !session.user.orgId ||
    !session.user.email
  ) {
    throw NextResponse.json(
      { error: "Unauthorised" },
      { status: 401 },
    );
  }

  return {
    userId: session.user.id,
    orgId: session.user.orgId,
    role: session.user.role ?? "owner",
    email: session.user.email,
  };
}
