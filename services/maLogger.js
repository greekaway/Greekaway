/**
 * MoveAthens — Minimal dispatch error logger
 * Appends structured JSON lines to a log file for driver dispatch failures.
 * Falls back gracefully if file I/O fails (never crashes the app).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ma-dispatch.log');

// Ensure log directory exists (once at startup)
try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (_) { /* ignore — will retry on each write */ }

/**
 * Log a dispatch-related event (error or info).
 * @param {'error'|'warn'|'info'} level
 * @param {string} action  e.g. 'driver-accept', 'driver-complete'
 * @param {object} details  arbitrary context (token, requestId, statusCode, reason…)
 */
function log(level, action, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    action,
    ...details
  };

  const line = JSON.stringify(entry) + '\n';

  // Also emit to console for container log aggregation
  if (level === 'error') {
    console.error('[ma-dispatch]', action, details.reason || '');
  }

  // Append to file (async, fire-and-forget)
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFile(LOG_FILE, line, 'utf8', () => {});
  } catch (_) { /* never crash the app */ }
}

module.exports = { log };
