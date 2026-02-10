const sharp = require('sharp');
const path = require('path');
const src = path.join(__dirname, '..', 'moveathens', 'videos', 'hero-logo.png');
const outDir = path.join(__dirname, '..', 'moveathens', 'icons');

(async () => {
  const meta = await sharp(src).metadata();
  const size = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - size) / 2);
  const top = Math.floor((meta.height - size) / 2);

  const squareBuffer = await sharp(src)
    .extract({ left, top, width: size, height: size })
    .toBuffer();

  await sharp(squareBuffer).resize(32, 32).png().toFile(path.join(outDir, 'favicon-32x32.png'));
  console.log('Created favicon-32x32.png');

  await sharp(squareBuffer).resize(16, 16).png().toFile(path.join(outDir, 'favicon-16x16.png'));
  console.log('Created favicon-16x16.png');

  await sharp(squareBuffer).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  await sharp(squareBuffer).resize(192, 192).png().toFile(path.join(outDir, 'favicon-192x192.png'));
  console.log('Created favicon-192x192.png');

  console.log('All favicons generated!');
})();
