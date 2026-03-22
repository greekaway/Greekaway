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

      // Merge protection: build map of existing zones to preserve fields from stale clients
      const currentMap = new Map(currentZones.map(z => [z.id, z]));

      const savedZones = [];
      for (const zone of zones) {
        const existing = currentMap.get(zone.id);
        let merged = zone;
        if (existing) {
          // Keep server values for any fields that arrive empty from the client
          merged = { ...zone };
          for (const key of ['description', 'municipality', 'address', 'phone', 'email', 'lat', 'lng']) {
            if ((!merged[key] || merged[key] === '') && existing[key]) {
              merged[key] = existing[key];
            }
          }
        }
        const saved = await dataLayer.upsertZone(merged);
        savedZones.push(saved);
      }
      // NOTE: zones missing from the incoming list are NOT deleted — use DELETE endpoint instead

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

  // ========================================
  // Phone PIN Management (Admin)
  // ========================================
  app.get('/api/admin/moveathens/hotel-phones-with-pin', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const zoneId = normalizeString(req.query.zone_id) || null;
      const phones = await dataLayer.getHotelPhones(zoneId);
      // Add has_pin flag for each phone
      const result = [];
      for (const p of phones) {
        const pinHash = await dataLayer.getPhonePinHash(p.phone);
        result.push({ ...p, has_pin: !!pinHash });
      }
      return res.json({ phones: result });
    } catch (err) {
      console.error('[moveathens] hotel-phones-with-pin failed:', err.message);
      return res.status(500).json({ error: 'Failed to load phones' });
    }
  });

  app.delete('/api/admin/moveathens/phone-pin', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const phone = normalizeString(req.body.phone || '').replace(/[\s\-()]/g, '');
      if (!phone) return res.status(400).json({ error: 'Phone required' });
      const cleared = await dataLayer.clearPhonePin(phone);
      return res.json({ ok: cleared });
    } catch (err) {
      console.error('[moveathens] phone-pin delete failed:', err.message);
      return res.status(500).json({ error: 'Failed to clear PIN' });
    }
  });

  console.log('[MoveAthens] Hotels routes registered');
};
