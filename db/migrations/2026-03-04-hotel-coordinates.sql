-- Add lat/lng coordinates to hotels (transfer zones) for Google Maps links
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE ma_transfer_zones ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION DEFAULT NULL;
