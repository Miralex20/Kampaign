/**
 * Verified-read tracking logic.
 *
 * Two independent heuristics decide whether a landing page hit is a
 * scanner/bot rather than a real human:
 *
 * 1. UA matching  — the user-agent string contains a known scanner substring.
 * 2. Timing       — the request arrives within 10 seconds of delivery/send,
 *                   which is characteristic of automated link-safety checks.
 *
 * A hit is treated as a confirmed scanner if EITHER condition is true.
 * Only hits that pass both checks are eligible for verified-view recording.
 */
import { KNOWN_SCANNER_UA_SUBSTRINGS } from "./bots.js";

const SCANNER_TIMING_THRESHOLD_MS = 10_000; // 10 seconds

/**
 * Returns true if the user-agent string matches any known scanner/bot pattern.
 * Case-insensitive substring match.
 */
export function isScannerUA(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return KNOWN_SCANNER_UA_SUBSTRINGS.some((pattern) => ua.includes(pattern));
}

/**
 * Returns true if the request arrived suspiciously fast after email delivery
 * (or send, if delivered_at is not yet available).
 *
 * Automated scanners typically follow links within milliseconds of delivery.
 * Real humans take at least a few seconds to open the email client and click.
 */
export function isScannerTiming(
  deliveredAt: Date | null,
  sentAt: Date | null,
  requestAt: Date,
): boolean {
  const reference = deliveredAt ?? sentAt;
  if (!reference) return false;
  const elapsed = requestAt.getTime() - reference.getTime();
  return elapsed >= 0 && elapsed < SCANNER_TIMING_THRESHOLD_MS;
}

/**
 * Composite check: returns true if either the UA or the timing indicates
 * an automated scanner hit. Use this as the single gating check.
 */
export function isScanner(opts: {
  userAgent: string;
  deliveredAt: Date | null;
  sentAt: Date | null;
  requestAt: Date;
}): boolean {
  return (
    isScannerUA(opts.userAgent) || isScannerTiming(opts.deliveredAt, opts.sentAt, opts.requestAt)
  );
}
