-- Add filter lists columns to ma_config (2026-03-14)
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS filter_areas JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS filter_price_ranges JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS filter_vibes JSONB DEFAULT '[]'::jsonb;
