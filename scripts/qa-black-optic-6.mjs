/**
 * End-to-end check for Black Optic 6, in a real browser.
 *
 * The unit suites prove the arithmetic. This proves the console: that every deck
 * renders without a camera, that the capability ledger shows its refusals rather
 * than hiding them, that opening a camera moves the optics badge to LIVE and
 * starts producing frames, that calibration switches the readouts from pixels to
 * metres, and that the microphone path works.
 *
 * The assertion worth having is the ledger one. A console whose honest rows get
 * quietly dropped in a refactor looks identical to one that never had them, and
 * only a check on the rendered page can tell the difference.
 *
 * Usage:
 *   node scripts/qa-black-optic-6.mjs [--out <screenshot.png>]
 *
 * @module scripts/qa-black-optic-6
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
 * Run the check.
 *
 * @returns {Promise<void>} Resolves when the report has been printed.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const shot = outIndex >= 0
    ? path.resolve(args[outIndex + 1])
    : path.join(os.tmpdir(), 'black-optic-6.png');

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
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
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/gibs\.earthdata|net::ERR/.test(message.text())) {
        errors.push(message.text());
      }
    });

    const origin = `http://127.0.0.1:${port}`;
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(origin, ['camera', 'microphone', 'geolocation']);
    await page.goto(`${origin}/black-optic-6/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#rail button');

    // ------------------------------------------------------------ structure
    const decks = await page.$$eval('#rail button', (nodes) => nodes.length);
    check(decks === 11, `the console builds all its decks (${decks})`);

    const title = await page.title();
    check(/Black Optic 6/.test(title), `the console is named Black Optic 6 ("${title}")`);

    // --------------------------------------------------------------- ledger
    await page.click('#rail button[data-deck="ledger"]');
    await page.waitForSelector('.ledger-row');
    const ledger = await page.$$eval('.ledger-row', (nodes) => nodes.length);
    check(ledger >= 30, `every specified capability is answered (${ledger} rows)`);

    const unsound = await page.$$eval('.ledger-row .prov[data-tone="alert"]', (nodes) => nodes.length);
    check(unsound >= 8, `the refusals are shown rather than dropped (${unsound} marked unsound)`);

    const ledgerText = await page.$eval('#ledger', (node) => node.textContent);
    for (const phrase of ['intent', 'gait', 'Concealed', 'Threat assessment', 'firing mechanism', 'Nutrient deficiency']) {
      check(ledgerText.includes(phrase), `the ledger answers "${phrase}" openly`);
    }
    check(
      /autonomous weapon/i.test(ledgerText),
      'the turret row names what it is rather than listing it as unimplemented',
    );

    // Filtering narrows the list rather than emptying it.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('#ledger-tally button')]
        .find((node) => node.textContent.startsWith('UNSOUND'));
      button?.click();
    });
    const filtered = await page.$$eval('.ledger-row', (nodes) => nodes.length);
    check(filtered > 0 && filtered < ledger, `the ledger filters (${filtered} of ${ledger})`);

    // ------------------------------------------------------------- optics
    await page.click('#rail button[data-deck="optics"]');
    await page.click('#optics-start');
    await page.waitForFunction(
      () => document.getElementById('optics-prov').textContent.trim() === 'LIVE',
      { timeout: 15000 },
    );
    check(true, 'the camera opens and optics reports LIVE');

    await new Promise((resolve) => setTimeout(resolve, 2500));
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById('frame');
      if (!canvas.width) return 0;
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      let sampled = 0;
      // Luminance, not one channel: the fake camera's test pattern is pure
      // green, and a red-channel check would call a working pipeline empty.
      for (let i = 0; i < data.length; i += 64) {
        const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (luma > 12) lit += 1;
        sampled += 1;
      }
      return lit / sampled;
    });
    check(painted > 0.1, `frames are being processed and drawn (${(painted * 100).toFixed(0)}% lit)`);

    const hudDrawn = await page.evaluate(() => {
      const canvas = document.getElementById('hud');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let ink = 0;
      for (let i = 3; i < data.length; i += 40) if (data[i] > 30) ink += 1;
      return ink;
    });
    check(hudDrawn > 50, `the overlay is drawn over the frame (${hudDrawn} samples)`);

    // -------------------------------------------------------- calibration
    await page.click('#rail button[data-deck="watch"]');
    const beforeUnits = await page.$eval('#watch-readouts', (node) => node.textContent);
    check(/pixels/i.test(beforeUnits), 'an uncalibrated view reports pixels and says so');

    await page.click('#rail button[data-deck="optics"]');
    await page.click('#cal-apply');
    await new Promise((resolve) => setTimeout(resolve, 600));
    const calibrated = await page.$eval('#calib-prov', (node) => node.textContent.trim());
    check(calibrated === 'Metres', `calibration switches the console to metres (${calibrated})`);

    await page.click('#rail button[data-deck="watch"]');
    await new Promise((resolve) => setTimeout(resolve, 600));
    const afterUnits = await page.$eval('#watch-readouts', (node) => node.textContent);
    check(/metres/i.test(afterUnits), 'the watch deck follows the calibration');

    // ----------------------------------------------------------- acoustic
    await page.click('#rail button[data-deck="acoustic"]');
    await page.click('#acoustic-start');
    await page.waitForFunction(
      () => document.getElementById('acoustic-readouts').children.length > 3,
      { timeout: 15000 },
    );
    const acousticProv = await page.$eval('#acoustic-prov', (node) => node.textContent.trim());
    check(acousticProv === 'LIVE', `the microphone opens and reports LIVE (${acousticProv})`);
    const acousticText = await page.$eval('#deck-acoustic', (node) => node.textContent);
    check(/cannot answer/i.test(acousticText), 'the acoustic deck states what one microphone cannot do');

    // ---------------------------------------------------------- satellite
    await page.click('#rail button[data-deck="satellite"]');
    await page.waitForSelector('#sat-looks .row');
    const looks = await page.$$eval('#sat-looks .row', (nodes) => nodes.length);
    check(looks >= 3, `the next satellite looks are computed (${looks})`);
    const satText = await page.$eval('#deck-satellite', (node) => node.textContent);
    check(/not a camera you can point/i.test(satText), 'the satellite deck refuses the obvious misreading');
    const ladder = await page.$$eval('#sat-ladder tr', (nodes) => nodes.length);
    check(ladder >= 5, `the imagery ladder is shown with its costs (${ladder} rows)`);

    // --------------------------------------------------------- perimeter
    await page.click('#rail button[data-deck="perimeter"]');
    const fenceText = await page.$eval('#deck-perimeter', (node) => node.textContent);
    check(/sharp enough/i.test(fenceText), 'the geofence explains when it will refuse to alert');

    // -------------------------------------------------------------- vault
    await page.click('#rail button[data-deck="vault"]');
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const buffered = await page.$eval('#vault-readouts', (node) => node.textContent);
    check(/\d+ s/.test(buffered), `the evidence buffer is filling (${buffered.slice(0, 40).trim()}…)`);

    // ---------------------------------------------------------- devices
    await page.click('#rail button[data-deck="optics"]');
    const cameras = await page.$$eval('#camera-pick option', (nodes) => nodes.length);
    check(cameras >= 1, `the camera picker lists devices (${cameras})`);
    const routes = await page.$$eval('#routes .row', (nodes) => nodes.length);
    check(routes >= 4, `the other routes in are listed (${routes})`);
    const routeText = await page.$eval('#routes', (node) => node.textContent);
    check(/RTMP/.test(routeText), 'the drone route names what it actually needs');

    // --------------------------------------------------------- tracking
    await page.click('#rail button[data-deck="watch"]');
    await page.click('#track-toggle');
    await new Promise((resolve) => setTimeout(resolve, 900));
    const trackText = await page.$eval('#track-readouts', (node) => node.textContent);
    check(/°\/s/.test(trackText), 'the head tracking loop reports pan and tilt rates');
    const trackPanel = await page.$eval('#deck-watch', (node) => node.textContent);
    check(
      /no prediction of where anything is going/i.test(trackPanel),
      'the tracking panel states what it deliberately does not compute',
    );
    await page.click('#track-toggle');

    // --------------------------------------------------------- spectral
    await page.click('#rail button[data-deck="spectral"]');
    const offered = await page.$$eval('#spectral-index option', (nodes) => nodes.map((n) => n.value));
    check(offered.length === 3, `only the visible indices are offered on an RGB camera (${offered.join(', ')})`);
    check(!offered.includes('ndvi'), 'NDVI is not offered without near-infrared');

    await page.click('#spectral-run');
    await page.waitForFunction(
      () => document.querySelectorAll('#spectral-supports .row').length > 0,
      { timeout: 8000 },
    );
    const indexPainted = await page.evaluate(() => {
      const canvas = document.getElementById('spectral-map');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let coloured = 0;
      for (let i = 0; i < data.length; i += 400) {
        if (data[i] !== 18 || data[i + 1] !== 22) coloured += 1;
      }
      return coloured;
    });
    check(indexPainted > 20, `the index map is rendered (${indexPainted} sampled cells)`);
    const spectralText = await page.$eval('#deck-spectral', (node) => node.textContent);
    check(/which nutrient/i.test(spectralText), 'the reading refuses to name a nutrient');
    check(/tissue/i.test(spectralText), 'and says what would actually answer the question');

    // ------------------------------------------------------- subsurface
    await page.click('#rail button[data-deck="subsurface"]');
    await page.click('#sonar-rehearse');
    await page.waitForFunction(
      () => /%/.test(document.getElementById('sonar-readouts').textContent),
      { timeout: 15000 },
    );
    const sonarText = await page.$eval('#sonar-readouts', (node) => node.textContent);
    check(/Drift/.test(sonarText), 'the sonar survey reports its drift');
    const mapped = await page.evaluate(() => {
      const canvas = document.getElementById('sonar-map');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 160) {
        if (data[i] > 20 || data[i + 2] > 60) lit += 1;
      }
      return lit;
    });
    check(mapped > 100, `the occupancy map is drawn (${mapped} sampled cells)`);
    const capacityText = await page.$eval('#sonar-capacity', (node) => node.textContent);
    check(/ML/.test(capacityText), 'stored water is estimated from the soundings');
    check(/upper bound|soundings/i.test(capacityText), 'and the estimate states its own limit');

    // -------------------------------------------------------------- bio
    await page.click('#rail button[data-deck="bio"]');
    const bioText = await page.$eval('#deck-bio', (node) => node.textContent);
    check(/Apple Watch/.test(bioText), 'the bio deck names the wearable that will never pair');
    check(/strap/i.test(bioText), 'and the ones that will');
    const bioRows = await page.$$eval('#bio-works .row, #bio-blocked .row', (nodes) => nodes.length);
    check(bioRows >= 6, `what pairs and what does not are both listed (${bioRows})`);

    await page.click('#rail button[data-deck="optics"]');
    await page.screenshot({ path: shot });
    console.log(`\nscreenshot: ${shot}`);

    check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);
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
