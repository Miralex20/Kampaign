import { describe, it, expect } from "vitest";
import { parseRecipientCsv } from "./index.js";

function buildCsv(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\n");
}

describe("parseRecipientCsv", () => {
  it("parses a valid single row", async () => {
    const csv = buildCsv([
      ["email", "first_name"],
      ["alice@test.com", "Alice"],
    ]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.email).toBe("alice@test.com");
    expect(result.valid[0]!.first_name).toBe("Alice");
    expect(result.rejected).toHaveLength(0);
  });

  it("lowercases and trims emails", async () => {
    const csv = buildCsv([["email"], ["  ALICE@TEST.COM  "]]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid[0]!.email).toBe("alice@test.com");
  });

  it("rejects an invalid email format", async () => {
    const csv = buildCsv([["email"], ["notanemail"]]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toMatch(/Invalid email/);
  });

  it("rejects email missing local part", async () => {
    const csv = buildCsv([["email"], ["@missing-local.com"]]);
    const result = await parseRecipientCsv(csv);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects email missing @ sign", async () => {
    const csv = buildCsv([["email"], ["missing-at-sign.com"]]);
    const result = await parseRecipientCsv(csv);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects example.com domains", async () => {
    const csv = buildCsv([["email"], ["test@example.com"]]);
    const result = await parseRecipientCsv(csv);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]!.reason).toMatch(/Invalid email/);
  });

  it("deduplicates — last row wins for same email", async () => {
    const csv = buildCsv([
      ["email", "first_name"],
      ["alice@test.com", "Alice First"],
      ["alice@test.com", "Alice Last"],
    ]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.first_name).toBe("Alice Last");
  });

  it("valid + rejected counts sum to total data rows", async () => {
    // 1000 rows: 20 bad, 980 good (no duplicates)
    const rows: string[][] = [["email", "first_name"]];
    for (let i = 0; i < 980; i++) {
      rows.push([`user${i}@valid.com`, `User ${i}`]);
    }
    for (let i = 0; i < 20; i++) {
      rows.push([`badrow${i}`, `Bad ${i}`]);
    }
    const csv = buildCsv(rows);
    const result = await parseRecipientCsv(csv);
    expect(result.valid.length + result.rejected.length).toBe(1000);
    expect(result.valid).toHaveLength(980);
    expect(result.rejected).toHaveLength(20);
  });

  it("collects custom fields", async () => {
    const csv = buildCsv([
      ["email", "first_name", "city", "role"],
      ["bob@test.com", "Bob", "Lagos", "manager"],
    ]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid[0]!.fields).toEqual({ city: "Lagos", role: "manager" });
  });

  it("omits first_name from fields", async () => {
    const csv = buildCsv([
      ["email", "first_name", "dept"],
      ["carol@test.com", "Carol", "eng"],
    ]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid[0]!.fields).not.toHaveProperty("first_name");
  });

  it("sets first_name to undefined when column absent", async () => {
    const csv = buildCsv([["email"], ["dan@test.com"]]);
    const result = await parseRecipientCsv(csv);
    expect(result.valid[0]!.first_name).toBeUndefined();
  });
});
