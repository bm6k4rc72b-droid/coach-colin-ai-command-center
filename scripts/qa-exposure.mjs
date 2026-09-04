/**
 * End-to-end smoke test for the EXPOSURE desk.
 *
 * Serves `public/exposure/` statically, drives it in headless Chromium, and
 * walks the whole product the way a user does: through the age gate, an
 * account, three connected leagues, a start/sit call, a compare drawer, a
 * player card, a saved lean, the exposure table, the market desk, a live
 * Sunday, and finally account deletion.
 *
 * It also enforces the constraints that matter more than any feature: no
 * images anywhere, no video, no borrowed product names in the rendered text,
 * no odds surface before the gate is answered, and 44px tap targets.
 *
 * Usage:
 *   node scripts/qa-exposure.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-exposure
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
 * @returns {Promise<{server: http.Server, port: number}>} The listening server.
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
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Click the first element whose text matches.
 *
 * @param {object} page Puppeteer page.
 * @param {string} selector Candidate selector.
 * @param {string} text Text to match.
 * @returns {Promise<boolean>} Whether something was clicked.
 */
async function clickText(page, selector, text) {
  return page.evaluate((sel, needle) => {
    const node = [...document.querySelectorAll(sel)]
      .find((element) => element.textContent.trim().includes(needle));
    if (!node) return false;
    node.click();
    return true;
  }, selector, text);
}

/**
 * Report anything sticking out past the right edge of the viewport.
 *
 * A sideways-scrolling page is the classic mobile regression, and it is
 * invisible in a screenshot taken at the wrong width.
 *
 * @param {object} page Puppeteer page.
 * @returns {Promise<{scroll: number, width: number, offenders: string[]}>} The measurement.
 */
