/** SUNFORGE app shell — Made by Colin Cook. 3D tokamak, live physics, charts, info and tour. */
import './style.css';
import { MILESTONES, PART_ORDER, PARTS, type PartId } from './core/parts';
import { balance, IGNITION_TRIPLE, keVToCelsius, PRESETS, status, STATUS_TEXT, type Plasma, type Status } from './core/physics';
import { TOUR, TourRunner, type TourActions } from './core/tour';
import { drawLawson, drawReactivity } from './scene/charts';
import { drawReaction } from './scene/reaction';
import { World } from './scene/world';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const world = new World($('#view') as HTMLCanvasElement);
let p: Plasma = { ...PRESETS.find((x) => x.id === 'iter')!.p };
let presetId: string | null = 'iter';
let selected: PartId | null = null;

const STATUS_COLOR: Record<Status, string> = {
  cold: '#fb923c',
  heating: '#facc15',
  fusing: '#38bdf8',
  breakeven: '#a78bfa',
  burning: '#ff2bd6',
  ignition: '#fff6c2',
  disrupted: '#ef4444',
};

// ------------------------------------------------------------- controls ---
interface SliderDef {
  key: keyof Plasma;
  label: string;
  min: number;
  max: number;
  step: number;
  /** slider value ↔ plasma value */
  to: (v: number) => number;
  from: (x: number) => number;
  fmt: (x: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: 'T', label: 'Temperature', min: Math.log10(0.3), max: Math.log10(80), step: 0.005, to: (v) => 10 ** v, from: (x) => Math.log10(x), fmt: (x) => `${x.toFixed(x < 10 ? 1 : 0)} keV · ${(keVToCelsius(x) / 1e6).toFixed(0)} M°C` },
  { key: 'n', label: 'Density', min: 0.1, max: 2.0, step: 0.01, to: (v) => v * 1e20, from: (x) => x / 1e20, fmt: (x) => `${(x / 1e20).toFixed(2)} ×10²⁰ m⁻³` },
  { key: 'tauE', label: 'Energy confinement time', min: Math.log10(0.1), max: Math.log10(12), step: 0.005, to: (v) => 10 ** v, from: (x) => Math.log10(x), fmt: (x) => `${x.toFixed(x < 1 ? 2 : 1)} s` },
  { key: 'B', label: 'Magnetic field', min: 1, max: 12, step: 0.1, to: (v) => v, from: (x) => x, fmt: (x) => `${x.toFixed(1)} T` },
  { key: 'Ip', label: 'Plasma current', min: 1, max: 20, step: 0.1, to: (v) => v, from: (x) => x, fmt: (x) => `${x.toFixed(1)} MA` },
];

