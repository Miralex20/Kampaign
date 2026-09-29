-- Rollback migration 0002

DROP INDEX IF EXISTS replies_campaign_id_idx;
DROP INDEX IF EXISTS replies_message_id_idx;

ALTER TABLE replies
  DROP COLUMN IF EXISTS author_email,
  DROP COLUMN IF EXISTS author_name,
  DROP COLUMN IF EXISTS campaign_id;

ALTER TABLE campaigns
  DROP COLUMN IF EXISTS allow_replies;
