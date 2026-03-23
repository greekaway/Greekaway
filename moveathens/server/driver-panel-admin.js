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
      return res.json({ drivers });
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
      if (!phone || !phone.trim()) return res.status(400).json({ error: 'Απαιτείται τηλέφωνο' });

      // Check duplicate phone
      const existing = await driversData.getDriverByPhone(phone.trim());
      if (existing) return res.status(409).json({ error: 'Υπάρχει ήδη οδηγός με αυτό το τηλέφωνο' });

      const vtJSON = Array.isArray(vehicle_types) ? JSON.stringify(vehicle_types) : '[]';

      const driver = await driversData.upsertDriver({
        name: name || '',
        phone: phone.trim(),
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

  console.log('[driver-panel] Admin routes mounted');
};
