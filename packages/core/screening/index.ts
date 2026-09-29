/**
 * Keyword and phishing screening for email and page HTML.
 *
 * Checks content against a curated list of high-risk keywords and phishing patterns.
 * Returns { passed: boolean, matched: string[] }.
 */

export const PHISHING_KEYWORDS: readonly string[] = [
  "verify your banking account",
  "reset your bank password",
  "urgent: account suspended",
  "confirm your wire transfer",
  "cryptocurrency wallet recovery",
  "claim your inheritance funds",
  "immediate account verification required",
  "unauthorized login attempt detected",
  "security notice: enter your ssn",
  "update your payment details immediately",
  "lottery winnings notification",
] as const;

export interface ScreeningResult {
  passed: boolean;
  matched: string[];
}

export function screenContent(content: string): ScreeningResult {
  if (!content) return { passed: true, matched: [] };

  const lower = content.toLowerCase();
  const matched: string[] = [];

  for (const keyword of PHISHING_KEYWORDS) {
    if (lower.includes(keyword)) {
      matched.push(keyword);
    }
  }

  return {
    passed: matched.length === 0,
    matched,
  };
}
