const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  // iPhone 16 Pro Max-like viewport (portrait)
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  try {
    // Serve files assumed on localhost:3000 (server.js needs to be running by user)
    await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2' });
    // Wait for central booking button
    await page.waitForSelector('footer a.central-btn', { timeout: 5000 });
    await page.click('footer a.central-btn');
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
    await page.click('#s1Next');
    await page.waitForSelector('#step2 .step-card', { timeout: 10000 });
  await sleep(400);
    await page.screenshot({ path: 'smoke_step2_details.png', fullPage: false });
    // change seats
    await page.click('#step2 .seat-inc');
  await sleep(200);
    await page.screenshot({ path: 'smoke_step2_seats_changed.png' });
    // fill email to trigger autofill
    await page.type('#bookingEmail2', 'john.doe@example.com');
  await sleep(300);
    await page.screenshot({ path: 'smoke_step2_autofill.png' });
    // proceed to summary
    await page.evaluate(() => {
      const el = document.querySelector('#s2Next');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await page.click('#s2Next');
    await page.waitForSelector('#step3', { timeout: 10000 });
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
