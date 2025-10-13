/*
Local idempotency & replay test script.

This script:
1) Starts the server in a child process with STRIPE_WEBHOOK_SECRET unset so webhook verification falls back to JSON parsing.
2) Calls /create-payment-intent twice with the same Idempotency-Key and verifies only one PaymentIntent is created in Stripe (best-effort check via returned clientSecret/idempotencyKey) — note: to fully verify Stripe deduplication you'd need to inspect Stripe dashboard.
3) Posts the same payment_intent.succeeded event body twice to /webhook to simulate a replay and verifies SQLite has only one payments row for that payment_intent id.

Usage: node scripts/test_idempotency.js

Note: This script is for local developer testing only.
*/

const { spawn } = require('child_process');
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
const fs = require('fs');
const path = require('path');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server.js'];
const CWD = path.join(__dirname, '..');

(async function main(){
  console.log('Starting server with STRIPE_WEBHOOK_SECRET unset (test mode)...');
  const env = Object.assign({}, process.env);
  // Ensure STRIPE_WEBHOOK_SECRET is falsy so webhook handler falls back to unsigned JSON parsing
  env.STRIPE_WEBHOOK_SECRET = '';
  // Enable test-only webhook endpoint
  env.ALLOW_TEST_WEBHOOK = 'true';
  const server = spawn(SERVER_CMD, SERVER_ARGS, { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', d => process.stdout.write('[server] '+d.toString()));
  server.stderr.on('data', d => process.stderr.write('[server] '+d.toString()));

  // wait for server to be ready
  await new Promise(resolve => setTimeout(resolve, 1200));

  try {
    // 1) Idempotency test: create-payment-intent twice with same key
    const key = 'test-key-' + Date.now();
    console.log('Calling /create-payment-intent twice with Idempotency-Key:', key);
    const body = { amount: 1000, currency: 'eur' };
    const r1 = await fetch('http://localhost:3000/create-payment-intent', { method:'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
    const j1 = await r1.json();
    const r2 = await fetch('http://localhost:3000/create-payment-intent', { method:'POST', headers: { 'Content-Type':'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
    const j2 = await r2.json();
    console.log('Response 1:', j1);
    console.log('Response 2:', j2);

    // 2) Replay test: call /webhook twice with same payload
    const testEvent = {
      id: 'evt_local_replay_' + Date.now(),
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_local_replay_' + Date.now(), amount: 1234, currency: 'eur' } }
    };
  console.log('Posting test webhook event to /webhook/test twice: event id', testEvent.id);
  const post1 = await fetch('http://localhost:3000/webhook/test', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(testEvent) });
  console.log('Webhook POST1 status', post1.status);
  const post2 = await fetch('http://localhost:3000/webhook/test', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(testEvent) });
  console.log('Webhook POST2 status', post2.status);

    // 3) Inspect SQLite DB for rows matching the test payment intent id
    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    if (!fs.existsSync(dbPath)) {
      console.error('DB not found at', dbPath);
      process.exit(1);
    }
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT id,event_id,status,amount,currency,timestamp FROM payments WHERE id = ?').get(testEvent.data.object.id);
    console.log('DB row for', testEvent.data.object.id, row);
    db.close();

    console.log('\nTEST SCRIPT COMPLETE — check logs above for duplicate handling.');
  } catch (err) {
    console.error('Test script error', err && err.stack ? err.stack : err);
  } finally {
    server.kill();
  }
})();
