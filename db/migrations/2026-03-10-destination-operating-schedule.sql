-- Add per-day operating schedule column to ma_destinations
-- Stores JSON: {"mon":{"open":"09:00","close":"23:00"},"tue":null,...}
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS operating_schedule TEXT DEFAULT '';
