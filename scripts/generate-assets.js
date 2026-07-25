#!/usr/bin/env node
/**
 * generate-assets.js — brand asset generator for Greek Ties.
 *
 * Renders the flat, rectangle-based brand mark (three gold pillars on navy —
 * a column motif echoing Greek architecture) as PNGs with zero dependencies:
 * raw pixel buffers are encoded by hand (PNG chunks + CRC32) and compressed
 * with Node's built-in zlib.
 *
 * Outputs (all consumed by app.config.ts):
 *   assets/icon.png           1024x1024 RGB   — navy field, cream frame, gold mark
 *   assets/adaptive-icon.png  1024x1024 RGBA  — transparent bg, gold mark only
 *                                               (Android composites it over the
 *                                               navy adaptiveIcon.backgroundColor;
 *                                               mark is shrunk into the ~66% safe zone)
 *   assets/splash-icon.png     512x512  RGBA  — transparent bg, gold mark
 *                                               (splash backgroundColor is cream)
 *
 * Run: node scripts/generate-assets.js
 * Verify: sips -g pixelWidth -g pixelHeight assets/icon.png
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// Brand palette (keep in sync with theme/colors.ts)
// ---------------------------------------------------------------------------

const NAVY = [0x16, 0x29, 0x4a];
const GOLD = [0xc8, 0xa2, 0x4a];
const CREAM = [0xf6, 0xf1, 0xe7];

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolor, 8-bit, no interlace, filter 0)
// ---------------------------------------------------------------------------

// Standard CRC32 (polynomial 0xEDB88320), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// A PNG chunk is: 4-byte length, 4-byte type, data, CRC32(type + data).
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Encode a raw pixel buffer as a PNG file buffer.
 * @param {number} width
 * @param {number} height
 * @param {Buffer} pixels - width*height*channels bytes, row-major
 * @param {boolean} alpha - true for RGBA (color type 6), false for RGB (type 2)
 */
function encodePng(width, height, pixels, alpha) {
  const channels = alpha ? 4 : 3;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // color type: 6 = RGBA, 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter-type byte (0 = None).
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Flat-rectangle canvas
// ---------------------------------------------------------------------------

function makeCanvas(size, alpha, fill) {
  const channels = alpha ? 4 : 3;
  const pixels = Buffer.alloc(size * size * channels);
  const canvas = { size, alpha, channels, pixels };
  if (fill) fillRect(canvas, 0, 0, size, size, fill);
  return canvas;
}

// Paint an axis-aligned solid rectangle. Coordinates are clamped to the canvas.
function fillRect(canvas, x, y, w, h, color) {
  const { size, channels, pixels, alpha } = canvas;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(size, Math.round(x + w));
  const y1 = Math.min(size, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * size + px) * channels;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      if (alpha) pixels[i + 3] = 255;
    }
  }
}

// ---------------------------------------------------------------------------
// Brand mark: three vertical gold pillars, the middle one taller,
// bottom-aligned on a shared baseline and centered on the canvas.
// ---------------------------------------------------------------------------

function drawMark(canvas, scale) {
  const s = canvas.size * scale;
  const cx = canvas.size / 2;
  const cy = canvas.size / 2;

  const barW = 0.16 * s; // pillar width
  const gap = 0.1 * s; // space between pillars
  const outerH = 0.52 * s; // outer pillar height
  const midH = 0.72 * s; // middle pillar height (taller)

  const totalW = 3 * barW + 2 * gap;
  const left = cx - totalW / 2;
  const baseline = cy + midH / 2; // composition centered on the tall pillar

  fillRect(canvas, left, baseline - outerH, barW, outerH, GOLD);
  fillRect(canvas, left + barW + gap, baseline - midH, barW, midH, GOLD);
  fillRect(canvas, left + 2 * (barW + gap), baseline - outerH, barW, outerH, GOLD);
}

// Thin hollow frame: four rectangles inset from the canvas edge.
function drawFrame(canvas, inset, thickness, color) {
  const s = canvas.size;
  const span = s - 2 * inset;
  fillRect(canvas, inset, inset, span, thickness, color); // top
  fillRect(canvas, inset, s - inset - thickness, span, thickness, color); // bottom
  fillRect(canvas, inset, inset, thickness, span, color); // left
  fillRect(canvas, s - inset - thickness, inset, thickness, span, color); // right
}

// ---------------------------------------------------------------------------
// Compose + write the three assets
// ---------------------------------------------------------------------------

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

function write(name, canvas) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, encodePng(canvas.size, canvas.size, canvas.pixels, canvas.alpha));
  console.log(`wrote ${file} (${canvas.size}x${canvas.size}, ${canvas.alpha ? 'RGBA' : 'RGB'})`);
}

// App icon: opaque navy field, cream inset frame, gold mark. No transparency —
// Apple rejects icons with an alpha channel that actually shows through.
const icon = makeCanvas(1024, false, NAVY);
drawFrame(icon, 56, 8, CREAM);
drawMark(icon, 0.72);
write('icon.png', icon);

// Android adaptive icon foreground: gold mark on transparency. Launchers may
// mask to a circle, so keep the mark inside the central ~66% safe zone.
const adaptive = makeCanvas(1024, true, null);
drawMark(adaptive, 0.5);
write('adaptive-icon.png', adaptive);

// Splash icon: gold mark on transparency, shown over the cream splash bg.
const splash = makeCanvas(512, true, null);
drawMark(splash, 0.72);
write('splash-icon.png', splash);
