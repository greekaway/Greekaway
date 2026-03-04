/**
 * MoveAthens Destinations — Admin API Routes
 * Admin: GET /api/admin/moveathens/destinations
 *        PUT /api/admin/moveathens/destinations
 */
'use strict';

const { normalizeDestinations } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerDestinationRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  app.get('/api/admin/moveathens/destinations', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const destinations = await dataLayer.getDestinations();
      return res.json({ destinations });
    } catch (err) {
      console.error('[moveathens] destinations read failed:', err.message);
      return res.status(500).json({ error: 'Destinations unavailable' });
    }
  });

  app.put('/api/admin/moveathens/destinations', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const destinations = normalizeDestinations(incoming.destinations || []);

      // WIPE PROTECTION
      const currentDestinations = await dataLayer.getDestinations();
      if (destinations.length === 0 && currentDestinations.length > 0) {
        console.warn('[moveathens] WIPE BLOCKED: PUT destinations with 0 items, but', currentDestinations.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all destinations with empty list.' });
      }

      const newIds = new Set(destinations.map(d => d.id));

      for (const existing of currentDestinations) {
        if (!newIds.has(existing.id)) {
          console.log('[moveathens] Deleting destination:', existing.id, existing.name);
          await dataLayer.deleteDestination(existing.id);
        }
      }

      const savedDestinations = [];
      for (const dest of destinations) {
        const saved = await dataLayer.upsertDestination(dest);
        savedDestinations.push(saved);
      }

      return res.json({ destinations: savedDestinations });
    } catch (err) {
      console.error('[moveathens] PUT destinations failed:', err.message);
      return res.status(500).json({ error: 'Failed to save destinations' });
    }
  });

  console.log('[MoveAthens] Destinations routes registered');
};
