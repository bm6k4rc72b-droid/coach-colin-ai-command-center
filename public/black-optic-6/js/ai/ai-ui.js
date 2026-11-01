/**
 * The AI stack's panels, mounted into the console's existing decks.
 *
 * Loaded lazily by app.js, so if anything here fails the console underneath
 * keeps working. Every panel follows the console's rule: a badge first, and
 * the badge says whether the number was measured here, linked from named
 * kit, modelled, or is not available — never a number without one.
 *
 * @module black-optic-6/ai/ai-ui
 */

import {
  calibrateMetric, calibrateTiltRelative, distanceAt, groundSamples, heightFromAnchor, horizonRowFor,
  resample, sampleAt, scaleDisparity, tiltFromOrientation,
} from './depth-calib.js';
import { chooseLock, decodeYolo, fromTransformers, letterbox, parseQueries, promptFor } from './detect.js';
import { bestMask, IdRegistry, maskStats, signature } from './reid.js';
import { EventGate, eventFor, ranchScores } from './audio-classes.js';
import { analyse, highPass, staLta } from './geophone.js';
import { BAUDS, MavlinkParser, Vehicle } from './mavlink.js';
import { decodeFromRadio, encodeText, encodeWantConfig, frame as meshFrame, FrameReader, nodeId, parseGate } from './meshtastic.js';
import { positionOf, ZenohRest } from './zenoh.js';
import { FREE, OCCUPIED, occupancy, parsePCD } from './pcd.js';
import {
  assetOf, boxAround, cellStats, coarseWindow, dryness, epsgOf, indices, pixelWindow, scaling, STAC_URL, stacSearch, utmBox,
} from './ndvi.js';
import { autoIsotherm, hotspots } from './isotherm.js';
import { blake3Hex, clipManifest, EvidenceChain } from './evidence.js';
import { chatRequest, DEFAULT_QUESTIONS, parseQuestions, parseReply, ruleEvents, speedup, timings } from './vlm.js';
import { INSTALLS, installTally, STATUS } from './installs.js';
import { depthMapOf, getAudioClassifier, getPipeline, getSam, loadGeoTiff, MODELS, preferredDevice, rawImage } from './runtime.js';
import { ByteTracker } from '../../../vision-kit/bytetrack.js';
import { turbo } from '../../../vision-kit/pointcloud.js';
import { groundPoint, horizonRow } from '../../../sentry/js/ground.js';
import { luminanceField } from '../thermal.js';

const VENDOR = new URL('../../vendor/', import.meta.url).href;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: fine */ } },
};

