/**
 * HOUSEWRIGHT — the walk-through.
 *
 * Wires the survey together: camera frames go to the fingertip tracker and the
 * finish analyser, orientation goes to the pointing solver, committed shots
 * become room corners, corners become a plan, the plan becomes a massing model,
 * and everything together becomes the improvement report.
 *
 * @module housewright/app
 */

import { CameraFeed, Orientation } from './camera.js';
import { exampleSurvey } from './demo.js';
import * as finish from './finish.js';
import * as hand from './hand.js';
import * as ledger from './ledger.js';
import * as massing from './massing.js';
import { clamp, feetInches, money } from './mathkit.js';
import * as plan from './plan.js';
import * as pose from './pose.js';
import * as report from './report.js';

const $ = (id) => document.getElementById(id);

/** Room types offered when naming a room, in the order a walk usually goes. */
const ROOM_TYPES = [
  ['living', 'Living'], ['kitchen', 'Kitchen'], ['dining', 'Dining'],
  ['bedroom', 'Bedroom'], ['bathroom', 'Bathroom'], ['office', 'Office'],
  ['hall', 'Hall'], ['other', 'Other'],
];

const state = {
  survey: null,
  view: 'setup',
  /** Corners committed for the room being walked. */
  corners: [],
  /** Frame statistics collected for the room being walked. */
  frames: [],
  room: { name: 'Living room', type: 'living', ceiling: 2.44 },
  mode: 'point',
  handBuffers: hand.createBuffers(),
  handState: hand.createHand(),
  accumulator: null,
  lastFrame: 0,
  fps: 0,
  torch: false,
  orbit: { yaw: 38, pitch: 26, zoom: 1 },
  drag: null,
  message: '',
  messageUntil: 0,
};

// Bound to the real <video> in `beginWalk`; constructing it against the
// document here would make the module unimportable outside a browser.
const camera = new CameraFeed(null);
const orientation = new Orientation();

/* --- chrome ------------------------------------------------------------- */

/**
 * Show a transient line in the status strip.
 *
 * @param {string} text What happened.
 * @param {number} [seconds=3] How long to leave it up.
 */
function say(text, seconds = 3) {
  state.message = text;
  state.messageUntil = performance.now() + seconds * 1000;
  const el = $('status');
  if (el) el.textContent = text;
}

/**
 * Switch the visible panel.
 *
 * @param {string} view One of `setup`, `walk`, `plan`, `model`, `report`.
 */
function show(view) {
  state.view = view;
  for (const panel of document.querySelectorAll('.panel')) {
    panel.hidden = panel.dataset.view !== view;
  }
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('on', tab.dataset.go === view);
  }
  if (view === 'plan') drawPlan();
  if (view === 'model') drawModel();
  if (view === 'report') drawReport();
  if (view !== 'walk' && camera.live) {
    // Leaving the walk releases the camera indicator: an app that holds a
    // stream open while you read a report has no business being trusted in
    // someone else's house.
    camera.stop();
    $('walkVideo').srcObject = null;
  }
}

/* --- the walk ----------------------------------------------------------- */

/**
 * Open the camera and the sensors. Must run inside a tap, for iOS.
 *
 * @returns {Promise<void>}
 */
async function beginWalk() {
  camera.video = $('walkVideo');
  if (camera.live) return;
  try {
    await camera.start({ facingMode: 'environment' });
  } catch (error) {
    say(`Camera unavailable: ${error.message}`, 8);
  }
  const sensors = await orientation.start();
  if (!sensors) {
    say('No orientation sensors here — use Trace or Type mode to measure.', 8);
    setMode('type');
  }
  state.handBuffers = hand.createBuffers();
  state.handState = hand.createHand();
  state.lastFrame = performance.now();
  requestAnimationFrame(loop);
}

/**
 * Choose how this room is being measured.
 *
 * @param {string} mode `point`, `trace` or `type`.
 */
function setMode(mode) {
  state.mode = mode;
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.classList.toggle('on', button.dataset.mode === mode);
  }
  $('typePad').hidden = mode !== 'type';
  $('reticle').hidden = mode !== 'point';
  const hints = {
    point: 'Aim the centre mark where the wall meets the floor, then hold a fingertip still in frame for a second.',
    trace: 'Photograph the wall square-on, tap its two ends, then enter one known dimension to set the scale.',
    type: 'Enter each wall run in order. The plan closes itself when the runs come back round.',
  };
  $('modeHint').textContent = hints[mode] || '';
}

