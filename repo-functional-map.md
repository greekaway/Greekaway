# Greekaway Functional Map

Στόχος: πλήρης λειτουργική χαρτογράφηση ώστε οι μελλοντικές αλλαγές να γίνονται στα σωστά υπάρχοντα αρχεία, χωρίς δημιουργία νέων κατά λάθος.

Σημείωση για canonical/source-of-truth: όπου υπάρχει διπλή παρουσία (π.χ. server vs public bundles), ορίζεται παρακάτω τι θεωρείται canonical.

---

## ROUTES

- `routes/admin-suppliers.js` — Express route: endpoints για suppliers, payouts, φίλτρα admin — Χρήση: backend route (Admin Panel APIs) — Canonical
- `routes/driver.js` — Express route: endpoints για driver app (login, routes) — Χρήση: backend route (Driver Panel APIs) — Canonical
- `routes/manual-payments.js` — Express route: χειρισμός manual payments — Χρήση: backend route (Admin/Manual Payments) — Canonical
- `routes/partner-dispatch.js` — Express route: partner dispatch flows — Χρήση: backend route (Partners) — Canonical
- `routes/partners.js` — Express route: διαχείριση partners — Χρήση: backend route (Admin/Partners) — Canonical
- `routes/pickup-route.js` — Express route: build/serve pickup routes — Χρήση: backend route (Driver/Provider flows) — Canonical
- `routes/provider-availability.js` — Express route: availability endpoints — Χρήση: backend route (Provider Panel APIs) — Canonical
- `routes/provider.js` — Express route: provider logic (auth, profile) — Χρήση: backend route (Provider Panel APIs) — Canonical

## SERVICES

- `services/dispatchService.js` — Επιχειρησιακή λογική dispatch (ανάθεση/δρομολόγηση) — Χρήση: routes/service calls — Canonical
- `services/geocoding.js` — Geocoding wrapper/βοηθοί — Χρήση: services/routes — Canonical
- `services/pickupNotifications.js` — Ειδοποιήσεις σχετικές με pickups — Χρήση: routes/jobs — Canonical
- `services/computePickupTimes.js` — Υπολογισμός ωρών/παραμέτρων pickups — Χρήση: routes/service calls — Canonical
- `services/env.js` — Ανάγνωση/συγκέντρωση env παραμέτρων — Χρήση: server/services — Canonical
- `services/distance.js` — Υπολογισμός αποστάσεων — Χρήση: services/routes — Canonical
- `services/adminSse.js` — Server-Sent Events για admin dashboard — Χρήση: admin live updates — Canonical
- `services/routeTemplate.js` — Δημιουργία/εφαρμογή προτύπων διαδρομών — Χρήση: pickup/driver/provider — Canonical
- `services/policyService.js` — Πολιτικές χρέωσης/κανόνες — Χρήση: payments/validation — Canonical

## SERVER CORE

