const puppeteer = require('puppeteer');

const VIEWPORTS = [
  { name: 'iphone-16-dark',  viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, theme: 'dark' },
  { name: 'iphone-16-light', viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, theme: 'light' },
  { name: 'iphone-16-force-light', viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, theme: 'force-light' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const d of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport(d.viewport);

      // Set color scheme emulation
      if (d.theme === 'light' || d.theme === 'force-light') {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      } else {
        await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      }

      // Inject localStorage for auth bypass + force-light if needed
      await page.evaluateOnNewDocument((theme) => {
        localStorage.setItem('moveathens_hotel', JSON.stringify({
          origin_zone_id: 'tz_1769602772374',
          orderer_phone: '6985700007',
          hotel_name: 'Domotel Kastri Hotel',
          origin_zone_name: 'Domotel Kastri Hotel',
          display_name: 'Ioannis Palmos'
        }));
        localStorage.setItem('moveathens_hotel_zone_id', 'tz_1769602772374');
        if (theme === 'force-light') {
          localStorage.setItem('ma_theme_preference', 'light');
        } else {
          localStorage.removeItem('ma_theme_preference');
        }
      }, d.theme);

      // Intercept hotel-by-phone API to return mock data
      await page.setRequestInterception(true);
      page.on('request', req => {
        if (req.url().includes('/api/moveathens/hotel-by-phone')) {
          req.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              zone: {
                id: 'tz_1769602772374',
                name: 'Domotel Kastri Hotel',
                type: 'suburb',
                municipality: 'Nea Erithrea',
                address: 'El.Venizelou 54 & Romilias, Nea Erithrea 146 71',
                email: 'repeatpalmos@hotmail.com',
                accommodation_type: 'hotel'
              },
              phones: [{ id: 'p1', phone: '6985700007', label: '', display_name: 'Ioannis Palmos' }],
              has_pin: false,
              display_name: 'Ioannis Palmos'
            })
          });
        } else {
          req.continue();
        }
      });

      await page.goto('http://localhost:3101/moveathens/hotel/profile', { waitUntil: 'networkidle2', timeout: 15000 });
      await sleep(1500);

      await page.screenshot({ path: 'reports/profile_' + d.name + '.png', fullPage: true });
      console.log('Done: ' + d.name);
      await page.close();
    }
    console.log('All profile screenshots saved in reports/');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
