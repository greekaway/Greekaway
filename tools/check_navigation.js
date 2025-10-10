const puppeteer = require('puppeteer');

(async () => {
  const startUrl = 'http://localhost:3000/categories/culture.html';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
  const page = await browser.newPage();

  const logs = [];
  const networkFailures = [];

  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message }));
  page.on('requestfailed', req => networkFailures.push({ url: req.url(), failureText: req.failure() && req.failure().errorText }));
  page.on('response', res => { if (res.status() >= 400) networkFailures.push({ url: res.url(), status: res.status() }); });

  try {
    await page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 10000 });
    if (page.waitForTimeout) await page.waitForTimeout(250);
    else await new Promise(r => setTimeout(r, 250));

    // Click the first trip card
    const card = await page.$('.trip-card');
    if (!card) {
      console.log('NO_CARD_FOUND');
      console.log('---PAGE_CONSOLES_START---'); logs.forEach(l => console.log(`${l.type}: ${l.text}`)); console.log('---PAGE_CONSOLES_END---');
      console.log('---NETWORK_FAILURES_START---'); networkFailures.forEach(f => console.log(JSON.stringify(f))); console.log('---NETWORK_FAILURES_END---');
      await browser.close();
      process.exit(0);
    }

    await Promise.all([
      card.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(e => null)
    ]);

    // give scripts time to run on destination
    if (page.waitForTimeout) await page.waitForTimeout(300);
    else await new Promise(r => setTimeout(r, 300));

    // extract trip page data
    const title = await page.$eval('#trip-title', el => el.textContent.trim()).catch(() => 'NO_TITLE');
    const desc = await page.$eval('#trip-description', el => el.textContent.trim()).catch(() => 'NO_DESCRIPTION');
    const stopsCount = await page.$$eval('#stops .trip-stop', els => els.length).catch(() => 0);

    console.log('---PAGE_CONSOLES_START---'); logs.forEach(l => console.log(`${l.type}: ${l.text}`)); console.log('---PAGE_CONSOLES_END---');
    console.log('---NETWORK_FAILURES_START---'); networkFailures.forEach(f => console.log(JSON.stringify(f))); console.log('---NETWORK_FAILURES_END---');

    console.log('---TRIP_PAGE_DATA_START---');
    console.log('title:', title);
    console.log('description:', desc);
    console.log('stopsCount:', stopsCount);
    console.log('url:', page.url());
    console.log('---TRIP_PAGE_DATA_END---');

  } catch (err) {
    console.error('SCRIPT_ERROR:', err && err.stack ? err.stack : err);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