- `server.js` — Κύρια εκκίνηση Express, gluing routes/middleware — Χρήση: backend core — Canonical
- `src/server/app.js` — App setup/modularization (Express instance) — Χρήση: backend core — Canonical
- `src/server/routes/adminPayments.js` — Modular admin payments endpoints — Χρήση: backend routes — Canonical
- `src/server/routes/locales.js` — Serve/handle locales (server-side) — Χρήση: backend routes — Canonical
- `src/server/routes/adminBookings.js` — Admin bookings endpoints — Χρήση: backend routes — Canonical
- `src/server/routes/version.js` — API έκδοσης — Χρήση: backend route — Canonical
- `src/server/routes/adminTravelersGroups.js` — Διαχείριση groups — Χρήση: backend routes — Canonical
- `src/server/routes/docs.js` — Docs/health endpoints — Χρήση: backend routes — Canonical
- `src/server/routes/bookings.js` — Public/checkout bookings endpoints — Χρήση: backend routes — Canonical
- `src/server/routes/partnerOnboarding.js` — Partner onboarding — Χρήση: backend routes — Canonical
- `src/server/routes/adminMaintenance.js` — Admin maintenance ops — Χρήση: backend routes — Canonical
- `src/server/lib/assets.js` — Βοηθοί assets/static — Χρήση: server libs — Canonical
- `src/server/lib/cacheBust.js` — Cache-busting helpers — Χρήση: server libs — Canonical
- `src/server/lib/version.js` — Έκδοση/metadata server — Χρήση: server libs — Canonical
- `src/server/lib/htmlVersioning.js` — HTML versioning injection — Χρήση: server libs — Canonical
- `src/server/lib/prompts.js` — Prompts/helpers (assistant-related) — Χρήση: server libs — Canonical
- `src/server/assistant/knowledge.js` — Assistant knowledge adapters — Χρήση: assistant features — Canonical
- `src/server/assistant/routes.js` — Assistant routes — Χρήση: backend routes — Canonical
- `webhook.js` — Webhook handler (Stripe/events) — Χρήση: payments webhooks — Canonical

## CLIENT JS (public/js/*)

- `public/js/main.js` — Κύρια λογική landing/welcome — Χρήση: public site — Canonical
- `public/js/welcome.js` — Εφέ/ροές αρχικής — Χρήση: public site — Canonical
- `public/js/welcome-lang.js` — Επιλογή γλώσσας — Χρήση: public site — Canonical
- `public/js/overlay-manager.js` — Overlay/help UI — Χρήση: public pages — Canonical
- `public/js/payment-request.js` — Payment Request API flow — Χρήση: checkout — Canonical
- `public/js/booking-addons.js` — Πρόσθετα κράτησης — Χρήση: checkout step2/3 — Canonical
- `public/js/manual-payments.js` — Λογική σελίδας manual payments — Χρήση: public manual-payments — Canonical
- `public/js/i18n.js` — Φόρτωση public i18n bundles — Χρήση: public pages — Canonical
- `public/js/assistant.js` — UI για assistant — Χρήση: public/admin — Canonical
- `public/js/feedback.js` — Φόρμα feedback — Χρήση: public pages — Canonical
- `public/js/mobile-vh-fix.js` — Viewport fixes κινητών — Χρήση: public pages — Canonical
- `public/js/theme.js` — Theme toggling/storage — Χρήση: public/admin — Canonical
- `public/js/carousel-config.js` — Carousel setup — Χρήση: landing — Canonical
- `public/js/footer.js` — Footer interactions — Χρήση: public — Canonical
- `public/js/notification-bubble.js` — Notifications UI — Χρήση: admin/public — Canonical
- `public/js/admin-home.js` — Admin home dashboard UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-ui.js` — Κοινά admin helpers — Χρήση: Admin Panel — Canonical
- `public/js/admin-bookings.js` — Admin κρατήσεις UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-providers.js` — Admin providers UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-availability.js` — Admin availability UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-payments.js` — Admin payments UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-groups.js` — Admin groups UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-seeds.js` — Admin seed ops UI — Χρήση: Admin Panel — Canonical
- `public/js/admin-theme-toggle.js` — Theme toggle Admin — Χρήση: Admin Panel — Canonical
- `public/js/admin-manual.js` — Admin Manual page — Χρήση: Admin Panel — Canonical
- `public/js/admin-suppliers.js` — Admin Suppliers page — Χρήση: Admin Panel — Canonical

## PROVIDER PANEL (public/provider/*)

