# Greekaway Technical Status – v4

Date: 2025-10-24

This v4 snapshot summarizes the current technical and visual state of Greekaway after a full scan of the repository (server, public UI, data, tools, and tests). It supersedes v3.

## Overview

- Stack: Node.js (Express), static HTML/CSS/JS frontend, SQLite (better-sqlite3) with optional PostgreSQL, Stripe payments, Puppeteer and Jest for testing.
- App mode: Static site under `public/` with a lightweight backend for bookings, payments/webhooks, assistant, and admin views.
- i18n: 13 languages available (de, el, en, es, fr, he, it, ko, nl, pt, ru, sv, zh) with runtime switching; RTL support for Hebrew.

## Architecture and key modules

- Server (`server.js`)
  - Static serving from `public/`, plus locale exposure at `/locales/index.json`.
  - HTML response-time injection:
    - Google Maps key into `/trips/trip.html`.
    - Stripe publishable key into `/checkout.html`.
  - Bookings and availability:
    - `POST /api/bookings` creates bookings in SQLite (`data/db.sqlite3`).
    - `GET /api/bookings/:id` fetches a booking.
    - `GET /api/availability` returns capacity/availability (capacities table present; UI wiring pending).
  - Payments:
    - `POST /create-payment-intent` (server) and `POST /api/partners/create-payment-intent` (partners route) with idempotency and optional Stripe Connect transfer_data when a partner mapping exists.
    - Associates PaymentIntent to a booking in DB for webhook reconciliation.
  - Admin endpoints:
    - Payments list/CSV: `/admin/payments`, `/admin/payments.csv` (supports SQLite/Postgres/JSON fallback).
    - Bookings list/CSV: `/admin/bookings`, `/admin/bookings.csv`, booking cancel/refund actions.
    - Travelers, co-travel pairing suggestions, feedback CRUD, groups admin.
    - Backup status probe.
  - Assistant and live data:
    - `POST /api/assistant` (JSON) and `POST /api/assistant/stream` (chunked text).
    - Heuristics for trip detection + summarization via `live/tripData.js`.
    - Optional live snippets (weather via Open‑Meteo, headlines via RSS) via `live/liveData.js` and env configuration.
  - Health/info:
    - `/version.json`, `/version`, `/health`.

- Partners route (`routes/partners.js`)
  - Stripe Connect onboarding helpers (`/connect-link`, callback), manual partner onboarding form + submit.
  - `POST /api/partners/create-payment-intent` with automatic split calculation; stores extended payout-related fields on bookings for admin visibility.
  - Partner mappings (`partner_mappings`), payouts log table, and helpers for scheduling/attempting payouts.

- Webhook (`webhook.js`)
  - Handles `payment_intent.succeeded` and `payment_intent.payment_failed`.
  - Persistence: Postgres if `DATABASE_URL`, else SQLite, else JSON (`payments.json`).
  - Deduplication via `event_id`; audit log to `webhook.log`.
  - On success: confirms linked bookings, upserts traveler profile, and updates co-travel stats.
  - Test-only endpoint: `POST /webhook/test` gated by `ALLOW_TEST_WEBHOOK=true`.

- Frontend (under `public/`)
  - Pages: `index.html`, `trips.html`, `/categories/*.html`, `/trips/trip.html`, `checkout.html`, booking step pages (`step2.html`, `step3.html`), admin pages (`admin.html`, `admin-groups.html`), partner flows (`partner-agreement.html`, `partner-manual-onboarding.html`).
  - JS: `main.js` (trips, maps, booking flows), `overlay-manager.js`, `i18n.js`, `assistant.js`, `payment-request.js`, `feedback.js`, `footer.js`, `carousel-config.js`.
  - CSS: `style.css` (global/theme tokens), `trip.css` (trip/overlays + carousel), `booking.css` (calendar/steps), `theme.css`.
  - Data: `public/data/tripindex.json`, `public/data/categories.json`, per-trip files in `public/data/trips/*.json` (e.g., delphi, lefkas, olympia, parnassos, santorini).
  - Apple Pay domain association placeholder under `public/.well-known/`.

- Data layer
  - SQLite DB (`data/db.sqlite3`) with tables: bookings, capacities, travelers (with average_rating), co_travel, feedback, groups, payments (webhook), partner_mappings, payouts.
  - Optional PostgreSQL paths where applicable.
  - Automatic schema-ensure/migrations for columns on startup.

- Tooling and tests
  - Puppeteer smoke scripts and multi-viewport screenshots in `tools/`.
  - i18n consistency tools: `tools/check_i18n_keys.js`, `tools/compare_i18n_bundles.js`, verification scripts.
  - Jest test suites in `tests/`: booking flow, idempotency, SCA/failed payments.
  - Deployment assets: Docker/Compose, Render config, Nginx/PM2 scripts; `.env.example` provided.

## Visual/UX status

- Welcome: responsive hero with optimized WebP logo + PNG fallback, consistent gold-accent theme, footer with prominent CTA.
- Categories: cinematic grid with localized labels; design tokens centralised; consistent spacing/typography.
- Trip page: back button, localized title/description, multi-video carousel (YouTube iframes) with swipe/drag/wheel and lazy-load; Google Maps route display; consistent card styling.
- Overlays: booking, AI assistant, profile, and payment overlays with accessible close, ESC/click-outside; focus handling via `overlay-manager.js`.
- Booking flow: Step 1 (calendar), Step 2 (traveler details), Step 3 (summary). Price surface updated from trip price. Availability indicator present; needs live data wiring.
- Checkout: Stripe Elements (split fields) + Payment Request Button helper.
- Admin: payments/bookings tables with filters/sort, pagination, CSV export; basic groups admin page; feedback listing.

