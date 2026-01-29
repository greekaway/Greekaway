# PostgreSQL Database Setup Guide

## 🎯 Σκοπός

Αυτό το guide περιγράφει πώς να ενεργοποιήσετε την PostgreSQL database για permanent storage των δεδομένων admin panel, ώστε οι αλλαγές στο live site να μη χάνονται σε deploys.

## 📊 Τι Αλλάζει

| Πριν | Μετά |
|------|------|
| Δεδομένα σε JSON files | Δεδομένα σε PostgreSQL |
| Χάνονται σε deploy | Μόνιμα αποθηκευμένα |
| Local vs Live conflict | Single source of truth |

## 🚀 Quick Start (Render)

### Βήμα 1: Δημιουργία Database στο Render

1. Πηγαίνετε στο [Render Dashboard](https://dashboard.render.com)
2. Κάντε click **New** → **PostgreSQL**
3. Επιλέξτε:
   - **Name**: `greekaway-db`
   - **Database**: `greekaway`
   - **User**: `greekaway`
   - **Plan**: Free (ή Starter για production)
   - **Region**: Same as your web service
4. Click **Create Database**
5. Αντιγράψτε το **Internal Database URL**

### Βήμα 2: Σύνδεση στο Web Service

1. Πηγαίνετε στο web service `greekaway`
2. **Environment** → **Add Environment Variable**
3. Προσθέστε:
   - **Key**: `DATABASE_URL`
   - **Value**: (paste το Internal Database URL)
4. Click **Save Changes**

### Βήμα 3: Deploy & Migrate

```bash
# Αν έχετε ήδη deploy, κάντε manual deploy για να τρέξει η migration
# Render Dashboard → Manual Deploy → Deploy latest commit
```

Το migration script θα τρέξει αυτόματα κατά το build και θα μεταφέρει τα υπάρχοντα δεδομένα.

## 🖥️ Local Development

### Option A: Χωρίς Local PostgreSQL

Δουλεύετε κανονικά. Αν δεν υπάρχει `DATABASE_URL`, το σύστημα χρησιμοποιεί JSON files.

```bash
# Χωρίς DATABASE_URL → JSON files
node server.js
```

### Option B: Με Local PostgreSQL

```bash
# 1. Εγκατάσταση PostgreSQL (macOS)
brew install postgresql@15
brew services start postgresql@15

# 2. Δημιουργία database
createdb greekaway

# 3. Ρύθμιση .env
echo 'DATABASE_URL=postgres://localhost/greekaway' >> .env

# 4. Run migrations
node tools/migrate_to_postgres.js

# 5. Start server
node server.js
```

### Option C: Docker PostgreSQL

```bash
# Start PostgreSQL container
docker run -d \
  --name greekaway-postgres \
  -e POSTGRES_USER=greekaway \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=greekaway \
  -p 5432:5432 \
  postgres:15

# Set DATABASE_URL
export DATABASE_URL="postgres://greekaway:secret@localhost:5432/greekaway"

# Run migrations
node tools/migrate_to_postgres.js
```

## 📁 File Structure

```
db/
├── index.js         # Database connection & helpers
└── schema.sql       # PostgreSQL schema definitions

src/server/data/
├── categories.js    # Categories data layer (DB + JSON fallback)
├── trips.js         # Trips data layer (DB + JSON fallback)
└── moveathens.js    # MoveAthens data layer (DB + JSON fallback)

tools/
└── migrate_to_postgres.js  # Migration script
```

## 🔄 Migration Script

```bash
# Dry run (preview without changes)
DATABASE_URL=... node tools/migrate_to_postgres.js --dry-run

# Actual migration
DATABASE_URL=... node tools/migrate_to_postgres.js

# Force overwrite existing data
DATABASE_URL=... node tools/migrate_to_postgres.js --force
```

## 📊 Database Schema

### Greekaway Tables
- `gk_categories` - Trip categories
- `gk_trips` - Trips with modes, stops, pricing (JSONB fields)

### MoveAthens Tables
- `ma_config` - UI configuration (singleton)
- `ma_transfer_zones` - Pickup zones
- `ma_vehicle_types` - Vehicle types
- `ma_destination_categories` - Destination categories
- `ma_destinations` - Destinations
- `ma_transfer_prices` - Pricing matrix

## ⚙️ Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | No* |
| `NODE_ENV` | Environment (production/development) | No |

*Αν δεν υπάρχει DATABASE_URL, το σύστημα χρησιμοποιεί JSON files (backward compatible)

## 🔍 Troubleshooting

### "Database not available"
```bash
# Check if DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "Migration failed"
```bash
# Check PostgreSQL logs
docker logs greekaway-postgres

# Manual schema apply
psql $DATABASE_URL -f db/schema.sql
```

### "SSL connection required"
Το Render απαιτεί SSL. Το `db/index.js` το χειρίζεται αυτόματα για Render/Neon/Supabase URLs.

## 🔒 Security Notes

1. **Ποτέ μην κάνετε commit το DATABASE_URL** - χρησιμοποιήστε environment variables
2. Το Render Free tier database έχει 90-day expiry
3. Για production, χρησιμοποιήστε Render Starter plan ή εξωτερικό provider

## 📈 Scaling

Για μεγαλύτερα workloads:

1. **Connection Pooling**: Το `db/index.js` χρησιμοποιεί pool με max 10 connections
2. **Indexes**: Το schema έχει indexes για τα πιο common queries
3. **Backup**: Render κάνει automatic daily backups (Starter+ plans)

## 🔄 Workflow μετά το Setup

```
┌─────────────────┐     deploy      ┌─────────────────┐
│  LOCAL DEV      │ ───────────────►│  RENDER/LIVE    │
│  (code only)    │                 │  (code + DB)    │
└─────────────────┘                 └─────────────────┘
                                           │
                                           │ Admin changes
                                           ▼
                                    ┌─────────────────┐
                                    │  PostgreSQL DB  │
                                    │  (persistent!)  │
                                    └─────────────────┘
                                           │
                              Next deploy  │ ✅ Data preserved!
                                           │
                                    ┌─────────────────┐
                                    │  LIVE SITE      │
                                    │  (same data)    │
                                    └─────────────────┘
```

**Τα δεδομένα δεν χάνονται πλέον σε deploys!**
