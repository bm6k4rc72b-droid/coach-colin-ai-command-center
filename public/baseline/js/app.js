/**
 * Baseline — camera vitals and an offline coach.
 *
 * This file is the wiring: camera in, panels and sheets out, and a small state
 * machine between them. Every number it displays is computed by one of the pure
 * modules beside it, all of which are driven from Node by the test suite, so
 * nothing here decides anything about physiology or training — it only decides
 * what is on screen.
 *
 * @module baseline/app
 */

import { CameraFeed } from './camera.js';
import { FaceRegion, guideRect, measureRegion, regionMotion } from './roi.js';
import { estimateVitals } from './vitals.js';
import {
  BASELINE_MINIMUM, anomalyFlags, buildBaseline, readinessScore, trendSeries,
} from './baseline.js';
import {
  GOALS, TIERS, answer, heartRateZones, prescribe,
} from './coach.js';
import {
  PROTOCOLS, breathState, breathingResponse, compareScans, cycleSeconds,
  describeResponse, protocolFor,
} from './breathe.js';
import {
  addSession, clearAll, loadProfile, loadSessions, loadSettings, saveProfile,
  saveSettings, sessionRow, toCsv, toJson,
} from './ledger.js';
import { PROVIDERS, ask, briefFor, loadCredentials, saveCredentials } from './llm.js';
import { Ears, Voice } from './speech.js';
import { clamp, detrend, mean } from './signal.js';

/**
 * Element lookup.
 *
 * @param {string} id Element id.
 * @returns {HTMLElement} The element.
 */
const el = (id) => document.getElementById(id);

const CONTEXT_KEY = 'baseline.context.v1';

/** Frames held in memory: six minutes at 30 fps, after which the oldest go. */
const SAMPLE_CAP = 30 * 60 * 6;

const state = {
  profile: loadProfile(),
  settings: loadSettings(),
  sessions: loadSessions(),
  credentials: loadCredentials(),
  context: null,
  baseline: null,
  reading: null,
  readiness: null,
  plan: null,
  flags: [],
  restingToday: null,
  mode: 'idle',
  scanKind: 'resting',
  samples: [],
  scanStart: 0,
  scanEnd: 0,
  previousFrame: null,
  motion: 0,
  frameTimes: [],
  lastLiveAt: 0,
  live: null,
  breath: null,
  facing: 'user',
};

const camera = new CameraFeed(el('preview'));
const face = new FaceRegion();
const voice = new Voice();
const ears = new Ears();

/* ------------------------------------------------------------------ *
 * Small shared helpers
 * ------------------------------------------------------------------ */

let toastTimer = null;

/**
 * Flash a short message.
 *
 * @param {string} message Message text.
 */
function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

/**
 * Buzz, when the platform and the settings allow it.
 *
 * @param {number|number[]} pattern Vibration pattern.
 */
function haptic(pattern) {
  if (!state.settings.haptics) return;
  navigator.vibrate?.(pattern);
}

/**
 * Open a sheet.
 *
 * @param {string} id Sheet element id.
 */
function openSheet(id) {
  el(id).hidden = false;
}

/**
 * Close a sheet.
 *
 * @param {string} id Sheet element id.
 */
function closeSheet(id) {
  el(id).hidden = true;
}

/** Close every sheet. */
function closeAllSheets() {
  for (const sheet of document.querySelectorAll('.sheet')) sheet.hidden = true;
}

/**
 * Build a segmented control.
 *
 * @param {string} id Container id.
 * @param {Array<{id: string, label: string}>} options Options.
 * @param {string} selected Selected option id.
 * @param {(id: string) => void} onSelect Selection handler.
 */
function renderSegmented(id, options, selected, onSelect) {
  const container = el(id);
  container.textContent = '';
  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `seg${option.id === selected ? ' on' : ''}`;
    button.textContent = option.label;
    button.addEventListener('click', () => {
      onSelect(option.id);
      renderSegmented(id, options, option.id, onSelect);
    });
    container.append(button);
  }
}

/**
 * Offer a file to the browser as a download.
 *
 * @param {string} filename File name.
 * @param {string} text File contents.
 * @param {string} type MIME type.
 */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Whether two timestamps fall on the same local day.
 *
 * @param {number} a First timestamp.
 * @param {number} b Second timestamp.
 * @returns {boolean} Whether the calendar day matches.
 */
function sameDay(a, b) {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

/* ------------------------------------------------------------------ *
 * Daily context
 * ------------------------------------------------------------------ */

const SLEEP_QUALITY_WORDS = ['Broken', 'Poor', 'Fine', 'Good', 'Deep'];
const SORENESS_WORDS = ['None', 'A little', 'Noticeable', 'Sore', 'Very sore'];
const STRESS_WORDS = ['Calm', 'Settled', 'Busy', 'Tense', 'Wired'];

/** @returns {object} Stored context answers, with defaults. */
function loadContext() {
  const fallback = {
    sleepHours: 7.5,
    sleepQuality: 2,
    soreness: 0,
    stress: 0,
    alcoholUnits: 0,
    planned: 'moderate',
    answeredAt: 0,
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(CONTEXT_KEY) || '{}') };
  } catch {
    return fallback;
  }
}

/**
 * Persist context answers.
 *
 * @param {object} context Answers.
 */
function storeContext(context) {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch {
    /* Answers simply do not survive the session without a store. */
  }
}

/** @returns {boolean} Whether today's answers are current. */
function contextIsFresh() {
  return Boolean(state.context.answeredAt) && sameDay(state.context.answeredAt, Date.now());
}

