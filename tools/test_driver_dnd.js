#!/usr/bin/env node
const http = require('http');
const https = require('https');
const { URL } = require('url');
const BASE = process.env.BASE || 'http://127.0.0.1:3101';

function req(method, path, { headers = {}, body = null } = {}){
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = { method, headers: Object.assign({}, headers) };
    const req = lib.request(u, opts, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const ct = String(res.headers['content-type'] || '');
        if (ct.includes('application/json')) {
          try { resolve({ status: res.statusCode, json: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, text: data }); }
        } else {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });
    req.on('error', reject);
    if (body){ req.write(body); }
    req.end();
  });
}

(async () => {
  // Login (form-encoded)
  const form = 'identifier=' + encodeURIComponent('testdriver@greekaway.com') + '&password=' + encodeURIComponent('driver123');
  const r1 = await req('POST', '/driver/api/login', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) }, body: form });
  if (!r1.json || !r1.json.token) throw new Error('login failed: ' + JSON.stringify(r1));
  const token = r1.json.token;
  console.log('token-ok');

  // Fetch bookings list
  const r2 = await req('GET', '/driver/api/bookings', { headers: { 'Authorization': 'Bearer ' + token } });
  if (!r2.json || !r2.json.ok) throw new Error('bookings failed: ' + JSON.stringify(r2));
  const bookings = r2.json.bookings || [];
  const b = bookings[0];
  if (!b) throw new Error('no bookings for driver');
  console.log('bookings:', bookings.map(x => x.id).join(','));

  // Fetch booking details
  const r3 = await req('GET', '/driver/api/bookings/' + encodeURIComponent(b.id), { headers: { 'Authorization': 'Bearer ' + token } });
  if (!r3.json || !r3.json.ok) throw new Error('booking detail failed: ' + JSON.stringify(r3));
  const stops = r3.json.booking && r3.json.booking.stops || [];
  const pickups = stops.filter(s => String((s.type||'').toLowerCase())==='pickup' || /παραλαβή/i.test(String(s.name||'')));
  if (pickups.length < 2) throw new Error('expected at least 2 pickups');
  const orderOrig = pickups.map(s => s.original_index).filter(n => typeof n==='number');
  const reversed = orderOrig.slice().reverse();

  // Save new order
  const body = JSON.stringify({ booking_id: b.id, new_order_original_indices: reversed });
  const r4 = await req('POST', '/driver/api/update-pickup-order', { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, body });
  if (!r4.json || !r4.json.ok) throw new Error('save order failed: ' + JSON.stringify(r4));
  console.log('save-ok');

  // Fetch again to verify
  const r5 = await req('GET', '/driver/api/bookings/' + encodeURIComponent(b.id), { headers: { 'Authorization': 'Bearer ' + token } });
  const b5 = r5.json && r5.json.booking; if (!b5) throw new Error('refetch failed');
  const st5 = b5.stops || [];
  const p5 = st5.filter(s => String((s.type||'').toLowerCase())==='pickup' || /παραλαβή/i.test(String(s.name||'')));
  const ord5 = p5.map(s => s.original_index);
  console.log('order-after:', JSON.stringify(ord5));
  console.log('calc.method:', (b5.calc && b5.calc.method) || '');
})();
