-- Add is_arrival flag to destination categories (reverse flow: pickup from destination → hotel)
ALTER TABLE ma_destination_categories ADD COLUMN IF NOT EXISTS is_arrival BOOLEAN DEFAULT false;

-- Add is_arrival flag to transfer requests so we know the direction
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS is_arrival BOOLEAN DEFAULT false;
