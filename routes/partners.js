const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Local .env (if present)
try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
// Use global JSON parser installed in server.js

// Stripe (reuse env keys; accept STRIPE_SECRET_KEY or STRIPE_SECRET)
const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || '').toString().trim().replace(/^['"]|['"]$/g, '');
// Optional: force HTTPS callback base for live-mode Connect (e.g. https://greekaway.com)
const CONNECT_CALLBACK_BASE = (process.env.CONNECT_CALLBACK_BASE || '').toString().trim().replace(/^['"]|['"]$/g, '');
try { console.log('partners: CONNECT_CALLBACK_BASE =', CONNECT_CALLBACK_BASE || '(unset)'); } catch(_) {}
let stripe = null;
if (STRIPE_SECRET) {
  try {
    stripe = require('stripe')(STRIPE_SECRET);
    try {
      const masked = STRIPE_SECRET.replace(/^(sk_[a-z]+_).+/, '$1********');
      console.log('partners: stripe initialized (masked secret):', masked);
    } catch(_) {}
  } catch (e) {
    console.warn('partners: stripe not initialized (missing dependency?)', e && e.message ? e.message : e);
  }
} else {
  try { console.warn('partners: STRIPE secret missing (STRIPE_SECRET_KEY or STRIPE_SECRET not set)'); } catch(_) {}
}

// Admin basic auth (align with server.js env)
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
function getCookies(req){
  try {
    const h = req.headers.cookie || '';
    if (!h) return {};
    return h.split(';').reduce((acc, part) => {
      const i = part.indexOf('=');
      if (i === -1) return acc;
      const k = part.slice(0,i).trim();
      const v = decodeURIComponent(part.slice(i+1).trim());
      acc[k] = v; return acc;
    }, {});
  } catch(_) { return {}; }
}
function hasAdminSession(req){
  try { if (req && req.session && req.session.admin === true) return true; } catch(_){ }
  const c = getCookies(req);
  return c.adminSession === 'true' || c.adminSession === '1' || c.adminSession === 'yes';
}
function checkAdminAuth(req) {
  if (hasAdminSession(req)) return true;
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

// --- SQLite helpers shared across routes ---
let DatabaseLib = null;
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');
function getDb() {
  try { DatabaseLib = DatabaseLib || require('better-sqlite3'); } catch (_) { DatabaseLib = null; }
  if (!DatabaseLib) throw new Error('better-sqlite3 not installed');
  const db = new DatabaseLib(DB_PATH);
  return db;
}

// Ensure schema extensions needed for payouts and admin tracking exist.
function ensureSchema() {
  try { DatabaseLib = DatabaseLib || require('better-sqlite3'); } catch (_) { DatabaseLib = null; }
  if (!DatabaseLib) return;
  const db = getDb();
  // bookings table extended columns
  db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY
  )`);
  try { db.exec('ALTER TABLE bookings ADD COLUMN payment_type TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN partner_id TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN partner_share_cents INTEGER'); } catch (_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN commission_cents INTEGER'); } catch (_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN payout_status TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE bookings ADD COLUMN payout_date TEXT'); } catch (_) {}
  // partner_agreements already ensured below
  ensureSqliteTable(db);
  // partner to trip mapping (optional; editable from admin grid)
  db.exec(`CREATE TABLE IF NOT EXISTS partner_mappings (
    trip_id TEXT PRIMARY KEY,
    partner_id TEXT,
    share_percent INTEGER DEFAULT 80,
    updated_at TEXT
  )`);
  // payouts log
  db.exec(`CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    booking_id TEXT,
    partner_id TEXT,
    amount_cents INTEGER,
    currency TEXT,
    type TEXT,
    status TEXT,
    provider_id TEXT,
    failure_reason TEXT,
    created_at TEXT,
    updated_at TEXT,
    payout_date TEXT
  )`);
  db.close();
}
try { ensureSchema(); } catch (_) {}

// DB helpers: prefer Postgres if DATABASE_URL is set; else SQLite
function hasPostgres() {
  return !!process.env.DATABASE_URL;
}

async function ensurePgTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS partner_agreements (
      id TEXT PRIMARY KEY,
      partner_name TEXT,
      partner_email TEXT,
      stripe_account_id TEXT,
      onboarding_url TEXT,
      iban TEXT,
      vat_number TEXT,
      agreed BOOLEAN,
      ip TEXT,
      timestamp TEXT,
      source TEXT,
      agreement_hash TEXT,
      agreement_version TEXT
    )
  `);
  // Ensure new columns for existing tables
  try { await client.query('ALTER TABLE partner_agreements ADD COLUMN IF NOT EXISTS onboarding_url TEXT'); } catch (_) {}
}

function ensureSqliteTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS partner_agreements (
    id TEXT PRIMARY KEY,
    partner_name TEXT,
    partner_email TEXT,
    stripe_account_id TEXT,
    onboarding_url TEXT,
    iban TEXT,
    vat_number TEXT,
    agreed INTEGER,
    ip TEXT,
    timestamp TEXT,
    source TEXT,
    agreement_hash TEXT,
    agreement_version TEXT
  )`);
  try { db.exec('ALTER TABLE partner_agreements ADD COLUMN onboarding_url TEXT'); } catch (_) {}
}

async function insertPartnerAgreement(record) {
  const id = record.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id,
    partner_name: record.partner_name || null,
    partner_email: record.partner_email || null,
    stripe_account_id: record.stripe_account_id || null,
    onboarding_url: record.onboarding_url || null,
    iban: record.iban || null,
    vat_number: record.vat_number || null,
    agreed: !!record.agreed,
    ip: record.ip || null,
    timestamp: record.timestamp || now,
    source: record.source || null,
    agreement_hash: record.agreement_hash || null,
    agreement_version: record.agreement_version || null
  };

  // Admin: list partners for filters (id + label)
  router.get('/list', (req, res) => {
    if (!checkAdminAuth(req)) { return res.status(403).json({ error: 'Forbidden' }); }
    try {
      const db = getDb();
      const rows = db.prepare('SELECT id, partner_name, partner_email FROM partner_agreements ORDER BY partner_name ASC').all();
      db.close();
      const out = rows.map(r => ({ id: r.id, partner_name: r.partner_name || null, partner_email: r.partner_email || null }));
      return res.json(out);
    } catch (e) { return res.status(500).json({ error: 'Server error' }); }
  });

  if (hasPostgres()) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await ensurePgTable(client);
    await client.query(
      `INSERT INTO partner_agreements (id, partner_name, partner_email, stripe_account_id, onboarding_url, iban, vat_number, agreed, ip, timestamp, source, agreement_hash, agreement_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [row.id, row.partner_name, row.partner_email, row.stripe_account_id, row.onboarding_url, row.iban, row.vat_number, row.agreed, row.ip, row.timestamp, row.source, row.agreement_hash, row.agreement_version]
    );
    await client.end();
    return id;
  } else {
    // SQLite
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
    ensureSqliteTable(db);
    const stmt = db.prepare(`INSERT INTO partner_agreements (id, partner_name, partner_email, stripe_account_id, onboarding_url, iban, vat_number, agreed, ip, timestamp, source, agreement_hash, agreement_version)
                             VALUES (@id, @partner_name, @partner_email, @stripe_account_id, @onboarding_url, @iban, @vat_number, @agreed, @ip, @timestamp, @source, @agreement_hash, @agreement_version)`);
    stmt.run({
      id: row.id,
      partner_name: row.partner_name,
      partner_email: row.partner_email,
      stripe_account_id: row.stripe_account_id,
      onboarding_url: row.onboarding_url,
      iban: row.iban,
      vat_number: row.vat_number,
      agreed: row.agreed ? 1 : 0,
      ip: row.ip,
      timestamp: row.timestamp,
      source: row.source,
      agreement_hash: row.agreement_hash,
      agreement_version: row.agreement_version
    });
    db.close();
    return id;
  }
}

