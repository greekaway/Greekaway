#!/usr/bin/env node
// Admin Functional Smoke Tests
// Scenarios covered:
// 1) Trip availability full-state via capacities and confirmed bookings
// 2) Payments CSV export (server-side) via /admin/payments.csv
// 3) Partner onboarding (approve) via manual submit and listing; reject via validation failure
// 4) Admin booking actions: cancel and refund endpoints update DB
// 5) Partners admin listing + mapping round-trip sanity

/* Usage:
   node tools/admin_functional_smoke.js
   - Spawns a dedicated test server on PORT=3101 with ADMIN_USER=admin / ADMIN_PASS=pass
   - Uses local SQLite DB at data/db.sqlite3
*/

try { require('dotenv').config(); } catch(_) {}
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const TEST_PORT = process.env.TEST_PORT || '3101';
let BASE = `http://127.0.0.1:${TEST_PORT}`;
const ADMIN_USER = process.env.TEST_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.TEST_ADMIN_PASS || 'pass';
const AUTH = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.sqlite3');

// Minimal fetch for Node 18+
const fetch = global.fetch || require('node-fetch');

async function waitForHealth(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: TEST_PORT, ADMIN_USER, ADMIN_PASS };
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let started = false;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/Server running at http:\/\/[^:]+:(\d+)/i);
      if (m && m[1]) {
        BASE = `http://127.0.0.1:${m[1]}`;
      }
      if (!started && /Server running/.test(s)) {
        started = true;
      }
      // Optional: write minimal log
      // process.stdout.write('[server] ' + s);
    });
    child.stderr.on('data', (d) => {
      // process.stderr.write('[server] ' + d.toString());
    });
    child.on('exit', (code) => {
      if (!started) reject(new Error('Server exited early: ' + code));
    });
    (async () => {
      const ok = await waitForHealth();
      if (!ok) {
        try { child.kill('SIGKILL'); } catch(_) {}
        return reject(new Error('Server did not become healthy in time'));
      }
      resolve(child);
    })();
  });
}

function openDb() {
  try { fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true }); } catch (_) {}
  return new Database(DB_PATH);
}

function isoToday() {
  return new Date().toISOString().slice(0,10);
}

