#!/usr/bin/env node
/**
 * Seed an isolated SQLite DB with demo bookings to validate policies quickly.
 * It writes to data/policy_seed.sqlite3 and uses SQLITE_DB_PATH so it won't affect the real DB.
 *
 * Usage:
 *   node scripts/seed_policy_validation.js [--date YYYY-MM-DD]
 */

// Load .env first
try { require('dotenv').config(); } catch(_) {}
const path = require('path');
const fs = require('fs');

function flag(name, def=null){
  const a = process.argv; const k = `--${name}`; const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def; const cur = a[i]; if (cur.includes('=')) return cur.split('=')[1]; const n = a[i+1]; if (n && !n.startsWith('--')) return n; return true;
}
function today(){ return new Date().toISOString().slice(0,10); }

// Known coordinates for stable tests (independent from Google API)
const GEO = {
  'Σύνταγμα, Αθήνα': { lat: 37.9755, lng: 23.7348 },
  'Ακρόπολη, Αθήνα': { lat: 37.9715, lng: 23.7267 },
  'Μοναστηράκι, Αθήνα': { lat: 37.9763, lng: 23.7258 },
  'Κολωνάκι, Αθήνα': { lat: 37.9777, lng: 23.7445 },
  'Μαραθώνας, Αττική': { lat: 38.1470, lng: 24.0036 },
  'Λαύριο, Αττική': { lat: 37.7141, lng: 24.0564 },
  'Ωρωπός, Αττική': { lat: 38.3054, lng: 23.7962 },
  'Πειραιάς, Αττική': { lat: 37.9420, lng: 23.6465 }
};

function getDbPath(){ return path.join(__dirname, '..', 'data', 'policy_seed.sqlite3'); }

function getDb(){
  const Database = require('better-sqlite3');
  const p = getDbPath();
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive:true }); } catch(_){ }
  return new Database(p);
}

function ensureSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    payment_intent_id TEXT UNIQUE,
    event_id TEXT,
    user_name TEXT,
    user_email TEXT,
    trip_id TEXT,
    seats INTEGER,
    price_cents INTEGER,
    currency TEXT,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT,
    date TEXT,
    pickup_location TEXT,
    pickup_address TEXT,
    pickup_lat REAL,
    pickup_lng REAL,
    is_demo INTEGER DEFAULT 1
  )`);
}

function uuid(){ try { return require('crypto').randomUUID(); } catch(_) { return require('crypto').randomBytes(16).toString('hex'); } }

function insertBooking(db, b){
  const now = new Date().toISOString();
  const stmt = db.prepare(`INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,pickup_location,pickup_address,pickup_lat,pickup_lng,is_demo)
    VALUES (@id,@status,@payment_intent_id,@event_id,@user_name,@user_email,@trip_id,@seats,@price_cents,@currency,@metadata,@created_at,@updated_at,@date,@pickup_location,@pickup_address,@pickup_lat,@pickup_lng,@is_demo)`);
  stmt.run({
    id: b.id || uuid(),
    status: b.status || 'confirmed',
    payment_intent_id: b.payment_intent_id || null,
    event_id: b.event_id || null,
    user_name: b.user_name || 'Seed User',
    user_email: b.user_email || 'seed@example.com',
    trip_id: b.trip_id,
    seats: b.seats || 1,
    price_cents: b.price_cents || 0,
    currency: b.currency || 'EUR',
    metadata: b.metadata ? JSON.stringify(b.metadata) : null,
    created_at: now,
    updated_at: now,
    date: b.date,
    pickup_location: b.pickup_location || b.pickup_address || null,
    pickup_address: b.pickup_address || null,
    pickup_lat: b.pickup_lat || null,
    pickup_lng: b.pickup_lng || null,
    is_demo: 1
  });
}

function seedCohortPASS(db, date){
  const tripId = 'TEST_PASS_TRIP';
  const addrs = ['Σύνταγμα, Αθήνα','Ακρόπολη, Αθήνα','Μοναστηράκι, Αθήνα','Κολωνάκι, Αθήνα'];
  const seats = [1,1,1,1]; // total 4
  for (let i=0;i<addrs.length;i++){
    const a = addrs[i]; const g = GEO[a];
    insertBooking(db, { trip_id: tripId, date, seats: seats[i], pickup_address: a, pickup_lat: g.lat, pickup_lng: g.lng });
  }
  return tripId;
}

function seedCohortLOW(db, date){
  const tripId = 'TEST_LOW_TRIP';
  const addrs = ['Σύνταγμα, Αθήνα','Ακρόπολη, Αθήνα','Μοναστηράκι, Αθήνα'];
  const seats = [1,1,1]; // total 3
  for (let i=0;i<addrs.length;i++){
    const a = addrs[i]; const g = GEO[a];
    insertBooking(db, { trip_id: tripId, date, seats: seats[i], pickup_address: a, pickup_lat: g.lat, pickup_lng: g.lng });
  }
  return tripId;
}

function seedCohortFAR(db, date){
  const tripId = 'TEST_FAR_TRIP';
  const addrs = ['Λαύριο, Αττική','Μαραθώνας, Αττική','Ωρωπός, Αττική','Πειραιάς, Αττική'];
  const seats = [1,1,1,1]; // total 4 but spread out
  for (let i=0;i<addrs.length;i++){
    const a = addrs[i]; const g = GEO[a];
    insertBooking(db, { trip_id: tripId, date, seats: seats[i], pickup_address: a, pickup_lat: g.lat, pickup_lng: g.lng });
  }
  return tripId;
}

(async () => {
  // Use isolated DB
  const DB_PATH = getDbPath();
  process.env.SQLITE_DB_PATH = DB_PATH;
  const date = flag('date', today());
  // Prepare DB
  const db = getDb();
  try {
    ensureSchema(db);
    const passTrip = seedCohortPASS(db, date);
    const lowTrip  = seedCohortLOW(db, date);
    const farTrip  = seedCohortFAR(db, date);
  } finally { db.close(); }

  const svc = require('../services/policyService');
  const Database = require('better-sqlite3');
  const db2 = new Database(DB_PATH);
  try {
    const firstOf = (trip) => db2.prepare('SELECT id FROM bookings WHERE trip_id = ? AND date = ? LIMIT 1').get(trip, date)?.id;
    const ids = [
      { label: 'PASS', id: firstOf('TEST_PASS_TRIP') },
      { label: 'LOW', id: firstOf('TEST_LOW_TRIP') },
      { label: 'FAR', id: firstOf('TEST_FAR_TRIP') }
    ];
    for (const it of ids){
      const out = await svc.validateBeforeDispatch(it.id);
      const tag = out.ok ? '✅ PASS' : '⚠️ VIOLATION';
      console.log(`${tag} — ${it.label}`);
      if (!out.ok) {
        console.log('  Reasons:', (out.reasons||[]).map(r => r.code).join(', '));
      } else {
        console.log('  Participants:', out.participants, 'Min:', out.min_required);
      }
    }
    console.log(`Using isolated DB: ${DB_PATH}`);
  } finally { db2.close(); }
})().catch(e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