- `public/provider/provider.js` — Κοινή λογική Provider app — Χρήση: Provider Panel — Canonical
- `public/provider/provider-bookings.js` — UI Booking λίστες — Χρήση: Provider Panel — Canonical
- `public/provider/provider-payments.js` — UI Πληρωμές — Χρήση: Provider Panel — Canonical
- `public/provider/provider-drivers.js` — UI Drivers management — Χρήση: Provider Panel — Canonical
- `public/provider/provider-availability.js` — UI Διαθεσιμότητα — Χρήση: Provider Panel — Canonical
- `public/provider/login.html` — Login view — Χρήση: Provider Panel — Canonical
- `public/provider/dashboard.html` — Dashboard view — Χρήση: Provider Panel — Canonical
- `public/provider/bookings.html` — Bookings view — Χρήση: Provider Panel — Canonical
- `public/provider/payments.html` — Payments view — Χρήση: Provider Panel — Canonical
- `public/provider/provider-bookings.html` — Bookings alt view — Χρήση: Provider Panel — Canonical
- `public/provider/provider-profile.html` — Profile view — Χρήση: Provider Panel — Canonical
- `public/provider/availability.html` — Availability view — Χρήση: Provider Panel — Canonical
- `public/provider/provider-drivers.html` — Drivers view — Χρήση: Provider Panel — Canonical
- `public/provider/driver-activate.html` — Driver activation — Χρήση: Provider Panel — Canonical
- `public/provider/provider-profile.css` — Στυλ profile — Χρήση: Provider Panel — Canonical
- `public/provider/provider-availability.css` — Στυλ availability — Χρήση: Provider Panel — Canonical
- `public/provider/provider-bookings.css` — Στυλ bookings — Χρήση: Provider Panel — Canonical
- `public/provider/provider-payments.css` — Στυλ payments — Χρήση: Provider Panel — Canonical
- `public/provider/provider-drivers.css` — Στυλ drivers — Χρήση: Provider Panel — Canonical
- `public/provider/provider.css` — Κοινά στυλ — Χρήση: Provider Panel — Canonical
- `public/provider/provider-footer.css` — Στυλ footers — Χρήση: Provider Panel — Canonical
- `public/provider/footer/footer-*.html` — Footer partials — Χρήση: Provider Panel — Canonical
- `public/provider/theme-driver.css` — Theme για driver-like — Χρήση: Provider Panel — Canonical

## DRIVER PANEL (public/driver/*)

- `public/driver/driver.js` — Κοινή λογική Driver app — Χρήση: Driver Panel — Canonical
- `public/driver/driver-dashboard.js` — UI Dashboard — Χρήση: Driver Panel — Canonical
- `public/driver/driver-route.js` — UI Route navigation — Χρήση: Driver Panel — Canonical
- `public/driver/driver-scan.js` — UI QR scanning — Χρήση: Driver Panel — Canonical
- `public/driver/driver-profile.js` — UI Profile — Χρήση: Driver Panel — Canonical
- `public/driver/pwa-driver-install.js` — PWA install flow — Χρήση: Driver Panel — Canonical
- `public/driver/driver-login.html` — Login view — Χρήση: Driver Panel — Canonical
- `public/driver/driver-dashboard.html` — Dashboard view — Χρήση: Driver Panel — Canonical
- `public/driver/driver-route.html` — Route view — Χρήση: Driver Panel — Canonical
- `public/driver/driver-scan.html` — Scan view — Χρήση: Driver Panel — Canonical
- `public/driver/driver-profile.html` — Profile view — Χρήση: Driver Panel — Canonical
- `public/driver/home/index.html` — Driver home landing — Χρήση: Driver Panel — Canonical
- `public/driver/driver.css` — Κοινά στυλ — Χρήση: Driver Panel — Canonical
- `public/driver/driver-dashboard.css` — Στυλ dashboard — Χρήση: Driver Panel — Canonical
- `public/driver/driver-route.css` — Στυλ route — Χρήση: Driver Panel — Canonical
- `public/driver/driver-scan.css` — Στυλ scan — Χρήση: Driver Panel — Canonical
- `public/driver/driver-profile.css` — Στυλ profile — Χρήση: Driver Panel — Canonical

## ADMIN PANEL (public/admin/*)

