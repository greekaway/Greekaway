const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const routeTemplate = (()=>{ try { return require('../services/routeTemplate'); } catch(_){ return null; } })();

const router = express.Router();
// Optional policies for presentation rules
let policyService = null; try { policyService = require('../services/policyService'); } catch(_) {}
// Use global JSON parser installed in server.js
router.use(express.urlencoded({ extended: true }));

// Serve driver panel HTML pages at clean URLs (extensionless)
router.get('/', (req, res) => { res.redirect('/driver/driver-login.html'); });
router.get('/login', (req, res) => { res.sendFile(path.join(__dirname, '../public/driver', 'driver-login.html')); });
router.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, '../public/driver', 'driver-dashboard.html')); });

// CORS: allow local and production domains similar to provider
const DEV_LOCAL_IP = (process.env.DEV_LOCAL_IP || '').trim();
const allowed = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://greekaway.com',
  'https://www.greekaway.com',
  DEV_LOCAL_IP ? `http://${DEV_LOCAL_IP}:3000` : null,
].filter(Boolean));

function isPrivateLanOrigin(origin){
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = u.hostname || '';
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    const m = h.match(/^172\.(\d{1,2})\./); if (m){ const n = parseInt(m[1],10); if (n>=16 && n<=31) return true; }
    return false;
  } catch(_) { return false; }
}

const allowDevAnyLan = (process.env.NODE_ENV !== 'production');
router.use(cors({ origin: (origin, cb) => {
  if (!origin) return cb(null, true);
  try {
    const o = origin.replace(/\/$/, '');
    if (allowed.has(o)) return cb(null, true);
    if (allowDevAnyLan && isPrivateLanOrigin(o)) return cb(null, true);
  } catch(_) {}
  return cb(new Error('Not allowed by CORS'));
}, credentials: false }));

// Shared helpers
const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret').toString();
const hasPostgres = !!process.env.DATABASE_URL;

function getSqlite(){
  const Database = require('better-sqlite3');
  return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
}

// Helper: add minutes to an HH:MM string, returns HH:MM (24h)
function addMinutes(hhmm, inc){
  try {
    const [h, m] = String(hhmm || '00:00').slice(0,5).split(':').map(x => parseInt(x, 10) || 0);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setMinutes(d.getMinutes() + (parseInt(inc,10) || 0));
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  } catch(_) { return String(hhmm || '00:00').slice(0,5); }
}

async function withPg(fn){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

function authMiddleware(req, res, next){
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!tok) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(tok, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) { return res.status(401).json({ error: 'Invalid token' }); }
}

