# CHANGELOG

All notable changes to this project are documented in this file.

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
