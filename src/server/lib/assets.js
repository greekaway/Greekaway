'use strict';
const fs = require('fs');
const path = require('path');

function computeLocalesVersion(localesDir) {
  try {
    const entries = fs.readdirSync(localesDir, { withFileTypes: true });
    let maxMtime = 0;
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json')) {
        try {
          const st = fs.statSync(path.join(localesDir, e.name));
          maxMtime = Math.max(maxMtime, st.mtimeMs || 0);
        } catch(_) { /* ignore */ }
      }
    }
    return Math.floor(maxMtime || Date.now());
  } catch(_) {
    return Math.floor(Date.now());
  }
}

function computeDataVersion(dataDir) {
  try {
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
    walk(dataDir);
    return Math.floor(maxMtime || Date.now());
  } catch(_) {
    return Math.floor(Date.now());
  }
}

function computeAssetsVersion(publicRoot) {
  try {
    const targets = [path.join(publicRoot, 'js'), path.join(publicRoot, 'css')];
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

module.exports = { computeLocalesVersion, computeDataVersion, computeAssetsVersion };
