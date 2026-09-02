#!/usr/bin/env node
/**
 * Rasterise the PULSE app icons.
 *
 * iOS home-screen icons must be PNG (Safari ignores SVG for
 * `apple-touch-icon`), and the repository has no image toolchain installed by
 * default, so the icon is drawn here from its implicit geometry and encoded
 * with Node's built-in zlib. Deterministic: re-running reproduces the same
 * bytes.
 *
 * Usage: node scripts/build-pulse-icons.mjs
 *
 * @module scripts/build-pulse-icons
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '..', 'public', 'pulse', 'icons');

const GROUND = [3, 6, 11];
const GLOW = [10, 32, 48];
const ACCENT = [56, 240, 255];
const EMBER = [255, 166, 61];

/** CRC-32 over a buffer, per the PNG specification. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Build one PNG chunk: length, type, payload, CRC. */
function chunk(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
  return Buffer.concat([head, payload, crc]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance from point `p` to segment `a`-`b`. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy;
  const t = len > 0 ? Math.min(1, Math.max(0, (wx * vx + wy * vy) / len)) : 0;
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Implicit heart: negative inside. Coordinates normalised to roughly ±1.3. */
function heartField(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y;
}

/** The ECG polyline carved across the heart, in normalised coordinates. */
const TRACE = [
  [-1.15, 0.02], [-0.62, 0.02], [-0.46, 0.2], [-0.3, -0.36],
  [-0.1, 0.52], [0.1, -0.18], [0.26, 0.02], [1.15, 0.02],
];

/** Colour one supersample of the icon. Returns [r, g, b, a]. */
function shade(nx, ny) {
  // Background: near-black with a soft cyan bloom behind the mark.
  const radius = Math.sqrt(nx * nx + ny * ny);
  const bloom = Math.max(0, 1 - radius / 1.5) ** 2.2;
  const bg = GROUND.map((c, i) => c + (GLOW[i] - c) * bloom);

  // Heart body, with the field value feeding a soft edge.
  const hx = nx / 1.02;
  const hy = -ny / 1.02 + 0.08;
  const field = heartField(hx, hy);
  const inside = field <= 0;

  // Trace distance drives both the carve and its ember halo.
  let traceDistance = Infinity;
  for (let i = 1; i < TRACE.length; i += 1) {
    traceDistance = Math.min(
      traceDistance,
      distanceToSegment(nx, ny, TRACE[i - 1][0], TRACE[i - 1][1], TRACE[i][0], TRACE[i][1]),
    );
  }

  let colour = bg;
  if (inside) {
    // Vertical gradient inside the heart: brighter at the top-left shoulder.
    const lift = Math.min(1, Math.max(0, 0.55 - ny * 0.5));
    colour = ACCENT.map((c) => c * (0.72 + 0.28 * lift));
    if (traceDistance < 0.055) colour = GROUND.map((c, i) => c + (GLOW[i] - c) * 0.4);
    else if (traceDistance < 0.085) colour = colour.map((c, i) => c * 0.4 + GROUND[i] * 0.6);
  } else if (traceDistance < 0.045) {
    // The trace continues past the heart as an ember lead-in and lead-out.
    colour = EMBER;
  } else if (traceDistance < 0.075) {
    const t = (0.075 - traceDistance) / 0.03;
    colour = bg.map((c, i) => c + (EMBER[i] - c) * t * 0.5);
  }
  return [colour[0], colour[1], colour[2], 255];
}

/**
 * Render one square icon.
 * @param {number} size Edge length in pixels.
 * @param {number} samples Supersampling factor per axis.
 */
function renderIcon(size, samples = 4) {
  const rgba = Buffer.alloc(size * size * 4);
  const extent = 1.42; // normalised half-width of the canvas
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const nx = ((x + (sx + 0.5) / samples) / size - 0.5) * 2 * extent;
          const ny = ((y + (sy + 0.5) / samples) / size - 0.5) * 2 * extent;
          const [cr, cg, cb] = shade(nx, ny);
          r += cr; g += cg; b += cb;
        }
      }
      const n = samples * samples;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

for (const size of [180, 192, 512]) {
  const file = path.join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, renderIcon(size));
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`);
}
