'use strict';
/**
 * DriversSystem Data Layer
 * JSON-file based storage for DriversSystem UI config
 *
 * PERSISTENCE STRATEGY:
 * - On Render (production): data lives on the persistent disk at
 *   /opt/render/project/src/uploads/driverssystem-data/
 *   so admin changes survive deployments.
 * - Locally (dev): data lives in driverssystem/data/ as before.
 * - On first Render boot: if persistent folder is empty, seed from repo defaults.
 */

const fs = require('fs');
const path = require('path');

const IS_RENDER = !!process.env.RENDER;
const RENDER_PERSISTENT_ROOT = '/opt/render/project/src/uploads';
const REPO_DATA_DIR = path.join(__dirname, '..', '..', '..', 'driverssystem', 'data');

// Resolve DATA_DIR: persistent disk on Render, repo folder locally
function resolveDataDir() {
  if (IS_RENDER) {
    const persistent = path.join(RENDER_PERSISTENT_ROOT, 'driverssystem-data');
    try { fs.mkdirSync(persistent, { recursive: true }); } catch (_) {}
    return persistent;
  }
  return REPO_DATA_DIR;
}

const DATA_DIR = resolveDataDir();
const UI_CONFIG_PATH = path.join(DATA_DIR, 'driverssystem_ui.json');
const ENTRIES_PATH = path.join(DATA_DIR, 'entries.json');
const DRIVERS_PATH = path.join(DATA_DIR, 'drivers.json');
const EXPENSES_PATH = path.join(DATA_DIR, 'expenses.json');

// ── Seed persistent disk from repo defaults on first boot ──
function seedIfNeeded() {
  if (!IS_RENDER) return;
  // If config already exists on the persistent disk, do nothing
  if (fs.existsSync(UI_CONFIG_PATH)) {
    console.log('[driverssystem] persistent data found at', DATA_DIR);
    return;
  }
  console.log('[driverssystem] first boot — seeding persistent data from repo defaults');
  try {
    const repoConfig = path.join(REPO_DATA_DIR, 'driverssystem_ui.json');
    if (fs.existsSync(repoConfig)) {
      fs.copyFileSync(repoConfig, UI_CONFIG_PATH);
      console.log('[driverssystem] seeded ui config');
    } else {
      // Write defaults
      fs.writeFileSync(UI_CONFIG_PATH, JSON.stringify(getDefaultConfig(), null, 2));
      console.log('[driverssystem] wrote default ui config');
    }
  } catch (err) {
    console.error('[driverssystem] seed error:', err.message);
  }
}

// Run seed immediately on module load
seedIfNeeded();

// =========================================================
// JSON FILE OPERATIONS
// =========================================================

