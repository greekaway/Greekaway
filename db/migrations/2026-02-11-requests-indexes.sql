-- MoveAthens: add composite index for auto-expire + hotel_name index
-- The auto-expire timer queries pending requests older than 1 hour.
-- A composite index on (status, created_at) speeds this up significantly.

CREATE INDEX IF NOT EXISTS idx_ma_requests_status_created
  ON ma_transfer_requests (status, created_at);

CREATE INDEX IF NOT EXISTS idx_ma_requests_hotel_name
  ON ma_transfer_requests (hotel_name);
