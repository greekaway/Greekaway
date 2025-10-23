const express = require("express");
let compression = null;
try { compression = require('compression'); } catch(e) { /* compression optional in dev */ }
const path = require("path");
const fs = require("fs");
const crypto = require('crypto');
const { TextDecoder } = require('util');

// Load local .env (if present). Safe to leave out in production where env vars are set
try { require('dotenv').config(); } catch (e) { /* noop if dotenv isn't installed */ }

const app = express();
// Environment detection: treat non-production and non-Render as local dev
const IS_RENDER = !!process.env.RENDER;
const IS_DEV = (process.env.NODE_ENV !== 'production') && !IS_RENDER;
// Enable gzip compression if available to reduce payload size
if (compression) {
  try { app.use(compression()); console.log('server: compression enabled'); } catch(e) { /* ignore */ }
}
// Bind explicitly to 0.0.0.0:3000 for LAN access
const HOST = '0.0.0.0';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Read Maps API key from environment. If not provided, the placeholder remains.
// Trim and strip surrounding quotes if the value was pasted with quotes.
let MAP_KEY = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
if (typeof MAP_KEY === 'string') {
  MAP_KEY = MAP_KEY.trim().replace(/^['"]|['"]$/g, '');
}
// Stripe secret key from environment (do not commit real keys)
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || null;
let stripe = null;
if (STRIPE_SECRET) {
  try { stripe = require('stripe')(STRIPE_SECRET); } catch(e) { console.warn('Stripe not initialized (install package?)'); }
}

// OpenAI API key from environment (for the Greekaway AI Assistant)
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_API_key || null;
if (typeof OPENAI_API_KEY === 'string') {
  OPENAI_API_KEY = OPENAI_API_KEY.trim().replace(/^['"]|['"]$/g, '');
}

// Optional RSS feed for travel-related news (used only when user asks)
let NEWS_RSS_URL = process.env.NEWS_RSS_URL || null;
if (typeof NEWS_RSS_URL === 'string') {
  NEWS_RSS_URL = NEWS_RSS_URL.trim().replace(/^['"]|['"]$/g, '');
}
// NEW: support multiple RSS URLs via NEWS_RSS_URL_1 and _2
const RSS_CANDIDATES = [
  NEWS_RSS_URL,
  process.env.NEWS_RSS_URL_1,
  process.env.NEWS_RSS_URL_2
].filter(Boolean).map(s => String(s).trim().replace(/^['"]|['"]$/g, '')).filter(u => /^https?:\/\//i.test(u));
const NEWS_RSS_URLS = Array.from(new Set(RSS_CANDIDATES));

// Server-side override: force include live data when users ask (or always)
// Set ASSISTANT_LIVE_ALWAYS=1 to aggressively include weather/news when relevant
const ASSISTANT_LIVE_ALWAYS = /^1|true$/i.test(String(process.env.ASSISTANT_LIVE_ALWAYS || '').trim());

// Live data helpers (weather, optional news) with caching
let liveData = null;
try {
  liveData = require('./live/liveData');
  console.log('live-data: module loaded');
} catch (e) {
  console.warn('live-data: not available', e && e.message ? e.message : e);
}

// Initialize a simple SQLite bookings table so server endpoints can create bookings
let bookingsDb = null;
try {
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'data', 'db.sqlite3');
  try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); } catch (e) {}
  bookingsDb = new Database(DB_PATH);
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    status TEXT,
    date TEXT,
    payment_intent_id TEXT UNIQUE,
    event_id TEXT,
    user_name TEXT,
    user_email TEXT,
    trip_id TEXT,
    seats INTEGER,
    price_cents INTEGER,
    currency TEXT,
    metadata TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  // Ensure legacy databases get a date column if missing
  try {
    const info = bookingsDb.prepare("PRAGMA table_info('bookings')").all();
    const hasDate = info && info.some(i => i.name === 'date');
    if (!hasDate) {
      bookingsDb.prepare('ALTER TABLE bookings ADD COLUMN date TEXT').run();
      console.log('server: added date column to bookings table');
    }
  } catch (e) { /* ignore migration errors */ }

  // capacities table to track per-trip per-date seat limits (optional admin seed)
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS capacities (
    trip_id TEXT,
    date TEXT,
    capacity INTEGER,
    PRIMARY KEY(trip_id, date)
  )`);

  // Travelers table to persist last-known profile per email (for stats/matching)
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS travelers (
    email TEXT PRIMARY KEY,
    name TEXT,
    language TEXT,
    age_group TEXT,
    traveler_type TEXT,
    interest TEXT,
    sociality TEXT,
    children_ages TEXT,
    updated_at TEXT
  )`);
  // Add average_rating column if missing
  try {
    const info = bookingsDb.prepare("PRAGMA table_info('travelers')").all();
    const hasAvg = info && info.some(i => i.name === 'average_rating');
    if (!hasAvg) {
      bookingsDb.prepare('ALTER TABLE travelers ADD COLUMN average_rating REAL').run();
      console.log('server: added average_rating to travelers');
    }
  } catch (e) { /* ignore migration errors */ }

  // Co-travel stats: how often two emails have been grouped/traveled together (per trip/date)
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS co_travel (
    email_a TEXT,
    email_b TEXT,
    trip_id TEXT,
    date TEXT,
    times INTEGER,
    PRIMARY KEY(email_a, email_b, trip_id, date)
  )`);

  // Feedback table: post-trip ratings
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    traveler_email TEXT,
    rating INTEGER,
    comment TEXT,
    created_at TEXT
  )`);

  // Groups table (store each group as a row with JSON array of travelers)
  bookingsDb.exec(`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    trip_id TEXT,
    date TEXT,
    travelers TEXT,
    locked INTEGER DEFAULT 0,
    created_at TEXT
  )`);
  // Add bookings.grouped flag to avoid duplicate grouping (optional)
  try {
    const infoB = bookingsDb.prepare("PRAGMA table_info('bookings')").all();
    const hasGrouped = infoB && infoB.some(i => i.name === 'grouped');
    if (!hasGrouped) {
      bookingsDb.prepare('ALTER TABLE bookings ADD COLUMN grouped INTEGER DEFAULT 0').run();
      console.log('server: added grouped to bookings');
    }
  } catch (e) { /* ignore migration errors */ }
  console.log('server: bookings table ready');
} catch (e) {
  console.warn('server: bookings DB not available', e && e.message ? e.message : e);
  bookingsDb = null;
}

// Load assistant knowledge base (JSON) to enrich the system prompt, with hot-reload
const KNOWLEDGE_DIR = path.join(__dirname, 'data', 'ai');
const KNOWLEDGE_PATH = path.join(KNOWLEDGE_DIR, 'knowledge.json');
let KNOWLEDGE_TEXT = null;

function loadKnowledgeOnce() {
  try {
    let txt = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
    if (txt && txt.length > 200_000) {
      console.warn('assistant: knowledge.json seems very large; truncating for prompt');
      txt = txt.slice(0, 200_000);
    }
    KNOWLEDGE_TEXT = txt;
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      KNOWLEDGE_TEXT = null;
    }
    return false;
  }
}

if (loadKnowledgeOnce()) {
  console.log('assistant: knowledge loaded');
} else {
  console.warn('assistant: knowledge.json not loaded');
}

let knowledgeReloadTimer = null;
function scheduleKnowledgeReload() {
  if (knowledgeReloadTimer) clearTimeout(knowledgeReloadTimer);
  knowledgeReloadTimer = setTimeout(() => {
    const ok = loadKnowledgeOnce();
    if (ok && KNOWLEDGE_TEXT != null) {
      console.log('assistant: knowledge reloaded');
    } else if (KNOWLEDGE_TEXT == null) {
      console.warn('assistant: knowledge file missing; cleared');
    } else {
      console.warn('assistant: failed to reload knowledge');
    }
  }, 300);
}

try {
  // Watch the directory to handle editors that use atomic writes (rename)
  fs.watch(KNOWLEDGE_DIR, { persistent: true }, (eventType, filename) => {
    if (!filename) return;
    if (path.basename(filename) !== 'knowledge.json') return;
    scheduleKnowledgeReload();
  });
} catch (e) {
  // Fallback to polling if fs.watch is not available or fails
  try {
    fs.watchFile(KNOWLEDGE_PATH, { interval: 1000 }, () => scheduleKnowledgeReload());
    console.warn('assistant: fs.watch fallback to watchFile');
  } catch (e2) {
    console.warn('assistant: unable to watch knowledge.json', e2 && e2.message ? e2.message : e2);
  }
}

function buildAssistantSystemPrompt() {
  const base = 'You are the Greekaway travel assistant. Be concise. Focus only on Greek travel planning and Greekaway context. When live data (weather or headlines) is provided, use it to answer succinctly and relate to travel where helpful.';
  if (!KNOWLEDGE_TEXT) return base;
  return base + '\n\nGreekaway knowledge base (JSON):\n' + KNOWLEDGE_TEXT + '\n\nUse this knowledge as ground truth when relevant. If a topic is not covered, answer normally.';
}

function buildLiveRulesPrompt() {
  return [
    'Live-data usage rules:',
    '- If a system message titled "Live data context" is present, you MUST use it to answer questions about weather or news.',
    '- Do not say you lack access to weather or news; use the provided context to answer succinctly.',
    '- Keep answers short and relevant to Greek travel and Greekaway.',
  ].join('\n');
}

// -----------------------------
// Live-data: destination detection and snippets for assistant
// -----------------------------
const TRIPINDEX_PATH = path.join(__dirname, 'public', 'data', 'tripindex.json');
let DEST_NAMES = null; // Set of names in various languages
let DEST_LOADED_AT = 0;
function loadDestinationsOnce() {
  try {
    const raw = fs.readFileSync(TRIPINDEX_PATH, 'utf8');
    const arr = JSON.parse(raw);
    const names = new Set();
    arr.forEach((t) => {
      const title = t && t.title ? t.title : {};
      Object.values(title || {}).forEach((v) => {
        if (!v) return;
        // Split combined titles like "Parnassos & Delphi"
        String(v).split(/\s*[&/,]|\s+και\s+|\s+and\s+/i).forEach((p) => {
          const s = String(p).trim();
          if (s) names.add(s.toLowerCase());
        });
        names.add(String(v).trim().toLowerCase());
      });
      // simple synonyms
      if (t.id === 'lefkas' || t.id === 'lefkas' || t.id === 'lefkas') {
        names.add('lefkas');
        names.add('λευκάδα');
        names.add('lefka');
      }
    });
    DEST_NAMES = names;
    DEST_LOADED_AT = Date.now();
  } catch (e) {
    DEST_NAMES = new Set(['lefkas','lefka','lefka\u03b4\u03b1','λε\u03c5κάδα','lefka\u03b4a','parnassos','delphi','olympia']);
  }
}
function ensureDestinationsFresh() {
  if (!DEST_NAMES || (Date.now() - DEST_LOADED_AT > 5 * 60 * 1000)) {
    loadDestinationsOnce();
  }
}
function detectPlaceFromMessage(message) {
  ensureDestinationsFresh();
  const m = String(message || '').toLowerCase();
  let best = null;
  for (const name of DEST_NAMES) {
    if (name && m.includes(name)) { best = name; break; }
  }
  // normalize some known variants
  if (best === 'lefkas') return 'Lefkada';
  if (best === 'λεφκάδα' || best === 'λευκάδα') return 'Λευκάδα';
  if (best === 'delphi' || best === 'δελφοί') return 'Delphi';
  if (best === 'parnassos' || best === 'πάρνασος') return 'Parnassos';
  if (best === 'olympia' || best === 'ολυμπία') return 'Olympia';
  return best ? best : null;
}
function wantsWeather(message) {
  const m = String(message || '').toLowerCase();
  return /(weather|temperature|forecast|rain|wind|sunny|cloud|\bmeteo\b|\bκαιρ)/i.test(m);
}

function wantsNews(message) {
  const m = String(message || '').toLowerCase();
  // English + Greek + a few EU languages keywords for "news/headlines"
  return /(news|headline|headlines|updates|\bειδήσ|\bνέα\b|επικαιρότητα|noticias|notizie|nachrichten|actualités|notícias)/i.test(m);
}

function wantsStrikesOrTraffic(message) {
  const m = String(message || '').toLowerCase();
  // Greek strike/traffic-related terms + English fallback
  return /(\bαπεργία|\bαπεργιες|\bπορεία|\bπορείες|\bμπλοκάρ|\bδρόμοι\b|traffic|strike|protest)/i.test(m);
}

// -----------------------------
// Background RSS prefetch (every few hours) so headlines are warm in memory
// -----------------------------
const NEWS_CACHE = { headlines: [], updatedAt: null };
async function refreshNewsFeed(reason = 'scheduled') {
  try {
    if (!liveData || !NEWS_RSS_URLS || NEWS_RSS_URLS.length === 0) return;
    const all = [];
    for (const url of NEWS_RSS_URLS) {
      try {
        const items = await liveData.getRssHeadlines(url, 5);
        (items || []).forEach(t => all.push(t));
      } catch (e) {
        console.warn('news: fetch failed for', url, e && e.message ? e.message : e);
      }
    }
    // dedupe and cap to 8 headlines total
    const deduped = Array.from(new Set(all)).slice(0, 8);
    if (deduped.length) {
      NEWS_CACHE.headlines = deduped;
      NEWS_CACHE.updatedAt = new Date().toISOString();
      console.log(`news: fetched ${deduped.length} headlines from ${NEWS_RSS_URLS.length} feed(s) (${reason})`);
    }
  } catch (e) {
    console.warn('news: refresh failed', e && e.message ? e.message : e);
  }
}

if (NEWS_RSS_URLS && NEWS_RSS_URLS.length) {
  setTimeout(() => refreshNewsFeed('initial'), 10_000);
  setInterval(() => refreshNewsFeed('interval'), 3 * 60 * 60 * 1000);
}

// Serve /trips/trip.html with the API key injected from environment.
// This route is placed before the static middleware so it takes precedence
// over the on-disk file and avoids writing the key into committed files.
app.get('/trips/trip.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'trips', 'trip.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading trip.html');
    // Replace the placeholder key in the Google Maps script URL.
    let out = data.replace('key=YOUR_GOOGLE_MAPS_API_KEY', `key=${encodeURIComponent(MAP_KEY)}`);
    // In dev, also inject a fresh cache-busting param and disable caching completely
    if (IS_DEV) {
      try {
        const t = Date.now();
        out = out.replace(/(\?v=)\d+/g, `$1${t}`);
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        res.setHeader('Cache-Control', 'no-store');
      } catch (_) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out);
  });
});

