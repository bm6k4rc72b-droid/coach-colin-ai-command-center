/**
 * End-to-end check for Vice Command, against a film whose timing is known
 * before the browser starts.
 *
 * The unit suites test the modules. This tests the *page*: the real document,
 * laid out at a real width, with the real canvas running, scrolled to real
 * positions. That is where the interesting failures live on a scroll-linked
 * site, and they are almost never wrong arithmetic:
 *
 *   - A section that turned out taller than its act, so the gunships arrive at
 *     58% instead of 50% on a phone and nowhere else.
 *   - An image that loads late, grows the document, and slides every mark down
 *     under a reader who is already scrolling.
 *   - A pinned stage taller than the window, whose bottom — the row with the
 *     call to action on it — can never be scrolled to.
 *   - A canvas that is running and painting nothing.
 *
 * So the harness drives the page to each of the three marks the brief named,
 * reads what is actually on screen, measures the geometry it depends on, and
 * checks the interactive parts — the rack, the swarm console, the quote — do
 * what they claim.
 *
 * Usage:
 *   node scripts/qa-vice.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-vice
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTS, sceneState } from '../public/vice/js/sequence.js';
import { ranked } from '../public/vice/js/apps.js';
import { SERVICES, quote } from '../public/vice/js/security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/** How far a measured mark may sit from the one the act table promises. */
const MARK_TOLERANCE = 0.015;

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
 * Serve `public/` over HTTP so modules and the service worker behave.
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

/** Pause without a busy loop. */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Scroll to a fraction of the document and let the loop catch up.
 *
 * Instant, not smooth: a smooth scroll is still animating when the next
 * assertion reads the page, which produces failures that come and go.
 *
 * @param {object} page Puppeteer page.
 * @param {number} fraction 0–1 of the scrollable distance.
 * @returns {Promise<number>} The fraction actually reached.
 */
async function scrollTo(page, fraction) {
  const reached = await page.evaluate((f) => {
    const travel = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.round(travel * f), behavior: 'instant' });
    return (window.scrollY || 0) / travel;
  }, fraction);
  await wait(420);
  return reached;
}

/** Read what the page currently believes is happening. */
function readState() {
  return {
    act: document.body.dataset.act || '',
    chapter: document.querySelector('#chapter').textContent.trim(),
    mission: document.querySelector('#mission').textContent.trim(),
    stars: document.querySelectorAll('.star.is-lit').length,
    scrolled: (window.scrollY || 0) / (document.documentElement.scrollHeight - window.innerHeight),
  };
}

