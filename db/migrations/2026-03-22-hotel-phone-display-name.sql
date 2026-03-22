-- Add display_name to hotel phones so staff are identified by name, not just phone number
ALTER TABLE ma_hotel_phones ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT NULL;