// Serve checkout.html and inject Stripe publishable key placeholder
app.get('/checkout.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'checkout.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading checkout.html');
    const pub = process.env.STRIPE_PUBLISHABLE_KEY || '%STRIPE_PUBLISHABLE_KEY%';
    let out = data.replace('%STRIPE_PUBLISHABLE_KEY%', pub);
    if (IS_DEV) {
      try {
        const t = Date.now();
        out = out.replace(/(\?v=)\d+/g, `$1${t}`);
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        res.setHeader('Cache-Control', 'no-store');
      } catch (_) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(out);
  });
});

// 1️⃣ Σε DEV: Σερβίρουμε ΠΑΝΤΑ φρέσκα HTML/JS/CSS για να αποφεύγουμε stale cache σε άλλες συσκευές
if (IS_DEV) {
  app.get(/^\/(?:.*)\.html$/, (req, res, next) => {
    const filePath = path.join(__dirname, 'public', req.path);
    fs.readFile(filePath, 'utf8', (err, html) => {
      if (err) return next();
      try {
        const t = Date.now();
        // 1) Ανανεώνουμε οποιοδήποτε υπάρχον v=NNN query param
        let out = html.replace(/(\?v=)\d+/g, `$1${t}`);
        // 2) Για /js/*.js χωρίς query, προσθέτουμε ?dev=timestamp
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => {
          return p1.includes('?') ? m : `${p1}?dev=${t}${p2}`;
        });
        // 3) Για /css/*.css χωρίς query, προσθέτουμε ?dev=timestamp
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => {
          return p1.includes('?') ? m : `${p1}?dev=${t}${p2}`;
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(out);
      } catch (e) { return next(); }
    });
  });
}

