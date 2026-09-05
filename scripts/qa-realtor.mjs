/**
 * End-to-end smoke test for the Jose Montes estate site.
 *
 * Serves `public/jose-montes/` statically, drives it in headless Chromium, and
 * checks the parts that only exist once a browser is involved: the WebGL
 * hologram renders and responds to scroll, the pinned scenes hold and release,
 * the reveal choreography fires, the portfolio filters, the payment maths
 * agrees with the module that produced it, the concierge answers and acts, the
 * camera gesture path opens against a fake device, and the phone layout does
 * not overflow.
 *
 * Usage:
 *   node scripts/qa-realtor.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-realtor
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
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
 * Serve `public/` on an ephemeral port.
 *
 * @returns {Promise<{ server: http.Server, port: number }>} The listening server.
 */
function serve() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let filePath = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const data = await fsp.readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const checks = [];

/**
 * Record one assertion.
 *
 * @param {string} name What was checked.
 * @param {boolean} ok Whether it passed.
 * @param {string} [detail] Extra context, printed either way.
 */
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}

/**
 * Wait for a fixed interval.
 *
 * @param {number} ms Milliseconds.
 * @returns {Promise<void>} Resolves after the delay.
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scroll to an absolute offset and let the choreographer catch up.
 *
 * @param {object} page The page.
 * @param {number} y Offset in pixels.
 * @returns {Promise<void>} Resolves once settled.
 */
async function scrollTo(page, y) {
  // Instant, not smooth: the stylesheet asks for smooth scrolling, and a test
  // that measures mid-animation measures the animation rather than the page.
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: 'instant' }), y);
  await wait(700);
}

/**
 * Ask the concierge something and return her last reply.
 *
 * @param {object} page The page.
 * @param {string} text What to ask.
 * @returns {Promise<string>} The reply.
 */
async function askConcierge(page, text) {
  await page.$eval('#ask', (el) => { el.value = ''; });
  await page.type('#ask', text);
  await page.click('#ask-form .send');
  await wait(600);
  return page.$$eval('#transcript .line.her', (els) => (els.length ? els[els.length - 1].textContent : ''));
}

/**
 * Run the suite.
 *
 * @returns {Promise<void>} Resolves when the run finishes.
 */
