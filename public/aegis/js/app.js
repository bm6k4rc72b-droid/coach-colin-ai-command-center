/**
 * The console: everything that has to touch a browser.
 *
 * The detector proper — silhouette, posture, kinematics, inertial, acoustic,
 * fusion, escalation — is deliberately not in this file. Every one of those
 * modules is a pure function or a small state machine over plain data, which
 * is what lets the whole chain be replayed in Node against scenes whose answer
 * is known. This file is the part that cannot be: permissions, canvases,
 * pointer events, storage, and the wiring between them.
 *
 * There is one rule it enforces that is worth stating, because it is what
 * makes the demonstration honest. **There is no demo branch inside the
 * detector.** Live camera frames and synthetic scenario frames arrive at
 * `analyse` in exactly the same shape and go through exactly the same code. A
 * scenario can therefore show the detector being wrong, which is the only
 * reason to have one.
 *
 * @module aegis/app
 */

import { CameraFeed } from '../../baseline/js/camera.js';
import { clamp, duration } from './mathkit.js';
import { clean, createField, holdMask, regions, segment, updateField } from './silhouette.js';
import { FloorModel, readPosture } from './posture.js';
import { FallMachine } from './kinematics.js';
import { MotionSensor, analyseInertial } from './inertial.js';
import { RoomEar, analyseAcoustic } from './acoustic.js';
import { CHANNELS, coverageReport, fuse } from './fusion.js';
import { Ladder, alertLinks, composeAlert } from './escalation.js';
import { DEMO_OCCLUDERS, DEMO_REST_ZONES, SCENARIOS, Scene } from './demo.js';
import { Hologram } from './hologram.js';
import { Speaker, Ears, CLOUD_PROVIDERS, rankVoices } from './voice.js';
import { onLevelChange, parseRequest, respond, tour } from './vera.js';
import { clearLedger, readLedger, record, summarise, toCsv } from './ledger.js';
import { grade, levelInk, overlay } from './views.js';

const SETTINGS = 'aegis.settings.v1';

/** Analysis width for live camera frames. */
const ANALYSIS_WIDTH = 224;

/** Target analysis rate. Above this the background model gains nothing. */
const TARGET_FPS = 15;

const $ = (id) => document.getElementById(id);

const refs = {
  app: $('app'),
  stateChip: $('state-chip'),
  subjectName: $('subject-name'),
  mute: $('mute'),
  setupToggle: $('setup-toggle'),
  setup: $('setup'),
  setupClose: $('setup-close'),
  setupTabs: $('setup-tabs'),
  hologram: $('hologram'),
  veraLine: $('vera-line'),
  askForm: $('ask-form'),
  askInput: $('ask-input'),
  mic: $('mic'),
  chips: $('vera-chips'),
  viewport: $('viewport'),
  video: $('video'),
  picture: $('picture'),
  marks: $('marks'),
  empty: $('viewport-empty'),
  startCamera: $('start-camera'),
  startDemo: $('start-demo'),
  supportNote: $('support-note'),
  modeBadge: $('mode-badge'),
  clock: $('clock'),
  scenarioBar: $('scenario-bar'),
  scenarioKind: $('scenario-kind'),
  scenarioTitle: $('scenario-title'),
  scenarioClaim: $('scenario-claim'),
  scenarioExpect: $('scenario-expect'),
  scenarioList: $('scenario-list'),
  scenarioFill: $('scenario-progress-fill'),
  scenarioReplay: $('scenario-replay'),
  scenarioNext: $('scenario-next'),
  scenarioExit: $('scenario-exit'),
  dialFill: $('dial-fill'),
  beliefValue: $('belief-value'),
  headline: $('headline'),
  channels: $('channels'),
  reasons: $('reasons'),
  coverage: $('coverage'),
  gaps: $('gaps'),
  ladder: $('ladder'),
  ladderStage: $('ladder-stage'),
  ladderCount: $('ladder-count'),
  ladderNote: $('ladder-note'),
  imFine: $('im-fine'),
  callNow: $('call-now'),
  fieldSubject: $('field-subject'),
  fieldWhere: $('field-where'),
  fieldDwell: $('field-dwell'),
  dwellNote: $('dwell-note'),
  sensorList: $('sensor-list'),
  sensorNote: $('sensor-note'),
  zoneFurniture: $('zone-furniture'),
  zoneRest: $('zone-rest'),
  zoneClear: $('zone-clear'),
  zoneList: $('zone-list'),
  contactList: $('contact-list'),
  contactForm: $('contact-form'),
  contactName: $('contact-name'),
  contactRelation: $('contact-relation'),
  contactPhone: $('contact-phone'),
  rehearse: $('rehearse'),
  alertPreview: $('alert-preview'),
  voicePick: $('voice-pick'),
  voiceNote: $('voice-note'),
  voiceTest: $('voice-test'),
  cloudProvider: $('cloud-provider'),
  cloudHint: $('cloud-hint'),
  cloudKey: $('cloud-key'),
  cloudVoice: $('cloud-voice'),
  cloudTest: $('cloud-test'),
  cloudStatus: $('cloud-status'),
  ledgerSummary: $('ledger-summary'),
  ledgerList: $('ledger-list'),
  ledgerExport: $('ledger-export'),
  ledgerClear: $('ledger-clear'),
};

/** Everything the console knows. */
const state = {
  mode: 'idle',
  subject: '',
  where: '',
  dwellSeconds: 7,
  occluders: [],
  restZones: [],
  contacts: [],
  muted: false,
  drawing: null,
  live: { vision: false, inertial: false, acoustic: false },
  level: 'calm',
  verdict: null,
  vision: null,
  posture: null,
  region: null,
  peakBelief: 0,
  episode: null,
  scenarioId: SCENARIOS[0].id,
  tourIndex: -1,
  rehearsing: false,
};

