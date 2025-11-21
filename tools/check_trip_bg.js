const puppeteer = require('puppeteer');
(async ()=>{
  const url = 'http://localhost:3000/trip.html?trip=olympia';
  const browser = await puppeteer.launch({args:['--no-sandbox'], headless: true});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGELOG>', msg.text()));
  await page.goto(url, {waitUntil:'networkidle2', timeout:10000});
  await page.waitForSelector('#trip-section');
  const dataCat = await page.$eval('body', b => b.dataset.category || 'NONE');
  const bg = await page.evaluate(()=> getComputedStyle(document.body).backgroundImage || getComputedStyle(document.body).background);
  console.log('DATA_CAT', dataCat);
  console.log('BG_STYLE', bg);
  await browser.close();
})();