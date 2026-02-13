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

// ── Car Expense Categories (2-level: groups → items) ──

function getDefaultCarExpenseCategories() {
  return [
    { id: 'service', name: 'Service', active: true, items: [
      { id: 'small_service', name: 'Μικρό service', active: true },
      { id: 'large_service', name: 'Μεγάλο service', active: true }
    ]},
    { id: 'maintenance', name: 'Συντήρηση', active: true, items: [
      { id: 'brakes', name: 'Φρένα', active: true },
      { id: 'tires', name: 'Λάστιχα', active: true },
      { id: 'battery', name: 'Μπαταρία', active: true },
      { id: 'shocks', name: 'Αμορτισέρ', active: true }
    ]},
    { id: 'fuel_movement', name: 'Καύσιμα & Κίνηση', active: true, items: [
      { id: 'fuel', name: 'Καύσιμα', active: true },
      { id: 'tolls', name: 'Διόδια', active: true },
      { id: 'parking', name: 'Πάρκινγκ', active: true },
      { id: 'car_wash', name: 'Πλύσιμο', active: true }
    ]},
    { id: 'legal', name: 'Νομικά / Υποχρεωτικά', active: true, items: [
      { id: 'insurance', name: 'Ασφάλεια', active: true },
      { id: 'road_tax', name: 'Τέλη κυκλοφορίας', active: true },
      { id: 'kteo', name: 'ΚΤΕΟ', active: true }
    ]},
    { id: 'breakdowns', name: 'Βλάβες / Έκτακτα', active: true, items: [
      { id: 'emergency_part', name: 'Έκτακτο ανταλλακτικό', active: true },
      { id: 'roadside_assist', name: 'Οδική βοήθεια', active: true }
    ]},
    { id: 'accident', name: 'Ατύχημα', active: true, items: [
      { id: 'crash', name: 'Τρακάρισμα', active: true }
    ]}
  ];
}

async function getCarExpenseCategories() {
  const cfg = readConfig();
  if (!Array.isArray(cfg.carExpenseCategories) || cfg.carExpenseCategories.length === 0) {
    return getDefaultCarExpenseCategories();
  }
  return cfg.carExpenseCategories;
}

async function updateCarExpenseCategories(items) {
  const cfg = readConfig();
  cfg.carExpenseCategories = Array.isArray(items) ? items : [];
  writeConfig(cfg);
  return cfg.carExpenseCategories;
}

// ── Personal / Home Expense Categories (2-level: groups → items) ──

function getDefaultPersonalExpenseCategories() {
  return [
    { id: 'fixed_monthly', name: 'Πάγια Μηνιαία', active: true, items: [
      { id: 'rent', name: 'Ενοίκιο', active: true },
      { id: 'electricity', name: 'Ρεύμα', active: true },
      { id: 'water', name: 'Νερό', active: true },
      { id: 'internet_phone', name: 'Internet / Τηλέφωνο', active: true },
      { id: 'shared_costs', name: 'Κοινόχρηστα', active: true },
      { id: 'subscriptions', name: 'Συνδρομές', active: true }
    ]},
    { id: 'daily_family', name: 'Καθημερινά / Οικογενειακά', active: true, items: [
      { id: 'supermarket', name: 'Σούπερ μάρκετ', active: true },
      { id: 'health', name: 'Υγεία / Φάρμακα', active: true },
      { id: 'kids_school', name: 'Παιδιά / Σχολείο', active: true },
      { id: 'clothing', name: 'Ρούχα / Αγορές', active: true },
      { id: 'emergency', name: 'Έκτακτο έξοδο', active: true }
    ]}
  ];
}

async function getPersonalExpenseCategories() {
  const cfg = readConfig();
  if (!Array.isArray(cfg.personalExpenseCategories) || cfg.personalExpenseCategories.length === 0) {
    return getDefaultPersonalExpenseCategories();
  }
  return cfg.personalExpenseCategories;
}

async function updatePersonalExpenseCategories(items) {
  const cfg = readConfig();
  cfg.personalExpenseCategories = Array.isArray(items) ? items : [];
  writeConfig(cfg);
  return cfg.personalExpenseCategories;
}

// ── Tax / Insurance Expense Categories (2-level: groups → items) ──

function getDefaultTaxExpenseCategories() {
  return [
    { id: 'tax_fiscal', name: 'Φορολογικά', active: true, items: [
      { id: 'income_tax', name: 'Φόρος εισοδήματος', active: true },
      { id: 'tax_prepayment', name: 'Προκαταβολή φόρου', active: true },
      { id: 'accountant', name: 'Λογιστής', active: true }
    ]},
    { id: 'tax_insurance', name: 'Ασφαλιστικά', active: true, items: [
      { id: 'efka_tebe', name: 'ΕΦΚΑ / ΤΕΒΕ', active: true },
      { id: 'health_insurance', name: 'Ασφάλεια υγείας', active: true }
    ]},
    { id: 'tax_professional', name: 'Επαγγελματικές Υποχρεώσεις', active: true, items: [
      { id: 'union', name: 'Σωματείο', active: true },
      { id: 'licenses', name: 'Άδειες', active: true },
      { id: 'stamps', name: 'Παράβολα', active: true },
      { id: 'profession_fees', name: 'Τέλη επαγγέλματος', active: true }
    ]}
  ];
}

