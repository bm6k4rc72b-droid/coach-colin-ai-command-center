/** VOLTFORGE app shell — Made by Colin Cook. 3D Roadster, live physics, charts, maths, tour. */
import './style.css';
import { MILESTONES, PART_ORDER, PARTS, type PartId } from './core/parts';
import {
  baseSpeed, bestRangeSpeed, braking, burnTime, cellCount, consumption, cornerSpeed, downforce, drag, G0, isp, kinetic, launch, LAUNCH_DATE, MPH, pack,
  PRESETS, range, regenWh, RHO_AIR, ROADSTER_1, thrusterDeltaV, topSpeed, type Car, type RunResult, type Sample,
} from './core/physics';
import { TOUR, TourRunner, type TourActions } from './core/tour';
import { drawForces, drawLaunch, drawOrbit, drawRange } from './scene/charts';
import { World } from './scene/world';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const f0 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 });
const f1 = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const f2 = (x: number) => x.toFixed(2);

const world = new World($('#view') as HTMLCanvasElement);
let car: Car = { ...PRESETS[0].car };
let presetId: string | null = 'gen2';
let selected: PartId | null = null;
let run: RunResult = launch(car);

/* ------------------------------------------------------------- playback */

type Mode = 'idle' | 'launch' | 'brake';
const play = { mode: 'idle' as Mode, t: 0, phase: 'go' as 'go' | 'stop', v: 0, x: 0, stopT: 0, slow: false, lights: { t60: false, t100: false, q: false } };

function sampleAt(t: number): Sample {
  const S = run.samples;
  if (t <= S[0].t) return S[0];
  for (let i = 1; i < S.length; i++) {
    if (S[i].t >= t) {
      const a = S[i - 1];
      const b = S[i];
      const k = (t - a.t) / (b.t - a.t);
      return { ...b, t, v: a.v + (b.v - a.v) * k, x: a.x + (b.x - a.x) * k, a: a.a + (b.a - a.a) * k, battW: a.battW + (b.battW - a.battW) * k, thrust: k < 0.5 ? a.thrust : b.thrust };
    }
  }
  return S[S.length - 1];
}

function startRun(kind: Mode): void {
  run = launch(car);
  play.mode = kind;
  play.t = 0;
  play.phase = 'go';
  play.v = 0;
  play.lights = { t60: false, t100: false, q: false };
  if (kind !== 'idle') world.chase();
  else world.drive = { v: 0, a: 0, power: 0, thrust: 0, braking: 0 };
}

function stepPlayback(dt: number): void {
  if (play.mode === 'idle') return;
  const d = dt * (play.slow ? 0.25 : 1);
  const endGo = play.mode === 'brake' ? run.t60 ?? 3 : Math.min(run.tQuarter ?? 12, 12);
  if (play.phase === 'go') {
    play.t += d;
    const s = sampleAt(play.t);
    play.v = s.v;
    world.drive = { v: s.v, a: s.a, power: s.battW, thrust: s.thrust, braking: 0 };
    if (run.t60 !== null && play.t >= run.t60) play.lights.t60 = true;
    if (run.t100 !== null && play.t >= run.t100) play.lights.t100 = true;
    if (run.tQuarter !== null && play.t >= run.tQuarter) play.lights.q = true;
    if (play.t >= endGo) {
      play.phase = 'stop';
      play.stopT = 0;
    }
  } else {
    // Brake to a stop at the grip limit (gentler after a long run so the camera can watch).
    const decel = (play.mode === 'brake' ? 1 : 0.6) * car.mu * G0;
    play.v = Math.max(0, play.v - decel * d);
    play.stopT += d;
    const regenW = -Math.min(300e3, car.mass * decel * play.v * 0.7);
    world.drive = { v: play.v, a: -decel, power: regenW, thrust: 0, braking: 1 };
    if (play.v <= 0) {
      play.mode = 'idle';
      world.drive = { v: 0, a: 0, power: 0, thrust: 0, braking: 0 };
    }
  }
}

/* ------------------------------------------------------------- controls */

