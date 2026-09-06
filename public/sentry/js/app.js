/**
 * Wiring: camera in, drawn frame and written summaries out.
 *
 * The interesting work lives in the modules this file imports — geometry in
 * `ground`, segmentation in `scene`, identity in `tracker`, the writing in
 * `dossier`. What is left here is the loop that runs them in order, the
 * rendering, and the setup surfaces, and it is arranged around two decisions
 * that shape everything else.
 *
 * **Two resolutions.** Analysis runs at 192 pixels wide and display at whatever
 * the screen is. A phone cannot segment, label and track a 1080p frame thirty
 * times a second, and does not need to: a subject at 192 wide is still forty
 * pixels tall, which is ample for a silhouette, a foot position and a step
 * rhythm. The overlay is drawn at display resolution from analysis-resolution
 * coordinates, so the boxes are crisp while the maths stays cheap.
 *
 * **The camera clock, not the wall clock.** Every timestamp comes from the
 * frame's own media time where the browser provides one. Speed is a distance
 * over a time, and a time taken from `Date.now()` while the main thread is busy
 * laying out a panel turns a walking subject into a running one.
 *
 * @module sentry/app
 */

import { CameraFeed } from '../../baseline/js/camera.js';
import { fitPose, groundPoint, horizonRow, imagePoint, pose, scaleAtRow } from './ground.js';
import { blobs, clean, createBackground, segment, updateBackground } from './scene.js';
import { Tracker } from './tracker.js';
import { ZoneWatch } from './zones.js';
import { VitalsProbe } from './vitals.js';
import { VIEWS, accumulate, render } from './views.js';
import { digest, measure, toText, write } from './dossier.js';
import { RfLink, capability, contactToGround } from './rf.js';
import { PROVIDERS, loadCredentials, narrate, saveCredentials } from './llm.js';

/** Width every frame is analysed at. Everything metric is derived at this size. */
const ANALYSIS_WIDTH = 192;

const el = (id) => document.getElementById(id);

const ui = {
  video: el('video'),
  view: el('view'),
  overlay: el('overlay'),
  empty: el('viewport-empty'),
  start: el('start'),
  supportNote: el('support-note'),
  statusChip: el('status-chip'),
  viewSwitch: el('view-switch'),
  readout: el('readout'),
  readoutTracks: el('readout-tracks'),
  readoutScale: el('readout-scale'),
  tabs: el('tabs'),
  subjects: el('subjects'),
  subjectsEmpty: el('subjects-empty'),
  plan: el('plan'),
  planNote: el('plan-note'),
  planClear: el('plan-clear'),
  export: el('export'),
  events: el('events'),
  eventsEmpty: el('events-empty'),
  settings: el('settings'),
  settingsToggle: el('settings-toggle'),
  settingsClose: el('settings-close'),
  calWidth: el('cal-width'),
  calDepth: el('cal-depth'),
  calStart: el('cal-start'),
  calClear: el('cal-clear'),
  calStatus: el('cal-status'),
  poseHeight: el('pose-height'),
  poseTilt: el('pose-tilt'),
  poseFov: el('pose-fov'),
  poseApply: el('pose-apply'),
  zoneName: el('zone-name'),
  zoneLoiter: el('zone-loiter'),
  zoneArea: el('zone-area'),
  zoneWire: el('zone-wire'),
  drawingBar: el('drawing-bar'),
  drawingHint: el('drawing-hint'),
  drawingDone: el('drawing-done'),
  drawingCancel: el('drawing-cancel'),
  zoneList: el('zone-list'),
  sensitivity: el('sensitivity'),
  sensitivityValue: el('sensitivity-value'),
  rejectShadows: el('reject-shadows'),
  holdStill: el('hold-still'),
  relearn: el('relearn'),
  blurFaces: el('blur-faces'),
  retention: el('retention'),
  retentionValue: el('retention-value'),
  llmProvider: el('llm-provider'),
  llmKey: el('llm-key'),
  llmSave: el('llm-save'),
  llmForget: el('llm-forget'),
  llmStatus: el('llm-status'),
  rfState: el('rf-state'),
  rfUrl: el('rf-url'),
  rfConnect: el('rf-connect'),
  rfDisconnect: el('rf-disconnect'),
  rfOptions: el('rf-options'),
};

const state = {
  camera: new CameraFeed(ui.video),
  running: false,
  view: 'natural',
  tab: 'subjects',
  background: null,
  trail: null,
  processed: null,
  tracker: new Tracker(),
  watch: new ZoneWatch([]),
  probes: new Map(),
  pose: null,
  poseSource: null,
  frameSize: { width: 0, height: 0 },
  events: [],
  history: [],
  zones: [],
  drawing: null,
  calibrating: false,
  calMarks: [],
  narration: new Map(),
  rf: { state: 'absent', detail: 'no sensor attached', contacts: [], sensor: null },
  lastFrameMs: 0,
  fps: 0,
};

const viewCtx = ui.view.getContext('2d');
const overlayCtx = ui.overlay.getContext('2d');
const planCtx = ui.plan.getContext('2d');
const scratch = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

