-- Broadcast log: tracks which requests were sent to which drivers
CREATE TABLE IF NOT EXISTS ma_broadcast_log (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL,
    driver_phone VARCHAR(50) NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    response VARCHAR(20) DEFAULT 'pending',  -- pending | accepted | expired | missed
    responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_broadcast_log_driver ON ma_broadcast_log(driver_phone);
CREATE INDEX IF NOT EXISTS idx_broadcast_log_request ON ma_broadcast_log(request_id);
