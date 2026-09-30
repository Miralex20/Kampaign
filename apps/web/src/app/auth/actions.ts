"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb, auth_users, auth_verification_tokens, users, organizations } from "@campaign/db";
import { eq, and } from "drizzle-orm";
import { signIn } from "@/auth";
import { sendEmail } from "@/lib/email";
import { redirect } from "next/navigation";

function isRedirectError(error: any): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

export type AuthActionResult = {
  success?: boolean;
  error?: string;
  message?: string;
};

/**
 * Register a new organization and workspace owner with email + password.
 */
export async function signUpAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const name = (formData.get("name") as string)?.trim();
  const orgName = (formData.get("orgName") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!name || name.length < 2) {
    return { error: "Please enter your full name (at least 2 characters)." };
  }
  if (!orgName || orgName.length < 2) {
    return { error: "Please enter your organization or company name." };
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    return { error: "Please enter a valid work email address." };
  }
  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters long." };
  }

  const db = getDb();

  // Check if user already exists
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser) {
    return { error: "An account with this email address already exists. Please sign in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.transaction(async (tx) => {
      // 1. Create Organization
      const [org] = await tx
        .insert(organizations)
        .values({
          name: orgName,
          review_state: "pending",
          plan: "trial",
          daily_cap: 500,
        })
        .returning();

      if (!org) throw new Error("Failed to create organization");

      // 2. Create App User (Owner)
      await tx.insert(users).values({
        org_id: org.id,
        email,
        name,
        password_hash: passwordHash,
        role: "owner",
        status: "active",
        permissions: {
          can_create_campaigns: true,
          can_edit_campaigns: true,
          can_view_analytics: true,
          can_invite_members: true,
        },
      });

      // 3. Create Auth User
      await tx.insert(auth_users).values({
        name,
        email,
        email_verified: new Date(),
      });
    });
  } catch (err: any) {
    console.error("[signUpAction] Error creating account:", err);
    return { error: "Unable to create your account right now. Please try again." };
  }

  // Auto-login upon successful registration
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (err) {
    if (isRedirectError(err)) {
      throw err;
    }
    console.error("[signUpAction] Auto-signin error:", err);
    // If signin fails, send user to login page
    redirect("/auth/signin?registered=true");
  }

  return { success: true };
}

/**
 * Sign in with email and password credentials.
 */
export async function signInWithCredentialsAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Please enter both your email and password." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
  } catch (err: any) {
    if (isRedirectError(err)) {
      throw err;
    }
    return { error: "Invalid email or password. Please verify your credentials." };
  }

  return { success: true };
}

/**
 * Request a password reset email.
 */
export async function requestPasswordResetAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email address." };
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    // Remove any previous reset tokens for this email
    await db
      .delete(auth_verification_tokens)
      .where(eq(auth_verification_tokens.identifier, `reset:${email}`));

    // Insert new reset token
    await db.insert(auth_verification_tokens).values({
      identifier: `reset:${email}`,
      token,
      expires,
    });

    const baseUrl = process.env["APP_BASE_URL"] ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await sendEmail({
        to: email,
        subject: "Reset your Kampaign password",
        text: `Hello ${user.name ?? "there"},\n\nWe received a request to reset your password for your Kampaign account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, you can safely ignore this email.\n\n— The Kampaign Team`,
        html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 40px auto; padding: 32px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; color: #0f172a;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
    <div style="width: 28px; height: 28px; background: #4f46e5; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: bold; font-size: 14px;">K</div>
    <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Kampaign</span>
  </div>
  <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Reset your password</h2>
  <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px 0;">
    Hello ${user.name ? `<strong>${user.name}</strong>` : "there"},<br/>
    We received a request to reset the password for your Kampaign workspace account. Click the button below to choose a new password:
  </p>
  <div style="margin: 28px 0;">
    <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
      Reset Password →
    </a>
  </div>
  <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 24px 0;">
    Or copy and paste this URL into your browser:<br/>
    <a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a>
  </p>
  <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 24px 0 0 0; border-top: 1px solid #f1f5f9; padding-top: 16px;">
    This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
  </p>
</div>
        `.trim(),
      });
    } catch (mailErr) {
      console.error("[requestPasswordResetAction] Failed to send email:", mailErr);
    }
  }

  // Always return friendly confirmation to prevent user enumeration
  return {
    success: true,
    message: "If an account exists for this email, we have sent instructions to reset your password. Please check your inbox (and spam folder).",
  };
}

/**
 * Complete password reset with verification token and new password.
 */
export async function resetPasswordAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const token = formData.get("token") as string;
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!token || !email) {
    return { error: "Missing or invalid password reset token." };
  }
  if (!password || password.length < 8) {
    return { error: "New password must be at least 8 characters long." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match. Please re-enter your password." };
  }

  const db = getDb();

  // Verify token
  const [tokenRecord] = await db
    .select()
    .from(auth_verification_tokens)
    .where(
      and(
        eq(auth_verification_tokens.identifier, `reset:${email}`),
        eq(auth_verification_tokens.token, token)
      )
    )
    .limit(1);

  if (!tokenRecord) {
    return { error: "This password reset link is invalid or has already been used." };
  }

  if (new Date(tokenRecord.expires) < new Date()) {
    return { error: "This password reset link has expired. Please request a new one." };
  }

  // Hash new password and update user
  const passwordHash = await bcrypt.hash(password, 10);

  await db
    .update(users)
    .set({ password_hash: passwordHash })
    .where(eq(users.email, email));

  // Delete used token
  await db
    .delete(auth_verification_tokens)
    .where(
      and(
        eq(auth_verification_tokens.identifier, `reset:${email}`),
        eq(auth_verification_tokens.token, token)
      )
    );

  redirect("/auth/signin?reset=success");
}
