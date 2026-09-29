/**
 * Known email security scanner / bot user-agent substrings.
 *
 * Rules:
 * - Entries are lowercase substrings matched case-insensitively against the UA.
 * - Add new entries here when a new scanner is identified; no schema migration needed.
 * - Keep entries specific enough to avoid false positives on real browser UAs.
 *
 * Sources: internal observation + community-maintained lists.
 * Last reviewed: see git blame.
 */
export const KNOWN_SCANNER_UA_SUBSTRINGS: readonly string[] = [
  // Barracuda Networks
  "barracudacentral",
  // Proofpoint
  "proofpoint",
  // Microsoft SafeLinks / ATP
  "msftsafelinks",
  "microsoft url monitor",
  // Google Safe Browsing
  "google-safety",
  // Symantec / Broadcom
  "symantec",
  "messagelabs",
  // Mimecast
  "mimecast",
  // Cisco IronPort
  "ironport",
  // Sophos
  "sophos",
  // Generic scanner markers
  "url-scanner",
  "link-checker",
  "linkchecker",
  "preview-link",
  "previewbot",
  "safebrowsing",
  "phishtank",
  // Cloudflare email scanner
  "cloudflare-email",
  // Generic headless / bot UAs
  "headlesschrome",
  "phantomjs",
  "slurp",
  "bingbot",
  "googlebot",
  "yahoo! slurp",
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "sogou",
];
