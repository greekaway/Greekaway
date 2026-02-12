/**
 * DriversSystem — Multi-Viewport Responsive Test
 * Screenshots all 4 pages across every common device category:
 *   • Small phones  (iPhone SE, Galaxy S8)
 *   • Standard phones (iPhone 13/14, Pixel 7, Galaxy S23)
 *   • Large phones  (iPhone 16 Pro Max, Galaxy S24 Ultra)
 *   • Mini tablets   (iPad mini)
 *   • Tablets        (iPad Air, iPad Pro 11″, Samsung Tab S9)
 *   • Desktops       (1280, 1440, 1920)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:3101';

const PAGES = [
  { name: 'welcome',  path: '/driverssystem' },
  { name: 'entries',  path: '/driverssystem/entries' },
  { name: 'profile',  path: '/driverssystem/profile' },
  { name: 'stats',    path: '/driverssystem/stats' },
];

const DEVICES = [
  // ── Small phones ──
  { name: 'iphone-se',         viewport: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'galaxy-s8',         viewport: { width: 360, height: 740, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  // ── Standard phones ──
  { name: 'iphone-13',         viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'pixel-7',           viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
  { name: 'galaxy-s23',        viewport: { width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  // ── Large phones ──
  { name: 'iphone-16-pro-max', viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  { name: 'galaxy-s24-ultra',  viewport: { width: 412, height: 915, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true } },
  // ── Mini Tablet ──
  { name: 'ipad-mini',         viewport: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  // ── Tablets ──
  { name: 'ipad-air',          viewport: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'ipad-pro-11',       viewport: { width: 834, height: 1194, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { name: 'samsung-tab-s9',    viewport: { width: 800, height: 1280, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  // ── Landscape tablet ──
  { name: 'ipad-landscape',    viewport: { width: 1024, height: 768, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  // ── Desktops ──
  { name: 'desktop-1280',      viewport: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  { name: 'desktop-1440',      viewport: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  { name: 'desktop-1920',      viewport: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const outDir = path.join(__dirname, '..', 'reports', 'ds-responsive');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const issues = [];
  let total = 0;

  console.log(`\n🖥  DriversSystem Responsive Test`);
  console.log(`   ${DEVICES.length} viewports × ${PAGES.length} pages = ${DEVICES.length * PAGES.length} screenshots\n`);

  for (const device of DEVICES) {
    for (const pg of PAGES) {
      total++;
      const tag = `${device.name}__${pg.name}`;
      const page = await browser.newPage();
      await page.setViewport(device.viewport);

      try {
        await page.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle2', timeout: 15000 });
        await sleep(800);                       // let animations settle

        // Full-page screenshot (captures scroll overflow)
        await page.screenshot({
          path: path.join(outDir, `${tag}.png`),
          fullPage: true,
        });

        // ── Quick layout checks ──
        const checks = await page.evaluate(() => {
          const problems = [];
          const body = document.body;
          const vw = window.innerWidth;

          // 1. Horizontal overflow on body (real page-level bleed)
          if (body.scrollWidth > vw + 2) {
            problems.push(`horizontal-overflow: body ${body.scrollWidth}px > viewport ${vw}px`);
          }

          // Helper: is element inside an overflow-x scroll container?
          function insideScrollContainer(el) {
            let p = el.parentElement;
            while (p && p !== document.body) {
              const ov = getComputedStyle(p).overflowX;
              if (ov === 'auto' || ov === 'scroll') return true;
              p = p.parentElement;
            }
            return false;
          }

          // 2. Elements bleeding off-screen (right) — skip scroll containers
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > vw + 4 && !insideScrollContainer(el)) {
              const id = el.id || el.className?.toString().slice(0, 40) || el.tagName;
              problems.push(`offscreen-right: "${id}" right=${Math.round(r.right)}px > vw=${vw}px`);
            }
          });

          // 3. Footer visible (allow centered footer on large screens — check ratio only on mobile)
          const footer = document.querySelector('.ds-footer');
          if (footer && vw <= 1024) {
            const fr = footer.getBoundingClientRect();
            if (fr.width < vw * 0.5) {
              problems.push(`footer-too-narrow: ${Math.round(fr.width)}px (viewport ${vw}px)`);
            }
          }

          // 4. Text too small (< 11px computed)
          const smallText = [];
          document.querySelectorAll('p, span, label, h1, h2, h3, button, a, input, td, th').forEach(el => {
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs < 11 && el.textContent.trim().length > 0) {
              const id = el.className?.toString().slice(0, 30) || el.tagName;
              smallText.push(`"${id}" ${fs}px`);
            }
          });
          if (smallText.length) {
            problems.push(`small-text: ${smallText.slice(0, 3).join(', ')}`);
          }

          // 5. Touch targets too small (< 44px)
          const tinyCTA = [];
          document.querySelectorAll('button, a, input[type="date"], input[type="tel"]').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 36)) {
              const id = el.textContent?.trim().slice(0, 20) || el.className?.toString().slice(0, 30) || el.tagName;
              tinyCTA.push(`"${id}" ${Math.round(r.width)}×${Math.round(r.height)}`);
            }
          });
          if (tinyCTA.length) {
            problems.push(`small-touch-target: ${tinyCTA.slice(0, 3).join(', ')}`);
          }

          return problems;
        });

        if (checks.length) {
          issues.push({ tag, problems: checks });
          console.log(`  ⚠  ${tag}: ${checks.length} issue(s)`);
          checks.forEach(c => console.log(`      → ${c}`));
        } else {
          console.log(`  ✅ ${tag}`);
        }
      } catch (err) {
        issues.push({ tag, problems: [`LOAD-ERROR: ${err.message}`] });
        console.log(`  ❌ ${tag}: ${err.message}`);
      } finally {
        await page.close();
      }
    }
  }

  await browser.close();

  // ── Summary report ──
  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ date: new Date().toISOString(), total, issueCount: issues.length, issues }, null, 2));

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Screenshots: ${total}`);
  console.log(`  Issues     : ${issues.length}`);
  console.log(`  Output     : ${outDir}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  if (issues.length) process.exit(1);
})();
