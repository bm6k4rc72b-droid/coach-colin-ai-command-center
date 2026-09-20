/**
 * End-to-end check for Touchline, against a passage of play whose answer is
 * known before the browser starts.
 *
 * The unit suites test the modules. This tests the *app*: the real DOM, the
 * real canvas scaling, the real analysis loop running against a live video
 * element in a browser that is scheduling it however it likes. That is where
 * the interesting failures live — a panel that is flagged hidden but still
 * painted over the pitch, a calibration fitted in one coordinate system and
 * used in another, an overlay that draws a speed the tracker never produced.
 *
 * The clip is the app's own demo, which is choreographed in metres and seconds:
 * one player breaking at 7 m/s, one tracking across at 3 m/s, and several who
 * do not move at all. So the harness knows what the app is supposed to say, and
 * checks the numbers on screen rather than the fact that some numbers appeared.
 *
 * Usage:
 *   node scripts/qa-touchline.mjs [--out <screenshot.png>]
 *
 * Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.
 *
 * @module scripts/qa-touchline
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_TRUTH, GRIDIRON_TRUTH } from '../public/touchline/js/demo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
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
 * Serve `public/` over HTTP so the page runs in a secure context.
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
 * Run the end-to-end check.
 *
 * @returns {Promise<void>} Rejects when an assertion fails.
 */
