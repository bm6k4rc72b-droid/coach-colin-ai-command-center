/**
 * End-to-end check for Sentry, against a clip whose answer is known.
 *
 * Chromium will accept a Y4M file as a camera, so the whole app runs without a
 * camera or a person: permission flow, capture loop, background model,
 * segmentation, tracking, calibration, zones and the written summary. The
 * fixture walks a 1.75 m subject 4.4 m across a yard at 0.8 m/s, filmed through
 * a camera 3 m up and tilted 24°. Those are the numbers the app has to come
 * back with — and because the same pose is typed into its calibration panel,
 * anything else means the chain between the pixels and the panel is broken.
 *
 * This is the test the unit suites cannot do: it exercises the real DOM, the
 * real canvas scaling, the real pointer handling for drawing a tripwire, and
 * the browser's own frame delivery, which is jittery in ways no fixture is.
 *
 * Usage:
 *   node scripts/qa-sentry.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-sentry
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { imagePoint, pose } from '../public/sentry/js/ground.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const WIDTH = 256;
const HEIGHT = 192;
const FPS = 15;

/** The camera the fixture is filmed through, and typed into the app. */
const CAMERA = pose({ heightM: 3.0, tiltDeg: 24, fovDeg: 70, width: WIDTH, height: HEIGHT });

const SUBJECT_HEIGHT_M = 1.75;
const SPEED_MPS = 0.8;
// The subject starts off the left edge and walks in. The clip opens on an empty
// yard so the background model has something clean to learn — a clip that opens
// with the subject already standing in it teaches the model that they are part
// of the scenery, which is correct behaviour and useless as a fixture.
const START = { x: -4.6, y: 7 };
const END = { x: 2.2, y: 7 };
const WALK_M = Math.hypot(END.x - START.x, END.y - START.y);
const EMPTY_SECONDS = 2.5;
const WALK_SECONDS = WALK_M / SPEED_MPS;
const STAND_SECONDS = 1.5;
const CLIP_SECONDS = EMPTY_SECONDS + WALK_SECONDS + STAND_SECONDS;
const STEP_HZ = 1.8;

/** The area the harness draws, in ground metres — the subject walks through it. */
const AREA = [
  { x: -1.2, y: 5.6 },
  { x: 1.2, y: 5.6 },
  { x: 1.2, y: 8.4 },
  { x: -1.2, y: 8.4 },
];

/** The tripwire the harness draws, in ground metres. */
const WIRE = [
  { x: 0, y: 4.5 },
  { x: 0, y: 9.5 },
];

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
 * Paint one frame of the fixture as RGB bytes.
 *
 * @param {number} index Frame number.
 * @returns {Uint8ClampedArray} RGB triples, row-major.
 */
function renderFixture(index) {
  const rgb = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  const t = index / FPS;
  // A textured ground rather than a flat field: a segmenter tested against a
  // uniform backdrop looks far better than it is.
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const p = (y * WIDTH + x) * 3;
      const checker = ((x >> 5) + (y >> 5)) % 2 ? 10 : 0;
      const gradient = 44 + (y / HEIGHT) * 24;
      rgb[p] = gradient + checker;
      rgb[p + 1] = gradient + checker + 4;
      rgb[p + 2] = gradient + checker + 11;
    }
  }

  const walking = Math.max(0, t - EMPTY_SECONDS);
  const walked = Math.min(WALK_M, SPEED_MPS * walking);
  const along = walked / WALK_M;
  const world = {
    x: START.x + (END.x - START.x) * along,
    y: START.y + (END.y - START.y) * along,
  };
  // The head rises and falls once a step; the feet stay planted, as they do.
  const bobM = walked < WALK_M ? 0.03 * Math.sin(2 * Math.PI * STEP_HZ * walking) : 0;
  const foot = imagePoint(CAMERA, world.x, world.y, 0);
  const head = imagePoint(CAMERA, world.x, world.y, SUBJECT_HEIGHT_M + bobM);
  const side = imagePoint(CAMERA, world.x + 0.25, world.y, 0);
  if (!foot || !head || !side) return rgb;
  // Off the left edge of the picture: nothing to draw yet.
  if (foot.u + Math.abs(side.u - foot.u) < 0) return rgb;

  const halfWidth = Math.max(2, Math.abs(side.u - foot.u));
  const top = Math.max(0, Math.round(head.v));
  const bottom = Math.min(HEIGHT - 1, Math.round(foot.v));
  const boxHeight = bottom - top;
  for (let y = top; y <= bottom; y += 1) {
    const isHead = y < top + boxHeight * 0.2;
    const inset = isHead ? Math.round(halfWidth * 0.45) : 0;
    for (
      let x = Math.max(0, Math.round(foot.u - halfWidth) + inset);
      x <= Math.min(WIDTH - 1, Math.round(foot.u + halfWidth) - inset);
      x += 1
    ) {
      const p = (y * WIDTH + x) * 3;
      rgb[p] = isHead ? 182 : 198;
      rgb[p + 1] = isHead ? 140 : 172;
      rgb[p + 2] = isHead ? 120 : 158;
    }
  }
  return rgb;
}