const pipeline = {
  field: null,
  floor: new FloorModel(),
  machine: new FallMachine({ restZones: [] }),
  ladder: new Ladder({}),
  hold: null,
  display: null,
  lastAnalysisMs: 0,
};

const camera = new CameraFeed(refs.video);
const motion = new MotionSensor();
const ear = new RoomEar();
const speaker = new Speaker();
const ears = new Ears();
const hologram = new Hologram(refs.hologram);

let scene = null;
let sceneStartedMs = 0;
let loopHandle = 0;

/* ------------------------------------------------------------- persistence */

/** Read the stored settings over the defaults. */
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
    Object.assign(state, {
      subject: raw.subject || '',
      where: raw.where || '',
      dwellSeconds: raw.dwellSeconds || 7,
      occluders: Array.isArray(raw.occluders) ? raw.occluders : [],
      restZones: Array.isArray(raw.restZones) ? raw.restZones : [],
      contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
    });
  } catch {
    // First run, or storage blocked. The defaults above stand.
  }
}

/** Persist the settings that survive a reload. */
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify({
      subject: state.subject,
      where: state.where,
      dwellSeconds: state.dwellSeconds,
      occluders: state.occluders,
      restZones: state.restZones,
      contacts: state.contacts,
    }));
  } catch {
    // Private browsing. Settings last the session.
  }
}

/* ------------------------------------------------------------- the machine */

/** Rebuild the analysis chain, forgetting everything learned about the room. */
function resetPipeline(width, height) {
  pipeline.field = createField(width, height);
  pipeline.floor = new FloorModel();
  pipeline.machine = new FallMachine({
    restZones: activeRestZones(),
    dwellMs: state.dwellSeconds * 1000,
  });
  pipeline.ladder = new Ladder({ name: state.subject });
  pipeline.hold = null;
  pipeline.display = null;
  state.peakBelief = 0;
  state.episode = null;
}

/** @returns {object[]} The furniture in force for the current mode. */
function activeOccluders() {
  return state.mode === 'demo' ? DEMO_OCCLUDERS : state.occluders;
}

/** @returns {object[]} The rest zones in force for the current mode. */
function activeRestZones() {
  return state.mode === 'demo' ? DEMO_REST_ZONES : state.restZones;
}

/**
 * Put one frame through the whole chain.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @param {number} timeMs Capture time.
 * @param {object} [extra] Motion and sound for this instant.
 * @returns {object} Everything the interface needs.
 */
function analyse(frame, timeMs, extra = {}) {
  if (!pipeline.field || pipeline.field.width !== frame.width || pipeline.field.height !== frame.height) {
    resetPipeline(frame.width, frame.height);
  }
  updateField(pipeline.field, frame, { hold: pipeline.hold });
  const { mask } = segment(pipeline.field, frame, { sensitivity: 0.5 });
  const cleaned = clean(mask, frame.width, frame.height);
  const found = regions(cleaned, frame.width, frame.height, Math.max(40, (frame.width * frame.height) / 900));
  pipeline.hold = holdMask(found.slice(0, 2), frame.width, frame.height);
  const region = found[0] || null;
  const posture = readPosture(region, {
    width: frame.width,
    height: frame.height,
    timeMs,
    floor: pipeline.floor,
    occluders: activeOccluders(),
  });
  const vision = pipeline.machine.update(posture, {
    timeMs,
    width: frame.width,
    height: frame.height,
  });
  const inertial = extra.motion ? analyseInertial(extra.motion, { nowMs: timeMs })
    : state.live.inertial ? motion.read(timeMs) : null;
  const acoustic = extra.audio ? analyseAcoustic(extra.audio, { nowMs: timeMs })
    : state.live.acoustic ? ear.read(timeMs) : null;
  const verdict = fuse({ vision, inertial, acoustic });
  return { region, posture, vision, inertial, acoustic, verdict };
}

/* ---------------------------------------------------------------- the loop */

/** One pass: get a frame, analyse it, draw everything. */
function tick(now) {
  loopHandle = requestAnimationFrame(tick);
  if (now - pipeline.lastAnalysisMs < 1000 / TARGET_FPS) return;
  pipeline.lastAnalysisMs = now;

  let frame = null;
  let extra = {};
  let timeMs = now;

  if (state.mode === 'demo' && scene) {
    const elapsed = (now - sceneStartedMs) / 1000;
    if (elapsed > scene.seconds) { sceneStartedMs = now; restartScenario(); return; }
    frame = scene.frameAt(elapsed);
    extra = { motion: scene.motionAt(elapsed), audio: scene.audioAt(elapsed) };
    timeMs = elapsed * 1000;
    refs.scenarioFill.style.width = `${clamp(elapsed / scene.seconds, 0, 1) * 100}%`;
  } else if (state.mode === 'camera') {
    frame = camera.grab(ANALYSIS_WIDTH);
  }
  if (!frame) return;

  const result = analyse(frame, timeMs, extra);
  Object.assign(state, {
    region: result.region,
    posture: result.posture,
    vision: result.vision,
    verdict: result.verdict,
  });
  state.peakBelief = Math.max(state.peakBelief, result.verdict.belief);

  // A window on the console for the end-to-end harness. Read-only: nothing in
  // the app consults it, so it cannot become a second source of truth.
  globalThis.__aegis = {
    mode: state.mode,
    scenario: state.scenarioId,
    level: result.verdict.level,
    belief: result.verdict.belief,
    peakBelief: state.peakBelief,
    corroborated: result.verdict.corroborated,
    agreeing: result.verdict.agreeing,
    visionState: result.vision.state,
    transitObserved: result.vision.transitObserved,
    imputed: result.posture.imputed,
    occlusion: result.posture.occlusion,
    stature: result.posture.stature,
    ladder: pipeline.ladder.stage,
    frame: { width: frame.width, height: frame.height },
    said: refs.veraLine.textContent,
  };

  climbLadder(result, timeMs);
  drawPicture(frame, result);
  paintEvidence(result);
  refs.clock.hidden = false;
  refs.clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
}

