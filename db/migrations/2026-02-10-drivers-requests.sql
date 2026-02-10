-- =========================================================
-- Transfer Requests + Drivers (MoveAthens)
-- 2026-02-10
-- =========================================================

-- Drivers table (profile per phone number)
CREATE TABLE IF NOT EXISTS ma_drivers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL UNIQUE,
    notes TEXT DEFAULT '',
    total_trips INTEGER DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    total_owed DECIMAL(12, 2) DEFAULT 0,          -- cumulative service commission
    total_paid DECIMAL(12, 2) DEFAULT 0,           -- cumulative payments received
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_drivers_phone ON ma_drivers(phone);

-- Transfer requests table (one row per hotel WhatsApp request)
CREATE TABLE IF NOT EXISTS ma_transfer_requests (
    id VARCHAR(50) PRIMARY KEY,
    -- Hotel / origin info
    origin_zone_id VARCHAR(50),
    origin_zone_name VARCHAR(200) DEFAULT '',
    hotel_name VARCHAR(200) DEFAULT '',
    hotel_address VARCHAR(300) DEFAULT '',
    -- Destination
    destination_id VARCHAR(50),
    destination_name VARCHAR(200) DEFAULT '',
    -- Vehicle
    vehicle_type_id VARCHAR(50),
    vehicle_name VARCHAR(200) DEFAULT '',
    -- Booking details
    tariff VARCHAR(20) DEFAULT 'day',
    booking_type VARCHAR(20) DEFAULT 'instant',
    scheduled_date VARCHAR(20) DEFAULT '',
    scheduled_time VARCHAR(10) DEFAULT '',
    passenger_name VARCHAR(200) DEFAULT '',
    passengers INTEGER DEFAULT 0,
    luggage_large INTEGER DEFAULT 0,
    luggage_medium INTEGER DEFAULT 0,
    luggage_cabin INTEGER DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash',
    -- Financial
    price DECIMAL(10, 2) DEFAULT 0,
    commission_driver DECIMAL(10, 2) DEFAULT 0,
    commission_hotel DECIMAL(10, 2) DEFAULT 0,
    commission_service DECIMAL(10, 2) DEFAULT 0,
    -- Driver assignment
    driver_id VARCHAR(50) REFERENCES ma_drivers(id) ON DELETE SET NULL,
    driver_phone VARCHAR(50) DEFAULT '',
    accept_token VARCHAR(100) UNIQUE,
    -- Status: pending → sent → accepted → confirmed → cancelled | expired
    status VARCHAR(30) DEFAULT 'pending',
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_requests_status ON ma_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_ma_requests_driver ON ma_transfer_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_ma_requests_token ON ma_transfer_requests(accept_token);
CREATE INDEX IF NOT EXISTS idx_ma_requests_created ON ma_transfer_requests(created_at);

-- Driver payments table (track each payment admin records)
CREATE TABLE IF NOT EXISTS ma_driver_payments (
    id VARCHAR(50) PRIMARY KEY,
    driver_id VARCHAR(50) NOT NULL REFERENCES ma_drivers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_payments_driver ON ma_driver_payments(driver_id);

-- Trigger for updated_at on ma_drivers
DROP TRIGGER IF EXISTS trig_ma_drivers_updated ON ma_drivers;
CREATE TRIGGER trig_ma_drivers_updated
    BEFORE UPDATE ON ma_drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for updated_at on ma_transfer_requests
DROP TRIGGER IF EXISTS trig_ma_requests_updated ON ma_transfer_requests;
CREATE TRIGGER trig_ma_requests_updated
    BEFORE UPDATE ON ma_transfer_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
