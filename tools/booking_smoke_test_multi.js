const puppeteer = require('puppeteer');

const DEVICES = [
  { name: 'iphone-13', viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'iphone-14', viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'iphone-16-pro-max', viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'pixel-7', viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
  { name: 'ipad-mini', viewport: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'tablet', viewport: { width: 834, height: 1112, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const d of DEVICES) {
      const page = await browser.newPage();
      await page.setViewport(d.viewport);
      try {
        await page.goto('http://localhost:3000/trip.html?trip=olympia', { waitUntil: 'networkidle2' });
        await page.waitForSelector('footer a.central-btn', { timeout: 10000 });
        await page.click('footer a.central-btn');
        await page.waitForSelector('#bookingOverlay .overlay-inner', { timeout: 10000 });
        await sleep(600);
        await page.screenshot({ path: `${d.name}_step1_calendar.png` });

        // Step 1 -> Step 2 (new standalone Step 2 page)
        await page.waitForSelector('#s1Next', { timeout: 12000 });
        // Try to set a date so Next becomes enabled
        try {
          await page.evaluate(() => {
            const today = new Date().toISOString().slice(0,10);
            const input = document.querySelector('input[name="date"], #bookingDate, #calendarFull');
            if (input) input.value = today;
            const next = document.getElementById('s1Next'); if (next) next.disabled = false;
          });
        } catch(_) {}
        await page.evaluate(() => { const el = document.querySelector('#s1Next'); if (el) el.scrollIntoView({ block: 'center' }); });
        await page.evaluate(() => { const el = document.getElementById('s1Next'); if (el) el.click(); });
        // Wait for navigation to Step 2 and its new selectors
        try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }); } catch(_) {}
        await page.waitForSelector('.s2-fields', { timeout: 12000 });
        await sleep(400);
        await page.screenshot({ path: `${d.name}_step2_details.png` });

        // Increase adults and screenshot again
        try { await page.click('#adultsInc'); } catch(_) {}
        await sleep(200);
        await page.screenshot({ path: `${d.name}_step2_adults_changed.png` });

        // Step 2 -> Step 3 (standalone Step 3 page)
        await page.evaluate(() => { const el = document.querySelector('#s2Next'); if (el) el.scrollIntoView({ block: 'center' }); });
        await page.evaluate(() => { const el = document.getElementById('s2Next'); if (el) el.click(); });
        try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }); } catch(_) {}
        await page.waitForSelector('.s3-summary', { timeout: 12000 });
        await sleep(300);
        await page.screenshot({ path: `${d.name}_step3_summary.png` });

        // Validate footer actions: AI overlay still works, Profile now full-page route
        await page.click('footer a:nth-child(4)');
        await page.waitForSelector('#aiOverlay .overlay-inner', { timeout: 8000 });
        await page.screenshot({ path: `${d.name}_help_overlay.png` });
        await page.evaluate(() => { if (window.closeOverlay) window.closeOverlay('aiOverlay'); });

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 12000 }).catch(() => {}),
          page.click('footer a:nth-child(5)')
        ]);
        await page.waitForSelector('main.profile-page', { timeout: 8000 });
        await page.screenshot({ path: `${d.name}_profile_page.png` });
        try { await page.goBack({ waitUntil: 'networkidle2', timeout: 12000 }); } catch(_) {}

        await page.close();
      } catch (e) {
        console.error(`[${d.name}] failed`, e.message);
        try { await page.close(); } catch (_) {}
      }
    }
  } finally {
    await browser.close();
  }
  console.log('Multi-viewport screenshots saved.');
})();
