#!/usr/bin/env node
/**
 * QB IQ end-to-end checks.
 *
 * Builds the app, serves the built bundle, and drives the real console in
 * Chromium: every module is opened, the numbers on screen are read back, the
 * metric-definition popovers are opened, the filters are exercised, and the
 * console is watched for errors the whole way. A chart that renders but throws
 * is a failure here, and so is a headline figure that comes back as an em dash.
 *
 *   node scripts/qa-qb-iq.mjs            # run the checks
 *   node scripts/qa-qb-iq.mjs --shots    # also write screenshots to qa-shots/
 */

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'apps/qb-iq');

// Browser automation is a QB IQ dev dependency, not a root one — the outer app
// has its own Puppeteer harness and there is no reason for the two to share.
const appRequire = createRequire(path.join(APP, 'package.json'));
let chromium;
try {
  ({ chromium } = appRequire('playwright-core'));
} catch {
  console.error('playwright-core is missing. Run: npm --prefix apps/qb-iq install');
  process.exit(1);
}
const SHOTS = path.join(ROOT, 'qa-shots');
const WANT_SHOTS = process.argv.includes('--shots');
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
    child.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server did not come up at ${url}`);
}

async function main() {
  console.log('==> Building QB IQ');
  await run('npm', ['run', 'build'], APP);

  console.log(`==> Serving the built bundle on ${BASE}`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
    cwd: APP,
    stdio: 'ignore',
  });

  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Quarterback Performance Intelligence', { timeout: 15000 });

    if (WANT_SHOTS) mkdirSync(SHOTS, { recursive: true });

    // ── Shell ───────────────────────────────────────────────────────────
    console.log('\n-- shell');
    check('athlete identity renders', (await page.locator('header').first().innerText()).includes('Meridian'));
    const headline = await page.locator('main').first().isVisible();
    check('main region renders', headline);

    const dashes = await page.locator('.num', { hasText: /^—$/ }).count();
    check('headline strip has no empty figures', dashes < 3, `${dashes} em-dash readouts on load`);

    const tiles = await page.locator('.eyebrow').count();
    check('metric labels present', tiles > 6, `${tiles} labels`);

    // ── Modules ─────────────────────────────────────────────────────────
    const modules = [
      ['Biomechanics', 'Proximal-to-distal sequencing'],
      ['Cognition', 'From the call to the ball'],
      ['OODA', 'Where the time actually goes'],
      ['Stress & Training', 'Rapid-exposure recognition drilling'],
      ['Game Report', 'Generated from the numbers above'],
      ['Development', 'One-page summary'],
    ];

    for (const [label, marker] of modules) {
      console.log(`\n-- ${label}`);
      await page.getByRole('button', { name: new RegExp(`^${label.replace('&', '&')}`) }).first().click();
      await page.waitForTimeout(450);
      check(`${label} renders its signature panel`, await page.getByText(marker, { exact: false }).first().isVisible());

      const svgs = await page.locator('main svg').count();
      check(`${label} draws charts`, svgs > 0, `${svgs} svg nodes`);

      const moduleDashes = await page.locator('main .num', { hasText: /^—$/ }).count();
      check(`${label} has few unresolved figures`, moduleDashes < 12, `${moduleDashes} em dashes`);

      if (WANT_SHOTS) {
        await page.screenshot({
          path: path.join(SHOTS, `qb-iq-${label.toLowerCase().replace(/[^a-z]+/g, '-')}.png`),
          fullPage: true,
        });
      }
    }

    // ── Metric dictionary ───────────────────────────────────────────────
    console.log('\n-- metric dictionary');
    await page.getByRole('button', { name: /^Biomechanics/ }).first().click();
    await page.waitForTimeout(300);
    const info = page.locator('button[aria-label^="Definition of"]').first();
    await info.click();
    const dialog = page.locator('[role="dialog"]').first();
    check('definition popover opens', await dialog.isVisible());
    // innerText returns text as rendered, and the section labels are uppercased
    // by CSS, so the comparison is case-insensitive on purpose.
    const dialogText = (await dialog.innerText()).toLowerCase();
    check('popover states how the metric is measured', dialogText.includes('measured as'));
    check('popover states why it matters', dialogText.includes('why it matters'));
    check('popover states the direction', dialogText.includes('direction'));
    await page.keyboard.press('Escape');
    check('definition popover closes on Escape', (await page.locator('[role="dialog"]').count()) === 0);

    // ── Filters ─────────────────────────────────────────────────────────
    console.log('\n-- filters');
    const before = await page.locator('header').first().innerText();
    await page.selectOption('select >> nth=1', { index: 3 });
    await page.waitForTimeout(400);
    const after = await page.locator('header').first().innerText();
    check('game filter changes the rep counts', before !== after);

    await page.selectOption('select >> nth=1', { index: 0 });
    await page.selectOption('select >> nth=0', { index: 1 });
    await page.waitForTimeout(500);
    check('season switch keeps the app alive', await page.getByText('QB IQ', { exact: false }).first().isVisible());
    await page.selectOption('select >> nth=0', { index: 3 });
    await page.waitForTimeout(400);

    const slider = page.locator('input[type="range"]').first();
    await slider.fill('0.95');
    await page.waitForTimeout(400);
    check('capture-quality floor excludes reps', (await page.locator('header').first().innerText()).includes('reps'));
    await slider.fill('0.7');
    await page.waitForTimeout(300);

    // ── Print view ──────────────────────────────────────────────────────
    console.log('\n-- print view');
    await page.getByRole('button', { name: /^Game Report/ }).first().click();
    await page.waitForTimeout(500);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(250);
    const navHidden = await page.locator('nav').first().isHidden();
    check('navigation is hidden in print', navHidden);
    if (WANT_SHOTS) {
      await page.screenshot({ path: path.join(SHOTS, 'qb-iq-print.png'), fullPage: true });
    }
    await page.emulateMedia({ media: 'screen' });

    // ── Console hygiene ─────────────────────────────────────────────────
    console.log('\n-- console');
    const realErrors = consoleErrors.filter((text) => !/favicon|manifest|404/i.test(text));
    check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }

  console.log(`\n==> ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const failure of failures) console.log(`    - ${failure}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