/**
 * One frame of the walk: track the finger, aim the survey, read the room.
 *
 * @param {number} now High-resolution timestamp.
 */
function loop(now) {
  if (state.view !== 'walk') return;
  const dt = clamp((now - state.lastFrame) / 1000, 0, 0.25);
  state.lastFrame = now;
  state.fps = state.fps * 0.9 + (dt > 0 ? (1 / dt) * 0.1 : 0);

  const frame = camera.grab(176);
  if (frame) {
    const tracked = hand.readFrame(state.handBuffers, state.handState, frame.data, frame.width, frame.height, dt);
    paintCursor(tracked);
    if (tracked.commit) commitShot();
    // Sample the room's light every couple of seconds, not every frame: the
    // statistics are about the room, and a hundred readings of the same wall
    // are not more informative than five.
    if (state.frames.length < 24 && Math.random() < dt * 0.5) {
      state.frames.push(finish.frameStats(frame.data, frame.width, frame.height, 2));
    }
  }

  paintAim();
  requestAnimationFrame(loop);
}

/**
 * Draw the fingertip cursor and its dwell ring.
 *
 * @param {object} tracked Result from `hand.readFrame`.
 */
function paintCursor(tracked) {
  const cursor = $('cursor');
  if (!tracked.present) {
    cursor.hidden = true;
    $('handState').textContent = 'no hand';
    return;
  }
  cursor.hidden = false;
  // The rear camera is not mirrored, so the tracker's x maps straight across.
  cursor.style.left = `${(tracked.x * 100).toFixed(1)}%`;
  cursor.style.top = `${(tracked.y * 100).toFixed(1)}%`;
  cursor.style.setProperty('--hold', tracked.hold.toFixed(3));
  cursor.classList.toggle('armed', tracked.hold > 0.05);
  $('handState').textContent = tracked.phase === 'holding'
    ? `holding ${Math.round(tracked.hold * 100)}%`
    : tracked.phase;
}

/** Update the aiming readout from the orientation sensors. */
function paintAim() {
  const reading = orientation.read();
  const fov = camera.fieldOfView();
  if (!reading.ready || state.mode !== 'point') {
    $('aimRange').textContent = '—';
    $('aimAngle').textContent = reading.ready ? '—' : 'no sensors';
    $('reticle').classList.remove('good', 'poor');
    return;
  }
  const ray = pose.pointingRay({
    alpha: pose.relativeHeading(reading.alpha, state.survey.referenceAlpha ?? reading.alpha),
    beta: reading.beta,
    gamma: reading.gamma,
    screenAngle: reading.screenAngle,
    fovX: fov.x,
    fovY: fov.y,
  });
  const hit = pose.floorHit(state.survey.holdHeight, ray);
  const reticle = $('reticle');
  if (!hit) {
    $('aimRange').textContent = '—';
    $('aimAngle').textContent = `${pose.depression(ray).toFixed(0)}° — aim lower`;
    reticle.classList.remove('good');
    reticle.classList.add('poor');
    return;
  }
  $('aimRange').textContent = `${hit.distance.toFixed(2)} m · ${feetInches(hit.distance)}`;
  // What a degree of hand-shake costs, as a share of the distance being
  // measured. Under 5% per degree is a shot worth taking; outside roughly
  // 22°–68° of depression it climbs away fast and the reticle turns red.
  $('aimAngle').textContent = `${hit.depression.toFixed(0)}° · ±${(hit.relative * 100).toFixed(1)}%/°`;
  const good = hit.relative < 0.05;
  reticle.classList.toggle('good', good);
  reticle.classList.toggle('poor', !good);
}

