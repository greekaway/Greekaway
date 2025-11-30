const http = require('http');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');

const log = (...args) => console.log('[manual-check]', ...args);

const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;

async function ensureServerReady() {
  const pingUrl = new URL('/index.html', BASE);
  const ping = () => new Promise((resolve, reject) => {
    const req = http.request({
      protocol: pingUrl.protocol,
      hostname: pingUrl.hostname,
      port: pingUrl.port,
      path: pingUrl.pathname,
      method: 'GET',
      timeout: 2000
    }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ping_timeout'));
    });
    req.on('error', reject);
    req.end();
  });

  try {
    const ok = await ping();
    if (ok) return;
  } catch (_) {}
  await new Promise((resolve) => {
    const child = spawn('node', ['server.js'], { env: process.env, stdio: 'ignore', detached: true });
    child.unref();
    setTimeout(resolve, 1800);
  });
}

async function collectServiceWorkerInfo(page) {
  return page.evaluate(async () => {
    const info = { supported: 'serviceWorker' in navigator };
    if (!info.supported) return info;
    try {
      let registration = await navigator.serviceWorker.getRegistration();
      const start = Date.now();
      while ((!registration || !registration.active) && Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        registration = await navigator.serviceWorker.getRegistration();
      }
      if (registration && registration.active) {
        info.ready = true;
        info.scriptURL = registration.active.scriptURL;
      } else {
        info.ready = false;
      }
    } catch (err) {
      info.ready = false;
      info.error = err && err.message;
    }
    try {
      const cacheNames = await caches.keys();
      info.cacheNames = cacheNames;
      const cachedPaths = new Set();
      for (const name of cacheNames) {
        if (!/greekaway-pwa/.test(name)) continue;
        const cache = await caches.open(name);
        const requests = await cache.keys();
        for (const req of requests) {
          try { cachedPaths.add(new URL(req.url).pathname); } catch (_) {}
        }
      }
      info.cachedPaths = Array.from(cachedPaths).sort();
    } catch (err) {
      info.cacheError = err && err.message;
    }
    return info;
  });
}

