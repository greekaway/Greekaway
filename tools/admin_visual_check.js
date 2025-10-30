/*
Targeted visual run for admin pages (mobile + tablet only).
Checks:
- Breakpoints activate (card view on mobile, table headers visible on tablet)
- Sticky headers/filters work
- Floating buttons on mobile are fixed and near edges with tuned spacing
- No style leak between admin.html and admin-groups.html
*/

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function ensureServerStarted() {
  const url = BASE + '/admin.html';
  const timeoutMs = 15000;
  const start = Date.now();
  // Try quick probe first
  try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok || r.status >= 200) return null; } catch(_) {}
  // Spawn server
  const child = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: process.env, stdio: 'ignore', detached: true });
  // Poll until reachable or timeout
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok || (r.status >= 200 && r.status < 600)) return child;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  // Timed out
  try { process.kill(-child.pid); } catch(_) {}
  throw new Error('Server did not start within timeout');
}

async function loginAdmin(page){
  // Show main panels without requiring actual backend auth
  await page.type('#user', 'admin');
  await page.type('#pass', 'x');
  await page.click('#login');
  await page.waitForSelector('#main', { visible: true, timeout: 3000 }).catch(()=>{});
}

async function checkMobileAdmin(page){
  const res = { page: 'admin-payments.html', viewport: 'mobile', checks: {} };
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true });
  await page.goto(BASE + '/admin-payments.html', { waitUntil: 'domcontentloaded' });
  await loginAdmin(page);

  // Breakpoint: card view => thead hidden
  res.checks.cardViewPayments = await page.evaluate(() => {
    const th = document.querySelector('#paymentsTable thead');
    if (!th) return false;
    return getComputedStyle(th).display === 'none';
  });

  // Sticky header area: accept either page h2 or the unified payments sticky bar
  res.checks.stickyHeader = await page.evaluate(() => {
    const h2 = document.querySelector('h2');
    const bar = document.querySelector('#paymentsStickyBar');
    const h2Sticky = h2 && getComputedStyle(h2).position === 'sticky';
    const barSticky = bar && getComputedStyle(bar).position === 'sticky';
    return !!(h2Sticky || barSticky);
  });
  res.checks.stickyFilters = await page.evaluate(() => {
    const f = document.querySelector('#filters');
    return !!f && getComputedStyle(f).position === 'sticky';
  });

  // Floating action button (Export Payments)
  res.checks.fabFixed = await page.evaluate(() => {
    const btn = document.querySelector('#exportPayments');
    if (!btn) return false;
    const cs = getComputedStyle(btn);
    return cs.position === 'fixed';
  });
  res.checks.fabEdge = await page.evaluate(() => {
    const btn = document.querySelector('#exportPayments');
    if (!btn) return false;
    const cs = getComputedStyle(btn);
    // 0.8rem ≈ 12.8px; allow range 8–24px to account for font-size differences
    const right = parseFloat(cs.right) || 0;
    const bottom = parseFloat(cs.bottom) || 0;
    return right >= 8 && right <= 24 && bottom >= 8 && bottom <= 24;
  });

  return res;
}

async function checkTabletAdmin(page){
  const res = { page: 'admin-payments.html', viewport: 'tablet', checks: {} };
  await page.setViewport({ width: 800, height: 1024, deviceScaleFactor: 2 });
  await page.goto(BASE + '/admin-payments.html', { waitUntil: 'domcontentloaded' });
  await loginAdmin(page);

  // Breakpoint: tablet layout => thead visible (table-header-group)
  res.checks.tableHeadersVisible = await page.evaluate(() => {
    const th = document.querySelector('#paymentsTable thead');
    const hint = document.querySelector('#paymentsColumnsHint');
    const thVisible = th && getComputedStyle(th).display !== 'none';
    const hintVisible = !!(hint && getComputedStyle(hint).display !== 'none');
    // Accept either real thead or sticky hint as header representation
    return thVisible || hintVisible;
  });
  // Floating buttons back to normal flow
  res.checks.fabStatic = await page.evaluate(() => {
    const btn = document.querySelector('#exportPayments');
    if (!btn) return false;
    const cs = getComputedStyle(btn);
    return cs.position === 'static';
  });
  // Horizontal scroll allowed on container
  res.checks.horizontalScroll = await page.evaluate(() => {
    const cont = document.querySelector('#paymentsContainer');
    if (!cont) return false;
    return getComputedStyle(cont).overflowX !== 'visible';
  });
  return res;
}

async function checkMobilePartners(page){
  const res = { page: 'admin-groups.html', viewport: 'mobile', checks: {} };
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true });
  await page.goto(BASE + '/admin-groups.html', { waitUntil: 'domcontentloaded' });

  // No leakage of admin-main base margin/background
  res.checks.noAdminMainMargin = await page.evaluate(() => {
    // if admin-base.css leaked, body margin-left would be 20px
    const ml = getComputedStyle(document.body).marginLeft;
    return ml === '0px';
  });

  // Header fixed (partners page design)
  res.checks.headerFixed = await page.evaluate(() => {
    const h = document.querySelector('header');
    if (!h) return false;
    return getComputedStyle(h).position === 'fixed';
  });

  return res;
}

