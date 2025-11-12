#!/usr/bin/env node
/**
 * Δημιουργεί μια DEMO κράτηση για εκδρομή "Ακρόπολη" χωρίς χρέωση (price_cents = 0)
 * και την αναθέτει σε συγκεκριμένο οδηγό (μέσω email) εφόσον υπάρχει ήδη στον πίνακα drivers.
 *
 * Αν δεν υπάρχει ο οδηγός, το script θα τερματίσει με μήνυμα σφάλματος.
 * Χρησιμοποιεί SQLite (data/db.sqlite3) εκτός αν έχει οριστεί DATABASE_URL (τότε θα πρέπει να προσαρμοστεί).
 *
 * Χρήση:
 *   node scripts/create_acropolis_demo_booking.js [--driver-email testdriver@greekaway.com] [--date YYYY-MM-DD]
 *   Προαιρετικά:
 *     --pickups_multi "Ρουμπέση 7, Αθήνα;Ιπποκράτους 43, Αθήνα;Ηλία Ρογκάκου 2, Αθήνα"
 *     --seed-availability  # θέτει capacity για 30 ημέρες στο trip_id acropolis_demo
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

function buildStops(addresses){
  // Build display stops for driver UI from pickup addresses and final arrival ~10:00
  const base = Array.isArray(addresses) && addresses.length ? addresses : [
    'Ρουμπέση 7, Αθήνα',
    'Ιπποκράτους 43, Αθήνα',
    'Ηλία Ρογκάκου 2, Αθήνα'
  ];
  const times = ['09:00','09:20','09:40'];
  const stops = base.map((addr, i) => ({ name: `Pickup ${i+1}`, address: addr, time: times[i] || '09:00' }));
  stops.push({ name: 'Άφιξη', address: 'Ακρόπολη, Αθήνα', time: '10:00' });
  return stops;
}

function parseMultiPickupsFlag(){
  const s = flag('pickups_multi', '').trim();
  if (!s) return null;
  const parts = s.split(';').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  // Default 2 pax per address per user request
  return parts.map(addr => ({ address: addr, pax: 2 }));
}

function buildBooking(driverId, date, partnerId, assignDriver){
  const crypto = require('crypto');
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const created_at = new Date().toISOString();
  const multi = parseMultiPickupsFlag();
  const defaultPickups = [
    { address: 'Ρουμπέση 7, Αθήνα', pax: 2 },
    { address: 'Ιπποκράτους 43, Αθήνα', pax: 2 },
    { address: 'Ηλία Ρογκάκου 2, Αθήνα', pax: 2 }
  ];
  const pickups = Array.isArray(multi) ? multi : defaultPickups;
  const stops = buildStops(pickups.map(p=>p.address));
  const totalPax = pickups.reduce((a,p)=>a+(Number(p.pax||1)||1),0);
  // Build unified route.full_path (pickups + tour first stop) with times and type flags
  const routeFull = [];
  stops.forEach((s,i)=>{
    const isPickup = /^pickup\s+/i.test(String(s.name||'')) || /παραλαβή/i.test(String(s.name||''));
    routeFull.push({
      label: isPickup ? `Παραλαβή: ${s.address}` : (s.name || `Στάση ${i+1}`),
      address: s.address || '',
      arrival_time: s.time || null,
      departure_time: null,
      type: isPickup ? 'pickup' : 'tour_stop'
    });
  });
  const metadata = {
    pickup_time: stops[0].time,
    customer_phone: '+30 69 0000 0000',
    stops,
    route: { full_path: routeFull },
    tour_title: 'Ακρόπολη',
    pickup_points: pickups,
    policy_flags: [],
    policy_checked_at: created_at
  };
  return {
    id,
    status: String(flag('status','pending')),
    payment_intent_id: null,
    event_id: `DEMO_ACROP_${id.slice(0,8)}`,
    user_name: 'Demo Acropolis Visitor',
    user_email: 'demo-acropolis@example.com',
    trip_id: 'acropolis_demo',
    seats: parseInt(flag('seats', totalPax),10) || totalPax,
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
    assigned_driver_id: assignDriver ? driverId : null,
    partner_id: partnerId || null,
    pickup_points_json: JSON.stringify(pickups)
  };
}

async function run(){
  if (process.env.DATABASE_URL){
    console.error('DATABASE_URL εντοπίστηκε: Το script είναι υλοποιημένο μόνο για SQLite προς το παρόν.');
    process.exit(3);
  }
  const driverEmail = flag('driver-email', '');
  const partnerEmail = flag('partner-email', null);
  const date = flag('date', todayISO());
  const seedAvailability = !!flag('seed-availability', false);
  const assignDriver = !!flag('assign-driver', false);

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
    let d = null;
    if (driverEmail){
      d = db.prepare('SELECT id, email, status FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(driverEmail));
      if (!d){ console.warn('Προειδοποίηση: Δεν βρέθηκε οδηγός με email:', driverEmail, '— θα συνεχίσουμε χωρίς ανάθεση.'); }
      else if (d.status !== 'active'){ console.warn('Προειδοποίηση: Ο οδηγός δεν είναι ενεργός (status != active). Το panel ίσως απορρίψει την πρόσβαση.'); }
    }

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
      if (!names.has('pickup_points_json')){
        db.prepare('ALTER TABLE bookings ADD COLUMN pickup_points_json TEXT').run();
      }
    } catch(_){ }

  const booking = buildBooking(d ? d.id : null, date, partnerId, assignDriver && !!d);
    const stmt = db.prepare(`INSERT OR IGNORE INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id, partner_id)
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(booking.id, booking.status, booking.payment_intent_id, booking.event_id, booking.user_name, booking.user_email, booking.trip_id, booking.seats, booking.price_cents, booking.currency, booking.metadata, booking.created_at, booking.updated_at, booking.date, booking.pickup_location, booking.pickup_lat, booking.pickup_lng, booking.suitcases_json, booking.special_requests, booking.assigned_driver_id, booking.partner_id);
    try { db.prepare('UPDATE bookings SET pickup_points_json = ? WHERE id = ?').run(booking.pickup_points_json, booking.id); } catch(_) {}
    console.log('Δημιουργήθηκε demo κράτηση Ακρόπολης:', booking.id);
    console.log('Ημερομηνία:', booking.date, '| Seats:', booking.seats, '| Τιμή (cents):', booking.price_cents);
  console.log('Οδηγός ID:', booking.assigned_driver_id || '(καμία ανάθεση)');

    if (seedAvailability){
      // Seed capacities for next 30 days for trip acropolis_demo (capacity 7)
      db.exec(`CREATE TABLE IF NOT EXISTS capacities (trip_id TEXT, date TEXT, capacity INTEGER, PRIMARY KEY(trip_id, date))`);
      const insCap = db.prepare('INSERT OR REPLACE INTO capacities (trip_id, date, capacity) VALUES (?,?,?)');
      const start = new Date(date);
      for (let i=0;i<30;i++){
        const d = new Date(start.getTime() + i*24*3600*1000);
        const iso = d.toISOString().slice(0,10);
        insCap.run('acropolis_demo', iso, 7);
      }
      console.log('Ορίστηκε διαθεσιμότητα 30 ημερών για acropolis_demo (capacity=7).');
    }
  } finally {
    db.close();
  }
}

run().catch(e => { console.error('Σφάλμα:', e && e.message ? e.message : e); process.exit(1); });