async function main() {
  const outIndex = process.argv.indexOf('--out');
  const shotPath = outIndex > -1 ? process.argv[outIndex + 1] : null;
  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      // The full-resolution plates live on a render CDN that a sandbox has no
      // route to. That path is a deliberate upgrade — the committed AVIF is
      // what the page actually ships — so a failed fetch is not an error here.
      const text = msg.text();
      if (msg.type() === 'error' && !/net::ERR|Failed to load resource/.test(text)) errors.push(text);
    });

    console.log('\nJose Montes -- end-to-end\n');
    await page.goto(`http://127.0.0.1:${port}/jose-montes/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });

    check('the gate loads', await page.$eval('.gate-title', (n) => n.textContent.trim() === 'Jose Montes'));

    await page.click('#enter-quiet');
    await wait(1200);
    check('the gate opens', await page.$eval('#gate', (n) => n.classList.contains('is-gone')));

    // --- the hologram ----------------------------------------------------
    const stage = await page.evaluate(() => {
      const canvas = document.querySelector('#stage');
      return {
        live: canvas.classList.contains('is-live'),
        width: canvas.width,
        height: canvas.height,
      };
    });
    check('the WebGL stage runs', stage.live && stage.width > 0, `${stage.width}x${stage.height}`);

    // Something has to actually be drawn: sample the canvas and look for lit
    // pixels. A blank buffer would pass every structural check above.
    const hold = await page.evaluate(() => document.querySelector('#hero').offsetHeight - window.innerHeight);
    await scrollTo(page, Math.round(hold * 0.85));
    await wait(1400);
    const lit = await page.evaluate(() => window.__jm.stage.probe());
    check('the hologram draws geometry', lit > 500, `${lit} lit pixels`);

    // --- the pin ---------------------------------------------------------
    const pin = await page.evaluate(() => {
      const hero = document.querySelector('#hero');
      return {
        t: Number(getComputedStyle(hero).getPropertyValue('--t')),
        phase: hero.dataset.phase,
        stuck: Math.abs(hero.querySelector('.scene-stage').getBoundingClientRect().top) < 2,
      };
    });
    check('the hero pins and scrubs', pin.phase === 'pinned' && pin.t > 0.7 && pin.stuck,
      `t=${pin.t.toFixed(2)} phase=${pin.phase}`);

    await scrollTo(page, Math.round(hold * 0.2));
    const scrubbedBack = await page.evaluate(() => Number(getComputedStyle(document.querySelector('#hero')).getPropertyValue('--t')));
    check('the pin scrubs backwards', scrubbedBack < 0.35, `t=${scrubbedBack.toFixed(2)}`);

    // --- the HUD and the reveals -----------------------------------------
    await page.evaluate(() => document.querySelector('#portfolio').scrollIntoView({ behavior: 'instant' }));
    await wait(900);
    const revealed = await page.$$eval('.card', (els) => els.filter((el) => el.classList.contains('is-revealed')).length);
    check('cards reveal on entry', revealed > 0, `${revealed} revealed`);

    const cardCount = await page.$$eval('.card', (els) => els.length);
    check('the portfolio renders', cardCount === 6, `${cardCount} cards`);

    await page.click('#filters .chip[data-filter="sold"]');
    await wait(400);
    const sold = await page.$$eval('.card .card-status', (els) => els.map((el) => el.className));
    check('filters narrow the portfolio', sold.length === 1 && sold[0].includes('sold'), `${sold.length} shown`);
    await page.click('#filters .chip[data-filter="all"]');
    await wait(300);

    // --- the payment maths -----------------------------------------------
    await page.evaluate(() => document.querySelector('#numbers').scrollIntoView({ behavior: 'instant' }));
    await wait(700);
    const agrees = await page.evaluate(async () => {
      const { ownershipCost } = await import('./js/finance.js');
      const price = Number(document.querySelector('#calc-price').value);
      const downPct = Number(document.querySelector('#calc-down').value) / 100;
      const rate = Number(document.querySelector('#calc-rate').value) / 10000;
      const years = Number(document.querySelector('#calc-term').value);
      const expected = Math.round(ownershipCost({ price, downPct, rate, years }).total);
      const shown = Number(document.querySelector('#calc-total').textContent.replace(/[^0-9]/g, ''));
      return { expected, shown };
    });
    check('the payment panel agrees with the maths', Math.abs(agrees.expected - agrees.shown) <= 1,
      `panel ${agrees.shown} vs module ${agrees.expected}`);

    await page.$eval('#calc-down', (el) => { el.value = '5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(300);
    const pmiRow = await page.$$eval('#calc-breakdown li', (els) => els.map((el) => el.textContent));
    check('mortgage insurance appears under 20% down',
      pmiRow.some((row) => row.toLowerCase().includes('mortgage insurance')),
      `${pmiRow.length} rows`);

    // --- the concierge ----------------------------------------------------
    const payment = await askConcierge(page, 'what is the payment on 123 ocean view');
    check('the concierge quotes a payment', /a month all in/.test(payment), payment.slice(0, 60));

    const found = await askConcierge(page, 'show me the most expensive one');
    await wait(700);
    const focused = await page.evaluate(() => document.querySelector('.card.is-focus')?.id || '');
    check('the concierge focuses a listing', focused === 'card-vintners-ridge-77' && /Vintners/.test(found), focused);

    const before = await page.evaluate(() => window.scrollY);
    await askConcierge(page, 'take me to the contact section');
    await wait(1400);
    const moved = await page.evaluate(() => window.scrollY);
    check('the concierge navigates', moved !== before, `${before} -> ${moved}`);

    const help = await askConcierge(page, 'help');
    check('the concierge explains itself', /book a tour/.test(help), help.slice(0, 50));

    // --- the camera gesture path -----------------------------------------
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(`http://127.0.0.1:${port}`, ['camera']);
    await page.click('#btn-gesture');
    await wait(2200);
    const camera = await page.evaluate(() => ({
      shown: !document.querySelector('#camera').hidden,
      pressed: document.querySelector('#btn-gesture').getAttribute('aria-pressed'),
      video: document.querySelector('#camera-video').readyState,
    }));
    check('hand scrolling opens the camera', camera.shown && camera.pressed === 'true',
      `readyState ${camera.video}`);
    await page.click('#camera-close');
    await wait(500);
    check('hand scrolling closes cleanly', await page.evaluate(() => document.querySelector('#camera').hidden));

    // --- the form ---------------------------------------------------------
    await page.evaluate(() => document.querySelector('#contact').scrollIntoView({ behavior: 'instant' }));
    await wait(500);
    await page.type('#contact-form input[name="name"]', 'Dana Reyes');
    await page.type('#contact-form input[name="reach"]', '805-555-0000');
    // Submitted through the form rather than by clicking at a screen position:
    // the concierge console floats at the bottom of the viewport and a
    // coordinate click can land on it instead.
    await page.$eval('#contact-form', (form) => form.requestSubmit());
    await wait(500);
    const status = await page.$eval('#contact-status', (el) => el.textContent);
    check('the tour request is acknowledged', /Dana Reyes/.test(status), status.slice(0, 60));

    // --- progress ---------------------------------------------------------
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await wait(600);
    const progress = await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--progress')));
    check('the progress rail fills', progress > 0.98, progress.toFixed(3));

    if (shotPath) {
      await page.evaluate(() => document.querySelector('#signature').scrollIntoView({ behavior: 'instant' }));
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
      await wait(1400);
      await page.screenshot({ path: shotPath });
      console.log(`\n  screenshot -> ${shotPath}`);
    }

    // --- phone -------------------------------------------------------------
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await wait(900);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('phone layout does not overflow', overflow <= 1, `${overflow}px at 390px wide`);

    check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n  ${checks.length - failed.length}/${checks.length} checks passed\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
