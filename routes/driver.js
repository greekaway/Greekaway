const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const router = express.Router();
router.use(express.json());
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
            trip_title: b.trip_id,
            date: b.date,
            pickup_point: (b.pickup_location && b.pickup_location.trim()) || 'N/A',
            pickup_time: (meta.pickup_time || meta.time) || 'N/A',
            customer_name: b.user_name,
            customer_phone: meta.customer_phone || null,
            status: (b.status && String(b.status)) || 'pending',
            stops_count: stopsArr.length
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
              trip_title: b.trip_id,
              date: b.date,
              pickup_point: b.pickup_location || 'N/A',
              pickup_time: meta.pickup_time || meta.time || 'N/A',
              customer_name: b.user_name,
              customer_phone: meta.customer_phone || null,
              status: (b.status && String(b.status)) || 'pending',
              stops_count: stopsArr.length
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
    // Derive stops; if no structured stops present, build one from pickup_location and customer name
    let rawStops = [];
    if (Array.isArray(meta.stops) && meta.stops.length){
      rawStops = meta.stops.map((s,i)=>({
        idx:i,
        name: s.name || s.customer || 'Στάση '+(i+1),
        address: s.address || s.pickup || s.location || '—',
        lat: s.lat || s.latitude || null,
        lng: s.lng || s.longitude || null,
        time: s.time || null,
      }));
    } else {
      rawStops = [{ idx:0, name: row.user_name || 'Πελάτης', address: row.pickup_location || '—', lat: row.pickup_lat || null, lng: row.pickup_lng || null, time: meta.pickup_time||meta.time||null }];
    }
    // Enrich with Google (optimized order + traffic-aware ETAs starting from scheduled pickup time)
  async function enrich(stops){
      if (stops.length < 2) return stops;
      const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
      if (!key){ return stops; }

      // Determine scheduled start time: booking date + pickup_time (fallback: now)
      const startAt = (() => {
        try {
          const dateStr = (row.date || '').slice(0,10);
          const timeStr = String(meta.pickup_time || meta.time || '').slice(0,5);
          if (dateStr && timeStr){
            // Use local timezone Date (sufficient for demo/dev)
            return new Date(`${dateStr}T${timeStr}:00`);
          }
        } catch(_){ }
        return new Date();
      })();
      const departureEpochSec = Math.floor(startAt.getTime() / 1000);
      if (String(process.env.LOG_GOOGLE_ROUTES||'').trim()==='1'){
        try {
          console.log('[google] startAt(local):', startAt.toString(), 'epoch:', departureEpochSec);
          console.log('[google] stops:', stops.map(s=>({ name:s.name, address:s.address||null, lat:s.lat||null, lng:s.lng||null })));
        } catch(_){}
      }

      const toQuery = (s) => {
        if (s.lat!=null && s.lng!=null) return `${s.lat},${s.lng}`;
        return String(s.address||'').trim();
      };
      // Normalize addresses: ensure country suffix for better geocoding, without altering original metadata
      const normStops = stops.map(s => {
        let addr = s.address || '';
        if (addr && !/\bGreece\b/i.test(addr)) addr = addr.replace(/\s+$/,'') + ', Greece';
        return { ...s, address: addr };
      });
      // Use normalized list for API queries only (do not persist yet)
      const stopsForApi = normStops;

      // Try Directions API to get Google's optimized waypoint order and legs with duration_in_traffic
      // origin = first stop, destination = last stop, waypoints = middle (optimize:true)
      let optimized = null;
      try {
  const origin = encodeURIComponent(toQuery(stopsForApi[0]));
  const destination = encodeURIComponent(toQuery(stopsForApi[stopsForApi.length - 1]));
  const middle = stopsForApi.slice(1, -1).map(toQuery).map(encodeURIComponent);
        const disableOptimize = /^1|true$/i.test(String(process.env.GOOGLE_DISABLE_OPTIMIZE||'').trim());
        // First call WITHOUT optimize to get raw leg durations in given order
  const waypointParamRaw = middle.length ? middle.join('|') : '';
        const urlRaw = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypointParamRaw}&mode=driving&language=el&region=gr&departure_time=${departureEpochSec}&traffic_model=best_guess&key=${key}`;
        const respRaw = await fetch(urlRaw);
        const dataRaw = await respRaw.json();
        if (String(process.env.LOG_GOOGLE_ROUTES||'').trim()==='1'){
          try {
            console.log('[google][directions raw] status:', dataRaw && dataRaw.status);
            if (dataRaw && dataRaw.routes && dataRaw.routes[0]){
              const r = dataRaw.routes[0];
              if (Array.isArray(r.legs)){
                console.log('[google][directions raw] legs:', r.legs.map(l=>({
                  distance: l && l.distance && l.distance.text,
                  duration: l && l.duration && l.duration.text,
                  duration_in_traffic: l && l.duration_in_traffic && l.duration_in_traffic.text,
                  start_address: l && l.start_address,
                  end_address: l && l.end_address
                })));
              }
            }
          } catch(_){}
        }
        let data = dataRaw;
        if (!disableOptimize){
          const waypointParamOpt = middle.length ? `optimize:true|${middle.join('|')}` : '';
          const urlOpt = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=${waypointParamOpt}&mode=driving&language=el&region=gr&departure_time=${departureEpochSec}&traffic_model=best_guess&key=${key}`;
          const respOpt = await fetch(urlOpt);
          const dataOpt = await respOpt.json();
          data = dataOpt && dataOpt.status==='OK' ? dataOpt : dataRaw; // fallback
        }
        if (String(process.env.LOG_GOOGLE_ROUTES||'').trim()==='1'){
          try {
            console.log('[google][directions final] status:', data && data.status, 'optimized:', !disableOptimize);
            if (data && data.routes && data.routes[0]){
              const r = data.routes[0];
              console.log('[google][directions final] waypoint_order:', r.waypoint_order);
              if (Array.isArray(r.legs)){
                console.log('[google][directions final] legs:', r.legs.map(l=>({
                  distance: l && l.distance && l.distance.text,
                  duration: l && l.duration && l.duration.text,
                  duration_in_traffic: l && l.duration_in_traffic && l.duration_in_traffic.text,
                  start_address: l && l.start_address,
                  end_address: l && l.end_address
                })));
              }
              if (Array.isArray(data.geocoded_waypoints)){
                console.log('[google][directions final] geocoded_waypoints statuses:', data.geocoded_waypoints.map(g=>g && g.geocoder_status));
              }
            }
          } catch(_){}
        }
        if (data && data.routes && data.routes[0] && Array.isArray(data.routes[0].legs)){
          const route = data.routes[0];
          const legs = route.legs; // legs length == number of hops between ordered stops
          const wpOrder = Array.isArray(route.waypoint_order) ? route.waypoint_order : [];
          // Build order indices into original stops: 0 (origin), then (1+wpOrder...), then last
          const order = [0].concat(wpOrder.map(i => i+1));
          if (stops.length > 1) order.push(stops.length-1);

          // Accumulate ETAs using duration_in_traffic when available
          let t = startAt.getTime();
          optimized = order.map((origIdx, seq) => {
            const legIdx = seq===0 ? null : (seq-1);
            const leg = legIdx!=null ? legs[legIdx] : null;
            const distMeters = leg && leg.distance && leg.distance.value != null ? leg.distance.value : (seq===0?0:null);
            const durSec = leg && (leg.duration_in_traffic && leg.duration_in_traffic.value != null ? leg.duration_in_traffic.value : (leg.duration && leg.duration.value) || 0) || 0;
            if (seq>0) t += durSec * 1000;
            const eta = new Date(t);
            const hh = String(eta.getHours()).padStart(2,'0');
            const mm = String(eta.getMinutes()).padStart(2,'0');
            const s = stops[origIdx];
            return {
              ...s,
              sequence: seq+1,
              original_index: origIdx,
              distance_meters: distMeters,
              distance_text: distMeters!=null ? ((distMeters/1000).toFixed(1) + ' km') : null,
              duration_seconds: durSec,
              eta_local: `${hh}:${mm}`
            };
          });
        }
      } catch(_){ /* ignore and fallback */ }

      if (!optimized){
        // Fallback: Distance Matrix with departure_time and traffic model; greedy order
        const encodeItem = (s) => {
          if (s.lat && s.lng) return `${s.lat},${s.lng}`;
          return encodeURIComponent(String(s.address||'').replace(/\s+/g,'+'));
        };
        const origins = stopsForApi.map(encodeItem).join('|');
        const destinations = origins; // symmetric matrix
        let matrix = null;
        try {
          const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&mode=driving&language=el&region=gr&departure_time=${departureEpochSec}&traffic_model=best_guess&origins=${origins}&destinations=${destinations}&key=${key}`;
          const resp = await fetch(url);
          matrix = await resp.json();
          if (String(process.env.LOG_GOOGLE_ROUTES||'').trim()==='1'){
            try {
              console.log('[google][matrix] status:', matrix && matrix.status);
              if (matrix && Array.isArray(matrix.rows) && matrix.rows[0] && Array.isArray(matrix.rows[0].elements)){
                console.log('[google][matrix] first-row elements statuses:', matrix.rows[0].elements.map(e=>e && e.status));
              }
            } catch(_){}
          }
        } catch(e){ /* ignore API errors */ }
        if (!matrix || !Array.isArray(matrix.rows)) return stops;
        const distances = matrix.rows.map(r => (r.elements||[]).map(el => (el && el.distance && el.distance.value) || null));
        const durations = matrix.rows.map(r => (r.elements||[]).map(el => {
          if (!el) return null;
          if (el.duration_in_traffic && el.duration_in_traffic.value != null) return el.duration_in_traffic.value;
          if (el.duration && el.duration.value != null) return el.duration.value;
          return null;
        }));
        const used = new Set([0]);
        const order = [0];
        while (order.length < stops.length){
          const last = order[order.length-1];
          let bestIdx = null; let bestDist = Infinity;
          for (let i=0;i<stops.length;i++){
            if (used.has(i)) continue;
            const d = distances[last] && distances[last][i] != null ? distances[last][i] : Infinity;
            if (d < bestDist){ bestDist = d; bestIdx = i; }
          }
          if (bestIdx == null){
            for (let i=0;i<stops.length;i++){
              if (!used.has(i)) { used.add(i); order.push(i); }
            }
            break;
          }
          used.add(bestIdx); order.push(bestIdx);
        }
        let t = startAt.getTime();
        optimized = order.map((origPos, seq) => {
          const s = stops[origPos];
          const travelSec = seq===0 ? 0 : (durations[order[seq-1]] && durations[order[seq-1]][origPos]) || 0;
          if (seq>0) t += travelSec * 1000;
          const etaDate = new Date(t);
          const hh = String(etaDate.getHours()).padStart(2,'0');
          const mm = String(etaDate.getMinutes()).padStart(2,'0');
          return {
            ...s,
            sequence: seq+1,
            original_index: origPos,
            distance_meters: seq===0 ? 0 : (distances[order[seq-1]] && distances[order[seq-1]][origPos]) || null,
            distance_text: seq===0 ? '0 m' : ((distances[order[seq-1]] && distances[order[seq-1]][origPos]) ? ((distances[order[seq-1]][origPos]/1000).toFixed(1) + ' km') : null),
            duration_seconds: travelSec,
            eta_local: hh+':'+mm
          };
        });
      }

      // Persist ordering hint if possible
      try {
        meta.stops_sorted = optimized.map(s => ({ original_index: s.original_index, sequence: s.sequence }));
        if (hasPostgres){
          await withPg(async (c) => {
            await ensureBookingsAssignedPg(c);
            await c.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2', [JSON.stringify(meta), row.id]);
          });
        } else {
          const db2 = getSqlite();
          try {
            ensureBookingsAssignedSqlite(db2);
            db2.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), new Date().toISOString(), row.id);
          } finally { db2.close(); }
        }
      } catch(e){ /* ignore persistence errors */ }
      return optimized;
    }
    const stops = await enrich(rawStops);
    return res.json({ ok:true, booking: { id: row.id, trip_title: row.trip_id, date: row.date, pickup_time: (meta.pickup_time||meta.time||null), stops } });
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