/**
 * Advance the response ladder and let Vera say whatever it produced.
 *
 * @param {object} result This frame's analysis.
 * @param {number} timeMs Capture time.
 */
function climbLadder(result, timeMs) {
  const recovered = result.vision.state === 'recovering' || result.vision.state === 'upright';
  const report = pipeline.ladder.update({
    timeMs,
    belief: state.rehearsing ? 1 : result.verdict.belief,
    recovered: state.rehearsing ? false : recovered,
    contactable: state.contacts.length > 0,
  });

  for (const line of report.lines) {
    say(line.text, { tone: line.tone, interrupt: line.interrupt });
  }

  const level = result.verdict.level;
  if (level !== state.level) {
    const shift = onLevelChange(state.level, level, { subject: state.subject });
    state.level = level;
    setChip(level);
    hologram.setMood(level);
    if (shift) {
      if (shift.gesture) hologram.setGesture(shift.gesture);
      if (shift.text) say(shift.text, { tone: shift.tone, interrupt: true });
    }
    if (level === 'alarm' && !state.episode) {
      state.episode = { started: timeMs, watched: result.vision.transitObserved };
    }
  }

  paintLadder(report, result);
}

/**
 * Show where the ladder is.
 *
 * @param {object} report The ladder's report.
 * @param {object} result This frame's analysis.
 */
function paintLadder(report, result) {
  const active = report.stage === 'asking' || report.stage === 'confirming' || report.stage === 'alerting';
  refs.ladder.hidden = !active;
  if (!active) return;
  refs.ladder.classList.toggle('alarm', report.stage !== 'asking');
  const stages = {
    asking: 'Asking',
    confirming: 'Counting down',
    alerting: 'Contacts raised',
  };
  refs.ladderStage.textContent = stages[report.stage] || report.stage;
  refs.ladderCount.textContent = report.stage === 'confirming'
    ? `${Math.ceil(report.remainingMs / 1000)}s`
    : '';
  const who = state.subject || 'them';
  refs.ladderNote.textContent = report.stage === 'asking'
    ? `Vera has asked ${who} whether they are all right. Speaking, tapping, or simply getting up will stop this.`
    : report.stage === 'confirming'
      ? state.contacts.length
        ? `When this reaches zero, the message below goes to ${state.contacts.map((c) => c.name).join(' and ')}.`
        : 'Nobody is on the contact list, so this will keep asking rather than calling anybody. Add somebody in Setup.'
      : 'The message and the numbers are in Setup → Contacts. A browser cannot dial by itself.';
  if (report.stage === 'alerting' && !refs.alertPreview.textContent) showAlert(result);
}

/* --------------------------------------------------------------- rendering */

/**
 * Draw the graded picture and the evidence over it.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray}} frame The frame.
 * @param {object} result This frame's analysis.
 */
function drawPicture(frame, result) {
  const picture = refs.picture;
  if (picture.width !== frame.width || picture.height !== frame.height) {
    picture.width = frame.width;
    picture.height = frame.height;
    pipeline.display = null;
  }
  const ctx = picture.getContext('2d');
  if (!pipeline.display) pipeline.display = ctx.createImageData(frame.width, frame.height);
  grade(frame, pipeline.display, 'obsidian');
  ctx.putImageData(pipeline.display, 0, 0);

  const marks = refs.marks;
  const rect = marks.getBoundingClientRect();
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (marks.width !== width || marks.height !== height) {
    marks.width = width;
    marks.height = height;
  }
  const mctx = marks.getContext('2d');
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, width, height);
  // The picture is letterboxed by `object-fit: contain`, so the marks have to
  // be projected through exactly the same fit or every rectangle lands on the
  // wrong furniture.
  const fit = Math.min(width / frame.width, height / frame.height);
  overlay(mctx, {
    width: frame.width,
    height: frame.height,
    fit,
    offX: (width - frame.width * fit) / 2,
    offY: (height - frame.height * fit) / 2,
    dpr,
    region: result.region,
    posture: result.posture,
    vision: result.vision,
    level: result.verdict.level,
    occluders: activeOccluders(),
    restZones: activeRestZones(),
  });
  if (state.drawing?.box) {
    drawPendingZone(mctx, {
      fit,
      offX: (width - frame.width * fit) / 2,
      offY: (height - frame.height * fit) / 2,
      width: frame.width,
      height: frame.height,
      dpr,
    });
  }
}

/**
 * Draw the rectangle being dragged.
 *
 * @param {CanvasRenderingContext2D} ctx The marks context.
 * @param {{fit: number, offX: number, offY: number, width: number, height: number, dpr: number}} view
 *   The same projection the overlay uses.
 */
function drawPendingZone(ctx, view) {
  const { box, kind } = state.drawing;
  ctx.strokeStyle = kind === 'rest' ? '#5ee9b5' : '#e8c66a';
  ctx.lineWidth = 2 * view.dpr;
  ctx.setLineDash([6 * view.dpr, 5 * view.dpr]);
  ctx.strokeRect(
    view.offX + box.x * view.width * view.fit,
    view.offY + box.y * view.height * view.fit,
    box.w * view.width * view.fit,
    box.h * view.height * view.fit,
  );
  ctx.setLineDash([]);
}

/**
 * Fill in the evidence column.
 *
 * @param {object} result This frame's analysis.
 */
