# Split Report (Initial Analysis)

> Generated on 2025-11-11. Branch: `refactor/split-files/GP-20251111`
> Criteria: >5000 lines (critical), 1000–4999 lines (priority), >200KB (size concern), multi‑concern logic+view.

## Top 20 Candidate Files (Code Only)

Below are 20 code (non-media) files drawn from size/line reports. For each: path, size (bytes), lines, type classification, rationale, proposed split modules/structure, difficulty, risks.

### 1. `server.js` — 151,952 bytes — 3,015 lines — backend entry
Rationale: Monolithic server sets up Express app, routes, middleware, SSE, Stripe/webhook helpers mixed.
Proposed Split:
- `src/server/index.js` (bootstrap, config load)
- `src/server/app.js` (Express app + middleware registration)
- `src/server/routes/*.js` (one file per domain: bookings, suppliers, drivers, payments)
- `src/server/services/*.js` (shared business logic)
- `src/server/webhooks/stripe.js`
Difficulty: medium
Risks: Import path shifts, environment variable loading order, needing integration tests for SSE and Stripe.

### 2. `public/js/main.js` — 92,963 bytes — 1,570 lines — frontend bundle (hand-maintained)
Rationale: Combines UI logic, DOM manipulation, booking flow control, possibly i18n usage.
Proposed Split:
- `public/js/booking/index.js` (or `src/frontend/booking/` if build introduced)
- `public/js/booking/dom.js`
- `public/js/booking/state.js`
- `public/js/booking/i18n.js`
- `public/js/booking/api.js`
Difficulty: medium
Risks: Global variables reliance, ordering of script tags, regression in booking flow.

### 3. `public/css/style.css` — 46,851 bytes — 1,383 lines — global styles
Rationale: Large catch‑all styling mixing base reset, layout, components, utilities.
Proposed Split:
- `public/css/style.base.css` (resets, typography)
- `public/css/style.layout.css` (grid, flex layouts)
- `public/css/style.components.css` (buttons, forms)
- (Later) adopt a build step concatenating.
Difficulty: low
Risks: Cascade/order differences; need to ensure link order preserved.

### 4. `routes/provider.js` — 39,931 bytes — 808 lines — backend route module
Rationale: Multiple concerns: auth checks, DB queries, formatting, validation.
Proposed Split:
- `src/routes/provider/index.js`
- `src/routes/provider/handlers/*.js` (group by operation: listProviders, updateProfile, availability)
- `src/services/providerService.js`
Difficulty: medium
Risks: Coupled to shared DB handle; potential circular imports if split poorly.

### 5. `routes/partners.js` — 38,460 bytes — 844 lines — backend route module
Rationale: Mixed partner CRUD, payout, dispatch logic.
Proposed Split:
- `src/routes/partners/index.js`
- `src/routes/partners/handlers/*.js`
- `src/services/partnerService.js`
Difficulty: medium
Risks: Need consistent error handling and shared response formatting.

### 6. `public/step2.html` — 34,523 bytes — 654 lines — booking step view
Rationale: Heavy inline structure; could benefit from partials/components.
Proposed Split:
- `views/booking/step2.html` (core layout)
- `views/booking/partials/guest-form.html`
- `views/booking/partials/addons.html`
Difficulty: medium
Risks: If server-side assembly absent, may require introducing a templating layer.

### 7. `routes/driver.js` — 28,119 bytes — 532 lines — backend route module
Rationale: Driver auth, route listing, status updates bundled.
Proposed Split:
- `src/routes/driver/index.js`
- `src/routes/driver/handlers/*.js`
- `src/services/driverService.js`
Difficulty: low-medium
Risks: Token/session dependency changes; test updates.

### 8. `public/data/trips/santorini.json` — 24,729 bytes — 298 lines — data schema/content
Rationale: Rich multilingual content; large JSON; may grow similarly for many trips.
Proposed Split:
- `public/data/trips/santorini/meta.json` (id, title, category)
- `public/data/trips/santorini/stops.json`
- `public/data/trips/santorini/locale/en.json` etc.
Difficulty: low
Risks: Loader code must aggregate; ensure caching not fragmented.

### 9. `routes/admin-suppliers.js` — 23,981 bytes — 396 lines — backend route module
Rationale: Supplier admin listing, filtering, Stripe payout status logic.
Proposed Split:
- `src/routes/admin/suppliers/index.js`
- `src/routes/admin/suppliers/handlers/*.js`
- `src/services/supplierAdminService.js`
Difficulty: low-medium
Risks: Query performance after abstraction; test path changes.

### 10. `public/js/admin-home.js` — 23,880 bytes — 548 lines — frontend admin dashboard
Rationale: Mixes DOM queries, state, AJAX.
Proposed Split:
- `public/js/admin/home/index.js`
- `public/js/admin/home/dom.js`
- `public/js/admin/home/api.js`
Difficulty: medium
Risks: Initialization order; possible reliance on global window objects.

### 11. `public/js/booking-addons.js` — 22,885 bytes — 423 lines — booking flow component
Rationale: Addons logic tightly coupled to main booking state.
Proposed Split:
- `public/js/booking/addons/index.js`
- `public/js/booking/addons/ui.js`
- `public/js/booking/addons/calculations.js`
Difficulty: low-medium
Risks: Shared state sync with main booking script.

