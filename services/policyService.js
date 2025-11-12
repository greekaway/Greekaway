require('./env');
const fs = require('fs');
const path = require('path');
const adminSse = require('./adminSse');
const { forwardGeocode } = require('./geocoding');

function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ const Database = require('better-sqlite3'); const p = process.env.SQLITE_DB_PATH || path.join(__dirname, '..', 'data', 'db.sqlite3'); return new Database(p); }
async function withPg(fn){ const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }

function loadPolicies(){
  const p = path.join(__dirname, '..', 'policies.json');
  try { const raw = fs.readFileSync(p, 'utf8'); return JSON.parse(raw); } catch (e) { return null; }
}

function haversineKm(a, b){
  try {
    if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
    const toRad = (x) => x * Math.PI / 180;
    const R = 6371; // km
    const dLat = toRad((b.lat || 0) - (a.lat || 0));
    const dLon = toRad((b.lng || 0) - (a.lng || 0));
    const lat1 = toRad(a.lat || 0);
    const lat2 = toRad(b.lat || 0);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const d = 2 * R * Math.asin(Math.sqrt(x));
    return d;
  } catch (_) { return null; }
}

async function loadBookingById(id){
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query('SELECT * FROM bookings WHERE id=$1 LIMIT 1', [id]);
      return rows && rows[0] ? rows[0] : null;
    });
  } else {
    const db = getSqlite();
    try { return db.prepare('SELECT * FROM bookings WHERE id = ? LIMIT 1').get(id) || null; } finally { db.close(); }
  }
}

async function loadTripCohort(tripId, date){
  if (!tripId || !date) return [];
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query('SELECT * FROM bookings WHERE trip_id=$1 AND date=$2 AND status = $3', [tripId, date, 'confirmed']);
      return rows || [];
    });
  } else {
    const db = getSqlite();
    try { return db.prepare('SELECT * FROM bookings WHERE trip_id = ? AND date = ? AND status = ?').all(tripId, date, 'confirmed'); } finally { db.close(); }
  }
}