/** Take a corner shot at the current aim. */
function commitShot() {
  if (state.mode !== 'point') return;
  const reading = orientation.read();
  if (!reading.ready) {
    say('No orientation sensors — switch to Trace or Type.', 5);
    return;
  }
  if (state.survey.referenceAlpha === undefined || state.corners.length === 0) {
    // The first shot of a room defines its north; everything after is relative
    // to it, so indoor compass drift never enters the geometry.
    state.survey.referenceAlpha = reading.alpha;
  }
  const fov = camera.fieldOfView();
  const ray = pose.pointingRay({
    alpha: pose.relativeHeading(reading.alpha, state.survey.referenceAlpha),
    beta: reading.beta,
    gamma: reading.gamma,
    screenAngle: reading.screenAngle,
    fovX: fov.x,
    fovY: fov.y,
  });
  const hit = pose.floorHit(state.survey.holdHeight, ray);
  if (!hit) {
    say('Too close to level to measure — aim at the base of the wall.', 4);
    return;
  }
  state.corners.push({ x: hit.x, y: hit.y });
  navigator.vibrate?.(30);
  say(`Corner ${state.corners.length} at ${hit.distance.toFixed(2)} m`, 2);
  renderCorners();
}

/** Redraw the corner list and the live mini-plan. */
function renderCorners() {
  $('cornerCount').textContent = String(state.corners.length);
  const canvas = $('mini');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (state.corners.length === 0) return;
  const box = plan.bounds(state.corners);
  const span = Math.max(box.width, box.depth, 1);
  const scale = (Math.min(w, h) - 24) / span;
  const px = (p) => (p.x - (box.minX + box.maxX) / 2) * scale + w / 2;
  const py = (p) => ((box.minY + box.maxY) / 2 - p.y) * scale + h / 2;
  ctx.strokeStyle = '#63e0c8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  state.corners.forEach((p, i) => (i ? ctx.lineTo(px(p), py(p)) : ctx.moveTo(px(p), py(p))));
  if (state.corners.length > 2) ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#e7f4ff';
  for (const p of state.corners) {
    ctx.beginPath();
    ctx.arc(px(p), py(p), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state.corners.length >= 3) {
    $('liveArea').textContent = `${plan.area(state.corners).toFixed(1)} m² · ${Math.round(plan.area(state.corners) / 0.09290304)} sq ft`;
  } else {
    $('liveArea').textContent = '—';
  }
}

/** Finish the room being walked and add it to the survey. */
function saveRoom() {
  let points = state.corners;
  if (state.mode === 'type') points = pointsFromRuns();
  if (points.length < 3) {
    say('A room needs at least three corners.', 4);
    return;
  }
  const stats = finish.meanStats(state.frames);
  const room = plan.buildRoom({
    name: $('roomName').value || state.room.name,
    type: $('roomType').value,
    points,
    ceiling: Number($('roomCeiling').value) || 2.44,
  });
  room.stats = stats;
  room.signals = finish.signals(stats, room);
  room.presentation = finish.presentation(stats, room);
  state.survey.rooms.push(room);
  ledger.upsert(state.survey);
  state.corners = [];
  state.frames = [];
  state.survey.referenceAlpha = undefined;
  renderCorners();
  renderRoomList();
  say(`${room.name} saved — ${Math.round(room.areaSqft)} sq ft${room.snapped ? `, ${room.snapped} walls squared` : ''}`, 5);
}

/**
 * Build a polygon from typed wall runs.
 *
 * Each run is a length and a turn from the previous wall. Walking them in
 * order closes the loop, which is exactly how a room is dictated aloud.
 *
 * @returns {Array<{x: number, y: number}>} The traced ring.
 */
function pointsFromRuns() {
  const rows = [...document.querySelectorAll('#runList .run')];
  const points = [{ x: 0, y: 0 }];
  let heading = 0;
  for (const row of rows) {
    const length = Number(row.querySelector('.runLength').value);
    const turn = Number(row.querySelector('.runTurn').value);
    if (!(length > 0)) continue;
    heading += turn;
    const radians = heading * Math.PI / 180;
    const last = points[points.length - 1];
    points.push({ x: last.x + Math.sin(radians) * length, y: last.y + Math.cos(radians) * length });
  }
  // The last point should land back on the first; drop it if it nearly does,
  // because a dictated room always over- or under-shoots its own closure.
  if (points.length > 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 0.9) points.pop();
  }
  return points;
}

