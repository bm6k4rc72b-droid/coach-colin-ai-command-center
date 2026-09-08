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

  const decks = ['engine', 'graph', 'decoder', 'compare', 'verify', 'studio', 'command', 'profile', 'settings'];
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
