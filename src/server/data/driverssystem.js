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
  // Sort newest first
  entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return entries;
}

async function addEntry(entry) {
  const entries = readEntries();
  const newEntry = {
    id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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

async function getEntriesSummary(date) {
  const entries = readEntries().filter(e => e.date === date);
  const totalGross = entries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalNet = entries.reduce((s, e) => s + (e.netAmount || 0), 0);
  const totalCommission = entries.reduce((s, e) => s + ((e.amount || 0) - (e.netAmount || 0)), 0);
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
  getEntriesSummary
};