/**
 * The context actually handed to the scoring code.
 *
 * Yesterday's sleep answer is not evidence about today, so a stale set is
 * dropped rather than carried forward — readiness then rests on the camera
 * alone, and the result sheet says so.
 *
 * @returns {object} Context for scoring.
 */
function effectiveContext() {
  if (!contextIsFresh()) return { planned: state.context.planned };
  const { answeredAt, ...rest } = state.context;
  return rest;
}

/* ------------------------------------------------------------------ *
 * The capture loop
 * ------------------------------------------------------------------ */

/**
 * Handle one decoded camera frame.
 *
 * @param {number} timestampMs Frame time from the media clock where available.
 */
function onFrame(timestampMs) {
  const frame = camera.grab(192);
  if (!frame) return;

  if (face.detector !== null || FaceRegion.hasPlatformDetector()) {
    // Fire and forget: the detector is asynchronous and rate-limited inside.
    face.detect(el('preview'), performance.now());
  }

  const measurement = measureRegion(frame, face.rect);
  const motion = regionMotion(frame, state.previousFrame, face.rect);
  state.previousFrame = frame;
  state.motion = state.motion * 0.8 + motion * 0.2;
  if (measurement.found && !FaceRegion.hasPlatformDetector()) face.follow(measurement);

  if (state.mode !== 'idle') {
    state.samples.push({
      t: timestampMs,
      r: measurement.r,
      g: measurement.g,
      b: measurement.b,
      luma: measurement.luma,
      motion: state.motion,
      clipped: measurement.clipped,
      found: measurement.found,
    });
    // A breathing round can run for ten minutes, and nothing downstream reads
    // more than the last few minutes of it.
    if (state.samples.length > SAMPLE_CAP) state.samples.shift();
  }

  state.frameTimes.push(performance.now());
  if (state.frameTimes.length > 40) state.frameTimes.shift();

  drawOverlay(measurement);
  if (state.mode === 'scanning') tickScan();
  else if (state.mode === 'breathing') tickBreathing();
}

/** @returns {number} Measured capture rate. */
function measuredFps() {
  const times = state.frameTimes;
  if (times.length < 5) return 0;
  const span = (times[times.length - 1] - times[0]) / 1000;
  return span > 0 ? (times.length - 1) / span : 0;
}

/**
 * Paint the guide oval, the progress ring and the tracked region.
 *
 * @param {object} measurement Latest region measurement.
 */
function drawOverlay(measurement) {
  const canvas = el('overlay');
  const stage = el('stage');
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (state.mode === 'idle') return;

  const guide = guideRect();
  const cx = (guide.x + guide.w / 2) * width;
  const cy = (guide.y + guide.h / 2) * height;
  const rx = (guide.w / 2) * width;
  const ry = (guide.h / 2) * height;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = measurement.found ? 'rgba(168, 240, 74, 0.55)' : 'rgba(255, 122, 92, 0.6)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (state.mode === 'scanning') {
    const progress = clamp((Date.now() - state.scanStart) / (state.scanEnd - state.scanStart), 0, 1);
    ctx.save();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(168, 240, 74, 0.95)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 10, ry + 10, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.restore();
  }

  // The tracked region, so it is obvious what is actually being measured.
  const r = face.rect;
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x * width, r.y * height, r.w * width, r.h * height);
  ctx.restore();
}

/**
 * Draw the live pulse trace.
 *
 * The trace is the region's own green channel over the last few seconds,
 * detrended for display only — the reported numbers come from the full
 * pipeline, not from this.
 *
 * @param {string} canvasId Target canvas.
 * @param {number} seconds Window length.
 */