function paintEvidence(result) {
  const { verdict } = result;
  const percent = Math.round(verdict.belief * 100);
  refs.beliefValue.textContent = String(percent);
  const circumference = 2 * Math.PI * 52;
  refs.dialFill.style.strokeDashoffset = String(circumference * (1 - verdict.belief));
  refs.dialFill.style.stroke = levelInk(verdict.level);
  refs.headline.textContent = verdict.headline;

  refs.channels.replaceChildren(...verdict.channels.map((channel) => {
    const li = document.createElement('li');
    li.className = `channel${channel.available ? '' : ' off'}${channel.against > 0.15 ? ' against' : ''}`;
    const head = document.createElement('div');
    head.className = 'channel-head';
    const name = document.createElement('strong');
    name.textContent = channel.label;
    const value = document.createElement('em');
    value.textContent = channel.available
      ? channel.against > 0.15
        ? `−${Math.round(channel.against * 100)}%`
        : `${Math.round(channel.likelihood * 100)}%`
      : 'off';
    head.append(name, value);
    const bar = document.createElement('div');
    bar.className = 'channel-bar';
    const fill = document.createElement('span');
    fill.style.width = `${Math.round((channel.against > 0.15 ? channel.against : channel.likelihood) * 100)}%`;
    bar.append(fill);
    const note = document.createElement('p');
    note.className = 'channel-note';
    note.textContent = channel.note;
    li.append(head, bar, note);
    return li;
  }));

  const reasons = verdict.reasons.length ? verdict.reasons : ['Nothing to explain yet.'];
  refs.reasons.replaceChildren(...reasons.map((text) => {
    const li = document.createElement('li');
    if (!verdict.reasons.length) li.className = 'quiet';
    li.textContent = text;
    return li;
  }));

  const report = coverageReport(state.live);
  refs.coverage.textContent = `${Math.round(report.coverage * 100)}% of the available sensing is in service. ${report.summary}`;
  refs.gaps.replaceChildren(...report.gaps.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
}

/**
 * Set the header chip.
 *
 * @param {string} level The console level.
 */
function setChip(level) {
  const words = {
    calm: 'All clear',
    watching: 'Watching',
    checking: 'Checking',
    alarm: 'Fall detected',
  };
  refs.stateChip.className = `state-chip state-${level}`;
  refs.stateChip.textContent = state.mode === 'idle' ? 'Standing by' : words[level] || 'Watching';
}

/* -------------------------------------------------------------------- Vera */

/**
 * Have Vera say something, and show it.
 *
 * @param {string} text The line.
 * @param {object} [options] Tone and interruption.
 */
function say(text, options = {}) {
  const line = String(text || '').trim();
  if (!line) return;
  refs.veraLine.textContent = line;
  speaker.say(line, options);
}

/**
 * Handle something said or typed to Vera.
 *
 * @param {string} utterance What was said.
 */
function ask(utterance) {
  const request = parseRequest(utterance);
  const reply = respond(request, {
    subject: state.subject,
    where: state.where,
    live: state.live,
    verdict: state.verdict,
    vision: state.vision,
    contacts: state.contacts.length,
    events: readLedger().length,
    demo: state.mode === 'demo',
  });
  if (reply.gesture) hologram.setGesture(reply.gesture);
  if (reply.text) say(reply.text, { tone: reply.tone, interrupt: true });
  runAction(reply.action);
}

/**
 * Do whatever Vera's reply asked the console to do.
 *
 * @param {{kind: string, arg?: *}|null} action The action.
 */
function runAction(action) {
  if (!action) return;
  switch (action.kind) {
    case 'stand-down': standDown('said fine'); break;
    case 'call-now': callNow(); break;
    case 'demo': startScenario(action.arg); break;
    case 'tour': startTour(); break;
    case 'next': nextScenario(); break;
    case 'live': startCamera(); break;
    case 'rehearse': rehearse(); break;
    case 'silence': speaker.stop(); break;
    case 'mute': setMuted(Boolean(action.arg)); break;
    case 'open': openSetup(action.arg); break;
    default: break;
  }
}

/* ------------------------------------------------------------- the ladder's ends */

/**
 * Stand the ladder down and write it up.
 *
 * @param {string} why What ended it.
 */
function standDown(why) {
  const stage = pipeline.ladder.stage;
  pipeline.ladder.standDown(performance.now(), why);
  state.rehearsing = false;
  refs.alertPreview.hidden = true;
  refs.alertPreview.textContent = '';
  if (stage !== 'calm' && stage !== 'attentive') {
    record({
      kind: state.episode ? (state.episode.watched ? 'fall' : 'found-down') : 'checked',
      outcome: why,
      belief: state.peakBelief,
      channels: state.verdict?.agreeing || [],
      downMs: state.episode ? performance.now() - state.episode.started : 0,
      watched: Boolean(state.episode?.watched),
      note: state.mode === 'demo' ? `demonstration: ${state.scenarioId}` : state.where,
    });
    paintLedger();
  }
  state.episode = null;
  state.peakBelief = 0;
  hologram.setGesture('reassure');
}

/** Skip the countdown and raise the contacts now. */
function callNow() {
  pipeline.ladder.callNow(performance.now(), state.contacts.length > 0);
  showAlert({ verdict: state.verdict, vision: state.vision });
  openSetup('contacts');
}

/**
 * Compose the message the contacts would get and show it.
 *
 * @param {object} result The analysis it is based on.
 */
function showAlert(result) {
  const message = composeAlert({
    name: state.subject,
    where: state.where,
    verdict: result.verdict,
    vision: result.vision,
    downForMs: state.episode ? performance.now() - state.episode.started : 0,
  });
  refs.alertPreview.textContent = message;
  refs.alertPreview.hidden = false;
  paintContacts(message);
  record({
    kind: state.episode?.watched ? 'fall' : 'found-down',
    outcome: 'contacts raised',
    belief: state.peakBelief,
    channels: state.verdict?.agreeing || [],
    downMs: state.episode ? performance.now() - state.episode.started : 0,
    watched: Boolean(state.episode?.watched),
    note: state.mode === 'demo' ? `demonstration: ${state.scenarioId}` : state.where,
  });
  paintLedger();
}

/** Run the whole ladder deliberately, so somebody can hear what it does. */
function rehearse() {
  state.rehearsing = true;
  state.episode = { started: performance.now(), watched: true };
  pipeline.ladder.reset(performance.now());
  say('This is a rehearsal. Nothing will be sent, and I will tell you at every step exactly what would have been.', { tone: 'calm', interrupt: true });
  record({ kind: 'rehearsal', outcome: 'started', note: 'operator ran the ladder deliberately' });
  paintLedger();
}

/* ------------------------------------------------------------------ sensors */

/** Open the camera and start watching. */
async function startCamera() {
  stopScene();
  try {
    await camera.start({ facingMode: 'environment' });
  } catch (error) {
    try {
      await camera.start({ facingMode: 'user' });
    } catch (fallback) {
      refs.supportNote.textContent = fallback.message || 'The camera could not be opened.';
      return;
    }
  }
  state.mode = 'camera';
  state.live.vision = true;
  refs.empty.hidden = true;
  refs.scenarioBar.hidden = true;
  refs.modeBadge.hidden = false;
  refs.modeBadge.textContent = `Live · ${state.where || 'this room'}`;
  resetPipeline(ANALYSIS_WIDTH, Math.round((refs.video.videoHeight / refs.video.videoWidth) * ANALYSIS_WIDTH) || 168);
  setChip('calm');
  paintSensors();
  say(`Camera open. I’m learning the room now — give me a few seconds of it with nobody in shot, and it will be far better at this.`, { tone: 'calm', interrupt: true });
  hologram.setGesture('explain');
}

/** Turn on the carried phone's accelerometer. */
async function startMotion() {
  const result = await motion.start();
  state.live.inertial = result.ok;
  refs.sensorNote.textContent = result.reason;
  paintSensors();
  say(result.ok
    ? 'The phone is reporting. Put it in a pocket or on a lanyard — it covers the rooms the camera cannot see.'
    : result.reason, { tone: result.ok ? 'calm' : 'concerned', interrupt: true });
}

/** Turn on the room's sound. */
async function startEar() {
  const result = await ear.start();
  state.live.acoustic = result.ok;
  refs.sensorNote.textContent = result.reason;
  paintSensors();
  say(result.ok
    ? 'Listening. Only four numbers a frame survive it, so no speech is ever kept — including this sentence.'
    : result.reason, { tone: result.ok ? 'calm' : 'concerned', interrupt: true });
}

/* -------------------------------------------------------------- scenarios */

/** Stop any running scenario. */
function stopScene() {
  scene = null;
  state.tourIndex = -1;
  refs.scenarioBar.hidden = true;
}

/**
 * Play a scenario.
 *
 * @param {string} id Which one.
 */
function startScenario(id) {
  camera.stop();
  const chosen = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
  state.mode = 'demo';
  state.scenarioId = chosen.id;
  // In a scenario all three channels are fed by the same fixture, so the
  // console reports full coverage — and says, in the badge, that it is a
  // demonstration rather than a room.
  state.live = { vision: true, inertial: true, acoustic: true };
  scene = new Scene(chosen.id);
  sceneStartedMs = performance.now();
  resetPipeline(scene.width, scene.height);
  refs.empty.hidden = true;
  refs.scenarioBar.hidden = false;
  refs.modeBadge.hidden = false;
  refs.modeBadge.textContent = 'Demonstration · real detector';
  refs.scenarioKind.textContent = chosen.kind === 'positive' ? 'Should alarm' : 'Should stay quiet';
  refs.scenarioTitle.textContent = chosen.title;
  refs.scenarioClaim.textContent = chosen.claim;
  refs.scenarioExpect.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = 'Expected: ';
  refs.scenarioExpect.append(strong, document.createTextNode(chosen.expect));
  paintScenarioList();
  paintSensors();
  setChip('calm');
}

/** Play the current scenario again from the top. */
function restartScenario() {
  if (state.tourIndex >= 0) { nextScenario(); return; }
  startScenario(state.scenarioId);
}

/** Move to the next scenario, narrating if a tour is running. */
function nextScenario() {
  const order = SCENARIOS.map((s) => s.id);
  const at = order.indexOf(state.scenarioId);
  const next = order[(at + 1) % order.length];
  if (state.tourIndex >= 0) {
    state.tourIndex = (state.tourIndex + 1) % order.length;
    const step = tour()[state.tourIndex];
    startScenario(step.id);
    state.tourIndex = order.indexOf(step.id);
    say(step.intro, { tone: 'bright', interrupt: true });
    hologram.setGesture('point');
    return;
  }
  startScenario(next);
}

/** Begin the guided run through every scenario. */
function startTour() {
  state.tourIndex = 0;
  const step = tour()[0];
  startScenario(step.id);
  say(step.intro, { tone: 'bright', interrupt: true });
  hologram.setGesture('point');
}

/** Draw the scenario chooser. */
function paintScenarioList() {
  refs.scenarioList.replaceChildren(...SCENARIOS.map((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scenario-pill';
    button.dataset.kind = item.kind;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(item.id === state.scenarioId));
    button.textContent = item.title;
    button.addEventListener('click', () => { state.tourIndex = -1; startScenario(item.id); });
    return button;
  }));
}

