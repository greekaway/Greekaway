-- Add notes column to ma_transfer_requests
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
