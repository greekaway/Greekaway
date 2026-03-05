-- Add hero_video_enabled and flight config columns to ma_config
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS hero_video_enabled BOOLEAN DEFAULT true;
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS flight_tracking_enabled BOOLEAN DEFAULT true;
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS flight_check_mins_before INTEGER DEFAULT 25;
