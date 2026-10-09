/**
 * ASTRA Chamber — wiring.
 *
 * One number drives the room: `progress`, the horizontal scroll position in
 * stations (0 … 6). The camera's yaw follows it, so a sideways swipe, a
 * trackpad, a wheel, an arrow key or a hard device tilt all travel round the
 * same circle. Device orientation and finger or pointer position add a
 * smaller look offset on top, which is the parallax that makes the holograms
 * read as solid.
 *
 * @module astra/showcase/main
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STEP, buildRoom } from './room.js';
import { DRAWERS } from './screens.js';
import { AGONISTS, CHAINS, READINGS, SITES, STATIONS, requiredEfficiency, sppsYield } from './sections.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 820px)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);

/* ------------------------------------------------------------ shared state */

const state = {
  speed: reduced ? 0.25 : 1,
  lookX: 0,
  lookY: 0,
  compound: READINGS[0].id,
  highlight: new THREE.Color(READINGS[0].band.accent),
  agonist: AGONISTS[2],
  agonistPinned: false,
  p: 0.995,
  length: 39,
  yield: sppsYield(0.995, 39).yield,
  site: SITES[0].id,
  receptorPhase: 0,
};

const look = { x: 0, y: 0, source: 'pointer' };
const motion = { enabled: false, steer: false, beta0: null, gamma0: null, beta: 0, gamma: 0, held: 0, armed: true };

/* -------------------------------------------------------------- the cards */

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

/** Chip row whose selection is mirrored into state. */
function chipRow(items, current, onPick) {
  const row = el('div', { class: 'chips', role: 'group' });
  const buttons = items.map((item) => el('button', {
    class: `chip${item.id === current ? ' on' : ''}`, type: 'button', 'aria-pressed': String(item.id === current), text: item.name || item.label,
    onclick: () => {
      for (const b of buttons) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
      button(item).classList.add('on');
      button(item).setAttribute('aria-pressed', 'true');
      onPick(item);
    },
  }));
  const button = (item) => buttons[items.indexOf(item)];
  row.append(...buttons);
  row.select = (id) => {
    const item = items.find((i) => i.id === id);
    buttons.forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    if (item) { button(item).classList.add('on'); button(item).setAttribute('aria-pressed', 'true'); }
  };
  return row;
}

const extras = {
  analysis() {
    const readout = el('div', { class: 'readout' });
    const show = (r) => {
      readout.innerHTML = '';
      readout.append(el('b', { text: `${r.name} · ${Math.round(r.score * 100)}%` }), document.createTextNode(` ${r.band.label}. ${r.klass}.`));
    };
    show(READINGS[0]);
    return [chipRow(READINGS, state.compound, (r) => { state.compound = r.id; state.highlight.set(r.band.accent); show(r); }), readout];
  },
  agonists() {
    const readout = el('div', { class: 'readout' });
    const show = (a) => {
      readout.innerHTML = '';
      readout.append(
        el('b', { text: `${a.name} → ${a.targets.join(' + ')}` }),
        el('br'),
        document.createTextNode(`${a.trial}, ${a.dose}, ${a.weeks} weeks: −${a.drug}% vs −${a.placebo}% placebo, so Δ = ${a.drug} − ${a.placebo} = ${a.delta} points. Half-life ${a.halfLife}; ${a.residues} residues. ${a.status}.`),
      );
    };
    show(state.agonist);
    const row = chipRow(AGONISTS, state.agonist.id, (a) => { state.agonist = a; state.agonistPinned = true; show(a); });
    extras.agonistsSync = (a) => { row.select(a.id); show(a); };
    return [row, readout];
  },
  synthesis() {
    const readout = el('div', { class: 'readout' });
    const pLabel = el('b');
    const lLabel = el('b');
    const pInput = el('input', { type: 'range', min: '0.970', max: '0.999', step: '0.001', value: String(state.p), 'aria-label': 'Per-step efficiency p' });
    const lInput = el('input', { type: 'range', min: '2', max: '60', step: '1', value: String(state.length), 'aria-label': 'Chain length L' });
    const update = () => {
      state.p = Number(pInput.value);
      state.length = Number(lInput.value);
      const { yield: Y, reactions, failed } = sppsYield(state.p, state.length);
      state.yield = Y;
      pLabel.textContent = `${(state.p * 100).toFixed(1)}%`;
      lLabel.textContent = String(state.length);
      const need = requiredEfficiency(0.87, state.length);
      readout.innerHTML = '';
      readout.append(
        el('span', { class: 'mono', text: `Y = ${state.p.toFixed(3)}^(2·(${state.length}−1)) = ${state.p.toFixed(3)}^${reactions}` }),
        el('br'),
        el('b', { text: `${(Y * 100).toFixed(1)}% full length` }),
        document.createTextNode(` · ${(failed * 100).toFixed(1)}% truncated or missing a residue. Reaching 87% at this length needs p ≥ ${(need * 100).toFixed(2)}% per step.`),
      );
    };
    pInput.addEventListener('input', update);
    lInput.addEventListener('input', () => { update(); presets.select(null); });
    const presets = chipRow(CHAINS, 'reta', (c) => { lInput.value = String(c.length); update(); });
    update();
    return [
      presets,
      el('label', { class: 'slider' }, [el('span', {}, ['Per-step efficiency p = ', pLabel]), pInput]),
      el('label', { class: 'slider' }, [el('span', {}, ['Chain length L = ', lLabel, ' residues']), lInput]),
      readout,
    ];
  },
  telemetry() {
    const readout = el('div', { class: 'readout' });
    const show = (site) => { readout.innerHTML = ''; readout.append(el('b', { text: site.label }), el('br'), document.createTextNode(site.text)); };
    show(SITES[0]);
    return [chipRow(SITES, state.site, (site) => { state.site = site.id; show(site); }), readout];
  },
};

