#!/usr/bin/env node
/**
 * MoveAthens – Multi-Viewport Responsive Screenshot Test
 * Tests all pages across 24 real device viewports (phones, tablets, desktops).
 * Checks: horizontal overflow, hidden buttons, footer clipping.
 * Results → reports/moveathens-responsive/
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

const VIEWPORTS = [
  // ── PHONES ──
  { name: 'Small-Android-320',   w: 320,  h: 568,  dpr: 2, mobile: true  },
  { name: 'iPhone-SE',           w: 375,  h: 667,  dpr: 2, mobile: true  },
  { name: 'iPhone-12-mini',      w: 375,  h: 812,  dpr: 3, mobile: true  },
  { name: 'Samsung-Galaxy-S24',  w: 360,  h: 780,  dpr: 3, mobile: true  },
  { name: 'Samsung-Galaxy-S21',  w: 360,  h: 800,  dpr: 3, mobile: true  },
  { name: 'iPhone-13-14',        w: 390,  h: 844,  dpr: 3, mobile: true  },
  { name: 'iPhone-14-Pro',       w: 393,  h: 852,  dpr: 3, mobile: true  },
  { name: 'Xiaomi-Redmi-Note13', w: 393,  h: 873,  dpr: 2.75, mobile: true },
  { name: 'Pixel-7',             w: 412,  h: 915,  dpr: 2.6, mobile: true },
  { name: 'Samsung-A54',         w: 412,  h: 915,  dpr: 2.6, mobile: true },
  { name: 'iPhone-15-Pro-Max',   w: 430,  h: 932,  dpr: 3, mobile: true  },
  { name: 'iPhone-16-Pro-Max',   w: 440,  h: 956,  dpr: 3, mobile: true  },
  { name: 'Pixel-8-Pro',         w: 448,  h: 998,  dpr: 3, mobile: true  },
  { name: 'Galaxy-Z-Fold',       w: 280,  h: 653,  dpr: 3, mobile: true  },

  // ── TABLETS ──
  { name: 'iPad-Mini',           w: 768,  h: 1024, dpr: 2, mobile: true  },
  { name: 'Samsung-Tab-S9',      w: 800,  h: 1280, dpr: 2, mobile: true  },
  { name: 'iPad-Air',            w: 820,  h: 1180, dpr: 2, mobile: true  },
  { name: 'iPad-Pro-11',         w: 834,  h: 1194, dpr: 2, mobile: true  },
  { name: 'iPad-Pro-12.9',       w: 1024, h: 1366, dpr: 2, mobile: true  },
  { name: 'iPad-Landscape',      w: 1024, h: 768,  dpr: 2, mobile: true  },

  // ── DESKTOPS ──
  { name: 'Laptop-1366x768',     w: 1366, h: 768,  dpr: 1, mobile: false },
  { name: 'MacBook-Air-13',      w: 1440, h: 900,  dpr: 2, mobile: false },
  { name: 'Desktop-1920x1080',   w: 1920, h: 1080, dpr: 1, mobile: false },
  { name: 'iMac-27-5K',          w: 2560, h: 1440, dpr: 2, mobile: false },
];

const PAGES = [
  { name: 'welcome',      path: '/moveathens/' },
  { name: 'transfer',     path: '/moveathens/transfer' },
  { name: 'info',         path: '/moveathens/info' },
  { name: 'contact',      path: '/moveathens/contact' },
  { name: 'prices',       path: '/moveathens/prices' },
  { name: 'ai-assistant', path: '/moveathens/assistant' },
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

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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

    // Bypass auth gate
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('moveathens_hotel', JSON.stringify({
        slug: 'test-hotel', name: 'Test Hotel', phone: '+30123456789'
      }));
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

        // Check footer visibility
        const footerIssue = await page.evaluate(() => {
          const footer = document.querySelector('.ma-footer, [data-ma-footer]');
          if (!footer) return null;
          const rect = footer.getBoundingClientRect();
          const vh = window.innerHeight;
          if (rect.bottom > vh + 50) {
            return `Footer clipped: bottom=${Math.round(rect.bottom)}px > viewport=${vh}px`;
          }
          return null;
        });
        if (footerIssue) {
          issues.push({ page: pg.name, viewport: vp.name, problems: [footerIssue] });
        }

        // Check for zero-size visible buttons (skip buttons inside hidden parents)
        const btnIssues = await page.evaluate(() => {
          const problems = [];
          document.querySelectorAll('button, a.ma-button, .ma-cta-btn, .ma-footer__item, .ma-payment-btn').forEach(el => {
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return;
            // Skip if any ancestor is hidden (display:none, hidden attr, inactive step)
            let hidden = false;
            let parent = el.parentElement;
            while (parent && parent !== document.body) {
              const ps = getComputedStyle(parent);
              if (ps.display === 'none' || ps.visibility === 'hidden' || parent.hasAttribute('hidden')) {
                hidden = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (hidden) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              const tag = el.tagName.toLowerCase();
              const cls = (el.className || '').toString().split(' ')[0];
              problems.push(`Zero-size button: ${tag}.${cls}`);
            }
          });
          return problems;
        });
        if (btnIssues.length > 0) {
          issues.push({ page: pg.name, viewport: vp.name, problems: btnIssues });
        }

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