function renderControls(): void {
  $('#controls').innerHTML = `
    <h3>Reactor controls</h3>
    <div class="presets">${PRESETS.map((x) => `<button data-preset="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <p class="hint" id="preset-blurb"></p>
    ${SLIDERS.map((s) => `<div class="slider"><label>${s.label}<span id="v-${s.key}"></span></label><input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></div>`).join('')}
    <div id="readouts"></div>`;
  $('#controls').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => manual(() => setPreset(b.dataset.preset!))));
  $('#controls').querySelectorAll<HTMLInputElement>('[data-k]').forEach((inp) =>
    inp.addEventListener('input', () =>
      manual(() => {
        const s = SLIDERS.find((x) => x.key === inp.dataset.k)!;
        p = { ...p, [s.key]: s.to(Number(inp.value)) };
        presetId = null;
      }),
    ),
  );
}

function syncControls(): void {
  $('#controls').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === presetId));
  $('#preset-blurb').textContent = PRESETS.find((x) => x.id === presetId)?.blurb ?? 'Custom settings.';
  for (const s of SLIDERS) {
    const inp = $('#controls').querySelector<HTMLInputElement>(`[data-k="${s.key}"]`)!;
    if (document.activeElement !== inp) inp.value = String(s.from(p[s.key]));
    $(`#v-${s.key}`).textContent = s.fmt(p[s.key]);
  }
  const b = balance(p);
  const st = status(p, b);
  const tp = Math.min(1, Math.log10(Math.max(b.tripleProduct, 1e18) / 1e18) / Math.log10(IGNITION_TRIPLE * 3 / 1e18));
  const tpMark = Math.log10(IGNITION_TRIPLE / 1e18) / Math.log10(IGNITION_TRIPLE * 3 / 1e18);
  const qTxt = !b.stable ? '—' : Number.isFinite(b.Q) ? (b.Q < 0.01 ? b.Q.toExponential(1) : b.Q.toFixed(b.Q < 10 ? 2 : 1)) : '∞';
  const mw = (x: number) => (x < 0.01 ? '0' : x < 10 ? x.toFixed(2) : x.toFixed(0));
  $('#readouts').innerHTML = `
    <div class="readouts">
      <div class="tile"><small>Fusion power</small><b style="color:#ff6ef0">${b.stable ? mw(b.fusionMW) : '0'} MW</b></div>
      <div class="tile"><small>Gain Q</small><b style="color:#fff6c2">${qTxt}</b></div>
      <div class="tile"><small>Heating needed</small><b style="color:#fde047">${b.ignited ? 'none' : `${mw(b.heatingMW)} MW`}</b></div>
      <div class="tile"><small>Neutron power</small><b style="color:#7ee8ff">${b.stable ? mw(b.neutronMW) : '0'} MW</b></div>
    </div>
    <div style="margin-top:10px;font-size:12.5px">Triple product nTτ <span style="float:right;font-family:var(--mono)">${b.tripleProduct.toExponential(1)}</span></div>
    <div class="meter"><i style="width:${tp * 100}%;background:linear-gradient(90deg,#ff6a00,#ff2bd6,#22d3ee)"></i><span class="mark" style="left:${tpMark * 100}%"></span></div>
    <div class="hint" style="margin-top:0">white line = ignition (≈3×10²¹ keV·s/m³)</div>
    <div style="margin-top:8px;font-size:12.5px">Plasma β (pressure ÷ magnetic pressure) <span style="float:right;font-family:var(--mono)">${(b.beta * 100).toFixed(1)}% / ${(b.betaLimit * 100).toFixed(1)}%</span></div>
    <div class="meter"><i style="width:${Math.min(100, (b.beta / b.betaLimit) * 80)}%;background:${b.beta > b.betaLimit ? '#ef4444' : '#a78bfa'}"></i><span class="mark" style="left:80%"></span></div>
    <div style="margin-top:8px;font-size:12.5px">Density vs Greenwald limit <span style="float:right;font-family:var(--mono)">${Math.round((p.n / b.greenwald) * 100)}%</span></div>
    <div class="meter"><i style="width:${Math.min(100, (p.n / b.greenwald) * 80)}%;background:${p.n > b.greenwald ? '#ef4444' : '#38bdf8'}"></i><span class="mark" style="left:80%"></span></div>
    ${b.instability ? `<div class="banner bad">⚠ ${esc(b.instability)}</div>` : st === 'ignition' ? '<div class="banner good">🔥 Ignition: the helium nuclei from fusion keep the plasma hot on their own.</div>' : ''}`;
}

function setPreset(id: string): void {
  const pr = PRESETS.find((x) => x.id === id);
  if (!pr) return;
  p = { ...pr.p };
  presetId = id;
}

// ------------------------------------------------------------- part info ---
function renderParts(): void {
  $('#parts').innerHTML = PART_ORDER.map((id) => `<button data-part="${id}" style="--c:${PARTS[id].color}">${esc(PARTS[id].name.replace('Superconducting ', ''))}</button>`).join('');
  $('#parts').querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => b.addEventListener('click', () => manual(() => select(b.dataset.part as PartId))));
  $('#toggles').innerHTML = `<button id="t-explode">⇱ Exploded view</button><button id="t-lines" class="on">〰 Field lines</button><button id="t-reset">⟲ Reset view</button>`;
  $('#t-explode').addEventListener('click', () => manual(() => setExplode(world.explodeTarget < 0.5)));
  $('#t-lines').addEventListener('click', () => manual(() => {
    world.fieldLines = !world.fieldLines;
  }));
  $('#t-reset').addEventListener('click', () => manual(() => select(null)));
}

function setExplode(on: boolean): void {
  world.explodeTarget = on ? 1 : 0;
}

function select(id: PartId | null): void {
  selected = id;
  world.selected = id;
  world.focus(id);
  renderInfo();
}

