/**
 * Token primitives for campaign message links.
 *
 * Security contract:
 * - Raw tokens are never persisted. Only their SHA-256 hash is stored.
 * - Tokens are encrypted (AES-256-GCM) before being placed in any external
 *   store (BullMQ job payload). The plaintext lives only in process memory.
 * - All comparisons use constant-time equality to prevent timing attacks.
 */
import {
  randomBytes,
  createHash,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

/** 192 bits of entropy → 32 character base64url string. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Returns the SHA-256 hash of the raw token as a 32-byte Buffer.
 * This is the only form of the token that is ever persisted.
 */
export function hashToken(raw: string): Buffer {
  return createHash("sha256").update(raw, "utf8").digest();
}

/**
 * Constant-time comparison of a submitted raw token against a stored hash.
 *
 * Throws if storedHash is not exactly 32 bytes (defensive assertion — a
 * shorter hash would always fail the length check, leaking information).
 */
export function safeVerify(raw: string, storedHash: Buffer): boolean {
  if (storedHash.length !== 32) {
    throw new Error(`Invalid stored hash length: expected 32 bytes, got ${storedHash.length}`);
  }
  const candidate = hashToken(raw);
  // timingSafeEqual requires equal-length buffers; both are 32 bytes here.
  return timingSafeEqual(candidate, storedHash);
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption for token ciphertext stored in BullMQ job payloads.
// The key must be exactly 32 bytes (256 bits).
// ---------------------------------------------------------------------------

const GCM_IV_BYTES = 12; // 96-bit IV — GCM standard recommendation
const GCM_TAG_BYTES = 16;

/**
 * Encrypts a raw token with AES-256-GCM.
 *
 * Output format (all base64url): `<iv>.<ciphertext>.<authTag>`
 */
export function encryptToken(raw: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
  }
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

/**
 * Decrypts a ciphertext produced by `encryptToken`.
 *
 * Throws if the key is wrong or the ciphertext has been tampered with
 * (GCM authentication tag verification failure).
 */
export function decryptToken(ciphertext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error(`Encryption key must be 32 bytes, got ${key.length}`);
  }
  const parts = ciphertext.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext: expected 3 dot-separated segments");
  }
  const [ivB64, ctB64, tagB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, "base64url");
  const ct = Buffer.from(ctB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");

  if (iv.length !== GCM_IV_BYTES) {
    throw new Error("Malformed ciphertext: invalid IV length");
  }
  if (tag.length !== GCM_TAG_BYTES) {
    throw new Error("Malformed ciphertext: invalid auth tag length");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Parse and validate the TOKEN_ENCRYPTION_KEY environment variable. */
export function loadEncryptionKey(): Buffer {
  const raw = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY environment variable is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (256 bits), got ${key.length}`,
    );
  }
  return key;
}
