/**
 * RANCH COMMAND — application shell.
 *
 * Owns everything live: camera streams, the AI loops, the MQTT and MAVLink
 * connections, the alert queue, Air Swipe and Rafa. Slides (slides.js) only
 * arrange what this file holds.
 *
 * @module ranch-command/app
 */

import { el, fill } from './dom.js';
import { SLIDES } from './slides.js';
import { load as loadSettings, save as saveSettings } from './config.js';
import { AlertQueue, fromEdge, fromFrigate, kindOf } from './events.js';
import { MqttClient, json, topicMatches } from './mqtt.js';
import { Fleet, MavlinkParser, fromMavlink2Rest } from './mavlink.js';
import { Mesh, fromMeshtastic, fromSensor } from './mesh.js';
import { listDevices, openDevice, playHLS, playMJPEG, playWebRTC, urlProblem } from './streams.js';
import { createDetector, createHandTracker, detections, edge, findByText, grabFrame, segmentAt } from './ai.js';
import { MotionCentroid, SwipeDetector, calibrate as calibrateFrom, measureRest, measureStroke } from './gesture.js';
import { INTROS, Rafa, answer, recogniser } from './rafa.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ------------------------------------------------------------------ state */

const settings = loadSettings();
let rules = null;

const ctx = {
  settings,
  alerts: null,
  fleet: new Fleet(),
  mesh: new Mesh(),
  health: null,
  links: { edge: 'off', mqtt: 'off', mavlink: 'off' },
  ui: {},
  state: {
    vision: { camera: null, running: false, raise: false, status: '', counts: {}, perCamera: {} },
    search: { camera: null, prompt: 'open gate, cattle, truck', busy: false, status: '', results: [] },
    segment: { camera: null, frozen: null, status: '', coverage: null },
    events: { filter: 'all' },
    drones: { target: null, reason: '', altitude: 40 },
  },
};

const cams = new Map();
let current = 0;
let target = 0;
let steering = 0;

/* ------------------------------------------------------------- utilities */

function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('shown');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => node.classList.remove('shown'), 4200);
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

Object.assign(ctx, {
  toast,
  download,
  saveSettings: () => saveSettings(settings),
  goTo: (id) => go(SLIDES.findIndex((s) => s.id === id)),
  render: () => renderSlide(current),
});

/* ------------------------------------------------------------------ Rafa */

const rafa = new Rafa({
  onCaption: (text) => { $('rafa-caption').textContent = text; },
  onSpeaking: (on) => $('rafa').classList.toggle('speaking', on),
});
rafa.mode = settings.voice.mode;
rafa.enabled = settings.voice.enabled;
ctx.rafa = rafa;

function setVoice(on) {
  settings.voice.enabled = on;
  rafa.enabled = on;
  if (!on) rafa.hush();
  $('btn-voice').setAttribute('aria-pressed', String(on));
  $('voice-ico').textContent = on ? '🔊' : '🔇';
  saveSettings(settings);
}

let touring = false;
ctx.tour = async () => {
  touring = true;
  rafa.say(answer('tour'));
  for (let i = 1; i < SLIDES.length && touring; i += 1) {
    await new Promise((r) => setTimeout(r, i === 1 ? 3500 : 9500));
    if (!touring) break;
    go(i);
  }
  touring = false;
};

function ask(question) {
  const entry = answer(question);
  if (!entry) {
    rafa.say({ en: "[es:Híjole,] that one's beyond me. Try cameras, drones, alerts, NanoOWL, or say tour.", es: 'Híjole, esa no me la sé. Pregúntame de cámaras, drones, alertas o NanoOWL, o di recorrido.' });
    return;
  }
  if (entry.tour) { ctx.tour(); return; }
  if (entry.joke) { rafa.quip('joke'); return; }
  rafa.say(entry);
  if (entry.go) ctx.goTo(entry.go);
}

/* ----------------------------------------------------------------- slides */

function buildSlides() {
  const track = $('track');
  fill(track, SLIDES.map((s, i) => el('section.slide', { id: `slide-${s.id}`, 'aria-label': s.title, 'data-index': i }, [
    el('div.slide-inner', {}, [
      el('header.slide-head', {}, [
        el('p.kicker', {}, [el('span.slide-n', { text: `${String(i + 1).padStart(2, '0')} / ${SLIDES.length} · ` }), s.kicker]),
        el('h2.holo', { text: s.title }),
        el('p.lede', { text: s.lede }),
      ]),
      el('div.slide-body'),
    ]),
  ])));
  fill($('dots'), SLIDES.map((s, i) => el('button.dot', { type: 'button', 'aria-label': s.title, onclick: () => go(i) })));
}

function renderSlide(i) {
  const s = SLIDES[i];
  const body = document.querySelector(`#slide-${s.id} .slide-body`);
  if (!body) return;
  try {
    fill(body, [s.render(ctx)]);
  } catch (error) {
    console.error('[ranch] slide failed', s.id, error);
    fill(body, [el('div.card.threat', {}, [el('p', { text: `This slide hit an error: ${error.message}` })])]);
  }
}

/**
 * Land on a slide instantly. The track's CSS asks for smooth scrolling, and
 * a plain `scrollLeft =` obeys that too — so a jump has to switch it off for
 * the moment it moves, or the safety net below would stall exactly when the
 * smooth scroll it is rescuing did.
 */
function jumpTo(i) {
  const track = $('track');
  track.style.scrollBehavior = 'auto';
  track.scrollLeft = i * track.clientWidth;
  track.style.scrollBehavior = '';
  onScroll();
}

function go(index) {
  const i = Math.max(0, Math.min(SLIDES.length - 1, index));
  target = i;
  steering = performance.now() + 1100;
  const track = $('track');
  if (reduced) { jumpTo(i); return; }
  track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  // Some engines drop a smooth scroll issued mid-gesture; if it has not
  // arrived, jump.
  setTimeout(() => { if (target === i && Math.abs(track.scrollLeft - i * track.clientWidth) > 4) jumpTo(i); }, 900);
}

