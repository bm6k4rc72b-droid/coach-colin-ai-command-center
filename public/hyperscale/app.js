import * as THREE from 'three';
import { ACCEL, allIn, CHIN, train, optimal, isoFlop, SUPPLY, power, cool, T_MAX, AIR, WATER, DESIGN, fabric, tiersFor, STEP_TOKENS, OPS, chipW, newDay, dayStep, autoCtl, sla, priceAt, demandAt, ambient } from './sim/dc.js';
import { buildCampus, tempColor, rowZ, ROWS, PER } from './view/campus.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// HYPERSCALE · the app. Five stations around one AI campus: train a model (how much compute, how long),
// power it (grid, carbon), cool it (moving heat with air and water), wire it (the network fabric), and run it
// through the hottest day of the year.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const sci = (x, d = 1) => { if (!Number.isFinite(x) || x <= 0) return '—'; const e = Math.floor(Math.log10(x)), m = x / 10 ** e; return `${m.toFixed(d)}×10<sup>${e}</sup>`; };
const big = (x) => (x >= 1e12 ? f1(x / 1e12) + ' T' : x >= 1e9 ? f0(x / 1e9) + ' B' : f0(x / 1e6) + ' M');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['train', 'power', 'cool', 'fabric', 'ops'];
const hh = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

