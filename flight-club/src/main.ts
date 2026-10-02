/** App shell: setup panel, 3D flight view + HUD, PID tuning lab, debrief, guided tour. */
import './style.css';
import { ENERGY, PILOT, SUIT, type EnergyId } from './config/suit';
import { DEFAULT_GAINS, NEUTRAL, type Assist, type Gains, type Stick } from './core/control';
import { COURSES, stepResponse, type CourseId, type StepResponse } from './core/courses';
import { hoverEndurance, MAX_THRUST, WEIGHT } from './core/flight';
import { clamp, euler } from './core/math';
import { Session } from './core/session';
import { AGGRESSIVE, TOUR, TourRunner, TUNED, type TourActions } from './core/tour';
import { World } from './scene/world';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const deg = (r: number) => (r * 180) / Math.PI;

const ss = new Session('hover', 'reactor');
const world = new World($('#view') as HTMLCanvasElement);
let gains: Gains = { ...DEFAULT_GAINS };
let lab: StepResponse = stepResponse(gains);
let shownResult: unknown = null;

// ------------------------------------------------------------ left panel --
const ASSISTS: [Assist, string, string][] = [
  ['manual', '1 · Manual', 'Stick = raw torque. Nothing holds you level — every wobble is yours to catch.'],
  ['stability', '2 · Stability', 'Stick = lean angle (max 30°). An attitude PID holds that angle; you manage throttle.'],
  ['computer', '3 · Flight computer', 'Stick = speed (max 14 m/s), Space/Shift = climb rate. Altitude holds itself.'],
];

function renderLeft(): void {
  $('#left').innerHTML = `
    <h3>Course</h3><div class="chips" id="courses">${Object.values(COURSES)
      .map((c) => `<button data-course="${c.id}">${esc(c.name)}</button>`)
      .join('')}</div><p class="hint" id="brief"></p>
    <h3 style="margin-top:12px">Energy source</h3><div class="chips" id="sources">${(Object.keys(ENERGY) as EnergyId[])
      .map((id) => `<button data-src="${id}">${esc(ENERGY[id].name)}</button>`)
      .join('')}</div><p class="hint" id="src-info"></p>
    <div id="assist" style="margin-top:12px"><h3>Assist level</h3><div class="chips">${ASSISTS.map(([id, n]) => `<button data-assist="${id}">${n}</button>`).join('')}</div>
    <p class="hint" id="assist-info"></p></div>
    <div style="margin-top:12px"><button id="ap-btn" class="primary">▶ Autopilot demo</button></div>
    <div id="controls" class="keys" style="margin-top:12px"><h3>Controls</h3>
      <kbd>W</kbd>/<kbd>S</kbd> pitch (fly forward/back) · <kbd>A</kbd>/<kbd>D</kbd> roll (slide left/right) ·
      <kbd>Q</kbd>/<kbd>E</kbd> yaw (turn) · <kbd>Space</kbd>/<kbd>Shift</kbd> up/down · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> assist ·
      <kbd>R</kbd> restart. On touch screens use the two thumb sticks.</div>`;
  $('#left').querySelectorAll<HTMLButtonElement>('[data-course]').forEach((b) => b.addEventListener('click', () => manual(() => setCourse(b.dataset.course as CourseId))));
  $('#left').querySelectorAll<HTMLButtonElement>('[data-src]').forEach((b) => b.addEventListener('click', () => manual(() => setSource(b.dataset.src as EnergyId))));
  $('#left').querySelectorAll<HTMLButtonElement>('[data-assist]').forEach((b) => b.addEventListener('click', () => manual(() => setAssist(b.dataset.assist as Assist))));
  $('#ap-btn').addEventListener('click', () => manual(() => setAutopilot(!ss.autopilot)));
}

function syncLeft(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-course]').forEach((b) => b.classList.toggle('on', b.dataset.course === ss.courseId));
  document.querySelectorAll<HTMLButtonElement>('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === ss.source));
  document.querySelectorAll<HTMLButtonElement>('[data-assist]').forEach((b) => b.classList.toggle('on', b.dataset.assist === ss.ctl.assist));
  $('#brief').textContent = ss.course.brief;
  const e = ENERGY[ss.source];
  $('#src-info').textContent = `${e.maturity}. ${e.info}`;
  $('#assist-info').textContent = ASSISTS.find((a) => a[0] === ss.ctl.assist)![2];
  $('#ap-btn').textContent = ss.autopilot ? '■ Stop autopilot' : '▶ Autopilot demo';
}

