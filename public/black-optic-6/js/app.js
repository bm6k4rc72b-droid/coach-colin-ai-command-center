/**
 * BLACK OPTIC 6 — console shell.
 *
 * Wires the decks to the sensors and to the modules that do the measuring. The
 * shell's own job is small and strict: never put a number on screen without the
 * badge that says where it came from, never let an unmeasured thing raise an
 * alarm, and never leave a panel blank when the honest answer is a sentence
 * explaining why it is empty.
 *
 * The measurement chain is the perimeter camera app's, the orbital predictions
 * are the fire console's, and the view renderer is shared. That reuse is the
 * point: one implementation of each number in this repository, so two panels
 * can never quietly disagree about how fast something was moving.
 *
 * @module black-optic-6/app
 */

import { CAPABILITIES, tally } from './capability.js';
import { STATES, format, reading, stateFor } from './provenance.js';
import { Watch, alertState } from './watch.js';
import { AcousticWatch, BANDS } from './acoustic.js';
import { Vault } from './vault.js';
import { areaHectares, crossing, fenceState } from './perimeter.js';
import { LAYERS, TASKING_LADDER, latestDate, mosaic, resolutionNote, upcomingLooks } from './satellite.js';
import * as hud from './hud.js';
import { VIEWS, accumulate, render as renderView } from '../../sentry/js/views.js';
import { pose } from '../../sentry/js/ground.js';
import { capability as rfCapability, RfLink } from '../../sentry/js/rf.js';

const $ = (id) => document.getElementById(id);
const STORE = 'black-optic-6:state:v1';

/** Processing width. Small enough for a phone to sustain, large enough to segment. */
const WORK_WIDTH = 320;

const state = {
  deck: 'optics',
  view: 'natural',
  armed: 'standby',
  stream: null,
  facing: 'environment',
  watch: new Watch(),
  vault: new Vault(),
  acoustic: null,
  trail: null,
  pose: null,
  contacts: [],
  events: [],
  impulses: [],
  sources: [],
  boundary: [],
  fix: null,
  lastFence: null,
  geoId: null,
  link: null,
  linkState: 'absent',
  ledgerFilter: 'all',
  blackout: false,
  siren: null,
};

/* ------------------------------------------------------------------ shell */

