/**
 * Drizzle ORM schema — mirrors the SQL spec in AGENT_PLAN.md section 6 exactly.
 *
 * Tables:
 *   auth_*        — Auth.js v5 session management (separate from app tables)
 *   organizations — Multi-tenant orgs
 *   users         — App users (one per org in v1)
 *   campaigns     — Campaign definitions (three modes)
 *   recipients    — Per-org recipient list
 *   messages      — One per (campaign, recipient), created at launch
 *   events        — Immutable audit log
 *   replies       — Landing page reply submissions
 *   suppressions  — Per-org suppression list
 *   otp_codes     — Landing page OTP gate codes
 *
 * Rules:
 * - Column names match the SQL spec verbatim.
 * - All UUIDs use gen_random_uuid() as default.
 * - No business logic here — pure schema definition.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  bigserial,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Custom types
// ---------------------------------------------------------------------------

/** citext — case-insensitive text (requires the citext extension in Postgres) */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

/** bytea — raw binary data (used for token hashes and OTP code hashes) */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Auth.js v5 tables (separate from app user/session tables)
// ---------------------------------------------------------------------------

export const auth_users = pgTable("auth_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  email_verified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
});

export const auth_sessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_token: text("session_token").notNull().unique(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => auth_users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const auth_accounts = pgTable(
  "auth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => auth_users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    provider_account_id: text("provider_account_id").notNull(),
    access_token: text("access_token"),
    refresh_token: text("refresh_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [uniqueIndex("auth_accounts_provider_uidx").on(t.provider, t.provider_account_id)],
);

export const auth_verification_tokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("auth_vt_identifier_token_uidx").on(t.identifier, t.token)],
);

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sending_domain: text("sending_domain"),
  domain_verified_at: timestamp("domain_verified_at", { withTimezone: true }),
  plan: text("plan").notNull().default("trial"),
  daily_cap: integer("daily_cap").notNull().default(500),
  review_state: text("review_state").notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  password_hash: text("password_hash"),
  role: text("role").notNull().default("owner"),
  permissions: jsonb("permissions").notNull().default({}),
  status: text("status").notNull().default("active"),
  invited_by: uuid("invited_by"),
  last_active_at: timestamp("last_active_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Campaign modes (immutable after first launch):
 *   managed_send       — Mode A: platform sends email via listmonk
 *   link_per_recipient — Mode B: per-recipient CSV export, sender's own mailer
 *   link_universal     — Mode C: single shared link, no recipient list
 */
export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  org_id: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),

  // Immutable after first launch — enforced in API layer
  campaign_mode: text("campaign_mode").notNull().default("managed_send"),

  // Email fields: required for managed_send; null/forbidden for link_* modes
  subject: text("subject"),
  preheader: text("preheader"),
  email_html: text("email_html"),
  email_text: text("email_text"),

  // Page content: required for all modes
  page_html: text("page_html").notNull(),

  status: text("status").notNull().default("draft"),

  // Mode B fields: populated after launch
  link_export_url: text("link_export_url"),
  link_export_generated_at: timestamp("link_export_generated_at", { withTimezone: true }),

  // Mode C fields: the single shared campaign-level token
  // SHA-256 of shared raw token; null for modes A/B
  universal_token_hash: bytea("universal_token_hash").unique(),
  // Aggregate counter — no per-person rows for Mode C
  universal_view_count: integer("universal_view_count").notNull().default(0),

  scheduled_at: timestamp("scheduled_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  require_otp: boolean("require_otp").notNull().default(false),
  allow_replies: boolean("allow_replies").notNull().default(true),
  created_by: uuid("created_by")
    .notNull()
    .references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaign_page_versions = pgTable("campaign_page_versions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  campaign_id: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  page_html: text("page_html").notNull(),
  edited_by: uuid("edited_by")
    .notNull()
    .references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipients = pgTable(
  "recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    first_name: text("first_name"),
    fields: jsonb("fields").notNull().default({}),
    consent_status: text("consent_status").notNull(),
    consent_at: timestamp("consent_at", { withTimezone: true }).notNull(),
    consent_source: text("consent_source").notNull(),
    listmonk_subscriber_id: integer("listmonk_subscriber_id"),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("recipients_org_id_email_uidx").on(t.org_id, t.email)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaign_id: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    recipient_id: uuid("recipient_id")
      .notNull()
      .references(() => recipients.id),
    token_hash: bytea("token_hash").notNull().unique(),
    status: text("status").notNull().default("pending"),
    listmonk_message_id: text("listmonk_message_id"),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    delivered_at: timestamp("delivered_at", { withTimezone: true }),
    first_viewed_at: timestamp("first_viewed_at", { withTimezone: true }),
    view_count: integer("view_count").notNull().default(0),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    dispatch_attempts: integer("dispatch_attempts").notNull().default(0),
  },
  (t) => [
    uniqueIndex("messages_campaign_id_recipient_id_uidx").on(t.campaign_id, t.recipient_id),
    index("messages_token_hash_idx").on(t.token_hash),
    index("messages_campaign_id_status_idx").on(t.campaign_id, t.status),
  ],
);

export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    message_id: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    type: text("type").notNull(),
    meta: jsonb("meta"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_message_id_type_idx").on(t.message_id, t.type)],
);

export const replies = pgTable(
  "replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    message_id: uuid("message_id").references(() => messages.id),
    campaign_id: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    author_name: text("author_name"),
    author_email: text("author_email"),
    body: text("body").notNull(),
    ip_hash: text("ip_hash"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("replies_campaign_id_idx").on(t.campaign_id),
    index("replies_message_id_idx").on(t.message_id),
  ],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    reason: text("reason").notNull(),
    bounce_type: text("bounce_type"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suppressions_org_id_email_uidx").on(t.org_id, t.email)],
);

export const otp_codes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  message_id: uuid("message_id")
    .notNull()
    .references(() => messages.id)
    .unique(),
  code_hash: bytea("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  locked_until: timestamp("locked_until", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    role: text("role").notNull().default("editor"),
    permissions: jsonb("permissions").notNull().default({}),
    token_hash: bytea("token_hash").notNull().unique(),
    invited_by: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("pending"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_org_id_email_status_uidx").on(t.org_id, t.email, t.status),
    index("invitations_token_hash_idx").on(t.token_hash),
    index("invitations_org_id_status_idx").on(t.org_id, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Type exports (inferred from schema)
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

/** Valid campaign mode discriminator values */
export type CampaignMode = "managed_send" | "link_per_recipient" | "link_universal";

export type CampaignPageVersion = typeof campaign_page_versions.$inferSelect;

export type Recipient = typeof recipients.$inferSelect;
export type NewRecipient = typeof recipients.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Reply = typeof replies.$inferSelect;
export type Suppression = typeof suppressions.$inferSelect;
export type OtpCode = typeof otp_codes.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;

// Auth.js types
export type AuthUser = typeof auth_users.$inferSelect;
export type AuthSession = typeof auth_sessions.$inferSelect;
export type AuthVerificationToken = typeof auth_verification_tokens.$inferSelect;
