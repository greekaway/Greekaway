const puppeteer = require('puppeteer');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Start server.js in background
const server = cp.spawn('node', ['server.js'], { stdio: 'inherit', env: process.env });
console.log('Started server (PID:', server.pid, ')');

(async () => {
  const framesDir = path.join(__dirname, 'frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 900 });
  const sleep = (ms) => new Promise(res => setTimeout(res, ms));
  try {
    await page.goto('http://localhost:3000/trips/trip.html?id=olympia', { waitUntil: 'networkidle2' });
    await page.waitForSelector('footer a.central-btn', { timeout: 5000 });
    await page.click('footer a.central-btn');
    await page.waitForSelector('#bookingOverlay .overlay-inner', { timeout: 5000 });
    await sleep(600);
    // capture several frames while the calendar is visible
    for (let i=0;i<8;i++) { await page.screenshot({ path: path.join(framesDir, `frame_${String(i).padStart(3,'0')}.png`) }); await sleep(120); }
    await page.click('#s1Next');
    await page.waitForSelector('#step2 .step-card', { timeout: 5000 });
    await sleep(400);
    for (let i=8;i<18;i++) { await page.screenshot({ path: path.join(framesDir, `frame_${String(i).padStart(3,'0')}.png`) }); await sleep(120); }
    await page.click('#step2 .seat-inc');
    await sleep(250);
    await page.type('#bookingEmail2', 'jane.smith@example.com');
    await sleep(300);
    for (let i=18;i<28;i++) { await page.screenshot({ path: path.join(framesDir, `frame_${String(i).padStart(3,'0')}.png`) }); await sleep(120); }
    await page.click('#s2Next');
    await page.waitForSelector('#step3', { timeout: 5000 });
    await sleep(300);
    for (let i=28;i<36;i++) { await page.screenshot({ path: path.join(framesDir, `frame_${String(i).padStart(3,'0')}.png`) }); await sleep(120); }
    console.log('Frames captured to', framesDir);
    // Build mp4 via ffmpeg (requires ffmpeg installed)
    const out = path.join(__dirname, '..', 'booking_flow.mp4');
    const ff = cp.spawn('ffmpeg', ['-y','-framerate','12','-i', path.join(framesDir,'frame_%03d.png'), '-c:v','libx264','-pix_fmt','yuv420p', out], { stdio: 'inherit' });
    ff.on('close', (code) => {
      console.log('ffmpeg exited', code, 'output:', out);
      browser.close().then(()=>{
        // kill server
        try { process.kill(server.pid); } catch(e){}
        process.exit(code);
      });
    });
  } catch (e) {
    console.error('Recording failed', e);
    try { process.kill(server.pid); } catch(e){}
    await browser.close();
    process.exit(2);
  }
})();
