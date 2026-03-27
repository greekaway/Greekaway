-- Driver Panel: split is_active into is_available + is_blocked + blocked_until
-- is_available = driver toggled (online/offline)
-- is_blocked   = admin lock (prevents login)
-- blocked_until = auto-unblock datetime (NULL = permanent)

ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE ma_drivers ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ DEFAULT NULL;

-- Migrate existing data: is_active → is_available
UPDATE ma_drivers SET is_available = is_active WHERE is_active IS NOT NULL;
