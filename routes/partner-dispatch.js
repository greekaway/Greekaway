const express = require('express');
const router = express.Router();
// Use global JSON parser installed in server.js

// Admin basic auth (reuse env vars)
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
function checkAdminAuth(req) {
  try { if (req && req.session && req.session.admin === true) return true; } catch(_){ }
  // Accept cookie session from /admin-login
  try {
    const h = req.headers.cookie || '';
    if (h) {
      const cookies = h.split(';').reduce((acc, part) => { const i=part.indexOf('='); if(i!==-1){ acc[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } return acc; }, {});
      if (cookies.adminSession === 'true' || cookies.adminSession === '1' || cookies.adminSession === 'yes') return true;
    }
  } catch(_){ }
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

const dispatchService = require('../services/dispatchService');

// Admin resend endpoint
router.post('/admin/resend', async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const booking_id = (req.body && req.body.booking_id) || (req.query && req.query.booking_id);
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });
    const out = await dispatchService.queue(String(booking_id), { override: true, sent_by: 'admin' });
    return res.json({ ok: true, result: out });
  } catch (e) {
    console.error('partner-dispatch admin/resend error', e && e.message ? e.message : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Admin status lookup for many bookings: POST { booking_ids: [] } or GET ?ids=comma
router.post('/admin/status', async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const ids = Array.isArray(req.body && req.body.booking_ids) ? req.body.booking_ids.map(String) : [];
    const map = await dispatchService.latestStatusForBookings(ids);
    return res.json({ ok: true, map });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

router.get('/admin/status', async (req, res) => {
  if (!checkAdminAuth(req)) { return res.status(403).send('Forbidden'); }
  try {
    const ids = (req.query.ids || '').toString().split(',').map(s => s.trim()).filter(Boolean);
    const map = await dispatchService.latestStatusForBookings(ids);
    return res.json({ ok: true, map });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