- `public/admin.html` — Admin root — Χρήση: Admin Panel — Canonical
- `public/admin-home.html` — Admin dashboard alt — Χρήση: Admin — Canonical
- `public/admin-bookings.html` — Σελίδα κρατήσεων — Χρήση: Admin — Canonical
- `public/admin-availability.html` — Σελίδα διαθεσιμότητας — Χρήση: Admin — Canonical
- `public/admin-providers.html` — Σελίδα providers — Χρήση: Admin — Canonical
- `public/admin-manual.html` — Admin Manual — Χρήση: Admin — Canonical
- `public/admin-payments.html` — Σελίδα πληρωμών — Χρήση: Admin — Canonical
- `public/admin-groups.html` — Σελίδα groups — Χρήση: Admin — Canonical
- `public/admin/home/index.html` — Home SPA/landing — Χρήση: Admin — Canonical
- `public/admin-addons/admin-dispatch.js` — Επιπλέον dispatch UI — Χρήση: Admin — Canonical
- `public/admin-addons/admin-dispatch.css` — Στυλ dispatch addon — Χρήση: Admin — Canonical

## I18N (locales/* και public/i18n/*)

- `locales/*.json` — Server-side μεταφράσεις (πηγή αλήθειας) — Χρήση: server rendering/APIs — Canonical (Source of Truth)
- `public/i18n/*.json` — Public bundles για client — Χρήση: client loader (`public/js/i18n.js`) — Παράγονται/συγχρονίζονται από `locales/*`
- `booking_i18n_verify.json` — Έλεγχος/αναφορά i18n — Χρήση: tooling

## DATA (data/*)

- `data/db.sqlite3` — Κύρια SQLite DB — Χρήση: runtime data — Canonical runtime δεδομένων
- `data/policy_seed.sqlite3` — Seed DB πολιτικών — Χρήση: seeds/tests
- `data/knowledge.json` — Knowledge base (γενικό) — Χρήση: assistant/services
- `data/ai/knowledge.json` — AI ειδική γνώση — Χρήση: assistant
- `data/db-backups/db.sqlite3.*.bak` — Backups DB — Χρήση: ops/backups
- `data/test-seeds/seed-admin-*.json` — Test/seed δεδομένα — Χρήση: tests/dev

## HTML views (public/*.html)

- `public/index.html` — Landing σελίδα — Χρήση: public
- `public/trips.html` — Λίστα ταξιδιών — Χρήση: public
- `public/about.html` — About σελίδα — Χρήση: public
- `public/about/index.html` — About (folder variant) — Χρήση: public
- `public/checkout.html` — Checkout Step 1 — Χρήση: public
- `public/step2.html` — Checkout Step 2 — Χρήση: public
- `public/step3.html` — Checkout Step 3 — Χρήση: public
- `public/manual-payments.html` — Manual payments — Χρήση: public
- `public/offline.html` — Offline fallback — Χρήση: PWA
- `public/partner-agreement.html` — Συμφωνητικό partner — Χρήση: public
- `public/partner-agreement/index.html` — Συμφωνητικό variant — Χρήση: public
- `public/partner-manual-onboarding.html` — Partner onboarding — Χρήση: public
- `public/partner-manual-onboarding/index.html` — Onboarding variant — Χρήση: public

Σημ.: Admin/Provider/Driver HTML βρίσκονται στις αντίστοιχες ενότητες και δεν επαναλαμβάνονται εδώ.

## CSS (public/css/*)

