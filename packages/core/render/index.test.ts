import { describe, it, expect } from "vitest";
import { render, escapeHtml } from "./index.js";

describe("escapeHtml", () => {
  it("escapes all five dangerous characters", () => {
    expect(escapeHtml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &#39;");
  });

  it("leaves safe strings untouched", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

describe("render", () => {
  it("substitutes a plain key", () => {
    expect(render("Hello {{name}}", { name: "Alice" })).toBe("Hello Alice");
  });

  it("HTML-escapes substituted values", () => {
    const result = render("{{payload}}", { payload: "<script>alert(1)</script>" });
    expect(result).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result).not.toContain("<script>");
  });

  it("HTML-escapes ampersands and quotes in values", () => {
    expect(render("{{v}}", { v: `AT&T says "hello"` })).toBe("AT&amp;T says &quot;hello&quot;");
  });

  it("uses fallback when key is missing", () => {
    expect(render("{{name|World}}", {})).toBe("World");
  });

  it("uses fallback when value is empty string", () => {
    expect(render("{{name|World}}", { name: "" })).toBe("World");
  });

  it("uses fallback when value is null", () => {
    expect(render("{{name|World}}", { name: null })).toBe("World");
  });

  it("uses fallback when value is undefined", () => {
    expect(render("{{name|World}}", { name: undefined })).toBe("World");
  });

  it("does not use fallback when value is present and non-empty", () => {
    expect(render("{{name|World}}", { name: "Alice" })).toBe("Alice");
  });

  it("renders empty string for missing key with no fallback", () => {
    expect(render("Hello {{name}}", {})).toBe("Hello ");
  });

  it("leaves unknown syntax unchanged (no loop support)", () => {
    const tmpl = "{{#each items}}{{/each}}";
    expect(render(tmpl, {})).toBe(tmpl);
  });

  it("leaves nested braces that do not match the pattern unchanged", () => {
    const tmpl = "{{{ not valid }}}";
    expect(render(tmpl, {})).toBe(tmpl);
  });

  it("handles multiple placeholders in one string", () => {
    expect(render("{{greeting}}, {{name}}!", { greeting: "Hi", name: "Bob" })).toBe("Hi, Bob!");
  });

  it("does not escape the fallback text (static content, trusted)", () => {
    // Fallback comes from the template author (trusted), not from user data.
    // It is still HTML-escaped for consistency.
    expect(render("{{name|<b>Unknown</b>}}", {})).toBe("&lt;b&gt;Unknown&lt;/b&gt;");
  });
});