export class Hyperscale {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.fog = new THREE.FogExp2('#05070c', 0.0022); scene.background = new THREE.Color('#05070c'); scene.environmentIntensity = 0.35;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.2, 4000); scene.add(this.cam);
    this.sun = new THREE.DirectionalLight('#9fb8ff', 0.5); this.sun.position.set(-80, 160, 60); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -160, right: 160, top: 160, bottom: -160, near: 1, far: 600 }); scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#6a80b0', '#1a1612', 0.35); scene.add(this.hemi);
    this.U = buildCampus(scene);
    this.acc = 'a700';
    this.tr = { lN: Math.log10(70e9), lD: Math.log10(1.4e12), ln: 12, mfu: 0.4 };
    this.pw = { ln: 14, u: 0.8, pue: 1.3, supply: 'grid', price: 70 };
    this.cl = { mode: 'air', amb: 35, supply: 30, rack: 40 };
    this.fb = { ln: 14, gbps: 400, k: 64, m: 8 };
    this.op = { S: newDay(), ctl: { s: 1, train: true, batt: 'hold' }, run: false, rate: 0.7, acc: 0, alerts: {} };
    this.auto = false;
    this.goal = { train: false, power: false, cool: false, fabric: false, ops: false };
    this.view = { yaw: 0, pitch: 0.3, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'train'; this.entered = false; this.uiT = 0; this.time = 0; this.col = new THREE.Color();
    app.stage.use(scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  accChips() { return `<header class="lv-sub mono">${t('acc.h')}</header>${this.chips('acc', Object.keys(ACCEL), this.acc, (k) => t('acc.' + k))}`; }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true; this.view.yaw = 0; this.view.r = 1;
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { train: ['trP', 'trS', 'trB'], power: ['pwP', 'pwS', 'pwB'], cool: ['clP', 'clS', 'clB'], fabric: ['fbP', 'fbS', 'fbB'], ops: ['opP', 'opS', 'opB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.bindChips('acc', (k) => { this.acc = k; }); this.refresh(true); }

  // ═══ 1 · TRAIN ═══
  trIn() { const T = this.tr; return { N: 10 ** T.lN, D: 10 ** T.lD, n: 2 ** T.ln, mfu: T.mfu, acc: this.acc }; }
  trP() {
    const T = this.tr, I = this.trIn();
    return `<header class="lv-head mono">${t('tr.title')}</header><p class="intro">${t('tr.intro')}</p>
      ${this.slider('t-N', t('tr.N'), T.lN, 9, 12, 0.01, big(I.N))}${this.slider('t-D', t('tr.D'), T.lD, 11, 13.7, 0.01, big(I.D))}
      ${this.slider('t-n', t('tr.n'), T.ln, 10, 17, 1, f0(I.n))}${this.slider('t-m', t('tr.mfu'), T.mfu, 0.2, 0.6, 0.01, f0(T.mfu * 100) + ' %')}
      ${this.accChips()}<p class="small">${t('tr.note')}</p>`;
  }
  trS() { return `<header class="lv-head mono">${t('tr.read')}</header><div class="bigstats" id="tr-big"></div><canvas class="cv chart tall" id="cv-iso"></canvas><div class="math mono" id="tr-math"></div><div class="goal" id="tr-goal"></div>`; }
  trB() { this.bindSliders(this.tr, [['t-N', 'lN', (v) => big(10 ** v)], ['t-D', 'lD', (v) => big(10 ** v)], ['t-n', 'ln', (v) => f0(2 ** v)], ['t-m', 'mfu', (v) => f0(v * 100) + ' %']]); }
  trLive(full) {
    if (!full) return;
    const I = this.trIn(), R = train(I), X = ACCEL[this.acc], ok = Math.round(R.L * 1000) / 1000 <= 1.85 && R.days <= 30 && I.n <= 8192;
    const b = $('#tr-big'); if (b) b.innerHTML = `<div><b class="mono ${Math.round(R.L * 1000) / 1000 <= 1.85 ? 'c-green' : 'c-amber'}">${f3(R.L)}</b><small>${t('tr.loss')}</small></div><div><b class="mono ${R.days <= 30 ? 'c-green' : 'c-red'}">${R.days < 1 ? f1(R.days * 24) + ' h' : f1(R.days) + ' d'}</b><small>${t('tr.time')}</small></div><div><b class="mono">${f0(R.mwh)}</b><small>${t('tr.mwh')}</small></div>`;
    const C = R.C, pts = isoFlop(C), lo = Math.min(...pts.map((p) => p[1])), opt = R.opt, tgt = optimal(8.3e24);
    lineChart($('#cv-iso'), { x0: 9, x1: Math.log10(2e12), y0: Math.max(1.6, Math.floor((lo - 0.05) * 20) / 20), y1: Math.max(2.4, lo + 0.4), xTicks: [9, 10, 11, 12], xFmt: (x) => big(10 ** x), yFmt: (y) => y.toFixed(2), title: t('tr.chart'),
      series: [{ pts, color: '#58e0ff', label: t('tr.iso') }, { pts: isoFlop(8.3e24), color: 'rgba(255,255,255,.35)', dash: [4, 3], label: '8.3×10²⁴' }],
      marks: [{ y: 1.85, color: '#ffd27a', label: t('tr.target') }, { dot: [Math.log10(I.N), R.L], color: '#ff6a7a' }, { dot: [Math.log10(opt.N), opt.L], color: '#7cff9e' }, { x: Math.log10(tgt.N), color: 'rgba(124,255,158,.35)' }] });
    const m = $('#tr-math');
    if (m) m.innerHTML = `<div>C = 6·N·D = 6 × ${big(I.N)} × ${big(I.D)} = <b>${sci(C)} FLOP</b> · D/N = <b>${f0(R.ratio)}</b> ${t('tr.tpp')}</div>
      <div>t = C/(n·peak·MFU) = ${sci(C)}/(${f0(I.n)} × ${f0(X.peak / 1e12)} T × ${f2(I.mfu)}) = <b>${f1(R.days)} ${t('tr.days')}</b> · ${f1(R.gpuHours / 1e6)} M GPU·h</div>
      <div>L = E + A/N<sup>α</sup> + B/D<sup>β</sup> = ${CHIN.E} + ${f3(CHIN.A / I.N ** CHIN.a)} + ${f3(CHIN.B / I.D ** CHIN.b)} = <b>${f3(R.L)}</b></div>
      <div>${t('tr.optL')} N* = ${big(opt.N)}, D* = ${big(opt.D)} → L* = <b>${f3(opt.L)}</b> (${R.gap < 0.0015 ? t('tr.onCurve') : '+' + f3(R.gap)})</div>
      <div>${t('tr.mem')} 16 B × N = <b>${f1(R.stateTB)} TB</b> → ≥ ${f0(R.minGPUs)} × ${X.hbm} GB ${t('tr.memNote')}</div>`;
    if (ok) this.done('train');
    const g = $('#tr-goal'); if (g) g.innerHTML = `${badge(this.goal.train)} ${t('goal.train')}`;
  }

  // ═══ 2 · POWER ═══
  pwIn() { const P = this.pw; return { n: 2 ** P.ln, acc: this.acc, u: P.u, pue: P.pue, supply: P.supply, price: P.price }; }
  pwP() {
    const P = this.pw;
    return `<header class="lv-head mono">${t('pw.title')}</header><p class="intro">${t('pw.intro')}</p>
      ${this.slider('p-n', t('pw.n'), P.ln, 12, 17, 1, f0(2 ** P.ln))}${this.slider('p-pue', 'PUE', P.pue, 1.05, 1.6, 0.01, f2(P.pue))}${this.slider('p-u', t('pw.u'), P.u, 0.4, 1, 0.01, f0(P.u * 100) + ' %')}${this.slider('p-pr', t('pw.price'), P.price, 20, 150, 1, '$' + P.price)}
      ${this.accChips()}<header class="lv-sub mono">${t('pw.supply')}</header>${this.chips('sup', Object.keys(SUPPLY), P.supply, (k) => t('sup.' + k))}<p class="small">${t('pw.note')}</p>`;
  }
  pwS() { return `<header class="lv-head mono">${t('pw.read')}</header><div class="bigstats" id="pw-big"></div><canvas class="cv chart" id="cv-co2"></canvas><div class="math mono" id="pw-math"></div><div class="goal" id="pw-goal"></div>`; }
  pwB() { this.bindSliders(this.pw, [['p-n', 'ln', (v) => f0(2 ** v)], ['p-pue', 'pue', f2], ['p-u', 'u', (v) => f0(v * 100) + ' %'], ['p-pr', 'price', (v) => '$' + v]]); this.bindChips('sup', (k) => { this.pw.supply = k; }); }
  pwLive(full) {
    if (!full) return;
    const I = this.pwIn(), R = power(I), X = ACCEL[this.acc], ok = I.n >= 65536 && R.peak <= 150 && R.kt <= 100;
    const b = $('#pw-big'); if (b) b.innerHTML = `<div><b class="mono ${R.peak <= 150 ? 'c-green' : 'c-red'}">${f0(R.peak)} MW</b><small>${t('pw.peak')}</small></div><div><b class="mono">${f0(R.gwh)} GWh</b><small>${t('pw.year')}</small></div><div><b class="mono ${R.kt <= 100 ? 'c-green' : 'c-red'}">${f0(R.kt)} kt</b><small>${t('pw.co2')}</small></div>`;
    const keys = Object.keys(SUPPLY), bars = keys.map((k, i) => ({ x: i, y: (R.gwh * SUPPLY[k].g) / 1000, color: k === I.supply ? '#ffd27a' : 'rgba(88,224,255,.55)', glow: k === I.supply }));
    barChart($('#cv-co2'), { bars, x0: -0.6, x1: keys.length - 0.4, y1: Math.max(150, Math.ceil(Math.max(...bars.map((q) => q.y)) / 100) * 100), w: 0.7, xTicks: keys.map((k, i) => i), xFmt: (i) => t('sup.' + keys[i]).split(' ')[0], yFmt: (y) => f0(y), title: t('pw.chart'), marks: [] });
    const m = $('#pw-math'), S = SUPPLY[I.supply];
    if (m) m.innerHTML = `<div>P<sub>IT</sub> = n × (1.4·TDP + 300 W) = ${f0(I.n)} × ${f2(allIn(X.tdp) / 1000)} kW = <b>${f1(R.it)} MW</b></div>
      <div>P<sub>peak</sub> = P<sub>IT</sub> × PUE = ${f1(R.it)} × ${f2(I.pue)} = <b>${f1(R.peak)} MW</b> · ${t('pw.over')} ${f1(R.overhead)} MW</div>
      <div>E = P<sub>IT</sub>·u·PUE·8760 h = <b>${f0(R.gwh)} GWh/yr</b> ≈ ${f0(R.homes)} ${t('pw.homes')} · $${f1(R.cost / 1e6)} M/yr</div>
      <div>CO₂e = E × ${S.g} g/kWh = <b>${f0(R.kt)} kt/yr</b> · ${t('pw.build')} ${f0(R.nameplate)} MW ${t('pw.cf', { cf: f0(S.cf * 100) })}${R.km2 ? ` ≈ ${f1(R.km2)} km²` : ''}</div>
      <div>${t('pw.firm')}</div>`;
    if (ok) this.done('power');
    const g = $('#pw-goal'); if (g) g.innerHTML = `${badge(this.goal.power)} ${t('goal.power')}`;
  }

  // ═══ 3 · COOL ═══
  clIn() { const C = this.cl; return { mode: C.mode, amb: C.amb, supply: C.supply, rack: C.rack, tdp: ACCEL[this.acc].tdp }; }
  clP() {
    const C = this.cl;
    return `<header class="lv-head mono">${t('cl.title')}</header><p class="intro">${t('cl.intro')}</p>
      <header class="lv-sub mono">${t('cl.mode')}</header>${this.chips('mode', ['air', 'tower', 'dry'], C.mode, (k) => t('mode.' + k))}
      <header class="lv-sub mono">${t('cl.day')}</header>${this.chips('amb', [20, 35, 45], C.amb, (k) => k + ' °C')}
      ${this.slider('c-r', t('cl.rack'), C.rack, 10, 150, 5, C.rack + ' kW')}${C.mode === 'air' ? '' : this.slider('c-s', t('cl.supply'), C.supply, 15, 55, 1, C.supply + ' °C')}
      ${this.accChips()}<p class="small">${t('cl.note')}</p>`;
  }
  clS() { return `<header class="lv-head mono">${t('cl.read')}</header><div class="bigstats" id="cl-big"></div><canvas class="cv chart" id="cv-pue"></canvas><div class="math mono" id="cl-math"></div><div class="goal" id="cl-goal"></div>`; }
  clB() { this.bindSliders(this.cl, [['c-r', 'rack', (v) => v + ' kW'], ['c-s', 'supply', (v) => v + ' °C']]); this.bindChips('mode', (k) => { this.cl.mode = k; }); this.bindChips('amb', (k) => { this.cl.amb = +k; }); }
  clLive(full) {
    if (!full) return;
    const I = this.clIn(), R = cool(I), ok = I.rack >= 100 && I.amb >= 35 && R.pue <= 1.15 && R.wue <= 0.1 && R.chipOK && R.airOK;
    const b = $('#cl-big'); if (b) b.innerHTML = `<div><b class="mono ${R.pue <= 1.15 ? 'c-green' : 'c-red'}">${f2(R.pue)}</b><small>PUE</small></div><div><b class="mono ${R.wue <= 0.1 ? 'c-green' : 'c-amber'}">${f2(R.wue)}</b><small>WUE L/kWh</small></div><div><b class="mono ${R.chipOK ? 'c-green' : 'c-red'}">${f0(R.chip)} °C</b><small>${t('cl.chip')}</small></div>`;
    const pts = [], chip = []; for (let s = 15; s <= 55; s += 0.5) { const q = cool({ ...I, supply: s }); pts.push([s, q.pue]); chip.push([s, 1 + (q.chip / 100) * 0.6]); }
    lineChart($('#cv-pue'), { x0: 15, x1: 55, y0: 1, y1: 1.6, xFmt: (x) => x + ' °C', yFmt: f2, title: t('cl.chart'), series: [{ pts, color: '#58e0ff', label: 'PUE' }, { pts: chip, color: 'rgba(255,106,122,.7)', dash: [4, 3], label: t('cl.chipS') }],
      marks: [{ y: 1.15, color: '#ffd27a', label: '1.15' }, { y: 1 + (T_MAX / 100) * 0.6, color: 'rgba(255,106,122,.6)', label: T_MAX + ' °C' }, ...(I.mode === 'air' ? [] : [{ x: I.supply, color: '#fff' }]), { x: R.sinkT, color: 'rgba(124,255,158,.6)', label: t('cl.free') }] });
    const m = $('#cl-math'), P = R.parts;
    if (m) m.innerHTML = `<div>Q = ṁ·c<sub>p</sub>·ΔT → ${t('cl.airL')} V̇ = 1 kW/(${AIR.rho}·${AIR.cp}·${AIR.dT} K) = <b>${f3(R.airPerKW)} m³/s</b> · ${t('cl.waterL')} <b>${f2(R.wPerKW * 60000)} L/min</b> ${t('cl.perKW')}</div>
      <div>${t('cl.rackL')} ${I.rack} kW → ${t('cl.air')} <b class="${R.airOK ? '' : 'c-red'}">${f0(R.cfm)} CFM</b> (${t('cl.max')} ≈ 5,300) · ${t('cl.water')} <b>${f0(R.lpm)} L/min</b></div>
      <div>${t('cl.fanL')} V̇·Δp/η = ${f1(P.fans * 100)} % · ${t('cl.pumpL')} ${f1(P.pumps * 100)} % · ${t('cl.sinkL')} ${f1(P.sinkFans * 100)} %</div>
      <div>${t('cl.chL')} ${f0(R.chilled * 100)} % · COP = 0.5·T<sub>e</sub>/(T<sub>c</sub>−T<sub>e</sub>) = <b>${f1(R.cop)}</b> → ${f1(P.chiller * 100)} %</div>
      <div>PUE = 1 + ${f2(P.dist + P.misc)} + ${f3(P.fans + P.pumps + P.sinkFans)} + ${f3(P.chiller)} = <b>${f3(R.pue)}</b>${I.mode === 'tower' ? ` · WUE = 3.6/2.43 × 0.85 × 4/3 ≈ <b>${f2(R.wue)} L/kWh</b>` : ''}</div>
      <div>${t('cl.chipL')} ${I.mode === 'air' ? `24 + 0.06 K/W × ${I.tdp} W` : `${I.supply} + 5 + 0.03 K/W × ${I.tdp} W`} = <b>${f0(R.chip)} °C</b> (≤ ${T_MAX})</div>`;
    if (ok) this.done('cool');
    const g = $('#cl-goal'); if (g) g.innerHTML = `${badge(this.goal.cool)} ${t('goal.cool')}`;
  }

  // ═══ 4 · FABRIC ═══
  fbIn() { const F = this.fb; return { n: 2 ** F.ln, gbps: F.gbps, k: F.k, m: F.m, N: 10 ** this.tr.lN, acc: this.acc, mfu: this.tr.mfu }; }
  fbP() {
    const F = this.fb;
    return `<header class="lv-head mono">${t('fb.title')}</header><p class="intro">${t('fb.intro')}</p>
      ${this.slider('f-n', t('fb.n'), F.ln, 10, 17, 1, f0(2 ** F.ln))}
      <header class="lv-sub mono">${t('fb.link')}</header>${this.chips('gbps', [100, 200, 400, 800], F.gbps, (k) => k + ' Gb/s')}
      <header class="lv-sub mono">${t('fb.radix')}</header>${this.chips('k', [32, 64, 128], F.k, (k) => k + ' ' + t('fb.ports'))}
      <header class="lv-sub mono">${t('fb.mp')}</header>${this.chips('mp', [8, 16, 32, 64], F.m, (k) => '×' + k)}
      <p class="small">${t('fb.note', { N: big(10 ** this.tr.lN) })}</p>`;
  }
  fbS() { return `<header class="lv-head mono">${t('fb.read')}</header><div class="bigstats" id="fb-big"></div><canvas class="cv chart" id="cv-eff"></canvas><div class="math mono" id="fb-math"></div><div class="goal" id="fb-goal"></div>`; }
  fbB() { this.bindSliders(this.fb, [['f-n', 'ln', (v) => f0(2 ** v)]]); this.bindChips('gbps', (k) => { this.fb.gbps = +k; }); this.bindChips('k', (k) => { this.fb.k = +k; }); this.bindChips('mp', (k) => { this.fb.m = +k; }); }
  fbLive(full) {
    if (!full) return;
    const I = this.fbIn(), R = fabric(I), ok = I.n >= 65536 && R.eff >= 0.9 && R.t <= 3;
    const b = $('#fb-big'); if (b) b.innerHTML = `<div><b class="mono ${R.eff >= 0.9 ? 'c-green' : 'c-red'}">${f1(R.eff * 100)} %</b><small>${t('fb.eff')}</small></div><div><b class="mono ${R.t <= 3 ? 'c-green' : 'c-red'}">${R.t}</b><small>${t('fb.tiers')}</small></div><div><b class="mono">${f0(R.switches)}</b><small>${t('fb.sw')}</small></div>`;
    const pts = []; for (let l = 10; l <= 17; l += 0.25) pts.push([l, fabric({ ...I, n: 2 ** l }).eff * 100]);
    lineChart($('#cv-eff'), { x0: 10, x1: 17, y0: 0, y1: 100, xTicks: [10, 12, 14, 16, 17], xFmt: (l) => (2 ** l >= 1024 ? f0(2 ** l / 1024) + 'k' : 2 ** l), yFmt: (y) => f0(y) + '%', title: t('fb.chart'), series: [{ pts, color: '#b48cff', label: t('fb.eff') }], marks: [{ y: 90, color: '#ffd27a', label: '90 %' }, { x: 16, color: 'rgba(255,255,255,.35)' }, { dot: [Math.log2(I.n), R.eff * 100], color: '#ff6a7a' }] });
    const m = $('#fb-math');
    if (m) m.innerHTML = `<div>${t('fb.stepL')} t<sub>c</sub> = 6·N·${f0(STEP_TOKENS / 1e6)}M ${t('fb.tok')}/(n·peak·MFU) = <b>${f0(R.tc * 1000)} ms</b></div>
      <div>d = n/m = ${f0(R.d)} · S = 2 B × N/m = <b>${f2(R.S / 1e9)} GB</b> ${t('fb.perGPU')}</div>
      <div>t<sub>AR</sub> = 2(d−1)/d · S/BW + 2(d−1)·α = ${f0(R.tBw * 1000)} + ${f0(R.tLat * 1000)} = <b>${f0(R.tar * 1000)} ms</b> · α = ${f1(R.alpha * 1e6)} µs</div>
      <div>${t('fb.exposed')} max(0, t<sub>AR</sub> − ⅔t<sub>c</sub>) = <b>${f0(R.exposed * 1000)} ms</b> → η = t<sub>c</sub>/(t<sub>c</sub> + exp) = <b>${f1(R.eff * 100)} %</b></div>
      <div>${t('fb.clos')} 2·(k/2)<sup>t</sup> ≥ n → t = <b>${R.t}</b> (${t('fb.cap')} ${f0(R.cap)}) · (2t−1)·n/k = ${f0(R.switches)} ${t('fb.sw')} · ${f0(R.optics)} ${t('fb.optics')} ≈ ${f1(R.opticsMW)} MW</div>`;
    if (ok) this.done('fabric');
    const g = $('#fb-goal'); if (g) g.innerHTML = `${badge(this.goal.fabric)} ${t('goal.fabric')}`;
  }

  // ═══ 5 · OPERATE ═══
  startDay() { this.op.S = newDay(); this.op.ctl = { s: 1, train: true, batt: this.auto ? 'auto' : 'hold' }; this.op.run = true; this.op.alerts = {}; sfx.confirm(); this.caption('cap.day'); this.render(); }
  opP() {
    const O = this.op, c = O.ctl;
    return `<header class="lv-head mono">${t('op.title')}</header><p class="intro">${t('op.intro')}</p>
      <div class="chips"><button class="btn primary" id="o-go">▶ ${O.run || O.S.done ? t('op.again') : t('op.start')}</button><button class="btn seg ${this.auto ? 'active' : ''}" id="o-auto">${t('op.auto')}</button></div>
      ${this.slider('o-s', t('op.clock'), c.s, 0.5, 1, 0.01, f0(c.s * 100) + ' %')}
      <div class="chips"><button class="btn seg ${c.train ? 'active' : ''}" id="o-train">${t('op.train')}: ${c.train ? t('op.on') : t('op.off')}</button></div>
      <header class="lv-sub mono">${t('op.batt')}</header>${this.chips('batt', ['auto', 'hold', 'charge', 'discharge'], c.batt, (k) => t('batt.' + k))}
      <p class="small">${t('op.note')}</p>`;
  }
  opS() { return `<header class="lv-head mono">${t('op.read')}</header><div class="bigstats" id="op-big"></div><div class="meters" id="op-meters"></div><canvas class="cv chart tall" id="cv-day"></canvas><div class="math mono" id="op-math"></div><div class="goal" id="op-goal"></div>`; }
  opB() {
    const O = this.op; $('#o-go').onclick = () => this.startDay(); $('#o-auto').onclick = () => { this.auto = !this.auto; if (this.auto) O.ctl.batt = 'auto'; sfx.select(); this.render(); };
    this.bindSliders(O.ctl, [['o-s', 's', (v) => f0(v * 100) + ' %']], () => { this.auto = false; $('#o-auto')?.classList.remove('active'); });
    $('#o-train').onclick = () => { O.ctl.train = !O.ctl.train; this.auto = false; sfx.select(); this.render(); };
    this.bindChips('batt', (k) => { O.ctl.batt = k; this.auto = false; });
  }
  opTick(dt) {
    const O = this.op, S = O.S; if (!O.run || S.done) return;
    O.acc += dt * O.rate * 60;
    while (O.acc >= 1 && !S.done) {
      O.acc -= 1; if (this.auto) O.ctl = autoCtl(S, O.ctl);
      const n = dayStep(S, O.ctl), A = O.alerts;
      if (n.hot && !A.hot) { A.hot = true; this.app.feed.push('op.throttle', 'bad'); sfx.alarm(); }
      if (!n.hot) A.hot = false;
      if (n.amb > 38 && !A.wave) { A.wave = true; this.app.feed.push('op.wave', 'warn'); this.caption('cap.wave'); }
      if (n.dr && !A.dr) { A.dr = true; this.app.feed.push('op.dr', 'warn'); this.caption('cap.dr'); sfx.warn(); }
      if (!n.dr && A.dr && !A.drEnd && n.h >= 19) { A.drEnd = true; this.app.feed.push(S.drOK ? 'op.drOK' : 'op.drFail', S.drOK ? 'ok' : 'bad'); }
    }
    if (S.done && O.run) { O.run = false; const ok = sla(S) >= 0.995 && S.throttled === 0 && S.drOK; this.app.feed.push(ok ? 'op.win' : 'op.fail', ok ? 'ok' : 'warn'); this.caption(ok ? 'cap.win' : 'cap.fail'); if (ok) this.done('ops'); this.render(); }
    if (this.auto && this.tab === 'ops') { const el = $('#o-s'); if (el && document.activeElement !== el) { el.value = O.ctl.s; $('#o-s-v').textContent = f0(O.ctl.s * 100) + ' %'; } }
  }
  opLive(full) {
    const O = this.op, S = O.S, n = S.now;
    const b = $('#op-big'); if (b) b.innerHTML = `<div><b class="mono">${hh(S.h)}</b><small>${t('op.time')}</small></div><div><b class="mono ${sla(S) >= 0.995 ? 'c-green' : 'c-red'}">${f1(sla(S) * 100)}%</b><small>${t('op.sla')}</small></div><div><b class="mono ${S.throttled ? 'c-red' : 'c-green'}">${f0(S.throttled * 60)} min</b><small>${t('op.thr')}</small></div>`;
    const mt = (label, v, max, txt, c) => `<div class="mt" style="--c:${c}"><span>${label}</span><i><b style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%"></b></i><em>${txt}</em></div>`;
    const M = $('#op-meters');
    if (M) M.innerHTML = n ? mt(t('op.grid'), n.gridMW, OPS.grid, f1(n.gridMW) + ' MW', n.dr && n.gridMW > OPS.dr ? '#ff6a7a' : '#ffd27a') + mt(t('op.chip'), n.chip - 20, 75, f1(n.chip) + ' °C', n.chip > 82 ? '#ff6a7a' : '#7cff9e') + mt(t('op.amb'), n.amb, 50, f1(n.amb) + ' °C', '#ffb347') + mt(t('op.load'), n.dem, 1, f0(n.dem * 100) + ' %', '#58e0ff') + mt(t('op.soc'), S.soc, 1, f0(S.soc * 100) + ' %', '#7cff9e') + mt(t('op.price'), n.price, 200, '$' + n.price, '#b48cff') : `<p class="small">${t('op.ready')}</p>`;
    if (!full) return;
    const H = S.hist;
    lineChart($('#cv-day'), { x0: 0, x1: 24, y0: 0, y1: 100, xTicks: [0, 6, 12, 18, 24], xFmt: (h) => h + 'h', yFmt: (y) => f0(y), title: t('op.chart'), bands: [{ from: 18, to: 19, color: 'rgba(255,106,122,.12)', label: 'DR' }],
      series: [{ pts: H.map((q) => [q[0], q[1]]), color: '#ffd27a', label: 'MW' }, { pts: H.map((q) => [q[0], q[2]]), color: '#ff6a7a', label: t('op.chipS') }, { pts: H.map((q) => [q[0], q[3]]), color: 'rgba(255,179,71,.6)', dash: [4, 3], label: t('op.ambS') }, { pts: H.map((q) => [q[0], q[4]]), color: '#58e0ff', label: t('op.loadS') }],
      marks: [{ y: T_MAX, color: 'rgba(255,106,122,.5)' }, { y: OPS.dr, color: 'rgba(255,210,122,.4)' }] });
    const m = $('#op-math');
    if (m) m.innerHTML = n ? `<div>P<sub>chip</sub> = P<sub>idle</sub> + (TDP − P<sub>idle</sub>)·s³ = 200 + 800 × ${f2(n.s)}³ = <b>${f0(chipW(n.s))} W</b> · ${t('op.thru')} ∝ s = ${f0(n.s * 100)} %</div>
      <div>C·dT/dt = Q<sub>in</sub> − UA(T<sub>loop</sub> − T<sub>amb</sub>) − Q<sub>chiller</sub> · ${t('op.dry')} ${f1(n.qDryMW)} MW · ${t('op.ch')} ${f2(n.chMW)} MW<sub>e</sub></div>
      <div>T<sub>chip</sub> = T<sub>loop</sub> + R·P = ${f1(n.loop)} + ${OPS.R} × ${f0(chipW(n.s))} = <b>${f1(n.chip)} °C</b> · PUE ${f2(n.pue)}</div>
      <div>${t('op.gridL')} ${f1(n.facMW)} − ${t('op.batt')} ${f1(n.bP)} = <b>${f1(n.gridMW)} MW</b> · ${f0(S.mwh)} MWh · $${f0(S.cost)} · ${f0(S.kg / 1000)} t CO₂e</div>` : `<div>${t('op.mathIdle')}</div>`;
    const g = $('#op-goal'); if (g) g.innerHTML = `${badge(this.goal.ops)} ${t('goal.ops')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-0.2, Math.min(1, v.pitch + (e.clientY - v.drag.y) * 0.003)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.4, Math.min(2.5, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) {
    if (this.tab !== 'ops') return; const c = this.op.ctl;
    if (k === 'arrowup' || k === 'arrowdown') { c.s = Math.max(0.5, Math.min(1, Math.round((c.s + (k === 'arrowup' ? 0.05 : -0.05)) * 100) / 100)); this.auto = false; this.render(); }
    if (k === 't') { c.train = !c.train; this.auto = false; this.render(); }
    if (k === 'b') { const L = ['auto', 'hold', 'charge', 'discharge']; c.batt = L[(L.indexOf(c.batt) + 1) % 4]; this.auto = false; this.render(); }
    if (k === ' ') this.startDay();
  }
  keyUp() {}

  // ── Frame ──
  // Per-tab state of the scene: how hot the racks look, how hard the fans spin, how busy the network is.
  sceneState() {
    const tab = this.tab;
    if (tab === 'ops') { const n = this.op.S.now; return n ? { chip: n.chip, heat: n.itMW / 56, fan: n.qDryMW / 50, chill: n.chMW / 0.8, plume: 0, pkt: n.s, soc: this.op.S.soc, hour: n.h } : { chip: 60, heat: 0.4, fan: 0.5, chill: 0, plume: 0, pkt: 0.6, soc: 0.5, hour: 0 }; }
    if (tab === 'cool') { const R = cool(this.clIn()); return { chip: R.chip, heat: 0.4 + this.cl.rack / 150, fan: this.cl.mode === 'air' ? 0.6 : 1, chill: R.chilled, plume: this.cl.mode === 'tower' ? 1 : 0, pkt: 0.5 }; }
    if (tab === 'fabric') { const R = fabric(this.fbIn()); return { chip: 70, heat: 0.6, fan: 0.6, chill: 0, plume: 0, pkt: R.eff, exposed: R.exposed / (R.tc + R.exposed) }; }
    if (tab === 'power') { const R = power(this.pwIn()); return { chip: 68, heat: Math.min(1.2, R.peak / 150), fan: 0.7, chill: 0.2, plume: 0, pkt: 0.6 }; }
    return { chip: 66, heat: 0.7, fan: 0.6, chill: 0.1, plume: 0, pkt: 0.8, train: true };
  }
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, U = this.U, st = this.sceneState();
    this.opTick(dt);
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.05;
    // Rack LED strips: temperature colour, plus a training "wave" rolling down the rows.
    if (((this.fr = (this.fr || 0) + 1) & 1) === 0) {
      const S = U.strips; let i = 0;
      for (const [x, z, r] of U.rackPos) { const T = st.chip + Math.sin(x * 0.7 + r * 1.3) * 3 + (st.train ? 0 : 0); tempColor(T, this.col); if (st.train) { const w = 0.5 + 0.5 * Math.sin(x * 0.25 - time * 4 + r * 0.6); this.col.multiplyScalar(0.55 + 0.9 * w); } else this.col.multiplyScalar(0.9 + 0.2 * Math.sin(time * 3 + i)); S.setColorAt(i++, this.col); }
      S.instanceColor.needsUpdate = true;
    }
    U.rackFront.emissiveIntensity = 0.9 + 0.3 * Math.sin(time * 2.3);
    U.hotM.opacity = 0.05 + 0.13 * Math.min(1.3, st.heat) * (0.85 + 0.15 * Math.sin(time * 5));
    U.fans.forEach((f, i) => (f.rotation.y += dt * (4 + 14 * Math.min(1.2, st.fan)) * (i % 2 ? 1 : -1)));
    U.chillGlow.material.opacity = Math.min(0.9, st.chill * 0.9);
    for (const P of U.plumes) P.pl.forEach((s, k) => { const ph = (time * 0.18 + k / P.pl.length) % 1; s.position.set(P.at.x + Math.sin(k * 3.1 + time * 0.3) * ph * 4, P.at.y + ph * 22, P.at.z + Math.cos(k * 1.7) * ph * 4); s.scale.setScalar(4 + ph * 12); s.material.opacity = st.plume * 0.22 * (1 - ph); });
    U.batt.forEach((b, i) => { const on = (st.soc ?? 0.6) * U.batt.length > i; b.material.color.set(on ? '#7cff9e' : '#33404a'); });
    // Fabric: packets ride the links; red ones are waiting on the network.
    U.fabric.visible = tab === 'fabric';
    if (U.fabric.visible) {
      const P = U.packets.geometry.attributes.position, C = U.packets.geometry.attributes.color, E = U.edges, red = st.exposed ?? 0;
      U.pk.forEach((p, i) => { p.t += dt * p.v * (0.3 + 1.4 * st.pkt) * 0.6; if (p.t > 1) { p.t = 0; p.e = Math.floor(Math.random() * E.length); p.dir = Math.random() < 0.5 ? 1 : -1; } const [a, b] = E[p.e], k = p.dir > 0 ? p.t : 1 - p.t; P.setXYZ(i, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); const isRed = (i % 100) / 100 < red; C.setXYZ(i, isRed ? 1 : 0.35, isRed ? 0.3 : 0.9, isRed ? 0.35 : 1); });
      P.needsUpdate = C.needsUpdate = true; U.links.material.opacity = tab === 'fabric' ? 0.14 : 0.05; U.packets.material.opacity = tab === 'fabric' ? 0.95 : 0.4;
    }
    U.fabLabel.visible = tab === 'fabric'; U.yardLabel.visible = tab === 'cool' || tab === 'ops'; U.subLabel.visible = tab === 'power' || tab === 'ops'; U.hallLabel.visible = tab !== 'train';
    // Sky: night everywhere except the ops day, where the sun crosses the sky.
    const hour = tab === 'ops' ? st.hour ?? 0 : 22, el = Math.sin((Math.PI * (hour - 6)) / 12), day = Math.max(0, Math.min(1, el * 1.6 + 0.1));
    const night = new THREE.Color('#05070c'), noon = new THREE.Color('#7fa6d6'), dusk = new THREE.Color('#d0794a');
    const sky = night.clone().lerp(dusk, Math.max(0, 1 - Math.abs(el) * 3) * (el > -0.3 ? 0.6 : 0)).lerp(noon, day);
    this.scene.background.copy(sky); this.scene.fog.color.copy(sky).multiplyScalar(0.9); this.scene.fog.density = 0.0016 + 0.0008 * (1 - day);
    this.sun.intensity = 0.4 + 2.4 * day; this.sun.color.set(day > 0.3 ? '#fff4e0' : '#9fb8ff'); this.hemi.intensity = 0.3 + 0.9 * day;
    U.stars.material.opacity = 0.8 * (1 - day); U.lamps.forEach((l) => (l.material.opacity = 0.8 * (1 - day)));
    const sa = (Math.PI * (hour - 6)) / 12; this.sun.position.set(Math.cos(sa) * -200, 40 + Math.max(0.1, el) * 200, 80);
    this.app.stage.renderer.toneMappingExposure = 0.85 - 0.25 * day;
    // Cameras.
    let look, off;
    if (tab === 'train') {
      const z = (rowZ(5) + rowZ(6)) / 2, x = -58 + ((time * 1.6) % 44);
      look = V(x + 20 * Math.cos(v.yaw * 0.6), 1.8 + v.pitch * 2, z + 20 * Math.sin(v.yaw * 0.6)); this.cam.position.lerp(V(x, 2.2, z), this.snap ? 1 : Math.min(1, dt * 3));
      this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 4)); this.snap = false; this.cam.lookAt(this.camLook);
    } else {
      if (tab === 'power') { look = V(-95, 9, -10); off = V(-95, 24, 120); }
      else if (tab === 'cool') { look = V(92, 5, 4); off = V(45, 26, 58); }
      else if (tab === 'fabric') { look = V(0, 15, 0); off = V(0, 30, 82); }
      else { look = V(-5, 0, 0); off = V(140, 120, 190); }
      off.applyAxisAngle(V(0, 1, 0), v.yaw).multiplyScalar(v.r); off.y *= 0.7 + v.pitch;
      const cp = look.clone().add(off); this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 3));
      this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 4)); this.snap = false; this.cam.lookAt(this.camLook);
    }
    this.sun.target.position.copy(this.camLook); this.sun.position.add(this.camLook); this.sun.target.updateMatrixWorld();
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'train') this.trLive(full);
    if (this.tab === 'power') this.pwLive(full);
    if (this.tab === 'cool') this.clLive(full);
    if (this.tab === 'fabric') this.fbLive(full);
    if (this.tab === 'ops') this.opLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const rows = TABS.map((k) => [t('rep.' + k), this.goal[k]]);
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-title').textContent = sc === 100 ? t('rep.ready') : t('rep.notReady');
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
void WATER; void DESIGN; void tiersFor; void priceAt; void demandAt; void ambient; void ROWS; void PER;