let settle = 0;
function onScroll() {
  const track = $('track');
  const p = track.scrollLeft / Math.max(1, track.clientWidth);
  const nearest = Math.max(0, Math.min(SLIDES.length - 1, Math.round(p)));
  if (performance.now() > steering) target = nearest;
  if (nearest !== current) {
    const was = current;
    current = nearest;
    activate(was);
  }
  clearTimeout(settle);
  settle = setTimeout(arrived, 500);
}

let lastArrival = -1;
function arrived() {
  if (lastArrival === current) return;
  lastArrival = current;
  if (settings.voice.narrate && $('gate').classList.contains('gone')) rafa.say(INTROS[SLIDES[current].id]);
}

function activate(was) {
  document.querySelectorAll('.slide').forEach((n, i) => n.classList.toggle('active', i === current));
  document.querySelectorAll('.dot').forEach((n, i) => n.classList.toggle('on', i === current));
  $('prev').disabled = current === 0;
  $('next').disabled = current === SLIDES.length - 1;
  const id = SLIDES[current].id;
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  renderSlide(current);
  // Slides off-screen stop costing battery.
  if (SLIDES[was]?.id === 'map' && id !== 'map') map?.stop();
  if (id === 'map') map?.start();
}

/* ---------------------------------------------------------------- tilt */

