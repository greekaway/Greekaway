/**
 * MoveAthens Pricing — Admin API Routes
 * Admin: GET /api/admin/moveathens/transfer-prices
 *        PUT /api/admin/moveathens/transfer-prices
 */
'use strict';

const { normalizeTransferPrices } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerPricingRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  app.get('/api/admin/moveathens/transfer-prices', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const transferPrices = await dataLayer.getPrices();
      return res.json({ transferPrices });
    } catch (err) {
      console.error('[moveathens] prices read failed:', err.message);
      return res.status(500).json({ error: 'Transfer prices unavailable' });
    }
  });

  app.put('/api/admin/moveathens/transfer-prices', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const transferPrices = normalizeTransferPrices(incoming.transferPrices || []);

      // WIPE PROTECTION
      const currentPrices = await dataLayer.getPrices();
      if (transferPrices.length === 0 && currentPrices.length > 0) {
        console.warn('[moveathens] WIPE BLOCKED: PUT transfer-prices with 0 items, but', currentPrices.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all prices with empty list. Delete individually instead.' });
      }

      // Merge protection: preserve existing commission values from stale clients
      const currentMap = new Map(currentPrices.map(p => [p.id, p]));

      const savedPrices = [];
      for (const price of transferPrices) {
        const existing = currentMap.get(price.id);
        let merged = price;
        if (existing) {
          merged = { ...price };
          // Keep server commission values when client sends 0 but server has a real value
          for (const key of ['commission_driver', 'commission_hotel', 'commission_service']) {
            if ((!merged[key] || merged[key] === 0) && existing[key] > 0) {
              merged[key] = existing[key];
            }
          }
        }
        const saved = await dataLayer.upsertPrice(merged);
        savedPrices.push(saved);
      }

      return res.json({ transferPrices: savedPrices });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save transfer prices' });
    }
  });

  console.log('[MoveAthens] Pricing routes registered');
};
