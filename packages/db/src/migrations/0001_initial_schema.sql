-- ---------------------------------------------------------------------------
-- Migration 0001: initial schema
--
-- Creates all tables, indexes, and constraints for the Campaign Messaging
-- platform. Apply with: pnpm --filter @campaign/db db:migrate
-- Rollback:             see 0001_initial_schema.down.sql
-- ---------------------------------------------------------------------------

-- Enable extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth.js v5 tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_users (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text,
  email           text        NOT NULL UNIQUE,
  email_verified  timestamptz,
  image           text
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token   text        NOT NULL UNIQUE,
  user_id         uuid        NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires         timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid  NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  type                text  NOT NULL,
  provider            text  NOT NULL,
  provider_account_id text  NOT NULL,
  access_token        text,
  refresh_token       text,
  expires_at          integer,
  token_type          text,
  scope               text,
  id_token            text,
  session_state       text,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS auth_verification_tokens (
  identifier  text        NOT NULL,
  token       text        NOT NULL UNIQUE,
  expires     timestamptz NOT NULL,
  UNIQUE (identifier, token)
);

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  sending_domain      text,
  domain_verified_at  timestamptz,
  plan                text        NOT NULL DEFAULT 'trial',
  daily_cap           integer     NOT NULL DEFAULT 500,
  review_state        text        NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  role        text        NOT NULL DEFAULT 'owner',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,

  -- Three campaign modes (immutable after first launch):
  --   managed_send       → Mode A: platform sends email via listmonk, per-recipient tokens
  --   link_per_recipient → Mode B: per-recipient CSV export, sender's own mailer
  --   link_universal     → Mode C: single shared link, no recipient list
  campaign_mode   text        NOT NULL DEFAULT 'managed_send',

  -- Email fields: required for managed_send; null/forbidden for link_* modes
  subject         text,
  preheader       text,
  email_html      text,
  email_text      text,

  -- Page content: required for all modes
  page_html       text        NOT NULL,

  status          text        NOT NULL DEFAULT 'draft',

  -- Mode B fields: populated after launch
  link_export_url             text,
  link_export_generated_at    timestamptz,

  -- Mode C fields: the single shared campaign-level token
  universal_token_hash        bytea UNIQUE,  -- SHA-256 of shared raw token
  universal_view_count        integer NOT NULL DEFAULT 0,

  scheduled_at    timestamptz,
  expires_at      timestamptz,
  require_otp     boolean     NOT NULL DEFAULT false,
  created_by      uuid        NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Check constraints enforced at Zod layer too
ALTER TABLE campaigns ADD CONSTRAINT campaigns_managed_fields_required
  CHECK (
    campaign_mode != 'managed_send' OR
    (subject IS NOT NULL AND email_html IS NOT NULL AND email_text IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- campaign_page_versions (immutable append-only audit log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_page_versions (
  id            bigserial   PRIMARY KEY,
  campaign_id   uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  page_html     text        NOT NULL,
  edited_by     uuid        NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- recipients
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipients (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                   citext      NOT NULL,
  first_name              text,
  fields                  jsonb       NOT NULL DEFAULT '{}',
  consent_status          text        NOT NULL,
  consent_at              timestamptz NOT NULL,
  consent_source          text        NOT NULL,
  listmonk_subscriber_id  integer,
  deleted_at              timestamptz,
  UNIQUE (org_id, email)
);

-- ---------------------------------------------------------------------------
-- messages (one row per campaign × recipient, created at launch time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id        uuid        NOT NULL REFERENCES recipients(id),
  token_hash          bytea       NOT NULL UNIQUE,  -- SHA-256 of raw token; raw never stored
  status              text        NOT NULL DEFAULT 'pending',
  listmonk_message_id text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  first_viewed_at     timestamptz,
  view_count          integer     NOT NULL DEFAULT 0,
  expires_at          timestamptz,
  dispatch_attempts   integer     NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, recipient_id)
);

-- ---------------------------------------------------------------------------
-- events (immutable; never update, only insert)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          bigserial   PRIMARY KEY,
  message_id  uuid        NOT NULL REFERENCES messages(id),
  type        text        NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- replies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS replies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES messages(id),
  body        text        NOT NULL,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- suppressions (per-org; fed by listmonk webhooks + manual)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppressions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       citext      NOT NULL,
  reason      text        NOT NULL,
  bounce_type text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

-- ---------------------------------------------------------------------------
-- otp_codes (for landing page gating)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_codes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid        NOT NULL REFERENCES messages(id) UNIQUE,
  code_hash   bytea       NOT NULL,  -- SHA-256 of 6-digit code
  attempts    integer     NOT NULL DEFAULT 0,
  locked_until timestamptz,
  expires_at  timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_token_hash_idx
  ON messages (token_hash);

CREATE INDEX IF NOT EXISTS messages_campaign_id_status_idx
  ON messages (campaign_id, status);

CREATE INDEX IF NOT EXISTS events_message_id_type_idx
  ON events (message_id, type);

-- Partial index: fast lookup of pending messages for a campaign (daily cap)
CREATE INDEX IF NOT EXISTS messages_campaign_id_pending_idx
  ON messages (campaign_id)
  WHERE status = 'pending';

-- Partial index: Mode C token lookup
CREATE INDEX IF NOT EXISTS campaigns_universal_token_hash_idx
  ON campaigns (universal_token_hash)
  WHERE universal_token_hash IS NOT NULL;