interface SliderDef {
  key: keyof Car;
  label: string;
  min: number;
  max: number;
  step: number;
  to: (v: number) => number;
  from: (x: number) => number;
  fmt: (x: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: 'mass', label: 'Mass with driver', min: 1000, max: 2800, step: 10, to: (v) => v, from: (x) => x, fmt: (x) => `${f0(x)} kg` },
  { key: 'mu', label: 'Tyre grip μ', min: 0.6, max: 1.9, step: 0.01, to: (v) => v, from: (x) => x, fmt: (x) => x.toFixed(2) },
  { key: 'power', label: 'Peak power', min: 100, max: 1500, step: 5, to: (v) => v * 1000, from: (x) => x / 1000, fmt: (x) => `${f0(x / 1000)} kW · ${f0(x / 745.7)} hp` },
  { key: 'wheelTorque', label: 'Wheel torque', min: 2000, max: 16000, step: 50, to: (v) => v, from: (x) => x, fmt: (x) => `${f0(x)} N·m` },
  { key: 'cd', label: 'Drag coefficient Cd', min: 0.18, max: 0.45, step: 0.005, to: (v) => v, from: (x) => x, fmt: (x) => x.toFixed(3) },
  { key: 'thrust', label: 'Cold-gas thrust', min: 0, max: 40, step: 0.5, to: (v) => v * 1000, from: (x) => x / 1000, fmt: (x) => (x ? `${f1(x / 1000)} kN` : 'off') },
  { key: 'gasKg', label: 'Nitrogen on board', min: 0, max: 80, step: 1, to: (v) => v, from: (x) => x, fmt: (x) => `${f0(x)} kg` },
  { key: 'packWh', label: 'Battery energy', min: 40, max: 250, step: 1, to: (v) => v * 1000, from: (x) => x / 1000, fmt: (x) => `${f0(x / 1000)} kWh` },
  { key: 'packV', label: 'Pack voltage', min: 300, max: 1000, step: 10, to: (v) => v, from: (x) => x, fmt: (x) => `${f0(x)} V` },
];

function renderControls(): void {
  $('#controls').innerHTML = `
    <h3>Car setup</h3>
    <div class="presets">${PRESETS.map((x) => `<button data-preset="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <p class="hint" id="preset-blurb"></p>
    <div class="runbar"><button class="primary" id="go-launch">⚡ Launch</button><button id="go-brake">⏹ 60–0 stop</button><button id="go-slow">◔ Slow-mo</button></div>
    ${SLIDERS.map((s) => `<div class="slider"><label>${s.label}<span id="v-${s.key}"></span></label><input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></div>`).join('')}
    <div id="readouts"></div>`;
  $('#controls').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => manual(() => setPreset(b.dataset.preset!))));
  $('#controls').querySelectorAll<HTMLInputElement>('[data-k]').forEach((inp) =>
    inp.addEventListener('input', () =>
      manual(() => {
        const s = SLIDERS.find((x) => x.key === inp.dataset.k)!;
        car = { ...car, [s.key]: s.to(Number(inp.value)), name: 'Custom' };
        presetId = null;
        run = launch(car);
      }),
    ),
  );
  $('#go-launch').addEventListener('click', () => manual(() => startRun('launch')));
  $('#go-brake').addEventListener('click', () => manual(() => startRun('brake')));
  $('#go-slow').addEventListener('click', () => {
    play.slow = !play.slow;
    $('#go-slow').classList.toggle('on', play.slow);
  });
}

function setPreset(id: string): void {
  const pr = PRESETS.find((x) => x.id === id);
  if (!pr) return;
  car = { ...pr.car };
  presetId = id;
  run = launch(car);
}

const tile = (k: string, v: string, col: string, note = '') => `<div class="tile"><small>${k}</small><b style="color:${col}">${v}</b>${note ? `<em>${note}</em>` : ''}</div>`;

function syncControls(): void {
  $('#controls').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === presetId));
  $('#preset-blurb').textContent = PRESETS.find((x) => x.id === presetId)?.blurb ?? 'Custom settings: every number below is recomputed from the physics.';
  for (const s of SLIDERS) {
    const inp = $('#controls').querySelector<HTMLInputElement>(`[data-k="${s.key}"]`)!;
    if (document.activeElement !== inp) inp.value = String(s.from(car[s.key] as number));
    $(`#v-${s.key}`).textContent = s.fmt(car[s.key] as number);
  }
  world.thrusterPackage = car.thrust > 0 && car.gasKg > 0;
  const top = topSpeed(car);
  const b60 = braking(car, 60 * MPH);
  $('#readouts').innerHTML = `
    <div class="readouts">
      ${tile('0–60 mph', run.t60 ? `${f2(run.t60)} s` : '—', '#38e1ff', run.t60Rollout ? `${f2(run.t60Rollout)} s with 1-ft rollout` : '')}
      ${tile('0–100 mph', run.t100 ? `${f2(run.t100)} s` : '—', '#a78bfa')}
      ${tile('¼ mile', run.tQuarter ? `${f2(run.tQuarter)} s` : '—', '#ff4fd8', run.trapMph ? `@ ${f0(run.trapMph)} mph` : '')}
      ${tile('Top speed', `${f0(top / MPH)} mph`, '#fff6c2', top >= car.vLimit * 0.99 ? 'rpm-limited' : 'drag-limited')}
      ${tile('Peak g', run.peakG.toFixed(2), '#fb7185', run.peakG > car.mu + 0.02 ? 'beyond tyre grip' : 'grip/torque-limited')}
      ${tile('Range @ 70 mph', `${f0(range(car, 70 * MPH) / 1.609)} mi`, '#4ade80')}
      ${tile('Peak pack power', `${f0(run.peakBattW / 1000)} kW`, '#22d3ee', `${f0(run.peakAmps)} A`)}
      ${tile('60–0 mph', `${f1(b60.distance)} m`, '#fbbf24', `${f1(b60.distance * 3.281)} ft`)}
    </div>`;
}

