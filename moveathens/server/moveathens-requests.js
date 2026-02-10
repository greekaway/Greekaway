/**
 * MoveAthens Transfer Requests — API Routes
 * Public: POST /api/moveathens/transfer-request  (hotel creates request)
 *         GET  /api/moveathens/driver-accept/:token  (driver sees details)
 *         POST /api/moveathens/driver-accept/:token  (driver accepts)
 * Admin:  GET  /api/admin/moveathens/requests
 *         PUT  /api/admin/moveathens/requests/:id
 *         DELETE /api/admin/moveathens/requests/:id
 *         POST /api/admin/moveathens/requests/:id/send-driver (set driver phone + generate link)
 */
'use strict';

const requestsData = require('../../src/server/data/moveathens-requests');
const driversData = require('../../src/server/data/moveathens-drivers');

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

      // Look up commissions from pricing table
      const commissions = await getCommissions(
        body.origin_zone_id, body.destination_id,
        body.vehicle_type_id, body.tariff
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
        tariff: body.tariff || 'day',
        booking_type: body.booking_type || 'instant',
        scheduled_date: body.scheduled_date || '',
        scheduled_time: body.scheduled_time || '',
        passenger_name: body.passenger_name || '',
        passengers: body.passengers || 0,
        luggage_large: body.luggage_large || 0,
        luggage_medium: body.luggage_medium || 0,
        luggage_cabin: body.luggage_cabin || 0,
        payment_method: body.payment_method || 'cash',
        price: commissions ? commissions.price : (parseFloat(body.price) || 0),
        commission_driver: commissions ? commissions.commission_driver : 0,
        commission_hotel: commissions ? commissions.commission_hotel : 0,
        commission_service: commissions ? commissions.commission_service : 0
      });

      console.log('[ma-requests] Request created:', record.id, 'status:', record.status);
      return res.json({ ok: true, requestId: record.id });
    } catch (err) {
      console.error('[ma-requests] POST /transfer-request failed:', err.message);
      return res.status(500).json({ error: 'Failed to create request' });
    }
  });

  // ========================================
  // PUBLIC: Driver views trip details via token
  // ========================================
  app.get('/api/moveathens/driver-accept/:token', async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found or expired' });
      if (request.status === 'expired' || request.status === 'cancelled') {
        return res.status(410).json({ error: 'Request expired' });
      }

      // Return trip info (no sensitive admin data)
      return res.json({
        id: request.id,
        hotel_name: request.hotel_name,
        hotel_address: request.hotel_address || '',
        hotel_municipality: request.hotel_municipality || '',
        destination_name: request.destination_name,
        vehicle_name: request.vehicle_name,
        tariff: request.tariff,
        booking_type: request.booking_type,
        scheduled_date: request.scheduled_date,
        scheduled_time: request.scheduled_time,
        passenger_name: request.passenger_name,
        passengers: request.passengers,
        luggage_large: request.luggage_large || 0,
        luggage_medium: request.luggage_medium || 0,
        luggage_cabin: request.luggage_cabin || 0,
        price: request.price,
        commission_driver: request.commission_driver,
        commission_hotel: request.commission_hotel || 0,
        commission_service: request.commission_service,
        payment_method: request.payment_method,
        status: request.status
      });
    } catch (err) {
      console.error('[ma-requests] GET driver-accept failed:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // PUBLIC: Driver accepts the trip
  // ========================================
  app.post('/api/moveathens/driver-accept/:token', async (req, res) => {
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
      console.error('[ma-requests] POST driver-accept failed:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // PUBLIC: Driver marks trip as completed
  // ========================================
  app.post('/api/moveathens/driver-complete/:token', async (req, res) => {
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
        updated_at: new Date().toISOString()
      });

      console.log('[ma-requests] Request', request.id, 'COMPLETED by driver');
      return res.json({ ok: true, message: 'Trip completed' });
    } catch (err) {
      console.error('[ma-requests] POST driver-complete failed:', err.message);
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
        'commission_driver', 'commission_hotel', 'commission_service', 'price'];
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

      // Build WhatsApp message
      const tariffLabel = request.tariff === 'night' ? 'Νυχτερινή' : 'Ημερήσια';
      let scheduleText = request.booking_type === 'instant' ? '⚡ ΑΜΕΣΑ' : '';
      if (request.scheduled_date) scheduleText = `📅 ${request.scheduled_date} ${request.scheduled_time || ''}`;

      const msg = [
        `Νέα Διαδρομή MoveAthens`,
        `${request.hotel_name || '—'} → ${request.destination_name || '—'}`,
        `Όχημα: ${request.vehicle_name || '—'} | ${scheduleText}`,
        `Τιμή: ${parseFloat(request.price || 0).toFixed(0)}€ — Αμοιβή: ${parseFloat(request.commission_driver || 0).toFixed(0)}€`,
        `Επιβάτης: ${request.passenger_name || '—'}`,
        ``,
        `Αποδοχή: ${acceptUrl}`
      ].join('\n');

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

  console.log('[ma-requests] Routes mounted');
};
