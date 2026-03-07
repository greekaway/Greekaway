'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..', '..');
const SETTINGS_PATH = path.join(ROOT_DIR, 'data', 'category-settings.json');
const jsonParser = express.json({ limit: '100kb' });

const DEFAULTS = {
  tileScale: 1,
  iconScale: 0.8,
  iconColor: '#f4c542',
  captionColor: '#D4AF37',
  captionSize: 0.92
};

function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Object.assign({}, DEFAULTS, data);
  } catch (_) {
    return Object.assign({}, DEFAULTS);
  }
}

function writeSettings(obj) {
  const merged = Object.assign({}, DEFAULTS, obj);
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function clamp(val, min, max) {
  const n = parseFloat(val);
  if (isNaN(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

const HEX_RE = /^#[0-9a-f]{3,8}$/i;

function registerCategorySettingsRoutes(app, { checkAdminAuth }) {
  // Public read (no auth) — frontend needs this
  app.get('/api/category-settings', (_req, res) => {
    try {
      return res.json(readSettings());
    } catch (e) {
      console.error('category-settings: GET error', e.message);
      return res.status(500).json({ error: 'read_failed' });
    }
  });

  // Admin write
  app.post('/api/category-settings', jsonParser, (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
    try {
      const body = req.body;
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'invalid_body' });

      const current = readSettings();

      if (body.tileScale !== undefined) {
        const v = clamp(body.tileScale, 0.5, 2.5);
        if (v !== undefined) current.tileScale = Math.round(v * 100) / 100;
      }
      if (body.iconScale !== undefined) {
        const v = clamp(body.iconScale, 0.3, 1);
        if (v !== undefined) current.iconScale = Math.round(v * 100) / 100;
      }
      if (body.captionSize !== undefined) {
        const v = clamp(body.captionSize, 0.6, 1.6);
        if (v !== undefined) current.captionSize = Math.round(v * 100) / 100;
      }
      if (typeof body.iconColor === 'string' && HEX_RE.test(body.iconColor.trim())) {
        current.iconColor = body.iconColor.trim();
      }
      if (typeof body.captionColor === 'string' && HEX_RE.test(body.captionColor.trim())) {
        current.captionColor = body.captionColor.trim();
      }

      const saved = writeSettings(current);
      console.log('category-settings: saved', saved);
      return res.json({ ok: true, settings: saved });
    } catch (e) {
      console.error('category-settings: POST error', e.message);
      return res.status(500).json({ error: 'write_failed' });
    }
  });
}

module.exports = { registerCategorySettingsRoutes };
