// Generate simple brand-gradient PNG icons for the PWA without extra deps.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public');
fs.mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c, table = crc32.table || (crc32.table = []);
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
// Gradient from #2563EB to #06B6D4. Draw a centered white rounded square "mark".
function makeIcon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.28; // rounded corner radius for the white rounded square
  const pad = size * 0.24;
  const x0 = pad, y0 = pad, x1 = size - pad, y1 = size - pad;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type 0
    const t = y / size;
    const r1 = 0x25 + (0x06 - 0x25) * t; // 37..6
    const g1 = 0x63 + (0xB6 - 0x63) * t;
    const b1 = 0xEB + (0xD4 - 0xEB) * t;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // rounded-square distance
      const cx = Math.max(x0 + r, Math.min(x, x1 - r));
      const cy = Math.max(y0 + r, Math.min(y, y1 - r));
      const dx = x - cx, dy = y - cy;
      const inside = (x >= x0 && x <= x1 && y >= y0 && y <= y1) && (dx * dx + dy * dy <= r * r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r));
      if (inside) {
        // white with slight gradient shadow at bottom
        const shade = 0xFF - (y > y1 - pad ? (y - (y1 - pad)) / pad * 60 : 0);
        raw[o] = shade; raw[o + 1] = shade; raw[o + 2] = shade; raw[o + 3] = 255;
      } else {
        raw[o] = Math.round(r1); raw[o + 1] = Math.round(g1); raw[o + 2] = Math.round(b1); raw[o + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) fs.writeFileSync(path.join(out, `icon-${s}.png`), makeIcon(s));

fs.writeFileSync(path.join(out, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2563EB"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><path d="M22 18h20v6H22zM24 26h16v18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8h-4v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V28a2 2 0 0 1 2-2z" fill="#fff"/></svg>`);
console.log('icons written');