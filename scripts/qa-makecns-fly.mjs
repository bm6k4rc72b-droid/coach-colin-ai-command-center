/**
 * End-to-end check for MakeCNS Fly, against a page whose claims are checkable.
 *
 * The unit suites test the modules. This tests the *page*, and specifically the
 * things this app would be worst to get wrong — which are not arithmetic errors
 * but presentation ones:
 *
 *   - The provenance line disappearing, so a screenshot of a raster no longer
 *     carries the sentence saying the network was generated.
 *   - The open-loop indicator failing to change when the sensor configuration is
 *     switched to the one the demonstration describes, which would let the app
 *     show an open loop as though it were closed.
 *   - A canvas that is running and painting nothing, which looks identical to a
 *     canvas painting a hover until you check the pixels.
 *   - The hardware panel offering to arm before a bench state has been declared.
 *
 * So the harness loads the real page, waits for the simulation to actually
 * advance, reads what is on screen, and samples the canvases to confirm they
 * contain ink.
 *
 * Usage:
 *   node scripts/qa-makecns-fly.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-makecns-fly
 */

import http from 'node:http';
import fs from 'node:fs';
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

const failures = [];
const checks = [];

/** Record a check. */
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let filePath = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
    if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, body) => {
      if (error) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

/** Whether a canvas has drawn anything at all. */
const CANVAS_HAS_INK = `(id) => {
  const canvas = document.getElementById(id);
  if (!canvas || !canvas.width || !canvas.height) return false;
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 40) if (data[i] > 8) return true;
  return false;
}`;

async function main() {
  const outIndex = process.argv.indexOf('--out');
  const outPath = outIndex > -1 ? process.argv[outIndex + 1] : null;

  const { default: puppeteer } = await import('puppeteer');
  const server = await serve();
  const port = server.address().port;
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    // `domcontentloaded`, not `networkidle0`: this page starts simulating on load
    // and keeps the main thread busy, so waiting for an idle network is waiting
    // for something that never quite arrives.
    await page.goto(`http://localhost:${port}/makecns-fly/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // The simulation must actually advance, not merely load.
    await page.waitForFunction(
      () => document.getElementById('phase-readout')?.textContent?.match(/settling|teacher|unsupervised/),
      { timeout: 15000 },
    );
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

    // 1. Provenance is on screen and says the network is generated.
    const banner = await page.$eval('#honesty-banner', (n) => n.textContent.trim());
    check('the page states the network is not a fly brain', /not/i.test(banner) && /fruit fly/i.test(banner), banner.slice(0, 70));
    const chip = await page.$eval('#provenance-chip', (n) => n.textContent.trim());
    check('the provenance chip names the kind of network', /synthetic/.test(chip), chip);

    // 2. The simulation advances.
    const first = await page.$eval('#phase-readout', (n) => n.textContent);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const second = await page.$eval('#phase-readout', (n) => n.textContent);
    check('the clock advances', first !== second, `${first} then ${second}`);

    // 3. Every pane is painting something.
    for (const id of ['flight-canvas', 'raster-canvas', 'trace-canvas', 'throttle-canvas']) {
      const painted = await page.evaluate(`(${CANVAS_HAS_INK})(${JSON.stringify(id)})`);
      check(`${id} is painting`, painted === true);
    }

    // 4. The open-loop indicator must respond to the sensor configuration. This
    //    is the single most important thing on the page.
    const closed = await page.$eval('#loop-chip', (n) => n.textContent.trim());
    check('the loop reads as closed with proprioception', /closed/i.test(closed), closed);

    await page.select('#sensor-set', 'hand-only');
    await page.waitForFunction(
      () => /open/i.test(document.getElementById('loop-chip')?.textContent ?? ''),
      { timeout: 8000 },
    );
    const open = await page.$eval('#loop-chip', (n) => n.textContent.trim());
    check('switching to the demonstration’s sensors shows the loop is open', /open/i.test(open), open);
    const hint = await page.$eval('#sensor-hint', (n) => n.textContent.trim());
    check('and explains why', /loop is open|nothing the drone does/i.test(hint), hint.slice(0, 70));
    await page.select('#sensor-set', 'hand+proprioception');

    // 5. The hardware panel refuses to arm before a bench state is declared.
    await page.click('[data-tab="link"]');
    await page.click('#link-arm');
    const linkStats = await page.$eval('#link-stats', (n) => n.textContent);
    check('the link will not arm without a device and a bench state',
      /no device|bench state|serial/i.test(linkStats), linkStats.replace(/\s+/g, ' ').slice(0, 90));

    // 6. The ledger starts and reports progress rather than freezing.
    await page.click('[data-tab="ledger"]');
    await page.click('#run-ledger');
    await page.waitForFunction(
      () => /running|complete/.test(document.getElementById('ledger-progress')?.textContent ?? ''),
      { timeout: 15000 },
    );
    const progress = await page.$eval('#ledger-progress', (n) => n.textContent.trim());
    check('the ledger runs in slices and reports progress', /running|complete/.test(progress), progress);
    const responsive = await page.evaluate(() => {
      const start = performance.now();
      return new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now() - start)));
    });
    check('the page stays responsive while the ledger runs', responsive < 400, `${responsive.toFixed(0)} ms to next frame`);

    // 7. The limits tab carries the quoted claim, so the app can be compared to it.
    await page.click('[data-tab="limits"]');
    const quote = await page.$eval('#claim-quote', (n) => n.textContent);
    check('the claim under test is reproduced', /11 seconds/.test(quote) && /166,?700/.test(quote), quote.slice(0, 50));
    const sources = await page.$eval('#sources', (n) => n.textContent);
    check('published figures are cited', /Dorkenwald/.test(sources) && /Scheffer/.test(sources));

    // 8. Phone width must not produce a horizontal scrollbar.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('no horizontal overflow at phone width', overflow <= 1, `${overflow}px`);
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

    if (outPath) {
      await page.click('[data-tab="flight"]');
      await new Promise((resolve) => setTimeout(resolve, 800));
      await page.screenshot({ path: outPath });
    }
  } finally {
    await browser.close();
    server.close();
  }

  for (const entry of checks) {
    console.log(`${entry.ok ? 'ok  ' : 'FAIL'}  ${entry.name}${entry.detail ? `  (${entry.detail})` : ''}`);
  }
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length) {
    console.error(`\n${failures.length} failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
