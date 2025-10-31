const express = require('express');
const path = require('path');

// Load .env locally if present
try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Basic admin auth (align with partners.js and server.js)
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
function checkAdminAuth(req) {
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
  // Index for recent queries
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_manual_payments_created ON manual_payments(created_at DESC)'); } catch (_e) {}
  db.close();
}
try { ensureSchema(); } catch (_e) {}

// GET /api/manual-payments — list demo manual deposits
router.get('/', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).json({ error: 'Unauthorized' }); }
  try {
    const db = getDb();
    const limit = Math.min(1000, Math.abs(parseInt(req.query.limit || '500', 10) || 500));
    const rows = db.prepare('SELECT * FROM manual_payments ORDER BY created_at DESC LIMIT ?').all(limit);
    db.close();
    // Shape response to frontend expectations
    const out = rows.map(r => ({
      id: r.id,
      partner_name: r.partner_name,
      trip_title: r.trip_title || r.trip_id,
      date: r.date,
      // Expose explicit cents fields
      amount_cents: typeof r.amount_cents === 'number' ? r.amount_cents : null,
      partner_balance_cents: typeof r.partner_balance_cents === 'number' ? r.partner_balance_cents : null,
      // Back-compat aliases
      amount: typeof r.amount_cents === 'number' ? r.amount_cents : null,
      partner_balance: typeof r.partner_balance_cents === 'number' ? r.partner_balance_cents : null,
      currency: r.currency || 'eur',
      iban: r.iban || '',
      status: r.status || 'pending'
    }));
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/manual-payments/mark-paid — mark an entry as paid (in-memory)
router.post('/mark-paid', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).json({ error: 'Unauthorized' }); }
  try {
    const id = (req.body && req.body.id) ? String(req.body.id) : '';
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const db = getDb();
    const now = new Date().toISOString();
    const row = db.prepare('SELECT * FROM manual_payments WHERE id = ?').get(id);
    if (!row) { db.close(); return res.status(404).json({ error: 'Not found' }); }
    db.prepare('UPDATE manual_payments SET status = ?, partner_balance_cents = ?, updated_at = ? WHERE id = ?').run('paid', 0, now, id);
    const updated = db.prepare('SELECT * FROM manual_payments WHERE id = ?').get(id);
    db.close();
    return res.json({ ok: true, item: updated });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
