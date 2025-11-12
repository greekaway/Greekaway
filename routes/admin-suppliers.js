const express = require('express');
const path = require('path');

try { require('dotenv').config(); } catch(_){}

const router = express.Router();
// Use global JSON parser installed in server.js

// ---- Auth (admin-only) ----
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');

function checkAdminAuth(req){
  // Prefer server session
  try { if (req && req.session && req.session.admin === true) return true; } catch(_){ }
  // Accept session cookie set by /admin-login
  try {
    const h = req.headers.cookie || '';
    if (h) {
      const cookies = h.split(';').reduce((acc, part) => { const i=part.indexOf('='); if(i!==-1){ acc[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } return acc; }, {});
      if (cookies.adminSession === 'true' || cookies.adminSession === '1' || cookies.adminSession === 'yes') return true;
    }
  } catch(_){ }
  // Allow forwarding via X-Forward-Admin-Auth with base64 user:pass (from admin-home iframe)
  const fwd = (req.headers['x-forward-admin-auth'] || '').toString();
  if (fwd) {
    try { const [u,p] = Buffer.from(fwd, 'base64').toString('utf8').split(':'); if (u===ADMIN_USER && p===ADMIN_PASS) return true; } catch(_){ }
  }
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

router.use((req,res,next)=>{ if (!checkAdminAuth(req)) { return res.status(403).json({ error:'Forbidden' }); } next(); });

// ---- DB helpers ----
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
let DatabaseLib = null;
function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ DatabaseLib = DatabaseLib || require('better-sqlite3'); return new DatabaseLib(DB_PATH); }
async function getPg(){ const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); return c; }

