const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/trip.html?trip=olympia', { waitUntil: 'networkidle2' });
    await page.waitForSelector('footer a.central-btn', { timeout: 15000 });
    await page.click('footer a.central-btn');
    await page.waitForSelector('#bookingOverlay.active, #bookingOverlay.overlay.active', { timeout: 15000 });
    // Wait for inline calendar to render
    await page.waitForSelector('#bookingOverlay .flatpickr-calendar', { timeout: 15000 });
    // Small settle delay
    await new Promise(res => setTimeout(res, 400));
    await page.screenshot({ path: 'booking_step1_calendar_only.png' });
    console.log('Saved booking_step1_calendar_only.png');
  } catch (e) {
    console.error('STEP1 capture failed:', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
