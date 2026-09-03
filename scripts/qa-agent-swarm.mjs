/**
 * End-to-end smoke test for the agent swarm console.
 *
 * The unit suite covers the engine with no DOM; this covers the half it cannot
 * reach — that the console actually mounts, that a run's events render into the
 * task list, activity log and output pane, and that the orbital canvas draws.
 *
 * A Vite dev server serves the real modules, and `window.fetch` is stubbed in
 * the page so a scripted multi-agent run executes with no API key and no
 * network: planner turn → two workers (one calling a globe tool) → summary.
 *
 * Usage:
 *   node scripts/qa-agent-swarm.mjs [--keep] [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-agent-swarm
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const KEEP = args.includes('--keep');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

/** Load Puppeteer, tolerating a `puppeteer-core`-only install. */
async function loadPuppeteer() {
  try {
    return (await import('puppeteer')).default;
  } catch {
    return (await import('puppeteer-core')).default;
  }
}

/** The harness page: real modules, stubbed transport. */
const HARNESS = `
<!doctype html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head>
<body>
<script type="module">
import { createOrchestrator } from '/src/agents/orchestrator.js';
import { mountAgentConsole } from '/src/agents/agentConsole.js';

const gevCalls = [];
let planned = false;
let flyTurn = 0;
let writeTurn = 0;

// Stub the transport, not the modules: every layer under the console is real.
window.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : {};
  const json = (payload) => new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

  if (!planned) {
    planned = true;
    return json({ content: JSON.stringify({ tasks: [
      { id: 'g1', agent: 'geo-analyst', title: 'Fly to Kyoto', instruction: 'FLY_STEP' },
      { id: 'w1', agent: 'writer', title: 'Write the brief', instruction: 'WRITE_STEP', dependsOn: ['g1'] },
    ] }), tool_calls: [] });
  }

  const user = body.messages.find((m) => m.role === 'user')?.content || '';
  if (user.startsWith('ORIGINAL GOAL:')) return json({ content: 'SWARM SUMMARY OK', tool_calls: [] });

  if (user.includes('FLY_STEP')) {
    flyTurn += 1;
    if (flyTurn === 1) {
      return json({ content: '', tool_calls: [{
        id: 'c1', type: 'function',
        function: { name: 'fly_to_location', arguments: JSON.stringify({ query: 'Kyoto' }) },
      }] });
    }
    return json({ content: 'Arrived over Kyoto', tool_calls: [] });
  }

  if (user.includes('WRITE_STEP')) {
    writeTurn += 1;
    // Saves once, then answers — the shape a real model produces. Repeating
    // the call every turn would just exercise the tool-budget cutoff.
    if (writeTurn === 1) {
      return json({ content: '', tool_calls: [{
        id: 'c2', type: 'function',
        function: { name: 'write_artifact', arguments: JSON.stringify({ title: 'Kyoto Brief', content: 'BODY TEXT' }) },
      }] });
    }
    return json({ content: 'Brief written', tool_calls: [] });
  }
  return json({ content: 'ok', tool_calls: [] });
};

let consoleApi = null;
const orchestrator = createOrchestrator({
  onEvent: (e) => consoleApi?.handleEvent(e),
  runGevAction: async (name, a) => { gevCalls.push([name, a]); return { ok: true, action: name }; },
});

const mount = document.createElement('div');
document.body.appendChild(mount);
consoleApi = mountAgentConsole(mount, orchestrator);
consoleApi.open();

window.__qa = {
  gevCalls,
  run: (goal) => {
    document.querySelector('.agent-console-input').value = goal;
    document.querySelector('.agent-console-run').click();
  },
  state: () => ({
    status: document.querySelector('.agent-console-status')?.textContent,
    tasks: [...document.querySelectorAll('.agent-task')].map((el) => ({
      title: el.querySelector('.agent-task-title')?.textContent,
      state: el.dataset.state,
    })),
    summary: document.querySelector('.agent-summary')?.textContent || '',
    artifacts: [...document.querySelectorAll('.agent-artifact')].map(
      (el) => el.querySelector('.agent-artifact-head span')?.textContent,
    ),
    logRows: document.querySelectorAll('.agent-log-row').length,
    rosterChips: document.querySelectorAll('.agent-chip').length,
    canvasPainted: (() => {
      const c = document.querySelector('.agent-orbit-canvas');
      if (!c || !c.width) return false;
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] !== 0) return true;
      return false;
    })(),
  }),
};
window.__qaReady = true;
<\/script>
</body></html>`;

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

