# Price Manager (Legacy) — Inbound Links & Uses Report

Date: 2025-11-19

Scope: Identify all inbound links, references, and uses pointing to the legacy Price Manager UI and pricing sources, and classify what can be safely removed vs must remain (shared by booking/payment flows).

Targets:
- `public/admin/pricing-manager.html`
- `public/admin/js/pricing-manager.js`
- `public/admin/css/pricing-manager.css`
- Endpoint: `/api/pricing`
- Data file: `data/pricing.json`

---

## Findings per Target

### 1) `public/admin/pricing-manager.html`
Inbound links (admin nav/footer):
- `public/admin-providers.html` – link to `/admin/pricing-manager.html`
- `public/admin-bookings.html` – link to `/admin/pricing-manager.html`
- `public/admin-payments.html` – link to `/admin/pricing-manager.html`
- `public/admin-manual.html` – link to `/admin/pricing-manager.html`
- `public/admin-home.html` – link to `/admin/pricing-manager.html`
- `public/admin-availability.html` – link to `/admin/pricing-manager.html`
- Self-link active state in page footer: `public/admin/pricing-manager.html`

Local assets loaded by this page:
- `<script src="/admin/js/pricing-manager.js"></script>`
- `<link rel="stylesheet" href="/admin/css/pricing-manager.css">`

Notes:
- No other pages import these assets directly; they are only used by `pricing-manager.html`.

---

### 2) `public/admin/js/pricing-manager.js`
Referenced by:
- `public/admin/pricing-manager.html` (footer script tag)

External dependencies used inside:
- Fetches `/api/pricing` (GET/POST)

---

### 3) `public/admin/css/pricing-manager.css`
Referenced by:
- `public/admin/pricing-manager.html` (head link tag)

---

### 4) Endpoint `/api/pricing`
Server route definitions:
- `src/server/routes/pricing.js` – defines `GET /api/pricing` and `POST /api/pricing`
- `server.js` – mounts router: `app.use('/api', pricing.createPricingRouter({ ... }))`

Client/consumer references (non-admin and admin):
- `public/js/booking-state.js` – fetches `GET /api/pricing` for computing booking amount
- `public/js/vehiclePriceMap.js` – fetches `GET /api/pricing` to populate vehicle price map
- `public/admin/js/pricing-manager.js` – fetches both `GET` and `POST /api/pricing`

---

### 5) Data file `data/pricing.json`
Referenced by server-side pricing module:
- `src/server/routes/pricing.js` – reads/writes `data/pricing.json` via `PRICING_PATH`

Mentions/comments indicating single source of truth:
- `routes/partners.js` – comment: compute strictly from pricing.json
- `server.js` – comment: compute strictly from pricing.json

---

## Classification: Safe to Remove vs Must Remain (for now)

Safe to remove (once admin links are also cleaned):
- `public/admin/pricing-manager.html`
- `public/admin/js/pricing-manager.js`
- `public/admin/css/pricing-manager.css`
- Inbound nav links to `/admin/pricing-manager.html` from:
  - `public/admin-providers.html`
  - `public/admin-bookings.html`
  - `public/admin-payments.html`
  - `public/admin-manual.html`
  - `public/admin-home.html`
  - `public/admin-availability.html`

Rationale: These files are exclusive to the legacy Price Manager UI. Removing the page requires removing/bypassing the nav links to avoid dead links. No other components import these assets directly.

Must remain (used by booking/payment flows):
- Server pricing API and integration:
  - `src/server/routes/pricing.js` (GET/POST `/api/pricing`, `computePriceCents`, access to `data/pricing.json`)
  - `server.js` (router mount)
  - `data/pricing.json` (source of truth)
- Frontend consumers in booking flow:
  - `public/js/booking-state.js` (uses `/api/pricing` to compute amounts)
  - `public/js/vehiclePriceMap.js` (uses `/api/pricing` for UI vehicle pricing)
- Payments flow:
  - `routes/partners.js` (computes server-side amount via pricing module; comment references pricing.json)

Rationale: These are actively used beyond the legacy Admin UI (booking computation and payments). Removing them would break booking/checkout.

---

## Recommended Cleanup Steps (no changes applied yet)
1) Remove nav links to `/admin/pricing-manager.html` from all admin pages listed above.
2) Remove the legacy UI files (`pricing-manager.html`, `.js`, `.css`).
3) Keep `/api/pricing` and `data/pricing.json` until the booking/payment flows are migrated off them.
4) When a new pricing source is in place, migrate:
   - `public/js/booking-state.js`
   - `public/js/vehiclePriceMap.js`
   - `routes/partners.js`
   - `src/server/routes/pricing.js` (or replace with new API)

No files were modified or deleted; this report is for planning a safe cleanup.
