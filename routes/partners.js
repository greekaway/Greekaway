const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Local .env (if present)
try { require('dotenv').config(); } catch (_) {}

const router = express.Router();
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Stripe (reuse env keys; do not create new)
const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || '').toString().trim().replace(/^['"]|['"]$/g, '');
let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = require('stripe')(STRIPE_SECRET); } catch (e) { console.warn('partners: stripe not initialized (missing dependency?)'); }
}

// Admin basic auth (align with server.js env)
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
}

function ensureSqliteTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS partner_agreements (
    id TEXT PRIMARY KEY,
    partner_name TEXT,
    partner_email TEXT,
    stripe_account_id TEXT,
    iban TEXT,
    vat_number TEXT,
    agreed INTEGER,
    ip TEXT,
    timestamp TEXT,
    source TEXT,
    agreement_hash TEXT,
    agreement_version TEXT
  )`);
}

async function insertPartnerAgreement(record) {
  const id = record.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id,
    partner_name: record.partner_name || null,
    partner_email: record.partner_email || null,
    stripe_account_id: record.stripe_account_id || null,
    iban: record.iban || null,
    vat_number: record.vat_number || null,
    agreed: !!record.agreed,
    ip: record.ip || null,
    timestamp: record.timestamp || now,
    source: record.source || null,
    agreement_hash: record.agreement_hash || null,
    agreement_version: record.agreement_version || null
  };

  if (hasPostgres()) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await ensurePgTable(client);
    await client.query(
      `INSERT INTO partner_agreements (id, partner_name, partner_email, stripe_account_id, iban, vat_number, agreed, ip, timestamp, source, agreement_hash, agreement_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.id, row.partner_name, row.partner_email, row.stripe_account_id, row.iban, row.vat_number, row.agreed, row.ip, row.timestamp, row.source, row.agreement_hash, row.agreement_version]
    );
    await client.end();
    return id;
  } else {
    // SQLite
    const Database = require('better-sqlite3');
    const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
    ensureSqliteTable(db);
    const stmt = db.prepare(`INSERT INTO partner_agreements (id, partner_name, partner_email, stripe_account_id, iban, vat_number, agreed, ip, timestamp, source, agreement_hash, agreement_version)
                             VALUES (@id, @partner_name, @partner_email, @stripe_account_id, @iban, @vat_number, @agreed, @ip, @timestamp, @source, @agreement_hash, @agreement_version)`);
    stmt.run({
      id: row.id,
      partner_name: row.partner_name,
      partner_email: row.partner_email,
      stripe_account_id: row.stripe_account_id,
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
    return res.json({ ok: true, accountId: account.id, url });
  } catch (e) {
    console.error('partners/connect-link error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Failed to create Connect link' });
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
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
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
