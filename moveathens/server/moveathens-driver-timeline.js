/**
 * MoveAthens Driver Timeline — API Routes
 *
 * Public (driver-facing):
 *   POST /api/moveathens/driver-arrived/:token      → records arrived_at
 *   POST /api/moveathens/driver-navigating/:token   → records navigating_dest_at
 *
 * Admin:
 *   GET /api/admin/moveathens/timeline              → all accepted/completed requests with timestamps
 *   GET /api/admin/moveathens/timeline/:id           → single request timeline
 *
 * NEW FILE — keeps moveathens-requests.js untouched.
 */
'use strict';

const rateLimit = require('express-rate-limit');
const requestsData = require('../../src/server/data/moveathens-requests');
const maLogger = require('../../services/maLogger');

const driverRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});

module.exports = function registerTimelineRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // ═══════════════════════════════════════
  // PUBLIC: Driver marks "arrived at hotel"
  // ═══════════════════════════════════════
  app.post('/api/moveathens/driver-arrived/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (request.status !== 'accepted' && request.status !== 'confirmed') {
        return res.status(400).json({ error: 'Trip must be accepted first' });
      }

      // Don't overwrite if already arrived
      if (request.arrived_at) {
        return res.json({ ok: true, already: true, arrived_at: request.arrived_at });
      }

      const arrivedAt = new Date().toISOString();
      await requestsData.updateRequest(request.id, { arrived_at: arrivedAt });

      console.log('[ma-timeline] Request', request.id, 'ARRIVED at hotel');
      return res.json({ ok: true, arrived_at: arrivedAt });
    } catch (err) {
      maLogger.log('error', 'driver-arrived', { token: req.params.token, reason: err.message });
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ═══════════════════════════════════════
  // PUBLIC: Driver starts navigation to destination (passenger picked up)
  // ═══════════════════════════════════════
  app.post('/api/moveathens/driver-navigating/:token', driverRateLimit, async (req, res) => {
    try {
      const request = await requestsData.getRequestByToken(req.params.token);
      if (!request) return res.status(404).json({ error: 'Request not found' });

      if (request.status !== 'accepted' && request.status !== 'confirmed') {
        return res.status(400).json({ error: 'Trip must be accepted first' });
      }

      // Don't overwrite if already navigating
      if (request.navigating_dest_at) {
        return res.json({ ok: true, already: true, navigating_dest_at: request.navigating_dest_at });
      }

      const navigatingAt = new Date().toISOString();
      await requestsData.updateRequest(request.id, { navigating_dest_at: navigatingAt });

      console.log('[ma-timeline] Request', request.id, 'NAVIGATING to destination');
      return res.json({ ok: true, navigating_dest_at: navigatingAt });
    } catch (err) {
      maLogger.log('error', 'driver-navigating', { token: req.params.token, reason: err.message });
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ═══════════════════════════════════════
  // ADMIN: List all requests with timeline data
  // ═══════════════════════════════════════
  app.get('/api/admin/moveathens/timeline', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = await requestsData.getRequests({});
      const all = data.requests || data || [];

      // Only return requests that have at least been accepted
      const withTimeline = all
        .filter(r => r.accepted_at)
        .map(r => {
          const accepted = r.accepted_at ? new Date(r.accepted_at).getTime() : null;
          const arrived = r.arrived_at ? new Date(r.arrived_at).getTime() : null;
          const navigating = r.navigating_dest_at ? new Date(r.navigating_dest_at).getTime() : null;
          const completed = r.completed_at ? new Date(r.completed_at).getTime() : null;

          return {
            id: r.id,
            hotel_name: r.hotel_name || '—',
            destination_name: r.destination_name || '—',
            driver_name: r.driver_name || '—',
            driver_phone: r.driver_phone || '—',
            vehicle_name: r.vehicle_name || '—',
            passenger_name: r.passenger_name || '—',
            booking_type: r.booking_type || 'instant',
            scheduled_date: r.scheduled_date || '',
            scheduled_time: r.scheduled_time || '',
            price: r.price || 0,
            status: r.status,
            // Raw timestamps
            accepted_at: r.accepted_at || null,
            arrived_at: r.arrived_at || null,
            navigating_dest_at: r.navigating_dest_at || null,
            completed_at: r.completed_at || null,
            // Calculated durations (in milliseconds, null if data missing)
            dur_to_hotel: (accepted && arrived) ? (arrived - accepted) : null,
            dur_waiting: (arrived && navigating) ? (navigating - arrived) : null,
            dur_to_dest: (navigating && completed) ? (completed - navigating) : null,
            dur_total: (accepted && completed) ? (completed - accepted) : null
          };
        })
        .sort((a, b) => {
          // Most recent first
          const ta = a.accepted_at ? new Date(a.accepted_at).getTime() : 0;
          const tb = b.accepted_at ? new Date(b.accepted_at).getTime() : 0;
          return tb - ta;
        });

      return res.json({ timeline: withTimeline });
    } catch (err) {
      console.error('[ma-timeline] GET /admin/timeline failed:', err.message);
      return res.status(500).json({ error: 'Failed to load timeline' });
    }
  });

  // ═══════════════════════════════════════
  // ADMIN: Single request timeline detail
  // ═══════════════════════════════════════
  app.get('/api/admin/moveathens/timeline/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const r = await requestsData.getRequestById(req.params.id);
      if (!r) return res.status(404).json({ error: 'Not found' });

      const accepted = r.accepted_at ? new Date(r.accepted_at).getTime() : null;
      const arrived = r.arrived_at ? new Date(r.arrived_at).getTime() : null;
      const navigating = r.navigating_dest_at ? new Date(r.navigating_dest_at).getTime() : null;
      const completed = r.completed_at ? new Date(r.completed_at).getTime() : null;

      return res.json({
        id: r.id,
        status: r.status,
        accepted_at: r.accepted_at,
        arrived_at: r.arrived_at,
        navigating_dest_at: r.navigating_dest_at,
        completed_at: r.completed_at,
        dur_to_hotel: (accepted && arrived) ? (arrived - accepted) : null,
        dur_waiting: (arrived && navigating) ? (navigating - arrived) : null,
        dur_to_dest: (navigating && completed) ? (completed - navigating) : null,
        dur_total: (accepted && completed) ? (completed - accepted) : null
      });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  console.log('[ma-timeline] Timeline routes mounted');
};
