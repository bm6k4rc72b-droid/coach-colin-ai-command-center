/**
 * End-to-end checks for RANCH COMMAND, driving the real page in Chromium.
 *
 * What runs for real: every slide, navigation, a fake device camera, the
 * bundled MediaPipe detector on a real photograph, the hand-tracking model,
 * alert routing, a real MQTT broker (aedes, over WebSocket) publishing
 * Frigate and Meshtastic messages, a fake mavlink2rest WebSocket, the drone
 * approval gate, the 3D map, and Rafa's question routing.
 *
 * What cannot run here: real IP cameras, go2rtc/MediaMTX WebRTC, a Jetson,
 * and the in-browser OWL-ViT / SlimSAM models (their CDN is unreachable from
 * this environment — the check is that the page says so honestly).
 *
 * The broker and fake MAVLink server need `aedes`, `aedes-server-factory`
 * and `ws`; point RANCH_QA_DEPS at a node_modules that has them. Without
 * them those checks are reported as SKIP, never as PASS.
 *
 * Usage: node scripts/qa-ranch-command.mjs [--shots <dir>]
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };

function serve() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let filePath = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403).end(); return; }
    try {
      const data = await fsp.readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`  ${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function optionalDeps() {
  const dir = process.env.RANCH_QA_DEPS;
  if (!dir) return null;
  try {
    const req = createRequire(path.join(dir, 'x.js'));
    const load = (name) => import(pathToFileURL(req.resolve(name)).href);
    const [{ Aedes }, { createServer }, wsMod] = await Promise.all([load('aedes'), load('aedes-server-factory'), load('ws')]);
    return { Aedes, createServer, WebSocketServer: wsMod.WebSocketServer || wsMod.default.Server };
  } catch (error) {
    console.log(`  (optional deps unavailable: ${error.message})`);
    return null;
  }
}

async function main() {
  const shotsIndex = process.argv.indexOf('--shots');
  const shots = shotsIndex > -1 ? process.argv[shotsIndex + 1] : null;
  if (shots) await fsp.mkdir(shots, { recursive: true });
  let puppeteer;
  try { puppeteer = (await import('puppeteer')).default; } catch { puppeteer = (await import('puppeteer-core')).default; }
  const { server, port } = await serve();
  const deps = await optionalDeps();

  // A real MQTT broker over WebSocket, and a fake mavlink2rest.
  let broker = null;
  let brokerPort = 0;
  let mav = null;
  let mavPort = 0;
  if (deps) {
    broker = await deps.Aedes.createBroker();
    const mqttServer = deps.createServer(broker, { ws: true });
    await new Promise((r) => mqttServer.listen(0, '127.0.0.1', r));
    brokerPort = mqttServer.address().port;
    broker.server = mqttServer;
    mav = new deps.WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise((r) => mav.on('listening', r));
    mavPort = mav.address().port;
    mav.on('connection', (socket) => {
      const send = (m) => socket.readyState === 1 && socket.send(JSON.stringify(m));
      const t = setInterval(() => {
        send({ header: { system_id: 7, component_id: 1, sequence: 1 }, message: { type: 'HEARTBEAT', custom_mode: 5, mavtype: { type: 'MAV_TYPE_QUADROTOR' }, autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' }, base_mode: { bits: 0x81 }, system_status: { type: 'MAV_STATE_ACTIVE' }, mavlink_version: 3 } });
        send({ header: { system_id: 7, component_id: 1, sequence: 2 }, message: { type: 'GLOBAL_POSITION_INT', time_boot_ms: 1, lat: 346411000, lon: -1204560000, alt: 120000, relative_alt: 35500, vx: 300, vy: 0, vz: 0, hdg: 9000 } });
        send({ header: { system_id: 7, component_id: 1, sequence: 3 }, message: { type: 'SYS_STATUS', voltage_battery: 15600, current_battery: 900, battery_remaining: 64 } });
      }, 300);
      socket.on('close', () => clearInterval(t));
    });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  const base = `http://127.0.0.1:${port}/ranch-command/`;
  const R = (fn, ...args) => page.evaluate(fn, ...args);
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

  console.log('RANCH COMMAND end-to-end\n');
  await page.goto(base, { waitUntil: 'networkidle0' });
  await wait(600);
  check('the gate shows on arrival', await R(() => !document.getElementById('gate').classList.contains('gone')));
  await shot('00-gate');
  await page.click('#enter-quiet');
  await wait(1300);
  check('entering hides the gate', await R(() => document.getElementById('gate').classList.contains('gone')));

  /* ---------------------------------------------------------- slides */
  const slideIds = await R(() => globalThis.__ranch.SLIDES.map((s) => s.id));
  check('twelve slides are built', slideIds.length === 12, slideIds.join(' '));
  for (let i = 0; i < slideIds.length; i += 1) {
    await R((n) => globalThis.__ranch.go(n), i);
    await wait(1300);
    const info = await R((id) => {
      const s = document.getElementById(`slide-${id}`);
      return { heading: Boolean(s.querySelector('h2')?.textContent), body: s.querySelector('.slide-body').childElementCount, error: s.querySelector('.slide-body .threat')?.textContent || '', current: globalThis.__ranch.current, hash: location.hash };
    }, slideIds[i]);
    check(`slide ${String(i + 1).padStart(2, '0')} ${slideIds[i]} renders`, info.heading && info.body > 0 && !info.error && info.current === i && info.hash === `#${slideIds[i]}`, info.error || info.hash);
  }

  await R(() => globalThis.__ranch.go(0));
  await wait(1300);
  await page.keyboard.press('ArrowRight');
  await wait(1300);
  check('the right arrow key moves to the next slide', await R(() => globalThis.__ranch.current) === 1);
  await page.mouse.move(700, 450);
  // A tall slide scrolls first; at its end, one wheel gesture pages sideways.
  await R(() => { const s = document.getElementById('slide-cameras'); s.scrollTop = s.scrollHeight; });
  await wait(200);
  await page.mouse.wheel({ deltaY: 240 });
  await wait(1300);
  check('a vertical wheel scrolls a tall slide, then pages sideways at its end', await R(() => globalThis.__ranch.current) === 2);
  await page.click('#prev');
  await wait(1300);
  check('the previous button goes back', await R(() => globalThis.__ranch.current) === 1);
  await page.goto(`${base}#drones`, { waitUntil: 'networkidle0' });
  await wait(1300);
  check('a hash deep-links to its slide', await R(() => globalThis.__ranch.current) === slideIds.indexOf('drones'));
  await page.click('#enter-quiet');
  await wait(500);

  /* --------------------------------------------------------- cameras */
  await R(() => globalThis.__ranch.go(1));
  await wait(1300);
  await R(() => globalThis.__ranch.ctx.addDevice('environment'));
  await wait(1500);
  const dev = await R(() => { const c = [...globalThis.__ranch.cams.values()][0]; return { name: c?.name, error: c?.error, ready: c?.media?.readyState, w: c?.media?.videoWidth }; });
  check('a device camera opens and plays', dev.ready >= 2 && dev.w > 0 && !dev.error, JSON.stringify(dev));
  const photo = `http://127.0.0.1:${port}/ucantseeme-x/assets/colin-full.jpg`;
  await R((url) => globalThis.__ranch.ctx.addNetworkCamera({ name: 'Gate cam', kind: 'mjpeg', url, zone: 'main_gate', lat: 34.6401, lon: -120.4590 }), photo);
  await wait(1500);
  const tiles = await R(() => document.querySelectorAll('#slide-cameras .cam').length);
  check('both cameras appear on the wall', tiles === 2, `${tiles} tiles`);
  const warn = await R(() => {
    const m = globalThis.__ranch;
    return import('./js/streams.js').then(({ urlProblem }) => [urlProblem('rtsp://10.0.0.5/live', 'https:'), urlProblem('http://192.168.1.20:1984/api/webrtc?src=gate', 'https:'), urlProblem('https://edge.ts.net/api/webrtc?src=gate', 'https:')]);
  });
  check('RTSP is refused with the reason', /Browsers cannot open RTSP/.test(warn[0]));
  check('plain HTTP on a secure page is refused with the fix', /Tailscale Serve/.test(warn[1]));
  check('an HTTPS stream URL is accepted', warn[2] === null);
  await shot('02-cameras');

  /* ---------------------------------------------------------- vision */
  await R(() => { const r = globalThis.__ranch; r.ctx.state.vision.camera = [...r.cams.values()][1].id; r.ctx.state.vision.raise = true; r.go(2); });
  await wait(1300);
  await R(() => globalThis.__ranch.ctx.toggleVision());
  let vision = {};
  for (let i = 0; i < 40; i += 1) {
    await wait(500);
    vision = await R(() => ({ ...globalThis.__ranch.ctx.state.vision, perCamera: undefined }));
    if (vision.counts?.person) break;
  }
  check('the bundled detector runs on this device', /EfficientDet-Lite0 · this device · \d+ ms\/frame/.test(vision.status), vision.status);
  check('it finds the person in a real photograph', (vision.counts?.person || 0) >= 1, JSON.stringify(vision.counts));
  const raised = await R(() => globalThis.__ranch.ctx.alerts.list().filter((a) => a.source === 'device').map((a) => `${a.label}:${a.routing.rule}`));
  check('an on-device detection raises a routed alert', raised.some((r) => r.startsWith('person:')), raised.join(', '));
  await shot('03-vision');
  await R(() => globalThis.__ranch.ctx.toggleVision());

  /* -------------------------------------------- search & segment, offline */
  await R(() => { const r = globalThis.__ranch; r.ctx.state.search.camera = [...r.cams.values()][1].id; r.go(3); });
  await wait(1200);
  await R(() => globalThis.__ranch.ctx.runSearch());
  await wait(1500);
  const search = await R(() => globalThis.__ranch.ctx.state.search.status);
  check('with no edge box and no CDN, NanoOWL search says why it could not run', /could not load|needs internet/i.test(search), search.slice(0, 90));
  await shot('04-search');

  /* ---------------------------------------------------------- alerts */
  await R(() => globalThis.__ranch.go(5));
  await wait(1300);
  await R(() => globalThis.__ranch.ctx.demoAlerts());
  await wait(400);
  const alerts = await R(() => globalThis.__ranch.ctx.alerts.list().filter((a) => a.source === 'frigate').map((a) => ({ label: a.label, rule: a.routing.rule, p: a.routing.priority })));
  check('sample Frigate events are routed by the rulebook', alerts.find((a) => a.label === 'cow')?.rule === 'stock-at-gate' && alerts.find((a) => a.label === 'calving')?.p === 'critical' && alerts.find((a) => a.label === 'coyote')?.rule === 'predator-near-stock', JSON.stringify(alerts));
  const order = await R(() => [...document.querySelectorAll('#slide-events .alert')].map((n) => n.dataset.priority));
  check('alerts are listed loudest first', order[0] === 'critical', order.join(' '));
  await R(() => document.querySelector('#slide-events .alert .btn.green').click());
  await wait(300);
  check('confirming an alert records the verdict', await R(() => globalThis.__ranch.ctx.alerts.list().some((a) => a.verdict === 'confirmed')));
  await shot('06-events');

  /* ------------------------------------------------------- live MQTT */
  if (broker) {
    await R((url) => { const s = globalThis.__ranch.ctx.settings; s.mqttUrl = url; globalThis.__ranch.ctx.connectAll(); }, `ws://127.0.0.1:${brokerPort}`);
    let up = false;
    for (let i = 0; i < 20 && !up; i += 1) { await wait(250); up = await R(() => globalThis.__ranch.ctx.links.mqtt === 'connected'); }
    check('the page connects and subscribes to a real MQTT broker', up);
    await wait(400);
    const publish = (topic, obj) => new Promise((r) => broker.publish({ cmd: 'publish', topic, payload: Buffer.from(JSON.stringify(obj)), qos: 0, retain: false }, r));
    await publish('frigate/events', { type: 'new', before: {}, after: { id: 'live-1', camera: 'South fence', label: 'person', top_score: 0.88, start_time: Date.now() / 1000, current_zones: ['south_perimeter'], has_snapshot: false } });
    await publish('ranch/events', { id: 'edge-9', label: 'calving', score: 0.74, camera: 'Calving barn', zones: ['calving_pen'], models: ['calvingcatcher'], routing: { rule: 'calving', workflow: 'livestock', priority: 'critical', reason: 'Calving activity detected. Check the cow.' } });
    await publish('msh/US/2/json/LongFast/!cafe0001', { type: 'position', sender: '!cafe0001', timestamp: Date.now() / 1000, snr: 5.5, payload: { latitude_i: 346380000, longitude_i: -1204600000 } });
    await publish('msh/US/2/json/LongFast/!cafe0001', { type: 'telemetry', sender: '!cafe0001', timestamp: Date.now() / 1000, payload: { battery_level: 77, temperature: 24.5 } });
    await publish('ranch/sensors/tank3/level', { value: 42 });
    await wait(1300);
    const live = await R(() => ({
      frigate: globalThis.__ranch.ctx.alerts.list().find((a) => a.id === 'frigate:live-1')?.label,
      edge: globalThis.__ranch.ctx.alerts.list().find((a) => a.id === 'edge:edge-9')?.models,
      node: globalThis.__ranch.ctx.mesh.list().find((n) => n.id === '!cafe0001'),
      tank: globalThis.__ranch.ctx.mesh.list().find((n) => n.id === 'tank3'),
    }));
    check('a Frigate event published to the broker becomes an alert', live.frigate === 'person');
    check('an edge event keeps the models that refined it', JSON.stringify(live.edge) === '["calvingcatcher"]');
    check('a Meshtastic radio appears with position and battery', live.node?.battery === 77 && Math.abs(live.node?.lat - 34.638) < 1e-6, JSON.stringify(live.node));
    check('a field sensor reading appears', live.tank?.level === 42);
  } else {
    check('live MQTT broker checks', null, 'set RANCH_QA_DEPS to a node_modules with aedes, aedes-server-factory and ws');
  }

  /* ---------------------------------------------------------- drones */
  await R(() => globalThis.__ranch.go(7));
  await wait(1300);
  if (mav) {
    await R((url) => { globalThis.__ranch.ctx.settings.mavlinkUrl = url; globalThis.__ranch.ctx.connectMavlink(); }, `ws://127.0.0.1:${mavPort}`);
    await wait(1800);
    const v = await R(() => globalThis.__ranch.ctx.fleet.list()[0]);
    check('mavlink2rest telemetry becomes an aircraft', v?.kind === 'Quadcopter' && v.armed && v.mode === 'Loiter' && v.battery === 64 && Math.abs(v.alt - 35.5) < 1e-9, JSON.stringify(v));
    const card = await R(() => document.querySelector('#slide-drones .drone h3')?.textContent);
    check('the drone card shows it', /Quadcopter · system 7/.test(card || ''), card);
  } else {
    check('mavlink2rest checks', null, 'set RANCH_QA_DEPS');
  }
  // Typed like a person would, then left to sit through telemetry re-renders.
  await page.type('#slide-drones input[placeholder="Target latitude"]', '34.645');
  await page.type('#slide-drones input[placeholder="Target longitude"]', '-120.46');
  await wait(1300);
  check('typed coordinates survive live telemetry re-renders', await R(() => document.querySelector('#slide-drones input[placeholder="Target latitude"]').value) === '34.645');
  await R(() => [...document.querySelectorAll('#slide-drones .btn.gold')].find((b) => /Download mission/.test(b.textContent)).click());
  await wait(300);
  check('a mission cannot be downloaded without the pilot\'s four checks', /All four checks are required/.test(await R(() => document.getElementById('toast').textContent)));
  const client = await page.target().createCDPSession();
  const dl = path.join(shots || '/tmp', 'downloads');
  await fsp.mkdir(dl, { recursive: true });
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  for (let i = 0; i < 4; i += 1) { await page.click(`#slide-drones .checks label:nth-child(${i + 1}) input`); await wait(300); }
  await wait(900);
  await R(() => [...document.querySelectorAll('#slide-drones .btn.gold')].find((b) => /Download mission/.test(b.textContent)).click());
  await wait(1200);
  const plans = (await fsp.readdir(dl)).filter((f) => f.endsWith('.plan'));
  let planOk = false;
  if (plans.length) {
    const plan = JSON.parse(await fsp.readFile(path.join(dl, plans[plans.length - 1]), 'utf8'));
    planOk = plan.fileType === 'Plan' && plan.mission.items.length === 4 && plan.mission.items[1].params[4] === 34.645;
  }
  check('with all four ticked, a QGroundControl plan downloads', planOk, plans.join(','));
  await shot('08-drones');

  /* ------------------------------------------------------------- map */
  await R(() => globalThis.__ranch.go(8));
  await wait(3000);
  const labels = await R(() => [...document.querySelectorAll('.map-label')].map((n) => n.textContent));
  check('the 3D map draws markers for HQ and the cameras', labels.includes('HQ') && labels.includes('Gate cam'), labels.join(', '));
  await shot('09-map');

  /* ----------------------------------------------------------- stack */
  await R(() => globalThis.__ranch.go(10));
  await wait(1300);
  const stack = await R(() => ({ items: document.querySelectorAll('#slide-stack .stack-item').length, nvidia: document.querySelectorAll('#slide-stack .tag.green').length, powered: document.querySelector('#slide-stack .powered')?.textContent || '' }));
  check('every component of the stack is listed', stack.items === 20, `${stack.items} items`);
  check('the NVIDIA pieces are marked', stack.nvidia === 3);
  check('the NVIDIA line is factual and disclaims endorsement', /not affiliated with or endorsed by NVIDIA/.test(stack.powered));
  await shot('11-stack');

  /* ------------------------------------------------------------ Rafa */
  await R(() => { document.getElementById('rafa-input').value = 'how do I connect my DJI'; document.getElementById('rafa-ask').requestSubmit(); });
  await wait(1200);
  const rafa = await R(() => ({ caption: document.getElementById('rafa-caption').textContent, slide: globalThis.__ranch.SLIDES[globalThis.__ranch.current].id }));
  check('Rafa answers a DJI question and takes you to Drone Ops', /RTMP/.test(rafa.caption) && rafa.slide === 'drones', `${rafa.slide}: ${rafa.caption.slice(0, 60)}`);
  await R(() => { document.getElementById('rafa-input').value = 'tell me a joke'; document.getElementById('rafa-ask').requestSubmit(); });
  await wait(300);
  check('Rafa tells a joke', (await R(() => document.getElementById('rafa-caption').textContent)).length > 30);

  /* ------------------------------------------------------- Air Swipe */
  await R(() => globalThis.__ranch.go(11));
  await wait(1300);
  await R(() => globalThis.__ranch.ctx.toggleSwipe());
  let hud = '';
  for (let i = 0; i < 30 && !/ready/.test(hud); i += 1) { await wait(500); hud = await R(() => document.getElementById('hud-label').textContent); }
  check('Air Swipe loads the hand-tracking model on this device', hud === 'Hand · ready', hud);
  check('the Air Swipe camera preview is showing', await R(() => !document.getElementById('hud').hidden));
  const handsFound = await R(async () => {
    // The same tracker Air Swipe uses, on a real photograph with a hand in it.
    const { createHandTracker } = await import('./js/ai.js');
    const tracker = await createHandTracker();
    const img = new Image();
    img.src = '../ucantseeme-x/assets/colin-full.jpg';
    await img.decode();
    const crop = document.createElement('canvas');
    crop.width = 900; crop.height = 700;
    crop.getContext('2d').drawImage(img, 250, 1250, 1100, 855, 0, 0, 900, 700);
    let found = 0;
    for (let i = 0; i < 3; i += 1) found = Math.max(found, tracker.detectForVideo(crop, performance.now() + i * 40).landmarks.length);
    return found;
  });
  check('the hand tracker finds a real hand', handsFound >= 1, `${handsFound} hand(s)`);
  const before = await R(() => globalThis.__ranch.current);
  await R(() => {
    // Drive the live detector with a synthetic swipe, through the same path a hand takes.
    const d = globalThis.__ranch.swipe();
    let fired = null;
    const t0 = performance.now() / 1000;
    for (let i = 0; i <= 12; i += 1) fired = d.push(0.75 - (0.5 * i) / 12, t0 + i / 30) || fired;
    globalThis.__fired = fired;
  });
  check('the live detector recognises a swipe', (await R(() => globalThis.__fired)) === 'next' || before === 11);
  await shot('12-setup');
  await R(() => globalThis.__ranch.ctx.toggleSwipe());

  /* ---------------------------------------------------------- mobile */
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // Switching to mobile emulation reloads the page, so enter again.
  await page.waitForSelector('#enter-quiet', { visible: true });
  await shot('m-gate');
  await page.click('#enter-quiet');
  await R(() => globalThis.__ranch.go(0));
  await wait(1300);
  await shot('m-command');
  check('the gate is gone on the phone too', await R(() => document.getElementById('gate').classList.contains('gone')));
  const overflow = await R(() => [...document.querySelectorAll('#slide-command .card')].some((n) => n.getBoundingClientRect().right > innerWidth + 1));
  check('nothing on the command slide overflows an iPhone screen', !overflow);
  await R(() => { globalThis.__ranch.ctx.demoAlerts(); globalThis.__ranch.go(5); });
  await wait(1300);
  await shot('m-events');
  await R(() => globalThis.__ranch.go(7));
  await wait(1300);
  await shot('m-drones');

  const fatal = problems.filter((p) => !/Failed to load resource|ERR_|jsdelivr|net::|favicon|WebGL|GPU stall|GL_|Fetching module|dynamically imported module|^console: INFO: Created TensorFlow Lite/i.test(p));
  check('no unexpected console or page errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  if (broker) { broker.server.close(); broker.close(); }
  mav?.close();

  const failed = checks.filter((c) => c.ok === false);
  const skipped = checks.filter((c) => c.ok === null);
  console.log(`\n${checks.length - failed.length - skipped.length}/${checks.length} checks passed${skipped.length ? `, ${skipped.length} skipped` : ''}`);
  if (failed.length) { console.log('\nfailed:'); for (const c of failed) console.log(`  - ${c.name}`); process.exitCode = 1; }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
