const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const router = express.Router();
router.use(express.json());

// Serve provider panel HTML pages at clean URLs (extensionless)
router.get('/', (req, res) => { res.redirect('/provider/login'); });
router.get('/login', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'login.html')); });
router.get('/dashboard', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'dashboard.html')); });
router.get('/bookings', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'bookings.html')); });
router.get('/payments', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'payments.html')); });
router.get('/profile', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'profile.html')); });
// Availability (HTML route)
router.get('/availability', (req, res) => { res.sendFile(path.join(__dirname, '../public/provider', 'provider-availability.html')); });

// CORS: allow specific origins only
const DEV_LOCAL_IP = (process.env.DEV_LOCAL_IP || '').trim();
const allowed = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://greekaway.com',
  'https://www.greekaway.com',
  DEV_LOCAL_IP ? `http://${DEV_LOCAL_IP}:3000` : null,
].filter(Boolean));
router.use(cors({ origin: (origin, cb) => {
  if (!origin) return cb(null, true); // allow same-origin / curl
  try {
    const o = origin.replace(/\/$/, '');
    if (allowed.has(o)) return cb(null, true);
  } catch(_) {}
  return cb(new Error('Not allowed by CORS'));
}, credentials: false }));

// Rate-limit login
let rateLimit = null; try { rateLimit = require('express-rate-limit'); } catch(_) {}
if (rateLimit) {
  router.use('/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 }));
}

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
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

router.post('/auth/login', async (req, res) => {
  try {
    const email = (req.body && req.body.email || '').toString().trim().toLowerCase();
    const password = (req.body && req.body.password || '').toString();
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    let row = null;
    if (hasPostgres) {
      row = await withPg(async (client) => {
        const { rows } = await client.query('SELECT id, name, email, password_hash, panel_enabled, last_seen FROM partners WHERE lower(email) = $1 LIMIT 1', [email]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try {
        row = db.prepare('SELECT id, name, email, password_hash, panel_enabled, last_seen FROM partners WHERE lower(email) = ? LIMIT 1').get(email);
      } finally { db.close(); }
    }
    if (!row || !(row.panel_enabled || row.panel_enabled === 1)) return res.status(403).json({ error: 'Panel disabled' });
    if (!row.password_hash) return res.status(403).json({ error: 'No password set' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    // update last_seen
    const now = new Date().toISOString();
    try {
      if (hasPostgres) {
        await withPg((c) => c.query('UPDATE partners SET last_seen = now() WHERE id = $1', [row.id]));
      } else {
        const db = getSqlite();
        try { db.prepare('UPDATE partners SET last_seen = ? WHERE id = ?').run(now, row.id); } finally { db.close(); }
      }
    } catch(_) {}
    const token = signToken({ partner_id: row.id, email: row.email, name: row.name });
    return res.json({ ok: true, token, partner: { id: row.id, name: row.name, email: row.email, last_seen: now } });
  } catch (e) {
    console.error('provider/auth/login error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Helper to map admin/internal statuses to provider-friendly badges
function badgeStatus(s){
  const x = String(s || '').toLowerCase();
  if (x === 'confirmed') return 'dispatched';
  if (x === 'accepted') return 'accepted';
  if (x === 'picked' || x === 'picked-up' || x === 'picked_up') return 'picked';
  if (x === 'completed') return 'completed';
  if (x === 'declined') return 'declined';
  return x || 'unknown';
}

// Provider API — use /provider/api/* to avoid conflicts with HTML routes above
router.get('/api/bookings', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (hasPostgres) {
      const out = await withPg(async (client) => {
        const { rows } = await client.query(`SELECT b.* FROM bookings b WHERE b.partner_id = $1 AND b.status IN ('confirmed','accepted','picked','completed','declined') ORDER BY b.created_at DESC LIMIT 200`, [pid]);
        return rows || [];
      });
      // dispatch meta
      const ids = out.map(r => r.id);
      const dispatch = await require('../services/dispatchService').latestStatusForBookings(ids);
      const data = out.map(b => ({
        id: b.id,
        booking_id: b.id,
        trip_title: (b.metadata && b.metadata.trip_title) || b.trip_id,
        date: b.date,
        pickup_point: (b.metadata && (b.metadata.pickup_point || b.metadata.pickup)) || 'N/A',
        pickup_time: (b.metadata && (b.metadata.pickup_time || b.metadata.time)) || 'N/A',
        customer_name: (b.metadata && b.metadata.customer_name) || b.user_name,
        customer_phone: (b.metadata && b.metadata.customer_phone) || null,
        status: badgeStatus(b.status),
        dispatch: dispatch[b.id] || null,
      }));
      return res.json({ ok: true, bookings: data });
    } else {
      const db = getSqlite();
      try {
        const rows = db.prepare(`SELECT * FROM bookings WHERE partner_id = ? AND status IN ('confirmed','accepted','picked','completed','declined') ORDER BY created_at DESC LIMIT 200`).all(pid);
        const ids = rows.map(r => r.id);
        const dispatch = await require('../services/dispatchService').latestStatusForBookings(ids);
        const data = rows.map(b => {
          let meta = {}; try { meta = b.metadata ? JSON.parse(b.metadata) : {}; } catch(_) {}
          return {
            id: b.id,
            booking_id: b.id,
            trip_title: meta.trip_title || b.trip_id,
            date: b.date,
            pickup_point: meta.pickup_point || meta.pickup || 'N/A',
            pickup_time: meta.pickup_time || meta.time || 'N/A',
            customer_name: meta.customer_name || b.user_name,
            customer_phone: meta.customer_phone || null,
            status: badgeStatus(b.status),
            dispatch: dispatch[b.id] || null,
          };
        });
        return res.json({ ok: true, bookings: data });
      } finally { db.close(); }
    }
  } catch (e) { console.error('provider/bookings error', e && e.message ? e.message : e); return res.status(500).json({ error: 'Server error' }); }
});

router.get('/api/bookings/:id', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  const id = req.params.id;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (hasPostgres){
      const row = await withPg(async (client) => {
        const { rows } = await client.query('SELECT * FROM bookings WHERE id=$1 AND partner_id=$2 LIMIT 1', [id, pid]);
        return rows && rows[0] ? rows[0] : null;
      });
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json({ ok:true, booking: row });
    } else {
      const db = getSqlite();
      try {
        const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND partner_id = ? LIMIT 1').get(id, pid);
        if (!row) return res.status(404).json({ error: 'Not found' });
        if (row.metadata) { try { row.metadata = JSON.parse(row.metadata); } catch(_){} }
        return res.json({ ok:true, booking: row });
      } finally { db.close(); }
    }
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

router.post('/api/bookings/:id/action', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  const id = req.params.id;
  const action = (req.body && req.body.action || '').toString();
  const map = { accept: 'accepted', decline: 'declined', picked: 'picked', completed: 'completed' };
  const newStatus = map[action] || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    // update bookings.status when applicable
    if (newStatus){
      const now = new Date().toISOString();
      if (hasPostgres) {
        await withPg((c) => c.query('UPDATE bookings SET status=$1, updated_at=now() WHERE id=$2 AND partner_id=$3', [newStatus, id, pid]));
      } else {
        const db = getSqlite();
        try { db.prepare('UPDATE bookings SET status=?, updated_at=? WHERE id=? AND partner_id=?').run(newStatus, now, id, pid); } finally { db.close(); }
      }
    }
  // also append to dispatch_log with response_text action (fire-and-forget)
  // temporarily disabled to avoid non-critical logging errors affecting client response
  // try { appendActionLog(id, pid, action); } catch(_) {}
  return res.json({ ok:true, status: newStatus || 'ok' });
  } catch (e) { console.error('provider action error', e && e.message ? e.message : e); return res.status(500).json({ error: 'Server error' }); }
});

async function appendActionLog(bookingId, partnerId, action){
  const { queue } = require('../services/dispatchService');
  // lightweight: record as error with response_text carrying action
  const svc = require('../services/dispatchService');
  // we don't expose a direct insert; reuse internal upsert via a fake queue with override disabled to avoid duplicate success
  try {
    const payload = { booking_id: bookingId, action };
    const { queue: _q } = svc;
    // record-only: create a pending row with response_text
    const upsert = require('../services/dispatchService').__upsert || null; // not exposed; ignore
  } catch(_) {}
  // fallback: use DB directly
  try {
    if (hasPostgres){
      await withPg(async (c) => {
        await c.query(`INSERT INTO dispatch_log (id, booking_id, partner_id, sent_at, sent_by, status, response_text, payload_json, retry_count, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`, [require('crypto').randomUUID(), bookingId, partnerId, null, 'provider', 'info', `action:${action}`, JSON.stringify({ booking_id: bookingId, action }), 0]);
      });
    } else {
      const db = getSqlite();
      try {
        db.prepare(`INSERT INTO dispatch_log (id, booking_id, partner_id, sent_at, sent_by, status, response_text, payload_json, retry_count, created_at)
          VALUES (@id,@booking_id,@partner_id,@sent_at,@sent_by,@status,@response_text,@payload_json,@retry_count, datetime('now'))`)
          .run({ id: require('crypto').randomUUID(), booking_id: bookingId, partner_id: partnerId, sent_at: null, sent_by: 'provider', status: 'info', response_text: `action:${action}`, payload_json: JSON.stringify({ booking_id: bookingId, action }), retry_count: 0 });
      } finally { db.close(); }
    }
  } catch(_) { /* non-fatal if dispatch_log table not present */ }
}

// ---------------- Provider Availability API ----------------
// Schema: provider_availability(id, provider_id, date, start_time, end_time, capacity, notes, updated_at)
// Backward-compat: support legacy column available_date by mirroring into date when present.

function nowIso(){ return new Date().toISOString(); }

function ensureAvailabilitySqlite(db){
  db.exec(`CREATE TABLE IF NOT EXISTS provider_availability (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    date TEXT,
    available_date TEXT,
    start_time TEXT,
    end_time TEXT,
    capacity INTEGER,
    notes TEXT,
    updated_at TEXT
  )`);
  try {
    const cols = db.prepare("PRAGMA table_info('provider_availability')").all();
    const names = new Set(cols.map(c => c.name));
    if (!names.has('available_date')) {
      db.prepare('ALTER TABLE provider_availability ADD COLUMN available_date TEXT').run();
    }
    if (!names.has('capacity')) {
      db.prepare('ALTER TABLE provider_availability ADD COLUMN capacity INTEGER DEFAULT 0').run();
    }
    if (!names.has('date')) {
      db.prepare('ALTER TABLE provider_availability ADD COLUMN date TEXT').run();
    }
    if (!names.has('available_date')) {
      // nothing
    } else if (names.has('date')) {
      // backfill date from available_date if empty
      try { db.prepare('UPDATE provider_availability SET date = COALESCE(date, available_date) WHERE date IS NULL OR date = \"\"').run(); } catch(_) {}
    }
  } catch(_) {}
}

async function ensureAvailabilityPg(client){
  await client.query(`CREATE TABLE IF NOT EXISTS provider_availability (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    date TEXT,
    available_date TEXT,
    start_time TEXT,
    end_time TEXT,
    capacity INTEGER,
    notes TEXT,
    updated_at TEXT
  )`);
  // Safe ALTERs
  await client.query('ALTER TABLE provider_availability ADD COLUMN IF NOT EXISTS capacity INTEGER');
  await client.query('ALTER TABLE provider_availability ADD COLUMN IF NOT EXISTS date TEXT');
  await client.query('ALTER TABLE provider_availability ADD COLUMN IF NOT EXISTS available_date TEXT');
  // Mirror legacy available_date -> date when applicable (best-effort)
  try { await client.query("UPDATE provider_availability SET date = COALESCE(date, available_date) WHERE date IS NULL OR date = ''"); } catch(_) {}
}

async function sumReservedForDates(pid, dates){
  // returns Map(date=>reservedSeats)
  const map = new Map();
  if (!dates || dates.length === 0) return map;
  if (hasPostgres) {
    await withPg(async (c) => {
      const params = [pid, dates];
      const { rows } = await c.query(
        `SELECT date, COALESCE(SUM(seats),0) AS reserved
         FROM bookings
         WHERE partner_id = $1 AND date = ANY($2) AND COALESCE(status,'') NOT IN ('declined','cancelled')
         GROUP BY date`, params);
      (rows||[]).forEach(r => map.set(r.date, parseInt(r.reserved,10)||0));
    });
  } else {
    const db = getSqlite();
    try {
      const placeholders = dates.map(()=>'?').join(',');
      const rows = db.prepare(`SELECT date, COALESCE(SUM(seats),0) AS reserved FROM bookings WHERE partner_id = ? AND date IN (${placeholders}) AND COALESCE(status,'') NOT IN ('declined','cancelled') GROUP BY date`).all(pid, ...dates);
      (rows||[]).forEach(r => map.set(r.date, parseInt(r.reserved,10)||0));
    } finally { db.close(); }
  }
  return map;
}

router.get('/api/availability', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const from = String(req.query.from || '').trim() || null;
  const to = String(req.query.to || '').trim() || null;
  try {
    let rows = [];
    if (hasPostgres) {
      rows = await withPg(async (c) => {
        await ensureAvailabilityPg(c);
        const where = ['provider_id = $1'];
        const params = [pid];
        if (from) { params.push(from); where.push(`date >= $${params.length}`); }
        if (to) { params.push(to); where.push(`date <= $${params.length}`); }
        const { rows } = await c.query(`SELECT id, provider_id, COALESCE(date, available_date) AS date, start_time, end_time, COALESCE(capacity,0) AS capacity, notes, updated_at FROM provider_availability WHERE ${where.join(' AND ')} ORDER BY date ASC, start_time ASC LIMIT 2000`, params);
        return rows || [];
      });
    } else {
      const db = getSqlite();
      try {
        ensureAvailabilitySqlite(db);
        const all = db.prepare(`SELECT id, provider_id, COALESCE(date, available_date) AS date, start_time, end_time, COALESCE(capacity,0) AS capacity, notes, updated_at FROM provider_availability WHERE provider_id = ? ORDER BY COALESCE(date, available_date) ASC, start_time ASC`).all(pid);
        rows = all.filter(r => (!from || String(r.date) >= from) && (!to || String(r.date) <= to));
      } finally { db.close(); }
    }
    const dates = Array.from(new Set(rows.map(r => r.date).filter(Boolean)));
    const reservedMap = await sumReservedForDates(pid, dates);
    const enriched = rows.map(r => {
      const reserved = reservedMap.get(r.date) || 0;
      let status = 'available';
      if ((r.capacity|0) <= 0) status = 'full';
      else if (reserved > 0 && reserved < (r.capacity|0)) status = 'partial';
      else if (reserved >= (r.capacity|0)) status = 'full';
      return { ...r, reserved, status };
    });
    return res.json({ ok: true, rows: enriched });
  } catch (e) {
    console.error('provider/api/availability list error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/availability', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.body || {};
  const id = require('crypto').randomUUID();
  const date = String(body.date || body.available_date || '').trim();
  const start_time = String(body.start_time || '').trim();
  const end_time = String(body.end_time || '').trim();
  const capacity = Number.isFinite(+body.capacity) ? parseInt(body.capacity,10) : 0;
  const notes = String(body.notes || '');
  const updated_at = nowIso();
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'Missing required fields' });
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureAvailabilityPg(c);
        await c.query(`INSERT INTO provider_availability (id, provider_id, date, available_date, start_time, end_time, capacity, notes, updated_at) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8)`,
          [id, pid, date, start_time, end_time, capacity, notes, updated_at]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureAvailabilitySqlite(db);
  db.prepare(`INSERT INTO provider_availability (id, provider_id, date, available_date, start_time, end_time, capacity, notes, updated_at) VALUES (@id,@provider_id,@date,@date,@start_time,@end_time,@capacity,@notes,@updated_at)`).run({ id, provider_id: pid, date, start_time, end_time, capacity, notes, updated_at });
      } finally { db.close(); }
    }
    return res.json({ ok: true, id });
  } catch (e) {
    console.error('provider/api/availability create error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/availability/:id', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const aid = String(req.params.id || '').trim();
  if (!aid) return res.status(400).json({ error: 'Missing id' });
  const body = req.body || {};
  const date = String(body.date || body.available_date || '').trim();
  const start_time = String(body.start_time || '').trim();
  const end_time = String(body.end_time || '').trim();
  const capacity = Number.isFinite(+body.capacity) ? parseInt(body.capacity,10) : 0;
  const notes = String(body.notes || '');
  const updated_at = nowIso();
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureAvailabilityPg(c);
        await c.query(`UPDATE provider_availability SET date=$1, available_date=$1, start_time=$2, end_time=$3, capacity=$4, notes=$5, updated_at=$6 WHERE id=$7 AND provider_id=$8`,
          [date, start_time, end_time, capacity, notes, updated_at, aid, pid]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureAvailabilitySqlite(db);
        db.prepare(`UPDATE provider_availability SET date=@date, available_date=@date, start_time=@start_time, end_time=@end_time, capacity=@capacity, notes=@notes, updated_at=@updated_at WHERE id=@id AND provider_id=@provider_id`)
          .run({ id: aid, provider_id: pid, date, start_time, end_time, capacity, notes, updated_at });
      } finally { db.close(); }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('provider/api/availability update error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/availability/:id', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const aid = String(req.params.id || '').trim();
  if (!aid) return res.status(400).json({ error: 'Missing id' });
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureAvailabilityPg(c);
        await c.query('DELETE FROM provider_availability WHERE id=$1 AND provider_id=$2', [aid, pid]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureAvailabilitySqlite(db);
        db.prepare('DELETE FROM provider_availability WHERE id = ? AND provider_id = ?').run(aid, pid);
      } finally { db.close(); }
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('provider/api/availability delete error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