### 12. `public/css/trip.css` — 22,632 bytes — 498 lines — trip page styles
Rationale: Specific page styling containing layout + component + utility.
Proposed Split:
- `public/css/trip.layout.css`
- `public/css/trip.components.css`
Difficulty: low
Risks: Specificity changes.

### 13. `public/step3.html` — 22,069 bytes — 373 lines — booking summary view
Rationale: Monolithic HTML; similar partialization as step2.
Proposed Split:
- `views/booking/step3.html`
- `views/booking/partials/summary-items.html`
- `views/booking/partials/payment-block.html`
Difficulty: medium
Risks: Templating introduction complexity.

### 14. `public/js/manual-payments.js` — 20,273 bytes — 474 lines — admin manual payment logic
Rationale: UI logic, validation, network requests intertwined.
Proposed Split:
- `public/js/admin/payments/index.js`
- `public/js/admin/payments/validation.js`
- `public/js/admin/payments/api.js`
Difficulty: medium
Risks: Need to centralize error messaging; retest manual payment path.

### 15. `webhook.js` — 19,380 bytes — 371 lines — Stripe webhook & related utilities
Rationale: Single file mixing verification, event dispatch, logging.
Proposed Split:
- `src/webhooks/stripe/index.js`
- `src/webhooks/stripe/handlers/*.js`
- `src/webhooks/stripe/verify.js`
Difficulty: medium
Risks: Signature verification timing; ensure raw body access remains.

### 16. `routes/pickup-route.js` — 17,980 bytes — 347 lines — backend route
Rationale: Contains optimization, time computations, response shaping.
Proposed Split:
- `src/routes/pickup/index.js`
- `src/services/pickup/optimization.js`
- `src/services/pickup/timeWindow.js`
Difficulty: medium
Risks: Performance regressions; requires unit tests for time calculations.

### 17. `public/js/i18n.js` — 15,344 bytes — 344 lines — frontend i18n loader
Rationale: Loads and applies translations; could separate data, formatting, DOM updates.
Proposed Split:
- `public/js/i18n/core.js`
- `public/js/i18n/dom.js`
- `public/js/i18n/loader.js`
Difficulty: low
Risks: Race conditions if async loading changes.

### 18. `routes/provider-availability.js` — 13,438 bytes — 318 lines — backend route
Rationale: Aggregates availability logic directly with HTTP layer.
Proposed Split:
- `src/routes/provider/availability.js`
- `src/services/provider/availabilityService.js`
Difficulty: low
Risks: Shared caching; ensure identical JSON shape.

### 19. `services/dispatchService.js` — 11,849 bytes — 246 lines — backend service
Rationale: Dense logic; may mix dispatch planning, grouping, notifications.
Proposed Split:
- `src/services/dispatch/core.js`
- `src/services/dispatch/grouping.js`
- `src/services/dispatch/notifications.js`
Difficulty: medium
Risks: Hidden shared mutable state; concurrency issues.

### 20. `public/css/booking.css` — 44,282 bytes — 864 lines — booking page styles
Rationale: Large page-specific stylesheet; separation for readability.
Proposed Split:
- `public/css/booking.base.css`
- `public/css/booking.components.css`
- `public/css/booking.overrides.css`
Difficulty: low
Risks: Ordering affects overrides; must maintain inclusion order.

## Issue Links
- [server.js split](../docs/issues/split-server-js.md)
- [public/js/main.js split](../docs/issues/split-public-js-main-js.md)
- [public/css/style.css split](../docs/issues/split-public-css-style-css.md)
- [routes/provider.js split](../docs/issues/split-routes-provider-js.md)
- [routes/partners.js split](../docs/issues/split-routes-partners-js.md)
- [public/step2.html split](../docs/issues/split-public-step2-html.md)
- [routes/driver.js split](../docs/issues/split-routes-driver-js.md)
- [public/data/trips/santorini.json split](../docs/issues/split-public-data-trips-santorini-json.md)
- [routes/admin-suppliers.js split](../docs/issues/split-routes-admin-suppliers-js.md)
- [public/js/admin-home.js split](../docs/issues/split-public-js-admin-home-js.md)
- [public/js/booking-addons.js split](../docs/issues/split-public-js-booking-addons-js.md)
- [public/css/trip.css split](../docs/issues/split-public-css-trip-css.md)
- [public/step3.html split](../docs/issues/split-public-step3-html.md)
- [public/js/manual-payments.js split](../docs/issues/split-public-js-manual-payments-js.md)
- [webhook.js split](../docs/issues/split-webhook-js.md)
- [routes/pickup-route.js split](../docs/issues/split-routes-pickup-route-js.md)
- [public/js/i18n.js split](../docs/issues/split-public-js-i18n-js.md)
- [routes/provider-availability.js split](../docs/issues/split-routes-provider-availability-js.md)
- [services/dispatchService.js split](../docs/issues/split-services-dispatchService-js.md)
- [public/css/booking.css split](../docs/issues/split-public-css-booking-css.md)

## Next Steps
1. Create issue stubs per file with checklist (analysis, create modules, migrate imports, add tests).
2. Implement PoC: split `public/css/style.css` into base + layout as example.
3. Confirm tests green post-PoC.
4. Expand proposal if build tooling adopted (e.g., bundler for CSS/JS).

## Prioritized Top 5 (Critical)
1. `server.js`
2. `public/js/main.js`
3. `public/css/style.css` (PoC target)
4. `routes/provider.js`
5. `routes/partners.js`
