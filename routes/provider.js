const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch(_){ }
let rateLimit = null; try { rateLimit = require('express-rate-limit'); } catch(_){ }

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
if (rateLimit){ try { router.use('/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 50 })); } catch(_){ } }

const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret').toString();
const hasPostgres = !!process.env.DATABASE_URL;

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

// ---------------- Drivers helper (DB schema + utility) ----------------
function ensureDriversSqlite(db){
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

function buildTransport(){
  if (!nodemailer) return null;
  const host = process.env.MAIL_HOST;
  const port = parseInt(process.env.MAIL_PORT || '587',10);
  const auth = (process.env.MAIL_USER && process.env.MAIL_PASS) ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : null;
  const secure = port === 465;
  return nodemailer.createTransport({ host, port, secure, auth });
}

async function sendInviteEmail(to, providerName, link){
  const transporter = buildTransport();
  if (!transporter || !to){ console.log('invite: email skipped', to); return 'skipped'; }
  const from = process.env.MAIL_FROM || 'panel@greekaway.com';
  const subject = `[Greekaway] Πρόσκληση Οδηγού από ${providerName}`;
  const text = `Σας προσκάλεσαν στο δίκτυο του ${providerName} στο Greekaway. Ανοίξτε το ${link} για να ενεργοποιήσετε τον λογαριασμό σας.`;
  const html = `<p>Σας προσκάλεσαν στο δίκτυο του <b>${providerName}</b> στο Greekaway.</p><p><a href="${link}">Ενεργοποίηση Λογαριασμού</a></p>`;
  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return info && info.messageId ? `sent:${info.messageId}` : 'sent';
  } catch(e){ console.warn('invite email error', e && e.message ? e.message : e); return 'error'; }
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

// Lightweight token verification endpoint (used by front-end guard for optional remote validation)
router.get('/auth/verify', authMiddleware, async (req, res) => {
  try {
    const user = req.user || {};
    // Fetch partner basic data (email, last_seen) when available
    let partner = null;
    const pid = user.partner_id || user.id || null;
    if (pid) {
      if (hasPostgres) {
        partner = await withPg(async (client) => {
          const { rows } = await client.query('SELECT id, name, email, last_seen FROM partners WHERE id = $1 LIMIT 1', [pid]);
          return rows && rows[0] ? rows[0] : null;
        });
      } else {
        const db = getSqlite();
        try { partner = db.prepare('SELECT id, name, email, last_seen FROM partners WHERE id = ? LIMIT 1').get(pid); } finally { db.close(); }
      }
    }
    return res.json({ ok: true, partner: partner || null });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- Drivers API ----------------
router.get('/api/drivers', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let rows = [];
    if (hasPostgres) {
      rows = await withPg(async (c) => {
        await ensureDriversPg(c);
        const { rows } = await c.query('SELECT id, name, email, phone, vehicle_plate, notes, status, invite_token, activated_at FROM drivers WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 500', [pid]);
        return rows || [];
      });
    } else {
      const db = getSqlite();
      try {
        ensureDriversSqlite(db);
        rows = db.prepare('SELECT id, name, email, phone, vehicle_plate, notes, status, invite_token, activated_at FROM drivers WHERE provider_id = ? ORDER BY created_at DESC LIMIT 500').all(pid);
      } finally { db.close(); }
    }
    const mapped = rows.map(r => ({
      id: r.id,
      name: r.name,
      contact: r.email || r.phone || '',
      vehicle_plate: r.vehicle_plate || null,
      notes: r.notes || null,
      status: r.status || (r.activated_at ? 'active' : 'pending')
    }));
    return res.json({ ok:true, drivers: mapped });
  } catch(e){ console.error('drivers list error', e && e.message ? e.message : e); return res.status(500).json({ error:'Server error' }); }
});

// Assign a driver to a booking that belongs to this provider
router.post('/api/assign-driver', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.body || {};
  const bookingId = String(body.booking_id || body.id || '').trim();
  const driverId = String(body.driver_id || '').trim();
  if (!bookingId || !driverId) return res.status(400).json({ error: 'Missing booking_id or driver_id' });
  try {
    if (hasPostgres) {
      const ok = await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        // Validate booking belongs to provider
        const { rows: bRows } = await c.query('SELECT id FROM bookings WHERE id=$1 AND partner_id=$2 LIMIT 1', [bookingId, pid]);
        if (!bRows || !bRows[0]) return false;
        // Validate driver belongs to provider and is active
        const { rows: dRows } = await c.query('SELECT id FROM drivers WHERE id=$1 AND provider_id=$2 AND (status=$3 OR activated_at IS NOT NULL) LIMIT 1', [driverId, pid, 'active']);
        if (!dRows || !dRows[0]) return false;
        await c.query('UPDATE bookings SET assigned_driver_id=$1, updated_at=now() WHERE id=$2', [driverId, bookingId]);
        return true;
      });
      if (!ok) return res.status(404).json({ error: 'Not found or not allowed' });
      return res.json({ ok: true });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        const b = db.prepare('SELECT id FROM bookings WHERE id = ? AND partner_id = ? LIMIT 1').get(bookingId, pid);
        if (!b) return res.status(404).json({ error: 'Booking not found for this provider' });
        const d = db.prepare("SELECT id FROM drivers WHERE id = ? AND provider_id = ? AND (status = 'active' OR activated_at IS NOT NULL) LIMIT 1").get(driverId, pid);
        if (!d) return res.status(404).json({ error: 'Driver not found or inactive' });
        db.prepare('UPDATE bookings SET assigned_driver_id = ?, updated_at = ? WHERE id = ?').run(driverId, new Date().toISOString(), bookingId);
        return res.json({ ok: true });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('assign-driver error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/drivers', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const contact = String(body.contact || '').trim();
  const plate = String(body.plate || '').trim();
  const notes = String(body.notes || '').trim();
  if (!name || !contact || !plate) return res.status(400).json({ error:'Missing required fields' });
  const id = crypto.randomUUID();
  const invite_token = crypto.randomBytes(16).toString('hex');
  const invite_sent_at = new Date().toISOString();
  const created_at = invite_sent_at;
  // Determine email vs phone
  const email = /@/.test(contact) ? contact.toLowerCase() : null;
  const phone = email ? null : contact;
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureDriversPg(c);
        // Prevent duplicates per provider (email or phone)
        const { rows: dup } = await c.query('SELECT id FROM drivers WHERE provider_id=$1 AND (lower(email)=lower($2) OR phone=$3) LIMIT 1', [pid, email||'', phone||'']);
        if (dup && dup.length) throw new Error('duplicate_contact');
        await c.query(`INSERT INTO drivers (id, provider_id, name, email, phone, vehicle_plate, notes, status, invite_token, invite_sent_at, activated_at, password_hash, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [id, pid, name, email, phone, plate, notes||null, 'pending', invite_token, invite_sent_at, null, null, created_at]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureDriversSqlite(db);
        const dup = db.prepare('SELECT id FROM drivers WHERE provider_id = ? AND (lower(email)=lower(?) OR phone=?) LIMIT 1').get(pid, email||'', phone||'');
        if (dup) throw new Error('duplicate_contact');
        db.prepare(`INSERT INTO drivers (id, provider_id, name, email, phone, vehicle_plate, notes, status, invite_token, invite_sent_at, activated_at, password_hash, created_at)
          VALUES (@id,@provider_id,@name,@email,@phone,@vehicle_plate,@notes,@status,@invite_token,@invite_sent_at,@activated_at,@password_hash,@created_at)`).run({ id, provider_id: pid, name, email, phone, vehicle_plate: plate, notes: notes||null, status:'pending', invite_token, invite_sent_at, activated_at:null, password_hash:null, created_at });
      } finally { db.close(); }
    }
    // Fetch provider name for invite
    let providerName = 'Provider';
    try {
      if (hasPostgres) {
        const row = await withPg(async (c) => { const { rows } = await c.query('SELECT name FROM partners WHERE id=$1 LIMIT 1',[pid]); return rows && rows[0]; });
        if (row && row.name) providerName = row.name;
      } else {
        const db = getSqlite(); try { const row = db.prepare('SELECT name FROM partners WHERE id=? LIMIT 1').get(pid); if (row && row.name) providerName = row.name; } finally { db.close(); }
      }
    } catch(_) {}
    const base = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
    const link = `${base}/provider/driver-activate.html?token=${invite_token}`;
    if (email) {
      const mailStatus = await sendInviteEmail(email, providerName, link);
      if (mailStatus.startsWith('skipped')) {
        console.log('invite: dev mode link (no SMTP):', link);
      }
    }
    // TODO: implement SMS sending (placeholder)
    // Expose activation link in response for non-production (helps local testing)
    const includeLink = (process.env.NODE_ENV !== 'production');
    return res.json({ ok:true, id, invite_token, activation_link: includeLink ? link : undefined });
  } catch(e){
    if (String(e && e.message) === 'duplicate_contact') return res.status(409).json({ error:'Duplicate driver contact' });
    console.error('driver create error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'Server error' });
  }
});

router.post('/driver/activate', async (req, res) => {
  const token = String(req.body && req.body.token || '').trim();
  const password = String(req.body && req.body.password || '').trim();
  if (!token || !password) return res.status(400).json({ error:'Missing fields' });
  try {
    let driver = null;
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureDriversPg(c);
        const { rows } = await c.query('SELECT id, provider_id, status FROM drivers WHERE invite_token=$1 LIMIT 1', [token]);
        driver = rows && rows[0] ? rows[0] : null;
        if (!driver || driver.status !== 'pending') throw new Error('not_found_or_active');
        const hash = await bcrypt.hash(password, 10);
        await c.query('UPDATE drivers SET status=$1, activated_at=now(), invite_token=NULL, password_hash=$2 WHERE id=$3', ['active', hash, driver.id]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureDriversSqlite(db);
        driver = db.prepare('SELECT id, provider_id, status FROM drivers WHERE invite_token = ? LIMIT 1').get(token);
        if (!driver || driver.status !== 'pending') throw new Error('not_found_or_active');
        const hash = await bcrypt.hash(password, 10);
        db.prepare('UPDATE drivers SET status=?, activated_at=?, invite_token=NULL, password_hash=? WHERE id=?').run('active', new Date().toISOString(), hash, driver.id);
      } finally { db.close(); }
    }
    return res.json({ ok:true });
  } catch(e){
    if (String(e && e.message) === 'not_found_or_active') return res.status(404).json({ error:'Invalid or used token' });
    console.error('driver activate error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'Server error' });
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
async function ensureBookingsAssignedPg(client){
  try { await client.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_driver_id TEXT'); } catch(_) {}
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

router.get('/api/bookings', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (hasPostgres) {
      const out = await withPg(async (client) => {
        await ensureBookingsAssignedPg(client);
  const { rows } = await client.query(`SELECT b.* FROM bookings b WHERE b.partner_id = $1 AND b.status IN ('pending','confirmed','accepted','picked','completed','declined') ORDER BY b.created_at DESC LIMIT 200`, [pid]);
        return rows || [];
      });
      // dispatch meta
      const ids = out.map(r => r.id);
      const dispatch = await require('../services/dispatchService').latestStatusForBookings(ids);
      const data = out.map(b => ({
        id: b.id,
        booking_id: b.id,
        trip_title: ((b.metadata && b.metadata.tour_title) ? b.metadata.tour_title : b.trip_id),
        date: b.date,
        pickup_point: (b.pickup_location && b.pickup_location.trim()) || 'N/A',
        pickup_time: (b.metadata && (b.metadata.pickup_time || b.metadata.time)) || 'N/A',
        customer_name: b.user_name,
        customer_phone: (b.metadata && b.metadata.customer_phone) || null,
        luggage: (() => { try { const arr = b.suitcases_json ? JSON.parse(b.suitcases_json) : []; return Array.isArray(arr) ? arr.join(', ') : (arr ? String(arr) : null); } catch(_) { return null; } })(),
        special_requests: b.special_requests || null,
        status: badgeStatus(b.status),
        dispatch: dispatch[b.id] || null,
        assigned_driver_id: b.assigned_driver_id || null,
        stops_count: (()=>{ try { const m = b.metadata && (typeof b.metadata==='object'? b.metadata : JSON.parse(b.metadata||'{}')); const arr = m && Array.isArray(m.stops) ? m.stops : []; return arr.length || (Array.isArray(m.pickup_points)? m.pickup_points.length : 0); } catch(_){ return 0; } })(),
      }));
      return res.json({ ok: true, bookings: data });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
  const rows = db.prepare(`SELECT * FROM bookings WHERE partner_id = ? AND status IN ('pending','confirmed','accepted','picked','completed','declined') ORDER BY created_at DESC LIMIT 200`).all(pid);
        const ids = rows.map(r => r.id);
        const dispatch = await require('../services/dispatchService').latestStatusForBookings(ids);
        const data = rows.map(b => ({
          id: b.id,
          booking_id: b.id,
          trip_title: (()=>{ try{ const m=b.metadata?JSON.parse(b.metadata):{}; return m.tour_title || b.trip_id; }catch(_){ return b.trip_id; } })(),
          date: b.date,
          pickup_point: b.pickup_location || 'N/A',
          pickup_time: (()=>{ let meta={}; try{ meta=b.metadata?JSON.parse(b.metadata):{} }catch(_){} return meta.pickup_time || meta.time || 'N/A'; })(),
          customer_name: b.user_name,
          customer_phone: (()=>{ let meta={}; try{ meta=b.metadata?JSON.parse(b.metadata):{} }catch(_){} return meta.customer_phone || null; })(),
          luggage: (()=>{ try { const arr = b.suitcases_json ? JSON.parse(b.suitcases_json) : []; return Array.isArray(arr) ? arr.join(', ') : (arr ? String(arr) : null); } catch(_) { return null; } })(),
          special_requests: b.special_requests || null,
          map_link: null,
          status: badgeStatus(b.status),
          dispatch: dispatch[b.id] || null,
          assigned_driver_id: b.assigned_driver_id || null,
          stops_count: (()=>{ try { const m = b.metadata?JSON.parse(b.metadata):{}; const arr = m && Array.isArray(m.stops) ? m.stops : []; return arr.length || (Array.isArray(m.pickup_points)? m.pickup_points.length : 0); } catch(_){ return 0; } })(),
        }));
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
      try {
        const m = row.metadata && typeof row.metadata==='object' ? row.metadata : (row.metadata ? JSON.parse(row.metadata) : {});
        let full = m && m.route && Array.isArray(m.route.full_path) ? m.route.full_path.slice() : null;
        if (!full || !full.length){
          // Build pickups first from pickup_points_json or metadata.pickups (address-only)
          let pickups = [];
          try { if (row.pickup_points_json) { const arr = JSON.parse(row.pickup_points_json); if (Array.isArray(arr)) pickups = arr; } } catch(_){}
          if (!pickups.length){ try { const mp = Array.isArray(m.pickups) ? m.pickups : []; if (mp.length) pickups = mp.map(p => ({ address: p.address || p.pickup || p.location || '' })); } catch(_){} }
          const pickupTimeStr = String(m.pickup_time || m.time || '09:00').slice(0,5);
          const inc = 20;
          full = (pickups || []).map((p,i)=>({ type:'pickup', label:`Παραλαβή: ${p.address||''}`.trim(), address:p.address||'', lat:p.lat??null, lng:p.lng??null, arrival_time: i===0?pickupTimeStr:addMinutes(pickupTimeStr, i*inc), departure_time:null }));
          // Append trip JSON stops after pickups when missing full_path
          const tripStops = (()=>{ try {
            const root = path.join(__dirname, '..');
            const tripId = row.trip_id || '';
            const candidates = [ `${tripId}.json` ];
            if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
            if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
            let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
            if (!fp) return [];
            const raw = fs.readFileSync(fp, 'utf8'); const json = JSON.parse(raw); const arr = Array.isArray(json.stops)?json.stops:[];
            return arr.map((s,i)=>({ type:'tour_stop', label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`), address: s.address||s.location||'', arrival_time: s.arrival_time||s.time||null, departure_time: s.departure_time||null, lat: s.lat??s.latitude??null, lng: s.lng??s.longitude??null }));
          } catch(_) { return []; } })();
          if (tripStops.length){
            let prevTime = (full.length? full[full.length-1].arrival_time : null) || pickupTimeStr;
            const fallbackInc = 45;
            tripStops.forEach((ts, idx) => { const at = ts.arrival_time || addMinutes(prevTime, fallbackInc); full.push({ ...ts, arrival_time: at }); prevTime = at || prevTime; });
          }
        } else {
          // Augment existing full_path with any missing trip stops (by address match)
          const seen = new Set(full.filter(x => (x.type||'tour_stop')==='tour_stop').map(x => (x.address||'').trim().toLowerCase()));
          const tripStops = (()=>{ try {
            const root = path.join(__dirname, '..');
            const tripId = row.trip_id || '';
            const candidates = [ `${tripId}.json` ];
            if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
            if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
            let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
            if (!fp) return [];
            const raw = fs.readFileSync(fp, 'utf8'); const json = JSON.parse(raw); const arr = Array.isArray(json.stops)?json.stops:[];
            return arr.map((s,i)=>({ type:'tour_stop', label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`), address: s.address||s.location||'', arrival_time: s.arrival_time||s.time||null, departure_time: s.departure_time||null, lat: s.lat??s.latitude??null, lng: s.lng??s.longitude??null }));
          } catch(_) { return []; } })();
          if (tripStops.length){
            let prevTime = (full.length? full[full.length-1].arrival_time : null) || (String(m.pickup_time||'09:00').slice(0,5));
            const fallbackInc = 45;
            for (let i=0;i<tripStops.length;i++){ const ts=tripStops[i]; const key=String(ts.address||'').trim().toLowerCase(); if (key && !seen.has(key)){ const at = ts.arrival_time || addMinutes(prevTime, fallbackInc); full.push({ ...ts, arrival_time: at }); prevTime = at || prevTime; } }
          }
        }
        row.route = { full_path: full };
      } catch(_){ }
      return res.json({ ok:true, booking: row });
    } else {
      const db = getSqlite();
      try {
        const row = db.prepare('SELECT * FROM bookings WHERE id = ? AND partner_id = ? LIMIT 1').get(id, pid);
        if (!row) return res.status(404).json({ error: 'Not found' });
        if (row.metadata) { try { row.metadata = JSON.parse(row.metadata); } catch(_){} }
        if (row.suitcases_json && !row.suitcases) { try { row.suitcases = JSON.parse(row.suitcases_json); } catch(_) { row.suitcases = []; } }
        try {
          const meta = row.metadata || {};
          let full = meta && meta.route && Array.isArray(meta.route.full_path) ? meta.route.full_path.slice() : null;
          if (!full || !full.length){
            // Build pickups first from pickup_points_json or metadata.pickups
            let pickups = [];
            try { if (row.pickup_points_json) { const arr = JSON.parse(row.pickup_points_json); if (Array.isArray(arr)) pickups = arr; } } catch(_){}
            if (!pickups.length){ try { const mp = Array.isArray(meta.pickups) ? meta.pickups : []; if (mp.length) pickups = mp.map(p => ({ address: p.address || p.pickup || p.location || '' })); } catch(_){} }
            const pickupTimeStr = String(meta.pickup_time || meta.time || '09:00').slice(0,5);
            const inc = 20;
            full = (pickups || []).map((p,i)=>({ type:'pickup', label:`Παραλαβή: ${p.address||''}`.trim(), address:p.address||'', lat:p.lat??null, lng:p.lng??null, arrival_time: i===0?pickupTimeStr:addMinutes(pickupTimeStr, i*inc), departure_time:null }));
            // Append trip JSON tour stops with times
            try {
              const root = path.join(__dirname, '..');
              const tripId = row.trip_id || '';
              const candidates = [ `${tripId}.json` ];
              if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
              if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
              let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
              if (fp) {
                const raw = fs.readFileSync(fp, 'utf8');
                const json = JSON.parse(raw);
                const arr = Array.isArray(json.stops)?json.stops:[];
                let prevTime = (full.length? full[full.length-1].arrival_time : null) || pickupTimeStr;
                const fallbackInc = 45;
                arr.forEach((s,i)=>{
                  const at = s.arrival_time || s.time || (function(){
                    try { const [h,m]=(prevTime||'00:00').split(':').map(x=>parseInt(x,10)||0); const d=new Date(); d.setHours(h,m,0,0); d.setMinutes(d.getMinutes()+fallbackInc); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); } catch(_) { return prevTime; }
                  })();
                  full.push({ type:'tour_stop', label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`), address: s.address||s.location||'', arrival_time: at, departure_time: s.departure_time || null, lat: s.lat??s.latitude??null, lng: s.lng??s.longitude??null });
                  prevTime = at || prevTime;
                });
              }
            } catch(_){ }
          } else {
            // Augment with any missing JSON tour stops (by address key)
            try {
              const root = path.join(__dirname, '..');
              const tripId = row.trip_id || '';
              const candidates = [ `${tripId}.json` ];
              if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
              if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
              let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
              if (fp) {
                const raw = fs.readFileSync(fp, 'utf8'); const json = JSON.parse(raw);
                const arr = Array.isArray(json.stops)?json.stops:[];
                const seen = new Set(full.filter(x => (x.type||'tour_stop')==='tour_stop').map(x => (x.address||'').trim().toLowerCase()));
                let prevTime = (full.length? full[full.length-1].arrival_time : null) || (String(meta.pickup_time||'09:00').slice(0,5));
                const fallbackInc = 45;
                for (let i=0;i<arr.length;i++){
                  const s = arr[i];
                  const key = String(s.address||'').trim().toLowerCase();
                  if (key && seen.has(key)) continue;
                  const at = s.arrival_time || s.time || (function(){
                    try { const [h,m]=(prevTime||'00:00').split(':').map(x=>parseInt(x,10)||0); const d=new Date(); d.setHours(h,m,0,0); d.setMinutes(d.getMinutes()+fallbackInc); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); } catch(_) { return prevTime; }
                  })();
                  full.push({ type:'tour_stop', label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`), address: s.address||s.location||'', arrival_time: at, departure_time: s.departure_time || null, lat: s.lat??s.latitude??null, lng: s.lng??s.longitude??null });
                  prevTime = at || prevTime;
                }
              }
            } catch(_){ }
          }
          row.route = { full_path: full };
          // Also expose basic trip info (start_time) from JSON for UI
          try {
            const root = path.join(__dirname, '..');
            const tripId = row.trip_id || '';
            const candidates = [ `${tripId}.json` ];
            if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
            if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
            let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
            if (fp) {
              const raw = fs.readFileSync(fp, 'utf8'); const json = JSON.parse(raw);
              const start_time = (json.departure && json.departure.departure_time) || (Array.isArray(json.stops) && json.stops[0] && (json.stops[0].time || json.stops[0].arrival_time)) || null;
              row.trip_info = { start_time };
            }
          } catch(_){ }
        } catch(_){ }
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

// Assign driver to a booking — only within same provider
router.post('/api/assign-driver', authMiddleware, async (req, res) => {
  const pid = req.user && (req.user.partner_id || req.user.id) || null;
  if (!pid) return res.status(401).json({ error: 'Unauthorized' });
  const bookingId = String((req.body && req.body.booking_id) || '').trim();
  const driverId = String((req.body && req.body.driver_id) || '').trim();
  if (!bookingId || !driverId) return res.status(400).json({ error: 'Missing fields' });
  try {
    if (hasPostgres) {
      await withPg(async (c) => {
        await ensureBookingsAssignedPg(c);
        // Verify ownership and driver activeness
        const { rows: b } = await c.query('SELECT id FROM bookings WHERE id=$1 AND partner_id=$2 LIMIT 1', [bookingId, pid]);
        if (!b || !b.length) throw new Error('booking_not_found');
        const { rows: d } = await c.query('SELECT id FROM drivers WHERE id=$1 AND provider_id=$2 AND status=$3 LIMIT 1', [driverId, pid, 'active']);
        if (!d || !d.length) throw new Error('driver_invalid');
        await c.query('UPDATE bookings SET assigned_driver_id=$1, updated_at=now() WHERE id=$2 AND partner_id=$3', [driverId, bookingId, pid]);
      });
    } else {
      const db = getSqlite();
      try {
        ensureBookingsAssignedSqlite(db);
        const b = db.prepare('SELECT id FROM bookings WHERE id = ? AND partner_id = ? LIMIT 1').get(bookingId, pid);
        if (!b) throw new Error('booking_not_found');
        const d = db.prepare('SELECT id FROM drivers WHERE id = ? AND provider_id = ? AND status = ? LIMIT 1').get(driverId, pid, 'active');
        if (!d) throw new Error('driver_invalid');
        db.prepare('UPDATE bookings SET assigned_driver_id = ?, updated_at = ? WHERE id = ? AND partner_id = ?').run(driverId, new Date().toISOString(), bookingId, pid);
      } finally { db.close(); }
    }
    return res.json({ ok:true });
  } catch(e){
    const msg = String(e && e.message || 'error');
    if (msg === 'booking_not_found') return res.status(404).json({ error:'Booking not found' });
    if (msg === 'driver_invalid') return res.status(400).json({ error:'Invalid driver' });
    console.error('assign-driver error', e && e.message ? e.message : e);
    return res.status(500).json({ error:'Server error' });
  }
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
