-- Add room_number to transfer requests
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS room_number VARCHAR(50) DEFAULT '';

-- Add lat/lng coordinates to destinations (used for driver navigation)
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT NULL;
