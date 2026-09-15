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
import { listCameras, openCamera, ROUTES, streamSettings } from './devices.js';
import { capability as bioCapability, HeartLink } from './biolink.js';
import {
  availableIndices, indexColour, indexMap, interpret, TIERS, worstZones,
} from './spectral.js';
import {
  capacity, coverage, createGrid, deadReckon, integrateScan, matchScan, occupancy,
} from './sonar.js';
import { aimError, chooseSubject, PanTilt } from './track.js';
import {
  autoGain, canReadTemperature, EMISSIVITY, ISOTHERM_MODES, luminanceField, manualGain,
  PALETTES, paletteFor, rampTable, readout as thermalReadout, render as renderThermal,
  SOURCES, spot,
} from './thermal.js';
import { ColourLock, LOCK_MODES, TemplateLock } from './lock.js';
import { blockProgress, daySummary, estimateFinish, pickRate, yieldRanking } from './harvest.js';
import { aboveHorizon, angularRate, angularSize, consistentWith, telemetryTrack } from './aerial.js';
import {
  analysable, diagnose, identifyModel, recommend, RELAYS, relayUrls, rtspUrl, snapshotUrl,
} from './argus.js';
import { Mariachi } from './mariachi.js';
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
  cameras: [],
  cameraId: null,
  lastFrame: null,
  spectral: null,
  panTilt: new PanTilt(),
  tracking: false,
  trackSubject: null,
  trackedAtMs: 0,
  heart: null,
  grid: null,
  rovPose: { x: 0, y: 0, headingDeg: 0, elapsedSec: 0, driftM: 0 },
  soundings: [],
  match: null,
  palette: 'ironbow',
  thermalRamp: null,
  thermalSource: 'LUMINANCE',
  gainMode: 'auto',
  isothermMode: 'off',
  fusion: 0,
  lockMode: 'motion',
  lock: null,
  lockResult: null,
  blocks: [
    { id: 'nw', name: 'Vineyard NW', hectares: 4.2, rows: 120, variety: 'Cabernet Sauvignon' },
    { id: 'se', name: 'Vineyard SE', hectares: 3.1, rows: 96, variety: 'Merlot' },
    { id: 'hill', name: 'Hill Block', hectares: 2.4, rows: 74, variety: 'Syrah' },
  ],
  picks: [],
  telemetry: [],
  argus: null,
  mariachi: new Mariachi({ volume: 0.45 }),
  musicWanted: false,
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
  ['spectral', 'Spectral', 'M4 20L12 4l8 16z M7 15h10'],
  ['subsurface', 'Sonar', 'M3 14c3 0 3-3 6-3s3 3 6 3 3-3 6-3 M3 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3 M12 4v5'],
  ['bio', 'Bio', 'M3 12h4l2-5 3 10 2-5h7'],
  ['harvest', 'Harvest', 'M5 20c4-8 10-12 14-14 M12 20c0-5 2-9 5-12 M5 20h14'],
  ['aerial', 'Aerial', 'M12 4l8 14H4z M12 10v8'],
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
    state.stream = await openCamera(state.cameraId, { facing: state.facing });
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
  // Labels only exist after permission has been granted once, so the picker is
  // worth rebuilding here rather than on load.
  await refreshCameras();
