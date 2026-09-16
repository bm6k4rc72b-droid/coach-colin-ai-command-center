/**
 * End-to-end check for the Black Optic 6 film, in a real browser.
 *
 * The unit suites prove the maths — the gait, the lens, the ballistics, the
 * rule that no voice can say a thing the ledger does not contain. This proves
 * the page: that the film actually assembles, that the operator moves when you
 * scroll and moves *backwards* when you scroll back, that the WebGL backdrop
 * comes up, that the demos run without a camera, and that the honest rows
 * survive the trip from the ledger onto the rendered page.
 *
 * The assertions worth having are the last ones. A marketing page whose
 * inconvenient rows get dropped in a refactor looks identical to one that never
 * had them, and only a check against the rendered DOM can tell the difference.
 *
 * Usage:
 *   node scripts/qa-black-optic-6-site.mjs [--out <screenshot.png>]
 *
 * @module scripts/qa-black-optic-6-site
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
  '.json': 'application/json',
  '.png': 'image/png',
};

/** Load Puppeteer, tolerating a `puppeteer-core`-only install. */
async function loadPuppeteer() {
  try {
    return (await import('puppeteer')).default;
  } catch {
    return (await import('puppeteer-core')).default;
  }
}

/**
 * Find a browser to drive.
 *
 * Puppeteer's own download is the first choice, but plenty of environments —
 * CI images, sandboxes, anywhere with a locked-down cache — ship a Chromium
 * somewhere else instead. Falling through a list of the usual places is the
 * difference between this check running everywhere and running on one laptop.
 */
function findBrowser(puppeteer) {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
    process.env.PLAYWRIGHT_BROWSERS_PATH ? path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium') : null,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* keep looking */ }
  }
  return undefined;
}

/** Serve `public/` on a loopback port. */
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

