const fs = require('fs');
const path = require('path');

function addMinutes(hhmm, inc){
  try {
    const [h, m] = String(hhmm || '00:00').slice(0,5).split(':').map(x => parseInt(x, 10) || 0);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    d.setMinutes(d.getMinutes() + (parseInt(inc,10) || 0));
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  } catch(_) { return String(hhmm || '00:00').slice(0,5); }
}

function tripJsonPath(tripId){
  try {
    const base = path.join(__dirname, '..', 'public', 'data', 'trips');
    const candidates = [ `${tripId}.json` ];
    if (/_demo$/.test(tripId)) candidates.push(`${tripId.replace(/_demo$/, '')}.json`);
    if (/_test$/.test(tripId)) candidates.push(`${tripId.replace(/_test$/, '')}.json`);
    for (const n of candidates){ const p = path.join(base, n); if (fs.existsSync(p)) return p; }
  } catch(_){}
  return null;
}

function loadTripInfo(tripId){
  const out = { start_time: null, stops: [] };
  if (!tripId) return out;
  const fp = tripJsonPath(tripId);
  if (!fp) return out;
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const json = JSON.parse(raw);
    const arr = Array.isArray(json.stops)?json.stops:[];
    out.stops = arr.map((s,i)=>({
      type:'tour_stop',
      label: (s.label||s.title||(typeof s.name==='string'?s.name:(s.name&&(s.name.el||s.name.en)))||`Στάση ${i+1}`),
      address: s.address||s.location||'',
      arrival_time: s.arrival_time||s.time||null,
      departure_time: s.departure_time||null,
      lat: s.lat??s.latitude??null,
      lng: s.lng??s.longitude??null
    }));
    out.start_time = (json.departure && json.departure.departure_time) || (arr[0] && (arr[0].time || arr[0].arrival_time)) || null;
  } catch(_){ }
  return out;
}

function buildPickups(row, meta, pickupIncMin=20){
  let pickups = [];
  try { if (row.pickup_points_json) { const arr = JSON.parse(row.pickup_points_json); if (Array.isArray(arr)) pickups = arr; } } catch(_){}
  if (!pickups.length){ try { const mp = Array.isArray(meta.pickups) ? meta.pickups : []; if (mp.length) pickups = mp.map(p => ({ address: p.address || p.pickup || p.location || '' })); } catch(_){}}
  const pickupStart = String((meta && (meta.pickup_time || meta.time)) || '09:00').slice(0,5) || '09:00';
  return (pickups || []).map((p,i)=>({
    type:'pickup',
    pickup_idx: i, // stable index within pickups array for client-side ordering
    label:`Παραλαβή: ${p.address||''}`.trim(),
    address:p.address||'',
    lat:p.lat??null,
    lng:p.lng??null,
    arrival_time: i===0?pickupStart:addMinutes(pickupStart, i*pickupIncMin),
    departure_time:null
  }));
}

function augmentWithTripStops(full, tripStops, pickupTimeStr){
  const out = Array.isArray(full) ? full.slice() : [];
  const seen = new Set(out.filter(x => (x.type||'tour_stop')==='tour_stop').map(x => (x.address||'').trim().toLowerCase()));
  let prev = (out.length ? out[out.length-1].arrival_time : null) || pickupTimeStr || '09:00';
  const fallbackInc = 45;
  for (let i=0;i<(tripStops||[]).length;i++){
    const ts = tripStops[i];
    const key = String(ts.address||'').trim().toLowerCase();
    if (key && seen.has(key)) continue;
    const at = ts.arrival_time || addMinutes(prev, fallbackInc);
    out.push({ ...ts, arrival_time: at });
    prev = at || prev;
  }
  return out;
}

function synthesizeRoute(row, opts={}){
  const meta = row && row.metadata ? (typeof row.metadata==='object' ? row.metadata : (function(){ try{return JSON.parse(row.metadata)}catch(_){return {}} })()) : {};
  const pickupIncMin = (opts.pickupIncMin != null ? opts.pickupIncMin : 20);
  const pickups = buildPickups(row, meta, pickupIncMin);
  const trip = loadTripInfo(row.trip_id || '');
  const pickupStart = String((meta && (meta.pickup_time || meta.time)) || '09:00').slice(0,5) || '09:00';
  const full_path = augmentWithTripStops(pickups, trip.stops, pickupStart);
  return { full_path, trip_info: { start_time: trip.start_time || null } };
}

module.exports = {
  addMinutes,
  loadTripInfo,
  buildPickups,
  augmentWithTripStops,
  synthesizeRoute,
};