/** The decks, their rail icons, and their order. */
const DECKS = [
  ['optics', 'Optics', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z'],
  ['watch', 'Watch', 'M3 20V8l9-5 9 5v12 M9 20v-6h6v6'],
  ['acoustic', 'Acoustic', 'M4 10v4 M8 6v12 M12 3v18 M16 7v10 M20 10v4'],
  ['perimeter', 'Fence', 'M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z M12 6v6'],
  ['satellite', 'Orbital', 'M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18'],
  ['vault', 'Vault', 'M4 5h16v14H4z M9 12a3 3 0 106 0 3 3 0 00-6 0z M12 9V5'],
  ['links', 'Links', 'M9 15l6-6 M8 8a4 4 0 015.6 0l1 1 M16 16a4 4 0 01-5.6 0l-1-1'],
  ['ledger', 'Ledger', 'M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h3'],
];

/** @returns {void} Build the navigation rail. */
function buildRail() {
  $('rail').replaceChildren(...DECKS.map(([id, label, path]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.deck = id;
    button.setAttribute('aria-current', String(id === state.deck));
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${label}</span>`;
    button.addEventListener('click', () => openDeck(id));
    return button;
  }));
}

/**
 * Show one deck.
 *
 * @param {string} id Deck identifier.
 * @returns {void}
 */
function openDeck(id) {
  state.deck = id;
  for (const [deck] of DECKS) $(`deck-${deck}`).dataset.open = String(deck === id);
  for (const button of $('rail').children) {
    button.setAttribute('aria-current', String(button.dataset.deck === id));
  }
  if (id === 'satellite' && !$('sat-mosaic').children.length) renderLooks();
}

/**
 * A provenance badge element.
 *
 * @param {string} stateId Provenance state id.
 * @param {string} [label] Override text.
 * @returns {HTMLElement} The badge.
 */
function badge(stateId, label) {
  const provenance = stateFor(stateId);
  const node = document.createElement('span');
  node.className = 'prov';
  node.dataset.tone = provenance.tone;
  node.title = provenance.meaning;
  node.textContent = label ?? provenance.label;
  return node;
}

/**
 * Point an existing badge at a state.
 *
 * @param {string} id Element id.
 * @param {string} stateId Provenance state id.
 * @param {string} [label] Override text.
 * @returns {void}
 */
function setBadge(id, stateId, label) {
  const node = $(id);
  if (!node) return;
  const provenance = stateFor(stateId);
  node.dataset.tone = provenance.tone;
  node.title = provenance.meaning;
  node.textContent = label ?? provenance.label;
}

/**
 * A labelled readout tile.
 *
 * @param {string} key Label.
 * @param {string} value Value text.
 * @param {object} [options] Tone and footnote.
 * @returns {HTMLElement} The tile.
 */
function readout(key, value, options = {}) {
  const node = document.createElement('div');
  node.className = 'readout';
  node.innerHTML = `<span class="k"></span><div class="v"></div>${options.note ? '<div class="n"></div>' : ''}`;
  node.querySelector('.k').textContent = key;
  const valueNode = node.querySelector('.v');
  valueNode.textContent = value;
  if (options.tone) valueNode.dataset.tone = options.tone;
  if (options.note) node.querySelector('.n').textContent = options.note;
  return node;
}

/**
 * Add an entry to the event log.
 *
 * @param {string} title What happened.
 * @param {string} detail Why it is being reported.
 * @param {string} [tone='primary'] Row tone.
 * @returns {void}
 */
function logEvent(title, detail, tone = 'primary') {
  state.events.unshift({ title, detail, tone, atMs: Date.now() });
  state.events = state.events.slice(0, 40);
  renderEvents();
}

/** @returns {void} Draw the event log. */
function renderEvents() {
  const host = $('events');
  if (!state.events.length) {
    host.innerHTML = '<li class="empty">Nothing logged yet. Events appear here with the time and the reason they were kept.</li>';
    return;
  }
  host.replaceChildren(...state.events.map((event) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = event.tone;
    li.innerHTML = '<div class="row-head"><b></b><time></time></div><p></p>';
    li.querySelector('b').textContent = event.title;
    li.querySelector('time').textContent = new Date(event.atMs).toLocaleTimeString();
    li.querySelector('p').textContent = event.detail;
    return li;
  }));
}

/* ----------------------------------------------------------------- optics */

const work = document.createElement('canvas');
const workCtx = work.getContext('2d', { willReadFrequently: true });

/** @returns {Promise<void>} Open the device camera and start the loop. */
async function startOptics() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 } },
      audio: false,
    });
  } catch (error) {
    $('viewport-empty').innerHTML = `<p class="note bad">Camera refused: ${error.message}. Everything else on this console works without it.</p>`;
    return;
  }
  const video = $('video');
  video.srcObject = state.stream;
  await video.play().catch(() => {});
  $('viewport-empty').hidden = true;
  $('sweep').hidden = false;
  setBadge('optics-prov', 'LIVE');
  setArmed('armed');
  state.vault.start(state.stream);
  $('vault-keep').disabled = false;
  logEvent('Optics online', 'Device camera opened. Frames are measured on this device and discarded.', 'confirm');
  requestAnimationFrame(loop);
}

/** @returns {void} The per-frame pipeline. */
function loop() {
  const video = $('video');
  if (!state.stream || video.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }

  const ratio = video.videoHeight / video.videoWidth || 0.75;
  work.width = WORK_WIDTH;
  work.height = Math.round(WORK_WIDTH * ratio);
  workCtx.drawImage(video, 0, 0, work.width, work.height);
  const frame = workCtx.getImageData(0, 0, work.width, work.height);

  const result = state.watch.push(frame, performance.now());
  state.contacts = result.contacts;

  if (result.energy) {
    if (!state.trail || state.trail.length !== result.energy.length) {
      state.trail = new Float32Array(result.energy.length);
    }
    accumulate(state.trail, result.energy);
  }

  const canvas = $('frame');
  canvas.width = work.width;
  canvas.height = work.height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(work.width, work.height);
  renderView(state.view, { frame, mask: result.mask, energy: result.energy, trail: state.trail }, out);
  ctx.putImageData(out, 0, 0);

  drawHud(result);
  renderContacts(result);

  requestAnimationFrame(loop);
}

/**
 * Draw the overlay at display resolution.
 *
 * @param {object} result The frame result.
 * @returns {void}
 */
function drawHud(result) {
  const canvas = $('hud');
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(box.width));
  canvas.height = Math.max(1, Math.round(box.height));
  const ctx = canvas.getContext('2d');
  const size = { w: canvas.width, h: canvas.height };

  hud.frame(ctx, size, {
    mode: state.view,
    settled: result.settled,
    settleProgress: Math.min(1, state.watch.frames / 24),
    calibrated: Boolean(state.pose),
  });
  if (state.pose) hud.horizon(ctx, state.pose, size, work.height);
  hud.contacts(ctx, state.contacts, { x: size.w / work.width, y: size.h / work.height });
}

/**
 * Update the contacts deck.
 *
 * @param {object} result The frame result.
 * @returns {void}
 */
function renderContacts(result) {
  const decision = alertState(state.contacts);
  $('watch-panel').dataset.alert = String(decision.alert);
  setBadge('watch-prov', result.settled ? 'LIVE' : 'MODEL', result.settled ? 'Live' : 'Learning scene');

  $('watch-readouts').replaceChildren(
    readout('Contacts', String(state.contacts.length), { tone: decision.alert ? 'alert' : 'confirm' }),
    readout('Scene change', `${(result.changedFraction * 100).toFixed(1)}%`, {
      note: 'Fraction of the frame that is not background.',
    }),
    readout('Units', state.pose ? 'metres' : 'pixels', {
      tone: state.pose ? 'confirm' : 'caution',
      note: state.pose ? 'View calibrated.' : 'Calibrate the view to get metres.',
    }),
    readout('Alert', decision.alert ? 'YES' : 'no', {
      tone: decision.alert ? 'alert' : 'muted',
      note: decision.reason,
    }),
  );

  const host = $('contacts');
  if (!state.contacts.length) {
    host.innerHTML = `<li class="empty">${result.settled
      ? 'Nothing moving. The background model is settled and reporting.'
      : 'Learning what this scene looks like when nothing is happening.'}</li>`;
    return;
  }

  host.replaceChildren(...state.contacts.map((contact) => {
    const li = document.createElement('li');
    li.className = 'row';
    const label = contact.classification.value ?? 'unknown';
    li.dataset.tone = label === 'person' ? 'alert' : label === 'vehicle' ? 'caution' : 'confirm';
    const head = document.createElement('div');
    head.className = 'row-head';
    const name = document.createElement('b');
    name.textContent = `${String(label).toUpperCase()} · ${String(contact.id).padStart(2, '0')}`;
    head.append(name, badge(contact.classification.state, 'Modelled'));
    const time = document.createElement('time');
    time.textContent = `${contact.ageSec.toFixed(1)}s`;
    head.append(time);

    const body = document.createElement('p');
    body.textContent = contact.calibrated
      ? `Height ${format(contact.height, 2)} · speed ${format(contact.speed, 2)} · ${contact.summary}`
      : `${contact.summary} — view not calibrated, so no metres are reported.`;

    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = contact.reasons?.length ? contact.reasons.join(' · ') : '';

    li.append(head, body, why);
    return li;
  }));

  if (decision.alert && Date.now() - (state.lastAlertMs ?? 0) > 20000) {
    state.lastAlertMs = Date.now();
    logEvent('Contact', decision.reason, 'alert');
  }
}

/** @returns {void} Build the view switcher. */
function buildViews() {
  $('views').replaceChildren(...VIEWS.map((view) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = view.label;
    button.title = view.hint;
    button.setAttribute('aria-pressed', String(view.id === state.view));
    button.addEventListener('click', () => {
      state.view = view.id;
      buildViews();
    });
    return button;
  }));
}

/* ------------------------------------------------------------ calibration */

/** @returns {void} Apply the typed mounting to the tracker. */
function applyCalibration() {
  const heightM = Number($('cal-height').value);
  const tiltDeg = Number($('cal-tilt').value);
  const fovDeg = Number($('cal-fov').value);
  if (!(heightM > 0) || !(fovDeg > 0)) {
    $('cal-note').className = 'note bad';
    $('cal-note').textContent = 'Mount height and field of view must be positive.';
    return;
  }
  state.pose = pose({ heightM, tiltDeg, fovDeg, width: work.width || WORK_WIDTH, height: work.height || 240 });
  state.watch.setPose(state.pose);
  setBadge('calib-prov', 'MODEL', 'Metres');
  $('cal-note').className = 'note good';
  $('cal-note').textContent = 'Reporting metres. Check the horizon line on the frame — if it is not on the real horizon, the mounting numbers are wrong and so is everything derived from them.';
  logEvent('Calibrated', `Mount ${heightM} m, tilt ${tiltDeg}°, FOV ${fovDeg}°.`, 'confirm');
  save();
}

/* -------------------------------------------------------------- acoustic */

/** @returns {Promise<void>} Open the microphone. */
async function startAcoustic() {
  state.acoustic = new AcousticWatch({
    onFrame: (frame) => renderAcoustic(frame),
    onImpulse: (impulse) => {
      state.impulses.unshift(impulse);
      state.impulses = state.impulses.slice(0, 30);
      renderImpulses();
      logEvent('Impulse', `${impulse.shape} · ${impulse.peakDb.toFixed(0)} dBFS, ${impulse.riseDb.toFixed(0)} dB above background.`, 'caution');
    },
  });
  try {
    await state.acoustic.start();
    setBadge('acoustic-prov', 'LIVE');
    $('acoustic-start').disabled = true;
    $('acoustic-stop').disabled = false;
    logEvent('Acoustic online', 'Microphone open. Audio is analysed on this device and never recorded by this panel.', 'confirm');
  } catch (error) {
    setBadge('acoustic-prov', 'BLOCKED', 'Refused');
    $('acoustic-readouts').replaceChildren(readout('Microphone', 'refused', { tone: 'alert', note: error.message }));
  }
}

/**
 * Draw the live acoustic readouts.
 *
 * @param {object} frame Per-frame report.
 * @returns {void}
 */
function renderAcoustic(frame) {
  const above = frame.db - frame.floor;
  const host = $('acoustic-readouts');
  host.replaceChildren(
    readout('Level', `${frame.db.toFixed(0)} dBFS`, { tone: above > 12 ? 'alert' : 'confirm' }),
    readout('Background', `${frame.floor.toFixed(0)} dBFS`, { note: 'Median of the last two seconds.' }),
    readout('Above background', `${above.toFixed(0)} dB`, { tone: above > 12 ? 'alert' : 'muted' }),
    readout('Flatness', frame.flatness.toFixed(2), {
      note: frame.flatness > 0.35 ? 'Broadband — impact-like.' : 'Tonal — engine, pump, voice.',
    }),
    ...BANDS.map((band) => readout(band.name, `${(frame.bands[band.name] * 100).toFixed(0)}%`, { note: band.note })),
  );
}

/** @returns {void} Draw the impulse log. */
function renderImpulses() {
  const host = $('impulses');
  if (!state.impulses.length) {
    host.innerHTML = '<li class="empty">No impulses. A sharp rise above the background level is logged here with its shape, never with a guess at what made it.</li>';
    return;
  }
  host.replaceChildren(...state.impulses.map((impulse) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'caution';
    li.innerHTML = '<div class="row-head"><b></b><time></time></div><p></p>';
    li.querySelector('b').textContent = impulse.shape.toUpperCase();
    li.querySelector('time').textContent = new Date(impulse.atMs).toLocaleTimeString();
    li.querySelector('p').textContent = `${impulse.peakDb.toFixed(0)} dBFS, ${impulse.riseDb.toFixed(0)} dB above background. ${impulse.note}`;
    return li;
  }));
}

/* ------------------------------------------------------------- perimeter */

/** @returns {void} Start watching position. */
function startPositioning() {
  if (!navigator.geolocation) {
    setBadge('fence-prov', 'BLOCKED', 'No positioning');
    return;
  }
  state.geoId = navigator.geolocation.watchPosition(
    (position) => {
      state.fix = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracyM: position.coords.accuracy,
        atMs: position.timestamp,
      };
      $('fence-mark').disabled = false;
      renderFence();
    },
    (error) => {
      setBadge('fence-prov', 'BLOCKED', 'Refused');
      $('fence-readouts').replaceChildren(readout('Positioning', 'refused', { tone: 'alert', note: error.message }));
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
  );
}

/** @returns {void} Draw the geofence state and map. */
function renderFence() {
  const verdict = fenceState(state.fix, state.boundary);
  const resolved = verdict.resolved;
  setBadge('fence-prov', state.fix ? (resolved ? 'LIVE' : 'MODEL') : 'BLOCKED',
    state.fix ? (resolved ? verdict.state : 'Unresolved') : 'No fix');

  $('fence-readouts').replaceChildren(
    readout('Fix accuracy', state.fix ? `±${state.fix.accuracyM.toFixed(0)} m` : '—', {
      tone: !state.fix ? 'muted' : state.fix.accuracyM < 15 ? 'confirm' : 'caution',
    }),
    readout('Corners', String(state.boundary.length), {
      note: state.boundary.length < 3 ? 'Three or more make a boundary.' : '',
    }),
    readout('Enclosed', state.boundary.length > 2 ? `${areaHectares(state.boundary).toFixed(2)} ha` : '—'),
    readout('Boundary', resolved ? verdict.state : 'unresolved', {
      tone: resolved ? (verdict.inside ? 'confirm' : 'alert') : 'caution',
      note: verdict.verdict,
    }),
  );

  if (state.lastFence) {
    const moved = crossing(state.lastFence, verdict);
    if (moved.crossed) logEvent(`Boundary ${moved.direction}`, moved.reason, 'alert');
  }
  state.lastFence = verdict;
  drawFenceMap();
  save();
}

/** @returns {void} Draw the boundary and the current fix. */
function drawFenceMap() {
  const canvas = $('fence-map');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const points = [...state.boundary, ...(state.fix ? [state.fix] : [])];
  ctx.strokeStyle = 'rgba(79, 232, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = '#566b7e';
    ctx.font = `12px ${hud.HUD.mono}`;
    ctx.fillText('No corners marked. Walk the boundary and mark each one.', 16, 26);
    return;
  }

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const pad = 0.0004;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLon = Math.min(...lons) - pad;
  const maxLon = Math.max(...lons) + pad;
  const project = (p) => ({
    x: 24 + ((p.lon - minLon) / Math.max(1e-9, maxLon - minLon)) * (canvas.width - 48),
    y: canvas.height - 24 - ((p.lat - minLat) / Math.max(1e-9, maxLat - minLat)) * (canvas.height - 48),
  });

  if (state.boundary.length > 1) {
    ctx.strokeStyle = '#4fe8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.boundary.forEach((point, i) => {
      const p = project(point);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (state.boundary.length > 2) ctx.closePath();
    ctx.stroke();
    if (state.boundary.length > 2) {
      ctx.fillStyle = 'rgba(79, 232, 255, 0.08)';
      ctx.fill();
    }
  }

  ctx.fillStyle = '#4fe8ff';
  for (const point of state.boundary) {
    const p = project(point);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state.fix) {
    const p = project(state.fix);
    const span = Math.max(1e-9, maxLon - minLon) * 111320 * Math.cos((state.fix.lat * Math.PI) / 180);
    const pxPerM = (canvas.width - 48) / span;
    ctx.strokeStyle = 'rgba(255, 178, 61, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(4, state.fix.accuracyM * pxPerM), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffb23d';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `10px ${hud.HUD.mono}`;
    ctx.fillText(`±${state.fix.accuracyM.toFixed(0)} m`, p.x + 9, p.y + 4);
  }
}

/* ------------------------------------------------------------- satellite */

/** @returns {void} Populate the satellite deck. */
function buildSatellite() {
  $('sat-layer').replaceChildren(...LAYERS.map((layer) => {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = `${layer.name} · ${layer.metresPerPixel} m`;
    return option;
  }));
  $('sat-date').value = latestDate();
  $('sat-truth').textContent =
    'Real imagery over your coordinates, free, refreshed daily — and not a camera you can point. '
    + 'Nothing civilian loiters over one property, and at these resolutions a person is far smaller '
    + 'than the error in a single pixel. What this is genuinely good for: fire, smoke, flood, canopy '
    + 'health and week-to-week change across the whole place in one frame.';

  const table = $('sat-ladder');
  table.innerHTML = '<tr><th>Tier</th><th>Resolution</th><th>Revisit</th><th>Cost</th></tr>';
  for (const tier of TASKING_LADDER) {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td><td></td>';
    const cells = row.children;
    cells[0].textContent = tier.tier;
    cells[1].textContent = tier.resolution;
    cells[2].textContent = tier.revisit;
    cells[3].textContent = tier.cost;
    row.title = tier.note;
    table.append(row);
  }
}

/** @returns {void} Draw the next-overpass list. */
function renderLooks() {
  const place = state.fix ?? state.boundary[0] ?? { lat: 38.5025, lon: -122.3977 };
  const host = $('sat-looks');
  host.replaceChildren(...upcomingLooks(place, Date.now(), 5).map((look) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'caution';
    li.innerHTML = '<div class="row-head"><b></b><time></time></div><p></p>';
    li.querySelector('b').textContent = `${look.satellite} · ${look.instrument}`;
    const hours = Math.floor(look.inMinutes / 60);
    const minutes = look.inMinutes % 60;
    li.querySelector('time').textContent = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    li.querySelector('p').textContent = `${look.pass} pass, ${look.pixelM} m pixels, ±${look.uncertaintyMin} min on this estimate. ${look.note}`;
    return li;
  }));
}

/** @returns {Promise<void>} Fetch the imagery mosaic. */
async function fetchScene() {
  if (state.blackout) return;
  const layer = LAYERS.find((entry) => entry.id === $('sat-layer').value) ?? LAYERS[0];
  const place = state.fix ?? state.boundary[0] ?? { lat: 38.5025, lon: -122.3977 };
  const date = $('sat-date').value || latestDate();
  const grid = mosaic(layer, date, place, 3);
  const note = resolutionNote(layer);

  $('sat-mosaic').replaceChildren(...grid.tiles.map((tile) => {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = `${layer.name} tile`;
    img.src = tile.url;
    return img;
  }));
  $('sat-note').className = 'note';
  $('sat-note').textContent =
    `${layer.name}, ${date}. ${note.verdict} At this zoom one screen pixel is about `
    + `${grid.metresPerPixel.toFixed(0)} m of ground — ${note.personFraction}. ${layer.cadence}. ${layer.use}`;
  renderLooks();
  logEvent('Scene fetched', `${layer.name} for ${date} at ${place.lat.toFixed(3)}, ${place.lon.toFixed(3)}.`, 'primary');
}

/* ----------------------------------------------------------------- vault */

/** @returns {void} Refresh the vault deck. */
function renderVault() {
  const supported = Vault.supported();
  setBadge('vault-prov', supported ? (state.stream ? 'LIVE' : 'MODEL') : 'BLOCKED',
    supported ? (state.stream ? 'Recording' : 'Idle') : 'Unsupported');

  $('vault-readouts').replaceChildren(
    readout('Buffered', `${state.vault.bufferedSeconds.toFixed(0)} s`, {
      tone: state.vault.bufferedSeconds > 10 ? 'confirm' : 'muted',
      note: 'Rolling. The oldest second is dropped as a new one arrives.',
    }),
    readout('Clips held', String(state.vault.clips.length), { note: 'On this device only.' }),
    readout('Container', state.vault.mime ? state.vault.mime.split(';')[0] : '—'),
  );

  const host = $('clips');
  if (!state.vault.clips.length) {
    host.innerHTML = '<li class="empty">No clips kept. Keeping one saves the thirty seconds either side of the moment and hashes the result.</li>';
    return;
  }
  host.replaceChildren(...state.vault.clips.map((clip) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'primary';
    const head = document.createElement('div');
    head.className = 'row-head';
    const name = document.createElement('b');
    name.textContent = Vault.filename(clip);
    const time = document.createElement('time');
    time.textContent = new Date(clip.atMs).toLocaleTimeString();
    head.append(name, time);
    const body = document.createElement('p');
    body.textContent = `${clip.seconds.toFixed(0)} s · ${clip.reason}`;
    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = clip.hash ? `SHA-256 ${clip.hash.slice(0, 32)}…` : 'Not hashed — this origin has no subtle crypto.';
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.style.marginTop = '8px';
    const save = document.createElement('button');
    save.className = 'ghost';
    save.type = 'button';
    save.textContent = 'Export';
    save.addEventListener('click', () => {
      const url = URL.createObjectURL(clip.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = Vault.filename(clip);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
    controls.append(save);
    li.append(head, body, why, controls);
    return li;
  }));
}

/* ----------------------------------------------------------------- links */

/** @returns {void} Populate the sensor-link deck. */
function buildLinks() {
  const capability = rfCapability();
  $('links-truth').textContent = `${capability.headline} ${capability.detail}`;
  $('link-options').replaceChildren(...capability.options.map((option) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'primary';
    li.innerHTML = '<div class="row-head"><b></b></div><p></p>';
    li.querySelector('b').textContent = option.name;
    li.querySelector('p').textContent = option.note;
    return li;
  }));
}

/** @returns {void} Open a socket to an external sensor bridge. */
function connectLink() {
  const url = $('link-url').value.trim();
  if (!url) return;
  state.link = new RfLink({
    onState: (linkState, detail) => {
      state.linkState = linkState;
      setBadge('links-prov', linkState === 'live' ? 'LINK' : 'BLOCKED', linkState);
      $('link-state').className = `note ${linkState === 'live' ? 'good' : 'warn'}`;
      $('link-state').textContent = detail || linkState;
      $('link-count').textContent = String(linkState === 'live' ? 1 : 0);
      $('link-disconnect').disabled = linkState !== 'live';
    },
    onFrame: (frame) => {
      logEvent('Sensor frame', `${frame.sensor ?? 'bridge'} reported ${frame.kind ?? 'a frame'}.`, 'primary');
    },
  });
  state.link.connect(url);
}

/* ---------------------------------------------------------------- ledger */

/** @returns {void} Draw the capability ledger. */
function renderLedger() {
  const counts = tally();
  const filters = ['all', ...Object.keys(STATES).filter((id) => counts[id])];
  $('ledger-tally').replaceChildren(...filters.map((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.ledgerFilter === id));
    const count = id === 'all' ? CAPABILITIES.length : counts[id];
    button.innerHTML = `${id === 'all' ? 'All' : stateFor(id).label}<b>${count}</b>`;
    button.addEventListener('click', () => {
      state.ledgerFilter = id;
      renderLedger();
    });
    return button;
  }));

  const rows = state.ledgerFilter === 'all'
    ? CAPABILITIES
    : CAPABILITIES.filter((row) => row.state === state.ledgerFilter);

  $('ledger').replaceChildren(...rows.map((row) => {
    const node = document.createElement('div');
    node.className = 'ledger-row';
    const left = document.createElement('div');
    left.append(badge(row.state));
    const right = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = row.name;
    const verdict = document.createElement('p');
    verdict.textContent = row.verdict;
    right.append(title, verdict);
    if (row.path) {
      const path = document.createElement('div');
      path.className = 'path';
      path.textContent = row.path;
      right.append(path);
    }
    const board = document.createElement('div');
    board.className = 'board';
    board.textContent = row.panel ? `Delivered by the ${row.panel} deck` : 'Specified but not delivered';
    right.append(board);
    node.append(left, right);
    return node;
  }));
}

/* -------------------------------------------------------------- response */

/**
 * Set the console's armed state.
 *
 * @param {string} next `standby`, `armed` or `blackout`.
 * @returns {void}
 */
function setArmed(next) {
  state.armed = next;
  $('armed').dataset.state = next;
  $('armed-label').textContent = next === 'armed' ? 'Armed' : next === 'blackout' ? 'Blackout' : 'Standby';
}

/** @returns {void} Flood the screen with white light. */
function floodLight() {
  const flood = document.createElement('div');
  flood.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:999';
  flood.addEventListener('click', () => flood.remove());
  document.body.append(flood);
  logEvent('Flood light', 'Screen flood triggered manually.', 'caution');
  setTimeout(() => flood.remove(), 8000);
}

/** @returns {void} Sound a siren from this device. */
function siren() {
  if (state.siren) {
    state.siren.stop();
    state.siren = null;
    return;
  }
  const context = new (window.AudioContext ?? window.webkitAudioContext)();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sawtooth';
  gain.gain.value = 0.22;
  oscillator.connect(gain).connect(context.destination);
  const start = context.currentTime;
  for (let i = 0; i < 24; i += 1) {
    oscillator.frequency.setValueAtTime(i % 2 ? 880 : 520, start + i * 0.45);
  }
  oscillator.start();
  oscillator.stop(start + 24 * 0.45);
  state.siren = { stop: () => { oscillator.stop(); context.close(); } };
  oscillator.onended = () => { state.siren = null; };
  logEvent('Siren', 'Sounded from this device.', 'caution');
}

/** @returns {void} Kill every emission this console controls. */
function blackout() {
  state.blackout = true;
  setArmed('blackout');
  state.siren?.stop?.();
  state.siren = null;
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#000;z-index:998;display:flex;align-items:center;justify-content:center;color:#1b2733;font:11px ui-monospace,monospace;letter-spacing:.2em';
  veil.textContent = 'BLACKOUT — TAP TO RESTORE';
  veil.addEventListener('click', () => {
    veil.remove();
    state.blackout = false;
    setArmed(state.stream ? 'armed' : 'standby');
  });
  document.body.append(veil);
  logEvent('Blackout', 'All console emissions stopped. Sensors still recording.', 'muted');
}

/* ------------------------------------------------------------ persistence */

/** @returns {void} Save what is worth surviving a reload. */
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      boundary: state.boundary,
      view: state.view,
      pose: state.pose ? { heightM: $('cal-height').value, tiltDeg: $('cal-tilt').value, fovDeg: $('cal-fov').value } : null,
    }));
  } catch {
    // A blocked store is not worth interrupting a watch over.
  }
}

/** @returns {void} Restore the saved boundary and calibration. */
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (!saved) return;
    if (Array.isArray(saved.boundary)) state.boundary = saved.boundary;
    if (saved.view) state.view = saved.view;
    if (saved.pose) {
      $('cal-height').value = saved.pose.heightM;
      $('cal-tilt').value = saved.pose.tiltDeg;
      $('cal-fov').value = saved.pose.fovDeg;
    }
  } catch {
    // Corrupt state is discarded rather than repaired.
  }
}

/* ------------------------------------------------------------------ wire */

$('optics-start').addEventListener('click', startOptics);
$('camera-flip').addEventListener('click', async () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  for (const track of state.stream?.getTracks() ?? []) track.stop();
  state.stream = null;
  await startOptics();
});
$('stream-add').addEventListener('click', () => {
  const url = $('stream-url').value.trim();
  if (!url) return;
  state.sources.push({ url, addedMs: Date.now() });
  $('stream-url').value = '';
  const host = $('sources');
  host.replaceChildren(...state.sources.map((source) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'primary';
    li.innerHTML = '<div class="row-head"><b>Linked source</b></div><p></p>';
    li.querySelector('p').textContent = source.url;
    return li;
  }));
  logEvent('Source added', url, 'primary');
});

$('cal-apply').addEventListener('click', applyCalibration);
$('cal-clear').addEventListener('click', () => {
  state.pose = null;
  state.watch.setPose(null);
  setBadge('calib-prov', 'BLOCKED', 'Pixels');
  $('cal-note').className = 'note warn';
  $('cal-note').textContent = 'Back to pixels. Nothing will be reported in metres.';
});

$('acoustic-start').addEventListener('click', startAcoustic);
$('acoustic-stop').addEventListener('click', () => {
  state.acoustic?.stop();
  state.acoustic = null;
  setBadge('acoustic-prov', 'MODEL', 'Stopped');
  $('acoustic-start').disabled = false;
  $('acoustic-stop').disabled = true;
});

$('fence-track').addEventListener('click', startPositioning);
$('fence-mark').addEventListener('click', () => {
  if (!state.fix) return;
  state.boundary.push({ lat: state.fix.lat, lon: state.fix.lon, accuracyM: state.fix.accuracyM });
  $('fence-undo').disabled = false;
  $('fence-clear').disabled = false;
  logEvent('Corner marked', `±${state.fix.accuracyM.toFixed(0)} m fix at ${state.fix.lat.toFixed(5)}, ${state.fix.lon.toFixed(5)}.`, 'primary');
  renderFence();
});
$('fence-undo').addEventListener('click', () => {
  state.boundary.pop();
  renderFence();
});
$('fence-clear').addEventListener('click', () => {
  state.boundary = [];
  $('fence-undo').disabled = true;
  $('fence-clear').disabled = true;
  renderFence();
});

$('sat-fetch').addEventListener('click', fetchScene);
$('sat-here').addEventListener('click', () => {
  if (!state.fix) startPositioning();
  renderLooks();
});

$('vault-keep').addEventListener('click', async () => {
  $('vault-keep').disabled = true;
  logEvent('Keeping clip', 'Waiting out the post-roll so the clip contains what happened next.', 'primary');
  const clip = await state.vault.keep('Kept manually from the console.');
  $('vault-keep').disabled = false;
  if (clip) logEvent('Clip kept', `${clip.seconds.toFixed(0)} s, hashed.`, 'confirm');
  renderVault();
});

$('link-connect').addEventListener('click', connectLink);
$('link-disconnect').addEventListener('click', () => {
  state.link?.disconnect?.();
  setBadge('links-prov', 'BLOCKED', 'None');
  $('link-count').textContent = '0';
  $('link-disconnect').disabled = true;
});

$('deter-light').addEventListener('click', floodLight);
$('deter-siren').addEventListener('click', siren);
$('blackout').addEventListener('click', blackout);

setInterval(() => {
  $('clock').textContent = new Date().toLocaleTimeString();
  if (state.deck === 'vault') renderVault();
}, 1000);

restore();
buildRail();
buildViews();
buildSatellite();
buildLinks();
renderLedger();
renderEvents();
renderImpulses();
renderFence();
renderVault();
renderContacts({ settled: false, changedFraction: 0 });
$('site').textContent = state.boundary.length ? `${state.boundary.length} corners` : 'not set';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