/* ------------------------------------------------------------------ startup */

function buildViewSwitch() {
  ui.viewSwitch.innerHTML = '';
  for (const view of VIEWS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.role = 'tab';
    button.className = `view-chip${view.id === state.view ? ' view-chip-on' : ''}`;
    button.dataset.view = view.id;
    button.textContent = view.label;
    button.title = view.hint;
    button.addEventListener('click', () => {
      state.view = view.id;
      for (const chip of ui.viewSwitch.children) {
        chip.classList.toggle('view-chip-on', chip.dataset.view === view.id);
      }
      setStatus(view.hint, 'quiet');
    });
    ui.viewSwitch.append(button);
  }
}

function buildProviders() {
  ui.llmProvider.innerHTML = '';
  for (const provider of PROVIDERS) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.label;
    ui.llmProvider.append(option);
  }
  const stored = loadCredentials();
  if (stored) {
    ui.llmProvider.value = stored.provider;
    ui.llmStatus.textContent = `Narration on via ${stored.model}.`;
  }
}

function setStatus(text, tone = 'quiet') {
  ui.statusChip.textContent = text;
  ui.statusChip.className = `chip chip-${tone}`;
}

async function startCamera() {
  if (!CameraFeed.supported()) {
    ui.supportNote.textContent =
      'This browser will not open a camera. That needs HTTPS or localhost — a page opened from disk cannot.';
    return;
  }
  ui.start.disabled = true;
  setStatus('Opening camera…', 'quiet');
  try {
    await state.camera.start({ facingMode: 'environment', width: 1280, height: 720 });
    await state.camera.ready();
  } catch (error) {
    ui.start.disabled = false;
    ui.supportNote.textContent = `Camera refused: ${error?.message ?? error}`;
    setStatus('Camera blocked', 'warn');
    return;
  }
  ui.empty.hidden = true;
  ui.readout.hidden = false;
  state.running = true;
  setStatus('Learning the scene…', 'quiet');
  state.camera.onFrames(onFrame);
}

/* -------------------------------------------------------------- frame cycle */

/**
 * One camera frame: analyse, track, then draw.
 *
 * @param {number} timeMs Capture time from the media clock where available.
 * @returns {void}
 */
function onFrame(timeMs) {
  const frame = state.camera.grab(ANALYSIS_WIDTH);
  if (!frame) return;

  if (state.frameSize.width !== frame.width || state.frameSize.height !== frame.height) {
    state.frameSize = { width: frame.width, height: frame.height };
    state.background = createBackground(frame.width, frame.height);
    state.trail = new Float32Array(frame.width * frame.height);
    scratch.width = frame.width;
    scratch.height = frame.height;
    state.processed = scratchCtx.createImageData(frame.width, frame.height);
    if (state.poseSource === 'manual') applyManualPose();
  }

  const dt = timeMs - state.lastFrameMs;
  if (dt > 0 && dt < 1000) state.fps = state.fps * 0.9 + (1000 / dt) * 0.1;
  state.lastFrameMs = timeMs;

  const detection = segment(state.background, frame, {
    sensitivity: Number(ui.sensitivity.value),
    rejectShadows: ui.rejectShadows.checked,
  });
  const mask = clean(detection.mask, frame.width, frame.height);
  const regions = blobs(mask, frame.width, frame.height, {
    minArea: Math.max(8, Math.round((frame.width * frame.height) / 2400)),
    energy: detection.energy,
  });

  // Pixels belonging to a tracked subject are held out of the background update
  // when asked, so somebody standing still does not dissolve into the wall
  // behind them and reappear as a hole when they move.
  const hold = ui.holdStill.checked ? holdMask(mask, regions, frame.width, frame.height) : null;
  updateBackground(state.background, frame, { rate: state.background.frames < 12 ? 6 : 1, hold });

  const usable = state.background.frames > 20 ? regions : [];
  const { live, retired } = state.tracker.update(usable, timeMs, { frame, width: frame.width });
  observeVitals(live, frame, timeMs);

  const raised = state.watch.evaluate(live, timeMs);
  if (raised.length) {
    // The media clock says when in the footage this happened; the wall clock
    // says when it happened. The log needs the second one — every row showing
    // the time the list was last drawn is not a log.
    for (const event of raised) state.events.unshift({ ...event, at: Date.now() });
    state.events.length = Math.min(state.events.length, 300);
    renderEvents();
    const worst = raised.find((e) => e.type === 'loiter') ?? raised[0];
    setStatus(worst.detail, worst.type === 'loiter' ? 'warn' : 'live');
  }
  for (const track of retired) {
    state.history.unshift(snapshot(track));
    state.probes.delete(track.id);
    state.narration.delete(track.id);
  }
  purgeHistory(timeMs);

  accumulate(state.trail, detection.energy);
  drawView(frame, mask);
  drawOverlay(live, frame);
  renderSubjects(live, timeMs);
  if (state.tab === 'plan') drawPlan(live);

  ui.readoutTracks.textContent = `${live.length} tracked · ${state.fps.toFixed(0)} fps`;
  if (state.background.frames === 21) setStatus('Watching', 'live');
}

