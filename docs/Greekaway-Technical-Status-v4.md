# Greekaway Technical Status – v4

Date: 2025-11-08

This v4 snapshot summarizes the current technical and visual state of Greekaway after a fresh scan of the repository (server, public UI, data, tools, and tests). It supersedes v3 and updates the prior v4 with the latest test and feature status.

## Overview

- Stack: Node.js (Express), static HTML/CSS/JS frontend, SQLite (better-sqlite3) with optional PostgreSQL, Stripe payments, Puppeteer and Jest for testing.
- App mode: Static site under `public/` with a lightweight backend for bookings, payments/webhooks, assistant, partner/provider and admin views.
- i18n: 13 languages available (de, el, en, es, fr, he, it, ko, nl, pt, ru, sv, zh) with runtime switching; RTL support for Hebrew.

## Architecture and key modules

- Server (`server.js`)
  - Static serving from `public/`, plus locale exposure at `/locales/index.json` with cache tuning for dev/prod.
  - HTML response-time injection:
    - Google Maps key into `/trip.html`.
    - Stripe publishable key into `/checkout.html`.
  - Bookings and availability (public-side):
    - `POST /api/bookings` creates bookings in SQLite (`data/db.sqlite3`).
    - `GET /api/bookings/:id` fetches a booking.
    - `GET /api/availability` returns capacity/availability (capacities table present; public UI wiring pending).
  - Payments:
    - `POST /create-payment-intent` (server) and `POST /api/partners/create-payment-intent` (partners route) with idempotency and optional Stripe Connect transfer_data when a partner mapping exists.
    - Associates PaymentIntent to a booking in DB for webhook reconciliation.
  - Admin endpoints:
    - Payments list/CSV: `/admin/payments`, `/admin/payments.csv` (supports SQLite/Postgres/JSON fallback).
    - Bookings list/CSV: `/admin/bookings`, `/admin/bookings.csv`, booking cancel/refund actions.
    - Travelers, co-travel suggestions, feedback CRUD, groups admin, backup status.
  - Assistant and live data:
    - `POST /api/assistant` (JSON) and `POST /api/assistant/stream` (chunked text).
    - Trip detection and summarization via `live/tripData.js`.
    - Optional live snippets (weather via Open‑Meteo, headlines via RSS) via `live/liveData.js` and env configuration.
  - Health/info:
    - `/version.json`, `/version`, `/health`.

- Partners route (`routes/partners.js`)
  - Stripe Connect onboarding helpers (`/connect-link`, callback), manual partner onboarding form + submit.
  - `POST /api/partners/create-payment-intent` with automatic split calculation; stores extended payout-related fields on bookings for admin visibility; creates manual_payments records when no Connect account is present.
  - Partner mappings (`partner_mappings`), payouts log table, and helpers for scheduling/attempting payouts; SSE notifications for admin updates.

- Manual payments (`routes/manual-payments.js`)
  - Admin JSON API for listing and marking manual partner payouts as paid; writes audit log and emits SSE updates.

- Provider panel and availability
  - Provider panel HTML under `public/provider/` and API under `routes/provider.js` with JWT auth, login rate limiting, and endpoints for bookings and actions (accept/decline/picked/completed).
  - Provider availability management via `routes/provider.js` (per-provider CRUD with capacity and reserved seats insight) and admin-side availability tooling via `routes/provider-availability.js` (Basic auth, CSV export).

- Webhook (`webhook.js`)
  - Handles `payment_intent.succeeded` and `payment_intent.payment_failed`.
  - Persistence: Postgres if `DATABASE_URL`, else SQLite, else JSON (`payments.json`).
  - Deduplication via `event_id`; audit log to `webhook.log`.
  - On success: confirms linked bookings, upserts traveler profile, updates co-travel stats, and marks payouts sent when using Connect transfer_data.
  - Test-only endpoint: `POST /webhook/test` gated by `ALLOW_TEST_WEBHOOK='true'` (works under Jest/local runs).

