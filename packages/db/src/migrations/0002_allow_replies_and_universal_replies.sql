-- Migration 0002: Add allow_replies to campaigns and support universal campaign replies

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS allow_replies boolean NOT NULL DEFAULT true;

ALTER TABLE replies
  ALTER COLUMN message_id DROP NOT NULL;

ALTER TABLE replies
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS author_email text;

CREATE INDEX IF NOT EXISTS replies_campaign_id_idx ON replies(campaign_id);
CREATE INDEX IF NOT EXISTS replies_message_id_idx ON replies(message_id);