function drawWave(canvasId, seconds = 6) {
  const canvas = el(canvasId);
  if (!state.settings.showWaveform) {
    canvas.hidden = true;
    return;
  }
  canvas.hidden = false;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const height = canvas.clientHeight || 90;
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const fps = measuredFps() || 30;
  const count = Math.max(16, Math.round(seconds * fps));
  const tail = state.samples.slice(-count).filter((sample) => sample.found);
  if (tail.length < 16) return;

  const series = detrend(tail.map((sample) => -sample.g), Math.max(5, Math.round(fps) | 1));
  const average = mean(series);
  let peak = 1e-6;
  for (const value of series) peak = Math.max(peak, Math.abs(value - average));

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(168, 240, 74, 0.9)';
  for (let i = 0; i < series.length; i += 1) {
    const x = (i / (series.length - 1)) * width;
    const y = height / 2 - ((series[i] - average) / peak) * (height / 2 - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * Draw the pulse-rate trace during a breathing round.
 *
 * @param {Array<number>} values Rate samples in bpm.
 */
function drawBreathWave(values) {
  const canvas = el('breathWave');
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const height = canvas.clientHeight || 70;
  if (canvas.width !== Math.round(width * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (values.length < 4) return;

  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(4, high - low);
  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
  for (let i = 0; i < values.length; i += 1) {
    const x = (i / (values.length - 1)) * width;
    const y = height - 6 - ((values[i] - low) / span) * (height - 12);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ *
 * Scanning
 * ------------------------------------------------------------------ */

/**
 * Open the camera and start a scan.
 *
 * @param {string} kind `resting`, `post-session` or `breathing`.
 * @returns {Promise<void>} Resolves once capture is running.
 */
async function startScan(kind = 'resting') {
  try {
    if (!camera.stream) {
      await camera.start({ facingMode: state.facing });
      await camera.lockExposure();
      camera.onFrames(onFrame);
    }
  } catch (error) {
    el('gateNote').textContent = `${error.message} On iOS the page must be served over HTTPS.`;
    toast('The camera did not open.');
    return;
  }

  closeAllSheets();
  el('startGate').hidden = true;
  el('breathPanel').hidden = true;
  el('scanPanel').hidden = false;

  state.scanKind = kind;
  state.samples = [];
  state.previousFrame = null;
  state.live = null;
  state.motion = 0;
  state.mode = 'scanning';
  state.scanStart = Date.now();
  state.scanEnd = state.scanStart + state.settings.scanSeconds * 1000;

  el('modeName').textContent = kind === 'resting' ? 'Resting scan' : 'Post-session scan';
  el('scanPhase').textContent = 'Hold still';
  el('scanSub').textContent = kind === 'resting'
    ? 'Fill the oval. Front light, elbows supported, breathe normally.'
    : 'Same position as this morning, so the two readings are comparable.';
  haptic(20);
}

/** Advance the scan: countdown, live estimate, quality chips. */
function tickScan() {
  const now = Date.now();
  const remaining = Math.max(0, Math.ceil((state.scanEnd - now) / 1000));
  el('scanCountdown').textContent = String(remaining);
  el('fpsText').textContent = `${measuredFps().toFixed(0)} fps`;
  drawWave('wave');
  updateQualityChips();

  // A live estimate every 1.2 s from the trailing 20 s. It is the same
  // pipeline as the final one, run on less data, which is exactly why the
  // number wobbles at first and settles: that wobble is honest.
  if (now - state.lastLiveAt > 1200) {
    state.lastLiveAt = now;
    const fps = measuredFps() || 30;
    const tail = state.samples.slice(-Math.round(fps * 20));
    if (tail.length > fps * 8) {
      const live = estimateVitals(tail);
      state.live = live;
      el('liveBpm').textContent = live.bpm > 0 ? Math.round(live.bpm) : '—';
      el('liveSnr').textContent = live.snrDb > -30 ? `${live.snrDb.toFixed(1)} dB` : '—';
      el('liveBeats').textContent = live.hrv.beats > 1 ? String(live.hrv.beats) : '—';
    }
  }

  if (now >= state.scanEnd) finishScan();
}

/** Repaint the three quality chips from the current frame statistics. */
function updateQualityChips() {
  const recent = state.samples.slice(-45);
  const found = recent.filter((sample) => sample.found);
  const luma = found.length ? mean(found.map((sample) => sample.luma)) : 0;
  const clipped = found.length ? mean(found.map((sample) => sample.clipped)) : 0;

  /**
   * Set one chip's state and label.
   *
   * @param {string} id Chip id.
   * @param {string} label Chip text.
   * @param {string} status `ok`, `warn` or `bad`.
   */
  const chip = (id, label, status) => {
    const node = el(id);
    node.textContent = label;
    node.className = `qchip ${status}`;
  };

  chip('qLight',
    luma < 45 ? 'Too dark' : clipped > 0.15 ? 'Too bright' : 'Light ok',
    luma < 45 ? 'bad' : clipped > 0.15 ? 'warn' : 'ok');
  chip('qStill',
    state.motion > 0.09 ? 'Too much movement' : state.motion > 0.035 ? 'Steadier' : 'Still',
    state.motion > 0.09 ? 'bad' : state.motion > 0.035 ? 'warn' : 'ok');
  const coverage = recent.length ? found.length / recent.length : 0;
  chip('qFace',
    coverage < 0.5 ? 'Face not found' : coverage < 0.9 ? 'Keep in the oval' : 'Face locked',
    coverage < 0.5 ? 'bad' : coverage < 0.9 ? 'warn' : 'ok');
}

/** Finish a scan, score it and show the result. */
function finishScan() {
  state.mode = 'idle';
  el('scanPanel').hidden = true;
  haptic([30, 60, 30]);

  const reading = estimateVitals(state.samples);
  state.reading = reading;

  const flat = {
    bpm: reading.bpm,
    rmssd: reading.hrv.rmssd,
    hrvReliable: reading.hrv.reliable,
    breathsPerMin: reading.breathsPerMin,
    confidence: reading.confidence,
    grade: reading.grade,
    advice: reading.advice,
  };

  state.baseline = buildBaseline(state.sessions);
  const context = effectiveContext();
  state.readiness = reading.grade === 'unusable'
    ? { score: null, band: { id: 'unusable', label: 'No score', tone: 'warn' }, drivers: [], confidence: 0 }
    : readinessScore(flat, state.baseline, context);
  state.flags = reading.grade === 'unusable' ? [] : anomalyFlags(flat, state.baseline, context);
  state.plan = prescribe({
    reading: flat,
    readiness: state.readiness,
    baseline: state.baseline,
    flags: state.flags,
    context,
    profile: state.profile,
    history: state.sessions,
  });

  // The morning's scan is read back from the ledger rather than from memory, so
  // the comparison survives closing the app between the two scans — which is
  // the normal case, since one is taken before breakfast and one after a
  // session hours later.
  if (state.scanKind !== 'resting' && !state.restingToday) {
    const morning = state.sessions
      .filter((row) => row.kind === 'resting' && sameDay(row.at, Date.now()))
      .sort((a, b) => b.at - a.at)[0];
    if (morning) state.restingToday = morning;
  }

  if (reading.grade !== 'unusable') {
    const row = sessionRow({
      reading,
      kind: state.scanKind,
      context,
      readiness: state.readiness,
      plan: state.plan,
    });
    state.sessions = addSession(row);
    if (state.scanKind === 'resting') state.restingToday = flat;
    // The baseline now includes this scan, so a first-ever scan immediately
    // reports 1 of 4 rather than 0 of 4.
    state.baseline = buildBaseline(state.sessions);
  }

  renderResult();
  openSheet('resultSheet');
  if (state.settings.speak) voice.say(state.plan.spoken);
}

/* ------------------------------------------------------------------ *
 * Rendering the result
 * ------------------------------------------------------------------ */

/** Paint the reading, readiness and prescription into the result sheet. */
function renderResult() {
  const reading = state.reading;
  const baseline = state.baseline;

  el('resultTitle').textContent = state.scanKind === 'resting'
    ? new Date().toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
    : 'After the session';

  el('outBpm').textContent = reading.bpm > 0 ? String(Math.round(reading.bpm)) : '—';
  el('outBpmRef').textContent = baseline.restingHr.n
    ? `usually ${Math.round(baseline.restingHr.centre)}`
    : 'no baseline yet';

  if (reading.hrv.reliable) {
    el('outHrv').textContent = `${Math.round(reading.hrv.rmssd)} ms`;
    el('outHrvRef').textContent = baseline.hrv.n
      ? `usually ${Math.round(baseline.hrv.centre)} ms`
      : `${reading.hrv.beats} beats`;
  } else {
    el('outHrv').textContent = '—';
    el('outHrvRef').textContent = 'not reliable in this scan';
  }

  el('outBreath').textContent = reading.breathsPerMin > 0
    ? `${Math.round(reading.breathsPerMin)}/min` : '—';
  el('outBreathRef').textContent = reading.breathSource === 'rsa'
    ? 'from beat rhythm' : reading.breathSource ? 'from frame drift' : '—';

  el('outGrade').textContent = reading.grade;
  el('outGradeRef').textContent = `${Math.round(reading.confidence * 100)}% · ${reading.snrDb.toFixed(1)} dB`;
  el('outGrade').className = `grade-${reading.grade}`;

  // Readiness dial: the stroke offset is the score, so a 0 reads as an empty
  // ring rather than as a missing element.
  const circumference = 2 * Math.PI * 50;
  const score = state.readiness.score;
  const dial = el('dialValue');
  dial.style.strokeDasharray = String(circumference);
  dial.style.strokeDashoffset = String(circumference * (1 - (score ?? 0) / 100));
  dial.setAttribute('class', `dial-value tone-${state.readiness.band.tone || 'neutral'}`);
  el('readinessScore').textContent = score === null ? `${baseline.n}/${BASELINE_MINIMUM}` : String(score);
  el('readinessBand').textContent = state.readiness.band.label;

  const drivers = el('readinessDrivers');
  drivers.textContent = '';
  if (state.readiness.note) {
    const note = document.createElement('p');
    note.className = 'driver-note';
    note.textContent = state.readiness.note;
    drivers.append(note);
  }
  for (const driver of state.readiness.drivers.slice(0, 4)) {
    const row = document.createElement('div');
    row.className = `driver ${driver.direction}`;
    row.innerHTML = `<span class="driver-label">${driver.label}</span>`
      + `<span class="driver-value">${driver.value}</span>`
      + `<span class="driver-ref">${driver.reference}</span>`;
    drivers.append(row);
  }
  if (!contextIsFresh() && reading.grade !== 'unusable') {
    const note = document.createElement('button');
    note.type = 'button';
    note.className = 'driver-cta';
    note.textContent = 'Answer today\'s four questions to sharpen this →';
    note.addEventListener('click', () => openSheet('contextSheet'));
    drivers.append(note);
  }

  const plan = state.plan;
  el('planVerdict').textContent = plan.verdict;
  el('planHeadline').textContent = plan.headline;
  el('planTitle').textContent = `${plan.session.title} · ${plan.session.minutes} min`;

  const blocks = el('planBlocks');
  blocks.textContent = '';
  for (const block of plan.session.blocks) {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${block.label}</strong><span>${block.detail}</span>`;
    blocks.append(item);
  }

  const zones = el('planZones');
  zones.textContent = '';
  for (const zone of plan.zones) {
    const chip = document.createElement('span');
    chip.className = `zone${zone.zone <= plan.capZone ? ' allowed' : ''}`;
    chip.textContent = `Z${zone.zone} ${zone.low}–${zone.high}`;
    chip.title = `${zone.name} — ${zone.feel}`;
    zones.append(chip);
  }

  const cautions = el('planCautions');
  cautions.textContent = '';
  for (const caution of plan.cautions) {
    const item = document.createElement('p');
    item.className = 'caution';
    item.textContent = caution;
    cautions.append(item);
  }
  for (const advice of reading.grade === 'good' ? [] : reading.advice) {
    const item = document.createElement('p');
    item.className = 'caution soft';
    item.textContent = advice;
    cautions.append(item);
  }

  const rationale = el('planRationale');
  rationale.textContent = '';
  for (const line of plan.rationale) {
    const item = document.createElement('li');
    item.textContent = line;
    rationale.append(item);
  }

  // Comparing a post-session scan with the morning's is the whole reason to
  // take one, so it leads rather than hiding in the trend list.
  if (state.scanKind !== 'resting' && state.restingToday && reading.grade !== 'unusable') {
    const comparison = compareScans(state.restingToday, {
      bpm: reading.bpm,
      rmssd: reading.hrv.rmssd,
      hrvReliable: reading.hrv.reliable,
      breathsPerMin: reading.breathsPerMin,
    });
    const item = document.createElement('p');
    item.className = 'caution compare';
    item.textContent = `Against this morning: ${comparison.text}`;
    cautions.prepend(item);
  }
}

/* ------------------------------------------------------------------ *
 * Breathing
 * ------------------------------------------------------------------ */

/** Start a paced breathing round with the camera still measuring. */
async function startBreathing() {
  if (!camera.stream) {
    try {
      await camera.start({ facingMode: state.facing });
      await camera.lockExposure();
      camera.onFrames(onFrame);
    } catch (error) {
      toast(error.message);
      return;
    }
  }
  closeAllSheets();
  el('startGate').hidden = true;
  el('scanPanel').hidden = true;
  el('breathPanel').hidden = false;

  const protocol = protocolFor(state.settings.protocol);
  state.samples = [];
  state.previousFrame = null;
  state.breath = {
    protocol,
    start: Date.now(),
    end: Date.now() + state.settings.breathMinutes * 60000,
    phase: null,
    rate: [],
    lastEstimateAt: 0,
  };
  state.mode = 'breathing';
  el('breathSub').textContent = `${protocol.name} — ${protocol.purpose}`;
  el('modeName').textContent = 'Breathing';
  if (state.settings.speak) {
    voice.say(`${protocol.name}. Follow the circle. Breathe into your belly, and let the exhale be longer than it feels natural.`);
  }
}

/** Advance a breathing round. */
function tickBreathing() {
  const round = state.breath;
  const now = Date.now();
  const elapsed = (now - round.start) / 1000;
  const guide = breathState(elapsed, round.protocol);

  el('breathLabel').textContent = guide.label;
  el('breathCount').textContent = String(Math.ceil(guide.remaining));
  el('breathOrb').style.setProperty('--scale', guide.scale.toFixed(3));
  el('breathOrb').dataset.phase = guide.phase;
  const left = Math.max(0, Math.round((round.end - now) / 1000));
  el('breathLeft').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  if (guide.phase !== round.phase) {
    round.phase = guide.phase;
    haptic(guide.phase === 'in' ? 26 : 12);
  }

  if (now - round.lastEstimateAt > 2000) {
    round.lastEstimateAt = now;
    const fps = measuredFps() || 30;
    const tail = state.samples.slice(-Math.round(fps * Math.max(24, cycleSeconds(round.protocol) * 2.5)));
    if (tail.length > fps * 10) {
      const live = estimateVitals(tail);
      if (live.bpm > 0) {
        el('breathBpm').textContent = String(Math.round(live.bpm));
        round.rate.push(live.bpm);
        if (round.rate.length > 90) round.rate.shift();
        drawBreathWave(round.rate);
        const response = breathingResponse({
          beatTimes: live.beatTimes,
          intervals: live.intervals,
          protocol: round.protocol,
        });
        el('breathSwing').textContent = response.ok ? `${response.swingBpm.toFixed(0)} bpm` : '—';
      }
    }
  }

  if (now >= round.end) finishBreathing();
}

/** End a breathing round and report what the pulse did. */
function finishBreathing() {
  const round = state.breath;
  // The round can end on its own timer and by the button, and the two can race.
  if (!round || state.mode !== 'breathing') return;
  state.mode = 'idle';
  el('breathPanel').hidden = true;
  haptic([30, 50, 30]);

  const reading = estimateVitals(state.samples);
  const response = breathingResponse({
    beatTimes: reading.beatTimes,
    intervals: reading.intervals,
    protocol: round.protocol,
  });
  const text = describeResponse(response);

  if (reading.grade !== 'unusable') {
    state.sessions = addSession(sessionRow({
      reading,
      kind: 'breathing',
      response: { ...response, protocolId: round.protocol.id },
    }));
  }

  const panel = el('breathResult');
  panel.hidden = false;
  panel.innerHTML = `<h3>${round.protocol.name}</h3>`
    + `<dl class="reading-grid inline">`
    + `<div class="reading"><dt>Swing</dt><dd>${response.ok ? `${response.swingBpm.toFixed(0)} bpm` : '—'}</dd></div>`
    + `<div class="reading"><dt>In time</dt><dd>${response.ok ? `${Math.round(response.coherence * 100)}%` : '—'}</dd></div>`
    + `<div class="reading"><dt>Pulse</dt><dd>${reading.bpm > 0 ? Math.round(reading.bpm) : '—'}</dd></div>`
    + `</dl><p>${text}</p>`;

  openSheet('breathSheet');
  if (state.settings.speak) voice.say(text);
  el('modeName').textContent = 'Resting scan';
}

/* ------------------------------------------------------------------ *
 * The coach conversation
 * ------------------------------------------------------------------ */

/**
 * Append a line to the conversation log.
 *
 * @param {string} who `you` or `coach`.
 * @param {string} text Line text.
 */
function logLine(who, text) {
  const log = el('coachLog');
  const line = document.createElement('div');
  line.className = `line ${who}`;
  line.textContent = text;
  log.append(line);
  log.scrollTop = log.scrollHeight;
}

/**
 * Answer a question, on-device or through the configured endpoint.
 *
 * @param {string} question What was asked.
 * @returns {Promise<void>} Resolves when an answer has been shown.
 */
async function askCoach(question) {
  if (!question.trim()) return;
  logLine('you', question);
  const context = {
    plan: state.plan,
    reading: {
      bpm: state.reading.bpm,
      rmssd: state.reading.hrv.rmssd,
      hrvReliable: state.reading.hrv.reliable,
      grade: state.reading.grade,
      confidence: state.reading.confidence,
    },
    baseline: state.baseline,
    readiness: state.readiness,
  };
  const offline = answer(question, context);

  if (!state.credentials?.key) {
    logLine('coach', offline.text);
    if (state.settings.speak) voice.say(offline.text);
    return;
  }

  logLine('coach', '…');
  const pending = el('coachLog').lastElementChild;
  try {
    const brief = briefFor({
      reading: state.reading,
      readiness: state.readiness,
      baseline: state.baseline,
      plan: state.plan,
      profile: state.profile,
      context: effectiveContext(),
    });
    const reply = await ask(question, brief, state.credentials);
    pending.textContent = reply;
    if (state.settings.speak) voice.say(reply);
  } catch (error) {
    // A failed request must never cost the athlete an answer: the rules-based
    // one was already computed, so it is shown instead of an error.
    pending.textContent = `${offline.text}`;
    toast(error.message);
  }
}

/* ------------------------------------------------------------------ *
 * Trends
 * ------------------------------------------------------------------ */

/**
 * Render one sparkline block.
 *
 * @param {string} id Container id.
 * @param {string} label Series label.
 * @param {Array<{at: number, value: number}>} series Points.
 * @param {string} unit Unit suffix.
 * @param {string} colour Stroke colour.
 */
function renderTrend(id, label, series, unit, colour) {
  const container = el(id);
  container.textContent = '';
  const heading = document.createElement('div');
  heading.className = 'trend-head';
  const latest = series.length ? series[series.length - 1].value : null;
  heading.innerHTML = `<span>${label}</span><strong>${latest === null ? '—' : `${Math.round(latest)}${unit}`}</strong>`;
  container.append(heading);

  if (series.length < 2) {
    const note = document.createElement('p');
    note.className = 'trend-empty';
    note.textContent = 'Two scans needed before there is a line to draw.';
    container.append(note);
    return;
  }

  const width = 300;
  const height = 56;
  const values = series.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(1e-6, high - low);
  const points = series.map((point, index) => {
    const x = (index / (series.length - 1)) * width;
    const y = height - 4 - ((point.value - low) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<polyline points="${points}" fill="none" stroke="${colour}" stroke-width="2" `
    + 'stroke-linejoin="round" stroke-linecap="round" />';
  container.append(svg);

  const range = document.createElement('p');
  range.className = 'trend-range';
  range.textContent = `${Math.round(low)}–${Math.round(high)}${unit} over ${series.length} scans`;
  container.append(range);
}

/** Repaint the trends sheet. */
function renderTrends() {
  state.baseline = buildBaseline(state.sessions);
  const baseline = state.baseline;
  const status = el('baselineState');
  status.className = `baseline-state ${baseline.ready ? 'ready' : 'building'}`;
  status.textContent = baseline.ready
    ? `Baseline from ${baseline.n} resting scans over ${Math.round(baseline.spanDays)} days: `
      + `${Math.round(baseline.restingHr.centre)} bpm ± ${baseline.restingHr.spread.toFixed(1)}`
      + (baseline.hrv.n ? `, HRV ${Math.round(baseline.hrv.centre)} ms ± ${baseline.hrv.spread.toFixed(1)}` : '')
    : `Baseline building — ${baseline.n} of ${BASELINE_MINIMUM} resting scans. `
      + 'Scan at the same time of day, before coffee, before training.';

  renderTrend('trendHr', 'Resting pulse', trendSeries(state.sessions, 'bpm'), ' bpm', '#a8f04a');
  renderTrend('trendHrv', 'Variability',
    trendSeries(state.sessions.filter((row) => row.hrvReliable), 'rmssd'), ' ms', '#78dcff');
  renderTrend('trendReadiness', 'Readiness', trendSeries(state.sessions, 'readiness'), '', '#ffd166');

  const list = el('sessionList');
  list.textContent = '';
  const rows = state.sessions.slice().sort((a, b) => b.at - a.at).slice(0, 24);
  if (!rows.length) {
    list.innerHTML = '<p class="trend-empty">No scans yet.</p>';
    return;
  }
  for (const row of rows) {
    const item = document.createElement('div');
    item.className = 'session-row';
    const when = new Date(row.at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    item.innerHTML = `<span class="when">${when}</span>`
      + `<span class="kind">${row.kind}</span>`
      + `<span class="vals">${Math.round(row.bpm)} bpm`
      + `${row.hrvReliable ? ` · ${Math.round(row.rmssd)} ms` : ''}`
      + `${row.readiness !== null ? ` · readiness ${row.readiness}` : ''}</span>`
      + `<span class="grade grade-${row.grade}">${row.grade}</span>`;
    list.append(item);
  }
}

/* ------------------------------------------------------------------ *
 * Settings, context and wiring
 * ------------------------------------------------------------------ */

/** Push stored settings into the settings sheet controls. */
function syncSettingsUi() {
  el('ageInput').value = String(state.profile.age);
  el('ageOut').textContent = String(state.profile.age);
  el('maxHrInput').value = String(state.profile.maxHr || 0);
  el('maxHrOut').textContent = state.profile.maxHr ? `${state.profile.maxHr} bpm` : 'not set';
  el('scanLenInput').value = String(state.settings.scanSeconds);
  el('scanLenOut').textContent = `${state.settings.scanSeconds} s`;
  el('speakToggle').checked = state.settings.speak;
  el('hapticToggle').checked = state.settings.haptics;
  el('waveToggle').checked = state.settings.showWaveform;
  el('breathMinutesInput').value = String(state.settings.breathMinutes);
  el('breathMinutesOut').textContent = `${state.settings.breathMinutes} min`;
  renderSegmented('goalSegmented', GOALS, state.profile.goal, (goal) => {
    state.profile = saveProfile({ goal });
  });
  renderSegmented('providerSegmented',
    PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label })),
    state.credentials?.provider || 'anthropic',
    (provider) => {
      state.credentials = { ...(state.credentials || {}), provider };
      el('providerHint').textContent = PROVIDERS.find((entry) => entry.id === provider).hint;
    });
  el('coachEngineNote').textContent = state.credentials?.key
    ? `Answering through ${PROVIDERS.find((entry) => entry.id === state.credentials.provider)?.label || 'your endpoint'}. `
      + 'The prescription itself is still decided on-device.'
    : 'Answering on-device. Add a key in Settings for conversational answers.';
}

/** Push stored answers into the context sheet controls. */
function syncContextUi() {
  const context = state.context;
  el('sleepInput').value = String(context.sleepHours);
  el('sleepOut').textContent = `${context.sleepHours} h`;
  el('sleepQualityInput').value = String(context.sleepQuality);
  el('sleepQualityOut').textContent = SLEEP_QUALITY_WORDS[context.sleepQuality];
  el('sorenessInput').value = String(context.soreness);
  el('sorenessOut').textContent = SORENESS_WORDS[context.soreness];
  el('stressInput').value = String(context.stress);
  el('stressOut').textContent = STRESS_WORDS[context.stress];
  el('alcoholInput').value = String(context.alcoholUnits);
  el('alcoholOut').textContent = context.alcoholUnits ? `${context.alcoholUnits}` : 'None';
  renderSegmented('plannedSegmented',
    TIERS.map((tier) => ({ id: tier, label: tier[0].toUpperCase() + tier.slice(1) })),
    context.planned,
    (planned) => { state.context.planned = planned; });
}

/** Render the breathing protocol picker. */
function renderProtocols() {
  const list = el('protocolList');
  list.textContent = '';
  for (const protocol of PROTOCOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `protocol${protocol.id === state.settings.protocol ? ' on' : ''}`;
    button.innerHTML = `<strong>${protocol.name}</strong><span>${protocol.purpose}</span>`;
    button.addEventListener('click', () => {
      state.settings = saveSettings({ protocol: protocol.id });
      renderProtocols();
    });
    list.append(button);
  }
}

/** Wire every control on the page. */
function wire() {
  el('startBtn').addEventListener('click', () => startScan(state.scanKind));
  el('cancelScanBtn').addEventListener('click', () => {
    state.mode = 'idle';
    el('scanPanel').hidden = true;
    el('startGate').hidden = false;
  });
  el('rescanBtn').addEventListener('click', () => startScan(state.scanKind));
  el('breatheBtn').addEventListener('click', () => {
    closeAllSheets();
    renderProtocols();
    el('breathResult').hidden = true;
    openSheet('breathSheet');
  });
  el('breathStartBtn').addEventListener('click', startBreathing);
  el('breathStopBtn').addEventListener('click', finishBreathing);
  el('askBtn').addEventListener('click', () => {
    closeAllSheets();
    openSheet('coachSheet');
    el('coachQuestion').focus();
  });
  el('contextBtn').addEventListener('click', () => {
    syncContextUi();
    openSheet('contextSheet');
  });

  el('menuBtn').addEventListener('click', () => {
    syncSettingsUi();
    openSheet('menuSheet');
  });
  el('trendsBtn').addEventListener('click', () => {
    renderTrends();
    openSheet('trendsSheet');
  });
  el('modeChip').addEventListener('click', () => {
    // The mode chip is also the switch between a resting scan and one taken
    // after training, because that distinction has to be trivially easy to make
    // — a post-session scan filed as resting poisons the baseline.
    state.scanKind = state.scanKind === 'resting' ? 'post-session' : 'resting';
    el('modeName').textContent = state.scanKind === 'resting' ? 'Resting scan' : 'Post-session scan';
    toast(state.scanKind === 'resting'
      ? 'Resting scans build your baseline.'
      : 'Post-session scans are kept out of the baseline.');
  });
  el('lensBtn').addEventListener('click', async () => {
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    el('preview').classList.toggle('mirror', state.facing === 'user');
    if (camera.stream) {
      try {
        await camera.start({ facingMode: state.facing });
        camera.onFrames(onFrame);
      } catch (error) {
        toast(error.message);
      }
    }
  });

  for (const link of ['helpLink', 'helpLink2']) {
    el(link).addEventListener('click', () => {
      closeAllSheets();
      openSheet('helpSheet');
    });
  }
  for (const button of document.querySelectorAll('[data-close]')) {
    button.addEventListener('click', (event) => {
      event.target.closest('.sheet').hidden = true;
    });
  }

  // Context sliders.
  const bindSlider = (inputId, outputId, format, apply) => {
    el(inputId).addEventListener('input', (event) => {
      const value = Number(event.target.value);
      el(outputId).textContent = format(value);
      apply(value);
    });
  };
  bindSlider('sleepInput', 'sleepOut', (v) => `${v} h`, (v) => { state.context.sleepHours = v; });
  bindSlider('sleepQualityInput', 'sleepQualityOut', (v) => SLEEP_QUALITY_WORDS[v], (v) => { state.context.sleepQuality = v; });
  bindSlider('sorenessInput', 'sorenessOut', (v) => SORENESS_WORDS[v], (v) => { state.context.soreness = v; });
  bindSlider('stressInput', 'stressOut', (v) => STRESS_WORDS[v], (v) => { state.context.stress = v; });
  bindSlider('alcoholInput', 'alcoholOut', (v) => (v ? String(v) : 'None'), (v) => { state.context.alcoholUnits = v; });

  el('contextSaveBtn').addEventListener('click', () => {
    state.context.answeredAt = Date.now();
    storeContext(state.context);
    closeSheet('contextSheet');
    if (state.reading) {
      // Re-score against the fresh answers without asking for another scan.
      const flat = {
        bpm: state.reading.bpm,
        rmssd: state.reading.hrv.rmssd,
        hrvReliable: state.reading.hrv.reliable,
        breathsPerMin: state.reading.breathsPerMin,
        confidence: state.reading.confidence,
        grade: state.reading.grade,
        advice: state.reading.advice,
      };
      const context = effectiveContext();
      state.readiness = readinessScore(flat, state.baseline, context);
      state.flags = anomalyFlags(flat, state.baseline, context);
      state.plan = prescribe({
        reading: flat,
        readiness: state.readiness,
        baseline: state.baseline,
        flags: state.flags,
        context,
        profile: state.profile,
        history: state.sessions,
      });
      renderResult();
      openSheet('resultSheet');
    }
  });

  // Settings.
  bindSlider('ageInput', 'ageOut', String, (v) => { state.profile = saveProfile({ age: v }); });
  bindSlider('maxHrInput', 'maxHrOut', (v) => (v ? `${v} bpm` : 'not set'),
    (v) => { state.profile = saveProfile({ maxHr: v || null }); });
  bindSlider('scanLenInput', 'scanLenOut', (v) => `${v} s`,
    (v) => { state.settings = saveSettings({ scanSeconds: v }); });
  bindSlider('breathMinutesInput', 'breathMinutesOut', (v) => `${v} min`,
    (v) => { state.settings = saveSettings({ breathMinutes: v }); });

  el('speakToggle').addEventListener('change', (event) => {
    state.settings = saveSettings({ speak: event.target.checked });
    voice.enabled = event.target.checked;
    if (!event.target.checked) voice.stop();
  });
  el('hapticToggle').addEventListener('change', (event) => {
    state.settings = saveSettings({ haptics: event.target.checked });
  });
  el('waveToggle').addEventListener('change', (event) => {
    state.settings = saveSettings({ showWaveform: event.target.checked });
  });

  el('saveKeyBtn').addEventListener('click', () => {
    const key = el('apiKeyInput').value.trim();
    if (!key) {
      toast('Paste a key first.');
      return;
    }
    const provider = state.credentials?.provider || 'anthropic';
    state.credentials = { provider, key };
    saveCredentials(state.credentials);
    el('apiKeyInput').value = '';
    syncSettingsUi();
    toast('Key stored in this browser only.');
  });
  el('forgetKeyBtn').addEventListener('click', () => {
    state.credentials = null;
    saveCredentials(null);
    syncSettingsUi();
    toast('Key forgotten.');
  });

  // Coach.
  el('coachForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const question = el('coachQuestion').value;
    el('coachQuestion').value = '';
    askCoach(question);
  });
  el('coachMicBtn').addEventListener('click', () => {
    if (!Ears.supported()) {
      toast('This browser cannot listen. Type instead.');
      return;
    }
    if (ears.listening) {
      ears.stop();
      return;
    }
    el('coachMicBtn').classList.add('listening');
    ears.listen({
      onPartial: (text) => { el('coachQuestion').value = text; },
      onResult: (text) => {
        el('coachQuestion').value = '';
        askCoach(text);
      },
      onError: () => toast('Did not catch that.'),
      onEnd: () => el('coachMicBtn').classList.remove('listening'),
    });
  });

  const suggestions = [
    'Why this session?',
    'Can I push anyway?',
    'What are my zones?',
    'How accurate is this?',
    'What does my variability mean?',
  ];
  const suggestionBox = el('coachSuggestions');
  for (const suggestion of suggestions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.textContent = suggestion;
    button.addEventListener('click', () => askCoach(suggestion));
    suggestionBox.append(button);
  }

  // Trends.
  el('exportCsvBtn').addEventListener('click', () => {
    download('baseline-sessions.csv', toCsv(state.sessions), 'text/csv');
  });
  el('exportJsonBtn').addEventListener('click', () => {
    download('baseline-export.json', toJson(state.sessions, state.profile), 'application/json');
  });
  el('clearBtn').addEventListener('click', () => {
    if (!confirm('Erase every scan, setting and stored key on this device? This cannot be undone.')) return;
    clearAll();
    state.sessions = [];
    state.credentials = null;
    state.profile = loadProfile();
    state.settings = loadSettings();
    renderTrends();
    toast('Everything erased.');
  });

  // Speech synthesis populates its voice list asynchronously on most browsers.
  if (Voice.supported()) speechSynthesis.addEventListener('voiceschanged', () => voice.pickVoice());

  // A backgrounded tab stops delivering frames; finishing a scan from stale
  // samples would report a rate measured over a gap.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'scanning') {
      state.mode = 'idle';
      el('scanPanel').hidden = true;
      el('startGate').hidden = false;
      toast('Scan cancelled — the camera stopped when the app went to the background.');
    }
  });
}

/** Start the app. */
function boot() {
  state.context = loadContext();
  voice.enabled = state.settings.speak;
  el('preview').classList.add('mirror');
  el('engineText').textContent = CameraFeed.hasFrameClock() ? 'frame clock' : 'animation clock';
  syncSettingsUi();
  syncContextUi();
  renderProtocols();
  wire();

  const baseline = buildBaseline(state.sessions);
  if (baseline.n) {
    el('gateNote').textContent = baseline.ready
      ? `Baseline ready from ${baseline.n} resting scans — ${Math.round(baseline.restingHr.centre)} bpm typical.`
      : `Baseline building: ${baseline.n} of ${BASELINE_MINIMUM} resting scans.`;
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* Offline support is a bonus; the app runs without it. */
    });
  }
}

boot();
