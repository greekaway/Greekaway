#!/usr/bin/env node
/**
 * Convert /public/images/logo.png to a high-quality WebP (~150–200 KB target).
 * Uses sharp to encode near-lossless WebP with a size heuristic.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const sharp = require('sharp');
  const root = path.resolve(__dirname, '..');
  const pngPath = path.join(root, 'public', 'images', 'logo.png');
  const webpPath = path.join(root, 'public', 'images', 'logo.webp');

  if (!fs.existsSync(pngPath)) {
    console.error('Logo PNG not found at', pngPath);
    process.exit(1);
  }

  // Strategy: iterate a matrix of widths and qualities (lossy WebP) to land around 150–200 KB
  const minKB = 150, maxKB = 200;
  // Prefer larger widths first (crisper), then reduce if we overshoot size too much
  const widths = [2048, 1800, 1600, 1400, 1280, 1200, 1100, 1024, 960, 900, 840, 800, 760, 720];
  const qualities = [95, 92, 90, 88, 86, 84, 82, 80, 78, 76, 74, 72];

  let bestCandidate = null; // store closest over minKB, else smallest

  for (const w of widths) {
    for (const q of qualities) {
      const buf = await sharp(pngPath)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: q, effort: 5 })
        .toBuffer();
      const sizeKB = Math.round(buf.length / 1024);
      console.log(`Trial width=${w} q=${q} -> ${sizeKB} KB`);
      if (sizeKB >= minKB && sizeKB <= maxKB) {
        fs.writeFileSync(webpPath, buf);
        console.log(`Created logo.webp at width=${w} quality=${q} -> ${sizeKB} KB`);
        return;
      }
      // Track best candidate: prefer closest above minKB, otherwise the largest below minKB
      if (!bestCandidate) {
        bestCandidate = { buf, sizeKB, w, q };
      } else {
        const betterAbove = (bestCandidate.sizeKB < minKB && sizeKB >= minKB) ||
                            (sizeKB >= minKB && sizeKB < bestCandidate.sizeKB);
        const betterBelow = (sizeKB < minKB && sizeKB > bestCandidate.sizeKB && bestCandidate.sizeKB < minKB);
        if (betterAbove || betterBelow) bestCandidate = { buf, sizeKB, w, q };
      }
    }
  }

  if (bestCandidate) {
    fs.writeFileSync(webpPath, bestCandidate.buf);
    console.log(`Created logo.webp (best candidate) at width=${bestCandidate.w} quality=${bestCandidate.q} -> ${bestCandidate.sizeKB} KB`);
  } else {
    // As a last resort, write a mid setting
    const buf = await sharp(pngPath).webp({ quality: 85 }).toBuffer();
    fs.writeFileSync(webpPath, buf);
    console.log(`Created logo.webp (fallback default) -> ${Math.round(buf.length/1024)} KB`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
