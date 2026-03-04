/**
 * MoveAthens Categories — Admin API Routes
 * Admin: GET /api/admin/moveathens/destination-categories
 *        PUT /api/admin/moveathens/destination-categories
 */
'use strict';

const { normalizeDestinationCategories } = require('./moveathens-helpers');
const dataLayer = require('../../src/server/data/moveathens');

module.exports = function registerCategoryRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  app.get('/api/admin/moveathens/destination-categories', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const categories = await dataLayer.getDestinationCategories();
      return res.json({ categories });
    } catch (err) {
      console.error('[moveathens] categories read failed:', err.message);
      return res.status(500).json({ error: 'Categories unavailable' });
    }
  });

  app.put('/api/admin/moveathens/destination-categories', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const incoming = req.body || {};
      const categories = normalizeDestinationCategories(incoming.categories || []);

      // WIPE PROTECTION
      const currentCategories = await dataLayer.getDestinationCategories();
      if (categories.length === 0 && currentCategories.length > 0) {
        console.warn('[moveathens] WIPE BLOCKED: PUT categories with 0 items, but', currentCategories.length, 'exist');
        return res.status(409).json({ error: 'WIPE_BLOCKED', message: 'Cannot replace all categories with empty list.' });
      }

      const newIds = new Set(categories.map(c => c.id));

      for (const existing of currentCategories) {
        if (!newIds.has(existing.id)) {
          console.log('[moveathens] Deleting category:', existing.id, existing.name);
          await dataLayer.deleteDestinationCategory(existing.id);
        }
      }

      const savedCategories = [];
      for (const cat of categories) {
        const saved = await dataLayer.upsertDestinationCategory(cat);
        savedCategories.push(saved);
      }

      return res.json({ categories: savedCategories });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save categories' });
    }
  });

  console.log('[MoveAthens] Categories routes registered');
};
