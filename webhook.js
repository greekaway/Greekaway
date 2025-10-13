// webhook.js
// CommonJS module to attach Stripe webhook route to an existing express app
const express = require('express');
const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, 'webhook.log');
const PAYMENTS_PATH = path.join(__dirname, 'payments.json');

// Try to load better-sqlite3 for robust persistence. If unavailable, fall back
// to the JSON file-based implementation above.
let db = null;
let useSqlite = false;
let usePostgres = false;
let pgClient = null;
try {
  const { Client } = require('pg');
  const DATABASE_URL = process.env.DATABASE_URL || null;
  if (DATABASE_URL) {
    pgClient = new Client({ connectionString: DATABASE_URL });
    pgClient.connect().then(() => {
      pgClient.query(`CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        status TEXT,
        event_id TEXT,
        amount INTEGER,
        currency TEXT,
        timestamp TEXT
      )`).catch(err => console.warn('pg create table error', err));
      usePostgres = true;
      console.log('webhook: using Postgres for persistence');
    }).catch(err => {
      console.warn('webhook: failed to connect to Postgres, falling back', err && err.message ? err.message : err);
      pgClient = null;
    });
  }
} catch (e) {
  // pg not installed or other error
}
try {
  const Database = require('better-sqlite3');
  const DB_PATH = path.join(__dirname, 'data', 'db.sqlite3');
  // ensure data directory exists
  try { fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); } catch (e) {}
  db = new Database(DB_PATH);
  // create payments table if it doesn't exist
  db.exec(`CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    status TEXT,
    event_id TEXT,
    amount INTEGER,
    currency TEXT,
    timestamp TEXT
  )`);
  // ensure event_id is unique so the same Stripe event isn't processed twice
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_event_id ON payments(event_id)');
  } catch (e) {
    // Non-fatal: older SQLite might not support IF NOT EXISTS for indexes
  }
  useSqlite = true;
  console.log('webhook: using better-sqlite3 for persistence');
} catch (e) {
  console.warn('better-sqlite3 not available, falling back to JSON persistence');
}

function safeAppendLog(line) {
  try {
    // ensure newline-terminated
    fs.appendFileSync(LOG_PATH, line.replace(/\n/g, ' ') + '\n');
  } catch (e) {
    console.warn('Failed to append webhook log:', e && e.message ? e.message : e);
  }
}

async function loadPayments() {
  try {
    if (usePostgres && pgClient) {
      // load all payments from postgres
      const rows = await pgClient.query('SELECT id,status,event_id AS "eventId",amount,currency,timestamp FROM payments');
      const out = {};
      rows.rows.forEach(r => { out[r.id] = { status: r.status, eventId: r.eventId, amount: r.amount, currency: r.currency, timestamp: r.timestamp }; });
      return out;
    }
    if (useSqlite && db) {
      const rows = db.prepare('SELECT id,status,event_id AS eventId,amount,currency,timestamp FROM payments').all();
      const out = {};
      rows.forEach(r => { out[r.id] = { status: r.status, eventId: r.eventId, amount: r.amount, currency: r.currency, timestamp: r.timestamp }; });
      return out;
    }
    if (!fs.existsSync(PAYMENTS_PATH)) return {};
    const raw = fs.readFileSync(PAYMENTS_PATH, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Failed to load payments.json/sqlite:', e && e.message ? e.message : e);
    return {};
  }
}

async function savePayments(payments) {
  try {
  if (usePostgres && pgClient) {
      // upsert payments into Postgres
      const upsert = async (items) => {
        const queryText = `INSERT INTO payments (id,status,event_id,amount,currency,timestamp) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, event_id = EXCLUDED.event_id, amount = EXCLUDED.amount, currency = EXCLUDED.currency, timestamp = EXCLUDED.timestamp`;
        for (const id of Object.keys(items)) {
          const p = items[id];
          try {
            await pgClient.query(queryText, [id, p.status, p.eventId || null, p.amount || null, p.currency || null, p.timestamp || null]);
          } catch (e) {
            console.warn('pg upsert error', e && e.message ? e.message : e);
          }
        }
      };
      // run sync-like via Promise
      await upsert(payments);
      return;
    }
    if (useSqlite && db) {
      const insert = db.prepare('INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp) VALUES (@id,@status,@eventId,@amount,@currency,@timestamp)');
      const tx = db.transaction((items) => {
        for (const id of Object.keys(items)) {
          const p = items[id];
          insert.run({ id, status: p.status, eventId: p.eventId || null, amount: p.amount || null, currency: p.currency || null, timestamp: p.timestamp || null });
        }
      });
      tx(payments);
      return;
    }
    const tmp = PAYMENTS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payments, null, 2), 'utf8');
    fs.renameSync(tmp, PAYMENTS_PATH);
  } catch (e) {
    console.warn('Failed to save payments.json/sqlite:', e && e.message ? e.message : e);
  }
}

