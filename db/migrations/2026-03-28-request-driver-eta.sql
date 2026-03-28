-- Store driver ETA (minutes + km) when request is accepted
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS driver_eta_minutes INTEGER DEFAULT NULL;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS driver_eta_km DECIMAL(6, 1) DEFAULT NULL;
