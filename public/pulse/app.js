/**
 * PULSE — camera capture, presentation and session state.
 *
 * All estimation lives in `vitals-core.js`; this module owns the parts that
 * need a browser: the media stream, the per-frame sampler, the canvases, and
 * the session log. It targets iOS Safari, Android Chrome and desktop browsers
 * from one code path — every platform difference is handled by feature
 * detection, never by user-agent sniffing.
 *
 * @module pulse/app
 */

import {
  ANALYSIS_HZ,
  MIN_WINDOW_SECONDS,
  MAX_WINDOW_SECONDS,
  analyzeBuffer,
  assessQuality,
  classifyRate,
  clamp01,
  createRateTracker,
  createSampleBuffer,
  frameMotion,
  meanRgbInRegion,
  roiForMode,
} from './vitals-core.js';

/** Processing resolution. Small on purpose: the ROI mean is all we need, and
 *  a 192×144 readback keeps the loop cheap enough for older phones. */
const PROC_WIDTH = 192;
const PROC_HEIGHT = 144;
/** Motion is measured on a coarse luma grid sampled from the ROI. */
const MOTION_COLS = 16;
const MOTION_ROWS = 12;
/** How often the spectral estimate is recomputed (ms). */
const ANALYSIS_INTERVAL_MS = 400;
/** How often the face detector runs, when the platform has one (ms). */
const FACE_INTERVAL_MS = 350;
const STORAGE_KEY = 'pulse.readings.v1';

const $ = (id) => document.getElementById(id);

const els = {
  video: $('video'),
  stage: document.querySelector('.stage-video'),
  idleBody: $('stage-idle-body'),
  roiBox: $('roi-box'),
  qualityChip: $('quality-chip'),
  qualityText: $('quality-text'),
  qualityDot: $('quality-chip').querySelector('.dot'),
  fpsChip: $('fps-chip'),
  countdown: $('countdown'),
  countdownArc: $('countdown-arc'),
  countdownText: $('countdown-text'),
  start: $('start'),
  flip: $('flip'),
  torch: $('torch'),
  modeFace: $('mode-face'),
  modeFinger: $('mode-finger'),
  modeHint: $('mode-hint'),
  bpm: $('bpm'),
  bpmBand: $('bpm-band'),
  heart: $('heart'),
  confidenceBar: $('confidence-bar'),
  confidenceValue: $('confidence-value'),
  stabilityBar: $('stability-bar'),
  stabilityValue: $('stability-value'),
  statSnr: $('stat-snr'),
  statIbi: $('stat-ibi'),
  statRmssd: $('stat-rmssd'),
  statElapsed: $('stat-elapsed'),
  waveform: $('waveform'),
  spectrum: $('spectrum'),
  log: $('log'),
  save: $('save'),
  export: $('export'),
  clearLog: $('clear-log'),
  banner: $('banner'),
  install: $('install'),
  help: $('help'),
  helpOpen: $('help-open'),
  helpClose: $('help-close'),
};

const state = {
  mode: /** @type {'face'|'finger'} */ ('face'),
  facing: /** @type {'user'|'environment'} */ ('user'),
  running: false,
  stream: /** @type {MediaStream|null} */ (null),
  track: /** @type {MediaStreamTrack|null} */ (null),
  torchOn: false,
  torchSupported: false,
  buffer: createSampleBuffer(),
  tracker: createRateTracker({ windowSeconds: 10, minConfidence: 0.35 }),
  startedAt: 0,
  lastAnalysisAt: 0,
  lastFaceAt: 0,
  face: /** @type {{x: number, y: number, width: number, height: number}|null} */ (null),
  faceDetector: null,
  facePending: false,
  previousLuma: /** @type {Float64Array|null} */ (null),
  motion: 0,
  frameTimes: [],
  latest: /** @type {object|null} */ (null),
  lastTraces: /** @type {object|null} */ (null),
  nextBeatAt: 0,
  wakeLock: null,
  rvfcHandle: 0,
  rafHandle: 0,
  bannerTimer: 0,
  readings: loadReadings(),
};

const proc = document.createElement('canvas');
proc.width = PROC_WIDTH;
proc.height = PROC_HEIGHT;
const procCtx = proc.getContext('2d', { willReadFrequently: true });

