-- Migration: Add "About Us" company details to ma_config
-- Date: 2026-03-07
-- Description: Structured company info fields for the info page "About Us" tab.
--   Editable from the admin panel → Πληροφορίες tab.

ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_company_name VARCHAR(255) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_afm VARCHAR(50) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_doy VARCHAR(255) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_activity VARCHAR(500) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_address TEXT DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_manager VARCHAR(255) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_phone VARCHAR(50) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_email VARCHAR(255) DEFAULT '';
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS about_us_website VARCHAR(512) DEFAULT '';