async function overflow(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = new Set();
    for (const node of document.querySelectorAll('*')) {
      const box = node.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > width + 0.5) {
        offenders.add(`${node.tagName}.${String(node.className || '').split(' ')[0]}`);
      }
    }
    return { scroll: document.documentElement.scrollWidth, width, offenders: [...offenders].slice(0, 5) };
  });
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
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const errors = [];
  try {
    const page = await browser.newPage();
    // A phone first: this desk is built for a couch on a Sunday.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' && !/net::ERR|Failed to load resource/.test(text)) errors.push(text);
    });

    console.log('\nEXPOSURE -- end-to-end\n');
    await page.goto(`http://127.0.0.1:${port}/exposure/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
    await wait(300);

    /* ---------------------------------------------------------- the gate */

    const gate = await page.evaluate(() => {
      const node = document.getElementById('gate');
      return { visible: !node.classList.contains('gone'), text: node.textContent };
    });
    check('first run opens on the gate', gate.visible);
    check('gate carries the affiliation disclosure verbatim',
      gate.text.includes('Not affiliated with, endorsed by, or sponsored by the National Football League, its member clubs, or NFL Properties.'));
    check('gate carries the 21+ disclosure verbatim',
      gate.text.includes('We are not a sportsbook and do not accept wagers.')
      && gate.text.includes('call 1-800-GAMBLER'));
    check('gate asks the 21-or-older question', gate.text.includes('I am 21 or older'));

    const beforeGate = await page.evaluate(() => document.body.textContent);
    check('no odds surface before the gate is answered',
      !/Moneyline|Spread|Anytime TD|sportsbook/i.test(beforeGate.replace(/We are not a sportsbook[^]*?1-800-GAMBLER\./g, '')));

    await clickText(page, '#gate button', 'I am 21 or older');
    await wait(250);
    check('gate dismissed', await page.$eval('#gate', (n) => n.classList.contains('gone')));

    /* -------------------------------------------------------- onboarding */

    check('onboarding asks for an account',
      await page.$eval('#view', (n) => n.textContent.includes('Create your account')));

    await page.type('#onboard-email', 'desk@example.com');
    await clickText(page, 'button', 'Send magic link');
    await wait(300);
    check('account step advances to leagues',
      await page.$eval('#view', (n) => n.textContent.includes('Connect your leagues')));

    for (const provider of ['ESPN', 'Sleeper', 'Yahoo']) {
      await clickText(page, '.provider', provider);
      await wait(900);
    }
    const connected = await page.$$eval('.connected-row', (rows) => rows.map((r) => r.textContent));
    check('three providers connect three leagues', connected.length === 3, connected.join(' | '));

    await clickText(page, '.card-actions button', 'Continue');
    await wait(250);
    await page.select('#onboard-team', 'KC');
    await clickText(page, 'button', 'Open the desk');
    await wait(350);

    /* --------------------------------------------------------------- home */

    const home = await page.$eval('#view', (n) => n.textContent);
    check('home shows the week and both league cards',
      home.includes('Week 1') && home.includes('Night Shift') && home.includes('Cold Open'));
    check('home flags the triple-exposed back',
      home.includes('Rashad Kemp') && /OVERLOADED/.test(home));
    check('home shows a projection against an opponent', /Projected/.test(home));

    const bell = await page.$eval('.bell', (n) => n.getAttribute('aria-label'));
    check('alerts bell counts unread concentration alerts', /unread/.test(bell), bell);

    /* ------------------------------------------------------------ lineup */

    await clickText(page, '.tabbar-btn', 'Lineup');
    await wait(300);
    const lineup = await page.evaluate(() => ({
      slots: document.querySelectorAll('.slot-block').length,
      pills: [...document.querySelectorAll('.pill')].map((p) => p.textContent),
      reasons: [...document.querySelectorAll('.slot-reason')].map((p) => p.textContent),
      leads: [...document.querySelectorAll('.row-lead')].map((p) => p.textContent),
    }));
    check('lineup renders seven starters plus a bench',
      lineup.slots >= 12 && lineup.leads.includes('QB') && lineup.leads.includes('FLEX') && lineup.leads.includes('BN'),
      `${lineup.slots} blocks`);
    check('every slot carries a verdict pill',
      lineup.pills.length >= 12 && lineup.pills.every((p) => ['START', 'SIT', 'WATCH'].includes(p)));
    check('every start/sit reason is two sentences',
      lineup.reasons.length >= 7
      && lineup.reasons.every((r) => r.trim().split(/(?<=[.!?])\s+/).filter(Boolean).length === 2),
      `${lineup.reasons.length} reasons`);

    // Compare two players and land in the drawer.
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.slot-actions button')].filter((b) => b.textContent.includes('Compare'));
      buttons[0].click();
    });
    await wait(200);
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.slot-actions button')].filter((b) => b.textContent.includes('Compare with'));
      buttons[buttons.length - 1].click();
    });
    await wait(300);
    const compare = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet');
      return sheet ? { text: sheet.textContent, columns: sheet.querySelectorAll('.compare-col').length } : null;
    });
    check('compare drawer opens with both players', Boolean(compare) && compare.columns === 2);
    await page.keyboard.press('Escape');
    await wait(200);

    /* ------------------------------------------------------- player card */

    await page.evaluate(() => window.__exposure.go('player', { id: 'rb-kemp' }));
    await wait(300);
    const tabs = await page.$$eval('.tab', (nodes) => nodes.map((n) => n.textContent));
    check('player card carries all four tabs',
      ['Overview', 'Opportunity', 'Market', 'Receipts'].every((t) => tabs.includes(t)), tabs.join(', '));

    const overview = await page.$eval('#player-tab-panel', (n) => n.textContent);
    check('overview names the city, abbreviation, position and opponent',
      overview.includes('Detroit') && overview.includes('RB') && /Week 1 (vs|@)/.test(await page.$eval('.player-meta.dim', (n) => n.textContent)));
    check('overview shows the verdict reason and its drivers',
      overview.includes('Projection vs slot') && overview.includes('Opportunity') && overview.includes('Environment'));

    await clickText(page, '.tab', 'Opportunity');
    await wait(200);
    const opportunity = await page.$eval('#player-tab-panel', (n) => n.textContent);
    check('opportunity shows snap share, targets, rush share and red-zone touches',
      ['Snap share', 'Targets', 'Rush share', 'Red-zone touches'].every((label) => opportunity.includes(label)));

    await clickText(page, '.tab', 'Market');
    await wait(200);
    const market = await page.evaluate(() => ({
      text: document.getElementById('player-tab-panel').textContent,
      books: document.querySelectorAll('.market-card .book-row:not(.book-head)').length,
      best: document.querySelectorAll('.market-card .book-row.best').length,
      markets: document.querySelectorAll('.market-card').length,
      links: [...document.querySelectorAll('.book-open')].map((a) => a.href),
      targets: [...document.querySelectorAll('.book-open')].every((a) => a.target === '_blank' && /noopener/.test(a.rel)),
    }));
    check('market compares three books per market', market.books === market.markets * 3,
      `${market.markets} markets, ${market.books} rows`);
    check('exactly one best number per market', market.best === market.markets);
    check('every book link is an external stub',
      market.links.length > 0 && market.links.every((href) => href.startsWith('https://example.com/')) && market.targets);
    check('market states it is not a sportsbook', /not a sportsbook/i.test(market.text));

    await clickText(page, 'button', 'Save');
    await wait(250);
    check('a lean can be saved from the market tab',
      await page.evaluate(() => JSON.parse(localStorage.getItem('exposure.state.v1')).leans.length === 1));

    await clickText(page, '.tab', 'Receipts');
    await wait(200);
    const receipts = await page.evaluate(() => ({
      count: document.querySelectorAll('.receipt').length,
      media: document.querySelectorAll('video, iframe, img, embed').length,
      text: document.getElementById('player-tab-panel').textContent,
    }));
    check('receipts are three to five written notes', receipts.count >= 3 && receipts.count <= 5, `${receipts.count} notes`);
    check('receipts embed no video', receipts.media === 0);
    check('receipts point at the user’s own broadcast app', /broadcast/i.test(receipts.text));

    /* ---------------------------------------------------------- exposure */

    await clickText(page, '.tabbar-btn', 'Exposure');
    await wait(300);
    const exposure = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.exp-block')].map((block) => block.textContent);
      return {
        rows,
        kemp: rows.find((row) => row.includes('Rashad Kemp')) || '',
        summary: document.querySelector('.summary-strip').textContent,
        head: document.querySelector('.exp-head').textContent,
      };
    });
    check('exposure table lists every owned player', exposure.rows.length >= 20, `${exposure.rows.length} rows`);
    check('exposure columns are player, started, bench, lean and risk',
      ['Player', 'Started', 'Bench', 'Prop lean', 'Risk'].every((c) => exposure.head.includes(c)));
    check('the triple-exposed back is overloaded and carries the saved lean',
      /OVERLOADED/.test(exposure.kemp) && /\b(OVER|UNDER|WATCH)\b/.test(exposure.kemp)
      && /Lean: (OVER|UNDER|WATCH)/.test(exposure.kemp),
      exposure.kemp.slice(0, 90).replace(/\s+/g, ' '));

    await clickText(page, '.filter-toggle', 'Show only overloaded');
    await wait(250);
    const filtered = await page.$$eval('.exp-block', (rows) => rows.map((r) => r.textContent));
    check('the overloaded filter narrows the table',
      filtered.length < exposure.rows.length && filtered.every((row) => row.includes('OVERLOADED')),
      `${filtered.length} of ${exposure.rows.length}`);
    await clickText(page, '.filter-toggle', 'Showing overloaded only');
    await wait(200);

    /* ------------------------------------------------------- market desk */

    await clickText(page, '.tabbar-btn', 'Market');
    await wait(350);
    const desk = await page.evaluate(() => ({
      games: document.querySelectorAll('.game-card').length,
      text: document.querySelector('#view').textContent,
      moves: document.querySelectorAll('.line-move-note').length,
      slip: /bet slip|deposit|cash out|parlay/i.test(document.querySelector('#view').textContent),
    }));
    check('market desk lists the whole slate', desk.games === 8, `${desk.games} games`);
    check('each game shows a line-move note', desk.moves === 8);
    check('market desk has no bet slip, deposit, cash-out or parlay builder', !desk.slip);

    await page.type('#prop-search', 'lund');
    await wait(300);
    const search = await page.$$eval('.search-row', (rows) => rows.map((r) => r.textContent));
    check('prop search finds a player', search.length >= 1 && search[0].includes('Xavier Lund'), search[0] || 'no match');

    /* ----------------------------------------------------- command center */

    await page.evaluate(() => window.__exposure.go('command'));
    await wait(400);
    const firstBoard = await page.evaluate(() => [...document.querySelectorAll('.live-points')].map((n) => Number(n.textContent)));
    check('command center groups starters by game state',
      await page.$eval('#view', (n) => /LIVE/.test(n.textContent) && /FINAL/.test(n.textContent) && /UPCOMING/.test(n.textContent)));
    await wait(5200);
    const secondBoard = await page.evaluate(() => [...document.querySelectorAll('.live-points')].map((n) => Number(n.textContent)));
    const moved = firstBoard.some((value, index) => secondBoard[index] > value);
    check('live stat ticks advance', moved,
      `${firstBoard.slice(0, 4).join(',')} -> ${secondBoard.slice(0, 4).join(',')}`);
    const alerts = await page.$$eval('.live-alert', (nodes) => nodes.map((n) => n.textContent));
    check('the alert rail fills with live events', alerts.length >= 1, alerts[0] || 'none yet');

    /* ---------------------------------------------------------- settings */

    await page.evaluate(() => window.__exposure.go('settings'));
    await wait(300);
    await clickText(page, '.toggle', 'Hide the betting tab');
    await wait(300);
    const hidden = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('.tabbar-btn')].map((b) => b.textContent),
      stored: JSON.parse(localStorage.getItem('exposure.state.v1')).settings.hideBetting,
    }));
    check('hiding betting removes the market tab',
      hidden.stored && !hidden.tabs.some((t) => t.includes('Market')) && hidden.tabs.some((t) => t.includes('Live')),
      hidden.tabs.join(', '));

    await page.evaluate(() => window.__exposure.go('player', { id: 'rb-kemp' }));
    await wait(300);
    const hiddenTabs = await page.$$eval('.tab', (nodes) => nodes.map((n) => n.textContent));
    check('the player card drops its market tab too', !hiddenTabs.includes('Market'), hiddenTabs.join(', '));

    await page.evaluate(() => window.__exposure.go('settings'));
    await wait(250);
    await clickText(page, '.toggle', 'Hide the betting tab');
    await wait(250);

    /* ---------------------------------------------- constraints and a11y */

    await page.evaluate(() => window.__exposure.go('home'));
    await wait(300);
    const guards = await page.evaluate(() => {
      const text = document.body.textContent;
      return {
        images: document.images.length,
        media: document.querySelectorAll('video, iframe, embed, picture, canvas').length,
        banned: [/NFL Pro\b/i, /All-?22/i, /RedZone/, /NFL\s?\+/, /Super Bowl/i, /\bofficial/i, /\blicensed\b/i]
          .filter((pattern) => pattern.test(text.replace(/NFL Properties/g, ''))).map(String),
        footer: document.querySelector('.page-footer')?.textContent || '',
      };
    });
    check('no image is rendered anywhere', guards.images === 0);
    check('no video, embed or canvas is rendered', guards.media === 0);
    check('no borrowed product name reaches the screen', guards.banned.length === 0, guards.banned.join(', '));
    check('the footer repeats both disclosures verbatim',
      guards.footer.includes('Not affiliated with, endorsed by, or sponsored by the National Football League')
      && guards.footer.includes('call 1-800-GAMBLER'));

    const targets = await page.evaluate(() => {
      const small = [];
      for (const node of document.querySelectorAll('button, a, select, input')) {
        const box = node.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.height < 43.5) small.push(`${node.className || node.tagName}:${Math.round(box.height)}px`);
      }
      return small;
    });
    check('every visible control clears a 44px tap target', targets.length === 0, targets.slice(0, 5).join(', '));

    // Nothing may scroll sideways, at any phone width the app claims to serve.
    for (const width of [320, 390, 430]) {
      await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true });
      await wait(250);
      const screens = [];
      for (const [route, params] of [['home', {}], ['lineup', {}], ['player', { id: 'rb-kemp', tab: 'market' }], ['exposure', {}], ['market', {}], ['command', {}], ['settings', {}]]) {
        await page.evaluate((r, p) => window.__exposure.go(r, p), route, params);
        await wait(220);
        const measured = await overflow(page);
        if (measured.scroll > width + 0.5 || measured.offenders.length) {
          screens.push(`${route}@${width}: ${measured.scroll}px ${measured.offenders.join(',')}`);
        }
      }
      check(`nothing overflows sideways at ${width}px`, screens.length === 0, screens.join(' | '));
    }
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.__exposure.go('home'));
    await wait(250);

    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { color: style.color, background: style.backgroundColor };
    });
    check('body text is high contrast on the dark ground',
      contrast.color === 'rgb(232, 230, 225)' && contrast.background === 'rgb(7, 8, 10)',
      `${contrast.color} on ${contrast.background}`);

    /* -------------------------------------------------------- deletion */

    await page.evaluate(() => window.__exposure.go('settings'));
    await wait(250);
    await clickText(page, 'button', 'Delete account and all data');
    await wait(250);
    await clickText(page, '.sheet button', 'Delete it all');
    await wait(400);
    const afterDelete = await page.evaluate(() => ({
      stored: localStorage.getItem('exposure.state.v1'),
      text: document.getElementById('view').textContent,
    }));
    check('deleting the account clears local storage and returns to setup',
      !afterDelete.stored && afterDelete.text.includes('Create your account'));

    if (shotPath) {
      await page.evaluate(() => window.__exposure.go('home'));
      await wait(300);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`\n  screenshot -> ${shotPath}`);
    }

    check('no uncaught script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
  if (failed.length) {
    console.error('Failed:');
    for (const c of failed) console.error(`  - ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
