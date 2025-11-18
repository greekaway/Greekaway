const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // iPhone 16 Pro Max-like viewport (portrait)
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  // Allow overriding base URL/port to match local .env (defaults to 3000)
  const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  try {
    // Navigate to trip page on the configured base (server.js must be running)
    await page.goto(`${BASE}/trips/trip.html?id=olympia&smoke=1`, { waitUntil: 'networkidle2' });
  // Wait for central booking button and click via DOM to bypass visibility constraints
  await page.waitForSelector('footer a.central-btn', { timeout: 5000 });
  await page.$eval('footer a.central-btn', el => el && el.click());
    // wait for overlay
    await page.waitForSelector('#bookingOverlay .overlay-inner', { timeout: 10000 });
    await sleep(800);
    await page.screenshot({ path: 'smoke_step1_calendar.png', fullPage: false });
    // Scroll Next into view and wait for it to be enabled before clicking
    await page.waitForSelector('#s1Next', { timeout: 10000 });
    await page.evaluate(() => {
      const el = document.querySelector('#s1Next');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.waitForSelector('#s1Next:not([disabled])', { timeout: 10000 });
    // Click and wait for navigation atomically to avoid race conditions
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.$eval('#s1Next', el => el && el.click())
    ]);
    // Step 2 is now a standalone page (/step2.html)
    await page.waitForSelector('.s2-fields', { timeout: 10000 });
    await sleep(400);
    await page.screenshot({ path: 'smoke_step2_details.png', fullPage: false });
    // Make minimal required selections to enable Next
    // 1) Increase adults by 1 (optional visual change)
    await page.waitForSelector('#adultsInc', { timeout: 10000 });
    await page.$eval('#adultsInc', el => el && el.click());
    await sleep(150);
    // 2) Choose an age group
    await page.waitForSelector('#ageSelectBtn', { timeout: 10000 });
    await page.$eval('#ageSelectBtn', el => el && el.click());
    await page.waitForSelector('#ageMenu button', { timeout: 5000 });
    await page.$eval('#ageMenu button', el => el && el.click());
    await sleep(150);
    // 3) Choose a traveler type
    await page.waitForSelector('#travTypeSelectBtn', { timeout: 10000 });
    await page.$eval('#travTypeSelectBtn', el => el && el.click());
    await page.waitForSelector('#travTypeMenu button', { timeout: 5000 });
    await page.$eval('#travTypeMenu button', el => el && el.click());
    await sleep(150);
    // 4) Enter a pickup address (non-strict mode accepts free text)
    await page.type('#pickupInput', 'Athens, Greece');
    await page.$eval('#pickupInput', el => el && el.blur && el.blur());
    await sleep(200);
    await page.screenshot({ path: 'smoke_step2_ready.png' });
    // proceed to summary
    await page.evaluate(() => {
      const el = document.querySelector('#s2Next');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.waitForSelector('#s2Next', { timeout: 10000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.$eval('#s2Next', el => el && el.click())
    ]);
    // Step 3 is standalone page (/step3.html)
    await page.waitForSelector('.s3-summary', { timeout: 10000 });
  await sleep(300);
    await page.screenshot({ path: 'smoke_step3_summary.png' });
    console.log('Screenshots saved in project root.');
  } catch (e) {
    console.error('Smoke test failed', e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
