# Greekaway Technical Status – v3

Date: 2025-10-19

This v3 snapshot summarizes the current technical and visual state of Greekaway after a full scan of the repository (server, public UI, data, tools, and tests). It supersedes v2.

## Overview

- Stack: Node.js (Express), static HTML/CSS/JS frontend, SQLite (better-sqlite3) with optional PostgreSQL, Stripe payments, and Puppeteer/Jest for testing.
- App mode: Static site served from `/public` with a small backend for bookings, payments, webhook handling, and admin views.
- i18n: EL/EN/FR/DE/HE (including RTL for HE) with runtime switching.

## Architecture and key modules

- Server (`server.js`)
  - Serves static assets; injects Google Maps key into `/trips/trip.html` and Stripe publishable key into `/checkout.html` at response time.
  - Bookings/availability endpoints; creates and persists bookings to SQLite (`data/db.sqlite3`).
  - Payments: `POST /create-payment-intent` (idempotency-aware); stores PaymentIntent linkage in booking.
  - Attaches `webhook.js` for Stripe event handling.

- Webhook (`webhook.js`)
  - Persists payments to SQLite or Postgres (if `DATABASE_URL`), else JSON file fallback.
  - Deduplicates via unique `event_id`.
  - On `payment_intent.succeeded`, confirms the linked booking and upserts traveler profile + simple co-travel stats.
  - Test-only endpoint: `POST /webhook/test` (gated by `ALLOW_TEST_WEBHOOK=true`).

- Frontend (under `public/`)
  - Pages: `index.html`, `trips.html`, `/categories/*.html`, `/trips/trip.html`, `checkout.html`, admin pages (`admin.html`, `admin-groups.html`), booking step pages (`step2.html`, `step3.html`).
  - JS: `main.js` (categories, trip rendering, maps, booking flow), `overlay-manager.js`, `i18n.js`, `payment-request.js`, `feedback.js`, `footer.js`.
  - CSS: `style.css` (global), `trip.css` (trip and overlays), `booking.css` (calendar and steps overrides).
  - Data: `public/data/tripindex.json`, `public/data/categories.json`, and per-trip JSONs under `public/data/trips/`.

- Admin UI
  - Payments and bookings tables with filters/sort, pagination, CSV export.
  - Basic Admin Groups page present; server exposes helpers for grouping/stats.

- AI assistant
  - `data/ai/knowledge.json` hot-reloaded by the server to enrich assistant responses.

## Recent frontend highlight: Video carousel (YouTube-like)

- Multi-video per stop supported via `stop.videos` array with backward compatibility for `stop.video`.
- Native scroll-snap carousel with:
  - Touch swipe and mouse drag (one-slide-per-gesture with threshold+flick detection).
  - Trackpad wheel: single-step with cooldown.
  - Lazy-loading of current and neighbor iframes.
  - Right-side “peek” of the next video; small gaps tuned per device.
  - Dots removed per UX request; desktop-only overlay arrows placed directly on the current video; keyboard navigation (←/→, Home/End).
  - Gradient edge hints; subtle.
- Centralized configuration: `public/js/carousel-config.js` (new)
  - Controls video radius, peek/gap per breakpoint, swipe thresholds, and wheel cooldown.
  - `main.js` applies config to CSS variables and uses thresholds at runtime.
  - `trip.css` reads CSS variables with sane defaults.

Current carousel defaults (from config):
- Mobile (<600px): peek 10%, gap −15px (tight, slight overlap)
- Tablet/desktop (≥600px): peek 6%, gap 20px
- Video corner radius: 14px

## Visual/UX status

- Welcome: responsive hero/logo (WebP with PNG fallback), gold-accent theme, bottom nav.
- Categories: cinematic grid; localized labels; design tokens in `style.css`.
- Trip page: back button, localized title/description, video carousel per stop, Google Maps route area, consistent card styling.
- Overlays: booking, AI, profile, payment; accessible close buttons, consistent styling.
- Booking Flow: Step 1 (calendar), Step 2 (traveler details), Step 3 (summary). Price badge updated from trip price.
- Checkout: Stripe Elements + Payment Request Button helper.
- Admin: functional tables for bookings and payments with CSV export.

## Internationalization

- Runtime loader (`public/js/i18n.js`) with persisted language and support for EL/EN/FR/DE/HE (RTL).
- Many strings localized; some inline/JS strings still hard-coded (not fully extracted).

## Data and persistence

- SQLite database (`data/db.sqlite3`)—tables:
  - bookings (with idempotency/payment linkage columns, created/updated timestamps).
  - capacities, travelers, co_travel, feedback, groups, and payments (webhook).