let tiltOn = false;
async function toggleTilt() {
  if (tiltOn) {
    tiltOn = false;
    removeEventListener('deviceorientation', onTilt);
    document.documentElement.style.setProperty('--tilt-x', 0);
    document.documentElement.style.setProperty('--tilt-y', 0);
  } else {
    try {
      if (typeof DeviceOrientationEvent?.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') { toast('Motion access was not granted.'); return; }
    } catch { toast('Motion access was not granted.'); return; }
    tiltOn = true;
    tiltZero = null;
    addEventListener('deviceorientation', onTilt);
  }
  $('btn-tilt').setAttribute('aria-pressed', String(tiltOn));
}
let tiltZero = null;
function onTilt(e) {
  if (e.beta == null) return;
  if (!tiltZero) tiltZero = { b: e.beta, g: e.gamma };
  const x = Math.max(-1, Math.min(1, (e.gamma - tiltZero.g) / 25));
  const y = Math.max(-1, Math.min(1, (e.beta - tiltZero.b) / 25));
  document.documentElement.style.setProperty('--tilt-x', x.toFixed(3));
  document.documentElement.style.setProperty('--tilt-y', y.toFixed(3));
  if (map) map.tilt = { x, y };
}
addEventListener('pointermove', (e) => {
  if (tiltOn || e.pointerType !== 'mouse') return;
  document.documentElement.style.setProperty('--tilt-x', ((e.clientX / innerWidth - 0.5) * 2).toFixed(3));
  document.documentElement.style.setProperty('--tilt-y', ((e.clientY / innerHeight - 0.5) * 2).toFixed(3));
});

/* --------------------------------------------------------------- cameras */

ctx.cameraList = () => [...cams.values()];
ctx.cameraByName = (name) => [...cams.values()].find((c) => c.name === name) || null;
ctx.sourceOf = (id) => cams.get(id)?.media || null;

function persistCameras() {
  settings.cameras = [...cams.values()].filter((c) => c.kind !== 'device').map(({ id, name, kind, url, zone, lat, lon }) => ({ id, name, kind, url, zone, lat, lon }));
  saveSettings(settings);
}

async function startCamera(c) {
  c.error = null;
  try {
    if (c.kind === 'device') {
      const stream = await openDevice({ deviceId: c.deviceId, facing: c.facing });
      c.media = el('video', { playsinline: true, muted: true, autoplay: true });
      c.media.muted = true;
      c.media.srcObject = stream;
      await c.media.play().catch(() => {});
      c.close = () => stream.getTracks().forEach((t) => t.stop());
      const track = stream.getVideoTracks()[0];
      if (!c.name || c.name === 'This device') c.name = track?.label ? track.label.replace(/\s*\(.*\)$/, '') : (c.facing === 'user' ? 'Front camera' : 'Back camera');
      track?.addEventListener('ended', () => { c.error = 'This camera was stopped — on iPhone, opening another camera stops this one.'; ctx.render(); });
    } else if (c.kind === 'mjpeg') {
      c.media = el('img', { alt: c.name });
      c.close = playMJPEG(c.media, c.url);
    } else {
      c.media = el('video', { playsinline: true, muted: true, autoplay: true });
      c.media.muted = true;
      c.close = c.kind === 'hls' ? playHLS(c.media, c.url) : await playWebRTC(c.media, c.url);
      c.media.play?.().catch(() => {});
    }
  } catch (error) {
    c.error = error.name === 'NotAllowedError' ? 'Camera permission was declined.' : error.message;
  }
}

ctx.addDevice = async (facing = 'environment', deviceId) => {
  if (isIOS && swipeStream && settings.gesture.camera !== facing) toast('iPhone runs one camera at a time — Air Swipe will pause while this one is live.');
  const c = { id: `dev-${Date.now()}`, name: 'This device', kind: 'device', facing, deviceId, zone: '', lat: settings.home.lat, lon: settings.home.lon };
  cams.set(c.id, c);
  await startCamera(c);
  if (c.error) toast(c.error);
  else rafa.say({ en: '[es:¡Listo!] Your camera is on the wall.', es: '¡Listo! Tu cámara ya está en la pared.' });
  for (const k of ['vision', 'search', 'segment']) ctx.state[k].camera ??= c.id;
  ctx.render();
};

ctx.pickDevice = async () => {
  const devices = await listDevices();
  if (!devices.length) { toast('No cameras found on this device.'); return; }
  modal([
    el('h3', { text: 'Choose a camera' }),
    el('p.muted', { text: 'Labels appear once camera access has been allowed.' }),
    ...devices.map((d) => el('button.btn', { type: 'button', style: { width: '100%', marginBottom: '8px' }, onclick: () => { closeModal(); ctx.addDevice('environment', d.deviceId); } }, [d.label])),
    el('button.btn.ghost', { type: 'button', onclick: closeModal }, ['Cancel']),
  ]);
};

ctx.addNetworkCamera = async (config) => {
  const c = { ...config, id: `net-${Date.now()}` };
  cams.set(c.id, c);
  persistCameras();
  await startCamera(c);
  if (c.error) toast(c.error);
  ctx.render();
};

function removeCamera(id) {
  const c = cams.get(id);
  c?.close?.();
  cams.delete(id);
  persistCameras();
  for (const k of ['vision', 'search', 'segment']) if (ctx.state[k].camera === id) ctx.state[k].camera = cams.keys().next().value || null;
  ctx.render();
}

ctx.cameraTile = (c) => el('div.cam', {}, [
  c.media || el('div'),
  el('div.cam-bar', {}, [el('span.live'), el('b', { text: c.name }), el('span.tag', { text: c.kind }), c.zone ? el('span.tag.gold', { text: c.zone }) : null]),
  c.error ? el('div.cam-error', { text: c.error }) : null,
  el('div.cam-actions', {}, [
    el('button.btn.sm', { type: 'button', onclick: () => { ctx.state.vision.camera = c.id; ctx.goTo('vision'); } }, ['AI']),
    c.error ? el('button.btn.sm', { type: 'button', onclick: async () => { await startCamera(c); ctx.render(); } }, ['Retry']) : null,
    el('button.btn.red.sm', { type: 'button', onclick: () => removeCamera(c.id), 'aria-label': `Remove ${c.name}` }, ['✕']),
  ]),
]);

/* ------------------------------------------------------------ AI stages */

const stages = {};

ctx.stage = (name) => {
  if (!stages[name]) {
    const frame = el('canvas.frame');
    const overlay = el('canvas.overlay');
    const msg = el('div.stage-msg');
    const node = el(`div.stage${name === 'segment' ? '.tap' : ''}`, {}, [frame, overlay, msg]);
    stages[name] = { node, frame, overlay, msg };
    if (name === 'segment') node.addEventListener('click', (e) => onSegmentTap(e));
  }
  return stages[name].node;
};

/** Copy the selected feed into each visible stage, every frame. */
function stageLoop() {
  const id = SLIDES[current]?.id;
  const st = stages[id];
  if (st && ['vision', 'search', 'segment'].includes(id)) {
    const s = ctx.state[id];
    const src = ctx.sourceOf(s.camera);
    const w = src?.videoWidth || src?.naturalWidth || 0;
    const h = src?.videoHeight || src?.naturalHeight || 0;
    if (!(id === 'segment' && s.frozen)) {
      if (w && h) {
        if (st.frame.width !== w || st.frame.height !== h) { st.frame.width = w; st.frame.height = h; st.overlay.width = w; st.overlay.height = h; }
        try { st.frame.getContext('2d').drawImage(src, 0, 0, w, h); st.msg.textContent = ''; } catch { st.msg.textContent = 'This feed cannot be read by the page (its server does not allow cross-origin access).'; }
      } else {
        st.msg.textContent = cams.size ? 'Waiting for the feed…' : 'Add a camera on the Cameras slide.';
      }
    }
  }
  requestAnimationFrame(stageLoop);
}

function drawBoxes(st, boxes, color = '#39ff14') {
  const g = st.overlay.getContext('2d');
  g.clearRect(0, 0, st.overlay.width, st.overlay.height);
  const scale = st.overlay.width / 640;
  g.lineWidth = Math.max(2, 3 * scale);
  g.font = `${Math.max(12, 18 * scale)}px ui-monospace, Menlo, monospace`;
  for (const d of boxes) {
    const c = d.color || color;
    g.strokeStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 12;
    g.strokeRect(d.box.x, d.box.y, d.box.w, d.box.h);
    g.shadowBlur = 0;
    const label = `${d.label} ${Math.round(d.score * 100)}%`;
    const tw = g.measureText(label).width + 10;
    g.fillStyle = c;
    g.fillRect(d.box.x, Math.max(0, d.box.y - 24 * scale), tw, 24 * scale);
    g.fillStyle = '#000';
    g.fillText(label, d.box.x + 5, Math.max(16 * scale, d.box.y - 6 * scale));
  }
}

/* ---------------------------------------------------------------- vision */

let detector = null;
const KIND_COLOR = { person: '#ff2d3d', vehicle: '#ff2d3d', predator: '#ff2d3d', livestock: '#39ff14', animal: '#ffcf4a', wildlife: '#ffcf4a', unknown: '#ffcf4a' };

ctx.toggleVision = async () => {
  const s = ctx.state.vision;
  if (s.running) { s.running = false; s.status = 'Detector stopped.'; ctx.render(); return; }
  if (!s.camera) { toast('Add a camera first.'); return; }
  s.status = 'Loading the on-device model…';
  ctx.render();
  try {
    detector ??= await createDetector();
  } catch (error) {
    s.status = `Could not start the detector: ${error.message}`;
    ctx.render();
    return;
  }
  s.running = true;
  s.status = 'EfficientDet-Lite0 · running on this device';
  ctx.render();
  visionLoop();
};

const seen = new Map();
function visionLoop() {
  const s = ctx.state.vision;
  if (!s.running) return;
  const src = ctx.sourceOf(s.camera);
  const st = stages.vision;
  const ready = src && (src.readyState >= 2 || src.complete) && (src.videoWidth || src.naturalWidth);
  if (ready && SLIDES[current].id === 'vision' && st) {
    try {
      const t0 = performance.now();
      const found = detections(detector.detectForVideo(st.frame, t0));
      const counts = {};
      for (const d of found) {
        const kind = kindOf(d.label, rules);
        counts[kind] = (counts[kind] || 0) + 1;
        d.color = KIND_COLOR[kind];
        if (s.raise) raiseFromDevice(d);
      }
      s.counts = counts;
      s.perCamera[s.camera] = counts;
      s.status = `EfficientDet-Lite0 · this device · ${Math.round(performance.now() - t0)} ms/frame`;
      drawBoxes(st, found);
      if (ctx.ui.visionCounts?.isConnected) {
        ctx.ui.visionCounts.querySelectorAll('.kpi b').forEach((b, i) => { b.textContent = String(counts[['person', 'vehicle', 'livestock', 'predator', 'animal'][i]] || 0); });
        const via = ctx.ui.visionCounts.parentElement?.querySelector('.via');
        if (via) via.textContent = s.status;
      }
    } catch (error) {
      s.status = `Detector error: ${error.message}`;
    }
  }
  setTimeout(() => requestAnimationFrame(visionLoop), 90);
}

function raiseFromDevice(d) {
  const cam = cams.get(ctx.state.vision.camera);
  if (!cam) return;
  const bucket = Math.floor(Date.now() / 30000);
  const id = `device:${cam.id}:${d.label}:${bucket}`;
  if (seen.has(id)) return;
  seen.set(id, true);
  if (seen.size > 500) seen.delete(seen.keys().next().value);
  const alert = ctx.alerts.add({ id, source: 'device', camera: cam.name, label: d.label, baseLabel: d.label, score: d.score, zones: cam.zone ? [cam.zone] : [], start: Date.now() / 1000, snapshot: false });
  if (alert && ['critical', 'high'].includes(alert.routing.priority)) { rafa.quip('alert'); toast(`${alert.routing.priority.toUpperCase()}: ${alert.label} at ${alert.camera}`); }
}

/* ---------------------------------------------------------------- search */

ctx.runSearch = async () => {
  const s = ctx.state.search;
  const st = stages.search;
  const prompts = s.prompt.split(',').map((p) => p.trim()).filter(Boolean);
  if (!prompts.length) { toast('Type something to find.'); return; }
  if (!st?.frame.width) { toast('No frame yet — pick a live feed.'); return; }
  s.busy = true;
  s.status = settings.edgeUrl ? 'Asking NanoOWL on the edge box…' : 'Loading OWL-ViT in this browser (first time is a large download)…';
  ctx.render();
  try {
    const frame = grabFrame(st.frame);
    const scale = st.frame.width / frame.width;
    const out = await findByText({ image: frame.url, prompts, threshold: 0.1, edgeUrl: settings.edgeUrl, onProgress: (p) => { if (p.status === 'progress' && p.progress) { s.status = `Downloading model… ${Math.round(p.progress)}%`; const v = document.querySelector('#slide-search .via'); if (v) v.textContent = s.status; } } });
    s.results = out.detections.map((d) => ({ ...d, box: { x: d.box.x * scale, y: d.box.y * scale, w: d.box.w * scale, h: d.box.h * scale }, color: '#ffcf4a' }));
    s.status = `${out.via} · ${s.results.length} match${s.results.length === 1 ? '' : 'es'}`;
    drawBoxes(st, s.results, '#ffcf4a');
    rafa.say(s.results.length ? { en: `Found ${s.results.length}. [es:¡Ahí está!]`, es: `Encontré ${s.results.length}. ¡Ahí está!` } : { en: 'Nothing matching in this frame, [es:jefe].', es: 'Nada en esta imagen, jefe.' });
  } catch (error) {
    s.status = settings.edgeUrl ? `The edge box could not run NanoOWL: ${error.message}` : `The in-browser model could not load (${error.message}). It needs internet on first use; an edge box avoids that.`;
  }
  s.busy = false;
  ctx.render();
  if (s.results.length) drawBoxes(st, s.results, '#ffcf4a');
};

/* --------------------------------------------------------------- segment */

ctx.freeze = () => {
  const s = ctx.state.segment;
  if (s.frozen) { s.frozen = null; s.coverage = null; stages.segment.overlay.getContext('2d').clearRect(0, 0, 1e5, 1e5); ctx.render(); return; }
  if (!stages.segment?.frame.width) { toast('No frame yet — pick a live feed.'); return; }
  s.frozen = grabFrame(stages.segment.frame, stages.segment.frame.width);
  ctx.render();
};

async function onSegmentTap(e) {
  const s = ctx.state.segment;
  const st = stages.segment;
  if (!s.frozen) { toast('Freeze a frame first, then tap.'); return; }
  const rect = st.frame.getBoundingClientRect();
  // The frame is letterboxed by object-fit: contain; map the tap into pixels.
  const scale = Math.min(rect.width / st.frame.width, rect.height / st.frame.height);
  const ox = (rect.width - st.frame.width * scale) / 2;
  const oy = (rect.height - st.frame.height * scale) / 2;
  const x = (e.clientX - rect.left - ox) / scale;
  const y = (e.clientY - rect.top - oy) / scale;
  if (x < 0 || y < 0 || x > st.frame.width || y > st.frame.height) return;
  s.status = settings.edgeUrl ? 'NanoSAM on the edge box…' : 'Loading SlimSAM in this browser (first time downloads the model)…';
  ctx.render();
  try {
    const out = await segmentAt({ image: s.frozen.url, point: [x, y], edgeUrl: settings.edgeUrl });
    const g = st.overlay.getContext('2d');
    g.clearRect(0, 0, st.overlay.width, st.overlay.height);
    let maskData;
    if (typeof out.mask === 'string') {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = out.mask; });
      g.drawImage(img, 0, 0, st.overlay.width, st.overlay.height);
      maskData = g.getImageData(0, 0, st.overlay.width, st.overlay.height);
    } else {
      const tmp = el('canvas', { width: out.mask.width, height: out.mask.height });
      tmp.getContext('2d').putImageData(out.mask, 0, 0);
      g.drawImage(tmp, 0, 0, st.overlay.width, st.overlay.height);
      maskData = out.mask;
    }
    let on = 0;
    for (let i = 3; i < maskData.data.length; i += 4) if (maskData.data[i] > 0) on += 1;
    s.coverage = (on / (maskData.width * maskData.height)) * 100;
    g.fillStyle = '#ff2d3d';
    g.beginPath();
    g.arc(x, y, Math.max(6, st.overlay.width / 120), 0, Math.PI * 2);
    g.fill();
    s.status = `${out.via} · confidence ${Math.round((out.score || 0) * 100)}%`;
  } catch (error) {
    s.status = settings.edgeUrl ? `The edge box could not run NanoSAM: ${error.message}` : `The in-browser model could not load (${error.message}).`;
  }
  ctx.render();
}

