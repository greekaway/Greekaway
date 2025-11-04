const path = require('path');
const crypto = require('crypto');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch(_) {}

// Env flags
const DISPATCH_ENABLED = /^1|true$/i.test(String(process.env.DISPATCH_ENABLED || '').trim());
const BASE_URL = (process.env.BASE_URL || '').toString().trim().replace(/^['"]|['"]$/g, '') || null;

// DB detection
function hasPostgres() { return !!process.env.DATABASE_URL; }

function getSqlite(){
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, '..', 'data', 'db.sqlite3'));
  return db;
}

async function withPg(fn){
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

function toPayload(booking, partner){
  const m = booking && booking.metadata ? (typeof booking.metadata === 'string' ? safeJson(booking.metadata) : booking.metadata) : {};
  const pickup_point = m.pickup_point || m.pickup || 'N/A';
  const pickup_time = m.pickup_time || m.time || 'N/A';
  const dropoff_point = m.dropoff_point || m.dropoff || 'N/A';
  const people = m.people || booking.seats || m.seats || 'N/A';
  const luggage = m.luggage || 'N/A';
  const customer_name = m.customer_name || booking.user_name || 'N/A';
  const customer_phone = m.customer_phone || m.phone || m.customer_phone_number || 'N/A';
  const comments = m.comments || m.notes || 'N/A';
  const trip_title = m.trip_title || booking.trip_id || 'N/A';
  const start_date = booking.date || m.start_date || 'N/A';
  const map_link = m.map_link || (pickup_point && pickup_point !== 'N/A' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup_point)}` : null);
  return {
    booking_id: booking.id,
    trip_title,
    start_date,
    pickup_point,
    pickup_time,
    dropoff_point,
    people,
    luggage,
    customer_name,
    customer_phone,
    comments,
    map_link,
    provider_name: partner && (partner.name || partner.partner_name) || 'N/A',
    provider_email: partner && (partner.email || partner.partner_email) || null,
  };
}

function safeJson(s){ try { return JSON.parse(s); } catch(_) { return {}; } }

function buildTransport(){
  if (!nodemailer) throw new Error('nodemailer not installed');
  const host = process.env.MAIL_HOST;
  const port = parseInt(process.env.MAIL_PORT || '587', 10);
  const auth = (process.env.MAIL_USER && process.env.MAIL_PASS) ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : null;
  const secure = port === 465; // Mailtrap often 2525 or 587
  const transporter = nodemailer.createTransport({ host, port, secure, auth });
  return transporter;
}

async function sendEmail(payload){
  const from = process.env.MAIL_FROM || 'dispatch@greekaway.com';
  const to = payload.provider_email;
  if (!to) throw new Error('Missing provider email');
  const subject = `[Greekaway] Νέα Κράτηση ${payload.booking_id} — ${payload.trip_title}`;
  const lines = [
    `Trip: ${payload.trip_title}`,
    `Ημερομηνία: ${payload.start_date}`,
    `Παραλαβή: ${payload.pickup_point} (${payload.pickup_time})`,
    `Απόθεση: ${payload.dropoff_point}`,
    `Άτομα: ${payload.people} • Αποσκευές: ${payload.luggage}`,
    `Πελάτης: ${payload.customer_name} (${payload.customer_phone})`,
    `Σχόλια: ${payload.comments}`,
    payload.map_link ? `Χάρτης: ${payload.map_link}` : null,
    BASE_URL ? `Admin: ${BASE_URL}/admin` : null,
  ].filter(Boolean);
  const text = lines.join('\n');
  const html = `<div>
    <h2>Νέα Κράτηση — ${escapeHtml(payload.trip_title)}</h2>
    <ul>
      <li><b>Ημερομηνία:</b> ${escapeHtml(String(payload.start_date))}</li>
      <li><b>Παραλαβή:</b> ${escapeHtml(String(payload.pickup_point))} (${escapeHtml(String(payload.pickup_time))})</li>
      <li><b>Απόθεση:</b> ${escapeHtml(String(payload.dropoff_point))}</li>
      <li><b>Άτομα:</b> ${escapeHtml(String(payload.people))} • <b>Αποσκευές:</b> ${escapeHtml(String(payload.luggage))}</li>
      <li><b>Πελάτης:</b> ${escapeHtml(String(payload.customer_name))} (${escapeHtml(String(payload.customer_phone))})</li>
      <li><b>Σχόλια:</b> ${escapeHtml(String(payload.comments))}</li>
      ${payload.map_link ? `<li><b>Χάρτης:</b> <a href="${payload.map_link}">Άνοιγμα</a></li>` : ''}
    </ul>
  </div>`;
  const transporter = buildTransport();
  const info = await transporter.sendMail({ from, to, subject, text, html });
  return info && info.messageId ? `sent:${info.messageId}` : JSON.stringify(info);
}

function escapeHtml(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function loadBookingAndPartner(bookingId){
  if (hasPostgres()){
    return withPg(async (client) => {
      const { rows } = await client.query(`SELECT b.*, p.name AS partner_name, p.email AS partner_email
        FROM bookings b LEFT JOIN partners p ON p.id = b.partner_id WHERE b.id = $1`, [bookingId]);
      return rows && rows[0] ? rows[0] : null;
    });
  } else {
    const db = getSqlite();
    try {
      const row = db.prepare(`SELECT b.*, p.name AS partner_name, p.email AS partner_email FROM bookings b LEFT JOIN partners p ON p.id = b.partner_id WHERE b.id = ?`).get(bookingId);
      // parse metadata
      if (row && row.metadata){ try { row.metadata = JSON.parse(row.metadata); } catch(_){} }
      return row || null;
    } finally { db.close(); }
  }
}

async function hasSuccessfulLog(bookingId, partnerId){
  if (hasPostgres()){
    return withPg(async (client) => {
      const { rows } = await client.query(`SELECT 1 FROM dispatch_log WHERE booking_id=$1 AND partner_id=$2 AND status='success' LIMIT 1`, [bookingId, partnerId]);
      return !!(rows && rows.length);
    });
  } else {
    const db = getSqlite();
    try {
      const row = db.prepare(`SELECT 1 FROM dispatch_log WHERE booking_id=? AND partner_id=? AND status='success' LIMIT 1`).get(bookingId, partnerId);
      return !!row;
    } finally { db.close(); }
  }
}

async function upsertLog(log){
  // Ensure required named parameters exist for better-sqlite3 named bindings
  log = {
    sent_at: log && Object.prototype.hasOwnProperty.call(log, 'sent_at') ? log.sent_at : null,
    sent_by: log && Object.prototype.hasOwnProperty.call(log, 'sent_by') ? log.sent_by : null,
    response_text: log && Object.prototype.hasOwnProperty.call(log, 'response_text') ? log.response_text : null,
    retry_count: log && Object.prototype.hasOwnProperty.call(log, 'retry_count') ? log.retry_count : 0,
    ...log
  };
  // if id present, update; else insert
  if (hasPostgres()){
    return withPg(async (client) => {
      if (log.id){
        await client.query(`UPDATE dispatch_log SET sent_at=$1, sent_by=$2, status=$3, response_text=$4, payload_json=$5, retry_count=$6 WHERE id=$7`, [log.sent_at||null, log.sent_by||null, log.status, log.response_text||null, log.payload_json, log.retry_count||0, log.id]);
        return log.id;
      } else {
        const id = crypto.randomUUID();
        await client.query(`INSERT INTO dispatch_log (id, booking_id, partner_id, sent_at, sent_by, status, response_text, payload_json, retry_count, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`, [id, log.booking_id, log.partner_id, log.sent_at||null, log.sent_by||null, log.status, log.response_text||null, log.payload_json, log.retry_count||0]);
        return id;
      }
    });
  } else {
    const db = getSqlite();
    try {
      if (log.id){
        db.prepare(`UPDATE dispatch_log SET sent_at=@sent_at, sent_by=@sent_by, status=@status, response_text=@response_text, payload_json=@payload_json, retry_count=@retry_count WHERE id=@id`).run(log);
        return log.id;
      } else {
        const id = crypto.randomUUID();
        db.prepare(`INSERT INTO dispatch_log (id, booking_id, partner_id, sent_at, sent_by, status, response_text, payload_json, retry_count, created_at) VALUES (@id,@booking_id,@partner_id,@sent_at,@sent_by,@status,@response_text,@payload_json,@retry_count, datetime('now'))`).run({ ...log, id });
        return id;
      }
    } finally { db.close(); }
  }
}

async function latestStatusForBookings(bookingIds){
  if (!Array.isArray(bookingIds) || bookingIds.length === 0) return {};
  if (hasPostgres()){
    return withPg(async (client) => {
      const { rows } = await client.query(`SELECT DISTINCT ON (booking_id) booking_id, status, sent_at, retry_count FROM dispatch_log WHERE booking_id = ANY($1) ORDER BY booking_id, created_at DESC`, [bookingIds]);
      const out = {}; (rows||[]).forEach(r => { out[r.booking_id] = { status: r.status, sent_at: r.sent_at, retry_count: r.retry_count||0 }; });
      return out;
    });
  } else {
    const db = getSqlite();
    try {
      const out = {};
      const stmt = db.prepare(`SELECT booking_id, status, sent_at, retry_count FROM dispatch_log WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1`);
      for (const id of bookingIds){
        const r = stmt.get(id);
        if (r) out[id] = { status: r.status, sent_at: r.sent_at, retry_count: r.retry_count||0 };
      }
      return out;
    } finally { db.close(); }
  }
}

function delay(ms){ return new Promise(res => setTimeout(res, ms)); }

async function attemptSend(logId, payload, attempt){
  try {
    const response_text = DISPATCH_ENABLED ? await sendEmail(payload) : 'dispatch_disabled';
    const now = new Date().toISOString();
    await upsertLog({ id: logId, sent_at: now, sent_by: 'system', status: DISPATCH_ENABLED ? 'success' : 'pending', response_text, payload_json: JSON.stringify(payload), retry_count: attempt });
    return true;
  } catch (e) {
    const errText = (e && e.message) ? e.message : String(e);
    await upsertLog({ id: logId, sent_at: null, sent_by: 'system', status: 'error', response_text: errText, payload_json: JSON.stringify(payload), retry_count: attempt });
    return false;
  }
}

async function processQueue(bookingId, opts = {}){
  const override = !!opts.override;
  const context = await loadBookingAndPartner(bookingId);
  if (!context) return { ok:false, error:'booking_not_found' };
  const partner_id = context.partner_id || context.partner || context.partner_id_text || null;
  const partner_email = context.partner_email || context.email || null;
  if (!partner_id) return { ok:false, error:'partner_missing' };
  if (!partner_email) {
    const payload = toPayload(context, context);
    const logId = await upsertLog({ booking_id: bookingId, partner_id, sent_by: opts.sent_by || 'system', status: 'error', response_text: 'missing_partner_email', payload_json: JSON.stringify(payload), retry_count: 0 });
    return { ok:false, error:'missing_partner_email', logId };
  }
  // idempotency check
  if (!override){
    const seen = await hasSuccessfulLog(bookingId, partner_id);
    if (seen) return { ok:true, idempotent:true };
  }
  const payload = toPayload(context, context);
  const initialStatus = DISPATCH_ENABLED ? 'pending' : 'pending';
  const logId = await upsertLog({ booking_id: bookingId, partner_id, sent_by: opts.sent_by || 'system', status: initialStatus, response_text: null, payload_json: JSON.stringify(payload), retry_count: 0 });
  // Try up to 3 attempts with backoff 0s, 60s, 300s, 900s
  const backoffs = [0, 60_000, 300_000, 900_000];
  (async () => {
    for (let attempt = 0; attempt < backoffs.length; attempt++){
      if (attempt > 0) await delay(backoffs[attempt]);
      const ok = await attemptSend(logId, payload, attempt);
      if (ok) break;
    }
  })().catch(()=>{});
  return { ok:true, queued:true, logId };
}

module.exports = {
  queue: processQueue,
  latestStatusForBookings,
};
