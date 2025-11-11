'use strict';
const fs = require('fs');
const path = require('path');

function registerLocales(app, { LOCALES_DIR, IS_DEV, computeLocalesVersion }) {
  // Ensure directory exists
  try { fs.mkdirSync(LOCALES_DIR, { recursive: true }); } catch (_) {}

  // Static serving for /locales
  app.use('/locales', require('express').static(LOCALES_DIR, {
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

  app.get('/locales/index.json', (req, res) => {
    try {
      const files = fs.readdirSync(LOCALES_DIR, { withFileTypes: true });
      const langs = files
        .filter(f => f.isFile() && f.name.endsWith('.json'))
        .map(f => f.name.replace(/\.json$/,'').toLowerCase())
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort();
      const version = computeLocalesVersion(LOCALES_DIR);
      if (IS_DEV) {
        res.set('Cache-Control', 'no-store');
      } else {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');
      }
      return res.json({ languages: langs, version });
    } catch (e) {
      const version = computeLocalesVersion(LOCALES_DIR);
      if (IS_DEV) {
        res.set('Cache-Control', 'no-store');
      } else {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');
      }
      return res.json({ languages: ['el','en','fr','de','he','it','es','zh','nl','sv','ko','pt','ru'], version });
    }
  });
}

module.exports = { registerLocales };