- Services
  - `services/dispatchService.js`: Email-based dispatch queuing with retries and success tracking; controlled by `DISPATCH_ENABLED` and mail env vars.
  - `services/adminSse.js`: Lightweight SSE broadcaster for admin dashboards and real-time updates.
  - `services/pickupNotifications.js`: Computes and freezes final pickup sequence/times ~24h before trip using Google Distance Matrix (when key present), persists into booking metadata, and sends optional email notifications; scheduled every 5 minutes (disabled under tests).

## Frontend (under `public/`)

- Pages: `index.html`, `trips.html`, `/categories/*.html`, `/trip.html`, `checkout.html`, booking steps (`step2.html`, `step3.html`), admin pages (`admin.html`, `admin-groups.html`, `admin-availability.html`, `admin-payments.html`), partner flows (`partner-agreement.html`, `partner-manual-onboarding.html`), provider panel (`/provider/*.html`).
- JS: `main.js` (categories, trips, trip page with carousel, overlays), `overlay-manager.js`, `i18n.js`, `assistant.js`, `payment-request.js`, `feedback.js`, `footer.js`, `carousel-config.js`, `admin-*`, `manual-payments.js`, `theme.js`, `welcome.js`.
- CSS: Centralized tokens and styles for cards, overlays, booking flow, and carousel.
- Data: `public/data/tripindex.json`, `public/data/categories.json`, per-trip JSON in `public/data/trips/*.json`.
- Apple Pay: Domain association placeholder under `public/.well-known/`.

## Data layer

- SQLite DB (`data/db.sqlite3`) with tables: bookings, capacities, travelers (with average_rating), co_travel, feedback, groups, payments (webhook), partner_mappings, payouts, manual_payments, dispatch_log, provider_availability.
- Optional PostgreSQL paths for all major features (bookings, webhook, availability, partner agreements, dispatch logs).
- Automatic schema ensure/migrations on startup or route attach for newly added columns.

## Visual/UX status

- Welcome: responsive hero with optimized logo, consistent theme, footer CTA.
- Categories: cinematic grid with localized labels; standardized card visuals.
- Trip page: localized title/description, multi-video carousel (YouTube iframes) with swipe/drag/wheel and lazy-load; Google Maps route; price badge; background per category.
- Overlays: booking, AI assistant, profile, and payment overlays with ESC/click-outside and focus handling.
- Booking flow: Step 1 (calendar), Step 2 (traveler details), Step 3 (summary). Price surface updated from trip price. Availability indicator present; public UI still needs hard wiring to live capacities.
- Checkout: Stripe Elements (split fields) + Payment Request Button helper.
- Admin: payments/bookings tables with filters/sort, pagination, CSV export; groups admin; feedback listing; SSE updates for payouts/manual payments.
- Provider: basic panel pages (login, dashboard, bookings, payments, profile, availability) with JWT auth-backed API.

## Internationalization

- Runtime loader `public/js/i18n.js` with persisted preference.
- Locales present in `locales/` for 13 languages; client code reads server-provided locales.
- i18n checker present (`tools/check_i18n_keys.js`) to verify keys referenced in HTML exist in locale bundles.

## Assistant and live data

- Assistant endpoints (`/api/assistant`, `/api/assistant/stream`) provide concise, travel-focused answers.
- Trip-aware summarization via `live/tripData.js` for known destinations; optional live weather (Open‑Meteo) and headlines (RSS URLs `NEWS_RSS_URL*`) via `live/liveData.js` with caching/dedup.
- Knowledge base: `data/ai/knowledge.json` hot-reloaded with file watching + size guard.

## Quality gates (current run)

- Build: N/A (Node server + static assets; no bundler).
- Lint/Typecheck: Not configured (no ESLint/Prettier/TS in repo).
- Unit/Integration tests (Jest): FAIL currently (env mismatch) — 4 failed, 1 passed
  - Passing: pickup_notifications.test.js
  - Failing: booking_flow, idempotency, provider_panel, sca_and_failures
  - Root cause: `.env` sets `PORT=3101`, so the spawned server in tests listens on 3101 while tests call `http://localhost:3000`; connection attempts fail. Quick fixes:
    - Clear/override `PORT` for test runs (e.g., set `PORT=3000` in the spawned env), or
    - Make `server.js` default to 3000 when `NODE_ENV=test` regardless of `PORT`.
