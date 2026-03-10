/**
 * MoveAthens Vehicles — Admin API Routes
 * Admin: GET /api/admin/moveathens/vehicle-types
 *        PUT /api/admin/moveathens/vehicle-types
 *        GET /api/admin/moveathens/vehicle-category-availability
 *        PUT /api/admin/moveathens/vehicle-category-availability
 *        GET /api/admin/moveathens/vehicle-destination-overrides
 *        PUT /api/admin/moveathens/vehicle-destination-overrides
 */
'use strict';

const {
  normalizeString,
  normalizeTypeName,
  normalizeVehicleTypes,
  normalizeVehicleCategoryAvailabilityList,
  normalizeVehicleDestinationOverrides
} = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerVehicleRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // ========================================
  // Vehicle Types CRUD
  // ========================================
  app.get('/api/admin/moveathens/vehicle-types', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const vehicleTypes = await dataLayer.getVehicleTypes();
      return res.json({ vehicleTypes });
    } catch (err) {
      console.error('[moveathens] vehicle types read failed:', err.message);
      return res.status(500).json({ error: 'Vehicle types unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-types', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const incomingList = Array.isArray(incoming.vehicleTypes) ? incoming.vehicleTypes : [];
      console.log('[moveathens] PUT vehicle-types: received', incomingList.length, 'vehicles');

      const seenNames = new Map();
      incomingList.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const norm = normalizeTypeName(entry.name);
        if (!norm) return;
        const id = normalizeString(entry.id) || '';
        if (seenNames.has(norm) && seenNames.get(norm) !== id) {
          throw Object.assign(new Error('DUPLICATE_NAME'), { code: 409 });
        }
        seenNames.set(norm, id);
      });
      const vehicleTypes = normalizeVehicleTypes(incomingList);
      console.log('[moveathens] PUT vehicle-types: normalized to', vehicleTypes.length, 'vehicles');

      // WIPE PROTECTION
      const currentVehicles = await dataLayer.getVehicleTypes();
      if (vehicleTypes.length === 0 && currentVehicles.length > 0) {
        console.warn('[moveathens] WIPE BLOCKED: PUT vehicles with 0 items, but', currentVehicles.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all vehicles with empty list.' });
      }

      // Merge protection: build map of existing vehicles to preserve fields from stale clients
      const currentMap = new Map(currentVehicles.map(v => [v.id, v]));

      const savedVehicles = [];
      for (const vt of vehicleTypes) {
        const existing = currentMap.get(vt.id);
        let merged = vt;
        if (existing) {
          merged = { ...vt };
          for (const key of ['description', 'image', 'max_passengers', 'max_luggage']) {
            if ((!merged[key] || merged[key] === '') && existing[key]) {
              merged[key] = existing[key];
            }
          }
        }
        console.log('[moveathens] PUT vehicle-types: saving', merged.id, merged.name);
        const saved = await dataLayer.upsertVehicleType(merged);
        savedVehicles.push(saved);
      }
      // NOTE: vehicles missing from the incoming list are NOT deleted — use DELETE endpoint instead

      console.log('[moveathens] PUT vehicle-types: saved', savedVehicles.length, 'vehicles successfully');
      return res.json({ vehicleTypes: savedVehicles });
    } catch (err) {
      console.error('[moveathens] PUT vehicle-types FAILED:', err.message, err.stack);
      if (err && err.code === 409) {
        return res.status(409).json({ error: 'DUPLICATE_NAME', message: 'Type name already exists' });
      }
      return res.status(500).json({ error: 'Failed to save vehicle types', details: err.message });
    }
  });

  // ========================================
  // Vehicle Category Availability
  // ========================================
  app.get('/api/admin/moveathens/vehicle-category-availability', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = await dataLayer.getFullConfig();
      return res.json({ availability: data.vehicleCategoryAvailability || [] });
    } catch (err) {
      return res.status(500).json({ error: 'Availability unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-category-availability', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const availability = normalizeVehicleCategoryAvailabilityList(incoming.availability || []);
      // TODO: Add dataLayer method for vehicle category availability
      return res.json({ availability });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save availability' });
    }
  });

  // ========================================
  // Vehicle Destination Overrides
  // ========================================
  app.get('/api/admin/moveathens/vehicle-destination-overrides', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const data = await dataLayer.getFullConfig();
      return res.json({ overrides: data.vehicleDestinationOverrides || [] });
    } catch (err) {
      return res.status(500).json({ error: 'Overrides unavailable' });
    }
  });

  app.put('/api/admin/moveathens/vehicle-destination-overrides', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const overrides = normalizeVehicleDestinationOverrides(incoming.overrides || []);
      // TODO: Add dataLayer method for vehicle destination overrides
      return res.json({ overrides });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save overrides' });
    }
  });

  console.log('[MoveAthens] Vehicles routes registered');
};
