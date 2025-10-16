# Greekaway Technical Status – v2

Date: 2025-10-16

This document summarizes the current technical and visual progress of the Greekaway project based on a full scan of the repository, pages, data, server, tooling, and tests.

## Overview

- Stack: Node.js (Express), client-side HTML/CSS/JS, SQLite (better-sqlite3) with optional PostgreSQL, Stripe integration, Puppeteer-based smoke tests, minimal Jest tests for booking/payment flows.
- App mode: Static public site with a small server for dynamic booking/payment endpoints and admin APIs.
- Multi-language UI with runtime i18n (EL/EN/FR/DE/HE), RTL support.

## Architecture and Key Modules

- Server (`server.js`):
  - Static file serving (`/public`).
  - Injects Google Maps API key when serving `/trips/trip.html`.
  - Checkout page injection for Stripe publishable key.
  - Bookings API: `POST /api/bookings`, `GET /api/bookings/:id`, `GET /api/availability` (capacity-aware; optional mock on client).
  - Stripe integration: `POST /create-payment-intent` with idempotency; ties to bookings via metadata/payment_intent_id.
  - Admin APIs: payments JSON/SQLite/Postgres; bookings list/CSV; backup-status; booking cancel/refund actions.
  - Health: `/health`.

- Webhook (`webhook.js`):
  - Handles `payment_intent.succeeded`/`payment_intent.payment_failed` events.
  - Persistence layers: PostgreSQL (if `DATABASE_URL`), SQLite (`data/db.sqlite3`), or JSON fallback (`payments.json`).
  - Dedup via `event_id` uniqueness; logs to `webhook.log`.
  - Can confirm related bookings on success (by `metadata.booking_id` or matching `payment_intent_id`).
  - Test-only endpoint: `POST /webhook/test` gated by `ALLOW_TEST_WEBHOOK=true`.

- Frontend (public):
  - Pages: `index.html`, `trips.html`, category pages (`/categories/*`), trip details (`/trips/trip.html`), checkout (`/checkout.html`), admin (`/admin.html`).
  - JS: `main.js` (categories/trips/trip booking flow + Maps route), `overlay-manager.js` (accessibility and overlay control), `i18n.js`, `payment-request.js`.
  - CSS: `style.css` (site & categories), `trip.css` (trip pages), `booking.css` (booking overlay multi-step).
  - Data: `public/data/tripindex.json`, individual trip JSONs (`olympia`, `lefkas`, `parnassos`), categories JSON, images/icons.

- Admin UI (`public/admin.html`):
  - Basic Auth via headers.
  - Payments table with filters, sort, paging, CSV export, Excel copy.
  - Backups status view.
  - Bookings table with CSV export; modal with per-booking actions (cancel/refund) calling server APIs.

- Tooling/Tests:
  - Puppeteer smoke tests and multi-viewport screenshots: `tools/booking_smoke_test*.js`.
  - Jest tests: booking flow, idempotency, SCA/failures.
  - DB migration: `tools/migrate_sqlite_to_postgres.js`.
  - Backup script and S3 upload helper.
  - Deployment docs: `DEPLOY.md`, `DEPLOY_RENDER.md`, `README-PRODUCTION.md`; Nginx/PM2 scripts.

## Visual/UX Status

- Home and footer: fixed, polished mobile-first footer with central CTA; animated welcome logo.
- Categories UI: icon/tile grid with cinematic entrance; gold accents unified.
- Category listings: card/tile styles unified; per-category background preserved.
- Trip page: back button; embedded YouTube video cards; Google Maps route rendering; persistent highlight on arrival.
- Overlays: full-screen booking, AI, profile, payment; accessible close buttons; overlay manager ensures one-open, ESC/Click-outside close, basic focus trapping, and aria-hidden on background.
- Booking: modern multi-step overlay (calendar -> details -> summary), gold accents and premium depth; availability block under calendar; computed pricing; supports date disables per trip.
- Checkout: Stripe Elements split fields; Payment Request Button (Apple/Google Pay) helper; mock fallback when Stripe not configured.
- Admin: Excel-like tables, filters, CSV export; modal shows booking metadata with actions.

## Internationalization

- Runtime i18n loader and language selector; persists choice; updates DOM via data attributes.
- Supported: EL/EN/FR/DE/HE; RTL layout handling for Hebrew.
- Many UI strings localized; some inline JS strings remain hard-coded and rely on fallbacks.

## Data Layer

- SQLite DB (`data/db.sqlite3`) for payments and bookings; automatic table creation.
- Optional PostgreSQL support via `DATABASE_URL` for payments; migration script provided.
- Capacities table for per-trip/date availability (no admin UI yet).
- JSON fallback for payments (`payments.json`) if DB is unavailable.

## Payments

- Server creates PaymentIntents with idempotency and optional booking metadata.
- Webhook confirms bookings on success; records payments (status/amount/currency/timestamp).
- Admin endpoints for payments list and CSV export; admin actions to cancel/refund bookings.
- Apple Pay domain association placeholder under `public/.well-known/`.

## Tooling and CI

- Puppeteer smoke tests to capture multi-viewport screenshots for booking flow and overlays.
- Jest tests for booking creation/webhook flows, idempotency, and failure/SCA-like cases.
- No ESLint/Prettier config; no CI pipeline config detected.