/* ----------------------------------------------------------------- setup UI */

/**
 * Open the setup drawer at a pane.
 *
 * @param {string} [pane] Which pane.
 */
function openSetup(pane) {
  refs.setup.hidden = false;
  refs.setupToggle.setAttribute('aria-expanded', 'true');
  if (pane) selectPane(pane);
}

/** Close the setup drawer. */
function closeSetup() {
  refs.setup.hidden = true;
  refs.setupToggle.setAttribute('aria-expanded', 'false');
  state.drawing = null;
  refs.viewport.classList.remove('drawing');
  refs.zoneFurniture.classList.remove('zone-on');
  refs.zoneRest.classList.remove('zone-on');
}

/**
 * Show one pane of the drawer.
 *
 * @param {string} pane Which pane.
 */
function selectPane(pane) {
  for (const tab of refs.setupTabs.querySelectorAll('.tab')) {
    tab.classList.toggle('tab-on', tab.dataset.pane === pane);
  }
  for (const id of ['who', 'sensors', 'zones', 'contacts', 'voice', 'ledger']) {
    const node = $(`pane-${id}`);
    if (node) node.hidden = id !== pane;
  }
}

/** Draw the sensor list. */
function paintSensors() {
  const controls = {
    vision: { start: startCamera, label: 'Open the camera' },
    inertial: { start: startMotion, label: 'Use a carried phone' },
    acoustic: { start: startEar, label: 'Listen to the room' },
  };
  refs.sensorList.replaceChildren(...CHANNELS.map((channel) => {
    const li = document.createElement('li');
    const copy = document.createElement('div');
    copy.className = 'sensor-copy';
    const name = document.createElement('strong');
    name.textContent = channel.label;
    const note = document.createElement('small');
    note.textContent = state.live[channel.id]
      ? `In service. Weight ${channel.weight.toFixed(2)}.`
      : channel.blindSpot;
    copy.append(name, note);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = state.live[channel.id] ? 'ghost' : 'secondary';
    button.textContent = state.live[channel.id] ? 'Running' : controls[channel.id].label;
    button.disabled = state.live[channel.id];
    button.addEventListener('click', () => controls[channel.id].start());
    li.append(copy, button);
    return li;
  }));
}