buildPalettes();
buildLockModes();
renderHarvest();
renderAerial();
buildArgus();
syncMusic();
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
  state.lastFrame = frame;
  stepTracking(frame);

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
  if (state.view === 'thermal') drawThermal(frame, out);
  else renderView(state.view, { frame, mask: result.mask, energy: result.energy, trail: state.trail }, out);
  ctx.putImageData(out, 0, 0);

  stepLock(frame);

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
  const views = [...VIEWS, { id: 'thermal', label: 'Thermal', hint: 'A thermal palette over the field. What the field contains is stated on the thermal panel.' }];
  $('views').replaceChildren(...views.map((view) => {
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
    // The watch is listening on this device. Anything the console is playing
    // through the speaker would land straight back in the microphone.
    syncMusic();
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
  syncMusic();
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#000;z-index:998;display:flex;align-items:center;justify-content:center;color:#1b2733;font:11px ui-monospace,monospace;letter-spacing:.2em';
  veil.textContent = 'BLACKOUT — TAP TO RESTORE';
  veil.addEventListener('click', () => {
    veil.remove();
    state.blackout = false;
    setArmed(state.stream ? 'armed' : 'standby');
    syncMusic();
  });
  document.body.append(veil);
  logEvent('Blackout', 'All console emissions stopped. Sensors still recording.', 'muted');
}

/* --------------------------------------------------------------- cameras */

/** @returns {Promise<void>} Rebuild the camera picker from the device list. */
async function refreshCameras() {
  state.cameras = await listCameras();
  const picker = $('camera-pick');
  picker.replaceChildren(...state.cameras.map((camera) => {
    const option = document.createElement('option');
    option.value = camera.deviceId;
    option.textContent = camera.family ? `${camera.label} · ${camera.family.name}` : camera.label;
    option.selected = camera.deviceId === state.cameraId;
    return option;
  }));
  setBadge('picker-prov', state.cameras.length ? 'LIVE' : 'BLOCKED',
    state.cameras.length ? `${state.cameras.length} found` : 'None');

  const picked = state.cameras.find((camera) => camera.deviceId === picker.value);
  $('camera-note').className = 'note';
  $('camera-note').textContent = picked?.family
    ? `${picked.family.route} — ${picked.family.note}`
    : 'Grant camera access once and the browser will reveal the device names.';

  const settings = streamSettings(state.stream);
  $('camera-readouts').replaceChildren(
    readout('Delivering', settings ? `${settings.width}×${settings.height}` : '—', {
      tone: settings ? 'confirm' : 'muted',
      note: 'What the camera actually handed over, which may not be what was asked for.',
    }),
    readout('Frame rate', settings?.frameRate ? `${settings.frameRate} fps` : '—'),
    readout('Processing at', `${WORK_WIDTH} px wide`, { note: 'The detection chain runs on a reduced frame so a phone can sustain it.' }),
  );
}

/** @returns {void} List the routes that are not a plugged-in device. */
function renderRoutes() {
  $('routes').replaceChildren(...ROUTES.map((route) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = route.state === 'BLOCKED' ? 'alert' : 'primary';
    const head = document.createElement('div');
    head.className = 'row-head';
    const name = document.createElement('b');
    name.textContent = route.name;
    head.append(name, badge(route.state));
    const body = document.createElement('p');
    body.textContent = `${route.route} — ${route.note}`;
    li.append(head, body);
    return li;
  }));
}

/* --------------------------------------------------------------- tracking */

/**
 * One step of the pan-tilt loop.
 *
 * @param {ImageData} frame The current frame, for its dimensions.
 * @returns {void}
 */
function stepTracking(frame) {
  if (!state.tracking) return;
  const now = performance.now();
  const dtSec = state.trackedAtMs ? (now - state.trackedAtMs) / 1000 : 0;
  state.trackedAtMs = now;

  const subject = chooseSubject(state.contacts, state.trackSubject);
  state.trackSubject = subject ? subject.id : null;
  const error = subject ? aimError(subject.box, { width: frame.width, height: frame.height }) : null;
  const command = state.panTilt.step(error, dtSec);

  // A head on the sensor bridge is driven by the same rates shown on screen.
  if (state.link && state.linkState === 'live') {
    state.link.socket?.send?.(JSON.stringify({ kind: 'pan-tilt', pan: command.pan, tilt: command.tilt }));
  }
  renderTracking(command, subject);
}

/**
 * Draw the tracking readouts.
 *
 * @param {object} command The latest command.
 * @param {object|null} subject The contact being followed.
 * @returns {void}
 */
function renderTracking(command, subject) {
  setBadge('track-prov', state.tracking ? (command.moving ? 'LIVE' : 'MODEL') : 'BLOCKED',
    state.tracking ? (command.moving ? 'Slewing' : 'Holding') : 'Idle');
  $('track-readouts').replaceChildren(
    readout('Subject', subject ? `${String(subject.classification?.value ?? 'contact').toUpperCase()} ${String(subject.id).padStart(2, '0')}` : 'none', {
      tone: subject ? 'confirm' : 'muted',
    }),
    readout('Pan', `${command.pan.toFixed(1)}°/s`, { tone: Math.abs(command.pan) > 1 ? 'caution' : 'muted' }),
    readout('Tilt', `${command.tilt.toFixed(1)}°/s`, { tone: Math.abs(command.tilt) > 1 ? 'caution' : 'muted' }),
    readout('Loop', command.moving ? 'correcting' : 'settled', { note: command.reason }),
  );
}

/* --------------------------------------------------------------- spectral */

/** @returns {void} Populate the spectral deck's fixed content. */
function buildSpectral() {
  $('spectral-truth').textContent =
    'An ordinary camera gives three bands, so it supports the visible indices — enough to find where '
    + 'a block differs from itself. Near-infrared unlocks NDVI, red edge unlocks NDRE, and neither '
    + 'lives in a phone. No camera at any price measures a nutrient: it measures reflected light, and '
    + 'turning that into a deficiency needs tissue tests from the vines the map sent you to.';

  const table = $('spectral-tiers');
  table.innerHTML = '<tr><th>Instrument</th><th>Bands</th><th>Cost</th></tr>';
  for (const tier of TIERS) {
    const row = document.createElement('tr');
    row.innerHTML = '<td></td><td></td><td></td>';
    row.children[0].textContent = tier.tier;
    row.children[1].textContent = tier.bands.join(', ');
    row.children[2].textContent = tier.cost;
    row.title = tier.note;
    table.append(row);
  }
  refreshIndexOptions(['red', 'green', 'blue']);
}

/**
 * Offer only the indices the available bands can support.
 *
 * @param {string[]} bands Band names available.
 * @returns {void}
 */
function refreshIndexOptions(bands) {
  const usable = availableIndices(bands);
  $('spectral-index').replaceChildren(...usable.map((index) => {
    const option = document.createElement('option');
    option.value = index.id;
    option.textContent = `${index.id.toUpperCase()} — ${index.name}`;
    return option;
  }));
  setBadge('spectral-prov', 'LIVE', `${bands.length} bands`);
}

/**
 * Compute an index over an RGBA image and render the result.
 *
 * @param {ImageData} image The source pixels.
 * @returns {void}
 */
function runSpectral(image) {
  const count = image.width * image.height;
  const red = new Uint8ClampedArray(count);
  const green = new Uint8ClampedArray(count);
  const blue = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i += 1) {
    red[i] = image.data[i * 4];
    green[i] = image.data[i * 4 + 1];
    blue[i] = image.data[i * 4 + 2];
  }

  const map = indexMap(
    { bands: { red, green, blue }, width: image.width, height: image.height },
    $('spectral-index').value,
    { canopyThreshold: Number($('spectral-mask').value) },
  );

  state.spectral = { map, width: image.width, height: image.height };

  const canvas = $('spectral-map');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(image.width, image.height);
  // Stretch to the frame's own 10th–90th percentile, which is what makes a real
  // block's variation visible. A frame with no spread at all would collapse to a
  // single colour, so that case falls back to the index's full range.
  const flat = Number.isNaN(map.stats.p10) || map.stats.p90 - map.stats.p10 < 1e-6;
  const bounds = flat ? map.index.range : [map.stats.p10, map.stats.p90];
  for (let i = 0; i < count; i += 1) {
    const [r, g, b] = indexColour(map.values[i], bounds);
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = g;
    out.data[i * 4 + 2] = b;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  drawIndexScale(ctx, canvas, bounds, map.index, flat);

  const covered = map.stats.count / count;
  $('spectral-readouts').replaceChildren(
    readout('Canopy pixels', `${(covered * 100).toFixed(0)}%`, {
      tone: covered > 0.15 ? 'confirm' : 'caution',
      note: covered > 0.15 ? 'Ground masked out before averaging.' : 'Very little canopy found — check the mask threshold.',
    }),
    readout('Median', Number.isNaN(map.stats.median) ? '—' : map.stats.median.toFixed(3)),
    readout('10th–90th', Number.isNaN(map.stats.p10) ? '—' : `${map.stats.p10.toFixed(3)} – ${map.stats.p90.toFixed(3)}`, {
      note: 'The spread is the signal. A uniform block is the variety; a spread with a low cluster is a thing on the ground.',
    }),
    readout('Spread', Number.isNaN(map.stats.sd) ? '—' : map.stats.sd.toFixed(3), { note: 'Standard deviation across canopy pixels.' }),
  );

  const reading = interpret(map.index, map.stats, false);
  setBadge('spectral-read-prov', 'MODEL', 'Uncalibrated');
  $('spectral-headline').className = 'note';
  $('spectral-headline').textContent = reading.headline;
  const asList = (host, items, tone) => {
    $(host).replaceChildren(...items.map((text) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.tone = tone;
      const body = document.createElement('p');
      body.textContent = text;
      li.append(body);
      return li;
    }));
  };
  asList('spectral-supports', reading.supports, 'confirm');
  asList('spectral-denies', reading.doesNotSupport, 'alert');
  $('spectral-next').textContent = reading.next;

  const zones = worstZones(map, image.width, image.height, 6).slice(0, 5);
  $('spectral-zones').replaceChildren(...(zones.length ? zones : []).map((zone) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = zone.rank <= 2 ? 'alert' : 'caution';
    li.innerHTML = '<div class="row-head"><b></b><time></time></div><p></p>';
    li.querySelector('b').textContent = `Cell ${zone.col + 1}/${zone.row + 1}`;
    li.querySelector('time').textContent = `rank ${zone.rank}`;
    li.querySelector('p').textContent = `Mean ${zone.mean.toFixed(3)} over ${zone.count} canopy pixels. Walk here and sample.`;
    return li;
  }));
  if (!zones.length) {
    $('spectral-zones').innerHTML = '<li class="empty">No canopy found to rank.</li>';
  }
  logEvent('Index computed', `${map.index.name} over ${map.stats.count} canopy pixels.`, 'primary');
}

