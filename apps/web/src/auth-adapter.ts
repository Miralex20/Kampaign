/**
 * Minimal Auth.js v5 Drizzle adapter.
 *
 * Auth.js requires three tables for database sessions:
 *   - auth_accounts   (OAuth accounts — unused for magic-link but required by adapter shape)
 *   - auth_sessions   (active sessions)
 *   - auth_verification_tokens (magic-link tokens)
 *
 * We keep these separate from our app tables so that a future Auth.js upgrade
 * doesn't collide with our schema. The app tables (users, organizations) are
 * managed independently; auth_sessions.user_id references auth_users.id, but
 * we do NOT use Auth.js's user table for our app data — we bridge in the
 * session callback (auth.ts).
 *
 * Auth.js v5 adapter interface:
 * https://authjs.dev/reference/adapters
 */

import type { Adapter } from "next-auth/adapters";
import { decode } from "next-auth/jwt";
import { getDb } from "@campaign/db";
import { auth_users, auth_sessions, auth_verification_tokens } from "@campaign/db";
import { eq, and } from "drizzle-orm";

export function DrizzleAdapter(): Adapter {
  return {
    // -------------------------------------------------------------------------
    // Users
    // -------------------------------------------------------------------------
    async createUser(data) {
      const db = getDb();
      const [user] = await db
        .insert(auth_users)
        .values({
          email: data.email,
          email_verified: data.emailVerified ?? null,
          name: data.name ?? null,
          image: data.image ?? null,
        })
        .returning();
      if (!user) throw new Error("Failed to create auth user");
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },

    async getUser(id) {
      const db = getDb();
      const [user] = await db.select().from(auth_users).where(eq(auth_users.id, id)).limit(1);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },

    async getUserByEmail(email) {
      const db = getDb();
      const [user] = await db.select().from(auth_users).where(eq(auth_users.email, email)).limit(1);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const db = getDb();
      const [account] = await db
        .select({ user: auth_users })
        .from(auth_accounts)
        .innerJoin(auth_users, eq(auth_accounts.user_id, auth_users.id))
        .where(
          and(
            eq(auth_accounts.provider, provider),
            eq(auth_accounts.provider_account_id, providerAccountId),
          ),
        )
        .limit(1);
      if (!account?.user) return null;
      const u = account.user;
      return {
        id: u.id,
        email: u.email,
        emailVerified: u.email_verified,
        name: u.name ?? null,
        image: u.image ?? null,
      };
    },

    async updateUser(data) {
      const db = getDb();
      const updateData: {
        email?: string;
        email_verified?: Date | null;
        name?: string | null;
        image?: string | null;
      } = {};
      if (data.email !== undefined) updateData.email = data.email;
      if (data.emailVerified !== undefined) updateData.email_verified = data.emailVerified;
      if (data.name !== undefined) updateData.name = data.name;
      if (data.image !== undefined) updateData.image = data.image;

      const [user] = await db
        .update(auth_users)
        .set(updateData)
        .where(eq(auth_users.id, data.id))
        .returning();
      if (!user) throw new Error("Failed to update auth user");
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.email_verified,
        name: user.name ?? null,
        image: user.image ?? null,
      };
    },

    async deleteUser(id) {
      const db = getDb();
      await db.delete(auth_users).where(eq(auth_users.id, id));
    },

    // -------------------------------------------------------------------------
    // Sessions
    // -------------------------------------------------------------------------
    async createSession(data) {
      const db = getDb();
      const [session] = await db
        .insert(auth_sessions)
        .values({
          user_id: data.userId,
          session_token: data.sessionToken,
          expires: data.expires,
        })
        .returning();
      if (!session) throw new Error("Failed to create session");
      return {
        userId: session.user_id,
        sessionToken: session.session_token,
        expires: session.expires,
      };
    },

    async getSessionAndUser(sessionToken) {
      const db = getDb();
      const [row] = await db
        .select({ session: auth_sessions, user: auth_users })
        .from(auth_sessions)
        .innerJoin(auth_users, eq(auth_sessions.user_id, auth_users.id))
        .where(eq(auth_sessions.session_token, sessionToken))
        .limit(1);

      if (row) {
        const { session, user } = row;
        return {
          session: {
            userId: session.user_id,
            sessionToken: session.session_token,
            expires: session.expires,
          },
          user: {
            id: user.id,
            email: user.email,
            emailVerified: user.email_verified,
            name: user.name ?? null,
            image: user.image ?? null,
          },
        };
      }

      // Fallback for JWT session tokens (e.g. from Credentials provider)
      try {
        const secret = process.env["AUTH_SECRET"] ?? "dev-secret-change-in-production-min-32-chars";
        const salt = "authjs.session-token";
        const payload = await decode({ token: sessionToken, secret, salt });
        if (payload?.email || payload?.sub) {
          const userLookup = payload.email
            ? await db.select().from(auth_users).where(eq(auth_users.email, payload.email as string)).limit(1)
            : await db.select().from(auth_users).where(eq(auth_users.id, payload.sub as string)).limit(1);

          const authUser = userLookup[0];
          if (authUser) {
            const exp = payload.exp ? new Date((payload.exp as number) * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
            return {
              session: {
                userId: authUser.id,
                sessionToken,
                expires: exp,
              },
              user: {
                id: authUser.id,
                email: authUser.email,
                emailVerified: authUser.email_verified,
                name: authUser.name ?? null,
                image: authUser.image ?? null,
              },
            };
          }
        }
      } catch {
        // Not a valid JWT token
      }

      return null;
    },

    async updateSession(data) {
      const db = getDb();
      const [session] = await db
        .update(auth_sessions)
        .set({ expires: data.expires })
        .where(eq(auth_sessions.session_token, data.sessionToken))
        .returning();
      if (!session) return null;
      return {
        userId: session.user_id,
        sessionToken: session.session_token,
        expires: session.expires,
      };
    },

    async deleteSession(sessionToken) {
      const db = getDb();
      await db.delete(auth_sessions).where(eq(auth_sessions.session_token, sessionToken));
    },

    // -------------------------------------------------------------------------
    // Verification tokens (magic-link)
    // -------------------------------------------------------------------------
    async createVerificationToken(data) {
      const db = getDb();
      const [token] = await db
        .insert(auth_verification_tokens)
        .values({
          identifier: data.identifier,
          token: data.token,
          expires: data.expires,
        })
        .returning();
      if (!token) throw new Error("Failed to create verification token");
      return {
        identifier: token.identifier,
        token: token.token,
        expires: token.expires,
      };
    },

    async useVerificationToken(data) {
      const db = getDb();
      const [token] = await db
        .delete(auth_verification_tokens)
        .where(
          and(
            eq(auth_verification_tokens.identifier, data.identifier),
            eq(auth_verification_tokens.token, data.token),
          ),
        )
        .returning();
      if (!token) return null;
      return {
        identifier: token.identifier,
        token: token.token,
        expires: token.expires,
      };
    },

    // -------------------------------------------------------------------------
    // Accounts (OAuth — unused for magic-link but required by adapter shape)
    // -------------------------------------------------------------------------
    async linkAccount(data) {
      const db = getDb();
      await db.insert(auth_accounts).values({
        user_id: data.userId,
        type: data.type,
        provider: data.provider,
        provider_account_id: data.providerAccountId,
        access_token: data.access_token ?? null,
        refresh_token: data.refresh_token ?? null,
        expires_at: data.expires_at ?? null,
        token_type: data.token_type ?? null,
        scope: data.scope ?? null,
        id_token: data.id_token ?? null,
        session_state: typeof data.session_state === "string" ? data.session_state : null,
      });
    },

    async unlinkAccount({ provider, providerAccountId }) {
      const db = getDb();
      await db
        .delete(auth_accounts)
        .where(
          and(
            eq(auth_accounts.provider, provider),
            eq(auth_accounts.provider_account_id, providerAccountId),
          ),
        );
    },
  };
}

// We need to import auth_accounts here for getUserByAccount
import { auth_accounts } from "@campaign/db";
