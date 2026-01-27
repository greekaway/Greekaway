const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = opts.body ? opts.body : null;
      const headers = opts.headers || {};
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method: opts.method || 'GET', headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) { json = null; }
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: json, text: body });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

const CWD = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '4108';
const BASE_URL = `http://localhost:${PORT}`;
jest.setTimeout(30000);

describe('P0 integrity checks', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.NODE_ENV = 'test';
    env.PORT = String(PORT);
    env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    env.ALLOW_TEST_WEBHOOK = 'true';
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    await new Promise(resolve => setTimeout(resolve, 1200));
  });

  afterAll(() => { if (server) server.kill(); });

  test('rejects manipulated price_cents on booking create', async () => {
    const body = JSON.stringify({ trip_id: 'premium-acropolis-tour', mode: 'van', seats: 1, price_cents: 1000, currency: 'eur' });
    const resp = await request(`${BASE_URL}/api/bookings/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(resp.status).toBe(400);
    expect(resp.data && resp.data.error).toBe('Invalid amount');
  });

  test('parallel confirmations only allow one booking for last seat', async () => {
    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE IF NOT EXISTS mode_availability (
      trip_id TEXT NOT NULL,
      date TEXT NOT NULL,
      mode TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      taken_custom INTEGER,
      updated_at TEXT,
      PRIMARY KEY (trip_id, date, mode)
    )`);
    const date = '2099-01-01';
    db.prepare('INSERT OR REPLACE INTO mode_availability (trip_id,date,mode,capacity,updated_at) VALUES (?,?,?,?,?)')
      .run('premium-acropolis-tour', date, 'van', 1, new Date().toISOString());
    db.close();

    const bookingBody = JSON.stringify({ trip_id: 'premium-acropolis-tour', mode: 'van', date, seats: 1, price_cents: 14000, currency: 'eur' });
    const b1 = await request(`${BASE_URL}/api/bookings/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bookingBody });
    const b2 = await request(`${BASE_URL}/api/bookings/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bookingBody });
    expect(b1.ok).toBe(true);
    expect(b2.ok).toBe(true);

    const c1 = request(`${BASE_URL}/api/bookings/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: b1.data.bookingId }) });
    const c2 = request(`${BASE_URL}/api/bookings/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: b2.data.bookingId }) });
    const results = await Promise.all([c1, c2]);
    const okCount = results.filter(r => r.status === 200).length;
    const conflictCount = results.filter(r => r.status === 409).length;
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);

    const db2 = new (require('better-sqlite3'))(dbPath, { readonly: true });
    const row = db2.prepare("SELECT COUNT(*) AS c FROM bookings WHERE trip_id = ? AND date = ? AND status = 'confirmed'")
      .get('premium-acropolis-tour', date);
    db2.close();
    expect(row.c).toBe(1);
  });

  test('invalid Stripe signature is rejected', async () => {
    const payload = JSON.stringify({ id: 'evt_invalid_' + Date.now(), type: 'payment_intent.succeeded', data: { object: { id: 'pi_invalid_' + Date.now(), amount: 14000, currency: 'eur' } } });
    const resp = await request(`${BASE_URL}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'invalid' }, body: payload });
    expect(resp.status).toBe(400);
  });

  test('duplicate webhook events are ignored', async () => {
    const piId = 'pi_dup_' + Date.now();
    const evt = { id: 'evt_dup_' + Date.now(), type: 'payment_intent.succeeded', data: { object: { id: piId, amount: 14000, currency: 'eur' } } };
    const body = JSON.stringify(evt);
    const p1 = await request(`${BASE_URL}/webhook/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const p2 = await request(`${BASE_URL}/webhook/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(p1.status).toBe(200);
    expect(p2.status).toBe(200);

    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE id = ?').get(piId);
    db.close();
    expect(row.c).toBe(1);
  });
});
