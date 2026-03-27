# CHANGELOG

All notable changes to this project are documented in this file.

## 2026-03-27 — Countdown config fix (v973)

- **Fixed key mismatch** — admin acceptance save used `broadcastTimeoutMin` but server expected `broadcastTimeoutMinutes`. Now consistent.
- **Config endpoint** — `/api/driver-panel/config` now includes `acceptance` section.
- **Fallback** — countdown reads both key names for backwards compatibility.

## 2026-03-27 — Race condition fix + admin countdown (v972)

- **Accept endpoint hardened** — blocks accept if request is `nodriver`, `expired`, or `cancelled` (returns 410).
- **Admin "nodriver" → SSE broadcast** — marking a request as nodriver immediately removes the card from all drivers via SSE.
- **Admin countdown timer** — pending/sent requests show live countdown (⏱ M:SS) until broadcast expires. Turns red in last 60s, shows "Έληξε!" + beep + red row highlight when time runs out.
- **Configurable timeout** — countdown reads `broadcastTimeoutMinutes` from driver panel config (default 5 min).

## 2026-03-27 — History tab polish (v971)

- **Removed Ιστορικό title** — no longer needed.
- **Shorter summary boxes** — reduced vertical padding for a more rectangular/compact look.
- **Fixed date labels** — dates now show DD/MM format (was showing garbled text like "ar 23").
- **Row overflow fix** — added `overflow: hidden` + removed gap between rows for clean stacking.

## 2026-03-27 — History tab: summary boxes + edge-to-edge rows (v970)

- **Summary boxes:** 4 boxes (Σύνολο, Σήμερα, Εβδομάδα, Μήνας) in 2×2 grid inside accent-bordered frame. Each shows total € + date range. Independent of filters.
- **New API endpoint:** `/api/driver-panel/history-summary` returns pre-computed totals.
- **Edge-to-edge rows:** History trip rows now span full screen width with negative margins.
- **Responsive:** Scales correctly on small phones (359px), standard, tablets (768px+).
- **Light mode:** Summary frame + rows styled for both themes.

## 2026-03-27 — Unified accent border frames (v969)

- **Home ride card:** Restored full accent border + 14px border-radius (no longer cut off at edges).
- **Appointments filter card:** Border changed from subtle card-border to accent blue — same electric blue frame as ride cards.
- **Light mode:** Accent border preserved in both dark and light themes.

## 2026-03-27 — Driver Panel: iOS sound fix + edge-to-edge cards (v968)

- **iOS sound fix:** Pre-warm all Audio objects on first tap (same pattern as close sound). SSE new-ride alerts now play reliably on iOS instead of being silently blocked.
- **Edge-to-edge cards:** Route cards now span full screen width — zero side padding, no border-radius, top/bottom accent borders only.

## 2026-03-27 — Driver Panel Home UX fixes (v967)

- **Sound fix:** New ride alert now correctly reads driver's chosen sound from config (`sounds.defaults.new_ride`) instead of broken fallback path.
- **Removed visibilitychange sound:** Close sound no longer fires when switching apps on iPhone — only the ON/OFF button triggers sounds.
- **Removed emoji from badges:** Route card badges show plain "Άφιξη" / "Αναχώρηση" text without 🚗/✈️ emoji.
- **Route cards full-width:** Reduced container side-padding from 16px to 6px so cards stretch closer to screen edges.

## 2026-03-25 — PWA Standalone Refinements & Zoom Prevention (v927)

- **Footer positioning (PWA-only):** Changed standalone-mode footer `bottom` from `calc(8px + env(...))` to `env(safe-area-inset-bottom, 8px)` — eliminates black strip below footer on iPhone (MoveAthens + DriverSystem).
- **Zoom prevention:** Added `maximum-scale=1, user-scalable=no` to viewport meta on all 14 MoveAthens pages — native app behavior, no pinch-zoom.
- **AI Assistant layout:** Fixed header padding, back button positioning with safe-area calc, removed body padding override for fixed-layout page.
- **Chat form:** Reduced excessive bottom padding from 28px to 16px minimum.
- **Info page:** Added 8px margin between tabs and content panel.
- **Body box-sizing:** Added `box-sizing: border-box` to prevent padding overflow beyond viewport height.

## 2025-11-19 — Mode-Aware Availability Editor & Month Prefetch API

- Backend (`registerBookings`):
  - Extended `GET /api/availability` with `month` + `mode` parameters returning `{ trip_id, mode, month, days:[{date,capacity,taken,available}] }` for efficient calendar preloading.
  - Added `taken_custom` column (auto-migrated) enabling manual override of computed "taken" seats per date/mode.
  - Per-date `GET /api/availability` unchanged for existing consumers; now passes through manual `taken_custom` when present.
  - `POST /api/availability` accepts `taken` (optional) to store override alongside capacity (admin-auth protected); enforces `mercedes` capacity = 1.
  - Fallback capacities when no stored row: bus=trip default (or 50 via month endpoint fallback), van=trip default (or 7), mercedes=1.

- Admin UI:
  - New page `public/admin/trip-availability.html` with trip/mode selectors, flatpickr-based calendar, per-day editor (capacity, taken, computed available).
  - New script `public/admin/trip-availability.js` implements month prefetch caching, badge rendering (available seats), live redraw after save.
  - Badges turn red (full) when `available <= 0`.

- Validation Tests:
  - Confirmed booking flow returns `bus_full`, `van_full`, `mercedes_full` when trying to exceed capacity after filling for each mode.
  - Availability reflects updated taken counts immediately after bookings.

- Service Worker:
  - Added `'/admin/trip-availability.html'` to precache list to support offline admin navigation.

Future:
  - CSS refinement pass for the new admin page.
  - Potential bulk editing (range apply) & export/import of availability.


## 2025-11-12 — Dynamic pickups + trip itinerary in Provider/Driver

- Global presentation rule: panels always show customer pickups (from booking metadata) and the trip itinerary (tour stops and times) from the trip JSON files.
- Provider API:
  - `/provider/api/bookings/:id` synthesizes `route.full_path` when missing by appending trip JSON stops; augments existing routes with any missing tour stops.
  - Exposes `trip_info.start_time` from the trip file for UI display.
  - Added safe `addMinutes()` helper for fallback time spacing in both PG/SQLite paths.
- Provider UI (`public/provider/provider-bookings.js`):
  - Displays pickup list with fallback to `metadata.pickups`.
  - Shows Trip Info block with start time and note.
- Driver API (`/driver/api/bookings/:id`):
  - When `policies.presentation.show_full_route_to_panels` is true, composes pickups + trip JSON stops when `full_path` is absent, and computes pickup ETAs to reach the first tour stop on time.
- Driver UI (`public/driver/driver-route.js`):
  - Renders per-stop Google Maps links and a multi-stop navigation button; shows ETAs for pickups and scheduled time for the first tour stop.
- Tools: new script `scripts/create_acropolis_booking.js` creates an Acropolis booking with 3 pickups, seeds mapping/capacity, and ensures demo users.

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
  - Added overlay manager to `/trip.html` as well.
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
