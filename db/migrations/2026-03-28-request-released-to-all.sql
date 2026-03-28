-- Add released_to_all flag for scheduled request tier bypass
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS released_to_all BOOLEAN DEFAULT false;
