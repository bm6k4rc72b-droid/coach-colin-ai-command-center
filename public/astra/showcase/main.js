/**
 * ASTRA Chamber — wiring.
 *
 * One number drives the room: `progress`, the horizontal scroll position in
 * stations (0 … N−1). The camera orbits the room's axis with it, so a
 * sideways swipe, a trackpad, a wheel, an arrow key, a hard device tilt or a
 * spoken "take me to the debate room" all travel the same circle. Device
 * orientation and finger or pointer position add a smaller look offset on
 * top — the parallax that makes the holograms read as solid.
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
import { draw } from './screens.js';
import { AGONISTS, PLATES, READINGS, SITES, STATIONS, sppsYield } from './sections.js';
import { buildCards, el } from './cards.js';
import { Ears, Voice, answer, arrivalLine, understand } from './colin.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = matchMedia('(max-width: 820px)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
const indexOf = (id) => STATIONS.findIndex((s) => s.id === id);

/* ------------------------------------------------------------ shared state */

const state = {
  speed: reduced ? 0.25 : 1,
  lookX: 0,
  lookY: 0,
  speak: 0,
  compound: READINGS[0].id,
  highlight: new THREE.Color(READINGS[0].band.accent),
  agonist: AGONISTS[2],
  agonistPinned: false,
  p: 0.995,
  length: 39,
  yield: sppsYield(0.995, 39).yield,
  site: SITES[0].id,
  receptorPhase: 0,
  mapSelected: null,
  debate: { speaker: 0 },
  myth: { level: 'idle', at: -10 },
  studyTier: null,
  studyPeptide: null,
  studyPicked: null,
};

const look = { x: 0, y: 0, source: 'pointer' };
const motion = { enabled: false, steer: false, live: false, beta0: null, gamma0: null, beta: 0, gamma: 0, held: 0, armed: true };
const clock = new THREE.Clock();

/* ------------------------------------------------------------- the plates */

const plates = {};
for (const [id, src] of Object.entries(PLATES)) {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  plates[id] = image;
}

/* ----------------------------------------------------------------- Colin */

const voice = new Voice({ onLevel: (level) => { state.speak = level; } });
const ears = new Ears();
const desk = { open: false, narrate: true, touring: false, lastArrival: -1 };

function say(text) {
  showCaption(text);
  return voice.say(text);
}

function stopTalking() {
  desk.touring = false;
  voice.stop();
}

/* ------------------------------------------------------------- the cards */

let api = {};

function buildStations() {
  const built = buildCards(state, { go, say, stop: stopTalking, now: () => clock.elapsedTime, index: indexOf });
  api = built.api;
  const track = $('track');
  const dots = $('dots');
  STATIONS.forEach((station, i) => {
    const card = el('article', { class: 'card', 'aria-labelledby': `t-${station.id}` }, [
      station.plate ? el('div', { class: 'card-plate', style: `background-image:url('${PLATES[station.plate]}')`, 'aria-hidden': 'true' }) : null,
      el('p', { class: 'kicker', text: station.kicker }),
      el('h2', { id: `t-${station.id}`, text: station.title }),
      el('p', { text: station.body }),
      ...(built.cards[station.id] ? built.cards[station.id]() : []),
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

  camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 70);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 2.2, 0);
  scene.add(camera);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.32, 0.92));
  composer.addPass(new OutputPass());

  resize();
  addEventListener('resize', resize);
  STATIONS.forEach((s, i) => drawScreen(i, 0));
  // Repaint once each photograph arrives, so no wall is left bare.
  STATIONS.forEach((s, i) => { if (s.plate) plates[s.plate].addEventListener('load', () => drawScreen(i, clock.elapsedTime)); });
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
  camera.fov = h > w ? 66 : 52;
  // Keep the hologram clear of the reading card: push the scene right on a
  // wide screen (the card is on the left) and up on a phone (it is below).
  if (w > 820) camera.setViewOffset(w, h, -Math.min(230, w * 0.13), 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.17, w, h);
  camera.updateProjectionMatrix();
}

function drawScreen(i, t) {
  const c = canvases[i];
  const station = STATIONS[i];
  draw(station.id, c.getContext('2d'), c.width, c.height, t, state, station.plate ? plates[station.plate] : null);
  room.stations[i].screenTexture.needsUpdate = true;
}

/* ------------------------------------------------------------ navigation */

const track = () => $('track');
let progress = 0;
let current = 0;
let yaw = 0;
// Where a programmatic scroll is heading, so quick repeated presses add up.
let target = 0;
let steering = 0;
let settleTimer = 0;

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
  // Announce a station once the scroll has settled on it.
  clearTimeout(settleTimer);
  settleTimer = setTimeout(arrived, 450);
}

function arrived() {
  if (Math.abs(progress - current) > 0.05) return;
  if (desk.lastArrival === current) return;
  desk.lastArrival = current;
  if (desk.narrate && !desk.touring && voice.enabled && $('gate').classList.contains('gone')) say(arrivalLine(current));
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
  const scroller = event.target.closest('.card, .desk-log, .study-list, pre, textarea');
  if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
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
      const answerGiven = await Orientation.requestPermission();
      if (answerGiven !== 'granted') return false;
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
  $('btn-motion').setAttribute('aria-pressed', String(motion.enabled));
  $('btn-motion').textContent = motion.enabled ? 'Motion on' : 'Motion';
}

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

