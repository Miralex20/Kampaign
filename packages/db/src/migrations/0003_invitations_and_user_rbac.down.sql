-- Revert migration 0003
DROP TABLE IF EXISTS invitations CASCADE;

ALTER TABLE users
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS invited_by,
  DROP COLUMN IF EXISTS last_active_at;
