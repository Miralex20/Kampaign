/**
 * Shared Zod schemas for campaign validation.
 *
 * Key rules enforced here (and re-enforced in API handlers):
 * - managed_send: subject, email_html, email_text required
 * - link_per_recipient / link_universal: email fields forbidden
 * - campaign_mode immutable after first launch (enforced in API, not schema)
 */
import { z } from "zod";

export const CAMPAIGN_MODES = ["managed_send", "link_per_recipient", "link_universal"] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "launching",
  "live",
  "paused",
  "completed",
  "cancelled",
] as const;

// ---------------------------------------------------------------------------
// Create campaign schema
// ---------------------------------------------------------------------------

const BaseCreateSchema = z.object({
  name: z.string().min(1).max(200),
  campaign_mode: z.enum(CAMPAIGN_MODES),
  page_html: z.string().min(1, "page_html is required for all campaign modes"),
  scheduled_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  require_otp: z.boolean().default(false),
});

const ManagedSendCreateSchema = BaseCreateSchema.extend({
  campaign_mode: z.literal("managed_send"),
  subject: z.string().min(1, "subject is required for managed_send campaigns"),
  preheader: z.string().optional(),
  email_html: z.string().min(1, "email_html is required for managed_send campaigns"),
  email_text: z.string().min(1, "email_text is required for managed_send campaigns"),
});

const LinkOnlyCreateSchema = BaseCreateSchema.extend({
  campaign_mode: z.enum(["link_per_recipient", "link_universal"] as const),
  // Email fields must NOT be present for link modes
  subject: z.undefined().optional(),
  email_html: z.undefined().optional(),
  email_text: z.undefined().optional(),
  preheader: z.undefined().optional(),
});

export const CreateCampaignSchema = z.discriminatedUnion("campaign_mode", [
  ManagedSendCreateSchema,
  // link_per_recipient and link_universal share the same schema shape
  LinkOnlyCreateSchema.extend({ campaign_mode: z.literal("link_per_recipient") }),
  LinkOnlyCreateSchema.extend({ campaign_mode: z.literal("link_universal") }),
]);

// ---------------------------------------------------------------------------
// Update campaign schema (all fields optional except no mode change allowed)
// ---------------------------------------------------------------------------

export const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).optional(),
  preheader: z.string().optional(),
  email_html: z.string().optional(),
  email_text: z.string().optional(),
  page_html: z.string().min(1).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  require_otp: z.boolean().optional(),
  // campaign_mode explicitly excluded — use 409 guard in handler
});

// ---------------------------------------------------------------------------
// List campaigns query params
// ---------------------------------------------------------------------------

export const ListCampaignsSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  mode: z.enum(CAMPAIGN_MODES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
