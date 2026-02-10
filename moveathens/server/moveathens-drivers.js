/**
 * MoveAthens Drivers — API Routes
 * Admin: GET    /api/admin/moveathens/drivers
 *        GET    /api/admin/moveathens/drivers/:id
 *        PUT    /api/admin/moveathens/drivers/:id
 *        DELETE /api/admin/moveathens/drivers/:id
 *        GET    /api/admin/moveathens/drivers/:id/payments
 *        POST   /api/admin/moveathens/drivers/:id/payments
 *        GET    /api/admin/moveathens/drivers/:id/requests
 */
'use strict';

const driversData = require('../../src/server/data/moveathens-drivers');
const requestsData = require('../../src/server/data/moveathens-requests');

module.exports = function registerDriverRoutes(app, opts = {}) {
  const checkAdminAuth = typeof opts.checkAdminAuth === 'function' ? opts.checkAdminAuth : null;

  // ========================================
  // List all drivers
  // ========================================
  app.get('/api/admin/moveathens/drivers', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const drivers = await driversData.getDrivers(false);
      return res.json({ drivers });
    } catch (err) {
      console.error('[ma-drivers] GET drivers failed:', err.message);
      return res.status(500).json({ error: 'Failed to load drivers' });
    }
  });

  // ========================================
  // Get single driver
  // ========================================
  app.get('/api/admin/moveathens/drivers/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const driver = await driversData.getDriverById(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });
      return res.json(driver);
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // ========================================
  // Update driver profile
  // ========================================
  app.put('/api/admin/moveathens/drivers/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const existing = await driversData.getDriverById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Driver not found' });
      const updated = await driversData.upsertDriver({
        ...existing,
        name: req.body.name !== undefined ? req.body.name : existing.name,
        phone: req.body.phone !== undefined ? req.body.phone : existing.phone,
        notes: req.body.notes !== undefined ? req.body.notes : existing.notes,
        is_active: req.body.is_active !== undefined ? req.body.is_active : existing.is_active
      });
      return res.json(updated);
    } catch (err) {
      console.error('[ma-drivers] PUT driver failed:', err.message);
      return res.status(500).json({ error: 'Update failed' });
    }
  });

  // ========================================
  // Delete driver
  // ========================================
  app.delete('/api/admin/moveathens/drivers/:id', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      // Check if driver has outstanding balance
      const driver = await driversData.getDriverById(req.params.id);
      if (driver) {
        const balance = (parseFloat(driver.total_owed) || 0) - (parseFloat(driver.total_paid) || 0);
        if (balance > 0) {
          return res.status(409).json({
            error: 'BALANCE_OWED',
            message: 'Ο οδηγός χρωστάει €' + balance.toFixed(2) + ' — δεν μπορεί να διαγραφεί.',
            balance: balance
          });
        }
      }
      await driversData.deleteDriver(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  // ========================================
  // Get driver's payment history
  // ========================================
  app.get('/api/admin/moveathens/drivers/:id/payments', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const payments = await driversData.getDriverPayments(req.params.id);
      return res.json({ payments });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load payments' });
    }
  });

  // ========================================
  // Record a payment from driver
  // ========================================
  app.post('/api/admin/moveathens/drivers/:id/payments', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { amount, note } = req.body || {};
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Valid amount required' });
      }

      const driver = await driversData.getDriverById(req.params.id);
      if (!driver) return res.status(404).json({ error: 'Driver not found' });

      const result = await driversData.recordPayment(req.params.id, parseFloat(amount), note || '');
      console.log('[ma-drivers] Payment recorded: driver', req.params.id, 'amount', amount);
      return res.json(result);
    } catch (err) {
      console.error('[ma-drivers] POST payment failed:', err.message);
      return res.status(500).json({ error: 'Payment failed' });
    }
  });

  // ========================================
  // Get driver's trip history
  // ========================================
  app.get('/api/admin/moveathens/drivers/:id/requests', async (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const requests = await requestsData.getRequests({ driver_id: req.params.id });
      return res.json({ requests });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load requests' });
    }
  });

  console.log('[ma-drivers] Routes mounted');
};