- Smoke tests (Puppeteer): Not re-run in this pass. Multi-viewport screenshots from prior runs exist at repo root (iphone-13/14/16, pixel-7, etc.). Re-run requires local server on the expected port.
- i18n check: Tool available; recommended to run before releases.

## Status summary

### Complete

- Core pages and navigation (welcome, categories, trip details with maps/videos) with modern carousel UX and overlay framework.
- Server APIs for bookings, payments (PI creation with idempotency), Stripe webhook recording/confirmation, and admin views (payments, bookings, feedback, groups, backups).
- Partner onboarding (Stripe Connect and manual), mappings, payout scaffolding (auto via Connect and manual tracking), and admin SSE updates.
- Provider panel API and pages with JWT auth and availability CRUD.
- Assistant endpoints with trip-aware summaries and optional live weather/news; knowledge base hot-reload.
- Internationalization scaffolding with 13 languages; runtime loader; RTL support for Hebrew.
- Deployment assets and environment key injection at response time.
- Asset optimization (WebP logo) and conversion tooling.

### Partial / in progress

- Availability (public): UI indicator exists; needs strict wiring to `/api/availability` with enforcement (block progression when insufficient seats) and capacities admin UX.
- Payments UX: Ensure client-side amounts consistently derive from booking state; validate server-side; finalize PRB variants.
- Security hardening: Admin behind Basic Auth only; expand rate limiting and add CSRF protections for sensitive routes.
- Styling/code organization: Some CSS duplication; could consolidate with tokens; no linter/formatter.
- Apple Pay: Domain association placeholder exists; needs production verification with Stripe.
- Postgres path: Supported across modules, but no formal migration framework.
- Dispatch emails: Service implemented and queued; requires mail env configuration and production testing.

### Missing / not implemented

- User accounts/auth for travelers and a full profile area.
- Admin UI to manage per-date capacities/availability (basic provider/admin APIs exist, but public/admin UI linkage is limited).
- CI pipeline (linting/tests/deploy) and code-quality tooling (ESLint/Prettier) + pre-commit hooks.
- Observability: central logging/metrics/alerts beyond flat files.
- Accessibility audit and improvements (landmarks, focus order, keyboard coverage across modals/pages).
- End-to-end flows for refunds/cancellations and Payment Request Button variants.

## Recommended next steps (actionable)

1) Wire public availability end-to-end
   - Use `/api/availability` backed by `capacities` and surface remaining seats in Step 1; block progression when insufficient.
   - Add a minimal admin UI to CRUD capacities and link provider availability where appropriate.

2) Payment flow robustness
   - Derive checkout amounts strictly from booking; validate currencies; reconcile post-webhook.
   - Keep idempotency keys across booking creation/PI creation.

3) Security and ops
   - Add rate limiting to admin/payment endpoints; introduce CSRF protection; consider VPN/IP allowlists for admin.

4) Code quality and CI
   - Add ESLint/Prettier; GitHub Actions workflow to run tests and smoke on PRs.

5) DB migrations and backups
   - Introduce a migration tool (knex/Prisma). Schedule and verify backups for production.

6) Dispatch and email ops
   - Configure mail transport in production and validate dispatch flow with a test booking and a partner.

7) Accessibility & UX polish
   - Validate ARIA roles and focus management across overlays and carousel; ensure visible focus indicators.

## Notes

- Environment: `.env.example` lists expected variables; server injects keys at response time to avoid committing secrets.
- AI/live data: Configure optional news via `NEWS_RSS_URL`, `NEWS_RSS_URL_1`, `NEWS_RSS_URL_2`; weather via Open‑Meteo by default.
- Screenshots: Booking flow screenshots can be regenerated via `tools/booking_smoke_test.js` or the multi-viewport runner.

---

Requirements coverage for this status:
- Full scan and analysis: Done (server, public UI, data, tools, tests, docs).
- List complete/partial/missing: Done.
- Saved as “Greekaway Technical Status – v4”: Done (this file).
