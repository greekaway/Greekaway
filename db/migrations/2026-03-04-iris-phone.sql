-- Add IRIS payment phone to admin config (managed from General settings)
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS iris_phone VARCHAR(50) DEFAULT '';