async function ensureDriversPg(client){
  await client.query(`CREATE TABLE IF NOT EXISTS drivers (
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
}

// Ensure drivers table exists for SQLite (mirrors provider.js schema). Needed for local dev.
function ensureDriversSqlite(db){
  try {
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
  } catch(_) {}
}

function ensureBookingsAssignedSqlite(db){
  try {
    const cols = db.prepare("PRAGMA table_info('bookings')").all();
    const names = new Set(cols.map(c => c.name));
    if (!names.has('assigned_driver_id')) {
      db.prepare('ALTER TABLE bookings ADD COLUMN assigned_driver_id TEXT').run();
    }
  } catch(_) {}
}

async function ensureBookingsAssignedPg(client){
  try { await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT'); } catch(_) {}
}

// ---------------- Auth: POST /driver/api/login ----------------
router.post('/api/login', async (req, res) => {
  try {
    const body = req.body || {};
    const identifier = String(body.identifier || body.email || body.phone || '').trim();
    const password = String(body.password || '').trim();
    const remember = !!body.remember; // if true, extend token expiry
    if (!identifier || !password) return res.status(400).json({ error: 'Missing credentials' });

    let row = null;
    if (hasPostgres) {
      row = await withPg(async (c) => {
        await ensureDriversPg(c);
        let q, params;
        if (identifier.includes('@')) {
          q = 'SELECT id, provider_id, name, email, phone, password_hash, status FROM drivers WHERE lower(email)=lower($1) LIMIT 1';
          params = [identifier];
        } else {
          q = 'SELECT id, provider_id, name, email, phone, password_hash, status FROM drivers WHERE phone=$1 LIMIT 1';
          params = [identifier];
        }
        const { rows } = await c.query(q, params);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try {
        ensureDriversSqlite(db);
        if (identifier.includes('@')) {
          row = db.prepare('SELECT id, provider_id, name, email, phone, password_hash, status FROM drivers WHERE lower(email)=lower(?) LIMIT 1').get(identifier);
        } else {
          row = db.prepare('SELECT id, provider_id, name, email, phone, password_hash, status FROM drivers WHERE phone = ? LIMIT 1').get(identifier);
        }
      } finally { db.close(); }
    }

    if (!row || (row.status !== 'active' && row.activated_at == null)) return res.status(403).json({ error: 'Not activated' });
    if (!row.password_hash) return res.status(403).json({ error: 'No password set' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const expHours = remember ? 24 * 7 : 8; // 7 days vs 8h default
    const token = jwt.sign({ driver_id: row.id, provider_id: row.provider_id, name: row.name, email: row.email, phone: row.phone }, JWT_SECRET, { expiresIn: expHours + 'h' });
    return res.json({ ok: true, token, driver: { id: row.id, name: row.name, email: row.email, phone: row.phone }, remember });
  } catch(e){
    console.error('driver/api/login error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- GET /driver/api/bookings ----------------
router.get('/api/bookings', authMiddleware, async (req, res) => {
  const did = req.user && (req.user.driver_id || req.user.id) || null;
  if (!did) return res.status(401).json({ error: 'Unauthorized' });
  try {
    // Extra safety: ensure driver still exists and is active; otherwise force re-login on client
    if (hasPostgres) {
      const exists = await withPg(async (client) => {
        await ensureDriversPg(client);
        const { rows } = await client.query('SELECT id, status FROM drivers WHERE id = $1 LIMIT 1', [did]);
        const r = rows && rows[0];
        return !!(r && (r.status === 'active' || r.activated_at != null));
      });
      if (!exists) return res.status(401).json({ error: 'Unauthorized' });
    } else {
      const db0 = getSqlite();
      try {
        ensureDriversSqlite(db0);
        const row = db0.prepare('SELECT id, status FROM drivers WHERE id = ? LIMIT 1').get(did);
        if (!row || row.status !== 'active') return res.status(401).json({ error: 'Unauthorized' });
      } finally { db0.close(); }
    }
    if (hasPostgres) {
      const out = await withPg(async (client) => {
        await ensureBookingsAssignedPg(client);
        const { rows } = await client.query(`SELECT * FROM bookings WHERE assigned_driver_id = $1 ORDER BY created_at DESC LIMIT 200`, [did]);
        return rows || [];
      });
      const data = out.map(b => {
        let meta = {};
        try { meta = b.metadata && typeof b.metadata === 'object' ? b.metadata : JSON.parse(b.metadata || '{}'); } catch(_) {}
        const stopsArr = Array.isArray(meta.stops) ? meta.stops : [];
        return {
          id: b.id,
            booking_id: b.id,
            trip_title: (meta.tour_title || b.trip_id),
            date: b.date,
            pickup_point: (b.pickup_location && b.pickup_location.trim()) || 'N/A',
            pickup_time: (meta.pickup_time || meta.time) || 'N/A',
            customer_name: b.user_name,
            customer_phone: meta.customer_phone || null,
            status: (b.status && String(b.status)) || 'pending',
            stops_count: stopsArr.length,
            route_id: b.route_id || null
        };
      });
      return res.json({ ok: true, bookings: data });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        const rows = db.prepare(`SELECT * FROM bookings WHERE assigned_driver_id = ? ORDER BY created_at DESC LIMIT 200`).all(did);
        const data = rows.map(b => {
          let meta = {};
          try { meta = b.metadata ? JSON.parse(b.metadata) : {}; } catch(_) {}
          const stopsArr = Array.isArray(meta.stops) ? meta.stops : [];
          return {
            id: b.id,
              booking_id: b.id,
              trip_title: (meta.tour_title || b.trip_id),
              date: b.date,
              pickup_point: b.pickup_location || 'N/A',
              pickup_time: meta.pickup_time || meta.time || 'N/A',
              customer_name: b.user_name,
              customer_phone: meta.customer_phone || null,
              status: (b.status && String(b.status)) || 'pending',
              stops_count: stopsArr.length,
              route_id: b.route_id || null
          };
        });
        return res.json({ ok: true, bookings: data });
      } finally { db.close(); }
    }
  } catch(e){
    console.error('driver/api/bookings error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Single booking details (for route view). For now we synthesize stops from metadata or fallback placeholders.
router.get('/api/bookings/:id', authMiddleware, async (req, res) => {
  const did = req.user && (req.user.driver_id || req.user.id) || null;
  if (!did) return res.status(401).json({ error: 'Unauthorized' });
  const bid = String(req.params.id||'').trim();
  if (!bid) return res.status(400).json({ error: 'Missing id' });
  try {
    // Load booking row
    let row = null;
    if (hasPostgres){
      row = await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        const { rows } = await c.query('SELECT * FROM bookings WHERE id=$1 AND assigned_driver_id=$2 LIMIT 1',[bid,did]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        row = db.prepare('SELECT * FROM bookings WHERE id = ? AND assigned_driver_id = ? LIMIT 1').get(bid, did);
      } finally { db.close(); }
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    let meta = {}; try { meta = row.metadata ? (typeof row.metadata==='object'?row.metadata:JSON.parse(row.metadata)) : {}; } catch(_) {}

    // If full_path exists and presentation policy requests it, return it directly (augmenting missing trip JSON stops);
    // Otherwise, if policy prefers full route but no full_path exists, synthesize from pickups + trip JSON.
    try {
      const pol = policyService && policyService.loadPolicies ? (policyService.loadPolicies() || {}) : {};
      const pres = pol.presentation || {};
      const preferFull = !!pres.show_full_route_to_panels;
      if (preferFull && routeTemplate && typeof routeTemplate.getCanonicalRoute==='function'){
        const canon = routeTemplate.getCanonicalRoute(row, { pickupIncMin: 20 });
        const fp = (canon.full_path || []).map((r,i)=>({
          idx: i,
          original_index: (r && r.type==='pickup' && typeof r.pickup_idx==='number') ? r.pickup_idx : null,
          type: r.type||null,
          name: r.label||`Στάση ${i+1}`,
          address: r.address||'—',
          lat: r.lat??null,
          lng: r.lng??null,
          time: r.arrival_time||null,
          scheduled_time: r.arrival_time||null
        }));
        const anchor = (fp.find(s=> (s.type||'')!=='pickup') || null);
        return res.json({ ok:true, booking: { id: row.id, trip_title: (meta && meta.tour_title) || row.trip_id, date: row.date, pickup_time: (meta && (meta.pickup_time||meta.time)) || null, route_id: row.route_id || null, stops: fp, calc: { method: 'canonical', anchor_hhmm: (anchor && anchor.time) || null, anchor_iso: null } } });
      }
    } catch(_){ }

    // Build rawStops from metadata
    let rawStops = [];
    if (Array.isArray(meta.stops) && meta.stops.length){
      rawStops = meta.stops.map((s,i)=>({
        idx:i,
        type: s.type || null,
        name: s.name || s.customer || 'Στάση '+(i+1),
        address: s.address || s.pickup || s.location || '—',
        lat: s.lat || s.latitude || null,
        lng: s.lng || s.longitude || null,
        time: s.time || s.scheduled_time || null,
        scheduled_time: s.scheduled_time || null,
      }));
    } else {
      rawStops = [{ idx:0, type:'pickup', name: row.user_name || 'Πελάτης', address: row.pickup_location || '—', lat: row.pickup_lat || null, lng: row.pickup_lng || null, time: meta.pickup_time||meta.time||null }];
    }

    async function enrich(stops){
      if (!Array.isArray(stops) || stops.length < 2) return { stops, calc: { method: 'fallback', anchor_hhmm: null, anchor_iso: null } };
      const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
      let pickups = stops.filter(s => (s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||'')));
      const tourStops = stops.filter(s => !((s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||''))));
      const tourFirst = tourStops[0] || null;
      let methodUsed = 'fallback';
      let anchorIso = null;
      let anchorHhmm = null;
      try {
        // If manual order exists in metadata.stops_sorted, apply it strictly to pickups
        const sorted = Array.isArray(meta.stops_sorted) ? meta.stops_sorted.map(x => x.original_index).filter(n => Number.isFinite(n)) : null;
        if (sorted && sorted.length){
          const byIdx = new Map(pickups.map(p => [p.idx, p]));
          const manual = sorted.map(n => byIdx.get(n)).filter(Boolean);
          const rest = pickups.filter(p => !sorted.includes(p.idx));
          if (manual.length) pickups = manual.concat(rest);
          methodUsed = 'manual';
        } else if (Array.isArray(meta.pickups_manual_addresses) && meta.pickups_manual_addresses.length){
          const manualAddr = meta.pickups_manual_addresses.map(s=>String(s||'').toLowerCase());
          const byAddr = new Map(pickups.map(p => [String(p.address||'').toLowerCase(), p]));
          const ordered = manualAddr.map(a => byAddr.get(a)).filter(Boolean);
          const rest = pickups.filter(p => !manualAddr.includes(String(p.address||'').toLowerCase()));
          if (ordered.length){ pickups = ordered.concat(rest); methodUsed = 'manual'; }
        } else {
          const plan = meta && meta.pickup_plan ? meta.pickup_plan : null;
          const chosenOrig = plan && typeof plan.chosen_original_index === 'number' ? plan.chosen_original_index : null;
          if (chosenOrig != null){
            const pos = pickups.findIndex(p => p.idx === chosenOrig);
            if (pos > 0) pickups = pickups.slice(pos).concat(pickups.slice(0,pos));
          }
        }
      } catch(_){ }
      const targetAt = (() => {
        try {
          const dateStr = (row.date||'').slice(0,10);
          // Always anchor on the first tour stop time when available; if missing, default to 10:00 for demo consistency
          let tStr = (tourFirst && (tourFirst.time || tourFirst.scheduled_time)) || '';
          if (!tStr) tStr = '10:00';
          const hhmm = String(tStr).slice(0,5);
          if (dateStr && hhmm){
            anchorHhmm = hhmm;
            const d = new Date(`${dateStr}T${hhmm}:00`);
            anchorIso = d.toISOString();
            return d;
          }
        } catch(_){ }
        return new Date();
      })();
  const hasPickupPhase = pickups.length && tourFirst;
      const routeSet = hasPickupPhase ? pickups.concat([tourFirst]) : stops;
      const normStops = routeSet.map(s => { let addr=s.address||''; if (addr && !/\bGreece\b/i.test(addr)) addr = addr.replace(/\s+$/,'') + ', Greece'; return { ...s, address: addr }; });
      const departureEpochSec = Math.floor(targetAt.getTime()/1000);
  let optimized = null;
  // If manual order is set, skip Google optimization; otherwise, we may call Google
  const hasManual = (methodUsed === 'manual');
  if (key && !hasManual){
        try {
          const toQuery = (s)=> (s.lat!=null && s.lng!=null) ? `${s.lat},${s.lng}` : encodeURIComponent(String(s.address||'').trim());
          const origin = toQuery(normStops[0]);
          const destination = toQuery(normStops[normStops.length-1]);
          const middle = normStops.slice(1,-1).map(toQuery);
          const disableOptimize = /^1|true$/i.test(String(process.env.GOOGLE_DISABLE_OPTIMIZE||''));
          const wpRaw = middle.length ? middle.join('|') : '';
          const urlRaw = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${wpRaw}&mode=driving&language=el&region=gr&departure_time=${departureEpochSec}&traffic_model=best_guess&key=${key}`;
          const respRaw = await fetch(urlRaw); const dataRaw = await respRaw.json();
          let data = dataRaw;
          if (!disableOptimize && middle.length){
            const wpOpt = `optimize:true|${middle.join('|')}`;
            const urlOpt = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${wpOpt}&mode=driving&language=el&region=gr&departure_time=${departureEpochSec}&traffic_model=best_guess&key=${key}`;
            const respOpt = await fetch(urlOpt); const dataOpt = await respOpt.json();
            if (dataOpt && dataOpt.status==='OK') data = dataOpt;
          }
          if (data && data.routes && data.routes[0] && Array.isArray(data.routes[0].legs)){
            const route = data.routes[0];
            const legs = route.legs;
            const wpOrder = Array.isArray(route.waypoint_order) ? route.waypoint_order : [];
            const order = [0].concat(wpOrder.map(i=>i+1)); if (normStops.length>1) order.push(normStops.length-1);
            const legDur = []; for (let i=1;i<order.length;i++){ const leg = legs[i-1]; const d = leg && (leg.duration_in_traffic && leg.duration_in_traffic.value!=null ? leg.duration_in_traffic.value : (leg.duration && leg.duration.value)||0) || 0; legDur.push(d); }
            const totalSec = legDur.reduce((a,b)=>a+b,0); let t = targetAt.getTime() - totalSec*1000;
            optimized = order.map((origIdx, seq) => { const legIdx = seq===0?null:seq-1; const leg = legIdx!=null?legs[legIdx]:null; const durSec = leg && (leg.duration_in_traffic && leg.duration_in_traffic.value!=null ? leg.duration_in_traffic.value : (leg.duration && leg.duration.value)||0) || 0; if (seq>0) t += durSec*1000; const eta=new Date(t); const hh=String(eta.getHours()).padStart(2,'0'); const mm=String(eta.getMinutes()).padStart(2,'0'); const s = normStops[origIdx]; const isFirstTourStop = (origIdx === normStops.length - 1); return { ...s, sequence: seq+1, original_index: (typeof s.idx==='number'?s.idx:origIdx), eta_local:`${hh}:${mm}`, isFirstTourStop }; });
            methodUsed = 'google';
          }
        } catch(_){ }
      }
      if (!optimized){
        // Fallback with variable leg durations using haversine distance and avg speed
        const R = 6371; // km
        function toRad(d){ return d*Math.PI/180; }
        function hav(a,b){ if (!a||!b||a.lat==null||a.lng==null||b.lat==null||b.lng==null) return null; const dLat=toRad(b.lat-a.lat); const dLng=toRad(b.lng-a.lng); const la1=toRad(a.lat); const la2=toRad(b.lat); const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1, Math.sqrt(h))); }
        const speedKmh = 30; // conservative city speed
        const defaultLegSec = 8*60; // if distance unknown
        // compute leg durations in the given normStops order
        const legsDurSec = [];
        for (let i=1;i<normStops.length;i++){
          const dKm = hav(normStops[i-1], normStops[i]);
          const sec = (dKm!=null) ? Math.max(4*60, Math.round((dKm / speedKmh) * 3600)) : defaultLegSec; // min 4min per leg
          legsDurSec.push(sec);
        }
        const totalSec = legsDurSec.reduce((a,b)=>a+b,0);
        let t = targetAt.getTime() - totalSec*1000;
        optimized = normStops.map((s,i)=>{ if (i>0) t += (legsDurSec[i-1]||defaultLegSec)*1000; const eta = new Date(t); const hh=String(eta.getHours()).padStart(2,'0'); const mm=String(eta.getMinutes()).padStart(2,'0'); const isFirstTourStop = (i === normStops.length - 1); return { ...s, sequence:i+1, original_index:(typeof s.idx==='number'?s.idx:i), eta_local:`${hh}:${mm}`, isFirstTourStop }; });
      }
      try {
        const finalTimes = {}; optimized.forEach(s=>{ const isPickup=(s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||'')); if (isPickup) finalTimes[String(s.original_index)] = s.eta_local; });
        meta.final_pickup_times = finalTimes; meta.stops_sorted = optimized.map(s=>({ original_index:s.original_index, sequence:s.sequence }));
        if (hasPostgres){ await withPg(async c=>{ await ensureBookingsAssignedPg(c); await c.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2',[JSON.stringify(meta), row.id]); }); }
        else { const db2=getSqlite(); try { ensureBookingsAssignedSqlite(db2); db2.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), new Date().toISOString(), row.id); } finally { db2.close(); } }
      } catch(_){ }
      const optimizedSet = new Set(optimized.map(s=>s.original_index));
      // Ensure first tour stop shows anchor time exactly; next tour stops omit time
  const ordered = optimized.map((s,i,arr)=>{ if (s.isFirstTourStop){ return { ...s, eta_local: anchorHhmm || s.eta_local }; } const isPickup=(s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||'')); return isPickup ? s : { ...s, eta_local: null }; });
      if (tourStops.length>1){ tourStops.slice(1).forEach(ts=>{ if (!optimizedSet.has(ts.idx)) ordered.push({ ...ts, time: ts.time || ts.scheduled_time || null, original_index: ts.idx, eta_local: null }); }); }
      return { stops: ordered, calc: { method: methodUsed, anchor_hhmm: anchorHhmm, anchor_iso: anchorIso } };
    }

  const enriched = await enrich(rawStops);
  const stops = enriched.stops;
  const calc = enriched.calc;
  return res.json({ ok:true, booking: { id: row.id, trip_title: (meta.tour_title || row.trip_id), date: row.date, pickup_time: (meta.pickup_time||meta.time||null), route_id: row.route_id || null, stops, calc } });
  } catch(e){
    console.error('driver/api/bookings/:id error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'Server error' });
  }
});

// ---------------- POST /driver/api/update-status ----------------
router.post('/api/update-status', authMiddleware, async (req, res) => {
  const did = req.user && (req.user.driver_id || req.user.id) || null;
  if (!did) return res.status(401).json({ error: 'Unauthorized' });
  const bookingId = String((req.body && req.body.booking_id) || '').trim();
  const status = String((req.body && req.body.status) || '').trim().toLowerCase();
  if (!bookingId || !status) return res.status(400).json({ error: 'Missing fields' });
  if (!['accepted','picked','completed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        const { rows } = await c.query('SELECT id FROM bookings WHERE id = $1 AND assigned_driver_id = $2 LIMIT 1', [bookingId, did]);
        if (!rows || !rows.length) throw new Error('forbidden');
        await c.query('UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2', [status, bookingId]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        const b = db.prepare('SELECT id FROM bookings WHERE id = ? AND assigned_driver_id = ? LIMIT 1').get(bookingId, did);
        if (!b) throw new Error('forbidden');
        db.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), bookingId);
      } finally { db.close(); }
    }
    return res.json({ ok: true, status });
  } catch(e){
    const msg = String(e && e.message || 'error');
    if (msg === 'forbidden') return res.status(403).json({ error: 'Not your booking' });
    console.error('driver/api/update-status error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- POST /driver/api/plan-pickups ----------------
// Allows driver to choose the first pickup stop; recomputes pickup ETAs so arrival at first tour stop matches scheduled time
// NOTE: must mount BEFORE module.exports; ensure this block is above any export logic.
router.post('/api/plan-pickups', authMiddleware, async (req, res) => {
  const did = req.user && (req.user.driver_id || req.user.id) || null;
  if (!did) return res.status(401).json({ error: 'Unauthorized' });
  const bookingId = String((req.body && req.body.booking_id) || '').trim();
  const startIndexRaw = (req.body && (req.body.first_pickup_index !== undefined ? req.body.first_pickup_index : req.body.first_pickup_original_index));
  if (!bookingId || (startIndexRaw === undefined || startIndexRaw === null)) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Load booking (must belong to this driver)
    let row = null;
    if (hasPostgres){
      row = await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        const { rows } = await c.query('SELECT * FROM bookings WHERE id=$1 AND assigned_driver_id=$2 LIMIT 1',[bookingId, did]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        row = db.prepare('SELECT * FROM bookings WHERE id = ? AND assigned_driver_id = ? LIMIT 1').get(bookingId, did);
      } finally { db.close(); }
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    let meta = {}; try { meta = row.metadata ? (typeof row.metadata==='object'?row.metadata:JSON.parse(row.metadata)) : {}; } catch(_) {}
    const stopsRaw = Array.isArray(meta.stops) ? meta.stops : [];
    const pickups = stopsRaw.map((s,i)=>({ ...s, __idx:i })).filter(s => String((s.type||'').toLowerCase()) === 'pickup' || /παραλαβή/i.test(String(s.name||'')));
    const tourStops = stopsRaw.map((s,i)=>({ ...s, __idx:i })).filter(s => String((s.type||'').toLowerCase()) !== 'pickup' && !/παραλαβή/i.test(String(s.name||'')));
    if (!pickups.length || !tourStops.length) return res.status(400).json({ error: 'No pickup phase or tour stops' });
    const firstTour = tourStops[0];
    // Map provided index (either ordinal in pickups or original metadata index) to the pickups array
    let startIndex = Number(startIndexRaw);
    if (!Number.isFinite(startIndex)) return res.status(400).json({ error: 'Invalid index' });
    // First attempt: treat as ordinal into pickups array
    let chosen = pickups[startIndex];
    // Second attempt: treat as original stops index
    if (!chosen){
      const byOrig = pickups.findIndex(p => p.__idx === startIndex);
      if (byOrig >= 0) {
        startIndex = byOrig;
        chosen = pickups[startIndex];
      }
    }
    // If still not found, the index is invalid
    if (!chosen) return res.status(400).json({ error: 'Index out of range' });
    // Reorder pickups so selected one goes first, others follow greedy near-neighbor based on existing order
    const rest = pickups.filter(p => p.__idx !== chosen.__idx);
    const order = [chosen].concat(rest);
    // Build a synthetic sequence = ordered pickups + firstTour; set on metadata.stops_sorted respecting original indices
    const selectedIndices = order.map(o => o.__idx).concat([firstTour.__idx]);
    meta.stops_sorted = selectedIndices.map((origIdx, k) => ({ original_index: origIdx, sequence: k+1 }));
    // Persist plan hint; enrichment on GET /driver/api/bookings/:id will recompute ETAs from this order
    meta.pickup_plan = { start_index: startIndex, chosen_original_index: chosen.__idx, planned_at: new Date().toISOString() };
    if (hasPostgres){
      await withPg(async (c) => { await c.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2', [JSON.stringify(meta), row.id]); });
    } else {
      const db2 = getSqlite();
      try { db2.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), new Date().toISOString(), row.id); } finally { db2.close(); }
    }
    return res.json({ ok:true, start_index: startIndex, chosen_original_index: chosen.__idx });
  } catch(e){ console.error('driver/api/plan-pickups error', e && e.message ? e.message : e); return res.status(500).json({ error:'Server error' }); }
});

// New: Save manual pickup order (drag & drop from driver UI)
router.post('/api/update-pickup-order', async (req, res) => {
  const devBypass = String(process.env.DRIVER_DEV_BYPASS || '').toLowerCase();
  const allowBypass = (devBypass === '1' || devBypass === 'true' || devBypass === 'yes');
  let did = null;
  if (!allowBypass) {
    // normal auth
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) return res.status(401).json({ error: 'Unauthorized' });
    try { const decoded = jwt.verify(tok, JWT_SECRET); did = decoded && (decoded.driver_id || decoded.id) || null; } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
    if (!did) return res.status(401).json({ error: 'Unauthorized' });
  }
  const bookingId = String((req.body && req.body.booking_id) || '').trim();
  const order = (req.body && (req.body.new_order_original_indices || req.body.new_order)) || [];
  const orderAddresses = Array.isArray(req.body && req.body.order_addresses) ? req.body.order_addresses.map(s => String(s||'').trim()).filter(Boolean) : [];
  const list = Array.isArray(order) ? order.map(n => Number(n)).filter(n => Number.isFinite(n)) : [];
  if (!bookingId || !list.length) return res.status(400).json({ error: 'Missing fields' });
  try {
    // Load booking (must belong to this driver)
    let row = null;
    if (hasPostgres){
      row = await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        const { rows } = await c.query('SELECT * FROM bookings WHERE id=$1 AND assigned_driver_id=$2 LIMIT 1',[bookingId, did]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        row = db.prepare('SELECT * FROM bookings WHERE id = ? AND assigned_driver_id = ? LIMIT 1').get(bookingId, did);
      } finally { db.close(); }
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    let meta = {}; try { meta = row.metadata ? (typeof row.metadata==='object'?row.metadata:JSON.parse(row.metadata)) : {}; } catch(_) {}
    const stopsRaw = Array.isArray(meta.stops) ? meta.stops : [];
    const pickups = stopsRaw.map((s,i)=>({ ...s, __idx:i })).filter(s => String((s.type||'').toLowerCase()) === 'pickup' || /παραλαβή/i.test(String(s.name||'')));
    // If metadata.stops present, validate indices; otherwise skip validation (synth case)
    if (pickups.length) {
      const pickupIdxSet = new Set(pickups.map(p => p.__idx));
      for (const n of list){ if (!pickupIdxSet.has(n)) return res.status(400).json({ error: 'Invalid index in order' }); }
    }
    // Persist manual order as stops_sorted with only pickups in given sequence (tour stops order remains as-is)
    meta.stops_sorted = list.map((origIdx, k) => ({ original_index: origIdx, sequence: k+1 }));
    // Also store manual address order as a robust fallback across synthesis branches
    if (orderAddresses && orderAddresses.length) {
      meta.pickups_manual_addresses = orderAddresses.map(s => s.toLowerCase());
    }
    meta.pickup_plan = { manual: true, planned_at: new Date().toISOString() };
    if (hasPostgres){
      await withPg(async (c) => { await c.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2', [JSON.stringify(meta), row.id]); });
    } else {
      const db2 = getSqlite();
      try { db2.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), new Date().toISOString(), row.id); } finally { db2.close(); }
    }
    return res.json({ ok:true });
  } catch(e){ console.error('driver/api/update-pickup-order error', e && e.message ? e.message : e); return res.status(500).json({ error:'Server error' }); }
});

// Lightweight profile endpoint
router.get('/api/me', authMiddleware, async (req,res) => {
  const did = req.user && (req.user.driver_id || req.user.id) || null;
  if (!did) return res.status(401).json({ error:'Unauthorized' });
  try {
    let row=null;
    if (hasPostgres){
      row = await withPg(async (c) => {
        await ensureDriversPg(c);
        const { rows } = await c.query('SELECT id, name, email, phone, vehicle_plate FROM drivers WHERE id=$1 LIMIT 1',[did]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try { ensureDriversSqlite(db); row = db.prepare('SELECT id, name, email, phone, vehicle_plate FROM drivers WHERE id=? LIMIT 1').get(did); } finally { db.close(); }
    }
    if (!row) return res.status(404).json({ error:'Not found' });
    return res.json({ ok:true, driver: row });
  } catch(e){ return res.status(500).json({ error:'Server error' }); }
});

module.exports = router;
