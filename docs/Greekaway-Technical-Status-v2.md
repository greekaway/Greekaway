# Greekaway Technical Status – v2

Date: 2025-10-17

This document summarizes the current technical and visual progress of the Greekaway project based on a full scan of the repository, pages, data, server, tooling, and tests. It replaces the previous v2 snapshot with an up-to-date view.

## Overview

- Stack: Node.js (Express), client-side HTML/CSS/JS, SQLite (better-sqlite3) with optional PostgreSQL, Stripe integration, Puppeteer-based smoke tests, Jest tests for booking/payment flows.
- App mode: Static public site with a small server for dynamic booking/payment endpoints and admin APIs.
- Multi-language UI with runtime i18n (EL/EN/FR/DE/HE) and RTL support.

## Architecture and key modules

- Server (`server.js`):
  - Serves static assets from `public/`.
  - Injects Google Maps API key when serving `/trips/trip.html`.
  - Injects Stripe publishable key into `/checkout.html` at response time.
  - Bookings API: `POST /api/bookings`, `GET /api/bookings/:id`, `GET /api/availability` with capacity checks (SQLite table `capacities`).
  - Payments: `POST /create-payment-intent` with idempotency; associates PaymentIntent to booking via metadata or DB.
  - Admin APIs: payments list/CSV (supports Postgres/SQLite/JSON), bookings list/CSV, cancel/refund endpoints, backup status, travelers/pairs.
  - Health endpoints present in admin-oriented areas and logs; general error handlers attached.

- Webhook (`webhook.js`):
  - Handles `payment_intent.succeeded` and `payment_intent.payment_failed`.
  - Persistence: Postgres (if `DATABASE_URL`), SQLite (`data/db.sqlite3`), or JSON (`payments.json`).
  - Deduplication via `event_id`; logs to `webhook.log`.
  - Confirms bookings on success (by `metadata.booking_id` or by matching `payment_intent_id`).
  - Test endpoint: `POST /webhook/test` gated by `ALLOW_TEST_WEBHOOK=true`.
  - Traveler profile upsert and simple co-travel stats update on success.

- Frontend (public):
  - Pages: `index.html` (welcome), `trips.html` (categories), `/categories/*.html`, `/trips/trip.html`, `checkout.html`, `admin.html`, `admin-groups.html`, step pages (`step2.html`, `step3.html`).
  - JS: `main.js` (categories/trips/booking flows and Maps routes), `overlay-manager.js`, `i18n.js`, `payment-request.js`, `feedback.js`.
  - CSS: `style.css` (global and categories), `trip.css` (trip and booking overlay look), `booking.css` (calendar and steps overrides).
  - Data: `public/data/tripindex.json`, `public/data/categories.json`, and per-trip JSONs in `public/data/trips/`.

- Admin UI (`public/admin.html`):
  - Basic Auth (header) gate.
  - Payments table with filters (status/date/amount), client-side sort, server-side pagination; CSV export, Excel copy.
  - Backups panel shows latest files from a configured directory.
  - Bookings table with CSV export and booking meta previews; actions via separate endpoints.
  - Admin groups and pairing suggestions endpoints exist on server; `admin-groups.html` is included for client-side.

- Tooling and tests:
  - Puppeteer smoke tests and multi-viewport screenshots: `tools/booking_smoke_test.js`, `tools/booking_smoke_test_multi.js`.
  - Jest tests: `tests/booking_flow.test.js`, `tests/idempotency.test.js`, `tests/sca_and_failures.test.js`.
  - Conversion utility added: `tools/convert_logo_to_webp.js` (uses sharp) + `npm run build:logo-webp`.
  - Deployment docs: `DEPLOY.md`, `DEPLOY_RENDER.md`, `README-PRODUCTION.md`; Dockerfile, docker-compose, Nginx/PM2 scripts.

## Visual/UX status

- Welcome page: animated, responsive logo; mobile-first footer with central CTA; language switcher.
- Categories: cinematic tile grid; per-category backgrounds (sea/mountain/culture) with unified gold accents.
- Trip page: back button; localized title/description; YouTube video cards; Google Maps route rendering; persistent highlight on arrival.
- Overlays: booking, AI, profile, payment. Accessible close buttons; ESC/click-outside; basic focus trapping via `overlay-manager.js`.
- Booking: multi-step overlay (calendar -> details -> summary), availability indicator/stub, price computation, and navigation to next steps.
- Checkout: Stripe Elements (split fields) + Payment Request Button helper; mock fallback when Stripe keys not set.
- Admin: clean tables with sorting, paging, CSV export; filters; modal detail viewers.

## Internationalization

- Runtime i18n loader (`i18n.js`) with persistent preference; EL/EN/FR/DE/HE locales provided, including RTL support for Hebrew.
- Many UI strings localized. Some inline and JS-generated strings remain hard-coded (Greek/English); they should be moved into locale files.

## Data layer

- SQLite DB (`data/db.sqlite3`) with tables for bookings, capacities, travelers, co_travel, feedback, groups, and payments (via webhook). Automatic table creation/migrations for several columns.
- Optional Postgres via `DATABASE_URL`; helper migration script present in tools and server/webhook support paths.
- JSON fallback for payments if DB libs are unavailable.

## Payments

