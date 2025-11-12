#!/usr/bin/env node
/**
 * Create a new booking for trip_id 'acropolis' with 3 pickup points and wire it to the provider panel.
 * - Ensures provider (partners) row for email driver@example.com with password TestPass123 (id=999)
 * - Ensures driver account for testdriver@greekaway.com with password driver123 (no auto-assign)
 * - Maps trip_id 'acropolis' -> partner_id '999'
 * - Seeds capacities for the next 7 days (capacity=7) for acropolis if missing
 * - Inserts one booking on the first available date with seats=6, source='site', is_demo=0
 * - Stores pickup points both in pickup_points_json and metadata.pickups
 *
 * Usage:
 *   node scripts/create_acropolis_booking.js [--date YYYY-MM-DD]
 */

const path = require('path');
const fs = require('fs');

function flag(name, def=null){
  const a = process.argv; const k = `--${name}`; const i = a.findIndex(x => x === k || x.startsWith(k+'='));
  if (i === -1) return def; const cur = a[i]; if (cur.includes('=')) return cur.split('=')[1]; const next = a[i+1]; if (next && !next.startsWith('--')) return next; return true;
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(iso, days){ const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

function readTripStartTime(){
  try {
    const p = path.join(__dirname, '..', 'public', 'data', 'trips', 'acropolis.json');
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    return (j && j.departure && j.departure.departure_time) || (Array.isArray(j.stops) && j.stops[0] && (j.stops[0].time||j.stops[0].arrival_time)) || '10:00';
  } catch(_) { return '10:00'; }
}

async function ensureProvider(){
  // Use existing helper to set partner row with password
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', ['tools/set_local_provider_password.js', 'TestPass123', 'driver@example.com'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Failed to ensure provider row');
}
async function ensureMapping(){
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', ['tools/set_mapping.js', 'acropolis', '999', '80'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Failed to set mapping acropolis->999');
}
async function ensureDriver(){
  const { spawnSync } = require('child_process');
  const r = spawnSync('node', ['scripts/reset_driver_password.js', '--email', 'testdriver@greekaway.com', '--password', 'driver123', '--create', '--name', 'Test Driver', '--provider_id', '999'], { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Failed to ensure driver account');
}

function seedCapacities(db){
  try { db.exec(`CREATE TABLE IF NOT EXISTS capacities (trip_id TEXT, date TEXT, capacity INTEGER, PRIMARY KEY(trip_id,date))`); } catch(_){}
  const start = todayISO();
  for (let i=0;i<7;i++){
    const iso = addDays(start, i);
    try { db.prepare('INSERT OR IGNORE INTO capacities (trip_id, date, capacity) VALUES (?,?,?)').run('acropolis', iso, 7); } catch(_){}
  }
}

function firstAvailableDate(db){
  // Select first date in next 7 days where confirmed seats < capacity (or just return today if none found)
  const start = todayISO();
  for (let i=0;i<7;i++){
    const iso = addDays(start, i);
    let cap = 7; try { const r = db.prepare('SELECT capacity FROM capacities WHERE trip_id = ? AND date = ?').get('acropolis', iso); cap = (r && typeof r.capacity==='number') ? r.capacity : 7; } catch(_){}
    let taken = 0; try { const r2 = db.prepare("SELECT COALESCE(SUM(seats),0) AS s FROM bookings WHERE trip_id = ? AND date = ? AND COALESCE(status,'') <> 'canceled'").get('acropolis', iso); taken = (r2 && r2.s)|0; } catch(_){}
    if (taken < cap) return iso;
  }
  return start;
}

function buildPickupPoints(){
  return [
    { address: 'Ρουμπέση 7, Αθήνα', pax: 2 },
    { address: 'Ηλία Ρογκάκου 2, Αθήνα', pax: 2 },
    { address: 'Ιπποκράτους 43, Αθήνα', pax: 2 }
  ];
}

function createBookingRow(db, date){
  const crypto = require('crypto');
  const id = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
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
    pickup_points_json TEXT,
    suitcases_json TEXT,
    special_requests TEXT,
    is_demo INTEGER DEFAULT 0,
    source TEXT,
    partner_id TEXT,
    assigned_driver_id TEXT
  )`);
  const pickups = buildPickupPoints();
  const startTime = readTripStartTime();
  // Heuristic: default pickup start 60' before trip start
  function minusMinutes(hhmm, min){ try { const [h,m]=String(hhmm).split(':').map(x=>parseInt(x,10)||0); const d=new Date(); d.setHours(h,m,0,0); d.setMinutes(d.getMinutes()-min); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); } catch(_){ return hhmm; } }
  const pickup_time = minusMinutes(startTime, 60);
  const metadata = { pickup_time, pickups, tour_title: 'Acropolis' };
  const insert = db.prepare(`INSERT INTO bookings (id,status,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at,date,pickup_location,pickup_lat,pickup_lng,pickup_points_json,suitcases_json,special_requests,is_demo,source,partner_id,assigned_driver_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insert.run(id, 'pending', null, null, 'Acropolis Visitor', 'acropolis-guest@example.com', 'acropolis', 6, 0, 'EUR', JSON.stringify(metadata), now, now, date, pickups[0].address, null, null, JSON.stringify(pickups), '[]', '', 0, 'site', '999', null);
  return id;
}

async function main(){
  const dateFlag = flag('date', null);
  await ensureProvider();
  await ensureMapping();
  await ensureDriver();

  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
  const db = new Database(DB_PATH);
  try {
    seedCapacities(db);
    const date = dateFlag || firstAvailableDate(db);
    const bookingId = createBookingRow(db, date);
    console.log(JSON.stringify({ ok:true, trip_id:'acropolis', booking_id: bookingId, date, pax_total: 6, pickups_count: 3, start_time: readTripStartTime() }));
  } finally { db.close(); }
}

if (require.main === module) {
  main().catch((e)=>{ console.error('Error:', e && e.message ? e.message : e); process.exit(1); });
}
