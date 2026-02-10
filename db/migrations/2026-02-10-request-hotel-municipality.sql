-- Migration: Add hotel_municipality column to ma_transfer_requests
-- Date: 2026-02-10
-- Purpose: Store hotel municipality for driver card display

ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS hotel_municipality VARCHAR(255) DEFAULT '';
