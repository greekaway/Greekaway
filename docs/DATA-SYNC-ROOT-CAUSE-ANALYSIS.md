# Root Cause Analysis: Local vs Live Data Sync Problem

## ✅ ΛΥΣΗ ΕΦΑΡΜΟΣΤΗΚΕ

**PostgreSQL database integration έχει υλοποιηθεί.**

Δείτε: [docs/POSTGRES-SETUP.md](POSTGRES-SETUP.md) για οδηγίες setup.

---

## 🚨 ΑΡΧΙΚΟ ΕΥΡΗΜΑ

**Η ΒΑΣΙΚΗ ΑΙΤΙΑ είναι ότι τα δεδομένα (JSON files, SQLite database) είναι tracked στο Git και αποτελούν μέρος του deployment.**

---

## 📊 Επηρεαζόμενα Αρχεία

### Greekaway - Tracked στο Git (θα αντικατασταθούν σε κάθε deploy):
| Αρχείο | Περιγραφή | Ρίσκο |
|--------|-----------|-------|
| `data/categories.json` | Κατηγορίες trips | **ΥΨΗΛΟ** |
| `data/trips/*.json` | Δεδομένα εκδρομών | **ΚΡΙΣΙΜΟ** |
| `data/db.sqlite3` | SQLite database (bookings, suppliers) | **ΚΡΙΣΙΜΟ** |
| `data/knowledge.json` | Knowledge base | ΜΕΣΑΙΟ |

### MoveAthens - Tracked στο Git:
| Αρχείο | Περιγραφή | Ρίσκο |
|--------|-----------|-------|
| `moveathens/data/moveathens_ui.json` | Zones, Vehicles, Categories, Prices, Destinations | **ΚΡΙΣΙΜΟ** |
| `moveathens/images/*.jpg` | Vehicle images | **ΥΨΗΛΟ** |
| `moveathens/icons/categories/*.svg` | Category icons | **ΥΨΗΛΟ** |
| `moveathens/videos/hero.mp4` | Hero video | ΜΕΣΑΙΟ |

---

## 🔄 Ροή του Προβλήματος (Διαγραμματικά)

```
┌─────────────────┐     git push     ┌─────────────────┐
│  LOCAL ADMIN    │ ───────────────► │  RENDER/LIVE    │
│                 │                  │                 │
│ data/*.json     │  overwrites →    │ data/*.json     │
│ moveathens/data │  overwrites →    │ moveathens/data │
│ db.sqlite3      │  overwrites →    │ db.sqlite3      │
└─────────────────┘                  └─────────────────┘
                                            │
                                            │ Admin makes changes
                                            ▼
                                     ┌─────────────────┐
                                     │ LIVE CHANGES    │
                                     │ (saved to disk) │
                                     └─────────────────┘
                                            │
                              Next deploy   │
                              from local    │
                                            ▼
                                     ┌─────────────────┐
                                     │ CHANGES LOST!   │ ← Τα live αρχεία αντικαθίστανται
                                     │ Reverts to      │   από τα local (που είναι παλιά)
                                     │ local state     │
                                     └─────────────────┘
```

---

## 📁 Αρχεία που ΣΩΣΤΑ είναι στο .gitignore (αλλά μόνο για uploads):

```gitignore
/uploads
/uploads/**
/uploads/
public/uploads/*
public/uploads/**
```

**ΠΡΟΒΛΗΜΑ:** Ενώ τα `/uploads` εξαιρούνται, τα παρακάτω **ΔΕΝ** εξαιρούνται:
- `data/*.json`
- `data/*.sqlite3`
- `data/trips/*.json`
- `moveathens/data/*.json`
- `moveathens/images/*`
- `moveathens/icons/categories/*`

---

## 🔍 Γιατί συμβαίνει αυτό - Τεχνική Ανάλυση

### 1. Render Deployment Flow (render.yaml)

```yaml
services:
  - type: web
    name: greekaway
    env: node
    buildCommand: npm ci   # ← Full rebuild
    startCommand: npm start
    autoDeploy: true       # ← Auto-deploy on git push
    disk:
      name: uploads
      mountPath: /opt/render/project/src/uploads  # ← Μόνο uploads persistent!
```

**Παρατήρηση:** Μόνο το `/uploads` directory έχει persistent disk. Όλα τα άλλα αρχεία **αντικαθίστανται** σε κάθε deploy.

### 2. Πού γράφονται τα δεδομένα στον server