/**
 * How far the subject travels while wholly inside the picture.
 *
 * The app cannot measure a subject who is half off the edge — the silhouette is
 * cut, so the ground-contact point is wrong — and it should not be graded on
 * one. This is the distance it actually has a chance to see.
 *
 * @returns {number} Metres.
 */
function visibleDistance() {
  let first = null;
  let last = null;
  for (let frame = 0; frame < Math.round(CLIP_SECONDS * FPS); frame += 1) {
    const walking = Math.max(0, frame / FPS - EMPTY_SECONDS);
    const walked = Math.min(WALK_M, SPEED_MPS * walking);
    const along = walked / WALK_M;
    const x = START.x + (END.x - START.x) * along;
    const y = START.y + (END.y - START.y) * along;
    const foot = imagePoint(CAMERA, x, y, 0);
    const head = imagePoint(CAMERA, x, y, SUBJECT_HEIGHT_M);
    const side = imagePoint(CAMERA, x + 0.25, y, 0);
    if (!foot || !head || !side) continue;
    const halfWidth = Math.abs(side.u - foot.u);
    const whole =
      foot.u - halfWidth > 0 && foot.u + halfWidth < WIDTH - 1 && head.v > 0 && foot.v < HEIGHT - 1;
    if (!whole) continue;
    if (first === null) first = walked;
    last = walked;
  }
  return first === null ? 0 : last - first;
}

/** Ground distance the app has a fair chance of measuring. */
const VISIBLE_M = visibleDistance();

/**
 * Write the fixture as a Y4M clip Chromium can play as a camera.
 *
 * @param {string} file Destination path.
 * @returns {Promise<void>} Resolves once the clip is written.
 */