/** Draw the declared zones. */
function paintZones() {
  const rows = [
    ...state.occluders.map((box, i) => ({ box, kind: 'furniture', i })),
    ...state.restZones.map((box, i) => ({ box, kind: 'rest', i })),
  ];
  refs.zoneList.replaceChildren(...rows.map(({ box, kind, i }) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${kind === 'rest' ? 'Rest zone' : 'Furniture'} — ${Math.round(box.w * 100)}% × ${Math.round(box.h * 100)}% at ${Math.round(box.x * 100)}, ${Math.round(box.y * 100)}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (kind === 'rest') state.restZones.splice(i, 1);
      else state.occluders.splice(i, 1);
      saveSettings();
      pipeline.machine.restZones = activeRestZones();
      paintZones();
    });
    li.append(text, remove);
    return li;
  }));
  if (!rows.length) {
    const li = document.createElement('li');
    li.textContent = 'Nothing declared. Aegis still works — it will simply treat every lowest visible row as a foot.';
    refs.zoneList.append(li);
  }
}

/**
 * Draw the contact list.
 *
 * @param {string} [message] A composed alert to attach to the links.
 */
function paintContacts(message = '') {
  refs.contactList.replaceChildren(...state.contacts.map((contact, index) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${contact.name}${contact.relation ? ` — ${contact.relation}` : ''}${contact.phone ? ` · ${contact.phone}` : ''}`;
    const actions = document.createElement('span');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    if (message) {
      const links = alertLinks(contact, message);
      for (const [label, href] of [['Call', links.call], ['Text', links.text]]) {
        if (!href) continue;
        const anchor = document.createElement('a');
        anchor.className = 'ghost';
        anchor.href = href;
        anchor.textContent = label;
        anchor.style.textDecoration = 'none';
        actions.append(anchor);
      }
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.contacts.splice(index, 1);
      saveSettings();
      paintContacts(message);
    });
    actions.append(remove);
    li.append(text, actions);
    return li;
  }));
  if (!state.contacts.length) {
    const li = document.createElement('li');
    li.textContent = 'Nobody yet. At the top of the ladder Vera will keep asking rather than calling.';
    refs.contactList.append(li);
  }
}

/** Draw the ledger. */
function paintLedger() {
  const entries = readLedger();
  refs.ledgerSummary.textContent = summarise(entries).text;
  refs.ledgerList.replaceChildren(...entries.slice(0, 40).map((entry) => {
    const li = document.createElement('li');
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = new Date(entry.at).toLocaleString();
    const what = document.createElement('span');
    const bits = [entry.kind, entry.outcome].filter(Boolean).join(' — ');
    const detail = entry.belief
      ? ` · ${Math.round(entry.belief * 100)}%${entry.downMs ? `, down ${duration(entry.downMs)}` : ''}`
      : '';
    what.textContent = `${bits}${detail}${entry.note ? ` · ${entry.note}` : ''}`;
    li.append(when, what);
    return li;
  }));
}

/* ------------------------------------------------------------------- voice */

/** Fill in the voice studio. */
function paintVoice() {
  const profile = speaker.profile;
  const voices = typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
  const ranked = rankVoices(voices);
  refs.voicePick.replaceChildren(...ranked.map(({ voice }, index) => {
    const option = document.createElement('option');
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})${index === 0 ? ' — best available' : ''}`;
    option.selected = profile.voiceURI ? profile.voiceURI === voice.voiceURI : index === 0;
    return option;
  }));
  refs.voiceNote.textContent = ranked.length
    ? `${ranked.length} English voices installed on this device, ranked. The top one is chosen unless you say otherwise.`
    : 'No voices are installed yet. On some browsers the list arrives a moment after the page does — reopen this panel.';
  const set = (input, valueNode, value, format) => {
    input.value = String(value);
    valueNode.textContent = format(value);
  };
  set(refs.voicePitch, refs.voicePitchValue, profile.pitch, (v) => Number(v).toFixed(2));
  set(refs.voiceRate, refs.voiceRateValue, profile.rate, (v) => Number(v).toFixed(2));
  set(refs.voiceWarmth, refs.voiceWarmthValue, profile.warmth, (v) => Number(v).toFixed(2));
  set(refs.voicePace, refs.voicePaceValue, profile.pace, (v) => Number(v).toFixed(2));
  refs.cloudProvider.value = profile.cloud.provider || '';
  refs.cloudKey.value = profile.cloud.key || '';
  refs.cloudVoice.value = profile.cloud.voice || '';
  const provider = CLOUD_PROVIDERS.find((p) => p.id === profile.cloud.provider);
  refs.cloudHint.textContent = provider ? provider.hint : 'Off. Vera uses the voices installed on this device, and nothing she says leaves it.';
}

