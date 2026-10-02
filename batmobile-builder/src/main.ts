/** App shell: build panel, 3D test ground, results, telemetry, guided tour. */
import './style.css';
import { ARMOUR, CHASSIS, ENGINES, LIMITS, MISSION, TYRES } from './config/parts';
import { evaluate, score } from './core/mission';
import { TOUR, TourRunner, type TourActions } from './core/tour';
import { DEFAULT_BUILD, effectiveTravel, runAll, type Build, type TestSuite } from './core/vehicle';
import { World, type TestId } from './scene/world';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let build: Build = { ...DEFAULT_BUILD };
let suite: TestSuite = runAll(build);
let lastTest: TestId = 'garage';
const world = new World($('#view') as HTMLCanvasElement);
world.setBuild(build);

// ------------------------------------------------------------- config UI --
type Choice<K extends string> = { key: keyof Build; label: string; opts: Record<K, { name: string; info?: string; real?: string }> };
const choices: Choice<string>[] = [
  { key: 'chassis', label: 'Chassis', opts: CHASSIS },
  { key: 'engine', label: 'Powertrain', opts: ENGINES },
  { key: 'armour', label: 'Armour', opts: ARMOUR },
  { key: 'tyres', label: 'Tyres', opts: TYRES },
  { key: 'drive', label: 'Drive', opts: { rwd: { name: 'Rear-wheel drive', info: 'Only the rear tyres push.' }, awd: { name: 'All-wheel drive', info: 'All four tyres push: double the launch traction.' } } },
];
const sliders: { key: keyof Build; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: 'springK', label: 'Spring rate', min: LIMITS.springK[0], max: LIMITS.springK[1], step: 5000, fmt: (v) => `${Math.round(v / 1000)} kN/m` },
  { key: 'travel', label: 'Travel', min: LIMITS.travel[0], max: LIMITS.travel[1], step: 0.01, fmt: (v) => `${Math.round(v * 100)} cm` },
  { key: 'damping', label: 'Damping', min: LIMITS.damping[0], max: LIMITS.damping[1], step: 0.05, fmt: (v) => `ζ ${v.toFixed(2)}` },
  { key: 'wing', label: 'Rear wing', min: LIMITS.wing[0], max: LIMITS.wing[1], step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'rideOffset', label: 'Ride height', min: LIMITS.rideOffset[0], max: LIMITS.rideOffset[1], step: 0.01, fmt: (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)} cm` },
];

function renderConfig(): void {
  $('#config').innerHTML =
    '<h3>Build</h3>' +
    choices
      .map(
        (c) => `<div class="group"><label>${c.label}</label><div class="chips">${Object.entries(c.opts)
          .map(([id, o]) => `<button data-k="${String(c.key)}" data-v="${id}" title="${esc(o.info ?? o.real ?? '')}">${esc(o.name)}</button>`)
          .join('')}</div><p class="hint" data-hint="${String(c.key)}"></p></div>`,
      )
      .join('') +
    '<div class="group"><label>Suspension & aero</label>' +
    sliders
      .map((s) => `<label class="slider">${s.label}<input type="range" data-s="${String(s.key)}" min="${s.min}" max="${s.max}" step="${s.step}"/><span></span></label>`)
      .join('') +
    '<p class="hint" id="travel-hint"></p></div>';
  $('#config').querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) =>
    b.addEventListener('click', () => {
      stopTourIfManual();
      setBuild({ [b.dataset.k!]: b.dataset.v } as Partial<Build>);
    }),
  );
  $('#config').querySelectorAll<HTMLInputElement>('[data-s]').forEach((inp) =>
    inp.addEventListener('input', () => {
      stopTourIfManual();
      setBuild({ [inp.dataset.s!]: Number(inp.value) } as Partial<Build>);
    }),
  );
}

function syncConfig(): void {
  $('#config').querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => b.classList.toggle('on', String(build[b.dataset.k as keyof Build]) === b.dataset.v));
  for (const c of choices) {
    const o = (c.opts as Record<string, { info?: string; real?: string }>)[String(build[c.key])];
    $(`[data-hint="${String(c.key)}"]`).textContent = o?.real ?? o?.info ?? '';
  }
  $('#config').querySelectorAll<HTMLInputElement>('[data-s]').forEach((inp) => {
    const s = sliders.find((x) => x.key === inp.dataset.s)!;
    const v = build[s.key] as number;
    inp.value = String(v);
    inp.nextElementSibling!.textContent = s.fmt(v);
  });
  const eff = effectiveTravel(build);
  $('#travel-hint').textContent =
    eff < build.travel ? `This chassis can only package ${Math.round(eff * 100)} cm of travel — the rest is ignored.` : '';
}

// ------------------------------------------------------------ results UI --
function renderResults(): void {
  const d = suite.derived;
  const reqs = evaluate(suite);
  const sc = score(reqs);
  const icon = { pass: '✔', close: '▲', fail: '✖' };
  $('#results').innerHTML = `
    <div id="specs"><h3>Specs</h3><div class="kv">
      <b>Mass</b><span>${Math.round(d.mass)} kg</span>
      <b>Power</b><span>${Math.round(d.power / 1000)} kW · ${Math.round(d.powerToWeight)} W/kg</span>
      <b>Drag area Cd·A</b><span>${d.cdA.toFixed(2)} m²</span>
      <b>Downforce Cl·A</b><span>${d.clA.toFixed(2)} m²</span>
      <b>Tyre grip μ</b><span>${d.mu.toFixed(2)}</span>
      <b>Centre of gravity</b><span>${d.hCG.toFixed(2)} m</span>
      <b>Stability factor</b><span>${d.ssf.toFixed(2)} g</span>
      <b>Crumple zone</b><span>${d.crumple.toFixed(2)} m</span>
    </div></div>
    <div id="mission" style="margin-top:12px"><h3>Mission: Gotham pursuit</h3>
      <div class="score"><div class="ring">${sc.score}</div><div><strong>${esc(sc.grade)}</strong><div class="hint">${esc(sc.headline)}</div></div></div>
      ${reqs
        .map(
          (r) => `<div class="req"><span class="ic ${r.status}">${icon[r.status]}</span><div><strong>${esc(r.label)}</strong> <span class="hint">${esc(r.target)}</span>
          <div class="val ${r.status}">${esc(r.value)}</div></div><div class="why">${esc(r.lesson)}</div></div>`,
        )
        .join('')}
    </div>`;
}

function drawTelemetry(): void {
  const c = $('#telemetry') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  g.fillStyle = '#080a0e';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.fillStyle = '#8b93a1';
  g.font = '11px sans-serif';
  const tr = suite.accel.trace;
  const vMax = Math.max(100, ...tr.map((p) => p.v * 3.6));
  for (let k = 0; k <= vMax; k += 50) {
    const y = H - 18 - (k / vMax) * (H - 30);
    g.beginPath();
    g.moveTo(32, y);
    g.lineTo(W, y);
    g.stroke();
    g.fillText(`${k}`, 4, y + 4);
  }
  for (let t = 0; t <= 15; t += 3) g.fillText(`${t}s`, 32 + (t / 15) * (W - 40), H - 4);
  // target marker: 100 km/h at mission time
  const y100 = H - 18 - (100 / vMax) * (H - 30);
  const x45 = 32 + (MISSION.accel0to100 / 15) * (W - 40);
  g.strokeStyle = 'rgba(74,222,128,0.6)';
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(x45, H - 18);
  g.lineTo(x45, y100);
  g.lineTo(32, y100);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#facc15';
  g.lineWidth = 2;
  g.beginPath();
  tr.forEach((p, i) => {
    const x = 32 + (p.t / 15) * (W - 40);
    const y = H - 18 - ((p.v * 3.6) / vMax) * (H - 30);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();
  g.lineWidth = 1;
}

const TEST_LESSON: Record<TestId, () => string> = {
  garage: () => 'Change a part and every test result updates instantly. Run a test to watch it.',
  drag: () => evaluate(suite).find((r) => r.id === 'accel')!.lesson,
  hairpin: () => evaluate(suite).find((r) => r.id === 'hairpin')!.lesson,
  jump: () => evaluate(suite).find((r) => r.id === 'jump')!.lesson,
  crash: () => evaluate(suite).find((r) => r.id === 'crash')!.lesson,
};

function renderTests(): void {
  const tests: [TestId, string][] = [
    ['garage', 'Garage'],
    ['drag', '0–100 & ¼ mile'],
    ['hairpin', 'Hairpin'],
    ['jump', 'Canal jump'],
    ['crash', 'Crash test'],
  ];
  $('#tests').innerHTML = tests.map(([id, n]) => `<button data-t="${id}">${n}</button>`).join('') + '<button id="all-btn" class="primary">Run all</button>';
  $('#tests').querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) =>
    b.addEventListener('click', () => {
      stopTourIfManual();
      runTest(b.dataset.t as TestId);
    }),
  );
  $('#all-btn').addEventListener('click', () => {
    stopTourIfManual();
    runAllTests();
  });
}

function runTest(t: TestId): void {
  lastTest = t;
  world.play(t, suite);
  $('#tests').querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $('#lesson').textContent = TEST_LESSON[t]();
}

/** Run all: the results panel updates instantly; the 3D view plays the weakest test. */
function runAllTests(): void {
  const reqs = evaluate(suite);
  const worst = reqs.find((r) => r.status === 'fail') ?? reqs.find((r) => r.status === 'close');
  const map: Record<string, TestId> = { accel: 'drag', top: 'drag', brake: 'drag', hairpin: 'hairpin', jump: 'jump', crash: 'crash' };
  runTest(worst && map[worst.id] ? map[worst.id] : 'garage');
  revealInPanel($('#mission'));
}

/** Scroll an element into view inside its own scrolling panel without moving the page (desktop). */
function revealInPanel(el: Element | null): void {
  if (!el) return;
  const panel = el.closest<HTMLElement>('.panel');
  if (panel && panel.scrollHeight > panel.clientHeight + 4) {
    panel.scrollTo({ top: (el as HTMLElement).offsetTop - panel.offsetTop - 8, behavior: 'smooth' });
  }
}

function setBuild(p: Partial<Build>): void {
  build = { ...build, ...p };
  suite = runAll(build);
  world.setBuild(build);
  syncConfig();
  renderResults();
  drawTelemetry();
  if (lastTest !== 'garage') world.play(lastTest, suite);
  $('#lesson').textContent = TEST_LESSON[lastTest]();
}

// ----------------------------------------------------------------- tour --
let highlighted: Element | null = null;
const actions: TourActions = {
  setBuild,
  runTest,
  runAll: runAllTests,
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
    revealInPanel(highlighted);
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
    <button data-tb="prev">◀</button><button data-tb="pause">${paused ? '▶' : '❚❚'}</button><button data-tb="next">▶▶</button><button data-tb="stop">✕</button></div>
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
$('#reset-btn').addEventListener('click', () => {
  tour.stop();
  drawTour();
  setBuild({ ...DEFAULT_BUILD });
  runTest('garage');
});

$('#start').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
  <h2 id="st">NIGHT INTERCEPTOR</h2>
  <p>Design a Batmobile-style pursuit vehicle — then find out what physics thinks of it. Eight requirements, one car:
  acceleration, top speed, braking, a hairpin, a 20 m canal jump, a barrier crash, range and armour.</p>
  <div class="note">Educational fan project. Real vehicle-dynamics models (traction, drag, the static stability factor,
  ballistic jumps, suspension energy, crumple zones), simplified for teaching. Not affiliated with any film or comic.</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="primary" id="st-tour">▶ Guided tour</button><button id="st-free">Build freely</button></div>
</div>`;
$('#st-tour').addEventListener('click', startTour);
$('#st-free').addEventListener('click', () => $('#start').classList.add('hidden'));

renderConfig();
renderTests();
setBuild({});
runTest('garage');

let last = performance.now();
let barT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  world.update(dt, now / 1000);
  $('#status').textContent = world.status;
  const before = tour.index;
  tour.update(dt, paused);
  barT += dt;
  if (before !== tour.index || barT > 0.2) {
    barT = 0;
    drawTour();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__car = { get build() { return build; }, get suite() { return suite; }, tour, world, setBuild, runTest };
