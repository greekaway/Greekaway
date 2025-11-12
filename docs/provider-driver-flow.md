# Provider & Driver dynamic route rule

This note documents the global rule for rendering pickups and trip itinerary across the Provider and Driver panels.

Scope
- Trip Acropolis (trip_id: `acropolis`) used as a working example
- Applies globally to all trips where a JSON definition exists under `public/data/trips/<trip_id>.json`

Rule
- Provider and Driver panels should display:
  1) All customer pickup points from the booking metadata (stored as `pickup_points_json` or `metadata.pickups`)
  2) The trip itinerary (tour stops + times) from the trip JSON file
  3) For Driver, Google Maps links per stop and a multi-stop navigation link

Implementation highlights
- API: Provider GET `/provider/api/bookings/:id`
  - Builds `booking.route.full_path` if missing by appending trip JSON tour stops (with times or +45' fallback increments)
  - Exposes `booking.trip_info.start_time` from the trip JSON (departure.departure_time or first stop time)
- UI: `public/provider/provider-bookings.js`
  - Displays pickup points from `booking.pickup_points_json` or `metadata.pickups`
  - Shows the synthesized route list (pickups may show separately from the tour stops)
  - Adds a Trip Info section with the start time
- API: Driver GET `/driver/api/bookings/:id`
  - When policy `presentation.show_full_route_to_panels` is true (see `policies.json`), composes a route from pickups + trip JSON if `metadata.route.full_path` is missing
  - Computes pickup ETAs to reach the first tour stop at its scheduled time; stores `metadata.final_pickup_times` and `metadata.stops_sorted`
- UI: `public/driver/driver-route.js`
  - Shows pickup ETAs and the trip stops with the scheduled time of the first tour stop
  - Renders per-stop "Πλοήγηση" links and a multi-stop Google Maps button

Seeding demo
- Create one Acropolis booking with three pickups and seats=6:
  - Run: `node scripts/create_acropolis_booking.js`
  - Ensures: provider user (driver@example.com), driver user (testdriver@greekaway.com), mapping `acropolis` -> partner `999`, capacity next 7 days
  - Output includes the booking id and date

Logins (local dev)
- Provider: driver@example.com / TestPass123 → /provider/
- Driver: testdriver@greekaway.com / driver123 → /driver/

Notes
- Policy gate: `policies.json` → `presentation.show_full_route_to_panels: true`
- If a trip JSON stop lacks `arrival_time`, the system will space it by +45' from the previous stop
- Pickups are displayed from booking metadata; tour stops from trip JSON keep their defined times

Troubleshooting
- If a booking does not show in Provider, check `partner_mappings` and that the booking `partner_id` matches the provider id
- If no Driver bookings show, ensure the booking is assigned (`assigned_driver_id`)