function buildCards() {
  const track = $('track');
  const dots = $('dots');
  STATIONS.forEach((station, i) => {
    const card = el('article', { class: 'card', 'aria-labelledby': `t-${station.id}` }, [
      el('p', { class: 'kicker', text: station.kicker }),
      el('h2', { id: `t-${station.id}`, text: station.title }),
      el('p', { text: station.body }),
      ...(extras[station.id] ? extras[station.id]() : []),
      station.facts.length ? el('ul', { class: 'facts' }, station.facts.map((f) => el('li', { text: f }))) : null,
      station.cite ? el('p', { class: 'cite', text: station.cite }) : null,
    ]);
    track.append(el('section', { class: 'sec', id: station.id, 'data-index': String(i), 'aria-label': station.title }, [card]));
    dots.append(el('button', { class: 'dot', type: 'button', 'aria-label': station.title, title: station.title, onclick: () => go(i) }));
  });
}

/* ------------------------------------------------------------- the stage */

let renderer;
let composer;
let camera;
let room;
const canvases = [];
let ready = false;

function initStage() {
  const canvas = $('stage');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, powerPreference: 'high-performance' });
  } catch (error) {
    document.body.classList.add('no-webgl');
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const size = phone ? [768, 432] : [1024, 576];
  for (let i = 0; i < STATIONS.length; i += 1) {
    const c = document.createElement('canvas');
    [c.width, c.height] = size;
    canvases.push(c);
  }
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4;
  room = buildRoom(scene, {
    envMap, ids: STATIONS.map((s) => s.id), canvases,
    reflectorSize: lowEnd ? 0 : phone ? 512 : 1024,
  });

  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 60);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 2.2, 0);
  scene.add(camera);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.32, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  resize();
  addEventListener('resize', resize);
  // Draw every screen once so the far side of the room is never blank.
  STATIONS.forEach((s, i) => drawScreen(i, 0));
  ready = true;
  return true;
}

function resize() {
  if (!renderer) return;
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  const portrait = h > w;
  camera.fov = portrait ? 66 : 52;
  // Keep the hologram clear of the reading card: push the scene right on a
  // wide screen (the card is on the left) and up on a phone (it is below).
  if (w > 820) camera.setViewOffset(w, h, -Math.min(230, w * 0.13), 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.17, w, h);
  camera.updateProjectionMatrix();
}

function drawScreen(i, t) {
  const c = canvases[i];
  DRAWERS[STATIONS[i].id](c.getContext('2d'), c.width, c.height, t, state);
  room.stations[i].screenTexture.needsUpdate = true;
}

