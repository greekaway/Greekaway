-- Add icon_color column to destination categories (per-category icon color: white or black)
ALTER TABLE ma_destination_categories ADD COLUMN IF NOT EXISTS icon_color VARCHAR(10) DEFAULT 'white';
-- Also add color column if missing (older schemas may not have it)
ALTER TABLE ma_destination_categories ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#1a73e8';
