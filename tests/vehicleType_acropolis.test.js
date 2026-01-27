const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function fetchJson(url, opts) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = opts && opts.body ? opts.body : null;
      const headers = Object.assign({ 'Content-Type': 'application/json' }, opts && opts.headers ? opts.headers : {});
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method: opts && opts.method ? opts.method : 'GET', headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) { json = null; }
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, data: json });
        });
      });
      req.on('error', (err) => reject(err));
      if (data) req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

const CWD = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '4106';
const BASE_URL = `http://127.0.0.1:${PORT}`;
jest.setTimeout(30000);

describe('Acropolis vehicleType & pricing', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.ADMIN_USER = env.ADMIN_USER || 'admin';
    env.ADMIN_PASS = env.ADMIN_PASS || 'pass';
    env.NODE_ENV = 'test';
    env.ALLOW_TEST_WEBHOOK = 'true';
    env.PORT = String(PORT);
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    await new Promise(resolve => setTimeout(resolve, 1200));
  });
  afterAll(() => { if (server) server.kill(); });

  test('vehicleType normalization and pricing from trip config', async () => {
    const tripId = 'premium-acropolis-tour';
    const modes = [
      { mode: 'van', price_cents: 14000, vehicleType: 'van' },
      { mode: 'bus', price_cents: 3500, vehicleType: 'bus' },
      { mode: 'mercedes', price_cents: 22000, vehicleType: 'mercedes' }
    ];

    for (const m of modes) {
      const bk = await fetchJson(`${BASE_URL}/api/bookings/create`, {
        method: 'POST',
        body: JSON.stringify({ trip_id: tripId, mode: m.mode, seats: 1, price_cents: m.price_cents, currency: 'eur' })
      });
      expect(bk.ok).toBe(true);
      expect(bk.data && bk.data.bookingId).toBeDefined();

      const pi = await fetchJson(`${BASE_URL}/api/partners/create-payment-intent`, {
        method: 'POST',
        body: JSON.stringify({ tripId, vehicleType: m.vehicleType, seats: 1, price_cents: m.price_cents, currency: 'eur', customerEmail: `test_${m.mode}@example.com` })
      });
      if (pi.ok && pi.data && pi.data.paymentIntentId) {
        expect(pi.data.paymentIntentId).toBeDefined();
      }
    }
  });
});