/* ------------------------------------------------------------------ desk */

let captionTimer = 0;
function showCaption(text) {
  const caption = $('caption');
  caption.textContent = text;
  caption.classList.add('on');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => caption.classList.remove('on'), Math.min(14000, 2500 + text.length * 55));
}

function log(who, text, extra) {
  const entry = el('div', { class: `msg ${who}` }, [el('p', { text }), extra || null]);
  $('desk-log').append(entry);
  $('desk-log').scrollTop = $('desk-log').scrollHeight;
}

/** A guided tour: Colin introduces each station, then walks on. */
async function tour() {
  desk.touring = true;
  log('colin', 'Right, follow me. Do keep up; I glide, you swipe.');
  await say('Right, follow me. Do keep up. I glide, you swipe.');
  for (let i = 0; i < STATIONS.length && desk.touring; i += 1) {
    go(i);
    desk.lastArrival = i;
    await new Promise((r) => setTimeout(r, reduced ? 200 : 1400));
    if (!desk.touring) break;
    const line = arrivalLine(i);
    const started = performance.now();
    await say(line);
    // If speech was off or failed instantly, give people time to read instead.
    const reading = 1500 + line.length * 45;
    const spent = performance.now() - started;
    if (spent < reading * 0.5) await new Promise((r) => setTimeout(r, reading - spent));
  }
  if (desk.touring) await say('And that’s the chamber. I’ll be at reception. Obviously. I can’t leave.');
  desk.touring = false;
}

/** Handle anything said or typed to Colin. */
async function handle(text) {
  const said = String(text || '').trim();
  if (!said) return;
  log('you', said);
  const intent = understand(said);
  const reply = async (line, extra) => { log('colin', line, extra); await say(line); };
  switch (intent.kind) {
    case 'tour': return tour();
    case 'stop': stopTalking(); return log('colin', 'Of course. I’ll be quiet. Ish.');
    case 'step': go(target + intent.by); return reply(intent.by > 0 ? 'Onward.' : 'Back we go.');
    case 'reply': return reply(intent.reply);
    case 'go': {
      const i = indexOf(intent.station);
      go(i);
      desk.lastArrival = i;
      if (intent.station === 'map' && intent.subjects?.[0]) api.map?.(intent.subjects[0].id);
      return reply(arrivalLine(i));
    }
    case 'compare': {
      const [a, b] = intent.subjects;
      api.compare?.(a.id, b.id);
      const v = state.compareResult?.verdict;
      return reply(`To the balance. ${v ? v.headline : ''}. Mind you, that’s evidence, not effect.`);
    }
    case 'debate': api.debate?.(intent.subjects[0].id); return reply(`Convening the panel on ${intent.subjects[0].name}. Press “Colin reads the debate” and I’ll do the voices. Well, the voice.`);
    case 'studio': api.studio?.(intent.subjects[0].id); return reply(`One content pack on ${intent.subjects[0].name}, coming up. Honest claims only, I’m afraid.`);
    case 'myth': {
      const result = api.myth?.(intent.claim);
      if (!result || !result.ok) return reply('I need a proper sentence to check, I’m afraid. Three words won’t do.');
      const lead = { contradicted: 'Shattered.', unsupported: 'No evidence for that one.', overstated: 'Overstated, I’m afraid.', mixed: 'A mixed bag.', supported: 'That one holds up, actually.' }[result.verdict.level] || 'Checked.';
      return reply(`${lead} ${result.verdict.headline}`);
    }
    default: {
      const a = answer(said);
      const sources = a.sources.length ? el('p', { class: 'sources', text: `Sources: ${a.sources.slice(0, 3).map((s) => s.title || s.name || s.id).join(' · ')}` }) : null;
      log('colin', a.full, sources);
      return say(a.spoken);
    }
  }
}

function openDesk(open = !desk.open) {
  desk.open = open;
  $('desk').classList.toggle('open', open);
  $('btn-colin').setAttribute('aria-expanded', String(open));
  if (open && !$('desk-log').childElementCount) {
    log('colin', 'Good evening. I’m Colin, the receptionist. Ask me about a compound, ask me to check a claim, say “compare BPC-157 and semaglutide”, or “give me the tour”. I don’t do doses, I’m afraid. Or tea.');
  }
  if (open) setTimeout(() => $('desk-input').focus({ preventScroll: true }), 50);
}

