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
import {
  organizations,
  users,
  type User,
  type Organization,
} from "@campaign/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Custom adapter (minimal — we manage our own user/org tables)
// ---------------------------------------------------------------------------
// Auth.js v5 needs an adapter for database sessions. We implement a thin
// one that bridges to our existing schema.
import { DrizzleAdapter } from "./auth-adapter";

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
      // Attach orgId and role to the session for use in API handlers.
      const db = getDb();
      const dbUser = await db
        .select({ id: users.id, org_id: users.org_id, role: users.role })
        .from(users)
        .where(eq(users.email, user.email ?? ""))
        .limit(1);

      const u = dbUser[0];
      if (u) {
        session.user.id = u.id;
        session.user.orgId = u.org_id;
        session.user.role = u.role;
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

  // Derive org name from email domain
  const domain = email.split("@")[1] ?? "unknown";
  const orgName = domain.replace(/\.(com|org|net|io|co\.uk)$/, "");

  await db.transaction(async (tx) => {
    // Check if a user already exists (race-condition guard)
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) return; // already provisioned

    // Create org
    const [org] = await tx
      .insert(organizations)
      .values({
        name: orgName.charAt(0).toUpperCase() + orgName.slice(1),
        review_state: "pending",
        plan: "trial",
        daily_cap: 500,
      })
      .returning();

    if (!org) throw new Error("Failed to create organization");

    // Create user
    await tx.insert(users).values({
      org_id: org.id,
      email,
      role: "owner",
    });
  });
}

// ---------------------------------------------------------------------------
// Module augmentation — add orgId + role to session.user
// ---------------------------------------------------------------------------
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      orgId: string;
      role: string;
    };
  }
}

export type { User, Organization };