/** Build a panel from markup. */
function panel(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** A group of panels laid out like the console's own grids. */
function grid(...children) {
  const g = document.createElement('div');
  g.className = 'grid';
  g.append(...children);
  return g;
}

/** A row in a .rows list. */
function row(title, body, tone = 'primary', time = '', why = '') {
  const li = document.createElement('li');
  li.className = 'row';
  li.dataset.tone = tone;
  li.innerHTML = `<div class="row-head"><b></b><time></time></div><p></p>${why ? '<div class="why"></div>' : ''}`;
  li.querySelector('b').textContent = title;
  li.querySelector('time').textContent = time;
  li.querySelector('p').textContent = body;
  if (why) li.querySelector('.why').textContent = why;
  return li;
}

/** Prepend to a list, keeping at most n rows; clears an .empty placeholder. */
function pushRow(list, li, n = 12) {
  list.querySelector('.empty')?.remove();
  list.prepend(li);
  while (list.children.length > n) list.lastElementChild.remove();
}

/** Copy an ImageData into a fresh canvas (a snapshot the models can read). */
function canvasOf(frame) {
  const c = document.createElement('canvas');
  c.width = frame.width; c.height = frame.height;
  c.getContext('2d').putImageData(frame, 0, 0);
  return c;
}

const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const serialSupported = () => typeof navigator !== 'undefined' && 'serial' in navigator;
const SERIAL_BLOCKED = 'This browser has no Web Serial. It works in Chrome or Edge on a laptop and in Chrome on Android with a USB-OTG cable; Safari and iPhone do not offer it to any web page.';

/**
 * Mount everything.
 *
 * @param {object} bridge What the console shares: state, helpers, hooks.
 * @returns {{onFrame: (frame: ImageData) => void}}
 */
export function mountAiStack(bridge) {
  const { state, setBadge, readout, logEvent } = bridge;
  const ai = {
    depth: null, // { map (frame res), metric, scale, at, ms, device, samples }
    anchorPending: false,
    marks: [], // measurement markers to draw
    tapMode: null, // 'measure' | 'anchor' | 'tag'
    det: { running: false, busy: false, mode: 'open', tracker: new ByteTracker({ minHits: 2, maxLost: 8, highThresh: 0.2, lowThresh: 0.05 }), tracks: [], lockId: null, lastMs: 0, ms: null, device: null, coco: null, yolo: null, sigAt: 0 },
    ids: new IdRegistry(),
    mask: null, // { data, width, height, until, id }
    hot: null, // { spots, until }
    chain: new EvidenceChain(),
    chainQueue: Promise.resolve(),
    hookedRecorder: null,
    seenClips: new Set(),
    manifests: [],
  };

  /* ------------------------------------------------------------ overlay */

  const viewport = $('viewport');
  const overlay = document.createElement('canvas');
  overlay.id = 'ai-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
  viewport.append(overlay);

  /** Display ↔ frame mapping for the cover-fitted frame canvas. */
  function coverMap() {
    const rect = overlay.getBoundingClientRect();
    const fw = state.lastFrame?.width || 320; const fh = state.lastFrame?.height || 240;
    const s = Math.max(rect.width / fw, rect.height / fh);
    return { rect, s, ox: (rect.width - fw * s) / 2, oy: (rect.height - fh * s) / 2, fw, fh };
  }

  function setTapMode(mode, hint) {
    ai.tapMode = mode;
    overlay.style.pointerEvents = mode ? 'auto' : 'none';
    overlay.style.cursor = mode ? 'crosshair' : 'default';
    if (hint) $('ai-depth-note').textContent = hint;
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (!ai.tapMode || !state.lastFrame) return;
    const m = coverMap();
    const u = (event.clientX - m.rect.left - m.ox) / m.s;
    const v = (event.clientY - m.rect.top - m.oy) / m.s;
    if (u < 0 || v < 0 || u >= m.fw || v >= m.fh) return;
    if (ai.tapMode === 'tag') { tagAt(u, v); return; }
    if (ai.tapMode === 'anchor') { anchorAt(u, v); return; }
    measureAt(u, v);
  });

  function drawOverlay() {
    const m = coverMap();
    overlay.width = Math.max(1, Math.round(m.rect.width));
    overlay.height = Math.max(1, Math.round(m.rect.height));
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const X = (u) => m.ox + u * m.s; const Y = (v) => m.oy + v * m.s;
    ctx.font = '11px ui-monospace, monospace';
    ctx.lineWidth = 1.5;
    const now = performance.now();

    if (ai.mask && ai.mask.until > now) {
      const { data, width, height } = ai.mask;
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < data.length; i += 1) if (data[i]) img.data.set([79, 232, 255, 90], i * 4);
      const tmp = document.createElement('canvas'); tmp.width = width; tmp.height = height;
      tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(tmp, X(0), Y(0), width * m.s, height * m.s);
    }
    if (ai.hot && ai.hot.until > now) {
      ctx.strokeStyle = '#ff3b4e';
      for (const s of ai.hot.spots.slice(0, 8)) ctx.strokeRect(X(s.box[0]), Y(s.box[1]), s.box[2] * m.s, s.box[3] * m.s);
    }
    for (const t of ai.det.tracks) {
      const [x, y, w, h] = t.box;
      const locked = t.id === ai.det.lockId;
      ctx.strokeStyle = locked ? '#ff3b4e' : '#4fe8ff';
      ctx.setLineDash(locked ? [] : [4, 3]);
      ctx.strokeRect(X(x), Y(y), w * m.s, h * m.s);
      ctx.setLineDash([]);
      const range = footRange(t.box);
      const label = `${locked ? 'LOCK ' : ''}${t.cls} #${t.id}${t.pid ? ` · ${t.pid}` : ''}${range ? ` · ${range.toFixed(1)} m` : ''}`;
      ctx.fillStyle = 'rgba(4,6,10,0.75)';
      ctx.fillRect(X(x), Y(y) - 15, ctx.measureText(label).width + 8, 14);
      ctx.fillStyle = locked ? '#ff3b4e' : '#4fe8ff';
      ctx.fillText(label, X(x) + 4, Y(y) - 4);
      if (locked) {
        const cx = X(x + w / 2); const cy = Y(y + h / 2);
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(10, (Math.min(w, h) * m.s) / 2), 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const mk of ai.marks) {
      ctx.strokeStyle = '#ffd166'; ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(X(mk.u), Y(mk.v), 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(4,6,10,0.8)';
      ctx.fillRect(X(mk.u) + 7, Y(mk.v) - 9, ctx.measureText(mk.label).width + 8, 15);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(mk.label, X(mk.u) + 11, Y(mk.v) + 2);
    }
    if (ai.depth?.horizon != null && $('ai-depth-horizon')?.checked) {
      ctx.strokeStyle = '#ffd166'; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, Y(ai.depth.horizon)); ctx.lineTo(overlay.width, Y(ai.depth.horizon)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd166'; ctx.fillText('horizon from depth', 6, Y(ai.depth.horizon) - 4);
    }
  }

  /** Ground-plane range to the foot of a box, when the view is calibrated. */
  function footRange(box) {
    if (!state.pose) return null;
    const g = groundPoint(state.pose, box[0] + box[2] / 2, box[1] + box[3]);
    return g ? Math.hypot(g.x, g.y) : null;
  }

  /* ========================================================== OPTICS */

  const poseSpec = () => {
    const f = state.lastFrame;
    return {
      heightM: Number($('cal-height').value), tiltDeg: Number($('cal-tilt').value), fovDeg: Number($('cal-fov').value),
      width: f?.width || 320, height: f?.height || 240,
    };
  };

  const depthPanel = panel(`
    <div class="panel" id="ai-depth-panel">
      <div class="panel-head"><h2>Depth · tap to measure</h2><span class="spacer"></span><span class="prov" id="ai-depth-prov" data-tone="muted">No depth yet</span></div>
      <p class="note">Depth Anything V2 runs on this device (WebGPU, else WASM). On a flat ground its depth is a straight line in image row, and that line is tied to your mounting — so the console can fill the calibration in itself and then put metres on anything you tap: a post, a ewe, the truck at the gate.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 220px"><span>Depth model (Hugging Face ONNX id)</span><input id="ai-depth-model" type="text" value="${MODELS.depth[0].id}" /></label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="ai-depth-metric" /> Model outputs metres</label>
      </div>
      <div class="controls" style="margin-top:9px">
        <button class="act" id="ai-depth-run" type="button">Capture depth</button>
        <button class="act" id="ai-depth-auto" type="button" disabled>Auto-calibrate</button>
        <button class="ghost" id="ai-depth-measure" type="button" disabled>Tap to measure</button>
        <button class="ghost" id="ai-depth-phone" type="button">Tilt from this phone</button>
      </div>
      <div class="controls" style="margin-top:9px">
        <label class="field" style="flex:0 1 170px"><span>Tape-measured ground distance (m)</span><input id="ai-depth-known" type="number" min="0.5" step="0.1" placeholder="e.g. 12" /></label>
        <button class="ghost" id="ai-depth-anchor" type="button" disabled style="align-self:flex-end">Tap that spot → height</button>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="ai-depth-horizon" checked /> Show depth horizon</label>
      </div>
      <canvas id="ai-depth-map" width="320" height="240" style="width:100%;max-width:320px;margin-top:11px;border:1px solid var(--hair);background:#04060a;display:none"></canvas>
      <div class="readouts" id="ai-depth-readouts" style="margin-top:11px"></div>
      <p class="note" id="ai-depth-note" style="margin-top:10px">Open the camera, then capture depth. Distances are Modelled: they assume flat ground under your feet and hold only as well as the fit below says.</p>
    </div>`);
  $('cal-note').closest('.grid').after(depthPanel);

  function renderDepthReadouts() {
    const d = ai.depth;
    const host = $('ai-depth-readouts');
    if (!d) { host.replaceChildren(); return; }
    host.replaceChildren(
      readout('Model', `${d.ms.toFixed(0)} ms`, { note: `${d.device} · ${d.mapW}×${d.mapH} depth map` }),
      readout('Units', d.metric ? 'metres' : 'relative', { tone: d.metric ? 'confirm' : 'caution', note: d.metric ? 'The model claims metric output.' : 'Disparity: scale comes from your mounting.' }),
      readout('Ground fit', d.scale ? `${(d.scale.inliers * 100).toFixed(0)}% inliers` : d.metric ? 'direct' : '—', {
        tone: d.scale ? (d.scale.inliers > 0.6 && d.scale.r2 > 0.9 ? 'confirm' : 'caution') : 'muted',
        note: d.scale ? `α ${d.scale.alpha.toPrecision(4)}, β ${d.scale.beta.toPrecision(3)}, R² ${d.scale.r2.toFixed(3)}` : 'Apply a calibration (typed or auto) to tie depth to metres.',
      }),
      readout('Last tap', ai.marks.length ? ai.marks[ai.marks.length - 1].label : '—', { note: 'Optical-axis depth → slant range.' }),
    );
  }

  function drawDepthMap(map) {
    const c = $('ai-depth-map');
    c.style.display = 'block';
    c.width = map.width; c.height = map.height;
    let lo = Infinity; let hi = -Infinity;
    for (const v of map.data) { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    const img = c.getContext('2d').createImageData(map.width, map.height);
    for (let i = 0; i < map.data.length; i += 1) {
      const t = hi > lo ? (map.data[i] - lo) / (hi - lo) : 0;
      const [r, g, b] = turbo(ai.depth?.metric ? 1 - t : t);
      img.data.set([r * 255, g * 255, b * 255, 255], i * 4);
    }
    c.getContext('2d').putImageData(img, 0, 0);
  }

  /** Tie the current depth map to the current calibration. */
  function refit() {
    const d = ai.depth;
    if (!d) return;
    const p = poseSpec();
    d.horizon = state.pose ? horizonRow(state.pose) : null;
    if (d.metric) { d.scale = null; } else if (state.pose) {
      d.scale = scaleDisparity(groundSamples(d.map, { horizonRow: d.horizon, step: 3 }), p);
    } else d.scale = null;
    setBadge('ai-depth-prov', d.metric || d.scale ? 'MODEL' : 'BLOCKED', d.metric || d.scale ? 'Metres · Modelled' : 'Relative only');
    renderDepthReadouts();
  }

  async function runDepth() {
    if (!state.lastFrame) { $('ai-depth-note').textContent = 'Open the camera on this deck first.'; return; }
    const btn = $('ai-depth-run');
    btn.disabled = true;
    try {
      const model = $('ai-depth-model').value.trim() || MODELS.depth[0].id;
      const { pipe, device } = await getPipeline('depth-estimation', model, (t) => { $('ai-depth-note').textContent = t; });
      const snap = state.lastFrame;
      const t0 = performance.now();
      const out = await pipe(await rawImage(canvasOf(snap)));
      const raw = depthMapOf(out);
      const map = resample(raw, snap.width, snap.height);
      ai.depth = { map, metric: $('ai-depth-metric').checked, ms: performance.now() - t0, device, mapW: raw.width, mapH: raw.height, scale: null, horizon: null };
      drawDepthMap(map);
      refit();
      $('ai-depth-auto').disabled = false; $('ai-depth-measure').disabled = false; $('ai-depth-anchor').disabled = false;
      $('ai-depth-note').textContent = 'Depth captured on this frame. Tap "Tap to measure", then tap the frame. The measurements belong to this snapshot, not the live picture.';
      logEvent('Depth captured', `${model} on ${device}, ${ai.depth.ms.toFixed(0)} ms.`, 'confirm');
    } catch (error) {
      setBadge('ai-depth-prov', 'BLOCKED', 'Model failed');
      $('ai-depth-note').className = 'note bad';
      $('ai-depth-note').textContent = `The depth model did not run: ${error.message}. The first run downloads the model from huggingface.co (tens of MB), then the browser keeps it.`;
    } finally { btn.disabled = false; }
  }

  function autoCalibrate() {
    const d = ai.depth;
    if (!d) return;
    const p = poseSpec();
    const samples = groundSamples(d.map, { step: 3 });
    const note = $('ai-depth-note');
    if (d.metric) {
      const r = calibrateMetric(samples, p);
      if (!r || !(r.heightM > 0.3 && r.heightM < 40)) { note.textContent = 'The bottom of the frame does not look like flat ground to the depth model — no calibration taken.'; return; }
      $('cal-height').value = r.heightM.toFixed(2); $('cal-tilt').value = r.tiltDeg.toFixed(1);
      note.textContent = `Auto-calibrated from metric depth: height ${r.heightM.toFixed(2)} m, tilt ${r.tiltDeg.toFixed(1)}° (${(r.inliers * 100).toFixed(0)}% of ground samples agree, R² ${r.r2.toFixed(3)}).`;
    } else {
      const r = calibrateTiltRelative(samples, p);
      if (!r || !(r.tiltDeg > -5 && r.tiltDeg < 85)) { note.textContent = 'No usable ground line in the bottom of the frame — tilt not changed.'; return; }
      $('cal-tilt').value = r.tiltDeg.toFixed(1);
      note.textContent = `Tilt ${r.tiltDeg.toFixed(1)}° from where the ground's depth runs out (${(r.inliers * 100).toFixed(0)}% inliers). ${r.assumption} Height is still the typed ${p.heightM} m — tape one ground distance and tap it to set it.`;
    }
    bridge.applyCalibration();
    refit();
    logEvent('Auto-calibrated', note.textContent, 'confirm');
  }

  function measureAt(u, v) {
    const d = ai.depth;
    if (!d) return;
    const p = poseSpec();
    const value = sampleAt(d.map, u, v, d.map.width, d.map.height);
    const r = distanceAt(d.metric ? null : d.scale, value, u, v, p);
    const ground = state.pose ? groundPoint(state.pose, u, v) : null;
    let label;
    if (r) label = `${r.rangeM.toFixed(1)} m`;
    else if (!d.metric && !d.scale) label = 'calibrate first';
    else label = 'too far to resolve';
    if (ground && r) label += ` (ground plane ${Math.hypot(ground.x, ground.y, state.pose.heightM).toFixed(1)} m)`;
    ai.marks.push({ u, v, label });
    if (ai.marks.length > 6) ai.marks.shift();
    renderDepthReadouts();
  }

  function anchorAt(u, v) {
    const known = Number($('ai-depth-known').value);
    const h = heightFromAnchor(poseSpec(), u, v, known);
    setTapMode('measure');
    if (!h || !(h > 0.2 && h < 50)) { $('ai-depth-note').textContent = 'That spot is on or above the horizon for this tilt, or no distance was typed — height not changed.'; return; }
    $('cal-height').value = h.toFixed(2);
    bridge.applyCalibration();
    refit();
    ai.marks.push({ u, v, label: `${known} m (anchor)` });
    $('ai-depth-note').textContent = `Height set to ${h.toFixed(2)} m from one tape-measured ground point at ${known} m. Tap anywhere to measure.`;
    logEvent('Height from anchor', `${h.toFixed(2)} m from a ${known} m tape measurement.`, 'confirm');
  }

  async function tiltFromPhone() {
    const note = $('ai-depth-note');
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') throw new Error('motion permission refused');
      }
      const betas = await new Promise((resolve, reject) => {
        const got = [];
        const on = (e) => { if (Number.isFinite(e.beta)) got.push(e.beta); if (got.length >= 15) { removeEventListener('deviceorientation', on); resolve(got); } };
        addEventListener('deviceorientation', on);
        setTimeout(() => { removeEventListener('deviceorientation', on); got.length ? resolve(got) : reject(new Error('no orientation sensor reported')); }, 2500);
      });
      betas.sort((a, b) => a - b);
      const tilt = tiltFromOrientation(betas[betas.length >> 1]);
      $('cal-tilt').value = tilt.toFixed(1);
      bridge.applyCalibration();
      refit();
      note.textContent = `Tilt ${tilt.toFixed(1)}° measured by this phone's own sensor (portrait, rear camera — median of ${betas.length} readings). Mount the phone, then press this.`;
    } catch (error) {
      note.textContent = `No tilt from this device: ${error.message}. Laptops have no orientation sensor.`;
    }
  }

  $('ai-depth-run').addEventListener('click', runDepth);
  $('ai-depth-auto').addEventListener('click', autoCalibrate);
  $('ai-depth-measure').addEventListener('click', () => setTapMode(ai.tapMode === 'measure' ? null : 'measure', ai.tapMode === 'measure' ? 'Measuring off.' : 'Tap the frame to measure. Tap this button again to stop.'));
  $('ai-depth-anchor').addEventListener('click', () => {
    if (!(Number($('ai-depth-known').value) > 0)) { $('ai-depth-note').textContent = 'Type the tape-measured distance first (from the foot of the mast to a spot on the ground).'; return; }
    setTapMode('anchor', 'Tap the exact ground spot you measured to.');
  });
  $('ai-depth-phone').addEventListener('click', tiltFromPhone);
  $('cal-apply').addEventListener('click', () => setTimeout(refit, 0));

  /* ---------------------------------------------------- auto isotherm */

  const isoPanel = panel(`
    <div class="panel" id="ai-iso-panel">
      <div class="panel-head"><h2>Auto isotherm</h2><span class="spacer"></span><span class="prov" id="ai-iso-prov" data-tone="muted">Idle</span></div>
      <p class="note">Otsu's method picks the threshold that best splits the frame into a cool and a hot class, then the hot blobs are labelled. On the device camera the "heat" is brightness, and the badge says so; on a radiometric thermal core it is temperature.</p>
      <div class="controls" style="margin-top:11px">
        <button class="act" id="ai-iso-run" type="button">Auto isotherm on this frame</button>
        <label class="check"><input type="checkbox" id="ai-iso-live" /> Keep updating</label>
      </div>
      <div class="readouts" id="ai-iso-readouts" style="margin-top:11px"></div>
      <p class="note" id="ai-iso-note" style="margin-top:10px"></p>
    </div>`);
  $('thermal-truth').closest('.panel').after(isoPanel);

  function runIsotherm() {
    const frame = state.lastFrame;
    if (!frame) { $('ai-iso-note').textContent = 'Open the camera first.'; return; }
    const f = state.thermalField ?? luminanceField(frame);
    const iso = autoIsotherm(f.field);
    const spots = iso.usable ? hotspots(f.field, f.width, f.height, iso.low, Math.max(4, Math.round(f.width * f.height * 0.0005))) : [];
    const brightness = (f.source ?? 'LUMINANCE') === 'LUMINANCE';
    setBadge('ai-iso-prov', iso.usable ? 'MODEL' : 'UNSOUND', iso.usable ? (brightness ? 'Brightness' : 'Modelled') : 'No hot mode');
    if (iso.usable) {
      $('thermal-iso').value = 'above';
      $('thermal-iso-low').value = iso.low.toFixed(3);
      $('thermal-iso-high').value = '1';
      $('thermal-iso').dispatchEvent(new Event('input'));
      ai.hot = { spots, until: performance.now() + 4000 };
    }
    $('ai-iso-readouts').replaceChildren(
      readout('Threshold', fmt(iso.low, 3), { note: brightness ? 'Fraction of full brightness.' : 'Fraction of the scale.' }),
      readout('Separability', fmt(iso.separability, 2), { tone: iso.usable ? 'confirm' : 'caution', note: 'η = σ²between / σ²total. 1 is two clean classes.' }),
      readout('Hot regions', String(spots.length), { note: spots[0] ? `Largest ${spots[0].area} px.` : '' }),
    );
    $('ai-iso-note').textContent = iso.note;
  }
  $('ai-iso-run').addEventListener('click', runIsotherm);
  setInterval(() => { if ($('ai-iso-live').checked && state.deck === 'optics') runIsotherm(); }, 1000);

  /* =========================================================== WATCH */

  const lockPanel = panel(`
    <div class="panel" id="ai-lock-panel">
      <div class="panel-head"><h2>Type it, lock it</h2><span class="spacer"></span><span class="prov" id="ai-lock-prov" data-tone="muted">Off</span></div>
      <p class="note">Open-vocabulary detection on this device: type what you are worried about and every frame is searched for it, tracked with ByteTrack, and the best match is locked. Boxes appear on the optics view. Detections are Modelled — a detector's guess with a score, never an identification.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 260px"><span>Look for</span><input id="ai-lock-q" type="text" value="person, white truck, coyote, bolt cutters, sheep" /></label>
      </div>
      <div class="controls" style="margin-top:9px">
        <label class="field" style="flex:1 1 200px"><span>Detector</span><select id="ai-lock-mode">
          ${MODELS.openVocab.map((m) => `<option value="open:${m.id}">${esc(m.label)}</option>`).join('')}
          <option value="coco">COCO-SSD · 80 fixed classes, fast</option>
          <option value="yolo">Your YOLOv8 .onnx export</option>
        </select></label>
        <label class="field" style="flex:1 1 200px" id="ai-yolo-wrap" hidden><span>YOLOv8 ONNX URL</span><input id="ai-yolo-url" type="text" placeholder="https://…/yolov8n.onnx" /></label>
        <label class="field" style="flex:0 1 120px"><span>Every (ms)</span><input id="ai-lock-every" type="number" min="100" step="50" value="700" /></label>
      </div>
      <div class="controls" style="margin-top:9px">
        <button class="act" id="ai-lock-start" type="button">Start searching</button>
        <button class="ghost" id="ai-lock-stop" type="button" disabled>Stop</button>
        <button class="ghost" id="ai-lock-release" type="button">Release lock</button>
      </div>
      <div class="readouts" id="ai-lock-readouts" style="margin-top:11px"></div>
      <ul class="rows" id="ai-lock-log" style="margin-top:11px"><li class="empty">Nothing locked yet.</li></ul>
      <p class="note" id="ai-lock-note" style="margin-top:10px"></p>
    </div>`);

  const tagPanel = panel(`
    <div class="panel" id="ai-tag-panel">
      <div class="panel-head"><h2>Tap to tag · persistent ID</h2><span class="spacer"></span><span class="prov" id="ai-tag-prov" data-tone="muted">Nobody tagged</span></div>
      <p class="note">Tap a sheep, a man, a truck: a segment-anything model cuts it out of the frame, and its colour signature becomes an ID that follows it — including onto another camera when you switch feeds. Colour is weak evidence (two white ewes look alike), so every handover shows its similarity. Nothing here can recognise a face.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 160px"><span>Name it</span><input id="ai-tag-name" type="text" value="subject" /></label>
        <button class="act" id="ai-tag-arm" type="button" style="align-self:flex-end">Tap the frame to tag</button>
      </div>
      <ul class="rows" id="ai-tag-list" style="margin-top:11px"><li class="empty">No IDs yet.</li></ul>
      <p class="note" id="ai-tag-note" style="margin-top:10px"></p>
    </div>`);
  $('lock-readouts').closest('.grid').after(grid(lockPanel, tagPanel));

  $('ai-lock-mode').addEventListener('change', () => {
    const v = $('ai-lock-mode').value;
    $('ai-yolo-wrap').hidden = v !== 'yolo';
    $('ai-lock-every').value = v === 'coco' || v === 'yolo' ? '250' : '700';
  });

  async function loadYolo(url) {
    if (ai.det.yolo?.url === url) return ai.det.yolo;
    const ort = await import(`${VENDOR}transformers/ort.webgpu.min.mjs`);
    ort.env.wasm.wasmPaths = `${VENDOR}transformers/`;
    let session; let device;
    try {
      if (preferredDevice() !== 'webgpu') throw new Error('no WebGPU');
      session = await ort.InferenceSession.create(url, { executionProviders: ['webgpu'] }); device = 'webgpu';
    } catch {
      session = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] }); device = 'wasm';
    }
    ai.det.yolo = { url, session, ort, device };
    return ai.det.yolo;
  }

  async function detectOnce(frame) {
    const mode = $('ai-lock-mode').value;
    const queries = parseQueries($('ai-lock-q').value);
    const canvas = canvasOf(frame);
    if (mode.startsWith('open:')) {
      const model = mode.slice(5);
      const owl = /owl/i.test(model);
      const { pipe, device } = await getPipeline('zero-shot-object-detection', model, (t) => { $('ai-lock-note').textContent = t; });
      ai.det.device = device;
      const labels = owl ? queries.map(promptFor) : queries.map((q) => `${q}.`);
      const out = await pipe(await rawImage(canvas), labels, { threshold: 0.08, percentage: false });
      return fromTransformers(out).map((d) => ({ ...d, cls: d.cls.replace(/\.$/, '') }));
    }
    if (mode === 'coco') {
      if (!ai.det.coco) {
        const { Detector } = await import('../../../vision-kit/detector.js');
        ai.det.coco = await new Detector().load('webgl', (t) => { $('ai-lock-note').textContent = t; });
      }
      ai.det.device = ai.det.coco.backend;
      return ai.det.coco.detect(canvas, 30, 0.15);
    }
    const url = $('ai-yolo-url').value.trim();
    if (!url) throw new Error('Paste the URL of your exported yolov8n.onnx (it must allow cross-origin reads).');
    const y = await loadYolo(url);
    ai.det.device = y.device;
    const lb = letterbox(frame.width, frame.height, 640);
    const c = document.createElement('canvas'); c.width = 640; c.height = 640;
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgb(114,114,114)'; cx.fillRect(0, 0, 640, 640);
    cx.drawImage(canvas, lb.padX, lb.padY, lb.w, lb.h);
    const px = cx.getImageData(0, 0, 640, 640).data;
    const input = new Float32Array(3 * 640 * 640);
    for (let i = 0; i < 640 * 640; i += 1) { input[i] = px[i * 4] / 255; input[640 * 640 + i] = px[i * 4 + 1] / 255; input[2 * 640 * 640 + i] = px[i * 4 + 2] / 255; }
    const feeds = { [y.session.inputNames[0]]: new y.ort.Tensor('float32', input, [1, 3, 640, 640]) };
    const out = (await y.session.run(feeds))[y.session.outputNames[0]];
    return decodeYolo(out.data, out.dims, lb, { scoreThreshold: 0.25 });
  }

  async function stepDetector() {
    const d = ai.det;
    if (!d.running || d.busy || !state.lastFrame) return;
    const every = Math.max(100, Number($('ai-lock-every').value) || 700);
    if (performance.now() - d.lastMs < every) return;
    d.busy = true; d.lastMs = performance.now();
    const frame = state.lastFrame;
    try {
      const t0 = performance.now();
      const dets = await detectOnce(frame);
      d.ms = performance.now() - t0;
      d.tracks = d.tracker.update(dets);
      const queries = parseQueries($('ai-lock-q').value);
      // Persistent IDs: compare each track's colour against enrolled subjects about once a second.
      if (ai.ids.ids.length && performance.now() - d.sigAt > 1000) {
        d.sigAt = performance.now();
        for (const t of d.tracks) {
          const [x, y, w, h] = t.box;
          const hit = ai.ids.match(signature(frame, null, [x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6]), bridge.feedName());
          t.pid = hit ? `${hit.entry.id} ${(hit.similarity * 100).toFixed(0)}%` : null;
          if (hit) renderTags();
        }
      }
      const lock = chooseLock(d.tracks, d.mode === 'coco' ? d.tracks.map((t) => t.cls).filter((c) => queries.includes(c)) : queries, d.lockId);
      if (lock && lock.id !== d.lockId) {
        d.lockId = lock.id;
        const range = footRange(lock.box);
        const text = `${lock.cls} #${lock.id}, score ${(lock.score * 100).toFixed(0)}%${range ? `, ${range.toFixed(1)} m on the ground plane` : ''}.`;
        pushRow($('ai-lock-log'), row(`Locked: ${lock.cls}`, text, 'alert', new Date().toLocaleTimeString()));
        logEvent('Target lock', text, 'alert');
      }
      if (!lock) d.lockId = null;
      setBadge('ai-lock-prov', 'MODEL', lock ? `Locked · ${lock.cls}` : 'Searching');
      $('ai-lock-readouts').replaceChildren(
        readout('Detector', d.ms != null ? `${d.ms.toFixed(0)} ms` : '—', { note: `${d.device ?? '—'} · every ${every} ms` }),
        readout('Detections', String(dets.length), { note: 'Before tracking.' }),
        readout('Tracks', String(d.tracks.length), { note: 'Confirmed, visible now.' }),
        readout('Lock', lock ? `${lock.cls} #${lock.id}` : 'none', { tone: lock ? 'alert' : 'muted' }),
      );
      $('ai-lock-note').textContent = '';
    } catch (error) {
      setBadge('ai-lock-prov', 'BLOCKED', 'Detector failed');
      $('ai-lock-note').className = 'note bad';
      $('ai-lock-note').textContent = $('ai-lock-mode').value.startsWith('open:')
        ? `${error.message}. The open-vocabulary model is a large download from huggingface.co on first use (use Wi-Fi), then the browser keeps it.`
        : `${error.message}.`;
      stopDetector();
    } finally { d.busy = false; }
  }

  function stopDetector() {
    ai.det.running = false; ai.det.tracks = []; ai.det.lockId = null;
    $('ai-lock-start').disabled = false; $('ai-lock-stop').disabled = true;
  }
  $('ai-lock-start').addEventListener('click', () => {
    if (!state.lastFrame) { $('ai-lock-note').textContent = 'Open the camera on the optics deck first.'; return; }
    const mode = $('ai-lock-mode').value;
    ai.det.mode = mode === 'coco' ? 'coco' : mode === 'yolo' ? 'yolo' : 'open';
    ai.det.tracker = new ByteTracker(ai.det.mode === 'open'
      ? { minHits: 2, maxLost: 8, highThresh: 0.2, lowThresh: 0.05 }
      : { minHits: 2, maxLost: 15, highThresh: 0.5, lowThresh: 0.1 });
    ai.det.running = true;
    $('ai-lock-note').className = 'note';
    $('ai-lock-start').disabled = true; $('ai-lock-stop').disabled = false;
    setBadge('ai-lock-prov', 'MODEL', 'Loading');
  });
  $('ai-lock-stop').addEventListener('click', () => { stopDetector(); setBadge('ai-lock-prov', 'BLOCKED', 'Off'); });
  $('ai-lock-release').addEventListener('click', () => { ai.det.lockId = null; });

  /* -------------------------------------------------------------- tag */

  function renderTags() {
    const list = $('ai-tag-list');
    if (!ai.ids.ids.length) return;
    list.replaceChildren(...ai.ids.ids.map((e) => row(`${e.id} · ${e.label}`, `Seen on: ${Object.entries(e.seen).map(([feed, at]) => `${feed} ${new Date(at).toLocaleTimeString()}`).join(', ')}`, 'primary', '', 'Colour signature, 62 bins. Matches need ≥ 86% Bhattacharyya similarity.')));
    setBadge('ai-tag-prov', 'MODEL', `${ai.ids.ids.length} tagged`);
  }

  async function tagAt(u, v) {
    setTapMode(null);
    const frame = state.lastFrame;
    const note = $('ai-tag-note');
    try {
      const { model, processor } = await getSam(MODELS.segment[0].id, (t) => { note.textContent = t; });
      const image = await rawImage(canvasOf(frame));
      const inputs = await processor(image, { input_points: [[[u, v]]], input_labels: [[1]] });
      const outputs = await model(inputs);
      const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
      const scores = Array.from(outputs.iou_scores.data);
      const k = bestMask(scores);
      const m = masks[0];
      const [h, w] = m.dims.slice(-2);
      const plane = w * h;
      const data = new Uint8Array(plane);
      for (let i = 0; i < plane; i += 1) data[i] = m.data[k * plane + i] ? 1 : 0;
      const stats = maskStats(data, w, h);
      if (!stats.area) throw new Error('the segmenter found nothing at that point');
      const entry = ai.ids.enrol(signature(frame, data), bridge.feedName(), $('ai-tag-name').value.trim() || 'subject');
      ai.mask = { data, width: w, height: h, until: performance.now() + 3500 };
      renderTags();
      note.textContent = `${entry.id} enrolled: ${stats.area} px mask, SAM's own quality estimate ${(scores[k] * 100).toFixed(0)}%. Start "Type it, lock it" and matching tracks carry this ID.`;
      logEvent('Tagged', `${entry.id} (${entry.label}) on ${bridge.feedName()}.`, 'confirm');
    } catch (error) {
      note.textContent = `Tagging failed: ${error.message}.`;
    }
  }
  $('ai-tag-arm').addEventListener('click', () => {
    if (!state.lastFrame) { $('ai-tag-note').textContent = 'Open the camera first.'; return; }
    setTapMode('tag');
    $('ai-tag-note').textContent = 'Go to the optics deck and tap the subject.';
  });

  /* ========================================================== AERIAL */

  const mavPanel = panel(`
    <div class="panel" id="ai-mav-panel">
      <div class="panel-head"><h2>Pixhawk · MAVLink</h2><span class="spacer"></span><span class="prov" id="ai-mav-prov" data-tone="muted">Not linked</span></div>
      <p class="note">Plug the X500's Pixhawk 6C in over USB, or its telemetry radio, and the browser reads MAVLink directly — every frame CRC-checked. Positions land on "Your own aircraft" above as measurements. Read-only on purpose: flying stays in QGroundControl.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:0 1 140px"><span>Baud</span><select id="ai-mav-baud">${BAUDS.map((b) => `<option ${b === 57600 ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <button class="act" id="ai-mav-connect" type="button" style="align-self:flex-end">Connect</button>
        <button class="ghost" id="ai-mav-close" type="button" disabled style="align-self:flex-end">Disconnect</button>
      </div>
      <div class="readouts" id="ai-mav-readouts" style="margin-top:11px"></div>
      <p class="note" id="ai-mav-note" style="margin-top:10px"></p>
    </div>`);

  const zenohPanel = panel(`
    <div class="panel" id="ai-zenoh-panel">
      <div class="panel-head"><h2>Zenoh router</h2><span class="spacer"></span><span class="prov" id="ai-zenoh-prov" data-tone="muted">Not linked</span></div>
      <p class="note">Replaces the bespoke bridge socket: subscribe to your zenohd router's REST plugin and everything published under the key — the X500, gate sensors, post cameras' metadata — streams in. Positions go onto the aircraft panel.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 200px"><span>Router (REST plugin)</span><input id="ai-zenoh-base" type="text" placeholder="https://jetson.local:8000" /></label>
        <label class="field" style="flex:0 1 150px"><span>Key expression</span><input id="ai-zenoh-key" type="text" value="ranch/**" /></label>
      </div>
      <div class="controls" style="margin-top:9px">
        <button class="act" id="ai-zenoh-connect" type="button">Subscribe</button>
        <button class="ghost" id="ai-zenoh-close" type="button" disabled>Stop</button>
      </div>
      <ul class="rows" id="ai-zenoh-list" style="margin-top:11px"><li class="empty">No samples.</li></ul>
      <p class="note" id="ai-zenoh-note" style="margin-top:10px"></p>
    </div>`);

  const foxPanel = panel(`
    <div class="panel" id="ai-fox-panel">
      <div class="panel-head"><h2>Lichtblick (open Foxglove)</h2><span class="spacer"></span><span class="prov" id="ai-fox-prov" data-tone="muted">Not embedded</span></div>
      <p class="note">Foxglove Studio's open-source edition was archived; Lichtblick is its maintained open fork. Point this at your Lichtblick and the foxglove_bridge on the Jetson and the full ROS view — LiDAR, camera, TF tree — opens here. Both must be https (or localhost) for an https page to embed them.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 200px"><span>Lichtblick URL</span><input id="ai-fox-app" type="text" placeholder="https://lichtblick.ranch.local" /></label>
        <label class="field" style="flex:1 1 200px"><span>foxglove_bridge</span><input id="ai-fox-ws" type="text" placeholder="wss://jetson.local:8765" /></label>
      </div>
      <div class="controls" style="margin-top:9px"><button class="act" id="ai-fox-open" type="button">Embed</button><a class="ghost" id="ai-fox-link" target="_blank" rel="noopener" hidden>Open in a tab</a></div>
      <div id="ai-fox-frame" style="margin-top:11px"></div>
    </div>`);
  $('deck-aerial').append(grid(mavPanel, zenohPanel), foxPanel);

  function pushTelemetry(fix) {
    state.telemetry.push(fix);
    if (state.telemetry.length > 600) state.telemetry.shift();
    if (state.deck === 'aerial') bridge.renderAerial();
  }

  const mav = { port: null, reader: null, parser: null, vehicle: null, last: null };
  function renderMav() {
    const v = mav.vehicle;
    const p = v?.state.position;
    $('ai-mav-readouts').replaceChildren(
      readout('Link', v?.state.heartbeat ? 'heartbeat' : 'waiting', { tone: v?.state.heartbeat ? 'confirm' : 'caution', note: v ? v.describe() : '' }),
      readout('Frames', String(mav.parser?.stats.frames ?? 0), { note: `${mav.parser?.stats.badCrc ?? 0} failed CRC · ${mav.parser?.stats.unknown ?? 0} not decoded` }),
      readout('Position', p ? `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}` : '—', { note: 'GLOBAL_POSITION_INT, from the aircraft.' }),
      readout('Height', p ? `${p.relAltM.toFixed(1)} m` : '—', { note: 'Above home. MSL ' + (p ? `${p.altMslM.toFixed(1)} m` : '—') }),
      readout('Battery', v?.state.power?.batteryPct != null ? `${v.state.power.batteryPct}%` : '—', { note: v?.state.power?.voltageV ? `${v.state.power.voltageV.toFixed(2)} V` : '' }),
    );
  }
  async function connectMav() {
    if (!serialSupported()) { setBadge('ai-mav-prov', 'BLOCKED', 'No Web Serial'); $('ai-mav-note').textContent = SERIAL_BLOCKED; return; }
    try {
      mav.port = await navigator.serial.requestPort();
      await mav.port.open({ baudRate: Number($('ai-mav-baud').value) });
      mav.parser = new MavlinkParser(); mav.vehicle = new Vehicle();
      $('ai-mav-connect').disabled = true; $('ai-mav-close').disabled = false;
      setBadge('ai-mav-prov', 'LINK', 'Listening');
      $('ai-mav-note').textContent = 'Port open. Waiting for a heartbeat — if none comes in a few seconds, try the other baud rate.';
      mav.reader = mav.port.readable.getReader();
      for (;;) {
        const { value, done } = await mav.reader.read();
        if (done) break;
        for (const msg of mav.parser.push(value)) {
          const fix = mav.vehicle.apply(msg);
          if (msg.name === 'HEARTBEAT' && !mav.last) { logEvent('Aircraft linked', mav.vehicle.describe(), 'confirm'); }
          if (fix) { pushTelemetry(fix); mav.last = fix; }
        }
        setBadge('ai-mav-prov', mav.vehicle.state.heartbeat ? 'LINK' : 'BLOCKED', mav.vehicle.state.heartbeat ? 'Linked · MAVLink' : 'No heartbeat');
        renderMav();
      }
    } catch (error) {
      $('ai-mav-note').textContent = `Serial: ${error.message}`;
    } finally { await closeMav(); }
  }
  async function closeMav() {
    try { await mav.reader?.cancel(); } catch { /* already closed */ }
    try { mav.reader?.releaseLock(); } catch { /* fine */ }
    try { await mav.port?.close(); } catch { /* fine */ }
    mav.reader = null; mav.port = null;
    $('ai-mav-connect').disabled = false; $('ai-mav-close').disabled = true;
  }
  $('ai-mav-connect').addEventListener('click', connectMav);
  $('ai-mav-close').addEventListener('click', closeMav);
  if (!serialSupported()) { setBadge('ai-mav-prov', 'BLOCKED', 'No Web Serial'); $('ai-mav-note').textContent = SERIAL_BLOCKED; }

  const zenoh = new ZenohRest({
    onState: (s, detail) => {
      const map = { live: ['LINK', 'Linked · Zenoh'], connecting: ['MODEL', 'Connecting'], error: ['BLOCKED', 'Unreachable'], closed: ['BLOCKED', 'Not linked'] };
      const [id, label] = map[s] ?? ['BLOCKED', s];
      setBadge('ai-zenoh-prov', id, label);
      if (detail) $('ai-zenoh-note').textContent = detail;
      $('ai-zenoh-close').disabled = s === 'closed' || s === 'error';
    },
    onSample: (sample) => {
      const pos = positionOf(sample.value);
      const text = typeof sample.value === 'string' ? sample.value : JSON.stringify(sample.value);
      pushRow($('ai-zenoh-list'), row(sample.key, text.slice(0, 160), pos ? 'confirm' : 'primary', new Date().toLocaleTimeString()), 8);
      if (pos) pushTelemetry({ atMs: Date.now(), source: 'zenoh', lat: pos.lat, lon: pos.lon, altitudeM: pos.altitudeM ?? undefined, speedMps: pos.speedMps ?? undefined });
      const gate = parseGate(text);
      if (gate) logEvent(`Gate ${gate.gate} ${gate.state}`, `Zenoh ${sample.key}.`, gate.state === 'open' ? 'alert' : 'confirm');
    },
  });
  $('ai-zenoh-base').value = store.get('bo6.ai.zenoh', '');
  $('ai-zenoh-connect').addEventListener('click', () => {
    const base = $('ai-zenoh-base').value.trim();
    if (!base) { $('ai-zenoh-note').textContent = 'Type the router address, e.g. https://jetson.local:8000 (zenohd with --rest-http-port 8000).'; return; }
    store.set('bo6.ai.zenoh', base);
    zenoh.connect(base, $('ai-zenoh-key').value.trim() || 'ranch/**');
  });
  $('ai-zenoh-close').addEventListener('click', () => zenoh.close());

  $('ai-fox-app').value = store.get('bo6.ai.fox.app', '');
  $('ai-fox-ws').value = store.get('bo6.ai.fox.ws', '');
  $('ai-fox-open').addEventListener('click', () => {
    const app = $('ai-fox-app').value.trim(); const ws = $('ai-fox-ws').value.trim();
    if (!/^https?:\/\//.test(app)) { $('ai-fox-frame').textContent = 'Type your Lichtblick address (self-host it with the lichtblick Docker image).'; return; }
    store.set('bo6.ai.fox.app', app); store.set('bo6.ai.fox.ws', ws);
    const url = new URL(app);
    if (ws) { url.searchParams.set('ds', 'foxglove-websocket'); url.searchParams.set('ds.url', ws); }
    const iframe = document.createElement('iframe');
    iframe.src = url.href; iframe.title = 'Lichtblick';
    iframe.style.cssText = 'width:100%;height:520px;border:1px solid var(--hair);background:#000';
    $('ai-fox-frame').replaceChildren(iframe);
    $('ai-fox-link').href = url.href; $('ai-fox-link').hidden = false;
    setBadge('ai-fox-prov', 'LINK', 'Embedded');
  });

  /* ============================================================ TWIN */

  const pcdPanel = panel(`
    <div class="panel" id="ai-pcd-panel">
      <div class="panel-head"><h2>LiDAR map → occupancy</h2><span class="spacer"></span><span class="prov" id="ai-pcd-prov" data-tone="muted">No map</span></div>
      <p class="note">Open the .pcd that LIO-SAM saves from the Ouster on the X500 (ascii, binary or compressed). Each cell is occupied when enough returns stand 0.3–2.5 m above its lowest return, free when only ground was seen, black when the sensor never looked. That is a real obstacle map, not the twin's model.</p>
      <div class="controls" style="margin-top:11px">
        <label class="ghost file-btn">Open .pcd<input id="ai-pcd-file" type="file" accept=".pcd" hidden /></label>
        <label class="field" style="flex:0 1 120px"><span>Cell (m)</span><input id="ai-pcd-cell" type="number" min="0.1" step="0.1" value="0.5" /></label>
      </div>
      <canvas id="ai-pcd-map" width="600" height="400" style="width:100%;margin-top:11px;border:1px solid var(--hair);background:#04060a"></canvas>
      <div class="readouts" id="ai-pcd-readouts" style="margin-top:11px"></div>
      <p class="note" id="ai-pcd-note" style="margin-top:10px"></p>
    </div>`);
  $('deck-twin').append(pcdPanel);

  let pcd = null;
  const area = (m2) => (m2 < 10 ? m2.toFixed(2) : m2.toFixed(0));
  function renderPcd() {
    if (!pcd) return;
    try {
      const cell = Math.max(0.1, Number($('ai-pcd-cell').value) || 0.5);
      const g = occupancy(pcd.points, { cell });
      const c = $('ai-pcd-map');
      c.width = g.cols; c.height = g.rows;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(g.cols, g.rows);
      for (let r = 0; r < g.rows; r += 1) for (let col = 0; col < g.cols; col += 1) {
        const v = g.grid[r * g.cols + col];
        const y = g.rows - 1 - r; // north up
        img.data.set(v === OCCUPIED ? [255, 59, 78, 255] : v === FREE ? [30, 70, 50, 255] : [4, 6, 10, 255], (y * g.cols + col) * 4);
      }
      ctx.putImageData(img, 0, 0);
      c.style.imageRendering = 'pixelated';
      setBadge('ai-pcd-prov', 'LINK', 'Your LiDAR map');
      $('ai-pcd-readouts').replaceChildren(
        readout('Points', pcd.count.toLocaleString(), { note: `PCD ${pcd.data}` }),
        readout('Extent', `${(g.cols * cell).toFixed(0)} × ${(g.rows * cell).toFixed(0)} m`, { note: `${g.cols}×${g.rows} cells of ${cell} m` }),
        readout('Occupied', `${area(g.counts.occupied * cell * cell)} m²`, { tone: 'alert', note: `${g.counts.occupied} cells` }),
        readout('Free', `${area(g.counts.free * cell * cell)} m²`, { tone: 'confirm', note: `${g.counts.unknown} cells never seen` }),
      );
      $('ai-pcd-note').textContent = 'Ground is each cell\'s lowest return: right on open pasture, wrong under tree canopy (the canopy reads as ground).';
    } catch (error) { $('ai-pcd-note').textContent = error.message; }
  }
  $('ai-pcd-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { pcd = parsePCD(await file.arrayBuffer()); renderPcd(); } catch (error) { setBadge('ai-pcd-prov', 'BLOCKED', 'Unreadable'); $('ai-pcd-note').textContent = error.message; }
  });
  $('ai-pcd-cell').addEventListener('change', renderPcd);

  /* ======================================================== ACOUSTIC */

  const yamPanel = panel(`
    <div class="panel" id="ai-yam-panel">
      <div class="panel-head"><h2>Sound classes · YAMNet</h2><span class="spacer"></span><span class="prov" id="ai-yam-prov" data-tone="muted">Off</span></div>
      <p class="note">Google's YAMNet, shipped with this site and run on this device — no network needed. Each ranch event is mapped from its 521 sound classes and graded: <b>direct</b> where AudioSet has the class, <b>proxy</b> where it does not (there is no coyote class and no bolt-cutter class).</p>
      <div class="controls" style="margin-top:11px">
        <button class="act" id="ai-yam-start" type="button">Listen</button>
        <button class="ghost" id="ai-yam-stop" type="button" disabled>Stop</button>
      </div>
      <ul class="rows" id="ai-yam-scores" style="margin-top:11px"></ul>
      <p class="note" id="ai-yam-raw" style="margin-top:8px"></p>
      <ul class="rows" id="ai-yam-events" style="margin-top:11px"><li class="empty">No events heard.</li></ul>
    </div>`);

  const meshPanel = panel(`
    <div class="panel" id="ai-mesh-panel">
      <div class="panel-head"><h2>Meshtastic · LoRa</h2><span class="spacer"></span><span class="prov" id="ai-mesh-prov" data-tone="muted">No radio</span></div>
      <p class="note">A $20 LoRa radio on each Q7/P10 post. Plug one into this computer and texts like "gate 3 open" arrive here and raise an event — with Starlink down, in Blackout, with no internet at all. Send one back from here.</p>
      <div class="controls" style="margin-top:11px">
        <button class="act" id="ai-mesh-connect" type="button">Connect radio</button>
        <button class="ghost" id="ai-mesh-close" type="button" disabled>Disconnect</button>
      </div>
      <div class="controls" style="margin-top:9px">
        <label class="field" style="flex:1 1 220px"><span>Message (≤ 200 bytes)</span><input id="ai-mesh-text" type="text" value="BO6: all quiet at the house" maxlength="200" /></label>
        <button class="ghost" id="ai-mesh-send" type="button" disabled style="align-self:flex-end">Send to mesh</button>
      </div>
      <ul class="rows" id="ai-mesh-list" style="margin-top:11px"><li class="empty">No messages.</li></ul>
      <p class="note" id="ai-mesh-note" style="margin-top:10px"></p>
    </div>`);
  $('impulses').closest('.panel').after(grid(yamPanel, meshPanel));

  const yam = { stream: null, ctx: null, node: null, buf: null, filled: 0, sinceHop: 0, gate: new EventGate(), busy: false };
  async function startYam() {
    try {
      setBadge('ai-yam-prov', 'MODEL', 'Loading');
      const classifier = await getAudioClassifier();
      yam.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      yam.ctx = new AudioContext();
      const rate = yam.ctx.sampleRate;
      const win = Math.round(rate * 0.975); const hop = Math.round(rate * 0.48);
      yam.buf = new Float32Array(win); yam.filled = 0; yam.sinceHop = 0;
      const src = yam.ctx.createMediaStreamSource(yam.stream);
      yam.node = yam.ctx.createScriptProcessor(4096, 1, 1);
      const mute = yam.ctx.createGain(); mute.gain.value = 0;
      src.connect(yam.node); yam.node.connect(mute); mute.connect(yam.ctx.destination);
      yam.node.onaudioprocess = (e) => {
        const x = e.inputBuffer.getChannelData(0);
        // Slide the 0.975 s window.
        if (x.length >= win) yam.buf.set(x.subarray(x.length - win));
        else { yam.buf.copyWithin(0, x.length); yam.buf.set(x, win - x.length); }
        yam.filled = Math.min(win, yam.filled + x.length);
        yam.sinceHop += x.length;
        if (yam.filled < win || yam.sinceHop < hop || yam.busy) return;
        yam.sinceHop = 0; yam.busy = true;
        try {
          const result = classifier.classify(Float32Array.from(yam.buf), rate);
          const cats = result?.[0]?.classifications?.[0]?.categories ?? [];
          renderYam(cats);
        } finally { yam.busy = false; }
      };
      $('ai-yam-start').disabled = true; $('ai-yam-stop').disabled = false;
      setBadge('ai-yam-prov', 'LIVE', 'Listening');
    } catch (error) {
      setBadge('ai-yam-prov', 'BLOCKED', 'Off');
      $('ai-yam-raw').textContent = `Could not start: ${error.message}.`;
    }
  }
  function stopYam() {
    yam.node?.disconnect(); yam.ctx?.close(); yam.stream?.getTracks().forEach((t) => t.stop());
    Object.assign(yam, { stream: null, ctx: null, node: null });
    $('ai-yam-start').disabled = false; $('ai-yam-stop').disabled = true;
    setBadge('ai-yam-prov', 'BLOCKED', 'Off');
  }
  function renderYam(cats) {
    const scores = ranchScores(cats);
    $('ai-yam-scores').replaceChildren(...scores.slice(0, 5).map((s) => {
      const li = row(`${s.name} · ${(s.score * 100).toFixed(0)}%`, s.top ? `strongest class: ${s.top}` : 'nothing', s.score > 0.3 ? (s.alert ? 'alert' : 'caution') : 'muted', s.kind);
      const bar = document.createElement('div');
      bar.style.cssText = `height:3px;margin-top:5px;background:linear-gradient(90deg,var(--primary) ${(s.score * 100).toFixed(0)}%,transparent 0)`;
      li.append(bar);
      return li;
    }));
    $('ai-yam-raw').textContent = `YAMNet top: ${cats.slice(0, 4).map((c) => `${c.categoryName} ${(c.score * 100).toFixed(0)}%`).join(' · ')}`;
    const { started } = yam.gate.push(scores);
    for (const id of started) {
      const ev = eventFor(id);
      const s = scores.find((x) => x.id === id);
      const text = `${s.top} at ${(s.score * 100).toFixed(0)}% for two of the last four windows. ${ev.kind === 'proxy' ? 'Proxy mapping. ' : ''}${ev.confusions}`;
      pushRow($('ai-yam-events'), row(`Heard: ${ev.name}`, text, ev.alert ? 'alert' : 'caution', new Date().toLocaleTimeString()));
      logEvent(`Heard: ${ev.name}`, text, ev.alert ? 'alert' : 'caution');
    }
  }
  $('ai-yam-start').addEventListener('click', startYam);
  $('ai-yam-stop').addEventListener('click', stopYam);

  const mesh = { port: null, reader: null, writer: null, frames: new FrameReader(), names: new Map(), me: null };
  async function connectMesh() {
    if (!serialSupported()) { setBadge('ai-mesh-prov', 'BLOCKED', 'No Web Serial'); $('ai-mesh-note').textContent = SERIAL_BLOCKED; return; }
    try {
      mesh.port = await navigator.serial.requestPort();
      await mesh.port.open({ baudRate: 115200 });
      mesh.writer = mesh.port.writable.getWriter();
      // Wake the node's API, then ask for its state.
      await mesh.writer.write(new Uint8Array(32).fill(0xc3));
      await mesh.writer.write(meshFrame(encodeWantConfig((Math.random() * 0xffffffff) >>> 0)));
      $('ai-mesh-connect').disabled = true; $('ai-mesh-close').disabled = false; $('ai-mesh-send').disabled = false;
      setBadge('ai-mesh-prov', 'LINK', 'Connecting');
      mesh.reader = mesh.port.readable.getReader();
      for (;;) {
        const { value, done } = await mesh.reader.read();
        if (done) break;
        for (const f of mesh.frames.push(value).frames) {
          let m;
          try { m = decodeFromRadio(f); } catch { continue; }
          if (m.kind === 'myInfo') { mesh.me = m.myNodeNum; setBadge('ai-mesh-prov', 'LINK', `Linked · ${nodeId(m.myNodeNum)}`); }
          if (m.kind === 'nodeInfo') mesh.names.set(m.num, m.longName || m.shortName);
          if (m.kind === 'packet' && m.packet.text != null) {
            const who = mesh.names.get(m.packet.from) || nodeId(m.packet.from);
            const gate = parseGate(m.packet.text);
            pushRow($('ai-mesh-list'), row(who, m.packet.text, gate?.state === 'open' ? 'alert' : 'primary', new Date().toLocaleTimeString(), m.packet.rxSnr != null ? `SNR ${m.packet.rxSnr.toFixed(1)} dB` : ''));
            if (gate) logEvent(`Gate ${gate.gate} ${gate.state}`, `LoRa mesh, from ${who}.`, gate.state === 'open' ? 'alert' : 'confirm');
            else logEvent('Mesh message', `${who}: ${m.packet.text}`, 'primary');
          }
        }
      }
    } catch (error) {
      $('ai-mesh-note').textContent = `Serial: ${error.message}`;
    } finally { await closeMesh(); }
  }
  async function closeMesh() {
    try { await mesh.reader?.cancel(); } catch { /* fine */ }
    try { mesh.reader?.releaseLock(); mesh.writer?.releaseLock(); } catch { /* fine */ }
    try { await mesh.port?.close(); } catch { /* fine */ }
    Object.assign(mesh, { port: null, reader: null, writer: null });
    $('ai-mesh-connect').disabled = false; $('ai-mesh-close').disabled = true; $('ai-mesh-send').disabled = true;
  }
  $('ai-mesh-connect').addEventListener('click', connectMesh);
  $('ai-mesh-close').addEventListener('click', closeMesh);
  $('ai-mesh-send').addEventListener('click', async () => {
    try {
      const text = $('ai-mesh-text').value.trim();
      if (!text || !mesh.writer) return;
      await mesh.writer.write(meshFrame(encodeText(text)));
      pushRow($('ai-mesh-list'), row('this console', text, 'confirm', new Date().toLocaleTimeString(), 'Sent to channel 0, 3 hops, ack requested.'));
    } catch (error) { $('ai-mesh-note').textContent = error.message; }
  });
  if (!serialSupported()) { setBadge('ai-mesh-prov', 'BLOCKED', 'No Web Serial'); $('ai-mesh-note').textContent = SERIAL_BLOCKED; }

  /* ========================================================== SEISMIC */

  const geoPanel = panel(`
    <div class="panel" id="ai-geo-panel">
      <div class="panel-head"><h2>Ground vibration · phone geophone</h2><span class="spacer"></span><span class="prov" id="ai-geo-prov" data-tone="muted">Off</span></div>
      <p class="note">Lay a phone flat on a gate pillar or a post footing. Its accelerometer, triggered the way seismometers are (STA/LTA), picks up footsteps, hooves and engines nearby. The label comes from rhythm and duration and is Modelled; the trigger itself is a measurement.</p>
      <div class="controls" style="margin-top:11px">
        <button class="act" id="ai-geo-start" type="button">Start</button>
        <button class="ghost" id="ai-geo-stop" type="button" disabled>Stop</button>
      </div>
      <div class="readouts" id="ai-geo-readouts" style="margin-top:11px"></div>
      <ul class="rows" id="ai-geo-events" style="margin-top:11px"><li class="empty">No triggers.</li></ul>
    </div>`);
  $('quake-truth').closest('.panel').after(geoPanel);

  const geo = { on: false, t: [], v: [], lastEnd: 0, timer: null, handler: null };
  async function startGeo() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if ((await DeviceMotionEvent.requestPermission()) !== 'granted') throw new Error('motion permission refused');
      }
      geo.t = []; geo.v = []; geo.on = true;
      geo.handler = (e) => {
        const a = e.accelerationIncludingGravity;
        if (!a || a.x == null) return;
        geo.t.push(e.timeStamp); geo.v.push(Math.hypot(a.x, a.y, a.z));
        if (geo.t.length > 6000) { geo.t.shift(); geo.v.shift(); }
      };
      addEventListener('devicemotion', geo.handler);
      $('ai-geo-start').disabled = true; $('ai-geo-stop').disabled = false;
      setBadge('ai-geo-prov', 'LIVE', 'Listening');
      geo.timer = setInterval(stepGeo, 2000);
      setTimeout(() => { if (geo.on && geo.t.length < 5) { setBadge('ai-geo-prov', 'HARDWARE', 'No accelerometer'); } }, 3000);
    } catch (error) {
      setBadge('ai-geo-prov', 'BLOCKED', 'Refused');
      $('ai-geo-readouts').replaceChildren(readout('Sensor', 'unavailable', { tone: 'alert', note: error.message }));
    }
  }
  function stopGeo() {
    geo.on = false; clearInterval(geo.timer);
    if (geo.handler) removeEventListener('devicemotion', geo.handler);
    $('ai-geo-start').disabled = false; $('ai-geo-stop').disabled = true;
    setBadge('ai-geo-prov', 'BLOCKED', 'Off');
  }
  function stepGeo() {
    const n = geo.t.length;
    if (n < 50) { $('ai-geo-readouts').replaceChildren(readout('Samples', String(n), { note: n ? 'Collecting…' : 'Nothing from the motion sensor — laptops have none.' })); return; }
    const spanS = (geo.t[n - 1] - geo.t[0]) / 1000;
    const fs = (n - 1) / spanS;
    const ratio = staLta(highPass(geo.v, fs), fs);
    const events = analyse(geo.v, fs);
    $('ai-geo-readouts').replaceChildren(
      readout('Rate', `${fs.toFixed(0)} Hz`, { note: `${n} samples over ${spanS.toFixed(0)} s` }),
      readout('STA/LTA now', fmt(ratio[ratio.length - 1], 2), { tone: ratio[ratio.length - 1] >= 3 ? 'alert' : 'confirm', note: 'Trigger at 3, release at 1.5.' }),
    );
    for (const e of events) {
      const endMs = geo.t[0] + (e.end / fs) * 1000;
      if (endMs <= geo.lastEnd || e.end >= n - 2) continue; // only finished, unreported events
      geo.lastEnd = endMs;
      const text = `${e.durationSec.toFixed(1)} s, peak ratio ${e.peak.toFixed(1)}, ${e.dominantHz.toFixed(1)} Hz. ${e.why}.`;
      pushRow($('ai-geo-events'), row(`Ground: ${e.label}`, text, e.label === 'footsteps' ? 'alert' : 'caution', new Date().toLocaleTimeString()));
      logEvent(`Ground vibration: ${e.label}`, text, e.label === 'footsteps' ? 'alert' : 'caution');
    }
  }
  $('ai-geo-start').addEventListener('click', startGeo);
  $('ai-geo-stop').addEventListener('click', stopGeo);

  /* ========================================================= ORBITAL */

  const ndviPanel = panel(`
    <div class="panel" id="ai-ndvi-panel">
      <div class="panel-head"><h2>Sentinel-2 · your pasture</h2><span class="spacer"></span><span class="prov" id="ai-ndvi-prov" data-tone="muted">Not fetched</span></div>
      <p class="note">The newest clear Sentinel-2 L2A pass over the ranch, read straight from the public archive on AWS: just your window, 10 m pixels. NDVI says how green, NDMI how much water is in the leaves. Clouds and shadows are masked out by the satellite's own scene classification. The last result is kept on this device for when the internet is down.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:0 1 130px"><span>Latitude</span><input id="ai-ndvi-lat" type="number" step="0.0001" /></label>
        <label class="field" style="flex:0 1 130px"><span>Longitude</span><input id="ai-ndvi-lon" type="number" step="0.0001" /></label>
        <label class="field" style="flex:0 1 110px"><span>Radius (m)</span><input id="ai-ndvi-r" type="number" min="200" max="5000" step="100" value="800" /></label>
        <label class="field" style="flex:0 1 110px"><span>Max cloud %</span><input id="ai-ndvi-cloud" type="number" min="0" max="100" value="30" /></label>
      </div>
      <div class="controls" style="margin-top:9px">
        <button class="act" id="ai-ndvi-run" type="button">Fetch newest clear pass</button>
        <button class="ghost" id="ai-ndvi-cached" type="button">Show cached</button>
      </div>
      <canvas id="ai-ndvi-map" width="200" height="200" style="width:100%;max-width:420px;margin-top:11px;border:1px solid var(--hair);background:#04060a;image-rendering:pixelated"></canvas>
      <div class="readouts" id="ai-ndvi-readouts" style="margin-top:11px"></div>
      <ul class="rows" id="ai-ndvi-worst" style="margin-top:11px"></ul>
      <p class="note" id="ai-ndvi-note" style="margin-top:10px"></p>
    </div>`);
  $('sat-note').closest('.panel').after(ndviPanel);
  {
    const place = bridge.ranchPlace();
    $('ai-ndvi-lat').value = place.lat.toFixed(4); $('ai-ndvi-lon').value = place.lon.toFixed(4);
  }

  function ndviColour(v) {
    if (!Number.isFinite(v)) return [10, 12, 18];
    // Brown → yellow → green across −0.1 … 0.9.
    const t = Math.min(1, Math.max(0, (v + 0.1) / 1));
    const stops = [[120, 72, 40], [214, 196, 90], [120, 190, 70], [20, 120, 50]];
    const k = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
    const f = t * (stops.length - 1) - k;
    return stops[k].map((c, i) => Math.round(c + (stops[k + 1][i] - c) * f));
  }

  function showNdvi(result) {
    const c = $('ai-ndvi-map');
    if (result.preview) {
      const img = new Image();
      img.onload = () => { c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); };
      img.src = result.preview;
    }
    $('ai-ndvi-readouts').replaceChildren(
      readout('Pass', result.date, { note: `${result.tile} · ${fmt(result.cloud, 0)}% cloud over the whole tile` }),
      readout('NDVI mean', fmt(result.meanNdvi, 2), { tone: result.meanNdvi > 0.5 ? 'confirm' : result.meanNdvi > 0.25 ? 'caution' : 'alert', note: 'Clear pixels only.' }),
      readout('NDMI mean', fmt(result.meanNdmi, 2), { note: 'Leaf water. Below 0 is drying.' }),
      readout('Clear', `${(result.clear * 100).toFixed(0)}%`, { tone: result.clear > 0.7 ? 'confirm' : 'caution', note: `Scale ${result.calSource}` }),
    );
    $('ai-ndvi-worst').replaceChildren(...result.worst.slice(0, 4).map((w) => {
      const d = dryness(w.ndvi, w.ndmi);
      return row(`Cell ${String.fromCharCode(65 + w.col)}${w.row + 1} · ${d.level}`, d.note, d.level.includes('dry') ? 'caution' : 'primary', `NDVI ${fmt(w.ndvi, 2)}`, 'Dryness is Modelled from NDMI/NDVI; it is not an official fire-danger rating.');
    }));
  }

  async function runNdvi() {
    const note = $('ai-ndvi-note');
    const lat = Number($('ai-ndvi-lat').value); const lon = Number($('ai-ndvi-lon').value);
    const radius = Number($('ai-ndvi-r').value) || 800;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { note.textContent = 'Type the ranch position.'; return; }
    setBadge('ai-ndvi-prov', 'MODEL', 'Searching');
    try {
      const bbox = boxAround(lat, lon, radius);
      const response = await fetch(STAC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stacSearch(bbox, { maxCloud: Number($('ai-ndvi-cloud').value) || 30 })) });
      if (!response.ok) throw new Error(`Earth Search answered ${response.status}`);
      const items = (await response.json()).features ?? [];
      if (!items.length) throw new Error('no pass under the cloud limit in the last 45 days');
      const GeoTIFF = await loadGeoTiff();
      let result = null;
      for (const item of items) {
        const epsg = epsgOf(item);
        if (!epsg) continue;
        note.textContent = `Reading ${item.id}…`;
        const zone = epsg % 100; const north = epsg < 32700;
        const box = utmBox(bbox, zone, north);
        const read = async (role, win) => {
          const asset = assetOf(item, role);
          if (!asset) return null;
          const image = await (await GeoTIFF.fromUrl(asset.href)).getImage();
          const w = win ?? pixelWindow(box, image.getOrigin(), image.getResolution(), image.getWidth(), image.getHeight());
          if (!w) return null;
          const [data] = await image.readRasters({ window: w });
          return { data, window: w, width: w[2] - w[0], height: w[3] - w[1], asset };
        };
        const red = await read('red');
        if (!red) continue;
        const nir = await read('nir', red.window);
        const cw = coarseWindow(red.window);
        const swir = await read('swir', cw);
        const scl = await read('scl', cw);
        const cal = scaling(item, red.asset);
        const idx = indices({
          red: red.data, nir: nir.data, swir: swir?.data ?? null, scl: scl?.data ?? null, width: red.width, height: red.height,
          coarseWidth: cw[2] - cw[0], coarseHeight: cw[3] - cw[1], fineOrigin: [red.window[0], red.window[1]], cal,
        });
        if (idx.clearFraction < 0.3) { note.textContent = `${item.id}: only ${(idx.clearFraction * 100).toFixed(0)}% clear over the ranch — trying an older pass.`; continue; }
        const mean = (a) => { let s = 0; let k = 0; for (const v of a ?? []) if (Number.isFinite(v)) { s += v; k += 1; } return k ? s / k : NaN; };
        const cellsN = cellStats(idx.ndvi, idx.width, idx.height, 6, 6);
        const cellsM = idx.ndmi ? cellStats(idx.ndmi, idx.width, idx.height, 6, 6) : null;
        const c = document.createElement('canvas'); c.width = idx.width; c.height = idx.height;
        const img = c.getContext('2d').createImageData(idx.width, idx.height);
        for (let i = 0; i < idx.ndvi.length; i += 1) img.data.set([...ndviColour(idx.ndvi[i]), 255], i * 4);
        c.getContext('2d').putImageData(img, 0, 0);
        result = {
          id: item.id, date: (item.properties.datetime ?? '').slice(0, 10), tile: item.properties['s2:mgrs_tile'] ?? item.properties['grid:code'] ?? '', cloud: item.properties['eo:cloud_cover'],
          meanNdvi: mean(idx.ndvi), meanNdmi: mean(idx.ndmi), clear: idx.clearFraction, calSource: cal.source,
          worst: cellsN.worst.map((w) => ({ col: w.col, row: w.row, ndvi: w.mean, ndmi: cellsM?.cells.find((m) => m.col === w.col && m.row === w.row)?.mean ?? NaN })),
          preview: c.toDataURL('image/png'), atMs: Date.now(), lat, lon, radius,
        };
        break;
      }
      if (!result) throw new Error('every recent pass was cloudy over the ranch or missing a band');
      store.set('bo6.ai.ndvi.v1', result);
      showNdvi(result);
      setBadge('ai-ndvi-prov', 'LINK', `Sentinel-2 · ${result.date}`);
      note.textContent = `${result.id}. Copernicus Sentinel-2 data, via Element 84 Earth Search on AWS. Cells are A–F west to east, 1–6 north to south.`;
    } catch (error) {
      setBadge('ai-ndvi-prov', 'BLOCKED', 'Not fetched');
      note.textContent = `Could not read Sentinel-2: ${error.message}.${store.get('bo6.ai.ndvi.v1', null) ? ' The cached pass is still available.' : ''}`;
    }
  }
  $('ai-ndvi-run').addEventListener('click', runNdvi);
  $('ai-ndvi-cached').addEventListener('click', () => {
    const cached = store.get('bo6.ai.ndvi.v1', null);
    if (!cached) { $('ai-ndvi-note').textContent = 'Nothing cached yet.'; return; }
    showNdvi(cached);
    setBadge('ai-ndvi-prov', 'MODEL', `Cached · ${cached.date}`);
    $('ai-ndvi-note').textContent = `Cached on ${new Date(cached.atMs).toLocaleString()} — the pasture may have changed since.`;
  });

  /* =========================================================== VAULT */

  const chainPanel = panel(`
    <div class="panel" id="ai-chain-panel">
      <div class="panel-head"><h2>Chain of custody · BLAKE3</h2><span class="spacer"></span><span class="prov" id="ai-chain-prov" data-tone="muted">Idle</span></div>
      <p class="note">Every second the recorder produces is hashed with BLAKE3 the moment it arrives and chained to the one before. A kept clip gets a manifest with its own BLAKE3, the chain links for its 60 seconds, and an IPFS content address (CIDv1) — so anyone can later prove the file is the one the camera made, and that no second was cut.</p>
      <div class="readouts" id="ai-chain-readouts" style="margin-top:11px"></div>
      <div class="controls" style="margin-top:11px">
        <button class="ghost" id="ai-chain-verify" type="button">Verify chain</button>
        <button class="ghost" id="ai-chain-export" type="button">Export chain</button>
      </div>
      <ul class="rows" id="ai-chain-clips" style="margin-top:11px"><li class="empty">No kept clips yet.</li></ul>
    </div>`);
  $('deck-vault').append(chainPanel);

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function renderChain() {
    const c = ai.chain;
    setBadge('ai-chain-prov', c.entries.length ? 'LIVE' : 'BLOCKED', c.entries.length ? 'Hashing' : 'Idle');
    $('ai-chain-readouts').replaceChildren(
      readout('Entries', String(c.entries.length), { note: 'Seconds of video plus model answers.' }),
      readout('Head', c.entries.length ? `${c.head.slice(0, 16)}…` : '—', { note: 'Write this down to pin everything so far.' }),
    );
  }
  function hookRecorder() {
    const rec = state.vault.recorder;
    if (!rec || ai.hookedRecorder === rec) return;
    ai.hookedRecorder = rec;
    rec.addEventListener('dataavailable', (event) => {
      if (!event.data?.size) return;
      const atMs = Date.now();
      // Queue so seconds are chained in the order they were recorded.
      ai.chainQueue = ai.chainQueue.then(async () => {
        ai.chain.appendChunk(new Uint8Array(await event.data.arrayBuffer()), atMs, { mime: state.vault.mime || 'video/webm' });
        if (ai.chain.entries.length > 7200) ai.chain.entries.splice(0, ai.chain.entries.length - 7200);
        if (state.deck === 'vault') renderChain();
      });
    });
  }
  async function watchClips() {
    for (const clip of state.vault.clips) {
      if (ai.seenClips.has(clip.id)) continue;
      ai.seenClips.add(clip.id);
      await ai.chainQueue;
      const bytes = new Uint8Array(await clip.blob.arrayBuffer());
      const entries = ai.chain.window(clip.atMs - 31000, clip.atMs + 31000);
      const manifest = clipManifest(bytes, entries, { reason: clip.reason, atMs: clip.atMs, mime: clip.mime, sha256: clip.hash || null });
      ai.manifests.unshift({ clip, manifest });
      const li = row(`CID ${manifest.cid.slice(0, 22)}…`, `${clip.seconds.toFixed(0)} s · ${entries.length} chained seconds · ${clip.reason}`, 'confirm', new Date(clip.atMs).toLocaleTimeString(), `BLAKE3 ${manifest.blake3.slice(0, 32)}…`);
      const btn = document.createElement('button');
      btn.className = 'ghost'; btn.type = 'button'; btn.textContent = 'Export manifest'; btn.style.marginTop = '8px';
      btn.addEventListener('click', () => download(`bo6-${new Date(clip.atMs).toISOString().replace(/[:.]/g, '-').slice(0, 19)}-manifest.json`, JSON.stringify(manifest, null, 2)));
      li.append(btn);
      pushRow($('ai-chain-clips'), li);
    }
  }
  $('ai-chain-verify').addEventListener('click', () => {
    // A chain trimmed in this browser is checked from its first kept entry onward.
    const entries = ai.chain.entries;
    const v = EvidenceChain.verify(entries, entries[0]?.prev, entries[0]?.index ?? 0);
    const verdict = entries[0]?.index ? `${v.reason} (older seconds were trimmed from this browser).` : v.reason;
    logEvent(v.ok ? 'Chain verified' : 'Chain BROKEN', verdict, v.ok ? 'confirm' : 'alert');
    $('ai-chain-readouts').append(readout('Verify', v.ok ? 'intact' : `broken at ${v.brokenAt}`, { tone: v.ok ? 'confirm' : 'alert', note: verdict }));
  });
  $('ai-chain-export').addEventListener('click', () => download('bo6-evidence-chain.json', JSON.stringify({ format: 'black-optic-6/evidence-chain@1', entries: ai.chain.entries }, null, 2)));
  setInterval(() => { hookRecorder(); watchClips(); }, 1500);

  /* ======================================================== SPEEDLAB */

  const vlmPanel = panel(`
    <div class="panel" id="ai-vlm-panel">
      <div class="panel-head"><h2>Ask once · your local VLM</h2><span class="spacer"></span><span class="prov" id="ai-vlm-prov" data-tone="muted">Not linked</span></div>
      <p class="note">Every question about one frame goes to a vision-language model on your own machine (Ollama) as a single request with a strict JSON answer per question. The timings come from Ollama itself, and "Compare" measures one call per question against it. Each answer is hashed into the evidence chain with the frame. Answers are Modelled — VLMs can be confidently wrong.</p>
      <div class="controls" style="margin-top:11px">
        <label class="field" style="flex:1 1 200px"><span>Ollama</span><input id="ai-vlm-url" type="text" value="http://localhost:11434" /></label>
        <label class="field" style="flex:0 1 150px"><span>Vision model</span><input id="ai-vlm-model" type="text" value="gemma3:4b" /></label>
      </div>
      <label class="field" style="margin-top:9px"><span>Questions, one per line</span><textarea id="ai-vlm-q" rows="4">${DEFAULT_QUESTIONS.join('\n')}</textarea></label>
      <div class="controls" style="margin-top:9px">
        <button class="act" id="ai-vlm-ask" type="button">Ask once</button>
        <button class="ghost" id="ai-vlm-compare" type="button">Compare with one call each</button>
      </div>
      <div class="readouts" id="ai-vlm-readouts" style="margin-top:11px"></div>
      <ul class="rows" id="ai-vlm-answers" style="margin-top:11px"></ul>
      <p class="note" id="ai-vlm-note" style="margin-top:10px">Start Ollama with OLLAMA_ORIGINS set to this site (or *) so the browser may call it, and pull a vision model first (ollama pull gemma3:4b).</p>
    </div>`);
  $('speed-batch').closest('.grid').after(vlmPanel);
  $('ai-vlm-url').value = store.get('bo6.ai.vlm.url', 'http://localhost:11434');
  $('ai-vlm-model').value = store.get('bo6.ai.vlm.model', 'gemma3:4b');

  async function frameJpeg() {
    const video = bridge.video();
    if (!video || video.readyState < 2) throw new Error('open the camera first');
    const w = Math.min(896, video.videoWidth); const h = Math.round((w * video.videoHeight) / video.videoWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(video, 0, 0, w, h);
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { bytes, b64: btoa(bin) };
  }
  async function askOllama(questions, img) {
    const base = $('ai-vlm-url').value.trim().replace(/\/+$/, '');
    const model = $('ai-vlm-model').value.trim();
    store.set('bo6.ai.vlm.url', base); store.set('bo6.ai.vlm.model', model);
    const body = chatRequest({ model, questions, imageBase64: img.b64 });
    const t0 = performance.now();
    const response = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 160)}`);
    const reply = await response.json();
    return { reply, wallMs: performance.now() - t0, model, prompt: body.messages[0].content };
  }
  async function askOnce() {
    const questions = parseQuestions($('ai-vlm-q').value);
    if (!questions.length) return;
    const note = $('ai-vlm-note');
    try {
      setBadge('ai-vlm-prov', 'MODEL', 'Asking');
      const img = await frameJpeg();
      const { reply, wallMs, model, prompt } = await askOllama(questions, img);
      const parsed = parseReply(reply, questions);
      const t = timings(reply);
      const entry = ai.chain.append('vlm', { atMs: Date.now(), model, frame: blake3Hex(img.bytes), prompt: blake3Hex(prompt), reply: blake3Hex(reply?.message?.content ?? ''), answers: parsed.answers.map((a) => a.answer) });
      $('ai-vlm-answers').replaceChildren(...parsed.answers.map((a) => row(a.question, a.evidence || '—', a.answer === 'yes' ? 'alert' : a.answer === 'no' ? 'confirm' : 'caution', a.answer.toUpperCase())));
      $('ai-vlm-readouts').replaceChildren(
        readout('Round trip', `${wallMs.toFixed(0)} ms`, { note: `${questions.length} questions, one call` }),
        readout('Model time', t.totalMs != null ? `${t.totalMs.toFixed(0)} ms` : '—', { note: `prompt ${fmt(t.promptMs, 0)} ms · output ${fmt(t.generateMs, 0)} ms · load ${fmt(t.loadMs, 0)} ms` }),
        readout('Well-formed', parsed.wellFormed ? 'yes' : 'no', { tone: parsed.wellFormed ? 'confirm' : 'caution', note: parsed.wellFormed ? 'One answer per question.' : 'Missing answers were set to unsure.' }),
        readout('Chained', `#${entry.index}`, { note: `${entry.link.slice(0, 16)}…` }),
      );
      for (const ev of ruleEvents(parsed.answers)) logEvent(`VLM: ${ev.title}`, ev.detail, 'caution');
      setBadge('ai-vlm-prov', 'MODEL', `Answered · ${model}`);
      note.textContent = `Frame BLAKE3 ${entry.frame.slice(0, 16)}… recorded in the evidence chain with the prompt and reply hashes.`;
      renderChain();
    } catch (error) {
      setBadge('ai-vlm-prov', 'BLOCKED', 'Not linked');
      note.textContent = `${error.message}. Is Ollama running here, with OLLAMA_ORIGINS allowing this page?`;
    }
  }
  async function compare() {
    const questions = parseQuestions($('ai-vlm-q').value);
    const note = $('ai-vlm-note');
    try {
      setBadge('ai-vlm-prov', 'MODEL', 'Measuring');
      const img = await frameJpeg();
      await askOllama(questions.slice(0, 1), img); // warm-up: model load is not part of either side
      const batched = await askOllama(questions, img);
      const singles = [];
      for (const q of questions) singles.push((await askOllama([q], img)).wallMs);
      const x = speedup(batched.wallMs, singles);
      $('ai-vlm-readouts').replaceChildren(
        readout('One call', `${batched.wallMs.toFixed(0)} ms`, { note: `${questions.length} questions together` }),
        readout('One per question', `${singles.reduce((s, v) => s + v, 0).toFixed(0)} ms`, { note: singles.map((s) => s.toFixed(0)).join(' + ') }),
        readout('Speed-up', x ? `${x.toFixed(2)}×` : '—', { tone: x > 1 ? 'confirm' : 'caution', note: 'Measured on your machine, warm model.' }),
      );
      setBadge('ai-vlm-prov', 'LIVE', 'Measured');
      logEvent('Ask-once measured', `${x?.toFixed(2)}× faster for ${questions.length} questions on ${batched.model}.`, 'confirm');
    } catch (error) {
      setBadge('ai-vlm-prov', 'BLOCKED', 'Not linked');
      note.textContent = `${error.message}.`;
    }
  }
  $('ai-vlm-ask').addEventListener('click', askOnce);
  $('ai-vlm-compare').addEventListener('click', compare);

  /* ========================================================== LEDGER */

  const t = installTally();
  const installPanel = panel(`
    <div class="panel" id="ai-install-panel">
      <div class="panel-head"><h2>AI stack · what got installed</h2><span class="spacer"></span><span class="prov" data-tone="primary">${INSTALLS.length} repos</span></div>
      <p class="note">Every repository on the list, what it became in this console, and the plain reason when a repo cannot run in a browser. ${Object.entries(t).map(([k, n]) => `${n} ${STATUS[k].label.toLowerCase()}`).join(' · ')}.</p>
      <ul class="rows" id="ai-install-list" style="margin-top:11px"></ul>
    </div>`);
  $('deck-ledger').append(installPanel);
  $('ai-install-list').replaceChildren(...INSTALLS.map((i) => row(i.repo, i.what, STATUS[i.status].tone, STATUS[i.status].label, `${i.section} · licence ${i.licence}`)));

  renderChain();
  renderTags();

  return {
    onFrame() {
      stepDetector();
      drawOverlay();
    },
  };
}
