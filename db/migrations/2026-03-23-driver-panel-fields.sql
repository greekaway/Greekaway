-- Driver Panel: new fields on ma_drivers + push subscriptions table

-- New columns for driver panel matching & auth
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS vehicle_types TEXT DEFAULT '[]';
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS current_vehicle_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) DEFAULT NULL;
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT NULL;

-- Push notification subscriptions per driver
CREATE TABLE IF NOT EXISTS ma_driver_push_subscriptions (
    id SERIAL PRIMARY KEY,
    driver_id VARCHAR(50) NOT NULL REFERENCES ma_drivers(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    keys TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_driver_push_driver ON ma_driver_push_subscriptions(driver_id);
