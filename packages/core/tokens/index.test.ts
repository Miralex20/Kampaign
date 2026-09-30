import { describe, it, expect } from "vitest";
import { newToken, hashToken, safeVerify, encryptToken, decryptToken } from "./index.js";

describe("newToken", () => {
  it("produces a non-empty base64url string", () => {
    const t = newToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(32);
  });

  it("produces no collisions across 100 000 generations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 100_000; i++) {
      set.add(newToken());
    }
    expect(set.size).toBe(100_000);
  });
});

describe("hashToken", () => {
  it("returns a 32-byte Buffer", () => {
    const h = hashToken(newToken());
    expect(h).toBeInstanceOf(Buffer);
    expect(h.length).toBe(32);
  });

  it("is deterministic — same input always yields same output", () => {
    const raw = newToken();
    const h1 = hashToken(raw);
    const h2 = hashToken(raw);
    expect(h1.equals(h2)).toBe(true);
  });

  it("different tokens produce different hashes", () => {
    const h1 = hashToken(newToken());
    const h2 = hashToken(newToken());
    expect(h1.equals(h2)).toBe(false);
  });
});

describe("safeVerify", () => {
  it("returns true for the correct raw token", () => {
    const raw = newToken();
    const hash = hashToken(raw);
    expect(safeVerify(raw, hash)).toBe(true);
  });

  it("returns false for a wrong token", () => {
    const raw = newToken();
    const hash = hashToken(newToken()); // hash of a different token
    expect(safeVerify(raw, hash)).toBe(false);
  });

  it("returns false for a one-character mutation", () => {
    const raw = newToken();
    const hash = hashToken(raw);
    // Flip one character in the raw token
    const mutated = raw.slice(0, -1) + (raw.endsWith("a") ? "b" : "a");
    expect(safeVerify(mutated, hash)).toBe(false);
  });

  it("returns false for an empty token string", () => {
    const hash = hashToken(newToken());
    expect(safeVerify("", hash)).toBe(false);
  });

  it("throws when storedHash is not 32 bytes", () => {
    const raw = newToken();
    const shortHash = Buffer.alloc(16);
    expect(() => safeVerify(raw, shortHash)).toThrow(/32 bytes/);
  });
});

describe("encryptToken / decryptToken", () => {
  const key = Buffer.alloc(32, 0x42); // 32-byte test key

  it("round-trips correctly", () => {
    const raw = newToken();
    const cipher = encryptToken(raw, key);
    expect(decryptToken(cipher, key)).toBe(raw);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const raw = newToken();
    const c1 = encryptToken(raw, key);
    const c2 = encryptToken(raw, key);
    expect(c1).not.toBe(c2);
  });

  it("ciphertext has three dot-separated segments", () => {
    const cipher = encryptToken(newToken(), key);
    expect(cipher.split(".").length).toBe(3);
  });

  it("throws on wrong decryption key", () => {
    const raw = newToken();
    const wrongKey = Buffer.alloc(32, 0x11);
    const cipher = encryptToken(raw, key);
    expect(() => decryptToken(cipher, wrongKey)).toThrow();
  });

  it("throws when key is not 32 bytes", () => {
    const shortKey = Buffer.alloc(16);
    expect(() => encryptToken(newToken(), shortKey)).toThrow(/32 bytes/);
    expect(() => decryptToken("a.b.c", shortKey)).toThrow(/32 bytes/);
  });

  it("throws on tampered ciphertext", () => {
    const raw = newToken();
    const cipher = encryptToken(raw, key);
    const parts = cipher.split(".");
    // Flip a byte in the ciphertext segment
    const tampered = parts[0] + "." + parts[1]!.slice(0, -2) + "XX" + "." + parts[2];
    expect(() => decryptToken(tampered, key)).toThrow();
  });
});
