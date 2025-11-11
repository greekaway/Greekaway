#!/usr/bin/env node
/**
 * Create a single booking with the user-requested multi-stop route and assign to a driver.
 * Defaults to SQLite (data/db.sqlite3). Use --driver-email to pick driver.
 *
 * Usage:
 *   node scripts/create_custom_route_booking.js --driver-email testdriver@greekaway.com [--date 2025-11-12]
 */

const path = require('path');
const fs = require('fs');

function flag(name, def=null){
  const a = process.argv;
  const k = `--${name}`;
  const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def;
  const cur = a[i];
  if (cur.includes('=')) return cur.split('=').slice(1).join('=');
  const next = a[i+1];
  if (next && !next.startsWith('--')) return next;
  return true;
}

function todayISO(){ return new Date().toISOString().slice(0,10); }

function buildStops(){
  // User-specified route (addresses as provided; Google will geocode in Maps URL later)
  return [
    { name: 'Pickup Glyfada', address: 'Πλατεία Νυμφών 3, Γλυφάδα', time: '09:00' },
    { name: '2nd Pickup', address: 'Ιπποκράτους 43, Αθήνα', time: '09:30' },
    { name: 'Club Boulevard', address: 'Boulevard Club, Αθήνα', time: '10:00' },
    { name: 'Μουσείο Ακρόπολης', address: 'Acropolis Museum, Αθήνα', time: '11:00' },
    { name: 'Βόσπορος (Μικρολίμανο)', address: 'Εστιατόριο Βόσπορος, Μικρολίμανο, Πειραιάς', time: '12:30' }
  ];
}

function buildBooking(driverId, date){
  const crypto = require('crypto');
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const created_at = new Date().toISOString();
  const stops = buildStops();
  const metadata = { pickup_time: stops[0].time, customer_phone: '+30 69 0000 0000', stops };
  return {
    id,
    status: 'pending',
    payment_intent_id: null,
    event_id: `DEMO_EVT_${id.slice(0,8)}`,
    user_name: 'Google Route Test',
    user_email: 'demo-route@example.com',
    trip_id: 'DEMO_CUSTOM_GOOGLE_TEST',
    seats: 3,
    price_cents: 0,
    currency: 'EUR',
    metadata: JSON.stringify(metadata),
    date: date || todayISO(),
    pickup_location: stops[0].address,
    pickup_lat: null,
    pickup_lng: null,
    suitcases_json: '[]',
    special_requests: 'Route optimization demo',
    created_at,
    updated_at: created_at,
    assigned_driver_id: driverId
  };
}

async function run(){
  const driverEmail = flag('driver-email', 'testdriver@greekaway.com');
  const date = flag('date', todayISO());

  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
  const db = new Database(DB_PATH);
  try {
    // ensure drivers table
    db.exec(`CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      vehicle_plate TEXT,
      notes TEXT,
      status TEXT,
      invite_token TEXT,
      invite_sent_at TEXT,
      activated_at TEXT,
      password_hash TEXT,
      created_at TEXT
    )`);
    const d = db.prepare('SELECT id, email FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(driverEmail));
    if (!d) { console.error('Driver not found for email:', driverEmail); process.exit(2); }

    // ensure bookings table with assigned_driver_id
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
      pickup_lat REAL,
      pickup_lng REAL,
      suitcases_json TEXT,
      special_requests TEXT
    )`);
    try {
      const cols = db.prepare("PRAGMA table_info('bookings')").all();
      const names = new Set(cols.map(c => c.name));
      if (!names.has('assigned_driver_id')) {
        db.prepare('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT').run();
      }
    } catch(_){}

    const booking = buildBooking(d.id, date);
    const stmt = db.prepare(`INSERT OR IGNORE INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(booking.id, booking.status, booking.payment_intent_id, booking.event_id, booking.user_name, booking.user_email, booking.trip_id, booking.seats, booking.price_cents, booking.currency, booking.metadata, booking.created_at, booking.updated_at, booking.date, booking.pickup_location, booking.pickup_lat, booking.pickup_lng, booking.suitcases_json, booking.special_requests, booking.assigned_driver_id);
    console.log('Created booking id:', booking.id);
  } finally {
    db.close();
  }
}

run().catch(e => { console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