async function writeY4m(file) {
  const handle = await fsp.open(file, 'w');
  await handle.write(Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420\n`));
  const frames = Math.round(CLIP_SECONDS * FPS);
  for (let frame = 0; frame < frames; frame += 1) {
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
    await handle.write(Buffer.concat([Buffer.from('FRAME\n'), luma, cb, cr]));
  }
  await handle.close();
}

/**
 * Serve `public/` over HTTP so the page runs in a secure context.
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
    const file =
      fs.existsSync(requested) && fs.statSync(requested).isDirectory()
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
  const screenshot =
    outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(os.tmpdir(), 'sentry-smoke.png');

  const fixtureDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sentry-'));
  const fixture = path.join(fixtureDir, 'yard.y4m');
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
   * @returns {void}
   */
  const check = (condition, message) => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${port}/sentry/index.html`, { waitUntil: 'load' });

    const limits = await page.$$eval('.limits li strong', (nodes) => nodes.map((n) => n.textContent));
    check(
      limits.some((l) => /through walls/i.test(l)) && limits.some((l) => /temperature/i.test(l)),
      `the app states what it cannot do up front (${limits.length} limits listed)`,
    );

    await page.click('#start');
    await page.waitForFunction(() => document.getElementById('viewport-empty').hidden, { timeout: 15000 });
    // Frames have to be flowing before the pose means anything: it is defined
    // against the analysis frame's pixel dimensions.
    await page.waitForFunction(() => globalThis.__sentry?.frameSize?.width > 0, { timeout: 15000 });
    check(true, 'the camera opened and frames are being analysed');
    // `hidden` on an element whose class sets `display` is not enough to hide
    // it, and a start panel left over the live picture is the kind of fault
    // that passes every property assertion.
    const gateVisible = await page.evaluate(
      () => getComputedStyle(document.getElementById('viewport-empty')).display !== 'none',
    );
    check(!gateVisible, 'the start panel is genuinely off screen, not merely flagged hidden');

    // Calibrate by typing the pose the fixture was filmed through.
    await page.click('#settings-toggle');
    await page.evaluate(
      (camera) => {
        document.getElementById('pose-height').value = String(camera.heightM);
        document.getElementById('pose-tilt').value = String(camera.tiltDeg);
        document.getElementById('pose-fov').value = String(camera.fovDeg);
        document.getElementById('pose-apply').click();
      },
      { heightM: CAMERA.heightM, tiltDeg: CAMERA.tiltDeg, fovDeg: CAMERA.fovDeg },
    );
    const scaleNote = await page.$eval('#readout-scale', (node) => node.textContent);
    check(/cm per pixel/.test(scaleNote), `calibration reports a ground scale ("${scaleNote}")`);

    // Draw a tripwire across the subject's path, through the interface rather
    // than by reaching into the state — the pointer maths is part of the app.
    await page.evaluate(() => {
      document.getElementById('zone-name').value = 'Drive';
      document.getElementById('zone-wire').click();
    });
    await page.evaluate((wire) => {
      const overlay = document.getElementById('overlay');
      const state = globalThis.__sentry;
      const rect = overlay.getBoundingClientRect();
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const { width, height } = state.frameSize;
      const scale = Math.max(overlay.width / width, overlay.height / height);
      for (const point of wire) {
        // Ground metres → analysis pixels → client coordinates: the inverse of
        // what the app does to a tap.
        const image = globalThis.__sentryProject(point.x, point.y);
        const px = (overlay.width - width * scale) / 2 + image.u * scale;
        const py = (overlay.height - height * scale) / 2 + image.v * scale;
        overlay.dispatchEvent(
          new PointerEvent('pointerdown', {
            clientX: rect.left + px / dpr,
            clientY: rect.top + py / dpr,
            bubbles: true,
          }),
        );
      }
    }, WIRE);
    const zones = await page.$$eval('#zone-list li', (nodes) => nodes.map((n) => n.textContent));
    check(zones.length === 1 && /Drive/.test(zones[0]), `the tripwire was placed through the UI (${zones[0] ?? 'none'})`);

    // An area zone is finished by a control that has to be reachable *while*
    // drawing — the setup panel closes to uncover the picture, so a Finish
    // button living in that panel can never be pressed.
    await page.click('#settings-toggle');
    await page.evaluate(() => {
      document.getElementById('zone-name').value = 'Doorway';
      document.getElementById('zone-loiter').value = '5';
      document.getElementById('zone-area').click();
    });
    const finishReachable = await page.evaluate(
      () => getComputedStyle(document.getElementById('drawing-done')).display !== 'none',
    );
    check(finishReachable, 'the control that finishes an area is on screen while drawing it');
    await page.evaluate((corners) => {
      const overlay = document.getElementById('overlay');
      const state = globalThis.__sentry;
      const rect = overlay.getBoundingClientRect();
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const { width, height } = state.frameSize;
      const scale = Math.max(overlay.width / width, overlay.height / height);
      for (const point of corners) {
        const image = globalThis.__sentryProject(point.x, point.y);
        overlay.dispatchEvent(
          new PointerEvent('pointerdown', {
            clientX: rect.left + ((overlay.width - width * scale) / 2 + image.u * scale) / dpr,
            clientY: rect.top + ((overlay.height - height * scale) / 2 + image.v * scale) / dpr,
            bubbles: true,
          }),
        );
      }
      document.getElementById('drawing-done').click();
    }, AREA);
    const bothZones = await page.$$eval('#zone-list li', (nodes) => nodes.map((n) => n.textContent));
    check(
      bothZones.length === 2 && bothZones.some((z) => /Doorway.*loiter 5s/.test(z)),
      `the area zone was drawn and finished (${bothZones.join(' / ') || 'none'})`,
    );
    // Drawing a zone closes the setup panel by itself, so this only matters if
    // it somehow stayed open.
    await page.evaluate(() => {
      const settings = document.getElementById('settings');
      if (!settings.hidden) document.getElementById('settings-close').click();
    });

    // Let the subject walk. The app is watched rather than waited on: the best
    // track seen is kept, because the clip loops and a fresh lap starts a new
    // one.
    // Only the first track is graded. Chromium loops the clip forever, and a
    // loop point is a teleport: the subject vanishes from one side of the yard
    // and reappears on the other between two frames. Everything after that is
    // the app coping with an impossible scene rather than measuring a walk.
    const observed = await page.evaluate(
      async (visibleM) =>
        new Promise((resolve) => {
          const state = globalThis.__sentry;
          let best = null;
          let settledFor = 0;
          const deadline = Date.now() + 40_000;
          const poll = setInterval(() => {
            const first = state.tracker.tracks.find((t) => t.id === 1 && t.confirmed);
            if (first) {
              const snapshot = {
                id: first.id,
                distanceM: first.distanceM,
                peakSpeedMps: first.peakSpeedMps,
                heightM: first.heightM,
                pathPoints: first.path.filter((p) => p.x !== null).length,
                bobs: first.bobs.length,
              };
              settledFor = best && Math.abs(snapshot.distanceM - best.distanceM) < 0.02
                ? settledFor + 1
                : 0;
              best = snapshot;
            }
            const done =
              (best && best.distanceM >= visibleM * 0.8 && settledFor >= 6) ||
              (best && settledFor >= 12) ||
              Date.now() > deadline;
            if (done) {
              clearInterval(poll);
              resolve(best);
            }
          }, 250);
        }),
      VISIBLE_M,
    );
    console.log(observed);
    check(Boolean(observed), 'the walking subject was tracked');
    if (observed) {
      const error = Math.abs(observed.distanceM - VISIBLE_M) / VISIBLE_M;
      check(error < 0.2, `distance walked matches the clip (${observed.distanceM.toFixed(2)} m vs ${VISIBLE_M.toFixed(2)} m visible)`);
      check(
        Math.abs(observed.peakSpeedMps - SPEED_MPS) / SPEED_MPS < 0.3,
        `speed matches the clip (${observed.peakSpeedMps.toFixed(2)} m/s vs ${SPEED_MPS})`,
      );
      check(
        observed.heightM !== null && Math.abs(observed.heightM - SUBJECT_HEIGHT_M) < 0.25,
        `standing height is recovered (${observed.heightM?.toFixed(2)} m vs ${SUBJECT_HEIGHT_M} m)`,
      );
      check(observed.pathPoints > 30, `the ground path was recorded (${observed.pathPoints} points)`);
    }

    const crossing = await page.$$eval('#events .event', (nodes) => nodes.map((n) => n.textContent));
    check(crossing.some((text) => /Drive/.test(text)), `the tripwire fired (${crossing.length} events)`);
    check(
      crossing.some((text) => /entered Doorway/.test(text)),
      'the area zone raised an entry as the subject walked into it',
    );
    // Every row must carry the time it happened, not the time the list was
    // drawn: a log where all the clocks agree is not a log.
    const stamps = await page.$$eval('#events time', (nodes) => nodes.map((n) => n.textContent));
    check(
      new Set(stamps).size > 1 || stamps.length < 2,
      `event rows carry their own timestamps (${[...new Set(stamps)].join(', ')})`,
    );

    const subject = await page.evaluate(() => {
      const card = document.querySelector('.subject');
      if (!card) return null;
      return {
        headline: card.querySelector('h3')?.textContent ?? '',
        facts: [...card.querySelectorAll('.facts li')].map((n) => n.textContent),
        metrics: [...card.querySelectorAll('.metrics dd')].map((n) => n.textContent),
        caveats: card.querySelector('.caveats')?.textContent ?? '',
      };
    });
    console.log(subject);
    check(Boolean(subject), 'a written summary is shown for the subject');
    if (subject) {
      check(/person/i.test(subject.headline), `the subject is classified from its geometry ("${subject.headline.slice(0, 70)}…")`);
      check(
        subject.facts.some((line) => /m of ground at/.test(line)),
        'the summary quotes the distance and speed it measured',
      );
      check(/say nothing about intent/.test(subject.caveats), 'the summary carries its own caveat about intent');
      const forbidden = /suspicious|intruder|threat|casing|lurking|prowl/i;
      check(
        !forbidden.test([subject.headline, ...subject.facts].join(' ')),
        'the summary does not speculate about intent',
      );
    }

    // Captured here, while a subject is actually on screen and boxed: a
    // screenshot of an idle app proves nothing.
    await page.screenshot({ path: screenshot });
    console.log(`screenshot: ${screenshot}`);

    // Every view has to paint something. A view that silently renders nothing
    // is worse than one that is missing: the operator concludes the yard is
    // empty.
    const painted = {};
    for (const view of ['ironbow', 'motion', 'silhouette', 'edges', 'natural']) {
      await page.evaluate((id) => document.querySelector(`[data-view="${id}"]`).click(), view);
      await new Promise((resolve) => setTimeout(resolve, 400));
      painted[view] = await page.evaluate(() => {
        const canvas = document.getElementById('view');
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4 * 97) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        return seen.size;
      });
      check(painted[view] > 4, `the ${view} view renders a real picture (${painted[view]} distinct colours sampled)`);
    }

    await page.evaluate(() => document.querySelector('[data-tab="plan"]').click());
    await new Promise((resolve) => setTimeout(resolve, 600));
    const planInk = await page.evaluate(() => {
      const canvas = document.getElementById('plan');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 60) painted += 1;
      }
      return painted;
    });
    check(planInk > 500, `the ground plan draws the path in metres (${planInk} px)`);
    const planShot = screenshot.replace(/\.png$/, '-plan.png');
    await page.screenshot({ path: planShot });
    console.log(`screenshot: ${planShot}`);

    await page.evaluate(() => document.querySelector('[data-tab="rf"]').click());
    const rfText = await page.$eval('#tab-rf', (node) => node.textContent);
    check(
      /cannot see through walls/.test(rfText) && /ESP32/.test(rfText),
      'the through-walls tab reports no sensor and names the hardware that would work',
    );

    await page.evaluate(() => document.querySelector('[data-tab="subjects"]').click());

    check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
    server.close();
    await fsp.rm(fixtureDir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
