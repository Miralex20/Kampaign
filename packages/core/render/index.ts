/**
 * Simple placeholder substitution engine for campaign templates.
 *
 * Syntax:
 *   {{key}}           — replaced with the value of `key` from data, HTML-escaped.
 *                       Missing key with no fallback → empty string.
 *   {{key|fallback}}  — replaced with the value of `key`, or `fallback` if the key
 *                       is absent or its value is an empty string.
 *
 * Non-matching syntax (e.g. {{#each items}}) is left exactly as-is.
 *
 * Security: all substituted values are HTML-escaped before insertion.
 * No template logic (loops, conditionals) is supported by design.
 */

/** HTML-escape a string so it is safe to insert into HTML content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a template string by substituting `{{key}}` and `{{key|fallback}}`
 * placeholders from `data`.
 *
 * @param template - Raw template string (HTML or plain text).
 * @param data     - Key/value map of substitution values.
 * @returns        - Rendered string with all valid placeholders substituted.
 */
export function render(template: string, data: Record<string, string | undefined | null>): string {
  // Matches {{key}} and {{key|fallback}} where key is word chars + hyphens.
  // Anything that does not match this pattern is left unchanged.
  return template.replace(
    /\{\{([a-zA-Z0-9_-]+)(?:\|([^}]*))?\}\}/g,
    (_match, key: string, fallback: string | undefined) => {
      const raw = data[key];
      // Use the fallback when the value is absent or an empty string.
      const value = raw !== undefined && raw !== null && raw !== "" ? raw : (fallback ?? "");
      return escapeHtml(value);
    },
  );
}
