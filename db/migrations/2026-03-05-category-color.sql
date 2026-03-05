-- Add color field to destination categories for app-icon style display
ALTER TABLE ma_destination_categories ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#1a73e8';