/**
 * The colour scale under an index map.
 *
 * Without it a false-colour image is decoration: the reader cannot tell whether
 * red is the low end of a tight spread or a genuinely bad block.
 *
 * @param {CanvasRenderingContext2D} ctx The map's context.
 * @param {HTMLCanvasElement} canvas The map canvas.
 * @param {[number, number]} bounds Low and high ends of the colour ramp.
 * @param {object} index The index drawn.
 * @param {boolean} flat Whether the frame had no spread to stretch to.
 * @returns {void}
 */
function drawIndexScale(ctx, canvas, bounds, index, flat) {
  const height = Math.max(14, Math.round(canvas.height * 0.05));
  const y = canvas.height - height;
  for (let x = 0; x < canvas.width; x += 1) {
    const value = bounds[0] + ((bounds[1] - bounds[0]) * x) / canvas.width;
    const [r, g, b] = indexColour(value, bounds);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x, y, 1, height);
  }
  ctx.fillStyle = 'rgba(4, 6, 10, 0.72)';
  ctx.fillRect(0, y - 15, canvas.width, 15);
  ctx.font = `11px ${hud.HUD.mono}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#dff0f8';
  ctx.fillText(`${index.id.toUpperCase()}  ${bounds[0].toFixed(2)}`, 5, y - 13);
  const right = flat ? 'no spread — full index range' : 'stretched to this frame';
  ctx.fillText(right, canvas.width / 2 - 60, y - 13);
  const high = bounds[1].toFixed(2);
  ctx.fillText(high, canvas.width - ctx.measureText(high).width - 5, y - 13);
}

/* ------------------------------------------------------------- subsurface */

/** The made-up dam a rehearsal sweep maps, in metres. */
const REHEARSAL_DAM = [
  { x: -17, y: -12 }, { x: -6, y: -18 }, { x: 8, y: -16 }, { x: 17, y: -5 },
  { x: 15, y: 9 }, { x: 4, y: 17 }, { x: -9, y: 15 }, { x: -18, y: 3 },
];

/**
 * Whether a point is inside the rehearsal dam.
 *
 * @param {{x: number, y: number}} point The point.
 * @param {Array<{x: number, y: number}>} polygon The shape.
 * @returns {boolean} True if inside.
 */
function inShape(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const straddles = (polygon[i].y > point.y) !== (polygon[j].y > point.y);
    const crossing = ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y))
      / (polygon[j].y - polygon[i].y) + polygon[i].x;
    if (straddles && point.x < crossing) hit = !hit;
  }
  return hit;
}

/**
 * Synthetic beam returns from a position inside the rehearsal dam.
 *
 * @param {{x: number, y: number, headingDeg: number}} pose Where the vehicle is.
 * @param {number} beams How many beams in the scan.
 * @returns {Array<{bearingDeg: number, rangeM: number}>} Returns.
 */
function rehearsalScan(pose, beams = 24) {
  const out = [];
  for (let i = 0; i < beams; i += 1) {
    const bearingDeg = (360 / beams) * i;
    const angle = ((pose.headingDeg + bearingDeg) * Math.PI) / 180;
    let range = 0;
    while (range < 40) {
      range += 0.25;
      const probe = {
        x: pose.x + Math.sin(angle) * range,
        y: pose.y + Math.cos(angle) * range,
      };
      if (!inShape(probe, REHEARSAL_DAM)) break;
    }
    // Sonar ranges are noisy; a map built from perfect returns flatters itself.
    out.push({ bearingDeg, rangeM: Math.max(0.5, range + (Math.random() - 0.5) * 0.3) });
  }
  return out;
}

/** @returns {void} Run a synthetic survey across the rehearsal dam. */
function rehearseSweep() {
  state.grid = createGrid({ widthM: 44, heightM: 44, cellM: 0.4 });
  state.grid.origin = { x: -22, y: -22 };
  state.soundings = [];
  let pose = { x: -12, y: -8, headingDeg: 0, elapsedSec: 0, driftM: 0 };
  let confident = 0;
  let attempts = 0;

  // Four track lines, the way a survey is actually run.
  for (let line = 0; line < 4; line += 1) {
    const y = -9 + line * 6;
    for (let x = -12; x <= 12; x += 1.5) {
      const truth = { x, y, headingDeg: 90 };
      if (!inShape(truth, REHEARSAL_DAM)) continue;
      const returns = rehearsalScan(truth);

      // Dead reckoning walks off; scan matching pulls it back.
      pose = deadReckon({ ...pose, x: truth.x + pose.driftM * 0.25, y: truth.y }, {
        speedMps: 0.5, headingDeg: 90, dtSec: 3,
      });
      const matched = matchScan(state.grid, { ...pose, headingDeg: 90 }, returns, { radiusM: 1.6 });
      attempts += 1;
      if (matched.confident) confident += 1;
      pose = { ...matched.pose, elapsedSec: matched.confident ? 0 : pose.elapsedSec };

      integrateScan(state.grid, { ...pose, headingDeg: 90 }, returns, { beamDeg: 20 });
      state.soundings.push({ depthM: 2.4 + Math.abs(Math.sin(x / 5)) * 2.6 });
    }
  }

  state.rovPose = pose;
  // Judged on the run as a whole, and reported as the raw count: the first scans
  // of any survey cannot match, because there is no map yet to match against.
  state.match = { confident, attempts };
  logEvent('Rehearsal sweep', `Synthetic survey: ${state.soundings.length} soundings, ${confident} of ${attempts} scans matched.`, 'caution');
  renderSonar();
}

/**
 * How much to trust a run of scan matches.
 *
 * @param {{confident: number, attempts: number}|null} match The run's tally.
 * @returns {string} A palette tone.
 */
function matchTone(match) {
  if (!match || !match.attempts) return 'muted';
  const ratio = match.confident / match.attempts;
  if (ratio > 0.6) return 'confirm';
  if (ratio > 0.4) return 'caution';
  return 'alert';
}

/** @returns {void} Draw the occupancy map and the survey readouts. */
function renderSonar() {
  const canvas = $('sonar-map');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!state.grid) {
    ctx.fillStyle = '#566b7e';
    ctx.font = `12px ${hud.HUD.mono}`;
    ctx.fillText('No sonar attached and no rehearsal run.', 18, 28);
    setBadge('sonar-prov', 'BLOCKED', 'No sonar');
    $('sonar-readouts').replaceChildren(
      readout('Coverage', '—', { note: 'Attach a sonar bridge, or run a rehearsal to see the mapping work.' }),
    );
    $('sonar-capacity').replaceChildren();
    return;
  }

  const grid = state.grid;
  const scale = Math.min(canvas.width / grid.cols, canvas.height / grid.rows);
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const p = occupancy(grid, col, row);
      if (p === 0.5) continue;
      // Water reads cool and dark; returns read bright. Unknown stays ground.
      const value = Math.round(Math.abs(p - 0.5) * 2 * 255);
      ctx.fillStyle = p > 0.5
        ? `rgb(${Math.round(80 + value * 0.68)}, ${Math.round(60 + value * 0.3)}, 60)`
        : `rgb(10, ${Math.round(28 + value * 0.28)}, ${Math.round(48 + value * 0.5)})`;
      ctx.fillRect(col * scale, (grid.rows - row - 1) * scale, Math.ceil(scale), Math.ceil(scale));
    }
  }

  const toCanvas = (point) => ({
    x: ((point.x - grid.origin.x) / grid.cellM) * scale,
    y: canvas.height - ((point.y - grid.origin.y) / grid.cellM) * scale,
  });
  const vehicle = toCanvas(state.rovPose);
  ctx.strokeStyle = 'rgba(255, 178, 61, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(vehicle.x, vehicle.y, Math.max(4, (state.rovPose.driftM / grid.cellM) * scale), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffb23d';
  ctx.beginPath();
  ctx.arc(vehicle.x, vehicle.y, 4, 0, Math.PI * 2);
  ctx.fill();

  const cover = coverage(grid);
  setBadge('sonar-prov', 'MODEL', 'Rehearsal');
  setBadge('sonar-survey-prov', 'MODEL', 'Synthetic');
  $('sonar-readouts').replaceChildren(
    readout('Mapped', `${(cover.fraction * 100).toFixed(0)}%`, { tone: 'caution', note: 'Cells with any evidence in them.' }),
    readout('Returns', String(cover.occupied), { note: 'Cells the sonar believes are bottom or obstacle.' }),
    readout('Drift', `${state.rovPose.driftM.toFixed(1)} m`, {
      tone: state.rovPose.driftM > 3 ? 'alert' : 'confirm',
      note: 'Position error since the last confident scan match.',
    }),
    readout('Scan match', state.match ? `${state.match.confident}/${state.match.attempts}` : '—', {
      tone: matchTone(state.match),
      note: state.match && state.match.confident / Math.max(1, state.match.attempts) > 0.4
        ? 'Enough structure in the map to pull the position back. The early scans cannot match — there is nothing built yet to match against.'
        : 'Few scans found enough structure to correct against, so most of this track is dead reckoning and will have wandered.',
    }),
  );

  const water = capacity(state.soundings, Number($('sonar-area').value) || 0);
  $('sonar-capacity').replaceChildren(
    readout('Soundings', String(water.count)),
    readout('Mean depth', water.count ? `${water.meanDepthM.toFixed(2)} m` : '—'),
    readout('Max depth', water.count ? `${water.maxDepthM.toFixed(2)} m` : '—'),
    readout('Stored', water.count ? `${water.megalitres.toFixed(1)} ML` : '—', {
      tone: 'caution',
      note: water.note,
    }),
  );
}

/* -------------------------------------------------------------------- bio */

/** @returns {void} Populate the bio deck. */
function buildBio() {
  const capable = bioCapability();
  $('bio-truth').textContent = `${capable.headline} ${capable.detail}`;
  setBadge('bio-prov', capable.available ? 'MODEL' : 'BLOCKED', capable.available ? 'Ready' : 'No Bluetooth');
  $('bio-pair').disabled = !capable.available;

  const fill = (host, items, tone) => {
    $(host).replaceChildren(...items.map((text) => {
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.tone = tone;
      const body = document.createElement('p');
      body.textContent = text;
      li.append(body);
      return li;
    }));
  };
  fill('bio-works', capable.works, 'confirm');
  fill('bio-blocked', capable.doesNot, 'alert');
  renderBio(null);
}

/**
 * Draw the heart readouts.
 *
 * @param {object|null} reading The latest measurement.
 * @returns {void}
 */
function renderBio(reading) {
  $('bio-readouts').replaceChildren(
    readout('Heart rate', reading ? `${reading.bpm} bpm` : '—', {
      tone: reading ? 'confirm' : 'muted',
      note: reading ? `From ${reading.device}.` : 'Pair a sensor to read a pulse.',
    }),
    readout('Variability', reading?.rmssdMs ? `${reading.rmssdMs.toFixed(0)} ms` : '—', {
      note: 'RMSSD over the last sixty beats. A millisecond figure, not a stress score.',
    }),
    readout('Contact', reading?.contact === null || reading?.contact === undefined
      ? 'not reported'
      : (reading.contact ? 'good' : 'poor'), {
      tone: reading?.contact === false ? 'alert' : 'muted',
      note: 'Whether the sensor believes it is against skin.',
    }),
    readout('Beats held', reading ? String(reading.beats ?? 0) : '—'),
  );
}

/** @returns {Promise<void>} Pair a Bluetooth heart rate sensor. */
async function pairHeart() {
  state.heart = new HeartLink({
    onReading: (reading) => renderBio(reading),
    onState: (linkState, detail) => {
      setBadge('bio-prov', linkState === 'live' ? 'LINK' : 'BLOCKED', linkState);
      $('bio-drop').disabled = linkState !== 'live';
      if (linkState === 'live') logEvent('Wearable paired', detail, 'confirm');
    },
  });
  await state.heart.connect();
}

/* ---------------------------------------------------------------- thermal */

/**
 * Render the current frame through a thermal palette.
 *
 * The field comes from luminance unless a radiometric camera is linked, and that
 * distinction is carried into every readout below rather than being forgotten
 * the moment the picture starts looking like thermal imaging.
 *
 * @param {ImageData} frame The captured frame.
 * @param {ImageData} out Destination.
 * @returns {void}
 */
function drawThermal(frame, out) {
  const field = luminanceField(frame);
  state.thermalSource = field.source;
  if (!state.thermalRamp) state.thermalRamp = rampTable(paletteFor(state.palette));

  const gain = state.gainMode === 'manual'
    ? manualGain(Number($('thermal-level').value) || 0.5, Number($('thermal-span').value) || 1)
    : autoGain(field.field);

  const isotherm = state.isothermMode === 'off' ? null : {
    mode: state.isothermMode,
    low: Number($('thermal-iso-low').value),
    high: Number($('thermal-iso-high').value),
    colour: [255, 59, 78],
  };

  renderThermal(field, out, {
    ramp: state.thermalRamp,
    gain,
    isotherm,
    fusion: state.fusion > 0 ? frame : null,
    fusionStrength: state.fusion,
  });

  state.thermalField = field;
  state.thermalGain = gain;
}

/** @returns {void} Build the palette swatches. */
function buildPalettes() {
  $('thermal-truth').textContent = SOURCES[state.thermalSource].meaning;
  $('palettes').replaceChildren(...PALETTES.map((palette) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = palette.use;
    button.setAttribute('aria-pressed', String(palette.id === state.palette));

    // The swatch is the palette itself, built from the same ramp the renderer uses.
    const ramp = rampTable(palette);
    const stops = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = Math.round((i / 8) * 255);
      stops.push(`rgb(${ramp[t * 3]}, ${ramp[t * 3 + 1]}, ${ramp[t * 3 + 2]}) ${(i / 8) * 100}%`);
    }
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = palette.name;

    button.append(swatch, name);
    button.addEventListener('click', () => {
      state.palette = palette.id;
      state.thermalRamp = rampTable(palette);
      state.view = 'thermal';
      buildPalettes();
      buildViews();
    });
    return button;
  }));

  $('thermal-iso').replaceChildren(...ISOTHERM_MODES.map((mode) => {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.name;
    option.title = mode.note;
    option.selected = mode.id === state.isothermMode;
    return option;
  }));

  const source = SOURCES[state.thermalSource];
  setBadge('thermal-prov', source.provenance, source.temperature ? 'Radiometric' : 'Brightness');
  $('thermal-emissivity').textContent = canReadTemperature(state.thermalSource)
    ? `Emissivity matters here: ${EMISSIVITY.map((e) => `${e.name} ${e.value}`).join(', ')}. A shiny surface emits less and reflects its surroundings, so bare metal reads far colder than it is.`
    : 'Emissivity correction is withheld: there is no temperature in this field to correct. It becomes available when a radiometric camera is linked.';
  renderThermalReadouts();
}

/** @returns {void} Draw the spot and scale readouts. */
function renderThermalReadouts() {
  const field = state.thermalField;
  const gain = state.thermalGain;
  const centre = field
    ? spot(field.field, field.width, Math.round(field.width / 2), Math.round(field.height / 2), 2)
    : null;
  const reading = thermalReadout(state.thermalSource, centre);

  $('thermal-readouts').replaceChildren(
    readout('Spot (centre)', reading.text, {
      tone: reading.temperature ? 'confirm' : 'caution',
      note: reading.temperature ? 'Calibrated temperature.' : 'Not a temperature — this is where the centre sits on the brightness scale.',
    }),
    readout('Scale low', gain ? gain.low.toFixed(2) : '—'),
    readout('Scale high', gain ? (gain.low + gain.span).toFixed(2) : '—', {
      note: state.gainMode === 'auto' ? 'Auto gain, from the 2nd and 98th percentiles of this frame.' : 'Fixed by hand, so two frames are comparable.',
    }),
    readout('Palette', paletteFor(state.palette).name, { tone: 'primary', note: paletteFor(state.palette).use }),
  );
}

/* ------------------------------------------------------------------- lock */

/** @returns {void} Build the tracker selector. */
function buildLockModes() {
  $('lock-mode').replaceChildren(...LOCK_MODES.map((mode) => {
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.name;
    option.title = mode.note;
    option.selected = mode.id === state.lockMode;
    return option;
  }));
  $('lock-note').textContent = LOCK_MODES.find((mode) => mode.id === state.lockMode).note;
  renderLock();
}

/**
 * Advance whichever appearance tracker is locked on.
 *
 * @param {ImageData} frame The current frame.
 * @returns {void}
 */
function stepLock(frame) {
  if (!state.lock) return;
  state.lockResult = state.lock.track(frame);
  if (state.lockResult.lost && !state.lockLoggedLost) {
    state.lockLoggedLost = true;
    logEvent('Lock lost', state.lockResult.reason, 'caution');
  }
  renderLock();
}

/** @returns {void} Draw the lock readouts. */
function renderLock() {
  const result = state.lockResult;
  const active = Boolean(state.lock);
  setBadge('lock-prov', !active ? 'MODEL' : (result && !result.lost ? 'LIVE' : 'BLOCKED'),
    !active ? LOCK_MODES.find((mode) => mode.id === state.lockMode).name : (result && !result.lost ? 'Holding' : 'Lost'));

  $('lock-readouts').replaceChildren(
    readout('Tracker', LOCK_MODES.find((mode) => mode.id === state.lockMode).name, { tone: 'primary' }),
    readout('State', !active ? 'not locked' : (result?.lost ? 'lost' : 'holding'), {
      tone: !active ? 'muted' : (result?.lost ? 'alert' : 'confirm'),
      note: result?.reason ?? 'Lock onto a contact to follow one specific thing, moving or not.',
    }),
    readout('Confidence', result ? result.confidence.toFixed(2) : '—', {
      tone: result && result.confidence > 0.4 ? 'confirm' : 'caution',
      note: state.lockMode === 'colour' ? 'Back-projection density inside the window.' : 'Normalised cross-correlation with the template.',
    }),
    readout('Position', result?.box ? `${Math.round(result.box.x)}, ${Math.round(result.box.y)}` : '—', { note: 'In processing-frame pixels.' }),
  );
}

/** @returns {void} Lock the appearance tracker onto the largest contact. */
function lockOnLargest() {
  if (!state.lastFrame || !state.contacts.length) {
    logEvent('Nothing to lock', 'No contacts in frame. The motion tracker has to see something before it can be followed.', 'caution');
    return;
  }
  const subject = chooseSubject(state.contacts, null);
  const box = {
    x: subject.box.x ?? 0,
    y: subject.box.y ?? 0,
    w: subject.box.width ?? subject.box.w ?? 20,
    h: subject.box.height ?? subject.box.h ?? 20,
  };

  state.lock = state.lockMode === 'colour' ? new ColourLock() : new TemplateLock();
  const outcome = state.lock.lockOn(state.lastFrame, box);
  state.lockLoggedLost = false;

  if (!outcome.locked) {
    state.lock = null;
    state.lockResult = null;
    logEvent('Lock refused', outcome.reason, 'caution');
  } else {
    state.lockResult = { box, confidence: 1, lost: false, reason: outcome.reason };
    $('lock-drop').disabled = false;
    logEvent('Locked on', `${LOCK_MODES.find((mode) => mode.id === state.lockMode).name} tracker holding contact ${subject.id}.`, 'confirm');
  }
  renderLock();
}

/* ---------------------------------------------------------------- harvest */

/** @returns {void} Rebuild the harvest deck. */
function renderHarvest() {
  $('harvest-block').replaceChildren(...state.blocks.map((block) => {
    const option = document.createElement('option');
    option.value = block.id;
    option.textContent = `${block.name} · ${block.hectares} ha · ${block.rows} rows`;
    return option;
  }));

  const day = daySummary(state.blocks, state.picks);
  setBadge('harvest-prov', state.picks.length ? 'LIVE' : 'MODEL', state.picks.length ? `${state.picks.length} loads` : 'Nothing logged');
  $('harvest-day').replaceChildren(
    readout('Picked today', `${(day.kg / 1000).toFixed(2)} t`, { tone: day.kg ? 'confirm' : 'muted', note: day.note }),
    readout('Blocks started', String(day.blocksStarted)),
    readout('Blocks finished', String(day.blocksComplete), { tone: day.blocksComplete ? 'confirm' : 'muted' }),
  );

  const rate = day.rate;
  $('harvest-rate').replaceChildren(
    readout('Rate', rate.kgPerHour ? `${rate.kgPerHour.toFixed(0)} kg/h` : '—', {
      tone: rate.settled ? 'confirm' : 'caution',
      note: rate.note,
    }),
    readout('Spread', rate.spreadKgPerHour ? `±${rate.spreadKgPerHour.toFixed(0)} kg/h` : '—', {
      note: 'Across the gaps between loads. A wide spread means stops and sprints, not a steady rate.',
    }),
    readout('Rows', rate.rowsPerHour ? `${rate.rowsPerHour.toFixed(0)}/h` : '—'),
    readout('Measured over', `${rate.spanMinutes.toFixed(0)} min`, {
      tone: rate.settled ? 'confirm' : 'caution',
    }),
  );

  const current = state.blocks.find((block) => block.id === $('harvest-block').value) ?? state.blocks[0];
  const finish = estimateFinish(current, state.picks);
  $('harvest-eta').className = 'note';
  $('harvest-eta').textContent = finish.hoursMin === null
    ? `${current.name}: ${finish.note}`
    : `${current.name}: ${finish.hoursMin.toFixed(1)} to ${finish.hoursMax.toFixed(1)} hours left — finishing between `
      + `${new Date(finish.finishMinMs).toLocaleTimeString()} and ${new Date(finish.finishMaxMs).toLocaleTimeString()}. ${finish.note}`;

  $('harvest-blocks').replaceChildren(...state.blocks.map((block) => {
    const progress = blockProgress(block, state.picks);
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = progress.complete ? 'confirm' : progress.kg ? 'caution' : 'primary';
    const head = document.createElement('div');
    head.className = 'row-head';
    const name = document.createElement('b');
    name.textContent = block.name;
    const time = document.createElement('time');
    time.textContent = `${(progress.fraction * 100).toFixed(0)}%`;
    head.append(name, time);
    const body = document.createElement('p');
    body.textContent = `${progress.rows}/${block.rows} rows · ${(progress.kg / 1000).toFixed(2)} t · ${block.variety}`;
    const meter = document.createElement('div');
    meter.className = 'meter';
    const fill = document.createElement('i');
    fill.style.width = `${(progress.fraction * 100).toFixed(1)}%`;
    if (progress.complete) fill.dataset.tone = 'caution';
    meter.append(fill);
    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = progress.note;
    li.append(head, body, meter, why);
    return li;
  }));

  const ranked = yieldRanking(state.blocks, state.picks);
  $('harvest-yield').replaceChildren(...(ranked.length ? ranked : []).map((row, i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = row.extrapolated ? 'caution' : 'confirm';
    const head = document.createElement('div');
    head.className = 'row-head';
    const name = document.createElement('b');
    name.textContent = `${i + 1}. ${row.block.name}`;
    head.append(name, badge(row.extrapolated ? 'MODEL' : 'LIVE', row.extrapolated ? 'Extrapolated' : 'Measured'));
    const body = document.createElement('p');
    body.textContent = `${row.kgPerHa.toFixed(0)} kg/ha`;
    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = row.note;
    li.append(head, body, why);
    return li;
  }));
  if (!ranked.length) {
    $('harvest-yield').innerHTML = '<li class="empty">No block is far enough through to give a yield. A quarter picked is the floor — below that, fruit is not spread evenly enough to extrapolate from.</li>';
  }
}

/* ----------------------------------------------------------------- aerial */

/** @returns {void} Rebuild the aerial deck. */
function renderAerial() {
  const result = aboveHorizon(state.contacts, state.pose, work.height || 240);
  setBadge('aerial-prov', result.resolved ? (result.aerial.length ? 'LIVE' : 'MODEL') : 'BLOCKED',
    result.resolved ? `${result.aerial.length} airborne` : 'No horizon');
  $('aerial-note').textContent = result.note;

  const fov = Number($('cal-fov').value) || 70;
  $('aerial-readouts').replaceChildren(
    readout('Airborne', String(result.aerial.length), { tone: result.aerial.length ? 'alert' : 'muted' }),
    readout('Field of view', `${fov}°`, { note: 'Angular measurements are only as good as this number.' }),
    readout('Range', 'unavailable', {
      tone: 'alert',
      note: 'One camera measures angles, never distance. Everything below is an angle.',
    }),
  );

  const reading = consistentWith({ angularSizeDeg: 0.5, angularRateDeg: null });
  $('aerial-settle').replaceChildren(...reading.wouldSettleIt.map((text) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'primary';
    const body = document.createElement('p');
    body.textContent = text;
    li.append(body);
    return li;
  }));

  const host = $('aerial-contacts');
  if (!result.aerial.length) {
    host.innerHTML = `<li class="empty">${result.resolved
      ? 'Nothing above the horizon.'
      : 'Calibrate the view on the optics deck and the horizon line appears, which is what makes "airborne" meaningful.'}</li>`;
  } else {
    host.replaceChildren(...result.aerial.map((contact) => {
      const sizeDeg = angularSize(contact.box, work.width || 320, fov);
      const rateDeg = angularRate(contact.trailPx, work.width || 320, fov);
      const verdict = consistentWith({ angularSizeDeg: sizeDeg, angularRateDeg: rateDeg });
      const li = document.createElement('li');
      li.className = 'row';
      li.dataset.tone = 'caution';
      const head = document.createElement('div');
      head.className = 'row-head';
      const name = document.createElement('b');
      name.textContent = `AIRBORNE ${String(contact.id).padStart(2, '0')}`;
      const time = document.createElement('time');
      time.textContent = `${sizeDeg.toFixed(2)}° across`;
      head.append(name, time);
      const body = document.createElement('p');
      body.textContent = `Consistent with: ${verdict.consistentWith.join('; ')}.`;
      const why = document.createElement('div');
      why.className = 'why';
      why.textContent = verdict.caveat;
      li.append(head, body, why);
      return li;
    }));
  }

  const track = telemetryTrack(state.telemetry);
  setBadge('aerial-telemetry-prov', track.current ? 'LINK' : 'BLOCKED', track.current ? 'Tracking' : 'No telemetry');
  $('aerial-telemetry').replaceChildren(
    readout('Altitude', track.current?.altitudeM !== undefined ? `${track.current.altitudeM.toFixed(0)} m` : '—'),
    readout('Ground speed', track.groundSpeedMps !== null ? `${track.groundSpeedMps.toFixed(1)} m/s` : '—'),
    readout('Climb', track.climbRateMps !== null ? `${track.climbRateMps.toFixed(1)} m/s` : '—'),
    readout('Frames', String(track.samples), { note: track.note }),
  );
}

/* ----------------------------------------------------------------- argus */

/** @returns {void} Populate the Argus panel's fixed content. */
function buildArgus() {
  $('argus-relay').replaceChildren(...RELAYS.map((relay) => {
    const option = document.createElement('option');
    option.value = relay.id;
    option.textContent = relay.name;
    option.title = relay.note;
    return option;
  }));
  $('argus-truth').textContent =
    'Two walls stand between an Argus and this console. The battery models serve no RTSP, ONVIF or '
    + 'RTMP at all — holding a stream open would flatten the battery, so they sleep and talk only to '
    + 'Reolink\'s app. And a snapshot that loads fine in the browser still cannot be measured: drawing '
    + 'a cross-origin image taints the canvas, and every deck here reads pixels back off one. A small '
    + 'relay on the ranch network removes both walls at once.';
  renderArgus();
}

/** @returns {void} Redraw the Argus readouts from the current fields. */
function renderArgus() {
  const model = $('argus-model').value;
  const host = $('argus-host').value.trim();
  const family = identifyModel(model);
  const advice = recommend(family);

  setBadge('argus-prov', family ? (family.battery ? 'MODEL' : 'LINK') : 'MODEL',
    family ? (family.battery ? 'Battery' : 'Wired') : 'Unknown model');

  const relay = RELAYS.find((entry) => entry.id === $('argus-relay').value) ?? RELAYS[0];
  const urls = relayUrls(relay.id, $('argus-relay-base').value.trim(), $('argus-relay-name').value.trim());
  $('argus-relay-note').className = 'note';
  $('argus-relay-note').textContent = urls
    ? `${relay.note} Stream URL: ${urls.hls}`
    : relay.note;

  $('argus-readouts').replaceChildren(
    readout('Model', family ? family.name : 'unrecognised', {
      tone: family ? (family.battery ? 'caution' : 'confirm') : 'muted',
      note: family ? family.note : 'Not a model this console knows. Testing the snapshot address is the quickest way to find out what it serves.',
    }),
    readout('Serves', family ? family.serves.join(', ') : '—', {
      tone: family?.serves.includes('rtsp') ? 'confirm' : 'caution',
    }),
    readout('RTSP', host && family?.serves.includes('rtsp')
      ? rtspUrl({ host, user: $('argus-user').value, password: $('argus-pass').value, stream: $('argus-stream').value })
      : 'not served', {
      tone: family?.serves.includes('rtsp') ? 'primary' : 'muted',
      note: family?.serves.includes('rtsp') ? 'Point the relay at this. Browsers cannot play RTSP directly.' : 'Battery models open no RTSP port at all.',
    }),
    readout('Route', advice.route, { tone: 'primary', note: advice.headline }),
  );

  $('argus-steps').replaceChildren(...advice.steps.map((step, i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = 'primary';
    li.innerHTML = '<div class="row-head"><b></b></div><p></p>';
    li.querySelector('b').textContent = `Step ${i + 1}`;
    li.querySelector('p').textContent = step;
    return li;
  }));
}

/**
 * Try to load a URL as an image, timing the attempt.
 *
 * An image load is the one probe a browser allows across origins, so it answers
 * "is the camera there" where a fetch cannot.
 *
 * @param {string} url The URL.
 * @param {number} [timeoutMs=4000] How long to wait.
 * @returns {Promise<{loaded: boolean, elapsedMs: number}>} What happened.
 */
function probeImage(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const started = performance.now();
    const image = new Image();
    const finish = (loaded) => {
      image.onload = null;
      image.onerror = null;
      resolve({ loaded, elapsedMs: performance.now() - started });
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    setTimeout(() => finish(false), timeoutMs);
    image.src = url;
  });
}

/**
 * Try to read a URL, which is what the detection chain actually needs.
 *
 * @param {string} url The URL.
 * @returns {Promise<{succeeded: boolean, status: number}>} What happened.
 */
async function probeFetch(url) {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
    return { succeeded: response.ok, status: response.status };
  } catch {
    return { succeeded: false, status: 0 };
  }
}

/** @returns {Promise<void>} Run the connection test and report precisely. */
async function testArgus() {
  const host = $('argus-host').value.trim();
  if (!host) {
    $('argus-relay-note').className = 'note bad';
    $('argus-relay-note').textContent = 'Enter the camera address first — the Reolink app shows it under device settings.';
    return;
  }

  $('argus-test').disabled = true;
  setBadge('argus-prov', 'MODEL', 'Testing');

  const url = snapshotUrl({ host, user: $('argus-user').value, password: $('argus-pass').value });
  const [image, read] = await Promise.all([probeImage(url), probeFetch(url)]);
  const verdict = diagnose({
    imageLoaded: image.loaded,
    fetchSucceeded: read.succeeded,
    status: read.status,
    elapsedMs: image.elapsedMs,
    timeoutMs: 4000,
    pageScheme: window.location.protocol,
    targetScheme: 'http:',
  });

  const reach = analysable({
    kind: 'snapshot',
    url,
    pageOrigin: window.location.origin,
    cors: read.succeeded,
  });

  setBadge('argus-prov', read.succeeded ? 'LINK' : 'BLOCKED', verdict.outcome.headline.replace('.', ''));
  $('argus-add').disabled = !image.loaded;

  $('argus-readouts').replaceChildren(
    readout('Result', verdict.outcome.headline, {
      tone: read.succeeded ? 'confirm' : image.loaded ? 'caution' : 'alert',
      note: verdict.outcome.detail,
    }),
    readout('Picture', image.loaded ? 'yes' : 'no', {
      tone: image.loaded ? 'confirm' : 'alert',
      note: `Image probe took ${image.elapsedMs.toFixed(0)} ms.`,
    }),
    readout('Measurable', reach.analysable ? 'yes' : 'no', {
      tone: reach.analysable ? 'confirm' : 'alert',
      note: reach.reason,
    }),
    readout('HTTP', read.status || '—', { note: read.status ? 'Status returned by the camera.' : 'No readable response reached this page.' }),
  );

  $('argus-steps').replaceChildren(...verdict.next.map((step, i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.tone = read.succeeded ? 'confirm' : 'caution';
    li.innerHTML = '<div class="row-head"><b></b></div><p></p>';
    li.querySelector('b').textContent = `Next ${i + 1}`;
    li.querySelector('p').textContent = step;
    return li;
  }));

  logEvent('Argus tested', `${verdict.outcome.headline} ${reach.analysable ? 'Frames are measurable.' : 'Frames are display-only.'}`,
    read.succeeded ? 'confirm' : 'caution');
  $('argus-test').disabled = false;
}

/* --------------------------------------------------------------- mariachi */

/**
 * Whether music may sound right now.
 *
 * Two hard interlocks, and they are not decoration. The acoustic deck listens
 * for impulses on this device's microphone, and a speaker playing trumpets into
 * that microphone is an impulse detector listening to itself. Blackout means
 * every emission this console controls stops, and sound is an emission — a
 * console playing music through a blackout would be giving away the position it
 * was asked to hide.
 *
 * @returns {{allowed: boolean, reason: string}} Whether to play, and why not.
 */
function musicAllowed() {
  if (state.blackout) {
    return { allowed: false, reason: 'Blackout is on. Sound is an emission, so the music stops with everything else.' };
  }
  if (state.acoustic) {
    return {
      allowed: false,
      reason: 'The acoustic watch is listening on this device\'s microphone. Music through the speaker would be an impulse detector listening to itself, so it is held until the watch is stopped.',
    };
  }
  if (!Mariachi.supported()) {
    return { allowed: false, reason: 'This browser has no Web Audio, so nothing can be synthesised.' };
  }
  return { allowed: true, reason: 'Playing — synthesised on the spot, note by note. There is no audio file in this console.' };
}

/**
 * Show what the band is actually doing, not what was asked of it.
 *
 * @returns {void}
 */
function paintMusicButton() {
  const button = $('music-toggle');
  button.setAttribute('aria-pressed', String(state.mariachi.playing));
  button.disabled = !Mariachi.supported();
  button.textContent = state.mariachi.playing ? '♪ Mariachi on' : '♪ Mariachi';
}


/**
 * Bring the music in line with what is allowed and what was asked for.
 *
 * @returns {void}
 */
function syncMusic() {
  const permission = musicAllowed();
  const shouldPlay = state.musicWanted && permission.allowed;

  if (shouldPlay && !state.mariachi.playing) {
    // Repaint once the audio context has actually opened: a browser that
    // refuses the resume leaves `playing` false, and the button has to follow.
    state.mariachi.start().then(() => paintMusicButton()).catch(() => paintMusicButton());
  } else if (!shouldPlay && state.mariachi.playing) {
    state.mariachi.stop();
  }

  paintMusicButton();

  const note = $('music-note');
  note.className = `note ${state.musicWanted && !permission.allowed ? 'warn' : ''}`;
  note.textContent = state.musicWanted
    ? permission.reason
    : 'A son jalisciense in D — guitarrón, vihuela, two trumpets in parallel thirds, violins under it. Synthesised live; no recording is shipped. Off by default, and it stops on its own when the acoustic watch is armed or blackout is called.';
}

/* ------------------------------------------------------------ persistence */

/** @returns {void} Save what is worth surviving a reload. */
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      boundary: state.boundary,
      view: state.view,
      picks: state.picks,
      palette: state.palette,
      musicWanted: state.musicWanted,
      musicVolume: state.mariachi.volume,
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
    if (Array.isArray(saved.picks)) state.picks = saved.picks;
    if (saved.palette) state.palette = saved.palette;
    if (typeof saved.musicWanted === 'boolean') state.musicWanted = saved.musicWanted;
    if (Number.isFinite(saved.musicVolume)) {
      state.mariachi.setVolume(saved.musicVolume);
      $('music-volume').value = String(Math.round(saved.musicVolume * 100));
    }
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
  syncMusic();
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

for (const id of ['thermal-gain', 'thermal-level', 'thermal-span', 'thermal-iso', 'thermal-iso-low', 'thermal-iso-high']) {
  $(id).addEventListener('input', () => {
    state.gainMode = $('thermal-gain').value;
    state.isothermMode = $('thermal-iso').value;
    renderThermalReadouts();
  });
}
$('thermal-fusion').addEventListener('input', (event) => {
  state.fusion = Number(event.target.value) / 100;
});

$('lock-mode').addEventListener('change', (event) => {
  state.lockMode = event.target.value;
  state.lock = null;
  state.lockResult = null;
  $('lock-drop').disabled = true;
  buildLockModes();
});
$('lock-on').addEventListener('click', lockOnLargest);
$('lock-drop').addEventListener('click', () => {
  state.lock = null;
  state.lockResult = null;
  $('lock-drop').disabled = true;
  renderLock();
});

$('harvest-log').addEventListener('click', () => {
  state.picks.push({
    blockId: $('harvest-block').value,
    atMs: Date.now(),
    kg: Number($('harvest-kg').value) || 0,
    rows: Number($('harvest-rows').value) || 0,
  });
  $('harvest-undo').disabled = false;
  logEvent('Load logged', `${$('harvest-kg').value} kg from ${$('harvest-block').selectedOptions[0].textContent.split(' ·')[0]}.`, 'confirm');
  renderHarvest();
  save();
});
$('harvest-undo').addEventListener('click', () => {
  state.picks.pop();
  $('harvest-undo').disabled = !state.picks.length;
  renderHarvest();
  save();
});
$('harvest-block').addEventListener('change', renderHarvest);
$('harvest-export').addEventListener('click', () => {
  const rows = [['block', 'logged', 'kg', 'rows']];
  for (const pick of state.picks) {
    const block = state.blocks.find((entry) => entry.id === pick.blockId);
    rows.push([block?.name ?? pick.blockId, new Date(pick.atMs).toISOString(), pick.kg, pick.rows ?? '']);
  }
  const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `harvest-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

