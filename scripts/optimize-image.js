const fs = require('fs');
const path = require('path');

async function run() {
  const sharp = require('sharp');
  const src = path.join(__dirname, '..', 'media', 'pystacker.png');
  const outPngTmp = path.join(__dirname, '..', 'media', 'pystacker.optimized.png');
  const outPng = path.join(__dirname, '..', 'media', 'pystacker.png'); // final target (will be overwritten)
  const outWebP = path.join(__dirname, '..', 'media', 'pystacker.webp');
  const outReadmePngTmp = path.join(__dirname, '..', 'media', 'pystacker-readme.optimized.png');
  const outReadmePng = path.join(__dirname, '..', 'media', 'pystacker-readme.png');
  const outReadmeWebP = path.join(__dirname, '..', 'media', 'pystacker-readme.webp');

  if (!fs.existsSync(src)) {
    console.error('Source image not found:', src);
    process.exit(1);
  }

  try {
    const metadata = await sharp(src).metadata();
    console.log('Original image:', metadata.format, metadata.width + 'x' + metadata.height, (metadata.size || 'unknown') + ' bytes');

  // Resize to a sensible max width for the main PNG
  const targetWidthMain = 1200;
  const transformerMain = sharp(src).resize({ width: Math.min(targetWidthMain, metadata.width || targetWidthMain), withoutEnlargement: true });

  // Write optimized PNG to a temporary file then replace the original
  await transformerMain.png({ quality: 90, compressionLevel: 9, adaptiveFiltering: true }).toFile(outPngTmp);
  fs.renameSync(outPngTmp, outPng);
  const statPng = fs.statSync(outPng);

  // Write WebP (smaller) as an additional artifact
  await transformerMain.webp({ quality: 85 }).toFile(outWebP);
  const statWebp = fs.statSync(outWebP);

  // Also create a reduced-size image for README (smaller width)
  const targetWidthReadme = 640;
  const transformerReadme = sharp(src).resize({ width: Math.min(targetWidthReadme, metadata.width || targetWidthReadme), withoutEnlargement: true });
  await transformerReadme.png({ quality: 90, compressionLevel: 9, adaptiveFiltering: true }).toFile(outReadmePngTmp);
  fs.renameSync(outReadmePngTmp, outReadmePng);
  const statReadmePng = fs.statSync(outReadmePng);
  await transformerReadme.webp({ quality: 85 }).toFile(outReadmeWebP);
  const statReadmeWebp = fs.statSync(outReadmeWebP);

  console.log('Wrote optimized PNG:', outPng, statPng.size, 'bytes');
  console.log('Wrote WebP:', outWebP, statWebp.size, 'bytes');
  console.log('Wrote README PNG:', outReadmePng, statReadmePng.size, 'bytes');
  console.log('Wrote README WebP:', outReadmeWebP, statReadmeWebp.size, 'bytes');
    console.log('Done. You can publish with the optimized PNG (icon file remains media/pystacker.png).');
  } catch (err) {
    console.error('Error optimizing image:', err);
    process.exit(1);
  }
}

run();
