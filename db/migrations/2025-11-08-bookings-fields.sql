-- Bookings table: add explicit pickup/suitcase/notes columns
-- This file contains both SQLite and Postgres DDL. The runner will pick the right section.

-- @dialect: sqlite
BEGIN TRANSACTION;
-- Add new columns to bookings (ignore errors if already exist)
ALTER TABLE bookings ADD COLUMN pickup_location TEXT DEFAULT '';
ALTER TABLE bookings ADD COLUMN pickup_lat REAL NULL;
ALTER TABLE bookings ADD COLUMN pickup_lng REAL NULL;
ALTER TABLE bookings ADD COLUMN suitcases_json TEXT DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN special_requests TEXT DEFAULT '';
COMMIT;

-- @dialect: postgres
BEGIN;
DO $$
BEGIN
  BEGIN
    ALTER TABLE bookings ADD COLUMN pickup_location TEXT DEFAULT '';
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE bookings ADD COLUMN pickup_lat DOUBLE PRECISION NULL;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE bookings ADD COLUMN pickup_lng DOUBLE PRECISION NULL;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE bookings ADD COLUMN suitcases_json TEXT DEFAULT '[]';
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE bookings ADD COLUMN special_requests TEXT DEFAULT '';
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;
COMMIT;
