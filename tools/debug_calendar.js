const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.message }));

  try {
    await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('footer a.central-btn', { timeout: 15000 });
    await page.click('footer a.central-btn');
    await page.waitForSelector('#bookingOverlay', { timeout: 15000 });

    // Wait a bit for main.js to inject step1 and flatpickr
    await page.waitForFunction(() => !!document.querySelector('#calendarFull'), { timeout: 15000 });

    // Collect diagnostics about calendar element and flatpickr
    const diag = await page.evaluate(() => {
      const ret = { flags: {}, nodes: {}, styles: {}, errors: [] };
      try { ret.flags.GW_DISABLE_BOOKING_CALENDAR = !!window.GW_DISABLE_BOOKING_CALENDAR; } catch(e) { ret.flags.GW_DISABLE_BOOKING_CALENDAR = 'unavailable'; }
      ret.flags.hasFlatpickr = !!(window.flatpickr);

      const overlay = document.getElementById('bookingOverlay');
      const step1 = document.getElementById('step1');
      const calInput = document.getElementById('calendarFull');
      const fp = document.querySelector('#bookingOverlay .flatpickr-calendar');
      ret.nodes.overlayActive = overlay && (overlay.classList.contains('active') || overlay.style.display !== 'none');
      ret.nodes.step1Exists = !!step1;
      ret.nodes.calInputExists = !!calInput;
      ret.nodes.fpExists = !!fp;

      function dumpComputed(el) {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          width: el.offsetWidth,
          height: el.offsetHeight,
          top: cs.top,
          left: cs.left,
          zIndex: cs.zIndex
        };
      }

      ret.styles.overlay = dumpComputed(overlay);
      ret.styles.overlayInner = dumpComputed(document.querySelector('#bookingOverlay .overlay-inner'));
      ret.styles.step1 = dumpComputed(step1);
      ret.styles.calendarCard = dumpComputed(step1 && step1.querySelector('.calendar-card'));
      ret.styles.calendarFull = dumpComputed(step1 && step1.querySelector('.calendar-full'));
      ret.styles.fp = dumpComputed(fp);

      // Check bounding rects
      const rects = {};
      try { rects.calendarFull = (step1 && step1.querySelector('.calendar-full')) ? step1.querySelector('.calendar-full').getBoundingClientRect() : null; } catch(e){}
      try { rects.fp = fp ? fp.getBoundingClientRect() : null; } catch(e){}
      ret.rects = rects;

      // Check input value (flatpickr should set defaultDate)
      ret.inputValue = calInput && calInput.value || '';

      return ret;
    });

    console.log('---CALENDAR_DEBUG_START---');
    console.log(JSON.stringify(diag, null, 2));
    console.log('---CALENDAR_DEBUG_END---');

    if (!diag.nodes.fpExists) {
      console.error('flatpickr-calendar element not found.');
      process.exitCode = 2;
    } else {
      // Save a screenshot
      await page.screenshot({ path: 'debug_calendar.png' });
      console.log('Saved debug_calendar.png');
    }
  } catch (e) {
    console.error('debug_calendar failed:', e && e.message ? e.message : e);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
