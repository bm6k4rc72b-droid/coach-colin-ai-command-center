/**
 * End-to-end smoke test for the HarvestEye camera app.
 *
 * Chromium can be handed a Y4M file as a fake camera, so the whole app — the
 * permission flow, the capture loop, the detector, the overlay and the readout
 * — can be exercised without a phone. The fixture is a synthetic vine: ripe red
 * fruit and one unripe fruit on a textured green canopy, so the expected
 * verdict is known.
 *
 * Usage:
 *   node scripts/qa-harvest-eye.mjs [--keep] [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser that Puppeteer did not
 * download itself.
 *
 * @module scripts/qa-harvest-eye
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const WIDTH = 640;
const HEIGHT = 480;
const FRAMES = 12;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/**
 * Load Puppeteer, tolerating a `puppeteer-core`-only install.
 *
 * @returns {Promise<object>} The Puppeteer module.
 */
async function loadPuppeteer() {
  try {
    return (await import('puppeteer')).default;
  } catch {
    return (await import('puppeteer-core')).default;
  }
}

/**
 * Paint one synthetic vine frame as RGB bytes.
 *
 * @param {number} phase Frame index, used to drift the fruit slightly so the
 *   tracker has real motion to follow.
 * @returns {Uint8ClampedArray} RGB triples, row-major.
 */
function renderFixture(phase) {
  const rgb = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  const fruit = [
    { x: 210, y: 250, r: 58, rgb: [206, 44, 32] },
    { x: 360, y: 190, r: 44, rgb: [214, 60, 38] },
    { x: 455, y: 320, r: 40, rgb: [232, 168, 40] },
  ];
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      // Canopy: mid green with vein-like structure, so foliage is textured the
      // way the detector expects real leaves to be.
      const vein = Math.sin(x * 0.28) * Math.cos(y * 0.21) * 22;
      let r = 46 + vein * 0.4;
      let g = 104 + vein;
      let b = 40 + vein * 0.3;
      for (const disc of fruit) {
        const dx = x - (disc.x + Math.sin(phase / 3) * 4);
        const dy = y - disc.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= disc.r * disc.r) {
          // Slight radial shading keeps the disc from looking like flat paint.
          const shade = 1 - (Math.sqrt(d2) / disc.r) * 0.18;
          [r, g, b] = disc.rgb.map((channel) => channel * shade);
        }
      }
      const p = (y * WIDTH + x) * 3;
      rgb[p] = r;
      rgb[p + 1] = g;
      rgb[p + 2] = b;
    }
  }
  return rgb;
}

/**
 * Write the fixture as a Y4M clip Chromium can play as a camera.
 *
 * @param {string} file Destination path.
 * @returns {Promise<void>} Resolves once the clip is written.
 */
