# Μήτρα πλήρους διαδρομής (Pickups + Trip Stops)

Αυτό το αρχείο περιγράφει μια σταθερή "μήτρα" που μπορείς να χρησιμοποιείς για να φτιάχνεις γρήγορα νέες εκδρομές με:
- 3 στάσεις παραλαβής πελατών (pickups), και
- Στάσεις/ωράριο εκδρομής από το αντίστοιχο trip JSON (π.χ. `public/data/trips/acropolis.json`).

Ο φάκελος `templates/` περιέχει ένα έτοιμο JSON:
- `templates/booking_full_route_template.json`

## Τι περιέχει η μήτρα

- "booking": Πεδία για κράτηση (trip_id, date, seats, user_name/phone, pickups, driver/provider κλπ.).
- "trip_file": Δείγμα του JSON διαδρομής (με στάσεις και ώρες). Το πραγματικό αρχείο βρίσκεται στο `public/data/trips/<trip_id>.json`.
- "policies": Υπενθύμιση ότι πρέπει να είναι ενεργό το `presentation.show_full_route_to_panels=true` στο `policies.json`.

## Κανόνας (global)

Όταν το `policies.presentation.show_full_route_to_panels = true`:
- Το Provider API συνθέτει `route.full_path` αν λείπει, προσθέτοντας πρώτα τις παραλαβές και μετά τις στάσεις του trip JSON.
- Το Driver API, αν λείπει `full_path`, συνθέτει δυναμικά παραλαβές + στάσεις εκδρομής και δείχνει:
  - ETA για παραλαβές (ή σταθερές ώρες αν δεν υπάρχει υπολογισμός),
  - την προγραμματισμένη ώρα στην πρώτη στάση εκδρομής (άγκυρα).

## Πώς τη χρησιμοποιώ

1) Αντέγραψε το `templates/booking_full_route_template.json` και προσαρμόσ’ το:
   - Αλλαγή `trip_id`, `date`, `seats`, `user_name`, `metadata.pickups[].address`, και emails.
   - Βεβαιώσου ότι υπάρχει το αντίστοιχο `public/data/trips/<trip_id>.json` με τις στάσεις και τις ώρες.

2) Δημιούργησε κράτηση με τα πεδία της ενότητας "booking".
   - Μπορείς να προσαρμόσεις υπάρχον script (π.χ. `scripts/create_acropolis_booking.js`) για να διαβάζει από αυτό το JSON.

3) Άνοιξε τα panels:
   - Provider: θα δεις παραλαβές και τη διαδρομή εκδρομής (με ώρες από το trip file).
   - Driver: θα δεις 3 παραλαβές (με ETAs) + 3 στάσεις εκδρομής, με κουμπιά "Πλοήγηση" ανά στάση και συνολικό link.

## Συμβουλές

- Pickups: Γράφουμε τις διευθύνσεις στο `metadata.pickups` και στον καθρέφτη `pickup_points_json`.
- Ώρα εκκίνησης: Το trip JSON ορίζει την ώρα άφιξης της πρώτης στάσης εκδρομής (π.χ. 10:00), πάνω στην οποία αγκυρώνεται ο υπολογισμός.
- Google Maps: Αν υπάρχει `GOOGLE_MAPS_API_KEY`, το Driver API μπορεί να βελτιστοποιήσει τη σειρά/ETAs. Διαφορετικά, εφαρμόζεται ασφαλής fallback.

## Παράδειγμα γρήγορης προσαρμογής

- Θέλω νέα εκδρομή `newtour` με 3 pickups και ώρες: Αντιγράφω το template, αλλάζω `trip_id` σε `newtour`, φτιάχνω `public/data/trips/newtour.json` με τις στάσεις και τις ώρες, προσαρμόζω τις pickups, και δημιουργώ την κράτηση.

> Η μήτρα αυτή είναι μόνο για αναφορά/αντιγραφή. Δεν χρησιμοποιείται αυτόματα από τον server — τη διαβάζουν/αναπαράγουν τα scripts δημιουργίας κρατήσεων.
