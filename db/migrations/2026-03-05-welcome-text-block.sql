-- Add welcome_text_block column to ma_config
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS welcome_text_block TEXT DEFAULT '';
