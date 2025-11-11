const path = require('path');
const crypto = require('crypto');
const { getTravelSeconds } = require('./distance');

function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ const Database = require('better-sqlite3'); return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3')); }
async function withPg(fn){ const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }

function toIso(d){ try { return new Date(d).toISOString(); } catch(_) { return null; } }
function addMinutes(date, m){ return new Date(new Date(date).getTime() + m*60*1000); }
function addSeconds(date, s){ return new Date(new Date(date).getTime() + s*1000); }
function subMinutes(date, m){ return new Date(new Date(date).getTime() - m*60*1000); }

async function ensurePgSchema(){
  if (!hasPostgres()) return;
  try {
    await withPg(async (c) => {
      await c.query(`CREATE TABLE IF NOT EXISTS pickup_routes (
        id TEXT PRIMARY KEY,
        title TEXT,
        departure_time TEXT,
        buffer_minutes INTEGER,
        locked INTEGER DEFAULT 0,
        test_mode INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      )`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_order INTEGER`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS route_id TEXT`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_time_estimated TEXT`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_window_start TEXT`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_window_end TEXT`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_address TEXT`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lat REAL`);
      await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lng REAL`);
    });
  } catch(_) { /* best-effort */ }
}

async function upsertRoute(route){
  const now = new Date().toISOString();
  if (hasPostgres()){
    await withPg(async (c) => {
      await ensurePgSchema();
      const { rows } = await c.query('SELECT 1 FROM pickup_routes WHERE id=$1 LIMIT 1', [route.id]);
      if (rows && rows.length){
        await c.query('UPDATE pickup_routes SET title=$1, departure_time=$2, buffer_minutes=$3, locked=$4, test_mode=$5, updated_at=$6 WHERE id=$7', [route.title||null, route.departure_time||null, route.buffer_minutes||null, route.locked?1:0, route.test?1:0, now, route.id]);
      } else {
        await c.query('INSERT INTO pickup_routes (id, title, departure_time, buffer_minutes, locked, test_mode, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [route.id, route.title||null, route.departure_time||null, route.buffer_minutes||null, route.locked?1:0, route.test?1:0, now, now]);
      }
    });
  } else {
    const db = getSqlite();
    try {
      db.prepare(`INSERT INTO pickup_routes (id, title, departure_time, buffer_minutes, locked, test_mode, created_at, updated_at)
        VALUES (@id, @title, @departure_time, @buffer_minutes, @locked, @test_mode, @created_at, @updated_at)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, departure_time=excluded.departure_time, buffer_minutes=excluded.buffer_minutes, locked=excluded.locked, test_mode=excluded.test_mode, updated_at=excluded.updated_at`).run({
          id: route.id,
          title: route.title || null,
          departure_time: route.departure_time || null,
          buffer_minutes: route.buffer_minutes || null,
          locked: route.locked ? 1 : 0,
          test_mode: route.test ? 1 : 0,
          created_at: now,
          updated_at: now
        });
    } finally { db.close(); }
  }
}

async function getBookingById(id){
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query('SELECT * FROM bookings WHERE id=$1 LIMIT 1', [id]);
      return rows && rows[0] ? rows[0] : null;
    });
  } else {
    const db = getSqlite();
    try { return db.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').get(id) || null; }
    finally { db.close(); }
  }
}

