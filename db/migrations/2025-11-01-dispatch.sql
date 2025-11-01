-- Dispatch + Provider Panel migration
-- This file contains both SQLite and Postgres DDL. The runner will pick the right section.

-- @dialect: sqlite
BEGIN TRANSACTION;
-- partners: add columns if missing
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT
);
-- Add new columns (ignore errors if they already exist)
-- SQLite ALTER TABLE ADD COLUMN is idempotent when wrapped in try blocks by runner; here we include plain statements.
ALTER TABLE partners ADD COLUMN password_hash TEXT;
ALTER TABLE partners ADD COLUMN panel_enabled INTEGER DEFAULT 0;
ALTER TABLE partners ADD COLUMN last_seen TEXT;

-- dispatch_log table
CREATE TABLE IF NOT EXISTS dispatch_log (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  sent_at TEXT NULL,
  sent_by TEXT,
  status TEXT NOT NULL,
  response_text TEXT NULL,
  payload_json TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dispatch_book_partner ON dispatch_log(booking_id, partner_id);
-- Partial unique index for idempotency (only for successful sends)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_success ON dispatch_log(booking_id, partner_id) WHERE status = 'success';
COMMIT;

-- @dialect: postgres
BEGIN;
-- partners: add columns if missing
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT
);
DO $$
BEGIN
  BEGIN
    ALTER TABLE partners ADD COLUMN password_hash TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE partners ADD COLUMN panel_enabled BOOLEAN DEFAULT FALSE;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE partners ADD COLUMN last_seen TIMESTAMP NULL;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- dispatch_log table
CREATE TABLE IF NOT EXISTS dispatch_log (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  sent_at TIMESTAMP NULL,
  sent_by TEXT,
  status TEXT NOT NULL,
  response_text TEXT NULL,
  payload_json TEXT NOT NULL,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_book_partner ON dispatch_log(booking_id, partner_id);
-- Partial unique index for idempotency (only for successful sends)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_dispatch_success ON dispatch_log(booking_id, partner_id) WHERE status = 'success';
COMMIT;
