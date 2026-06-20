const sharp = require('sharp');
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

const PUBLIC = join(__dirname, '..', 'public');

// Base SVG — design #3: chat bubble with text lines, middle highlighted
const baseSvg = readFileSync(join(PUBLIC, 'icon.svg'), 'utf-8');

// Maskable variant: full bg, content scaled to 78% centered for safe zone
const maskableSvg = baseSvg.replace(
  '<rect width="512" height="512" rx="96" fill="#f0f0f0"/>',
  '<rect width="512" height="512" fill="#f0f0f0"/>'
).replace(
  'viewBox="0 0 512 512"',
  'viewBox="-57 -57 626 626"' // shift + shrink to fit safe zone
);

async function render(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function main() {
  const sizes = [
    { name: 'icon-192.png', size: 192, svg: baseSvg },
    { name: 'icon-512.png', size: 512, svg: baseSvg },
    { name: 'icon-192-maskable.png', size: 192, svg: maskableSvg },
    { name: 'icon-512-maskable.png', size: 512, svg: maskableSvg },
    { name: 'apple-touch-icon.png', size: 180, svg: baseSvg },
  ];

  for (const { name, size, svg } of sizes) {
    const buf = await render(svg, size);
    writeFileSync(join(PUBLIC, name), buf);
    console.log(`✓ ${name} (${size}x${size})`);
  }
  console.log('Done.');
}

main().catch(console.error);
