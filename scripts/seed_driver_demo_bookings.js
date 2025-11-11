#!/usr/bin/env node
/**
 * Seed 4-5 demo bookings with fake two-stop routes and assign to a specific driver.
 *
 * Usage:
 *   node scripts/seed_driver_demo_bookings.js --email testdriver@greekaway.com [--count 5]
 *   node scripts/seed_driver_demo_bookings.js --driver-id <uuid> [--count 5]
 *
 * Works with SQLite by default (data/db.sqlite3). If DATABASE_URL is set, tries Postgres.
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

const hasPostgres = !!process.env.DATABASE_URL;

async function ensureBookingsAssignedSqlite(db){
  try {
    const cols = db.prepare("PRAGMA table_info('bookings')").all();
    const names = new Set(cols.map(c => c.name));
    if (!names.has('assigned_driver_id')) {
      db.prepare('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT').run();
      console.log('seed: added bookings.assigned_driver_id');
    }
  } catch(e) {
    console.warn('seed: ensure assigned_driver_id failed (sqlite)', e && e.message ? e.message : e);
  }
}

async function ensureBookingsAssignedPg(client){
  try { await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT'); }
  catch(e){ console.warn('seed: ensure assigned_driver_id failed (pg)', e && e.message ? e.message : e); }
}

function demoStops(i){
  // Generate two fake stops with slight variations
  const baseNames = [
    ['Hotel Grand', 'Old Port'],
    ['Airport Gate B', 'City Center'],
    ['Museum Entrance', 'Beach Parking'],
    ['North Station', 'South Marina'],
    ['Village Square', 'Harbor Bus Stop']
  ];
  const pair = baseNames[i % baseNames.length];
  return [
    { name: pair[0], address: `${pair[0]}, Demo Street ${10+i}`, time: '09:30' },
    { name: pair[1], address: `${pair[1]}, Demo Avenue ${20+i}`, time: '10:00' }
  ];
}

function isoDateOffset(days){
  const d = new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

function buildBooking(i, driverId){
  const id = (require('crypto').randomUUID && require('crypto').randomUUID()) || require('crypto').randomBytes(16).toString('hex');
  const created_at = new Date().toISOString();
  const date = isoDateOffset(i); // today + i
  const meta = {
    pickup_time: '09:15',
    customer_phone: '+30 69 0000 0000',
    stops: demoStops(i)
  };
  return {
    id,
    status: 'pending',
    payment_intent_id: null,
    event_id: `DEMO_EVT_${id.slice(0,8)}`,
    user_name: `Demo Traveler ${i+1}`,
    user_email: `demo${i+1}@example.com`,
    trip_id: `DEMO_TRIP_${(i%3)+1}`,
    seats: 2,
    price_cents: 3000,
    currency: 'EUR',
    metadata: JSON.stringify(meta),
    date,
    pickup_location: meta.stops[0].address,
    pickup_lat: null,
    pickup_lng: null,
    suitcases_json: '[]',
    special_requests: '',
    created_at,
    updated_at: created_at,
    assigned_driver_id: driverId
  };
}

async function run(){
  const email = flag('email');
  const driverIdArg = flag('driver-id');
  const count = parseInt(flag('count', '5'), 10) || 5;

  if (!email && !driverIdArg){
    console.error('Usage: node scripts/seed_driver_demo_bookings.js --email <driverEmail> [--count 5] | --driver-id <uuid>');
    process.exit(2);
  }

  let driverId = driverIdArg;

  if (hasPostgres){
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      if (!driverId && email){
        const { rows } = await client.query('SELECT id FROM drivers WHERE lower(email)=lower($1) LIMIT 1', [String(email)]);
        if (!rows || !rows[0]) { console.error('Driver not found for email'); process.exit(3); }
        driverId = rows[0].id;
      }
      await ensureBookingsAssignedPg(client);
      const list = Array.from({ length: count }).map((_,i)=>buildBooking(i, driverId));
      for (const b of list){
        await client.query(
          `INSERT INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
           ON CONFLICT (id) DO NOTHING`,
          [b.id,b.status,b.payment_intent_id,b.event_id,b.user_name,b.user_email,b.trip_id,b.seats,b.price_cents,b.currency,b.metadata,b.created_at,b.updated_at,b.date,b.pickup_location,b.pickup_lat,b.pickup_lng,b.suitcases_json,b.special_requests,b.assigned_driver_id]
        );
      }
      console.log(`Seeded ${list.length} demo bookings for driver ${driverId}`);
    } finally { await client.end(); }
  } else {
    const Database = require('better-sqlite3');
    const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
    try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
    const db = new Database(DB_PATH);
    try {
      // Resolve driver id
      if (!driverId && email){
        // ensure drivers exists
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
        const row = db.prepare('SELECT id FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(String(email));
        if (!row) { console.error('Driver not found for email'); process.exit(3); }
        driverId = row.id;
      }

      // ensure bookings exists (created by server.js usually)
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
      await ensureBookingsAssignedSqlite(db);

      const list = Array.from({ length: count }).map((_,i)=>buildBooking(i, driverId));
      const stmt = db.prepare(`INSERT OR IGNORE INTO bookings (id, status, payment_intent_id, event_id, user_name, user_email, trip_id, seats, price_cents, currency, metadata, created_at, updated_at, date, pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, assigned_driver_id)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const tx = db.transaction((rows)=>{ rows.forEach(r => stmt.run(r.id,r.status,r.payment_intent_id,r.event_id,r.user_name,r.user_email,r.trip_id,r.seats,r.price_cents,r.currency,r.metadata,r.created_at,r.updated_at,r.date,r.pickup_location,r.pickup_lat,r.pickup_lng,r.suitcases_json,r.special_requests,r.assigned_driver_id)); });
      tx(list);
      console.log(`Seeded ${list.length} demo bookings for driver ${driverId}`);
    } finally { db.close(); }
  }
}

run().catch((e)=>{ console.error('Seed error:', e && e.message ? e.message : e); process.exit(1); });