/* ------------------------------------------------------------ navigation */

const track = () => $('track');
let progress = 0;
let current = 0;
let yaw = 0;
// Where a programmatic scroll is heading, so quick repeated presses add up
// instead of all aiming at the station the scroll has not left yet.
let target = 0;
let steering = 0;

function go(index) {
  const i = clamp(index, 0, STATIONS.length - 1);
  target = i;
  steering = performance.now() + 1200;
  track().scrollTo({ left: i * track().clientWidth, behavior: reduced ? 'auto' : 'smooth' });
}

function onScroll() {
  const t = track();
  progress = t.scrollLeft / Math.max(1, t.clientWidth);
  const nearest = clamp(Math.round(progress), 0, STATIONS.length - 1);
  if (performance.now() > steering) target = nearest;
  if (nearest !== current) {
    current = nearest;
    markActive();
  }
}

function markActive() {
  document.querySelectorAll('.sec').forEach((sec, i) => sec.classList.toggle('active', i === current));
  document.querySelectorAll('.dot').forEach((dot, i) => { dot.classList.toggle('on', i === current); dot.setAttribute('aria-current', i === current ? 'step' : 'false'); });
  $('prev').disabled = current === 0;
  $('next').disabled = current === STATIONS.length - 1;
  const id = STATIONS[current].id;
  if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}

/** Vertical wheels and trackpads step one station per gesture. */
let wheelLock = 0;
let wheelAccum = 0;
function onWheel(event) {
  if (event.target.closest('.card') && event.target.closest('.card').scrollHeight > event.target.closest('.card').clientHeight) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return; // native horizontal scroll
  event.preventDefault();
  const now = performance.now();
  if (now < wheelLock) return;
  wheelAccum += event.deltaY;
  if (Math.abs(wheelAccum) > 40) {
    go(target + Math.sign(wheelAccum));
    wheelAccum = 0;
    wheelLock = now + 650;
  }
}

/* ---------------------------------------------------------------- motion */

function onPointer(x, y) {
  if (motion.enabled && motion.live) return;
  look.x = clamp((x / innerWidth - 0.5) * 2, -1, 1);
  look.y = clamp((y / innerHeight - 0.5) * 2, -1, 1);
  look.source = 'pointer';
}

function onOrientation(event) {
  if (event.beta == null || event.gamma == null) return;
  motion.live = true;
  // Map device axes onto screen axes for the current orientation.
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let x = event.gamma;
  let y = event.beta;
  if (angle === 90) { x = event.beta; y = -event.gamma; }
  else if (angle === -90 || angle === 270) { x = -event.beta; y = event.gamma; }
  if (motion.beta0 === null) { motion.gamma0 = x; motion.beta0 = y; }
  motion.gamma = x - motion.gamma0;
  motion.beta = y - motion.beta0;
  look.x = clamp(motion.gamma / 22, -1, 1);
  look.y = clamp(motion.beta / 22, -1, 1);
  look.source = 'tilt';
}

async function enableMotion() {
  const Orientation = window.DeviceOrientationEvent;
  if (!Orientation) return false;
  try {
    if (typeof Orientation.requestPermission === 'function') {
      const answer = await Orientation.requestPermission();
      if (answer !== 'granted') return false;
    }
  } catch (error) {
    return false;
  }
  motion.enabled = true;
  motion.beta0 = null;
  addEventListener('deviceorientation', onOrientation);
  return true;
}

function disableMotion() {
  motion.enabled = false;
  motion.live = false;
  removeEventListener('deviceorientation', onOrientation);
}

function setMotionButton() {
  const button = $('btn-motion');
  button.setAttribute('aria-pressed', String(motion.enabled));
  button.textContent = motion.enabled ? 'Motion on' : 'Motion';
}

/** Tilt steering: hold a hard tilt for 0.7 s to travel one station. */
function steer(dt) {
  if (!motion.steer) return;
  const x = look.x;
  if (Math.abs(x) < 0.4) { motion.armed = true; motion.held = 0; return; }
  if (!motion.armed || Math.abs(x) < 0.85) { motion.held = 0; return; }
  motion.held += dt;
  if (motion.held > 0.7) {
    go(target + Math.sign(x));
    motion.armed = false;
    motion.held = 0;
  }
}