/* ------------------------------------------------------------ connections */

let mqtt = null;
function setLink(key, status) {
  ctx.links[key] = status;
  const labels = { edge: 'Edge', mqtt: 'MQTT', mavlink: 'Drones' };
  fill($('links'), Object.entries(ctx.links).map(([k, v]) => el(`span.link-pill${v === 'connected' ? '.on' : v === 'error' ? '.bad' : ''}`, { title: v, text: labels[k] })));
}

function connectMqtt() {
  mqtt?.close();
  if (!settings.mqttUrl) { setLink('mqtt', 'off'); return; }
  const problem = urlProblem(settings.mqttUrl);
  if (problem) { toast(`MQTT: ${problem}`); setLink('mqtt', 'error'); return; }
  mqtt = new MqttClient({
    url: settings.mqttUrl,
    username: settings.mqttUser || undefined,
    password: settings.mqttPass || undefined,
    topics: ['frigate/events', 'ranch/events', 'msh/#', 'ranch/sensors/#'],
    onStatus: (status, detail) => { setLink('mqtt', status); if (status === 'error' && detail) toast(`MQTT: ${detail}`); },
    onMessage: (topic, payload) => {
      if (topic === 'frigate/events') onAlert(ctx.alerts.add(fromFrigate(json(payload))));
      else if (topic === 'ranch/events') onAlert(ctx.alerts.add(fromEdge(json(payload))));
      else if (topicMatches('msh/#', topic) && topic.includes('/json/')) ctx.mesh.apply(fromMeshtastic(json(payload)));
      else if (topicMatches('ranch/sensors/#', topic)) {
        const text = new TextDecoder().decode(payload);
        ctx.mesh.apply(fromSensor(topic, json(payload) ?? text));
      }
      softRender();
    },
  });
  mqtt.connect();
}