- `public/css/style.css` — Βασικά στυλ site — Χρήση: public — Canonical
- `public/css/theme.css` — Θέματα/variables — Χρήση: public — Canonical
- `public/css/welcome.css` — Στυλ landing — Χρήση: public
- `public/css/cards.css` — Κάρτες — Χρήση: public
- `public/css/about.css` — About page — Χρήση: public
- `public/css/booking.css` — Booking flow — Χρήση: checkout
- `public/css/checkout.css` — Checkout UI — Χρήση: checkout
- `public/css/step2.css` — Checkout step2 — Χρήση: checkout
- `public/css/step3.css` — Checkout step3 — Χρήση: checkout
- `public/css/trip.css` — Trip page — Χρήση: trips
- `public/css/footer-welcome.css` — Footer landing — Χρήση: public
- `public/css/footer-rounded.css` — Footer rounded — Χρήση: public
- `public/css/admin-core.css` — Κοινά admin — Χρήση: Admin
- `public/css/admin-home.css` — Admin home — Χρήση: Admin
- `public/css/admin-common.css` — Admin κοινά — Χρήση: Admin
- `public/css/admin-bookings.css` — Admin bookings — Χρήση: Admin
- `public/css/admin-providers.css` — Admin providers — Χρήση: Admin
- `public/css/admin-availability.css` — Admin availability — Χρήση: Admin
- `public/css/admin-manual.css` — Admin manual — Χρήση: Admin
- `public/css/admin-payments.css` — Admin payments — Χρήση: Admin
- `public/css/admin-tables.css` — Admin πίνακες — Χρήση: Admin
- `public/css/admin-cleanup.css` — Admin cleanup — Χρήση: Admin
- `public/css/admin-theme-toggle.css` — Admin theme toggle — Χρήση: Admin
- `public/css/notification-bubble.css` — Notification bubbles — Χρήση: public/admin
- `public/pwa.css` — PWA styles — Χρήση: PWA
- `public/pwa-ios.css` — iOS PWA fixes — Χρήση: PWA iOS

Σημ.: Στυλ για Provider/Driver panels βρίσκονται στις αντίστοιχες ενότητες.

## TOOLS / SCRIPTS

Tools (dev/ops):
- `tools/inventory.js` — Γεννήτρια απογραφής repo (JSON/CSV/MD στο `reports/`) — Χρήση: tooling — Canonical
- `tools/backup_db.sh` — Backup SQLite — Χρήση: ops
- `tools/upload_to_s3.js` — Μεταφόρτωση assets/backups — Χρήση: ops
- `tools/run_dispatch_migration.js` — Migration dispatch — Χρήση: ops
- `tools/run_bookings_migration.js` — Migration bookings — Χρήση: ops
- `tools/migrate_sqlite_to_postgres.js` — Μεταφορά DB — Χρήση: ops
- `tools/seed_driver_routes.js` — Seed διαδρομών οδηγών — Χρήση: dev/test
- `tools/seed_provider_availability.js` — Seed διαθεσιμότητας — Χρήση: dev/test
- `tools/seed_dispatch_test.js` — Seed dispatch test data — Χρήση: dev/test
- `tools/seed_test_drivers.js` — Seed drivers — Χρήση: dev/test
- `tools/set_local_driver_password.js` — Ορισμός κωδ. driver — Χρήση: dev
- `tools/set_local_provider_password.js` — Ορισμός κωδ. provider — Χρήση: dev
- `tools/get_driver_token.js` — Ανάκτηση driver token — Χρήση: dev
- `tools/ensure_dispatch_sqlite.js` — Διασφάλιση DB αρχείων — Χρήση: dev
- `tools/ensure_partner_row.js` — Δημιουργία/εξασφάλιση partner — Χρήση: dev
- `tools/auto_geocode_trips.js` — Αυτόματο geocode trips — Χρήση: content ops
- `tools/check_trip_bg.js` — Έλεγχος background trip — Χρήση: QA
- `tools/check_navigation.js` — Smoke πλοήγησης — Χρήση: QA
- `tools/check_booking_dom.js` — Έλεγχος DOM booking — Χρήση: QA
- `tools/check_i18n_keys.js` — Έλεγχος κλειδιών i18n — Χρήση: QA/i18n
- `tools/verify_booking_i18n.js` — Επιβεβαίωση i18n bundles — Χρήση: QA/i18n
- `tools/compare_i18n_bundles.js` — Σύγκριση bundles — Χρήση: i18n
- `tools/generate_public_i18n_dryrun.js` — Dryrun παραγωγής public i18n — Χρήση: i18n
- `tools/convert_logo_to_webp.js` — Μετατροπή λογότυπου — Χρήση: assets
- `tools/verify_cat_classes.js` — Έλεγχος κατηγοριών UI — Χρήση: QA
- `tools/record_booking_flow.js` — Καταγραφή ροής booking — Χρήση: QA
- `tools/capture_booking_step0.js` — Screenshot step0 — Χρήση: QA
- `tools/capture_booking_step1.js` — Screenshot step1 — Χρήση: QA
- `tools/capture_booking_step1_desktop.js` — Screenshot step1 desktop — Χρήση: QA
- `tools/booking_smoke_test.js` — Smoke test booking (mobile) — Χρήση: QA/Tasks — Canonical
- `tools/booking_smoke_test_multi.js` — Multi-viewport screenshots — Χρήση: QA/Tasks — Canonical
- `tools/admin_auth_check.js` — Έλεγχος admin auth — Χρήση: QA
- `tools/admin_home_cache_check.js` — Έλεγχος cache admin home — Χρήση: QA
- `tools/admin_functional_smoke.js` — Smoke Admin — Χρήση: QA
- `tools/admin_visual_check.js` — Οπτικός έλεγχος admin — Χρήση: QA
- `tools/check_env_admin.js` — Έλεγχος μεταβλητών admin — Χρήση: QA
- `tools/test_places_autocomplete.js` — Δοκιμή autocomplete — Χρήση: QA
- `tools/test_assistant_trip.js` — Δοκιμή assistant trip — Χρήση: QA
- `tools/print_dispatch_log.js` — Εκτύπωση logs dispatch — Χρήση: dev/ops
- `tools/set_capacity.js` — Ρύθμιση χωρητικοτήτων — Χρήση: ops/content
- `tools/check_parnassos.js` — Έλεγχος δεδομένων Parnassos — Χρήση: content QA
- `tools/debug_calendar.js` — Debug ημερολογίου — Χρήση: QA

