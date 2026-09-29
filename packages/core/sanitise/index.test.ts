import { describe, it, expect } from "vitest";
import { sanitiseHtml } from "./index.js";

describe("sanitiseHtml", () => {
  it("strips <script> tags and their content", () => {
    const input = '<p>Hi</p><script>alert(1)</script><p>There</p>';
    const out = sanitiseHtml(input);
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("<p>Hi</p>");
  });

  it("strips <iframe>", () => {
    expect(sanitiseHtml('<iframe src="https://evil.com"></iframe>')).not.toContain("iframe");
  });

  it("strips <form> and <input>", () => {
    const out = sanitiseHtml('<form action="/submit"><input type="text" /></form>');
    expect(out).not.toContain("form");
    expect(out).not.toContain("input");
  });

  it("strips onclick and other event handlers", () => {
    const out = sanitiseHtml('<a href="https://ok.com" onclick="evil()">click</a>');
    expect(out).not.toContain("onclick");
    expect(out).toContain("https://ok.com");
  });

  it("strips javascript: href", () => {
    const out = sanitiseHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("preserves valid https href on <a>", () => {
    const out = sanitiseHtml('<a href="https://example.org">Link</a>');
    expect(out).toContain('href="https://example.org"');
  });

  it("strips http-less src on <img>", () => {
    const out = sanitiseHtml('<img src="data:image/png;base64,abc" alt="x">');
    expect(out).not.toContain("data:");
  });

  it("preserves valid https src on <img>", () => {
    const out = sanitiseHtml('<img src="https://cdn.example.com/logo.png" alt="logo">');
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
  });

  it("preserves allowed block/inline tags", () => {
    const out = sanitiseHtml("<p><strong>Hello</strong> <em>World</em></p>");
    expect(out).toContain("<strong>Hello</strong>");
    expect(out).toContain("<em>World</em>");
  });

  it("strips unknown tags (e.g. <marquee>)", () => {
    const out = sanitiseHtml("<marquee>scroll</marquee>");
    expect(out).not.toContain("marquee");
  });
});
