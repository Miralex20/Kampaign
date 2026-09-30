-- Migration 0003: Add invitations table and user RBAC capabilities

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash bytea NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invitations_org_id_email_status_uidx ON invitations(org_id, email, status);
CREATE INDEX IF NOT EXISTS invitations_token_hash_idx ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS invitations_org_id_status_idx ON invitations(org_id, status);
