const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

function fetch(url, opts) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = opts && opts.body ? opts.body : null;
      const headers = opts && opts.headers ? opts.headers : {};
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method: opts && opts.method ? opts.method : 'GET', headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, text: async () => body, json: async () => { try { return JSON.parse(body); } catch (e) { return null; } } }));
      });
      req.on('error', (err) => reject(err));
      if (data) req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

const CWD = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '4102';
const BASE_URL = `http://localhost:${PORT}`;

jest.setTimeout(30000);

describe('idempotency and webhook replay', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.STRIPE_WEBHOOK_SECRET = '';
    env.ALLOW_TEST_WEBHOOK = 'true';
    env.PORT = String(PORT);
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    // wait briefly for server to be ready
    await new Promise(resolve => setTimeout(resolve, 1200));
  });

  afterAll(() => {
    if (server) server.kill();
  });

  test('create-payment-intent idempotency and webhook replay handling', async () => {
    const key = 'jest-test-key-' + Date.now();
    const body = JSON.stringify({ amount: 14000, price_cents: 14000, currency: 'eur', tripId: 'premium-acropolis-tour', vehicleType: 'van', seats: 1, customerEmail: 'jest-idempotency@example.com' });
  const r1 = await fetch(`${BASE_URL}/api/partners/create-payment-intent`, { method:'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key': key }, body });
    const j1 = await r1.json();
  const r2 = await fetch(`${BASE_URL}/api/partners/create-payment-intent`, { method:'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key': key }, body });
    const j2 = await r2.json();
    expect(j1.clientSecret).toBeDefined();
    expect(j1.clientSecret).toEqual(j2.clientSecret);

    const testEvent = {
      id: 'evt_jest_replay_' + Date.now(),
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_jest_replay_' + Date.now(), amount: 1234, currency: 'eur' } }
    };

    const post1 = await fetch(`${BASE_URL}/webhook/test`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(testEvent) });
    expect(post1.status).toBe(200);
    const post2 = await fetch(`${BASE_URL}/webhook/test`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(testEvent) });
    expect(post2.status).toBe(200);

      const badBody = JSON.stringify({ amount: 1000, price_cents: 1000, currency: 'eur', tripId: 'premium-acropolis-tour', vehicleType: 'van', seats: 1, customerEmail: 'jest-idempotency@example.com' });
      const badResp = await fetch(`${BASE_URL}/api/partners/create-payment-intent`, { method:'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key': 'bad-'+Date.now() }, body: badBody });
      expect(badResp.status).toBe(400);

    // verify DB has exactly one entry for the payment intent id
    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    expect(fs.existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT COUNT(*) AS c FROM payments WHERE id = ?').get(testEvent.data.object.id);
    db.close();
    expect(row.c).toBe(1);
  });
});
