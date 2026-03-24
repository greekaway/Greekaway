/**
 * Driver Panel Admin — API Routes
 * Handles:
 *   GET/POST  /api/admin/driver-panel/config   — panel UI config
 *   GET       /api/admin/driver-panel/drivers   — list drivers (with panel fields)
 *   POST      /api/admin/driver-panel/drivers   — create driver
 *   PUT       /api/admin/driver-panel/drivers/:id — update driver
 *   DELETE    /api/admin/driver-panel/drivers/:id — delete driver
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let multer = null;
try { multer = require('multer'); } catch (_) { multer = null; }
const driversData = require('../../src/server/data/moveathens-drivers');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'driver_panel_ui.json');

// ---- JSON helpers ----
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) { console.error('[driver-panel] Config read error:', e.message); }
  return { general: {}, footer: { tabs: [] } };
}

function writeConfig(data) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[driver-panel] Config write error:', e.message);
    return false;
  }
}

module.exports = function registerDriverPanelRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  const guard = (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return false;
    }
    return true;
  };

  // ========================================
  // GET config
  // ========================================
  app.get('/api/admin/driver-panel/config', (req, res) => {
    if (!guard(req, res)) return;
    return res.json(readConfig());
  });

  // ========================================
  // POST config (save)
  // ========================================
  app.post('/api/admin/driver-panel/config', (req, res) => {
    if (!guard(req, res)) return;
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid body' });
    const ok = writeConfig(body);
    if (!ok) return res.status(500).json({ error: 'Write failed' });
    return res.json({ ok: true });
  });

  // ========================================
  // GET drivers list (with panel fields)
  // ========================================
  app.get('/api/admin/driver-panel/drivers', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const drivers = await driversData.getDrivers(false);
      const safe = drivers.map(d => {
        const { pin_hash, ...rest } = d;
        return { ...rest, has_pin: !!pin_hash };
      });
      return res.json({ drivers: safe });
    } catch (err) {
      console.error('[driver-panel] GET drivers failed:', err.message);
      return res.status(500).json({ error: 'Failed to load drivers' });
    }
  });

  // ========================================
  // POST create driver
  // ========================================
  app.post('/api/admin/driver-panel/drivers', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { name, phone, notes, is_active, vehicle_types, display_name } = req.body || {};
      // Normalize: strip spaces/dashes/parens, auto-add +30 for Greek mobiles
      let cleanPhone = (phone || '').replace(/[\s\-\(\)\.]/g, '').trim();
      if (/^69\d{8}$/.test(cleanPhone)) cleanPhone = '+30' + cleanPhone;
      if (/^30\d{10}$/.test(cleanPhone)) cleanPhone = '+' + cleanPhone;
      if (!cleanPhone) return res.status(400).json({ error: 'Απαιτείται τηλέφωνο' });

      // Check duplicate phone
      const existing = await driversData.getDriverByPhone(cleanPhone);
      if (existing) return res.status(409).json({ error: 'Υπάρχει ήδη οδηγός με αυτό το τηλέφωνο' });

      const vtJSON = Array.isArray(vehicle_types) ? JSON.stringify(vehicle_types) : '[]';

      const driver = await driversData.upsertDriver({
        name: name || '',
        phone: cleanPhone,
        notes: notes || '',
        is_active: is_active !== false,
        vehicle_types: vtJSON,
        display_name: display_name || null
      });

      console.log('[driver-panel] Driver created:', driver.id, driver.phone);
      return res.json(driver);
    } catch (err) {
      console.error('[driver-panel] POST driver failed:', err.message);
      return res.status(500).json({ error: 'Create failed' });
    }
  });

  // ========================================
  // PUT update driver
  // ========================================
  app.put('/api/admin/driver-panel/drivers/:id', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const existing = await driversData.getDriverById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Driver not found' });

      const b = req.body || {};
      const vtJSON = b.vehicle_types !== undefined
        ? (Array.isArray(b.vehicle_types) ? JSON.stringify(b.vehicle_types) : b.vehicle_types)
        : existing.vehicle_types;

      const updated = await driversData.upsertDriver({
        ...existing,
        name: b.name !== undefined ? b.name : existing.name,
        phone: b.phone !== undefined ? b.phone : existing.phone,
        notes: b.notes !== undefined ? b.notes : existing.notes,
        is_active: b.is_active !== undefined ? b.is_active : existing.is_active,
        vehicle_types: vtJSON,
        current_vehicle_type: b.current_vehicle_type !== undefined ? b.current_vehicle_type : existing.current_vehicle_type,
        display_name: b.display_name !== undefined ? b.display_name : existing.display_name
      });

      return res.json(updated);
    } catch (err) {
      console.error('[driver-panel] PUT driver failed:', err.message);
      return res.status(500).json({ error: 'Update failed' });
    }
  });

  // ========================================
  // DELETE driver
  // ========================================
  app.delete('/api/admin/driver-panel/drivers/:id', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const driver = await driversData.getDriverById(req.params.id);
      if (driver) {
        const balance = (parseFloat(driver.total_owed) || 0) - (parseFloat(driver.total_paid) || 0);
        if (balance > 0) {
          return res.status(409).json({
            error: 'BALANCE_OWED',
            message: 'Ο οδηγός χρωστάει €' + balance.toFixed(2) + ' — δεν μπορεί να διαγραφεί.',
            balance
          });
        }
      }
      await driversData.deleteDriver(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      console.error('[driver-panel] DELETE driver failed:', err.message);
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  // ========================================
  // Admin PIN reset for driver
  // ========================================
  app.delete('/api/admin/driver-panel/driver-pin', async (req, res) => {
    if (!guard(req, res)) return;
    const driverId = req.body?.driverId;
    if (!driverId) return res.status(400).json({ error: 'driverId required' });
    try {
      const driver = await driversData.getDriverById(driverId);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });
      await driversData.upsertDriver({ ...driver, pin_hash: null });
      return res.json({ ok: true });
    } catch (err) {
      console.error('[driver-panel] PIN reset failed:', err.message);
      return res.status(500).json({ error: 'Failed to reset PIN' });
    }
  });

  // ========================================
  // UPLOADS (logo + footer icons)
  // ========================================
  if (multer) {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
    });

    const ALLOWED_IMG = new Set(['image/png', 'image/webp', 'image/svg+xml', 'image/jpeg']);
    const uploadsDir = path.join(__dirname, '..', '..', 'uploads', 'driver-panel');

    // ── Upload Logo ──
    app.post('/api/admin/driver-panel/upload-logo', upload.single('logo'), (req, res) => {
      if (!guard(req, res)) return;
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      if (!ALLOWED_IMG.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type (PNG, WebP, SVG, JPEG)' });

      const ext = req.file.originalname.split('.').pop().toLowerCase() || 'png';
      const dir = path.join(uploadsDir, 'logo');
      fs.mkdirSync(dir, { recursive: true });
      const outPath = path.join(dir, `logo.${ext}`);
      fs.writeFileSync(outPath, req.file.buffer);

      const url = `/uploads/driver-panel/logo/logo.${ext}`;
      // Auto-save to config
      const cfg = readConfig();
      if (!cfg.general) cfg.general = {};
      cfg.general.logoUrl = url;
      writeConfig(cfg);
      return res.json({ url });
    });

    // ── Upload Footer Icon ──
    app.post('/api/admin/driver-panel/upload-footer-icon', upload.single('icon'), (req, res) => {
      if (!guard(req, res)) return;
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      if (!ALLOWED_IMG.has(req.file.mimetype)) return res.status(400).json({ error: 'Invalid file type (PNG, WebP, SVG, JPEG)' });

      const tabKey = req.body?.tabKey;
      if (!tabKey) return res.status(400).json({ error: 'Missing tabKey' });

      const ext = req.file.originalname.split('.').pop().toLowerCase() || 'svg';
      const dir = path.join(uploadsDir, 'icons');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `footer-${tabKey}.${ext}`;
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);

      const url = `/uploads/driver-panel/icons/${filename}?v=${Date.now()}`;
      // Auto-save iconUrl to config
      const cfg = readConfig();
      const tabs = cfg.footer?.tabs || [];
      const tab = tabs.find(t => t.key === tabKey);
      if (tab) {
        tab.iconUrl = url;
        cfg.footer = { tabs };
        writeConfig(cfg);
      }
      return res.json({ url });
    });
  }

  console.log('[driver-panel] Admin routes mounted');
};
