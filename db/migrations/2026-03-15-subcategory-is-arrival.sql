-- Add is_arrival column to ma_destination_subcategories (2026-03-15)
-- Enables reverse flow (pickup from destination → hotel) at subcategory level
ALTER TABLE ma_destination_subcategories ADD COLUMN IF NOT EXISTS is_arrival BOOLEAN DEFAULT false;
