const puppeteer = require('puppeteer');

const DEVICES = [
  { name: 'iphone-se',          viewport: { width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'iphone-13',          viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'iphone-16-pro-max',  viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'pixel-7',            viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
  { name: 'ipad-mini',          viewport: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'tablet-ipad-pro',    viewport: { width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'desktop',            viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const d of DEVICES) {
      const page = await browser.newPage();
      await page.setViewport(d.viewport);

      // Inject localStorage with display_name so auth gate returns early
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('moveathens_hotel', JSON.stringify({
          origin_zone_id: 'tz_1769602772374',
          orderer_phone: '6985700007',
          hotel_name: 'Αθηνα',
          origin_zone_name: 'Αθηνα',
          display_name: 'Test User'
        }));
        localStorage.setItem('moveathens_hotel_zone_id', 'tz_1769602772374');
      });

      await page.goto('http://localhost:3101/moveathens/hotel/revenue', { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1200);

      // Click 'Χειροκίνητη' to show the date fields — use evaluate to avoid clickable issues
      await page.evaluate(() => {
        const btns = document.querySelectorAll('.ma-rev-filter__btn');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'Χειροκίνητη') {
            btn.click();
            break;
          }
        }
      });
      await sleep(300);

      await page.screenshot({ path: 'reports/revenue_' + d.name + '.png', fullPage: true });
      console.log('Done: ' + d.name + ' (' + d.viewport.width + 'x' + d.viewport.height + ')');
      await page.close();
    }
    console.log('All screenshots saved in reports/');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
