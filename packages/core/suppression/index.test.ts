import { describe, it, expect, vi } from "vitest";
import { isSuppressed, suppress } from "./index.js";
import type { SuppressionDb } from "./index.js";

function makeMockDb(suppressed: boolean): SuppressionDb {
  return {
    isSuppressed: vi.fn().mockResolvedValue(suppressed),
    suppress: vi.fn().mockResolvedValue(undefined),
  };
}

describe("isSuppressed", () => {
  it("returns true when DB reports suppressed", async () => {
    const db = makeMockDb(true);
    expect(await isSuppressed(db, "org1", "alice@test.com")).toBe(true);
  });

  it("returns false when DB reports not suppressed", async () => {
    const db = makeMockDb(false);
    expect(await isSuppressed(db, "org1", "alice@test.com")).toBe(false);
  });

  it("normalises email to lowercase before querying", async () => {
    const db = makeMockDb(false);
    await isSuppressed(db, "org1", "ALICE@TEST.COM");
    expect(db.isSuppressed).toHaveBeenCalledWith("org1", "alice@test.com");
  });

  it("trims whitespace from email", async () => {
    const db = makeMockDb(false);
    await isSuppressed(db, "org1", "  alice@test.com  ");
    expect(db.isSuppressed).toHaveBeenCalledWith("org1", "alice@test.com");
  });
});

describe("suppress", () => {
  it("calls db.suppress with normalised email", async () => {
    const db = makeMockDb(false);
    await suppress(db, "org1", "ALICE@TEST.COM", "hard_bounce", "hard");
    expect(db.suppress).toHaveBeenCalledWith("org1", "alice@test.com", "hard_bounce", "hard");
  });

  it("passes through the reason and bounceType", async () => {
    const db = makeMockDb(false);
    await suppress(db, "org1", "bob@test.com", "complaint");
    expect(db.suppress).toHaveBeenCalledWith("org1", "bob@test.com", "complaint", undefined);
  });
});
