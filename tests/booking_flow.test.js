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
jest.setTimeout(30000);

describe('booking flow', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.STRIPE_WEBHOOK_SECRET = '';
    env.ALLOW_TEST_WEBHOOK = 'true';
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    await new Promise(resolve => setTimeout(resolve, 1200));
  });
  afterAll(() => { if (server) server.kill(); });

  test('create booking, attach to PaymentIntent, webhook confirms booking', async () => {
    const bookingResp = await fetch('http://localhost:3000/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_name: 'Test', user_email: 'test@example.com', trip_id: 'delphi', seats: 2, price_cents: 5000, currency: 'eur' }) });
    expect(bookingResp.status).toBe(200);
    const bookingJson = await bookingResp.json();
    expect(bookingJson.bookingId).toBeDefined();

    // create payment intent for this booking
    const piResp = await fetch('http://localhost:3000/create-payment-intent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'book-test-'+Date.now() }, body: JSON.stringify({ amount: 5000, currency: 'eur', booking_id: bookingJson.bookingId }) });
    expect(piResp.status).toBe(200);
    const piJson = await piResp.json();
    expect(piJson.paymentIntentId).toBeDefined();

    // simulate webhook for succeeded
    const evt = { id: 'evt_bf_' + Date.now(), type: 'payment_intent.succeeded', data: { object: { id: piJson.paymentIntentId, amount: 5000, currency: 'eur', metadata: { booking_id: bookingJson.bookingId } } } };
    const wh = await fetch('http://localhost:3000/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evt) });
    expect(wh.status).toBe(200);

    // fetch booking and assert confirmed
    const getb = await fetch('http://localhost:3000/api/bookings/' + bookingJson.bookingId);
    expect(getb.status).toBe(200);
    const b = await getb.json();
    expect(b.status).toBe('confirmed');
  });
});
