-- Add tier column to ma_drivers (gold/silver system)
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'silver';
