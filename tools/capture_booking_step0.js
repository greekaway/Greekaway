const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Use a tall mobile viewport to show the gradient nicely
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2' });
    // Open the booking overlay via the central footer button
    await page.waitForSelector('footer a.central-btn', { timeout: 10000 });
    await page.click('footer a.central-btn');
    await page.waitForSelector('#bookingOverlay.active, #bookingOverlay.overlay.active', { timeout: 10000 });
  // Give CSS a moment to apply (fallback-friendly delay)
  await new Promise(res => setTimeout(res, 500));
    await page.screenshot({ path: 'booking_step0_background.png' });
    console.log('Saved booking_step0_background.png');
  } catch (e) {
    console.error('STEP0 capture failed:', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