- `POST /create-payment-intent` with idempotency support and booking metadata linking.
- Webhook records events and transitions bookings to `confirmed` on success.
- Admin endpoints expose payments (`/admin/payments`, `/admin/payments.csv`) and bookings with filter/sort/pagination.
- Apple Pay domain association placeholder under `public/.well-known/` (needs production setup).

## Recent change (assets/perf)

- Main logo optimization completed:
  - New WebP: `public/images/logo.webp` (~112.9 KB).
  - Fallback PNG retained: `public/images/logo.png` (~1.40 MB).
  - Welcome page updated to use `<picture>` with WebP + PNG fallback.
  - Conversion utility: `tools/convert_logo_to_webp.js` and `npm run build:logo-webp`.

## Current quality gates (observed)

- Build: N/A (Node server + static assets; no bundler).
- Lint/Typecheck: Not configured (no ESLint/Prettier/TS found).
- Unit/Integration tests (Jest):
  - Ran locally and currently FAIL (3/3 suites) due to `/webhook/test` returning 403.
  - The tests spawn the server with `ALLOW_TEST_WEBHOOK=true`, but the route handler still reads a falsy value. Root cause to investigate: environment propagation or gating logic. Adding a log/assert of `ALLOW_TEST_WEBHOOK` at request time should clarify.
- Smoke tests (Puppeteer): present; runnable via tasks; require server running locally. Last run of a multi-viewport script completed without process error (no assertion layer).

## Status summary

### Complete

- Core pages and navigation (welcome, categories, trip details with maps/videos).
- Overlay framework and booking/AI/profile/payment overlays wired with accessible controls.
- Multi-step booking capture (date/seats/basic details) with computed pricing and progression across steps.
- Server APIs for bookings, availability, payment intents; Google Maps/Stripe key injection patterns.
- Webhook persistence (Postgres/SQLite/JSON), deduplication, and booking confirmation on success.
- Admin UI for payments and bookings with CSV exports and filters; backup status endpoint/UI.
- Internationalization scaffolding with 5 languages and RTL.
- Docker/Render deployment docs; Nginx/PM2 samples; health/error handling.
- Payment Request helper; checkout with Stripe Elements; mock fallback.

### Partial / in progress

- Tests: Jest suites failing due to `/webhook/test` 403 despite setting `ALLOW_TEST_WEBHOOK=true` in the spawned server env.
- Availability UI: Step 1 shows an indicator; needs wiring to live `/api/availability` and enforcement in navigation.
- i18n: Remaining hard-coded strings in JS/HTML need extraction to locale files.
- Payments UX: Amounts on client side still use static examples in places (e.g., 1000 cents). Should derive from booking and be validated server-side.
- Security: Admin behind Basic Auth; missing rate-limiting/CSRF/hardening for public exposure.
- Styling: CSS duplication across `style.css`, `trip.css`, and `booking.css` with high-specificity overrides; could be consolidated.
- Apple Pay: Domain association not finalized; needs real file and Stripe dashboard verification.
- Postgres/migrations: Supported but lacks a formal migration framework.

### Missing / not yet implemented

- User accounts/auth and a real profile area (current profile overlay is a placeholder).
- Admin UI to manage per-date capacities/availability.
- End-to-end tests for full payment flows (PRB, Apple/Google Pay), refunds/cancels.
- CI pipeline (linting/tests/deploy) and code quality tooling (ESLint/Prettier).
- Observability beyond logs: centralized logging/metrics/alerts.
- Full accessibility audit and improvements (focus order, landmarks, keyboard coverage across modals/pages).

## Recommended next steps

1) Fix test webhook gating and get tests green
   - Add a small console/log in `/webhook/test` to print `ALLOW_TEST_WEBHOOK` at request time; verify Jest’s child process env includes it.
   - Alternatively, allow `NODE_ENV === 'test'` to bypass the gate.

2) Wire live availability
   - Replace any mock availability in Step 1 with `/api/availability` data; block Next when insufficient seats; show remaining capacity.
   - Add admin controls to set `capacities` per trip/date.

3) Drive checkout amounts from booking
   - In `checkout.html`, fetch booking by `bookingId` and compute the exact amount from `price_cents` and seats; pass `booking_id` to `/create-payment-intent`.

4) Complete i18n pass
   - Audit `main.js`, `admin.html`, `checkout.html` for hard-coded text; move to `public/i18n/*.json`. Confirm RTL behavior.

5) Security and ops
   - Harden admin with stronger auth or restrict it behind VPN. Add rate limiting to admin and payment endpoints.
   - Consider CSRF protection where applicable.

6) Code quality and CI
   - Add ESLint/Prettier; create a GitHub Actions workflow to run tests and smoke checks.

7) DB migrations & backups
   - Introduce a migration tool (knex/Prisma) and schedule backups; promote Postgres in production.

8) Accessibility & UX
   - Validate aria roles and focus management across overlays; add visible focus indicators.

## Notes

- Environment: `.env.example` lists expected variables; keys are injected at response time to avoid committing secrets.
- Screenshots: Multiple reference screenshots exist for booking steps and overlays across devices; use `tools/booking_smoke_test_multi.js` to regenerate.
- Assets: Main logo now served via `<picture>` (WebP + PNG fallback) on `index.html` for performance.

---

Requirements coverage for this status report:
- Full scan and analysis: Done (server, public assets, data, tools, tests, docs).
- List complete/partial/missing: Done.
- Saved as “Greekaway Technical Status – v2”: Done (this file, updated).