function readConfig() {
  try {
    if (!fs.existsSync(UI_CONFIG_PATH)) {
      return getDefaultConfig();
    }
    const raw = fs.readFileSync(UI_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[driverssystem] read failed:', err.message);
    return getDefaultConfig();
  }
}

function writeConfig(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${UI_CONFIG_PATH}.tmp`;
    const backupPath = `${UI_CONFIG_PATH}.bak`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    if (fs.existsSync(UI_CONFIG_PATH)) {
      try { fs.copyFileSync(UI_CONFIG_PATH, backupPath); } catch (_) { }
    }
    fs.renameSync(tmpPath, UI_CONFIG_PATH);
    return true;
  } catch (err) {
    console.error('[driverssystem] write failed:', err.message);
    return false;
  }
}

function getDefaultConfig() {
  return {
    heroHeadline: 'DriversSystem',
    heroSubtext: 'Διαχείριση Οδηγών & Freelancers',
    heroLogoUrl: '',
    footerLabels: {
      home: 'Αρχική',
      listings: 'Καταχωρήσεις',
      assistant: 'Βοηθός',
      info: 'Πληροφορίες',
      profile: 'Προφίλ'
    },
    footerIcons: {
      home: '',
      listings: '',
      assistant: '',
      info: '',
      profile: ''
    },
    phoneNumber: '',
    whatsappNumber: '',
    companyEmail: '',
    contactLabels: {
      email: 'Email',
      phone: 'Τηλέφωνο',
      whatsapp: 'WhatsApp'
    },
    infoPageTitle: 'Πληροφορίες',
    infoPageContent: '',
    infoCancellationTitle: '',
    infoCancellationContent: '',
    infoComplianceTitle: '',
    infoComplianceContent: '',
    infoFaqTitle: '',
    infoFaqContent: '',
    financials: [],
    tripSources: [
      { id: 'uber', name: 'Uber', commission: 25, color: '#000000', active: true },
      { id: 'bolt', name: 'Bolt', commission: 20, color: '#34D186', active: true },
      { id: 'beat', name: 'Beat', commission: 20, color: '#9B59B6', active: true },
      { id: 'street', name: 'Δρόμος', commission: 0, color: '#F39C12', active: true }
    ]
  };
}

// =========================================================
// PUBLIC API
// =========================================================

async function getConfig() {
  return readConfig();
}

async function updateConfig(incoming) {
  const current = readConfig();
  const merged = Object.assign({}, current, incoming);
  const ok = writeConfig(merged);
  return ok ? merged : null;
}

async function getFullConfig() {
  return readConfig();
}

// ── Financials ──

async function getFinancials() {
  const cfg = readConfig();
  return Array.isArray(cfg.financials) ? cfg.financials : [];
}

async function updateFinancials(items) {
  const cfg = readConfig();
  cfg.financials = Array.isArray(items) ? items : [];
  writeConfig(cfg);
  return cfg.financials;
}

// ── Trip Sources ──

async function getTripSources() {
  const cfg = readConfig();
  return Array.isArray(cfg.tripSources) ? cfg.tripSources : [];
}

async function updateTripSources(items) {
  const cfg = readConfig();
  cfg.tripSources = Array.isArray(items) ? items : [];
  writeConfig(cfg);
  return cfg.tripSources;
}

// ── Entries ──

function readEntries() {
  try {
    if (!fs.existsSync(ENTRIES_PATH)) return [];
    const raw = fs.readFileSync(ENTRIES_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeEntries(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${ENTRIES_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, ENTRIES_PATH);
    return true;
  } catch (err) {
    console.error('[driverssystem] entries write failed:', err.message);
    return false;
  }
}

async function getEntries(filters = {}) {
  let entries = readEntries();
  if (filters.date) {
    entries = entries.filter(e => e.date === filters.date);
  }
  if (filters.sourceId) {
    entries = entries.filter(e => e.sourceId === filters.sourceId);
  }
  if (filters.driverId) {
    entries = entries.filter(e => e.driverId === filters.driverId);
  }
  // Sort newest first
  entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return entries;
}

async function addEntry(entry) {
  const entries = readEntries();
  const newEntry = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    driverId: entry.driverId || '',
    sourceId: entry.sourceId || '',
    sourceName: entry.sourceName || '',
    amount: parseFloat(entry.amount) || 0,
    commission: parseFloat(entry.commission) || 0,
    netAmount: parseFloat(entry.netAmount) || 0,
    date: entry.date || new Date().toISOString().slice(0, 10),
    time: entry.time || new Date().toTimeString().slice(0, 5),
    note: (entry.note || '').trim(),
    createdAt: new Date().toISOString()
  };
  entries.push(newEntry);
  writeEntries(entries);
  return newEntry;
}

async function deleteEntry(id) {
  const entries = readEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  writeEntries(entries);
  return true;
}

async function getEntriesSummary(date, driverId) {
  let entries = readEntries().filter(e => e.date === date);
  if (driverId) {
    entries = entries.filter(e => e.driverId === driverId);
  }
  const totalGross = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalNet = entries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalCommission = totalGross - totalNet;
  const count = entries.length;
  const bySource = {};
  entries.forEach(e => {
    const key = e.sourceId || 'unknown';
    if (!bySource[key]) bySource[key] = { name: e.sourceName || key, gross: 0, net: 0, count: 0 };
    bySource[key].gross += e.amount || 0;
    bySource[key].net += e.netAmount || 0;
    bySource[key].count++;
  });
  return { date, count, totalGross, totalNet, totalCommission, bySource };
}

// =========================================================
// DRIVERS
// =========================================================

function readDrivers() {
  try {
    if (!fs.existsSync(DRIVERS_PATH)) return [];
    const raw = fs.readFileSync(DRIVERS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeDrivers(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${DRIVERS_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, DRIVERS_PATH);
    return true;
  } catch (err) {
    console.error('[driverssystem] drivers write failed:', err.message);
    return false;
  }
}

async function getDrivers(filters = {}) {
  let drivers = readDrivers();
  if (filters.search) {
    const q = filters.search.toLowerCase();
    drivers = drivers.filter(d =>
      (d.fullName || '').toLowerCase().includes(q) ||
      (d.phone || '').includes(q) ||
      (d.email || '').toLowerCase().includes(q)
    );
  }
  drivers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return drivers;
}

async function getDriverByPhone(phone) {
  const drivers = readDrivers();
  return drivers.find(d => d.phone === phone) || null;
}

async function registerDriver(data) {
  const drivers = readDrivers();
  const phone = (data.phone || '').trim();
  if (!phone) return null;
  // Check if already exists
  const existing = drivers.find(d => d.phone === phone);
  if (existing) {
    // Update name/email if provided
    if (data.fullName) existing.fullName = data.fullName.trim();
    if (data.email) existing.email = data.email.trim();
    existing.lastLoginAt = new Date().toISOString();
    writeDrivers(drivers);
    return existing;
  }
  const newDriver = {
    id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    phone,
    fullName: (data.fullName || '').trim(),
    email: (data.email || '').trim(),
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
  drivers.push(newDriver);
  writeDrivers(drivers);
  return newDriver;
}

async function updateDriver(phone, data) {
  const drivers = readDrivers();
  const idx = drivers.findIndex(d => d.phone === phone);
  if (idx === -1) return null;
  if (data.fullName !== undefined) drivers[idx].fullName = data.fullName.trim();
  if (data.email !== undefined) drivers[idx].email = data.email.trim();
  writeDrivers(drivers);
  return drivers[idx];
}

async function deleteDriver(id) {
  const drivers = readDrivers();
  const idx = drivers.findIndex(d => d.id === id);
  if (idx === -1) return false;
  drivers.splice(idx, 1);
  writeDrivers(drivers);
  return true;
}

// =========================================================
// ENTRIES RANGE & STATS
// =========================================================

async function getEntriesRange(filters = {}) {
  let entries = readEntries();
  if (filters.driverId) {
    entries = entries.filter(e => e.driverId === filters.driverId);
  }
  if (filters.from) {
    entries = entries.filter(e => e.date >= filters.from);
  }
  if (filters.to) {
    entries = entries.filter(e => e.date <= filters.to);
  }
  if (filters.sourceId) {
    entries = entries.filter(e => e.sourceId === filters.sourceId);
  }
  entries.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return entries;
}

/**
 * Get aggregated statistics for a date range, grouped by period
 * @param {Object} filters - { driverId, from, to, period: 'day'|'week'|'month' }
 */
async function getStatsRange(filters = {}) {
  let entries = readEntries();
  if (filters.driverId) {
    entries = entries.filter(e => e.driverId === filters.driverId);
  }
  if (filters.from) {
    entries = entries.filter(e => e.date >= filters.from);
  }
  if (filters.to) {
    entries = entries.filter(e => e.date <= filters.to);
  }
  if (filters.sourceId) {
    entries = entries.filter(e => e.sourceId === filters.sourceId);
  }

  // Totals
  const totalGross = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalNet = entries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalCommission = totalGross - totalNet;
  const count = entries.length;

  // By source
  const bySource = {};
  entries.forEach(e => {
    const key = e.sourceId || 'unknown';
    if (!bySource[key]) bySource[key] = { name: e.sourceName || key, gross: 0, net: 0, count: 0 };
    bySource[key].gross += e.amount || 0;
    bySource[key].net += e.netAmount || 0;
    bySource[key].count++;
  });

  // Group by period
  const period = filters.period || 'day';
  const groups = {};
  entries.forEach(e => {
    let key;
    if (period === 'month') {
      key = e.date.slice(0, 7); // YYYY-MM
    } else if (period === 'week') {
      // ISO week start (Monday)
      const d = new Date(e.date + 'T00:00:00');
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      key = d.toISOString().slice(0, 10);
    } else {
      key = e.date; // day
    }
    if (!groups[key]) groups[key] = { period: key, gross: 0, net: 0, commission: 0, count: 0 };
    groups[key].gross += e.amount || 0;
    groups[key].net += e.netAmount || 0;
    groups[key].commission += (e.amount || 0) - (e.netAmount || 0);
    groups[key].count++;
  });

  // Sort periods descending
  const timeline = Object.values(groups).sort((a, b) => b.period.localeCompare(a.period));

  return {
    from: filters.from || null,
    to: filters.to || null,
    period,
    count,
    totalGross,
    totalNet,
    totalCommission,
    bySource,
    timeline
  };
}

module.exports = {
  getConfig,
  updateConfig,
  getFullConfig,
  getFinancials,
  updateFinancials,
  getDefaultConfig,
  getTripSources,
  updateTripSources,
  getEntries,
  addEntry,
  deleteEntry,
  getEntriesSummary,
  // Drivers
  getDrivers,
  getDriverByPhone,
  registerDriver,
  updateDriver,
  deleteDriver,
  // Stats
  getEntriesRange,
  getStatsRange,
  // Expenses
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpensesRange,
  getExpensesSummary
};

// =========================================================
// EXPENSES (Car / Fixed / Personal / Family)
// =========================================================

const EXPENSE_CATEGORIES = ['car', 'fixed', 'personal', 'family'];

function readExpenses() {
  try {
    if (!fs.existsSync(EXPENSES_PATH)) return [];
    const raw = fs.readFileSync(EXPENSES_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function writeExpenses(data) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${EXPENSES_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    fs.renameSync(tmpPath, EXPENSES_PATH);
    return true;
  } catch (err) {
    console.error('[driverssystem] expenses write failed:', err.message);
    return false;
  }
}

async function getExpenses(filters = {}) {
  let expenses = readExpenses();
  if (filters.driverId) expenses = expenses.filter(e => e.driverId === filters.driverId);
  if (filters.category) expenses = expenses.filter(e => e.category === filters.category);
  if (filters.from) expenses = expenses.filter(e => e.date >= filters.from);
  if (filters.to) expenses = expenses.filter(e => e.date <= filters.to);
  expenses.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return expenses;
}

async function addExpense(expense) {
  const expenses = readExpenses();
  const cat = (expense.category || '').toLowerCase();
  if (!EXPENSE_CATEGORIES.includes(cat)) {
    throw new Error('Invalid category: ' + cat);
  }
  const newExpense = {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    driverId: expense.driverId || '',
    category: cat,
    description: (expense.description || '').trim(),
    amount: parseFloat(expense.amount) || 0,
    date: expense.date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };
  expenses.push(newExpense);
  writeExpenses(expenses);
  return newExpense;
}

async function updateExpense(id, data) {
  const expenses = readExpenses();
  const idx = expenses.findIndex(e => e.id === id);
  if (idx === -1) return null;
  if (data.description !== undefined) expenses[idx].description = (data.description || '').trim();
  if (data.amount !== undefined) expenses[idx].amount = parseFloat(data.amount) || 0;
  if (data.date !== undefined) expenses[idx].date = data.date;
  if (data.category !== undefined) expenses[idx].category = data.category;
  writeExpenses(expenses);
  return expenses[idx];
}

async function deleteExpense(id) {
  const expenses = readExpenses();
  const idx = expenses.findIndex(e => e.id === id);
  if (idx === -1) return false;
  expenses.splice(idx, 1);
  writeExpenses(expenses);
  return true;
}

async function getExpensesRange(filters = {}) {
  let expenses = readExpenses();
  if (filters.driverId) expenses = expenses.filter(e => e.driverId === filters.driverId);
  if (filters.from) expenses = expenses.filter(e => e.date >= filters.from);
  if (filters.to) expenses = expenses.filter(e => e.date <= filters.to);
  if (filters.category) expenses = expenses.filter(e => e.category === filters.category);

  const byCategory = {};
  EXPENSE_CATEGORIES.forEach(cat => { byCategory[cat] = { total: 0, count: 0 }; });
  let totalExpenses = 0;
  expenses.forEach(e => {
    const cat = e.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, count: 0 };
    byCategory[cat].total += e.amount || 0;
    byCategory[cat].count++;
    totalExpenses += e.amount || 0;
  });

  return { expenses, totalExpenses, byCategory, count: expenses.length };
}

async function getExpensesSummary(driverId, from, to) {
  const filters = { driverId };
  if (from) filters.from = from;
  if (to) filters.to = to;
  return getExpensesRange(filters);
}
