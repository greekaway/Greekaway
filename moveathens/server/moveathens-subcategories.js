/**
 * MoveAthens Subcategories — Admin API Routes
 * Admin: GET /api/admin/moveathens/destination-subcategories
 *        PUT /api/admin/moveathens/destination-subcategories
 */
'use strict';

const { normalizeDestinationSubcategories } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerSubcategoryRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  app.get('/api/admin/moveathens/destination-subcategories', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const categoryId = req.query.category_id || null;
      const filters = categoryId ? { category_id: categoryId } : {};
      const subcategories = await dataLayer.getDestinationSubcategories(filters);
      return res.json({ subcategories });
    } catch (err) {
      console.error('[moveathens] subcategories read failed:', err.message);
      return res.status(500).json({ error: 'Subcategories unavailable' });
    }
  });

  app.put('/api/admin/moveathens/destination-subcategories', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const subcategories = normalizeDestinationSubcategories(incoming.subcategories || []);

      const currentSubs = await dataLayer.getDestinationSubcategories();

      // WIPE PROTECTION — only block if dropping many items at once (likely a client bug)
      // Deleting the last 1-2 items intentionally is allowed
      if (subcategories.length === 0 && currentSubs.length > 2) {
        console.warn('[moveathens] WIPE BLOCKED: PUT subcategories with 0 items, but', currentSubs.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all subcategories with empty list.' });
      }

      const newIds = new Set(subcategories.map(s => s.id));

      for (const existing of currentSubs) {
        if (!newIds.has(existing.id)) {
          console.log('[moveathens] Deleting subcategory:', existing.id, existing.name);
          await dataLayer.deleteDestinationSubcategory(existing.id);
        }
      }

      const savedSubs = [];
      for (const sub of subcategories) {
        const saved = await dataLayer.upsertDestinationSubcategory(sub);
        savedSubs.push(saved);
      }

      return res.json({ subcategories: savedSubs });
    } catch (err) {
      console.error('[moveathens] PUT subcategories failed:', err.message);
      return res.status(500).json({ error: 'Failed to save subcategories' });
    }
  });

  console.log('[MoveAthens] Subcategories routes registered');
};
