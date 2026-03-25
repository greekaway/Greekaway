/**
 * MoveAthens Driver Panel — Push + Active Route API
 * VAPID key, subscribe, send push, active-route page + status updates.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const driversData = require('../../src/server/data/moveathens-drivers');
const requestsData = require('../../src/server/data/moveathens-requests');

const SUBS_FILE = path.join(__dirname, '..', 'data', 'push_subscriptions.json');
const ACTIVE_ROUTE_FILE = path.join(__dirname, '..', 'pages', 'driver-active-route.html');

// ── Push subscription store (JSON fallback) ──

function loadSubs() {
  try { if (fs.existsSync(SUBS_FILE)) return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')); }
  catch { /* */ }
  return [];
}

function saveSubs(subs) {
  const dir = path.dirname(SUBS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf8');
}

// ── Web-push (lazy-loaded, only if available) ──

let webpush = null;
function getWebPush() {
  if (webpush) return webpush;
  try {
    webpush = require('web-push');
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails('mailto:info@greekaway.com', publicKey, privateKey);
    }
    return webpush;
  } catch {
    return null;
  }
}

module.exports = function registerDriverPanelPush(app) {

  // ── VAPID public key ──
  app.get('/api/driver-panel/push/vapid-key', (req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    res.json({ publicKey });
  });

  // ── Subscribe push ──
  app.post('/api/driver-panel/push/subscribe', async (req, res) => {
    try {
      const phone = (req.body.phone || '').trim();
      const subscription = req.body.subscription;
      if (!phone || !subscription?.endpoint) {
        return res.status(400).json({ error: 'Missing phone or subscription' });
      }

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const subs = loadSubs();
      // Remove old subscription for same endpoint
      const filtered = subs.filter(s => s.endpoint !== subscription.endpoint);
      filtered.push({
        driver_id: driver.id,
        driver_phone: phone,
        endpoint: subscription.endpoint,
        keys: JSON.stringify(subscription.keys || {}),
        created_at: new Date().toISOString()
      });
      saveSubs(filtered);

      res.json({ ok: true });
    } catch (err) {
      console.error('[driver-panel] push subscribe:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Send push to driver(s) ──
  app.post('/api/driver-panel/push/send', async (req, res) => {
    try {
      const { phone, title, body, data, tag } = req.body;
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const wp = getWebPush();
      if (!wp) return res.status(503).json({ error: 'Push not configured' });

      const subs = loadSubs();
      const driverSubs = subs.filter(s => s.driver_phone === phone);
      if (driverSubs.length === 0) return res.json({ ok: true, sent: 0 });

      const payload = JSON.stringify({ title, body, tag, data, urgent: true });
      let sent = 0;
      const expired = [];

      for (const sub of driverSubs) {
        try {
          const keys = typeof sub.keys === 'string' ? JSON.parse(sub.keys) : sub.keys;
          await wp.sendNotification({ endpoint: sub.endpoint, keys }, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expired.push(sub.endpoint);
          }
        }
      }

      // Cleanup expired subscriptions
      if (expired.length > 0) {
        const cleaned = subs.filter(s => !expired.includes(s.endpoint));
        saveSubs(cleaned);
      }

      res.json({ ok: true, sent });
    } catch (err) {
      console.error('[driver-panel] push send:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Active Route: serve HTML page ──
  app.get('/moveathens/active-route', (req, res) => {
    if (fs.existsSync(ACTIVE_ROUTE_FILE)) {
      return res.sendFile(ACTIVE_ROUTE_FILE);
    }
    res.status(404).send('Active route page not found');
  });

  // ── Active Route: get trip data (with coordinates for navigation) ──
  app.get('/api/driver-panel/active-route/:requestId', async (req, res) => {
    try {
      const request = await requestsData.getRequestById(req.params.requestId);
      if (!request) return res.status(404).json({ error: 'Not found' });

      // Look up hotel phone (same logic as driver-accept endpoint)
      let hotel_phone = '';
      if (request.origin_zone_id) {
        try {
          const moveathensData = require('../../src/server/data/moveathens');
          const hotelPhones = await moveathensData.getHotelPhones(request.origin_zone_id);
          if (request.orderer_phone) {
            const normOrderer = request.orderer_phone.replace(/[\s\-().]/g, '').replace(/^\+30/, '').replace(/^0030/, '');
            const matched = (hotelPhones || []).find(p => {
              const normStored = p.phone.replace(/[\s\-().]/g, '').replace(/^\+30/, '').replace(/^0030/, '');
              return normStored === normOrderer;
            });
            if (matched) hotel_phone = matched.phone;
          }
          if (!hotel_phone && hotelPhones && hotelPhones.length > 0) {
            hotel_phone = hotelPhones[0].phone;
          }
          if (!hotel_phone) {
            const zones = await moveathensData.getZones({ activeOnly: false });
            const zone = zones.find(z => z.id === request.origin_zone_id);
            if (zone && zone.phone) hotel_phone = zone.phone;
          }
        } catch (e) { /* ignore */ }
      }

      // Look up destination coordinates
      let destination_lat = null, destination_lng = null;
      if (request.destination_id) {
        try {
          const moveathensData = require('../../src/server/data/moveathens');
          const dests = await moveathensData.getDestinations({ activeOnly: false });
          const dest = dests.find(d => d.id === request.destination_id);
          if (dest) {
            destination_lat = dest.lat || null;
            destination_lng = dest.lng || null;
          }
        } catch (e) { /* ignore */ }
      }

      // Look up hotel (zone) coordinates
      let hotel_lat = null, hotel_lng = null;
      if (request.origin_zone_id) {
        try {
          const moveathensData = require('../../src/server/data/moveathens');
          const zones = await moveathensData.getZones({ activeOnly: false });
          const zone = zones.find(z => z.id === request.origin_zone_id);
          if (zone) {
            hotel_lat = zone.lat || null;
            hotel_lng = zone.lng || null;
          }
        } catch (e) { /* ignore */ }
      }

      res.json({
        ok: true,
        trip: {
          id: request.id,
          origin: request.is_arrival ? request.destination_name : (request.hotel_name || request.origin_zone_name),
          destination: request.is_arrival ? (request.hotel_name || request.origin_zone_name) : request.destination_name,
          destination_name: request.destination_name,
          hotel_name: request.hotel_name,
          hotel_address: request.hotel_address,
          hotel_municipality: request.hotel_municipality || '',
          hotel_phone,
          hotel_lat,
          hotel_lng,
          destination_lat,
          destination_lng,
          room_number: request.room_number,
          passenger_name: request.passenger_name,
          passengers: request.passengers,
          luggage_large: request.luggage_large,
          luggage_medium: request.luggage_medium,
          luggage_cabin: request.luggage_cabin,
          flight_number: request.flight_number,
          notes: request.notes,
          price: request.price,
          is_arrival: request.is_arrival,
          channel: request.channel || 'whatsapp',
          scheduled_date: request.scheduled_date,
          scheduled_time: request.scheduled_time,
          status: request.status,
          orderer_phone: request.orderer_phone,
          accept_token: request.accept_token
        }
      });
    } catch (err) {
      console.error('[driver-panel] active-route:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Active Route: update status (arrived / completed) ──
  app.post('/api/driver-panel/active-route/:requestId/status', async (req, res) => {
    try {
      const { requestId } = req.params;
      const { status, phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const validStatuses = ['arrived', 'completed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const request = await requestsData.getRequestById(requestId);
      if (!request) return res.status(404).json({ error: 'Not found' });

      const updates = { status };
      if (status === 'completed') {
        updates.confirmed_at = new Date().toISOString();
      }

      await requestsData.updateRequest(requestId, updates);
      res.json({ ok: true, status });
    } catch (err) {
      console.error('[driver-panel] active-route status:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });
};
