/**
 * Role-Based Access Control (RBAC) & Permissions Engine.
 *
 * Defines default capability profiles for roles (owner, admin, editor, viewer),
 * and provides evaluation utilities with per-user JSONB capability overrides.
 */
import { NextResponse } from "next/server";
import type { AuthenticatedSession } from "./session";

export type UserRole = "owner" | "admin" | "editor" | "viewer";

export type UserCapability =
  | "can_launch_campaigns"
  | "can_export_data"
  | "can_manage_audience"
  | "can_manage_templates"
  | "can_view_replies"
  | "can_verify_domains"
  | "can_manage_team";

export type PermissionsMap = Partial<Record<UserCapability, boolean>>;

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Record<UserCapability, boolean>> = {
  owner: {
    can_launch_campaigns: true,
    can_export_data: true,
    can_manage_audience: true,
    can_manage_templates: true,
    can_view_replies: true,
    can_verify_domains: true,
    can_manage_team: true,
  },
  admin: {
    can_launch_campaigns: true,
    can_export_data: true,
    can_manage_audience: true,
    can_manage_templates: true,
    can_view_replies: true,
    can_verify_domains: true,
    can_manage_team: true,
  },
  editor: {
    can_launch_campaigns: false, // Requires admin review/approval for Mode A launches
    can_export_data: false, // Gated to prevent unauthorized PII exports
    can_manage_audience: true,
    can_manage_templates: true,
    can_view_replies: true,
    can_verify_domains: false,
    can_manage_team: false,
  },
  viewer: {
    can_launch_campaigns: false,
    can_export_data: false,
    can_manage_audience: false,
    can_manage_templates: false,
    can_view_replies: true,
    can_verify_domains: false,
    can_manage_team: false,
  },
};

/**
 * Checks if a user has a specific capability.
 * - Global superadmins ('admin' role across system) always return true.
 * - Org owners always return true.
 * - Explicit user permissions override defaults.
 * - Falls back to role default.
 */
export function hasCapability(
  user: {
    role: string;
    permissions?: Record<string, unknown> | null;
  },
  capability: UserCapability,
): boolean {
  if (user.role === "admin" && process.env["NODE_ENV"] !== "production") {
    // In dev bypass, admins have all capabilities
    return true;
  }

  if (user.role === "owner") {
    return true;
  }

  // Check explicit override
  if (user.permissions && typeof user.permissions[capability] === "boolean") {
    return Boolean(user.permissions[capability]);
  }

  // Fallback to role default
  const roleKey = user.role as UserRole;
  const roleDefaults = DEFAULT_ROLE_PERMISSIONS[roleKey];
  if (roleDefaults && typeof roleDefaults[capability] === "boolean") {
    return roleDefaults[capability];
  }

  return false;
}

/**
 * Assert that the active session has the required capability.
 * Throws 403 Forbidden response if check fails.
 */
export function assertCapability(session: AuthenticatedSession, capability: UserCapability): void {
  const allowed = hasCapability(session, capability);
  if (!allowed) {
    throw NextResponse.json(
      {
        error: `Forbidden: Missing required capability '${capability}'`,
        requiredCapability: capability,
      },
      { status: 403 },
    );
  }
}