async function listPartnerAgreements(limit = 500, offset = 0) {
  if (hasPostgres()) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await ensurePgTable(client);
    const { rows } = await client.query('SELECT * FROM partner_agreements ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [limit, offset]);
    await client.end();
    return rows;
  } else {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
    ensureSqliteTable(db);
    const rows = db.prepare('SELECT * FROM partner_agreements ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
    db.close();
    // normalize booleans
    return rows.map(r => ({ ...r, agreed: !!r.agreed }));
  }
}

// Agreement: read from public/partner-agreement.html and compute version + sha256
const AGREEMENT_PATH = path.join(__dirname, '..', 'public', 'partner-agreement.html');
function readAgreementText() {
  try {
    return fs.readFileSync(AGREEMENT_PATH, 'utf8');
  } catch (e) {
    return '';
  }
}

function getAgreementInfo() {
  const text = readAgreementText();
  const sha256 = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  // Try to extract version marker like <!-- AGREEMENT_VERSION: 2025-10-23 v1 -->
  let version = 'v1';
  const m = text.match(/AGREEMENT_VERSION:\s*([^\-\->]+)/i);
  if (m && m[1]) version = m[1].trim();
  return { version, sha256, textLength: text.length };
}

function absoluteUrl(req, pathname) {
  // If a forced base is configured, prefer that (helps when running locally with live-mode which requires HTTPS)
  if (CONNECT_CALLBACK_BASE) {
    try { return new URL(pathname, CONNECT_CALLBACK_BASE).toString(); } catch (_) { return `${CONNECT_CALLBACK_BASE}${pathname}`; }
  }
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}${pathname}`;
}

// 1) Stripe Connect: create onboarding link
router.get('/connect-link', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server' });
  try {
    const email = (req.query.email || '').toString().trim() || undefined;
    const type = (process.env.PARTNER_ACCOUNT_TYPE || 'express').toLowerCase(); // express|standard

    // Create a Connect account (default: express)
    const account = await stripe.accounts.create({ type: type === 'standard' ? 'standard' : 'express', email });

    const returnUrl = absoluteUrl(req, `/api/partners/connect-callback?account=${encodeURIComponent(account.id)}`);
    const refreshUrl = absoluteUrl(req, `/api/partners/connect-callback?refresh=1&account=${encodeURIComponent(account.id)}`);

  let url;
    if (type === 'standard') {
      // Standard: OAuth link
      // Note: In production, you'd use the Connect OAuth flow. Here we return dashboard login link as a convenience.
      const link = await stripe.accounts.createLoginLink(account.id);
      url = link.url;
    } else {
      // Express: Account Link onboarding
      const link = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding'
      });
      url = link.url;
    }
    try { console.log('partners/connect-link created', { accountId: account.id, returnUrl, refreshUrl, url }); } catch(_) {}

    // Persist a record for audit: generated onboarding link (not yet agreed)
    const info = getAgreementInfo();
    try {
      await insertPartnerAgreement({
        partner_email: email || null,
        stripe_account_id: account.id,
        onboarding_url: url,
        agreed: false,
        source: 'connect_link',
        agreement_hash: info.sha256,
        agreement_version: info.version
      });
    } catch (_) { /* non-fatal */ }

    return res.json({ ok: true, accountId: account.id, url });
  } catch (e) {
    console.error('partners/connect-link error', e && e.message ? e.message : e);
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to create Connect link' });
  }
});

// Backwards compatibility: legacy endpoint expected by older UIs
// Accept POST to /api/partners/create-stripe-link and return { url, accountId }
router.post('/create-stripe-link', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server' });
  try {
    const email = (req.body && req.body.email || '').toString().trim() || undefined;
    const type = (process.env.PARTNER_ACCOUNT_TYPE || 'express').toLowerCase();
    const account = await stripe.accounts.create({ type: type === 'standard' ? 'standard' : 'express', email });
    const returnUrl = absoluteUrl(req, `/api/partners/connect-callback?account=${encodeURIComponent(account.id)}`);
    const refreshUrl = absoluteUrl(req, `/api/partners/connect-callback?refresh=1&account=${encodeURIComponent(account.id)}`);
    let url;
    if (type === 'standard') {
      const link = await stripe.accounts.createLoginLink(account.id);
      url = link.url;
    } else {
      const link = await stripe.accountLinks.create({ account: account.id, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding' });
      url = link.url;
    }
    try { console.log('partners/create-stripe-link created', { accountId: account.id, returnUrl, refreshUrl, url }); } catch(_) {}
    try {
      const info = getAgreementInfo();
      await insertPartnerAgreement({ partner_email: email || null, stripe_account_id: account.id, onboarding_url: url, agreed: false, source: 'create_stripe_link', agreement_hash: info.sha256, agreement_version: info.version });
    } catch(_) {}
    return res.json({ ok: true, accountId: account.id, url });
  } catch (e) {
    console.error('partners/create-stripe-link error', e && e.message ? e.message : e);
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed to create Connect link' });
  }
});

// 2) Stripe Connect callback (handle redirect after onboarding)
async function handleConnectCallback(req, res) {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server' });
  try {
    const accountId = (req.query.account || req.body && req.body.account || '').toString();
    if (!accountId) return res.status(400).json({ error: 'Missing account id' });
    const acct = await stripe.accounts.retrieve(accountId);
    const partner_email = acct.email || (acct.individual && acct.individual.email) || null;
    const partner_name = (acct.business_profile && acct.business_profile.name) || (acct.company && acct.company.name) || (acct.individual && `${acct.individual.first_name || ''} ${acct.individual.last_name || ''}`.trim()) || null;
    const info = getAgreementInfo();
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    await insertPartnerAgreement({
      partner_name,
      partner_email,
      stripe_account_id: accountId,
      agreed: true,
      ip,
      source: 'stripe_connect',
      agreement_hash: info.sha256,
      agreement_version: info.version
    });

    return res.json({ ok: true, accountId, partner_name, partner_email, agreement_hash: info.sha256, agreement_version: info.version });
  } catch (e) {
    console.error('partners/connect-callback error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to finalize onboarding' });
  }
}

router.get('/connect-callback', handleConnectCallback);
router.post('/connect-callback', handleConnectCallback);

// 3) Manual onboarding form (HTML)
router.get('/partner-manual-onboarding', (req, res) => {
  const info = getAgreementInfo();
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Greekaway Partner Manual Onboarding</title>
  <style>body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;line-height:1.4;padding:24px;max-width:760px;margin:0 auto}label{display:block;margin:12px 0 4px}input[type=text],input[type=email]{width:100%;padding:10px;border:1px solid #ccc;border-radius:6px}button{background:#0a7; color:#fff; padding:10px 16px; border:0; border-radius:6px; cursor:pointer}button:hover{background:#096} .agree{display:flex;align-items:center;gap:.5rem;margin-top:12px}</style>
</head>
<body>
  <h1>Greekaway Partner Onboarding</h1>
  <p>Please fill in your details. By submitting, you agree to the Greekaway Partner Agreement.</p>
  <form method="POST" action="/api/partners/partner-manual-submit">
    <label for="name">Name / Business Name</label>
    <input id="name" name="name" type="text" required>

    <label for="email">Email</label>
    <input id="email" name="email" type="email" required>

    <label for="iban">IBAN</label>
    <input id="iban" name="iban" type="text" required>

    <label for="vat">VAT Number (ΑΦΜ)</label>
    <input id="vat" name="vat" type="text" required>

    <div class="agree">
      <input id="agree" name="agree" type="checkbox" value="1" required>
      <label for="agree">I accept the <a href="/partner-agreement" target="_blank" rel="noopener">Greekaway Partner Agreement</a></label>
    </div>

    <input type="hidden" name="agreement_version" value="${String(info.version)}">
    <input type="hidden" name="agreement_hash" value="${String(info.sha256)}">

    <p><small>Agreement version: ${info.version} • hash: ${info.sha256.slice(0,12)}…</small></p>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// 4) Manual onboarding submit (store to partner_agreements)
router.post('/partner-manual-submit', async (req, res) => {
  try {
    const name = (req.body.name || '').toString().trim();
    const email = (req.body.email || '').toString().trim();
    const iban = (req.body.iban || '').toString().trim();
    const vat = (req.body.vat || '').toString().trim();
    const agree = String(req.body.agree || '') === '1' || String(req.body.agree || '').toLowerCase() === 'on';
    if (!name || !email || !iban || !vat || !agree) {
      return res.status(400).json({ error: 'Missing required fields or agreement not accepted.' });
    }
    const info = getAgreementInfo();
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

    await insertPartnerAgreement({
      partner_name: name,
      partner_email: email,
      iban,
      vat_number: vat,
      agreed: true,
      ip,
      source: 'manual',
      agreement_hash: (req.body.agreement_hash || info.sha256),
      agreement_version: (req.body.agreement_version || info.version)
    });

    return res.json({ ok: true, partner_name: name, partner_email: email, agreement_version: info.version, agreement_hash: info.sha256 });
  } catch (e) {
    console.error('partners/manual-submit error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to store partner agreement' });
  }
});

// 5) Legal: expose agreement hash/version for verification
router.get('/agreement', (req, res) => {
  const info = getAgreementInfo();
  res.json({ version: info.version, sha256: info.sha256, length: info.textLength });
});

// 6) Admin: list partner records
router.get('/list', async (req, res) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).send('Forbidden');
  }
  try {
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '500', 10) || 500));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    const rows = await listPartnerAgreements(limit, offset);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

// -------------- PAYOUTS + ADMIN BOOKING EXTENSIONS --------------

// Utilities: resolve partner by booking or trip
function resolvePartnerForTrip(tripId) {
  try {
    const db = getDb();
    const map = db.prepare('SELECT partner_id, share_percent FROM partner_mappings WHERE trip_id = ?').get(tripId || '');
    if (!map || !map.partner_id) {
      db.close();
      return null;
    }
    const p = db.prepare('SELECT * FROM partner_agreements WHERE id = ?').get(map.partner_id);
    db.close();
    if (!p) return null;
    return { partner: p, share_percent: typeof map.share_percent === 'number' ? map.share_percent : 80 };
  } catch (_) { return null; }
}

function getBookingById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  db.close();
  return row;
}

function updateBookingExtended(id, fields) {
  const keys = Object.keys(fields || {});
  if (!keys.length) return;
  const db = getDb();
  const now = new Date().toISOString();
  const sets = keys.map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE bookings SET ${sets}, updated_at = @updated_at WHERE id = @id`);
  stmt.run({ ...fields, updated_at: now, id });
  db.close();
}

