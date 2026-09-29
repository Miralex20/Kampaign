/**
 * OTP (one-time password) generation and verification for landing page gating.
 *
 * Security properties:
 * - 6-digit code generated with crypto.randomInt (uniform distribution, no bias).
 * - Only the SHA-256 hash is stored in `otp_codes`. The plaintext is sent to
 *   the recipient's email and immediately discarded.
 * - Max 5 wrong attempts before a 30-minute lockout.
 * - Code expires after 10 minutes.
 * - All comparisons are constant-time.
 */
import { randomInt, createHash, timingSafeEqual } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Generate a zero-padded 6-digit OTP string. */
export function generateOtp(): string {
  // randomInt(min, max) is exclusive of max, so 0–999999 → pad to 6 digits.
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

/** Hash a plaintext OTP code using SHA-256. Returns a 32-byte Buffer. */
export function hashOtp(code: string): Buffer {
  return createHash("sha256").update(code, "utf8").digest();
}

/** Constant-time comparison of a submitted code against its stored hash. */
export function verifyOtp(submitted: string, storedHash: Buffer): boolean {
  if (storedHash.length !== 32) return false;
  const candidate = hashOtp(submitted);
  return timingSafeEqual(candidate, storedHash);
}

/** Returns the Date at which a freshly generated code expires. */
export function otpExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + OTP_EXPIRY_MS);
}

/** Returns the Date at which a lockout is lifted. */
export function otpLockedUntil(now = new Date()): Date {
  return new Date(now.getTime() + OTP_LOCKOUT_MS);
}