module.exports = function attachWebhook(app, stripe) {
  // Shared handler for recording a payment event (succeeded/failed) and
  // optionally confirming a booking if metadata.booking_id is present.
  async function processPaymentEvent(event, status) {
    const pi = event.data && event.data.object ? event.data.object : null;
    const pid = pi && pi.id ? pi.id : 'unknown';
    try {
      if (usePostgres && pgClient) {
        const exists = await pgClient.query('SELECT id FROM payments WHERE event_id = $1 LIMIT 1', [event.id]);
        if (exists && exists.rows && exists.rows.length) {
          safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`);
          return { recorded: false, reason: 'duplicate' };
        }
        const upsertQuery = `INSERT INTO payments (id,status,event_id,amount,currency,timestamp) VALUES ($1,$2,$3,$4,$5)`;
        await pgClient.query(upsertQuery, [pid, status, event.id || null, pi && pi.amount ? pi.amount : null, pi && pi.currency ? pi.currency : null].slice(0,5));
        safeAppendLog(`${new Date().toISOString()} payment.${status === 'succeeded' ? 'recorded' : status === 'failed' ? 'failed' : 'recorded'} id=${pid}`);
      } else if (useSqlite && db) {
        const seen = db.prepare('SELECT id FROM payments WHERE event_id = ? LIMIT 1').get(event.id);
        if (seen) { safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`); return { recorded: false, reason: 'duplicate' }; }
        const insert = db.prepare('INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp) VALUES (@id,@status,@eventId,@amount,@currency,@timestamp)');
        const tx = db.transaction((p) => { insert.run(p); });
        tx({ id: pid, status: status, eventId: event.id || null, amount: pi && pi.amount ? pi.amount : null, currency: pi && pi.currency ? pi.currency : null, timestamp: new Date().toISOString() });
        safeAppendLog(`${new Date().toISOString()} payment.${status === 'succeeded' ? 'recorded' : status === 'failed' ? 'failed' : 'recorded'} id=${pid}`);

        // If payment succeeded, attempt to mark a related booking as confirmed.
        if (status === 'succeeded') {
          try {
            const bookingId = pi && pi.metadata && pi.metadata.booking_id ? pi.metadata.booking_id : null;
            if (bookingId) {
              try {
                const path = require('path');
                const Database = require('better-sqlite3');
                const bookingsDb = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
                const now = new Date().toISOString();
                const stmt = bookingsDb.prepare('UPDATE bookings SET status = ?, event_id = ?, updated_at = ? WHERE id = ?');
                stmt.run('confirmed', event.id || null, now, bookingId);
                safeAppendLog(`${new Date().toISOString()} booking.confirmed id=${bookingId} for_pi=${pid}`);
                bookingsDb.close();
              } catch (e) { /* non-fatal */ }
            } else {
              try {
                const path = require('path');
                const Database = require('better-sqlite3');
                const bookingsDb = new Database(path.join(__dirname, 'data', 'db.sqlite3'));
                const b = bookingsDb.prepare('SELECT id FROM bookings WHERE payment_intent_id = ? LIMIT 1').get(pid);
                if (b && b.id) {
                  const now = new Date().toISOString();
                  bookingsDb.prepare('UPDATE bookings SET status = ?, event_id = ?, updated_at = ? WHERE id = ?').run('confirmed', event.id || null, now, b.id);
                  safeAppendLog(`${new Date().toISOString()} booking.confirmed id=${b.id} for_pi=${pid}`);
                }
                bookingsDb.close();
              } catch (e) { /* non-fatal */ }
            }
          } catch (e) { /* ignore booking update errors */ }
        }
      } else {
        const payments = await loadPayments();
        const dup = Object.keys(payments).some(k => payments[k] && payments[k].eventId === event.id);
        if (dup) { safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`); return { recorded: false, reason: 'duplicate' }; }
        payments[pid] = { status: status, eventId: event.id || null, amount: pi && pi.amount ? pi.amount : null, currency: pi && pi.currency ? pi.currency : null, timestamp: new Date().toISOString() };
        await savePayments(payments);
        safeAppendLog(`${new Date().toISOString()} payment.${status === 'succeeded' ? 'recorded' : status === 'failed' ? 'failed' : 'recorded'} id=${pid}`);
      }
    } catch (e) {
      console.error('Error processing payment event:', e && e.stack ? e.stack : e);
      return { recorded: false, reason: 'error' };
    }
    return { recorded: true };
  }

  // Test-only endpoint to post raw events without Stripe signature verification.
  // Enabled only when ALLOW_TEST_WEBHOOK=true in the environment.
  app.post('/webhook/test', express.json(), async (req, res) => {
    const allowTest = String(process.env.ALLOW_TEST_WEBHOOK || '').trim().toLowerCase();
    safeAppendLog(`${new Date().toISOString()} debug.allow_test_env=${String(process.env.ALLOW_TEST_WEBHOOK)}`);
    if (allowTest !== 'true') {
      safeAppendLog(`${new Date().toISOString()} webhook.test-rejected allowTest=${allowTest}`);
      return res.status(403).send('Test webhook disabled');
    }
    const event = req.body;
    try {
      // Re-use the same handling logic for supported events (succeeded/failed)
      if (!event || !event.type) return res.status(400).send('Invalid event');
      // minimal logging
      safeAppendLog(`${new Date().toISOString()} event.test-received id=${event.id} type=${event.type}`);
      // handle known events via shared processor
      if (event.type === 'payment_intent.succeeded') {
        await processPaymentEvent(event, 'succeeded');
        return res.json({ received: true });
      }
      if (event.type === 'payment_intent.payment_failed') {
        await processPaymentEvent(event, 'failed');
        return res.json({ received: true });
      }
      return res.json({ received: false, message: 'event type not handled' });
    } catch (e) {
      console.error('Test webhook handler error', e && e.stack ? e.stack : e);
      return res.status(500).send('Server error');
    }
  });

  // raw body required to verify Stripe signature
  app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || null;

    let event = null;
    try {
      if (webhookSecret && stripe) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // dev fallback: parse body as JSON (unsigned)
        event = JSON.parse(req.body.toString('utf8'));
      }
    } catch (err) {
      console.error('Webhook signature verification failed.', err && err.message ? err.message : err);
      safeAppendLog(`${new Date().toISOString()} webhook.error ${err && err.message ? err.message : err}`);
      return res.status(400).send(`Webhook Error: ${err && err.message ? err.message : err}`);
    }

    // Log event to file for audit/debug
    try {
      const id = event && event.id ? event.id : (event.data && event.data.object && event.data.object.id) || 'no-id';
      safeAppendLog(`${new Date().toISOString()} event.received id=${id} type=${event.type} raw=${JSON.stringify(event)}`);
    } catch (e) {
      console.warn('Failed to write event log:', e && e.message ? e.message : e);
    }

    // Handle the event types you care about
    switch (event.type) {
      case 'payment_intent.succeeded':
        await processPaymentEvent(event, 'succeeded');
        break;
      case 'payment_intent.payment_failed':
        await processPaymentEvent(event, 'failed');
        break;
      default:
        console.log(`Webhook received event: ${event.type}`);
    }

    res.json({ received: true });
  });
};
