/**
 * Auth.js v5 configuration.
 *
 * Implements magic-link (Email) authentication.
 * On first login: creates organization + user row in a single transaction.
 * On subsequent logins: looks up existing user.
 *
 * Sessions:
 *   - Max age: 24 hours (rotated on every request via updateAge: 0)
 *   - Strategy: database sessions (tokens stored in DB)
 *
 * Note: Auth.js v5 uses NextAuth exported from this file as the handler
 * AND as the session utility — import { auth, signIn, signOut } from here.
 */
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { getDb } from "@campaign/db";
import { organizations, users, type User, type Organization } from "@campaign/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Custom adapter (minimal — we manage our own user/org tables)
// ---------------------------------------------------------------------------
// Auth.js v5 needs an adapter for database sessions. We implement a thin
// one that bridges to our existing schema.
import { DrizzleAdapter } from "./auth-adapter";

function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const envEmails = process.env["SUPERADMIN_EMAILS"];
  if (!envEmails) return false;
  const list = envEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(),

  providers: [
    Nodemailer({
      server: {
        host: process.env["EMAIL_SERVER_HOST"] ?? "localhost",
        port: Number(process.env["EMAIL_SERVER_PORT"] ?? 1025),
        ...(process.env["EMAIL_SERVER_USER"]
          ? {
              auth: {
                user: process.env["EMAIL_SERVER_USER"] ?? "",
                pass: process.env["EMAIL_SERVER_PASSWORD"] ?? "",
              },
            }
          : {}),
      },
      from: process.env["EMAIL_FROM"] ?? "noreply@campaign.local",
    }) as any,
  ],

  session: {
    strategy: "database",
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 0, // rotate session token on every request
  },

  callbacks: {
    async session({ session, user }) {
      // Attach orgId, role, and permissions to the session for use in API handlers.
      const db = getDb();
      const email = user.email ?? "";
      const isSuper = isSuperadminEmail(email);

      const dbUser = await db
        .select({
          id: users.id,
          org_id: users.org_id,
          role: users.role,
          name: users.name,
          permissions: users.permissions,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      let u = dbUser[0];

      // Auto-elevate to admin if user email matches SUPERADMIN_EMAILS
      if (u && isSuper && u.role !== "admin") {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, u.id));
        u = { ...u, role: "admin" };
      }

      if (u) {
        session.user.id = u.id;
        session.user.orgId = u.org_id;
        session.user.role = isSuper ? "admin" : u.role;
        session.user.name = u.name ?? session.user.name ?? null;
        session.user.permissions = (u.permissions as Record<string, boolean>) ?? {};
      }
      return session;
    },
  },

  events: {
    async createUser({ user: authUser }) {
      // First login: provision org and user row.
      await provisionOrgAndUser(authUser.email ?? "");
    },
  },

  pages: {
    signIn: "/auth/signin",
    verifyRequest: "/auth/verify",
    error: "/auth/error",
  },
});

// ---------------------------------------------------------------------------
// First-login provisioning
// ---------------------------------------------------------------------------

async function provisionOrgAndUser(email: string): Promise<void> {
  const db = getDb();
  const isSuper = isSuperadminEmail(email);

  // Derive org name from email domain
  const domain = email.split("@")[1] ?? "unknown";
  const orgName = domain.replace(/\.(com|org|net|io|co\.uk)$/, "");

  await db.transaction(async (tx) => {
    // Check if a user already exists (race-condition guard)
    const existing = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      if (isSuper && existing[0]?.role !== "admin") {
        await tx.update(users).set({ role: "admin" }).where(eq(users.id, existing[0]!.id));
      }
      return; // already provisioned
    }

    // Create org (pre-approve and grant high cap if superadmin)
    const [org] = await tx
      .insert(organizations)
      .values({
        name: isSuper
          ? `${orgName.charAt(0).toUpperCase() + orgName.slice(1)} (Admin Org)`
          : orgName.charAt(0).toUpperCase() + orgName.slice(1),
        review_state: isSuper ? "approved" : "pending",
        plan: isSuper ? "enterprise" : "trial",
        daily_cap: isSuper ? 100000 : 500,
      })
      .returning();

    if (!org) throw new Error("Failed to create organization");

    // Create user with admin role if matching SUPERADMIN_EMAILS
    await tx.insert(users).values({
      org_id: org.id,
      email,
      role: isSuper ? "admin" : "owner",
      permissions: isSuper
        ? {
            can_create_campaigns: true,
            can_edit_campaigns: true,
            can_view_analytics: true,
            can_invite_members: true,
          }
        : {},
    });
  });
}

// ---------------------------------------------------------------------------
// Module augmentation — add orgId, role, and permissions to session.user
// ---------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      orgId: string;
      role: string;
      permissions?: Record<string, boolean>;
    };
  }
}

export type { User, Organization };