/* ------------------------------------------------------------- the maths */

function renderMaths(): void {
  const c = car;
  const m = c.mass;
  const Ft = c.wheelTorque / c.radius;
  const aT = Ft / m;
  const aMu = c.mu * G0;
  const v60 = 60 * MPH;
  const vTop = topSpeed(c);
  const pDragTop = drag(c, vTop) * vTop;
  const pk = pack(c, run.peakBattW);
  const b60 = braking(c, v60);
  const v250 = 250 * MPH;
  const dv = thrusterDeltaV(c);
  const bt = burnTime(c);
  const vb = baseSpeed(c);
  const r100 = cornerSpeed(c, 100);
  const block = (title: string, col: string, lines: string[], note: string) => `
    <div class="mblock" style="--c:${col}"><b>${title}</b>${lines.map((l) => `<code>${l}</code>`).join('')}<p>${note}</p></div>`;
  $('#maths').innerHTML = `<h3>The maths, live: every line uses your current settings</h3><div class="mgrid">
    ${block('Torque → force → g', '#a78bfa', [`F = τ/r = ${f0(c.wheelTorque)} / ${c.radius} = ${f1(Ft / 1000)} kN`, `a = F/m = ${f0(Ft)} / ${f0(m)} = ${f2(aT)} m/s² = ${f2(aT / G0)} g`], 'What the motors can ask of the road at low speed.')}
    ${block('Grip ceiling', '#fbbf24', [`a_max = μ·g = ${c.mu.toFixed(2)} × 9.81 = ${f2(aMu)} m/s²`, `t(0→60) ≥ v/a = 26.82 / ${f2(Math.min(aT, aMu))} = ${f2(v60 / Math.min(aT, aMu))} s`], `${aT > aMu ? 'Grip is the limit: the motors could push harder.' : 'Torque is the limit: the tyres could take more.'}`)}
    ${block('Constant torque → constant power', '#c084fc', [`v_base = P·η·r / τ = ${f0(c.power / 1000)} kW × ${c.eta} × ${c.radius} / ${f0(c.wheelTorque)}`, `       = ${f1(vb)} m/s = ${f0(vb / MPH)} mph`, `above it: F = P·η / v (falls as 1/v)`], 'Why acceleration fades as the speed climbs.')}
    ${block('Air', '#f87171', [`F_drag = ½ρ·Cd·A·v² = ½ × ${RHO_AIR} × ${c.cd.toFixed(3)} × ${c.area} × v²`, `at 70 mph: ${f0(drag(c, 70 * MPH))} N · ${f1((drag(c, 70 * MPH) * 70 * MPH) / 1000)} kW`, `at ${f0(vTop / MPH)} mph: ${f0(drag(c, vTop))} N · ${f0(pDragTop / 1000)} kW`], 'Power grows with v³: the top end is a fight with the air.')}
    ${block('Battery', '#22d3ee', [`I = P/V = ${f0(run.peakBattW / 1000)} kW / ${f0(c.packV)} V = ${f0(pk.amps)} A`, `heat = I²R = ${f0(pk.amps)}² × ${c.packR} = ${f1(pk.heat / 1000)} kW`, `C-rate = P/E = ${f2(pk.cRate)} C · cells ≈ ${f0(cellCount(c.packWh, '2170'))} (2170)`], 'Halve the voltage and the same power means 4× the heat.')}
    ${block('Range', '#4ade80', [`Wh/km = (F_drag + F_roll)·1000 / (η·3600) + aux`, `at 70 mph: ${f0(consumption(c, 70 * MPH))} Wh/km → ${f0(range(c, 70 * MPH) / 1.609)} mi`, `best steady speed ≈ ${f0(bestRangeSpeed(c) / MPH)} mph → ${f0(range(c, bestRangeSpeed(c)) / 1.609)} mi`], 'Low speeds win until the auxiliaries dominate.')}
    ${block('Stopping', '#fb7185', [`KE = ½mv² = ½ × ${f0(m)} × 26.82² = ${f0(kinetic(c, v60) / 1000)} kJ`, `d = v²/(2μg) = ${f1(b60.distance)} m in ${f2(b60.time)} s`, `regen back to pack ≈ ${f0(regenWh(c, v60))} Wh · at 250 mph KE = ${f1(kinetic(c, v250) / 1e6)} MJ`], 'Four times the speed, sixteen times the energy.')}
    ${block('Cornering and downforce', '#34d399', [`F_down = ½ρ·ClA·v² → ${f0(downforce(c, 150 * MPH))} N at 150 mph`, `100 m bend: v = ${f1(r100)} m/s = ${f0(r100 / MPH)} mph`, `lateral g = v²/(r·g) = ${f2((r100 * r100) / (100 * G0))} g`], 'Downforce adds grip without adding mass.')}
    ${block('Rocket equation', '#f472b6', c.thrust > 0 && c.gasKg > 0 ? [`ṁ = F/vₑ = ${f0(c.thrust)} / ${c.ve} = ${f1(c.thrust / c.ve)} kg/s · Isp ${f0(isp(c))} s`, `burn = m_gas·vₑ/F = ${f2(bt)} s`, `Δv = vₑ ln(m₀/m₁) = ${f1(dv)} m/s = ${f1(dv / MPH)} mph`] : ['F = ṁ·vₑ', 'Δv = vₑ · ln(m₀ / m₁)', 'Turn on thrust to see the numbers'], 'Thrust skips the tyres, but the tank empties in about a second.')}
  </div>`;
}