/* ---------------------------------------------------------------------------
   Camera
   ------------------------------------------------------------------------ */

/** Constraints for the current camera choice. `ideal` rather than `exact` so a
 *  single-camera laptop still gets a stream instead of an overconstrained
 *  rejection. */
function videoConstraints() {
  return {
    video: {
      facingMode: { ideal: state.facing },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 60 },
    },
    audio: false,
  };
}

/** Acquire the camera and begin sampling. */
async function startCapture() {
  if (!window.isSecureContext) {
    showBanner('Camera access needs a secure context. Open this page over HTTPS or on localhost.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showBanner('This browser does not expose camera access. Try Safari on iOS, or Chrome elsewhere.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(videoConstraints());
    state.stream = stream;
    state.track = stream.getVideoTracks()[0] ?? null;
    els.video.srcObject = stream;
    // iOS will not start an inline stream without an explicit play() inside
    // the user gesture that produced it.
    await els.video.play();

    resetSession();
    state.running = true;
    state.startedAt = performance.now();
    els.stage.classList.add('is-live');
    els.stage.classList.toggle('is-mirrored', state.mode === 'face' && state.facing === 'user');
    els.stage.classList.toggle('is-finger', state.mode === 'finger');
    els.start.textContent = 'Stop';
    els.start.classList.add('is-recording');
    els.countdown.hidden = false;
    els.fpsChip.hidden = false;
    setUpTorch();
    await requestWakeLock();
    if (state.mode === 'finger' && state.torchSupported && !state.torchOn) await setTorch(true);
    scheduleFrame();
  } catch (error) {
    reportCameraError(error);
  }
}

/** Release the camera and freeze the last reading on screen. */
function stopCapture() {
  state.running = false;
  if (state.rvfcHandle && els.video.cancelVideoFrameCallback) {
    els.video.cancelVideoFrameCallback(state.rvfcHandle);
  }
  cancelAnimationFrame(state.rafHandle);
  state.rvfcHandle = 0;
  state.rafHandle = 0;
  if (state.torchOn) setTorch(false).catch(() => {});
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.track = null;
  els.video.srcObject = null;
  els.stage.classList.remove('is-live');
  els.start.textContent = 'Start reading';
  els.start.classList.remove('is-recording');
  els.countdown.hidden = true;
  els.fpsChip.hidden = true;
  els.torch.hidden = true;
  setQuality({ level: 'idle', hint: 'Idle' });
  releaseWakeLock();
}

/** Turn a getUserMedia rejection into something a person can act on. */
function reportCameraError(error) {
  const name = error?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    showBanner('Camera permission was denied. Allow camera access for this site in your browser settings, then press Start again.', 9000);
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    showBanner('No camera matched that request. Try the Flip button, or switch capture mode.', 8000);
  } else if (name === 'NotReadableError') {
    showBanner('The camera is already in use by another app or tab. Close it and try again.', 8000);
  } else {
    showBanner(`Could not start the camera: ${error?.message ?? error}`, 8000);
  }
  stopCapture();
}

/** Detect torch support on the active track (Android Chrome; not iOS). */
function setUpTorch() {
  const capabilities = state.track?.getCapabilities?.() ?? {};
  state.torchSupported = Boolean(capabilities.torch);
  els.torch.hidden = !state.torchSupported;
  els.torch.setAttribute('aria-pressed', String(state.torchOn));
}

/** Toggle the rear torch, which makes fingertip readings far more reliable. */
async function setTorch(on) {
  if (!state.track || !state.torchSupported) return;
  try {
    await state.track.applyConstraints({ advanced: [{ torch: on }] });
    state.torchOn = on;
    els.torch.setAttribute('aria-pressed', String(on));
  } catch {
    state.torchSupported = false;
    els.torch.hidden = true;
  }
}

/** Keep the screen awake while a reading is in progress, where supported. */
async function requestWakeLock() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    state.wakeLock = null;
  }
}

function releaseWakeLock() {
  state.wakeLock?.release?.().catch(() => {});
  state.wakeLock = null;
}

/* ---------------------------------------------------------------------------
   Frame loop
   ------------------------------------------------------------------------ */

