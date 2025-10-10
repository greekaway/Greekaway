WIP - Greekaway
=================

Ημερομηνία: 2025-10-10

Τρέχουσα κατάσταση
- Repository: όλα τα κρίσιμα αρχεία έχουν γίνει commit και push στο origin/main.
- Backups: Εκτελέστηκε `./tools/backup_db.sh` και δημιουργήθηκαν gz backups στο `~/greekaway_backups`.
- .env: Δεν είναι tracked στο git (.gitignore περιλαμβάνει `.env`).

Τι έγινε σήμερα (συνοπτικά)
- Προστέθηκαν helper scripts: `scripts/bootstrap.sh`, `scripts/setup_stripe_webhook.sh`.
- Προστέθηκαν deploy δείγματα: `deploy/nginx.example.conf`, `deploy/certbot_obtain.sh`, `deploy/pm2_start.sh`.
- Προστέθηκε `DEPLOY.md` με οδηγίες.
- Αρχειοθετήθηκαν προηγούμενα helper αρχεία στο `public/data/trips/backups/`.

Επόμενα βήματα (πρώτη προτεραιότητα)
1. (Τοπικά) Εγκατάσταση Docker Desktop αν δεν υπάρχει.
2. Τρέξε bootstrap (σηκώνει Postgres + app, τρέχει migration):
   ```bash
   cd /Users/giannespalmos/Desktop/Greekaway
   bash scripts/bootstrap.sh
   ```
3. Λάβε το webhook signing secret από stripe-cli και γράψτο στο `.env`:
   ```bash
   bash scripts/setup_stripe_webhook.sh
   # επικόλλησε το whsec_... όταν το ζητήσει
   ```
4. Δοκιμαστικό webhook trigger:
   ```bash
   stripe trigger payment_intent.succeeded
   tail -n 100 webhook.log
   curl -u "$ADMIN_USER:$ADMIN_PASS" "http://localhost:3000/admin/payments?limit=5"
   ```

Σημειώσεις ασφάλειας
- Μην ανεβάζεις το `.env` στο git.
- Αν μοιραστείς `DATABASE_URL` ή κλειδιά, προτίμησε ασφαλές κανάλι.

Αντιμετώπιση προβλημάτων (σύντομη)
- Αν το docker δεν είναι διαθέσιμο, εγκατέστησε Docker Desktop (Homebrew): `brew install --cask docker`.
- Αν το webhook δεν επαληθεύεται, επιβεβαίωσε ότι το `STRIPE_WEBHOOK_SECRET` είναι σωστό και ο server έχει restart.

Κατάσταση τώρα: ασφαλές σημείο επανεκκίνησης — ό,τι χρειάζεται για να συνεχίσουμε υπάρχει στο repo και στα backups.

Όταν είσαι έτοιμος/η αύριο, πες "ξεκίνα" και καθοδηγώ live.
