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

/**
 * Reorder only pickup stops within a full_path array according to metadata.
 * Priority 1: metadata.stops_sorted -> array of { original_index } referencing pickup_idx
 * Priority 2: metadata.pickups_manual_addresses -> address-based ordering (lowercased exact match)
 * Tour stops remain pinned after pickups, in their existing order. Times are not recomputed here.
 */
function applyManualOrder(full_path, metadata){
  try {
    const fp = Array.isArray(full_path) ? full_path : [];
    const meta = metadata && typeof metadata==='object' ? metadata : {};
    const pickups = fp.filter(x => (x && x.type)==='pickup');
    const tours = fp.filter(x => (x && x.type)!=='pickup');
    if (!pickups.length) return { full_path: fp.slice() };

    const byIdx = new Map(pickups.map(p => [p.pickup_idx, p]));
    const originalOrder = pickups.map(p => p.pickup_idx);

    let desiredIdxOrder = null;
    if (Array.isArray(meta.stops_sorted) && meta.stops_sorted.length){
      const arr = meta.stops_sorted.map(x => x && x.original_index).filter(n => Number.isFinite(n));
      if (arr.length) desiredIdxOrder = arr;
    }
    let manualAddrOrder = null;
    if (!desiredIdxOrder && Array.isArray(meta.pickups_manual_addresses) && meta.pickups_manual_addresses.length){
      manualAddrOrder = meta.pickups_manual_addresses.map(s => String(s||'').toLowerCase());
    }

    let reorderedPickups = pickups.slice();
    if (desiredIdxOrder){
      const seen = new Set();
      const ordered = [];
      for (const idx of desiredIdxOrder){
        if (byIdx.has(idx) && !seen.has(idx)){ ordered.push(byIdx.get(idx)); seen.add(idx); }
      }
      for (const idx of originalOrder){ if (!seen.has(idx)){ ordered.push(byIdx.get(idx)); seen.add(idx); } }
      reorderedPickups = ordered;
    } else if (manualAddrOrder){
      const byAddr = new Map();
      pickups.forEach(p => { byAddr.set(String((p.address||'').trim()).toLowerCase(), p); });
      const seen = new Set();
      const ordered = [];
      for (const a of manualAddrOrder){ const key = String(a||'').toLowerCase(); if (byAddr.has(key) && !seen.has(key)){ ordered.push(byAddr.get(key)); seen.add(key); } }
      for (const p of pickups){ const key = String((p.address||'').trim()).toLowerCase(); if (!seen.has(key)){ ordered.push(p); seen.add(key); } }
      reorderedPickups = ordered;
    }

    const newFull = reorderedPickups.concat(tours);
    return { full_path: newFull };
  } catch(_){
    return { full_path: Array.isArray(full_path) ? full_path.slice() : [] };
  }
}

/**
 * Canonical route for panels: synthesize (pickups + trip stops) then apply manual pickup order from metadata.
 * Returns shape: { full_path, trip_info }
 */
function getCanonicalRoute(row, opts={}){
  const synth = synthesizeRoute(row, opts);
  const meta = row && row.metadata ? (typeof row.metadata==='object' ? row.metadata : (function(){ try{return JSON.parse(row.metadata)}catch(_){return {}} })()) : {};
  const applied = applyManualOrder(synth.full_path, meta);
  return { full_path: applied.full_path, trip_info: synth.trip_info };
}

module.exports = {
  addMinutes,
  loadTripInfo,
  buildPickups,
  augmentWithTripStops,
  synthesizeRoute,
  applyManualOrder,
  getCanonicalRoute,
};