/* ------------------------------------------------------------- part info */

function renderParts(): void {
  $('#parts').innerHTML = PART_ORDER.map((id) => `<button data-part="${id}" style="--c:${PARTS[id].color}">${esc(PARTS[id].name.split(' (')[0])}</button>`).join('');
  $('#parts').querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => b.addEventListener('click', () => manual(() => select(b.dataset.part as PartId))));
  $('#toggles').innerHTML = `<button id="t-xray">◎ X-ray</button><button id="t-explode">⇱ Exploded</button><button id="t-cinema">▭ Cinema</button><button id="t-reset">⟲ Reset view</button>`;
  $('#t-xray').addEventListener('click', () => manual(() => setXray(!world.xray)));
  $('#t-explode').addEventListener('click', () => manual(() => setExplode(world.explodeTarget < 0.5)));
  $('#t-cinema').addEventListener('click', () => {
    world.cinema = !world.cinema;
    $('#t-cinema').classList.toggle('on', world.cinema);
  });
  $('#t-reset').addEventListener('click', () => manual(() => select(null)));
}

function setExplode(on: boolean): void {
  world.explodeTarget = on ? 1 : 0;
  $('#t-explode').classList.toggle('on', on);
}
function setXray(on: boolean): void {
  world.xray = on;
  $('#t-xray').classList.toggle('on', on);
}

