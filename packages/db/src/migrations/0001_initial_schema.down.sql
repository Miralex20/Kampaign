-- ---------------------------------------------------------------------------
-- Rollback migration for 0001_initial_schema
--
-- Drops all application tables in reverse dependency order.
-- Run ONLY if you want to completely reset the schema.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS suppressions CASCADE;
DROP TABLE IF EXISTS replies CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS recipients CASCADE;
DROP TABLE IF EXISTS campaign_page_versions CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Auth.js tables
DROP TABLE IF EXISTS auth_verification_tokens CASCADE;
DROP TABLE IF EXISTS auth_accounts CASCADE;
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS auth_users CASCADE;
