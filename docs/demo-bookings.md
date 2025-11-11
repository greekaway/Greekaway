# Demo & Test Bookings Playbook

Deprecated: Demo/test helper scripts (e.g., `tools/demo_workflow.sh`, seeders) were removed to keep the repository production-clean. You can still manage data safely using the Admin APIs and the purge utility. The commands referring to removed scripts below are retained for historical context but are no longer available out of the box.

## 1. Backup (ΠΡΩΤΑ ΑΠΟΛΥΤΑ)

SQLite (local dev):

Optional local backup example (SQLite):

```
cp data/db.sqlite3 ~/greekaway_backups/db.sqlite3.$(date +%Y%m%d%H%M%S)
```

PostgreSQL (production/staging):

```
pg_dump -h <DB_HOST> -U <DB_USER> -Fc <DB_NAME> -f /tmp/greekaway_backup_$(date +%F).dump
```

## 2. Locate likely demo/test bookings

Heuristics supported in code & scripts:
* `is_demo = 1` (new column; auto-added & auto-set for obvious demo patterns)
* `"__test_seed" = 1` (seeded via `/api/admin/seed`)
* `seed_source LIKE '%demo%'`
* `user_email` containing `@example.com` or `demo`
* `user_name` containing `demo`

SQL helper file: `scripts/demo_sqlite_demo_ops.sql` (first SELECT + COUNT).

Quick shell (top 10):

```
sqlite3 data/db.sqlite3 "SELECT id,user_email,is_demo,seed_source FROM bookings WHERE COALESCE(is_demo,0)=1 OR COALESCE('__test_seed',0)=1 OR LOWER(user_email) LIKE '%demo%' OR LOWER(user_email) LIKE '%@example.com%' ORDER BY created_at DESC LIMIT 10;"
```

## 3. Deletion / Cleanup (μετά το backup)

Options:
1. Purge script (local, recommended):
  ```
  node scripts/purge_demo_test_data.js --apply
  ```
  - Removes demo/test bookings & related rows (heuristics above).

2. Admin API endpoint (basic auth required):
   * Dry run:
     ```
     curl -u admin:pass 'http://127.0.0.1:3000/api/admin/cleanup-demo?dry_run=1'
     ```
   * Execute:
     ```
     curl -u admin:pass -X DELETE 'http://127.0.0.1:3000/api/admin/cleanup-demo?confirm=1'
     ```

3. Manual SQL: use `scripts/demo_sqlite_demo_ops.sql` sections 3a–3c (edit FIRST to ensure scope is correct).

ALWAYS run a `SELECT COUNT(*)` before the `DELETE` to confirm impact.

## 4. Create 1 fake booking

Two recommended paths:

### A. Via Admin/API (auto-marked test if you pass flags)

Use existing admin endpoints or a short node script under `scripts/` to create a booking and set flags like `"__test_seed"=1` and `seed_source` accordingly.

### B. Public booking API (if you need to simulate real flow)

```
curl -X POST http://127.0.0.1:3000/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{
    "user_name": "Demo Test",
    "user_email": "demo+1@example.com",
    "trip_id": "lefkas",
    "date": "2025-11-20",
    "seats": 3,
    "metadata": { "stops": [ {"name":"Παραλαβή 1","address":"Lefkada Port"} ], "pickup_time":"07:10", "is_demo": true }
  }'
```

The server auto-detects demo patterns and sets `is_demo=1` plus a `source` value (`demo` if not provided) when possible.

## 5. Manual driver assignment

Find driver id:

```
sqlite3 data/db.sqlite3 "SELECT id,name,email FROM drivers WHERE email='driver@example.com' LIMIT 1;"
```

Assign (replace IDs):

```
sqlite3 data/db.sqlite3 "UPDATE bookings SET assigned_driver_id='DRIVER_ID', route_id=COALESCE(route_id,'manual') WHERE id='BOOKING_ID';"
```

Driver panel → login → new booking appears if `assigned_driver_id` matches.

## 6. Notification (T-24h) check

`services/pickupNotifications.js` runs every 5 minutes (and once on boot) if `PICKUP_NOTIFY_ENABLED=1` (default). It freezes pickup order & logs console notifications.

To force an early run: restart server shortly before the 24h threshold or temporarily set booking date/time ~25 minutes ahead.

## 7. Heuristic pickup vs stop

Add stops in `metadata.stops` with names starting with `Παραλαβή` (Greek) or `Pickup` for clearer classification. Current code does not yet auto-classify beyond what you insert—consider a future enhancement (regex pass before persisting) if needed.

## 8. Cleanup after demo cycle

Use the purge script or targeted removal:

```
sqlite3 data/db.sqlite3 "DELETE FROM bookings WHERE id='BOOKING_ID';"
```

## 9. Schema additions

The helper migration logic now ensures these columns (if missing):
* `is_demo INTEGER DEFAULT 0`
* `source TEXT`

They are safe no-op additions for existing rows.

## 10. Checklist (Γρήγορος έλεγχος)

1. Demo booking visible in admin list?
2. Manual assignment sets `assigned_driver_id`?
3. Appears in Driver panel bookings list?
4. Map links / pickup points render?
5. T-24h notifications (console/email) produced when within window?
6. Pickup times realistic (±5′) and consistent across views?
7. Completion flow logs updates (status -> completed / canceled)?

## 11. Notes / Recommendations

* Prefer seeding for ephemeral test data → simplifies cleanup.
* Use unique `seed_source` per test batch.
* For Postgres translate `LOWER(x) LIKE` to `ILIKE`.
* After large cleanup, consider vacuuming (SQLite):
  ```
  sqlite3 data/db.sqlite3 'VACUUM;'
  ```

---
Last updated: 2025-11-11 (deprecated demo helpers)
