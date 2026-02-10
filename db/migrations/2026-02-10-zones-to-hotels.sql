-- Migration: Zones → Hotels
-- Adds hotel-specific columns to ma_transfer_zones
-- Adds commission columns to ma_transfer_prices

-- 1. New hotel fields on ma_transfer_zones
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS municipality VARCHAR(255) DEFAULT '';
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS address VARCHAR(500) DEFAULT '';
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS phone VARCHAR(50) DEFAULT '';
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS email VARCHAR(255) DEFAULT '';
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS accommodation_type VARCHAR(30) DEFAULT 'hotel'
  CHECK (accommodation_type IN ('hotel', 'rental_rooms'));

-- 2. Commission fields on ma_transfer_prices  (sum must ≤ price — enforced in app)
ALTER TABLE ma_transfer_prices ADD COLUMN IF NOT EXISTS commission_driver DECIMAL(10,2) DEFAULT 0;
ALTER TABLE ma_transfer_prices ADD COLUMN IF NOT EXISTS commission_hotel  DECIMAL(10,2) DEFAULT 0;
ALTER TABLE ma_transfer_prices ADD COLUMN IF NOT EXISTS commission_service DECIMAL(10,2) DEFAULT 0;