async function writeY4m(file) {
  const chunks = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F15:1 Ip A1:1 C420\n`)];
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const rgb = renderFixture(frame);
    const luma = Buffer.alloc(WIDTH * HEIGHT);
    const cb = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
    const cr = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const p = (y * WIDTH + x) * 3;
        const [r, g, b] = [rgb[p], rgb[p + 1], rgb[p + 2]];
        luma[y * WIDTH + x] = Math.max(16, Math.min(235, 0.257 * r + 0.504 * g + 0.098 * b + 16));
        if (y % 2 === 0 && x % 2 === 0) {
          const c = (y / 2) * (WIDTH / 2) + x / 2;
          cb[c] = Math.max(16, Math.min(240, -0.148 * r - 0.291 * g + 0.439 * b + 128));
          cr[c] = Math.max(16, Math.min(240, 0.439 * r - 0.368 * g - 0.071 * b + 128));
        }
      }
    }
    chunks.push(Buffer.from('FRAME\n'), luma, cb, cr);
  }
  await fsp.writeFile(file, Buffer.concat(chunks));
}

/**
 * Serve `public/` over HTTP so the page runs in a secure-enough context.
 *
 * @returns {Promise<{server:http.Server, port:number}>} The listening server.
 */
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const requested = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const file = fs.existsSync(requested) && fs.statSync(requested).isDirectory()
      ? path.join(requested, 'index.html')
      : requested;
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Run the smoke test.
 *
 * @returns {Promise<void>} Rejects when an assertion fails.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const screenshot = outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(os.tmpdir(), 'harvest-eye-smoke.png');

  const fixture = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), 'harvesteye-')), 'vine.y4m');
  await writeY4m(fixture);

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${fixture}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const failures = [];
  /**
   * Record an assertion result.
   *
   * @param {boolean} condition Assertion outcome.
   * @param {string} message What was being asserted.
   */
  const check = (condition, message) => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${port}/harvest-eye/index.html`, { waitUntil: 'load' });
    await page.click('#startBtn');
    await page.waitForFunction(
      () => document.getElementById('startGate').hidden,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.getElementById('statFruit').textContent !== '—',
      { timeout: 15000 },
    );
    // Let the tracker settle so identities and smoothed maturity are meaningful.
    await new Promise((resolve) => { setTimeout(resolve, 1500); });

    const readout = await page.evaluate(() => ({
      verdict: document.getElementById('verdictLabel').textContent,
      sub: document.getElementById('verdictSub').textContent,
      days: document.getElementById('daysValue').textContent,
      ready: document.getElementById('statReady').textContent,
      fruit: document.getElementById('statFruit').textContent,
      maturity: document.getElementById('statMaturity').textContent,
      confidence: document.getElementById('statConfidence').textContent,
      fps: document.getElementById('fpsText').textContent,
      overlayInk: (() => {
        const canvas = document.getElementById('overlay');
        const ctx = canvas.getContext('2d');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
        return painted;
      })(),
    }));
    console.log(readout);

    check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);
    check(Number(readout.fruit) >= 2, `fruit detected in the fixture (got ${readout.fruit})`);
    check(Number(readout.maturity) > 0.7, `mean maturity reads ripe (got ${readout.maturity})`);
    check(readout.verdict.includes('Harvest-ready') || readout.verdict.includes('window'),
      `verdict announces the harvest window (got "${readout.verdict}")`);
    check(Number(readout.confidence) > 0.4, `confidence is usable (got ${readout.confidence})`);
    check(readout.overlayInk > 500, `overlay drew detection boxes (${readout.overlayInk} px)`);
    check(parseFloat(readout.fps) > 4, `analysis keeps a usable frame rate (${readout.fps})`);

    // The ledger round-trip: log a scan, then confirm it renders as a block.
    // Sheet contents scroll inside their own container, so these are dispatched
    // directly rather than through a synthetic mouse click at a screen point.
    // Hidden panels must actually be gone, not merely flagged: a `display`
    // rule on an id selector outranks the user agent's `[hidden]` rule, and a
    // still-painted start gate silently eats every tap on the readout.
    const covered = await page.evaluate(() => ['startGate', 'reticle', 'cropSheet']
      .filter((id) => getComputedStyle(document.getElementById(id)).display !== 'none'));
    check(covered.length === 0, `hidden panels are not painted (${covered.join(', ') || 'none'})`);

    // A real mouse click, not a dispatched one: this is the path a picker takes
    // and the one that regressed when the gate stayed on top.
    await page.click('#saveBtn');
    const logged = await page.evaluate(
      () => JSON.parse(localStorage.getItem('harvesteye.scans.v1') || '[]'),
    );
    check(logged.length === 1, `the scan reached the ledger (${logged.length} rows)`);
    check(logged[0]?.plot === 'Block A' && logged[0]?.cropId === 'tomato',
      'the scan carries its plot and crop');
    check(Number(logged[0]?.meanMaturity) > 0.7, 'the stored reading matches the live readout');

    await page.evaluate(() => document.getElementById('ledgerBtn').click());
    await page.waitForSelector('.plot-block', { timeout: 5000 });
    const ledgerText = await page.$eval('#ledgerBody', (el) => el.textContent);
    check(/Block A/.test(ledgerText), 'logged scan appears in the field ledger');
    check(/scan/.test(ledgerText), 'ledger shows the scan-count basis line');

    await page.evaluate(() => document.querySelectorAll('.sheet').forEach((s) => { s.hidden = true; }));
    // Let the confirmation toast clear so the screenshot shows the plain readout.
    await page.waitForFunction(
      () => !document.getElementById('toast').classList.contains('show'),
      { timeout: 8000 },
    );
    await page.screenshot({ path: screenshot });
    console.log(`screenshot: ${screenshot}`);
  } finally {
    await browser.close();
    server.close();
    if (!args.includes('--keep')) await fsp.rm(path.dirname(fixture), { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\nall checks passed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
