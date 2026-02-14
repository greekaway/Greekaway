const express = require('express');
const path = require('path');
const fs = require('fs');
let multer = null;
try { multer = require('multer'); } catch (_) { multer = null; }

const dataLayer = require('../../src/server/data/driverssystem');
const { registerDriversSystemAssistant } = require('./assistant');

// ── Greece Timezone Helper ──
function greeceDateStr() {
  const now = new Date();
  const gr = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Athens' }));
  return gr.getFullYear() + '-' + String(gr.getMonth() + 1).padStart(2, '0') + '-' + String(gr.getDate()).padStart(2, '0');
}

module.exports = function registerDriversSystem(app, opts = {}) {
  const isDev = !!opts.isDev;
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;
  const baseDir = path.join(__dirname, '..');
  const pagesDir = path.join(baseDir, 'pages');
  const partialsDir = path.join(baseDir, 'partials');
  const router = express.Router();

  // ── Footer injection: read the partial once and inject server-side ──
  let footerHtml = '';
  try {
    footerHtml = fs.readFileSync(path.join(partialsDir, 'footer.html'), 'utf8');
  } catch (_) {
    console.warn('[driverssystem] footer.html partial not found — will use client-side fetch');
  }

  // Helper: serve page with footer pre-injected (saves a client-side fetch)
  const sendPageWithFooter = (res, filePath) => {
    if (!footerHtml) return res.sendFile(filePath);
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return res.status(404).send('Not found');
      const injected = html.replace(
        '<div data-ds-footer-slot></div>',
        `<div data-ds-footer-slot>${footerHtml}</div>`
      );
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(injected);
    });
  };

  if (isDev) {
    router.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
    // Reload footer partial in dev so changes are picked up
    router.use((req, res, next) => {
      try { footerHtml = fs.readFileSync(path.join(partialsDir, 'footer.html'), 'utf8'); } catch (_) {}
      next();
    });
  }

  router.use(express.static(baseDir, { index: false }));

  const pageMap = {
    '/': 'welcome.html',
    '/listings': 'entries.html',
    '/info': 'stats.html',
    '/stats': 'stats.html',
    '/profile': 'profile.html',
    '/assistant': 'assistant.html'
  };

  Object.keys(pageMap).forEach((routePath) => {
    router.get(routePath, (req, res) => {
      const fileName = pageMap[routePath];
      return sendPageWithFooter(res, path.join(pagesDir, fileName));
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
      // Allow browser to cache config for 2 minutes — reduces repeat fetches
      if (!isDev) res.set('Cache-Control', 'public, max-age=120');
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
      // Support date-range queries for overlay drill-downs
      if (req.query.from) filters.from = req.query.from;
      if (req.query.to) filters.to = req.query.to;
      const useRange = filters.from || filters.to;
      const items = useRange
        ? await dataLayer.getEntriesRange(filters)
        : await dataLayer.getEntries(filters);
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
      const date = req.query.date || greeceDateStr();
      const driverId = req.query.driverId || null;
      const summary = await dataLayer.getEntriesSummary(date, driverId);
      return res.json(summary);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ── Driver Identity ──

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

  // ── Dashboard API (Driver - monthly performance from real data) ──

  app.get('/api/driverssystem/dashboard', async (req, res) => {
    try {
      const opts = {};
      if (req.query.driverId) opts.driverId = req.query.driverId;
      if (req.query.month) opts.month = req.query.month;
      const dashboard = await dataLayer.getDashboard(opts);
      return res.json(dashboard);
    } catch (err) {
      console.error('[driverssystem] dashboard error:', err.message);
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

  // ── Admin: Dashboard (monthly performance) ──

  app.get('/api/admin/driverssystem/dashboard', requireAdmin, async (req, res) => {
    try {
      const opts = {};
      if (req.query.driverId) opts.driverId = req.query.driverId;
      if (req.query.month) opts.month = req.query.month;
      const dashboard = await dataLayer.getDashboard(opts);
      return res.json(dashboard);
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
      const { driverId, groupId, groupName, itemId, itemName, amount, date, note } = req.body || {};
      if (!amount || !groupId || !itemId) {
        return res.status(400).json({ error: 'Απαιτείται ομάδα, είδος και ποσό' });
      }
      const desc = note
        ? `${groupName || groupId} → ${itemName || itemId} | ${note}`
        : `${groupName || groupId} → ${itemName || itemId}`;
      const expense = await dataLayer.addExpense({
        driverId: driverId || '',
        category: 'car',
        description: desc,
        amount: parseFloat(amount) || 0,
        date: date || greeceDateStr(),
        groupId,
        groupName: groupName || '',
        itemId,
        itemName: itemName || ''
      });
      return res.status(201).json(expense);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  // ── Car Expenses page route ──
  router.get('/car-expenses', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'car-expenses.html'));
  });
  // Group sub-page (same HTML, JS reads groupId from URL)
  router.get('/car-expenses/:groupId', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'car-expenses.html'));
  });

  // ══════════════════════════════════════════════════════════
  // PERSONAL / HOME EXPENSE CATEGORIES (Admin-managed groups & items)
  // ══════════════════════════════════════════════════════════

  // Admin: get all personal expense categories
  app.get('/api/admin/driverssystem/personal-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = await dataLayer.getPersonalExpenseCategories();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Admin: save all personal expense categories
  app.put('/api/admin/driverssystem/personal-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
      const saved = await dataLayer.updatePersonalExpenseCategories(items);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Public: get active personal expense categories (for driver app)
  app.get('/api/driverssystem/personal-expense-categories', async (req, res) => {
    try {
      const all = await dataLayer.getPersonalExpenseCategories();
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

  // ── Personal expense records (driver submissions) ──
  app.post('/api/driverssystem/personal-expenses', async (req, res) => {
    try {
      const { driverId, groupId, groupName, itemId, itemName, amount, date, note } = req.body || {};
      if (!amount || !groupId || !itemId) {
        return res.status(400).json({ error: 'Απαιτείται ομάδα, είδος και ποσό' });
      }
      const desc = note
        ? `${groupName || groupId} → ${itemName || itemId} | ${note}`
        : `${groupName || groupId} → ${itemName || itemId}`;
      const expense = await dataLayer.addExpense({
        driverId: driverId || '',
        category: 'personal',
        description: desc,
        amount: parseFloat(amount) || 0,
        date: date || greeceDateStr(),
        groupId,
        groupName: groupName || '',
        itemId,
        itemName: itemName || ''
      });
      return res.status(201).json(expense);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  // ── Personal Expenses page route ──
  router.get('/personal-expenses', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'personal-expenses.html'));
  });
  router.get('/personal-expenses/:groupId', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'personal-expenses.html'));
  });

  // ══════════════════════════════════════════════════════════
  // TAX / INSURANCE EXPENSE CATEGORIES (Admin-managed groups & items)
  // ══════════════════════════════════════════════════════════

  // Admin: get all tax expense categories
  app.get('/api/admin/driverssystem/tax-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = await dataLayer.getTaxExpenseCategories();
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Admin: save all tax expense categories
  app.put('/api/admin/driverssystem/tax-expense-categories', requireAdmin, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Expected array' });
      const saved = await dataLayer.updateTaxExpenseCategories(items);
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // Public: get active tax expense categories (for driver app)
  app.get('/api/driverssystem/tax-expense-categories', async (req, res) => {
    try {
      const all = await dataLayer.getTaxExpenseCategories();
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

  // ── Tax expense records (driver submissions) ──
  app.post('/api/driverssystem/tax-expenses', async (req, res) => {
    try {
      const { driverId, groupId, groupName, itemId, itemName, amount, date, note } = req.body || {};
      if (!amount || !groupId || !itemId) {
        return res.status(400).json({ error: 'Απαιτείται ομάδα, είδος και ποσό' });
      }
      const desc = note
        ? `${groupName || groupId} → ${itemName || itemId} | ${note}`
        : `${groupName || groupId} → ${itemName || itemId}`;
      const expense = await dataLayer.addExpense({
        driverId: driverId || '',
        category: 'tax',
        description: desc,
        amount: parseFloat(amount) || 0,
        date: date || greeceDateStr(),
        groupId,
        groupName: groupName || '',
        itemId,
        itemName: itemName || ''
      });
      return res.status(201).json(expense);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Server error' });
    }
  });

  // ── Tax Expenses page route ──
  router.get('/tax-expenses', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'tax-expenses.html'));
  });
  router.get('/tax-expenses/:groupId', (req, res) => {
    return sendPageWithFooter(res, path.join(pagesDir, 'tax-expenses.html'));
  });

  // ── AI Assistant routes ──
  try {
    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim() || null;
    registerDriversSystemAssistant(app, { OPENAI_API_KEY });
  } catch (err) {
    console.error('[driverssystem] assistant registration failed:', err.message);
  }

  console.log('[driverssystem] routes registered');
};
