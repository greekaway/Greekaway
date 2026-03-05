/**
 * MoveAthens Transfer Requests — API Routes
 * Public: POST /api/moveathens/transfer-request  (hotel creates request)
 *         GET  /api/moveathens/driver-accept/:token  (driver sees details)
 *         POST /api/moveathens/driver-accept/:token  (driver accepts)
 *         POST /api/moveathens/driver-complete/:token (driver completes)
 *         GET  /moveathens/driver-accept             (HTML page — no auth)
 * Admin:  GET  /api/admin/moveathens/requests
 *         PUT  /api/admin/moveathens/requests/:id
 *         DELETE /api/admin/moveathens/requests/:id
 *         POST /api/admin/moveathens/requests/:id/send-driver (set driver phone + generate link)
 * Timer:  Auto-expire orphan requests (pending > 1h, every 5 min)
 */
'use strict';

const path = require('path');
const rateLimit = require('express-rate-limit');
const requestsData = require('../../src/server/data/moveathens-requests');
const driversData = require('../../src/server/data/moveathens-drivers');
const maLogger = require('../../services/maLogger');
const flightTracker = require('../../services/flightTracker');
const { calculateTariff } = require('./moveathens-helpers');

const DRIVER_ACCEPT_FILE = path.join(__dirname, '..', 'pages', 'driver-accept.html');

// Rate limiter for public driver endpoints (per IP)
const driverRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

