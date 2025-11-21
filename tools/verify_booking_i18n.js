const puppeteer = require('puppeteer');
const fs = require('fs');
(async ()=>{
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const langs = ['es','it','ko','nl','pt','ru','sv','zh'];
  const results = [];
  for (const lang of langs) {
    try {
      await page.goto(`http://localhost:3000/trip.html?trip=olympia`, { waitUntil: 'networkidle2' });
      // wait for i18n loader and set language
  await page.waitForFunction('window.setLanguage && typeof window.setLanguage === "function"', { timeout: 5000 });
  await page.evaluate((l)=>{ window.setLanguage(l); }, lang);
  await new Promise(r => setTimeout(r, 300));
      // open booking overlay via central footer button
      await page.evaluate(()=>{ const btn = document.querySelector('footer a.central-btn'); if (btn) btn.click(); });
  await page.waitForSelector('#bookingOverlayTitle', { timeout: 3000 });
      // ensure step1 injected
      await page.waitForSelector('#step1', { timeout: 3000 });
      // collect strings
      const out = await page.evaluate(()=>{
        const title = document.getElementById('bookingOverlayTitle') ? document.getElementById('bookingOverlayTitle').textContent.trim() : '';
        const stepIndicator = document.querySelector('#step1 .step-indicator') ? document.querySelector('#step1 .step-indicator').textContent.trim() : (document.querySelector('.cal-step-indicator') ? document.querySelector('.cal-step-indicator').textContent.trim() : '');
        const seatsLabel = document.querySelector('#step2 label[data-i18n="booking.seats"]') ? document.querySelector('#step2 label[data-i18n="booking.seats"]').textContent.trim() : '';
        const prefLangLabel = document.querySelector('#step2 label[data-i18n="booking.preferred_language"]') ? document.querySelector('#step2 label[data-i18n="booking.preferred_language"]').textContent.trim() : '';
        return { title, stepIndicator, seatsLabel, prefLangLabel };
      });
      // navigate to step2 by clicking Next
      await page.click('#s1Next');
      await page.waitForSelector('#step2', { visible: true, timeout: 3000 });
  // allow translations to apply
  await new Promise(r => setTimeout(r, 200));
      const step2Seats = await page.evaluate(()=>{ const lbl = document.querySelector('#step2 label[data-i18n="booking.seats"]'); return lbl ? lbl.textContent.trim() : ''; });
      const step2Pref = await page.evaluate(()=>{ const lbl = document.querySelector('#step2 label[data-i18n="booking.preferred_language"]'); return lbl ? lbl.textContent.trim() : ''; });
      results.push({ lang, initial: out, step2Seats, step2Pref });
    } catch (e) {
      results.push({ lang, error: String(e) });
    }
  }
  await browser.close();
  fs.writeFileSync('booking_i18n_verify.json', JSON.stringify(results, null, 2));
  console.log('Done, wrote booking_i18n_verify.json');
})();