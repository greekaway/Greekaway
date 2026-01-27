const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function postJson(url, body, headers = {}){
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const data = JSON.stringify(body);
      const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), method:'POST', headers: { 'Content-Type':'application/json', ...headers } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch(_){ json = null; }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: json });
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

const CWD = path.join(__dirname, '..');
const PORT = process.env.TEST_PORT || '4107';
const BASE_URL = `http://127.0.0.1:${PORT}`;
jest.setTimeout(30000);

describe('mercedes pricing from trip config', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.NODE_ENV = 'test';
    env.ALLOW_LIVE_STRIPE_IN_DEV = '1';
    env.ADMIN_USER = env.ADMIN_USER || 'admin';
    env.ADMIN_PASS = env.ADMIN_PASS || 'pass';
    process.env.ADMIN_USER = env.ADMIN_USER;
    process.env.ADMIN_PASS = env.ADMIN_PASS;
    env.PORT = String(PORT);
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    await new Promise(resolve => setTimeout(resolve, 1200));
  });
  afterAll(() => { if (server) server.kill(); });

  test('mercedes per-vehicle price is taken from trip config', async () => {
    const tripId = 'premium-acropolis-tour';
    const price_cents = 22000;
    const auth = Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASS}`).toString('base64');
    const diagResp = await postJson(`${BASE_URL}/api/partners/admin/payment-diagnose`, { tripId, vehicleType:'mercedes', seats:1, price_cents, currency:'eur' }, { Authorization:`Basic ${auth}` });
    expect(diagResp.ok).toBe(true);
    expect(diagResp.data.server_computed_price_cents).toBe(22000);
    expect(diagResp.data.final_amount_cents).toBe(22000);
  });
});