module.exports = function registerRequestRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // In production use the real domain; locally use .env BASE_URL or fallback
  const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://www.moveathens.com'
    : (process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 3101}`);

  // Helper: get commissions from pricing data
  const getCommissions = async (originZoneId, destinationId, vehicleTypeId, tariff) => {
    try {
      const moveathensData = require('../../src/server/data/moveathens');
      const prices = await moveathensData.getPrices({
        origin_zone_id: originZoneId,
        destination_id: destinationId,
        vehicle_type_id: vehicleTypeId,
        tariff: tariff || 'day'
      });
      if (prices && prices.length > 0) {
        const p = prices[0];
        return {
          price: parseFloat(p.price) || 0,
          commission_driver: parseFloat(p.commission_driver) || 0,
          commission_hotel: parseFloat(p.commission_hotel) || 0,
          commission_service: parseFloat(p.commission_service) || 0
        };
      }
    } catch (e) {
      console.error('[ma-requests] getCommissions error:', e.message);
    }
    return null;
  };

  // ========================================
  // PUBLIC: Hotel creates transfer request
  // ========================================
  app.post('/api/moveathens/transfer-request', async (req, res) => {
    try {
      const body = req.body || {};
      console.log('[ma-requests] New transfer request from hotel:', body.hotel_name || '(unknown)');

      // Server-side tariff calculation — never trust client
      let tariff = body.tariff || 'day';
      try {
        const moveathensData = require('../../src/server/data/moveathens');
        const config = await moveathensData.getConfig();
        if (body.booking_type === 'scheduled' && body.scheduled_date && body.scheduled_time) {
          tariff = calculateTariff(new Date(`${body.scheduled_date}T${body.scheduled_time}`), config);
        } else {
          tariff = calculateTariff(new Date(), config);
        }
      } catch (e) {
        console.error('[ma-requests] tariff calc fallback:', e.message);
      }

      // Look up commissions from pricing table
      const commissions = await getCommissions(
        body.origin_zone_id, body.destination_id,
        body.vehicle_type_id, tariff
      );

      const record = await requestsData.createRequest({
        origin_zone_id: body.origin_zone_id || '',
        origin_zone_name: body.origin_zone_name || '',
        hotel_name: body.hotel_name || '',
        hotel_address: body.hotel_address || '',
        hotel_municipality: body.hotel_municipality || '',
        destination_id: body.destination_id || '',
        destination_name: body.destination_name || '',
        vehicle_type_id: body.vehicle_type_id || '',
        vehicle_name: body.vehicle_name || '',
        tariff: tariff,
        booking_type: body.booking_type || 'instant',
        scheduled_date: body.scheduled_date || '',
        scheduled_time: body.scheduled_time || '',
        passenger_name: body.passenger_name || '',
        room_number: body.room_number || '',
        notes: body.notes || '',
        flight_number: body.flight_number || '',
        passengers: body.passengers || 0,
        luggage_large: body.luggage_large || 0,
        luggage_medium: body.luggage_medium || 0,
        luggage_cabin: body.luggage_cabin || 0,
        payment_method: body.payment_method || 'cash',
        price: commissions ? commissions.price : (parseFloat(body.price) || 0),
        commission_driver: commissions ? commissions.commission_driver : 0,
        commission_hotel: commissions ? commissions.commission_hotel : 0,
        commission_service: commissions ? commissions.commission_service : 0,
        orderer_phone: body.orderer_phone || '',
        is_arrival: body.is_arrival === true || body.is_arrival === 'true'
      });

      console.log('[ma-requests] Request created:', record.id, 'status:', record.status);

      // ── Flight tracking: if arrival + flight number, store data from 1st AeroAPI call ──
      if (record.is_arrival && record.flight_number) {
        try {
          const flightResult = await flightTracker.lookupFlight(record.flight_number, record.scheduled_date);
          if (flightResult.ok && flightResult.flight) {
            const f = flightResult.flight;
            await requestsData.updateRequest(record.id, {
              flight_status:         f.flight_status,
              flight_airline:        f.flight_airline,
              flight_origin:         f.flight_origin,
              flight_eta:            f.flight_eta || null,
              flight_departure:      f.flight_departure || null,
              flight_gate:           f.flight_gate || '',
              flight_terminal:       f.flight_terminal || '',
              flight_tracking_active: true,
              flight_last_checked:   new Date().toISOString(),
              flight_raw_json:       JSON.stringify(f.raw)
            });
            console.log('[ma-requests] Flight tracking activated for', record.id, ':', f.flight_airline, f.flight_origin, '→ ETA', f.flight_eta);
          } else {
            console.warn('[ma-requests] Flight lookup failed for', record.flight_number, ':', flightResult.error);
          }
        } catch (flightErr) {
          console.warn('[ma-requests] Flight lookup error (non-blocking):', flightErr.message);
        }
      }

      return res.json({ ok: true, requestId: record.id });
    } catch (err) {
      console.error('[ma-requests] POST /transfer-request failed:', err.message);
      return res.status(500).json({ error: 'Failed to create request' });
    }
  });

  // ========================================
  // PUBLIC: Driver views trip details via token
  // ========================================
  app.get('/api/moveathens/driver-accept/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found or expired' });
      if (request.status === 'expired' || request.status === 'cancelled') {
        return res.status(410).json({ error: 'Request expired' });
      }

      // Look up hotel phone from zone data for WhatsApp "arrived" message
      // Prefer orderer_phone (the specific employee who placed the order)
      // but validate it exists in ma_hotel_phones for this zone
      let hotel_phone = '';
      if (request.origin_zone_id) {
        try {
          const moveathensData = require('../../src/server/data/moveathens');
          const hotelPhones = await moveathensData.getHotelPhones(request.origin_zone_id);
          if (request.orderer_phone) {
            // Normalize orderer_phone for comparison
            const normOrderer = request.orderer_phone.replace(/[\s\-().]/g, '').replace(/^\+30/, '').replace(/^0030/, '');
            const matched = (hotelPhones || []).find(p => {
              const normStored = p.phone.replace(/[\s\-().]/g, '').replace(/^\+30/, '').replace(/^0030/, '');
              return normStored === normOrderer;
            });
            if (matched) {
              // Use the properly formatted phone from DB
              hotel_phone = matched.phone;
            }
          }
          // Fallback: if orderer_phone not matched, use first phone from zone's phones
          if (!hotel_phone && hotelPhones && hotelPhones.length > 0) {
            hotel_phone = hotelPhones[0].phone;
          }
          // Last fallback: zone's main phone field
          if (!hotel_phone) {
            const zones = await moveathensData.getZones({ activeOnly: false });
            const zone = zones.find(z => z.id === request.origin_zone_id);
            if (zone && zone.phone) hotel_phone = zone.phone;
          }
        } catch (e) { /* ignore */ }
      }

      // Look up destination coordinates for navigation
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

      // Look up hotel (zone) coordinates for navigation to pickup
      let hotel_lat = null, hotel_lng = null;
      if (request.origin_zone_id) {
        try {
          const zones = await moveathensData.getZones({ activeOnly: false });
          const zone = zones.find(z => z.id === request.origin_zone_id);
          if (zone && zone.lat && zone.lng) {
            hotel_lat = zone.lat;
            hotel_lng = zone.lng;
          }
        } catch (e) { /* ignore */ }
      }

      // Look up known driver name from driver profile (for pre-fill)
      let known_driver_name = '';
      if (request.driver_phone) {
        try {
          const driverProfile = await driversData.getDriverByPhone(request.driver_phone);
          if (driverProfile && driverProfile.name && driverProfile.name !== driverProfile.phone) {
            known_driver_name = driverProfile.name;
          }
        } catch (e) { /* ignore */ }
      }

      // Look up IRIS payment phone from admin config
      let iris_phone = '';
      try {
        const moveathensData = require('../../src/server/data/moveathens');
        const cfg = await moveathensData.getConfig();
        iris_phone = cfg.irisPhone || '';
      } catch (e) { /* ignore */ }

      // Return trip info (no sensitive admin data)
      return res.json({
        id: request.id,
        hotel_name: request.hotel_name,
        hotel_address: request.hotel_address || '',
        hotel_municipality: request.hotel_municipality || '',
        hotel_phone: hotel_phone,
        driver_name: request.driver_name || known_driver_name || '',
        destination_name: request.destination_name,
        destination_lat,
        destination_lng,
        hotel_lat,
        hotel_lng,
        vehicle_name: request.vehicle_name,
        tariff: request.tariff,
        booking_type: request.booking_type,
        scheduled_date: request.scheduled_date,
        scheduled_time: request.scheduled_time,
        passenger_name: request.passenger_name,
        room_number: request.room_number || '',
        notes: request.notes || '',
        flight_number: request.flight_number || '',
        flight_status: request.flight_status || '',
        flight_airline: request.flight_airline || '',
        flight_origin: request.flight_origin || '',
        flight_eta: request.flight_eta || null,
        flight_departure: request.flight_departure || null,
        flight_actual_arrival: request.flight_actual_arrival || null,
        flight_gate: request.flight_gate || '',
        flight_terminal: request.flight_terminal || '',
        flight_tracking_active: request.flight_tracking_active || false,
        passengers: request.passengers,
        luggage_large: request.luggage_large || 0,
        luggage_medium: request.luggage_medium || 0,
        luggage_cabin: request.luggage_cabin || 0,
        price: request.price,
        commission_driver: request.commission_driver,
        commission_hotel: request.commission_hotel || 0,
        commission_service: request.commission_service,
        payment_method: request.payment_method,
        status: request.status,
        is_arrival: request.is_arrival ?? false,
        iris_phone: iris_phone
      });
    } catch (err) {
      maLogger.log('error', 'driver-view', { token: req.params.token, reason: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // PUBLIC: Driver accepts the trip
  // ========================================
  app.post('/api/moveathens/driver-accept/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (request.status === 'accepted' || request.status === 'confirmed') {
        return res.json({ ok: true, already: true, message: 'Already accepted' });
      }
      if (request.status === 'expired' || request.status === 'cancelled') {
        return res.status(410).json({ error: 'Request expired or cancelled' });
      }

      const driverPhone = request.driver_phone;
      const driverName = (req.body && req.body.driver_name) || '';

      // Find or create driver profile
      const driver = await driversData.findOrCreateByPhone(driverPhone, driverName);
      if (!driver) {
        return res.status(400).json({ error: 'Driver phone not set on this request' });
      }

      // Update driver name if provided and currently empty
      if (driverName && (!driver.name || driver.name === driver.phone)) {
        await driversData.upsertDriver({ ...driver, name: driverName });
      }

      // Update request to accepted (include driver_name for display)
      const finalDriverName = driverName || driver.name || driver.phone || '';
      const updated = await requestsData.updateRequest(request.id, {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        driver_id: driver.id,
        driver_name: finalDriverName
      });

      // Update driver totals (revenue = price, owed = service commission)
      await driversData.updateDriverTotals(
        driver.id,
        parseFloat(request.price) || 0,
        parseFloat(request.commission_service) || 0
      );

      console.log('[ma-requests] Request', request.id, 'ACCEPTED by driver', driver.id, driver.phone);
      return res.json({ ok: true, message: 'Trip accepted successfully' });
    } catch (err) {
      maLogger.log('error', 'driver-accept', { token: req.params.token, reason: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // PUBLIC: Driver marks trip as completed
  // ========================================
  app.post('/api/moveathens/driver-complete/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (request.status === 'completed') {
        return res.json({ ok: true, already: true, message: 'Already completed' });
      }
      if (request.status !== 'accepted' && request.status !== 'confirmed') {
        return res.status(400).json({ error: 'Trip must be accepted before completing' });
      }

      await requestsData.updateRequest(request.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      console.log('[ma-requests] Request', request.id, 'COMPLETED by driver');
      return res.json({ ok: true, message: 'Trip completed' });
    } catch (err) {
      maLogger.log('error', 'driver-complete', { token: req.params.token, reason: err.message, stack: err.stack });
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // ADMIN: List all requests
  // ========================================
  app.get('/api/admin/moveathens/requests', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.driver_id) filters.driver_id = req.query.driver_id;
      if (req.query.limit) filters.limit = parseInt(req.query.limit, 10);
      const requests = await requestsData.getRequests(filters);
      return res.json({ requests });
    } catch (err) {
      console.error('[ma-requests] GET /admin/requests failed:', err.message);
      return res.status(500).json({ error: 'Failed to load requests' });
    }
  });

  // ========================================
  // ADMIN: Get single request
  // ========================================
  app.get('/api/admin/moveathens/requests/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const request = await requestsData.getRequestById(req.params.id);
      if (!request) return res.status(404).json({ error: 'Not found' });
      return res.json(request);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // ADMIN: Update request (e.g. change status)
  // ========================================
  app.put('/api/admin/moveathens/requests/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const allowed = ['status', 'driver_phone', 'driver_id', 'notes',
        'commission_driver', 'commission_hotel', 'commission_service', 'price', 'is_arrival'];
      const updates = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      const updated = await requestsData.updateRequest(req.params.id, updates);
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json(updated);
    } catch (err) {
      console.error('[ma-requests] PUT /admin/requests/:id failed:', err.message);
      return res.status(500).json({ error: 'Update failed' });
    }
  });

  // ========================================
  // ADMIN: Delete request
  // ========================================
  app.delete('/api/admin/moveathens/requests/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      await requestsData.deleteRequest(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  // ========================================
  // ADMIN: Send driver link (set phone + generate WhatsApp URL)
  // ========================================
  app.post('/api/admin/moveathens/requests/:id/send-driver', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { driver_phone } = req.body || {};
      if (!driver_phone) return res.status(400).json({ error: 'driver_phone required' });

      const request = await requestsData.getRequestById(req.params.id);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      // Clean phone — keep + for storage
      const cleanPhone = driver_phone.replace(/[^0-9+]/g, '');
      // wa.me needs digits only (no +)
      const waPhone = cleanPhone.replace(/^\+/, '');

      // Update request with driver phone and mark as sent
      const updated = await requestsData.updateRequest(request.id, {
        driver_phone: cleanPhone,
        status: 'sent',
        sent_at: new Date().toISOString()
      });

      // Build the accept link
      // On production (moveathens.com) the page map serves /driver-accept directly
      // On localhost we need /moveathens/driver-accept
      const isProduction = process.env.NODE_ENV === 'production';
      const acceptPath = isProduction ? '/driver-accept' : '/moveathens/driver-accept';
      const acceptUrl = `${BASE_URL}${acceptPath}?token=${request.accept_token}`;

      // ── Use existing flight data from DB (no API call — saves AeroAPI cost) ──
      // The 2nd & final API call is scheduled by the background poller
      // X minutes before ETA (configurable in admin panel).

      // Look up pickup-point coordinates for Google Maps link
      let pickupMapsUrl = '';
      try {
        const moveathensData = require('../../src/server/data/moveathens');
        if (request.is_arrival && request.destination_id) {
          // Arrival: driver picks up from destination (airport etc.)
          const dests = await moveathensData.getDestinations({ activeOnly: false });
          const dest = dests.find(d => d.id === request.destination_id);
          if (dest && dest.lat && dest.lng) {
            pickupMapsUrl = `https://maps.google.com/?q=${dest.lat},${dest.lng}`;
          } else if (request.destination_name) {
            pickupMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(request.destination_name)}`;
          }
        } else {
          // Departure: driver picks up from hotel — use zone coordinates if available
          let hotelLat = null, hotelLng = null;
          if (request.origin_zone_id) {
            try {
              const zones = await moveathensData.getZones({ activeOnly: false });
              const zone = zones.find(z => z.id === request.origin_zone_id);
              if (zone && zone.lat && zone.lng) {
                hotelLat = zone.lat;
                hotelLng = zone.lng;
              }
            } catch (e) { /* ignore */ }
          }
          if (hotelLat && hotelLng) {
            pickupMapsUrl = `https://maps.google.com/?q=${hotelLat},${hotelLng}`;
          } else {
            const addr = request.hotel_address || '';
            const muni = request.hotel_municipality || '';
            const hotelName = request.hotel_name || '';
            const query = addr ? `${addr}, ${muni}`.trim().replace(/,\s*$/, '') : hotelName;
            if (query) {
              pickupMapsUrl = `https://maps.google.com/?q=${encodeURIComponent(query)}`;
            }
          }
        }
      } catch (e) { /* ignore */ }

      // Build WhatsApp message
      let scheduleText = '';
      if (request.scheduled_date) {
        const dayNames = ['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
        const monthNames = ['Ιανουαρίου','Φεβρουαρίου','Μαρτίου','Απριλίου','Μαΐου','Ιουνίου','Ιουλίου','Αυγούστου','Σεπτεμβρίου','Οκτωβρίου','Νοεμβρίου','Δεκεμβρίου'];
        const dt = new Date(`${request.scheduled_date}T${request.scheduled_time || '00:00'}`);
        const dayName = dayNames[dt.getDay()];
        const monthName = monthNames[dt.getMonth()];
        let timeStr = '';
        if (request.scheduled_time) {
          const [hh, mm] = request.scheduled_time.split(':');
          const h = parseInt(hh, 10);
          const suffix = h < 12 ? 'πμ' : 'μμ';
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          timeStr = ` ώρα ${h12}:${mm} ${suffix}`;
        }
        scheduleText = `\n📅 ${dayName} ${dt.getDate()}, ${monthName}${timeStr}`;
      } else if (request.booking_type === 'instant' && request.flight_eta && request.flight_status !== 'landed') {
        // Auto-upgrade: instant booking with future flight ETA → show ETA time (Athens TZ!)
        const etaDt = new Date(request.flight_eta);
        if (etaDt.getTime() > Date.now()) {
          const etaStr = etaDt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' });
          scheduleText = `\n📅 ETA πτήσης: ${etaStr}`;
        } else {
          scheduleText = `\n⚡ Άμεσα (πτήση προσγειώθηκε)`;
        }
      } else if (request.booking_type === 'instant') {
        scheduleText = `\n⚡ Άμεσα`;
      }

      const msg = [
        `🚗 *Νέα Διαδρομή MoveAthens*`,
        ``,
        request.is_arrival
          ? `✈️ Άφιξη : ${request.destination_name || '—'}`
          : `🏨 ${request.hotel_name || '—'}`,        
        request.is_arrival
          ? `🏨 Προς: ${request.hotel_name || '—'}`
          : `🎯 ${request.destination_name || '—'}`,
        request.flight_number ? `🛫 Πτήση: ${request.flight_number}${request.flight_airline ? ` (${request.flight_airline})` : ''}` : '',
        request.flight_origin ? `📍 Από: ${request.flight_origin}` : '',
        request.flight_eta ? `⏰ ETA: ${new Date(request.flight_eta).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Athens' })}${request.flight_status === 'en_route' ? ' — Σε πτήση ✈️' : request.flight_status === 'landed' ? ' — Προσγειώθηκε ✅' : request.flight_status === 'scheduled' ? ' — Προγραμματισμένη' : ''}` : '',
        // Only show scheduleText if it's NOT a duplicate of the ETA line above
        (request.flight_eta && scheduleText.includes('ETA')) ? '' : scheduleText,
        ``,
        `👆 Πατήστε παρακάτω για αποδοχή:`,
        ``,
        `${acceptUrl}`
      ].filter(l => l !== undefined).join('\n');

      const waUrl = `https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(msg)}`;

      return res.json({
        ok: true,
        request: updated,
        whatsapp_url: waUrl,
        accept_url: acceptUrl
      });
    } catch (err) {
      console.error('[ma-requests] send-driver failed:', err.message);
      return res.status(500).json({ error: 'Send failed' });
    }
  });

  // ========================================
  // PUBLIC: Flight lookup (used by hotel form for live validation)
  // ========================================
  app.get('/api/moveathens/flight-lookup/:ident', driverRateLimit, async (req, res) => {
    try {
      const ident = req.params.ident;
      const scheduledDate = req.query.date || '';
      if (!ident || ident.length < 3) {
        return res.status(400).json({ ok: false, error: 'Invalid flight number' });
      }
      const result = await flightTracker.lookupFlight(ident, scheduledDate);
      if (!result.ok) {
        return res.json({ ok: false, error: result.error });
      }
      // Return only safe fields (no raw AeroAPI data to client)
      const f = result.flight;
      return res.json({
        ok: true,
        fromCache: result.fromCache || false,
        flight: {
          ident:    f.flight_ident,
          status:   f.flight_status,
          airline:  f.flight_airline,
          origin:   f.flight_origin,
          origin_code: f.flight_origin_code,
          eta:      f.flight_eta,
          gate:     f.flight_gate,
          terminal: f.flight_terminal
        }
      });
    } catch (err) {
      console.error('[ma-requests] flight-lookup error:', err.message);
      return res.status(500).json({ ok: false, error: 'Lookup failed' });
    }
  });

  // ========================================
  // PUBLIC: Flight status for driver page (live polling)
  // ========================================
  app.get('/api/moveathens/flight-status/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Not found' });

      // Return DB data only — no AeroAPI calls here.
      // Flight data is populated by: 1) initial hotel lookup, 2) single poller refresh.

      return res.json({
        flight_number:         request.flight_number || '',
        flight_status:         request.flight_status || '',
        flight_airline:        request.flight_airline || '',
        flight_origin:         request.flight_origin || '',
        flight_eta:            request.flight_eta || null,
        flight_departure:      request.flight_departure || null,
        flight_actual_arrival: request.flight_actual_arrival || null,
        flight_gate:           request.flight_gate || '',
        flight_terminal:       request.flight_terminal || '',
        flight_tracking_active: request.flight_tracking_active || false
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // PUBLIC: Driver accept page (HTML — no auth)
  // ========================================
  app.get('/moveathens/driver-accept', (req, res) => {
    try { return res.sendFile(DRIVER_ACCEPT_FILE); }
    catch (_) { return res.status(404).send('Not found'); }
  });

  // ========================================
  // Auto-expire orphan requests (pending > 1 hour, check every 5 min)
  // ========================================
  setInterval(() => {
    requestsData.expireOldRequests(3600000)
      .then(n => { if (n) console.log(`[ma-requests] expired ${n} orphan request(s)`); })
      .catch(e => console.warn('[ma-requests] expire error:', e.message));
  }, 5 * 60 * 1000);

  // ── Start flight tracking background poller ──
  const moveathensData = require('../../src/server/data/moveathens');
  flightTracker.startPoller({
    getConfig: () => moveathensData.getConfig(),
    requestsData: requestsData
  });

  console.log('[ma-requests] Routes mounted (incl. driver-accept page + auto-expiry + flight poller)');
};
