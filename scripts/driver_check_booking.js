#!/usr/bin/env node
const http = require('http');
const path = require('path');
const PORT = (()=>{
  // Allow override via env or CLI flag --port=NNNN
  const fromEnv = process.env.PORT && parseInt(process.env.PORT,10);
  if (fromEnv) return fromEnv;
  const arg = process.argv.find(a=>/^--port=\d+$/.test(a));
  if (arg) return parseInt(arg.split('=')[1],10);
  return 3000;
})();
function requestJSON(method, pathName, body, headers={}){
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname:'127.0.0.1', port:PORT, path: pathName, method, headers: { 'Content-Type':'application/json', ...(data?{'Content-Length':Buffer.byteLength(data)}:{}), ...headers } }, res=>{
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>{ try{ resolve({ status:res.statusCode, data: JSON.parse(b) }); } catch(e){ resolve({ status:res.statusCode, raw:b }); } });
    });
    req.on('error',reject);
    if (data) req.write(data);
    req.end();
  });
}
async function main(){
  const login = await requestJSON('POST', '/driver/api/login', { identifier:'testdriver@greekaway.com', password:'driver123' });
  if (!login || !login.data || !login.data.token){ console.error('Login failed:', login); process.exit(1); }
  const tok = login.data.token;
  const bookings = await requestJSON('GET', '/driver/api/bookings', null, { Authorization: 'Bearer ' + tok });
  if (!bookings.data || !bookings.data.bookings || bookings.data.bookings.length===0){ console.log('No driver bookings'); process.exit(0); }
  const b = bookings.data.bookings[0];
  const details = await requestJSON('GET', `/driver/api/bookings/${b.id}`, null, { Authorization: 'Bearer ' + tok });
  console.log(JSON.stringify({ listCount: bookings.data.bookings.length, picked: b.id, calc: (details.data && details.data.booking && details.data.booking.calc) || null, stopsCount: (details.data && details.data.booking && details.data.booking.stops ? details.data.booking.stops.length : 0), sampleStops: (details.data && details.data.booking && details.data.booking.stops ? details.data.booking.stops.map(s=>({type:s.type,name:s.name,address:s.address,time:s.time,eta:s.eta_local})).slice(0,8) : []) }, null, 2));
}
main().catch(e=>{ console.error('ERR', e && e.message ? e.message : e); process.exit(1); });