/**
 * Queue the next frame. `requestVideoFrameCallback` fires once per decoded
 * frame with a media timestamp, which is what the estimator wants; browsers
 * without it fall back to the animation frame clock.
 */
function scheduleFrame() {
  if (!state.running) return;
  if (typeof els.video.requestVideoFrameCallback === 'function') {
    state.rvfcHandle = els.video.requestVideoFrameCallback((now) => onFrame(now));
  } else {
    state.rafHandle = requestAnimationFrame((now) => onFrame(now));
  }
}

/**
 * Sample one frame: reduce the ROI to a mean colour, measure movement, and
 * periodically re-run the estimator.
 *
 * @param {number} now High-resolution timestamp (ms).
 */
function onFrame(now) {
  if (!state.running) return;
  const video = els.video;
  if (!video.videoWidth) { scheduleFrame(); return; }

  procCtx.drawImage(video, 0, 0, PROC_WIDTH, PROC_HEIGHT);
  const image = procCtx.getImageData(0, 0, PROC_WIDTH, PROC_HEIGHT);

  maybeDetectFace(now);
  const roi = roiForMode(state.mode, PROC_WIDTH, PROC_HEIGHT, scaleFaceToProc(state.face));
  const stats = meanRgbInRegion(image, roi, { skinOnly: state.mode === 'face' });

  const luma = sampleLumaGrid(image, roi);
  state.motion = state.motion * 0.6 + frameMotion(state.previousLuma, luma) * 0.4;
  state.previousLuma = luma;

  state.buffer.push({
    t: now / 1000,
    r: stats.r,
    g: stats.g,
    b: stats.b,
    motion: state.motion,
    brightness: stats.brightness,
  });

  trackFps(now);

  if (now - state.lastAnalysisAt >= ANALYSIS_INTERVAL_MS) {
    state.lastAnalysisAt = now;
    // Reading the stage geometry forces layout, so it rides the analysis tick
    // rather than every frame; the ROI barely moves between ticks.
    positionRoiBox(roi);
    runAnalysis(now, stats);
  }
  animateHeart(now);
  scheduleFrame();
}

/** Rolling frame-rate readout, averaged over the last second of frames. */
function trackFps(now) {
  state.frameTimes.push(now);
  while (state.frameTimes.length > 2 && now - state.frameTimes[0] > 1000) state.frameTimes.shift();
  if (state.frameTimes.length > 2) {
    const span = (now - state.frameTimes[0]) / 1000;
    els.fpsChip.textContent = `${Math.round((state.frameTimes.length - 1) / span)} fps`;
  }
}

/**
 * Coarse luma grid over the ROI, used as a motion proxy. Cheaper and more
 * robust than tracking features, and enough to tell "held still" from "moved".
 *
 * @returns {Float64Array} MOTION_COLS × MOTION_ROWS luma samples.
 */
function sampleLumaGrid(image, roi) {
  const grid = new Float64Array(MOTION_COLS * MOTION_ROWS);
  for (let row = 0; row < MOTION_ROWS; row += 1) {
    for (let col = 0; col < MOTION_COLS; col += 1) {
      const x = Math.min(image.width - 1, Math.max(0, Math.round(roi.x + ((col + 0.5) / MOTION_COLS) * roi.width)));
      const y = Math.min(image.height - 1, Math.max(0, Math.round(roi.y + ((row + 0.5) / MOTION_ROWS) * roi.height)));
      const i = (y * image.width + x) * 4;
      grid[row * MOTION_COLS + col] = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
    }
  }
  return grid;
}

/**
 * Run the platform face detector when one exists, at a low duty cycle.
 * Absent a detector the ROI falls back to the on-screen alignment guide, so
 * this is an enhancement rather than a requirement.
 */
