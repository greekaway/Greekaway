# Routes Refactor Summary (Phases 1–7)

This document summarizes the progressive extraction of routes from the original monolithic `server.js` into focused modules.

## Goals
- Reduce size/complexity of `server.js`.
- Group related endpoints for easier maintenance.
- Preserve backward compatibility and keep tests green after each phase.
- Maintain a rollback path (backup of original server state).

## Extracted Modules
| Phase | Module | Purpose | Key Endpoints |
|-------|--------|---------|---------------|
| 1 | `lib/prompts.js` | Assistant prompt builder | (internal helper) |
| 2 | `lib/version.js`, `lib/assets.js` | Version & asset hashes | `/version.json`, asset computations |
| 3 | `src/server/routes/locales.js` | Locale listing & refresh | `/api/locales`, `/api/locales/reload` |
| 3 | `src/server/routes/docs.js` | Serve docs index & data | `/api/docs` |
| 3 | `src/server/routes/version.js` | Version routes | `/api/version`, `/api/version/build` |
| 4 | `src/server/assistant/routes.js` | Assistant endpoints | `/api/assistant/*` |
| 5 | `src/server/routes/bookings.js` | Public booking flow | `/api/bookings` (create/get), availability |
| 5 | `src/server/routes/adminBookings.js` | Admin bookings list + export + actions | `/admin/bookings`, `/admin/bookings.csv`, cancel/refund |
| 6 | `src/server/routes/adminMaintenance.js` | Backup & seed/cleanup ops | `/admin/backup-status`, `/api/backup/export`, seed & cleanup |
| 6 | `src/server/routes/adminTravelersGroups.js` | Travelers, pairing, groups, feedback | `/admin/travelers`, `/admin/suggest-pairs`, `/admin/groups`, `/api/feedback`, `/admin/feedback` |
| 7 | `src/server/routes/adminPayments.js` | Payments listings & CSV | `/admin/payments`, `/admin/payments.csv` |
| 7 | `src/server/routes/partnerOnboarding.js` | Stripe partner onboarding callbacks | `/partner-stripe-onboarding/callback`, `/api/partners/connect-callback` |

Existing legacy routers kept mounted (not yet refactored):
- `routes/partners.js`, `routes/manual-payments.js`, `routes/provider.js`, `routes/provider-availability.js`, `routes/partner-dispatch.js`, `routes/driver.js`, `routes/pickup-route.js`, `routes/admin-suppliers.js`.

## Dependency Injection Pattern
Each `register*` function accepts an object with only the dependencies it needs (e.g. `express`, `bookingsDb`, `checkAdminAuth`, `stripe`). This keeps modules decoupled and facilitates future testing/mocking.

## Admin Auth
`checkAdminAuth` is provided to modules; it validates session or Basic Auth credentials (`ADMIN_USER` / `ADMIN_PASS`). Avoid duplicating auth logic inside modules.

## Fallbacks & Resilience
- Payments & seed endpoints attempt Postgres first (if `DATABASE_URL` set), then SQLite, then JSON file fallback.
- `adminMaintenance` has an internal fallback for `ensureSeedColumns` if not injected.
- HTML fallback retained for `/admin/groups` when Accept header requests `text/html`.

## Next Refactor Candidates (Future Phases)
1. `routes/provider.js` (very large; can be split into provider profile, availability, and payouts).
2. `routes/driver.js` (driver dashboard vs route operations).
3. `routes/pickup-route.js` (could isolate scheduling logic vs read endpoints).
4. Stripe webhook logic into `src/server/routes/webhook.js` with clearer interfaces (already partially modular but could adopt register pattern).
5. Extract admin auth helpers and cookie parsing to `src/server/auth/adminAuth.js` for reuse.

## Testing Strategy
- Relied on existing Jest suite; after each phase ensure full pass.
- Potential to add focused unit tests for modules (e.g. seed/cleanup dry-run, payments CSV filtering). Deferred to keep refactor incremental.

## Rollback
Backup file retained: `server.backup.refactor-server-split-GP-20251112.js` allows diffing or restoration if issues are discovered.

## Conventions
- Module filenames: `adminX.js` for admin-only functionalities; `register*` pattern for explicit activation.
- Avoid side effects in module bodies (register endpoints only).
- Keep streaming/CSV logic localized to its module.

## How to Add a New Route Module
1. Create `src/server/routes/<name>.js` exporting `register<Name>(app, deps)`. 
2. Inject only required dependencies.
3. Patch `server.js` to require and invoke registration inside a try/catch for resilience.
4. Run tests. If new behavior, add/extend tests.
5. Update this doc.

## Quick Reference: Module Dependency Matrix
| Module | express | bookingsDb | checkAdminAuth | stripe | crypto | ensureSeedColumns |
|--------|---------|-----------|---------------|--------|--------|-------------------|
| bookings | ✔ | ✔ | ✖ | (PI update only via webhook) | ✔ | ✖ |
| adminBookings | (in app) | ✔ | ✔ | ✔ | ✖ | ✖ |
| adminMaintenance | ✔ | ✔ | ✔ | ✖ | ✔ (seed uses crypto) | (fallback) |
| adminTravelersGroups | ✔ | ✔ | ✔ | ✖ | ✔ | ✖ |
| adminPayments | (in app) | ✖ (opens own DB) | ✔ | ✖ | ✖ | ✖ |
| partnerOnboarding | (in app) | ✖ | ✖ | ✔ | ✖ | ✖ |
| assistant/routes | ✔ | ✔ | (indirect for some admin checks) | ✖ | ✔ | ✖ |

## Notes
- Some legacy routers still contain mixed concerns; future phases should continue the split for clarity.
- Consider environment-based feature toggles for modules not needed in certain deployments.

---
End of refactor summary.
