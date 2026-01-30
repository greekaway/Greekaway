-- Migration: Add structured info page sections to ma_config
-- Date: 2026-01-30
-- Description: Expands simple title+content to multiple sections for:
--   - General transfers info (keeps existing infoPageTitle/Content)
--   - Cancellation policy
--   - Compliance policy (rules for passengers)
--   - FAQ section
-- All readable by AI assistant and customers

-- Cancellation Policy Section
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_cancellation_title VARCHAR(255);
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_cancellation_content TEXT;

-- Compliance Policy Section (passenger rules)
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_compliance_title VARCHAR(255);
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_compliance_content TEXT;

-- FAQ Section
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_faq_title VARCHAR(255);
ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS info_faq_content TEXT;
