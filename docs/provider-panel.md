# Provider Panel (MVP)

Mobile-first UI and API for partners/providers to view and act on assigned bookings. Includes light/dark theme, modular footer navigation, and JWT auth. Built with minimal changes to `server.js` (mount-only), with logic in new files.

## Features

- Clean URLs: `/provider/login`, `/provider/dashboard`, `/provider/bookings`, `/provider/payments`, `/provider/profile`
- Auth: POST `/provider/auth/login` → returns `{ ok, token }` (JWT)
- Provider API under `/provider/api/*`:
  - `GET /provider/api/bookings` → list (includes dispatch status)
  - `GET /provider/api/bookings/:id` → detail
  - `POST /provider/api/bookings/:id/action` → `{ action: accept|decline|picked|completed }`
- Modular footer partials per page with a single stylesheet: `public/provider/provider-footer.css`
- Light/dark theme via system default + user toggle (persisted in `localStorage`)

## Env flags

- `JWT_SECRET` — HMAC secret for provider JWT tokens (default: `dev-secret` for local)
- `DISPATCH_ENABLED` — when `true`/`1`, send provider dispatch emails via Nodemailer; when false, queue logs only
- `BASE_URL` — optional; included in dispatch email for quick Admin link
- `DEV_LOCAL_IP` — optional; allow CORS from `http://<DEV_LOCAL_IP>:3000` for mobile testing on LAN
- Mail (only if `DISPATCH_ENABLED=true`):
  - `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`

## Seeding for local dev

A test provider and 3 confirmed bookings can be seeded:

- Provider: id `999`, email `driver@example.com`, password `TestPass123`
- Bookings: Santorini Tour, Delphi Day Trip, Meteora Adventure (next 3 days)

Run:

- `node tools/seed_provider_test_bookings.js`

## Admin add-on

- Dispatch endpoints: mounted under `/partner-dispatch/*` (status, resend)
- Booking auto-dispatch on confirmation is triggered in `webhook.js` via `services/dispatchService`
- Logs in `dispatch_log` with idempotency guard and retries

## Notes

- Keep `server.js` changes minimal: mount `/provider` and `/partner-dispatch` routers only
- SQLite and Postgres supported; migrations in `db/migrations/2025-11-01-dispatch.sql`, runner in `tools/run_dispatch_migration.js`
- Footer UI is controlled exclusively by `public/provider/provider-footer.css`; page-level files include the footer partial into `#footer-placeholder`
