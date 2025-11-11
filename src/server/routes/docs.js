'use strict';

function registerDocs(app, { DOCS_DIR, IS_DEV, express }) {
  // Mount /docs static with tailored caching
  app.use('/docs', express.static(DOCS_DIR, {
    etag: !IS_DEV,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (IS_DEV) { res.setHeader('Cache-Control', 'no-store'); return; }
      if (filePath.endsWith('.pdf')) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
      } else {
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
      }
    }
  }));
}

module.exports = { registerDocs };
