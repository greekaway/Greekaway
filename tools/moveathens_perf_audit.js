/**
 * MoveAthens Performance Audit
 * Measures page load metrics for all key pages
 */
const puppeteer = require("puppeteer");

const BASE = "http://127.0.0.1:3000";
const PAGES = [
  { name: "welcome", path: "/moveathens/" },
  { name: "transfer", path: "/moveathens/transfer" },
  { name: "info", path: "/moveathens/info" },
  { name: "ai-assistant", path: "/moveathens/assistant" },
];

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });

  for (const pg of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });

    // Bypass auth gate
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("moveathens_hotel", JSON.stringify({
        slug: "test-hotel", name: "Test Hotel", phone: "+30123456789"
      }));
    });

    const start = Date.now();
    const responses = [];
    page.on("response", (r) => {
      const h = r.headers();
      responses.push({
        url: r.url().replace(BASE, ""),
        status: r.status(),
        size: h["content-length"] || "?",
        type: (h["content-type"] || "").split(";")[0],
        encoding: h["content-encoding"] || "none",
      });
    });

    await page.goto(BASE + pg.path, { waitUntil: "networkidle0", timeout: 30000 });
    const wallTime = Date.now() - start;

    const perf = await page.evaluate(() => {
      const t = performance.timing;
      const paints = performance.getEntriesByType("paint");
      const fp = paints.find((e) => e.name === "first-paint");
      const fcp = paints.find((e) => e.name === "first-contentful-paint");
      return {
        domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
        load: t.loadEventEnd - t.navigationStart,
        fp: fp ? Math.round(fp.startTime) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
      };
    });

    const css = responses.filter((r) => r.type.includes("css"));
    const js = responses.filter((r) => r.type.includes("javascript"));
    const img = responses.filter((r) => r.type.includes("image"));
    const vid = responses.filter((r) => r.type.includes("video"));
    const compressed = responses.filter((r) => r.encoding !== "none");

    console.log(`\n===== ${pg.name.toUpperCase()} (${pg.path}) =====`);
    console.log(`  Wall time:         ${wallTime}ms`);
    console.log(`  DOMContentLoaded:  ${perf.domContentLoaded}ms`);
    console.log(`  Load event:        ${perf.load}ms`);
    console.log(`  First Paint:       ${perf.fp ?? "N/A"}ms`);
    console.log(`  FCP:               ${perf.fcp ?? "N/A"}ms`);
    console.log(`  Total requests:    ${responses.length}`);
    console.log(`    CSS: ${css.length}  JS: ${js.length}  IMG: ${img.length}  VID: ${vid.length}`);
    console.log(`  Compressed (gzip): ${compressed.length} / ${responses.length}`);

    // Show render-blocking resources (CSS, sync JS)
    const renderBlocking = [...css, ...js.filter((r) => !r.url.includes("async"))];
    if (renderBlocking.length > 0) {
      console.log("  Render-blocking resources:");
      for (const r of renderBlocking) {
        console.log(`    ${r.url} (${r.size} bytes, ${r.encoding})`);
      }
    }

    // Show large assets (>50KB)
    const large = responses.filter((r) => parseInt(r.size) > 50000);
    if (large.length > 0) {
      console.log("  Large assets (>50KB):");
      for (const r of large) {
        console.log(`    ${r.url} (${(parseInt(r.size) / 1024).toFixed(1)}KB, ${r.encoding})`);
      }
    }

    await page.close();
  }

  await browser.close();
  console.log("\n✅ Performance audit complete");
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