async function getTaxExpenseCategories() {
  const cfg = readConfig();
  if (!Array.isArray(cfg.taxExpenseCategories) || cfg.taxExpenseCategories.length === 0) {
    return getDefaultTaxExpenseCategories();
  }
  return cfg.taxExpenseCategories;
}

async function updateTaxExpenseCategories(items) {
  const cfg = readConfig();
  cfg.taxExpenseCategories = Array.isArray(items) ? items : [];
  writeConfig(cfg);
  return cfg.taxExpenseCategories;
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

// =========================================================
// DASHBOARD — Monthly performance summary (from real data)
// =========================================================

/**
 * Build a monthly performance dashboard for one or all drivers.
 * Uses only real entries + expenses (no hardcoded values).
 *
 * @param {Object} opts - { driverId, month (YYYY-MM) }
 * @returns {Object} dashboard payload
 */
async function getDashboard(opts = {}) {
  const now = new Date();
  const month = opts.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDay = `${month}-01`;
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  // Determine if we are in the current month
  const isCurrentMonth = (now.getFullYear() === year && now.getMonth() + 1 === mon);
  const today = now.toISOString().slice(0, 10);
  const toDate = isCurrentMonth ? today : lastDay;
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
  const remainingDays = daysInMonth - dayOfMonth;

  // ── Entries (revenue) ──
  const entryFilters = { from: firstDay, to: toDate };
  if (opts.driverId) entryFilters.driverId = opts.driverId;
  const entries = await getEntriesRange(entryFilters);

  const totalTrips = entries.length;
  const totalGross = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalNet = entries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalCommission = totalGross - totalNet;

  // Count distinct working days (dates with ≥ 1 entry)
  const workingDaysSet = new Set(entries.map(e => e.date));
  const workingDays = workingDaysSet.size;

  // Daily average (based on days actually worked)
  const effectiveDays = Math.max(workingDays, 1);
  const avgNetPerDay = totalNet / effectiveDays;
  const avgGrossPerDay = totalGross / effectiveDays;

  // Monthly projection (if driver keeps same pace)
  const projectedNet = avgNetPerDay * daysInMonth;
  const projectedGross = avgGrossPerDay * daysInMonth;

  // ── Expenses ──
  const expFilters = { from: firstDay, to: toDate };
  if (opts.driverId) expFilters.driverId = opts.driverId;
  const expData = await getExpensesRange(expFilters);
  const totalExpenses = expData.totalExpenses || 0;
  const expCar = (expData.byCategory && expData.byCategory.car) ? expData.byCategory.car.total : 0;
  const expPersonal = (expData.byCategory && expData.byCategory.personal) ? expData.byCategory.personal.total : 0;
  const expTax = (expData.byCategory && expData.byCategory.tax) ? expData.byCategory.tax.total : 0;
  const expFixed = (expData.byCategory && expData.byCategory.fixed) ? expData.byCategory.fixed.total : 0;
  const expFamily = (expData.byCategory && expData.byCategory.family) ? expData.byCategory.family.total : 0;

  // Projection after expenses
  const projectedNetAfterExpenses = projectedNet - totalExpenses;

  // Balance so far
  const balanceSoFar = totalNet - totalExpenses;

  return {
    month,
    daysInMonth,
    dayOfMonth,
    remainingDays,
    isCurrentMonth,
    // Revenue
    totalTrips,
    totalGross,
    totalNet,
    totalCommission,
    // Working days
    workingDays,
    // Averages
    avgNetPerDay,
    avgGrossPerDay,
    // Projections
    projectedNet,
    projectedGross,
    projectedNetAfterExpenses,
    // Expenses
    totalExpenses,
    expenses: {
      car: expCar,
      personal: expPersonal,
      tax: expTax,
      fixed: expFixed,
      family: expFamily
    },
    // Balance
    balanceSoFar
  };
}

module.exports = {
  getConfig,
  updateConfig,
  getFullConfig,
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
  // Dashboard
  getDashboard,
  // Expenses
  getExpenses,
  addExpense,
  getExpensesRange,
  // Car Expense Categories
  getCarExpenseCategories,
  updateCarExpenseCategories,
  // Personal Expense Categories
  getPersonalExpenseCategories,
  updatePersonalExpenseCategories,
  // Tax / Insurance Expense Categories
  getTaxExpenseCategories,
  updateTaxExpenseCategories
};

// =========================================================
// EXPENSES (Car / Fixed / Personal / Family)
// =========================================================

const EXPENSE_CATEGORIES = ['car', 'fixed', 'personal', 'family', 'tax'];

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
    groupId: expense.groupId || '',
    itemId: expense.itemId || '',
    createdAt: new Date().toISOString()
  };
  expenses.push(newExpense);
  writeExpenses(expenses);
  return newExpense;
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


