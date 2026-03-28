/**
 * MoveAthens Driver Panel — Public API Routes
 * Auth (phone + optional PIN), profile, vehicle change, PIN management.
 * NOT admin-protected — these are driver-facing endpoints.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const driversData = require('../../src/server/data/moveathens-drivers');
const requestsData = require('../../src/server/data/moveathens-requests');
const driverBroadcast = require('../../services/driverBroadcast');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'driver_panel_ui.json');
const RENDER_PERSISTENT_CONFIG = '/opt/render/project/src/uploads/driver-panel/driver_panel_ui.json';

function loadConfig() {
  try {
    // On Render, read from persistent disk first (admin saves there)
    if (process.env.RENDER && fs.existsSync(RENDER_PERSISTENT_CONFIG)) {
      return JSON.parse(fs.readFileSync(RENDER_PERSISTENT_CONFIG, 'utf8'));
    }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch { return {}; }
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

/** Strip spaces, dashes, parens; auto-add +30 for Greek mobiles */
function normalizePhone(raw) {
  let p = (raw || '').replace(/[\s\-\(\)\.]/g, '').trim();
  if (/^69\d{8}$/.test(p)) p = '+30' + p;
  if (/^30\d{10}$/.test(p)) p = '+' + p;
  return p;
}

module.exports = function registerDriverPanelRoutes(app) {
  // ── Auth: check driver phone ──
  app.get('/api/driver-panel/check-phone', async (req, res) => {
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Auto-unblock if blocked_until expired
      if (driver.is_blocked && driver.blocked_until && new Date(driver.blocked_until) <= new Date()) {
        await driversData.upsertDriver({ ...driver, is_blocked: false, blocked_until: null });
        driver.is_blocked = false;
        driver.blocked_until = null;
      }

      if (driver.is_blocked) return res.status(403).json({ error: 'Driver blocked', blocked_until: driver.blocked_until || null });

      res.json({
        id: driver.id,
        name: driver.name,
        display_name: driver.display_name || null,
        has_pin: !!driver.pin_hash
      });
    } catch (err) {
      console.error('[driver-panel] check-phone:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Block status check (for already logged-in drivers) ──
  app.get('/api/driver-panel/block-status', async (req, res) => {
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Auto-unblock if blocked_until expired
      if (driver.is_blocked && driver.blocked_until && new Date(driver.blocked_until) <= new Date()) {
        await driversData.upsertDriver({ ...driver, is_blocked: false, blocked_until: null });
        driver.is_blocked = false;
        driver.blocked_until = null;
      }

      res.json({ blocked: !!driver.is_blocked, blocked_until: driver.blocked_until || null });
    } catch (err) {
      console.error('[driver-panel] block-status:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Auth: verify phone + optional PIN ──
  app.post('/api/driver-panel/login', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const pin = req.body.pin || '';
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Auto-unblock if blocked_until expired
      if (driver.is_blocked && driver.blocked_until && new Date(driver.blocked_until) <= new Date()) {
        await driversData.upsertDriver({ ...driver, is_blocked: false, blocked_until: null });
        driver.is_blocked = false;
        driver.blocked_until = null;
      }

      if (driver.is_blocked) return res.status(403).json({ error: 'Driver blocked', blocked_until: driver.blocked_until || null });

      if (driver.pin_hash) {
        if (!pin) return res.status(401).json({ error: 'PIN required' });
        if (hashPin(pin) !== driver.pin_hash) return res.status(401).json({ error: 'Wrong PIN' });
      }

      // Parse vehicle_types
      let vehicleTypes = [];
      try { vehicleTypes = JSON.parse(driver.vehicle_types || '[]'); } catch { vehicleTypes = []; }

      res.json({
        id: driver.id,
        name: driver.name,
        display_name: driver.display_name || null,
        phone: driver.phone,
        vehicle_types: vehicleTypes,
        current_vehicle_type: driver.current_vehicle_type || null,
        is_available: driver.is_available !== false
      });
    } catch (err) {
      console.error('[driver-panel] login:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Get driver profile (authenticated by phone) ──
  app.get('/api/driver-panel/profile', async (req, res) => {
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      let vehicleTypes = [];
      try { vehicleTypes = JSON.parse(driver.vehicle_types || '[]'); } catch { vehicleTypes = []; }

      res.json({
        id: driver.id,
        name: driver.name,
        display_name: driver.display_name || null,
        phone: driver.phone,
        vehicle_types: vehicleTypes,
        current_vehicle_type: driver.current_vehicle_type || null,
        is_available: driver.is_available !== false,
        has_pin: !!driver.pin_hash,
        total_trips: driver.total_trips || 0,
        total_revenue: driver.total_revenue || 0
      });
    } catch (err) {
      console.error('[driver-panel] profile:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Update current vehicle type ──
  app.post('/api/driver-panel/vehicle', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const vehicleType = req.body.current_vehicle_type || null;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      await driversData.upsertDriver({ ...driver, current_vehicle_type: vehicleType });
      res.json({ ok: true });
    } catch (err) {
      console.error('[driver-panel] vehicle:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Toggle availability ──
  app.post('/api/driver-panel/availability', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const isAvailable = req.body.is_available !== undefined ? !!req.body.is_available : !!req.body.is_active;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Auto-unblock if blocked_until expired
      if (driver.is_blocked && driver.blocked_until && new Date(driver.blocked_until) <= new Date()) {
        await driversData.upsertDriver({ ...driver, is_blocked: false, blocked_until: null });
        driver.is_blocked = false;
        driver.blocked_until = null;
      }

      // Blocked drivers cannot toggle availability
      if (driver.is_blocked) {
        return res.status(403).json({ error: 'Driver blocked', blocked_until: driver.blocked_until || null });
      }

      await driversData.upsertDriver({ ...driver, is_available: isAvailable, is_active: isAvailable });
      res.json({ ok: true, is_available: isAvailable });
    } catch (err) {
      console.error('[driver-panel] availability:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Set/Change/Remove PIN ──
  app.post('/api/driver-panel/pin', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const currentPin = req.body.current_pin || '';
    const newPin = req.body.new_pin || '';
    const remove = !!req.body.remove;
    if (!phone) return res.status(400).json({ error: 'Phone required' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // If driver has existing PIN and is setting a new one (not removing), verify current
      if (driver.pin_hash && !remove && currentPin) {
        if (hashPin(currentPin) !== driver.pin_hash) return res.status(401).json({ error: 'Wrong PIN' });
      }

      if (remove) {
        // Driver confirms removal — bypass current PIN check when driver is already authenticated
        await driversData.upsertDriver({ ...driver, pin_hash: null });
        return res.json({ ok: true, has_pin: false });
      }

      if (!newPin || newPin.length < 4) {
        return res.status(400).json({ error: 'PIN must be at least 4 digits' });
      }

      await driversData.upsertDriver({ ...driver, pin_hash: hashPin(newPin) });
      res.json({ ok: true, has_pin: true });
    } catch (err) {
      console.error('[driver-panel] pin:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Update driver vehicle_types from driver profile ──
  app.post('/api/driver-panel/vehicle-types', async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const vehicleTypes = req.body.vehicle_types;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    if (!Array.isArray(vehicleTypes)) return res.status(400).json({ error: 'vehicle_types must be array' });

    try {
      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      await driversData.upsertDriver({ ...driver, vehicle_types: JSON.stringify(vehicleTypes) });
      res.json({ ok: true, vehicle_types: vehicleTypes });
    } catch (err) {
      console.error('[driver-panel] vehicle-types:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Get panel config (public, non-admin) ──
  app.get('/api/driver-panel/config', async (req, res) => {
    const config = loadConfig();
    // Include available vehicle types so drivers can pick
    let availableVehicleTypes = [];
    try {
      const maData = require('../../src/server/data/moveathens');
      const allVTs = await maData.getVehicleTypes(true); // active only
      availableVehicleTypes = allVTs.map(vt => ({ id: vt.id, name: vt.name }));
    } catch (_) {}
    res.json({
      general: config.general || {},
      footer: config.footer || {},
      labels: config.labels || {},
      finance: config.finance || {},
      notifications: config.notifications || {},
      sounds: config.sounds || {},
      acceptance: config.acceptance || {},
      availableVehicleTypes
    });
  });

  // ── SSE: real-time events for driver ──
  app.get('/api/driver-panel/sse', (req, res) => {
    const phone = (req.query.phone || '').trim();
    if (!phone) return res.status(400).end();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(':\n\n'); // initial comment to flush

    driverBroadcast.addClient(phone, res);
    req.on('close', () => driverBroadcast.removeClient(phone, res));
  });

  // ── Pending requests for this driver (instant/call only — scheduled are in /scheduled) ──
  app.get('/api/driver-panel/pending', async (req, res) => {
    try {
      const phone = (req.query.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const all = await requestsData.getRequests({ status: 'pending' });
      const sentReqs = await requestsData.getRequests({ status: 'sent' });
      const combined = [...all, ...sentReqs];

      const matching = combined.filter(r => {
        // Only instant/call requests — scheduled go to appointments tab
        if (r.booking_type === 'scheduled') return false;
        if (!r.vehicle_type_id) return true;
        // Driver must have a current vehicle selected
        if (!driver.current_vehicle_type) return false;
        return driver.current_vehicle_type === r.vehicle_type_id;
      });

      // Enrich with coordinates, then build cards
      await Promise.all(matching.map(r => driverBroadcast.enrichRequestCoords(r)));
      const cards = matching.map(r => driverBroadcast.buildCardData(r, 'urgent'));
      res.json({ ok: true, requests: cards });
    } catch (err) {
      console.error('[driver-panel] pending:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Accept a request (first-come-first-served) ──
  app.post('/api/driver-panel/accept/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;
      const phone = (req.body.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      const request = await requestsData.getRequestById(requestId);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (request.status === 'accepted' || request.status === 'completed') {
        return res.status(409).json({ error: 'Already taken', status: request.status });
      }

      if (request.status === 'nodriver' || request.status === 'expired' || request.status === 'cancelled') {
        return res.status(410).json({ error: 'Η διαδρομή δεν είναι πλέον διαθέσιμη', status: request.status });
      }

      const driver = await driversData.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      // Calculate driver → pickup ETA via OSRM (best-effort, non-blocking)
      let etaMinutes = null;
      let etaKm = null;
      const driverLat = parseFloat(req.body.driverLat);
      const driverLng = parseFloat(req.body.driverLng);
      if (driverLat && driverLng) {
        try {
          await driverBroadcast.enrichRequestCoords(request);
          const pickupLat = request.is_arrival ? parseFloat(request.destination_lat) : parseFloat(request.hotel_lat);
          const pickupLng = request.is_arrival ? parseFloat(request.destination_lng) : parseFloat(request.hotel_lng);
          if (pickupLat && pickupLng) {
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${driverLng},${driverLat};${pickupLng},${pickupLat}?overview=false`;
            const osrmRes = await fetch(osrmUrl);
            if (osrmRes.ok) {
              const osrmData = await osrmRes.json();
              if (osrmData.routes && osrmData.routes.length) {
                etaMinutes = Math.max(1, Math.round(osrmData.routes[0].duration / 60));
                etaKm = Math.round(osrmData.routes[0].distance / 100) / 10; // 1 decimal
              }
            }
          }
        } catch (e) {
          console.warn('[driver-panel] ETA calc failed:', e.message);
        }
      }

      const updateData = {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        driver_id: driver.id,
        driver_phone: phone,
        driver_name: driver.display_name || driver.name || ''
      };
      if (etaMinutes != null) updateData.driver_eta_minutes = etaMinutes;
      if (etaKm != null) updateData.driver_eta_km = etaKm;

      await requestsData.updateRequest(requestId, updateData);

      // Update driver totals
      const price = parseFloat(request.price) || 0;
      const commission = parseFloat(request.commission_driver) || 0;
      await driversData.updateDriverTotals(driver.id, price, commission);

      // Notify other drivers via SSE
      driverBroadcast.onRequestAccepted(requestId, phone);

      res.json({ ok: true, request: { ...request, status: 'accepted' }, etaMinutes, etaKm });
    } catch (err) {
      console.error('[driver-panel] accept:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Reject a request (driver declines) ──
  app.post('/api/driver-panel/reject/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;
      const phone = (req.body.phone || '').trim();
      if (!phone) return res.status(400).json({ error: 'Missing phone' });

      // Just remove from this driver's view (no status change)
      driverBroadcast.sendToDriver(phone, 'request-dismissed', { requestId });
      res.json({ ok: true });
    } catch (err) {
      console.error('[driver-panel] reject:', err.message);
      res.status(500).json({ error: 'Server error' });
    }
  });
};
