import { describe, it, expect } from "vitest";
import { screenContent } from "./index";

describe("screenContent", () => {
  it("passes benign content", () => {
    const result = screenContent("<h1>Welcome to our annual company newsletter!</h1>");
    expect(result.passed).toBe(true);
    expect(result.matched).toHaveLength(0);
  });

  it("detects known phishing keywords", () => {
    const result = screenContent(
      "<p>Please verify your banking account now to prevent deactivation.</p>",
    );
    expect(result.passed).toBe(false);
    expect(result.matched).toContain("verify your banking account");
  });

  it("handles empty content", () => {
    expect(screenContent("").passed).toBe(true);
  });
});
