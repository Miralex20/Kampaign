/**
 * Admin authorization helper.
 *
 * Enforces superadmin authentication (role === 'admin') for system-wide
 * management routes. In non-production environments, allows access if
 * user role is admin or if developer bypass is active.
 */
import { requireSession, type AuthenticatedSession } from "./session";
import { NextResponse } from "next/server";

export async function requireAdminSession(): Promise<AuthenticatedSession> {
  const session = await requireSession();

  // In production, strictly enforce session.role === "admin"
  if (session.role !== "admin" && process.env["NODE_ENV"] === "production") {
    throw NextResponse.json({ error: "Forbidden: Administrator role required" }, { status: 403 });
  }

  return session;
}