async function main() {
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.js'),
    server: { port: 0 },
    logLevel: 'error',
    plugins: [{
      name: 'qa-agent-harness',
      configureServer(s) {
        s.middlewares.use('/qa-agent-swarm', (req, res) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(HARNESS);
        });
      },
    }],
  });
  await server.listen();
  const port = server.config.server.port || server.httpServer.address().port;
  const base = `http://localhost:${port}`;

  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    page.on('requestfailed', (r) => pageErrors.push(`requestfailed ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) pageErrors.push(`HTTP ${r.status()} ${r.url()}`); });

    await page.goto(`${base}/qa-agent-swarm`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__qaReady === true', { timeout: 20000 });

    const mounted = await page.evaluate(() => window.__qa.state());
    check('console mounts with the roster visible', mounted.rosterChips >= 8, `${mounted.rosterChips} chips`);
    check('orbital canvas paints', mounted.canvasPainted);
    check('console starts IDLE', mounted.status === 'IDLE', mounted.status);

    await page.evaluate(() => window.__qa.run('fly to Kyoto and write me a brief'));
    await page.waitForFunction(
      () => ['DONE', 'FAILED', 'STOPPED'].includes(document.querySelector('.agent-console-status')?.textContent),
      { timeout: 30000 },
    );

    const final = await page.evaluate(() => window.__qa.state());
    const gevCalls = await page.evaluate(() => window.__qa.gevCalls);

    check('run reaches DONE', final.status === 'DONE', final.status);
    check('both planned tasks render', final.tasks.length === 2, JSON.stringify(final.tasks));
    check('every task completed', final.tasks.every((t) => t.state === 'done'), JSON.stringify(final.tasks));
    check('the globe tool actually fired', gevCalls.length === 1 && gevCalls[0][0] === 'fly_to_location', JSON.stringify(gevCalls));
    check('tool arguments survive the round trip', gevCalls[0]?.[1]?.query === 'Kyoto', JSON.stringify(gevCalls[0]?.[1]));
    check('summary renders', final.summary.includes('SWARM SUMMARY OK'), final.summary.slice(0, 60));
    check('artifact renders exactly once', final.artifacts.length === 1 && final.artifacts[0] === 'Kyoto Brief', JSON.stringify(final.artifacts));
    check('activity log recorded the run', final.logRows > 4, `${final.logRows} rows`);
    // The harness page has no favicon; that 404 says nothing about the console.
    // The bare "Failed to load resource" console line carries no URL — the
    // `response` listener above reports the same failures WITH their URL, so
    // dropping the untargeted duplicate loses no signal.
    const realErrors = pageErrors.filter(
      (e) => !e.includes('favicon.ico') && !e.startsWith('Failed to load resource'),
    );
    check('no page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

    if (OUT) {
      await page.screenshot({ path: OUT });
      console.log(`\nscreenshot → ${OUT}`);
    }

    if (KEEP) {
      console.log(`\nharness kept at ${base}/qa-agent-swarm — Ctrl+C to exit`);
      await new Promise(() => {});
    }
  } finally {
    if (!KEEP) {
      await browser.close();
      await server.close();
    }
  }

  console.log(`\n${failures.length ? `FAILED: ${failures.join(', ')}` : 'agent swarm QA passed'}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
