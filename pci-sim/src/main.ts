/**
 * Bootstrap: render loop, keyboard/mouse wiring, demo hand-back, overlays.
 */
import './style.css';
import { MonitorAudio } from './audio/monitorAudio';
import { Demo } from './procedure/demo';
import { SceneRenderer, type Rect } from './scene/renderer';
import { emit, newCase, store, subscribe } from './state/store';
import { InputController } from './tools/controller';
import { pickVessel } from './tools/picking';
import { TOOLS, type ToolId } from './tools/tools';
import { DevicePanel, holdInput } from './ui/devicePanel';
import { $ } from './ui/dom';
import { Checklist, Hud, Messages, MonitorOverlay } from './ui/hud';
import { Labels } from './ui/labels';
import { MentorPanel } from './ui/mentor';
import { renderDebrief, renderHelp, renderPause, renderStart } from './ui/overlays';
import { CURSORS, Toolbar } from './ui/toolbar';
import { Vitals } from './ui/vitals';

const canvas = $('gl') as HTMLCanvasElement;
const audio = new MonitorAudio();
const demo = new Demo();
const input = new InputController();
const ui = store.ui;
if (window.innerWidth < 640) ui.mentorOpen = false;
const sim = () => store.sim;

const renderer = new SceneRenderer(canvas, sim());
const labels = new Labels();
labels.build(sim().anat);

// ------------------------------------------------------------------ actions --
function selectTool(id: ToolId): void {
  if (id === 'fluoro') return;
  sim().selectTool(id);
}

function toggleView(): void {
  sim().toggleView();
}

function openDebrief(): void {
  ui.debriefOpen = true;
  ui.debriefShown = true;
  if (demo.active) demo.stop(sim());
  renderDebrief(
    sim().debrief(),
    () => {
      ui.debriefOpen = false;
      $('debrief').classList.add('hidden');
    },
    () => newCase(),
  );
  $('debrief').classList.remove('hidden');
}

function setPaused(p: boolean): void {
  ui.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) renderPause(() => setPaused(false));
  input.clear();
}

function setHelp(open: boolean): void {
  ui.helpOpen = open;
  $('help').classList.toggle('hidden', !open);
  if (open) renderHelp(() => setHelp(false));
}

function toggleSound(): void {
  ui.sound = !ui.sound;
  audio.enabled = ui.sound;
}

function handBack(): void {
  if (!demo.active) return;
  demo.stop(sim());
  input.clear();
  sim().say('info', 'Demo stopped — you have control. Carry on from here.', 0);
}

// ------------------------------------------------------------------- panels --
const hud = new Hud({
  toggleView,
  help: () => setHelp(!ui.helpOpen),
  pause: () => setPaused(!ui.paused),
  endCase: openDebrief,
});
const checklist = new Checklist();
const messages = new Messages();
const monitorOverlay = new MonitorOverlay();
const mentor = new MentorPanel(() => (ui.mentorOpen = !ui.mentorOpen));
const vitals = new Vitals(
  () => sim().giveHeparin(),
  () => toggleSound(),
);
const toolbar = new Toolbar(sim, {
  select: (id) => {
    handBack();
    selectTool(id);
  },
  pedal: (down) => {
    handBack();
    input.pedalButton = down;
  },
});
const devicePanel = new DevicePanel({
  setSize: (k, d, l) => sim().setSize(k, d, l),
  measure: () => sim().performQCA(),
});

subscribe('new-case', () => {
  demo.stop(sim());
  renderer.load(sim());
  labels.build(sim().anat);
  checklist.reset();
  messages.reset();
  vitals.reset();
  $('debrief').classList.add('hidden');
  $('pause').classList.add('hidden');
  lastTool = '';
});

