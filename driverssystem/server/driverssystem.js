const express = require('express');
const path = require('path');
const fs = require('fs');
let multer = null;
try { multer = require('multer'); } catch (_) { multer = null; }

const dataLayer = require('../../src/server/data/driverssystem');

module.exports = function registerDriversSystem(app, opts = {}) {
  const isDev = !!opts.isDev;
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;
  const baseDir = path.join(__dirname, '..');
  const pagesDir = path.join(baseDir, 'pages');
  const router = express.Router();

  if (isDev) {
    router.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
  }

  router.use(express.static(baseDir, { index: false }));

  const pageMap = {
    '/': 'welcome.html',
    '/listings': 'entries.html',
    '/info': 'stats.html',
    '/stats': 'stats.html',
    '/profile': 'profile.html'
  };

  Object.keys(pageMap).forEach((routePath) => {
    router.get(routePath, (req, res) => {
      const fileName = pageMap[routePath];
      return res.sendFile(path.join(pagesDir, fileName));
    });
  });

  app.use('/driverssystem', router);

  // ── Validation helper ──
  const normalizeString = (value) => String(value || '').trim();

  const validateAndMerge = (incoming, current) => {
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, error: 'Invalid payload' };
    }

    const heroHeadline = normalizeString(incoming.heroHeadline || current.heroHeadline);
    const heroSubtext = normalizeString(incoming.heroSubtext || current.heroSubtext);
    if (heroHeadline.length > 120) return { ok: false, error: 'heroHeadline too long' };
    if (heroSubtext.length > 220) return { ok: false, error: 'heroSubtext too long' };

    const footerLabels = Object.assign({}, current.footerLabels || {}, incoming.footerLabels || {});
    const footerIcons = Object.assign({}, current.footerIcons || {}, incoming.footerIcons || {});
    const contactLabels = Object.assign({}, current.contactLabels || {}, incoming.contactLabels || {});

    const merged = Object.assign({}, current, {
      heroHeadline,
      heroSubtext,
      heroLogoUrl: incoming.heroLogoUrl !== undefined ? incoming.heroLogoUrl : current.heroLogoUrl,
      footerLabels,
      footerIcons,
      contactLabels,
      phoneNumber: normalizeString(incoming.phoneNumber !== undefined ? incoming.phoneNumber : current.phoneNumber),
      whatsappNumber: normalizeString(incoming.whatsappNumber !== undefined ? incoming.whatsappNumber : current.whatsappNumber),
      companyEmail: normalizeString(incoming.companyEmail !== undefined ? incoming.companyEmail : current.companyEmail),
      infoPageTitle: normalizeString(incoming.infoPageTitle !== undefined ? incoming.infoPageTitle : current.infoPageTitle),
      infoPageContent: incoming.infoPageContent !== undefined ? incoming.infoPageContent : current.infoPageContent,
      infoCancellationTitle: incoming.infoCancellationTitle !== undefined ? incoming.infoCancellationTitle : current.infoCancellationTitle,
      infoCancellationContent: incoming.infoCancellationContent !== undefined ? incoming.infoCancellationContent : current.infoCancellationContent,
      infoComplianceTitle: incoming.infoComplianceTitle !== undefined ? incoming.infoComplianceTitle : current.infoComplianceTitle,
      infoComplianceContent: incoming.infoComplianceContent !== undefined ? incoming.infoComplianceContent : current.infoComplianceContent,
      infoFaqTitle: incoming.infoFaqTitle !== undefined ? incoming.infoFaqTitle : current.infoFaqTitle,
      infoFaqContent: incoming.infoFaqContent !== undefined ? incoming.infoFaqContent : current.infoFaqContent
    });

    return { ok: true, data: merged };
  };

  // ── Public API ──

  app.get('/api/driverssystem/ui-config', async (req, res) => {
    try {
      const cfg = await dataLayer.getConfig();
      return res.json(cfg);
    } catch (err) {
      console.error('[driverssystem] GET config error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin API ──

  const requireAdmin = (req, res, next) => {
    if (checkAdminAuth && !checkAdminAuth(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };

  app.get('/api/admin/driverssystem/ui-config', requireAdmin, async (req, res) => {
    try {
      const cfg = await dataLayer.getFullConfig();
      return res.json(cfg);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/driverssystem/ui-config', requireAdmin, async (req, res) => {
    try {
      const current = await dataLayer.getConfig();
      const result = validateAndMerge(req.body, current);
      if (!result.ok) return res.status(400).json({ error: result.error });
      const saved = await dataLayer.updateConfig(result.data);
      if (!saved) return res.status(500).json({ error: 'Save failed' });
      return res.json(saved);
    } catch (err) {
      console.error('[driverssystem] PUT config error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Upload hero logo ──
  if (multer) {
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'driverssystem');
    try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}

    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `hero-logo-${Date.now()}${ext}`);
      }
    });
    const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

    app.post('/api/admin/driverssystem/upload-hero-logo', requireAdmin, upload.single('file'), async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const url = `/uploads/driverssystem/${req.file.filename}`;
      const cfg = await dataLayer.getConfig();
      cfg.heroLogoUrl = url;
      await dataLayer.updateConfig(cfg);
      return res.json({ url });
    });

    // ── Upload footer icon ──
    app.post('/api/admin/driverssystem/upload-footer-icon', requireAdmin, upload.single('file'), async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const slot = req.body.slot || req.query.slot || '';
      const url = `/uploads/driverssystem/${req.file.filename}`;
      if (slot) {
        const cfg = await dataLayer.getConfig();
        if (!cfg.footerIcons) cfg.footerIcons = {};
        cfg.footerIcons[slot] = url;
        await dataLayer.updateConfig(cfg);
      }
      return res.json({ url });
    });
  }

  // ── Financials API ──

  app.get('/api/admin/driverssystem/financials', requireAdmin, async (req, res) => {
    try {
      const items = await dataLayer.getFinancials();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/driverssystem/financials', requireAdmin, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
      const saved = await dataLayer.updateFinancials(items);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Trip Sources API (Admin) ──

  app.get('/api/admin/driverssystem/trip-sources', requireAdmin, async (req, res) => {
    try {
      const items = await dataLayer.getTripSources();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/admin/driverssystem/trip-sources', requireAdmin, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
      const saved = await dataLayer.updateTripSources(items);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Trip Sources API (Public — driver app reads sources) ──

  app.get('/api/driverssystem/trip-sources', async (req, res) => {
    try {
      const all = await dataLayer.getTripSources();
      const active = all.filter(s => s.active !== false);
      return res.json(active);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Entries API (Driver) ──

  app.get('/api/driverssystem/entries', async (req, res) => {
    try {
      const filters = {};
      if (req.query.date) filters.date = req.query.date;
      if (req.query.sourceId) filters.sourceId = req.query.sourceId;
      if (req.query.driverId) filters.driverId = req.query.driverId;
      const items = await dataLayer.getEntries(filters);
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/driverssystem/entries', async (req, res) => {
    try {
      const entry = req.body;
      if (!entry || !entry.sourceId || !entry.amount) {
        return res.status(400).json({ error: 'Απαιτείται πηγή και ποσό' });
      }
      const saved = await dataLayer.addEntry(entry);
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/driverssystem/entries/:id', async (req, res) => {
    try {
      const ok = await dataLayer.deleteEntry(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/driverssystem/entries/summary', async (req, res) => {
    try {
      const date = req.query.date || new Date().toISOString().slice(0, 10);
      const driverId = req.query.driverId || null;
      const summary = await dataLayer.getEntriesSummary(date, driverId);
      return res.json(summary);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Driver Registration / Identity ──

  app.post('/api/driverssystem/drivers/register', async (req, res) => {
    try {
      const { phone, fullName, email } = req.body || {};
      if (!phone || !phone.trim()) {
        return res.status(400).json({ error: 'Απαιτείται αριθμός τηλεφώνου' });
      }
      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ error: 'Απαιτείται ονοματεπώνυμο' });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Απαιτείται email' });
      }
      const driver = await dataLayer.registerDriver({ phone: phone.trim(), fullName: fullName.trim(), email: email.trim() });
      if (!driver) return res.status(500).json({ error: 'Registration failed' });
      return res.json(driver);
    } catch (err) {
      console.error('[driverssystem] register error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/driverssystem/drivers/me', async (req, res) => {
    try {
      const phone = req.query.phone;
      if (!phone) return res.status(400).json({ error: 'Απαιτείται τηλέφωνο' });
      const driver = await dataLayer.getDriverByPhone(phone);
      if (!driver) return res.status(404).json({ error: 'Δεν βρέθηκε οδηγός' });
      return res.json(driver);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Stats API (Driver - range queries) ──

  app.get('/api/driverssystem/stats', async (req, res) => {
    try {
      const filters = {};
      if (req.query.driverId) filters.driverId = req.query.driverId;
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      if (req.query.period) filters.period = req.query.period;
      if (req.query.sourceId) filters.sourceId = req.query.sourceId;
      const stats = await dataLayer.getStatsRange(filters);
      return res.json(stats);
    } catch (err) {
      console.error('[driverssystem] stats error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Drivers list ──

  app.get('/api/admin/driverssystem/drivers', requireAdmin, async (req, res) => {
    try {
      const filters = {};
      if (req.query.search) filters.search = req.query.search;
      const drivers = await dataLayer.getDrivers(filters);
      return res.json(drivers);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Create driver ──
  app.post('/api/admin/driverssystem/drivers', requireAdmin, async (req, res) => {
    try {
      const { phone, fullName, email } = req.body || {};
      if (!phone || !phone.trim()) {
        return res.status(400).json({ error: 'Απαιτείται αριθμός τηλεφώνου' });
      }
      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ error: 'Απαιτείται ονοματεπώνυμο' });
      }
      const driver = await dataLayer.registerDriver({
        phone: phone.trim(),
        fullName: fullName.trim(),
        email: (email || '').trim()
      });
      if (!driver) return res.status(500).json({ error: 'Creation failed' });
      return res.status(201).json(driver);
    } catch (err) {
      console.error('[driverssystem] admin create driver error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Update driver ──
  app.put('/api/admin/driverssystem/drivers/:id', requireAdmin, async (req, res) => {
    try {
      const { fullName, email, phone } = req.body || {};
      const drivers = await dataLayer.getDrivers({});
      const driver = drivers.find(d => d.id === req.params.id);
      if (!driver) return res.status(404).json({ error: 'Δεν βρέθηκε' });
      const updated = await dataLayer.updateDriver(driver.phone, {
        fullName: fullName !== undefined ? fullName : driver.fullName,
        email: email !== undefined ? email : driver.email
      });
      if (!updated) return res.status(500).json({ error: 'Update failed' });
      return res.json(updated);
    } catch (err) {
      console.error('[driverssystem] admin update driver error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Delete driver ──
  app.delete('/api/admin/driverssystem/drivers/:id', requireAdmin, async (req, res) => {
    try {
      const ok = await dataLayer.deleteDriver(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Δεν βρέθηκε' });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[driverssystem] admin delete driver error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Stats for any driver ──

  app.get('/api/admin/driverssystem/stats', requireAdmin, async (req, res) => {
    try {
      const filters = {};
      if (req.query.driverId) filters.driverId = req.query.driverId;
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      if (req.query.period) filters.period = req.query.period;
      if (req.query.sourceId) filters.sourceId = req.query.sourceId;
      const stats = await dataLayer.getStatsRange(filters);
      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: All entries for admin view ──

  app.get('/api/admin/driverssystem/entries', requireAdmin, async (req, res) => {
    try {
      const filters = {};
      if (req.query.driverId) filters.driverId = req.query.driverId;
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      if (req.query.sourceId) filters.sourceId = req.query.sourceId;
      const entries = await dataLayer.getEntriesRange(filters);
      return res.json(entries);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ══════════════════════════════════════════════════════════
  // EXPENSES API (Driver — car / fixed / personal / family)
  // ══════════════════════════════════════════════════════════

  app.get('/api/driverssystem/expenses', async (req, res) => {
    try {
      const filters = {};
      if (req.query.driverId) filters.driverId = req.query.driverId;
      if (req.query.category) filters.category = req.query.category;
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      const items = await dataLayer.getExpenses(filters);
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Summary MUST come before /:id routes
  app.get('/api/driverssystem/expenses/summary', async (req, res) => {
    try {
      const driverId = req.query.driverId || '';
      const from = req.query.from || '';
      const to = req.query.to || '';
      const summary = await dataLayer.getExpensesSummary(driverId, from, to);
      return res.json(summary);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/driverssystem/expenses', async (req, res) => {
    try {
      const expense = req.body;
      if (!expense || !expense.category || !expense.amount) {
        return res.status(400).json({ error: 'Απαιτείται κατηγορία και ποσό' });
      }
      const saved = await dataLayer.addExpense(expense);
      return res.status(201).json(saved);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  app.put('/api/driverssystem/expenses/:id', async (req, res) => {
    try {
      const updated = await dataLayer.updateExpense(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  app.delete('/api/driverssystem/expenses/:id', async (req, res) => {
    try {
      const ok = await dataLayer.deleteExpense(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Admin: Expenses view (all drivers) ──

  app.get('/api/admin/driverssystem/expenses', requireAdmin, async (req, res) => {
    try {
      const filters = {};
      if (req.query.driverId) filters.driverId = req.query.driverId;
      if (req.query.category) filters.category = req.query.category;
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      const result = await dataLayer.getExpensesRange(filters);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Expenses page routes ──
  const expensePages = ['/expenses', '/expenses/car', '/expenses/fixed', '/expenses/personal', '/expenses/family'];
  expensePages.forEach(route => {
    router.get(route, (req, res) => {
      return res.sendFile(path.join(pagesDir, 'expenses.html'));
    });
  });

  // ══════════════════════════════════════════════════════════
  // CAR EXPENSE CATEGORIES (Admin-managed groups & items)
  // ══════════════════════════════════════════════════════════

  // Admin: get all car expense categories
  app.get('/api/admin/driverssystem/car-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = await dataLayer.getCarExpenseCategories();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Admin: save all car expense categories
  app.put('/api/admin/driverssystem/car-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
      const saved = await dataLayer.updateCarExpenseCategories(items);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Public: get active car expense categories (for driver app)
  app.get('/api/driverssystem/car-expense-categories', async (req, res) => {
    try {
      const all = await dataLayer.getCarExpenseCategories();
      const active = all
        .filter(g => g.active !== false)
        .map(g => ({
          ...g,
          items: (g.items || []).filter(i => i.active !== false)
        }))
        .filter(g => g.items.length > 0);
      return res.json(active);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Car expense records (driver submissions) ──
  app.post('/api/driverssystem/car-expenses', async (req, res) => {
    try {
      const { driverId, groupId, groupName, itemId, itemName, amount, date } = req.body || {};
      if (!amount || !groupId || !itemId) {
        return res.status(400).json({ error: 'Απαιτείται ομάδα, είδος και ποσό' });
      }
      const expense = await dataLayer.addExpense({
        driverId: driverId || '',
        category: 'car',
        description: `${groupName || groupId} → ${itemName || itemId}`,
        amount: parseFloat(amount) || 0,
        date: date || new Date().toISOString().slice(0, 10),
        groupId,
        itemId
      });
      return res.status(201).json(expense);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  // ── Car Expenses page route ──
  router.get('/car-expenses', (req, res) => {
    return res.sendFile(path.join(pagesDir, 'car-expenses.html'));
  });

  console.log('[driverssystem] routes registered');
};
