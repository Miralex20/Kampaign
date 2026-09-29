import { describe, it, expect } from "vitest";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiresAt,
  otpLockedUntil,
  OTP_LENGTH,
  OTP_EXPIRY_MS,
  OTP_LOCKOUT_MS,
} from "./index.js";

describe("generateOtp", () => {
  it("produces a 6-character numeric string", () => {
    const code = generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it("produces zero-padded codes (000000 to 999999)", () => {
    // Generate many codes and check they are all 6 digits
    for (let i = 0; i < 1000; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("generates varied codes (not always the same)", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    // With 1M possibilities and 100 samples, collisions would be extremely rare
    expect(codes.size).toBeGreaterThan(50);
  });
});

describe("hashOtp / verifyOtp", () => {
  it("verifies the correct code", () => {
    const code = generateOtp();
    const hash = hashOtp(code);
    expect(verifyOtp(code, hash)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const code = generateOtp();
    const hash = hashOtp(code);
    const wrong = code === "000000" ? "000001" : "000000";
    expect(verifyOtp(wrong, hash)).toBe(false);
  });

  it("rejects an empty code", () => {
    const hash = hashOtp(generateOtp());
    expect(verifyOtp("", hash)).toBe(false);
  });

  it("rejects when storedHash is wrong length", () => {
    expect(verifyOtp("123456", Buffer.alloc(16))).toBe(false);
  });

  it("hashOtp is deterministic", () => {
    const code = "123456";
    expect(hashOtp(code).equals(hashOtp(code))).toBe(true);
  });
});

describe("otpExpiresAt / otpLockedUntil", () => {
  it("expiry is 10 minutes from now", () => {
    const now = new Date();
    const exp = otpExpiresAt(now);
    expect(exp.getTime() - now.getTime()).toBe(OTP_EXPIRY_MS);
  });

  it("lockout is 30 minutes from now", () => {
    const now = new Date();
    const locked = otpLockedUntil(now);
    expect(locked.getTime() - now.getTime()).toBe(OTP_LOCKOUT_MS);
  });
});