**Greekaway Categories ([src/server/routes/categories.js](src/server/routes/categories.js#L13)):**
```javascript
const CATEGORIES_PATH = path.join(ROOT_DIR, 'data', 'categories.json');
```

**Greekaway Trips ([src/server/routes/trips.js](src/server/routes/trips.js#L13)):**
```javascript
const TRIPS_DIR = path.join(ROOT_DIR, "data", "trips");
```

**MoveAthens ([moveathens/server/moveathens.js](moveathens/server/moveathens.js#L44)):**
```javascript
const uiConfigPath = path.join(dataDir, 'moveathens_ui.json');
```

**Τα paths είναι σχετικά με το project directory, ΟΧΙ με κάποιο persistent volume.**

### 3. Git tracked files (θα αντικατασταθούν σε deploy):

```bash
$ git ls-files --cached | grep -E "\.json|\.sqlite|moveathens/data|data/"
data/categories.json
data/db.sqlite3
data/trips/_template.json
data/trips/premium-acropolis-tour.json
moveathens/data/moveathens_ui.json
moveathens/images/vehicle-*.jpg
moveathens/icons/categories/category-*.svg
```

---

## ⚠️ Συγκεκριμένα Scenarios που Προκαλούν Απώλεια

### Scenario A: Νέα Εκδρομή (Greekaway)
1. Developer δημιουργεί trip στο LOCAL → `data/trips/new-trip.json`
2. `git add & push` → Εμφανίζεται στο LIVE
3. Admin στο LIVE δημιουργεί `data/trips/another-trip.json` μέσω admin panel
4. Developer κάνει νέο push για bug fix
5. **ΑΠΟΤΕΛΕΣΜΑ:** `another-trip.json` χάνεται (δεν υπήρχε στο local git)

### Scenario B: Νέο Όχημα + Φωτογραφία (MoveAthens)
1. Admin προσθέτει όχημα στο LIVE admin
2. Όχημα αποθηκεύεται στο `moveathens/data/moveathens_ui.json`
3. Φωτογραφία αποθηκεύεται στο `moveathens/images/vehicle-xxx.jpg`
4. Developer pushes από local
5. **ΑΠΟΤΕΛΕΣΜΑ:** Και το όχημα και η φωτογραφία χάνονται

### Scenario C: Αλλαγή Τιμών (MoveAthens)
1. Admin αλλάζει τιμές ζωνών στο LIVE
2. Αποθηκεύονται στο `moveathens/data/moveathens_ui.json`
3. Οποιοδήποτε deploy
4. **ΑΠΟΤΕΛΕΣΜΑ:** Τιμές επιστρέφουν στην παλιά κατάσταση

---

## ✅ Λύσεις

### Λύση 1: Εξωτερική Βάση Δεδομένων (Συνιστώμενη για Production)

Μετάβαση σε PostgreSQL/MySQL με managed database service:

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   LOCAL     │      │   RENDER    │      │  DATABASE   │
│   (code)    │ ───► │   (code)    │ ───► │  (Render    │
│             │      │             │      │   Postgres) │
└─────────────┘      └─────────────┘      └─────────────┘
                                                 ▲
                                                 │
                            Μόνιμα δεδομένα ─────┘
```

**Πλεονεκτήματα:**
- Δεδομένα ανεξάρτητα από deploys
- Backups
- Scaling

### Λύση 2: Persistent Volumes για Data Directories

Επέκταση του Render disk configuration:

```yaml
disk:
  name: data
  mountPath: /opt/render/project/src/data-persistent
  sizeGB: 5
```

Και αλλαγή paths στον κώδικα για χρήση persistent directory.

### Λύση 3: .gitignore + Manual Sync (Προσωρινή)

Προσθήκη στο `.gitignore`:

```gitignore
# Production data - DO NOT TRACK
data/categories.json
data/trips/*.json
!data/trips/_template.json
data/db.sqlite3
moveathens/data/moveathens_ui.json
moveathens/images/vehicle-*.jpg
moveathens/icons/categories/category-*.svg
```

**⚠️ ΠΡΟΣΟΧΗ:** Αυτό σημαίνει ότι πρέπει να γίνει manual setup στο production.

### Λύση 4: Hybrid - Code Deploys + Data Sync Script

Deploy script που:
1. Κάνει deploy μόνο τον κώδικα
2. Διατηρεί τα data directories
3. Κάνει merge αν χρειάζεται

---

## 📋 Άμεσες Ενέργειες (Quick Wins)

### 1. Backup Live Data ΠΡΙΝ από κάθε Deploy

```bash
# Script για να τρέξει ΠΡΙΝ το deploy
ssh render-server "tar -czf /tmp/data-backup-$(date +%Y%m%d).tar.gz data/ moveathens/data/"
```

### 2. Προσθήκη Warning στο README

```markdown
⚠️ ΠΡΟΣΟΧΗ: Τα δεδομένα admin panel αποθηκεύονται σε JSON files που είναι μέρος
του git repository. Κάθε deploy αντικαθιστά αυτά τα αρχεία με την τοπική έκδοση.
```

### 3. Separate Data Repository (Μεσοπρόθεσμα)

Δημιουργία ξεχωριστού repo μόνο για data, με manual sync.

---

## 📊 Impact Summary

| Component | Affected Files | Data Loss Risk |
|-----------|---------------|----------------|
| Greekaway Trips | `data/trips/*.json` | **CRITICAL** |
| Greekaway Categories | `data/categories.json` | **HIGH** |
| Greekaway Bookings DB | `data/db.sqlite3` | **CRITICAL** |
| MoveAthens Config | `moveathens/data/moveathens_ui.json` | **CRITICAL** |
| MoveAthens Vehicle Images | `moveathens/images/vehicle-*.jpg` | **HIGH** |
| MoveAthens Category Icons | `moveathens/icons/categories/*.svg` | **HIGH** |

---

## 🎯 Συμπέρασμα

**Το πρόβλημα δεν είναι bug - είναι αρχιτεκτονική απόφαση.**

Τα δεδομένα αποθηκεύονται σε flat files (JSON/SQLite) που είναι μέρος του git repository. Αυτό σημαίνει:

1. **Local changes win** - Κάθε push αντικαθιστά τα live data
2. **No data persistence** - Μόνο το `/uploads` είναι persistent
3. **No sync mechanism** - Live → Local sync δεν υπάρχει

**Για production-ready setup, απαιτείται μετάβαση σε εξωτερική database ή persistent storage για τα data directories.**