// ------------------------------------------------------------- start screen --
function begin(withDemo: boolean): void {
  audio.unlock();
  ui.started = true;
  $('start').classList.add('hidden');
  if (withDemo) {
    demo.start(sim());
    renderer.orbit.setGoal(renderer.world.overviewPoint, 950);
  } else sim().say('info', 'Welcome to the cath lab. Select the guide (1) and hold W to advance it from the wrist.', 0);
  canvas.focus();
}
renderStart(
  () => begin(false),
  () => begin(true),
);

// -------------------------------------------------------------------- input --
const CODE_TOOL: Record<string, ToolId> = {
  Digit1: 'guide',
  Digit2: 'wire',
  Digit3: 'balloon',
  Digit4: 'stent',
  Digit5: 'contrast',
  Digit7: 'measure',
  Numpad1: 'guide',
  Numpad2: 'wire',
  Numpad3: 'balloon',
  Numpad4: 'stent',
  Numpad5: 'contrast',
  Numpad7: 'measure',
};

window.addEventListener('keydown', (e) => {
  if (!ui.started) return;
  const code = e.code;
  if (code === 'Tab' || code === 'Space' || code.startsWith('Arrow')) e.preventDefault();
  if (demo.active && !e.repeat) {
    handBack();
    return;
  }
  if (code === 'Escape') {
    if (ui.helpOpen) setHelp(false);
    else if (ui.debriefOpen) {
      ui.debriefOpen = false;
      $('debrief').classList.add('hidden');
    } else setPaused(!ui.paused);
    return;
  }
  if (ui.debriefOpen) return;
  if (code === 'KeyH') {
    setHelp(!ui.helpOpen);
    return;
  }
  if (ui.paused || ui.helpOpen) return;
  input.keyDown(code);
  if (e.repeat) return;
  if (CODE_TOOL[code]) selectTool(CODE_TOOL[code]);
  else if (code === 'KeyC') sim().selectTool('contrast');
  else if (code === 'KeyG') sim().giveHeparin();
  else if (code === 'Tab') toggleView();
  else if (code === 'KeyV') sim().cyclePreset();
  else if (code === 'KeyF') {
    ui.follow = !ui.follow;
    sim().say('info', ui.follow ? 'Camera follows the device tip (F).' : 'Camera follow off.', 0);
  } else if (code === 'KeyL') ui.labels = !ui.labels;
  else if (code === 'KeyM') ui.mentorOpen = !ui.mentorOpen;
  else if (code === 'KeyN') toggleSound();
});

window.addEventListener('keyup', (e) => input.keyUp(e.code));
window.addEventListener('blur', () => input.clear());

canvas.tabIndex = 0;
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (!ui.started) return;
    if (demo.active) {
      handBack();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      renderer.orbit.zoom(Math.exp(e.deltaY * 0.0015));
      return;
    }
    if (ui.paused || ui.debriefOpen) return;
    const notches = Math.max(-3, Math.min(3, -e.deltaY / (e.deltaMode === 1 ? 3 : 100)));
    input.addWheel(notches);
  },
  { passive: false },
);

let drag: { x: number; y: number; id: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!ui.started) return;
  handBack();
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag && drag.id === e.pointerId) {
    if (sim().view === '3d') renderer.orbit.orbit(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  }
  updateHover(e.clientX, e.clientY);
});
const endDrag = () => (drag = null);
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => $('hover-readout').classList.add('hidden'));
for (const id of ['hud', 'checklist', 'right', 'device-panel']) $(id).addEventListener('pointerdown', handBack);

const hoverEl = $('hover-readout');
function updateHover(x: number, y: number): void {
  const s = sim();
  if (s.tool !== 'measure' || s.view !== '3d' || drag) {
    hoverEl.classList.add('hidden');
    return;
  }
  const h = pickVessel(renderer, x, y, (id) => s.anat.vessels[id].name.split(' (')[0]);
  if (!h) {
    hoverEl.classList.add('hidden');
    return;
  }
  hoverEl.classList.remove('hidden');
  const ds = Math.max(0, 1 - h.diameter / h.reference);
  hoverEl.textContent = `${h.vessel} ${h.s.toFixed(0)} mm · Ø ${h.diameter.toFixed(2)} mm (ref ${h.reference.toFixed(2)}, ${Math.round(ds * 100)}% DS)`;
  hoverEl.style.left = `${Math.min(window.innerWidth - hoverEl.offsetWidth - 6, x + 14)}px`;
  hoverEl.style.top = `${y + 14}px`;
}

