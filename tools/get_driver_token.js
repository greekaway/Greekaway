#!/usr/bin/env node
const http = require('http');
const { URLSearchParams } = require('url');
const BASE = process.env.BASE || 'http://127.0.0.1:3101';
function req(method, path, { headers = {}, body = null } = {}){
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { method, headers };
    const r = http.request(url, opts, (res) => {
      let s=''; res.setEncoding('utf8'); res.on('data', c=>s+=c); res.on('end', ()=>resolve({status:res.statusCode, body:s, headers:res.headers}));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}
(async () => {
  const params = new URLSearchParams({ identifier: 'testdriver@greekaway.com', password: 'driver123' }).toString();
  const r = await req('POST', '/driver/api/login', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) }, body: params });
  try{
    const j = JSON.parse(r.body);
    if (j && j.token) { process.stdout.write(j.token); process.exit(0); }
  } catch(e){}
  process.stderr.write('failed:'+r.body+'\n');
  process.exit(2);
})();