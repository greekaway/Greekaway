#!/usr/bin/env node
const http = require('http');
function requestJSON(method, pathName, body, headers={}){
  return new Promise((resolve,reject)=>{
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname:'127.0.0.1', port:3000, path: pathName, method, headers: { 'Content-Type':'application/json', ...(data?{'Content-Length':Buffer.byteLength(data)}:{}), ...headers } }, res=>{
      let b=''; res.on('data',d=>b+=d); res.on('end',()=>{ try{ resolve({ status:res.statusCode, data: JSON.parse(b) }); } catch(e){ resolve({ status:res.statusCode, raw:b }); } });
    });
    req.on('error',reject);
    if (data) req.write(data);
    req.end();
  });
}
async function main(){
  const login = await requestJSON('POST', '/provider/auth/login', { email:'driver@example.com', password:'TestPass123' });
  if (!login || !login.data || !login.data.token){ console.error('Provider login failed:', login); process.exit(1); }
  const tok = login.data.token;
  const list = await requestJSON('GET', '/provider/api/bookings', null, { Authorization: 'Bearer ' + tok });
  const items = (list.data && list.data.bookings) || [];
  if (!items.length){ console.log('No provider bookings'); process.exit(0); }
  const acro = items.find(x => x.trip_title && /acropolis|acropolis|acropolis/i.test(String(x.trip_title))) || items[0];
  const det = await requestJSON('GET', `/provider/api/bookings/${acro.booking_id}`, null, { Authorization: 'Bearer ' + tok });
  const b = det.data && det.data.booking;
  console.log('debug_keys', b ? Object.keys(b) : []);
  if (b && b.metadata && typeof b.metadata === 'object') console.log('debug_meta_keys', Object.keys(b.metadata));
  if (b && b.route) console.log('debug_route', JSON.stringify(b.route).slice(0,200));
  let pickups = []; try { if (b && b.pickup_points_json) pickups = JSON.parse(b.pickup_points_json); else if (b && b.metadata && b.metadata.pickups) pickups = b.metadata.pickups; } catch(_){ }
  const routeLen = (b && b.route && Array.isArray(b.route.full_path)) ? b.route.full_path.length : 0;
  const tripInfo = b && b.trip_info || {};
  const sampleRoute = (b && b.route && b.route.full_path || []).slice(0,8).map(r=>({type:r.type,label:r.label,address:r.address,time:r.arrival_time||null}));
  console.log(JSON.stringify({total:list.data.bookings.length, booking_id: acro.booking_id, pickups: pickups.map(p=>p.address), routeCount: routeLen, tripStart: tripInfo.start_time||null, sampleRoute}, null, 2));
}
main().catch(e=>{ console.error('ERR', e && e.message ? e.message : e); process.exit(1); });
