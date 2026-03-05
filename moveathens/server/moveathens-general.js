/**
 * MoveAthens General / Config — Admin API Routes
 * Admin: POST /api/admin/moveathens/ui-config   (full save — heroHeadline, phone, footerLabels…)
 *        PUT  /api/admin/moveathens/ui-config   (partial — info page, showPriceInMessage, irisPhone…)
 *        GET  /api/admin/moveathens/ui-config   (read all config)
 */
'use strict';

const { validateAndMerge, normalizeString } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerGeneralRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // ========================================
  // Admin: Read full config
  // ========================================
  app.get('/api/admin/moveathens/ui-config', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { ensureTransferConfig, migrateHotelZones } = require('./moveathens-helpers');
      const dbConfig = await dataLayer.getFullConfig();
      const data = ensureTransferConfig(migrateHotelZones(dbConfig));
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: 'MoveAthens config unavailable' });
    }
  });

  // ========================================
  // Admin: Full config save (General tab)
  // ========================================
  app.post('/api/admin/moveathens/ui-config', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const current = await dataLayer.getConfig();
      const validated = validateAndMerge(req.body || {}, current);
      if (!validated.ok) return res.status(400).json({ error: validated.error });

      await dataLayer.updateConfig(validated.data);

      return res.json({ ok: true });
    } catch (err) {
      console.error('[moveathens] Config save error:', err);
      return res.status(500).json({ error: 'Failed to save config' });
    }
  });

  // ========================================
  // Admin: Partial config update (info page, toggles, etc.)
  // ========================================
  app.put('/api/admin/moveathens/ui-config', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const current = await dataLayer.getConfig();
      const body = req.body || {};
      const updates = {};

      if (typeof body.infoPageTitle === 'string') {
        updates.infoPageTitle = normalizeString(body.infoPageTitle).slice(0, 200);
      }
      if (typeof body.infoPageContent === 'string') {
        updates.infoPageContent = body.infoPageContent.slice(0, 10000);
      }
      if (typeof body.showPriceInMessage === 'boolean') {
        updates.showPriceInMessage = body.showPriceInMessage;
      }
      if (typeof body.flightTrackingEnabled === 'boolean') {
        updates.flightTrackingEnabled = body.flightTrackingEnabled;
      }
      if (typeof body.flightCheckMinsBefore === 'number') {
        updates.flightCheckMinsBefore = Math.max(5, Math.min(120, body.flightCheckMinsBefore));
      }
      if (typeof body.irisPhone === 'string') {
        updates.irisPhone = normalizeString(body.irisPhone).slice(0, 50);
      }
      if (typeof body.welcomeTextBlock === 'string') {
        updates.welcomeTextBlock = normalizeString(body.welcomeTextBlock).slice(0, 500);
      }

      await dataLayer.updateConfig({ ...current, ...updates });

      return res.json({ ...current, ...updates });
    } catch (err) {
      console.error('[moveathens] Config partial save error:', err);
      return res.status(500).json({ error: 'Failed to save config' });
    }
  });

  console.log('[MoveAthens] General routes registered');
};
