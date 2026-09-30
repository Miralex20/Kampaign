import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock email sending
vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock NextAuth signIn and Next.js navigation
vi.mock("@/auth", () => ({
  signIn: vi.fn().mockResolvedValue(undefined),
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error: any = new Error("NEXT_REDIRECT");
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  }),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(),
  })),
}));

import {
  signUpAction,
  signInWithCredentialsAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "./actions";
import { getDb, users, organizations, auth_verification_tokens } from "@campaign/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

describe("Authentication & Password Recovery Actions", () => {
  const db = getDb();
  const testEmail = `tester_${Date.now()}@example.com`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("signUpAction", () => {
    it("rejects invalid inputs", async () => {
      const formData = new FormData();
      formData.set("name", "J");
      formData.set("orgName", "Acme");
      formData.set("email", "bad-email");
      formData.set("password", "short");

      const res = await signUpAction(null, formData);
      expect(res.error).toBeDefined();
      expect(res.error).toContain("at least 2 characters");
    });

    it("rejects weak passwords (< 8 characters)", async () => {
      const formData = new FormData();
      formData.set("name", "Jane Doe");
      formData.set("orgName", "Acme Corp");
      formData.set("email", "jane@acme.com");
      formData.set("password", "1234567");

      const res = await signUpAction(null, formData);
      expect(res.error).toContain("at least 8 characters");
    });

    it("creates an organization and owner user with hashed password", async () => {
      const formData = new FormData();
      formData.set("name", "Tester Jane");
      formData.set("orgName", "Alpha Beta Labs");
      formData.set("email", testEmail);
      formData.set("password", "Secret123!Secure");

      try {
        await signUpAction(null, formData);
      } catch (err: any) {
        // NEXT_REDIRECT or success
        if (!err.digest?.startsWith("NEXT_REDIRECT")) {
          throw err;
        }
      }

      // Verify user in DB
      const [created] = await db
        .select()
        .from(users)
        .where(eq(users.email, testEmail))
        .limit(1);

      expect(created).toBeDefined();
      expect(created.name).toBe("Tester Jane");
      expect(created.role).toBe("owner");
      expect(created.password_hash).toBeDefined();

      const matches = await bcrypt.compare("Secret123!Secure", created.password_hash!);
      expect(matches).toBe(true);

      // Verify org was created
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, created.org_id))
        .limit(1);

      expect(org).toBeDefined();
      expect(org.name).toBe("Alpha Beta Labs");
    });

    it("prevents duplicate registration for the same email", async () => {
      const formData = new FormData();
      formData.set("name", "Duplicate User");
      formData.set("orgName", "Another Org");
      formData.set("email", testEmail);
      formData.set("password", "Secret123!Secure");

      const res = await signUpAction(null, formData);
      expect(res.error).toContain("already exists");
    });
  });

  describe("requestPasswordResetAction", () => {
    it("creates a verification token and dispatches reset email", async () => {
      const formData = new FormData();
      formData.set("email", testEmail);

      const res = await requestPasswordResetAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.message).toBeDefined();

      // Check token in DB
      const [tokenRow] = await db
        .select()
        .from(auth_verification_tokens)
        .where(eq(auth_verification_tokens.identifier, `reset:${testEmail}`))
        .limit(1);

      expect(tokenRow).toBeDefined();
      expect(tokenRow.token).toBeDefined();
      expect(tokenRow.expires.getTime()).toBeGreaterThan(Date.now());

      // Check email dispatch
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const emailArgs = (sendEmail as any).mock.calls[0][0];
      expect(emailArgs.to).toBe(testEmail);
      expect(emailArgs.subject).toContain("Reset your Kampaign password");
      expect(emailArgs.html).toContain(tokenRow.token);
    });

    it("handles non-existent email gracefully without error leakage", async () => {
      const formData = new FormData();
      formData.set("email", "nonexistent@nowhere.test");

      const res = await requestPasswordResetAction(null, formData);
      expect(res.success).toBe(true);
      expect(res.message).toBeDefined();
    });
  });

  describe("resetPasswordAction", () => {
    it("rejects mismatched passwords", async () => {
      const formData = new FormData();
      formData.set("token", "dummy-token");
      formData.set("email", testEmail);
      formData.set("password", "NewPassword123!");
      formData.set("confirmPassword", "DifferentPassword123!");

      const res = await resetPasswordAction(null, formData);
      expect(res.error).toContain("Passwords do not match");
    });

    it("rejects invalid or expired tokens", async () => {
      const formData = new FormData();
      formData.set("token", "invalid-token-xyz");
      formData.set("email", testEmail);
      formData.set("password", "NewPassword123!");
      formData.set("confirmPassword", "NewPassword123!");

      const res = await resetPasswordAction(null, formData);
      expect(res.error).toContain("invalid or has already been used");
    });

    it("successfully updates the password and deletes the token", async () => {
      // Fetch token from DB
      const [tokenRow] = await db
        .select()
        .from(auth_verification_tokens)
        .where(eq(auth_verification_tokens.identifier, `reset:${testEmail}`))
        .limit(1);

      expect(tokenRow).toBeDefined();

      const formData = new FormData();
      formData.set("token", tokenRow.token);
      formData.set("email", testEmail);
      formData.set("password", "BrandNewPassword999!");
      formData.set("confirmPassword", "BrandNewPassword999!");

      let redirected = false;
      try {
        await resetPasswordAction(null, formData);
      } catch (err: any) {
        if (err.digest?.includes("/auth/signin?reset=success")) {
          redirected = true;
        } else {
          throw err;
        }
      }
      expect(redirected).toBe(true);

      // Verify user's new password in DB
      const [updated] = await db
        .select()
        .from(users)
        .where(eq(users.email, testEmail))
        .limit(1);

      const matchesNew = await bcrypt.compare("BrandNewPassword999!", updated.password_hash!);
      expect(matchesNew).toBe(true);

      const matchesOld = await bcrypt.compare("Secret123!Secure", updated.password_hash!);
      expect(matchesOld).toBe(false);

      // Verify token was deleted
      const [consumedToken] = await db
        .select()
        .from(auth_verification_tokens)
        .where(eq(auth_verification_tokens.identifier, `reset:${testEmail}`))
        .limit(1);

      expect(consumedToken).toBeUndefined();
    });
  });
});
