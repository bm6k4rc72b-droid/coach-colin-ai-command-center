/**
 * End-to-end smoke test for the Baseline camera-vitals app.
 *
 * Chromium can be handed a Y4M file as a camera, so the whole app — the
 * permission flow, the capture loop, the region finder, the estimator, the
 * baseline, the coach and the ledger — runs without a phone or a person. The
 * fixture is a synthetic face whose skin colour pulses at exactly 66 beats a
 * minute, with the three channels modulated by different amounts the way
 * haemoglobin modulates them, so the right answer is known: if the app reports
 * anything but about 66, something in the chain is wrong.
 *
 * Usage:
 *   node scripts/qa-baseline.mjs [--keep] [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-baseline
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const WIDTH = 240;
const HEIGHT = 180;
const FPS = 30;
const TRUE_BPM = 66;
// Ten seconds is exactly eleven cardiac cycles at 66 bpm, so the clip loops
// without a phase discontinuity — a seam would look like a missed beat.
const CLIP_SECONDS = 10;
const SCAN_SECONDS = 30;

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
 * Paint one frame of the synthetic subject as RGB bytes.
 *
 * @param {number} frame Frame index.
 * @returns {Uint8ClampedArray} RGB triples, row-major.
 */
function renderFixture(frame) {
  const rgb = new Uint8ClampedArray(WIDTH * HEIGHT * 3);
  const t = frame / FPS;
  const pulse = Math.sin(2 * Math.PI * (TRUE_BPM / 60) * t);
  // Four per cent, where real skin manages about one. The fixture has to
  // survive chroma subsampling and eight-bit quantization in the codec, neither
  // of which a real camera's raw frames go through.
  const amplitude = 0.04;
  const skin = [
    196 * (1 - amplitude * 0.35 * pulse),
    142 * (1 - amplitude * pulse),
    124 * (1 - amplitude * 0.55 * pulse),
  ];

  const cx = WIDTH * 0.5;
  const cy = HEIGHT * 0.42;
  const rx = WIDTH * 0.3;
  const ry = HEIGHT * 0.36;

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const inside = dx * dx + dy * dy <= 1;
      const p = (y * WIDTH + x) * 3;
      if (inside) {
        // Gentle shading so the face is not a flat disc of one colour.
        const shade = 1 - 0.08 * Math.sqrt(dx * dx + dy * dy);
        rgb[p] = skin[0] * shade;
        rgb[p + 1] = skin[1] * shade;
        rgb[p + 2] = skin[2] * shade;
      } else {
        rgb[p] = 22 + ((x + y) % 5);
        rgb[p + 1] = 34 + ((x * 3) % 5);
        rgb[p + 2] = 52 + ((y * 2) % 5);
      }
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
  const handle = await fsp.open(file, 'w');
  await handle.write(Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FPS}:1 Ip A1:1 C420\n`));
  const frames = CLIP_SECONDS * FPS;
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
 * Seed a plausible history, so the run exercises scoring rather than the
 * still-building-a-baseline path.
 *
 * @param {number} scanSeconds Scan length to store in settings.
 * @returns {object} Values for `localStorage`.
 */
function seedStorage(scanSeconds) {
  const day = 86400000;
  const now = Date.now();
  const sessions = [];
  for (let i = 8; i >= 1; i -= 1) {
    sessions.push({
      at: now - i * day,
      kind: 'resting',
      bpm: 64 + (i % 3) - 1,
      rmssd: 44 + ((i % 4) - 2) * 3,
      sdnn: 58,
      hrvReliable: true,
      breathsPerMin: 13,
      confidence: 0.8,
      grade: 'good',
      snrDb: 8,
      beats: 38,
      durationSec: 40,
      method: 'pos',
      readiness: 66,
      band: 'ready',
      tier: 'easy',
    });
  }
  return {
    'baseline.sessions.v1': JSON.stringify(sessions),
    'baseline.settings.v1': JSON.stringify({ scanSeconds, speak: false, breathMinutes: 1 }),
    'baseline.profile.v1': JSON.stringify({ age: 41, goal: 'endurance', maxHr: null }),
    'baseline.context.v1': JSON.stringify({
      sleepHours: 7.5, sleepQuality: 3, soreness: 1, stress: 1, alcoholUnits: 0,
      planned: 'moderate', answeredAt: now,
    }),
  };
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
    : path.join(os.tmpdir(), 'baseline-smoke.png');

  const fixtureDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'baseline-'));
  const fixture = path.join(fixtureDir, 'face.y4m');
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

    // Seeded before the first navigation rather than by loading and reloading:
    // a reload cancels the manifest and icon requests mid-flight, and the
    // console errors that produces are indistinguishable from real ones.
    await page.evaluateOnNewDocument((seed) => {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
    }, seedStorage(SCAN_SECONDS));
    await page.goto(`http://127.0.0.1:${port}/baseline/index.html`, { waitUntil: 'load' });

    const gateNote = await page.$eval('#gateNote', (node) => node.textContent);
    check(/Baseline ready/.test(gateNote), `the seeded baseline is recognised on load ("${gateNote.slice(0, 60)}…")`);

    await page.click('#startBtn');
    await page.waitForFunction(() => document.getElementById('startGate').hidden, { timeout: 15000 });
    check(true, 'the camera opened and the gate closed');

    // The live estimate has to appear well before the scan ends: it is what
    // tells a real user the scan is working rather than merely counting down.
    await page.waitForFunction(
      () => document.getElementById('liveBpm').textContent !== '—',
      { timeout: 20000 },
    );
    const live = await page.evaluate(() => ({
      bpm: Number(document.getElementById('liveBpm').textContent),
      fps: document.getElementById('fpsText').textContent,
      engine: document.getElementById('engineText').textContent,
      quality: ['qLight', 'qStill', 'qFace'].map((id) => document.getElementById(id).className),
      waveInk: (() => {
        const canvas = document.getElementById('wave');
        const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        let painted = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
        return painted;
      })(),
    }));
    console.log(live);
    check(Math.abs(live.bpm - TRUE_BPM) <= 5, `the live estimate finds the fixture's pulse (${live.bpm} vs ${TRUE_BPM})`);
    check(parseFloat(live.fps) > 8, `capture keeps a usable frame rate (${live.fps})`);
    check(live.engine === 'frame clock', `frame timing comes from the media clock (${live.engine})`);
    check(live.quality.every((className) => !/bad/.test(className)),
      `the quality gate is satisfied by the fixture (${live.quality.join(' | ')})`);
    check(live.waveInk > 200, `the live waveform is drawn (${live.waveInk} px)`);

    await page.waitForSelector('#resultSheet:not([hidden])', { timeout: 40000 });
    const result = await page.evaluate(() => ({
      bpm: Number(document.getElementById('outBpm').textContent),
      bpmRef: document.getElementById('outBpmRef').textContent,
      hrv: document.getElementById('outHrv').textContent,
      breath: document.getElementById('outBreath').textContent,
      grade: document.getElementById('outGrade').textContent,
      readiness: document.getElementById('readinessScore').textContent,
      band: document.getElementById('readinessBand').textContent,
      drivers: document.querySelectorAll('#readinessDrivers .driver').length,
      verdict: document.getElementById('planVerdict').textContent,
      session: document.getElementById('planTitle').textContent,
      blocks: document.querySelectorAll('#planBlocks li').length,
      zones: document.querySelectorAll('#planZones .zone').length,
      allowed: document.querySelectorAll('#planZones .zone.allowed').length,
      rationale: document.querySelectorAll('#planRationale li').length,
      disclaimer: document.querySelector('#resultSheet .disclaimer').textContent,
    }));
    console.log(result);

    check(Math.abs(result.bpm - TRUE_BPM) <= 3,
      `the finished scan reports the fixture's true rate (${result.bpm} vs ${TRUE_BPM})`);
    check(/usually 6[0-9]/.test(result.bpmRef), `the reading is quoted against the baseline ("${result.bpmRef}")`);
    check(result.grade !== 'unusable', `the scan graded ${result.grade}`);
    // The fixture's pulse is a metronome, so its variability must come back
    // near zero. Anything above about 25 ms would mean the beat detector is
    // jittering by a frame or two and inventing variability out of the grid.
    const hrvMs = Number.parseFloat(result.hrv);
    check(Number.isFinite(hrvMs) && hrvMs < 25,
      `variability is measured and reads low for a metronomic pulse (${result.hrv})`);
    // Nothing in the fixture breathes, so nothing should be reported to.
    check(result.breath === '—', `no breathing rate is invented (${result.breath})`);
    check(/^\d+$/.test(result.readiness) && Number(result.readiness) > 0,
      `readiness was scored (${result.readiness} — ${result.band})`);
    check(result.drivers >= 3, `readiness names its drivers (${result.drivers})`);
    check(result.verdict.length > 3 && result.session.length > 3,
      `a session was prescribed ("${result.verdict}" — "${result.session}")`);
    check(result.blocks >= 2, `the session has blocks (${result.blocks})`);
    check(result.zones === 5 && result.allowed >= 1 && result.allowed < 5,
      `zones are shown with a ceiling (${result.allowed} of ${result.zones} allowed)`);
    check(result.rationale >= 2, `the prescription shows its reasoning (${result.rationale} lines)`);
    check(/not a medical device/i.test(result.disclaimer), 'the medical disclaimer is on the result');

    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('baseline.sessions.v1') || '[]'),
    );
    const newest = stored[stored.length - 1];
    check(stored.length === 9, `the scan reached the ledger (${stored.length} rows)`);
    check(newest.kind === 'resting' && Math.abs(newest.bpm - TRUE_BPM) <= 3,
      `the stored row matches the readout (${newest.bpm} bpm, ${newest.kind})`);
    check(newest.readiness !== null && newest.tier !== null,
      `the stored row carries the prescription (${newest.tier})`);

    // The coach: an offline answer must arrive with no key configured.
    await page.click('#askBtn');
    await page.waitForSelector('#coachSheet:not([hidden])', { timeout: 5000 });
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('.suggestion'))
        .find((node) => /zones/i.test(node.textContent));
      button.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('#coachLog .line.coach').length > 0,
      { timeout: 5000 });
    const coachReply = await page.$eval('#coachLog .line.coach', (node) => node.textContent);
    check(/Z1 Recovery: \d+–\d+/.test(coachReply), `the offline coach answers with real zones ("${coachReply.slice(0, 48)}…")`);

    // Trends.
    await page.evaluate(() => {
      document.querySelectorAll('.sheet').forEach((sheet) => { sheet.hidden = true; });
      document.getElementById('trendsBtn').click();
    });
    await page.waitForSelector('#trendsSheet:not([hidden])', { timeout: 5000 });
    const trends = await page.evaluate(() => ({
      state: document.getElementById('baselineState').textContent,
      lines: document.querySelectorAll('.trend svg polyline').length,
      rows: document.querySelectorAll('.session-row').length,
      csv: null,
    }));
    check(/Baseline from \d+ resting scans/.test(trends.state), `the baseline is described ("${trends.state.slice(0, 50)}…")`);
    check(trends.lines >= 2, `trend lines are drawn (${trends.lines})`);
    check(trends.rows >= 9, `sessions are listed (${trends.rows})`);

    // Breathing: start a round, confirm the pacing drives the orb and the camera
    // keeps reading, then finish early rather than waiting out the minute.
    await page.evaluate(() => {
      document.querySelectorAll('.sheet').forEach((sheet) => { sheet.hidden = true; });
      document.getElementById('breatheBtn').click();
    });
    await page.waitForSelector('#breathSheet:not([hidden])', { timeout: 5000 });
    const protocols = await page.$$eval('.protocol', (nodes) => nodes.length);
    check(protocols === 4, `every breathing protocol is offered (${protocols})`);

    await page.click('#breathStartBtn');
    await page.waitForFunction(() => !document.getElementById('breathPanel').hidden, { timeout: 5000 });
    const phases = new Set();
    for (let i = 0; i < 14; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 900); });
      // eslint-disable-next-line no-await-in-loop
      phases.add(await page.$eval('#breathOrb', (node) => node.dataset.phase));
    }
    check(phases.has('in') && phases.has('out'), `the pacing walks its phases (${[...phases].join(', ')})`);
    const breathBpm = await page.$eval('#breathBpm', (node) => node.textContent);
    check(Math.abs(Number(breathBpm) - TRUE_BPM) <= 6,
      `the pulse is still being read during the breathing round (${breathBpm})`);

    await page.click('#breathStopBtn');
    await page.waitForSelector('#breathResult:not([hidden])', { timeout: 8000 });
    const breathResult = await page.$eval('#breathResult', (node) => node.textContent);
    check(breathResult.length > 40, `the breathing round is scored ("${breathResult.slice(0, 60)}…")`);

    // Hidden panels must actually be gone: a still-painted gate silently eats
    // every tap on the panels underneath it.
    const covered = await page.evaluate(() => ['startGate', 'scanPanel', 'breathPanel']
      .filter((id) => getComputedStyle(document.getElementById(id)).display !== 'none'));
    check(covered.length === 0, `hidden panels are not painted (${covered.join(', ') || 'none'})`);

    check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);

    await page.evaluate(() => {
      document.querySelectorAll('.sheet').forEach((sheet) => { sheet.hidden = true; });
      document.getElementById('resultSheet').hidden = false;
      // Clicking a button inside a sheet scrolls it into view, so the sheet is
      // wound back before the screenshot: otherwise the picture is of whatever
      // the last click happened to reveal.
      document.querySelector('#resultSheet .sheet-body').scrollTop = 0;
    });
    await page.screenshot({ path: screenshot });
    console.log(`screenshot: ${screenshot}`);
  } finally {
    await browser.close();
    server.close();
    if (!args.includes('--keep')) await fsp.rm(fixtureDir, { recursive: true, force: true });
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