function maybeDetectFace(now) {
  if (state.mode !== 'face') { state.face = null; return; }
  if (!state.faceDetector || state.facePending || now - state.lastFaceAt < FACE_INTERVAL_MS) return;
  state.lastFaceAt = now;
  state.facePending = true;
  state.faceDetector
    .detect(els.video)
    .then((faces) => {
      const box = faces?.[0]?.boundingBox;
      if (!box) { state.face = null; return; }
      const next = { x: box.x, y: box.y, width: box.width, height: box.height };
      // Smooth the box so the ROI does not jitter frame to frame.
      state.face = state.face
        ? {
            x: state.face.x * 0.7 + next.x * 0.3,
            y: state.face.y * 0.7 + next.y * 0.3,
            width: state.face.width * 0.7 + next.width * 0.3,
            height: state.face.height * 0.7 + next.height * 0.3,
          }
        : next;
    })
    .catch(() => { state.faceDetector = null; })
    .finally(() => { state.facePending = false; });
}

/** Map a face box in video pixels onto the processing canvas. */
function scaleFaceToProc(face) {
  if (!face || !els.video.videoWidth) return undefined;
  const sx = PROC_WIDTH / els.video.videoWidth;
  const sy = PROC_HEIGHT / els.video.videoHeight;
  return { x: face.x * sx, y: face.y * sy, width: face.width * sx, height: face.height * sy };
}

/* ---------------------------------------------------------------------------
   Analysis and presentation
   ------------------------------------------------------------------------ */

/** Recompute the estimate and refresh every readout. */
function runAnalysis(now, frameStats) {
  const elapsed = (now - state.startedAt) / 1000;
  els.statElapsed.textContent = `${elapsed.toFixed(1)} s`;

  const result = analyzeBuffer(state.buffer, {
    mode: state.mode,
    fs: ANALYSIS_HZ,
    minWindowSeconds: MIN_WINDOW_SECONDS,
    maxWindowSeconds: MAX_WINDOW_SECONDS,
  });

  const quality = assessQuality({
    mode: state.mode,
    brightness: frameStats.brightness,
    clippedFraction: frameStats.clippedFraction,
    skinFraction: state.mode === 'face' ? frameStats.skinFraction : 1,
    motion: state.motion,
    snrDb: result.status === 'ready' ? result.snrDb : undefined,
  });

  if (result.status === 'acquiring') {
    setProgress(result.progress);
    setQuality({
      level: quality.level,
      hint: quality.level === 'good' ? `Acquiring — ${Math.round(result.progress * 100)}%` : quality.hint,
    });
    els.bpm.classList.add('is-stale');
    return;
  }

  setProgress(1);
  setQuality(quality);
  // Held so a resize or rotation can repaint the traces immediately rather
  // than leaving them blank until the next analysis tick.
  state.lastTraces = { waveform: result.waveform, spectrum: result.spectrum, bpm: result.bpm };
  drawWaveform(result.waveform);
  drawSpectrum(result.spectrum, result.bpm);

  // Motion corrupts the estimate more than it corrupts the spectrum, so gate
  // the tracker on capture quality as well as spectral confidence.
  const confidence = result.confidence * (0.5 + 0.5 * quality.score);
  state.tracker.push(now / 1000, result.bpm, confidence);
  const tracked = state.tracker.value();

  els.statSnr.textContent = `${result.snrDb.toFixed(1)} dB`;
  if (result.variability) {
    els.statIbi.textContent = `${Math.round(result.variability.meanIbi)} ms`;
    els.statRmssd.textContent = `${Math.round(result.variability.rmssd)} ms`;
  }

  if (!tracked) {
    els.bpm.classList.add('is-stale');
    els.bpmBand.textContent = 'Signal too weak — adjust and hold still';
    setMeter(els.confidenceBar, els.confidenceValue, confidence);
    setMeter(els.stabilityBar, els.stabilityValue, 0);
    return;
  }

  state.latest = {
    bpm: tracked.bpm,
    confidence: tracked.confidence,
    stability: tracked.stability,
    snrDb: result.snrDb,
    rmssd: result.variability?.rmssd ?? null,
    meanIbi: result.variability?.meanIbi ?? null,
    mode: state.mode,
    elapsed,
  };
  els.bpm.classList.remove('is-stale');
  els.bpm.textContent = String(Math.round(tracked.bpm));
  const band = classifyRate(tracked.bpm);
  els.bpmBand.textContent = band.label;
  els.bpmBand.className = `bpm-band is-${band.tone}`;
  setMeter(els.confidenceBar, els.confidenceValue, tracked.confidence);
  setMeter(els.stabilityBar, els.stabilityValue, tracked.stability);
  els.save.disabled = false;
}

