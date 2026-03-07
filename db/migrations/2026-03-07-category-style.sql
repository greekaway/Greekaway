-- Category style (global tile appearance settings)
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS category_style JSONB DEFAULT NULL;
