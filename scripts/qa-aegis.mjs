/**
 * End-to-end check for Aegis, through the browser it actually runs in.
 *
 * The unit suites replay the detector from Node, which proves the arithmetic.
 * This proves the console: real canvases, real device pixel ratios, the real
 * animation loop, the real service worker registration, and the real DOM that
 * a person reads a verdict off. Those are the things a unit test cannot see
 * going wrong, and the ways they go wrong — an overlay projected through the
 * wrong fit, a panel that never updates, a page error on the third scenario —
 * are silent.
 *
 * Every one of the eight scenarios is run to completion and its verdict
 * asserted, so a change that quietly makes the system eager fails here as well
 * as in the unit suite. The two "I'm fine" paths — the button and the sentence
 * typed to Vera — are exercised, because between them they are how every false
 * positive this product ever raises will be dismissed.
 *
 * Usage:
 *   node scripts/qa-aegis.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-aegis
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCENARIOS } from '../public/aegis/js/demo.js';
import { ALARM, CHECK } from '../public/aegis/js/fusion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
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
 * Serve `public/` on an ephemeral port.
 *
 * @returns {Promise<{server: http.Server, port: number}>} The listening server.
 */
function serve() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let file = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
    if (file.endsWith(path.sep)) file = path.join(file, 'index.html');
    if (!file.startsWith(PUBLIC_DIR)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Run the checks.
 *
 * @returns {Promise<void>} Resolves when finished; sets `process.exitCode`.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const screenshot = outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(os.tmpdir(), 'aegis-smoke.png');

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
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${port}/aegis/index.html`, { waitUntil: 'load' });

    // The console has to state what it is not before it states what it is.
    const disclaimer = await page.$eval('.setup-foot', (node) => node.textContent);
    check(/not a medical device/i.test(disclaimer), 'the console says plainly that it is not a medical device');

    const gaps = await page.$$eval('#gaps li', (nodes) => nodes.map((n) => n.textContent));
    check(gaps.length === 3, `with nothing running, all three blind spots are stated (${gaps.length})`);
    check(
      gaps.some((text) => /bathroom/i.test(text)),
      'the console admits it cannot see the bathroom without a carried phone',
    );

    // Vera answers before any sensor is on.
    await page.type('#ask-input', 'is this private');
    await page.click('.send');
    await page.waitForFunction(
      () => /nothing leaves this device/i.test(document.getElementById('vera-line').textContent),
      { timeout: 5000 },
    );
    check(true, 'Vera answers a question with no sensors running');

    // The demonstration is started once, from the button a presenter uses.
    await page.click('#start-demo');
    await page.waitForFunction(() => globalThis.__aegis?.mode === 'demo', { timeout: 10000 });
    check(true, 'the guided tour starts from the empty state');

    // Then every scenario, run to completion and asserted.
    for (const [index, scenario] of SCENARIOS.entries()) {
      await page.evaluate((id) => {
        document.querySelectorAll('.scenario-pill').forEach((pill, i) => {
          if (i === id) pill.click();
        });
      }, index);
      await page.waitForFunction(
        (id) => globalThis.__aegis?.scenario === id,
        { timeout: 10000 },
        scenario.id,
      );
      const seconds = scenario.seconds + 4;
      const peak = await page.evaluate(async (ms) => {
        const started = performance.now();
        let best = 0;
        let bestState = null;
        while (performance.now() - started < ms) {
          const snapshot = globalThis.__aegis;
          if (snapshot && snapshot.belief > best) { best = snapshot.belief; bestState = { ...snapshot }; }
          await new Promise((resolve) => { setTimeout(resolve, 60); });
        }
        return { best, bestState };
      }, seconds * 1000);

      if (scenario.kind === 'positive') {
        check(
          peak.best >= ALARM,
          `${scenario.id}: alarms as it should (${(peak.best * 100).toFixed(0)}%)`,
        );
        if (scenario.id === 'occluded') {
          check(
            Boolean(peak.bestState?.imputed) || peak.bestState?.occlusion > 0,
            'occluded: the floor reference is reported as coasted, not invented',
          );
        }
      } else {
        check(
          peak.best < CHECK,
          `${scenario.id}: stays quiet as it should (${(peak.best * 100).toFixed(0)}%)`,
        );
      }
      // Standing the ladder down between scenarios, so a lingering countdown
      // from a fall cannot suppress the next one.
      await page.evaluate(() => {
        const button = document.getElementById('im-fine');
        if (button && !document.getElementById('ladder').hidden) button.click();
      });
    }

    // The response ladder, end to end, on the shortest path.
    await page.evaluate(() => document.getElementById('rehearse')?.click());
    await page.waitForFunction(
      () => ['asking', 'confirming', 'alerting'].includes(globalThis.__aegis?.ladder),
      { timeout: 15000 },
    );
    check(true, 'the rehearsal climbs the ladder on demand');

    // The sentence that matters, typed rather than clicked, with the curly
    // apostrophe a phone keyboard actually produces.
    await page.type('#ask-input', 'I’m fine');
    await page.click('.send');
    await page.waitForFunction(
      () => globalThis.__aegis?.ladder === 'stood-down',
      { timeout: 8000 },
    );
    check(true, 'saying “I’m fine” with a typographic apostrophe stands the ladder down');

    const ledger = await page.$$eval('#ledger-list li', (nodes) => nodes.length);
    check(ledger > 0, `the episodes are written to the ledger (${ledger} entries)`);

    await page.click('#setup-toggle');
    await page.evaluate(() => document.querySelector('[data-pane="voice"]')?.click());
    const voiceCopy = await page.$eval('#pane-voice .pane-lede', (node) => node.textContent);
    check(
      /cannot clone a voice/i.test(voiceCopy),
      'the voice panel is honest about what a browser can and cannot do',
    );

    await page.screenshot({ path: screenshot });
    console.log(`screenshot: ${screenshot}`);
    check(errors.length === 0, `no page errors (${errors.length})`);
    if (errors.length) console.log(errors.slice(0, 6).join('\n'));
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed:`);
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('\nall checks passed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