function renderInfo(): void {
  const part = selected ? PARTS[selected] : null;
  $('#info').innerHTML = `
    ${
      part
        ? `<h3>Selected part</h3><div class="part-title"><i style="background:${part.color};box-shadow:0 0 12px ${part.color}"></i>${esc(part.name)}</div>
           <p style="margin:0 0 6px;color:#e5dcff"><b>${esc(part.short)}</b></p><p style="margin:0;font-size:13px;color:#cfc6ef">${esc(part.body)}</p>
           <div class="facts">${part.facts.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>`
        : `<h3>Explore the machine</h3><p style="margin:0;font-size:13px;color:#cfc6ef">Click any part of the tokamak — or a chip under the 3D view — to see what it does. Drag to orbit, scroll or pinch to zoom.</p>`
    }
    <div id="reaction-card" style="margin-top:14px"><h3>The fusion reaction</h3><canvas id="reaction" width="440" height="250"></canvas>
      <p class="hint">D + T → ⁴He (3.5 MeV) + n (14.1 MeV). Momentum conservation gives the light neutron 4/5 of the energy.</p></div>
    <div style="margin-top:12px"><h3>Milestones</h3><div class="timeline">${MILESTONES.map(([y, t]) => `<div><b>${y}</b>${esc(t)}</div>`).join('')}</div></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((b) => b.classList.toggle('on', b.dataset.part === selected));
}

function renderWhy(): void {
  $('#why').innerHTML = `<h3>Why fusion matters</h3><div class="why-grid">
    <div><b>Abundant fuel</b>Deuterium comes from seawater (1 in every 6,400 hydrogen atoms). Tritium is bred from lithium inside the blanket.</div>
    <div><b>Enormous energy</b>1 gram of D–T fuel releases ~340 GJ — about the same as 8 tonnes of oil — with no CO₂ from the reaction.</div>
    <div><b>Inherently safe</b>No chain reaction: any fault cools the plasma and fusion simply stops. Under a gram of fuel is in the machine at once.</div>
    <div><b>The hard part</b>Holding 150 million °C plasma stable for long enough, materials that survive 14 MeV neutrons, and making tritium fast enough.</div>
  </div>`;
}

// ------------------------------------------------------------------ HUD ---
function renderHud(): void {
  const b = balance(p);
  const st = status(p, b);
  const col = STATUS_COLOR[st];
  $('#hud').innerHTML = `<span class="status-chip" style="color:${col}">${esc(STATUS_TEXT[st])}</span>
    <span class="big" style="color:${col}">${(keVToCelsius(p.T) / 1e6).toFixed(0)} million °C</span>
    <span class="sub">${b.stable ? `${b.fusionMW < 1 ? b.fusionMW.toFixed(2) : b.fusionMW.toFixed(0)} MW fusion · Q ${Number.isFinite(b.Q) ? b.Q.toFixed(b.Q < 10 ? 2 : 1) : '∞'}` : 'confinement lost'} · Sun's core: 15 million °C</span>`;
  // Drive the 3D plasma
  const heat = Math.min(1, Math.max(0.05, Math.log10(Math.max(p.T, 0.3) / 0.3) / Math.log10(30 / 0.3)));
  const power = b.stable ? Math.min(1, Math.log10(1 + b.fusionMW) / 3) : 0;
  world.setLook({ heat: b.stable ? heat : heat * 0.35, power, kink: b.stable ? 0 : 1, flicker: b.stable ? 0 : 0.8, qa: Math.min(8, Math.max(1.6, ((5 * 4 * p.B * (1 + 1.7 * 1.7)) / 2 / (6.2 * Math.max(p.Ip, 0.5))) * 1.4)) });
  world.neutronRate = b.stable ? Math.min(420, b.fusionMW * 0.6) : 0;
  world.heatingOn = b.ignited ? 0.25 : 1;
}

// ----------------------------------------------------------------- tour ---
let highlighted: Element | null = null;
const actions: TourActions = {
  select,
  preset: setPreset,
  explode: setExplode,
  highlight: (sel) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
    if (highlighted && sel !== '#readouts' && sel !== '#controls') highlighted.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    <h1 class="hero-title" id="st">SUNFORGE</h1>
    <div class="made">✦ Made by Colin Cook ✦</div>
    <p style="font-size:16px;margin:4px 0 10px"><b>What if we could recreate the power of the Sun on Earth?</b></p>
    <p style="margin:0 0 10px;color:#d8d0ff">Step inside a full-scale 3D tokamak fusion reactor. Click every part — superconducting magnets, central solenoid,
    vacuum vessel, blanket, divertor and heating systems — and see what it does. Then take the controls: heat the plasma, squeeze it and
    hold it long enough to reach breakeven, a burning plasma and ignition, using real fusion physics.</p>
    <p class="hint">An educational model at ITER scale. The physics uses the published D–T reaction rate, Lawson's criterion and the real stability limits, simplified for teaching.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="primary" id="st-tour">▶ Take the guided tour</button><button id="st-free">Explore freely</button></div>
  </div>`;
  $('#st-tour').addEventListener('click', startTour);
  $('#st-free').addEventListener('click', () => $('#overlay').classList.add('hidden'));
}

function renderAll(): void {
  syncControls();
  renderInfo();
  renderHud();
}

renderControls();
renderParts();
renderWhy();
renderAll();
startScreen();

let last = performance.now();
let t = 0;
let uiT = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  world.update(dt);
  const b = balance(p);
  drawReaction($('#reaction') as HTMLCanvasElement, t);
  uiT += dt;
  if (uiT > 0.15) {
    uiT = 0;
    drawReactivity($('#react-chart') as HTMLCanvasElement, p.T);
    drawLawson($('#lawson-chart') as HTMLCanvasElement, p.T, p.n * p.tauE, !b.stable);
    const before = tour.index;
    if (tour.active && before === tour.index) drawTour();
  }
  tour.update(dt, paused);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__fusion = { get p() { return p; }, world, tour, setPreset, select, balance };
