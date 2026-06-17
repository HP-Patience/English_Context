// Generates solid-color placeholder icons for PWA manifest.
// Run: node scripts/generate-icons.js
// Requires Node.js built-in modules only (fs, zlib).

const { writeFileSync } = require('fs');
const { deflateSync } = require('zlib');

function createPNG(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2; // RGB
  const ihdr = chunk('IHDR', ihdrData);

  const rowBytes = size * 3 + 1; // filter byte + RGB per pixel
  const rawData = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    rawData[y * rowBytes] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const offset = y * rowBytes + 1 + x * 3;
      rawData[offset] = 0x1c;
      rawData[offset + 1] = 0x19;
      rawData[offset + 2] = 0x17;
    }
  }
  const idat = chunk('IDAT', deflateSync(rawData));
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type);
  const crc = crc32(Buffer.concat([typeB, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeB, data, crcBuf]);
}

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

writeFileSync('public/icon-192.png', createPNG(192));
writeFileSync('public/icon-512.png', createPNG(512));
console.log('Icons generated: public/icon-192.png, public/icon-512.png');