/**
 * Run the end-to-end check.
 *
 * @returns {Promise<void>} Rejects when an assertion fails.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const screenshot =
    outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(os.tmpdir(), 'vice-smoke.png');

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
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
    const errors = [];
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
      errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`);
    });

    await page.goto(`http://127.0.0.1:${port}/vice/`, { waitUntil: 'networkidle0' });

    // ------------------------------------------------------------ the gate
    const gateUp = await page.$eval('#gate', (node) => !node.hasAttribute('hidden'));
    check(gateUp, 'the page opens behind a start gate, so no audio plays unasked');
    await page.click('#enter-quiet');
    await wait(900);
    const gateGone = await page.$eval('#gate', (node) => node.classList.contains('is-gone'));
    check(gateGone, 'pressing start clears the gate');

    // ------------------------------------------------------- the film runs
    const painted = await page.evaluate(() => {
      const canvas = document.getElementById('film');
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, Math.min(canvas.width, 600), Math.min(canvas.height, 400));
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      }
      return { colours: seen.size, width: canvas.width, height: canvas.height };
    });
    check(painted.width > 0 && painted.height > 0, `the canvas is sized (${painted.width}×${painted.height})`);
    check(painted.colours > 12, `the city is actually drawn (${painted.colours} distinct colours)`);

    // ---------------------------------------------- the three marks it owes
    const marks = [
      { at: 0.25, act: 'chase', label: 'the police are on you at 25%' },
      { at: 0.5, act: 'cavalry', label: 'the army is in the air at 50%' },
      { at: 0.75, act: 'detonation', label: 'the city goes up at 75%' },
    ];
    for (const mark of marks) {
      await scrollTo(page, mark.at);
      const state = await page.evaluate(readState);
      check(state.act === mark.act, `${mark.label} (act was "${state.act}")`);
      check(
        Math.abs(state.scrolled - mark.at) < 0.002,
        `the scroll actually reached ${mark.at} (${state.scrolled.toFixed(3)})`,
      );
    }

    // Five stars through the chase, and cleared once the city is gone.
    await scrollTo(page, 0.3);
    const chaseStars = await page.evaluate(readState);
    check(chaseStars.stars === 5, `five felony stars are lit during the chase (${chaseStars.stars})`);
    await scrollTo(page, 0.92);
    const afterStars = await page.evaluate(readState);
    check(afterStars.stars === 0, `heat clears in the aftermath (${afterStars.stars})`);

    // ------------------------------------------------- act table vs layout
    const geometry = await page.evaluate(() => {
      const travel = document.documentElement.scrollHeight - window.innerHeight;
      const tops = {};
      for (const section of document.querySelectorAll('main .act')) {
        const id = section.dataset.act.replace(/-.*$/, '');
        if (!(id in tops)) tops[id] = section.offsetTop / travel;
      }
      return { tops, travel, viewport: window.innerHeight };
    });
    for (const act of ACTS) {
      const measured = geometry.tops[act.id];
      check(
        measured !== undefined && Math.abs(measured - act.from) < MARK_TOLERANCE,
        `"${act.id}" begins at ${act.from} as the act table says (measured ${measured?.toFixed(3)})`,
      );
    }

    // ------------------------------------- nothing pinned is taller than the
    // window, or its bottom row can never be reached
    const pinned = await page.evaluate(() => Array.from(document.querySelectorAll('.act-stage'))
      .filter((stage) => getComputedStyle(stage).position === 'sticky')
      .map((stage) => ({ id: stage.closest('.act').id, over: stage.offsetHeight - window.innerHeight })));
    for (const stage of pinned) {
      check(stage.over <= 2, `the pinned "${stage.id}" stage fits the window (overflow ${stage.over}px)`);
    }
    check(pinned.length >= 4, `the set pieces are pinned (${pinned.length} sticky stages)`);

    const hscroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(hscroll <= 0, `the page does not scroll sideways (${hscroll}px)`);

    // -------------------------------------------------------------- the rack
    await scrollTo(page, 0.34);
    const rack = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rack-card'));
      const xs = cards.map((card) => Math.round(card.getBoundingClientRect().left));
      return {
        count: cards.length,
        spread: new Set(xs).size,
        focused: document.querySelectorAll('.rack-card.is-focused').length,
        label: document.querySelector('#rack-label').textContent.trim(),
        ctas: cards.filter((card) => card.querySelector('footer a')).length,
      };
    });
    check(rack.count === ranked().length, `the rack holds every app (${rack.count} of ${ranked().length})`);
    check(rack.spread === rack.count, `the cards are laid out along the rack, not stacked (${rack.spread} positions)`);
    check(rack.focused === 1, `exactly one card is in focus (${rack.focused})`);
    check(rack.ctas === rack.count, `every card carries a call to action (${rack.ctas})`);

    const rackAdvanced = await page.evaluate(async () => {
      const before = document.querySelector('#rack-label').textContent.trim();
      document.querySelector('#rack').focus();
      for (let i = 0; i < 3; i += 1) {
        document.querySelector('#rack').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { before, after: document.querySelector('#rack-label').textContent.trim() };
    });
    check(
      rackAdvanced.before !== rackAdvanced.after,
      `the rack can be driven from the keyboard (${rackAdvanced.before} → ${rackAdvanced.after})`,
    );

    // ------------------------------------------------------- the swarm console
    await scrollTo(page, 0.65);
    const consoleState = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.agent input'));
      for (const box of boxes) if (!box.checked) box.click();
      const range = document.querySelector('#throttle');
      range.value = '100';
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        agents: boxes.length,
        weekly: document.querySelector('#fig-weekly').textContent.trim(),
        review: Number(document.querySelector('#fig-review').textContent.trim()),
        warnings: document.querySelectorAll('#plan-warnings .warn').length,
        overChannels: document.querySelectorAll('.channel.is-over').length,
      };
    });
    check(consoleState.agents === 10, `the console offers the whole roster (${consoleState.agents})`);
    check(
      consoleState.warnings >= 2,
      `the full swarm at full throttle is called out as too much (${consoleState.warnings} warnings)`,
    );
    check(consoleState.overChannels > 0, `channels over their caution line are marked (${consoleState.overChannels})`);
    check(consoleState.review > 0, `the approval burden is shown in hours (${consoleState.review})`);

    const throttled = await page.evaluate(async () => {
      document.querySelector('#auto-throttle').click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      return {
        throttle: document.querySelector('#throttle-out').textContent.trim(),
        warnings: document.querySelectorAll('#plan-warnings .warn').length,
        ok: document.querySelectorAll('#plan-warnings .ok').length,
      };
    });
    check(
      throttled.warnings === 0 && throttled.ok === 1,
      `"find a safe throttle" produces a plan with nothing over a line (${throttled.throttle})`,
    );

    // --------------------------------------------------------- the quote desk
    await scrollTo(page, 0.95);
    const expected = quote({ service: 'open-house', officers: 1, hours: 1, days: 1, tier: 'unarmed', vehicle: false });
    const quoted = await page.evaluate(async () => {
      const set = (selector, value) => {
        const node = document.querySelector(selector);
        node.value = String(value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set('#q-service', 'open-house');
      set('#q-officers', 1);
      set('#q-hours', 1);
      set('#q-days', 1);
      set('#q-tier', 'unarmed');
      await new Promise((resolve) => setTimeout(resolve, 160));
      return {
        total: document.querySelector('#q-total').textContent.trim(),
        assumptions: Array.from(document.querySelectorAll('#q-assumptions li')).map((li) => li.textContent),
        disclaimer: document.querySelector('#q-disclaimer').textContent.trim(),
        mailto: document.querySelector('#q-mail').getAttribute('href'),
        licensing: document.querySelector('#licensing').textContent.trim(),
        services: document.querySelectorAll('.service').length,
      };
    });
    check(quoted.services === SERVICES.length, `every protective service is listed (${quoted.services})`);
    check(
      quoted.total === `$${expected.total.toLocaleString('en-US')}`,
      `the quote on screen matches the module (${quoted.total} vs $${expected.total})`,
    );
    check(
      quoted.assumptions.some((line) => /minimum/i.test(line)),
      'the four-hour minimum is shown on the quote rather than applied silently',
    );
    check(/estimate/i.test(quoted.disclaimer), 'the estimate is labelled an estimate');
    check(/licen/i.test(quoted.licensing) && /insur/i.test(quoted.licensing), 'licensing and insurance are stated');
    check(
      quoted.mailto.startsWith('mailto:') && /Open%20House/i.test(quoted.mailto),
      'the enquiry link carries the detail that was quoted',
    );

    // ------------------------------------------- the fiction is labelled as such
    const footer = await page.$eval('.foot', (node) => node.textContent);
    check(/parody/i.test(footer), 'the set pieces are labelled as parody');
    check(
      /no commercial recording/i.test(footer) && /original/i.test(footer),
      'the score is declared original rather than licensed',
    );

    // ------------------------------------------------------------- the artefact
    await scrollTo(page, 0.76);
    await page.screenshot({ path: screenshot });
    check(fs.existsSync(screenshot), `screenshot written to ${screenshot}`);

    // --------------------------------------------------------------- reversible
    await scrollTo(page, 0.2);
    const rewound = await page.evaluate(readState);
    check(rewound.act === 'chase', `scrubbing back up runs the film backwards (act "${rewound.act}")`);
    check(rewound.stars < 5, `and the stars go out again (${rewound.stars} lit)`);

    // ----------------------------------------------------------------- mobile
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await wait(700);
    const mobile = await page.evaluate(() => {
      const travel = document.documentElement.scrollHeight - window.innerHeight;
      const tops = {};
      for (const section of document.querySelectorAll('main .act')) {
        const id = section.dataset.act.replace(/-.*$/, '');
        if (!(id in tops)) tops[id] = section.offsetTop / travel;
      }
      return {
        tops,
        hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        pinnedOver: Array.from(document.querySelectorAll('.act-stage'))
          .filter((stage) => getComputedStyle(stage).position === 'sticky')
          .map((stage) => stage.offsetHeight - window.innerHeight),
      };
    });
    for (const mark of marks) {
      const act = ACTS.find((entry) => entry.id === mark.act);
      check(
        Math.abs(mobile.tops[act.id] - act.from) < MARK_TOLERANCE,
        `on a phone, "${act.id}" still begins at ${act.from} (measured ${mobile.tops[act.id]?.toFixed(3)})`,
      );
    }
    check(mobile.hscroll <= 0, `the phone layout does not scroll sideways (${mobile.hscroll}px)`);
    check(
      mobile.pinnedOver.every((over) => over <= 2),
      `no pinned stage overflows a phone screen (worst ${Math.max(...mobile.pinnedOver)}px)`,
    );

    // ---------------------------------------------------------------- sound
    // The score is synthesised, so "does it work" is answerable without
    // listening: an audio graph gets built, and the cue tracks the act.
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await wait(500);
    const audio = await page.evaluate(async () => {
      const started = [];
      const Original = window.AudioContext || window.webkitAudioContext;
      let context = null;
      window.AudioContext = class extends Original {
        constructor(...args) {
          super(...args);
          context = this;
          started.push('context');
        }
      };
      document.querySelector('#btn-sound').click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      return {
        built: started.length > 0,
        pressed: document.querySelector('#btn-sound').getAttribute('aria-pressed'),
        state: context ? context.state : 'none',
      };
    });
    check(audio.built, 'turning the score on builds an audio graph');
    check(audio.pressed === 'true', 'and the control reports itself as on');

    // ------------------------------------------------------------ housekeeping
    const sceneAtQuarter = sceneState(0.25);
    check(sceneAtQuarter.wanted >= 4, `the module agrees the quarter mark is hot (${sceneAtQuarter.wanted} stars)`);
    check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (failures.length) {
    console.error(`${failures.length} check(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