/* ------------------------------------------------------------------ loop */

const clock = new THREE.Clock();
let frame = 0;
let agonistTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  frame += 1;
  steer(dt);

  // Ease the look toward its target: the room should float, never jitter.
  const ease = 1 - Math.exp(-dt * 4.5);
  state.lookX += (look.x - state.lookX) * ease;
  state.lookY += (look.y - state.lookY) * ease;
  const idleDrift = reduced || look.source === 'tilt' ? 0 : Math.sin(t * 0.21) * 0.05;

  // Agonist station cycles through the three until someone picks one.
  agonistTimer += dt;
  if (!state.agonistPinned && agonistTimer > 3.2) {
    agonistTimer = 0;
    state.agonist = AGONISTS[(AGONISTS.indexOf(state.agonist) + 1) % AGONISTS.length];
    extras.agonistsSync?.(state.agonist);
  }

  if (ready) {
    // Time-based easing, so the turn lands on the station at any frame rate.
    yaw += (progress * STEP - yaw) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    const lx = state.lookX + idleDrift;
    camera.rotation.y = -(yaw + lx * 0.13);
    camera.rotation.x = -0.02 - state.lookY * 0.08;
    // A small sideways dolly along the camera's right vector gives parallax.
    camera.position.set(Math.cos(yaw) * lx * 0.45, 2.2 - state.lookY * 0.18, Math.sin(yaw) * lx * 0.45);

    room.update(t, state);
    state.receptorPhase = room.stations[2].holo.phase || 0;
    // Redraw screens near the camera at ~30 fps; the rest stay as drawn.
    if (frame % 2 === 0) {
      for (let i = 0; i < STATIONS.length; i += 1) if (Math.abs(i - progress) < 1.4) drawScreen(i, t);
    }
    composer.render();
  }

  if (frame % 6 === 0) {
    $('tilt-read').textContent = motion.enabled && motion.live
      ? `β ${motion.beta.toFixed(0)}° · γ ${motion.gamma.toFixed(0)}°`
      : `finger ${look.x.toFixed(2)}, ${look.y.toFixed(2)}`;
  }
}

/* ------------------------------------------------------------------ boot */

function boot() {
  buildCards();
  const ok = initStage();
  const t = track();
  t.addEventListener('scroll', onScroll, { passive: true });
  t.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('resize', () => go(current));
  addEventListener('pointermove', (e) => onPointer(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => { const touch = e.touches[0]; if (touch) onPointer(touch.clientX, touch.clientY); }, { passive: true });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    if (e.key === 'ArrowRight') go(target + 1);
    if (e.key === 'ArrowLeft') go(target - 1);
  });
  // Tap the room (not the card) to pulse the station's hologram.
  t.addEventListener('click', (e) => {
    if (e.target.closest('.card, button, a, input')) return;
    if (room) room.stations[current].pulse = 1;
  });
  $('prev').addEventListener('click', () => go(target - 1));
  $('next').addEventListener('click', () => go(target + 1));
  $('btn-motion').addEventListener('click', async () => {
    if (motion.enabled) disableMotion();
    else await enableMotion();
    setMotionButton();
  });
  $('btn-steer').addEventListener('click', async () => {
    motion.steer = !motion.steer;
    if (motion.steer && !motion.enabled) { await enableMotion(); setMotionButton(); }
    $('btn-steer').setAttribute('aria-pressed', String(motion.steer));
  });
  $('enter').addEventListener('click', async () => {
    $('gate').classList.add('gone');
    // The tap is the user gesture iOS needs before it will hand over motion.
    if (phone) { await enableMotion(); setMotionButton(); }
    t.focus({ preventScroll: true });
  });

  const start = STATIONS.findIndex((s) => `#${s.id}` === location.hash);
  if (start > 0) {
    $('gate').classList.add('gone');
    target = start;
    requestAnimationFrame(() => { t.scrollLeft = start * t.clientWidth; onScroll(); });
  }
  markActive();
  if (ok) requestAnimationFrame(tick);

  window.__chamber = { go, state, get current() { return current; }, get progress() { return progress; }, renderer, motion, look };
}

boot();