/** Update one labelled meter with a 0..1 value. */
function setMeter(bar, label, value) {
  const pct = Math.round(clamp01(value) * 100);
  bar.style.width = `${pct}%`;
  bar.classList.toggle('is-low', pct < 45);
  label.textContent = `${pct}%`;
}

/** Update the acquisition ring. */
function setProgress(fraction) {
  const circumference = 100.5; // 2πr with r = 16
  els.countdownArc.style.strokeDashoffset = String(circumference * (1 - clamp01(fraction)));
  els.countdownText.textContent = `${Math.round(clamp01(fraction) * 100)}%`;
}

/** Update the capture-quality chip. */
function setQuality({ level, hint }) {
  els.qualityText.textContent = hint;
  els.qualityDot.className = `dot${level === 'idle' ? '' : ` dot-${level}`}`;
}

/** Position the ROI marker over the displayed video, honouring object-fit: cover. */
function positionRoiBox(roi) {
  const rect = els.stage.getBoundingClientRect();
  if (!rect.width || !els.video.videoWidth) return;
  // The processing canvas is a straight scale of the video frame, so mapping
  // ROI -> display only needs the cover transform.
  const scale = Math.max(rect.width / PROC_WIDTH, rect.height / PROC_HEIGHT);
  const offsetX = (rect.width - PROC_WIDTH * scale) / 2;
  const offsetY = (rect.height - PROC_HEIGHT * scale) / 2;
  const mirrored = els.stage.classList.contains('is-mirrored');
  const left = mirrored
    ? rect.width - (offsetX + (roi.x + roi.width) * scale)
    : offsetX + roi.x * scale;
  els.roiBox.style.left = `${left}px`;
  els.roiBox.style.top = `${offsetY + roi.y * scale}px`;
  els.roiBox.style.width = `${roi.width * scale}px`;
  els.roiBox.style.height = `${roi.height * scale}px`;
}

/** Pulse the heart glyph in time with the tracked rate. */
function animateHeart(now) {
  const bpm = state.latest?.bpm;
  if (!bpm) return;
  if (!state.nextBeatAt) state.nextBeatAt = now;
  if (now < state.nextBeatAt) return;
  state.nextBeatAt = now + (60 / bpm) * 1000;
  els.heart.classList.remove('is-beating');
  void els.heart.offsetWidth; // restart the animation
  els.heart.classList.add('is-beating');
}

/* ---------------------------------------------------------------------------
   Canvases
   ------------------------------------------------------------------------ */

/** CSS height of each trace canvas, captured before the backing store is
 *  resized — reading the markup attribute back would compound by the pixel
 *  ratio on every redraw. */
const canvasHeights = new WeakMap();

/** Size a canvas to its CSS box at device pixel ratio. Returns its context. */
function prepareCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 320;
  if (!canvasHeights.has(canvas)) canvasHeights.set(canvas, Number(canvas.getAttribute('height')) || 120);
  const height = canvasHeights.get(canvas);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/** Repaint both traces at the current canvas size, if there is anything to show. */
function redrawTraces() {
  if (!state.lastTraces) {
    prepareCanvas(els.waveform);
    prepareCanvas(els.spectrum);
    return;
  }
  drawWaveform(state.lastTraces.waveform);
  drawSpectrum(state.lastTraces.spectrum, state.lastTraces.bpm);
}

