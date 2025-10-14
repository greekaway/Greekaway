const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 900 });
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  try {
    // Serve files assumed on localhost:3000 (server.js needs to be running by user)
    await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2' });
    // Wait for central booking button
    await page.waitForSelector('footer a.central-btn', { timeout: 5000 });
    await page.click('footer a.central-btn');
    // wait for overlay
    await page.waitForSelector('#bookingOverlay .overlay-inner', { timeout: 5000 });
  await sleep(600);
    await page.screenshot({ path: 'smoke_step1_calendar.png', fullPage: false });
    // Click next to step2
    await page.click('#s1Next');
    await page.waitForSelector('#step2 .step-card', { timeout: 5000 });
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
    await page.click('#s2Next');
    await page.waitForSelector('#step3', { timeout: 5000 });
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
