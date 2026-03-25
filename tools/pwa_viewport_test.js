const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });

  const viewports = [
    { name: 'iPhone-SE', w: 375, h: 667, dpr: 2 },
    { name: 'iPhone-14-Pro', w: 393, h: 852, dpr: 3 },
    { name: 'iPhone-15-ProMax', w: 430, h: 932, dpr: 3 },
    { name: 'iPad-mini', w: 768, h: 1024, dpr: 2 },
    { name: 'iPad-Pro', w: 1024, h: 1366, dpr: 2 }
  ];

  const pages = [
    { name: 'welcome', path: '/moveathens/pages/welcome.html' },
    { name: 'transfer', path: '/moveathens/pages/transfer.html' }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr });

    for (const pg of pages) {
      try {
        await page.goto('http://127.0.0.1:3456' + pg.path, { waitUntil: 'networkidle2', timeout: 15000 });
      } catch (_) { /* ignore timeout */ }
      await new Promise(r => setTimeout(r, 1500));
      const fname = 'reports/pwa-' + pg.name + '-' + vp.name + '.png';
      await page.screenshot({ path: fname, fullPage: false });
      console.log('OK ' + fname);
    }

    await page.close();
  }

  await browser.close();
  console.log('All done!');
})().catch(e => { console.error(e); process.exit(1); });
