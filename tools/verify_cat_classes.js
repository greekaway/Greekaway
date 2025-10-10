const puppeteer = require('puppeteer');
(async ()=>{
  const url = 'http://localhost:3000/trips.html';
  const browser = await puppeteer.launch({args:['--no-sandbox'], headless: true});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGELOG>', msg.text()));
  await page.goto(url, {waitUntil:'networkidle2', timeout:10000});
  await page.waitForSelector('#categories-container');
  const buttons = await page.$$eval('.category-btn', nodes=>nodes.map(n=>({class: n.className, data: n.dataset.cat, title:n.title}))); 
  console.log('BUTTONS', buttons);
  await browser.close();
})();