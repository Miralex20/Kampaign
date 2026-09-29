-- Run once when the Postgres container is first created.
-- Creates the listmonk database and enables the citext extension.

CREATE DATABASE listmonk_db;
CREATE DATABASE campaign_test_db;

\connect campaign_db;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

\connect campaign_test_db;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