function onAlert(alert) {
  if (!alert) return;
  if (['critical', 'high'].includes(alert.routing.priority) && alert.updated === alert.created) {
    rafa.quip('alert');
    toast(`${alert.routing.priority.toUpperCase()}: ${alert.label} at ${alert.camera}`);
  }
}

/** Re-render live slides at most twice a second. */
let softTimer = 0;
function softRender() {
  if (softTimer) return;
  softTimer = setTimeout(() => {
    softTimer = 0;
    const id = SLIDES[current].id;
    if (['command', 'events', 'livestock', 'drones', 'mesh'].includes(id) && !document.activeElement?.matches('input, select, textarea')) renderSlide(current);
    if (map) updateMap();
  }, 500);
}

let mavWs = null;
ctx.connectMavlink = () => {
  mavWs?.close();
  if (!settings.mavlinkUrl) { toast('Set the mavlink2rest URL on Setup first.'); ctx.goTo('setup'); return; }
  const problem = urlProblem(settings.mavlinkUrl);
  if (problem) { toast(problem); return; }
  setLink('mavlink', 'connecting');
  mavWs = new WebSocket(settings.mavlinkUrl);
  mavWs.onopen = () => setLink('mavlink', 'connected');
  mavWs.onerror = () => setLink('mavlink', 'error');
  mavWs.onclose = () => setLink('mavlink', ctx.links.mavlink === 'error' ? 'error' : 'off');
  mavWs.onmessage = (e) => {
    try { ctx.fleet.apply(fromMavlink2Rest(JSON.parse(e.data))); softRender(); } catch { /* not JSON */ }
  };
};

ctx.connectSerial = async () => {
  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 57600 });
    setLink('mavlink', 'connected');
    toast('Reading telemetry from the radio at 57600 baud.');
    const parser = new MavlinkParser();
    const reader = port.readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const m of parser.push(value)) ctx.fleet.apply(m);
      softRender();
    }
  } catch (error) {
    if (error.name !== 'NotFoundError') toast(`Telemetry radio: ${error.message}`);
    setLink('mavlink', 'off');
  }
};

let healthTimer = 0;
async function pollHealth() {
  clearTimeout(healthTimer);
  if (!settings.edgeUrl) { ctx.health = null; setLink('edge', 'off'); return; }
  try {
    ctx.health = await edge(settings.edgeUrl, '/v1/health');
    setLink('edge', 'connected');
  } catch {
    ctx.health = null;
    setLink('edge', 'error');
  }
  healthTimer = setTimeout(pollHealth, 15000);
}

ctx.connectAll = ({ quiet = false } = {}) => {
  pollHealth();
  connectMqtt();
  if (settings.mavlinkUrl) ctx.connectMavlink();
  if (settings.orthophotoUrl && map) map.drape(settings.orthophotoUrl).catch(() => toast('The orthophoto could not be loaded.'));
  if (!quiet) toast('Connecting…');
};

/* ------------------------------------------------------------------ map */