async function runFlow() {
  const report = { steps: {}, errors: [] };
  await ensureServerReady();
  log('Server ready at', BASE);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      try {
        const loc = msg.location();
        log('browser log', msg.type(), msg.text(), loc && loc.url ? `@ ${loc.url}:${loc.lineNumber||''}` : '');
      } catch (_) {}
    });
    page.on('pageerror', (err) => {
      log('browser error', err && err.message ? err.message : String(err));
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        log('Frame navigated to', frame.url());
      }
    });
    page.setDefaultTimeout(20000);
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(`${BASE}/trip.html?trip=premium-acropolis-tour&mode=bus`, { waitUntil: 'networkidle2' });
    log('Trip page loaded');
    await page.waitForSelector('footer a.central-btn', { timeout: 20000 });
    report.steps.tripUrl = page.url();
    report.steps.tripCtaTarget = await page.$eval('footer a.central-btn', (el) => el.href);
    report.serviceWorker = await collectServiceWorkerInfo(page);
    log('Service worker info', report.serviceWorker && report.serviceWorker.ready);

    await page.evaluate(() => {
      const btn = document.querySelector('footer a.central-btn');
      if (btn) btn.scrollIntoView({ block: 'center' });
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('footer a.central-btn')
    ]);
    log('Arrived Step 1');
    report.steps.step1Url = page.url();

    let selectedDate = null;
    try {
      await page.waitForSelector('.day-cell', { timeout: 20000 });
      selectedDate = await page.evaluate(() => {
        const btn = document.querySelector('.day-cell.has-availability:not(.is-disabled)');
        if (!btn) return null;
        btn.click();
        return btn.dataset.date || null;
      });
      log('Calendar date candidate', selectedDate);
      if (selectedDate) {
        await page.waitForSelector('#continueBtn:not([disabled])', { timeout: 15000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click('#continueBtn')
        ]);
          log('Selected date and advanced to Step 2');
      }
    } catch (err) {
      report.errors.push(`Step1 calendar selection failed: ${err.message}`);
    }

    if (!selectedDate) {
      selectedDate = '2025-11-30';
      log('Using fallback date', selectedDate);
      const fallbackQuery = await page.evaluate((targetDate) => {
        const params = new URLSearchParams(window.location.search);
        const trip = params.get('trip') || sessionStorage.getItem('gw_trip_id') || 'premium-acropolis-tour';
        const mode = params.get('mode') || sessionStorage.getItem('gw_trip_mode') || 'bus';
        sessionStorage.setItem('gw_trip_date', targetDate);
        return new URLSearchParams({ trip, mode, date: targetDate }).toString();
      }, selectedDate);
      await page.goto(`${BASE}/booking/step2?${fallbackQuery}`, { waitUntil: 'networkidle2' });
      log('Fallback navigation forced to Step 2');
    }

    report.steps.selectedDate = selectedDate;
    report.steps.step2Url = page.url();

    const step1Params = await page.evaluate(() => {
      const params = new URLSearchParams(window.location.search);
      const trip = params.get('trip') || sessionStorage.getItem('gw_trip_id') || '';
      const mode = params.get('mode') || sessionStorage.getItem('gw_trip_mode') || '';
      return { trip, mode };
    });
    report.steps.step1ComputedParams = step1Params;

    if (!/\/booking\/step2/i.test(page.url())) {
      const enforcedQuery = new URLSearchParams({
        trip: step1Params.trip || 'premium-acropolis-tour',
        mode: step1Params.mode || 'bus',
        date: selectedDate
      }).toString();
      await page.goto(`${BASE}/booking/step2?${enforcedQuery}`, { waitUntil: 'networkidle2' });
      report.steps.step2Url = page.url();
      log('Forced navigation into Step 2 at', report.steps.step2Url);
    }

    log('Arrived Step 2 at', report.steps.step2Url);
    try {
      await page.waitForSelector('.s2-fields', { timeout: 20000 });
    } catch (err) {
      const currentUrl = page.url();
      throw new Error(`Step2 DOM not ready (${currentUrl}): ${err.message}`);
    }

    const click = async (selector) => {
      const node = await page.$(selector);
      if (!node) return false;
      await node.click();
      return true;
    };
    const waitForVisible = async (selector) => {
      await page.waitForFunction((sel) => {
        const node = document.querySelector(sel);
        if (!node) return false;
        if (node.hidden) return false;
        const style = window.getComputedStyle(node);
        return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }, {}, selector);
    };

    try { await click('#adultsInc'); } catch (_) {}
    try {
      if (await click('#ageSelectBtn')) {
        await waitForVisible('#ageMenu');
        await page.waitForSelector('#ageMenu button', { timeout: 5000 });
        await page.click('#ageMenu button');
      }
    } catch (_) {}
    try {
      if (await click('#travTypeSelectBtn')) {
        await waitForVisible('#travTypeMenu');
        await page.waitForSelector('#travTypeMenu button', { timeout: 5000 });
        await page.click('#travTypeMenu button');
      }
    } catch (_) {}
    try {
      if (await click('#interestSelectBtn')) {
        await waitForVisible('#interestMenu');
        await page.waitForSelector('#interestMenu button', { timeout: 5000 });
        try {
          await page.click('#interestMenu button[data-code="culture"]');
        } catch (_) {
          await page.click('#interestMenu button');
        }
      }
    } catch (_) {}
    try {
      if (await click('#socialSelectBtn')) {
        await waitForVisible('#socialMenu');
        await page.waitForSelector('#socialMenu button', { timeout: 5000 });
        await page.click('#socialMenu button');
      }
    } catch (_) {}
    try {
      await page.focus('#pickupInput');
      await page.$eval('#pickupInput', (el) => { el.value = ''; });
      await page.type('#pickupInput', 'Syntagma Square, Athens');
      await page.$eval('#pickupInput', (el) => el.blur());
    } catch (_) {}
    report.steps.step2Session = await page.evaluate(() => {
      const read = (k) => {
        try { return sessionStorage.getItem(k); } catch (_) { return null; }
      };
      return {
        adults: read('gw_adults'),
        age: read('gw_age_group'),
        travelerType: read('gw_traveler_type'),
        interest: read('gw_interest'),
        social: read('gw_sociality'),
        pickup: read('gw_pickup_address'),
        suitcases: {
          small: read('gw_bags_small'),
          medium: read('gw_bags_medium'),
          large: read('gw_bags_large')
        }
      };
    });
    try {
      if (await click('#suitcasesInc')) {
        await page.waitForSelector('#suitcasePopup .suitcase-item', { timeout: 5000 });
        await page.$$eval('#suitcasePopup .suitcase-item', (items) => {
          items.forEach((item, idx) => {
            const inc = item.querySelector('.si-inc');
            if (inc) {
              inc.click();
              if (idx === 2) inc.click();
            }
          });
        });
        await click('#suitcaseConfirm');
      }
    } catch (_) {}
    try {
      await page.focus('#specialRequests');
      await page.type('#specialRequests', 'Need a quick coffee stop.');
    } catch (_) {}

    let step2NavSucceeded = true;
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#s2Next')
      ]);
    } catch (err) {
      step2NavSucceeded = false;
      report.errors.push(`Step2 Next navigation timeout: ${err.message}`);
      await page.evaluate(async () => {
        try {
          if (window.GWBookingState && window.GWBookingState.buildFromStep2) {
            await window.GWBookingState.buildFromStep2();
          }
        } catch (_) {}
      });
      await page.goto(`${BASE}/booking/step3`, { waitUntil: 'networkidle2' });
    }
    report.steps.step3Forced = !step2NavSucceeded;
    report.steps.step3Url = page.url();

    report.steps.step3Data = await page.evaluate(() => {
      const st = window.GWBookingState && window.GWBookingState.get ? window.GWBookingState.get() : null;
      const txt = (sel) => {
        const node = document.querySelector(sel);
        return node ? node.textContent.trim() : '';
      };
      const readSession = (key) => {
        try { return sessionStorage.getItem(key); } catch (_) { return null; }
      };
      return {
        path: window.location.pathname,
        displayed: {
          adults: txt('#vAdults'),
          suitcases: txt('#vBags'),
          interest: txt('#vInterest'),
          pickup: txt('#vPickup')
        },
        session: {
          interest: readSession('gw_interest'),
          social: readSession('gw_sociality'),
          bags: {
            small: readSession('gw_bags_small'),
            medium: readSession('gw_bags_medium'),
            large: readSession('gw_bags_large')
          }
        },
        bookingState: st
      };
    });

    let checkoutNavSucceeded = true;
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('#s3ProceedPay')
      ]);
    } catch (err) {
      checkoutNavSucceeded = false;
      report.errors.push(`Checkout navigation timeout: ${err.message}`);
      await page.goto(`${BASE}/checkout.html`, { waitUntil: 'networkidle2' });
    }
    report.steps.checkoutForced = !checkoutNavSucceeded;
    report.steps.checkoutUrl = page.url();
    report.steps.checkoutState = await page.evaluate(() => {
      const st = window.GWBookingState && window.GWBookingState.get ? window.GWBookingState.get() : null;
      return {
        path: window.location.pathname,
        hasState: !!st,
        travelerProfile: st && st.traveler_profile,
        suitcases: st && st.suitcases,
        trip: st && st.trip,
        pickup: st && st.pickup
      };
    });

    return report;
  } finally {
    await browser.close();
  }
}

runFlow()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((err) => {
    console.error('manual booking check failed', err);
    process.exitCode = 1;
  });
