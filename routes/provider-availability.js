const express = require('express');
const path = require('path');
const crypto = require('crypto');

// Optional .env
try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// -------- Auth helpers (Basic auth, aligned with other admin routes) --------
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');

function parseBasicUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return null;
  try {
    const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
    const [user] = creds.split(':');
    return user || null;
  } catch (_) { return null; }
}

function checkAdminAuth(req) {
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  try {
    const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
    const [user, pass] = creds.split(':');
    return user === ADMIN_USER && pass === ADMIN_PASS;
  } catch (_) { return false; }
}

router.use((req, res, next) => {
  if (!checkAdminAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// -------- DB helpers: prefer Postgres if DATABASE_URL is set; else SQLite --------
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
let DatabaseLib = null;
function hasPostgres() { return !!process.env.DATABASE_URL; }

function getSqlite() {
  DatabaseLib = DatabaseLib || require('better-sqlite3');
  return new DatabaseLib(DB_PATH);
}

async function getPg() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

function ensureSqliteTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS provider_availability (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    available_date TEXT,
    start_time TEXT,
    end_time TEXT,
    notes TEXT,
    updated_at TEXT,
    admin_user TEXT
  )`);
}

async function ensurePgTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS provider_availability (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      available_date TEXT,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      updated_at TEXT,
      admin_user TEXT
    )
  `);
}

// -------- CRUD operations --------
function rowMatchesFilters(row, q) {
  if (!row) return false;
  if (q.provider_id && String(row.provider_id) !== String(q.provider_id)) return false;
  if (q.date && String(row.available_date) !== String(q.date)) return false;
  const from = q.from_date || q.from; const to = q.to_date || q.to;
  if (from && String(row.available_date) < String(from)) return false;
  if (to && String(row.available_date) > String(to)) return false;
  return true;
}

router.get('/list', async (req, res) => {
  try {
    const q = {
      provider_id: (req.query.provider_id || '').toString().trim() || null,
      date: (req.query.date || '').toString().trim() || null,
      from: (req.query.from || req.query.from_date || '').toString().trim() || null,
      to: (req.query.to || req.query.to_date || '').toString().trim() || null,
      limit: parseInt(req.query.limit || '1000', 10)
    };

    if (hasPostgres()) {
      const client = await getPg();
      try {
        await ensurePgTable(client);
        // Build dynamic WHERE with parameters
        const where = [];
        const params = [];
        if (q.provider_id) { params.push(q.provider_id); where.push(`provider_id = $${params.length}`); }
        if (q.date) { params.push(q.date); where.push(`available_date = $${params.length}`); }
        if (q.from) { params.push(q.from); where.push(`available_date >= $${params.length}`); }
        if (q.to) { params.push(q.to); where.push(`available_date <= $${params.length}`); }
        const sql = `SELECT * FROM provider_availability ${where.length ? ('WHERE ' + where.join(' AND ')) : ''} ORDER BY available_date ASC, start_time ASC LIMIT $${params.push(q.limit)}`;
        const { rows } = await client.query(sql, params);
        await client.end();
        return res.json({ ok: true, rows });
      } catch (e) { try { await client.end(); } catch(_) {} throw e; }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteTable(db);
        const rows = db.prepare('SELECT * FROM provider_availability ORDER BY available_date ASC, start_time ASC').all();
        const filtered = rows.filter(r => rowMatchesFilters(r, q));
        return res.json({ ok: true, rows: filtered.slice(0, q.limit) });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('provider-availability/list error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to list availability' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const body = req.body || {};
    const id = body.id || crypto.randomUUID();
    const provider_id = (body.provider_id || '').toString().trim();
    const available_date = (body.available_date || body.date || '').toString().trim();
    const start_time = (body.start_time || '').toString().trim();
    const end_time = (body.end_time || '').toString().trim();
    const notes = (body.notes || '').toString();
    const admin_user = parseBasicUser(req) || null;
    const updated_at = new Date().toISOString();

    if (!provider_id || !available_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (hasPostgres()) {
      const client = await getPg();
      try {
        await ensurePgTable(client);
        await client.query(
          `INSERT INTO provider_availability (id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user]
        );
        await client.end();
        return res.json({ ok: true, id });
      } catch (e) { try { await client.end(); } catch(_) {} throw e; }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteTable(db);
        const stmt = db.prepare(`INSERT INTO provider_availability (id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user)
                                 VALUES (@id, @provider_id, @available_date, @start_time, @end_time, @notes, @updated_at, @admin_user)`);
        stmt.run({ id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user });
        return res.json({ ok: true, id });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('provider-availability/create error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to create availability' });
  }
});

router.post('/update/:id', async (req, res) => {
  try {
    const id = (req.params.id || '').toString();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const body = req.body || {};
    const provider_id = (body.provider_id ?? '').toString().trim();
    const available_date = (body.available_date || body.date || '').toString().trim();
    const start_time = (body.start_time || '').toString().trim();
    const end_time = (body.end_time || '').toString().trim();
    const notes = (body.notes || '').toString();
    const admin_user = parseBasicUser(req) || null;
    const updated_at = new Date().toISOString();

    if (hasPostgres()) {
      const client = await getPg();
      try {
        await ensurePgTable(client);
        await client.query(
          `UPDATE provider_availability SET provider_id=$1, available_date=$2, start_time=$3, end_time=$4, notes=$5, updated_at=$6, admin_user=$7 WHERE id=$8`,
          [provider_id, available_date, start_time, end_time, notes, updated_at, admin_user, id]
        );
        await client.end();
        return res.json({ ok: true });
      } catch (e) { try { await client.end(); } catch(_) {} throw e; }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteTable(db);
        const stmt = db.prepare(`UPDATE provider_availability SET provider_id=@provider_id, available_date=@available_date, start_time=@start_time, end_time=@end_time, notes=@notes, updated_at=@updated_at, admin_user=@admin_user WHERE id=@id`);
        stmt.run({ id, provider_id, available_date, start_time, end_time, notes, updated_at, admin_user });
        return res.json({ ok: true });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('provider-availability/update error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to update availability' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = (req.params.id || '').toString();
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (hasPostgres()) {
      const client = await getPg();
      try {
        await ensurePgTable(client);
        await client.query(`DELETE FROM provider_availability WHERE id=$1`, [id]);
        await client.end();
        return res.json({ ok: true });
      } catch (e) { try { await client.end(); } catch(_) {} throw e; }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteTable(db);
        const stmt = db.prepare('DELETE FROM provider_availability WHERE id = ?');
        stmt.run(id);
        return res.json({ ok: true });
      } finally { db.close(); }
    }
  } catch (e) {
    console.error('provider-availability/delete error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to delete availability' });
  }
});

router.get('/export', async (req, res) => {
  try {
    // Reuse list endpoint logic to honor filters, then format CSV
    const headers = ['id','provider_id','available_date','start_time','end_time','notes','updated_at','admin_user'];
    req.query.limit = String(Math.min(parseInt(req.query.limit || '5000', 10), 10000));
    // Call list logic internally
    let rows = [];
    if (hasPostgres()) {
      const client = await getPg();
      try {
        await ensurePgTable(client);
        const where = [];
        const params = [];
        const provider_id = (req.query.provider_id || '').toString().trim() || null;
        const date = (req.query.date || '').toString().trim() || null;
        const from = (req.query.from || req.query.from_date || '').toString().trim() || null;
        const to = (req.query.to || req.query.to_date || '').toString().trim() || null;
        const limit = parseInt(req.query.limit || '5000', 10);
        if (provider_id) { params.push(provider_id); where.push(`provider_id = $${params.length}`); }
        if (date) { params.push(date); where.push(`available_date = $${params.length}`); }
        if (from) { params.push(from); where.push(`available_date >= $${params.length}`); }
        if (to) { params.push(to); where.push(`available_date <= $${params.length}`); }
        const sql = `SELECT * FROM provider_availability ${where.length ? ('WHERE ' + where.join(' AND ')) : ''} ORDER BY available_date ASC, start_time ASC LIMIT $${params.push(limit)}`;
        const r = await client.query(sql, params);
        rows = r.rows || [];
        await client.end();
      } catch (e) { try { await client.end(); } catch(_) {} throw e; }
    } else {
      const db = getSqlite();
      try {
        ensureSqliteTable(db);
        const all = db.prepare('SELECT * FROM provider_availability ORDER BY available_date ASC, start_time ASC').all();
        const filtered = all.filter(r => rowMatchesFilters(r, req.query || {}));
        rows = filtered.slice(0, parseInt(req.query.limit || '5000', 10));
      } finally { db.close(); }
    }

    const esc = (v) => {
      const s = (v == null) ? '' : String(v);
      // Escape double quotes and wrap in quotes if contains comma/newline
      const needs = /[",\n]/.test(s);
      const q = '"' + s.replace(/"/g, '""') + '"';
      return needs ? q : s;
    };
    const csv = [headers.join(',')]
      .concat(rows.map(r => headers.map(h => esc(r[h])).join(',')))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="provider_availability.csv"');
    return res.status(200).send(csv);
  } catch (e) {
    console.error('provider-availability/export error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;