// Compute partner share and commission by amount and share_percent
function computeSplit(amount_cents, share_percent) {
  const sp = Math.max(0, Math.min(100, parseInt(share_percent || 80, 10)));
  const partner_share = Math.round((amount_cents || 0) * sp / 100);
  const commission = (amount_cents || 0) - partner_share;
  return { partner_share_cents: partner_share, commission_cents: commission };
}

// Shared helpers for amount computation
function safeInt(x, d = 0) { const n = parseInt(x, 10); return Number.isFinite(n) ? n : d; }
function computeServerAmountCents(tripId, vehType, seatsCount) {
  try {
    const s = Math.max(1, safeInt(seatsCount, 1));
    // Dynamic pricing for Acropolis by vehicle type (server mirror of frontend map)
    const map = { van: 10, bus: 5, mercedes: 20 };
    if (tripId === 'acropolis' && map.hasOwnProperty(String(vehType || '').toLowerCase())) {
      // For Acropolis vehicle overrides we now treat map values as FINAL TOTAL price (not per seat)
      // to avoid double multiplication when frontend has already shown the final amount.
      const finalEur = map[String(vehType).toLowerCase()];
      return Math.round(finalEur * 100);
    }
    // Generic: read trip JSON price_cents and multiply by seats
    if (tripId) {
      const p = path.join(__dirname, '..', 'public', 'data', 'trips', `${tripId}.json`);
      try {
        if (fs.existsSync(p)) {
          const trip = JSON.parse(fs.readFileSync(p, 'utf8'));
          const base = safeInt(trip && trip.price_cents, 0);
          if (base > 0) return base * s;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return 0;
}

// Create PaymentIntent that supports Stripe Connect transfer_data when partner account exists
router.post('/create-payment-intent', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server' });
  // Safety guard: prevent accidental live-key usage during local/dev runs
  try {
    const isDev = (process.env.NODE_ENV !== 'production');
    const allowLive = String(process.env.ALLOW_LIVE_STRIPE_IN_DEV || '').trim() === '1';
    const looksLive = /^sk_live_/.test(STRIPE_SECRET || '');
    if (isDev && looksLive && !allowLive) {
      return res.status(400).json({ error: 'Live Stripe key detected in development. Use test keys (sk_test...) or set ALLOW_LIVE_STRIPE_IN_DEV=1 to override.' });
    }
  } catch(_) {}
  try {
    try {
      console.log('[pi:req]', {
        ts: new Date().toISOString(),
        headers: {
          'content-type': req.headers['content-type'],
          'idempotency-key': req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key']
        },
        body: req.body || null
      });
    } catch(_) {}
    // Accept both camelCase and snake_case vehicle type from client
    const { amount, price_cents, currency, tripId: clientTripId, trip_id: clientTripIdAlt, duration, vehicleType, vehicle_type, customerEmail, seats } = req.body || {};
    const vehTypeInput = vehicleType || vehicle_type || null;
    const booking_id = (req.body && req.body.booking_id) || null;
    let meta = (req.body && req.body.metadata) || {};
    if (booking_id) meta = { ...meta, booking_id };

    // UI-provided amount (untrusted / informational)
    const clientSubmittedCents = parseInt(price_cents || amount || 0, 10) || 0;
    try {
      console.log('[pi:diag] clientSubmittedCents', clientSubmittedCents, 'raw', { amount, price_cents, currency, seats, vehicleType: vehTypeInput });
      if (!clientSubmittedCents) console.warn('[pi:diag] client amount missing/zero');
    } catch(_){ }

    // Keep trip id for metadata & partner resolution (do not alter amount)
    let tripId = clientTripId || clientTripIdAlt || null;
    if (booking_id && tripId === null) {
      try { const b = getBookingById(booking_id); if (b) tripId = b.trip_id || tripId; } catch(_) {}
    }

    // Compute server-side amount for diagnostics; prefer client authoritative price from state
    const serverComputedCents = computeServerAmountCents(tripId, vehTypeInput, seats);
    try { console.log('[pi:diag] serverComputedCents', serverComputedCents, { tripId, vehicleType: vehTypeInput, seats }); } catch(_){ }
    let finalAmountCents = (clientSubmittedCents > 0) ? clientSubmittedCents : serverComputedCents;
    let pricingSource = (clientSubmittedCents > 0) ? 'client' : 'server_fallback';
    if (clientSubmittedCents > 0 && serverComputedCents > 0 && clientSubmittedCents !== serverComputedCents) {
      pricingSource = 'client_overrode_server_mismatch';
    }
    if (!finalAmountCents || finalAmountCents <= 0) {
      try { console.error('[pi:error] invalid amount', { clientSubmittedCents, serverComputedCents, tripId, vehTypeInput, seats }); } catch(_){ }
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // enrich metadata for traceability and audit
    meta = {
      ...meta,
      trip_id: tripId,
      requested_price_cents: finalAmountCents,
      client_submitted_price_cents: (clientSubmittedCents || null),
      server_computed_price_cents: (serverComputedCents || null),
      duration: (duration||null),
      vehicle_type: (vehTypeInput||null),
      seats: (safeInt(seats, null))
    };
    // Add pricing provenance + mismatch info for audit
    meta.pricing_source = pricingSource;
    if (clientSubmittedCents > 0 && serverComputedCents > 0 && clientSubmittedCents !== serverComputedCents) {
      meta.client_server_mismatch = Math.abs(clientSubmittedCents - serverComputedCents);
    }

    // read partner mapping and compute split from finalAmountCents
    const mapping = tripId ? resolvePartnerForTrip(tripId) : null;
    const share_percent = (mapping && mapping.share_percent) || (parseInt(process.env.DEFAULT_PARTNER_SHARE || '80',10) || 80);
    const split = computeSplit(finalAmountCents, share_percent);

    // Build params; only include receipt_email if non-empty trimmed
    const rawEmail = ((customerEmail || req.body.email || '') + '').trim();
    if (!rawEmail) {
      try { console.warn('[pi:reject] missing email – rejecting before PaymentIntent'); } catch(_){}
      return res.status(400).json({ error: 'email_required' });
    }
    const params = {
      amount: finalAmountCents,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: meta
    };
    // rawEmail guaranteed non-empty here
    params.receipt_email = rawEmail;
    // If partner has a Connect account, set transfer_data and fee
    if (mapping && mapping.partner && mapping.partner.stripe_account_id) {
      params.transfer_data = { destination: mapping.partner.stripe_account_id };
      params.application_fee_amount = split.commission_cents;
    }

    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key']) || `gw_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    let pi;
    try {
      pi = await stripe.paymentIntents.create(params, { idempotencyKey });
    } catch (stripeErr) {
      const msg = stripeErr && stripeErr.message ? stripeErr.message : String(stripeErr);
      try {
        console.error('[pi:error] stripe.paymentIntents.create failed', {
          message: msg,
          code: stripeErr && stripeErr.code,
          type: stripeErr && stripeErr.type,
          param: stripeErr && stripeErr.param,
          raw: stripeErr && stripeErr.raw ? stripeErr.raw : undefined
        });
      } catch(_){ }
      // Immediate failure response to client (avoid masking with generic catch below)
      return res.status(500).json({ error: 'Failed to create payment intent', code: stripeErr && stripeErr.code ? stripeErr.code : 'pi_create_error', message: msg });
    }
    try {
      console.log('[payments] create-payment-intent summary', {
        booking_id,
        trip_id: tripId || null,
        vehicle_type: vehTypeInput || null,
        seats: safeInt(seats, null) || null,
        final_amount_cents: finalAmountCents,
        pricing_source,
        server_computed_cents: serverComputedCents || null,
        client_submitted_cents: clientSubmittedCents || null,
        payment_intent_id: pi.id,
        status: pi.status
      });
    } catch(_){ }
    // Optional debug logging (enable by setting PAYMENTS_DEBUG=1)
    if (process.env.PAYMENTS_DEBUG) {
      try {
        console.log('[payments:create-payment-intent]', JSON.stringify({
          vehicle_type: vehTypeInput || null,
          price_cents_client: clientSubmittedCents || null,
          amount_sent_to_stripe: finalAmountCents,
          pricing_source,
          server_computed_cents: serverComputedCents || null,
          payment_intent_id: pi.id,
          payment_intent_status: pi.status,
          trip_id: tripId || null,
          seats: safeInt(seats, null) || null,
          mismatch: (clientSubmittedCents > 0 && serverComputedCents > 0 && clientSubmittedCents !== serverComputedCents) ? (clientSubmittedCents - serverComputedCents) : 0
        }));
      } catch(_) {}
    }

    // persist extended info on booking for admin dashboard
    if (booking_id) {
      updateBookingExtended(booking_id, {
        payment_intent_id: pi.id,
        payment_type: (mapping && mapping.partner && mapping.partner.stripe_account_id) ? 'stripe' : 'manual',
        partner_id: (mapping && mapping.partner && mapping.partner.id) || null,
        partner_share_cents: split.partner_share_cents,
        commission_cents: split.commission_cents,
        price_cents: finalAmountCents,
        currency: (currency || 'eur'),
        payout_status: (mapping && mapping.partner && mapping.partner.stripe_account_id) ? 'pending' : 'pending',
      });

      // If partner has no Stripe account, create/update a manual_payments row for admin tracking
      try {
        if (!(mapping && mapping.partner && mapping.partner.stripe_account_id)) {
          const db = getDb();
          // Fetch booking for extra fields (date, trip_id)
          const b = getBookingById(booking_id);
          const now = new Date().toISOString();
          // Optional: get trip title (fallback to trip_id)
          let trip_title = null;
          try {
            const tripData = require('../live/tripData');
            const trip = b && b.trip_id ? tripData.readTripJsonById(b.trip_id) : null;
            if (trip) {
              const t = tripData.getLocalized(trip.title || {}, 'el');
              trip_title = t || (trip.title && (trip.title.el || trip.title.en)) || null;
            }
          } catch(_) {}
          // Ensure manual_payments table exists (in case router was not loaded yet)
          try { db.exec(`CREATE TABLE IF NOT EXISTS manual_payments (
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
          )`); } catch(_) {}
          const exists = db.prepare('SELECT id FROM manual_payments WHERE booking_id = ?').get(booking_id);
          const id = exists && exists.id ? exists.id : ('mp_' + booking_id);
          const row = {
            id,
            booking_id: booking_id,
            partner_id: (mapping && mapping.partner && mapping.partner.id) || null,
            partner_name: (mapping && mapping.partner && mapping.partner.partner_name) || null,
            trip_id: b && b.trip_id || null,
            trip_title: trip_title || (b && b.trip_id) || null,
            date: b && b.date || new Date().toISOString().slice(0,10),
            amount_cents: split.partner_share_cents || 0,
            currency: currency || 'eur',
            iban: (mapping && mapping.partner && mapping.partner.iban) || '',
            status: 'pending',
            partner_balance_cents: split.partner_share_cents || 0,
            created_at: now,
            updated_at: now
          };
          if (exists && exists.id) {
            db.prepare(`UPDATE manual_payments SET partner_id=@partner_id, partner_name=@partner_name, trip_id=@trip_id, trip_title=@trip_title, date=@date, amount_cents=@amount_cents, currency=@currency, iban=@iban, status=@status, partner_balance_cents=@partner_balance_cents, updated_at=@updated_at WHERE id=@id`).run(row);
          } else {
            db.prepare(`INSERT INTO manual_payments (id, booking_id, partner_id, partner_name, trip_id, trip_title, date, amount_cents, currency, iban, status, partner_balance_cents, created_at, updated_at) VALUES (@id,@booking_id,@partner_id,@partner_name,@trip_id,@trip_title,@date,@amount_cents,@currency,@iban,@status,@partner_balance_cents,@created_at,@updated_at)`).run(row);
          }
          db.close();
          try {
            adminSse.broadcast({ type: 'manual_payment_upsert', item: row });
            try { console.log('manual-payments: upsert broadcast', row.id, row.booking_id || null); } catch(_) {}
          } catch(_) {}
        }
      } catch (e) {
        try { console.warn('partners: manual_payments insert failed', e && e.message ? e.message : e); } catch(_) {}
      }
    }

    return res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id, idempotencyKey, bookingId: booking_id || null, finalAmountCents });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    try { console.error('partners: create-payment-intent failed (catch-all)', msg); } catch(_){ }
    const code = (e && e.code) ? String(e.code) : 'pi_create_failed';
    return res.status(500).json({ error: 'Failed to create payment intent', code, message: msg });
  }
});

// Admin-only: diagnose amount computation without creating a PaymentIntent
router.post('/admin/payment-diagnose', (req, res) => {
  try {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    const { price_cents, amount, tripId, trip_id, vehicleType, seats } = req.body || {};
    const trip = tripId || trip_id || null;
    const clientSubmittedCents = parseInt(price_cents || amount || 0, 10) || 0;
    const serverComputedCents = computeServerAmountCents(trip, vehicleType, seats);
    const finalAmountCents = clientSubmittedCents > 0 ? clientSubmittedCents : serverComputedCents;
    const mapping = trip ? resolvePartnerForTrip(trip) : null;
    const share_percent = (mapping && mapping.share_percent) || (parseInt(process.env.DEFAULT_PARTNER_SHARE || '80',10) || 80);
    const split = computeSplit(finalAmountCents, share_percent);
    return res.json({
      trip_id: trip,
      vehicle_type: vehicleType || null,
      seats: safeInt(seats, null),
      client_submitted_price_cents: clientSubmittedCents || null,
      server_computed_price_cents: serverComputedCents || null,
      final_amount_cents: finalAmountCents,
      share_percent,
      partner_share_cents: split.partner_share_cents,
      commission_cents: split.commission_cents
    });
  } catch (e) {
    return res.status(500).json({ error: 'diagnose_failed' });
  }
});

// Admin: retrieve a PaymentIntent by id (diagnostics: status + last_payment_error + charges summary)
router.get('/admin/payment-intent/:id', async (req, res) => {
  try {
    if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    if (!stripe) return res.status(500).json({ error: 'stripe-not-configured' });
    const id = (req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'missing-id' });
    const pi = await stripe.paymentIntents.retrieve(id);
    const out = {
      ok: true,
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      currency: pi.currency,
      application_fee_amount: pi.application_fee_amount || null,
      transfer_data: pi.transfer_data || null,
      payment_method_types: pi.payment_method_types || [],
      last_payment_error: pi.last_payment_error ? {
        code: pi.last_payment_error.code || null,
        message: pi.last_payment_error.message || null,
        type: pi.last_payment_error.type || null,
        decline_code: pi.last_payment_error.decline_code || null
      } : null,
      charges: (pi.charges && Array.isArray(pi.charges.data)) ? pi.charges.data.map(c => ({
        id: c.id,
        status: c.status,
        paid: !!c.paid,
        amount: c.amount,
        currency: c.currency,
        failure_code: c.failure_code || null,
        failure_message: c.failure_message || null,
        payment_method: c.payment_method || null
      })) : []
    };
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: 'retrieve_failed', message: e && e.message ? e.message : String(e) });
  }
});