/** Draw the band-passed pulse waveform, newest sample at the right edge. */
function drawWaveform(signal) {
  const { ctx, width, height } = prepareCanvas(els.waveform);
  if (!signal?.length) return;
  // Show the trailing few seconds — enough beats to read, few enough to see.
  const visible = Math.min(signal.length, ANALYSIS_HZ * 8);
  const start = signal.length - visible;
  let peak = 1e-9;
  for (let i = start; i < signal.length; i += 1) peak = Math.max(peak, Math.abs(signal[i]));

  ctx.strokeStyle = 'rgba(56, 240, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i < visible; i += 1) {
    const x = (i / (visible - 1)) * width;
    const y = height / 2 - (signal[start + i] / peak) * (height / 2 - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = '#38f0ff';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(56, 240, 255, 0.55)';
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Draw the band-limited spectrum with the selected peak marked. */
function drawSpectrum(spectrum, bpm) {
  const { ctx, width, height } = prepareCanvas(els.spectrum);
  if (!spectrum?.power?.length) return;
  const { bpms, power } = spectrum;
  let peak = 1e-20;
  for (let i = 0; i < power.length; i += 1) peak = Math.max(peak, power[i]);

  const bars = Math.min(power.length, 160);
  const barWidth = width / bars;
  for (let i = 0; i < bars; i += 1) {
    const index = Math.round((i / (bars - 1)) * (power.length - 1));
    const magnitude = Math.sqrt(power[index] / peak);
    const barHeight = magnitude * (height - 18);
    const isPeak = Math.abs(bpms[index] - bpm) < 4;
    ctx.fillStyle = isPeak ? 'rgba(56, 240, 255, 0.95)' : 'rgba(56, 240, 255, 0.28)';
    ctx.fillRect(i * barWidth, height - 14 - barHeight, Math.max(1, barWidth - 1), barHeight);
  }

  // Axis ticks every 30 bpm across the analysed band.
  ctx.fillStyle = 'rgba(223, 234, 242, 0.35)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const lo = bpms[0];
  const hi = bpms[bpms.length - 1];
  for (let value = Math.ceil(lo / 30) * 30; value <= hi; value += 30) {
    const x = ((value - lo) / (hi - lo)) * width;
    ctx.fillRect(x, height - 13, 1, 4);
    ctx.fillText(String(value), x, height - 2);
  }
}

/* ---------------------------------------------------------------------------
   Session log
   ------------------------------------------------------------------------ */

/** Read saved readings out of local storage, tolerating a corrupted value. */
function loadReadings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistReadings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.readings.slice(-100)));
  } catch {
    // Private mode or a full quota: the session still works, it just forgets.
  }
}

/** Commit the current reading to the log. */
function saveReading() {
  if (!state.latest) return;
  state.readings.push({
    at: new Date().toISOString(),
    bpm: Math.round(state.latest.bpm),
    confidence: Number(state.latest.confidence.toFixed(3)),
    stability: Number(state.latest.stability.toFixed(3)),
    snrDb: Number(state.latest.snrDb.toFixed(2)),
    rmssdMs: state.latest.rmssd == null ? null : Math.round(state.latest.rmssd),
    meanIbiMs: state.latest.meanIbi == null ? null : Math.round(state.latest.meanIbi),
    mode: state.latest.mode,
  });
  persistReadings();
  renderLog();
}

