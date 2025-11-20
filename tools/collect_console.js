const puppeteer = require('puppeteer');

(async () => {
  const url = 'http://localhost:3000/category.html?slug=culture';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], headless: true });
  const page = await browser.newPage();

  const logs = [];
  page.on('console', msg => {
    try {
      logs.push({ type: msg.type(), text: msg.text() });
    } catch (e) {
      logs.push({ type: 'error', text: String(msg) });
    }
  });

  const networkFailures = [];
  page.on('requestfailed', req => {
    networkFailures.push({ url: req.url(), failureText: req.failure() && req.failure().errorText });
  });
  page.on('response', res => {
    const status = res.status();
    if (status >= 400) {
      networkFailures.push({ url: res.url(), status });
    }
  });

  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message }));

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });

    // give scripts a bit more time (backward-compatible)
    if (page.waitForTimeout) {
      await page.waitForTimeout(300);
    } else {
      await new Promise(r => setTimeout(r, 300));
    }

    const tripsHtml = await page.$eval('#trips-container', el => el.innerHTML);
    const tripsText = await page.$eval('#trips-container', el => el.textContent.trim());

    console.log('---PAGE_CONSOLES_START---');
    logs.forEach(l => console.log(`${l.type}: ${l.text}`));
    console.log('---PAGE_CONSOLES_END---');
    console.log('---NETWORK_FAILURES_START---');
    networkFailures.forEach(f => console.log(JSON.stringify(f)));
    console.log('---NETWORK_FAILURES_END---');
    console.log('---TRIPS_CONTAINER_HTML_START---');
    console.log(tripsHtml);
    console.log('---TRIPS_CONTAINER_HTML_END---');
    console.log('---TRIPS_CONTAINER_TEXT_START---');
    console.log(tripsText);
    console.log('---TRIPS_CONTAINER_TEXT_END---');
  } catch (err) {
    console.error('SCRIPT_ERROR:', err && err.stack ? err.stack : err);
  } finally {
    await browser.close();
    process.exit(0);
  }
})();
