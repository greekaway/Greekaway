-- Hotel multi-phone support: each hotel can have multiple phone numbers
-- Each phone acts as a login credential for hotel staff

CREATE TABLE IF NOT EXISTS ma_hotel_phones (
    id VARCHAR(50) PRIMARY KEY,
    zone_id VARCHAR(50) NOT NULL REFERENCES ma_transfer_zones(id) ON DELETE CASCADE,
    phone VARCHAR(50) NOT NULL,
    label VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ma_hotel_phones_phone ON ma_hotel_phones(phone);
CREATE INDEX IF NOT EXISTS idx_ma_hotel_phones_zone ON ma_hotel_phones(zone_id);

-- Add orderer_phone to transfer requests so driver "arrived" message
-- goes to the specific employee who placed the order
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS orderer_phone VARCHAR(50) DEFAULT '';
