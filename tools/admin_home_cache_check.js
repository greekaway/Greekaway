const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

async function ensureServer() {
  // naive check for localhost:3000
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 3000, path: '/health', timeout: 1500 }, (res) => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { try { req.destroy(); } catch(_){} resolve(false); });
  });
}

(async () => {
  const running = await ensureServer();
  if (!running) {
    console.log('Server not detected on :3000. Please start with: node server.js');
    process.exit(2);
  }

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto('http://127.0.0.1:3000/admin-home.html', { waitUntil: 'networkidle2' });

  // Verify build marker and absence of SW
  const info = await page.evaluate(async () => {
    const version = window.__AH_VERSION || null;
    let swCount = -1;
    if ('serviceWorker' in navigator) {
      try { const regs = await navigator.serviceWorker.getRegistrations(); swCount = regs.length; } catch(_) { swCount = -2; }
    }
    return { version, swCount };
  });

  const hasVersion = info && info.version === '20251030-1';
  const swCleared = (info && typeof info.swCount === 'number' && info.swCount === 0);

  const ok = hasVersion && swCleared && consoleErrors.length === 0;

  console.log('admin-home cache check:\n', {
    hasVersion, version: info.version, swCleared, consoleErrorsCount: consoleErrors.length
  });
  if (consoleErrors.length) {
    console.log('Console errors:', consoleErrors);
  }

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
