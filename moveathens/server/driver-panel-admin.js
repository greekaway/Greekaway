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

const LOCAL_CONFIG = path.join(__dirname, '..', 'data', 'driver_panel_ui.json');
const RENDER_PERSISTENT_ROOT = '/opt/render/project/src/uploads';

// On Render, store config on persistent disk so it survives deploys
function getConfigPath() {
  if (process.env.RENDER) {
    const persistDir = path.join(RENDER_PERSISTENT_ROOT, 'driver-panel');
    try { fs.mkdirSync(persistDir, { recursive: true }); } catch (_) {}
    return path.join(persistDir, 'driver_panel_ui.json');
  }
  return LOCAL_CONFIG;
}

// ---- JSON helpers ----
function readConfig() {
  try {
    const cfgPath = getConfigPath();
    if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    // Fallback: read from source tree (first deploy / migration)
    if (process.env.RENDER && fs.existsSync(LOCAL_CONFIG)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_CONFIG, 'utf8'));
      // Migrate to persistent disk
      writeConfig(data);
      return data;
    }
  } catch (e) { console.error('[driver-panel] Config read error:', e.message); }
  return { general: {}, footer: { tabs: [] } };
}

function writeConfig(data) {
  try {
    const cfgPath = getConfigPath();
    const dir = path.dirname(cfgPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2), 'utf8');
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
  // Block / Unblock driver
  // ========================================
  app.post('/api/admin/driver-panel/drivers/:id/block', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const driver = await driversData.getDriverById(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const { duration } = req.body || {};
      let blockedUntil = null;
      if (duration && duration !== 'permanent') {
        const days = parseInt(duration, 10);
        if (days > 0) {
          const d = new Date();
          d.setDate(d.getDate() + days);
          blockedUntil = d.toISOString();
        }
      }

      await driversData.upsertDriver({ ...driver, is_blocked: true, blocked_until: blockedUntil });
      return res.json({ ok: true, is_blocked: true, blocked_until: blockedUntil });
    } catch (err) {
      console.error('[driver-panel] Block driver failed:', err.message);
      return res.status(500).json({ error: 'Block failed' });
    }
  });

  app.post('/api/admin/driver-panel/drivers/:id/unblock', async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const driver = await driversData.getDriverById(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      await driversData.upsertDriver({ ...driver, is_blocked: false, blocked_until: null });
      return res.json({ ok: true, is_blocked: false });
    } catch (err) {
      console.error('[driver-panel] Unblock driver failed:', err.message);
      return res.status(500).json({ error: 'Unblock failed' });
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

    // ── Upload Sound (MP3) ──
    const ALLOWED_AUDIO = new Set(['audio/mpeg', 'audio/mp3']);
    const soundsDir = path.join(uploadsDir, 'sounds');

    app.post('/api/admin/driver-panel/upload-sound', upload.single('sound'), (req, res) => {
      if (!guard(req, res)) return;
      if (!req.file) return res.status(400).json({ error: 'Missing file' });
      if (!ALLOWED_AUDIO.has(req.file.mimetype)) return res.status(400).json({ error: 'Μόνο αρχεία MP3' });
      if (req.file.size > 2 * 1024 * 1024) return res.status(400).json({ error: 'Μέγιστο 2MB' });

      const label = (req.body?.label || '').trim() || req.file.originalname.replace(/\.mp3$/i, '');
      const event = (req.body?.event || 'new_ride').trim();
      const category = (req.body?.category || '').trim().substring(0, 40);
      const safeLabel = label.replace(/[^a-zA-Z0-9_\-\u0370-\u03FF\u0400-\u04FF ]/g, '').substring(0, 60);
      const id = 'mp3_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const filename = `${id}.mp3`;

      fs.mkdirSync(soundsDir, { recursive: true });
      fs.writeFileSync(path.join(soundsDir, filename), req.file.buffer);

      const url = `/uploads/driver-panel/sounds/${filename}`;

      // Save to config
      const cfg = readConfig();
      if (!cfg.sounds) cfg.sounds = { files: [], defaults: {} };
      if (!cfg.sounds.files) cfg.sounds.files = [];
      const entry = { id, label: safeLabel, filename, url, event, uploadedAt: new Date().toISOString() };
      if (category) entry.category = category;
      cfg.sounds.files.push(entry);
      writeConfig(cfg);

      return res.json({ id, label: safeLabel, url, event, category: category || '' });
    });

    // ── List Sounds ──
    app.get('/api/admin/driver-panel/sounds', (req, res) => {
      if (!guard(req, res)) return;
      const cfg = readConfig();
      return res.json({ files: cfg.sounds?.files || [], defaults: cfg.sounds?.defaults || {} });
    });

    // ── Delete Sound ──
    app.delete('/api/admin/driver-panel/sounds/:id', (req, res) => {
      if (!guard(req, res)) return;
      const cfg = readConfig();
      if (!cfg.sounds?.files) return res.status(404).json({ error: 'Not found' });
      const idx = cfg.sounds.files.findIndex(f => f.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      const file = cfg.sounds.files[idx];
      // Remove file from disk
      try { fs.unlinkSync(path.join(soundsDir, file.filename)); } catch (_) {}
      cfg.sounds.files.splice(idx, 1);

      // Clear defaults that pointed to this sound
      if (cfg.sounds.defaults) {
        for (const [event, sid] of Object.entries(cfg.sounds.defaults)) {
          if (sid === file.id) delete cfg.sounds.defaults[event];
        }
      }
      writeConfig(cfg);
      return res.json({ ok: true });
    });

    // ── Set Default Sound per Event ──
    app.post('/api/admin/driver-panel/sounds/default', (req, res) => {
      if (!guard(req, res)) return;
      const { event, soundId } = req.body || {};
      if (!event) return res.status(400).json({ error: 'Missing event' });
      const cfg = readConfig();
      if (!cfg.sounds) cfg.sounds = { files: [], defaults: {} };
      if (!cfg.sounds.defaults) cfg.sounds.defaults = {};
      if (soundId) {
        cfg.sounds.defaults[event] = soundId;
      } else {
        delete cfg.sounds.defaults[event];
      }
      writeConfig(cfg);
      return res.json({ ok: true });
    });
  }

  console.log('[driver-panel] Admin routes mounted');
};
