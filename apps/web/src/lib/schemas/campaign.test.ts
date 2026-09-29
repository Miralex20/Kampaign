import { describe, it, expect } from "vitest";
import {
  CreateCampaignSchema,
  UpdateCampaignSchema,
  ListCampaignsSchema,
} from "./campaign";

describe("Campaign Zod Schemas", () => {
  it("validates a valid CreateCampaign payload", () => {
    const valid = {
      name: "Q4 Outreach",
      campaign_mode: "managed_send",
      subject: "Important announcement",
      email_html: "<p>Hello {{first_name}}</p>",
      email_text: "Hello {{first_name}}",
      page_html: "<h1>Welcome</h1>",
    };
    const parsed = CreateCampaignSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("fails if required fields are missing", () => {
    const invalid = {
      name: "",
    };
    const parsed = CreateCampaignSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates mode values strictly", () => {
    const invalidMode = {
      name: "Test",
      mode: "unsupported_mode",
      email_html: "<p>test</p>",
      page_html: "<h1>test</h1>",
    };
    const parsed = CreateCampaignSchema.safeParse(invalidMode);
    expect(parsed.success).toBe(false);
  });

  it("parses valid ListCampaignsSchema query params", () => {
    const query = {
      page: "2",
      limit: "25",
      status: "draft",
    };
    const parsed = ListCampaignsSchema.safeParse(query);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.page).toBe(2);
      expect(parsed.data.limit).toBe(25);
      expect(parsed.data.status).toBe("draft");
    }
  });
});