/** Add a wall-run row to the Type pad. */
function addRun() {
  const list = $('runList');
  const row = document.createElement('div');
  row.className = 'run';
  row.innerHTML = `
    <input class="runLength" type="number" step="0.01" min="0" placeholder="length m" inputmode="decimal" />
    <select class="runTurn">
      <option value="0">straight on</option>
      <option value="90" selected>turn right 90°</option>
      <option value="-90">turn left 90°</option>
      <option value="45">turn right 45°</option>
      <option value="-45">turn left 45°</option>
    </select>
    <button type="button" class="ghost drop">✕</button>`;
  row.querySelector('.drop').addEventListener('click', () => row.remove());
  list.appendChild(row);
  // The first run sets the datum, so it must not turn before it starts.
  if (list.children.length === 1) row.querySelector('.runTurn').value = '0';
}

/* --- rooms, plan, model, report ----------------------------------------- */

/** Redraw the saved-room list. */
function renderRoomList() {
  const list = $('roomList');
  list.innerHTML = '';
  if (!state.survey.rooms.length) {
    list.innerHTML = '<p class="empty">No rooms surveyed yet.</p>';
    return;
  }
  state.survey.rooms.forEach((room, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'roomcard';
    card.innerHTML = `
      <strong>${room.name}</strong>
      <span>${Math.round(room.areaSqft)} sq ft · ${room.area.toFixed(1)} m² · clg ${room.ceiling.toFixed(2)} m</span>
      <span class="muted">${room.walls.length} walls${room.snapped ? ` · ${room.snapped} squared` : ''}${room.presentation ? ` · ${room.presentation.band}` : ''}</span>`;
    card.addEventListener('click', () => {
      state.selected = index;
      show('plan');
    });
    list.appendChild(card);
  });
  const total = plan.summarise(state.survey.rooms);
  $('surveyTotals').textContent = `${state.survey.rooms.length} rooms · ${Math.round(total.areaSqft)} sq ft measured`;
}

/** Draw the blueprint for the selected room. */
function drawPlan() {
  const room = state.survey.rooms[state.selected ?? 0];
  const host = $('planHost');
  if (!room) {
    host.innerHTML = '<p class="empty">Survey a room first.</p>';
    return;
  }
  host.innerHTML = plan.toSvg(room, { title: `${state.survey.address} — ${room.name}` });
  $('planStats').innerHTML = `
    <div><dt>Floor</dt><dd>${room.area.toFixed(2)} m² · ${Math.round(room.areaSqft)} sq ft</dd></div>
    <div><dt>Perimeter</dt><dd>${room.perimeter.toFixed(2)} m</dd></div>
    <div><dt>Wall area</dt><dd>${room.wallArea.toFixed(1)} m²</dd></div>
    <div><dt>Volume</dt><dd>${room.volume.toFixed(1)} m³</dd></div>
    <div><dt>Squared</dt><dd>${room.snapped} of ${room.walls.length} walls, ${(room.squaringShift * 100).toFixed(1)} cm</dd></div>`;
}

/** Draw the massing model for the selected room. */
function drawModel() {
  const room = state.survey.rooms[state.selected ?? 0];
  const canvas = $('modelCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  canvas.width = Math.max(rect.width * dpr, 320);
  canvas.height = Math.max(rect.height * dpr, 240);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!room) return;
  const model = massing.extrude(room);
  const cam = massing.orbitCamera(model, state.orbit);
  massing.render(ctx, model, cam);
}