function renderLog() {
  els.log.innerHTML = '';
  if (!state.readings.length) {
    const empty = document.createElement('li');
    empty.className = 'log-empty';
    empty.textContent = 'No saved readings yet.';
    els.log.append(empty);
    els.export.disabled = true;
    els.clearLog.disabled = true;
    return;
  }
  for (const reading of [...state.readings].reverse().slice(0, 20)) {
    const item = document.createElement('li');
    const bpm = document.createElement('span');
    bpm.className = 'log-bpm';
    bpm.textContent = String(reading.bpm);
    const when = document.createElement('span');
    when.className = 'log-time';
    when.textContent = new Date(reading.at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const meta = document.createElement('span');
    meta.className = 'log-meta';
    meta.textContent = `${reading.mode.toUpperCase()} · ${Math.round(reading.confidence * 100)}% conf`;
    item.append(bpm, when, meta);
    els.log.append(item);
  }
  els.export.disabled = false;
  els.clearLog.disabled = false;
}

/** Export the log as CSV via an object URL. */
function exportCsv() {
  if (!state.readings.length) return;
  const header = 'timestamp,bpm,mode,confidence,stability,snr_db,mean_ibi_ms,rmssd_ms';
  const rows = state.readings.map((r) => [
    r.at, r.bpm, r.mode, r.confidence, r.stability, r.snrDb, r.meanIbiMs ?? '', r.rmssdMs ?? '',
  ].join(','));
  const blob = new Blob([`${[header, ...rows].join('\n')}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pulse-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------------------------------------------------------------------------
   Session lifecycle and chrome
   ------------------------------------------------------------------------ */

/** Clear every per-session accumulator between readings. */
function resetSession() {
  state.buffer.clear();
  state.tracker.clear();
  state.previousLuma = null;
  state.motion = 0;
  state.frameTimes = [];
  state.latest = null;
  state.lastTraces = null;
  state.face = null;
  state.nextBeatAt = 0;
  state.lastAnalysisAt = 0;
  els.bpm.textContent = '--';
  els.bpm.classList.add('is-stale');
  els.bpmBand.textContent = 'Acquiring signal';
  els.bpmBand.className = 'bpm-band';
  els.statSnr.textContent = '--';
  els.statIbi.textContent = '--';
  els.statRmssd.textContent = '--';
  els.statElapsed.textContent = '0.0 s';
  els.save.disabled = true;
  setMeter(els.confidenceBar, els.confidenceValue, 0);
  setMeter(els.stabilityBar, els.stabilityValue, 0);
  setProgress(0);
  prepareCanvas(els.waveform);
  prepareCanvas(els.spectrum);
}

/** Show a transient message at the foot of the screen. */
function showBanner(message, duration = 6000) {
  els.banner.textContent = message;
  els.banner.hidden = false;
  clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => { els.banner.hidden = true; }, duration);
}

/** Switch capture mode, restarting the stream if one is running. */
async function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  // A fingertip goes on the rear camera and its torch; a face wants the
  // selfie camera. Flip still overrides either choice afterwards.
  state.facing = mode === 'finger' ? 'environment' : 'user';
  els.modeFace.classList.toggle('is-active', mode === 'face');
  els.modeFinger.classList.toggle('is-active', mode === 'finger');
  els.modeHint.textContent = mode === 'face'
    ? 'Face mode: sit still in even, indirect light and keep your forehead inside the guide.'
    : 'Fingertip mode: cover the rear camera and its torch with one fingertip, resting lightly — do not press hard.';
  els.idleBody.innerHTML = mode === 'face'
    ? 'Press <strong>Start</strong> and allow camera access. Everything is processed locally.'
    : 'Press <strong>Start</strong>, then rest a fingertip over the rear camera and torch.';
  if (state.running) {
    stopCapture();
    await startCapture();
  }
}

/** Swap between the front and rear camera. */
async function flipCamera() {
  state.facing = state.facing === 'user' ? 'environment' : 'user';
  if (state.running) {
    stopCapture();
    await startCapture();
  }
}

function wireEvents() {
  els.start.addEventListener('click', () => {
    if (state.running) stopCapture();
    else startCapture();
  });
  els.flip.addEventListener('click', () => flipCamera());
  els.torch.addEventListener('click', () => setTorch(!state.torchOn));
  els.modeFace.addEventListener('click', () => setMode('face'));
  els.modeFinger.addEventListener('click', () => setMode('finger'));
  els.save.addEventListener('click', saveReading);
  els.export.addEventListener('click', exportCsv);
  els.clearLog.addEventListener('click', () => {
    state.readings = [];
    persistReadings();
    renderLog();
  });
  els.helpOpen.addEventListener('click', () => els.help.showModal());
  els.helpClose.addEventListener('click', () => els.help.close());

  window.addEventListener('resize', redrawTraces);
  window.addEventListener('orientationchange', redrawTraces);

  // A backgrounded tab stops delivering frames; stop cleanly rather than
  // stitching a gap into the middle of a reading.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running) {
      stopCapture();
      showBanner('Reading stopped because the app moved to the background.');
    }
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    els.install.hidden = false;
    els.install.onclick = async () => {
      els.install.hidden = true;
      event.prompt();
      await event.userChoice;
    };
  });
}

/** Register the offline cache; harmless when the browser has no support. */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}

function init() {
  if (typeof window.FaceDetector === 'function') {
    try {
      state.faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
      state.faceDetector = null;
    }
  }
  wireEvents();
  renderLog();
  resetSession();
  registerServiceWorker();
  if (!window.isSecureContext) {
    showBanner('Camera access needs HTTPS or localhost. On a phone, open this page over HTTPS.', 10000);
  }
}

init();
