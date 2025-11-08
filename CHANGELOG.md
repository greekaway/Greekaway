# CHANGELOG

All notable changes to this project are documented in this file.

## 2025-11-08 — Driver Panel v2 (Auto-Refresh, Distance Matrix, Pickup Notifications)

- Driver Dashboard:
  - Added 30s auto-refresh for assignments (`driver-dashboard.js`) without full page reload; preserves action button state.
  - Minor UI enhancement for route viewing button.
- Route Details Page:
  - Displays dynamic ETA (`eta_local`) and distance between stops when available.
  - Auto-refresh every 30s to reflect re-ordered or newly frozen pickup times.
- Backend (Driver API):
  - `/driver/api/bookings/:id` now enriches stops using Google Distance Matrix when `GOOGLE_MAPS_API_KEY` is set.
  - Implements greedy nearest-neighbor ordering; persists ordering hint in `metadata.stops_sorted`.
  - Returns per-stop distance (meters + human text), duration seconds and computed local ETA.
- Pickup Notifications Service:
  - New scheduler `services/pickupNotifications.js` runs every 5 minutes (disabled in tests) to freeze pickup order ~24h before trip.
  - Calculates final stop order & pickup times, marks `metadata.pickup_frozen`, saves `final_pickup_times` and `stops_sorted`.
  - Emits console log notifications per stop (email sending optional via existing mail env vars; SMS placeholder only).
- Server wiring:
  - `server.js` boots the pickup notification scheduler and logs enablement status.
- Tests:
  - Added basic load test for the scheduler (`tests/pickup_notifications.test.js`). Skips timers during Jest via `NODE_ENV=test` guard.
- Env/Config:
  - Respects existing `GOOGLE_MAPS_API_KEY` for Distance Matrix; feature gracefully no-ops if key missing or API errors occur.
- Notes / Future:
  - Stub prepared for potential en-route notification trigger when driver marks a stop as picked (not yet implemented).

## 2025-10-10 — UI & behavior improvements

- Overlays (About, AI Assistant, Profile, Payment) refactored to full-screen modal pattern:
  - `.overlay` + `.overlay-inner` structure.
  - Top-right close button `.close-overlay`.
  - Only one overlay can be active at a time (overlay manager).
  - Click outside or press `Esc` to close overlays.
  - Overlays no longer cover the fixed footer (reserve `--footer-offset` / 80px).
  - Overlays are fully opaque to avoid background bleed-through.

- Trip pages:
  - Added overlay manager to `/trips/trip.html` as well.
  - Back button behavior improved (returns to category when available).
  - Navy background applied to `olympia` and `parnassos` trips.
  - Added persistent highlight via `sessionStorage` for clicked trip cards.

- CSS improvements:
  - Per-category background variables and cleaned overlay styles in `public/css/style.css` and `public/css/trip.css`.
  - `.logo-pop` animation for selected trip cards.

- Data/UI updates:
  - New trips added (e.g. `lefkas`, `parnassos`) and videos updated.
  - `public/data/tripindex.json` updated accordingly.

- Server:
  - `server.js` injects Google Maps API key from environment when serving `trip.html` (no API key committed to repo).

- Dev/tools:
  - Kept lightweight logger `G` in `public/js/main.js` (debug off by default).
  - Utility headless checks remain under `tools/`.

- Cleanup / small refactors:
  - Replaced inline display toggles with class-based overlay control.
  - Removed unnecessary transparency in overlays.


If you want the changelog to follow a different format (Keep a Changelog, semantic-release, or include PR/commit references), tell me and I will update it.