## Internationalization

- Runtime loader `public/js/i18n.js` with persisted preference.
- Locales present in both `locales/` (server-focused) and `public/i18n/` (client-focused) for 13 languages.
- Automated scan result: all i18n keys used in HTML are present in locale files.

## Assistant and live data

- Assistant endpoints (`/api/assistant`, `/api/assistant/stream`) provide concise, travel-focused answers.
- Trip-aware summarization fast-path using `live/tripData.js` for known destinations (title, duration, includes, stops, price, unavailable dates).
- Optional live snippets:
  - Weather via Open‑Meteo without API key or via configurable `WEATHER_API_URL`.
  - Headlines via RSS URLs (env `NEWS_RSS_URL*`), cached and deduped; appended when relevant.
- Knowledge base: `data/ai/knowledge.json` hot-reloaded with file watching + size guard.

## Quality gates (current run)

- Build: N/A (Node server + static assets; no bundler).
- Lint/Typecheck: Not configured (no ESLint/Prettier/TS in repo).
- Unit/Integration tests (Jest): FAILING (3/3 suites)
  - All failures are due to `/webhook/test` returning 403. Tests spawn the server with `ALLOW_TEST_WEBHOOK='true'`, but the route gate still reads it as falsy at request time. Requires investigation of env propagation or the gating condition.
- Smoke tests (Puppeteer): Ran “Run booking smoke test (mobile screenshots)” successfully; screenshots saved in repo root.
- i18n check: PASS — `tools/check_i18n_keys.js` reports all keys present across locales.

## Status summary

### Complete

- Core pages and navigation (welcome, categories, trip details with maps/videos) with modern carousel UX and overlay framework.
- Server APIs for bookings, payments (PI creation with idempotency), Stripe webhook recording/confirmation, and admin views (payments, bookings, feedback, groups, backups).
- Assistant endpoints with trip-aware summaries, mock fallback, and optional live weather/news snippets; knowledge base hot-reload.
- Internationalization scaffolding with 13 languages; runtime loader; RTL support for Hebrew.
- Deployment assets and environment key injection at response time.
- Asset optimization (WebP logo) and conversion tooling.

### Partial / in progress

- Tests: Jest suites failing due to test-webhook gate (403). Needs gating fix for test runs.
- Availability: UI indicator in Step 1 exists; needs wiring to `/api/availability` with enforcement (block next on insufficient seats).
- Payments UX: Ensure client-side amounts consistently derive from booking state; validate server-side; finalize PRB variants.
- Security hardening: Admin behind Basic Auth only; add rate limiting and CSRF protections for sensitive routes.
- Styling/code organization: Some CSS duplication across stylesheets; could consolidate with tokens; no linter/formatter.
- Apple Pay: Domain association placeholder exists; needs production verification with Stripe.
- Postgres path: Supported, but no formal migration framework.

### Missing / not implemented

- User accounts/auth and a true profile area.
- Admin UI to manage per-date capacities/availability.
- CI pipeline (linting/tests/deploy) and code-quality tooling (ESLint/Prettier) + pre-commit hooks.
- Observability: central logging/metrics/alerts beyond flat files.
- Accessibility audit and improvements (landmarks, focus order, keyboard coverage across modals/pages).
- End-to-end flows for refunds/cancellations and Payment Request Button variations.

## Recommended next steps (actionable)

1) Fix the test webhook gate and get tests green
   - Ensure the server reads `ALLOW_TEST_WEBHOOK` at request time; as a pragmatic fallback, also allow `NODE_ENV==='test'` to bypass.
   - Add a one-line debug log of the env within `/webhook/test` and assert under Jest.

2) Wire availability end-to-end
   - Implement `/api/availability` backed by `capacities` and surface remaining seats in Step 1; block progression when insufficient.
   - Add a minimal admin form to CRUD capacities.

3) Payment flow robustness
   - Derive checkout amounts strictly from booking; validate currencies; reconcile post-webhook.
   - Keep idempotency keys across booking creation/PI creation.

4) i18n completion and QA
   - Audit `main.js`, `checkout.html`, `admin*.html` for literals; move into `/locales/*.json`.
   - Quick manual QA across the 13 languages; verify RTL layout on HE.

5) Security and ops
   - Add rate limiting to admin and payment endpoints; optionally place admin behind VPN.
   - Introduce basic CSRF protection where relevant.

6) Code quality and CI
   - Add ESLint/Prettier; GitHub Actions workflow to run tests and smoke on PRs.

7) DB migrations and backups
   - Introduce a migration tool (knex/Prisma). Schedule and verify backups for production.

8) Accessibility & UX polish
   - Validate ARIA roles and focus management across overlays and carousel; ensure visible focus indicators.

## Notes

- Environment: `.env.example` lists expected variables; server injects keys at response time to avoid committing secrets.
- AI/live data: Configure optional news via `NEWS_RSS_URL`, `NEWS_RSS_URL_1`, `NEWS_RSS_URL_2`; weather via Open‑Meteo by default.
- Screenshots: Reference booking flow screenshots present at repo root; regenerate via `tools/booking_smoke_test.js` or the multi-viewport runner.

---

Requirements coverage for this status:
- Full scan and analysis: Done (server, public UI, data, tools, tests, docs).
- List complete/partial/missing: Done.
- Saved as “Greekaway Technical Status – v4”: Done (this file).
