-- Add flight_number column to ma_transfer_requests (for arrival bookings)
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_number VARCHAR(50) DEFAULT '';
