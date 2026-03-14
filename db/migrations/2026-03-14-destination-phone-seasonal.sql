-- Add phone and seasonality columns to ma_destinations (2026-03-14)
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS seasonal_open VARCHAR(10) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS seasonal_close VARCHAR(10) DEFAULT '';
