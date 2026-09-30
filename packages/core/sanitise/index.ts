/**
 * HTML sanitiser for sender-supplied email and page HTML.
 *
 * Uses a strict allowlist. Everything not explicitly permitted is stripped.
 * Applied on every campaign create/update to `email_html` and `page_html`.
 *
 * Forbidden (non-exhaustive — DOMPurify denies by default):
 *   <script>, event handler attributes (on*), javascript: URLs,
 *   <iframe>, <object>, <embed>, <form>, <input>, <base>
 *
 * Permitted inline elements: a (http/https href only), b, i, em, strong,
 *   u, s, span, code, sup, sub, br
 * Permitted block elements: p, h1-h6, ul, ol, li, blockquote, pre, hr, div
 * Permitted media: img (src http/https only)
 * Permitted table: table, thead, tbody, tfoot, tr, th, td, caption
 */

// We use a regex-based sanitiser here because DOMPurify requires a DOM
// environment. For server-side use in Node we implement a focused allowlist
// sanitiser that covers the relevant attack vectors without pulling in jsdom.
// If a full DOM sanitiser is needed in M3, switch to:
//   import DOMPurify from "dompurify"; import { JSDOM } from "jsdom";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "span",
  "code",
  "sup",
  "sub",
  "br",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "div",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
]);

const ALLOWED_ATTRS: Record<string, RegExp | true> = {
  // <a>: only http/https href, target, rel
  href: /^https?:\/\//i,
  target: true,
  rel: true,
  // <img>: only http/https src, safe presentation attrs
  src: /^https?:\/\//i,
  alt: true,
  width: true,
  height: true,
  // Style is stripped entirely — too broad an attack surface.
  // Class is allowed for template theming.
  class: true,
  // Table attrs
  colspan: true,
  rowspan: true,
  align: true,
  valign: true,
};

// Strip anything that looks like an event handler attribute or javascript: URL.
const DANGEROUS_ATTR = /^on[a-z]/i;
const DANGEROUS_HREF = /^javascript:/i;

/**
 * Strip dangerous HTML from sender-supplied content.
 *
 * This implementation uses regex tag/attribute parsing. It is NOT a full
 * DOM parser — it is a defence-in-depth measure. For production, augment
 * with a DOM-based sanitiser (see note above).
 */
export function sanitiseHtml(raw: string): string {
  // 1. Strip <script> blocks and their content entirely.
  let out = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");

  // 2. Strip dangerous singleton tags: iframe, object, embed, form, input, base, meta, link
  out = out.replace(
    /<\/?(iframe|object|embed|form|input|textarea|select|button|base|meta|link)\b[^>]*>/gi,
    "",
  );

  // 3. Strip event handler attributes and javascript: hrefs from any tag.
  out = out.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?(\/?)>/g,
    (match, tag: string, attrs: string | undefined, selfClose: string) => {
      const tagLower = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(tagLower)) {
        return ""; // Strip unknown/disallowed tags entirely
      }
      if (!attrs) return match;

      // Filter attributes
      const cleanAttrs = attrs.replace(
        /\s([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g,
        (_attrMatch, attrName: string, dq: string, sq: string, uq: string) => {
          const name = attrName.toLowerCase();
          const value = dq ?? sq ?? uq ?? "";

          // Block all event handlers
          if (DANGEROUS_ATTR.test(name)) return "";
          // Block javascript: protocol in any attribute
          if (DANGEROUS_HREF.test(value)) return "";

          const rule = ALLOWED_ATTRS[name];
          if (!rule) return ""; // Attribute not in allowlist

          if (rule instanceof RegExp && !rule.test(value)) return ""; // Value fails pattern

          return ` ${name}="${value}"`;
        },
      );

      return `<${tag}${cleanAttrs}${selfClose ? " /" : ""}>`;
    },
  );

  // 4. Strip closing tags for disallowed tags
  out = out.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (_match, tag: string) => {
    return ALLOWED_TAGS.has(tag.toLowerCase()) ? `</${tag}>` : "";
  });

  return out;
}
