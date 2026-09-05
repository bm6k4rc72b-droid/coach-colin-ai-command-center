/**
 * End-to-end smoke test for HOUSEWRIGHT.
 *
 * Serves `public/housewright/` statically, drives it in headless Chromium
 * against a fake camera and synthetic orientation events, and checks the parts
 * that only exist once a browser is involved: the shell boots without a page
 * error, the walk opens a camera, the fingertip tracker finds a synthesised
 * hand and dwells to a commit, a typed room becomes a plan, the plan renders
 * as SVG, the massing canvas paints, the report builds, and the phone layout
 * does not overflow.
 *
 * Usage:
 *   node scripts/qa-housewright.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-housewright
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const WIDTH = 640;
const HEIGHT = 480;
const FRAMES = 60;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
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
 * One frame of the fixture: a painted interior with a bright window, and a
 * finger that reaches in, dwells, and withdraws on a loop.
 *
 * Two properties of this fixture are load-bearing, and both were learned the
 * hard way. The wall must not itself be skin-coloured — the first version was
 * a warm brown that landed squarely inside the skin locus, so the tracker saw
 * a hand covering the entire lens and correctly refused it. And the finger has
 * to keep cycling, because acquisition requires motion: a finger that arrives
 * before the camera finishes opening and then never moves again is, by
 * design, invisible.
 *
 * @param {number} frame Frame index.
 * @returns {Uint8ClampedArray} RGB pixels.
 */