async function checkTabletPartners(page){
  const res = { page: 'admin-groups.html', viewport: 'tablet', checks: {} };
  await page.setViewport({ width: 800, height: 1024, deviceScaleFactor: 2 });
  await page.goto(BASE + '/admin-groups.html', { waitUntil: 'domcontentloaded' });

  // Ensure partners grid present (layout specific to this page)
  res.checks.columnsGrid = await page.evaluate(() => {
    const el = document.querySelector('.columns');
    if (!el) return false;
    return getComputedStyle(el).display === 'grid';
  });

  // Confirm admin-main styles didn't leak (still zero margin)
  res.checks.noAdminMainMargin = await page.evaluate(() => {
    const ml = getComputedStyle(document.body).marginLeft;
    return ml === '0px';
  });

  return res;
}

(async function addBookingsChecks(){})();

async function checkTabletBookings(page){
  const res = { page: 'admin.html', viewport: 'tablet', checks: {} };
  await page.setViewport({ width: 1180, height: 900, deviceScaleFactor: 2 });
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await loginAdmin(page);
  // Wait for table to render (real or demo row)
  await page.waitForSelector('#bookingsTable tbody tr', { timeout: 12000 }).catch(()=>{});
  // Ensure hint header is present (we hide the real thead on desktop in cleanup.css)
  await page.waitForSelector('#bookingsHintTable thead th', { timeout: 12000 }).catch(()=>{});
  // Give layout sync a moment (hint widths are measured from first row)
  await new Promise(r => setTimeout(r, 400));

  // Helper in page context: compare centers of header vs body cells for selected columns
  const alignment = await page.evaluate(() => {
    const head = document.querySelectorAll('#bookingsHintTable thead th');
    const row = document.querySelector('#bookingsTable tbody tr');
    if (!head || !row) return null;
    const tds = row.querySelectorAll('td');
    const pick = [2,4,5,8,9,10,11,12,13,14]; // 1-based columns to compare
    const res = {};
    for (const idx of pick) {
      const th = head[idx-1]; const td = tds[idx-1];
      if (!th || !td) { res['col'+idx] = false; continue; }
      const brTh = th.getBoundingClientRect();
      const brTd = td.getBoundingClientRect();
      const cxTh = (brTh.left + brTh.right) / 2;
      const cxTd = (brTd.left + brTd.right) / 2;
      res['col'+idx] = Math.abs(cxTh - cxTd) <= 2.0; // within 2px tolerance
    }
    // Header text centered
    const centered = Array.from(head).every(h => getComputedStyle(h).textAlign === 'center');
    // Partner columns spacing: ensure decent widths
    const w12 = head[11]?.getBoundingClientRect().width || 0;
    const w13 = head[12]?.getBoundingClientRect().width || 0;
    const w14 = head[13]?.getBoundingClientRect().width || 0;
    res.minWidthsOk = (w12 >= 120 && w13 >= 120 && w14 >= 120);
    // Payment Type not overlapping Partner: ensure a small gap between header cell boxes
    const r11 = head[10]?.getBoundingClientRect();
    const r12 = head[11]?.getBoundingClientRect();
    res.paymentTypeNotOverlap = r11 && r12 ? (r11.right + 2 <= r12.left) : false;
    res.centeredHeaders = centered;
    return res;
  });

  if (!alignment) {
    res.checks.rendered = false;
    return res;
  }

  // Map checks
  res.checks.colAfterStatusAligned = alignment.col2;
  res.checks.eventCentered = alignment.col4; // center alignment match for Event column
  res.checks.nameAligned = alignment.col5;
  res.checks.seatsAligned = alignment.col8;
  res.checks.priceAligned = alignment.col9;
  res.checks.createdAligned = alignment.col10;
  res.checks.paymentTypeAligned = alignment.col11;
  res.checks.partnerColumnsSpaced = alignment.minWidthsOk;
  res.checks.paymentTypeNotOverlap = alignment.paymentTypeNotOverlap;
  res.checks.headersCentered = alignment.centeredHeaders;

  return res;
}

(async () => {
  // Start or reuse server
  let child = null;
  try { child = await ensureServerStarted(); } catch (e) { console.error('Server start failed:', e.message); process.exit(3); }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const results = [];

  try {
    results.push(await checkMobileAdmin(page));
    results.push(await checkTabletAdmin(page));
    results.push(await checkMobilePartners(page));
    results.push(await checkTabletPartners(page));
    results.push(await checkTabletBookings(page));
  } catch (e) {
    console.error('Error during visual checks:', e);
    await browser.close();
    process.exit(2);
  }

  await browser.close();
  // Stop spawned server if we started one
  if (child && child.pid) {
    try { process.kill(-child.pid); } catch(_) {}
  }

  // Summarize
  let ok = true;
  for (const r of results) {
    for (const [k, v] of Object.entries(r.checks)) {
      if (!v) ok = false;
    }
  }

  console.log('Admin targeted visual run results:');
  for (const r of results) {
    console.log(`\n${r.page} @ ${r.viewport}`);
    for (const [k, v] of Object.entries(r.checks)) {
      console.log(`  ${k}: ${v ? 'PASS' : 'FAIL'}`);
    }
  }

  if (!ok) {
    console.log('\nOverall: FAIL');
    process.exit(1);
  } else {
    console.log('\nOverall: PASS');
    process.exit(0);
  }
})();