Scripts (ops/dev):
- `scripts/updateVersion.js` — Ενημέρωση `version.json`/refs — Χρήση: ops — Canonical
- `scripts/setup_stripe_webhook.sh` — Ρύθμιση Stripe webhook — Χρήση: ops
- `scripts/generate_split_reports.sh` — Δημιουργία split reports — Χρήση: ops
- `scripts/bootstrap.sh` — Τοπικό bootstrap — Χρήση: dev
- `scripts/demo_sqlite_demo_ops.sql` — Βοηθητικά SQL — Χρήση: ops
- `scripts/assign_booking.js` — Ανάθεση booking χειροκίνητα — Χρήση: dev/ops
- `scripts/print_token.js` — Εκτύπωση tokens — Χρήση: dev
- `scripts/verify_api_json_errors.js` — Έλεγχος API errors — Χρήση: QA
- `scripts/policy_validation_check.js` — Έλεγχος πολιτικών — Χρήση: QA
- `scripts/seed_policy_validation.js` — Seed για policy tests — Χρήση: QA
- `scripts/create_test_provider.js` — Δημιουργία provider δοκιμής — Χρήση: dev
- `scripts/reset_driver_password.js` — Reset κωδ. driver — Χρήση: dev
- `scripts/driver_check_booking.js` — Έλεγχος από πλευρά driver — Χρήση: QA
- `scripts/provider_check_booking.js` — Έλεγχος από πλευρά provider — Χρήση: QA
- `scripts/enrich_driver_bookings_stops.js` — Εμπλουτισμός stops — Χρήση: ops
- `scripts/cleanup_demo_bookings.js` — Καθαρισμός demo bookings — Χρήση: ops
- `scripts/cleanup_demo_extras.js` — Καθαρισμός extras — Χρήση: ops
- `scripts/remove_optimise_stops.js` — Αφαίρεση optimise flags — Χρήση: ops
- `scripts/cleanup_acropolis_bookings.js` — Καθάρισμα Acropolis — Χρήση: ops
- `scripts/patch_acropolis_pickups.js` — Patch pickups — Χρήση: ops
- `scripts/list_recent_bookings.js` — Λίστα πρόσφατων κρατήσεων — Χρήση: ops
- `scripts/check_demo_clean.js` — Έλεγχος demo καθαρότητας — Χρήση: QA
- `scripts/create_acropolis_booking.js` — Δημιουργία demo κράτησης — Χρήση: dev/demo
- `scripts/create_custom_route_booking.js` — Δημιουργία custom route — Χρήση: dev
- `scripts/create_specified_route_booking.js` — Δημιουργία συγκεκριμένης route — Χρήση: dev
- `scripts/create_demo_scattered_route_booking.js` — Δημιουργία scattered demo — Χρήση: dev
- `scripts/create_demo_scattered_route_booking_pc.js` — Δημιουργία scattered demo (PC) — Χρήση: dev
- `scripts/purge_demo_test_data.js` — Καθαρισμός demo δεδομένων — Χρήση: ops
- `scripts/test_idempotency.js` — Έλεγχος idempotency — Χρήση: QA
- `scripts/debug_provider_route_build.js` — Debug build provider route — Χρήση: dev/QA

