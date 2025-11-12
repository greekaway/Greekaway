# Policies-driven dispatch gate

This document explains how policies.json is enforced before sending trips to partners/drivers.

What was added:
- policies.json: operational rules for trip execution, grouping, pickup policy, and dispatch.
- services/policyService.js: loads policies and validates a trip cohort (same trip_id + date) before dispatch.
- services/dispatchService.js: now calls policyService.validateBeforeDispatch(bookingId) and blocks dispatch with an admin SSE warning if any rule is violated.
- services/env.js: centralized .env loader for local runs; imported by services that need environment variables.

Validation currently includes:
- Minimum participants (trip_execution.min_participants)
- Pickup coordinates presence (pickup_policy.require_coordinates). If missing and geolocation_fallback is true, a violation is raised advising geocoding.
- Pickup distance clustering: if nearest-neighbor max distance exceeds trip_execution.max_pickup_distance_km, dispatch is blocked with a suggestion to split into a small van.
- Elastic trigger advisory (trip_execution.elastic_mode_trigger): signals when low occupancy should enable elastic matching. It does not bypass the minimum requirement.

Admin notifications:
- On violation, an SSE event is broadcast with type `policy_violation` containing the booking id and reasons.
- SSE endpoint is exposed from partners routes; see routes/partners.js for admin event-stream setup.

Auto-assign driver:
- If dispatch_policy.auto_assign_driver is true, the dispatch service will assign the first active driver of the partner (provider) to the booking if no driver is assigned yet.

Notes:
- If coordinates are not present in bookings, make sure pickup_lat/pickup_lng are stored (see computePickupTimes) or add a geocoding step prior to dispatch.
- The email payload to partners already includes a Google Maps link to the pickup.

## Local .env loading

- We load `.env` automatically in `server.js` and across services via `services/env.js`.
- For standalone scripts, either call `require('dotenv').config()` at the top or rely on services that import `services/env.js`.
- Supported env keys (non-exhaustive):
	- GOOGLE_MAPS_API_KEY
	- DATABASE_URL (Postgres)
	- SQLITE_DB_PATH (override SQLite file path for isolated runs)
	- MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS/MAIL_FROM
	- DISPATCH_ENABLED, BASE_URL

## Seed script for quick policy validation

- Script: `scripts/seed_policy_validation.js`
- Creates an isolated SQLite DB at `data/policy_seed.sqlite3` (using `SQLITE_DB_PATH`) so the real DB is untouched.
- Seeds 3 cohorts for today’s date by default:
	- TEST_PASS_TRIP (4 people, close Athens addresses) → expected PASS
	- TEST_LOW_TRIP (3 people) → expected VIOLATION (below_min_participants)
	- TEST_FAR_TRIP (4 people, far apart > 15km) → expected VIOLATION (pickup_distance_exceeded)
- Run:
	- `node scripts/seed_policy_validation.js`
	- Optional: `node scripts/seed_policy_validation.js --date YYYY-MM-DD`