/* -------------------------------------------------------------- zone drawing */

/**
 * Begin drawing a zone of a kind.
 *
 * @param {string} kind `furniture` or `rest`.
 */
function armDrawing(kind) {
  const already = state.drawing?.kind === kind && !state.drawing.box;
  state.drawing = already ? null : { kind, box: null, from: null };
  refs.viewport.classList.toggle('drawing', Boolean(state.drawing));
  refs.zoneFurniture.classList.toggle('zone-on', state.drawing?.kind === 'furniture');
  refs.zoneRest.classList.toggle('zone-on', state.drawing?.kind === 'rest');
}

/**
 * Convert a pointer event to normalised frame coordinates.
 *
 * @param {PointerEvent} event The event.
 * @returns {{x: number, y: number}} Normalised coordinates.
 */
function pointerPoint(event) {
  const rect = refs.marks.getBoundingClientRect();
  const frameWidth = refs.picture.width || 1;
  const frameHeight = refs.picture.height || 1;
  const fit = Math.min(rect.width / frameWidth, rect.height / frameHeight);
  const offX = (rect.width - frameWidth * fit) / 2;
  const offY = (rect.height - frameHeight * fit) / 2;
  return {
    x: clamp((event.clientX - rect.left - offX) / (frameWidth * fit), 0, 1),
    y: clamp((event.clientY - rect.top - offY) / (frameHeight * fit), 0, 1),
  };
}

/* -------------------------------------------------------------------- boot */

