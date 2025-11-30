const { spawn } = require('child_process');
const http = require('http');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;

async function pingServer() {
  const url = new URL('/index.html', BASE);
  return new Promise((resolve) => {
    const req = http.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      timeout: 2000
    }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function ensureServer() {
  if (await pingServer()) return;
  await new Promise((resolve) => {
    const child = spawn('node', ['server.js'], { env: process.env, stdio: 'ignore', detached: true });
    child.unref();
    setTimeout(resolve, 1800);
  });
}

(async () => {
  const report = { sw: {}, cache: {}, offline: {} };
  await ensureServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
    report.sw = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { supported: false };
      }
      const ready = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const scoped = cacheNames.filter((name) => name.startsWith('greekaway-pwa'));
      const cachedPaths = [];
      for (const name of scoped) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        requests.forEach((req) => {
          try {
            const url = new URL(req.url);
            cachedPaths.push(url.pathname + (url.search || ''));
          } catch (_) {
            cachedPaths.push(req.url);
          }
        });
      }
      return {
        supported: true,
        ready: !!ready,
        scriptURL: ready && ready.active ? ready.active.scriptURL : null,
        scope: ready && ready.scope,
        cacheNames,
        cachedPaths
      };
    });

    report.cache.hasStep1 = report.sw.cachedPaths.includes('/booking/step1');
    report.cache.hasStep2 = report.sw.cachedPaths.includes('/booking/step2');
    report.cache.hasStep3 = report.sw.cachedPaths.includes('/booking/step3');

    await page.setOfflineMode(true);
    try {
      await page.goto(`${BASE}/booking/step2`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      report.offline.step2 = 'served-from-cache';
    } catch (err) {
      report.offline.step2 = `failed: ${err.message}`;
    }
    try {
      await page.goto(`${BASE}/booking/step3`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      report.offline.step3 = 'served-from-cache';
    } catch (err) {
      report.offline.step3 = `failed: ${err.message}`;
    }
    await page.setOfflineMode(false);
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('SW check failed', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