/** Scroll to a fraction of the document and let a couple of frames land. */
async function scrollTo(page, fraction) {
  // `behavior: 'instant'` matters: the page sets `scroll-behavior: smooth`, so a
  // plain scrollTo animates and every assertion after it reads a stale frame.
  await page.evaluate((f) => {
    const range = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: range * f, behavior: 'instant' });
  }, fraction);
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)));
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const shot = outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(os.tmpdir(), 'black-optic-6-site.png');

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: findBrowser(puppeteer),
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  const failures = [];
  const check = (condition, message) => {
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
  };

  try {
    const page = await browser.newPage();
    // Nothing here should take ten seconds. A hung wait is a failure worth
    // seeing as a failure rather than as a job that never ends.
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

    // Record what the operator canvas is actually asked to draw. A figure that
    // "renders" but never moves is the failure mode a screenshot cannot catch.
    await page.evaluateOnNewDocument(() => {
      window.__figures = [];
      const original = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function patched(...args) {
        if (this.canvas && this.canvas.id === 'operator') window.__figures.push(Date.now());
        return original.apply(this, args);
      };
    });

    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/net::ERR|Failed to load resource/.test(message.text())) {
        errors.push(message.text());
      }
    });

    const origin = `http://127.0.0.1:${port}`;
    // `load` plus the page's own ready flag, rather than `networkidle0`: the
    // film runs a continuous animation frame loop, and waiting on network
    // quiet for a page that is never quiet is how a check hangs instead of
    // failing.
    await page.goto(`${origin}/black-optic-6-site/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-site="ready"]', { timeout: 10000 });

    // ------------------------------------------------------------ structure
    const title = await page.title();
    check(/Black Optic 6/.test(title), `the page is named Black Optic 6 ("${title}")`);

    const acts = await page.$$eval('.act', (nodes) => nodes.length);
    check(acts === 11, `all eleven acts are laid out (${acts})`);

    const emptyLines = await page.$$eval('[data-line]', (nodes) => nodes.filter((n) => !n.textContent.trim()).length);
    check(emptyLines === 0, 'every act got its line out of the catalogue');

    const tally = await page.$$eval('.tally__cell', (nodes) => nodes.map((n) => n.textContent));
    check(tally.length === 4 && tally.every((text) => /\d/.test(text)),
      `the title card counts the ledger (${tally.join(' · ')})`);

    // ----------------------------------------------------------- the stage
    const webgl = await page.evaluate(() => {
      const canvas = document.getElementById('backdrop');
      return Boolean(canvas && canvas.width > 1 && canvas.getContext('webgl'));
    });
    check(webgl, 'the WebGL backdrop came up');

    // Read the shader's output from a scratch canvas rendered in this same task.
    // The live backdrop's drawing buffer is discarded after compositing unless
    // `preserveDrawingBuffer` is on, so reading it later returns zeros whether
    // the shader works or not — a check that cannot fail is worse than none.
    const painted = await page.evaluate(async () => {
      const { Backdrop } = await import('./js/anamorphic.js');
      const canvas = document.createElement('canvas');
      const backdrop = new Backdrop(canvas);
      if (!backdrop.ok) return { ok: false, pixels: [] };
      backdrop.resize(320, 180, 1);
      backdrop.render({ time: 2.5, progress: 0.4, scene: 2, energy: 0.6, tint: [0.2, 0.5, 0.7] });
      const pixels = new Uint8Array(4);
      backdrop.gl.readPixels(
        Math.floor(canvas.width / 2), Math.floor(canvas.height / 2),
        1, 1, backdrop.gl.RGBA, backdrop.gl.UNSIGNED_BYTE, pixels,
      );
      return { ok: true, pixels: [...pixels] };
    });
    check(painted.ok && painted.pixels.slice(0, 3).some((channel) => channel > 4),
      `the shader is drawing something, not a black frame (rgb ${painted.pixels.slice(0, 3).join(',')})`);

    // --------------------------------------------------------- the operator
    // Scroll forward: he must get bigger. Scroll back: he must get smaller and
    // walk back through the same footfalls rather than resetting.
    const figureAt = (fraction) => page.evaluate((f) => {
      const range = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: range * f, behavior: 'instant' });
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          // Recompute from the same modules the page uses.
          import('./js/operator.js').then((operator) => {
            const state = operator.operatorAt(f, { frameHeight: window.innerHeight });
            resolve({ height: state.heightPx, distance: state.distanceM, steps: state.steps, phase: state.pose.phase });
          }).catch((error) => resolve({ error: String(error), height: 0, distance: 0, steps: 0, phase: 0 }));
        }));
      });
    }, fraction);

    const near = await figureAt(0.1);
    const mid = await figureAt(0.5);
    const close = await figureAt(0.95);
    check(near.height < mid.height && mid.height < close.height,
      `the operator walks closer as the page scrolls (${near.height.toFixed(0)} → ${mid.height.toFixed(0)} → ${close.height.toFixed(0)} px)`);
    check(near.distance > close.distance && close.distance < 4,
      `he arrives at the lens (${near.distance.toFixed(1)} m → ${close.distance.toFixed(1)} m)`);
    check(near.steps < mid.steps && mid.steps < close.steps,
      `his step count is driven by ground covered (${near.steps.toFixed(1)} → ${close.steps.toFixed(1)} steps)`);

    const backAgain = await figureAt(0.1);
    check(Math.abs(backAgain.phase - near.phase) < 1e-9,
      'scrolling back walks him backwards through exactly the same footfalls');

    await scrollTo(page, 0.35);
    const drew = await page.evaluate(() => window.__figures.length);
    check(drew > 3, `the operator canvas is being repainted (${drew} frames)`);

    // -------------------------------------------------------------- content
    const cameras = await page.$$eval('#camera-grid .card', (nodes) => nodes.length);
    check(cameras >= 12, `every camera route is listed (${cameras})`);

    const palettes = await page.$$eval('#palette-grid .palette-card', (nodes) => nodes.length);
    check(palettes === 13, `all thirteen thermal palettes are shown (${palettes})`);

    const rampPainted = await page.evaluate(() => {
      const canvas = document.querySelector('#palette-grid canvas');
      const ctx = canvas.getContext('2d');
      const left = ctx.getImageData(2, 5, 1, 1).data;
      const right = ctx.getImageData(canvas.width - 3, 5, 1, 1).data;
      return { left: [...left].slice(0, 3), right: [...right].slice(0, 3) };
    });
    check(rampPainted.left.join() !== rampPainted.right.join(),
      `the palette strips are real ramps, not flat blocks (${rampPainted.left.join()} → ${rampPainted.right.join()})`);

    const satellites = await page.$$eval('#satellite-table tbody tr', (nodes) => nodes.length);
    check(satellites === 5, `the five spacecraft are tabulated (${satellites})`);

    const ladder = await page.$$eval('#ladder-table tbody tr', (nodes) => nodes.length);
    check(ladder >= 4, `the resolution ladder prices every rung (${ladder})`);

    const highlights = await page.evaluate(() => ({
      drones: document.querySelectorAll('#drone-grid .card').length,
      watches: document.querySelectorAll('#wearable-grid .card').length,
      glasses: document.querySelectorAll('#glasses-grid .card').length,
    }));
    check(highlights.drones >= 4 && highlights.watches >= 3 && highlights.glasses >= 2,
      `drones, watches and glasses are each highlighted (${highlights.drones}/${highlights.watches}/${highlights.glasses})`);

    // ---------------------------------------------------------- the ledger
    const ledgerRows = await page.$$eval('#ledger-rows .ledger-row', (nodes) => nodes.length);
    check(ledgerRows >= 10, `the honest rows survived onto the page (${ledgerRows})`);

    const alarming = await page.$$eval('#ledger-rows .badge[data-tone="alert"]', (nodes) => nodes.length);
    check(alarming === ledgerRows, 'every row in that act is marked unsound, not softened');

    const blockedShown = await page.evaluate(() => {
      const text = document.body.textContent;
      return text.includes('Apple Watch') && text.includes('Smart-glasses live feed');
    });
    check(blockedShown, 'the blocked devices are named on the page rather than omitted');

    const turret = await page.evaluate(() => {
      const range = document.getElementById('act-range');
      return /not a targeting system/i.test(range.textContent);
    });
    check(turret, 'the range section states out loud what it is not');

    // ------------------------------------------------------------- the demo
    await scrollTo(page, 0.78);
    await page.waitForSelector('#demo-canvas');
    const demoMoving = await page.evaluate(() => new Promise((resolve) => {
      const canvas = document.getElementById('demo-canvas');
      const ctx = canvas.getContext('2d');
      const sample = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const before = sample();
      setTimeout(() => {
        const after = sample();
        let changed = 0;
        for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i]) changed += 1;
        resolve(changed);
      }, 600);
    }));
    check(demoMoving > 200, `the demo runs with no camera granted (${demoMoving} pixels changed)`);

    const readout = await page.$eval('#demo-readout', (node) => node.textContent);
    check(/sample scene/i.test(readout), `the demo says where its picture comes from ("${readout.slice(0, 48)}…")`);

    // A palette applied to brightness must never print degrees.
    await page.evaluate(() => {
      const canvas = document.getElementById('demo-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, pointerId: 1,
      }));
    });
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    const spotText = await page.$eval('#demo-readout', (node) => node.textContent);
    check(/% of scale/.test(spotText) && !/°C/.test(spotText),
      `a brightness field reads as "% of scale", never degrees ("${spotText.slice(0, 70)}…")`);

    // ------------------------------------------------------------ the range
    await scrollTo(page, 0.66);
    await page.waitForSelector('#range-canvas');
    const dopeRows = await page.$$eval('#dope-table tbody tr', (nodes) => nodes.length);
    check(dopeRows === 6, `the dope card is solved for every distance (${dopeRows})`);

    await page.click('#range-fire');
    const result = await page.$eval('#range-result', (node) => node.textContent);
    check(/Hit|Miss/.test(result) && /"/.test(result),
      `firing reports where the bullet went and why ("${result.slice(0, 70)}…")`);

    await page.click('#range-reveal');
    const reveal = await page.$eval('#range-result', (node) => node.textContent);
    check(/mil/.test(reveal), `the trainer then shows the correct hold ("${reveal.slice(0, 64)}…")`);

    // ----------------------------------------------------------- the guides
    const guides = await page.evaluate(async () => {
      const voices = await import('./js/voices.js');
      const names = new Set(voices.PERSONAS.map((p) => p.name));
      const scripts = voices.allScripts();
      return { guides: names.size, acts: scripts.length, lines: scripts.reduce((n, s) => n + s.lines.length, 0) };
    });
    check(guides.guides >= 9, `each act has its own guide (${guides.guides} distinct voices)`);
    check(guides.lines > 60, `and a script assembled from the ledger (${guides.lines} spoken lines)`);

    const guideChip = await page.$eval('#guide-name', (node) => node.textContent);
    check(guideChip.length > 0, `the guide chip names who is narrating ("${guideChip}")`);

    // The guide must follow the scroll.
    await scrollTo(page, 0.25);
    const optics = await page.$eval('#guide-name', (node) => node.textContent);
    await scrollTo(page, 0.9);
    const later = await page.$eval('#guide-name', (node) => node.textContent);
    check(optics !== later, `the guide changes with the act ("${optics}" → "${later}")`);

    // -------------------------------------------------------- accessibility
    const readable = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('h1, h2')].map((n) => n.textContent.trim());
      return { headings: headings.length, h1: document.querySelectorAll('h1').length };
    });
    check(readable.h1 === 1 && readable.headings >= 10,
      `the page is a document first (${readable.headings} headings, ${readable.h1} h1)`);

    const skip = await page.$eval('.skip', (node) => node.getAttribute('href'));
    check(skip === '#acts', 'there is a skip link past the film');

    // Reduced motion must still produce a complete page.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-site="ready"]');
    const stillThere = await page.$$eval('.card', (nodes) => nodes.filter((n) => {
      const style = getComputedStyle(n);
      return style.opacity !== '0' && style.visibility !== 'hidden';
    }).length);
    check(stillThere > 20, `reduced motion keeps every card visible (${stillThere})`);

    await page.emulateMediaFeatures([]);

    // --------------------------------------------------------------- mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[data-site="ready"]');
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    check(overflow <= 1, `nothing overflows a phone (${overflow}px of horizontal scroll)`);

    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await scrollTo(page, 0.3);
    await page.screenshot({ path: shot });
    console.log(`\nscreenshot → ${shot}`);

    check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('\nall checks passed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