function setupDesk() {
  $('btn-colin').addEventListener('click', () => openDesk());
  $('desk-close').addEventListener('click', () => openDesk(false));
  $('desk-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = $('desk-input').value;
    $('desk-input').value = '';
    handle(value);
  });
  for (const chip of document.querySelectorAll('.desk-quick button')) chip.addEventListener('click', () => handle(chip.dataset.say));
  const mic = $('desk-mic');
  if (!ears.supported) mic.hidden = true;
  mic.addEventListener('click', async () => {
    stopTalking();
    mic.classList.add('live');
    mic.setAttribute('aria-pressed', 'true');
    const heard = await ears.listen();
    mic.classList.remove('live');
    mic.setAttribute('aria-pressed', 'false');
    if (heard) handle(heard);
    else log('colin', 'Sorry, didn’t catch that. The acoustics in here are dreadful.');
  });
  const voiceBtn = $('desk-voice');
  const syncVoice = () => {
    voiceBtn.setAttribute('aria-pressed', String(voice.enabled));
    voiceBtn.textContent = voice.enabled ? '🔊 Voice on' : '🔈 Voice off';
  };
  voiceBtn.addEventListener('click', () => { voice.enabled = !voice.enabled; if (!voice.enabled) voice.stop(); syncVoice(); });
  if (!voice.synth) { voice.enabled = false; voiceBtn.disabled = true; }
  syncVoice();
  const narrate = $('desk-narrate');
  narrate.addEventListener('click', () => { desk.narrate = !desk.narrate; narrate.setAttribute('aria-pressed', String(desk.narrate)); });
  const select = $('desk-voices');
  const fillVoices = () => {
    select.replaceChildren(...voice.voices.slice(0, 12).map((v, i) => el('option', { value: String(i), text: `${v.name} (${v.lang})` })));
    select.value = String(Math.max(0, voice.voices.indexOf(voice.voice)));
    select.disabled = !voice.voices.length;
  };
  fillVoices();
  window.speechSynthesis?.addEventListener?.('voiceschanged', fillVoices);
  select.addEventListener('change', () => { voice.voice = voice.voices[Number(select.value)] || voice.voice; say('How’s this? Terribly distinguished, I think.'); });
}

/* ------------------------------------------------------------------ loop */

let frame = 0;
let agonistTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  frame += 1;
  steer(dt);
  voice.tick(dt);
  $('btn-colin').style.setProperty('--speak', state.speak.toFixed(2));

  const ease = 1 - Math.exp(-dt * 4.5);
  state.lookX += (look.x - state.lookX) * ease;
  state.lookY += (look.y - state.lookY) * ease;
  const idleDrift = reduced || look.source === 'tilt' ? 0 : Math.sin(t * 0.21) * 0.05;

  agonistTimer += dt;
  if (!state.agonistPinned && agonistTimer > 3.2) {
    agonistTimer = 0;
    state.agonist = AGONISTS[(AGONISTS.indexOf(state.agonist) + 1) % AGONISTS.length];
    api.agonistsSync?.(state.agonist);
  }

  if (ready) {
    yaw += (progress * STEP - yaw) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    const lx = state.lookX + idleDrift;
    // The camera walks a small inner circle towards the station it faces, so
    // the station fills the view, and slides along its right vector for
    // parallax.
    const orbit = 2.6;
    camera.rotation.y = -(yaw + lx * 0.13);
    camera.rotation.x = -0.02 - state.lookY * 0.08;
    camera.position.set(
      Math.sin(yaw) * orbit + Math.cos(yaw) * lx * 0.45,
      2.2 - state.lookY * 0.18,
      -Math.cos(yaw) * orbit + Math.sin(yaw) * lx * 0.45,
    );
    room.update(t, state);
    state.receptorPhase = room.stations[indexOf('receptor')].holo.phase || 0;
    if (frame % 2 === 0) {
      for (let i = 0; i < STATIONS.length; i += 1) if (Math.abs(i - progress) < 1.6) drawScreen(i, t);
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
  buildStations();
  setupDesk();
  const ok = initStage();
  const t = track();
  t.addEventListener('scroll', onScroll, { passive: true });
  t.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('resize', () => go(current));
  addEventListener('pointermove', (e) => onPointer(e.clientX, e.clientY), { passive: true });
  addEventListener('touchmove', (e) => { const touch = e.touches[0]; if (touch) onPointer(touch.clientX, touch.clientY); }, { passive: true });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'ArrowRight') go(target + 1);
    if (e.key === 'ArrowLeft') go(target - 1);
  });
  t.addEventListener('click', (e) => {
    if (e.target.closest('.card, button, a, input, select, textarea')) return;
    if (!room) return;
    room.stations[current].pulse = 1;
    if (current === 0) openDesk(true);
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
    desk.lastArrival = current;
    // This tap is the gesture iOS needs before it hands over motion or speech.
    say(arrivalLine(current));
    if (phone) { await enableMotion(); setMotionButton(); }
    t.focus({ preventScroll: true });
  });

  const start = STATIONS.findIndex((s) => `#${s.id}` === location.hash);
  if (start > 0) {
    $('gate').classList.add('gone');
    target = start;
    desk.lastArrival = start;
    requestAnimationFrame(() => { t.scrollLeft = start * t.clientWidth; onScroll(); });
  }
  markActive();
  if (ok) requestAnimationFrame(tick);

  window.__chamber = { go, state, handle, api: () => api, voice, get current() { return current; }, get progress() { return progress; }, get room() { return room; }, get camera() { return camera; }, renderer, motion, look };
}

boot();
