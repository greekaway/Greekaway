#!/usr/bin/env node
/**
 * Enrich existing bookings for a driver with multiple demo stops (4 stops) including lat/lng and times.
 * Reads bookings for assigned_driver_id and updates metadata.stops. Leaves other fields intact.
 *
 * Usage:
 *   node scripts/enrich_driver_bookings_stops.js --email testdriver@greekaway.com [--stops 4]
 *   node scripts/enrich_driver_bookings_stops.js --driver-id <uuid> [--stops 4]
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

function buildStops(n){
  const base = [
    { name: 'Hotel Grand', address: 'Hotel Grand, Center', lat: 37.9779, lng: 23.7258, time: '09:10' },
    { name: 'Old Port', address: 'Old Port, Athens', lat: 37.9425, lng: 23.6465, time: '09:30' },
    { name: 'Museum Entrance', address: 'National Museum', lat: 37.9890, lng: 23.7313, time: '10:00' },
    { name: 'Beach Parking', address: 'Beach Parking', lat: 37.8882, lng: 23.7386, time: '10:30' },
    { name: 'City Center', address: 'Syntagma Square', lat: 37.9755, lng: 23.7348, time: '11:00' },
  ];
  const out = [];
  for (let i=0;i<n;i++){ out.push(base[i % base.length]); }
  return out;
}

async function run(){
  const email = flag('email');
  const driverIdArg = flag('driver-id');
  const stopsCount = parseInt(flag('stops','4'), 10) || 4;

  if (!email && !driverIdArg){
    console.error('Usage: node scripts/enrich_driver_bookings_stops.js --email <driverEmail> [--stops 4] | --driver-id <uuid>');
    process.exit(2);
  }

  let driverId = driverIdArg;
  if (hasPostgres){
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      if (!driverId && email){
        const { rows } = await client.query('SELECT id FROM drivers WHERE lower(email)=lower($1) LIMIT 1',[String(email)]);
        if (!rows || !rows[0]) { console.error('Driver not found for email'); process.exit(3); }
        driverId = rows[0].id;
      }
      const { rows: bookings } = await client.query('SELECT id, metadata FROM bookings WHERE assigned_driver_id=$1 ORDER BY created_at DESC LIMIT 50', [driverId]);
      const stops = buildStops(stopsCount);
      for (const b of bookings){
        let meta={};
        try { meta = b.metadata && typeof b.metadata === 'object' ? b.metadata : JSON.parse(b.metadata || '{}'); } catch(_){ meta = {}; }
        meta.stops = stops;
        if (!meta.pickup_time) meta.pickup_time = stops[0].time;
        await client.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2', [JSON.stringify(meta), b.id]);
      }
      console.log(`Updated ${bookings.length} bookings with ${stops.length} stops each (driver ${driverId}).`);
    } finally { await client.end(); }
  } else {
    const Database = require('better-sqlite3');
    const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
    try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch(_){}
    const db = new Database(DB_PATH);
    try {
      if (!driverId && email){
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
      const rows = db.prepare('SELECT id, metadata FROM bookings WHERE assigned_driver_id = ? ORDER BY created_at DESC LIMIT 50').all(driverId);
      const stops = buildStops(stopsCount);
      const upd = db.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?');
      for (const b of rows){
        let meta={};
        try { meta = b.metadata ? JSON.parse(b.metadata) : {}; } catch(_){ meta = {}; }
        meta.stops = stops;
        if (!meta.pickup_time) meta.pickup_time = stops[0].time;
        upd.run(JSON.stringify(meta), new Date().toISOString(), b.id);
      }
      console.log(`Updated ${rows.length} bookings with ${stops.length} stops each (driver ${driverId}).`);
    } finally { db.close(); }
  }
}

run().catch((e)=>{ console.error('Enrich error:', e && e.message ? e.message : e); process.exit(1); });