## Deployment and Ops

- Docker Compose for local app + Postgres; PM2 and Nginx example configs.
- Render deployment guide; health endpoint; backup script with optional S3.
- `.env.example` with all expected environment variables.

## Current Quality Gates (observed)

- Build: N/A (Node server + static assets).
- Lint/Typecheck: No configured linters.
- Unit/Integration tests: Ran locally; tests currently FAIL due to `/webhook/test` returning 403 (test suite expects ALLOW_TEST_WEBHOOK=true). Code suggests enabling env works; needs investigation (see “Partial”).
- Smoke test: Puppeteer scripts exist; require server running locally.

## Status Summary

### Complete

- Core pages and navigation (home, categories, trips with map/video).
- Overlay framework with accessibility basics; booking, AI, profile, payment overlays wired.
- Multi-step booking flow with price calculation, trip/date/seats/name/email capture, and redirection to checkout with booking id.
- Server APIs: bookings create/read, availability endpoint (server-side), payment intent creation with idempotency, Google Maps key injection.
- Stripe webhook handling with deduplication and multi-backend persistence; booking confirmation on success.
- Admin UI for payments and bookings; CSV exports; backup status; cancel/refund actions.
- Internationalization scaffolding with 5 languages and RTL handling.
- Deployment docs and scripts; Docker Compose; PM2/Nginx samples; health endpoint.
- Payment Request helper and checkout page with Stripe Elements + PRB; mock fallback.

### Partial / In Progress

- Tests: Jest suites fail locally due to `/webhook/test` 403. Tests spawn the server with `ALLOW_TEST_WEBHOOK=true` but endpoint rejects; needs small fix or test env pass-through validation.
- Availability: Server supports capacities; UI currently uses a temporary mock availability value in step 1. Need to wire real availability from `/api/availability` and provide an admin UI to set capacities.
- i18n coverage: Many strings are localized; some dynamic/JS strings remain hard-coded (Greek/English). Audit to complete translations.
- Payments UX: Checkout uses static example amounts (1000 cents) on client; should be driven by selected trip/seats and linked booking. SCA and error flows are minimal in UI.
- Security: Admin uses Basic Auth; no rate-limiting/CSRF/captcha; suitable for internal use but not strong for public exposure.
- Styling: Booking/Trip/Global CSS partly duplicated; some high-specificity overrides; could benefit from consolidation.
- Apple Pay: Domain association file is a placeholder; requires real file and dashboard verification.
- Postgres: Supported in code; migration script present; no automated migrations framework (e.g., knex/Prisma) yet.

### Missing / Not Yet Implemented

- User account/profile features beyond a placeholder overlay (no auth/user bookings dashboard).
- Admin UI to manage trip capacities and availability per date.
- End-to-end tests for full payment flows (including PRB/Apple/Google Pay) and refund/cancel actions.
- CI pipeline (linting, tests, deploy) and code quality tooling (ESLint/Prettier).
- Observability: Centralized logging/metrics/alerts beyond `/health` and flat log files.
- Comprehensive accessibility audit (ARIA, focus management across all overlays, keyboard interactions across the app).

## Recommended Next Steps

1. Tests green:
   - Ensure `ALLOW_TEST_WEBHOOK=true` reaches the server in Jest (propagate env or adjust webhook test gate for test env). Add a tiny self-check in tests to log the env seen by server.
2. Wire real availability:
   - Replace the temporary mock in `main.js` step 1 with live data from `/api/availability` and disable Next when insufficient seats.
   - Add minimal admin UI to set capacities for trip/date (re-using Admin panel).
3. Drive checkout amounts from booking:
   - Fetch booking by `bookingId` in `checkout.html` and compute amount from `price_cents`; pass `booking_id` to `/create-payment-intent`.
4. Complete i18n:
   - Audit strings in `main.js`, `admin.html`, and `checkout.html`; move to i18n files; ensure RTL layout is preserved.
5. Security hardening:
   - Replace Basic Auth with a stronger auth mechanism or restrict `/admin` behind VPN; add rate limiting to admin endpoints.
6. Payment methods:
   - Replace Apple Pay placeholder with real association file and verify domain in Stripe. Test PRB on-device over HTTPS.
7. Code quality and CI:
   - Add ESLint/Prettier; set up GitHub Actions to run tests and build artifacts; optional Playwright/Puppeteer E2E step.
8. Migrations & DB:
   - Add a schema migration tool; promote PostgreSQL in production; ensure backups (and S3 upload) scheduled.
9. Accessibility & UX polish:
   - Verify focus trap and aria-hidden behavior across overlays; add focus outlines; validate keyboard navigation.

## Notes

- Environment: `.env.example` lists required vars; the server avoids committing secrets and injects keys at runtime.
- Screenshots: Multiple reference screenshots exist for booking steps and overlays across devices; use `tools/booking_smoke_test_multi.js` to regenerate.

---

Requirements coverage for this status report:
- Full scan and analysis: Done (server, public assets, data, tools, tests, docs).
- List complete/partial/missing: Done.
- Save as “Greekaway Technical Status – v2”: Done (this file).