async function ensureTestBookingExists(b){
  const existing = await getBookingById(b.booking_id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const dateStr = (b.departure_time || '').slice(0,10) || new Date().toISOString().slice(0,10);
  if (hasPostgres()){
    await withPg(async (c) => {
      await ensurePgSchema();
      await c.query(`INSERT INTO bookings (id, status, user_name, user_email, pickup_location, pickup_address, pickup_lat, pickup_lng, created_at, updated_at, date)
        VALUES ($1,'test',$2,$3,$4,$5,$6,$7, now(), now(), $8)`, [b.booking_id, b.name||'Demo', b.to_email||null, b.address||null, b.address||null, b.lat||null, b.lng||null, dateStr]);
    });
  } else {
    const db = getSqlite();
    try {
      db.prepare(`INSERT OR IGNORE INTO bookings (id, status, user_name, user_email, pickup_location, pickup_address, pickup_lat, pickup_lng, created_at, updated_at, date)
        VALUES (@id,'test',@user_name,@user_email,@pickup_location,@pickup_address,@pickup_lat,@pickup_lng,@created_at,@updated_at,@date)`).run({
          id: b.booking_id,
          user_name: b.name || 'Demo',
          user_email: b.to_email || null,
          pickup_location: b.address || null,
          pickup_address: b.address || null,
          pickup_lat: b.lat || null,
          pickup_lng: b.lng || null,
          created_at: now,
          updated_at: now,
          date: dateStr
        });
    } finally { db.close(); }
  }
  return await getBookingById(b.booking_id);
}

async function updateBookingPickupFields(b) {
  if (hasPostgres()){
    await withPg(async (c) => {
      const q = `UPDATE bookings SET pickup_order=$1, route_id=$2, pickup_time_estimated=$3, pickup_window_start=$4, pickup_window_end=$5, pickup_address=$6, pickup_lat=$7, pickup_lng=$8, pickup_location=COALESCE(pickup_location, $6), updated_at=now() WHERE id=$9`;
      await c.query(q, [b.pickup_order, b.route_id, b.pickup_time_estimated, b.pickup_window_start, b.pickup_window_end, b.pickup_address, b.pickup_lat, b.pickup_lng, b.id]);
    });
  } else {
    const db = getSqlite();
    try {
      const q = `UPDATE bookings SET pickup_order=@pickup_order, route_id=@route_id, pickup_time_estimated=@pickup_time_estimated, pickup_window_start=@pickup_window_start, pickup_window_end=@pickup_window_end, pickup_address=@pickup_address, pickup_lat=@pickup_lat, pickup_lng=@pickup_lng, pickup_location=COALESCE(pickup_location, @pickup_address), updated_at=@updated_at WHERE id=@id`;
      db.prepare(q).run({ ...b, updated_at: new Date().toISOString() });
    } finally { db.close(); }
  }
}

// Main algorithm per spec
async function computePickupTimes(route){
  const outStops = [];
  const rid = route.id || crypto.randomUUID();
  const buffer = Number(route.buffer_minutes || 10);
  let currentTime = new Date(route.departure_time);
  let prev = null;
  for (let i=0;i<route.bookings.length;i++){
    const stop = route.bookings[i];
    const id = stop.booking_id;
    if (route.test) await ensureTestBookingExists({ ...stop, departure_time: route.departure_time });
    let eta = new Date(currentTime);
    if (i>0) {
      const sec = await getTravelSeconds({ lat: prev.lat, lng: prev.lng }, { lat: stop.lat, lng: stop.lng });
      eta = addSeconds(eta, sec);
      eta = addMinutes(eta, buffer);
    }
    const winPad = Math.min(5, Math.floor(buffer/2));
    const wStart = subMinutes(eta, winPad);
    const wEnd = addMinutes(eta, winPad);

    // Persist into bookings
    await updateBookingPickupFields({
      id,
      route_id: rid,
      pickup_order: i+1,
      pickup_time_estimated: toIso(eta),
      pickup_window_start: toIso(wStart),
      pickup_window_end: toIso(wEnd),
      pickup_address: stop.address || null,
      pickup_lat: stop.lat || null,
      pickup_lng: stop.lng || null
    });

    outStops.push({ booking_id: id, order: i+1, eta: toIso(eta), window_start: toIso(wStart), window_end: toIso(wEnd) });
    prev = stop;
    currentTime = new Date(eta);
  }
  return { route_id: rid, stops: outStops };
}

module.exports = { computePickupTimes, upsertRoute, ensureTestBookingExists };
