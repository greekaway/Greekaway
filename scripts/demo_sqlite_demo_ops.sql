-- Greekaway: SQLite demo/test bookings ops
-- SAFETY: Review before running DELETEs. Start with SELECT/COUNT.

-- 1) Detect likely demo/test bookings (SQLite)
-- Heuristics: __test_seed flag, seed_source, demo/example emails, demo/test in name or metadata
SELECT id,
       user_name,
       user_email,
       trip_id,
       date,
       status,
       "__test_seed" AS is_test_seed,
       seed_source
FROM bookings
WHERE COALESCE("__test_seed", 0) = 1
   OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
   OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
   OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
   OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
ORDER BY created_at DESC
LIMIT 500;

-- Optional: COUNT only
SELECT COUNT(1) AS demo_count
FROM bookings
WHERE COALESCE("__test_seed", 0) = 1
   OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
   OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
   OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
   OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%';

-- 2) Preview assigned demo bookings (driver assignments present)
SELECT id, user_name, user_email, date, assigned_driver_id, route_id
FROM bookings
WHERE assigned_driver_id IS NOT NULL
  AND (
    COALESCE("__test_seed", 0) = 1
    OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
    OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
    OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
    OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
  )
ORDER BY date DESC, created_at DESC
LIMIT 200;

-- 3) CLEANUP (Danger zone) — Run after backup only
-- 3a) Optionally drop driver assignments from targeted demo bookings (non-destructive)
UPDATE bookings
SET assigned_driver_id = NULL,
    route_id = NULL
WHERE (
  COALESCE("__test_seed", 0) = 1
  OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
  OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
  OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
  OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
);

-- 3b) Delete related dispatch logs (if any)
DELETE FROM dispatch_log
WHERE booking_id IN (
  SELECT id FROM bookings WHERE (
    COALESCE("__test_seed", 0) = 1
    OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
    OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
    OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
    OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
  )
);

-- 3c) Delete demo bookings themselves
DELETE FROM bookings
WHERE (
  COALESCE("__test_seed", 0) = 1
  OR LOWER(COALESCE(user_email,'')) LIKE '%@example.com%'
  OR LOWER(COALESCE(user_email,'')) LIKE '%demo%'
  OR LOWER(COALESCE(user_name,'')) LIKE '%demo%'
  OR LOWER(COALESCE(seed_source,'')) LIKE '%demo%'
);

-- 4) Manual assignment helper: assign a driver by driver email
-- Replace :driver_email and :booking_id placeholders when executing interactively.
-- Example usage:
--   SELECT id FROM drivers WHERE email = 'driver@example.com' LIMIT 1;
--   UPDATE bookings SET assigned_driver_id = '<DRIVER_ID>', route_id = COALESCE(route_id, 'manual') WHERE id = '<NEW_BOOKING_ID>';