async function testAvailabilityFull() {
  const trip = 'trip_test_full';
  const date = isoToday();
  const db = openDb();
  try {
    // Ensure tables exist
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      status TEXT,
      date TEXT,
      user_name TEXT,
      user_email TEXT,
      trip_id TEXT,
      seats INTEGER,
      price_cents INTEGER,
      currency TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS capacities (
      trip_id TEXT,
      date TEXT,
      capacity INTEGER,
      PRIMARY KEY(trip_id, date)
    )`);
    // Reset any prior rows for this trip/date
    db.prepare('DELETE FROM bookings WHERE trip_id = ? AND date = ?').run(trip, date);
    db.prepare('INSERT OR REPLACE INTO capacities (trip_id, date, capacity) VALUES (?,?,?)').run(trip, date, 2);
    const now = new Date().toISOString();
    const ins = db.prepare('INSERT INTO bookings (id,status,date,user_name,user_email,trip_id,seats,price_cents,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    ins.run('bk_full_1', 'confirmed', date, 'A', 'a@example.com', trip, 1, 10000, 'eur', now, now);
    ins.run('bk_full_2', 'confirmed', date, 'B', 'b@example.com', trip, 1, 10000, 'eur', now, now);
  } finally { db.close(); }

  const r = await fetch(`${BASE}/api/availability?trip_id=${encodeURIComponent(trip)}&date=${encodeURIComponent(date)}`);
  if (!r.ok) throw new Error(`availability HTTP ${r.status}`);
  const j = await r.json();
  if (j.capacity !== 2 || j.taken !== 2) throw new Error(`expected full capacity=2 taken=2, got ${JSON.stringify(j)}`);
}

async function testPaymentsCsv() {
  const r = await fetch(`${BASE}/admin/payments.csv`, { headers: { Authorization: AUTH } });
  if (r.status === 401) throw new Error('Unauthorized to payments.csv (check ADMIN env)');
  if (!r.ok) throw new Error('payments.csv HTTP ' + r.status);
  const ct = (r.headers.get('Content-Type') || '').toLowerCase();
  if (!ct.includes('text/csv')) throw new Error('unexpected content-type: ' + ct);
  const text = await r.text();
  if (!text || !/\n/.test(text)) throw new Error('payments.csv looks empty');
}

async function testPartnerManualApproveReject() {
  // Approve via manual submit
  const name = 'Test Partner';
  const email = `partner_${Date.now()}@example.com`;
  const body = new URLSearchParams({ name, email, iban: 'GR1601101250000000012300695', vat: 'EL123456789', agree: '1' });
  const r = await fetch(`${BASE}/api/partners/partner-manual-submit`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error('manual submit failed: HTTP ' + r.status);
  const j = await r.json().catch(() => ({}));
  if (!j || !j.ok) throw new Error('manual submit did not return ok');
  // List and verify
  const l = await fetch(`${BASE}/api/partners/list`, { headers: { Authorization: AUTH } });
  if (!l.ok) throw new Error('partners list HTTP ' + l.status);
  const arr = await l.json();
  const row = (arr || []).find(x => x && x.partner_email === email);
  if (!row || !row.agreed) throw new Error('partners list missing approved partner');

  // Reject path: missing agree -> 400 and no insert
  const badEmail = `partner_bad_${Date.now()}@example.com`;
  const bad = await fetch(`${BASE}/api/partners/partner-manual-submit`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name, email: badEmail, iban: 'GR1100000000000000000000000', vat: 'EL987654321' }) });
  if (bad.status !== 400) throw new Error('expected 400 for missing agree, got ' + bad.status);
  const l2 = await fetch(`${BASE}/api/partners/list`, { headers: { Authorization: AUTH } });
  const arr2 = await l2.json();
  const row2 = (arr2 || []).find(x => x && x.partner_email === badEmail);
  if (row2) throw new Error('unexpected partner row created without agreement');
}

async function testAdminBookingActions() {
  const db = openDb();
  const now = new Date().toISOString();
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      status TEXT,
      date TEXT,
      user_name TEXT,
      user_email TEXT,
      trip_id TEXT,
      seats INTEGER,
      price_cents INTEGER,
      currency TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);
    db.prepare('INSERT OR REPLACE INTO bookings (id,status,date,user_name,user_email,trip_id,seats,price_cents,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('bk_cancel_1','confirmed',isoToday(),'X','x@example.com','tripX',1,1000,'eur',now,now);
    db.prepare('INSERT OR REPLACE INTO bookings (id,status,date,user_name,user_email,trip_id,seats,price_cents,currency,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run('bk_refund_1','confirmed',isoToday(),'Y','y@example.com','tripY',1,2000,'eur',now,now);
  } finally { db.close(); }

  // Cancel
  const c = await fetch(`${BASE}/admin/bookings/bk_cancel_1/cancel`, { method: 'POST', headers: { Authorization: AUTH } });
  if (!c.ok) throw new Error('cancel HTTP ' + c.status);
  // Verify
  const r1 = await fetch(`${BASE}/api/bookings/bk_cancel_1`);
  const j1 = await r1.json();
  if ((j1 && j1.status) !== 'canceled') throw new Error('cancel did not update status');

  // Refund
  const rf = await fetch(`${BASE}/admin/bookings/bk_refund_1/refund`, { method: 'POST', headers: { Authorization: AUTH } });
  if (!rf.ok) throw new Error('refund HTTP ' + rf.status);
  const r2 = await fetch(`${BASE}/api/bookings/bk_refund_1`);
  const j2 = await r2.json();
  if ((j2 && j2.status) !== 'refunded') throw new Error('refund did not update status');
}

async function testPartnersAdminListingAndMapping() {
  // Seed a partner agreement and a booking, then set mapping and verify listing includes partner fields
  const db = openDb();
  const now = new Date().toISOString();
  const bookingId = 'bk_partner_map_1';
  const tripId = 'trip_map_demo';
  let partnerId = 'pt_demo_1';
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      status TEXT,
      date TEXT,
      user_name TEXT,
      user_email TEXT,
      trip_id TEXT,
      seats INTEGER,
      price_cents INTEGER,
      currency TEXT,
      payment_type TEXT,
      partner_id TEXT,
      partner_share_cents INTEGER,
      commission_cents INTEGER,
      payout_status TEXT,
      created_at TEXT,
      updated_at TEXT
    )`);
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
    db.exec(`CREATE TABLE IF NOT EXISTS partner_mappings (
      trip_id TEXT PRIMARY KEY,
      partner_id TEXT,
      share_percent INTEGER DEFAULT 80,
      updated_at TEXT
    )`);
    // Upsert partner
    db.prepare('INSERT OR REPLACE INTO partner_agreements (id,partner_name,partner_email,agreed,timestamp) VALUES (?,?,?,?,?)')
      .run(partnerId, 'Partner Demo', 'partner@demo.local', 1, now);
    // Map trip -> partner
    db.prepare('INSERT OR REPLACE INTO partner_mappings (trip_id,partner_id,share_percent,updated_at) VALUES (?,?,?,?)')
      .run(tripId, partnerId, 80, now);
    // Seed booking with calculated split
    const price = 32000; const partnerShare = Math.round(price * 0.8); const commission = price - partnerShare;
    db.prepare('INSERT OR REPLACE INTO bookings (id,status,date,user_name,user_email,trip_id,seats,price_cents,currency,payment_type,partner_id,partner_share_cents,commission_cents,payout_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(bookingId,'confirmed',isoToday(),'Zed','zed@demo.local',tripId,2,price,'eur','manual',partnerId,partnerShare,commission,'pending',now,now);
  } finally { db.close(); }

  // Verify listing endpoint includes partner fields for the booking
  const res = await fetch(`${BASE}/api/partners/admin/bookings?limit=50&offset=0`, { headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error('partners admin bookings HTTP ' + res.status);
  const arr = await res.json();
  const row = (arr || []).find(r => r && r.id === bookingId);
  if (!row) throw new Error('booking not in admin listing');
  if (!row.partner_name || !row.partner_id) throw new Error('partner fields missing from admin listing');
}

async function testPayoutEndpointGracefulWithoutStripe() {
  // Use the booking seeded in mapping test if it exists; otherwise seed a minimal one
  const bookingId = 'bk_partner_map_1';
  const res = await fetch(`${BASE}/api/partners/admin/bookings/${encodeURIComponent(bookingId)}/payout`, {
    method: 'POST',
    headers: { Authorization: AUTH }
  });
  if (!res.ok) throw new Error('payout HTTP ' + res.status);
  const j = await res.json().catch(() => null);
  if (!j || typeof j !== 'object') throw new Error('payout did not return JSON');
  // Accept either ok:true (Stripe success) or ok:false with any clear reason/skipped indicator (graceful failure paths)
  if (!j.ok && !j.reason && !j.skipped) {
    throw new Error('unexpected payout response: ' + JSON.stringify(j));
  }
}

async function main() {
  console.log('Starting dedicated test server on PORT=' + TEST_PORT + ' with basic auth...');
  const child = await startServer();
  let failed = false;
  const results = [];
  async function run(name, fn) {
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now() - start;
      console.log('PASS - ' + name + ` (${ms}ms)`);
      results.push({ name, ok: true, ms });
    } catch (e) {
      const ms = Date.now() - start;
      console.error('FAIL - ' + name + ` (${ms}ms) ->`, e && e.message ? e.message : e);
      results.push({ name, ok: false, error: e && e.message ? e.message : String(e), ms });
      failed = true;
    }
  }

  // Execute scenarios
  await run('Availability full-state reflects capacity', testAvailabilityFull);
  await run('Payments CSV export works', testPaymentsCsv);
  await run('Partner manual approve + reject flow', testPartnerManualApproveReject);
  await run('Admin booking actions (cancel/refund)', testAdminBookingActions);
  await run('Partners admin bookings listing + mapping', testPartnersAdminListingAndMapping);
  await run('Partner payout endpoint (graceful without Stripe)', testPayoutEndpointGracefulWithoutStripe);

  // Cleanup: stop server
  try { child.kill('SIGTERM'); } catch(_) {}
  // Summarize
  const okCount = results.filter(r => r.ok).length;
  console.log(`\nSummary: ${okCount}/${results.length} passed.`);
  if (failed) process.exit(1); else process.exit(0);
}

main().catch(err => {
  console.error('Smoke test aborted:', err && err.message ? err.message : err);
  process.exit(2);
});
