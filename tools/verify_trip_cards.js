const puppeteer = require('puppeteer');
(async ()=>{
  const url = 'http://localhost:3000/category.html?slug=culture';
  const browser = await puppeteer.launch({args:['--no-sandbox'], headless: true});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGELOG>', msg.text()));
  await page.goto(url, {waitUntil:'networkidle2', timeout:10000});
  await page.waitForSelector('#trips-container');
  const trips = await page.$$eval('#trips-container .trip-card', nodes=>nodes.map(n=>({class:n.className, data:n.dataset.cat, text:n.textContent.trim()})));
  console.log('TRIPS', trips);
  await browser.close();
})();