/**
 * End-to-end check for Carrier, in a real browser.
 *
 * The unit suites can prove the engine's arithmetic and where it asks for text
 * to be drawn. They cannot prove that anything reached the screen, that the
 * fonts measured the way the layout assumed, or that the browser will actually
 * hand back a video file at the end. This does all three against the real app.
 *
 * The load-bearing assertion is the third one: that the band the host app draws
 * its own navigation over is *empty* in a rendered frame, and the band below it
 * is not. That is the single design claim the whole engine is built around, and
 * it is only checkable on pixels.
 *
 * Usage:
 *   node scripts/qa-carrier.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-carrier
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
};

/** A two-scene episode, short enough to record inside a test run. */
const SHORT_EPISODE = {
  id: 'qa-short',
  title: 'QA short',
  speaker: 'QA',
  theme: 'nightowl',
  size: { w: 1080, h: 1920 },
  safeArea: { top: 300, bottom: 470 },
  scenes: [
    {
      id: 'one',
      kicker: '01 · qa',
      title: 'First [Scene]',
      seconds: 2,
      caption: 'One two three.',
      stats: [{ label: 'state', value: 'ok', tone: 'good' }],
      panel: { type: 'sniffer' },
    },
    {
      id: 'two',
      kicker: '02 · qa',
      title: 'Second !Scene!',
      seconds: 2,
      caption: 'Four five six.',
      stats: [{ label: 'state', value: 'ok', tone: 'good' }],
      panel: { type: 'heatmap' },
    },
  ],
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
 * Serve `public/` on a loopback port.
 *
 * @returns {Promise<{server: import('node:http').Server, port: number}>} The server.
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
 * Ink coverage per horizontal band of the rendered frame.
 *
 * "Ink" is any pixel meaningfully brighter than the ground, which the character
 * rain is not — it is drawn at a few percent opacity precisely so that it never
 * counts as content.
 *
 * @param {import('puppeteer').Page} page The open app.
 * @returns {Promise<{top: number, title: number, panel: number, bottom: number}>}
 *   Coverage per band, 0..1.
 */
function bandCoverage(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('frame');
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bands = {
      top: [0, 300],
      title: [300, 560],
      panel: [560, 1240],
      bottom: [canvas.height - 470, canvas.height],
    };
    const coverage = {};
    for (const [name, [from, to]] of Object.entries(bands)) {
      let ink = 0;
      let total = 0;
      for (let y = from; y < to; y += 4) {
        for (let x = 0; x < canvas.width; x += 4) {
          const p = (y * canvas.width + x) * 4;
          const luma = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
          if (luma > 70) ink += 1;
          total += 1;
        }
      }
      coverage[name] = ink / total;
    }
    return coverage;
  });
}

/**
 * A cheap fingerprint of the current frame, for telling frames apart.
 *
 * @param {import('puppeteer').Page} page The open app.
 * @returns {Promise<number>} A hash of the pixels.
 */
function frameHash(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('frame');
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 997) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

/**
 * Run the check.
 *
 * @returns {Promise<void>} Resolves when the report has been printed.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const shot = outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(os.tmpdir(), 'carrier-smoke.png');

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
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
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

    // Downloads cannot land on disk here, so the blobs are counted instead.
    await page.evaluateOnNewDocument(() => {
      window.__blobs = [];
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        if (blob instanceof Blob) window.__blobs.push({ type: blob.type, size: blob.size });
        return original(blob);
      };
      HTMLAnchorElement.prototype.click = function noop() {};
    });

    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${port}/carrier/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#scene-list button');

    const sceneCount = await page.$$eval('#scene-list button', (nodes) => nodes.length);
    check(sceneCount === 7, `the shipped episode loads with its scenes (${sceneCount})`);

    const size = await page.evaluate(() => {
      const canvas = document.getElementById('frame');
      return { w: canvas.width, h: canvas.height };
    });
    check(size.w === 1080 && size.h === 1920, `the canvas is a 9:16 frame (${size.w}×${size.h})`);

    // The guides paint over the safe bands, so they come off before pixels are read.
    await page.click('#guides');

    const opening = await bandCoverage(page);
    check(
      opening.top < 0.02,
      `the host's header band is left empty (${(opening.top * 100).toFixed(2)}% ink)`,
    );
    check(
      opening.title > opening.top * 3 && opening.title > 0.01,
      `the headline sits below it (${(opening.title * 100).toFixed(2)}% ink)`,
    );
    check(
      opening.panel > 0.02,
      `the panel is drawn (${(opening.panel * 100).toFixed(2)}% ink)`,
    );
    check(
      opening.bottom < 0.02,
      `the host's caption band is left empty (${(opening.bottom * 100).toFixed(2)}% ink)`,
    );

    // Every scene renders, and renders differently.
    const hashes = [];
    for (let i = 0; i < sceneCount; i += 1) {
      await page.evaluate((index) => {
        document.querySelectorAll('#scene-list button')[index].click();
      }, i);
      await new Promise((resolve) => setTimeout(resolve, 120));
      hashes.push(await frameHash(page));
    }
    check(new Set(hashes).size === sceneCount, `all ${sceneCount} scenes draw a distinct frame`);

    // Playback advances the clock.
    await page.click('#play');
    await new Promise((resolve) => setTimeout(resolve, 700));
    await page.click('#play');
    const played = await page.$eval('#time', (node) => node.textContent);
    check(/^[1-9]/.test(played.trim()) || parseFloat(played) > 0, `playback advances the clock (${played})`);

    // The checks deck agrees with the unit suite.
    await page.click('.tab[data-tab="checks"]');
    const findings = await page.$eval('#findings', (node) => node.textContent.trim());
    check(/Every caption fits/.test(findings), 'the checks deck reports the episode clean');
    const sources = await page.$$eval('#sources li', (nodes) => nodes.length);
    check(sources >= 5, `citations are listed (${sources})`);

    // A short episode, pasted in and recorded end to end.
    await page.click('.tab[data-tab="export"]');
    await page.click('#paste-script');
    await page.$eval('#script-json', (node, json) => {
      node.value = json;
    }, JSON.stringify(SHORT_EPISODE));
    await page.click('#paste-script');
    await page.waitForFunction(
      () => document.querySelectorAll('#scene-list button').length === 2,
      { timeout: 4000 },
    );
    check(true, 'a pasted script replaces the episode');

    await page.select('#f-fps', '24');
    await page.click('#record');
    await page.waitForFunction(
      () => /^Saved|cannot|failed/i.test(document.getElementById('record-status').textContent),
      { timeout: 30000 },
    );
    const status = await page.$eval('#record-status', (node) => node.textContent);
    const blobs = await page.evaluate(() => window.__blobs.filter((b) => /video/.test(b.type)));
    check(/^Saved/.test(status), `the recorder produced a file (${status})`);
    check(
      blobs.length > 0 && blobs[0].size > 10_000,
      `the file has frames in it (${blobs[0]?.size ?? 0} bytes)`,
    );

    // A still, which is the other half of the export path.
    const before = await page.evaluate(() => window.__blobs.length);
    await page.click('#save-frame');
    await page.waitForFunction(
      (count) => window.__blobs.length > count,
      { timeout: 5000 },
      before,
    );
    const png = await page.evaluate(() => window.__blobs.at(-1));
    check(png.type === 'image/png' && png.size > 10_000, `a frame exports as a PNG (${png.size} bytes)`);

    await page.screenshot({ path: shot });
    console.log(`\nscreenshot: ${shot}`);

    check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(failures.length ? `\n${failures.length} failed` : '\nall checks passed');
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
