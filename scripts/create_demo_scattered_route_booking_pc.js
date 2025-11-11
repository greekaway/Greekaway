#!/usr/bin/env node
/**
 * Create a DEMO booking with scattered stops (with postal codes) to test Google optimization & ETAs.
 * Adds more precise addresses to encourage accurate geocoding.
 * Default driver: testdriver@greekaway.com
 *
 * Stops (scattered):
 * 1) Πλατεία Νυμφών, Γλυφάδα 16674
 * 2) Πλατεία Νέας Σμύρνης, Νέα Σμύρνη 17121
 * 3) Ιπποκράτους 43, Αθήνα 10680
 * 4) Μουσείο Ακρόπολης, Αθήνα 11742
 * 5) Εστιατόριο Βόσπορος, Μικρολίμανο, Πειραιάς 18533
 *
 * Usage:
 *   node scripts/create_demo_scattered_route_booking_pc.js [--driver-email <email>] [--date YYYY-MM-DD]
 */

const path = require('path');
const fs = require('fs');

function flag(name, def=null){
  const a = process.argv; const k = `--${name}`; const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def; const cur = a[i]; if (cur.includes('=')) return cur.split('=').slice(1).join('=');
  const next = a[i+1]; if (next && !next.startsWith('--')) return next; return true;
}
function tomorrowISO(){ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); }

function buildStops(){ return [
  { name: 'Γλυφάδα', address: 'Πλατεία Νυμφών, Γλυφάδα 16674', time: '08:00' },
  { name: 'Νέα Σμύρνη', address: 'Πλατεία Νέας Σμύρνης, Νέα Σμύρνη 17121', time: null },
  { name: 'Αθήνα (Κέντρο)', address: 'Ιπποκράτους 43, Αθήνα 10680', time: null },
  { name: 'Μουσείο Ακρόπολης', address: 'Μουσείο Ακρόπολης, Αθήνα 11742', time: null },
  { name: 'Βόσπορος (Μικρολίμανο)', address: 'Εστιατόριο Βόσπορος, Μικρολίμανο, Πειραιάς 18533', time: null }
]; }

function buildBooking(driverId, date){
  const crypto = require('crypto'); const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const created_at = new Date().toISOString(); const stops = buildStops();
  const metadata = { pickup_time: '08:00', customer_phone: '+30 69 0000 0000', stops };
  return {
    id, status: 'pending', payment_intent_id: null,
    event_id: `DEMO_SCAT_PC_${id.slice(0,8)}`,
    user_name: 'Demo Scattered Route (PC)', user_email: 'demo-scattered-pc@example.com',
    trip_id: 'DEMO_SCATTERED_GOOGLE_TEST_PCODES', seats: 3, price_cents: 0, currency: 'EUR',
    metadata: JSON.stringify(metadata), date: date || tomorrowISO(), pickup_location: stops[0].address,
    pickup_lat: null, pickup_lng: null, suitcases_json: '[]', special_requests: 'Google optimization & ETAs demo with postal codes',
    created_at, updated_at: created_at, assigned_driver_id: driverId
  };
}

async function run(){
  const driverEmail = flag('driver-email', 'testdriver@greekaway.com');
  const date = flag('date', tomorrowISO());
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
  const db = new Database(DB_PATH);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS drivers (id TEXT PRIMARY KEY, provider_id TEXT, name TEXT, email TEXT, phone TEXT, vehicle_plate TEXT, notes TEXT, status TEXT, invite_token TEXT, invite_sent_at TEXT, activated_at TEXT, password_hash TEXT, created_at TEXT)`);
    const d = db.prepare('SELECT id, email FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(driverEmail));
    if (!d) { console.error('Driver not found for email:', driverEmail); process.exit(2); }
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, status TEXT, payment_intent_id TEXT UNIQUE, event_id TEXT, user_name TEXT, user_email TEXT, trip_id TEXT, seats INTEGER, price_cents INTEGER, currency TEXT, metadata TEXT, created_at TEXT, updated_at TEXT, date TEXT, pickup_location TEXT, pickup_lat REAL, pickup_lng REAL, suitcases_json TEXT, special_requests TEXT)`);
    try { const cols = db.prepare("PRAGMA table_info('bookings')").all(); const names = new Set(cols.map(c=>c.name)); if(!names.has('assigned_driver_id')) db.prepare('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT').run(); } catch(_){}
    const booking = buildBooking(d.id, date);
    const stmt = db.prepare(`INSERT OR IGNORE INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    stmt.run(booking.id, booking.status, booking.payment_intent_id, booking.event_id, booking.user_name, booking.user_email, booking.trip_id, booking.seats, booking.price_cents, booking.currency, booking.metadata, booking.created_at, booking.updated_at, booking.date, booking.pickup_location, booking.pickup_lat, booking.pickup_lng, booking.suitcases_json, booking.special_requests, booking.assigned_driver_id);
    console.log('Created booking id:', booking.id);
  } finally { db.close(); }
}

run().catch(e => { console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
