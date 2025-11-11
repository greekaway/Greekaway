const express = require('express');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
router.use(express.json());

const { computePickupTimes, upsertRoute, ensureTestBookingExists } = require('../services/computePickupTimes');

function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ const Database = require('better-sqlite3'); return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3')); }
async function withPg(fn){ const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }

function normNumber(n, def){ const x = parseInt(n,10); return isFinite(x) ? x : def; }

// POST /admin/route/create
router.post('/admin/route/create', async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || 'Route').trim();
    const departure_time = String(body.departure_time || '').trim();
    const buffer_minutes = normNumber(body.buffer_minutes, 10);
    const test = !!body.test;
    const bookings = Array.isArray(body.bookings) ? body.bookings : [];
    if (!departure_time) return res.status(400).json({ error: 'Missing departure_time' });
    if (!bookings.length) return res.status(400).json({ error: 'No bookings provided' });

    const rid = crypto.randomUUID();
    // If in test mode, ensure demo bookings exist
    if (test) {
      for (const b of bookings) {
        await ensureTestBookingExists({ ...b, departure_time });
      }
    }

    // Persist route metadata
    await upsertRoute({ id: rid, title, departure_time, buffer_minutes, test });

    // Compute ETAs and persist into bookings
    const result = await computePickupTimes({ id: rid, title, departure_time, buffer_minutes, test, bookings });

    console.log('route.create:', { route_id: rid, title, count: bookings.length, buffer_minutes });
    return res.json({ route_id: rid, stops: result.stops });
  } catch (e) {
    console.error('route.create error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /admin/route/trigger-notify
router.post('/admin/route/trigger-notify', async (req, res) => {
  try {
    const body = req.body || {};
    const route_id = String(body.route_id || '').trim();
    const notify_when = String(body.notify_when || '24h').trim();
    const test = !!body.test;
    if (!route_id) return res.status(400).json({ error: 'Missing route_id' });

    let rows = [];
    if (hasPostgres()){
      rows = await withPg(async (c) => {
        const { rows } = await c.query(`SELECT id, user_name, user_email, metadata, pickup_address, pickup_location, pickup_lat, pickup_lng, pickup_time_estimated, pickup_window_start, pickup_window_end, pickup_order FROM bookings WHERE route_id=$1 ORDER BY pickup_order ASC NULLS LAST, id ASC`, [route_id]);
        return rows || [];
      });
    } else {
      const db = getSqlite();
      try {
        rows = db.prepare(`SELECT id, user_name, user_email, metadata, pickup_address, pickup_location, pickup_lat, pickup_lng, pickup_time_estimated, pickup_window_start, pickup_window_end, pickup_order FROM bookings WHERE route_id = ? ORDER BY pickup_order ASC, id ASC`).all(route_id);
      } finally { db.close(); }
    }
    if (!rows.length) return res.status(404).json({ error: 'Route has no bookings' });

    let count = 0;
    for (const b of rows){
      let meta = {}; try { meta = b.metadata && typeof b.metadata==='string' ? JSON.parse(b.metadata) : (b.metadata || {}); } catch(_) {}
      const name = b.user_name || 'Customer';
      const phone = (meta && (meta.customer_phone || meta.phone)) || null;
      const email = b.user_email || null;
      const addr = b.pickup_address || b.pickup_location || '';
      const eta = b.pickup_time_estimated ? new Date(b.pickup_time_estimated) : null;
      const wStart = b.pickup_window_start ? new Date(b.pickup_window_start) : null;
      const wEnd = b.pickup_window_end ? new Date(b.pickup_window_end) : null;
      const hhmm = (d) => { if (!d) return '—'; const hh = String(d.getHours()).padStart(2,'0'); const mm = String(d.getMinutes()).padStart(2,'0'); return `${hh}:${mm}`; };
      const msg = `Pickup for ${name} at ${hhmm(eta)} (±5′) — ${addr}`;

      // Test mode: log only. In prod, we still log and optionally email via nodemailer elsewhere.
      console.log('pickup-notify:', { booking_id: b.id, to_phone: phone || null, to_email: email || null, message: msg });
      count++;
    }

    console.log('notify.enqueue:', { route_id, notify_when, count, test });
    return res.json({ ok: true, route_id, enqueued: count });
  } catch (e) {
    console.error('route.trigger-notify error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- Helpers for route metadata and stops ---
async function loadRoute(route_id){
  if (!route_id) return null;
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query('SELECT id, title, departure_time, buffer_minutes, locked, test_mode FROM pickup_routes WHERE id=$1 LIMIT 1', [route_id]);
      return rows && rows[0] ? rows[0] : null;
    });
  } else {
    const db = getSqlite();
    try { return db.prepare('SELECT id, title, departure_time, buffer_minutes, locked, test_mode FROM pickup_routes WHERE id = ? LIMIT 1').get(route_id) || null; }
    finally { db.close(); }
  }
}

async function setRouteLocked(route_id, locked){
  const nowIso = new Date().toISOString();
  if (hasPostgres()){
    return withPg(async (c) => {
      await c.query('UPDATE pickup_routes SET locked=$1, updated_at=$2 WHERE id=$3', [locked ? 1 : 0, nowIso, route_id]);
    });
  } else {
    const db = getSqlite();
    try { db.prepare('UPDATE pickup_routes SET locked=?, updated_at=? WHERE id=?').run(locked ? 1 : 0, nowIso, route_id); }
    finally { db.close(); }
  }
}

async function updateRouteBuffer(route_id, buffer_minutes){
  const nowIso = new Date().toISOString();
  if (hasPostgres()){
    return withPg(async (c) => {
      await c.query('UPDATE pickup_routes SET buffer_minutes=$1, updated_at=$2 WHERE id=$3', [buffer_minutes, nowIso, route_id]);
    });
  } else {
    const db = getSqlite();
    try { db.prepare('UPDATE pickup_routes SET buffer_minutes=?, updated_at=? WHERE id=?').run(buffer_minutes, nowIso, route_id); }
    finally { db.close(); }
  }
}

async function loadRouteStops(route_id){
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query(`SELECT id, user_name, user_email, pickup_address, pickup_location, pickup_lat, pickup_lng, pickup_time_estimated, pickup_window_start, pickup_window_end, pickup_order FROM bookings WHERE route_id=$1 ORDER BY pickup_order ASC NULLS LAST, id ASC`, [route_id]);
      return rows || [];
    });
  } else {
    const db = getSqlite();
    try { return db.prepare(`SELECT id, user_name, user_email, pickup_address, pickup_location, pickup_lat, pickup_lng, pickup_time_estimated, pickup_window_start, pickup_window_end, pickup_order FROM bookings WHERE route_id = ? ORDER BY pickup_order ASC, id ASC`).all(route_id); }
    finally { db.close(); }
  }
}