// ----------------------------------------------------------- right panel --
function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '∞';
  return s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`;
}

function renderRight(): void {
  const r = ss.p.result;
  shownResult = r;
  const rows = (Object.keys(ENERGY) as EnergyId[])
    .map((id) => `<b>${esc(ENERGY[id].name)}</b><span class="${id === ss.source ? 'pass' : ''}">${fmtTime(hoverEndurance(id))}</span>`)
    .join('');
  const debrief = r
    ? `<div class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
      <p><strong class="${r.success ? 'pass' : 'fail'}">${r.success ? 'Course complete' : 'Crashed'}</strong> in ${r.time.toFixed(1)} s ·
      touchdown ${r.touchdown.toFixed(1)} m/s · peak ${r.maxG.toFixed(1)} g${ss.course.rings.length ? ` · rings ${r.ringsPassed}/${ss.course.rings.length}` : ''}</p>
      <ul class="lessons">${r.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <button id="again-btn" class="primary">Fly again</button>`
    : `<p class="hint">Finish the course to get a debrief: stars for completing it, landing softly (&lt; ${SUIT.softLanding} m/s) and staying under 3 g.</p>`;
  $('#right').innerHTML = `
    <div id="debrief"><h3>Debrief</h3>${debrief}</div>
    <div id="energy" style="margin-top:14px"><h3>Hover endurance</h3>
      <div class="kv">${rows}</div>
      <p class="hint">Hover needs ${Math.round(WEIGHT)} N of thrust (max ${Math.round(MAX_THRUST)} N, so thrust-to-weight ${(MAX_THRUST / WEIGHT).toFixed(1)}).
      Turbines burn fuel in proportion to thrust; electric fans need power ∝ thrust<sup>1.5</sup> ÷ √(fan area).</p></div>
    <div style="margin-top:14px"><h3>The software stack</h3><ul class="lessons">
      <li><b>Sensor fusion</b> — real suits fuse gyros, accelerometers, GPS and barometers (a Kalman filter) to know their attitude. Here the sim gives the controller perfect state.</li>
      <li><b>Control loops</b> — PID controllers run at 120 Hz: guidance → speed → lean angle → torque.</li>
      <li><b>Mixer</b> — turns one force + torque command into four jet settings and nozzle angles, respecting each jet's limits.</li>
      <li><b>Safety logic</b> — G-load monitoring: above ~${PILOT.greyout} g sustained the pilot greys out, then blacks out (G-LOC).</li>
    </ul></div>`;
  $('#again-btn')?.addEventListener('click', () => manual(restart));
}

// --------------------------------------------------------------- PID lab --
const LAB_PRESETS: [string, Gains][] = [
  ['Tuned', TUNED],
  ['Too aggressive', AGGRESSIVE],
  ['Sluggish', { altKp: 0.3, altKi: 0, altKd: 1 }],
  ['Integral wind-up', { altKp: 1, altKi: 1.5, altKd: 0.5 }],
];
const LAB_SLIDERS: [keyof Gains, string, number, number, number][] = [
  ['altKp', 'Kp (push)', 0, 5, 0.05],
  ['altKi', 'Ki (offset)', 0, 2, 0.05],
  ['altKd', 'Kd (brake)', 0, 4, 0.05],
];

function renderLab(): void {
  $('#lab').innerHTML = `<h3>PID tuning lab · altitude hold, 0 → 10 m</h3>
    <div class="lab-grid"><div><canvas id="lab-plot" width="900" height="300"></canvas></div>
    <div>${LAB_SLIDERS.map(([k, n, mn, mx, st]) => `<label class="slider">${n}<input type="range" data-g="${k}" min="${mn}" max="${mx}" step="${st}"/><span></span></label>`).join('')}
    <div class="chips" style="margin-top:6px">${LAB_PRESETS.map(([n], i) => `<button data-preset="${i}">${n}</button>`).join('')}</div>
    <p class="hint">These gains also fly the suit in mode 3 — press Restart and take off to feel them.</p></div></div>
    <p class="lesson" id="lab-verdict"></p>`;
  $('#lab').querySelectorAll<HTMLInputElement>('[data-g]').forEach((inp) =>
    inp.addEventListener('input', () => manual(() => setGains({ ...gains, [inp.dataset.g!]: Number(inp.value) }))),
  );
  $('#lab').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => manual(() => setGains(LAB_PRESETS[Number(b.dataset.preset)][1]))));
}

function syncLab(): void {
  $('#lab').querySelectorAll<HTMLInputElement>('[data-g]').forEach((inp) => {
    const v = gains[inp.dataset.g as keyof Gains];
    inp.value = String(v);
    inp.nextElementSibling!.textContent = v.toFixed(2);
  });
  const rise = Number.isFinite(lab.riseTime) ? `${lab.riseTime.toFixed(1)} s` : '—';
  $('#lab-verdict').textContent = `Overshoot ${Math.round(lab.overshoot * 100)}% · rise ${rise} · final error ${lab.steadyError.toFixed(2)} m. ${lab.verdict}`;
  const c = $('#lab-plot') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const top = 25;
  const y = (a: number) => H - 28 - (a / top) * (H - 40);
  const x = (t: number) => 56 + (t / 14) * (W - 70);
  g.fillStyle = '#060a10';
  g.fillRect(0, 0, W, H);
  g.font = '20px sans-serif';
  g.fillStyle = '#8b93a1';
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let a = 0; a <= top; a += 5) {
    g.beginPath();
    g.moveTo(56, y(a));
    g.lineTo(W, y(a));
    g.stroke();
    g.fillText(`${a} m`, 2, y(a) + 7);
  }
  for (let t = 0; t <= 14; t += 2) g.fillText(`${t}s`, x(t) - 10, H - 4);
  g.strokeStyle = 'rgba(74,222,128,0.7)';
  g.setLineDash([5, 5]);
  g.beginPath();
  g.moveTo(56, y(10));
  g.lineTo(W, y(10));
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#7dd3fc';
  g.lineWidth = 2.5;
  g.beginPath();
  lab.t.forEach((t, i) => (i ? g.lineTo(x(t), y(clamp(lab.alt[i], 0, top))) : g.moveTo(x(t), y(clamp(lab.alt[i], 0, top)))));
  g.stroke();
  g.lineWidth = 1;
}

// --------------------------------------------------------------- actions --
function setCourse(c: CourseId): void {
  ss.reset(c, ss.source);
  afterReset();
}
function setSource(s: EnergyId): void {
  ss.reset(ss.courseId, s);
  afterReset();
}
function restart(): void {
  ss.reset();
  afterReset();
}
function afterReset(): void {
  shownResult = undefined;
  syncLeft();
  renderRight();
}
function setAssist(a: Assist): void {
  ss.setAutopilot(false);
  ss.setAssist(a);
  syncLeft();
}
function setAutopilot(on: boolean): void {
  if (on) {
    ss.reset();
    afterReset();
  }
  ss.setAutopilot(on);
  syncLeft();
}
function setGains(g: Gains): void {
  gains = { ...g };
  ss.ctl.setGains(gains);
  lab = stepResponse(gains);
  syncLab();
}

// ----------------------------------------------------------------- input --
const keys = new Set<string>();
const KEYMAP = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, select, textarea')) return;
  if (KEYMAP.includes(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    if (ss.autopilot) manual(() => setAutopilot(false));
    else stopTourIfManual();
  }
  if (e.code === 'Digit1') manual(() => setAssist('manual'));
  if (e.code === 'Digit2') manual(() => setAssist('stability'));
  if (e.code === 'Digit3') manual(() => setAssist('computer'));
  if (e.code === 'KeyR') manual(restart);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const touch = { left: [0, 0], right: [0, 0] } as Record<'left' | 'right', [number, number]>;
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
document.querySelectorAll<HTMLElement>('.stick').forEach((el) => {
  const side = el.dataset.stick as 'left' | 'right';
  const knob = el.querySelector('i') as HTMLElement;
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    const dx = clamp((e.clientX - r.left - r.width / 2) / (r.width / 2), -1, 1);
    const dy = clamp((e.clientY - r.top - r.height / 2) / (r.height / 2), -1, 1);
    touch[side] = [dx, dy];
    knob.style.transform = `translate(${dx * 32}px, ${dy * 32}px)`;
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    if (ss.autopilot) manual(() => setAutopilot(false));
    else stopTourIfManual();
    move(e);
  });
  el.addEventListener('pointermove', (e) => el.hasPointerCapture(e.pointerId) && move(e));
  const end = () => {
    touch[side] = [0, 0];
    knob.style.transform = '';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
});

function readStick(): Stick {
  const k = (a: string, b?: string) => (keys.has(a) || (b ? keys.has(b) : false) ? 1 : 0);
  const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : v);
  return {
    pitch: clamp(k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') - dead(touch.right[1]), -1, 1),
    roll: clamp(k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft') + dead(touch.right[0]), -1, 1),
    yaw: clamp(k('KeyE') - k('KeyQ') + dead(touch.left[0]), -1, 1),
    throttle: clamp(k('Space') - k('ShiftLeft', 'ShiftRight') - dead(touch.left[1]), -1, 1),
  };
}

// ------------------------------------------------------------------- HUD --
function drawHud(): void {
  const s = ss.s;
  const e = euler(s.q);
  const speed = Math.hypot(s.vel[0], s.vel[2]);
  const frac = ss.energyFraction();
  const left = ss.timeLeft();
  const gCls = s.gLoad > PILOT.greyout ? 'warn' : '';
  $('#hud').innerHTML = `<b>ALT</b> ${s.pos[1].toFixed(1)} m &nbsp;<b>V/S</b> ${s.vel[1] >= 0 ? '+' : ''}${s.vel[1].toFixed(1)}<br>
    <b>SPD</b> ${speed.toFixed(1)} m/s &nbsp;<b>HDG</b> ${Math.round((deg(e.yaw) + 360) % 360)}°<br>
    <b>G</b> <span class="${gCls}">${s.gLoad.toFixed(2)}</span> &nbsp;<b>MAX</b> ${s.maxG.toFixed(1)}<br>
    <b>NRG</b> <span class="bar"><i style="width:${frac * 100}%;background:${frac < 0.2 ? 'var(--fail)' : ''}"></i></span> ${Number.isFinite(left) && !s.landed ? fmtTime(left) : Number.isFinite(s.energy) ? `${Math.round(frac * 100)}%` : '∞'}<br>
    <b>MODE</b> ${ss.autopilot ? 'AUTOPILOT' : ss.ctl.assist.toUpperCase()}${ss.ctl.assist !== 'computer' ? ` · THR ${Math.round(ss.throttleLevel * 100)}%` : ` · HOLD ${ss.ctl.altitudeTarget.toFixed(0)} m`}
    ${ss.course.wind ? `<br><b>WIND</b> ${Math.hypot(ss.wind[0], ss.wind[2]).toFixed(1)} m/s` : ''}`;
  const t = s.thrusters;
  const cols: [string, number, number][] = [
    ['L↓', t.bootL, SUIT.bootMax],
    ['R↓', t.bootR, SUIT.bootMax],
    ['L✋', t.palmL, SUIT.palmMax],
    ['R✋', t.palmR, SUIT.palmMax],
  ];
  $('#thrust').innerHTML = cols.map(([n, f, m]) => `<div><div class="col"><i style="height:${(f / m) * 100}%"></i></div>${n}</div>`).join('') + `<div style="margin-left:4px">nozzle<br>${Math.round(deg(t.bootGimbal)) || 0}°</div>`;
  $('#msg').textContent = ss.p.message || (ss.p.phase === 'ready' ? (ss.ctl.assist === 'computer' ? 'Hold Space to take off' : 'Hold Space to raise the throttle') : '');
  $('#gloc').classList.toggle('hidden', !s.gloc);
  if (ss.p.result !== shownResult) renderRight();
}

function drawHorizon(): void {
  const c = $('#horizon') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const e = euler(ss.s.q);
  const r = 58;
  g.clearRect(0, 0, 120, 120);
  g.save();
  g.beginPath();
  g.arc(60, 60, r, 0, Math.PI * 2);
  g.clip();
  g.translate(60, 60);
  g.rotate(-e.roll);
  const off = clamp(deg(e.pitch) * 1.4, -70, 70);
  g.fillStyle = '#3b82c4';
  g.fillRect(-90, -150 + off, 180, 150);
  g.fillStyle = '#6b4f2a';
  g.fillRect(-90, off, 180, 150);
  g.strokeStyle = '#fff';
  g.lineWidth = 1;
  for (let p = -30; p <= 30; p += 10) {
    if (!p) continue;
    const yy = off - p * 1.4;
    g.beginPath();
    g.moveTo(-14, yy);
    g.lineTo(14, yy);
    g.stroke();
  }
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-90, off);
  g.lineTo(90, off);
  g.stroke();
  g.restore();
  g.strokeStyle = '#fbbf24';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(30, 60);
  g.lineTo(52, 60);
  g.moveTo(68, 60);
  g.lineTo(90, 60);
  g.stroke();
  g.strokeStyle = 'rgba(125,211,252,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(60, 60, r, 0, Math.PI * 2);
  g.stroke();
}

// ----------------------------------------------------------------- tour --
let highlighted: Element | null = null;
const actions: TourActions = {
  setCourse: (c) => {
    if (c !== ss.courseId) setCourse(c);
  },
  setSource: (s) => {
    if (s !== ss.source) {
      ss.source = s;
      ss.s = { ...ss.s, energy: ENERGY[s].capacity, energyUsed: 0 };
      afterReset();
    }
  },
  setAssist,
  autopilot: (on) => {
    if (on) {
      ss.reset();
      afterReset();
      ss.setAutopilot(true);
      syncLeft();
    } else setAutopilot(false);
  },
  setGains,
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
  },
};
const tour = new TourRunner(actions);
let paused = false;
let applying = false;
function stopTourIfManual(): void {
  if (tour.active && !applying) {
    tour.stop();
    drawTour();
  }
}
/** Run a user action: it ends a running tour. */
function manual(fn: () => void): void {
  stopTourIfManual();
  fn();
}
const origNext = tour.next.bind(tour);
tour.next = () => {
  applying = true;
  origNext();
  applying = false;
};

function drawTour(): void {
  const st = tour.step;
  const bar = $('#tourbar');
  bar.classList.toggle('hidden', !st);
  if (!st) return;
  bar.innerHTML = `<div class="t-head"><span class="badge">TOUR ${tour.index + 1}/${TOUR.length}</span><strong>${esc(st.title)}</strong>
    <button data-tb="prev" aria-label="Previous">◀</button><button data-tb="pause" aria-label="Pause">${paused ? '▶' : '❚❚'}</button><button data-tb="next" aria-label="Next">▶▶</button><button data-tb="stop" aria-label="Stop tour">✕</button></div>
    <div style="margin-top:6px">${esc(st.text)}</div><div class="progress"><i style="width:${Math.min(100, (tour.elapsed / st.seconds) * 100)}%"></i></div>`;
}
$('#tourbar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tb]');
  if (!b) return;
  const k = b.dataset.tb;
  if (k === 'prev') {
    applying = true;
    tour.prev();
    applying = false;
  }
  if (k === 'next') tour.next();
  if (k === 'pause') paused = !paused;
  if (k === 'stop') tour.stop();
  drawTour();
});

function startTour(): void {
  $('#start').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  paused = false;
  tour.start();
  drawTour();
}
$('#tour-btn').addEventListener('click', startTour);
$('#reset-btn').addEventListener('click', () => manual(restart));

$('#start').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
  <h2 id="st">FLIGHT CLUB</h2>
  <p>Fly an Iron Man-style jet suit: two boot jets, two palm jets, 200 kg, real rigid-body physics. Take off, thread rings,
  and land on a gusty rooftop — then open the hood on the control software that makes it flyable.</p>
  <div class="note">Educational fan project. Real flight dynamics, PID control, thrust and energy maths, simplified for teaching.
  The "arc reactor" is the only fictional part — and the sim tells you so. Not affiliated with any film, comic or jet-suit company.</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="primary" id="st-tour">▶ Guided tour</button><button id="st-free">Fly now</button></div>
</div>`;
$('#st-tour').addEventListener('click', startTour);
$('#st-free').addEventListener('click', () => $('#start').classList.add('hidden'));

renderLeft();
renderLab();
syncLeft();
syncLab();
renderRight();

let last = performance.now();
let hudT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const tourOpen = !$('#start').classList.contains('hidden');
  if (!tourOpen) ss.update(dt, ss.autopilot ? NEUTRAL : readStick());
  world.update(ss);
  drawHorizon();
  const before = tour.index;
  tour.update(dt, paused);
  hudT += dt;
  if (before !== tour.index || hudT > 0.1) {
    hudT = 0;
    drawHud();
    drawTour();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__suit = { ss, tour, setGains, setCourse, setSource, setAutopilot, setAssist };