// Removed legacy debug pricing endpoint to prevent any server-side amount overrides.

// Background payout scheduler: periodically attempt payouts for manual partners when funds available
const adminSse = require('../services/adminSse');
async function tryPayoutForBooking(bookingId) {
  try {
    if (!stripe) return { ok: false, reason: 'stripe-not-configured' };
    const db = getDb();
    const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!b) { db.close(); return { ok: false, reason: 'not-found' }; }
    if (b.payout_status && b.payout_status !== 'pending') { db.close(); return { ok: true, skipped: true }; }
    const mapping = b.trip_id ? resolvePartnerForTrip(b.trip_id) : null;
    if (!mapping || !mapping.partner) { db.close(); return { ok: false, reason: 'no-partner' }; }
    const partner = mapping.partner;
    const amount = parseInt(b.partner_share_cents||0,10) || 0;
    const currency = (b.currency || 'eur');
    if (amount <= 0) { db.close(); return { ok: false, reason: 'zero-amount' }; }

    // If booking used transfer_data, no extra payout is needed; mark as sent on webhook.
    if (b.payment_type === 'stripe' && partner.stripe_account_id) {
      db.close();
      return { ok: true, skipped: true };
    }

    // Ensure partner has a Connect account if we intend to transfer funds automatically
    let accountId = partner.stripe_account_id || null;
    if (!accountId && partner.iban) {
      try {
        const acct = await stripe.accounts.create({ type: 'express', email: partner.partner_email || undefined });
        accountId = acct.id;
        // Attach external bank account using stored IBAN (may require additional KYC in real life)
        try { await stripe.accounts.createExternalAccount(accountId, { external_account: { object: 'bank_account', country: 'GR', currency: 'eur', account_number: partner.iban } }); } catch (_e) {}
        // Persist back to partner_agreements
        const upd = getDb();
        upd.prepare('UPDATE partner_agreements SET stripe_account_id = ? WHERE id = ?').run(accountId, partner.id);
        upd.close();
      } catch (e) {
        db.close();
        return { ok: false, reason: 'connect-create-failed', error: e && e.message ? e.message : e };
      }
    }
    if (!accountId) { db.close(); return { ok: false, reason: 'no-destination' }; }

    // Check platform balance (available) best-effort; skip if insufficient
    try {
      const bal = await stripe.balance.retrieve();
      const availEur = (bal.available || []).find(x => x.currency === (currency||'eur'));
      if (availEur && typeof availEur.amount === 'number' && availEur.amount < amount) {
        db.close();
        return { ok: false, reason: 'insufficient-balance' };
      }
    } catch (_) { /* continue anyway */ }

    // Transfer from platform to connected account
    const transfer = await stripe.transfers.create({ amount: amount, currency: currency || 'eur', destination: accountId, description: `Greekaway booking ${b.id}` });
    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO payouts (id, booking_id, partner_id, amount_cents, currency, type, status, provider_id, created_at, updated_at, payout_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(transfer.id, b.id, partner.id, amount, currency || 'eur', 'manual', 'sent', transfer.id, now, now, now);
    db.prepare('UPDATE bookings SET payout_status = ?, payout_date = ?, updated_at = ? WHERE id = ?').run('sent', now, now, b.id);
  db.close();
  // Notify SSE listeners
  try { adminSse.broadcast({ type: 'payout_sent', booking_id: b.id, payout_date: now, status: 'sent' }); } catch(_) {}
    return { ok: true, transfer_id: transfer.id };
  } catch (e) {
    try {
      const now = new Date().toISOString();
      const db = getDb();
      db.prepare('INSERT OR REPLACE INTO payouts (id, booking_id, partner_id, amount_cents, currency, type, status, failure_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(crypto.randomUUID(), String(bookingId), null, null, 'eur', 'manual', 'failed', (e && e.message) || 'error', now, now);
      db.prepare('UPDATE bookings SET payout_status = ?, updated_at = ? WHERE id = ?').run('failed', now, String(bookingId));
  db.close();
  try { adminSse.broadcast({ type: 'payout_failed', booking_id: String(bookingId), status: 'failed' }); } catch(_) {}
    } catch(_) {}
    return { ok: false, error: e && e.message ? e.message : e };
  }
}

// SSE endpoint for real-time admin updates (payout status changes)
router.get('/admin/stream', (req, res) => {
  // Allow Basic auth via header or via ?auth=base64(user:pass) for EventSource
  let authed = checkAdminAuth(req);
  if (!authed) {
    const q = String(req.query && req.query.auth || '').trim();
    if (q) {
      try {
        const creds = Buffer.from(q, 'base64').toString('utf8');
        const [u,p] = creds.split(':');
        authed = (u === ADMIN_USER && p === ADMIN_PASS);
      } catch (_) {}
    }
  }
  if (!authed) {
    return res.status(403).end();
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  res.write('\n');
  adminSse.addClient(res);
  req.on('close', () => { adminSse.removeClient(res); try { res.end(); } catch(_){} });
});

// Admin: bookings listing with new columns and filters
router.get('/admin/bookings', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const db = getDb();
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '500', 10) || 500));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    const payment_type = req.query.payment_type || null;
    const payout_status = req.query.payout_status || null;
    const partner = req.query.partner || null; // partner id or name substring
    const where = [];
    const params = [];
    if (payment_type) { where.push('b.payment_type = ?'); params.push(payment_type); }
    if (payout_status) { where.push('b.payout_status = ?'); params.push(payout_status); }
    if (partner) { where.push('(pa.partner_name LIKE ? OR b.partner_id = ?)'); params.push(`%${partner}%`, partner); }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const sql = `SELECT b.*, pa.partner_name, pa.partner_email FROM bookings b LEFT JOIN partner_agreements pa ON pa.id = b.partner_id ${whereSql} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`;
    const rows = db.prepare(sql).all(...params, limit, offset);
    db.close();
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: CSV export for bookings with new columns
router.get('/admin/bookings.csv', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const db = getDb();
    const payment_type = req.query.payment_type || null;
    const payout_status = req.query.payout_status || null;
    const partner = req.query.partner || null;
    const where = [];
    const params = [];
    if (payment_type) { where.push('b.payment_type = ?'); params.push(payment_type); }
    if (payout_status) { where.push('b.payout_status = ?'); params.push(payout_status); }
    if (partner) { where.push('(pa.partner_name LIKE ? OR b.partner_id = ?)'); params.push(`%${partner}%`, partner); }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const sql = `SELECT b.*, pa.partner_name, pa.partner_email FROM bookings b LEFT JOIN partner_agreements pa ON pa.id = b.partner_id ${whereSql} ORDER BY b.created_at DESC`;
    const rows = db.prepare(sql).all(...params);
    db.close();

    const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const esc = (v) => {
      if (v == null) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      return '"' + String(v).replace(/"/g, '""') + '"';
    };
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
    res.setHeader('Content-Disposition', `attachment; filename="bookings_extended_${ts}.csv"`);
    res.write(keys.join(',') + '\n');
    for (const r of rows) {
      res.write(keys.map(k => esc(r[k])).join(',') + '\n');
    }
    res.end();
  } catch (e) { return res.status(500).send('Server error'); }
});

// Admin: inline updates for mapping trip -> partner and share
router.post('/admin/mapping', (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const { trip_id, partner_id, share_percent } = req.body || {};
    if (!trip_id) return res.status(400).json({ error: 'Missing trip_id' });
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO partner_mappings (trip_id, partner_id, share_percent, updated_at) VALUES (?,?,?,?) ON CONFLICT(trip_id) DO UPDATE SET partner_id = excluded.partner_id, share_percent = excluded.share_percent, updated_at = excluded.updated_at').run(trip_id, partner_id || null, (parseInt(share_percent,10)||80), now);
    db.close();
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: trigger payout for a booking id (manual flow)
router.post('/admin/bookings/:id/payout', async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  const id = req.params.id;
  const out = await tryPayoutForBooking(id);
  return res.json(out);
});

// Lightweight poller to run payouts in the background every 2 minutes
setInterval(async () => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT id FROM bookings WHERE payout_status = ? LIMIT 20').all('pending');
    db.close();
    for (const r of rows) {
      try { await tryPayoutForBooking(r.id); } catch(_){}
    }
  } catch(_){}
}, 120000);