/** Wire everything up. */
function boot() {
  loadSettings();
  refs.subjectName.textContent = state.subject || 'nobody yet';
  refs.fieldSubject.value = state.subject;
  refs.fieldWhere.value = state.where;
  refs.fieldDwell.value = String(state.dwellSeconds);
  refs.dwellNote.textContent = dwellWords();

  // Aliases kept short at the point of use; the ids are the long ones.
  refs.voicePitch = $('v-pitch');
  refs.voiceRate = $('v-rate');
  refs.voiceWarmth = $('v-warmth');
  refs.voicePace = $('v-pace');
  refs.voicePitchValue = $('v-pitch-value');
  refs.voiceRateValue = $('v-rate-value');
  refs.voiceWarmthValue = $('v-warmth-value');
  refs.voicePaceValue = $('v-pace-value');

  refs.supportNote.textContent = CameraFeed.supported()
    ? 'Works on iPhone, Android and any laptop with a webcam. The camera needs HTTPS or localhost.'
    : 'This browser exposes no camera. The demonstration below runs without one.';

  for (const provider of CLOUD_PROVIDERS) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.label;
    refs.cloudProvider.append(option);
  }

  hologram.setGesture('greet');
  hologram.start();
  speaker.onAmplitude = (value) => hologram.setAmplitude(value);

  paintSensors();
  paintZones();
  paintContacts();
  paintLedger();
  paintVoice();
  paintScenarioList();
  setChip('calm');
  paintEvidence({ verdict: fuse({}) });

  for (const [text, utterance] of [
    ['What can you see?', 'what can you see'],
    ['How do you tell a fall from sitting down?', 'how do you work'],
    ['What can’t you see?', 'coverage'],
    ['Run the demonstration', 'guided tour'],
    ['Is this private?', 'privacy'],
  ]) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = text;
    chip.addEventListener('click', () => ask(utterance));
    refs.chips.append(chip);
  }

  refs.startCamera.addEventListener('click', startCamera);
  refs.startDemo.addEventListener('click', startTour);
  refs.scenarioReplay.addEventListener('click', () => startScenario(state.scenarioId));
  refs.scenarioNext.addEventListener('click', nextScenario);
  refs.scenarioExit.addEventListener('click', startCamera);
  refs.setupToggle.addEventListener('click', () => (refs.setup.hidden ? openSetup('who') : closeSetup()));
  refs.setupClose.addEventListener('click', closeSetup);
  refs.setup.addEventListener('click', (event) => { if (event.target === refs.setup) closeSetup(); });
  refs.setupTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (tab) selectPane(tab.dataset.pane);
  });

  refs.askForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = refs.askInput.value.trim();
    if (!text) return;
    refs.askInput.value = '';
    ask(text);
  });

  refs.mic.addEventListener('click', () => {
    if (ears.listening) { ears.stop(); refs.mic.setAttribute('aria-pressed', 'false'); return; }
    ears.onHeard = (text, final) => {
      refs.askInput.value = text;
      if (!final) return;
      refs.askInput.value = '';
      ask(text);
    };
    ears.onStop = () => refs.mic.setAttribute('aria-pressed', 'false');
    const started = ears.start({ continuous: false });
    refs.mic.setAttribute('aria-pressed', String(started));
    if (!started) {
      say('This browser will not give me a microphone for listening — Firefox is the usual reason. Type to me instead; it is the same path.', { tone: 'calm', interrupt: true });
    }
  });

  refs.mute.addEventListener('click', () => setMuted(!state.muted));
  refs.imFine.addEventListener('click', () => standDown('said fine'));
  refs.callNow.addEventListener('click', callNow);
  refs.rehearse.addEventListener('click', rehearse);

  refs.fieldSubject.addEventListener('input', () => {
    state.subject = refs.fieldSubject.value.trim();
    refs.subjectName.textContent = state.subject || 'nobody yet';
    pipeline.ladder.name = state.subject;
    saveSettings();
  });
  refs.fieldWhere.addEventListener('input', () => {
    state.where = refs.fieldWhere.value.trim();
    saveSettings();
  });
  refs.fieldDwell.addEventListener('input', () => {
    state.dwellSeconds = Number(refs.fieldDwell.value);
    pipeline.machine.dwellMs = state.dwellSeconds * 1000;
    refs.dwellNote.textContent = dwellWords();
    saveSettings();
  });

  refs.zoneFurniture.addEventListener('click', () => armDrawing('furniture'));
  refs.zoneRest.addEventListener('click', () => armDrawing('rest'));
  refs.zoneClear.addEventListener('click', () => {
    state.occluders = [];
    state.restZones = [];
    pipeline.machine.restZones = [];
    saveSettings();
    paintZones();
  });

  refs.marks.addEventListener('pointerdown', (event) => {
    if (!state.drawing) return;
    refs.marks.setPointerCapture(event.pointerId);
    state.drawing.from = pointerPoint(event);
    state.drawing.box = { ...state.drawing.from, w: 0, h: 0 };
  });
  refs.marks.addEventListener('pointermove', (event) => {
    if (!state.drawing?.from) return;
    const to = pointerPoint(event);
    state.drawing.box = {
      x: Math.min(state.drawing.from.x, to.x),
      y: Math.min(state.drawing.from.y, to.y),
      w: Math.abs(to.x - state.drawing.from.x),
      h: Math.abs(to.y - state.drawing.from.y),
    };
  });
  refs.marks.addEventListener('pointerup', () => {
    const pending = state.drawing;
    if (!pending?.box) return;
    if (pending.box.w > 0.03 && pending.box.h > 0.02) {
      const box = { ...pending.box, label: pending.kind === 'rest' ? 'rest' : 'furniture' };
      if (pending.kind === 'rest') state.restZones.push(box);
      else state.occluders.push(box);
      pipeline.machine.restZones = activeRestZones();
      saveSettings();
      paintZones();
    }
    state.drawing = { kind: pending.kind, box: null, from: null };
  });

  refs.contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = refs.contactName.value.trim();
    if (!name) return;
    state.contacts.push({
      name,
      relation: refs.contactRelation.value.trim(),
      phone: refs.contactPhone.value.trim(),
    });
    refs.contactForm.reset();
    saveSettings();
    paintContacts();
  });

  for (const [input, key] of [
    [refs.voicePitch, 'pitch'], [refs.voiceRate, 'rate'],
    [refs.voiceWarmth, 'warmth'], [refs.voicePace, 'pace'],
  ]) {
    input.addEventListener('input', () => {
      speaker.configure({ [key]: Number(input.value) });
      paintVoice();
    });
  }
  refs.voicePick.addEventListener('change', () => {
    speaker.configure({ voiceURI: refs.voicePick.value });
    say('This is how I sound. Say “I’m fine” back to me and I will stand down — that is the sentence that matters most.', { tone: 'warm', interrupt: true });
  });
  refs.voiceTest.addEventListener('click', () => {
    say(`${state.subject ? `${state.subject}. ` : ''}I saw that, and I want to make sure you’re all right. Say “I’m fine”, or just lift a hand where I can see it.`, { tone: 'concerned', interrupt: true });
  });
  for (const [input, key] of [[refs.cloudProvider, 'provider'], [refs.cloudKey, 'key'], [refs.cloudVoice, 'voice']]) {
    input.addEventListener('change', () => {
      speaker.configure({ cloud: { ...speaker.profile.cloud, [key]: input.value.trim() } });
      paintVoice();
    });
  }
  refs.cloudTest.addEventListener('click', async () => {
    refs.cloudStatus.textContent = 'Asking the service…';
    const before = speaker.profile.cloud;
    if (!before.provider || !before.key || !before.voice) {
      refs.cloudStatus.textContent = 'A service, a key and a voice id are all needed before there is anything to test.';
      return;
    }
    await speaker.say('This is the bridged voice. Everything else in Aegis still runs on this device.', { tone: 'warm', interrupt: true });
    refs.cloudStatus.textContent = 'If you heard a different voice, the bridge is working. If you heard the built-in one, the request was refused and Vera fell back rather than going silent.';
  });

  refs.ledgerExport.addEventListener('click', () => {
    const blob = new Blob([toCsv()], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aegis-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  refs.ledgerClear.addEventListener('click', () => { clearLedger(); paintLedger(); });

  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.addEventListener?.('voiceschanged', paintVoice);
  }

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Escape') { closeSetup(); return; }
    if (event.key >= '1' && event.key <= '8') {
      const item = SCENARIOS[Number(event.key) - 1];
      if (item) { state.tourIndex = -1; startScenario(item.id); }
    }
    if (event.key === ' ') { event.preventDefault(); nextScenario(); }
  });

  loopHandle = requestAnimationFrame(tick);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline caching is a nicety; the app works without it.
    });
  }
}

/** @returns {string} A sentence describing the dwell setting. */
function dwellWords() {
  return `Vera waits ${state.dwellSeconds} seconds on the floor before she says anything. Shorter is faster and noisier; longer catches more people who get themselves up.`;
}

/**
 * Mute or unmute Vera.
 *
 * @param {boolean} muted Whether to silence her.
 */
function setMuted(muted) {
  state.muted = muted;
  speaker.setMuted(muted);
  refs.mute.setAttribute('aria-pressed', String(muted));
  refs.mute.textContent = muted ? 'Muted' : 'Mute';
}

boot();

export { analyse, state };
