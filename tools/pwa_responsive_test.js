/**
 * PWA Responsive Screenshot Test
 * 6 viewports × multiple pages per subsystem = 24+ screenshots
 * Usage: node tools/pwa_responsive_test.js [--base http://localhost:3000]
 */
'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1] || 'http://localhost:3000';
const OUT_DIR = path.join(__dirname, '..', 'reports', 'pwa-responsive');

const VIEWPORTS = [
  { name: 'iPhone-SE',      width: 375,  height: 667  },
  { name: 'iPhone-15-Pro',  width: 393,  height: 852  },
  { name: 'Pixel-7',        width: 412,  height: 915  },
  { name: 'iPad-Mini',      width: 768,  height: 1024 },
  { name: 'iPad-Pro',       width: 1024, height: 1366 },
  { name: 'Desktop',        width: 1440, height: 900  }
];

const PAGES = [
  // MoveAthens site
  { subsystem: 'moveathens', name: 'welcome',  url: '/moveathens/pages/welcome.html' },
  { subsystem: 'moveathens', name: 'transfer', url: '/moveathens/pages/transfer.html' },
  { subsystem: 'moveathens', name: 'prices',   url: '/moveathens/pages/prices.html' },
  // DriverSystem
  { subsystem: 'driverssystem', name: 'welcome', url: '/driverssystem/pages/welcome.html' },
  { subsystem: 'driverssystem', name: 'entries', url: '/driverssystem/pages/entries.html' },
  { subsystem: 'driverssystem', name: 'stats',   url: '/driverssystem/pages/stats.html' },
  // Admin
  { subsystem: 'admin', name: 'home',           url: '/admin-home.html' },
  { subsystem: 'admin', name: 'moveathens-ui',  url: '/admin/pages/admin-moveathens-ui.html' },
  { subsystem: 'admin', name: 'driver-panel',   url: '/admin/pages/admin-driver-panel.html' },
  // Driver Panel
  { subsystem: 'driver-panel', name: 'home',    url: '/moveathens/driver' },
  { subsystem: 'driver-panel', name: 'profile', url: '/moveathens/driver' }
];

async function run() {
  // Ensure output directory
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  let total = 0;
  let errors = 0;

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const label = `${page.subsystem}__${page.name}__${vp.name}`;
      const outFile = path.join(OUT_DIR, `${label}.png`);

      try {
        const tab = await browser.newPage();
        await tab.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
        await tab.goto(`${BASE}${page.url}`, { waitUntil: 'networkidle2', timeout: 15000 });
        await tab.waitForTimeout(1000); // let animations settle
        await tab.screenshot({ path: outFile, fullPage: false });
        await tab.close();
        total++;
        process.stdout.write(`  ✓ ${label}\n`);
      } catch (err) {
        errors++;
        process.stdout.write(`  ✗ ${label} — ${err.message}\n`);
      }
    }
  }

  await browser.close();

  console.log(`\n━━━ Done: ${total} screenshots, ${errors} errors ━━━`);
  console.log(`Output: ${OUT_DIR}`);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