// ------------------------------------------------------------------- layout --
function resize(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function pipRect(): Rect | null {
  const W = window.innerWidth;
  const right = $('right').getBoundingClientRect();
  const bar = $('toolbar').getBoundingClientRect();
  const panel = $('device-panel').getBoundingClientRect();
  const bottomLimit = Math.min(bar.top, W < 820 ? panel.top : bar.top) - 8;
  const avail = bottomLimit - right.bottom - 10;
  const size = Math.floor(Math.min(230, W * 0.3, avail));
  if (size < 110) return null;
  return { x: W - size - 10, y: bottomLimit - size, w: size, h: size };
}

// --------------------------------------------------------------------- loop --
let last = performance.now();
let uiTimer = 0;
let lastBeats = 0;
let lastTool = '';
let lastGuidePhase = '';

function cameraLogic(): void {
  const s = sim();
  const w = renderer.world;
  if (s.tool !== lastTool) {
    lastTool = s.tool;
    if (s.tool === 'wire' || s.tool === 'balloon' || s.tool === 'stent' || s.tool === 'measure') {
      renderer.orbit.setGoal(w.lesionPoint, s.tool === 'wire' ? 190 : 140);
    }
    lastGuidePhase = '';
  }
  if (s.tool === 'guide' && !ui.follow) {
    const phase = s.guide.s > s.anat.landmarks.aortaEntry - 20 ? 'heart' : 'arm';
    if (phase !== lastGuidePhase) {
      lastGuidePhase = phase;
      if (phase === 'heart') renderer.orbit.setGoal(w.heartPoint, 330);
      else renderer.orbit.setGoal(w.overviewPoint, 950);
    }
  }
  canvas.style.cursor = s.view === '3d' ? CURSORS[s.tool] : 'default';
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const s = sim();
  const running = ui.started && !ui.paused && !ui.helpOpen && !ui.debriefOpen;
  if (running) {
    const inp = demo.active ? demo.input(s, dt) : input.read(holdInput);
    s.step(dt, inp);
    if (s.finished && !ui.debriefShown && s.finishedAt !== null && s.t > s.finishedAt + 2.5) openDebrief();
  }
  // Sounds
  if (s.beats.length && s.beats[s.beats.length - 1].t !== lastBeats) {
    lastBeats = s.beats[s.beats.length - 1].t;
    if (running) audio.beep(s.physio.spo2);
  }
  if (running && s.physio.unstable) audio.alarm();

  cameraLogic();
  const follow = ui.follow || (demo.active && s.tool === 'guide' && s.view === '3d');
  renderer.insets.top = hud.height + 4;
  renderer.insets.bottom = $('toolbar').offsetHeight + 6;
  const layout = renderer.render(dt, { follow, pip: s.view === '3d' ? pipRect() : null });
  labels.update(s, renderer.orbit.camera, renderer.world.heartMesh, ui.labels && s.view === '3d' && ui.started, renderer.width, renderer.height);
  vitals.update(s, ui.sound, false);
  messages.update(s, now / 1000);

  uiTimer += dt;
  if (uiTimer > 0.1) {
    uiTimer = 0;
    hud.update(s);
    checklist.update(s);
    mentor.update(s, demo, ui.mentorOpen);
    toolbar.update(s, input.pedal);
    devicePanel.update(s);
    vitals.update(s, ui.sound, true);
    monitorOverlay.update(s, layout.monitor, layout.pip, renderer.fluoro.hasImage);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/automation hook (no effect on the UI).
(window as unknown as Record<string, unknown>).__pci = { store, demo, renderer, emit, TOOLS };
