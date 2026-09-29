import { describe, it, expect } from "vitest";
import { isScannerUA, isScannerTiming, isScanner } from "./index.js";

describe("isScannerUA", () => {
  it("detects Barracuda scanner", () => {
    expect(isScannerUA("BarracudaCentral/1.0")).toBe(true);
  });

  it("detects Proofpoint scanner", () => {
    expect(isScannerUA("Mozilla/5.0 (compatible; Proofpoint URL Defense)")).toBe(true);
  });

  it("detects Microsoft SafeLinks", () => {
    expect(isScannerUA("msftsafelinks")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isScannerUA("BARRACUDACENTRAL")).toBe(true);
    expect(isScannerUA("MIMECAST")).toBe(true);
  });

  it("returns false for a real Chrome browser UA", () => {
    expect(
      isScannerUA(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("returns false for a real Firefox browser UA", () => {
    expect(
      isScannerUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0"),
    ).toBe(false);
  });

  it("returns false for an empty UA string", () => {
    expect(isScannerUA("")).toBe(false);
  });
});

describe("isScannerTiming", () => {
  const now = new Date("2024-01-01T12:00:10.000Z");

  it("returns true when request arrives 5 s after delivery (< 10 s threshold)", () => {
    const deliveredAt = new Date("2024-01-01T12:00:05.000Z");
    expect(isScannerTiming(deliveredAt, null, now)).toBe(true);
  });

  it("returns true when request arrives exactly at delivery time", () => {
    const deliveredAt = new Date("2024-01-01T12:00:10.000Z");
    expect(isScannerTiming(deliveredAt, null, now)).toBe(true);
  });

  it("returns false when request arrives 11 s after delivery (> 10 s threshold)", () => {
    const deliveredAt = new Date("2024-01-01T11:59:59.000Z");
    expect(isScannerTiming(deliveredAt, null, now)).toBe(false);
  });

  it("falls back to sentAt when deliveredAt is null", () => {
    const sentAt = new Date("2024-01-01T12:00:05.000Z");
    expect(isScannerTiming(null, sentAt, now)).toBe(true);
  });

  it("returns false when both deliveredAt and sentAt are null", () => {
    expect(isScannerTiming(null, null, now)).toBe(false);
  });

  it("returns false when request is before delivery (negative elapsed)", () => {
    const deliveredAt = new Date("2024-01-01T12:00:15.000Z");
    expect(isScannerTiming(deliveredAt, null, now)).toBe(false);
  });
});

describe("isScanner (composite)", () => {
  const now = new Date();

  it("returns true when only UA matches", () => {
    expect(isScanner({ userAgent: "Mimecast Scanner", deliveredAt: null, sentAt: null, requestAt: now })).toBe(true);
  });

  it("returns true when only timing matches", () => {
    const twoSecondsAgo = new Date(now.getTime() - 2000);
    expect(
      isScanner({
        userAgent: "Mozilla/5.0 Chrome/124",
        deliveredAt: twoSecondsAgo,
        sentAt: null,
        requestAt: now,
      }),
    ).toBe(true);
  });

  it("returns false when neither condition matches", () => {
    const tenMinutesAgo = new Date(now.getTime() - 600_000);
    expect(
      isScanner({
        userAgent: "Mozilla/5.0 Chrome/124",
        deliveredAt: tenMinutesAgo,
        sentAt: null,
        requestAt: now,
      }),
    ).toBe(false);
  });
});
