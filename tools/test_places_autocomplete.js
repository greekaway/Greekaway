const puppeteer = require('puppeteer');

(async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:3101';
  const url = base + '/step2.html';
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Capture console messages from the page
  const logs = [];
  page.on('console', msg => {
    try {
      const text = msg.text();
      if (text.includes('[pickup-autocomplete]')) logs.push(text);
    } catch (_) {}
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#pickupInput', { timeout: 10000 });

    // Type query quickly; debounce in app is ~480ms so one call should fire after typing
    await page.focus('#pickupInput');
    await page.type('#pickupInput', 'Athens', { delay: 80 });

    // Wait enough time for debounce + network + render
    await page.waitForTimeout(2000);

    // Inspect dropdown for suggestions
    const state = await page.evaluate(() => {
      const dd = document.querySelector('#pickupSuggest');
      return dd ? { hidden: dd.hasAttribute('hidden'), count: dd.childElementCount } : { hidden: true, count: 0 };
    });

    // Parse last status from console logs if present
    let lastStatus = null; let lastResults = null;
    for (let i = logs.length - 1; i >= 0; i--) {
      const m = logs[i].match(/\[pickup-autocomplete\]\s+status:\s*([^\s,]+)/i);
      if (m) {
        lastStatus = m[1];
        const m2 = logs[i].match(/results:\s*(\d+)/i);
        if (m2) lastResults = parseInt(m2[1], 10);
        break;
      }
    }

    console.log('\n--- Places Autocomplete Check ---');
    console.log('URL:', url);
    console.log('Console last status:', lastStatus);
    console.log('Console last results:', lastResults);
    console.log('Dropdown hidden:', state.hidden, 'items:', state.count);

    const pass = (lastStatus === 'OK' || lastStatus === 'ZERO_RESULTS') && (state.count >= 0);
    console.log('RESULT:', pass ? 'PASS' : 'NEEDS_ATTENTION');

  } catch (err) {
    console.error('Test error:', err && err.message ? err.message : err);
    console.log('RESULT: ERROR');
  } finally {
    await browser.close();
  }
})();
