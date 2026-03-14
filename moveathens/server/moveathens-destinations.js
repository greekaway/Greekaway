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

      // Build lookup of current server data by id
      const currentMap = new Map(currentDestinations.map(d => [d.id, d]));
      const newIds = new Set(destinations.map(d => d.id));

      // Delete destinations that were explicitly removed
      for (const existing of currentDestinations) {
        if (!newIds.has(existing.id)) {
          console.log('[moveathens] Deleting destination:', existing.id, existing.name);
          await dataLayer.deleteDestination(existing.id);
        }
      }

      // Merge: for each incoming destination, merge with server version
      // to avoid losing fields that the client didn't modify
      const savedDestinations = [];
      for (const dest of destinations) {
        const current = currentMap.get(dest.id);
        let merged = dest;
        if (current) {
          // Start with server data, overlay incoming
          merged = { ...current, ...dest };
          // If this destination was NOT actively edited by the admin,
          // protect extended fields — keep server values when incoming is empty
          if (!dest._edited) {
            const protectedFields = [
              'venue_type', 'vibe', 'area', 'indicative_price', 'suitable_for',
              'rating', 'michelin', 'details', 'main_artist', 'participating_artists',
              'program_info', 'operating_days', 'opening_time', 'closing_time',
              'operating_schedule', 'description', 'lat', 'lng', 'route_type',
              'phone', 'seasonal_open', 'seasonal_close'
            ];
            for (const field of protectedFields) {
              const inVal = (dest[field] != null && dest[field] !== '') ? dest[field] : '';
              const curVal = (current[field] != null && current[field] !== '') ? current[field] : '';
              merged[field] = inVal || curVal;
            }
          }
        }
        // Remove internal flag before saving
        delete merged._edited;
        const saved = await dataLayer.upsertDestination(merged);
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
