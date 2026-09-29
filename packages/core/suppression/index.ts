/**
 * Suppression list helpers.
 *
 * These are thin wrappers over DB queries. They accept an optional `tx`
 * (Drizzle transaction) so callers can compose them inside their own
 * transaction boundaries.
 *
 * NOTE: This module imports from `@campaign/db`. It must NOT be imported
 * by any pure-logic module that has no DB dependency.
 */

export type BounceType = "hard" | "soft";
export type SuppressionReason =
  | "hard_bounce"
  | "soft_bounce"
  | "complaint"
  | "unsubscribe"
  | "manual";

/**
 * Shape of the DB adapter expected by suppression helpers.
 * Defined here so that `packages/core/suppression` does not directly import
 * `packages/db` — the actual Drizzle db instance is injected by callers.
 */
export interface SuppressionDb {
  isSuppressed(orgId: string, email: string): Promise<boolean>;
  suppress(
    orgId: string,
    email: string,
    reason: SuppressionReason,
    bounceType?: BounceType,
  ): Promise<void>;
}

/**
 * Check whether an email address is suppressed for a given org.
 * Email comparison is case-insensitive (citext column handles this at DB level,
 * but we also lowercase here for defence-in-depth).
 */
export async function isSuppressed(
  db: SuppressionDb,
  orgId: string,
  email: string,
): Promise<boolean> {
  return db.isSuppressed(orgId, email.toLowerCase().trim());
}

/**
 * Add an email to the suppression list for a given org.
 * On conflict (org_id, email) the row is left unchanged (do nothing) — the
 * first suppression reason is the canonical one.
 */
export async function suppress(
  db: SuppressionDb,
  orgId: string,
  email: string,
  reason: SuppressionReason,
  bounceType?: BounceType,
): Promise<void> {
  return db.suppress(orgId, email.toLowerCase().trim(), reason, bounceType);
}
