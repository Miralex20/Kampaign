import { describe, it, expect } from "vitest";
import * as schema from "./index.js";

describe("db schema exports", () => {
  it("exports all expected core tables", () => {
    expect(schema.organizations).toBeDefined();
    expect(schema.users).toBeDefined();
    expect(schema.campaigns).toBeDefined();
    expect(schema.campaign_page_versions).toBeDefined();
    expect(schema.recipients).toBeDefined();
    expect(schema.messages).toBeDefined();
    expect(schema.events).toBeDefined();
    expect(schema.replies).toBeDefined();
    expect(schema.suppressions).toBeDefined();
    expect(schema.otp_codes).toBeDefined();
  });

  it("exports auth tables for NextAuth v5", () => {
    expect(schema.auth_users).toBeDefined();
    expect(schema.auth_accounts).toBeDefined();
    expect(schema.auth_sessions).toBeDefined();
    expect(schema.auth_verification_tokens).toBeDefined();
  });
});