function select(id: PartId | null): void {
  selected = id;
  world.selected = id;
  world.focus(id);
  if (id && ['battery', 'motorFront', 'motorsRear', 'thrusters', 'cabin'].includes(id) && !world.xray && world.explodeTarget < 0.5) setXray(true);
  renderInfo();
}

function renderInfo(): void {
  const part = selected ? PARTS[selected] : null;
  $('#info').innerHTML = `
    ${
      part
        ? `<h3>Selected part</h3><div class="part-title"><i style="background:${part.color};box-shadow:0 0 12px ${part.color}"></i>${esc(part.name)}</div>
           <p style="margin:0 0 6px;color:#ffe4ea"><b>${esc(part.short)}</b></p><p style="margin:0;font-size:13px;color:#e8d9e2">${esc(part.body)}</p>
           <div class="facts">${part.facts.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>
           <div class="pmath">${part.math.map((l) => `<code>${esc(l)}</code>`).join('')}</div>`
        : `<h3>Explore the car</h3><p style="margin:0;font-size:13px;color:#e8d9e2">Click any part, or a chip under the 3D view, to see what it does and the maths behind it. X-ray shows the battery, motors and thrusters inside. Drag to orbit, scroll or pinch to zoom.</p>`
    }
    <div class="honest"><b>What is real here</b>The new Roadster's figures are Tesla's announced targets from 2017. Mass, drag, gearing, cell format and pack voltage were never published, so they are labelled assumptions chosen to fit those targets. The original Roadster figures are published specs.</div>
    <div style="margin-top:12px"><h3>Timeline</h3><div class="timeline">${MILESTONES.map(([y, t]) => `<div><b>${y}</b>${esc(t)}</div>`).join('')}</div></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => b.classList.toggle('on', b.dataset.part === selected));
}

/* ------------------------------------------------------------------ HUD */

function renderHud(): void {
  const d = world.drive;
  const mph = d.v / MPH;
  const light = (on: boolean, label: string, val: number | null) => `<span class="light ${on ? 'on' : ''}">${label}<b>${on && val !== null ? f2(val) + ' s' : '—'}</b></span>`;
  const pw = d.power / 1000;
  $('#hud').innerHTML = `<span class="status-chip" style="color:${play.mode === 'idle' ? '#a5f3fc' : play.phase === 'stop' ? '#fb7185' : '#ff4fd8'}">${play.mode === 'idle' ? 'READY · press Launch' : play.phase === 'stop' ? 'BRAKING · regenerating' : car.thrust > 0 && d.thrust > 0 ? 'LAUNCH · thrusters firing' : 'LAUNCH'}</span>
    <span class="big">${f0(mph)}<small> mph</small></span>
    <span class="sub">${f0(d.v * 3.6)} km/h · ${f2(d.a / G0)} g · ${pw < 0 ? 'regen ' : ''}${f0(Math.abs(pw))} kW · ${f0(Math.abs(d.power) / car.packV)} A · t ${f2(play.t)} s${play.slow ? ' · ¼ speed' : ''}</span>
    <span class="lights">${light(play.lights.t60, '0–60', run.t60)}${light(play.lights.t100, '0–100', run.t100)}${light(play.lights.q, '¼ mi', run.tQuarter)}</span>`;
}

/* ----------------------------------------------------------------- orbit */

const orbit = { date: new Date(), playing: true };
function renderOrbitControls(): void {
  const days = Math.round((Date.now() - LAUNCH_DATE.getTime()) / 86400000);
  $('#orbit-ctl').innerHTML = `<input type="range" id="orbit-day" min="0" max="${days + 1200}" value="${days}"><div class="runbar"><button id="orbit-play" class="on">❚❚ Pause</button><button id="orbit-launch">Launch day</button><button id="orbit-today">Today</button></div>`;
  const slider = $('#orbit-day') as HTMLInputElement;
  const set = (d: number) => {
    slider.value = String(d);
    orbit.date = new Date(LAUNCH_DATE.getTime() + d * 86400000);
  };
  slider.addEventListener('input', () => set(Number(slider.value)));
  $('#orbit-play').addEventListener('click', () => {
    orbit.playing = !orbit.playing;
    $('#orbit-play').textContent = orbit.playing ? '❚❚ Pause' : '▶ Play';
    $('#orbit-play').classList.toggle('on', orbit.playing);
  });
  $('#orbit-launch').addEventListener('click', () => set(0));
  $('#orbit-today').addEventListener('click', () => set(days));
}

/* ----------------------------------------------------------------- tour */

let highlighted: Element | null = null;
const actions: TourActions = {
  select,
  preset: setPreset,
  explode: setExplode,
  xray: setXray,
  run: (k) => startRun(k ?? 'idle'),
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
    if (highlighted && sel !== '#readouts' && sel !== '#controls' && sel !== '#hud') highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
};
const tour = new TourRunner(actions);
let paused = false;
let applying = false;
const origNext = tour.next.bind(tour);
tour.next = () => {
  applying = true;
  origNext();
  applying = false;
  renderAll();
};

function manual(fn: () => void): void {
  if (tour.active && !applying) {
    tour.stop();
    drawTour();
  }
  fn();
  renderAll();
}

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
    renderAll();
  }
  if (k === 'next') tour.next();
  if (k === 'pause') paused = !paused;
  if (k === 'stop') tour.stop();
  drawTour();
});

function startTour(): void {
  $('#overlay').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  paused = false;
  tour.start();
  drawTour();
}
$('#tour-btn').addEventListener('click', startTour);
$('#credit-top').addEventListener('click', (e) => {
  e.preventDefault();
  startScreen();
});
world.onPick = (id) => manual(() => select(id));

function startScreen(): void {
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
    <div class="kicker">TESLA ROADSTER · IN 3D</div>
    <h1 class="hero-title" id="st">VOLTFORGE</h1>
    <div class="made">✦ Made by Colin Cook ✦</div>
    <p style="font-size:16px;margin:4px 0 10px"><b>What does it actually take to reach 60 mph in under two seconds?</b></p>
    <p style="margin:0 0 10px;color:#f1dde4">Take apart a full 3D model of the Tesla Roadster: the carbon body, the 200 kWh floor pack, three motors, the brakes, the active aero and the claimed SpaceX thruster package. Then launch it. Every number is computed live, from tyre grip and motor torque to battery current, drag, range, stopping distance and the rocket equation. It ends in deep space, with the original Roadster that Falcon Heavy sent around the Sun.</p>
    <p class="hint">An educational model, not affiliated with Tesla or SpaceX. The new Roadster's figures are announced targets; unpublished values are labelled assumptions.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="primary" id="st-tour">▶ Take the guided tour</button><button id="st-free">Explore freely</button><button id="st-launch">⚡ Just launch it</button></div>
  </div>`;
  $('#st-tour').addEventListener('click', startTour);
  $('#st-free').addEventListener('click', () => $('#overlay').classList.add('hidden'));
  $('#st-launch').addEventListener('click', () => {
    $('#overlay').classList.add('hidden');
    manual(() => startRun('launch'));
  });
}

function renderAll(): void {
  syncControls();
  renderInfo();
  renderMaths();
}

renderControls();
renderParts();
renderOrbitControls();
renderAll();
startScreen();

let last = performance.now();
let t = 0;
let uiT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  stepPlayback(dt);
  world.update(dt);
  if (orbit.playing) {
    orbit.date = new Date(orbit.date.getTime() + dt * 86400000 * 6);
    const sl = document.getElementById('orbit-day') as HTMLInputElement | null;
    if (sl) sl.value = String(Math.round((orbit.date.getTime() - LAUNCH_DATE.getTime()) / 86400000));
  }
  uiT += dt;
  if (uiT > 0.06) {
    uiT = 0;
    renderHud();
    drawLaunch($('#launch-chart') as HTMLCanvasElement, run, play.mode !== 'idle' && play.phase === 'go' ? play.t : 0);
    drawForces($('#force-chart') as HTMLCanvasElement, car, world.drive.v);
    drawRange($('#range-chart') as HTMLCanvasElement, car, presetId === 'gen1' ? undefined : ROADSTER_1);
    drawOrbit($('#orbit-chart') as HTMLCanvasElement, orbit.date, t);
    if (tour.active) drawTour();
  }
  tour.update(dt, paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__roadster = { get car() { return car; }, get run() { return run; }, world, tour, setPreset, select, startRun, play, setXray, setExplode };