let map = null;
let mapWrap = null;
ctx.mapView = () => {
  if (!mapWrap) {
    const canvas = el('canvas');
    const labels = el('div.map-labels');
    mapWrap = el('div.map-wrap', {}, [canvas, labels]);
    import('./map3d.js').then(({ RanchMap }) => {
      try {
        map = new RanchMap(canvas, { home: settings.home, reducedMotion: reduced });
        if (settings.orthophotoUrl) map.drape(settings.orthophotoUrl).catch(() => {});
        updateMap();
        if (SLIDES[current].id === 'map') map.start();
        const tick = () => {
          if (map.running) fill(labels, map.labels().map((l) => el('span.map-label', { 'data-kind': l.kind, style: { left: `${l.x}px`, top: `${l.y}px` }, text: l.label })));
          requestAnimationFrame(tick);
        };
        tick();
      } catch (error) {
        fill(mapWrap, [el('p.muted', { style: { padding: '20px' }, text: `3D needs WebGL, which this browser refused: ${error.message}` })]);
      }
    });
  }
  return mapWrap;
};

function updateMap() {
  if (!map) return;
  const keep = new Set();
  for (const c of cams.values()) if (Number.isFinite(c.lat)) { keep.add(`cam:${c.id}`); map.addMarker(`cam:${c.id}`, { kind: 'camera', lat: c.lat, lon: c.lon, label: c.name }); }
  for (const v of ctx.fleet.list()) if (Number.isFinite(v.lat)) { keep.add(`uav:${v.sysid}`); map.addMarker(`uav:${v.sysid}`, { kind: 'drone', lat: v.lat, lon: v.lon, label: `${v.kind} ${v.sysid}` }); }
  for (const n of ctx.mesh.list()) if (Number.isFinite(n.lat)) { keep.add(`node:${n.id}`); map.addMarker(`node:${n.id}`, { kind: 'node', lat: n.lat, lon: n.lon, label: n.name }); }
  map.prune(keep);
}

/* --------------------------------------------------------------- powered */

ctx.poweredBy = () => el('div.powered', {}, [
  el('div.badge-slot', { text: 'Official NVIDIA badge slot' }),
  el('div', {}, [
    el('b', { text: 'Edge AI built for NVIDIA® Jetson™' }),
    el('p.faint', { style: { margin: 0 }, text: 'NanoOWL and NanoSAM from NVIDIA-AI-IOT, on TensorRT. NVIDIA and Jetson are trademarks of NVIDIA Corporation; this project is not affiliated with or endorsed by NVIDIA.' }),
  ]),
]);

/* ------------------------------------------------------------ demo data */

ctx.demoAlerts = () => {
  const now = Date.now() / 1000;
  const samples = [
    { type: 'new', after: { id: 'demo-1', camera: 'North gate', label: 'cow', top_score: 0.86, start_time: now - 120, current_zones: ['north_gate'], has_snapshot: false } },
    { type: 'new', after: { id: 'demo-2', camera: 'Shop', label: 'person', top_score: 0.91, start_time: now - 30, current_zones: ['machine_shop'], has_snapshot: false } },
    { type: 'new', after: { id: 'demo-3', camera: 'Calving barn', label: 'calving', top_score: 0.71, start_time: now - 600, current_zones: ['calving_pen'], has_snapshot: false } },
    { type: 'new', after: { id: 'demo-4', camera: 'East pasture', label: 'animal', sub_label: ['coyote', 0.8], top_score: 0.77, start_time: now - 900, current_zones: ['east_pasture'], has_snapshot: false } },
    { type: 'new', after: { id: 'demo-5', camera: 'Hay yard', label: 'truck', top_score: 0.8, start_time: now - 3600, current_zones: ['hay_yard'], has_snapshot: false } },
  ];
  // Samples are routed as if it were 2 a.m., so the night rules show.
  for (const m of samples) ctx.alerts.add(fromFrigate(m), { hour: 2 });
  toast('Five sample Frigate events loaded — routed as if it were 2 a.m.');
  ctx.render();
};

ctx.demoMesh = () => {
  const h = settings.home;
  const t = Date.now() / 1000;
  const msgs = [
    { type: 'nodeinfo', sender: '!a1b2c3d4', timestamp: t, payload: { longname: 'North Gate Relay', shortname: 'NGR' } },
    { type: 'position', sender: '!a1b2c3d4', timestamp: t, snr: 6.5, payload: { latitude_i: Math.round((h.lat + 0.0021) * 1e7), longitude_i: Math.round((h.lon - 0.0012) * 1e7) } },
    { type: 'telemetry', sender: '!a1b2c3d4', timestamp: t, payload: { battery_level: 91, voltage: 4.08 } },
    { type: 'nodeinfo', sender: '!0badf00d', timestamp: t, payload: { longname: 'Stock Tank 3', shortname: 'TK3' } },
    { type: 'position', sender: '!0badf00d', timestamp: t, snr: -4.25, payload: { latitude_i: Math.round((h.lat - 0.0031) * 1e7), longitude_i: Math.round((h.lon + 0.0027) * 1e7) } },
    { type: 'telemetry', sender: '!0badf00d', timestamp: t, payload: { battery_level: 18, temperature: 31.4, relative_humidity: 22 } },
    { type: 'text', sender: '!0badf00d', timestamp: t, payload: { text: 'Float switch low — tank 3 under 20%' } },
  ];
  for (const m of msgs) ctx.mesh.apply(fromMeshtastic(m));
  updateMap();
  toast('Two sample radios loaded.');
  ctx.render();
};

/* ------------------------------------------------------------- Air Swipe */

let swipeStream = null;
let hands = null;
let swipe = null;
let motion = null;
let swipeLoopOn = false;
let sampleSink = null;

ctx.toggleSwipe = async () => {
  settings.gesture.enabled = !settings.gesture.enabled;
  saveSettings(settings);
  if (settings.gesture.enabled) await startSwipe();
  else stopSwipe();
  ctx.render();
};
ctx.restartSwipe = async () => { if (settings.gesture.enabled) { stopSwipe(); await startSwipe(); } };

