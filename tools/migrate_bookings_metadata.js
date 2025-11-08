#!/usr/bin/env node
/**
 * Backfill bookings columns from legacy metadata JSON.
 * - pickup_location <- metadata.pickup_point|pickup|pickup_address|pickup_location|from|start_location
 * - pickup_lat/lng  <- metadata.pickup_lat/pickup_lng (number/string)
 * - suitcases_json  <- metadata.suitcases|luggage (array/object or stringified single)
 * - special_requests <- metadata.special_requests|notes
 */
const path = require('path');
require('dotenv').config();

function normalizeSuitcases(meta){
  const s = meta && (meta.suitcases ?? meta.luggage);
  if (Array.isArray(s)) return JSON.stringify(s);
  if (s && typeof s === 'object') return JSON.stringify(s);
  if (s == null || s === '') return JSON.stringify([]);
  return JSON.stringify([String(s)]);
}

function pickPickup(meta){
  const cands = [meta.pickup_location, meta.pickup_point, meta.pickup_address, meta.pickup, meta.from, meta.start_location];
  const v = cands.find(x => x != null && String(x).trim() !== '');
  return (v == null) ? '' : String(v);
}

function toNum(v){
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function runSqlite(){
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'data', 'db.sqlite3');
  const db = new Database(dbPath);
  try {
    // Ensure columns exist (idempotent ALTER attempts)
    try { db.prepare("ALTER TABLE bookings ADD COLUMN pickup_location TEXT DEFAULT ''").run(); } catch(_) {}
    try { db.prepare('ALTER TABLE bookings ADD COLUMN pickup_lat REAL').run(); } catch(_) {}
    try { db.prepare('ALTER TABLE bookings ADD COLUMN pickup_lng REAL').run(); } catch(_) {}
    try { db.prepare("ALTER TABLE bookings ADD COLUMN suitcases_json TEXT DEFAULT '[]'").run(); } catch(_) {}
    try { db.prepare("ALTER TABLE bookings ADD COLUMN special_requests TEXT DEFAULT ''").run(); } catch(_) {}

    const rows = db.prepare('SELECT id, metadata FROM bookings').all();
    const upd = db.prepare('UPDATE bookings SET pickup_location = ?, pickup_lat = ?, pickup_lng = ?, suitcases_json = ?, special_requests = ? WHERE id = ?');
    const tx = db.transaction((batch) => {
      for (const r of batch) {
        let meta = {};
        try { meta = r.metadata ? JSON.parse(r.metadata) : {}; } catch(_) {}
        const pickup_location = pickPickup(meta);
        const pickup_lat = toNum(meta.pickup_lat);
        const pickup_lng = toNum(meta.pickup_lng);
        const suitcases_json = normalizeSuitcases(meta);
        const special_requests = String(meta.special_requests ?? meta.notes ?? '');
        upd.run(pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, r.id);
      }
    });
    tx(rows);
    console.log(`Backfilled ${rows.length} bookings (SQLite)`);
  } finally {
    db.close();
  }
}

async function runPg(){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Safe ALTERs
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_location TEXT DEFAULT ''");
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION');
    await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION');
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suitcases_json TEXT DEFAULT '[]'");
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS special_requests TEXT DEFAULT ''");

    const { rows } = await client.query('SELECT id, metadata FROM bookings');
    for (const r of rows) {
      let meta = {};
      try { meta = r.metadata && typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {}); } catch(_) {}
      const pickup_location = pickPickup(meta);
      const pickup_lat = toNum(meta.pickup_lat);
      const pickup_lng = toNum(meta.pickup_lng);
      const suitcases_json = normalizeSuitcases(meta);
      const special_requests = String(meta.special_requests ?? meta.notes ?? '');
      await client.query('UPDATE bookings SET pickup_location = $1, pickup_lat = $2, pickup_lng = $3, suitcases_json = $4, special_requests = $5 WHERE id = $6', [pickup_location, pickup_lat, pickup_lng, suitcases_json, special_requests, r.id]);
    }
    console.log(`Backfilled ${rows.length} bookings (Postgres)`);
  } finally {
    await client.end();
  }
}

async function main(){
  if (process.env.DATABASE_URL) return runPg();
  return runSqlite();
}

main().catch((e) => { console.error('Backfill failed:', e && e.message ? e.message : e); process.exit(1); });
