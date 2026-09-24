/**
 * End-to-end smoke test for the ASTRA peptide intelligence platform.
 *
 * Serves `public/astra/` statically, drives it in headless Chromium, and checks
 * the parts that only exist once a browser is involved: the entrance reveals
 * and scroll-links to the lab, WebGL renders the vault, every deck opens, the
 * engine answers and builds a dossier, "Show me the science" expands into real
 * studies, the decoder decodes, the guardian blocks bad copy, the studio
 * generates thirty governed assets, the command centre proposes a campaign, and
 * the whole platform survives with the network cut.
 *
 * Usage:
 *   node scripts/qa-astra.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-astra
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

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });

  const base = `http://127.0.0.1:${port}/astra/`;
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 45000 });
  await wait(1400);

  /* ------------------------------------------------------------ entrance */

  const intro = await page.evaluate(() => ({
    chapters: document.querySelectorAll('.chapter').length,
    cards: document.querySelectorAll('.vial-card').length,
    revealed: document.querySelectorAll('.chapter.revealed').length,
    rail: document.querySelectorAll('.rail-dot').length,
    ladder: document.querySelectorAll('.tier-row').length,
  }));
  check('the entrance builds every chapter', intro.chapters >= 6, `${intro.chapters} chapters`);
  check('the compound showcase is populated', intro.cards >= 12, `${intro.cards} cards`);
  check('the first chapter reveals on load', intro.revealed >= 1, `${intro.revealed} revealed`);
  check('the scroll rail has a dot per chapter', intro.rail === intro.chapters, `${intro.rail} dots`);
  check('the evidence ladder renders all seven tiers', intro.ladder === 7, `${intro.ladder} rows`);

  const webgl = await page.evaluate(() => ({
    ok: Boolean(globalThis.__astra?.lab?.ok),
    width: document.getElementById('lab').width,
    running: Boolean(globalThis.__astra?.lab?.running),
  }));
  check('WebGL2 laboratory initialises', webgl.ok, webgl.ok ? `canvas ${webgl.width}px` : 'no context');
  check('the render loop is running', webgl.running);

  // Scrolling the entrance should move the lab camera and advance the rail.
  const before = await page.evaluate(() => ({ ...globalThis.__astra.lab.goal, target: [...globalThis.__astra.lab.goal.target] }));
  await page.evaluate(() => {
    const intro = document.getElementById('intro');
    intro.scrollTop = intro.scrollHeight * 0.55;
    intro.dispatchEvent(new Event('scroll'));
  });
  await wait(900);
  const after = await page.evaluate(() => ({
    goal: { ...globalThis.__astra.lab.goal, target: [...globalThis.__astra.lab.goal.target] },
    progress: Number(document.querySelector('.rail-progress').style.transform.replace(/[^\d.]/g, '')) || 0,
    revealed: document.querySelectorAll('.vial-card.revealed').length,
  }));
  check('scrolling flies the lab camera to a new waypoint',
    after.goal.distance !== before.distance || after.goal.yaw !== before.yaw,
    `distance ${before.distance} -> ${after.goal.distance}`);
  check('the scroll rail tracks progress', after.progress > 0, `scaleY ${after.progress}`);
  check('showcase cards reveal on scroll', after.revealed > 0, `${after.revealed} revealed`);

  if (shotPath) {
    await page.evaluate(() => { document.getElementById('intro').scrollTop = 0; });
    await wait(700);
    await page.screenshot({ path: shotPath });
  }

  /* --------------------------------------------------------------- decks */

  await page.evaluate(() => document.querySelector('[data-deck="engine"]').click());
  await wait(800);
  check('entering the facility reveals the console',
    await page.evaluate(() => document.body.classList.contains('entered')));

  const decks = ['engine', 'graph', 'decoder', 'ar', 'bodyfat', 'compare', 'verify', 'studio', 'command', 'profile', 'settings'];
  for (const deck of decks) {
    await page.evaluate((id) => globalThis.__astra.go(id), deck);
    await wait(520);
    const info = await page.evaluate(() => {
      const body = document.getElementById('panel-body');
      return {
        title: document.getElementById('panel-title').textContent,
        // Decks whose first state is an empty input are legitimately short, so
        // the assertion is that a deck root mounted with a heading and controls
        // rather than that it produced a wall of text.
        root: body.firstElementChild?.className || '',
        heading: Boolean(body.querySelector('.deck-head h2')),
        controls: body.querySelectorAll('button, input, select, textarea, a').length,
        failed: body.textContent.includes('failed to render'),
      };
    });
    check(`the ${deck} deck renders`,
      info.root.includes('deck') && info.controls > 0 && !info.failed,
      `${info.controls} controls — ${info.title}`);
  }

  /* -------------------------------------------------------------- engine */

  await page.evaluate(() => globalThis.__astra.go('engine'));
  await wait(400);
  await page.type('.engine-input', 'does BPC-157 have human evidence');
  await page.click('.engine-form .btn.primary');
  await wait(900);

  const engine = await page.evaluate(() => ({
    answered: Boolean(document.querySelector('.answer')),
    dossier: Boolean(document.querySelector('.dossier')),
    sections: document.querySelectorAll('.dossier-section').length,
    science: document.querySelectorAll('.btn.science').length,
    meter: document.querySelector('.dossier .meter-value')?.textContent,
  }));
  check('the engine answers a question', engine.answered);
  check('the answer opens the compound dossier', engine.dossier);
  check('the dossier renders all eight sections', engine.sections === 8, `${engine.sections} sections`);
  check('every claim carries a "Show me the science" control', engine.science >= 3, `${engine.science} claims`);
  check('the dossier shows an evidence percentage', /%$/.test(engine.meter || ''), engine.meter);

  const xpBefore = await page.evaluate(() => globalThis.__astra.progress.xp);
  await page.evaluate(() => document.querySelector('.btn.science').click());
  await wait(500);
  const science = await page.evaluate(() => ({
    open: document.querySelector('.claim-evidence') && !document.querySelector('.claim-evidence').hidden,
    studies: document.querySelectorAll('.claim-evidence .study').length,
    links: document.querySelectorAll('.claim-evidence .source-link').length,
    xp: globalThis.__astra.progress.xp,
  }));
  check('"Show me the science" expands into studies', science.open && science.studies > 0, `${science.studies} studies`);
  check('every expanded study links to the literature', science.links === science.studies, `${science.links} links`);
  check('research literacy earns progression', science.xp > xpBefore, `${xpBefore} -> ${science.xp} XP`);

  /* ------------------------------------------------------------- decoder */

  await page.evaluate(() => globalThis.__astra.go('decoder'));
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.decoder-actions .btn')]
    .find((button) => button.textContent.includes('sample')).click());
  await wait(600);
  const decoder = await page.evaluate(() => ({
    blocks: document.querySelectorAll('.decoder-output .block').length,
    headline: document.querySelector('.decode-headline')?.textContent || '',
    notProven: document.querySelectorAll('.not-proven li').length,
  }));
  check('the decoder produces every section', decoder.blocks >= 6, `${decoder.blocks} blocks`);
  check('the decoder grades an animal study as animal evidence',
    /Animal/i.test(decoder.headline), decoder.headline);
  check('the decoder says what the study does not prove', decoder.notProven >= 3, `${decoder.notProven} statements`);

  /* -------------------------------------------------------------- verify */

  await page.evaluate(() => globalThis.__astra.go('verify'));
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.claim-actions .btn')]
    .find((button) => button.textContent.includes('example')).click());
  await wait(600);
  const myth = await page.evaluate(() => ({
    chain: document.querySelectorAll('.chain-step').length,
    verdict: document.querySelector('.verdict h4')?.textContent || '',
    flagged: document.querySelectorAll('.guard-inline li').length,
  }));
  check('the myth detector shows the full evidence chain', myth.chain === 6, `${myth.chain} steps`);
  check('an overstated claim is called overstated',
    /overstated|contradicted|unsupported/i.test(myth.verdict), myth.verdict);
  check('the guardian flags the language inline', myth.flagged > 0, `${myth.flagged} flags`);

  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((tab) => tab.textContent.includes('Guardian')).click());
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.claim-actions .btn')]
    .find((button) => button.textContent.includes('example')).click());
  await wait(500);
  const guardian = await page.evaluate(() => ({
    severity: document.querySelector('.guard-verdict')?.dataset.severity,
    findings: document.querySelectorAll('.finding').length,
    rewrite: (document.querySelector('.rewrite pre')?.textContent || '').length,
  }));
  check('the guardian blocks unpublishable copy', guardian.severity === 'block', guardian.severity);
  check('the guardian names every offending phrase', guardian.findings >= 4, `${guardian.findings} findings`);
  check('the guardian offers a compliant rewrite', guardian.rewrite > 80, `${guardian.rewrite} chars`);

  /* -------------------------------------------------------------- studio */

  await page.evaluate(() => globalThis.__astra.go('studio'));
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.studio-controls .btn')]
    .find((button) => button.textContent.includes('Generate')).click());
  await wait(900);
  const studio = await page.evaluate(() => ({
    assets: document.querySelectorAll('.asset').length,
    blocked: document.querySelectorAll('.asset[data-severity="block"]').length,
    groups: document.querySelectorAll('.pack-group').length,
    ab: document.querySelectorAll('.ab-table tr').length,
    reco: (document.querySelector('.ab-reco')?.textContent || '').length,
  }));
  check('one paper becomes thirty assets', studio.assets === 30, `${studio.assets} assets`);
  check('assets span every format', studio.groups === 9, `${studio.groups} groups`);
  check('the studio publishes nothing the guardian would block', studio.blocked === 0, `${studio.blocked} blocked`);
  check('the A/B lab offers variants and a recommendation', studio.ab === 5 && studio.reco > 40, `${studio.ab} variants`);

  /* ------------------------------------------------------------- command */

  await page.evaluate(() => globalThis.__astra.go('command'));
  await wait(500);
  await page.evaluate(() => [...document.querySelectorAll('.generate .btn')]
    .find((button) => button.textContent.includes('Generate campaign')).click());
  await wait(700);
  const command = await page.evaluate(() => ({
    kpis: document.querySelectorAll('.kpi').length,
    attention: document.querySelectorAll('.attention-item').length,
    beats: document.querySelectorAll('.beats li').length,
    guardrails: document.querySelectorAll('.guardrails li').length,
    approval: Boolean([...document.querySelectorAll('.approval-actions .btn')].find((b) => b.textContent.includes('Approve'))),
  }));
  check('the executive dashboard reports its metrics', command.kpis >= 6, `${command.kpis} tiles`);
  check('the dashboard surfaces what needs attention', command.attention >= 2, `${command.attention} items`);
  check('a campaign proposal is a seven-day plan', command.beats === 7, `${command.beats} beats`);
  check('the proposal carries compliance guardrails', command.guardrails >= 4, `${command.guardrails} guardrails`);
  check('nothing publishes without human approval', command.approval);

  /* --------------------------------------------------------------- graph */

  await page.evaluate(() => globalThis.__astra.go('graph'));
  await wait(900);
  const graph = await page.evaluate(() => ({
    chips: document.querySelectorAll('.graph-list .chip').length,
    selected: document.querySelector('.graph-detail h3')?.textContent || '',
    scene: globalThis.__astra.lab.scene,
    nodes: globalThis.__astra.ctx.graph().nodes.length,
  }));
  check('the knowledge graph is populated', graph.nodes >= 60, `${graph.nodes} nodes`);
  check('graph nodes are browsable', graph.chips >= 20, `${graph.chips} chips`);
  check('opening the map switches the lab to the graph scene', graph.scene === 'graph', graph.scene);
  check('a node is selected by default', graph.selected.length > 0, graph.selected);

  await page.evaluate(() => document.querySelectorAll('.neighbours .chip')[0]?.click());
  await wait(400);
  check('graph neighbours are navigable',
    await page.evaluate(() => Boolean(document.querySelector('.graph-detail h3'))));

  /* ------------------------------------------------------------ the lab */

  await page.evaluate(() => globalThis.__astra.go('compare'));
  await wait(500);
  const comparison = await page.evaluate(() => ({
    axes: document.querySelectorAll('.compare-table tr').length,
    verdict: document.querySelector('.verdict h4')?.textContent || '',
  }));
  check('the comparison lab reports every axis', comparison.axes === 5, `${comparison.axes} axes`);
  check('the comparison names the better evidence base',
    /better evidence base|Evenly matched/i.test(comparison.verdict), comparison.verdict);

  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((tab) => tab.textContent.includes('Debate')).click());
  await wait(500);
  const debate = await page.evaluate(() => ({
    opinions: document.querySelectorAll('.opinion').length,
    consensus: (document.querySelector('.consensus-verdict')?.textContent || '').length,
  }));
  check('the debate room convenes four reviewers', debate.opinions === 4, `${debate.opinions} reviewers`);
  check('the debate produces a consensus report', debate.consensus > 40);

  await page.evaluate(() => [...document.querySelectorAll('.tab')].find((tab) => tab.textContent.includes('Simulator')).click());
  await wait(500);
  const simBefore = await page.evaluate(() => document.querySelector('.sim-verdict')?.dataset.level);
  await page.evaluate(() => {
    const slider = document.querySelector('.sim-slider input');
    slider.value = '3000';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wait(400);
  const simAfter = await page.evaluate(() => ({
    level: document.querySelector('.sim-verdict')?.dataset.level,
    readouts: document.querySelectorAll('.readout').length,
  }));
  check('the simulator reports power, false-positive risk and tier', simAfter.readouts === 4);
  check('raising the sample size changes the verdict',
    simAfter.level !== simBefore, `${simBefore} -> ${simAfter.level}`);

  /* ----------------------------------------------------------- AR bench */

  await page.evaluate(() => globalThis.__astra.go('ar'));
  await wait(1100);

  const arEnter = await page.evaluate(() => ({
    mode: document.body.classList.contains('ar-mode'),
    arOn: globalThis.__astra.lab.ar.on,
    scene: globalThis.__astra.lab.scene,
    panels: document.querySelectorAll('.ar-panel').length,
    surface: getComputedStyle(document.getElementById('ar-surface')).display,
  }));
  check('entering AR switches the renderer into AR mode', arEnter.mode && arEnter.arOn, `scene ${arEnter.scene}`);
  check('the compound is surrounded by data panels', arEnter.panels >= 8, `${arEnter.panels} panels`);
  check('the drag surface is live in AR', arEnter.surface === 'block', arEnter.surface);

  // Panels must be positioned by projection, not stacked at the origin.
  const placement = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.ar-panel')];
    // A panel that has faded out is never positioned, which is the point —
    // only the ones actually on screen need a transform.
    const visible = nodes.filter((node) => Number(node.style.opacity) > 0.02);
    const positioned = visible.filter((node) => /translate3d\((-?[\d.]+)px/.test(node.style.transform));
    const xs = positioned.map((node) => Number(node.style.transform.match(/translate3d\((-?[\d.]+)px/)[1]));
    return {
      positioned: positioned.length,
      visible: visible.length,
      spread: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
      hidden: nodes.length - visible.length,
      offscreen: xs.filter((x) => x < 0 || x > window.innerWidth).length,
    };
  });
  check('every visible panel is anchored in three dimensions',
    placement.positioned === placement.visible && placement.visible >= 5,
    `${placement.positioned}/${placement.visible} positioned`);
  check('panels spread around the compound', placement.spread > 120, `${Math.round(placement.spread)}px spread`);
  check('panels behind the compound fade out', placement.hidden > 0, `${placement.hidden} hidden`);
  check('no visible panel drifts off screen', placement.offscreen === 0, `${placement.offscreen} off screen`);

  // Rotating the compound must move the panels with it.
  const beforeSpin = await page.evaluate(() => document.querySelector('.ar-panel').style.transform);
  await page.evaluate(() => {
    globalThis.__astra.ar.yaw += 1.2;
  });
  await wait(400);
  const afterSpin = await page.evaluate(() => document.querySelector('.ar-panel').style.transform);
  check('turning the compound carries its evidence round with it', beforeSpin !== afterSpin);

  // The camera is optional: with a fake device it starts, and the scene is
  // identical either way.
  const camera = await page.evaluate(async () => {
    const started = await globalThis.__astra.ar.startCamera();
    return { started, live: document.getElementById('ar-video').classList.contains('live') };
  });
  check('the camera attaches as the AR backdrop', camera.started && camera.live, `started ${camera.started}`);

  const capture = await page.evaluate(async () => {
    const url = await globalThis.__astra.ar.capture();
    return { ok: typeof url === 'string' && url.startsWith('data:image/png'), length: url ? url.length : 0 };
  });
  check('the AR view captures a shareable card', capture.ok, `${Math.round(capture.length / 1024)}KB`);

  const panelDetail = await page.evaluate(() => {
    const study = [...document.querySelectorAll('.ar-panel')].find((node) => node.className.includes('ar-study'));
    study.click();
    return new Promise((resolve) => setTimeout(() => resolve({
      opened: Boolean(document.querySelector('.ar-detail-head')),
      link: document.querySelector('.ar-detail .source-link')?.href || '',
    }), 300));
  });
  check('a study panel opens its full record', panelDetail.opened);
  check('the opened study links to the literature',
    panelDetail.link.startsWith('https://pubmed.ncbi.nlm.nih.gov/'), panelDetail.link.slice(0, 48));

  // Switching compounds rebuilds the orbit.
  const swapped = await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.ar-picker .chip')].find((node) => node.textContent === 'Semaglutide');
    chip.click();
    return new Promise((resolve) => setTimeout(() => resolve({
      compound: globalThis.__astra.ar.entry.id,
      panels: document.querySelectorAll('.ar-panel').length,
    }), 500));
  });
  check('changing the compound rebuilds its evidence orbit',
    swapped.compound === 'semaglutide' && swapped.panels >= 8, `${swapped.panels} panels`);

  // Leaving AR must release the camera and restore the vault.
  await page.evaluate(() => globalThis.__astra.go('engine'));
  await wait(700);
  const arExit = await page.evaluate(() => ({
    mode: document.body.classList.contains('ar-mode'),
    arOn: globalThis.__astra.lab.ar.on,
    live: document.getElementById('ar-video').classList.contains('live'),
  }));
  check('leaving AR restores the vault and releases the camera',
    !arExit.mode && !arExit.arOn && !arExit.live);

  /* ---------------------------------------------------- QR sheet & links */

  await page.evaluate(() => globalThis.__astra.go('ar'));
  await wait(700);
  await page.evaluate(() => [...document.querySelectorAll('.ar-actions .btn')]
    .find((button) => button.textContent.includes('QR sheet')).click());
  await wait(900);

  const sheet = await page.evaluate(() => {
    const host = document.getElementById('qr-sheet');
    const cards = [...host.querySelectorAll('.qr-card')];
    return {
      shown: !host.hidden,
      cards: cards.length,
      svgs: host.querySelectorAll('.qr-code svg').length,
      urls: cards.map((card) => card.querySelector('.qr-url').textContent),
      printable: document.body.classList.contains('sheet-open'),
    };
  });
  check('the QR sheet builds a card per compound', sheet.shown && sheet.cards === 13, `${sheet.cards} cards`);
  // Colour carries meaning here — the compound's accent and its evidence band —
  // so a sheet where every card is the same colour is a broken sheet.
  const accents = await page.evaluate(() => {
    const read = (node, name) => getComputedStyle(node).getPropertyValue(name).trim();
    const cards = [...document.querySelectorAll('.qr-card')];
    return {
      accents: new Set(cards.map((card) => read(card, '--accent'))).size,
      bands: new Set(cards.map((card) => read(card.querySelector('.qr-band'), '--band'))).size,
    };
  });
  check('each card carries its own compound accent', accents.accents >= 8, `${accents.accents} distinct accents`);
  check('each card carries its evidence band colour', accents.bands >= 4, `${accents.bands} distinct bands`);
  check('every card carries a rendered code', sheet.svgs === sheet.cards, `${sheet.svgs} codes`);
  check('codes encode the live origin, not a baked one',
    sheet.urls.every((url) => url.startsWith(`http://127.0.0.1:${port}/astra/?compound=`)),
    sheet.urls[0]);
  check('every card points at a distinct compound',
    new Set(sheet.urls).size === sheet.cards, `${new Set(sheet.urls).size} distinct`);
  check('the sheet takes over for printing', sheet.printable);

  await page.evaluate(() => [...document.querySelectorAll('.qr-actions .btn')]
    .find((button) => button.textContent === 'Close').click());
  await wait(300);
  check('the sheet closes again',
    await page.evaluate(() => document.getElementById('qr-sheet').hidden));

  // The whole point: a scanned card must open that compound's bench.
  const scanned = await page.goto(`${base}?compound=ghk-cu#ar`, { waitUntil: 'domcontentloaded' })
    .then(() => wait(2200))
    .then(() => page.evaluate(() => ({
      entered: document.body.classList.contains('entered'),
      deck: globalThis.__astra.state.deck,
      compound: globalThis.__astra.ar.entry?.id,
      arOn: globalThis.__astra.lab.ar.on,
      panels: document.querySelectorAll('.ar-panel').length,
    })));
  check('a scanned card skips the entrance', scanned.entered);
  check('a scanned card opens the AR bench', scanned.deck === 'ar' && scanned.arOn, `deck ${scanned.deck}`);
  check('a scanned card opens the right compound', scanned.compound === 'ghk-cu', `got ${scanned.compound}`);
  check('the scanned compound arrives with its evidence', scanned.panels >= 8, `${scanned.panels} panels`);

  // A compound with no deck lands on the dossier instead.
  const dossierLink = await page.goto(`${base}?compound=semaglutide`, { waitUntil: 'domcontentloaded' })
    .then(() => wait(2000))
    .then(() => page.evaluate(() => ({
      deck: globalThis.__astra.state.deck,
      subject: globalThis.__astra.ctx.deckState.engine?.subject,
      dossier: document.querySelector('.dossier h2')?.textContent || '',
    })));
  check('a card with no deck opens the dossier',
    dossierLink.deck === 'engine' && dossierLink.subject === 'semaglutide', `deck ${dossierLink.deck}`);
  check('the dossier it opens is the right one', dossierLink.dossier === 'Semaglutide', dossierLink.dossier);

  // A stale code must not strand anyone on an empty deck.
  const stale = await page.goto(`${base}?compound=discontinued-thing#ar`, { waitUntil: 'domcontentloaded' })
    .then(() => wait(1800))
    .then(() => page.evaluate(() => ({
      broken: document.getElementById('panel-body').textContent.includes('failed to render'),
      toast: document.getElementById('toast').textContent,
      deck: globalThis.__astra.state.deck,
    })));
  check('a stale code still opens the deck it asked for', stale.deck === 'ar' && !stale.broken, stale.deck);
  check('a stale code says so rather than quietly showing another compound',
    /does not cover/i.test(stale.toast), stale.toast.slice(0, 70));

  // Back to a clean session for the checks that follow.
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await page.evaluate(() => document.querySelector('[data-deck="engine"]').click());
  await wait(700);

  /* ------------------------------------------------------------ progress */

  await page.evaluate(() => globalThis.__astra.go('profile'));
  await wait(500);
  const profile = await page.evaluate(() => ({
    rank: document.querySelector('.deck-head .kicker')?.textContent || '',
    unlocks: document.querySelectorAll('.unlock').length,
    log: document.querySelectorAll('.log-list li').length,
    goals: document.querySelectorAll('.interests .chip').length,
  }));
  check('the record shows a clearance level', /LEVEL|OMEGA/.test(profile.rank), profile.rank);
  check('the record lists every unlockable', profile.unlocks === 7, `${profile.unlocks} unlocks`);
  check('the record logs research activity', profile.log > 0, `${profile.log} entries`);
  check('interests are selectable', profile.goals >= 8, `${profile.goals} goals`);

  await page.evaluate(() => document.querySelector('.interests .chip').click());
  await wait(400);
  check('selecting an interest reorganises the platform',
    await page.evaluate(() => document.querySelectorAll('.for-you .library-card').length > 0));

  /* ------------------------------------------------------ body composition */

  await page.evaluate(() => globalThis.__astra.go('bodyfat'));
  await wait(400);
  const bodyEmpty = await page.evaluate(() => {
    globalThis.__astra.ctx.deckState.bodyfat.tab = 'reading';
    globalThis.__astra.ctx.render();
    return document.getElementById('panel-body').textContent;
  });
  check('with nothing measured the body bench shows no figure',
    !/\d+\.\d%/.test(bodyEmpty) && /No equation has what it needs/.test(bodyEmpty));

  const reading = await page.evaluate(() => {
    const ctx = globalThis.__astra.ctx;
    Object.assign(ctx.deckState.bodyfat.record.measures, {
      sex: 'male', age: 34, height: 180, weight: 82, neck: 38, waist: 88, hip: 100,
    });
    ctx.deckState.bodyfat.tab = 'reading';
    ctx.render();
    const body = document.getElementById('panel-body');
    return {
      range: body.querySelector('.bf-range')?.textContent || '',
      point: body.querySelector('.bf-point')?.textContent || '',
      tiles: body.querySelectorAll('.bf-tile').length,
      touched: body.querySelectorAll('.bf-band.touched').length,
      methods: body.querySelectorAll('.bf-method').length,
      cannot: body.querySelectorAll('.bf-cannot li').length,
      text: body.textContent,
    };
  });
  check('a measured body produces a range, not a single number',
    /^\d+\.\d–\d+\.\d%$/.test(reading.range), reading.range);
  check('the point estimate is shown below the range, not above it',
    /Central estimate/.test(reading.point), reading.point);
  check('every contributing method reports itself separately',
    reading.methods === Number(reading.point.match(/from (\d+)/)?.[1]),
    `${reading.methods} shown, headline claims ${reading.point.match(/from (\d+)/)?.[1]}`);
  check('the reading names what it cannot see', reading.cannot >= 4, `${reading.cannot} limits`);
  check('the error bar is shown against the population bands',
    reading.touched >= 1, `${reading.touched} bands lit`);
  check('the descriptive bands are not presented as targets',
    /not health thresholds, not targets/.test(reading.text));
  check('the deck refuses to advise',
    /conversation with a clinician/.test(reading.text));

  const ambiguous = await page.evaluate(() => {
    const body = document.getElementById('panel-body');
    return body.querySelector('.bf-verdict')?.textContent || '';
  });
  check('an error bar spanning several bands says so rather than naming one',
    /bands at once|single band/.test(ambiguous), ambiguous.slice(0, 80));

  const tracking = await page.evaluate(() => {
    const ctx = globalThis.__astra.ctx;
    const day = 86400000;
    ctx.deckState.bodyfat.record.log = [
      { at: Date.now() - 30 * day, percent: 19.4, methodId: 'navy', weight: 84 },
      { at: Date.now(), percent: 18.9, methodId: 'navy', weight: 83 },
    ];
    ctx.deckState.bodyfat.tab = 'track';
    ctx.render();
    const body = document.getElementById('panel-body');
    return {
      verdict: body.querySelector('.bf-trend-verdict')?.textContent || '',
      noise: Boolean(body.querySelector('.bf-trend.noise')),
      rows: body.querySelectorAll('.bf-log-row').length,
      table: body.querySelectorAll('.bf-table tbody tr').length,
    };
  });
  check('a change inside the measurement error is called noise, not progress',
    tracking.noise && /not yet distinguishable/.test(tracking.verdict), tracking.verdict.slice(0, 70));
  check('the log lists what was recorded', tracking.rows === 2, `${tracking.rows} rows`);
  check('every method publishes both its accuracy and its resolution',
    tracking.table >= 4, `${tracking.table} rows`);

  const levers = await page.evaluate(() => {
    const ctx = globalThis.__astra.ctx;
    ctx.deckState.bodyfat.tab = 'levers';
    ctx.render();
    const body = document.getElementById('panel-body');
    return {
      count: body.querySelectorAll('.bf-lever').length,
      tiers: body.querySelectorAll('.bf-lever .tier-chip').length,
      links: body.querySelectorAll('.bf-lever .source-link').length,
      text: body.textContent,
    };
  });
  check('what-moves-it is graded like every other claim',
    levers.count >= 5 && levers.tiers === levers.count, `${levers.count} findings, ${levers.tiers} tiers`);
  check('every finding there can be looked up', levers.links === levers.count);
  check('the deck states its own boundary',
    /does not tell you what your body fat should be/.test(levers.text));

  const cameraHonesty = await page.evaluate(() => {
    const ctx = globalThis.__astra.ctx;
    ctx.deckState.bodyfat.tab = 'camera';
    ctx.render();
    return document.getElementById('panel-body').textContent;
  });
  check('the camera tab says outright that it does not estimate body fat',
    /not estimating your body fat/.test(cameraHonesty));
  check('the camera tab explains what it is actually for',
    /comparable to the last one/.test(cameraHonesty));

  check('the body bench stores nothing off the device',
    /stored in this browser and nowhere else/.test(await page.evaluate(() => {
      const ctx = globalThis.__astra.ctx;
      ctx.deckState.bodyfat.tab = 'measure';
      ctx.render();
      return document.getElementById('panel-body').textContent;
    })));

  /* ------------------------------------------------------------- offline */

  await page.setOfflineMode(true);
  await page.evaluate(() => globalThis.__astra.go('command'));
  await wait(400);
  await page.evaluate(() => [...document.querySelectorAll('.radar .btn')]
    .find((button) => button.textContent.includes('Sweep')).click());
  await wait(2500);
  const offline = await page.evaluate(() => ({
    status: document.querySelector('.radar-status')?.dataset.status || 'none',
    warned: Boolean(document.querySelector('.radar-host .warn')),
  }));
  check('the radar degrades honestly with no network',
    ['offline', 'cached'].includes(offline.status), offline.status);
  check('an empty sweep says so rather than showing nothing', offline.warned || offline.status === 'cached');

  await page.evaluate(() => globalThis.__astra.go('engine'));
  await wait(400);
  const offlineEngine = await page.evaluate(() => {
    document.querySelector('.engine-input').value = 'what is semaglutide';
    document.querySelector('.engine-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    return new Promise((resolve) => setTimeout(() => resolve({
      answered: Boolean(document.querySelector('.answer')),
      dossier: Boolean(document.querySelector('.dossier')),
    }), 500));
  });
  check('the engine still answers offline', offlineEngine.answered && offlineEngine.dossier);
  await page.setOfflineMode(false);

  /* -------------------------------------------------------------- health */

  const fatal = problems.filter((problem) => !/favicon|Failed to load resource.*(europepmc|ebi\.ac\.uk)|net::ERR_INTERNET_DISCONNECTED/i.test(problem));
  check('no unexpected console or page errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  await browser.close();
  server.close();

  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (shotPath) console.log(`screenshot: ${shotPath}`);
  if (failed.length) {
    console.log('\nfailed:');
    for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