/**
 * Mark the pixels of confirmed subjects so the background update skips them.
 *
 * @param {Uint8Array} mask Cleaned foreground mask.
 * @param {import('./scene.js').Blob[]} regions Detected regions.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {Uint8Array} Hold mask.
 */
function holdMask(mask, regions, width, height) {
  const hold = new Uint8Array(mask.length);
  for (const region of regions) {
    for (let y = Math.max(0, region.minY - 1); y <= Math.min(height - 1, region.maxY + 1); y += 1) {
      for (let x = Math.max(0, region.minX - 1); x <= Math.min(width - 1, region.maxX + 1); x += 1) {
        hold[y * width + x] = 1;
      }
    }
  }
  return hold;
}

/**
 * Feed each track's vitals probe, creating and retiring probes with tracks.
 *
 * @param {object[]} live Confirmed tracks.
 * @param {ImageData} frame Analysis frame.
 * @param {number} timeMs Frame time.
 * @returns {void}
 */
function observeVitals(live, frame, timeMs) {
  const seen = new Set();
  for (const track of live) {
    if (!track.lastBlob) continue;
    seen.add(track.id);
    let probe = state.probes.get(track.id);
    if (!probe) {
      probe = new VitalsProbe();
      state.probes.set(track.id, probe);
    }
    probe.observe({
      timeMs,
      speedMps: track.speedMps,
      frame,
      width: frame.width,
      blob: track.lastBlob,
    });
  }
  for (const id of [...state.probes.keys()]) if (!seen.has(id)) state.probes.delete(id);
}

/* ------------------------------------------------------------------ drawing */

function sizeCanvases() {
  const rect = ui.view.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  for (const canvas of [ui.view, ui.overlay]) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }
}

/**
 * Paint the selected view, scaled to the display canvas.
 *
 * @param {ImageData} frame Analysis frame.
 * @param {Uint8Array} mask Foreground mask.
 * @returns {void}
 */
function drawView(frame, mask) {
  if (state.view === 'natural') {
    drawCover(ui.view, viewCtx, ui.video);
    return;
  }
  render(state.view, { frame, mask, energy: null, trail: state.trail }, state.processed);
  scratchCtx.putImageData(state.processed, 0, 0);
  drawCover(ui.view, viewCtx, scratch);
}

/**
 * Draw a source over a canvas the way `object-fit: cover` would.
 *
 * @param {HTMLCanvasElement} canvas Destination.
 * @param {CanvasRenderingContext2D} ctx Its context.
 * @param {CanvasImageSource} source Video or canvas to draw.
 * @returns {void}
 */
