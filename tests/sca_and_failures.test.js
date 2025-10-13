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

describe('SCA and failed payment handling', () => {
  let server;
  beforeAll(async () => {
    const env = Object.assign({}, process.env);
    env.STRIPE_WEBHOOK_SECRET = '';
    env.ALLOW_TEST_WEBHOOK = 'true';
    server = spawn('node', ['server.js'], { cwd: CWD, env, stdio: ['ignore','pipe','pipe'] });
    await new Promise(resolve => setTimeout(resolve, 1200));
  });
  afterAll(() => { if (server) server.kill(); });

  test('SCA-like flow: created then succeeded results in recorded succeeded', async () => {
    const evtId = 'evt_sca_' + Date.now();
    const piId = 'pi_sca_' + Date.now();
    const created = { id: evtId + '_created', type: 'payment_intent.created', data: { object: { id: piId, amount: 2500, currency: 'eur', status: 'requires_action' } } };
    const succeeded = { id: evtId + '_succeeded', type: 'payment_intent.succeeded', data: { object: { id: piId, amount: 2500, currency: 'eur' } } };

    // post created (not required to persist), then succeeded
    const p1 = await fetch('http://localhost:3000/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(created) });
    expect(p1.status).toBe(200);
    const p2 = await fetch('http://localhost:3000/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(succeeded) });
    expect(p2.status).toBe(200);

    // check DB
    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    expect(fs.existsSync(dbPath)).toBe(true);
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT id,event_id,status,amount,currency FROM payments WHERE id = ?').get(piId);
    db.close();
    expect(row).toBeDefined();
    expect(row.status).toBe('succeeded');
    expect(row.amount).toBe(2500);
  });

  test('payment_failed handling records failed and out-of-order resolution updates to succeeded', async () => {
    const base = Date.now();
    const piFail = 'pi_fail_' + base;
    const evtFail = { id: 'evt_fail_' + base, type: 'payment_intent.payment_failed', data: { object: { id: piFail, amount: 1800, currency: 'eur' } } };
    const evtSucc = { id: 'evt_succ_' + base, type: 'payment_intent.succeeded', data: { object: { id: piFail, amount: 1800, currency: 'eur' } } };

    const rFail = await fetch('http://localhost:3000/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evtFail) });
    expect(rFail.status).toBe(200);

    // check failed
    const Database = require('better-sqlite3');
    const dbPath = path.join(CWD, 'data', 'db.sqlite3');
    const db = new Database(dbPath, { readonly: true });
    let row = db.prepare('SELECT id,event_id,status,amount,currency FROM payments WHERE id = ?').get(piFail);
    expect(row).toBeDefined();
    expect(row.status).toBe('failed');
    db.close();

    // Now send succeeded event (out-of-order resolution)
    const rSucc = await fetch('http://localhost:3000/webhook/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evtSucc) });
    expect(rSucc.status).toBe(200);

    const db2 = new Database(dbPath, { readonly: true });
    row = db2.prepare('SELECT id,event_id,status,amount,currency FROM payments WHERE id = ?').get(piFail);
    db2.close();
    expect(row).toBeDefined();
    // final state should be succeeded after the later event
    expect(row.status).toBe('succeeded');
  });
});
