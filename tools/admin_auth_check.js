const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env without printing secrets
try { require('dotenv').config(); } catch (_) {}

const USER = (process.env.ADMIN_USER || '').toString().trim().replace(/^['"]|['"]$/g, '');
const PASS = (process.env.ADMIN_PASS || '').toString().trim().replace(/^['"]|['"]$/g, '');

if (!USER || !PASS) {
  console.error('Missing ADMIN_USER or ADMIN_PASS in environment.');
  process.exit(2);
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`, 'utf8').toString('base64');

function check(pathname) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: 3000, method: 'GET',
      path: pathname, timeout: 4000,
      headers: { 'Authorization': AUTH, 'Accept': 'application/json' }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { try { req.destroy(); } catch(_){} resolve({ error: 'timeout' }); });
    req.end();
  });
}

(async () => {
  const endpoints = ['/admin/backup-status', '/admin/payments?limit=1'];
  let ok = true;
  for (const p of endpoints) {
    const r = await check(p);
    if (r && r.status === 200) {
      console.log(p, 'OK');
    } else {
      ok = false;
      console.log(p, 'FAIL', r);
    }
  }
  process.exit(ok ? 0 : 1);
})();