async function startSwipe() {
  const g = settings.gesture;
  $('btn-swipe').setAttribute('aria-pressed', 'true');
  $('hud').hidden = false;
  $('hud-label').textContent = g.mode === 'hand' ? 'Loading hand model…' : 'Motion';
  try {
    swipeStream = await openDevice({ facing: g.camera, width: 640 });
  } catch (error) {
    toast(`Air Swipe needs the camera: ${error.message}`);
    settings.gesture.enabled = false;
    stopSwipe();
    return;
  }
  const video = $('hud-video');
  video.srcObject = swipeStream;
  await video.play().catch(() => {});
  if (g.mode === 'hand') {
    try {
      hands ??= await createHandTracker();
    } catch (error) {
      toast(`Hand model unavailable (${error.message}) — using Motion mode.`);
      g.mode = 'motion';
    }
  }
  swipe = new SwipeDetector(g.thresholds || {}, { invert: g.invert });
  motion = new MotionCentroid();
  $('hud-label').textContent = g.mode === 'hand' ? 'Hand · ready' : 'Motion · ready';
  if (!swipeLoopOn) { swipeLoopOn = true; requestAnimationFrame(swipeLoop); }
}

function stopSwipe() {
  swipeStream?.getTracks().forEach((t) => t.stop());
  swipeStream = null;
  swipeLoopOn = false;
  $('hud').hidden = true;
  $('btn-swipe').setAttribute('aria-pressed', 'false');
}

const small = el('canvas', { width: 64, height: 48 });
const smallCtx = small.getContext('2d', { willReadFrequently: true });
let lastVideoTime = -1;

/** Read one position from the camera: fingertip blended with palm, or the centre of motion. */
function readPosition(video) {
  const front = settings.gesture.camera === 'user';
  if (settings.gesture.mode === 'hand' && hands) {
    const result = hands.detectForVideo(video, performance.now());
    const lm = result?.landmarks?.[0];
    if (!lm) return { x: null };
    // Fingertip for responsiveness, palm for stability.
    const palm = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
    const raw = 0.6 * lm[8].x + 0.4 * palm;
    return { x: front ? 1 - raw : raw, points: lm };
  }
  smallCtx.drawImage(video, 0, 0, 64, 48);
  const x = motion.push(smallCtx.getImageData(0, 0, 64, 48).data, 64, 48, { mirror: front });
  return { x };
}

function swipeLoop() {
  if (!swipeLoopOn) return;
  const video = $('hud-video');
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const t = performance.now() / 1000;
    let reading = { x: null };
    try { reading = readPosition(video); } catch { /* a dropped frame */ }
    drawHud(video, reading);
    if (sampleSink) sampleSink(reading.x, t);
    else {
      const fired = swipe.push(reading.x, t);
      if (fired) {
        $('hud').classList.add('fired');
        setTimeout(() => $('hud').classList.remove('fired'), 250);
        touring = false;
        go(target + (fired === 'next' ? 1 : -1));
        rafa.quip(fired);
      }
    }
  }
  requestAnimationFrame(swipeLoop);
}

function drawHud(video, reading) {
  const c = $('hud-canvas');
  const g = c.getContext('2d');
  const front = settings.gesture.camera === 'user';
  g.save();
  if (front) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.globalAlpha = 0.55;
  g.drawImage(video, 0, 0, c.width, c.height);
  g.restore();
  if (reading.points) {
    g.fillStyle = '#39ff14';
    for (const p of reading.points) {
      const x = (front ? 1 - p.x : p.x) * c.width;
      g.fillRect(x - 1.5, p.y * c.height - 1.5, 3, 3);
    }
  }
  if (reading.x != null) $('hud-dot').style.left = `${reading.x * 100}%`;
  $('hud-dot').style.opacity = reading.x == null ? 0.25 : 1;
}

