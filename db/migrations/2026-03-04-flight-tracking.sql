-- Flight tracking columns for AeroAPI (FlightAware) integration
-- Stores live flight data for arrival transfer requests

ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_status VARCHAR(30) DEFAULT '';
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_airline VARCHAR(100) DEFAULT '';
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_origin VARCHAR(200) DEFAULT '';
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_eta TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_actual_arrival TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_gate VARCHAR(20) DEFAULT '';
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_terminal VARCHAR(20) DEFAULT '';
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_tracking_active BOOLEAN DEFAULT false;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_last_checked TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_raw_json JSONB;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_departure TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS flight_poller_done BOOLEAN DEFAULT false;

-- Index for background poller: finds arrivals needing a 2nd flight check
CREATE INDEX IF NOT EXISTS idx_ma_requests_flight_tracking
  ON ma_transfer_requests(flight_tracking_active, flight_eta)
  WHERE flight_tracking_active = true AND status NOT IN ('expired','cancelled','completed');