// 1️⃣ Σερβίρουμε στατικά αρχεία από το /public με caching για non-HTML assets
app.use(express.static(path.join(__dirname, "public"), {
  etag: !IS_DEV,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (IS_DEV) {
      // In dev, force freshest assets across devices
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // JSON under /public/data should stay fairly fresh (translations, catalogs)
      const isDataJson = filePath.includes(path.join('public', 'data') + path.sep) && filePath.endsWith('.json');
      if (isDataJson) {
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      } else {
        // 7 days + immutable for other static assets
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    }
  }
}));

// Serve locales statically and provide an index for auto-discovery
const LOCALES_DIR = path.join(__dirname, 'locales');
try { fs.mkdirSync(LOCALES_DIR, { recursive: true }); } catch (e) {}
app.use('/locales', express.static(LOCALES_DIR, {
  etag: !IS_DEV,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (IS_DEV) {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    // Locales rarely change during a session; allow caching
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (filePath.endsWith('index.json')) {
      // keep index relatively fresh to allow new languages to appear
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
  }
}));
function computeLocalesVersion() {
  try {
    const entries = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
    let maxMtime = 0;
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json')) {
        try {
          const st = fs.statSync(path.join(LOCALES_DIR, e.name));
          maxMtime = Math.max(maxMtime, st.mtimeMs || 0);
        } catch(_) { /* ignore */ }
      }
    }
    // Normalize to integer milliseconds for consistent display across OS (no decimals)
    return Math.floor(maxMtime || Date.now());
  } catch(_) {
    return Math.floor(Date.now());
  }
}

function computeDataVersion() {
  const DATA_DIR = path.join(__dirname, 'public', 'data');
  try {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
    let maxMtime = 0;
    const walk = (dir) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const it of items) {
        const p = path.join(dir, it.name);
        if (it.isDirectory()) walk(p);
        else if (it.isFile() && it.name.endsWith('.json')) {
          try {
            const st = fs.statSync(p);
            maxMtime = Math.max(maxMtime, st.mtimeMs || 0);
          } catch(_) {}
        }
      }
    };
    walk(DATA_DIR);
    return Math.floor(maxMtime || Date.now());
  } catch(_) {
    return Math.floor(Date.now());
  }
}

function computeAssetsVersion() {
  try {
    const ROOT = path.join(__dirname, 'public');
    const targets = [path.join(ROOT, 'js'), path.join(ROOT, 'css')];
    let maxMtime = 0;
    const walk = (dir) => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
          const p = path.join(dir, it.name);
          if (it.isDirectory()) walk(p);
          else if (it.isFile() && (p.endsWith('.js') || p.endsWith('.css'))) {
            try {
              const st = fs.statSync(p);
              maxMtime = Math.max(maxMtime, st.mtimeMs || 0);
            } catch (_) {}
          }
        }
      } catch (_) {}
    };
    targets.forEach(walk);
    return Math.floor(maxMtime || Date.now());
  } catch (_) {
    return Math.floor(Date.now());
  }
}

app.get('/locales/index.json', (req, res) => {
  try {
    const files = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
    const langs = files
      .filter(f => f.isFile() && f.name.endsWith('.json'))
      .map(f => f.name.replace(/\.json$/,'').toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();
    const version = computeLocalesVersion();
    // Avoid stale locales discovery. In prod too, instruct all caches to revalidate or not store.
    if (IS_DEV) {
      res.set('Cache-Control', 'no-store');
    } else {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
    }
    res.json({ languages: langs, version });
  } catch (e) {
    // Fallback to a sensible default set if directory missing
    const version = computeLocalesVersion();
    if (IS_DEV) {
      res.set('Cache-Control', 'no-store');
    } else {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      res.set('Surrogate-Control', 'no-store');
    }
    res.json({ languages: ['el','en','fr','de','he','it','es','zh','nl','sv','ko','pt','ru'], version });
  }
});

// Lightweight version info for quick sanity checks across devices/environments
app.get('/version.json', (req, res) => {
  try {
    const startedAt = new Date().toISOString();
    const localesVersion = computeLocalesVersion();
    const dataVersion = computeDataVersion();
    const assetsVersion = computeAssetsVersion();
    const appVersion = Math.max(localesVersion || 0, dataVersion || 0, assetsVersion || 0);
    // Force no caching anywhere (browser, CDN, proxy) to prevent stale version info
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    return res.json({
      node: process.version,
      isDev: IS_DEV,
      isRender: IS_RENDER,
      startedAt,
      localesVersion,
      dataVersion,
      assetsVersion,
      appVersion
    });
  } catch (e) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    return res.json({ isDev: IS_DEV, isRender: IS_RENDER });
  }
});

// Mock checkout endpoint (POST) — simulates a payment processor response
app.post('/mock-checkout', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { name, email, card } = req.body || {};
    // Simple mock: if card contains '4242' succeed, otherwise fail
    if (card && card.indexOf('4242') !== -1) {
      return res.json({ success: true, message: `Mock payment successful for ${name || 'customer'}` });
    }
    return res.json({ success: false, message: 'Mock payment failed — invalid card.' });
  } catch (err) {
    console.error('Error in /mock-checkout:', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, message: 'Server error during mock checkout.' });
  }
});