/** Build and render the improvement report. */
function drawReport() {
  const survey = state.survey;
  if (!survey.rooms.length) {
    $('reportHost').innerHTML = '<p class="empty">Survey at least one room to generate a report.</p>';
    return;
  }
  const signals = [];
  for (const room of survey.rooms) {
    for (const signal of room.signals || []) {
      signals.push({ ...signal, room: room.name });
    }
  }
  const built = report.buildReport({
    rooms: survey.rooms,
    signals,
    pricePerSqft: Number(survey.pricePerSqft) || 0,
    ceilingPricePerSqft: Number(survey.ceilingPricePerSqft) || 0,
    totalSqft: Number(survey.totalSqft) || 0,
    tier: survey.tier,
    condition: survey.condition,
    hasGarage: survey.hasGarage,
  });
  state.report = built;

  const parts = [];
  parts.push(`<section class="headline">
    <div><dt>Estimated value</dt><dd>${money(built.market.value)}</dd></div>
    <div><dt>Street ceiling</dt><dd>${money(built.market.ceiling)}${built.market.ceilingKnown ? '' : ' <em>assumed</em>'}</dd></div>
    <div><dt>Headroom</dt><dd>${money(built.market.headroom)}</dd></div>
    <div><dt>Work that pays</dt><dd>${money(built.totals.earningSpend)} → ${money(built.totals.earningUplift)}</dd></div>
    <div><dt>Net</dt><dd class="${built.totals.net >= 0 ? 'good' : 'bad'}">${money(built.totals.net)}</dd></div>
    <div><dt>Programme</dt><dd>≈ ${built.totals.weeks} weeks</dd></div>
  </section>`);

  if (signals.length) {
    parts.push('<h3>What the camera saw</h3><ul class="signals">');
    for (const signal of signals.slice(0, 8)) {
      parts.push(`<li><b>${signal.label}</b> <span class="pct">${Math.round(signal.confidence * 100)}%</span>
        <span class="room">${signal.room}</span><br /><span class="muted">${signal.evidence}</span></li>`);
    }
    parts.push('</ul>');
  }

  parts.push('<h3>The work, in the order it should happen</h3>');
  for (const phase of built.phases) {
    parts.push(`<div class="phase"><h4>${phase.label}</h4><p class="why">${phase.why}</p>`);
    for (const item of phase.items) {
      const roi = Math.round(item.roi * 100);
      parts.push(`<article class="rec ${item.roi >= 0 ? 'pays' : 'costs'}">
        <header><strong>${item.name}</strong><span class="roi">${roi > 0 ? '+' : ''}${roi}%</span></header>
        <p class="band">${money(item.cost.low)} – ${money(item.cost.high)} · ${item.days[0]}–${item.days[1]} days · adds ≈ ${money(item.uplift)}</p>
        <p>${item.blurb}</p>
        <p class="watch">${item.watchout}</p>
        ${item.capped ? `<p class="capped">Returning ${Math.round(item.slack * 100)}% of its usual uplift — the street ceiling is filling up.</p>` : ''}
      </article>`);
    }
    parts.push('</div>');
  }
  parts.push(`<p class="caveat">${built.caveat}</p>`);
  $('reportHost').innerHTML = parts.join('');
}

/* --- setup and wiring --------------------------------------------------- */

/** Pull the setup form into the survey record. */
function readSetup() {
  const s = state.survey;
  s.address = $('address').value || 'Untitled property';
  s.holdHeight = Number($('holdHeight').value) || 1.45;
  s.pricePerSqft = Number($('pricePerSqft').value) || 0;
  s.ceilingPricePerSqft = Number($('ceilingPricePerSqft').value) || 0;
  s.totalSqft = Number($('totalSqft').value) || 0;
  s.tier = $('tier').value;
  s.condition = $('condition').value;
  s.hasGarage = $('hasGarage').checked;
  ledger.upsert(s);
}

/** Push the survey record into the setup form. */
function writeSetup() {
  const s = state.survey;
  $('address').value = s.address;
  $('holdHeight').value = s.holdHeight;
  $('pricePerSqft').value = s.pricePerSqft || '';
  $('ceilingPricePerSqft').value = s.ceilingPricePerSqft || '';
  $('totalSqft').value = s.totalSqft || '';
  $('tier').value = s.tier;
  $('condition').value = s.condition;
  $('hasGarage').checked = s.hasGarage !== false;
}

/** Run the height calibration against a known distance. */
function runCalibration() {
  const measured = Number($('calMeasured').value);
  const actual = Number($('calActual').value);
  if (!(measured > 0) || !(actual > 0)) {
    say('Enter both the measured and the true distance.', 4);
    return;
  }
  const fixed = pose.calibrate(state.survey.holdHeight, measured, actual);
  state.survey.holdHeight = Number(fixed.height.toFixed(3));
  $('holdHeight').value = state.survey.holdHeight;
  ledger.upsert(state.survey);
  say(`Hold height corrected to ${state.survey.holdHeight.toFixed(2)} m — ${(fixed.error * 100).toFixed(1)}% of error removed.`, 6);
}