for (const id of ['argus-model', 'argus-host', 'argus-user', 'argus-pass', 'argus-stream', 'argus-relay', 'argus-relay-base', 'argus-relay-name']) {
  $(id).addEventListener('input', renderArgus);
  $(id).addEventListener('change', renderArgus);
}
$('argus-test').addEventListener('click', testArgus);
$('argus-add').addEventListener('click', () => {
  const relay = relayUrls($('argus-relay').value, $('argus-relay-base').value.trim(), $('argus-relay-name').value.trim());
  const url = relay ? relay.hls : snapshotUrl({ host: $('argus-host').value.trim(), user: $('argus-user').value, password: $('argus-pass').value });
  $('stream-url').value = url;
  $('stream-add').click();
  logEvent('Argus added', relay ? 'Added through the relay — frames are measurable.' : 'Added as a direct snapshot — display only until a relay is in place.', relay ? 'confirm' : 'caution');
});

$('music-toggle').addEventListener('click', () => {
  state.musicWanted = !state.musicWanted;
  syncMusic();
  save();
});
$('music-volume').addEventListener('input', (event) => {
  state.mariachi.setVolume(Number(event.target.value) / 100);
  save();
});

$('camera-rescan').addEventListener('click', refreshCameras);
$('camera-use').addEventListener('click', async () => {
  state.cameraId = $('camera-pick').value || null;
  for (const track of state.stream?.getTracks() ?? []) track.stop();
  state.stream = null;
  await startOptics();
});
$('camera-pick').addEventListener('change', () => refreshCameras());

