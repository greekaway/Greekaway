# Apple Pay & Stripe Webhook Verification Checklist

Χρησιμοποίησε αυτό το checklist πριν κάνεις live Apple Pay tests ώστε να είμαστε 100% σίγουροι.

## 1. Περιβάλλον & Βασική Προετοιμασία
- Domain: Επιβεβαίωσε ότι το production domain (π.χ. https://www.greekaway.com) δείχνει στο Render service και έχει έγκυρο HTTPS.
- Publishable Key: Στο frontend φορτώνεται το σωστό `STRIPE_PUBLISHABLE_KEY` (production). Δοκίμασε ένα απλό `Stripe(publishableKey)` init στο browser console.
- Secret Key: Στο Render περιβάλλον έχει οριστεί `STRIPE_SECRET_KEY` (production live key). Δεν γίνεται log.

## 2. Apple Pay Domain Association
- Αρχείο: Υπάρχει σε production το αρχείο: `https://<domain>/.well-known/apple-developer-merchantid-domain-association`.
- Περιεχόμενο: Έχει αντικατασταθεί το placeholder με το ΑΚΡΙΒΕΣ αρχείο που κατέβασες από το Stripe Dashboard (κανένα έξτρα newline).
- Έλεγχος με curl:
  ```bash
  curl -s https://<domain>/.well-known/apple-developer-merchantid-domain-association | shasum -a 256
  ```
  (Αποθήκευσε το αρχείο τοπικά και σύγκρινε αν χρειάζεται.)
- Stripe Dashboard: Στο Settings → Payment methods → Apple Pay το domain αναγράφεται ως Verified.

## 3. Payment Request / Apple Pay Frontend Validation
- Safari (macOS/iOS) test page: Η Apple Pay εμφανίζει σωστά το sheet με ποσό που αντιστοιχεί στο vehicle type.
- Αλλαγή Οχήματος: Κάθε αλλαγή σε vehicle type/θέσεις ζητά νέο `clientSecret` (δεν γίνεται confirm παλιό intent).
- Ποσό: Το amount στο Apple Pay sheet (π.χ. 15.00 €) = `finalAmountCents / 100` από το response του backend.

## 4. Stripe Webhook Endpoint
- Endpoint: `POST https://<domain>/webhook` επιστρέφει 200 για valid υπογεγραμμένο event.
- Περιβάλλοντα: `STRIPE_WEBHOOK_SECRET` έχει οριστεί στο Render (live secret από Stripe).
- Υπογραφή: Ο κώδικας χρησιμοποιεί `stripe.webhooks.constructEvent` (βλέπε `webhook.js`) — δεν επιτρέπεται unsigned σε production.
- Δοκιμή με Stripe CLI (τοπικά, προς production δεν γίνεται forward, αλλά για staging):
  ```bash
  stripe listen --forward-to https://<domain>/webhook
  stripe trigger payment_intent.succeeded
  ```
  Εναλλακτικά χρησιμοποίησε το Dashboard → Test webhook event (αν διαθέσιμο).

## 5. Webhook Λογική & Idempotency
- Καταγραφή: Το αρχείο log (αν υπάρχει μηχανισμός `safeAppendLog`) καταγράφει `event.received`.
- Διπλοί Event: Επαναποστολή `payment_intent.succeeded` δεν δημιουργεί δεύτερη εγγραφή πληρωμής (έλεγχος duplicate σε `webhook.js`).
- State Updates: Μετά από succeeded event ενημερώνεται booking/payment state (π.χ. status σε βάση).

## 6. Manual Verification Βήματα
1. Δημιούργησε PaymentIntent για κάθε vehicle type (van, mercedes, bus) και κράτησε τα IDs.
2. Στείλε στο Stripe Dashboard (ή με test card + Apple Pay) μία δοκιμή, ολοκλήρωσε πληρωμή.
3. Παρακολούθησε Logs/Webhook: Επιβεβαίωση του event `payment_intent.succeeded`.
4. Δες admin panel: Η κράτηση ή πληρωμή εμφανίζεται με το σωστό amount.

## 7. Failure / Edge Cases
- Email Invalid: Βεβαιώσου ότι το frontend πάντα στέλνει `customerEmail` έγκυρη (RFC 5322 basic format) — διαφορετικά το create intent αποτυγχάνει.
- Stale Intent: Αν ο χρήστης αλλάξει οχήμα ή θέσεις πριν το Apple Pay, αναδημιουργείται νέος intent.
- Mismatch: Αν δει ο χρήστης λάθος ποσό στο sheet, ακύρωση και νέα δημιουργία intent.

## 8. Post-Verification Cleanup
- Απενεργοποίησε τυχόν debug env vars (`PAYMENTS_DEBUG`).
- Παρακολούθησε πρώτες live Apple Pay πληρωμές στο Stripe Dashboard (Amounts, Metadata: `vehicle_type`, `requested_price_cents`).

## 9. Γρήγορα Commands Αναφοράς
```bash
# Έλεγχος domain file
curl -I https://<domain>/.well-known/apple-developer-merchantid-domain-association

# Trigger test (staging με Stripe CLI)
stripe listen --forward-to https://<domain>/webhook
stripe trigger payment_intent.succeeded
```

## 10. Checklist Τελικής Επιβεβαίωσης (Ναι / Όχι)
- [ ] Domain verified στο Stripe
- [ ] Association file παρόν & σωστό
- [ ] Apple Pay sheet εμφανίζει σωστό ποσό
- [ ] Κάθε vehicle type επιστρέφει σωστό `finalAmountCents`
- [ ] Webhook events καταγράφονται & ενημερώνουν state
- [ ] Duplicate events δεν διπλο-προκαλούν εγγραφές
- [ ] Debug logs απενεργοποιημένα σε production

Αν οποιοδήποτε βήμα αποτύχει, σταμάτα πριν κάνεις live tests και διόρθωσε.
