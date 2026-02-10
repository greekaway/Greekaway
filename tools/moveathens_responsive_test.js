#!/usr/bin/env node
/**
 * MoveAthens – Multi-Viewport Responsive Screenshot Test
 * Tests all pages across real device viewports:
 *   - iPhone SE (375×667)
 *   - iPhone 14 (390×844)
 *   - iPhone 15 Pro Max (430×932)
 *   - Samsung Galaxy S21 (360×800)
 *   - Samsung Galaxy Z Fold (280×653 folded)
 *   - iPad Mini (768×1024)
 *   - iPad Air (820×1180)
 *   - iPad Pro 12.9 (1024×1366)
 *   - Desktop HD (1440×900)
 *   - Desktop 4K (1920×1080)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3101';

const VIEWPORTS = [
  { name: 'iPhone-SE',          w: 375,  h: 667,  dpr: 2, mobile: true },
  { name: 'iPhone-14',          w: 390,  h: 844,  dpr: 3, mobile: true },
  { name: 'iPhone-15-Pro-Max',  w: 430,  h: 932,  dpr: 3, mobile: true },
  { name: 'Samsung-Galaxy-S21', w: 360,  h: 800,  dpr: 3, mobile: true },
  { name: 'Galaxy-Z-Fold',      w: 280,  h: 653,  dpr: 3, mobile: true },
  { name: 'iPad-Mini',          w: 768,  h: 1024, dpr: 2, mobile: true },
  { name: 'iPad-Air',           w: 820,  h: 1180, dpr: 2, mobile: true },
  { name: 'iPad-Pro-12.9',      w: 1024, h: 1366, dpr: 2, mobile: true },
  { name: 'Desktop-HD',         w: 1440, h: 900,  dpr: 1, mobile: false },
  { name: 'Desktop-4K',         w: 1920, h: 1080, dpr: 1, mobile: false },
];

const PAGES = [
  { name: 'welcome',     path: '/moveathens/pages/welcome.html' },
  { name: 'transfer',    path: '/moveathens/pages/transfer.html' },
  { name: 'info',        path: '/moveathens/pages/info.html' },
  { name: 'contact',     path: '/moveathens/pages/contact.html' },
  { name: 'prices',      path: '/moveathens/pages/prices.html' },
  { name: 'ai-assistant',path: '/moveathens/pages/ai-assistant.html' },
];

const outDir = path.join(__dirname, '..', 'reports', 'moveathens-responsive');
fs.mkdirSync(outDir, { recursive: true });

const issues = [];

async function checkOverflow(page, viewport, pageName) {
  const result = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const overflows = [];

    // Check horizontal overflow
    if (body.scrollWidth > html.clientWidth + 2) {
      overflows.push(`Body horizontal overflow: scrollWidth=${body.scrollWidth} vs clientWidth=${html.clientWidth}`);
    }

    // Check elements overflowing viewport
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > html.clientWidth + 5) {
        // Skip elements inside scrollable containers (overflow-x: auto/scroll)
        let isInsideScrollable = false;
        let parent = el.parentElement;
        while (parent && parent !== body) {
          const style = getComputedStyle(parent);
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
            isInsideScrollable = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (isInsideScrollable) continue;

        const tag = el.tagName.toLowerCase();
        const cls = el.className ? `.${String(el.className).split(' ').join('.')}` : '';
        overflows.push(`${tag}${cls} overflows right by ${Math.round(rect.right - html.clientWidth)}px`);
        if (overflows.length >= 5) break;
      }
    }
    return overflows;
  });

  if (result.length > 0) {
    issues.push({ page: pageName, viewport: viewport.name, problems: result });
  }
  return result;
}

(async () => {
  console.log('🚀 MoveAthens Responsive Test\n');
  console.log(`   Pages:    ${PAGES.length}`);
  console.log(`   Viewports: ${VIEWPORTS.length}`);
  console.log(`   Total screenshots: ${PAGES.length * VIEWPORTS.length}\n`);

  const browser = await puppeteer.launch({ headless: 'new' });

  for (const vp of VIEWPORTS) {
    const vpDir = path.join(outDir, vp.name);
    fs.mkdirSync(vpDir, { recursive: true });

    const page = await browser.newPage();
    await page.setViewport({
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    });

    for (const pg of PAGES) {
      const url = `${BASE}${pg.path}`;
      process.stdout.write(`  📸 ${vp.name} / ${pg.name} ...`);

      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(r => setTimeout(r, 800));

        // Take screenshot
        const file = path.join(vpDir, `${pg.name}.png`);
        await page.screenshot({ path: file, fullPage: true });

        // Check for overflow issues
        const overflows = await checkOverflow(page, vp, pg.name);
        if (overflows.length > 0) {
          console.log(` ⚠️  ${overflows.length} overflow issue(s)`);
        } else {
          console.log(' ✅');
        }
      } catch (err) {
        console.log(` ❌ ${err.message}`);
        issues.push({ page: pg.name, viewport: vp.name, problems: [`Load error: ${err.message}`] });
      }
    }

    await page.close();
  }

  await browser.close();

  // Print report
  console.log('\n' + '='.repeat(60));
  console.log('📋 RESPONSIVE AUDIT REPORT');
  console.log('='.repeat(60));

  if (issues.length === 0) {
    console.log('\n✅ ALL CLEAR – no overflow or layout issues detected!');
  } else {
    console.log(`\n⚠️  Found issues in ${issues.length} viewport/page combinations:\n`);
    for (const issue of issues) {
      console.log(`  📱 ${issue.viewport} – ${issue.page}`);
      for (const p of issue.problems) {
        console.log(`     • ${p}`);
      }
    }
  }

  // Save report as JSON
  const report = {
    timestamp: new Date().toISOString(),
    viewports: VIEWPORTS.map(v => `${v.name} (${v.w}×${v.h})`),
    pages: PAGES.map(p => p.name),
    issues,
    totalScreenshots: PAGES.length * VIEWPORTS.length,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

  console.log(`\n📁 Screenshots saved to: reports/moveathens-responsive/`);
  console.log(`📄 Report saved to: reports/moveathens-responsive/report.json\n`);

  process.exit(issues.length > 0 ? 1 : 0);
})();
