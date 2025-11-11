const path = require('path');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch(_) {}

const ENABLED = /^1|true$/i.test(String(process.env.PICKUP_NOTIFY_ENABLED || '1').trim());
// Allow adjusting freeze window via env for testing (default 1h for faster dev)
const FREEZE_HOURS = (() => {
  const s = String(process.env.PICKUP_NOTIFY_FREEZE_HOURS || '1').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
})();
const GOOGLE_KEY = (process.env.GOOGLE_MAPS_API_KEY || '').toString().trim();

function hasPostgres(){ return !!process.env.DATABASE_URL; }
function getSqlite(){ const Database = require('better-sqlite3'); return new Database(path.join(__dirname, '..', 'data', 'db.sqlite3')); }
async function withPg(fn){ const { Client } = require('pg'); const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); try { return await fn(client); } finally { await client.end(); } }

function parseMeta(row){ try { return row && row.metadata ? (typeof row.metadata==='object'?row.metadata:JSON.parse(row.metadata)) : {}; } catch(_) { return {}; } }
function hhmm(d){ const hh=String(d.getHours()).padStart(2,'0'); const mm=String(d.getMinutes()).padStart(2,'0'); return `${hh}:${mm}`; }
function asLoc(s){ if (s.lat && s.lng) return `${s.lat},${s.lng}`; return encodeURIComponent(String(s.address||'').replace(/\s+/g,'+')); }
async function distanceMatrix(stops){
  if (!GOOGLE_KEY || stops.length < 2) return null;
  const origins = stops.map(asLoc).join('|');
  const dests = origins;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${origins}&destinations=${dests}&key=${GOOGLE_KEY}`;
    const r = await fetch(url);
    return await r.json();
  } catch(e){ return null; }
}

function greedyOrder(distances, n){
  const used = new Set([0]); const order=[0];
  while (order.length < n){
    const last = order[order.length-1];
    let bestIdx=null, best=Infinity;
    for (let i=0;i<n;i++) if(!used.has(i)){ const d = distances[last] && distances[last][i]!=null? distances[last][i]:Infinity; if (d<best){best=d; bestIdx=i;} }
    if (bestIdx==null) break; used.add(bestIdx); order.push(bestIdx);
  }
  return order;
}

async function computeFinalTimes(row){
  const meta = parseMeta(row);
  const rawStops = Array.isArray(meta.stops) ? meta.stops.map((s,i)=>({ idx:i, name:s.name||s.customer||`Στάση ${i+1}`, address:s.address||s.pickup||s.location||'—', lat:s.lat||s.latitude||null, lng:s.lng||s.longitude||null })) : [];
  if (rawStops.length < 1) return null;
  const matrix = await distanceMatrix(rawStops);
  if (!matrix || !Array.isArray(matrix.rows)) return null;
  const distances = matrix.rows.map(r => (r.elements||[]).map(el => (el && el.distance && el.distance.value) || null));
  const durations = matrix.rows.map(r => (r.elements||[]).map(el => (el && el.duration && el.duration.value) || null));
  const order = greedyOrder(distances, rawStops.length);
  // Determine start datetime (booking.date + meta.pickup_time) in local time
  const dateStr = row.date || new Date().toISOString().slice(0,10);
  const startTimeStr = meta.pickup_time || meta.time || '07:00';
  const start = new Date(`${dateStr}T${startTimeStr}:00`);
  let t = start.getTime();
  const byOrigIndex = {};
  order.forEach((origPos, seq) => {
    const travelSec = seq===0 ? 0 : (durations[order[seq-1]] && durations[order[seq-1]][origPos]) || 0;
    t += travelSec * 1000;
    byOrigIndex[origPos] = hhmm(new Date(t));
  });
  return { order, times: byOrigIndex };
}

async function loadUpcomingToFreeze(){
  // find bookings with date ~ 24h ahead and not frozen
  if (hasPostgres()){
    return withPg(async (c) => {
      const { rows } = await c.query(`SELECT * FROM bookings WHERE date IS NOT NULL AND status IN ('confirmed','pending','accepted') ORDER BY date ASC LIMIT 500`);
      return rows || [];
    });
  } else {
    const db = getSqlite();
    try { return db.prepare(`SELECT * FROM bookings WHERE date IS NOT NULL ORDER BY date ASC LIMIT 500`).all(); } finally { db.close(); }
  }
}

function shouldFreeze(row){
  const meta = parseMeta(row);
  if (meta && meta.pickup_frozen) return false;
  const dateStr = row.date; if (!dateStr) return false;
  const timeStr = (meta.pickup_time||meta.time||'07:00');
  const dt = new Date(`${dateStr}T${timeStr}:00`);
  const diffMs = dt.getTime() - Date.now();
  const targetMs = FREEZE_HOURS*60*60*1000; // e.g. 1h for tests
  return diffMs <= targetMs && diffMs > -60*60*1000; // freeze within [-1h, +freeze]
}

async function persistMeta(rowId, meta){
  if (hasPostgres()){
    await withPg(async (c) => { await c.query('UPDATE bookings SET metadata=$1, updated_at=now() WHERE id=$2', [JSON.stringify(meta), rowId]); });
  } else {
    const db = getSqlite(); try { db.prepare('UPDATE bookings SET metadata=?, updated_at=? WHERE id=?').run(JSON.stringify(meta), new Date().toISOString(), rowId); } finally { db.close(); }
  }
}

async function sendNotify(stop, booking, time){
  const msg = `📣 Pickup for ${stop.name || booking.user_name || 'Customer'} at ${time} (±5′) — ${stop.address || booking.pickup_location || ''}`;
  const phone = stop.phone || (booking.metadata && booking.metadata.customer_phone) || null;
  const email = stop.email || booking.user_email || null;
  // SMS API not integrated: fallback to console
  console.log('pickup-notify:', { booking_id: booking.id, to_phone: phone, to_email: email, message: msg });
  // Optional email via nodemailer if configured
  try {
    if (nodemailer && process.env.MAIL_HOST && email){
      const port = parseInt(process.env.MAIL_PORT || '587', 10);
      const transporter = nodemailer.createTransport({ host: process.env.MAIL_HOST, port, secure: port===465, auth: (process.env.MAIL_USER && process.env.MAIL_PASS) ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined });
      await transporter.sendMail({ from: process.env.MAIL_FROM || 'notify@greekaway.com', to: email, subject: 'Ώρα Παραλαβής', text: msg, html: `<p>${msg}</p>` });
    }
  } catch(e){ console.warn('pickup email error', e && e.message ? e.message : e); }
}

async function tick(){
  if (!ENABLED) return;
  const list = await loadUpcomingToFreeze();
  for (const row of list){
    const meta = parseMeta(row);
    if (!Array.isArray(meta.stops) || !meta.stops.length) continue;
    if (!shouldFreeze(row)) continue;
    try {
      const computed = await computeFinalTimes(row);
      if (!computed) continue;
      meta.pickup_frozen = true;
      meta.pickup_frozen_at = new Date().toISOString();
      meta.stops_sorted = computed.order.map((i,seq)=>({ original_index:i, sequence: seq+1 }));
      meta.final_pickup_times = computed.times;
      await persistMeta(row.id, meta);
      // Send notifications per stop
      for (const [origIdx, time] of Object.entries(computed.times)){
        const stop = meta.stops[parseInt(origIdx,10)] || {};
        await sendNotify(stop, { ...row, metadata: meta }, time + ' ±5′');
      }
    } catch(e){ console.warn('pickup-freeze error', row && row.id, e && e.message ? e.message : e); }
  }
}

function start(){
  if (process.env.NODE_ENV === 'test') {
    // Avoid scheduling timers during Jest runs
    return { stop(){}, enabled:false, test:true };
  }
  if (!ENABLED) { console.log('pickup-notify: disabled'); return { stop(){}, enabled:false }; }
  console.log('pickup-notify: scheduler started (interval 5m)');
  const id = setInterval(() => { tick().catch(()=>{}); }, 5*60*1000);
  // Also run once on boot after small delay
  setTimeout(() => { tick().catch(()=>{}); }, 3000);
  return { stop(){ clearInterval(id); }, enabled:true };
}

module.exports = { start };