function renderFixture(frame) {
  const rgb = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  // Reach in over 10 frames, hold for 35 — long enough for a one-second dwell
  // to complete at any phase the app happens to start on — then withdraw.
  const cycle = frame % 60;
  const reach = cycle < 10 ? cycle / 10 : cycle < 45 ? 1 : Math.max(0, (60 - cycle) / 15);
  const tipY = HEIGHT * (1.02 - reach * 0.6);
  const fingerX = WIDTH * 0.5;
  const halfWidth = 26;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      // A painted interior wall: cool, mid-grey, with enough grain that the
      // finish analyser measures a real contrast figure rather than zero.
      const grain = Math.sin(x * 0.05) * Math.cos(y * 0.04) * 9;
      let r = 104 + grain;
      let g = 110 + grain;
      let b = 120 + grain;
      if (x > WIDTH * 0.72 && x < WIDTH * 0.93 && y > HEIGHT * 0.18 && y < HEIGHT * 0.55) {
        r = 236; g = 240; b = 246;
      }
      if (y >= tipY && Math.abs(x - fingerX) < halfWidth) {
        const shade = 1 - Math.abs(x - fingerX) / halfWidth * 0.12;
        r = 208 * shade; g = 152 * shade; b = 126 * shade;
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
 * @returns {Promise<void>} Resolves once written.
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
 * Serve `public/` on an ephemeral port.
 *
 * @returns {Promise<{server: http.Server, port: number}>} The listening server.
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
    : path.join(os.tmpdir(), 'housewright-smoke.png');

  const fixture = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), 'housewright-')), 'room.y4m');
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

    // Chromium has no orientation sensors, so synthesise a phone aimed 40°
    // below level — a normal shot at the base of a wall.
    await page.evaluateOnNewDocument(() => {
      globalThis.__aim = { alpha: 12, beta: 50, gamma: 0 };
      const fire = () => {
        const event = new Event('deviceorientation');
        Object.assign(event, { ...globalThis.__aim, absolute: true });
        globalThis.dispatchEvent(event);
      };
      setInterval(fire, 60);
    });

    await page.goto(`http://127.0.0.1:${port}/housewright/index.html`, { waitUntil: 'networkidle0' });
    check(await page.$('#chrome') !== null, 'the shell renders');
    check((await page.title()).includes('HOUSEWRIGHT'), 'the document is titled');

    // Setup: fill the market figures the report needs.
    await page.type('#address', '1490 Aspen Court');
    await page.evaluate(() => {
      const set = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('pricePerSqft', '420');
      set('ceilingPricePerSqft', '640');
      set('totalSqft', '2100');
      set('holdHeight', '1.45');
    });

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('housewright.surveys.v1') || '[]'));
    check(stored.length === 1 && stored[0].pricePerSqft === 420, 'the survey persists to the device');

    // --- the walk -------------------------------------------------------
    // One full fixture cycle is four seconds; wait past it so the walk is
    // observed with the finger settled rather than mid-withdrawal.
    await page.click('#startWalk');
    await new Promise((resolve) => setTimeout(resolve, 5200));

    const video = await page.evaluate(() => {
      const el = document.getElementById('walkVideo');
      return { w: el.videoWidth, h: el.videoHeight, playing: !el.paused };
    });
    check(video.w > 0 && video.h > 0, `the camera opens (${video.w}×${video.h})`);

    const aim = await page.evaluate(() => ({
      range: document.getElementById('aimRange').textContent,
      angle: document.getElementById('aimAngle').textContent,
      good: document.getElementById('reticle').classList.contains('good'),
    }));
    // Held at 1.45 m and aimed 40° below level, the floor is 1.73 m away.
    const measured = Number.parseFloat(aim.range);
    check(Number.isFinite(measured) && Math.abs(measured - 1.728) < 0.05,
      `the aim solves to the right distance (${aim.range})`);
    check(aim.good, `and the reticle grades the shot as usable (${aim.angle})`);

    const tracked = await page.evaluate(() => ({
      hand: document.getElementById('handState').textContent,
      visible: !document.getElementById('cursor').hidden,
    }));
    check(tracked.visible && tracked.hand !== 'no hand',
      `the fingertip is tracked from the camera (${tracked.hand})`);

    const cornersFromDwell = await page.evaluate(() => Number(document.getElementById('cornerCount').textContent));
    check(cornersFromDwell > 0, `a dwell committed a corner without a tap (${cornersFromDwell})`);

    // Shoot the rest of a room with the button, so the geometry is well posed
    // regardless of how many dwells the fixture happened to fire.
    await page.evaluate(() => {
      const state = { alpha: 12, beta: 50, gamma: 0 };
      globalThis.__aim = state;
    });
    for (const [alpha, beta] of [[12, 50], [102, 55], [192, 50], [282, 55]]) {
      await page.evaluate((a, b) => { globalThis.__aim = { alpha: a, beta: b, gamma: 0 }; }, alpha, beta);
      await new Promise((resolve) => setTimeout(resolve, 220));
      await page.click('#shootBtn');
    }
    const corners = await page.evaluate(() => Number(document.getElementById('cornerCount').textContent));
    check(corners >= 4, `corners accumulate (${corners})`);

    const liveArea = await page.evaluate(() => document.getElementById('liveArea').textContent);
    check(/m²/.test(liveArea), `the live plan reports an area (${liveArea})`);

    await page.evaluate(() => {
      document.getElementById('roomName').value = 'Great room';
      document.getElementById('roomCeiling').value = '2.42';
    });
    await page.click('#saveRoomBtn');
    await new Promise((resolve) => setTimeout(resolve, 300));

    const rooms = await page.evaluate(() => document.querySelectorAll('#roomList .roomcard').length);
    check(rooms === 1, 'the room is saved to the survey');

    // --- plan, model, report --------------------------------------------
    await page.click('.tab[data-go="plan"]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const svg = await page.evaluate(() => {
      const el = document.querySelector('#planHost svg');
      return el ? { ok: true, text: el.textContent } : { ok: false };
    });
    check(svg.ok, 'the blueprint renders as SVG');
    check(svg.ok && /m/.test(svg.text) && /sq ft/.test(svg.text), 'and it is dimensioned in both units');

    await page.click('.tab[data-go="model"]');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById('modelCanvas');
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 8) lit += 1;
      return lit;
    });
    check(painted > 20, `the massing model paints (${painted} sampled pixels lit)`);

    await page.click('.tab[data-go="report"]');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const report = await page.evaluate(() => {
      const host = document.getElementById('reportHost');
      return {
        recs: host.querySelectorAll('.rec').length,
        phases: host.querySelectorAll('.phase').length,
        signals: host.querySelectorAll('.signals li').length,
        caveat: Boolean(host.querySelector('.caveat')),
        text: host.textContent,
      };
    });
    check(report.recs > 5, `the report recommends work (${report.recs} items)`);
    check(report.phases > 1, `sequenced into phases (${report.phases})`);
    check(report.signals > 0, `with camera-derived signals (${report.signals})`);
    check(report.caveat, 'and the caveat is on the page');
    check(/Headroom/.test(report.text), 'the street ceiling is shown, not hidden');

    // --- layout ----------------------------------------------------------
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    check(overflow.doc <= overflow.win + 1, `no horizontal overflow (${overflow.doc} ≤ ${overflow.win})`);

    await page.screenshot({ path: screenshot });
    // A second frame of the walk itself: the report is the deliverable, but
    // the viewfinder is where the app is actually used.
    await page.click('.tab[data-go="walk"]');
    await new Promise((resolve) => setTimeout(resolve, 900));
    await page.screenshot({ path: screenshot.replace(/\.png$/, '-walk.png') });
    console.log(`\nscreenshot: ${screenshot}`);
    check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
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
