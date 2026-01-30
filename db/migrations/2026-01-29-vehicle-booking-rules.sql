-- MoveAthens Vehicle Booking Rules
-- Adds allow_instant and min_advance_minutes to ma_vehicle_types
-- allow_instant: true = can book immediately (taxi), false = must schedule ahead (black cars)
-- min_advance_minutes: minimum minutes before pickup (0 for taxi, 120 for black cars)

-- @dialect: postgres
BEGIN;
DO $$
BEGIN
  BEGIN
    ALTER TABLE ma_vehicle_types ADD COLUMN allow_instant BOOLEAN DEFAULT true;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
  BEGIN
    ALTER TABLE ma_vehicle_types ADD COLUMN min_advance_minutes INTEGER DEFAULT 0;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- NOTE: Do NOT update existing values here!
-- Vehicle booking rules are managed via admin panel.
-- Default values (allow_instant=true, min_advance_minutes=0) apply only to NEW vehicles.

COMMIT;