- Optional Postgres support (env `DATABASE_URL`).
- Payments fallback to JSON when DB not available.

## Tooling and tests

- Puppeteer smoke tests and multi-viewport screenshots in `tools/`.
- Jest tests in `tests/`: booking flow, idempotency, SCA/failed payments.
- VS Code tasks present to run smoke tests and local server previews.

## Deployment

- Dockerfile and docker-compose; Render deployment docs; Nginx and PM2 scripts (`deploy/`).
- `.env.example` for local setup; keys injected at response time to avoid committing secrets.

## Quality gates (current run)

- Build: N/A (no bundler).
- Lint/Typecheck: Not configured (no ESLint/Prettier/TS in repo).
- Unit/Integration tests (Jest): FAILING (3/3 suites)
  - Cause: `/webhook/test` returns 403. `webhook.js` gate requires `ALLOW_TEST_WEBHOOK=true` (string). Tests likely start the server without this env, or it’s not propagated to the server process under Jest.
  - Evidence (latest run): all failures assert 200 but received 403.
- Smoke tests: present and runnable, not executed as part of this scan.

## Status summary

### Complete
- Core pages and navigation (welcome, categories, trip details with maps/videos).
- New carousel architecture and UX (swipe, drag, wheel, lazy-load, desktop arrows, keyboard nav).
- Overlay framework (booking, AI, profile, payment) with consistent styles.
- Server APIs for bookings, availability stub, payments (PI creation) with idempotency.
- Webhook persistence and booking confirmation on success; traveler upsert and co-travel stats.
- Admin UI for payments/bookings with CSV.
- Deployment assets (Docker/Render) and environment injection patterns.
- Asset optimization for logo (WebP) and conversion tooling.

### Partial / in progress
- Tests: Jest failing due to test-webhook gate (403). Needs env gating fix for test runs.
- Availability UI: indicator exists; needs live data wiring and enforcement.
- i18n coverage: remaining hard-coded strings in JS/HTML.
- Payments UX: ensure amounts at checkout derive from bookings consistently; validate server-side.
- Security hardening: admin auth is basic; rate limiting/CSRF not present.
- CSS organization: some duplication across stylesheets; could be consolidated and tokenized.
- Apple Pay: domain association not finalized.
- Postgres path: supported, but lacks formal migration framework.

### Missing / not implemented
- User accounts/auth and a real profile area beyond overlay stub.
- Admin UI for managing capacities/availability per trip/date.
- CI pipeline (lint, tests, deploy) and code quality tooling (ESLint/Prettier) with auto-format hooks.
- Observability: central logging/metrics/alerts.
- Comprehensive a11y audit (focus order, landmarks, keyboard coverage across modals/pages).
- E2E flows for refunds/cancellations and Payment Request Button variations.

## Recommended next steps (actionable)

1) Fix the test webhook gate and get Jest green
   - Start server under tests with `ALLOW_TEST_WEBHOOK=true` (string). Alternatively, in `webhook.js` allow `NODE_ENV==='test'` to bypass.
   - Add a quick log assertion inside `/webhook/test` to confirm env presence.

2) Wire availability end-to-end
   - Implement `/api/availability` backed by `capacities`; reflect in Step 1; block Next when insufficient seats.
   - Add a minimal admin form to CRUD capacities.

3) Payment flow robustness
   - Drive checkout amount from booking; validate currencies; reconcile after webhook.
   - Add idempotency keys for booking creation/update endpoints.

4) i18n completion
   - Audit `main.js`, `admin.html`, `checkout.html` for literals; move to `public/i18n/*.json` and leverage `i18n.js` helpers.

5) Security and ops
   - Add rate limiting to admin and payment endpoints; consider behind-VPN for admin.
   - Basic CSRF protection where relevant.

6) Code quality and CI
   - Add ESLint/Prettier configs; GitHub Actions workflow to run tests/smoke on PRs.

7) DB migrations and backups
   - Introduce a migration tool (knex/Prisma) and scheduled backups for production.

8) Accessibility & UX polish
   - Validate aria roles and focus management across overlays and carousel; visible focus indicators already added for carousel.

## Notes

- Carousel configuration centralized in `public/js/carousel-config.js`; can be tuned without touching CSS/JS internals.
- Knowledge base for the AI assistant is hot-reloaded from `data/ai/knowledge.json`.
- Tasks available in VS Code to run smoke tests and local previews.

---

Requirements coverage for this status:
- Full scan and analysis: Done (server, public UI, data, tools, tests, docs).
- List complete/partial/missing: Done.
- Saved as “Greekaway Technical Status – v3”: Done (this file).