function parseIsoSafe(s){ try { const d = new Date(s); return isFinite(d.getTime()) ? d : null; } catch(_) { return null; } }
async function maybeAutoLock(route){
  try {
    if (!route || route.locked) return route;
    const dep = parseIsoSafe(route.departure_time);
    if (!dep) return route;
    const t24 = dep.getTime() - 24*60*60*1000;
    if (Date.now() >= t24) {
      await setRouteLocked(route.id, true);
      return { ...route, locked: 1 };
    }
  } catch(_){}
  return route;
}

// GET /driver/route/:route_id — simple server-rendered view for drivers
router.get('/driver/route/:route_id', async (req, res) => {
  const route_id = String(req.params.route_id || '').trim();
  if (!route_id) return res.status(400).send('Missing route id');
  try {
    const meta0 = await loadRoute(route_id);
    const meta = await maybeAutoLock(meta0);
    let rows = await loadRouteStops(route_id);
    if (!rows.length) return res.status(404).send('Route not found or empty');

    if (/application\/json/i.test(String(req.headers['accept']||'')) || (String(req.query.json||'')==='1')){
      return res.json({ ok:true, route_id, locked: !!(meta && meta.locked), buffer_minutes: (meta && meta.buffer_minutes != null) ? Number(meta.buffer_minutes) : null, stops: rows.map(r => ({
        booking_id: r.id,
        order: r.pickup_order,
        address: r.pickup_address || r.pickup_location || '',
        lat: r.pickup_lat,
        lng: r.pickup_lng,
        eta: r.pickup_time_estimated,
        window_start: r.pickup_window_start,
        window_end: r.pickup_window_end,
        maps_link: (r.pickup_lat!=null && r.pickup_lng!=null) ? `https://www.google.com/maps/dir/?api=1&destination=${r.pickup_lat},${r.pickup_lng}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.pickup_address || r.pickup_location || '')}`
      }))});
    }

    // HTML view
    const esc = (s) => String(s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const hhmm = (iso) => { if (!iso) return '—'; const d = new Date(iso); const hh = String(d.getHours()).padStart(2,'0'); const mm = String(d.getMinutes()).padStart(2,'0'); return `${hh}:${mm}`; };
    const rowHtml = rows.map(r => {
      const addr = r.pickup_address || r.pickup_location || '';
      const map = (r.pickup_lat!=null && r.pickup_lng!=null) ? `https://www.google.com/maps/dir/?api=1&destination=${r.pickup_lat},${r.pickup_lng}&travelmode=driving` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
      const win = `${hhmm(r.pickup_window_start)}–${hhmm(r.pickup_window_end)}`;
      return `<li style="margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div><b>#${r.pickup_order || '-'}</b> — ${esc(r.user_name || 'Πελάτης')}</div>
          <div>${esc(addr)}</div>
          <div>ETA: <b>${hhmm(r.pickup_time_estimated)}</b> (παράθυρο ${esc(win)})</div>
        </div>
        <div>
          <a href="${map}" target="_blank" rel="noopener" style="background:#0b57d0;color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none;">Open in Maps</a>
        </div>
      </li>`;
    }).join('\n');

    const html = `<!doctype html><html lang="el"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
      <title>Driver Route ${esc(route_id)}</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:20px;} h1{font-size:20px;margin:0 0 12px;} ul{list-style:none;padding:0;} .meta{color:#666;margin-bottom:10px;}</style>
    </head><body>
      <h1>Διαδρομή Οδηγού</h1>
      <div class="meta">Route ID: ${esc(route_id)} • Στάσεις: ${rows.length} ${meta && meta.locked ? '• <b>(Κλειδωμένη)</b>' : ''}</div>
      <ul>${rowHtml}</ul>
    </body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    console.error('driver.route view error', e && e.message ? e.message : e);
    return res.status(500).send('Server error');
  }
});

// --- Admin: route detail
router.get('/admin/route/:route_id', async (req, res) => {
  try {
    const route_id = String(req.params.route_id || '').trim();
    if (!route_id) return res.status(400).json({ error: 'Missing route_id' });
    const route = await loadRoute(route_id);
    if (!route) return res.status(404).json({ error: 'Not found' });
    const stops = await loadRouteStops(route_id);
    return res.json({ ok:true, route: { id: route.id, title: route.title, departure_time: route.departure_time, buffer_minutes: route.buffer_minutes, locked: !!route.locked, test_mode: !!route.test_mode }, stops });
  } catch (e) {
    console.error('admin.route detail error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- Admin: update buffer and recompute ETAs (if not locked)
router.patch('/admin/route/:route_id/buffer', async (req, res) => {
  try {
    const route_id = String(req.params.route_id || '').trim();
    const body = req.body || {};
    const buffer_minutes = normNumber(body.buffer_minutes, null);
    if (!route_id) return res.status(400).json({ error: 'Missing route_id' });
    if (buffer_minutes == null || !isFinite(buffer_minutes) || buffer_minutes < 0 || buffer_minutes > 180) {
      return res.status(400).json({ error: 'Invalid buffer_minutes' });
    }
    const route = await loadRoute(route_id);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (route.locked) return res.status(423).json({ error: 'Route is locked' });

    // Update route buffer
    await updateRouteBuffer(route_id, buffer_minutes);
    // Recompute using same order and coordinates
    const rows = await loadRouteStops(route_id);
    const bookings = rows.map((r) => ({ booking_id: r.id, address: r.pickup_address || r.pickup_location || '', lat: r.pickup_lat, lng: r.pickup_lng }));
    const result = await computePickupTimes({ id: route_id, title: route.title, departure_time: route.departure_time, buffer_minutes, test: !!route.test_mode, bookings });
    // Persist metadata update fully (for parity across DBs)
    await upsertRoute({ id: route_id, title: route.title, departure_time: route.departure_time, buffer_minutes, locked: !!route.locked, test: !!route.test_mode });
    return res.json({ ok:true, route_id, buffer_minutes, stops: result.stops });
  } catch (e) {
    console.error('admin.route buffer error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- Admin: manual lock
router.post('/admin/route/:route_id/lock', async (req, res) => {
  try {
    const route_id = String(req.params.route_id || '').trim();
    if (!route_id) return res.status(400).json({ error: 'Missing route_id' });
    const route = await loadRoute(route_id);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    if (!route.locked) await setRouteLocked(route_id, true);
    return res.json({ ok:true, route_id, locked: true });
  } catch (e) {
    console.error('admin.route lock error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// --- Auth middleware for driver-protected actions (JWT same as /driver) ---
function driverAuth(req, res, next){
  try {
    const h = req.headers.authorization || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tok) return res.status(401).json({ error: 'Unauthorized' });
    const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret').toString();
    const decoded = jwt.verify(tok, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
}

// POST /driver/route/:route_id/mark-picked — mark a booking as picked or completed under a specific route
router.post('/driver/route/:route_id/mark-picked', driverAuth, async (req, res) => {
  try {
    const route_id = String(req.params.route_id || '').trim();
    const body = req.body || {};
    const booking_id = String(body.booking_id || '').trim();
    const status = String(body.status || 'picked').trim().toLowerCase();
    if (!route_id || !booking_id) return res.status(400).json({ error: 'Missing fields' });
    if (!['picked','completed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const driverId = req.user && (req.user.driver_id || req.user.id) || null;

    let row = null;
    if (hasPostgres()){
      row = await withPg(async (c) => {
        const { rows } = await c.query('SELECT id, route_id, assigned_driver_id, metadata FROM bookings WHERE id = $1 LIMIT 1', [booking_id]);
        return rows && rows[0] ? rows[0] : null;
      });
    } else {
      const db = getSqlite();
      try { row = db.prepare('SELECT id, route_id, assigned_driver_id, metadata FROM bookings WHERE id = ? LIMIT 1').get(booking_id) || null; }
      finally { db.close(); }
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (route_id && row.route_id && row.route_id !== route_id) return res.status(409).json({ error: 'Route mismatch' });
    if (driverId && row.assigned_driver_id && String(row.assigned_driver_id) !== String(driverId)) return res.status(403).json({ error: 'Not your booking' });

    // Update status and record timestamp in metadata
    const nowIso = new Date().toISOString();
    let meta = {}; try { meta = row.metadata && typeof row.metadata==='string' ? JSON.parse(row.metadata) : (row.metadata || {}); } catch(_){}
    if (status === 'picked') meta.picked_at = nowIso; else if (status==='completed') meta.completed_at = nowIso;

    if (hasPostgres()){
      await withPg(async (c) => {
        await c.query('UPDATE bookings SET status=$1, metadata=$2, updated_at=now() WHERE id=$3', [status, JSON.stringify(meta), booking_id]);
      });
    } else {
      const db = getSqlite();
      try { db.prepare('UPDATE bookings SET status=?, metadata=?, updated_at=? WHERE id=?').run(status, JSON.stringify(meta), nowIso, booking_id); }
      finally { db.close(); }
    }
    console.log('driver.mark-picked:', { route_id, booking_id, status });
    return res.json({ ok: true, route_id, booking_id, status, at: nowIso });
  } catch (e) {
    console.error('driver.mark-picked error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});
