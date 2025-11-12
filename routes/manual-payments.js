const express = require('express');
const path = require('path');
const crypto = require('crypto');

// Load .env locally if present
try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
const adminSse = require('../services/adminSse');
router.use(express.urlencoded({ extended: true }));
// Use global JSON parser installed in server.js

// Basic admin auth (align with partners.js and server.js)
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
function checkAdminAuth(req) {
  try { if (req && req.session && req.session.admin === true) return true; } catch(_){ }
  // Accept cookie session from /admin-login
  try {
    const h = req.headers.cookie || '';
    if (h) {
      const cookies = h.split(';').reduce((acc, part) => { const i=part.indexOf('='); if(i!==-1){ acc[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } return acc; }, {});
      if (cookies.adminSession === 'true' || cookies.adminSession === '1' || cookies.adminSession === 'yes') return true;
    }
  } catch(_){ }
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

// DB helpers (SQLite)
let DatabaseLib = null;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
function getDb() {
  try { DatabaseLib = DatabaseLib || require('better-sqlite3'); } catch (_) { DatabaseLib = null; }
  if (!DatabaseLib) throw new Error('better-sqlite3 not installed');
  const db = new DatabaseLib(DB_PATH);
  return db;
}

function ensureSchema() {
  try { DatabaseLib = DatabaseLib || require('better-sqlite3'); } catch (_) { DatabaseLib = null; }
  if (!DatabaseLib) return;
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS manual_payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT,
    partner_id TEXT,
    partner_name TEXT,
    trip_id TEXT,
    trip_title TEXT,
    date TEXT,
    amount_cents INTEGER,
    currency TEXT,
    iban TEXT,
    status TEXT,
    partner_balance_cents INTEGER,
    created_at TEXT,
    updated_at TEXT
  )`);
  // Optional: add paid_manual flag if not present
  try {
    const info = db.prepare("PRAGMA table_info('manual_payments')").all();
    const hasPaid = info && info.some(i => i.name === 'paid_manual');
    if (!hasPaid) {
      try { db.prepare('ALTER TABLE manual_payments ADD COLUMN paid_manual INTEGER DEFAULT 0').run(); } catch (_) {}
    }
  } catch (_) {}
  // Log table for audit
  db.exec(`CREATE TABLE IF NOT EXISTS manual_payments_log (
    id TEXT PRIMARY KEY,
    manual_payment_id TEXT,
    action TEXT,
    admin_user TEXT,
    details TEXT,
    created_at TEXT
  )`);
  // Index for recent queries
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_manual_payments_created ON manual_payments(created_at DESC)'); } catch (_e) {}
  db.close();
}
try { ensureSchema(); } catch (_e) {}

// GET /api/manual-payments — list demo manual deposits
router.get('/', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const db = getDb();
    const limit = Math.min(1000, Math.abs(parseInt(req.query.limit || '500', 10) || 500));
    const rows = db.prepare('SELECT * FROM manual_payments ORDER BY created_at DESC LIMIT ?').all(limit);
    db.close();
    // Shape response to frontend expectations
    const out = rows.map(r => ({
      id: r.id,
      booking_id: r.booking_id || '',
      partner_id: r.partner_id || '',
      partner_name: r.partner_name || '',
      trip_title: r.trip_title || r.trip_id || '',
      date: r.date || r.created_at,
      // Expose explicit cents fields
      amount_cents: typeof r.amount_cents === 'number' ? r.amount_cents : null,
      partner_balance_cents: typeof r.partner_balance_cents === 'number' ? r.partner_balance_cents : null,
      // Back-compat aliases
      amount: typeof r.amount_cents === 'number' ? r.amount_cents : null,
      partner_balance: typeof r.partner_balance_cents === 'number' ? r.partner_balance_cents : null,
      currency: r.currency || 'eur',
      iban: r.iban || '',
      status: r.status || 'pending',
      created_at: r.created_at || new Date().toISOString()
    }));
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/manual-payments/mark-paid — mark an entry as paid (in-memory)
router.post('/mark-paid', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
  try {
    const id = (req.body && req.body.id) ? String(req.body.id) : '';
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const db = getDb();
    const now = new Date().toISOString();
    const row = db.prepare('SELECT * FROM manual_payments WHERE id = ?').get(id);
    if (!row) { db.close(); return res.status(404).json({ error: 'Not found' }); }
    // Mark as paid and zero out balance, also flip paid_manual flag
    try { db.prepare('UPDATE manual_payments SET status = ?, partner_balance_cents = ?, paid_manual = 1, updated_at = ? WHERE id = ?').run('paid', 0, now, id); }
    catch (_e) { db.prepare('UPDATE manual_payments SET status = ?, partner_balance_cents = ?, updated_at = ? WHERE id = ?').run('paid', 0, now, id); }
    const updated = db.prepare('SELECT * FROM manual_payments WHERE id = ?').get(id);
    // Write audit log
    try {
      const auth = req.headers.authorization || '';
      let adminUser = null;
      if (auth.startsWith('Basic ')) {
        try { adminUser = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8').split(':')[0] || null; } catch (_) {}
      }
      const logId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('mpl_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
      const details = { before: { status: row.status, partner_balance_cents: row.partner_balance_cents }, after: { status: 'paid', partner_balance_cents: 0 } };
      db.prepare('INSERT INTO manual_payments_log (id, manual_payment_id, action, admin_user, details, created_at) VALUES (?,?,?,?,?,?)')
        .run(logId, id, 'mark_paid', adminUser, JSON.stringify(details), now);
    } catch (_) {}
    db.close();
    try {
      adminSse.broadcast({ type: 'manual_payment_paid', id, item: updated });
      try { console.log('manual-payments: marked paid broadcast', id); } catch(_) {}
    } catch(_) {}
    return res.json({ ok: true, item: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
