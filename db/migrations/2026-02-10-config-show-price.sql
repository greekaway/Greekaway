-- Migration: Add show_price_in_message column to ma_config
-- Date: 2026-02-10
-- Purpose: Allow admin to toggle price visibility in WhatsApp messages

ALTER TABLE ma_config ADD COLUMN IF NOT EXISTS show_price_in_message BOOLEAN DEFAULT true;
