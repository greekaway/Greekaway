-- Migration: Add route_type to ma_destinations
-- Values: airport, port, city, travel
-- Used internally for hotel revenue analytics (not visible on public site)

ALTER TABLE ma_destinations
  ADD COLUMN IF NOT EXISTS route_type VARCHAR(20) DEFAULT NULL;

COMMENT ON COLUMN ma_destinations.route_type IS 'Internal classification: airport | port | city | travel';