/** Attach every listener and open the app. */
function boot() {
  const stored = ledger.load();
  state.survey = stored[0] || ledger.createSurvey();
  state.survey.rooms = (state.survey.rooms || []).map((r) => (r.walls ? r : plan.buildRoom(r, { square: false })));
  writeSetup();
  renderRoomList();

  for (const type of ROOM_TYPES) {
    const option = document.createElement('option');
    option.value = type[0];
    option.textContent = type[1];
    $('roomType').appendChild(option);
  }

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', async () => {
      show(tab.dataset.go);
      // Coming back to the walk has to reopen the stream that leaving it
      // closed, or the viewfinder is a black rectangle.
      if (tab.dataset.go === 'walk') await beginWalk();
    });
  }
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }
  for (const field of ['address', 'holdHeight', 'pricePerSqft', 'ceilingPricePerSqft', 'totalSqft', 'tier', 'condition', 'hasGarage']) {
    $(field).addEventListener('change', readSetup);
  }

  $('startWalk').addEventListener('click', async () => {
    readSetup();
    show('walk');
    await beginWalk();
  });
  $('shootBtn').addEventListener('click', commitShot);
  $('undoBtn').addEventListener('click', () => {
    state.corners.pop();
    renderCorners();
  });
  $('saveRoomBtn').addEventListener('click', saveRoom);
  $('addRunBtn').addEventListener('click', addRun);
  $('calibrateBtn').addEventListener('click', runCalibration);
  $('newSurveyBtn').addEventListener('click', () => {
    state.survey = ledger.createSurvey($('address').value || 'Untitled property');
    ledger.upsert(state.survey);
    writeSetup();
    renderRoomList();
    say('New survey started.', 3);
  });
  $('loadExampleBtn').addEventListener('click', () => {
    state.survey = exampleSurvey();
    state.selected = 0;
    ledger.upsert(state.survey);
    writeSetup();
    renderRoomList();
    show('report');
    say('Loaded a worked example — five measured rooms, a dated interior, and a market with room above it.', 7);
  });
  /**
   * Run an export and say what happened, since a mediated save can be
   * declined and a silent button is worse than a refused one.
   *
   * @param {string} filename Suggested name.
   * @param {string} content File body.
   * @param {string} type MIME type.
   * @returns {Promise<void>}
   */
  const exportFile = async (filename, content, type) => {
    const saved = await ledger.download(filename, content, type);
    say(saved ? `${filename} exported.` : 'Export was not saved.', 4);
  };
  const slug = () => state.survey.address.replace(/\W+/g, '-');

  $('exportJsonBtn').addEventListener('click', () => {
    exportFile(`${slug()}-survey.json`, ledger.toJson(state.survey), 'application/json');
  });
  $('exportPlanBtn').addEventListener('click', () => {
    const room = state.survey.rooms[state.selected ?? 0];
    if (!room) return say('No room to export.', 3);
    return exportFile(`${room.name.replace(/\W+/g, '-')}-plan.svg`, plan.toSvg(room, { title: state.survey.address }), 'image/svg+xml');
  });
  $('exportReportBtn').addEventListener('click', () => {
    if (!state.report) return say('Generate the report first.', 3);
    return exportFile(`${slug()}-report.txt`, report.toText(state.report, state.survey.address), 'text/plain');
  });
  $('torchBtn').addEventListener('click', async () => {
    state.torch = await camera.torch(!state.torch);
    $('torchBtn').classList.toggle('on', state.torch);
  });

  // Orbit the massing model by dragging it.
  const canvas = $('modelCanvas');
  const start = (x, y) => { state.drag = { x, y, yaw: state.orbit.yaw, pitch: state.orbit.pitch }; };
  const move = (x, y) => {
    if (!state.drag) return;
    state.orbit.yaw = state.drag.yaw + (x - state.drag.x) * 0.4;
    state.orbit.pitch = clamp(state.drag.pitch + (y - state.drag.y) * 0.3, 5, 85);
    drawModel();
  };
  canvas.addEventListener('pointerdown', (e) => { start(e.clientX, e.clientY); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
  canvas.addEventListener('pointerup', () => { state.drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.orbit.zoom = clamp(state.orbit.zoom * (1 + e.deltaY * 0.001), 0.5, 3);
    drawModel();
  }, { passive: false });

  addRun();
  addRun();
  addRun();
  addRun();
  setMode(Orientation.supported() ? 'point' : 'type');
  show('setup');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

export { boot, state };