$('track-toggle').addEventListener('click', () => {
  state.tracking = !state.tracking;
  state.panTilt.reset();
  state.trackedAtMs = 0;
  $('track-toggle').textContent = state.tracking ? 'Stop tracking' : 'Start tracking';
  renderTracking({ pan: 0, tilt: 0, moving: false, reason: state.tracking ? 'Waiting for a contact.' : 'Tracking off.' }, null);
});

$('spectral-run').addEventListener('click', () => {
  if (!state.lastFrame) {
    $('spectral-headline').className = 'note bad';
    $('spectral-headline').textContent = 'No live frame. Open a camera on the optics deck first, or load an image.';
    return;
  }
  runSpectral(state.lastFrame);
});
$('spectral-load').addEventListener('click', () => $('spectral-file').click());
$('spectral-file').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    runSpectral(ctx.getImageData(0, 0, canvas.width, canvas.height));
    URL.revokeObjectURL(image.src);
  };
  image.src = URL.createObjectURL(file);
});
$('spectral-index').addEventListener('change', () => {
  if (state.lastFrame) runSpectral(state.lastFrame);
});

$('sonar-rehearse').addEventListener('click', rehearseSweep);
$('sonar-clear').addEventListener('click', () => {
  state.grid = null;
  state.soundings = [];
  renderSonar();
});
$('sonar-area').addEventListener('input', () => {
  if (state.grid) renderSonar();
});

$('bio-pair').addEventListener('click', pairHeart);
$('bio-drop').addEventListener('click', () => {
  state.heart?.disconnect();
  state.heart = null;
  renderBio(null);
});

setInterval(() => {
  $('clock').textContent = new Date().toLocaleTimeString();
  if (state.deck === 'vault') renderVault();
  if (state.deck === 'aerial') renderAerial();
  if (state.deck === 'optics' && state.view === 'thermal') renderThermalReadouts();
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
renderRoutes();
buildSpectral();
buildBio();
renderSonar();
renderTracking({ pan: 0, tilt: 0, moving: false, reason: 'Tracking off.' }, null);
refreshCameras();
buildPalettes();
buildLockModes();
renderHarvest();
renderAerial();
buildArgus();
syncMusic();
$('site').textContent = state.boundary.length ? `${state.boundary.length} corners` : 'not set';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
