-- Add channel column to track how the request was submitted (whatsapp or email)
ALTER TABLE ma_transfer_requests
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'whatsapp';
