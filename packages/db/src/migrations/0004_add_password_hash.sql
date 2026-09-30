-- Migration 0004: Add password_hash column to users table for credentials auth

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash text;
