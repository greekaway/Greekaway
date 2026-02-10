/**
 * MoveAthens Drivers — Data Layer
 * Handles CRUD for driver profiles and payment tracking.
 * Uses PostgreSQL when available, falls back to in-memory + JSON.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'moveathens', 'data');
const DRIVERS_FILE = path.join(DATA_DIR, 'drivers.json');
const PAYMENTS_FILE = path.join(DATA_DIR, 'driver_payments.json');

let db = null;
let dbAvailable = false;
let driversStore = [];
let paymentsStore = [];

function makeId(prefix = 'drv') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// ---- JSON helpers ----
function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) { console.error('[ma-drivers] JSON read error:', e.message); }
  return [];
}

function saveJSON(filePath, data) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('[ma-drivers] JSON write error:', e.message); }
}

// ---- Init ----
async function init() {
  try {
    db = require('../../../db');
    if (db && db.isAvailable && db.isAvailable()) {
      dbAvailable = true;
    } else {
      dbAvailable = false;
    }
  } catch (e) {
    dbAvailable = false;
  }
  if (!dbAvailable) {
    driversStore = loadJSON(DRIVERS_FILE);
    paymentsStore = loadJSON(PAYMENTS_FILE);
  }
}

// ==================== DRIVERS ====================

async function getDrivers(activeOnly = false) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.getDrivers(activeOnly); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  let list = [...driversStore];
  if (activeOnly) list = list.filter(d => d.is_active !== false);
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return list;
}

async function getDriverById(id) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.getDriverById(id); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  return driversStore.find(d => d.id === id) || null;
}

async function getDriverByPhone(phone) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.getDriverByPhone(phone); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  return driversStore.find(d => d.phone === phone) || null;
}

async function upsertDriver(data) {
  await init();
  const id = data.id || makeId('drv');
  const record = {
    id,
    name: (data.name || '').trim(),
    phone: (data.phone || '').trim(),
    notes: (data.notes || '').trim(),
    is_active: data.is_active !== false,
    total_trips: parseInt(data.total_trips, 10) || 0,
    total_revenue: parseFloat(data.total_revenue) || 0,
    total_owed: parseFloat(data.total_owed) || 0,
    total_paid: parseFloat(data.total_paid) || 0,
    created_at: data.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (dbAvailable) {
    try { return await db.ma.upsertDriver(record); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }

  const idx = driversStore.findIndex(d => d.id === id);
  if (idx >= 0) {
    driversStore[idx] = { ...driversStore[idx], ...record };
  } else {
    driversStore.push(record);
  }
  saveJSON(DRIVERS_FILE, driversStore);
  return record;
}

/**
 * Find or create driver by phone number.
 * Used when driver accepts a request.
 */
async function findOrCreateByPhone(phone, name = '') {
  await init();
  const clean = (phone || '').replace(/\s/g, '').trim();
  if (!clean) return null;

  let existing = await getDriverByPhone(clean);
  if (existing) return existing;

  // Create new driver profile
  return await upsertDriver({
    phone: clean,
    name: name || clean,
    is_active: true
  });
}

async function updateDriverTotals(driverId, tripRevenue, serviceCommission) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.updateDriverTotals(driverId, tripRevenue, serviceCommission); }
    catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  const idx = driversStore.findIndex(d => d.id === driverId);
  if (idx < 0) return null;
  const d = driversStore[idx];
  d.total_trips = (d.total_trips || 0) + 1;
  d.total_revenue = (parseFloat(d.total_revenue) || 0) + parseFloat(tripRevenue);
  d.total_owed = (parseFloat(d.total_owed) || 0) + parseFloat(serviceCommission);
  d.updated_at = new Date().toISOString();
  saveJSON(DRIVERS_FILE, driversStore);
  return d;
}

async function deleteDriver(id) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.deleteDriver(id); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  const before = driversStore.length;
  driversStore = driversStore.filter(d => d.id !== id);
  saveJSON(DRIVERS_FILE, driversStore);
  return driversStore.length < before;
}

// ==================== PAYMENTS ====================

async function getDriverPayments(driverId) {
  await init();
  if (dbAvailable) {
    try { return await db.ma.getDriverPayments(driverId); } catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }
  return paymentsStore.filter(p => p.driver_id === driverId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function recordPayment(driverId, amount, note = '') {
  await init();
  const paymentId = makeId('pay');
  const amt = parseFloat(amount) || 0;

  if (dbAvailable) {
    try { return await db.ma.recordDriverPayment(driverId, paymentId, amt, note); }
    catch (e) { console.error('[ma-drivers] DB:', e.message); }
  }

  // JSON fallback
  const payment = {
    id: paymentId,
    driver_id: driverId,
    amount: amt,
    note,
    created_at: new Date().toISOString()
  };
  paymentsStore.push(payment);
  saveJSON(PAYMENTS_FILE, paymentsStore);

  // Update driver totals
  const idx = driversStore.findIndex(d => d.id === driverId);
  if (idx >= 0) {
    driversStore[idx].total_paid = (parseFloat(driversStore[idx].total_paid) || 0) + amt;
    driversStore[idx].updated_at = new Date().toISOString();
    saveJSON(DRIVERS_FILE, driversStore);
  }

  return { payment, driver: idx >= 0 ? driversStore[idx] : null };
}

module.exports = {
  init,
  makeId,
  getDrivers,
  getDriverById,
  getDriverByPhone,
  findOrCreateByPhone,
  upsertDriver,
  updateDriverTotals,
  deleteDriver,
  getDriverPayments,
  recordPayment
};
