const express = require("express");
const path = require("path");
const fs = require("fs");

// Load local .env (if present). Safe to leave out in production where env vars are set
try { require('dotenv').config(); } catch (e) { /* noop if dotenv isn't installed */ }

const app = express();
// Use the port provided by the hosting environment (Render, Heroku, etc.)
const PORT = process.env.PORT || 3000;

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

// Serve /trips/trip.html with the API key injected from environment.
// This route is placed before the static middleware so it takes precedence
// over the on-disk file and avoids writing the key into committed files.
app.get('/trips/trip.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'trips', 'trip.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading trip.html');
    // Replace the placeholder key in the Google Maps script URL.
    const replaced = data.replace('key=YOUR_GOOGLE_MAPS_API_KEY', `key=${encodeURIComponent(MAP_KEY)}`);
    res.send(replaced);
  });
});

// Serve checkout.html and inject Stripe publishable key placeholder
app.get('/checkout.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'checkout.html');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).send('Error reading checkout.html');
    const pub = process.env.STRIPE_PUBLISHABLE_KEY || '%STRIPE_PUBLISHABLE_KEY%';
    const replaced = data.replace('%STRIPE_PUBLISHABLE_KEY%', pub);
    res.send(replaced);
  });
});

// 1️⃣ Σερβίρουμε στατικά αρχεία από το /public
app.use(express.static(path.join(__dirname, "public")));

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
    // basic validation
    const amt = parseInt(amount, 10) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amt,
      currency: currency || 'eur',
      automatic_payment_methods: { enabled: true },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe create payment intent error:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Failed to create payment intent' });
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
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});