/** The calibration wizard: hold still, three swipes each way. */
ctx.calibrate = async () => {
  if (!settings.gesture.enabled) await ctx.toggleSwipe();
  if (!swipeStream) return;
  const steps = [
    { kind: 'rest', label: 'Hold your hand up, still', arrow: '✋', ms: 1600 },
    ...[1, 2, 3].flatMap((n) => [
      { kind: 'stroke', dir: -1, label: `Swipe LEFT (${n}/3)`, arrow: '⟵', ms: 1700 },
      { kind: 'stroke', dir: 1, label: `Swipe RIGHT (${n}/3)`, arrow: '⟶', ms: 1700 },
    ]),
  ];
  const title = el('div.calib-target');
  const bar = el('div.bar', {}, [el('span.pos')]);
  const progress = el('div.meter', {}, [el('i', { style: { width: '0%' } })]);
  const note = el('p.muted', { text: 'Keep your hand in the little camera window. Swipe at a natural speed.' });
  let cancelled = false;
  modal([el('h3', { text: 'Calibrate Air Swipe' }), note, title, bar, el('div', { style: { height: '10px' } }), progress, el('div', { style: { height: '12px' } }), el('button.btn.ghost', { type: 'button', onclick: () => { cancelled = true; } }, ['Cancel'])]);
  const strokes = [];
  let rest = 0;
  let directionVotes = 0;
  for (let i = 0; i < steps.length && !cancelled; i += 1) {
    const step = steps[i];
    fill(title, [el('span.arrow', { text: step.arrow }), step.label]);
    progress.firstChild.style.width = `${(i / steps.length) * 100}%`;
    const samples = [];
    sampleSink = (x, t) => { if (x != null) { samples.push({ x, t }); bar.firstChild.style.left = `${x * 100}%`; } };
    await new Promise((r) => setTimeout(r, step.ms));
    sampleSink = null;
    if (step.kind === 'rest') rest = measureRest(samples);
    else {
      const m = measureStroke(samples);
      strokes.push(m);
      if (samples.length > 2) directionVotes += Math.sign(samples[samples.length - 1].x - samples[0].x) === step.dir ? 1 : -1;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  sampleSink = null;
  if (cancelled) { closeModal(); return; }
  const result = calibrateFrom({ strokes, rest });
  settings.gesture.thresholds = result.thresholds;
  settings.gesture.quality = result.quality;
  // If the swipes mostly read backwards, the camera is mirrored the other way.
  if (directionVotes < -2) settings.gesture.invert = !settings.gesture.invert;
  saveSettings(settings);
  swipe = new SwipeDetector(result.thresholds, { invert: settings.gesture.invert });
  fill($('modal').firstChild, [
    el('h3', { text: result.quality ? `Calibrated · ${result.quality}/100` : 'Calibration needs another go' }),
    ...result.notes.map((n) => el('p.muted', { text: n })),
    directionVotes < -2 ? el('p.muted', { text: 'Your swipes read mirrored, so directions were flipped to match.' }) : null,
    el('p.faint', { text: `Needs ≥ ${(result.thresholds.minDistance * 100).toFixed(0)}% of the frame at ≥ ${result.thresholds.minSpeed.toFixed(2)} widths/s · rest under ${result.thresholds.restSpeed.toFixed(2)}.` }),
    el('button.btn.gold', { type: 'button', onclick: closeModal }, ['Done']),
  ]);
  if (result.quality) rafa.quip('calibrated');
  ctx.render();
};

/* ---------------------------------------------------------------- modal */

function modal(children) {
  fill($('modal'), [el('div.card.foil.modal-card', {}, children)]);
  $('modal').hidden = false;
}
function closeModal() {
  $('modal').hidden = true;
  fill($('modal'), []);
}

/* ------------------------------------------------------------------ boot */

async function enter(withSound) {
  $('gate').classList.add('gone');
  setVoice(withSound && settings.voice.enabled !== false);
  // Speaking inside the tap is what unlocks speech on iOS.
  rafa.say(INTROS[SLIDES[current].id]);
  lastArrival = current;
  if (settings.gesture.enabled) startSwipe();
}

async function boot() {
  try {
    rules = await (await fetch('./rules.json')).json();
  } catch {
    rules = { minScore: 0.45, night: { start: 20, end: 6 }, classes: {}, rules: [] };
  }
  ctx.rules = rules;
  ctx.alerts = new AlertQueue(rules);
  buildSlides();
  setLink('edge', 'off');

  const start = SLIDES.findIndex((s) => `#${s.id}` === location.hash);
  current = Math.max(0, start);
  activate(-1);
  requestAnimationFrame(() => jumpTo(current));

  $('track').addEventListener('scroll', onScroll, { passive: true });
  $('track').addEventListener('wheel', (e) => {
    if (e.target.closest('.map-wrap, select, textarea, .scroll-x')) return;
    const scroller = e.target.closest('.slide');
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    // Vertical wheel scrolls a long slide first, and pages only at its ends.
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
      const atTop = scroller.scrollTop <= 0 && e.deltaY < 0;
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2 && e.deltaY > 0;
      if (!atTop && !atEnd) return;
    }
    e.preventDefault();
    const now = performance.now();
    if (now < (boot.wheelLock || 0)) return;
    boot.wheelAcc = (boot.wheelAcc || 0) + e.deltaY;
    if (Math.abs(boot.wheelAcc) > 40) { go(target + Math.sign(boot.wheelAcc)); boot.wheelAcc = 0; boot.wheelLock = now + 650; }
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowRight') go(target + 1);
    if (e.key === 'ArrowLeft') go(target - 1);
  });
  addEventListener('hashchange', () => { const i = SLIDES.findIndex((s) => `#${s.id}` === location.hash); if (i >= 0 && i !== current) go(i); });
  addEventListener('resize', () => jumpTo(current));

  $('prev').addEventListener('click', () => { touring = false; go(target - 1); });
  $('next').addEventListener('click', () => { touring = false; go(target + 1); });
  $('btn-swipe').addEventListener('click', () => ctx.toggleSwipe());
  $('btn-tilt').addEventListener('click', toggleTilt);
  $('btn-voice').addEventListener('click', () => setVoice(!settings.voice.enabled));
  $('rafa-orb').addEventListener('click', () => rafa.quip('joke'));
  $('rafa-ask').addEventListener('submit', (e) => { e.preventDefault(); const q = $('rafa-input').value.trim(); if (q) { ask(q); $('rafa-input').value = ''; } });
  $('rafa-mic').addEventListener('click', () => {
    const r = recogniser(rafa.lang);
    if (!r) { toast('Speech recognition is not available in this browser — type instead.'); return; }
    $('rafa-mic').classList.add('listening');
    r.onresult = (e) => ask(e.results[0][0].transcript);
    r.onend = () => $('rafa-mic').classList.remove('listening');
    r.onerror = () => $('rafa-mic').classList.remove('listening');
    r.start();
  });
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) closeModal(); });
  $('enter').addEventListener('click', () => enter(true));
  $('enter-quiet').addEventListener('click', () => enter(false));
  setVoice(settings.voice.enabled);

  // Network cameras come back on their own; device cameras need a new tap.
  for (const c of settings.cameras || []) {
    const cam = { ...c };
    cams.set(cam.id, cam);
    startCamera(cam).then(() => { if (current === 1) ctx.render(); });
    for (const k of ['vision', 'search', 'segment']) ctx.state[k].camera ??= cam.id;
  }
  if (settings.edgeUrl || settings.mqttUrl || settings.mavlinkUrl) ctx.connectAll({ quiet: true });
  requestAnimationFrame(stageLoop);

  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();

/** For the end-to-end harness. */
globalThis.__ranch = { ctx, go, cams, get current() { return current; }, SLIDES, swipe: () => swipe, stages };
