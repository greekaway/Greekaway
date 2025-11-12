#!/usr/bin/env node
/**
 * Δημιουργεί μια DEMO κράτηση για εκδρομή "Ακρόπολη" χωρίς χρέωση (price_cents = 0)
 * και την αναθέτει σε συγκεκριμένο οδηγό (μέσω email) εφόσον υπάρχει ήδη στον πίνακα drivers.
 *
 * Αν δεν υπάρχει ο οδηγός, το script θα τερματίσει με μήνυμα σφάλματος.
 * Χρησιμοποιεί SQLite (data/db.sqlite3) εκτός αν έχει οριστεί DATABASE_URL (τότε θα πρέπει να προσαρμοστεί).
 *
 * Χρήση:
 *   node scripts/create_acropolis_demo_booking.js [--driver-email testdriver@greekaway.com] [--date YYYY-MM-DD] [--seats 3]
 *   Προαιρετικά: --price-cents 0 (default), --status pending
 *
 * Σημείωση: Το script δεν δημιουργεί partner / provider. Αν θέλεις σύνδεση με provider panel, πρώτα δημιούργησε partner και οδηγό από το panel.
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
  return [
    { name: 'Pickup Σύνταγμα', address: 'Πλατεία Συντάγματος, Αθήνα', time: '09:00' },
    { name: 'Ακρόπολη', address: 'Acropolis Museum, Αθήνα', time: '09:30' },
    { name: 'Περίπατος', address: 'Διονυσίου Αρεοπαγίτου 15, Αθήνα', time: '10:45' },
    { name: 'Γεύμα', address: 'Μοναστηράκι, Αθήνα', time: '12:30' }
  ];
}

function buildBooking(driverId, date, partnerId){
  const crypto = require('crypto');
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const created_at = new Date().toISOString();
  const stops = buildStops();
  const metadata = { pickup_time: stops[0].time, customer_phone: '+30 69 0000 0000', stops, tour_title: 'Ακρόπολη DEMO' };
  return {
    id,
    status: String(flag('status','pending')),
    payment_intent_id: null,
    event_id: `DEMO_ACROP_${id.slice(0,8)}`,
    user_name: 'Demo Acropolis Visitor',
    user_email: 'demo-acropolis@example.com',
    trip_id: 'DEMO_ACROPOLIS_TOUR',
    seats: parseInt(flag('seats',3),10) || 1,
    price_cents: parseInt(flag('price-cents',0),10) || 0,
    currency: 'EUR',
    metadata: JSON.stringify(metadata),
    date: date || todayISO(),
    pickup_location: stops[0].address,
    pickup_lat: null,
    pickup_lng: null,
    suitcases_json: '[]',
    special_requests: 'Acropolis demo booking',
    created_at,
    updated_at: created_at,
    assigned_driver_id: driverId,
    partner_id: partnerId || null
  };
}

async function run(){
  if (process.env.DATABASE_URL){
    console.error('DATABASE_URL εντοπίστηκε: Το script είναι υλοποιημένο μόνο για SQLite προς το παρόν.');
    process.exit(3);
  }
  const driverEmail = flag('driver-email', 'testdriver@greekaway.com');
  const partnerEmail = flag('partner-email', null);
  const date = flag('date', todayISO());

  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){ }
  const db = new Database(DB_PATH);
  try {
    // Ensure drivers table
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
    const d = db.prepare('SELECT id, email, status FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(driverEmail));
    if (!d){ console.error('Δεν βρέθηκε οδηγός με email:', driverEmail); process.exit(2); }
    if (d.status !== 'active'){ console.warn('Προειδοποίηση: Ο οδηγός δεν είναι ενεργός (status != active). Το panel ίσως απορρίψει την πρόσβαση.'); }

    // Προαιρετικά βρες partner_id από partners.email
    let partnerId = null;
    if (partnerEmail){
      // Ensure partners table exists (ελάχιστα απαιτούμενα πεδία για login)
      db.exec(`CREATE TABLE IF NOT EXISTS partners (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        password_hash TEXT,
        panel_enabled INTEGER,
        last_seen TEXT
      )`);
      const prow = db.prepare('SELECT id FROM partners WHERE lower(email)=lower(?) LIMIT 1').get(String(partnerEmail));
      if (!prow){ console.error('Δεν βρέθηκε provider/partner με email:', partnerEmail); process.exit(4); }
      partnerId = prow.id;
    }

    // Ensure bookings table
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
    // Add assigned_driver_id column αν λείπει
    try {
      const cols = db.prepare("PRAGMA table_info('bookings')").all();
      const names = new Set(cols.map(c => c.name));
      if (!names.has('assigned_driver_id')){
        db.prepare('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT').run();
      }
      if (!names.has('partner_id')){
        db.prepare('ALTER TABLE bookings ADD COLUMN partner_id TEXT').run();
      }
    } catch(_){ }

    const booking = buildBooking(d.id, date, partnerId);
    const stmt = db.prepare(`INSERT OR IGNORE INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id, partner_id)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(booking.id, booking.status, booking.payment_intent_id, booking.event_id, booking.user_name, booking.user_email, booking.trip_id, booking.seats, booking.price_cents, booking.currency, booking.metadata, booking.created_at, booking.updated_at, booking.date, booking.pickup_location, booking.pickup_lat, booking.pickup_lng, booking.suitcases_json, booking.special_requests, booking.assigned_driver_id, booking.partner_id);
    console.log('Δημιουργήθηκε demo κράτηση Ακρόπολης:', booking.id);
    console.log('Ημερομηνία:', booking.date, '| Seats:', booking.seats, '| Τιμή (cents):', booking.price_cents);
    console.log('Οδηγός ID:', booking.assigned_driver_id);
  } finally {
    db.close();
  }
}

run().catch(e => { console.error('Σφάλμα:', e && e.message ? e.message : e); process.exit(1); });
