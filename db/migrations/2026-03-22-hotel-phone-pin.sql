-- Add optional PIN (hashed) to hotel phones for security
ALTER TABLE ma_hotel_phones ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) DEFAULT NULL;
