#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const id = process.argv[2];
if (!id){ console.error('Usage: node scripts/debug_provider_route_build.js <booking_id>'); process.exit(1); }
function addMinutes(hhmm, inc){ try{ const [h,m]=String(hhmm||'00:00').slice(0,5).split(':').map(x=>parseInt(x,10)||0); const d=new Date(); d.setHours(h,m,0,0); d.setMinutes(d.getMinutes()+(parseInt(inc,10)||0)); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }catch(_){ return String(hhmm||'00:00').slice(0,5); }}
const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
const row = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
if (!row){ console.error('Not found'); process.exit(2); }
let meta = {}; try{ meta = row.metadata ? JSON.parse(row.metadata) : {}; } catch(_){ }
let full = meta && meta.route && Array.isArray(meta.route.full_path) ? meta.route.full_path.slice() : null;
if (!full || !full.length){
  const stops = Array.isArray(meta.stops) ? meta.stops : [];
  full = stops.map((s,i)=>({ label: s.label || s.name || s.customer || `Στάση ${i+1}`, address: s.address || s.pickup || s.location || '', lat: s.lat ?? s.latitude ?? null, lng: s.lng ?? s.longitude ?? null, arrival_time: s.arrival_time || s.time || s.scheduled_time || null, departure_time: s.departure_time || null, type: (String(s.type||'').toLowerCase()==='pickup' || /παραλαβή/i.test(String(s.name||''))) ? 'pickup' : 'tour_stop', }));
  const root = path.join(__dirname, '..');
  const tripId = row.trip_id || '';
  const candidates = [ `${tripId}.json` ];
  if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
  if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
  let fp = null; for (const n of candidates){ const p = path.join(root, 'public', 'data', 'trips', n); if (fs.existsSync(p)) { fp = p; break; } }
  if (fp){
    const raw = fs.readFileSync(fp, 'utf8'); const json = JSON.parse(raw);
    const arr = Array.isArray(json.stops)?json.stops:[];
    const pickupTimeStr = String(meta.pickup_time || meta.time || '09:00').slice(0,5);
    let prevTime = (full.length? full[full.length-1].arrival_time : null) || pickupTimeStr;
    const fallbackInc = 45;
    arr.forEach((s,i)=>{
      const at = s.arrival_time || s.time || addMinutes(prevTime, fallbackInc);
      full.push({ type:'tour_stop', label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`), address: s.address||s.location||'', arrival_time: at, departure_time: s.departure_time || null, lat: s.lat??s.latitude??null, lng: s.lng??s.longitude??null });
      prevTime = at || prevTime;
    });
  }
}
console.log(JSON.stringify({ fullCount: full.length, first: full[0]||null, last: full[full.length-1]||null }, null, 2));
