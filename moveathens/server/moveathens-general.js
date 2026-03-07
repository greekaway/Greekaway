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
      if (typeof body.infoCancellationTitle === 'string') {
        updates.infoCancellationTitle = normalizeString(body.infoCancellationTitle).slice(0, 200);
      }
      if (typeof body.infoCancellationContent === 'string') {
        updates.infoCancellationContent = body.infoCancellationContent.slice(0, 10000);
      }
      if (typeof body.infoComplianceTitle === 'string') {
        updates.infoComplianceTitle = normalizeString(body.infoComplianceTitle).slice(0, 200);
      }
      if (typeof body.infoComplianceContent === 'string') {
        updates.infoComplianceContent = body.infoComplianceContent.slice(0, 10000);
      }
      if (typeof body.infoFaqTitle === 'string') {
        updates.infoFaqTitle = normalizeString(body.infoFaqTitle).slice(0, 200);
      }
      if (typeof body.infoFaqContent === 'string') {
        updates.infoFaqContent = body.infoFaqContent.slice(0, 10000);
      }
      // About Us structured fields
      if (typeof body.aboutUsCompanyName === 'string') {
        updates.aboutUsCompanyName = normalizeString(body.aboutUsCompanyName).slice(0, 255);
      }
      if (typeof body.aboutUsAfm === 'string') {
        updates.aboutUsAfm = normalizeString(body.aboutUsAfm).slice(0, 50);
      }
      if (typeof body.aboutUsDoy === 'string') {
        updates.aboutUsDoy = normalizeString(body.aboutUsDoy).slice(0, 255);
      }
      if (typeof body.aboutUsActivity === 'string') {
        updates.aboutUsActivity = normalizeString(body.aboutUsActivity).slice(0, 500);
      }
      if (typeof body.aboutUsAddress === 'string') {
        updates.aboutUsAddress = body.aboutUsAddress.slice(0, 1000);
      }
      if (typeof body.aboutUsManager === 'string') {
        updates.aboutUsManager = normalizeString(body.aboutUsManager).slice(0, 255);
      }
      if (typeof body.aboutUsPhone === 'string') {
        updates.aboutUsPhone = normalizeString(body.aboutUsPhone).slice(0, 50);
      }
      if (typeof body.aboutUsEmail === 'string') {
        updates.aboutUsEmail = normalizeString(body.aboutUsEmail).slice(0, 255);
      }
      if (typeof body.aboutUsWebsite === 'string') {
        updates.aboutUsWebsite = normalizeString(body.aboutUsWebsite).slice(0, 512);
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

      // Category style (global tile appearance)
      if (body.categoryStyle && typeof body.categoryStyle === 'object') {
        const cs = body.categoryStyle;
        updates.categoryStyle = {
          tileScale: Math.max(0.6, Math.min(1.6, parseFloat(cs.tileScale) || 1)),
          iconColor: /^#[0-9a-fA-F]{6}$/.test(cs.iconColor) ? cs.iconColor : '#ffffff',
          textColor: /^#[0-9a-fA-F]{6}$/.test(cs.textColor) ? cs.textColor : '#1a1a2e'
        };
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
