/**
 * CSV parsing for recipient imports.
 *
 * Handles up to 50 000 rows via streaming (PapaParse streaming mode).
 * Returns valid rows and a detailed rejection list — never throws on bad data.
 *
 * Email normalisation: trimmed + lowercased.
 * Deduplication: within the uploaded file, the LAST row for a given email wins.
 */
import { parse as papaParse } from "papaparse";
import { Readable } from "node:stream";

export interface RecipientRow {
  email: string;
  first_name: string | undefined;
  fields: Record<string, string>;
  /** 1-based row number in the original file */
  rowNumber: number;
}

export interface RejectedRow {
  rowNumber: number;
  email: string;
  reason: string;
}

export interface ParseResult {
  valid: RecipientRow[];
  rejected: RejectedRow[];
}

/** Basic RFC 5321 email validation — no example.com addresses allowed. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BLOCKED_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

function validateEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const domain = email.split("@")[1];
  if (!domain) return null;
  if (BLOCKED_DOMAINS.has(domain)) return null;
  return email;
}

/**
 * Parse a CSV string or Buffer of recipient data.
 *
 * Required column: `email` (case-insensitive header match).
 * Optional columns: `first_name`, any others become `fields`.
 */
export async function parseRecipientCsv(
  input: string | Buffer,
): Promise<ParseResult> {
  const source = typeof input === "string" ? input : input.toString("utf8");

  return new Promise((resolve) => {
    // Map from normalised email → row (last-row-wins dedup)
    const dedupMap = new Map<string, RecipientRow>();
    const rejected: RejectedRow[] = [];
    let rowNumber = 0;
    let headerRow: string[] | null = null;

    papaParse<string[]>(source, {
      header: false,
      skipEmptyLines: true,
      step(result) {
        const rawRow = result.data;
        rowNumber++;

        // First row is the header
        if (rowNumber === 1) {
          headerRow = rawRow.map((h) => h.trim().toLowerCase());
          return;
        }

        if (!headerRow) return;

        const emailIdx = headerRow.indexOf("email");
        if (emailIdx === -1) {
          // This error applies to the whole file but we report it on row 1
          rejected.push({ rowNumber, email: "", reason: "Missing 'email' column in header" });
          return;
        }

        const rawEmail = rawRow[emailIdx] ?? "";
        const email = validateEmail(rawEmail);

        if (!email) {
          rejected.push({
            rowNumber,
            email: rawEmail.trim().toLowerCase(),
            reason: `Invalid email format: "${rawEmail.trim()}"`,
          });
          return;
        }

        const firstNameIdx = headerRow.indexOf("first_name");
        const firstName =
          firstNameIdx !== -1 ? (rawRow[firstNameIdx] ?? "").trim() || undefined : undefined;

        // All other columns become custom fields
        const fields: Record<string, string> = {};
        for (let i = 0; i < headerRow.length; i++) {
          const colName = headerRow[i];
          if (!colName || colName === "email" || colName === "first_name") continue;
          const val = (rawRow[i] ?? "").trim();
          if (val) fields[colName] = val;
        }

        // Last-row-wins deduplication within the file
        dedupMap.set(email, { email, first_name: firstName, fields, rowNumber });
      },
      complete() {
        resolve({ valid: Array.from(dedupMap.values()), rejected });
      },
      error(err: { message: string }) {
        rejected.push({ rowNumber, email: "", reason: `Parse error: ${err.message}` });
        resolve({ valid: Array.from(dedupMap.values()), rejected });
      },
    });
  });
}