async function ensureBookingPickupColumns(){
  if (hasPostgres()){
    try {
      await withPg(async (c) => {
        await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_address TEXT`);
        await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lat REAL`);
        await c.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_lng REAL`);
      });
    } catch (_) {}
  } else {
    try {
      const db = getSqlite();
      try {
        const cols = db.prepare("PRAGMA table_info('bookings')").all();
        const names = new Set(cols.map(c => c.name));
        if (!names.has('pickup_address')) db.prepare('ALTER TABLE bookings ADD COLUMN pickup_address TEXT').run();
        if (!names.has('pickup_lat')) db.prepare('ALTER TABLE bookings ADD COLUMN pickup_lat REAL').run();
        if (!names.has('pickup_lng')) db.prepare('ALTER TABLE bookings ADD COLUMN pickup_lng REAL').run();
      } finally { db.close(); }
    } catch (_) {}
  }
}

async function updateBookingCoords(id, lat, lng, address){
  await ensureBookingPickupColumns();
  if (hasPostgres()){
    return withPg(async (c) => {
      await c.query('UPDATE bookings SET pickup_lat=$1, pickup_lng=$2, pickup_address=COALESCE($3,pickup_address), updated_at=now() WHERE id=$4', [lat, lng, address || null, id]);
    });
  } else {
    const db = getSqlite();
    try {
      db.prepare('UPDATE bookings SET pickup_lat = @lat, pickup_lng = @lng, pickup_address = COALESCE(@addr, pickup_address), updated_at = @now WHERE id = @id')
        .run({ id, lat, lng, addr: address || null, now: new Date().toISOString() });
    } finally { db.close(); }
  }
}

function nearestNeighborMaxDistanceKm(points){
  // points: [{lat,lng}]
  const arr = points.filter(p => p && p.lat != null && p.lng != null);
  if (arr.length <= 1) return 0;
  let worst = 0;
  for (let i=0;i<arr.length;i++){
    let best = Infinity;
    for (let j=0;j<arr.length;j++){
      if (i===j) continue;
      const d = haversineKm(arr[i], arr[j]);
      if (d == null) continue;
      if (d < best) best = d;
    }
    if (isFinite(best) && best > worst) worst = best;
  }
  return worst;
}

function broadcastViolation(payload){
  try { adminSse.broadcast({ type: 'policy_violation', ...payload }); } catch (_) {}
}

async function validateBeforeDispatch(bookingId){
  const policies = loadPolicies();
  if (!policies) return { ok:false, reasons:[{ code:'policies_missing', message:'Απουσιάζει το policies.json' }] };
  const tripExec = policies.trip_execution || {};
  const pickupPolicy = policies.pickup_policy || {};
  const dispatchPolicy = policies.dispatch_policy || {};

  const b = await loadBookingById(bookingId);
  if (!b) return { ok:false, reasons:[{ code:'booking_not_found', message:'Η κράτηση δεν βρέθηκε' }] };
  const cohort = await loadTripCohort(b.trip_id, b.date);
  const participants = cohort.reduce((acc, it) => acc + (Number(it.seats||0) || 0), 0);
  const minP = Number(tripExec.min_participants || 0);
  const reasons = [];

  if (participants < minP){
    reasons.push({ code:'below_min_participants', message:`Σύνολο επιβατών ${participants}/${minP}` });
  }

  // Pickup coordinates presence + optional geocoding fallback
  let coords = cohort.map(it => ({ lat: it.pickup_lat, lng: it.pickup_lng, id: it.id, address: it.pickup_address || it.pickup_location }));
  let missingCoords = coords.some(p => p.lat == null || p.lng == null);
  if (pickupPolicy.require_coordinates && missingCoords){
    const haveKey = !!String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
    if (pickupPolicy.geolocation_fallback && haveKey){
      // Try to geocode missing ones best-effort
      for (const p of coords){
        if (p.lat == null || p.lng == null){
          const result = await forwardGeocode(p.address || '');
          if (result && Number.isFinite(result.lat) && Number.isFinite(result.lng)){
            await updateBookingCoords(p.id, result.lat, result.lng, result.formatted_address);
            p.lat = result.lat; p.lng = result.lng; p.address = result.formatted_address || p.address;
          }
        }
      }
      // recompute
      missingCoords = coords.some(p => p.lat == null || p.lng == null);
      if (missingCoords){
        reasons.push({ code:'geocode_partial_or_missing', message:'Δεν βρέθηκαν όλες οι συντεταγμένες παραλαβής' });
      }
    } else {
      reasons.push({ code: haveKey ? 'missing_coordinates' : 'google_key_missing', message: haveKey ? 'Λείπουν συντεταγμένες παραλαβής' : 'Λείπει GOOGLE_MAPS_API_KEY για geocoding' });
    }
  }

  // Distance rule only if we have at least 2 valid coords and no missing
  const validPoints = coords.filter(p => p.lat != null && p.lng != null);
  if (validPoints.length >= 2){
    const maxNeighborKm = nearestNeighborMaxDistanceKm(validPoints);
    const maxKm = Number(tripExec.max_pickup_distance_km || 0) || 0;
    if (maxKm && maxNeighborKm > maxKm){
      reasons.push({ code:'pickup_distance_exceeded', message:`Απόσταση παραλαβής εκτός ορίου: ~${maxNeighborKm.toFixed(1)} km (όριο ${maxKm} km)` });
    }
  }

  // Elastic trigger advisory (does not override min participants by itself)
  let elasticSuggested = false;
  const trigger = tripExec.elastic_mode_trigger || {};
  const thr = Number(trigger.threshold || 0) || 0;
  if (tripExec.elastic_vehicle_selection && thr && participants < thr){
    elasticSuggested = true;
  }

  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    participants,
    min_required: minP,
    elastic_suggested: elasticSuggested,
    dispatch_policy: dispatchPolicy,
    policies
  };
}

module.exports = {
  loadPolicies,
  validateBeforeDispatch,
  haversineKm,
};