function drawCover(canvas, ctx, source) {
  const sw = source.videoWidth ?? source.width;
  const sh = source.videoHeight ?? source.height;
  if (!sw || !sh) return;
  const scale = Math.max(canvas.width / sw, canvas.height / sh);
  const w = sw * scale;
  const h = sh * scale;
  ctx.imageSmoothingEnabled = state.view !== 'silhouette';
  ctx.drawImage(source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}

/**
 * Map an analysis-resolution point onto the display canvas.
 *
 * @param {number} u Analysis column.
 * @param {number} v Analysis row.
 * @returns {{x: number, y: number, scale: number}} Display position and the
 *   scale factor between the two, for sizing boxes.
 */
function toDisplay(u, v) {
  const { width, height } = state.frameSize;
  const scale = Math.max(ui.overlay.width / width, ui.overlay.height / height);
  return {
    x: (ui.overlay.width - width * scale) / 2 + u * scale,
    y: (ui.overlay.height - height * scale) / 2 + v * scale,
    scale,
  };
}

/**
 * Boxes, paths, zones and labels over the live picture.
 *
 * @param {object[]} live Confirmed tracks.
 * @param {ImageData} frame Analysis frame.
 * @returns {void}
 */
function drawOverlay(live, frame) {
  const ctx = overlayCtx;
  ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);

  if (state.pose) drawZonesOnImage(ctx);
  drawCalibrationMarks(ctx);

  for (const track of live) {
    const colour = trackColour(track.id);
    const blob = track.lastBlob;
    if (!blob) continue;
    const topLeft = toDisplay(blob.minX, blob.minY);
    const bottomRight = toDisplay(blob.maxX + 1, blob.maxY + 1);
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;

    if (ui.blurFaces.checked) obscureHead(ctx, topLeft, w, h);

    ctx.strokeStyle = colour;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(topLeft.x, topLeft.y, w, h);

    // The path, drawn in image space so it lies where the subject walked.
    ctx.beginPath();
    let started = false;
    for (const point of track.path) {
      const p = toDisplay(point.u, point.v);
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const label = state.pose
      ? `${track.id} · ${track.distanceM.toFixed(1)} m · ${track.speedMps.toFixed(2)} m/s`
      : `${track.id} · uncalibrated`;
    ctx.font = `${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const plateWidth = ctx.measureText(label).width + 10 * dpr;
    // Keep the plate inside the picture. A subject at the right-hand edge is
    // the one arriving, and their readout is what gets cut off.
    const plateX = Math.max(0, Math.min(topLeft.x, ui.overlay.width - plateWidth));
    const plateY = topLeft.y < 22 * dpr ? bottomRight.y + 4 * dpr : topLeft.y - 20 * dpr;
    ctx.fillStyle = 'rgba(7, 9, 12, 0.82)';
    ctx.fillRect(plateX, plateY, plateWidth, 18 * dpr);
    ctx.fillStyle = colour;
    ctx.fillText(label, plateX + 5 * dpr, plateY + 13 * dpr);
  }

  if (state.pose && state.view !== 'natural') {
    const row = horizonRow(state.pose);
    if (row > 0 && row < frame.height) {
      const p = toDisplay(0, row);
      const end = toDisplay(frame.width, row);
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.28)';
      ctx.setLineDash([6 * dpr, 6 * dpr]);
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * Pixelate the head region of a tracked subject.
 *
 * The default is on. It costs nothing analytically — every measurement is taken
 * from the frame before this runs — and it means a screen left facing a room
 * does not show identifiable faces to whoever walks past it.
 *
 * @param {CanvasRenderingContext2D} ctx Overlay context.
 * @param {{x: number, y: number}} topLeft Box corner on the display.
 * @param {number} w Box width.
 * @param {number} h Box height.
 * @returns {void}
 */
function obscureHead(ctx, topLeft, w, h) {
  const headHeight = Math.max(8, h * 0.22);
  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
  ctx.fillRect(topLeft.x + w * 0.15, topLeft.y, w * 0.7, headHeight);
  ctx.restore();
}

/**
 * Draw ground zones back onto the live image.
 *
 * @param {CanvasRenderingContext2D} ctx Overlay context.
 * @returns {void}
 */
function drawZonesOnImage(ctx) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  for (const zone of state.zones) {
    const points = zone.points
      .map((p) => imagePoint(state.pose, p.x, p.y))
      .filter(Boolean)
      .map((p) => toDisplay(p.u, p.v));
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (zone.kind === 'area') ctx.closePath();
    ctx.strokeStyle = zone.kind === 'tripwire' ? 'rgba(255, 176, 90, 0.9)' : 'rgba(120, 220, 255, 0.85)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
    if (zone.kind === 'area') {
      ctx.fillStyle = 'rgba(120, 220, 255, 0.1)';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(200, 232, 255, 0.9)';
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.fillText(zone.name, points[0].x + 4 * dpr, points[0].y - 5 * dpr);
  }
}

/**
 * Draw the calibration corners the operator has placed so far.
 *
 * @param {CanvasRenderingContext2D} ctx Overlay context.
 * @returns {void}
 */
function drawCalibrationMarks(ctx) {
  if (!state.calibrating && !state.drawing) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const marks = state.calibrating ? state.calMarks : state.drawing.points;
  ctx.fillStyle = state.calibrating ? '#8fe3c0' : '#ffd08a';
  for (const mark of marks) {
    const p = toDisplay(mark.u, mark.v);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A stable colour per track id.
 *
 * @param {number} id Track id.
 * @returns {string} CSS colour.
 */
function trackColour(id) {
  const hues = [162, 32, 200, 280, 96, 12, 240];
  return `hsl(${hues[id % hues.length]} 85% 62%)`;
}

/* ---------------------------------------------------------------- plan view */

/**
 * The ground plan: paths in metres, seen from above.
 *
 * This is the view the whole calibration exists for. An image path tells you a
 * subject moved across the frame; a ground path tells you they went round the
 * side of the building, stopped at the door for forty seconds, and left the way
 * they came.
 *
 * @param {object[]} live Confirmed tracks.
 * @returns {void}
 */
function drawPlan(live) {
  const ctx = planCtx;
  const { width, height } = ui.plan;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#080b10';
  ctx.fillRect(0, 0, width, height);
  if (!state.pose) {
    ui.planNote.hidden = false;
    return;
  }
  ui.planNote.hidden = true;

  const paths = [...live.map(snapshot), ...state.history].filter((t) => t.path.some((p) => p.x !== null));
  let maxX = 4;
  let maxY = 8;
  for (const track of paths) {
    for (const point of track.path) {
      if (point.x === null) continue;
      maxX = Math.max(maxX, Math.abs(point.x) + 1);
      maxY = Math.max(maxY, point.y + 1);
    }
  }
  // A margin at the bottom, or the camera glyph — the one fixed landmark on the
  // plan — is drawn half off the canvas at the origin.
  const margin = 26;
  const scale = Math.min(width / (maxX * 2), (height - margin) / maxY);
  const toPlan = (x, y) => ({ x: width / 2 + x * scale, y: height - margin - y * scale });

  // Metre grid, so the picture has a unit rather than just a shape.
  ctx.strokeStyle = 'rgba(140, 170, 210, 0.12)';
  ctx.lineWidth = 1;
  const step = maxY > 30 ? 5 : maxY > 12 ? 2 : 1;
  ctx.font = '10px ui-monospace, monospace';
  for (let m = 0; m <= maxY; m += step) {
    const p = toPlan(-maxX, m);
    const q = toPlan(maxX, m);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    // A grid with no units is a texture. Label the range lines so the picture
    // can be read as distances from the camera rather than as a shape.
    if (m > 0) {
      ctx.fillStyle = 'rgba(140, 170, 210, 0.45)';
      ctx.fillText(`${m} m`, 6, p.y - 3);
    }
  }
  for (let m = -Math.floor(maxX); m <= maxX; m += step) {
    const p = toPlan(m, 0);
    const q = toPlan(m, maxY);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }

  for (const zone of state.zones) {
    const points = zone.points.map((p) => toPlan(p.x, p.y));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (zone.kind === 'area') {
      ctx.closePath();
      ctx.fillStyle = 'rgba(120, 220, 255, 0.09)';
      ctx.fill();
    }
    ctx.strokeStyle = zone.kind === 'tripwire' ? 'rgba(255, 176, 90, 0.85)' : 'rgba(120, 220, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const track of paths) {
    const colour = trackColour(track.id);
    ctx.beginPath();
    let started = false;
    for (const point of track.path) {
      if (point.x === null) continue;
      const p = toPlan(point.x, point.y);
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = colour;
    ctx.globalAlpha = track.live ? 0.95 : 0.4;
    ctx.lineWidth = track.live ? 2.5 : 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const last = [...track.path].reverse().find((p) => p.x !== null);
    if (last && track.live) {
      const p = toPlan(last.x, last.y);
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(`${track.id} · ${track.distanceM.toFixed(1)} m`, p.x + 7, p.y - 6);
    }
  }

  // Any RF contacts, drawn as rings rather than dots: the sensor knows a range
  // and a bearing, not a position, and the drawing should not claim otherwise.
  for (const contact of state.rf.contacts) {
    const ground = contactToGround(contact, { x: 0, y: 0, headingDeg: 0 });
    const p = toPlan(ground.x, ground.y);
    ctx.strokeStyle = `rgba(255, 120, 180, ${0.25 + contact.confidence * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  const camera = toPlan(0, 0);
  ctx.fillStyle = '#f5f7fb';
  ctx.beginPath();
  ctx.moveTo(camera.x, camera.y);
  ctx.lineTo(camera.x - 7, camera.y + 11);
  ctx.lineTo(camera.x + 7, camera.y + 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(200, 216, 236, 0.6)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('camera', camera.x + 10, camera.y + 10);
}

/**
 * A plain copy of a track, safe to keep after the track is gone.
 *
 * @param {object} track Live track.
 * @returns {object} Snapshot.
 */
function snapshot(track) {
  return {
    id: track.id,
    live: track.misses === 0,
    path: track.path.map((p) => ({ t: p.t, x: p.x, y: p.y, u: p.u, v: p.v })),
    distanceM: track.distanceM,
    lastSeenMs: track.lastSeenMs,
  };
}

/**
 * Drop history older than the retention setting.
 *
 * @param {number} nowMs Current frame time.
 * @returns {void}
 */
function purgeHistory(nowMs) {
  const keepMs = Number(ui.retention.value) * 60_000;
  state.history = state.history.filter((track) => nowMs - track.lastSeenMs <= keepMs);
  state.events = state.events.filter((event) => nowMs - event.timeMs <= keepMs);
}

/* ------------------------------------------------------------------- panels */

/**
 * The subject list, one card per live track with its written summary.
 *
 * @param {object[]} live Confirmed tracks.
 * @param {number} nowMs Frame time.
 * @returns {void}
 */
function renderSubjects(live, nowMs) {
  if (state.tab !== 'subjects') return;
  ui.subjectsEmpty.hidden = live.length > 0;
  const existing = new Map([...ui.subjects.children].map((node) => [Number(node.dataset.id), node]));
  const wanted = new Set(live.map((t) => t.id));
  for (const [id, node] of existing) if (!wanted.has(id)) node.remove();

  for (const track of live) {
    const probe = state.probes.get(track.id);
    const vitals = probe ? probe.read(nowMs) : null;
    const events = state.events.filter((e) => e.trackId === track.id).slice(0, 6).reverse();
    const record = measure(track, { events, vitals });
    const summary = write(record);

    let node = existing.get(track.id);
    if (!node) {
      node = document.createElement('li');
      node.className = 'subject';
      node.dataset.id = String(track.id);
      ui.subjects.append(node);
    }
    node.style.setProperty('--track', trackColour(track.id));
    node.innerHTML = '';

    const head = document.createElement('h3');
    head.textContent = summary.headline;
    node.append(head);

    const list = document.createElement('ul');
    list.className = 'facts';
    for (const line of summary.lines) {
      const item = document.createElement('li');
      item.textContent = line;
      list.append(item);
    }
    node.append(list);

    const metrics = document.createElement('dl');
    metrics.className = 'metrics';
    for (const [label, value] of metricPairs(record)) {
      // Each pair is wrapped, because a bare run of dt/dd children flowed into
      // a multi-column grid puts one measurement's label beside the next one's
      // value — a table that reads as though the subject were 6.7 m tall.
      const cell = document.createElement('div');
      cell.className = 'metric';
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      cell.append(dt, dd);
      metrics.append(cell);
    }
    node.append(metrics);

    const caveats = document.createElement('p');
    caveats.className = 'caveats';
    caveats.textContent = summary.caveats.join(' ');
    node.append(caveats);

    const narrated = state.narration.get(track.id);
    if (narrated) {
      const quote = document.createElement('p');
      quote.className = 'narration';
      quote.textContent = narrated;
      node.append(quote);
    }

    const actions = document.createElement('div');
    actions.className = 'subject-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'ghost';
    copy.textContent = 'Copy summary';
    copy.addEventListener('click', () => navigator.clipboard?.writeText(toText(record)));
    actions.append(copy);
    if (loadCredentials()?.key) {
      const say = document.createElement('button');
      say.type = 'button';
      say.className = 'ghost';
      say.textContent = 'Narrate';
      say.addEventListener('click', async () => {
        say.disabled = true;
        say.textContent = 'Asking…';
        const result = await narrate(digest(record));
        state.narration.set(track.id, result.text || `Narration failed: ${result.error}`);
        say.disabled = false;
        say.textContent = 'Narrate';
      });
      actions.append(say);
    }
    node.append(actions);
  }
}

/**
 * The measurement table shown under each summary.
 *
 * @param {object} record A record from `dossier.measure`.
 * @returns {Array<[string, string]>} Label and value pairs.
 */
function metricPairs(record) {
  const pairs = [
    ['Seen', `${record.durationSec.toFixed(1)} s`],
    ['Walked', record.heightM === null ? '—' : `${record.distanceM.toFixed(1)} m`],
    ['Speed', record.heightM === null ? '—' : `${record.meanSpeedMps.toFixed(2)} m/s avg`],
    ['Now', record.heightM === null ? '—' : `${record.speedMps.toFixed(2)} m/s`],
    ['Height', record.heightM === null ? '—' : `${record.heightM.toFixed(2)} m`],
    ['Posture', `${record.posture} (${record.aspect.toFixed(1)}:1)`],
    ['Cadence', record.cadence?.confident ? `${Math.round(record.cadence.stepsPerMin)} spm` : '—'],
    ['Pauses', `${Math.round(record.dwellSec)} s`],
    ['Reversals', String(record.reversals)],
    ['Breathing', record.vitals?.breathsPerMin ? `${Math.round(record.vitals.breathsPerMin)}/min` : '—'],
    ['Pulse', record.vitals?.bpm ? `${Math.round(record.vitals.bpm)} bpm` : '—'],
  ];
  return pairs;
}

function renderEvents() {
  ui.eventsEmpty.hidden = state.events.length > 0;
  ui.events.innerHTML = '';
  for (const event of state.events.slice(0, 60)) {
    const item = document.createElement('li');
    item.className = `event event-${event.type}`;
    const when = new Date(event.at ?? Date.now()).toLocaleTimeString();
    item.innerHTML = `<span class="event-type">${event.type}</span><span>${event.detail}</span><time>${when}</time>`;
    ui.events.append(item);
  }
}

function renderZoneList() {
  ui.zoneList.innerHTML = '';
  for (const zone of state.zones) {
    const item = document.createElement('li');
    item.textContent = `${zone.name} — ${zone.kind}${zone.loiterSec ? `, loiter ${zone.loiterSec}s` : ''}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ghost';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      state.zones = state.zones.filter((z) => z.id !== zone.id);
      state.watch.setZones(state.zones);
      renderZoneList();
    });
    item.append(remove);
    ui.zoneList.append(item);
  }
}

function renderRf() {
  const info = capability();
  const live = state.rf.state === 'live' && state.rf.contacts.length > 0;
  ui.rfState.className = `rf-state rf-${state.rf.state}`;
  ui.rfState.innerHTML = live
    ? `<strong>${state.rf.sensor?.label ?? 'RF sensor'} connected.</strong><p>${state.rf.contacts.length} contact(s) this frame.</p>`
    : `<strong>${state.rf.state === 'absent' ? info.headline : state.rf.detail}</strong><p>${info.detail}</p>`;
  ui.rfOptions.innerHTML = '';
  for (const option of info.options) {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${option.name}</strong> — ${option.note}`;
    ui.rfOptions.append(item);
  }
}

/* -------------------------------------------------------------- interaction */

/**
 * Convert a pointer event on the viewport into analysis-frame coordinates.
 *
 * @param {PointerEvent} event Pointer event.
 * @returns {{u: number, v: number}|null} Analysis coordinates, or null when the
 *   frame size is not yet known.
 */
function toAnalysis(event) {
  const { width, height } = state.frameSize;
  if (!width) return null;
  const rect = ui.overlay.getBoundingClientRect();
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const px = (event.clientX - rect.left) * dpr;
  const py = (event.clientY - rect.top) * dpr;
  const scale = Math.max(ui.overlay.width / width, ui.overlay.height / height);
  return {
    u: (px - (ui.overlay.width - width * scale) / 2) / scale,
    v: (py - (ui.overlay.height - height * scale) / 2) / scale,
  };
}

function onViewportPointer(event) {
  const point = toAnalysis(event);
  if (!point) return;
  if (state.calibrating) {
    state.calMarks.push(point);
    if (state.calMarks.length === 4) finishCalibration();
    return;
  }
  if (state.drawing && state.pose) {
    const ground = groundPoint(state.pose, point.u, point.v);
    if (!ground) {
      ui.calStatus.textContent = 'That point is above the horizon — it is not on the ground.';
      return;
    }
    state.drawing.points.push(point);
    state.drawing.ground.push({ x: ground.x, y: ground.y });
    if (state.drawing.kind === 'tripwire' && state.drawing.ground.length === 2) finishZone();
  }
}

function finishCalibration() {
  const fit = fitPose(state.calMarks, {
    widthM: Number(ui.calWidth.value),
    depthM: Number(ui.calDepth.value),
    width: state.frameSize.width,
    height: state.frameSize.height,
  });
  state.calibrating = false;
  if (!fit) {
    ui.calStatus.textContent = 'Those four points do not describe a ground rectangle. Try again.';
    return;
  }
  applyPose(fit.pose, 'rectangle');
  ui.calStatus.textContent =
    `Calibrated: camera ${fit.pose.heightM.toFixed(1)} m up, tilted ${fit.pose.tiltDeg.toFixed(0)}°, ` +
    `${fit.pose.fovDeg.toFixed(0)}° lens. Fit residual ${(fit.residualM * 100).toFixed(0)} cm.`;
  ui.poseHeight.value = fit.pose.heightM.toFixed(1);
  ui.poseTilt.value = fit.pose.tiltDeg.toFixed(0);
  ui.poseFov.value = fit.pose.fovDeg.toFixed(0);
}

function applyManualPose() {
  // The pose depends on the frame's pixel dimensions, which are not known until
  // the first frame arrives. Someone who types their camera height in before
  // opening the camera should not have the setting silently discarded, so the
  // intent is recorded and the frame-size handler applies it.
  state.poseSource = 'manual';
  if (!state.frameSize.width) {
    ui.calStatus.textContent = 'Saved — it will take effect when the camera opens.';
    return;
  }
  applyPose(
    pose({
      heightM: Number(ui.poseHeight.value),
      tiltDeg: Number(ui.poseTilt.value),
      fovDeg: Number(ui.poseFov.value),
      width: state.frameSize.width,
      height: state.frameSize.height,
    }),
    'manual',
  );
  ui.calStatus.textContent = 'Using the camera position you entered.';
}

/**
 * Adopt a pose everywhere it is used.
 *
 * @param {import('./ground.js').Pose} next New pose.
 * @param {string} source How it was obtained.
 * @returns {void}
 */
function applyPose(next, source) {
  state.pose = next;
  state.poseSource = source;
  state.tracker.setPose(next);
  const scale = scaleAtRow(next, next.height * 0.85);
  ui.readoutScale.textContent = scale
    ? `${(scale * 100).toFixed(1)} cm per pixel at the bottom of frame`
    : 'calibration does not reach the ground here';
  ui.readoutScale.classList.remove('muted');
}

function finishZone() {
  const drawing = state.drawing;
  state.drawing = null;
  ui.drawingBar.hidden = true;
  if (!drawing || drawing.ground.length < (drawing.kind === 'tripwire' ? 2 : 3)) return;
  const loiter = Number(ui.zoneLoiter.value);
  state.zones.push({
    id: `z${Date.now().toString(36)}`,
    name: ui.zoneName.value.trim() || `Zone ${state.zones.length + 1}`,
    kind: drawing.kind,
    points: drawing.ground,
    loiterSec: drawing.kind === 'area' && loiter > 0 ? loiter : undefined,
    direction: 'either',
  });
  state.watch.setZones(state.zones);
  ui.zoneName.value = '';
  renderZoneList();
}

function beginZone(kind) {
  if (!state.pose) {
    ui.calStatus.textContent = 'Calibrate the ground first — zones are placed in metres, not pixels.';
    return;
  }
  state.drawing = { kind, points: [], ground: [] };
  ui.drawingHint.textContent =
    kind === 'tripwire' ? 'Tap the two ends of the line.' : 'Tap the corners of the area, then Finish.';
  ui.drawingDone.hidden = kind === 'tripwire';
  ui.drawingBar.hidden = false;
  ui.settings.hidden = true;
  ui.settingsToggle.setAttribute('aria-expanded', 'false');
}

function exportSession() {
  const payload = {
    exportedAt: new Date().toISOString(),
    calibration: state.pose
      ? { heightM: state.pose.heightM, tiltDeg: state.pose.tiltDeg, fovDeg: state.pose.fovDeg }
      : null,
    zones: state.zones,
    events: state.events,
    // Live tracks as well as finished ones: a subject still in the yard is the
    // one most worth exporting.
    tracks: [...state.tracker.tracks.filter((t) => t.confirmed).map(snapshot), ...state.history].map((track) => ({
      id: track.id,
      distanceM: Number(track.distanceM.toFixed(2)),
      path: track.path
        .filter((p) => p.x !== null)
        .map((p) => ({ t: p.t, x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) })),
    })),
    note: 'Movement measurements only. No imagery, no identity, no biometric template.',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sentry-session-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* --------------------------------------------------------------- event wire */

function wire() {
  ui.start.addEventListener('click', startCamera);
  ui.overlay.addEventListener('pointerdown', onViewportPointer);

  ui.tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;
    state.tab = tab.dataset.tab;
    for (const button of ui.tabs.children) button.classList.toggle('tab-on', button === tab);
    for (const id of ['subjects', 'plan', 'events', 'rf']) {
      el(`tab-${id}`).hidden = id !== state.tab;
    }
    if (state.tab === 'rf') renderRf();
  });

  ui.settingsToggle.addEventListener('click', () => {
    ui.settings.hidden = !ui.settings.hidden;
    ui.settingsToggle.setAttribute('aria-expanded', String(!ui.settings.hidden));
  });
  ui.settingsClose.addEventListener('click', () => {
    ui.settings.hidden = true;
    ui.settingsToggle.setAttribute('aria-expanded', 'false');
  });

  ui.calStart.addEventListener('click', () => {
    state.calibrating = true;
    state.calMarks = [];
    ui.settings.hidden = true;
    ui.settingsToggle.setAttribute('aria-expanded', 'false');
    ui.calStatus.textContent = 'Tap the four corners of the rectangle, in order around it.';
  });
  ui.calClear.addEventListener('click', () => {
    state.calMarks = [];
    state.calibrating = false;
    state.pose = null;
    state.poseSource = null;
    state.tracker.setPose(null);
    ui.calStatus.textContent = 'Not calibrated.';
    ui.readoutScale.textContent = 'no calibration — pixels only';
    ui.readoutScale.classList.add('muted');
  });
  ui.poseApply.addEventListener('click', applyManualPose);

  ui.zoneArea.addEventListener('click', () => beginZone('area'));
  ui.zoneWire.addEventListener('click', () => beginZone('tripwire'));
  ui.drawingDone.addEventListener('click', finishZone);
  ui.drawingCancel.addEventListener('click', () => {
    state.drawing = null;
    ui.drawingBar.hidden = true;
  });

  ui.sensitivity.addEventListener('input', () => {
    ui.sensitivityValue.textContent = Number(ui.sensitivity.value).toFixed(1);
  });
  ui.retention.addEventListener('input', () => {
    ui.retentionValue.textContent = `${ui.retention.value} min`;
  });
  ui.relearn.addEventListener('click', () => {
    if (state.frameSize.width) {
      state.background = createBackground(state.frameSize.width, state.frameSize.height);
      setStatus('Relearning the scene…', 'quiet');
    }
  });

  ui.planClear.addEventListener('click', () => {
    state.history = [];
    drawPlan([]);
  });
  ui.export.addEventListener('click', exportSession);

  ui.llmSave.addEventListener('click', () => {
    const provider = PROVIDERS.find((p) => p.id === ui.llmProvider.value);
    const key = ui.llmKey.value.trim();
    if (!key) {
      ui.llmStatus.textContent = 'Paste a key first.';
      return;
    }
    saveCredentials({ provider: provider.id, key, url: provider.url, model: provider.model });
    ui.llmKey.value = '';
    ui.llmStatus.textContent = `Narration on via ${provider.model}. The key stays in this browser.`;
  });
  ui.llmForget.addEventListener('click', () => {
    saveCredentials(null);
    ui.llmStatus.textContent = 'Narration off. Key forgotten.';
  });

  const rf = new RfLink({
    onState: (rfState, detail) => {
      state.rf.state = rfState;
      state.rf.detail = detail;
      if (rfState !== 'live') state.rf.contacts = [];
      renderRf();
    },
    onFrame: (frame) => {
      state.rf.contacts = frame.contacts;
      state.rf.sensor = frame.sensor ?? state.rf.sensor;
      renderRf();
    },
  });
  ui.rfConnect.addEventListener('click', () => {
    const url = ui.rfUrl.value.trim();
    if (url) rf.connect(url);
  });
  ui.rfDisconnect.addEventListener('click', () => rf.disconnect());

  globalThis.addEventListener('resize', sizeCanvases);
}

buildViewSwitch();
buildProviders();
renderRf();
wire();
sizeCanvases();
ui.supportNote.textContent = CameraFeed.supported()
  ? 'Works on iPhone, Android and any laptop with a webcam. Needs HTTPS or localhost.'
  : 'This browser cannot open a camera here — a page opened from disk never can.';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* offline support is a bonus, not a requirement */
  });
}

// Exposed for the end-to-end harness, which drives the app against a synthetic
// clip and asserts the metres it reports. The projection helper is what lets
// the harness place a zone at a known ground position through the real pointer
// path, rather than reaching past the interface to install one.
globalThis.__sentry = state;
globalThis.__sentryProject = (x, y) => (state.pose ? imagePoint(state.pose, x, y) : null);