// Create a PaymentIntent via Stripe (expects JSON body {amount, currency})
app.post('/create-payment-intent', express.json(), async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured on server.' });
  try {
    const { amount, currency } = req.body;
    const { booking_id } = req.body || {};
    const clientMeta = req.body && req.body.metadata ? req.body.metadata : null;
    // basic validation
    const amt = parseInt(amount, 10) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    // Support idempotency: prefer client-provided Idempotency-Key header, else generate one
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['Idempotency-Key'] || req.headers['Idempotency-key']) || `gw_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    const opts = { idempotencyKey };
    // attach booking metadata if present
    const piParams = {
      amount: amt,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
    };
    if (booking_id) piParams.metadata = { booking_id };
    if (clientMeta) {
      piParams.metadata = Object.assign({}, piParams.metadata || {}, clientMeta);
    }
    const paymentIntent = await stripe.paymentIntents.create(piParams, opts);

    // If booking exists in SQLite, save the payment_intent id for later matching in webhook
    try {
      if (booking_id && bookingsDb) {
        const now = new Date().toISOString();
        const stmt = bookingsDb.prepare('UPDATE bookings SET payment_intent_id = ?, updated_at = ? WHERE id = ?');
        stmt.run(paymentIntent.id, now, booking_id);
      }
    } catch (e) { console.warn('Failed to update booking with payment_intent_id', e && e.message ? e.message : e); }

    res.json({ clientSecret: paymentIntent.client_secret, idempotencyKey, paymentIntentId: paymentIntent.id, bookingId: booking_id || null });
  } catch (err) {
    console.error('Stripe create payment intent error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Helper: minimal mock reply when OPENAI key is not configured
function mockAssistantReply(message) {
  const m = String(message || '').trim();
  if (!m) return 'Γεια σου! Πώς μπορώ να βοηθήσω με τα ταξίδια σου;';
  // Simple, friendly echo-style mock with a helpful note
  return `(δοκιμαστική απάντηση) Σε κατάλαβα: "${m}". Πες μου λίγες περισσότερες λεπτομέρειες για να βοηθήσω καλύτερα.`;
}

// Greekaway AI Assistant — JSON response
// POST /api/assistant { message: string, history?: [{role,content}] }
app.post('/api/assistant', express.json(), async (req, res) => {
  try {
    // If no key, return a friendly mock reply instead of erroring out
    if (!OPENAI_API_KEY) {
      const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
      // Enrich mock with live weather snippet if relevant for local testing
      let extra = '';
      try {
        const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
        const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
        const place = detectPlaceFromMessage(message);
        const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
        const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
        if (liveData && (includeWeather || includeNews)) {
          const lc = await liveData.buildLiveContext({ place: place || 'Athens', lang: userLang, include: { weather: includeWeather, news: includeNews }, rssUrl: NEWS_RSS_URLS.length ? NEWS_RSS_URLS : null });
          if (lc && lc.text) extra = `\n\n${lc.text}`;
        }
      } catch (_) {}
      return res.json({ reply: mockAssistantReply(message) + extra, model: 'mock' });
    }
    const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
    const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    if (!message) return res.status(400).json({ error: 'Missing message' });

    // Live data enrichment (weather/news) — lightweight heuristic
    const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
    const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
    const place = detectPlaceFromMessage(message);
    let liveContextText = '';
    const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
    const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
    if (liveData && (includeWeather || includeNews)) {
      try {
        const lc = await liveData.buildLiveContext({
          place: place || 'Athens',
          lang: userLang,
          include: { weather: includeWeather, news: includeNews },
          rssUrl: NEWS_RSS_URLS
        });
        if (lc && lc.text) liveContextText = lc.text;
      } catch (e) { /* non-fatal */ }
    }

    // Build messages array (optional short system prompt guiding assistant tone)
    const messages = [
      { role: 'system', content: buildAssistantSystemPrompt() },
      { role: 'system', content: buildLiveRulesPrompt() },
      ...(liveContextText ? [{ role: 'system', content: `Live data context (refreshed every ~5m):\n${liveContextText}` }] : []),
      ...history.filter(m => m && m.role && m.content).map(m => ({ role: m.role, content: String(m.content) })),
      { role: 'user', content: message }
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        stream: false
      })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(()=> '');
      return res.status(502).json({ error: 'OpenAI request failed', details: errText.slice(0, 400) });
    }
    const data = await resp.json();
    let reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content ? data.choices[0].message.content : '';
    if (!reply) reply = 'Συγγνώμη, δεν μπόρεσα να συντάξω απάντηση αυτή τη στιγμή.';
    return res.json({ reply, model: 'gpt-4o-mini' });
  } catch (e) {
    console.error('AI Assistant JSON error:', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Greekaway AI Assistant — Streaming response (chunked text)
// POST /api/assistant/stream { message, history? } -> streams plain text tokens
app.post('/api/assistant/stream', express.json(), async (req, res) => {
  try {
    // If no key, stream a quick mock reply so the UI doesn't error
    if (!OPENAI_API_KEY) {
      const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      let txt = mockAssistantReply(message);
      try {
        const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
        const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
        const place = detectPlaceFromMessage(message);
        const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
        const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
        if (liveData && (includeWeather || includeNews)) {
          const lc = await liveData.buildLiveContext({
            place: place || 'Athens',
            lang: userLang,
            include: { weather: includeWeather, news: includeNews },
            rssUrl: NEWS_RSS_URLS
          });
          if (lc && lc.text) txt += `\n\n${lc.text}`;
        }
      } catch (_) {}
      // Write in a couple of chunks to simulate streaming
      const parts = txt.match(/.{1,40}/g) || [txt];
      for (const p of parts) res.write(p);
      res.end();
      return;
    }
    const message = (req.body && req.body.message ? String(req.body.message) : '').trim();
    const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];
    if (!message) { res.status(400).end('Missing message'); return; }

    // Live enrichment
    const acceptLang = String(req.headers['accept-language'] || '').slice(0,5).toLowerCase();
    const userLang = (req.body && req.body.lang) || (acceptLang.startsWith('el') ? 'el' : 'en');
    const place = detectPlaceFromMessage(message);
    let liveContextText = '';
    const includeNews = !!(NEWS_RSS_URLS.length && (wantsNews(message) || wantsStrikesOrTraffic(message) || ASSISTANT_LIVE_ALWAYS));
    const includeWeather = !!(place || wantsWeather(message) || ASSISTANT_LIVE_ALWAYS);
    if (liveData && (includeWeather || includeNews)) {
      const lc = await liveData.buildLiveContext({
        place: place || 'Athens',
        lang: userLang,
        include: { weather: includeWeather, news: includeNews },
        rssUrl: NEWS_RSS_URLS
      });
      if (lc && lc.text) liveContextText = lc.text;
    }

    const messages = [
      { role: 'system', content: buildAssistantSystemPrompt() },
      { role: 'system', content: buildLiveRulesPrompt() },
      ...(liveContextText ? [{ role: 'system', content: `Live data context (refreshed every ~5m):\n${liveContextText}` }] : []),
      ...history.filter(m => m && m.role && m.content).map(m => ({ role: m.role, content: String(m.content) })),
      { role: 'user', content: message }
    ];

    // Prepare streaming response
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        stream: true
      })
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(()=> '');
      res.status(upstream.status || 502);
      res.end(errText || 'Upstream error');
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        // OpenAI streams as SSE lines: data: {json}\n\n
        const lines = chunk.split(/\n/).filter(Boolean);
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          const payload = m ? m[1] : null;
          if (!payload) continue;
          if (payload === '[DONE]') { done = true; break; }
          try {
            const obj = JSON.parse(payload);
            const delta = obj && obj.choices && obj.choices[0] && obj.choices[0].delta || {};
            const content = delta.content || '';
            if (content) res.write(content);
          } catch (_e) {
            // Fallback: if not JSON, attempt to forward raw
            res.write('');
          }
        }
      }
    }
    res.end();
  } catch (e) {
    console.error('AI Assistant stream error:', e && e.stack ? e.stack : e);
    try { res.end(); } catch(_e) {}
  }
});

// Public live weather endpoint for quick UI/tests: /api/live/weather?place=Lefkada&lang=en
app.get('/api/live/weather', async (req, res) => {
  if (!liveData) return res.status(501).json({ error: 'live-data module unavailable' });
  try {
    const place = (req.query.place || '').toString();
    const lang = (req.query.lang || '').toString() || 'en';
    if (!place) return res.status(400).json({ error: 'Missing place' });
    const w = await liveData.getCurrentWeatherByPlace(place, lang);
    return res.json({ ok: true, place: w.place, country: w.country, temperature_c: w.temperature_c, conditions: w.conditions, windspeed_kmh: w.windspeed_kmh, time: w.time });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed' });
  }
});

// Public live news endpoint (only active when NEWS_RSS_URL configured)
app.get('/api/live/news', async (req, res) => {
  try {
    if (!NEWS_RSS_URLS || NEWS_RSS_URLS.length === 0) return res.status(501).json({ error: 'NEWS_RSS_URL not configured' });
    if (!NEWS_CACHE.updatedAt || !Array.isArray(NEWS_CACHE.headlines) || NEWS_CACHE.headlines.length === 0) {
      await refreshNewsFeed('on-demand');
    }
    return res.json({ ok: true, sources: NEWS_RSS_URLS.length, headlines: NEWS_CACHE.headlines || [], updatedAt: NEWS_CACHE.updatedAt });
  } catch (e) {
    return res.status(500).json({ error: e && e.message ? e.message : 'Failed' });
  }
});

// Simple status endpoint to check assistant mode/model (local only convenience)
app.get('/api/assistant/status', (req, res) => {
  const mode = OPENAI_API_KEY ? 'openai' : 'mock';
  // Keep in sync with the hardcoded model used above
  res.json({ mode, model: 'gpt-4o-mini', live: { rssSources: (NEWS_RSS_URLS||[]).length, weatherBase: (process.env.WEATHER_API_URL||'open-meteo'), aggressive: ASSISTANT_LIVE_ALWAYS } });
});

// Bookings API: create and read bookings
app.post('/api/bookings', express.json(), (req, res) => {
  try {
    const { user_name, user_email, trip_id, seats, price_cents, currency } = req.body || {};
    // Traveler profile fields from step2 (optional)
    // Normalize alternative field names coming from overlay booking form
    const mapTravelerType = (v) => {
      if (!v) return null;
      const x = String(v).toLowerCase();
      if (x === 'explorer') return 'explore';
      if (x === 'relaxed') return 'relax';
      return x; // family, solo -> same
    };
    const mapInterest = (v) => {
      if (!v) return null;
      const x = String(v).toLowerCase();
      if (x === 'cultural') return 'culture';
      if (x === 'nature') return 'nature';
      return x;
    };
    const mapSocial = (style, tempo) => {
      const s = style ? String(style).toLowerCase() : '';
      const t = tempo ? String(tempo).toLowerCase() : '';
      if (s === 'sociable' || t === 'talkative') return 'social';
      if (s === 'quiet' || t === 'reserved') return 'quiet';
      return null;
    };
    const language = req.body.language || req.body.preferredLanguage || null;
    const traveler_type = req.body.traveler_type || mapTravelerType(req.body.travelerProfile) || null;
    const interest = req.body.interest || mapInterest(req.body.travelStyle) || null;
    const sociality = req.body.sociality || mapSocial(req.body.travelStyle, req.body.travelTempo) || null;
    const childrenAges = Array.isArray(req.body.children_ages) ? req.body.children_ages : (typeof req.body.children_ages === 'string' ? req.body.children_ages : null);
    const profile = { language, age_group: req.body.age_group || null, traveler_type, interest, sociality, children_ages: childrenAges, user_email, user_name };
    const metadata = req.body.metadata || profile;
    if (!user_name || !user_email || !trip_id) return res.status(400).json({ error: 'Missing required fields' });
    // date support
    let date = req.body.date || null;
    if (!date) {
      date = new Date().toISOString().slice(0,10);
    }
    // capacity check (if capacities table has an entry for trip/date)
    try {
      if (bookingsDb) {
        const capRow = bookingsDb.prepare('SELECT capacity FROM capacities WHERE trip_id = ? AND date = ?').get(trip_id, date);
        if (capRow && typeof capRow.capacity === 'number') {
          const capacity = capRow.capacity || 0;
          const taken = bookingsDb.prepare('SELECT COALESCE(SUM(seats),0) as s FROM bookings WHERE trip_id = ? AND date = ? AND status != ?').get(trip_id, date, 'canceled').s || 0;
          if ((taken + (seats || 1)) > capacity) return res.status(409).json({ error: 'No availability for selected date' });
        }
      }
    } catch (e) { console.warn('Capacity check failed', e && e.message ? e.message : e); }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    if (bookingsDb) {
      const insert = bookingsDb.prepare('INSERT INTO bookings (id,status,date,payment_intent_id,event_id,user_name,user_email,trip_id,seats,price_cents,currency,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      insert.run(id, 'pending', date, null, null, user_name, user_email, trip_id, seats || 1, price_cents || 0, currency || 'eur', metadata ? JSON.stringify(metadata) : null, now, now);
      return res.json({ bookingId: id, status: 'pending' });
    }
    return res.status(500).json({ error: 'Bookings DB not available' });
  } catch (e) {
    console.error('Create booking error', e && e.stack ? e.stack : e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Availability endpoint: returns capacity and taken seats for a trip/date
app.get('/api/availability', (req, res) => {
  try {
    const trip_id = req.query.trip_id;
    const date = req.query.date || new Date().toISOString().slice(0,10);
    if (!trip_id) return res.status(400).json({ error: 'Missing trip_id' });
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const capRow = bookingsDb.prepare('SELECT capacity FROM capacities WHERE trip_id = ? AND date = ?').get(trip_id, date) || {};
    // Default van capacity to 7 when not explicitly set per date
    const capacity = (typeof capRow.capacity === 'number' && capRow.capacity > 0) ? capRow.capacity : 7;
    // Count only confirmed bookings toward occupancy
    const takenRow = bookingsDb.prepare('SELECT COALESCE(SUM(seats),0) as s FROM bookings WHERE trip_id = ? AND date = ? AND status = ?').get(trip_id, date, 'confirmed') || { s: 0 };
    return res.json({ trip_id, date, capacity, taken: takenRow.s || 0 });
  } catch (e) { console.error('Availability error', e); return res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/bookings/:id', (req, res) => {
  try {
    const id = req.params.id;
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    // parse metadata
    if (row.metadata) {
      try { row.metadata = JSON.parse(row.metadata); } catch (e) {}
    }
    return res.json(row);
  } catch (e) { console.error('Get booking error', e && e.stack ? e.stack : e); return res.status(500).json({ error: 'Server error' });
}
});

// Attach webhook handler from module
try {
  require('./webhook')(app, stripe);
} catch (err) {
  console.warn('Could not attach webhook module:', err && err.message ? err.message : err);
}

// Global error handlers to prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason && reason.stack ? reason.stack : reason);
});

// 2️⃣ Επιστρέφει όλες τις εκδρομές από trip.json
app.get("/api/trips", (req, res) => {
  fs.readFile(path.join(__dirname, "trip.json"), "utf8", (err, data) => {
    if (err) {
      console.error("Σφάλμα ανάγνωσης trip.json:", err);
      res.status(500).json({ error: "Δεν μπορέσαμε να διαβάσουμε τα δεδομένα." });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

// Admin payments endpoint (protected by basic auth)
// Normalize admin creds: trim and strip surrounding quotes to avoid dotenv/quoting pitfalls
let ADMIN_USER = process.env.ADMIN_USER || null;
let ADMIN_PASS = process.env.ADMIN_PASS || null;
if (typeof ADMIN_USER === 'string') ADMIN_USER = ADMIN_USER.trim().replace(/^['"]|['"]$/g, '');
if (typeof ADMIN_PASS === 'string') ADMIN_PASS = ADMIN_PASS.trim().replace(/^['"]|['"]$/g, '');
function checkAdminAuth(req) {
  if (!ADMIN_USER || !ADMIN_PASS) return false;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString('utf8');
  const [user, pass] = creds.split(':');
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

app.get('/admin/payments', async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  // Try Postgres/SQLite/JSON via the same logic as webhook.js
  try {
    // support pagination via query params
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    // prefer Postgres if configured
    const DATABASE_URL = process.env.DATABASE_URL || null;
    if (DATABASE_URL) {
      const { Client } = require('pg');
      const client = new Client({ connectionString: DATABASE_URL });
      await client.connect();
      const { rows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT $1 OFFSET $2', [limit, offset]);
      await client.end();
      return res.json(rows);
    }

    // Check SQLite
    try {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
      const rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp FROM payments ORDER BY timestamp DESC LIMIT ? OFFSET ?').all(limit, offset);
      return res.json(rows);
    } catch (e) {
      // fallthrough to JSON
    }

    // JSON fallback
    const paymentsPath = path.join(__dirname, 'payments.json');
    if (!fs.existsSync(paymentsPath)) return res.json([]);
    const raw = fs.readFileSync(paymentsPath, 'utf8');
    const all = raw ? JSON.parse(raw) : {};
    // return as array sorted by timestamp desc and apply pagination
    const arr = Object.keys(all).map(k => ({ id: k, ...all[k] }));
    arr.sort((a,b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    return res.json(arr.slice(offset, offset + limit));
  } catch (err) {
    console.error('Admin payments error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// Admin bookings list (JSON) - protected by same basic auth
app.get('/admin/bookings', (req, res) => {
  if (!checkAdminAuth(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  try {
    const limit = Math.min(10000, Math.abs(parseInt(req.query.limit || '200', 10) || 200));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    const status = req.query.status || null;
    const user_email = req.query.user_email || null;
    const trip_id = req.query.trip_id || null;
    const payment_intent_id = req.query.payment_intent_id || null;
    const date_from = req.query.date_from || null;
    const date_to = req.query.date_to || null;
    const min_amount = req.query.min_amount ? parseInt(req.query.min_amount, 10) : null;
    const max_amount = req.query.max_amount ? parseInt(req.query.max_amount, 10) : null;
    const sort = req.query.sort || 'created_at';
    const dir = (req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let rows = [];
    try {
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (user_email) { where.push('user_email = ?'); params.push(user_email); }
      if (trip_id) { where.push('trip_id = ?'); params.push(trip_id); }
      if (payment_intent_id) { where.push('payment_intent_id = ?'); params.push(payment_intent_id); }
      if (date_from) { where.push('created_at >= ?'); params.push(date_from); }
      if (date_to) { where.push('created_at <= ?'); params.push(date_to + ' 23:59:59'); }
      if (min_amount !== null && !isNaN(min_amount)) { where.push('price_cents >= ?'); params.push(min_amount); }
      if (max_amount !== null && !isNaN(max_amount)) { where.push('price_cents <= ?'); params.push(max_amount); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      // sanitize sort field - allow only specific columns
      const allowedSort = ['created_at','price_cents','status','user_name'];
      const sortField = allowedSort.includes(sort) ? sort : 'created_at';
      const stmt = db.prepare(`SELECT * FROM bookings ${whereSql} ORDER BY ${sortField} ${dir} LIMIT ? OFFSET ?`);
      rows = stmt.all(...params, limit, offset);
      if (!bookingsDb) db.close();
    } catch (e) {
      return res.status(500).json({ error: 'Bookings DB not available' });
    }
    // parse metadata JSON where present
    rows = (rows || []).map(r => {
      if (r && r.metadata && typeof r.metadata === 'string') {
        try { r.metadata = JSON.parse(r.metadata); } catch (e) { /* leave as string */ }
      }
      return r;
    });
    return res.json(rows);
  } catch (err) {
    console.error('Admin bookings error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// Admin: list travelers (for stats/exports)
app.get('/admin/travelers', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const rows = bookingsDb.prepare('SELECT email,name,language,age_group,traveler_type,interest,sociality,children_ages,average_rating,updated_at FROM travelers ORDER BY updated_at DESC').all();
    // parse children_ages JSON if stored as JSON text
    rows.forEach(r => { try { if (r.children_ages && typeof r.children_ages === 'string' && r.children_ages.trim().startsWith('[')) r.children_ages = JSON.parse(r.children_ages); } catch (e) {} });
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Suggest pairs for a trip/date using simple similarity + co_travel boost
app.get('/admin/suggest-pairs', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const trip_id = req.query.trip_id || null;
    const date = req.query.date || null;
    // Load confirmed bookings for that trip/date
    const bookings = bookingsDb.prepare('SELECT user_email, metadata FROM bookings WHERE status = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').all('confirmed', trip_id, trip_id, date, date);
    const emails = Array.from(new Set(bookings.map(b => (b.user_email || '').toLowerCase()).filter(Boolean)));
    if (emails.length < 2) return res.json([]);
    // Load traveler profiles
    const profByEmail = {};
    const profs = bookingsDb.prepare('SELECT * FROM travelers WHERE email IN (' + emails.map(()=>'?').join(',') + ')').all(...emails);
    profs.forEach(p => { profByEmail[(p.email||'').toLowerCase()] = p; });
    // Simple score: +1 same language, +1 same age_group bucket (exact), +1 same traveler_type, +1 same interest, +0.5 same sociality, +min(2, co_travel times)
    const pairs = [];
    for (let i=0;i<emails.length;i++){
      for(let j=i+1;j<emails.length;j++){
        const a = emails[i], b = emails[j];
        const pa = profByEmail[a]||{}, pb = profByEmail[b]||{};
        let score = 0;
        if (pa.language && pb.language && pa.language === pb.language) score += 1;
        if (pa.age_group && pb.age_group && pa.age_group === pb.age_group) score += 1;
        if (pa.traveler_type && pb.traveler_type && pa.traveler_type === pb.traveler_type) score += 1;
        if (pa.interest && pb.interest && pa.interest === pb.interest) score += 1;
        if (pa.sociality && pb.sociality && pa.sociality === pb.sociality) score += 0.5;
        const row = bookingsDb.prepare('SELECT times FROM co_travel WHERE email_a = ? AND email_b = ? AND (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?)').get(a,b,trip_id,trip_id,date,date) || { times: 0 };
        score += Math.min(2, row.times || 0);
        // Ratings influence: encourage pairs where αμφότεροι έχουν καλή μέση βαθμολογία
        const ra = typeof pa.average_rating === 'number' ? pa.average_rating : null;
        const rb = typeof pb.average_rating === 'number' ? pb.average_rating : null;
        if (ra != null && rb != null) {
          const avg = (ra + rb) / 2;
          // scale: >4.5 +0.8, >4 +0.5, 3-4 +0.2, <2.5 -0.5, <2 -1
          if (avg >= 4.5) score += 0.8; else if (avg >= 4.0) score += 0.5; else if (avg >= 3.0) score += 0.2; else if (avg < 2.0) score -= 1; else if (avg < 2.5) score -= 0.5;
        }
        pairs.push({ a, b, score });
      }
    }
    pairs.sort((x,y)=>y.score - x.score);
    res.json(pairs);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Submit feedback (post-trip)
app.post('/api/feedback', express.json(), (req, res) => {
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const { trip_id, traveler_email, rating, comment } = req.body || {};
    if (!trip_id || !traveler_email) return res.status(400).json({ error: 'Missing trip_id or traveler_email' });
    // rating can be 1..5 or strings: positive/neutral/negative
    let r = rating;
    if (typeof r === 'string') {
      const x = r.toLowerCase();
      if (x === 'positive') r = 5; else if (x === 'neutral') r = 3; else if (x === 'negative') r = 1;
    }
    r = parseInt(r,10);
    if (!isFinite(r) || r < 1 || r > 5) r = 3; // default neutral
    const id = require('crypto').randomUUID();
    const now = new Date().toISOString();
    bookingsDb.prepare('INSERT INTO feedback (id,trip_id,traveler_email,rating,comment,created_at) VALUES (?,?,?,?,?,?)').run(id, trip_id, traveler_email, r, comment || null, now);
    // update traveler average_rating
    try {
      const agg = bookingsDb.prepare('SELECT AVG(rating) as avg FROM feedback WHERE traveler_email = ?').get(traveler_email);
      const avg = agg && typeof agg.avg === 'number' ? agg.avg : null;
      if (avg != null) {
        bookingsDb.prepare('UPDATE travelers SET average_rating = ? WHERE email = ?').run(avg, traveler_email);
      }
    } catch (e) { /* ignore */ }
    return res.json({ ok: true, id });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: list feedback
app.get('/admin/feedback', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const rows = bookingsDb.prepare('SELECT id,trip_id,traveler_email,rating,comment,created_at FROM feedback ORDER BY created_at DESC').all();
    return res.json(rows);
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: groups page data
app.get('/admin/groups', (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const trip_id = req.query.trip_id || null;
    const date = req.query.date || null;
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      // serve static admin/groups HTML (built client-side)
      return res.sendFile(path.join(__dirname, 'public', 'admin-groups.html'));
    }
    // JSON response: groups + confirmed travelers for given trip/date
    const groups = bookingsDb.prepare('SELECT id,trip_id,date,travelers,locked,created_at FROM groups WHERE (? IS NULL OR trip_id = ?) AND (? IS NULL OR date = ?) ORDER BY created_at DESC').all(trip_id, trip_id, date, date).map(g => ({...g, travelers: (()=>{ try { return JSON.parse(g.travelers||'[]'); } catch(_){ return []; } })()}));
    let travelers = [];
    if (trip_id && date) {
      const rows = bookingsDb.prepare('SELECT user_name AS name, user_email AS email FROM bookings WHERE status = ? AND trip_id = ? AND date = ? AND grouped = 0').all('confirmed', trip_id, date);
      // join traveler profiles for enriched view
      travelers = rows.map(r => {
        const p = bookingsDb.prepare('SELECT language, traveler_type, sociality, average_rating FROM travelers WHERE email = ?').get(r.email) || {};
        return { name: r.name || r.email, email: r.email, ...p };
      });
    }
    return res.json({ groups, travelers });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin: create/update groups
app.post('/admin/groups', express.json(), (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    if (!bookingsDb) return res.status(500).json({ error: 'DB not available' });
    const { op, id, trip_id, date, travelers, lock } = req.body || {};
    if (!trip_id || !date) return res.status(400).json({ error: 'Missing trip_id/date' });
    const now = new Date().toISOString();
    if (op === 'create') {
      const gid = crypto.randomUUID();
      const arr = Array.isArray(travelers) ? travelers : [];
      bookingsDb.prepare('INSERT INTO groups (id,trip_id,date,travelers,locked,created_at) VALUES (?,?,?,?,?,?)').run(gid, trip_id, date, JSON.stringify(arr), 0, now);
      return res.json({ ok: true, id: gid });
    }
    if (op === 'update' && id) {
      const arr = Array.isArray(travelers) ? travelers : null;
      if (arr) bookingsDb.prepare('UPDATE groups SET travelers = ? WHERE id = ?').run(JSON.stringify(arr), id);
      if (lock === true) {
        bookingsDb.prepare('UPDATE groups SET locked = 1 WHERE id = ?').run(id);
        // mark bookings grouped to avoid duplicates
        try {
          const g = bookingsDb.prepare('SELECT travelers FROM groups WHERE id = ?').get(id);
          const emails = g && g.travelers ? JSON.parse(g.travelers) : [];
          if (Array.isArray(emails) && emails.length) {
            const mark = bookingsDb.prepare('UPDATE bookings SET grouped = 1 WHERE user_email = ? AND trip_id = ? AND date = ?');
            emails.forEach(em => { try { mark.run(em, trip_id, date); } catch(_){ } });
          }
        } catch (e) { /* non-fatal */ }
      }
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Invalid op' });
  } catch (e) { return res.status(500).json({ error: 'Server error' }); }
});

// Admin bookings CSV export
app.get('/admin/bookings.csv', (req, res) => {
  if (!checkAdminAuth(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  try {
    const limit = Math.min(100000, Math.abs(parseInt(req.query.limit || '10000', 10) || 10000));
    const offset = Math.max(0, Math.abs(parseInt(req.query.offset || '0', 10) || 0));
    const status = req.query.status || null;
    const user_email = req.query.user_email || null;
    const trip_id = req.query.trip_id || null;
    const payment_intent_id = req.query.payment_intent_id || null;
    const date_from = req.query.date_from || null;
    const date_to = req.query.date_to || null;
    const min_amount = req.query.min_amount ? parseInt(req.query.min_amount, 10) : null;
    const max_amount = req.query.max_amount ? parseInt(req.query.max_amount, 10) : null;
    const sort = req.query.sort || 'created_at';
    const dir = (req.query.dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let rows = [];
    try {
      const Database = require('better-sqlite3');
      const db = bookingsDb || new Database(path.join(__dirname, 'data', 'db.sqlite3'));
      const where = [];
      const params = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (user_email) { where.push('user_email = ?'); params.push(user_email); }
      if (trip_id) { where.push('trip_id = ?'); params.push(trip_id); }
      if (payment_intent_id) { where.push('payment_intent_id = ?'); params.push(payment_intent_id); }
      if (date_from) { where.push('created_at >= ?'); params.push(date_from); }
      if (date_to) { where.push('created_at <= ?'); params.push(date_to + ' 23:59:59'); }
      if (min_amount !== null && !isNaN(min_amount)) { where.push('price_cents >= ?'); params.push(min_amount); }
      if (max_amount !== null && !isNaN(max_amount)) { where.push('price_cents <= ?'); params.push(max_amount); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      const allowedSort = ['created_at','price_cents','status','user_name'];
      const sortField = allowedSort.includes(sort) ? sort : 'created_at';
      const stmt = db.prepare(`SELECT * FROM bookings ${whereSql} ORDER BY ${sortField} ${dir} LIMIT ? OFFSET ?`);
      rows = stmt.all(...params, limit, offset);
      if (!bookingsDb) db.close();
    } catch (e) {
      return res.status(500).json({ error: 'Bookings DB not available' });
    }
    // normalize metadata
    rows = (rows || []).map(r => {
      if (r && r.metadata && typeof r.metadata === 'string') {
        try { r.metadata = JSON.parse(r.metadata); } catch (e) { /* leave as string */ }
      }
      return r;
    });

    // Build CSV headers as union of keys
    const keys = Array.from(new Set(rows.flatMap(obj => Object.keys(obj || {}))));
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') val = JSON.stringify(val);
      return '"' + String(val).replace(/"/g, '""') + '"';
    };

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
  res.setHeader('Content-Disposition', `attachment; filename="bookings_${ts}.csv"`);

    // write CSV
    res.write(keys.join(',') + '\n');
    for (const row of rows) {
      const vals = keys.map(k => escape(row[k]));
      res.write(vals.join(',') + '\n');
    }
    res.end();
  } catch (err) {
    console.error('Admin bookings CSV error:', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// Admin backup status endpoint
app.get('/admin/backup-status', async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  try {
    const backupDir = process.env.BACKUP_DIR || path.join(require('os').homedir(), 'greekaway_backups');
    if (!fs.existsSync(backupDir)) return res.json({ backupsDir: backupDir, count: 0, latestDb: null, latestLog: null });
    const files = fs.readdirSync(backupDir).map(f => ({ name: f, path: path.join(backupDir, f) }));
    const dbFiles = files.filter(f => f.name.startsWith('db.sqlite3') && f.name.endsWith('.gz'));
    const logFiles = files.filter(f => f.name.startsWith('webhook.log') && f.name.endsWith('.gz'));
    const stat = (f) => {
      try { const s = fs.statSync(f.path); return { file: f.name, size: s.size, mtime: s.mtime }; } catch (e) { return null; }
    };
    const latest = (arr) => {
      const stats = arr.map(stat).filter(Boolean);
      stats.sort((a,b) => new Date(b.mtime) - new Date(a.mtime));
      return stats[0] || null;
    };
    const latestDb = latest(dbFiles);
    const latestLog = latest(logFiles);
    return res.json({ backupsDir: backupDir, count: files.length, latestDb, latestLog });
  } catch (err) {
    console.error('Admin backup-status error', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// Admin action: cancel booking (sets status to 'canceled')
app.post('/admin/bookings/:id/cancel', express.json(), (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    const id = req.params.id;
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const now = new Date().toISOString();
    const stmt = bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run('canceled', now, id);
    return res.json({ ok: true });
  } catch (e) { console.error('Cancel booking error', e); return res.status(500).json({ error: 'Server error' }); }
});

// Admin action: refund booking (attempt Stripe refund then mark refunded)
app.post('/admin/bookings/:id/refund', express.json(), async (req, res) => {
  if (!checkAdminAuth(req)) { res.set('WWW-Authenticate', 'Basic realm="Admin"'); return res.status(401).send('Unauthorized'); }
  try {
    const id = req.params.id;
    if (!bookingsDb) return res.status(500).json({ error: 'Bookings DB not available' });
    const row = bookingsDb.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const pi = row.payment_intent_id;
    if (pi && stripe) {
      try {
        // fetch PaymentIntent to find latest charge
        const paymentIntent = await stripe.paymentIntents.retrieve(pi);
        const latestCharge = paymentIntent && paymentIntent.latest_charge ? paymentIntent.latest_charge : (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data[0] && paymentIntent.charges.data[0].id);
        if (latestCharge) {
          await stripe.refunds.create({ charge: latestCharge });
        }
      } catch (e) {
        console.warn('Stripe refund failed (continuing):', e && e.message ? e.message : e);
      }
    }
    const now = new Date().toISOString();
    bookingsDb.prepare('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run('refunded', now, id);
    return res.json({ ok: true });
  } catch (e) { console.error('Refund booking error', e); return res.status(500).json({ error: 'Server error' }); }
});

// Serve the Admin single-page at /admin (so users can visit /admin)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Server-side CSV export of payments with optional filters via query params.
app.get('/admin/payments.csv', async (req, res) => {
  if (!checkAdminAuth(req)) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  try {
    const { status, from, to, min, max, limit } = req.query || {};

    // Gather rows (Postgres -> SQLite -> JSON fallback)
    let rows = [];
    const DATABASE_URL = process.env.DATABASE_URL || null;
    if (DATABASE_URL) {
      try {
        const { Client } = require('pg');
        const client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        // Fetch with a reasonable limit to avoid accidental huge downloads
        const lim = parseInt(limit, 10) || 10000;
        const { rows: pgrows } = await client.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC LIMIT $1', [lim]);
        rows = pgrows;
        await client.end();
      } catch (e) {
        console.warn('Postgres read failed, falling back:', e && e.message ? e.message : e);
      }
    }

    if (rows.length === 0) {
      try {
        const Database = require('better-sqlite3');
        const db = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
        rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp,metadata FROM payments ORDER BY timestamp DESC').all();
      } catch (e) {
        // ignore and fallthrough to JSON
      }
    }

    if (rows.length === 0) {
      const paymentsPath = path.join(__dirname, 'payments.json');
      if (fs.existsSync(paymentsPath)) {
        const raw = fs.readFileSync(paymentsPath, 'utf8');
        const all = raw ? JSON.parse(raw) : {};
        rows = Object.keys(all).map(k => ({ id: k, ...all[k] }));
      }
    }

    // Apply filters server-side (same logic as client)
    const filtered = (rows || []).filter(p => {
      try {
        if (status && String(p.status) !== status) return false;
        if (min) {
          const m = parseInt(min,10);
          if (Number(p.amount) < m) return false;
        }
        if (max) {
          const M = parseInt(max,10);
          if (Number(p.amount) > M) return false;
        }
        if (from) {
          const fromTs = new Date(from + 'T00:00:00Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt < fromTs) return false;
        }
        if (to) {
          const toTs = new Date(to + 'T23:59:59Z').getTime();
          const pt = p.timestamp ? new Date(p.timestamp).getTime() : NaN;
          if (isFinite(pt) && pt > toTs) return false;
        }
        return true;
      } catch (e) { return false; }
    });

    // Build CSV headers as union of keys
    const keys = Array.from(new Set(filtered.flatMap(obj => Object.keys(obj || {}))));
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') val = JSON.stringify(val);
      return '"' + String(val).replace(/"/g, '""') + '"';
    };

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const ts = new Date().toISOString().replace(/[:.]/g,'').replace(/T/,'_').replace(/Z/,'');
    res.setHeader('Content-Disposition', `attachment; filename="payments_${ts}.csv"`);

    // Stream CSV
    res.write(keys.join(',') + '\n');
    for (const row of filtered) {
      const vals = keys.map(k => escape(row[k]));
      res.write(vals.join(',') + '\n');
    }
    res.end();
  } catch (err) {
    console.error('CSV export error', err && err.stack ? err.stack : err);
    return res.status(500).send('Server error');
  }
});

// 3️⃣ Όταν ο χρήστης πάει στο "/", να του δείχνει το index.html
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Error reading index.html');
    if (IS_DEV) {
      try {
        const t = Date.now();
        let out = html.replace(/(\?v=)\d+/g, `$1${t}`);
        out = out.replace(/(src=\"\/(?:js)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        out = out.replace(/(href=\"\/(?:css)\/[^\"?#]+)(\")/g, (m, p1, p2) => p1.includes('?') ? m : `${p1}?dev=${t}${p2}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(out);
      } catch (e) {
        // fallback just disable cache
        res.setHeader('Cache-Control', 'no-store');
        return res.send(html);
      }
    }
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  });
});

// Health/readiness endpoint for uptime checks
app.get('/health', (req, res) => {
  try {
    const info = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development'
    };
    res.json(info);
  } catch (e) {
    res.status(500).json({ status: 'error' });
  }
});

// 4️⃣ Εκκίνηση server
app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});