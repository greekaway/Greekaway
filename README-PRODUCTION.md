Production migration checklist (Greekaway)

Overview
This checklist helps you migrate from the local dev setup (SQLite + local server) to a production deployment using PostgreSQL, S3 backups, and HTTPS.

1) Provision managed Postgres

2) Local testing with docker-compose
  docker-compose up -d
  export DATABASE_URL=postgres://postgres:secret@localhost:5432/greekaway
  node tools/migrate_sqlite_to_postgres.js

3) Configure app env

4) Backups

5) Webhooks

6) Deploy

7) Monitoring

8) Improvements

Quick local setup
For quick local testing with Postgres and the app:

1. Copy `.env.example` to `.env` and fill values (do NOT commit `.env`).
2. Start services:

  docker-compose -f docker-compose.app.yml up --build -d

3. Run migration from SQLite (if needed):

  export DATABASE_URL=postgres://postgres:secret@localhost:5432/greekaway
  node tools/migrate_sqlite_to_postgres.js

4. Test webhook locally with Stripe CLI:

  stripe listen --forward-to localhost:3000/webhook

## Admin seed and cleanup (dev/testing)

New admin endpoints (Basic Auth protected via ADMIN_USER/ADMIN_PASS):

- POST /api/admin/seed — Bulk insert seed JSON (transactional). If no body is provided, it loads the default file `data/test-seeds/seed-admin-2025-11-04.json`.
- DELETE /api/admin/cleanup-test-seeds?source=admin_rewire_20251104 — Remove all records inserted by the above (matches `__test_seed=1` or `seed_source`=value) across bookings, payments, manual_payments, partner_agreements.
- POST /api/backup/export — Create a gzipped snapshot of `data/db.sqlite3` and return its path. Monitor backups via GET /admin/backup-status.

Admin Bookings API used by the rewired UI:

- GET /api/bookings?limit=50&page=1&status=&partner_id=&search=&date_from=&date_to= — Returns `{ ok, page, limit, items:[{ id, date, trip_id, trip_title, pax, total_cents, currency, status, partner_id, created_at }] }`.

Partners list for filters:

- GET /api/partners/list — Returns array of `{ id, partner_name, partner_email }`.

Seed file location:

- `data/test-seeds/seed-admin-2025-11-04.json` (contains ~8 partners, ~12 bookings, ~6 payments, ~4 manual_payments; all items include `"__test_seed": true` and `"seed_source": "admin_rewire_20251104"`).