async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const screenshot =
    outIndex >= 0 ? path.resolve(args[outIndex + 1]) : path.join(os.tmpdir(), 'touchline-smoke.png');

  const puppeteer = await loadPuppeteer();
  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
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
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${port}/touchline/index.html`, { waitUntil: 'load' });

    // ---------------------------------------------------------------- honesty
    const limits = await page.$$eval('.limits li strong', (nodes) =>
      nodes.map((node) => node.textContent.trim()),
    );
    check(limits.length >= 5, `the app states what it cannot do up front (${limits.length} limits)`);
    check(
      limits.some((limit) => /recognise a player/i.test(limit)),
      'it says it cannot identify anybody',
    );
    check(
      limits.some((limit) => /predict whether a pass/i.test(limit)),
      'it refuses to claim a pass-completion model',
    );
    check(
      limits.some((limit) => /see the ball reliably/i.test(limit)),
      'it says the ball is often invisible',
    );

    const bodyText = await page.$eval('body', (node) => node.textContent);
    check(
      !/completion (probability|model)/i.test(bodyText) || /There is no completion percentage/i.test(bodyText),
      'nowhere does the interface offer a pass-completion percentage',
    );

    // Before any footage, the app must say the numbers are not in metres.
    const coldReadout = await page.$eval('#readout-fit', (node) => node.textContent);
    check(/no pitch model/i.test(coldReadout), `it starts by saying nothing is in metres ("${coldReadout.trim()}")`);

    // ------------------------------------------------------------------- run
    await page.click('#start-demo');
    await page.waitForFunction(() => document.getElementById('viewport-empty').hidden, {
      timeout: 20000,
    });
    check(true, 'the demo started');

    // `hidden` on an element whose class sets `display` is not enough to hide
    // it, and a start panel left over the pitch passes every property check.
    const gateVisible = await page.evaluate(
      () => getComputedStyle(document.getElementById('viewport-empty')).display !== 'none',
    );
    check(!gateVisible, 'the start panel is genuinely off screen, not merely flagged hidden');

    const chip = await page.$eval('#status-chip', (node) => node.textContent);
    check(/synthetic/i.test(chip), `the synthetic clip is labelled as synthetic ("${chip}")`);

    // ----------------------------------------------------------- calibration
    const fitNote = await page.$eval('#readout-fit', (node) => node.textContent);
    check(/fits to 0\.0/.test(fitNote), `the pitch model fits to centimetres ("${fitNote.trim()}")`);

    const residual = await page.evaluate(() => globalThis.touchline?.state?.fit?.residualM ?? null);
    check(residual !== null && residual < 0.01, `calibration residual is ${residual?.toFixed(4)} m`);

    // ------------------------------------------------------------- measuring
    await page.waitForFunction(
      () => (globalThis.touchline?.state?.latest?.live?.length ?? 0) >= 6,
      { timeout: 30000 },
    );
    check(true, 'players are being tracked');

    // Wait for the break to be measured rather than for a fixed stretch of
    // wall-clock time. The clip loops, so a fixed wait can land halfway through
    // a run and grade the app on half a sprint.
    const targetM = DEMO_TRUTH.runDistanceM;
    await page
      .waitForFunction(
        (goal) => {
          const tracks = globalThis.touchline?.state?.tracker?.tracks ?? [];
          return tracks.some((track) => track.confirmed && track.distanceM >= goal);
        },
        { timeout: 60000, polling: 500 },
        targetM - 3,
      )
      .catch(() => {
        /* asserted below, with the number actually reached */
      });
    // Then let it run on a little: possession, the panels and the report all
    // need a session rather than an instant, and a check that reads the moment
    // the sprint completes grades the app on four seconds of football.
    await wait(5000);

    const measured = await page.evaluate(() => {
      const state = globalThis.touchline.state;
      return {
        analysed: state.analysed,
        hz: state.achievedHz,
        stale: state.stale,
        tracks: state.tracker.tracks
          .filter((track) => track.confirmed)
          .map((track) => ({
            id: track.id,
            team: track.team,
            distanceM: track.distanceM,
            topSpeedMps: track.topSpeedMps,
            sprints: track.sprints,
            x: track.x,
            y: track.y,
          })),
        possession: state.ledger.summary(),
        ballSeen: state.latest?.ball?.seenShare ?? 0,
      };
    });

    check(measured.analysed > 60, `${measured.analysed} frames were analysed`);
    check(measured.hz > 3, `analysis ran at ${measured.hz.toFixed(1)} fps`);
    check(!measured.stale, 'the fixed camera never invalidated its own calibration');
    check(
      measured.tracks.length >= 7 && measured.tracks.length <= 12,
      `${measured.tracks.length} identities for nine players on the pitch`,
    );

    const fastest = measured.tracks.reduce((best, track) =>
      track.topSpeedMps > (best?.topSpeedMps ?? 0) ? track : best,
    null);
    const truthKph = DEMO_TRUTH.runnerSpeedMps * 3.6;
    const gotKph = (fastest?.topSpeedMps ?? 0) * 3.6;
    check(
      Math.abs(gotKph - truthKph) / truthKph < 0.08,
      `the break was clocked at ${gotKph.toFixed(1)} km/h against a choreographed ${truthKph.toFixed(1)}`,
    );
    check(fastest.sprints >= 1, `the break was counted as ${fastest.sprints} sprint(s)`);
    const longest = measured.tracks.reduce(
      (best, track) => (track.distanceM > (best?.distanceM ?? 0) ? track : best),
      null,
    );
    check(
      Math.abs(longest.distanceM - targetM) < 3,
      `the break covered ${longest.distanceM.toFixed(1)} m against a choreographed ${targetM.toFixed(1)} m`,
    );

    // The three players who never move are the whole argument about phantom
    // distance, and they are asserted at exactly zero.
    const stationary = measured.tracks.filter((track) => track.distanceM === 0);
    check(
      stationary.length >= DEMO_TRUTH.stationaryPlayers,
      `${stationary.length} players logged exactly zero metres (${DEMO_TRUTH.stationaryPlayers} never moved)`,
    );
    const crept = measured.tracks.filter((t) => t.distanceM > 0 && t.distanceM < 3).length;
    check(crept <= 3, `${crept} tracks logged a small non-zero distance`);

    check(
      measured.tracks.every((track) => track.topSpeedMps <= 12),
      'nobody was clocked faster than a human can run',
    );
    check(
      measured.tracks.some((track) => track.team === 'home') &&
        measured.tracks.some((track) => track.team === 'away'),
      'both kits were resolved into teams',
    );
    check(
      measured.tracks.some((track) => track.team === 'other'),
      'the goalkeeper was left off both teams',
    );

    // ------------------------------------------------------------ possession
    const possessionText = await page.$eval('#possession', (node) => node.textContent);
    check(
      /attributed/i.test(possessionText),
      'the possession panel prints its denominator, not just two percentages',
    );
    check(
      /out of sight/i.test(possessionText),
      'the panel says where the unattributed time went',
    );
    check(
      measured.possession.assignedShare <= 1 && measured.possession.assignedShare >= 0,
      `attributed share is ${(measured.possession.assignedShare * 100).toFixed(0)}% of the clock`,
    );
    check(
      measured.possession.homeShare + measured.possession.awayShare <= 1.0001,
      'the two possession shares do not exceed the whole',
    );
    check(measured.ballSeen > 0.2, `the ball was visible in ${(measured.ballSeen * 100).toFixed(0)}% of frames`);

    // ------------------------------------------------------------ pass lanes
    const laneText = await page.$eval('#lanes', (node) => node.textContent);
    if (laneText.trim()) {
      check(/ m/.test(laneText), 'pass options are given in metres');
      check(
        /clear by|screened/.test(laneText),
        'pass options say whether the lane is clear or screened',
      );
      check(!/%\s*(chance|likely|completion)/i.test(laneText), 'no lane claims a completion chance');
    } else {
      check(true, 'no pass options drawn while nobody is on the ball (correct, not a failure)');
    }

    // ------------------------------------------------------------------ tabs
    await page.click('[data-tab="plan"]');
    await wait(600);
    const planPainted = await page.evaluate(() => {
      const canvas = document.getElementById('plan');
      const ctx = canvas.getContext('2d');
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 90) lit += 1;
      return lit;
    });
    check(planPainted > 2000, `the plan view is drawn (${planPainted} lit pixels)`);

    await page.click('[data-tab="players"]');
    await wait(600);
    const rows = await page.$$eval('#players-body tr', (nodes) => nodes.length);
    check(rows >= 5, `the player table has ${rows} rows`);
    const coverageBars = await page.$$eval('#players-body .coverage', (nodes) => nodes.length);
    check(coverageBars === rows, 'every player row carries how much of the session it covers');

    await page.click('[data-tab="report"]');
    await wait(600);
    const reportText = await page.$eval('#report', (node) => node.textContent);
    check(/could be attributed/i.test(reportText), 'the report leads with its denominator');
    check(/visible in/i.test(reportText), 'the report says how often the ball was visible');
    check(/fits the marked points/i.test(reportText), 'the report carries the calibration error');
    check(
      /Nobody's totals are extrapolated/i.test(reportText),
      'the report refuses to extrapolate to a full match',
    );

    // The artefact people look at is the app mid-measurement, so it is taken
    // here rather than after the teardown checks below.
    await page.click('[data-tab="live"]');
    await wait(900);
    const overlayPainted = await page.evaluate(() => {
      const canvas = document.getElementById('overlay');
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 40) lit += 1;
      return lit;
    });
    check(overlayPainted > 3000, `the overlay is drawn over the footage (${overlayPainted} inked pixels)`);
    await page.screenshot({ path: screenshot });
    check(fs.existsSync(screenshot), `screenshot written to ${screenshot}`);

    // ------------------------------------------------------------- gridiron
    {
      // Switching sport is the real test of whether the field model is wired
      // through: the calibration landmarks, the paint the segmenter must ignore,
      // the colour of the ball and whether possession may be reported at all all
      // change at once, and any one of them left hard-coded shows up here.
      await page.click('#settings-toggle');
      await page.select('#sport', 'gridiron');
      await page.click('#settings-close');
      await wait(400);

      const switched = await page.evaluate(() => {
        const state = globalThis.touchline.state;
        return {
          sport: state.sport.id,
          lengthM: state.dimensions.lengthM,
          widthM: state.dimensions.widthM,
          markIds: state.marks.map((mark) => mark.id ?? ''),
          marks: state.marks.map((mark) => mark.pitch),
        };
      });
      check(switched.sport === 'gridiron', `the sport switched to ${switched.sport}`);
      check(
        Math.abs(switched.lengthM - 109.728) < 0.01 && Math.abs(switched.widthM - 48.768) < 0.01,
        `the field became ${switched.lengthM.toFixed(1)} x ${switched.widthM.toFixed(1)} m`,
      );
      // The football marks must be gone rather than reinterpreted against the
      // new field. Their identity is the evidence: a pitch calibration is made
      // of penalty-box and six-yard landmarks, and none of those exist here.
      check(
        switched.markIds.length > 0 &&
          switched.markIds.every((id) => !/box|six|halfway|corner-(near|far)-(left|right)$/.test(id)),
        `the football landmarks were discarded (now ${switched.markIds.join(', ') || 'none'})`,
      );
      check(
        switched.marks.every(
          (mark) => mark.x >= 0 && mark.x <= 109.8 && mark.y >= 0 && mark.y <= 48.8,
        ),
        'every mark now sits on the gridiron rather than on a pitch',
      );

      const gridironTargets = await page.evaluate(() => {
        const state = globalThis.touchline.state;
        return state.sport.calibrationIds.slice(0, 4);
      });
      check(
        gridironTargets.every((id) => !/box|six|halfway/.test(id)),
        `calibration now asks for gridiron landmarks (${gridironTargets.join(', ')})`,
      );

      // Switching sport restarts the built-in clip, so there is nothing to
      // click: the gridiron demo should already be running.
      await wait(1500);
      await page.waitForFunction(
        () => (globalThis.touchline?.state?.latest?.live?.length ?? 0) >= 5,
        { timeout: 30000 },
      );
      check(true, 'the gridiron demo is tracking players');

      const gridironFit = await page.evaluate(() => globalThis.touchline.state.fit?.residualM ?? null);
      check(
        gridironFit !== null && gridironFit < 0.01,
        `the gridiron calibration fits to ${gridironFit?.toFixed(4)} m`,
      );

      // Capture the route at the moment it completes rather than afterwards.
      // The clip loops every nine seconds, and when it restarts the receiver
      // teleports back to the line of scrimmage — which retires the track. A
      // snapshot taken a few seconds later can therefore land on a freshly born
      // track that has barely moved, and grade the app on that instead.
      // The receiver is identified by where the route finishes, not by being
      // the longest track: a safety drifting on a sine for a couple of minutes
      // covers more ground than a four-second route, and "the biggest number"
      // would quietly grade the app on him instead.
      //
      // The peak is sampled continuously inside the page rather than caught by
      // polling from here. The clip loops, the route lasts four seconds of it,
      // and a check that has to observe one instant is a race it will lose
      // every few runs — which is a flaky test, not a flaky app.
      await page.evaluate(
        (end, goal) => {
          globalThis.__route = null;
          globalThis.__routeTimer = setInterval(() => {
            // The first completed route, not the running maximum. A track that
            // stands at the end of the route keeps drifting by a few tens of
            // centimetres a second, so a maximum taken over a whole session
            // eventually exceeds the route it is measuring.
            const tracks = globalThis.touchline?.state?.tracker?.tracks ?? [];
            if (globalThis.__route) {
              // Keep following the same player. The distance is frozen at the
              // moment the route finished — a track standing at the end of it
              // drifts by a few tens of centimetres a second — but the top
              // speed is still settling: it is a median over a run of windows,
              // and at eight frames a second that takes a couple of seconds to
              // fill. Reading it the instant the distance crosses the line
              // catches it half-formed.
              const same = tracks.find((track) => track.id === globalThis.__route.id);
              if (same && same.topSpeedMps > globalThis.__route.topSpeedMps) {
                globalThis.__route.topSpeedMps = same.topSpeedMps;
              }
              return;
            }
            for (const track of tracks) {
              if (!track.confirmed) continue;
              if (Math.hypot(track.x - end.x, track.y - end.y) > 3) continue;
              if (track.distanceM < goal) continue;
              globalThis.__route = {
                id: track.id,
                distanceM: track.distanceM,
                topSpeedMps: track.topSpeedMps,
              };
              return;
            }
          }, 100);
        },
        GRIDIRON_TRUTH.routeEnd,
        GRIDIRON_TRUTH.runDistanceM - 6,
      );

      await page
        .waitForFunction(() => globalThis.__route !== null, { timeout: 60000, polling: 500 })
        .catch(() => {
          /* asserted below with whatever the sampler actually saw */
        });
      // Let the speed window finish filling on the player just measured.
      await wait(3000);
      const route = await page.evaluate(() => {
        clearInterval(globalThis.__routeTimer);
        return globalThis.__route;
      });

      const gridiron = await page.evaluate(() => {
        const state = globalThis.touchline.state;
        return {
          tracks: state.tracker.tracks
            .filter((t) => t.confirmed)
            .map((t) => ({ distanceM: t.distanceM, topSpeedMps: t.topSpeedMps, sprints: t.sprints })),
          sprintMps: state.tracker.sprintMps,
          possessionPanel: document.getElementById('possession').textContent,
          lanes: document.getElementById('lanes').textContent,
          ballSeen: state.latest?.ball?.seenShare ?? 0,
          assignedMs: state.ledger.summary().assignedMs,
        };
      });

      check(
        Math.abs(gridiron.sprintMps - 9.83) < 0.01,
        `the tracker took the gridiron sprint threshold (${(gridiron.sprintMps * 3.6).toFixed(1)} km/h)`,
      );
      const routeTruthKph = GRIDIRON_TRUTH.receiverSpeedMps * 3.6;
      const routeKph = (route?.topSpeedMps ?? 0) * 3.6;
      check(
        Math.abs(routeKph - routeTruthKph) / routeTruthKph < 0.1,
        `the route was clocked at ${routeKph.toFixed(1)} km/h against a choreographed ${routeTruthKph.toFixed(1)}`,
      );
      check(
        route !== null && Math.abs(route.distanceM - GRIDIRON_TRUTH.runDistanceM) < 6,
        `the route covered ${route?.distanceM?.toFixed(1) ?? 'nothing'} m against a choreographed ${GRIDIRON_TRUTH.runDistanceM.toFixed(1)}`,
      );
      const stationary = gridiron.tracks.filter((t) => t.distanceM === 0).length;
      check(
        stationary >= 3,
        `${stationary} linemen logged exactly zero metres (${GRIDIRON_TRUTH.stationaryPlayers} never moved)`,
      );
      check(
        gridiron.tracks.length <= 12,
        `${gridiron.tracks.length} identities — the painted yard numbers did not join the team sheet`,
      );

      check(
        /not reported/i.test(gridiron.possessionPanel) && /downs/i.test(gridiron.possessionPanel),
        'the panel declines to report possession, and says why',
      );
      check(
        gridiron.assignedMs === 0,
        `no possession time was accumulated (${gridiron.assignedMs} ms)`,
      );
      check(
        /nearest opponent|Waiting for two sides/i.test(gridiron.lanes) || gridiron.lanes.trim() === '',
        'separation replaces the pass-lane panel',
      );

      const gridironShot = screenshot.replace(/\.png$/, '-gridiron.png');
      await page.screenshot({ path: gridironShot });
      check(fs.existsSync(gridironShot), `gridiron screenshot written to ${gridironShot}`);
    }

    // --------------------------------------------------------- losing metres
    await page.click('#settings-toggle');
    await page.click('#calibrate-clear');
    await wait(300);
    const clearedNote = await page.$eval('#readout-fit', (node) => node.textContent);
    check(
      /no (pitch|field) model/i.test(clearedNote),
      `clearing the marks takes the metres away ("${clearedNote.trim()}")`,
    );
    await page.click('#settings-close');

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
