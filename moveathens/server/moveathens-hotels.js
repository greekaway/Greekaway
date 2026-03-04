/**
 * MoveAthens Hotels (Zones) — Admin API Routes
 * Admin: GET    /api/admin/moveathens/transfer-zones
 *        PUT    /api/admin/moveathens/transfer-zones
 *        DELETE /api/admin/moveathens/transfer-zones/:id
 *        GET    /api/admin/moveathens/hotel-phones
 *        POST   /api/admin/moveathens/hotel-phones
 *        DELETE /api/admin/moveathens/hotel-phones/:id
 */
'use strict';

const { normalizeString, normalizeZonesList } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerHotelRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // ========================================
  // Zones CRUD
  // ========================================
  app.get('/api/admin/moveathens/transfer-zones', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const zones = await dataLayer.getZones();
      return res.json({ zones });
    } catch (err) {
      console.error('[moveathens] zones read failed:', err.message);
      return res.status(500).json({ error: 'MoveAthens zones unavailable' });
    }
  });

  app.put('/api/admin/moveathens/transfer-zones', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const zones = normalizeZonesList(incoming.zones || []);

      // WIPE PROTECTION
      const currentZones = await dataLayer.getZones();
      if (zones.length === 0 && currentZones.length > 0) {
        console.warn('[moveathens] WIPE BLOCKED: PUT zones with 0 items, but', currentZones.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all zones with empty list. Delete individually instead.' });
      }

      const newIds = new Set(zones.map(z => z.id));

      for (const existing of currentZones) {
        if (!newIds.has(existing.id)) {
          console.log('[moveathens] Deleting zone:', existing.id, existing.name);
          await dataLayer.deleteZone(existing.id);
        }
      }

      const savedZones = [];
      for (const zone of zones) {
        const saved = await dataLayer.upsertZone(zone);
        savedZones.push(saved);
      }

      return res.json({ zones: savedZones });
    } catch (err) {
      console.error('moveathens: save zones failed', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: 'Failed to save zones' });
    }
  });

  app.delete('/api/admin/moveathens/transfer-zones/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const deleted = await dataLayer.deleteZone(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Zone not found' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[moveathens] DELETE zone failed:', err.message);
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  // ========================================
  // Hotel Phones CRUD
  // ========================================
  app.get('/api/admin/moveathens/hotel-phones', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const zoneId = normalizeString(req.query.zone_id) || null;
      const phones = await dataLayer.getHotelPhones(zoneId);
      return res.json({ phones });
    } catch (err) {
      console.error('[moveathens] hotel-phones read failed:', err.message);
      return res.status(500).json({ error: 'Hotel phones unavailable' });
    }
  });

  app.post('/api/admin/moveathens/hotel-phones', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { zone_id, phone, label } = req.body || {};
      if (!zone_id || !phone) {
        return res.status(400).json({ error: 'zone_id and phone are required' });
      }
      const cleanPhone = normalizeString(phone);
      if (cleanPhone.length < 5) {
        return res.status(400).json({ error: 'Phone number too short' });
      }
      const existing = await dataLayer.getHotelByPhone(cleanPhone);
      if (existing) {
        return res.status(409).json({ error: 'Phone already registered', hotel_name: existing.zone.name });
      }
      const saved = await dataLayer.addHotelPhone({ zone_id, phone: cleanPhone, label: normalizeString(label) });
      return res.json({ ok: true, phone: saved });
    } catch (err) {
      console.error('[moveathens] hotel-phone add failed:', err.message);
      return res.status(500).json({ error: 'Failed to add phone' });
    }
  });

  app.delete('/api/admin/moveathens/hotel-phones/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const deleted = await dataLayer.deleteHotelPhone(req.params.id);
      return res.json({ ok: deleted });
    } catch (err) {
      console.error('[moveathens] hotel-phone delete failed:', err.message);
      return res.status(500).json({ error: 'Failed to delete phone' });
    }
  });

  console.log('[MoveAthens] Hotels routes registered');
};