---

## Canonical αρχεία (Source of Truth)

- Backend: `server.js`, `src/server/*` (όλες οι υπομονάδες), `routes/*`, `services/*`
- Client (site): `public/js/*`, `public/css/*`, top-level `public/*.html`
- Panels: `public/admin*`, `public/admin/*`, `public/provider/*`, `public/driver/*`
- I18N: `locales/*` είναι η πηγή· τα `public/i18n/*` θεωρούνται bundles για τον client και πρέπει να συγχρονίζονται από `locales/*`
- Δεδομένα: `data/db.sqlite3` (runtime), seeds/knowledge για περιεχόμενο
- Εργαλεία/Reports: `tools/*.js|.sh` και `reports/*` για αναφορές

## Επικαλυπτόμενα ονόματα (προσοχή)

- `driver.js`: `routes/driver.js` (server) vs `public/driver/driver.js` (client)
- `manual-payments.js`: `routes/manual-payments.js` (server) vs `public/js/manual-payments.js` (client)
- `provider-availability.js`: `routes/provider-availability.js` (server) vs `public/provider/provider-availability.js` (client)
- `provider.js`: `routes/provider.js` (server) vs `public/provider/provider.js` (client)
- `version.js`: `src/server/lib/version.js` (lib) vs `src/server/routes/version.js` (route)
- `knowledge.json`: `data/knowledge.json` vs `data/ai/knowledge.json`
- `index.html`: πολλές εκδοχές σε υποφακέλους (driver/home, provider/home, about, partner-*)
- Γλώσσες i18n: κάθε `<lang>.json` υπάρχει σε `locales/*` και `public/i18n/*` (διαφορετικός ρόλος)

## Οδηγίες αλλαγών (ασφαλής στόχευση)

- Αλλαγές backend: τροποποιούμε `routes/*` ή `src/server/*` και σχετικές `services/*`. Μην αγγίζετε `public/*`.
- Αλλαγές client site: τροποποιούμε `public/js/*`, `public/css/*`, και τα αντίστοιχα `public/*.html`.
- Panels: επιλέξτε το σωστό panel φάκελο (`public/admin|provider|driver/*`) για HTML/JS/CSS.
- Μεταφράσεις: ενημερώνουμε πρώτα `locales/*` και συγχρονίζουμε `public/i18n/*` μέσω tooling.
- Δεδομένα: runtime δεδομένα στο `data/db.sqlite3` (όχι version-controlled). Seeds/knowledge σε αντίστοιχα JSON/SQLite.
