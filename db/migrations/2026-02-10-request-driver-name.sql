-- Add driver_name column to ma_transfer_requests
-- This column stores the driver's display name when they accept a trip.
-- Without it, the UPDATE fails in PostgreSQL and status never changes to 'accepted'.
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS driver_name VARCHAR(200) DEFAULT '';
