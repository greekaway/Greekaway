const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    await page.goto('http://localhost:3000/trip.html?trip=olympia', { waitUntil: 'networkidle2' });
    await page.waitForSelector('footer a.central-btn', { timeout: 15000 });
    await page.click('footer a.central-btn');
    await page.waitForSelector('#bookingOverlay.active', { timeout: 15000 });
    await page.waitForSelector('#bookingOverlay .flatpickr-calendar', { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'booking_step1_desktop.png' });
    console.log('Saved booking_step1_desktop.png');
  } catch (e) {
    console.error('Desktop STEP1 capture failed:', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
