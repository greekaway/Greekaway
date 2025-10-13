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
      case 'payment_intent.succeeded': {
        try {
          const pi = event.data && event.data.object ? event.data.object : null;
          const pid = pi && pi.id ? pi.id : 'unknown';
          console.log('Webhook: payment_intent.succeeded', pid);

          // Check whether this exact Stripe event was already processed (by event.id)
          if (usePostgres && pgClient) {
            try {
              const exists = await pgClient.query('SELECT id FROM payments WHERE event_id = $1 LIMIT 1', [event.id]);
              if (exists && exists.rows && exists.rows.length) {
                safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`);
                break;
              }
              const upsertQuery = `INSERT INTO payments (id,status,event_id,amount,currency,timestamp) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, event_id = EXCLUDED.event_id, amount = EXCLUDED.amount, currency = EXCLUDED.currency, timestamp = EXCLUDED.timestamp`;
              await pgClient.query(upsertQuery, [pid, 'succeeded', event.id || null, pi && pi.amount ? pi.amount : null, pi && pi.currency ? pi.currency : null, new Date().toISOString()]);
              safeAppendLog(`${new Date().toISOString()} payment.recorded id=${pid}`);
            } catch (e) {
              console.error('Postgres webhook upsert error:', e && e.stack ? e.stack : e);
            }
          } else if (useSqlite && db) {
            try {
              // if this event.id already exists in payments, skip processing
              const seen = db.prepare('SELECT id FROM payments WHERE event_id = ? LIMIT 1').get(event.id);
              if (seen) {
                safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`);
                break;
              }
              const insert = db.prepare('INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp) VALUES (@id,@status,@eventId,@amount,@currency,@timestamp)');
              const tx = db.transaction((p) => { insert.run(p); });
              tx({ id: pid, status: 'succeeded', eventId: event.id || null, amount: pi && pi.amount ? pi.amount : null, currency: pi && pi.currency ? pi.currency : null, timestamp: new Date().toISOString() });
              safeAppendLog(`${new Date().toISOString()} payment.recorded id=${pid}`);
            } catch (e) {
              console.error('SQLite webhook upsert error:', e && e.stack ? e.stack : e);
            }
          } else {
            // JSON fallback: ensure same event isn't recorded twice by scanning stored values for eventId
            const payments = await loadPayments();
            const dup = Object.keys(payments).some(k => payments[k] && payments[k].eventId === event.id);
            if (dup) {
              safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`);
            } else {
              payments[pid] = {
                status: 'succeeded',
                eventId: event.id || null,
                amount: pi && pi.amount ? pi.amount : null,
                currency: pi && pi.currency ? pi.currency : null,
                timestamp: new Date().toISOString()
              };
              await savePayments(payments);
              safeAppendLog(`${new Date().toISOString()} payment.recorded id=${pid}`);
            }
          }
        } catch (e) {
          console.error('Error handling payment_intent.succeeded:', e && e.stack ? e.stack : e);
        }
        break;
      }
      case 'payment_intent.payment_failed':
        try {
          const pi = event.data && event.data.object ? event.data.object : null;
          const pid = pi && pi.id ? pi.id : 'unknown';
          console.log('Webhook: payment_intent.payment_failed', pid);
          if (usePostgres && pgClient) {
            try {
              const exists = await pgClient.query('SELECT id FROM payments WHERE event_id = $1 LIMIT 1', [event.id]);
              if (exists && exists.rows && exists.rows.length) {
                safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`);
                break;
              }
              const upsert = `INSERT INTO payments (id,status,event_id,amount,currency,timestamp) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, event_id = EXCLUDED.event_id, amount = EXCLUDED.amount, currency = EXCLUDED.currency, timestamp = EXCLUDED.timestamp`;
              await pgClient.query(upsert, [pid, 'failed', event.id || null, pi && pi.amount ? pi.amount : null, pi && pi.currency ? pi.currency : null, new Date().toISOString()]);
              safeAppendLog(`${new Date().toISOString()} payment.failed id=${pid}`);
            } catch (e) { console.error('Postgres webhook upsert error:', e && e.stack ? e.stack : e); }
          } else if (useSqlite && db) {
            try {
              const seen = db.prepare('SELECT id FROM payments WHERE event_id = ? LIMIT 1').get(event.id);
              if (seen) { safeAppendLog(`${new Date().toISOString()} event.ignored id=${event.id} reason=duplicate_event`); break; }
              const insert = db.prepare('INSERT OR REPLACE INTO payments (id,status,event_id,amount,currency,timestamp) VALUES (@id,@status,@eventId,@amount,@currency,@timestamp)');
              const tx = db.transaction((p) => { insert.run(p); });
              tx({ id: pid, status: 'failed', eventId: event.id || null, amount: pi && pi.amount ? pi.amount : null, currency: pi && pi.currency ? pi.currency : null, timestamp: new Date().toISOString() });
              safeAppendLog(`${new Date().toISOString()} payment.failed id=${pid}`);
            } catch (e) { console.error('SQLite webhook upsert error:', e && e.stack ? e.stack : e); }
          } else {
            const payments = await loadPayments();
            payments[pid] = payments[pid] || {};
            payments[pid].status = 'failed';
            payments[pid].timestamp = new Date().toISOString();
            payments[pid].eventId = payments[pid].eventId || event.id || null;
            await savePayments(payments);
            safeAppendLog(`${new Date().toISOString()} payment.failed id=${pid}`);
          }
        } catch (e) {
          console.error('Error handling payment_intent.payment_failed:', e && e.stack ? e.stack : e);
        }
        break;
      default:
        console.log(`Webhook received event: ${event.type}`);
    }

    res.json({ received: true });
  });
};
