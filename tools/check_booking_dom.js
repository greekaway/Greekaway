const puppeteer = require('puppeteer');

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1366, height: 768 }
];

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'http://localhost:3000/trip.html?trip=olympia&smoke=1';
  const results = [];
  for (const vp of viewports) {
    await page.setViewport({ width: vp.width, height: vp.height });
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
    } catch (e) {
      results.push({ viewport: vp.name, error: e.message });
      continue;
    }
    const hasLang = await page.$('#langSelect') !== null;
    const footer = await page.$('footer');
    const footerVisible = !!footer && await footer.evaluate((f) => {
      const style = window.getComputedStyle(f);
      return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    results.push({ viewport: vp.name, hasLang, footerVisible });
  }
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();