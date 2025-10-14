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
        await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2' });
        await page.waitForSelector('footer a.central-btn', { timeout: 10000 });
        await page.click('footer a.central-btn');
        await page.waitForSelector('#bookingOverlay .overlay-inner', { timeout: 10000 });
        await sleep(600);
        await page.screenshot({ path: `${d.name}_step1_calendar.png` });

        // Step 1 -> Step 2
        await page.waitForSelector('#s1Next', { timeout: 12000 });
        // try to ensure availability is set if Next is disabled: set date to today and call availability if exposed
        try {
          await page.evaluate(() => {
            const today = new Date().toISOString().slice(0,10);
            const d = document.getElementById('bookingDate'); if (d) d.value = today;
            // trigger change handlers indirectly if exist
            const cal = document.getElementById('calendarFull'); if (cal) cal.value = today;
          });
        } catch(_) {}
        // force-enable Next if still disabled (for UX-only test)
        await page.evaluate(() => { const b = document.getElementById('s1Next'); if (b) b.disabled = false; });
        await page.evaluate(() => { const el = document.querySelector('#s1Next'); if (el) el.scrollIntoView({ block: 'center' }); });
        // click via JS to avoid offscreen/tap issues
        await page.evaluate(() => { const el = document.getElementById('s1Next'); if (el) el.click(); });
        await page.waitForSelector('#step2 .step-card', { timeout: 10000 });
        await sleep(400);
        await page.screenshot({ path: `${d.name}_step2_details.png` });

        // Seat + and screenshot again
        await page.click('#step2 .seat-inc');
        await sleep(200);
        await page.screenshot({ path: `${d.name}_step2_seats_changed.png` });

        // Step 2 -> Step 3
  await page.evaluate(() => { const el = document.querySelector('#s2Next'); if (el) el.scrollIntoView({ block: 'center' }); });
  await page.evaluate(() => { const el = document.getElementById('s2Next'); if (el) el.click(); });
        await page.waitForSelector('#step3', { timeout: 10000 });
        await sleep(300);
        await page.screenshot({ path: `${d.name}_step3_summary.png` });
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