function ensureSqliteExtras(db){
  // minimal table to store notes per supplier
  db.exec(`CREATE TABLE IF NOT EXISTS supplier_admin_notes (partner_id TEXT PRIMARY KEY, notes TEXT, updated_at TEXT)`);
  // ensure partners table and columns for demo/type support
  db.exec(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  try { db.exec('ALTER TABLE partners ADD COLUMN partner_type TEXT'); } catch(_) {}
  try { db.exec('ALTER TABLE partners ADD COLUMN last_seen TEXT'); } catch(_) {}
}
async function ensurePgExtras(client){
  await client.query(`CREATE TABLE IF NOT EXISTS supplier_admin_notes (partner_id TEXT PRIMARY KEY, notes TEXT, updated_at TEXT)`);
  await client.query(`CREATE TABLE IF NOT EXISTS partners (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  try { await client.query('ALTER TABLE partners ADD COLUMN partner_type TEXT'); } catch(_) {}
  try { await client.query('ALTER TABLE partners ADD COLUMN last_seen TIMESTAMP NULL'); } catch(_) {}
}

// Helper: CSV escaping
function escCsv(v){
  const s = (v==null ? '' : String(v));
  const needs = /[",\n]/.test(s);
  return needs ? ('"' + s.replace(/"/g, '""') + '"') : s;
}

// GET /api/admin/suppliers
router.get('/', async (req, res) => {
  try {
    const q = {
      q: (req.query.q || '').toString().trim(),
      type: (req.query.type || '').toString().trim(),
      from: (req.query.from || '').toString().trim(),
      to: (req.query.to || '').toString().trim(),
      payoutStatus: (req.query.payoutStatus || '').toString().trim().toLowerCase(),
      sort: (req.query.sort || 'last_active').toString(),
      dir: ((req.query.dir || 'desc').toString().toLowerCase() === 'asc') ? 'ASC' : 'DESC',
      limit: Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10) || 50)),
      offset: Math.max(0, parseInt(req.query.offset || '0', 10) || 0)
    };

    if (hasPostgres()){
      const client = await getPg();
      try {
        await ensurePgExtras(client);
        // Base partners list
        const params = [];
        const where = [];
  if (q.q) { params.push('%'+q.q.toLowerCase()+'%'); where.push(`(lower(p.name) LIKE $${params.length} OR lower(p.email) LIKE $${params.length})`); }
  if (q.type) { params.push(q.type.toLowerCase()); where.push(`lower(p.partner_type) = $${params.length}`); }
  const baseSql = `SELECT p.id, p.name, p.email, p.partner_type, p.last_seen FROM partners p ${where.length?('WHERE '+where.join(' AND ')) : ''}`;
        const base = (await client.query(baseSql, params)).rows || [];
        // For each partner, aggregate bookings
        const ids = base.map(r=>r.id);
        let rows = [];
        if (ids.length){
          const agg = await client.query(`
            SELECT b.partner_id as id,
                   COUNT(*)::int as total_trips,
                   COALESCE(SUM(b.partner_share_cents)/100.0, 0)::float as total_revenue,
                   COALESCE(AVG( CASE WHEN (COALESCE(b.partner_share_cents,0)+COALESCE(b.commission_cents,0))>0 THEN (b.commission_cents::float*100.0)/(COALESCE(b.partner_share_cents,0)+COALESCE(b.commission_cents,0)) ELSE NULL END ), NULL)::float as commission_percent,
                   MIN(b.created_at) as first_seen,
                   MAX(b.updated_at) as last_active,
                   SUM(CASE WHEN lower(COALESCE(b.payment_type,''))='stripe' THEN 1 ELSE 0 END)::int as stripe_cnt,
                   SUM(CASE WHEN lower(COALESCE(b.payment_type,''))='manual' THEN 1 ELSE 0 END)::int as manual_cnt
            FROM bookings b
            WHERE b.partner_id = ANY($1)
              ${q.from ? `AND b.created_at >= $2` : ''}
              ${q.to ? `AND b.created_at <= $3` : ''}
            GROUP BY b.partner_id
          `, q.from && q.to ? [ids, q.from, q.to] : (q.from ? [ids, q.from] : (q.to ? [ids, q.to] : [ids])));
          const byId = {}; (agg.rows||[]).forEach(a => { byId[a.id] = a; });
          rows = base.map(b => {
            const a = byId[b.id] || {};
            const stripe = a.stripe_cnt||0, manual = a.manual_cnt||0;
            let ptype = null;
            if (stripe>0 && manual===0) ptype='stripe'; else if (manual>0 && stripe===0) ptype='manual'; else if (stripe===0 && manual===0) ptype=null; else ptype = (stripe>=manual)?'stripe':'manual';
            return {
              id: b.id,
              name: b.name || b.email || b.id,
              type: b.partner_type || null,
              total_trips: a.total_trips || 0,
              total_revenue: a.total_revenue || 0,
              commission_percent: a.commission_percent != null ? a.commission_percent : null,
              payout_breakdown: { stripe: a.stripe_cnt||0, manual: a.manual_cnt||0 },
              payout_type: ptype,
              first_seen: a.first_seen || null,
              last_active: a.last_active || b.last_seen || null
            };
          });
        } else { rows = []; }
        // payoutStatus filter: use derived single payout_type; unpaid → bookings with payout_status != 'sent'
        if (q.payoutStatus === 'unpaid'){
          const unpaid = await client.query(`SELECT DISTINCT partner_id FROM bookings WHERE COALESCE(payout_status,'') <> 'sent' OR payout_status IS NULL`);
          const set = new Set((unpaid.rows||[]).map(r=>r.partner_id));
          rows = rows.filter(r => set.has(r.id));
        } else if (q.payoutStatus === 'stripe') {
          rows = rows.filter(r => r.payout_type === 'stripe');
        } else if (q.payoutStatus === 'manual') {
          rows = rows.filter(r => r.payout_type === 'manual');
        }
        // Sort/paginate in SQL-ish manner (we'll sort in JS since we merged data)
        rows.sort((a,b) => {
          const dir = q.dir === 'ASC' ? 1 : -1;
          const key = q.sort;
          const va = a[key]; const vb = b[key];
          if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir * -1; // numbers: DESC default
          return String(va).localeCompare(String(vb)) * (q.dir==='ASC'?1:-1);
        });
        const total = rows.length;
        const sliced = rows.slice(q.offset, q.offset + q.limit);
        return res.json({ rows: sliced, total });
      } catch(e) {
        try { await client.end(); } catch(_){}
        throw e;
      } finally { try { await client.end(); } catch(_){} }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteExtras(db);
        const where = [];
        const params = [];
  if (q.q){ where.push('(lower(name) LIKE ? OR lower(email) LIKE ?)'); params.push('%'+q.q.toLowerCase()+'%','%'+q.q.toLowerCase()+'%'); }
  if (q.type){ where.push("lower(COALESCE(partner_type, '')) = ?"); params.push(q.type.toLowerCase()); }
  const base = db.prepare(`SELECT id,name,email,partner_type,last_seen FROM partners ${where.length?('WHERE '+where.join(' AND ')):''}`).all(...params);
        // Aggregate from bookings
        const ids = base.map(r=>r.id);
        let byId = {};
        if (ids.length){
          const rows = db.prepare(`SELECT partner_id as id,
              COUNT(*) as total_trips,
              COALESCE(SUM(COALESCE(partner_share_cents,0))/100.0,0) as total_revenue,
              AVG( CASE WHEN (COALESCE(partner_share_cents,0)+COALESCE(commission_cents,0))>0 THEN (commission_cents*100.0)/(COALESCE(partner_share_cents,0)+COALESCE(commission_cents,0)) ELSE NULL END ) as commission_percent,
              MIN(created_at) as first_seen,
              MAX(updated_at) as last_active,
              SUM(CASE WHEN lower(COALESCE(payment_type,''))='stripe' THEN 1 ELSE 0 END) as stripe_cnt,
              SUM(CASE WHEN lower(COALESCE(payment_type,''))='manual' THEN 1 ELSE 0 END) as manual_cnt
            FROM bookings WHERE partner_id IN (${ids.map(()=>'?').join(',')})
              ${q.from ? 'AND created_at >= ?' : ''}
              ${q.to ? 'AND created_at <= ?' : ''}
            GROUP BY partner_id`).all(...(q.from && q.to ? [...ids, q.from, q.to] : (q.from ? [...ids, q.from] : (q.to ? [...ids, q.to] : [...ids]))));
          rows.forEach(r => { byId[r.id] = r; });
        }
        let out = base.map(b => {
          const a = byId[b.id] || {};
          const stripe = a.stripe_cnt||0, manual = a.manual_cnt||0;
          let ptype = null;
          if (stripe>0 && manual===0) ptype='stripe'; else if (manual>0 && stripe===0) ptype='manual'; else if (stripe===0 && manual===0) ptype=null; else ptype = (stripe>=manual)?'stripe':'manual';
          return {
            id: b.id,
            name: b.name || b.email || b.id,
            type: b.partner_type || null,
            total_trips: a.total_trips || 0,
            total_revenue: a.total_revenue || 0,
            commission_percent: (a.commission_percent != null) ? a.commission_percent : null,
            payout_breakdown: { stripe: a.stripe_cnt||0, manual: a.manual_cnt||0 },
            payout_type: ptype,
            first_seen: a.first_seen || null,
            last_active: a.last_active || b.last_seen || null
          };
        });
        // payoutStatus filter now based on derived payout_type
        if (q.payoutStatus === 'unpaid'){
          const unpaid = db.prepare(`SELECT DISTINCT partner_id FROM bookings WHERE COALESCE(payout_status,'') <> 'sent' OR payout_status IS NULL`).all();
          const set = new Set(unpaid.map(r=>r.partner_id));
          out = out.filter(r => set.has(r.id));
        } else if (q.payoutStatus === 'stripe') {
          out = out.filter(r => r.payout_type === 'stripe');
        } else if (q.payoutStatus === 'manual') {
          out = out.filter(r => r.payout_type === 'manual');
        }
        // Sort
        out.sort((a,b) => {
          const dir = q.dir === 'ASC' ? 1 : -1;
          const key = q.sort;
          const va = a[key]; const vb = b[key];
          if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir * -1;
          return String(va).localeCompare(String(vb)) * (q.dir==='ASC'?1:-1);
        });
        const total = out.length;
        const sliced = out.slice(q.offset, q.offset + q.limit);
        return res.json({ rows: sliced, total });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('admin-suppliers list error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// CSV export
router.get('/.csv', (req,res,next) => next()); // allow .csv through next
router.get('/csv', async (req, res) => {
  try {
    // Reuse JSON endpoint logic by calling the router handler would be complex; duplicate minimal fetch without pagination
    req.query.limit = '10000'; req.query.offset = '0';
    // Slight duplication: call same path programmatically is messy; instead re-run simplified branch (SQLite only) for CSV if no Postgres
    if (hasPostgres()){
      // shortcut: call JSON then convert to CSV
      const url = new URL(req.protocol+ '://' + req.get('host') + req.originalUrl.replace(/\.csv$/,''));
      const fakeReq = { query: Object.fromEntries(url.searchParams.entries()), headers: req.headers };
      const fakeRes = { json: (data)=>data };
      // not elegant in Express; fallback to building based on above aggregation but without slicing would require refactor. For now, just duplicate logic partially
    }
    // For simplicity, call our own JSON handler via fetch-like approach inside the same process by requiring http is overkill.
    // We'll re-run the SQLite branch minimally: (works also for PG by setting large limit and then building CSV from response)
    const q = {
      q: (req.query.q || '').toString().trim(),
      type: (req.query.type || '').toString().trim(),
      from: (req.query.from || '').toString().trim(),
      to: (req.query.to || '').toString().trim(),
      payoutStatus: (req.query.payoutStatus || '').toString().trim().toLowerCase(),
      sort: (req.query.sort || 'last_active').toString(),
      dir: ((req.query.dir || 'desc').toString().toLowerCase() === 'asc') ? 'ASC' : 'DESC',
    };
    const headers = ['id','name','type','total_trips','total_revenue','commission_percent','stripe_cnt','manual_cnt','first_seen','last_active'];

    let rows = [];
    if (hasPostgres()){
      const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
      try {
        const base = await client.query(`SELECT id,name,email,partner_type,last_seen FROM partners`);
        const ids = (base.rows||[]).map(r=>r.id);
        if (ids.length){
          const agg = await client.query(`
            SELECT b.partner_id as id,
                   COUNT(*)::int as total_trips,
                   COALESCE(SUM(b.partner_share_cents)/100.0, 0)::float as total_revenue,
                   COALESCE(AVG( CASE WHEN (COALESCE(b.partner_share_cents,0)+COALESCE(b.commission_cents,0))>0 THEN (b.commission_cents::float*100.0)/(COALESCE(b.partner_share_cents,0)+COALESCE(b.commission_cents,0)) ELSE NULL END ), NULL)::float as commission_percent,
                   MIN(b.created_at) as first_seen,
                   MAX(b.updated_at) as last_active,
                   SUM(CASE WHEN lower(COALESCE(b.payment_type,''))='stripe' THEN 1 ELSE 0 END)::int as stripe_cnt,
                   SUM(CASE WHEN lower(COALESCE(b.payment_type,''))='manual' THEN 1 ELSE 0 END)::int as manual_cnt
            FROM bookings b WHERE b.partner_id = ANY($1)
            GROUP BY b.partner_id
          `, [ids]);
          const by = {}; (agg.rows||[]).forEach(a=>{ by[a.id]=a; });
          rows = (base.rows||[]).map(b => ({
            id: b.id, name: b.name || b.email || b.id, type: b.partner_type || null, total_trips: (by[b.id]||{}).total_trips||0, total_revenue:(by[b.id]||{}).total_revenue||0,
            commission_percent:(by[b.id]||{}).commission_percent||null, stripe_cnt:(by[b.id]||{}).stripe_cnt||0, manual_cnt:(by[b.id]||{}).manual_cnt||0,
            first_seen:(by[b.id]||{}).first_seen||null, last_active:(by[b.id]||{}).last_active||b.last_seen||null
          }));
        }
      } finally { try{await client.end();}catch(_){}}
    } else {
      const db = getSqlite();
      try {
        ensureSqliteExtras(db);
  const partners = db.prepare('SELECT id,name,email,partner_type,last_seen FROM partners').all();
        const ids = partners.map(p=>p.id);
        const agg = ids.length ? db.prepare(`SELECT partner_id as id,
              COUNT(*) as total_trips,
              COALESCE(SUM(COALESCE(partner_share_cents,0))/100.0,0) as total_revenue,
              AVG( CASE WHEN (COALESCE(partner_share_cents,0)+COALESCE(commission_cents,0))>0 THEN (commission_cents*100.0)/(COALESCE(partner_share_cents,0)+COALESCE(commission_cents,0)) ELSE NULL END ) as commission_percent,
              MIN(created_at) as first_seen,
              MAX(updated_at) as last_active,
              SUM(CASE WHEN lower(COALESCE(payment_type,''))='stripe' THEN 1 ELSE 0 END) as stripe_cnt,
              SUM(CASE WHEN lower(COALESCE(payment_type,''))='manual' THEN 1 ELSE 0 END) as manual_cnt
            FROM bookings WHERE partner_id IN (${ids.map(()=>'?').join(',')}) GROUP BY partner_id`).all(...ids) : [];
        const by = {}; agg.forEach(a=>{ by[a.id]=a; });
        rows = partners.map(b => ({ id:b.id, name:b.name || b.email || b.id, type:b.partner_type || null, total_trips:(by[b.id]||{}).total_trips||0, total_revenue:(by[b.id]||{}).total_revenue||0,
          commission_percent:(by[b.id]||{}).commission_percent||null, stripe_cnt:(by[b.id]||{}).stripe_cnt||0, manual_cnt:(by[b.id]||{}).manual_cnt||0,
          first_seen:(by[b.id]||{}).first_seen||null, last_active:(by[b.id]||{}).last_active||b.last_seen||null }));
      } finally { db.close(); }
    }
    // CSV
    const lines = [];
    lines.push(headers.join(','));
    rows.forEach(r => {
      lines.push([
        escCsv(r.id), escCsv(r.name), escCsv(r.type||''), escCsv(r.total_trips), escCsv(r.total_revenue), escCsv(r.commission_percent!=null?Math.round(r.commission_percent*10)/10:''), escCsv(r.stripe_cnt), escCsv(r.manual_cnt), escCsv(r.first_seen||''), escCsv(r.last_active||'')
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="suppliers.csv"');
    return res.status(200).send(lines.join('\n'));
  } catch(e){
    console.error('admin-suppliers csv error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Details: trips list, monthly revenue, payouts, notes
router.get('/:id/details', async (req,res) => {
  try {
    const id = (req.params.id||'').toString(); if (!id) return res.status(400).json({ error: 'Missing id' });
    if (hasPostgres()){
      const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
      try {
        await ensurePgExtras(client);
        const trips = (await client.query(`SELECT date, trip_id, seats, price_cents AS amount_cents, status FROM bookings WHERE partner_id=$1 ORDER BY date DESC NULLS LAST, created_at DESC LIMIT 200`, [id])).rows || [];
        let monthly = [];
        try {
          const q = `SELECT to_char(date_trunc('month', COALESCE(NULLIF(created_at,'')::timestamp, now())), 'YYYY-MM') AS month, SUM(COALESCE(partner_share_cents,0))/100.0 AS revenue FROM bookings WHERE partner_id=$1 GROUP BY 1 ORDER BY 1 DESC LIMIT 24`;
          const r = await client.query(q, [id]);
          monthly = r.rows || [];
        } catch(_) { monthly = []; }
        let payouts = [];
        try { const r = await client.query(`SELECT type, status, amount_cents/100.0 AS amount, payout_date as date FROM payouts WHERE partner_id=$1 ORDER BY payout_date DESC NULLS LAST, created_at DESC LIMIT 50`, [id]); payouts = r.rows||[]; } catch(_){ payouts = []; }
        let note = '';
        try { const r = await client.query(`SELECT notes FROM supplier_admin_notes WHERE partner_id=$1`, [id]); note = (r.rows && r.rows[0] && r.rows[0].notes) || ''; } catch(_){ note=''; }
        return res.json({
          trips: trips.map(t => ({ date: t.date || null, trip_id: t.trip_id || '', seats: t.seats || null, amount: (typeof t.amount_cents === 'number') ? (t.amount_cents/100.0) : null, status: t.status || '' })),
          monthly: monthly.map(m => ({ month: m.month, revenue: m.revenue || 0 })),
          payouts: payouts.map(p => ({ type: p.type || '', status: p.status || '', amount: p.amount || 0, date: p.date || null })),
          notes: note
        });
      } catch(e){ throw e; } finally { try{await client.end();}catch(_){}}
    }
    // SQLite fallback
    const db = getSqlite();
    try {
      ensureSqliteExtras(db);
      const trips = db.prepare(`SELECT date, trip_id, seats, price_cents AS amount_cents, status FROM bookings WHERE partner_id = ? ORDER BY date DESC, created_at DESC LIMIT 200`).all(id);
      const monthlyRaw = db.prepare(`SELECT substr(COALESCE(created_at, ''), 1, 7) AS m, SUM(COALESCE(partner_share_cents,0))/100.0 AS revenue FROM bookings WHERE partner_id = ? GROUP BY m ORDER BY m DESC LIMIT 24`).all(id);
      const payouts = db.prepare(`SELECT type, status, amount_cents/100.0 AS amount, payout_date as date FROM payouts WHERE partner_id = ? ORDER BY payout_date DESC, created_at DESC LIMIT 50`).all(id);
      const note = db.prepare(`SELECT notes FROM supplier_admin_notes WHERE partner_id = ?`).get(id) || {};
      return res.json({
        trips: trips.map(t => ({ date: t.date || null, trip_id: t.trip_id || '', seats: t.seats || null, amount: (typeof t.amount_cents === 'number') ? (t.amount_cents/100.0) : null, status: t.status || '' })),
        monthly: monthlyRaw.filter(r => r && r.m).map(r => ({ month: r.m, revenue: r.revenue || 0 })),
        payouts: payouts.map(p => ({ type: p.type || '', status: p.status || '', amount: p.amount || 0, date: p.date || null })),
        notes: note.notes || ''
      });
    } finally { db.close(); }
  } catch(e){
    console.error('admin-suppliers details error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/notes', async (req,res) => {
  try {
    const id = (req.params.id||'').toString(); if (!id) return res.status(400).json({ error: 'Missing id' });
    const text = (req.body && req.body.notes || '').toString();
    const now = new Date().toISOString();
    if (hasPostgres()){
      const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
      try { await ensurePgExtras(client); await client.query(`INSERT INTO supplier_admin_notes (partner_id,notes,updated_at) VALUES ($1,$2,$3) ON CONFLICT (partner_id) DO UPDATE SET notes=excluded.notes, updated_at=excluded.updated_at`, [id, text, now]); return res.json({ ok:true }); }
      finally { try{await client.end();}catch(_){}}
    } else {
      const db = getSqlite();
      try { ensureSqliteExtras(db); db.prepare(`INSERT INTO supplier_admin_notes (partner_id,notes,updated_at) VALUES (?,?,?) ON CONFLICT(partner_id) DO UPDATE SET notes=excluded.notes, updated_at=excluded.updated_at`).run(id, text, now); return res.json({ ok:true }); }
      finally { db.close(); }
    }
  } catch(e){
    console.error('admin-suppliers notes error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
