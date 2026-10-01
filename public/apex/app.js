import * as THREE from 'three';
import { CAR, COMPOUNDS, DEFAULT_SETUP, aero, topSpeed, mu, pacejka, wheelLoads, gearFor, RHO, G } from './sim/car.js';
import { buildTrack, CORNERS } from './sim/track.js';
import { lapSim, fmtLap } from './sim/lapsim.js';
import { RACE, optimise, planTime } from './sim/strategy.js';
import { buildWorld } from './view/world.js';
import { buildCar, explode } from './view/carmodel.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// APEX · the app: garage setup, lap simulation, tyre science, race strategy.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => Math.round(x).toString(), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const kmh = (v) => v * 3.6;
const clone = (o) => JSON.parse(JSON.stringify(o));
const SLIDERS = [['fw', 0, 12, 1, ''], ['rw', 0, 12, 1, ''], ['ride', 18, 50, 1, ' mm'], ['final', 3.0, 4.4, 0.05, ''], ['bias', 0.5, 0.65, 0.005, ''], ['fuel', 0, 110, 1, ' kg']];

export class Apex {
  constructor(app) {
    this.app = app;
    this.track = buildTrack();
    this.W = buildWorld(this.track); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 9000); this.scene.add(this.cam);
    this.car = buildCar(); this.scene.add(this.car);
    this.setup = clone(DEFAULT_SETUP); this.baseSetup = clone(DEFAULT_SETUP);
    this.lap = lapSim(this.track, this.setup); this.base = this.lap;
    this.play = { t: 0, on: false, cam: 'chase', x: 1 };
    this.view = { yaw: 0.8, pitch: 0.25, r: 9, drag: null, last: 0 };
    this.exploded = 0; this.explodeOn = false;
    this.tyre = { compound: 'medium', Fz: 4000, T: 100 };
    this.strat = null;
    this.score = { setup: false, lap: false, faster: false, explode: false, onboard: false, tyres: false, strategy: false, twostop: false };
    this.tab = 'garage'; this.entered = false; this.uiT = 0; this.uiSlow = 0;
    // Racing line: drift to the inside at apexes (≤ 4.5 m off the centreline).
    const pts = this.track.pts, N = pts.length; this.line = new Float32Array(N);
    for (let i = 0; i < N; i++) { let s = 0; for (let k = -12; k <= 12; k++) s += pts[(i + k + N) % N].k; this.line[i] = 4.5 * Math.tanh((s / 25) * 160); }
    app.stage.use(this.scene, this.cam);
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab === 'strategy' && !this.strat) this.runStrategy();
    if (tab !== 'lap') this.play.on = false;
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { garage: ['garPanel', 'garSide', 'bindGar'], lap: ['lapPanel', 'lapSide', 'bindLap'], tyres: ['tyPanel', 'tySide', 'bindTy'], strategy: ['stPanel', 'stSide', 'bindSt'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  rerun() { this.lap = lapSim(this.track, this.setup); this.strat = null; if (this.lap.T < this.base.T - 0.1) this.score.faster = true; }

  // ═══ GARAGE ════════════════════════════════════════
  garPanel() {
    const S = this.setup;
    return `<header class="lv-head mono">${t('g.title')}</header><p class="intro">${t('g.intro')}</p>
      ${SLIDERS.map(([k, mn, mx, st, u]) => this.slider('s-' + k, t('s.' + k), S[k], mn, mx, st, (k === 'bias' ? f1(S[k] * 100) + ' % F' : k === 'final' ? f2(S[k]) : S[k]) + u)).join('')}
      <header class="lv-sub mono">${t('g.compound')}</header>${this.chips('cmp', Object.keys(COMPOUNDS), S.compound, (k) => `<i class="dot" style="background:${COMPOUNDS[k].color}"></i>${t('c.' + k)}`)}
      <div class="chips"><button class="btn seg" id="g-explode">${this.explodeOn ? t('g.assemble') : t('g.explode')}</button><button class="btn seg" id="g-base">${t('g.baseline')}</button><button class="btn seg" id="g-reset">↺</button></div>
      <button class="btn primary wide" id="g-drive">▶ ${t('g.drive')}</button>`;
  }
  garSide() {
    return `<header class="lv-head mono">${t('g.read')}</header><div class="bigstats" id="g-big"></div><div class="math mono" id="g-math"></div>
      <canvas class="cv chart" id="cv-speed"></canvas><div class="corners mono" id="g-corners"></div>`;
  }
  bindGar() {
    const S = this.setup;
    for (const [k] of SLIDERS) $('#s-' + k).oninput = (e) => { S[k] = +e.target.value; $('#s-' + k + '-v').textContent = (k === 'bias' ? f1(S[k] * 100) + ' % F' : k === 'final' ? f2(S[k]) : S[k]) + (k === 'ride' ? ' mm' : k === 'fuel' ? ' kg' : ''); this.score.setup = true; clearTimeout(this.rt); this.rt = setTimeout(() => { this.rerun(); this.refresh(true); }, 60); };
    document.querySelectorAll('[data-cmp]').forEach((b) => (b.onclick = () => { S.compound = b.dataset.cmp; this.score.setup = true; this.rerun(); sfx.select(); this.render(); }));
    $('#g-explode').onclick = () => { this.explodeOn = !this.explodeOn; this.score.explode = true; sfx.select(); this.render(); if (this.explodeOn) this.caption('cap.explode'); };
    $('#g-base').onclick = () => { this.base = this.lap; this.baseSetup = clone(S); sfx.confirm(); this.refresh(true); };
    $('#g-reset').onclick = () => { this.setup = clone(DEFAULT_SETUP); this.rerun(); this.render(); };
    $('#g-drive').onclick = () => { this.setTab('lap'); this.play.t = 0; this.play.on = true; this.render(); };
  }
  garLive(full) {
    if (!full) return;
    const A = aero(this.setup), L = this.lap, d = L.T - this.base.T, vt = topSpeed(this.setup);
    const big = $('#g-big'); if (big) big.innerHTML = `<div><b class="mono">${fmtLap(L.T)}</b><small>${t('g.lap')}</small></div><div><b class="mono ${d < -0.0005 ? 'c-green' : d > 0.0005 ? 'c-red' : ''}">${d >= 0 ? '+' : '−'}${f3(Math.abs(d))}</b><small>${t('g.delta')}</small></div><div><b class="mono">${f0(kmh(vt))}</b><small>${t('g.vtop')}</small></div>`;
    const m = $('#g-math'), v = 250 / 3.6;
    if (m) m.innerHTML = `<div>C<sub>L</sub>A = <b>${f2(A.CLA)}</b> m² · C<sub>D</sub>A = <b>${f2(A.CDA)}</b> m² · L/D = <b>${f2(A.LD)}</b></div>
      <div>${t('g.df')} ½ρC<sub>L</sub>Av² @250 km/h = <b>${f0((0.5 * RHO * A.CLA * v * v) / G)} kg</b> (${f2((0.5 * RHO * A.CLA * v * v) / ((CAR.mass + this.setup.fuel) * G))}× ${t('g.weight')})</div>
      <div>${t('g.balance')} <b class="${A.front < 0.4 ? 'c-amber' : A.front > 0.47 ? 'c-amber' : 'c-green'}">${f1(A.front * 100)} % F</b> ${A.front < 0.4 ? t('g.under') : A.front > 0.47 ? t('g.over') : t('g.neutral')}</div>
      <div>${t('g.ground')} <b>${f2(A.ge)}</b>${A.porpoise ? ` · <b class="c-red">${t('g.porpoise')}</b>` : ''} · P = η·735 kW = ½ρC<sub>D</sub>Av³ + C<sub>rr</sub>mgv → <b>${f0(kmh(vt))} km/h</b></div>
      <div>${t('g.limits')} ${['corner', 'power', 'brake'].map((k) => `${t('lim.' + k)} <b>${f0((100 * L.trace.filter((p) => p.lim === k).length) / L.trace.length)}%</b>`).join(' · ')}</div>`;
    lineChart($('#cv-speed'), { x0: 0, x1: this.track.L, y0: 50, y1: 340, xTicks: [0, 1000, 2000, 3000, 4000], xFmt: (x) => (x / 1000).toFixed(0) + ' km', yFmt: (y) => Math.round(y), title: t('g.speedChart'),
      series: [{ pts: this.base.trace.filter((_, i) => i % 3 === 0).map((p) => [p.s, kmh(p.v)]), color: 'rgba(160,170,190,.55)', label: t('g.base'), width: 1.2 }, { pts: L.trace.filter((_, i) => i % 3 === 0).map((p) => [p.s, kmh(p.v)]), color: '#ff2f4e', label: t('g.now') }] });
    const c = $('#g-corners'); if (c) c.innerHTML = CORNERS.map((k) => { const p = L.trace[k.i], b = this.base.trace[k.i]; return `<span><b>${k.n}</b> R${f0(k.R)} · ${f0(kmh(p.v))} <em class="${p.v > b.v + 0.3 ? 'c-green' : p.v < b.v - 0.3 ? 'c-red' : ''}">${p.v >= b.v ? '+' : ''}${f0(kmh(p.v - b.v))}</em></span>`; }).join('');
  }

  // ═══ LAP ═══════════════════════════════════════════
  lapPanel() {
    const P = this.play;
    return `<header class="lv-head mono">${t('l.title')}</header><p class="intro">${t('l.intro')}</p>
      <div class="chips"><button class="btn primary" id="l-play">${P.on ? '❚❚ ' + t('l.pause') : '▶ ' + t('l.play')}</button><button class="btn seg" id="l-restart">↺</button></div>
      <header class="lv-sub mono">${t('l.camera')}</header>${this.chips('cam', ['chase', 'onboard', 'tv', 'heli'], P.cam, (k) => t('cam.' + k))}
      <header class="lv-sub mono">${t('l.speedx')}</header>${this.chips('px', ['0.5', '1', '2', '4'], String(P.x), (k) => k + '×')}
      <div class="math mono" id="l-math"></div>`;
  }
  lapSide() {
    return `<header class="lv-head mono">${t('l.tele')}</header><canvas class="cv chart" id="cv-tel"></canvas><canvas class="cv gg" id="cv-gg"></canvas>
      <header class="lv-sub mono">${t('l.loads')}</header><div class="loads" id="l-loads"></div>`;
  }
  bindLap() {
    $('#l-play').onclick = () => { this.play.on = !this.play.on; this.score.lap = true; sfx.select(); this.render(); };
    $('#l-restart').onclick = () => { this.play.t = 0; this.render(); };
    document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => { this.play.cam = b.dataset.cam; if (this.play.cam === 'onboard') this.score.onboard = true; sfx.select(); this.render(); }));
    document.querySelectorAll('[data-px]').forEach((b) => (b.onclick = () => { this.play.x = +b.dataset.px; this.render(); }));
  }
  // Interpolated telemetry at lap time tt.
  sampleAt(tt) {
    const tr = this.lap.trace; let lo = 0, hi = tr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid].t <= tt) lo = mid; else hi = mid; }
    const a = tr[lo], b = tr[(lo + 1) % tr.length], dt = (b.t > a.t ? b.t - a.t : this.lap.T - a.t) || 1e-6, u = Math.min(1, Math.max(0, (tt - a.t) / dt));
    return { i: lo, u, v: a.v + (b.v - a.v) * u, s: a.s + (this.track.L / this.track.N) * u, ax: a.ax, ay: a.ay, gear: a.gear, rpm: a.rpm, thr: a.thr, brk: a.brk, lim: a.lim };
  }
  lapLive(full) {
    const p = this.sampleAt(this.play.t), loads = wheelLoads(this.setup, p.v, p.ax, p.ay);
    // HUD.
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#h-speed', f0(kmh(p.v))); set('#h-gear', p.gear); set('#h-lap', fmtLap(this.play.t));
    const bt = this.base.trace, bi = bt[Math.min(bt.length - 1, p.i)], bn = bt[(p.i + 1) % bt.length], dl = this.play.t - (bi.t + ((bn.t > bi.t ? bn.t : this.base.T) - bi.t) * p.u);
    const dEl = $('#h-delta'); if (dEl) { dEl.textContent = `${dl >= 0 ? '+' : '−'}${f3(Math.abs(dl))}`; dEl.className = 'mono ' + (dl <= 0 ? 'c-green' : 'c-red'); }
    const rpm = $('#h-rpm'); if (rpm) rpm.style.width = `${Math.min(100, (p.rpm / 12500) * 100)}%`;
    const th = $('#h-thr'), br = $('#h-brk'); if (th) th.style.height = `${p.thr * 100}%`; if (br) br.style.height = `${p.brk * 100}%`;
    this.drawGG($('#h-gg'), p, true); this.drawMap(p);
    if (!full) return;
    const m = $('#l-math');
    if (m) m.innerHTML = `<div>${t('l.at')} <b>${f0(p.s)} m</b> · v = <b>${f0(kmh(p.v))} km/h</b> · ${t('l.gear')} <b>${p.gear}</b> @ ${f0(p.rpm)} rpm</div>
      <div>a<sub>x</sub> = <b>${f2(p.ax / G)} g</b> · a<sub>y</sub> = v²κ = <b>${f2(Math.abs(p.ay) / G)} g</b> · ${t('l.limit')} <b>${t('lim.' + p.lim)}</b></div>
      <div>${t('g.df')} <b>${f0(loads.df / G)} kg</b> · ΔF<sub>z,long</sub> = m·a<sub>x</sub>·h/L = <b>${f0((CAR.mass + this.setup.fuel) * p.ax * CAR.h / CAR.L)} N</b></div>
      <div>v<sub>corner</sub>² = μmg / (m|κ| − μ·½ρC<sub>L</sub>A)</div>`;
    const ld = $('#l-loads'); if (ld) ld.innerHTML = ['FL', 'FR', 'RL', 'RR'].map((k) => `<div class="ld"><span>${k}</span><i style="height:${Math.min(100, (loads[k] / 9000) * 100)}%"></i><b class="mono">${f0(loads[k] / G)}</b></div>`).join('');
    const tr = this.lap.trace;
    lineChart($('#cv-tel'), { x0: 0, x1: this.track.L, y0: 0, y1: 340, xTicks: [0, 1000, 2000, 3000, 4000], xFmt: (x) => (x / 1000).toFixed(0) + ' km', yFmt: (y) => Math.round(y), title: t('l.telChart'),
      series: [{ pts: tr.filter((_, i) => i % 3 === 0).map((q) => [q.s, q.thr * 100]), color: 'rgba(93,255,168,.55)', label: t('l.thr'), width: 1 }, { pts: tr.filter((_, i) => i % 3 === 0).map((q) => [q.s, q.brk * 100]), color: 'rgba(255,68,102,.7)', label: t('l.brk'), width: 1 }, { pts: tr.filter((_, i) => i % 3 === 0).map((q) => [q.s, kmh(q.v)]), color: '#e8eefc', label: 'km/h' }],
      marks: [{ x: p.s, color: '#ff2f4e' }] });
    this.drawGG($('#cv-gg'), p, false);
  }
  // g-g diagram: every point of the lap plus the friction circle at this speed.
  drawGG(cv, p, mini) {
    if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height, cx = W / 2, cy = H / 2, sc = Math.min(W, H) / 2 / 6.5;
    g.clearRect(0, 0, W, H); if (!mini) { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, W, H); }
    g.strokeStyle = 'rgba(141,151,179,.25)'; for (const k of [2, 4, 6]) { g.beginPath(); g.arc(cx, cy, k * sc, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - 6 * sc, cy); g.lineTo(cx + 6 * sc, cy); g.moveTo(cx, cy - 6 * sc); g.lineTo(cx, cy + 6 * sc); g.stroke();
    if (!mini) { g.fillStyle = 'rgba(255,47,78,.35)'; for (let i = 0; i < this.lap.trace.length; i += 2) { const q = this.lap.trace[i]; g.fillRect(cx + (q.ay / G) * sc - 1, cy - (q.ax / G) * sc - 1, 2, 2); } }
    const A = aero(this.setup), N_ = (CAR.mass + this.setup.fuel) * G + 0.5 * RHO * A.CLA * p.v * p.v, lim = (mu(this.setup.compound, N_ / 4) * N_) / ((CAR.mass + this.setup.fuel) * G);
    g.strokeStyle = '#22e6ff'; g.setLineDash([3, 3]); g.beginPath(); g.arc(cx, cy, lim * sc, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fff'; g.shadowColor = '#ff2f4e'; g.shadowBlur = 10; g.beginPath(); g.arc(cx + (p.ay / G) * sc, cy - (p.ax / G) * sc, mini ? 4 : 5, 0, 7); g.fill(); g.shadowBlur = 0;
    g.fillStyle = 'rgba(232,238,252,.7)'; g.font = '9px "JetBrains Mono", monospace'; if (!mini) { g.fillText(t('l.gg'), 6, 12); g.fillText('6 g', cx + 6 * sc - 18, cy - 4); }
  }
  drawMap(p) {
    const cv = $('#h-map'); if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, P = this.track.pts;
    if (!this.mapBox) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of P) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); } this.mapBox = { x0, x1, z0, z1 }; }
    const B = this.mapBox, k = Math.min((W - 12) / (B.x1 - B.x0), (H - 12) / (B.z1 - B.z0)), X = (x) => 6 + (x - B.x0) * k, Y = (z) => H - 6 - (z - B.z0) * k;
    g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(232,238,252,.55)'; g.lineWidth = 2; g.beginPath(); P.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.z)) : g.moveTo(X(q.x), Y(q.z)))); g.closePath(); g.stroke();
    const q = P[p.i]; g.fillStyle = '#ff2f4e'; g.beginPath(); g.arc(X(q.x), Y(q.z), 4, 0, 7); g.fill();
  }

  // ═══ TYRES ═════════════════════════════════════════
  tyPanel() {
    const T = this.tyre;
    return `<header class="lv-head mono">${t('t.title')}</header><p class="intro">${t('t.intro')}</p>
      ${this.chips('tc', Object.keys(COMPOUNDS), T.compound, (k) => `<i class="dot" style="background:${COMPOUNDS[k].color}"></i>${t('c.' + k)}`)}
      ${this.slider('t-fz', t('t.load'), T.Fz, 1500, 9000, 50, f0(T.Fz) + ' N')}
      ${this.slider('t-T', t('t.temp'), T.T, 40, 140, 1, f0(T.T) + ' °C')}
      <div class="math mono" id="t-math"></div>`;
  }
  tySide() { return `<header class="lv-head mono">${t('t.curves')}</header><canvas class="cv chart" id="cv-lat"></canvas><canvas class="cv chart" id="cv-long"></canvas><canvas class="cv chart" id="cv-temp"></canvas><canvas class="cv chart" id="cv-deg"></canvas>`; }
  bindTy() {
    const T = this.tyre;
    document.querySelectorAll('[data-tc]').forEach((b) => (b.onclick = () => { T.compound = b.dataset.tc; this.score.tyres = true; sfx.select(); this.render(); }));
    $('#t-fz').oninput = (e) => { T.Fz = +e.target.value; $('#t-fz-v').textContent = f0(T.Fz) + ' N'; this.score.tyres = true; this.refresh(true); };
    $('#t-T').oninput = (e) => { T.T = +e.target.value; $('#t-T-v').textContent = f0(T.T) + ' °C'; this.score.tyres = true; this.refresh(true); };
  }
  tyLive(full) {
    if (!full) return;
    const T = this.tyre, c = COMPOUNDS[T.compound], m = mu(T.compound, T.Fz, T.T), D = m * T.Fz;
    const el = $('#t-math');
    if (el) el.innerHTML = `<div>F = D·sin(C·atan(B·x − E·(B·x − atan(B·x)))) · D = μ·F<sub>z</sub></div>
      <div>μ = μ₀·(1 − 0.08·(F<sub>z</sub>/F<sub>z0</sub> − 1))·(0.65 + 0.35·e^(−½((T − ${c.Topt})/${c.w})²)) = <b>${f3(m)}</b></div>
      <div>${t('t.peakF')} D = <b>${f0(D)} N</b> · ${t('t.ratio')} D/F<sub>z</sub> = <b>${f2(D / T.Fz)}</b> — ${t('t.loadNote')}</div>
      <div>${t('t.window')} <b>${c.Topt} ± ${c.w} °C</b> · ${t('t.deg')} <b>${c.deg} s/${t('t.lap')}</b> · ${t('t.cliff')} <b>${c.cliff} ${t('t.laps')}</b></div>`;
    const lat = (Fz) => { const D2 = mu(T.compound, Fz, T.T) * Fz, pts = []; for (let a = 0; a <= 15; a += 0.25) pts.push([a, pacejka((a * Math.PI) / 180, D2, 'lat')]); return pts; };
    lineChart($('#cv-lat'), { x0: 0, x1: 15, y0: 0, y1: 16000, xFmt: (x) => x + '°', yFmt: (y) => (y / 1000).toFixed(0) + 'k', title: t('t.latChart'), series: [{ pts: lat(2500), color: 'rgba(127,232,255,.7)', label: '2.5 kN' }, { pts: lat(T.Fz), color: '#ff2f4e', label: f1(T.Fz / 1000) + ' kN' }, { pts: lat(8000), color: 'rgba(255,184,107,.8)', label: '8 kN' }] });
    const lp = []; for (let s = 0; s <= 0.3; s += 0.005) lp.push([s * 100, pacejka(s, D, 'long')]);
    lineChart($('#cv-long'), { x0: 0, x1: 30, y0: 0, y1: Math.max(8000, D * 1.15), xFmt: (x) => x + '%', yFmt: (y) => (y / 1000).toFixed(0) + 'k', title: t('t.longChart'), series: [{ pts: lp, color: '#5dffa8', label: 'F_x' }] });
    lineChart($('#cv-temp'), { x0: 40, x1: 140, y0: 1.0, y1: 2.05, xFmt: (x) => x + '°', yFmt: (y) => y.toFixed(1), title: t('t.tempChart'), series: Object.keys(COMPOUNDS).map((k) => { const pts = []; for (let Tt = 40; Tt <= 140; Tt += 2) pts.push([Tt, mu(k, 4000, Tt)]); return { pts, color: COMPOUNDS[k].color, label: t('c.' + k), width: k === T.compound ? 2.4 : 1.2 }; }), marks: [{ x: T.T, color: '#fff' }] });
    lineChart($('#cv-deg'), { x0: 0, x1: 45, y0: -1, y1: 6, xFmt: (x) => x, yFmt: (y) => (y >= 0 ? '+' : '') + y.toFixed(0) + 's', title: t('t.degChart'), series: ['soft', 'medium', 'hard'].map((k) => { const c2 = COMPOUNDS[k], pts = []; for (let a = 0; a <= 45; a++) pts.push([a, c2.delta + c2.deg * a + (a > c2.cliff ? 0.06 * (a - c2.cliff) ** 1.6 : 0)]); return { pts, color: c2.color, label: t('c.' + k) }; }) });
  }

  // ═══ STRATEGY ══════════════════════════════════════
  runStrategy() { const dry = { ...this.setup, compound: 'medium', fuel: 50 }; this.stratBase = lapSim(this.track, dry).T; this.strat = optimise(this.stratBase); this.score.strategy = true; }
  stPanel() {
    return `<header class="lv-head mono">${t('st.title')}</header><p class="intro">${t('st.intro')}</p>
      ${this.slider('st-laps', t('st.laps'), RACE.laps, 30, 70, 1, RACE.laps)}${this.slider('st-pit', t('st.pit'), RACE.pitLoss, 15, 30, 0.1, f1(RACE.pitLoss) + ' s')}
      <button class="btn primary wide" id="st-run">${t('st.run')}</button><div class="plans" id="st-plans"></div>`;
  }
  stSide() { return `<header class="lv-head mono">${t('st.race')}</header><canvas class="cv chart tall" id="cv-laps"></canvas><canvas class="cv chart" id="cv-gap"></canvas><div class="math mono" id="st-math"></div>`; }
  bindSt() {
    $('#st-laps').oninput = (e) => { RACE.laps = +e.target.value; $('#st-laps-v').textContent = RACE.laps; };
    $('#st-pit').oninput = (e) => { RACE.pitLoss = +e.target.value; $('#st-pit-v').textContent = f1(RACE.pitLoss) + ' s'; };
    $('#st-run').onclick = () => { this.runStrategy(); sfx.confirm(); this.refresh(true); };
  }
  stLive(full) {
    if (!full || !this.strat) return;
    const S = this.strat, best = S[1].T <= S[2].T ? 1 : 2; if (best === 2) this.score.twostop = true;
    const fmtRace = (T) => `${Math.floor(T / 3600)}:${String(Math.floor((T % 3600) / 60)).padStart(2, '0')}:${(T % 60).toFixed(1).padStart(4, '0')}`;
    const pl = $('#st-plans');
    if (pl) pl.innerHTML = [1, 2].map((k) => `<div class="plan ${k === best ? 'best' : ''}"><b>${t('st.stop' + k)}</b> <span class="mono">${fmtRace(S[k].T)} ${k !== best ? `(+${f1(S[k].T - S[best].T)} s)` : '★'}</span><div class="stints">${S[k].plan.map((p) => `<i style="flex:${p.n};background:${COMPOUNDS[p.c].color}" title="${t('c.' + p.c)} ${p.n}"><em>${t('c.' + p.c)[0]} ${p.n}</em></i>`).join('')}</div></div>`).join('');
    const ser = [1, 2].map((k) => ({ pts: S[k].laps.map((l) => [l.lap, Math.min(this.stratBase + 30, l.t)]), color: k === 1 ? '#ffd23f' : '#ff2f4e', label: t('st.stop' + k), width: k === best ? 2 : 1.2 }));
    lineChart($('#cv-laps'), { x0: 1, x1: RACE.laps, y0: this.stratBase - 3, y1: this.stratBase + 5, xFmt: (x) => Math.round(x), yFmt: (y) => fmtLap(y), title: t('st.lapChart'), series: ser });
    let c1 = 0, c2 = 0; const gap = S[1].laps.map((l, i) => { c1 += l.t; c2 += S[2].laps[i]?.t ?? 0; return [l.lap, c1 - c2]; });
    lineChart($('#cv-gap'), { x0: 1, x1: RACE.laps, y0: Math.min(-25, ...gap.map((g) => g[1])), y1: Math.max(25, ...gap.map((g) => g[1])), xFmt: (x) => Math.round(x), yFmt: (y) => f0(y) + 's', title: t('st.gapChart'), series: [{ pts: gap, color: '#22e6ff', label: t('st.gap') }], marks: [{ y: 0, color: 'rgba(232,238,252,.4)' }] });
    const m = $('#st-math');
    if (m) m.innerHTML = `<div>t = t<sub>base</sub> + Δ<sub>c</sub> + d·a + 0.06·max(0, a − a<sub>cliff</sub>)<sup>1.6</sup> + ${RACE.kFuel}·(f − 50)</div><div>t<sub>base</sub> = <b>${fmtLap(this.stratBase)}</b> · ${t('st.fuel')} ${RACE.fuelStart} kg − ${RACE.burn} kg/${t('t.lap')} · ${t('st.pitLoss')} <b>${f1(RACE.pitLoss)} s</b></div><div class="small">${t('st.why')}</div>`;
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.1, Math.min(1.3, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(4, Math.min(40, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === ' ' && this.tab === 'lap') $('#l-play')?.click(); if (k === 'c' && this.tab === 'lap') { const L = ['chase', 'onboard', 'tv', 'heli']; this.play.cam = L[(L.indexOf(this.play.cam) + 1) % 4]; if (this.play.cam === 'onboard') this.score.onboard = true; this.render(); } }

  update(dt, time) {
    const tab = this.tab, v = this.view, car = this.car, pts = this.track.pts, N = pts.length;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.15;
    this.exploded += ((this.explodeOn && tab === 'garage' ? 1 : 0) - this.exploded) * Math.min(1, dt * 3);
    explode(car, this.exploded);
    // Wheel band colour = compound; wing elements follow the setup angles.
    const cc = new THREE.Color(COMPOUNDS[tab === 'tyres' ? this.tyre.compound : this.setup.compound].color);
    for (const w of car.userData.wheels) w.band.material.color.copy(cc);
    car.userData.fw.userData.flaps.forEach((f, i) => (f.rotation.x = -0.05 - i * 0.05 - this.setup.fw * 0.025));
    car.userData.rw.userData.main.rotation.x = 0.05 + this.setup.rw * 0.03; car.userData.rw.userData.flap.rotation.x = 0.2 + this.setup.rw * 0.05;
    car.userData.rain.material.color.setRGB(1, 0.06, 0.18).multiplyScalar(0.4 + 0.6 * (Math.sin(time * 12) > 0 ? 1 : 0));
    if (tab === 'lap') {
      const P = this.play; if (P.on) { P.t += dt * P.x; if (P.t >= this.lap.T) { P.t -= this.lap.T; this.score.lap = true; this.app.feed.push('l.lapDone', 'ok', { t: fmtLap(this.lap.T) }); } }
      const s = this.sampleAt(P.t), i = s.i, j = (i + 1) % N, a = pts[i], b = pts[j], u = s.u;
      const off = this.line[i] + (this.line[j] - this.line[i]) * u, psi = a.psi + Math.atan2(Math.sin(b.psi - a.psi), Math.cos(b.psi - a.psi)) * u;
      const nx = -Math.sin(psi), nz = Math.cos(psi), x = a.x + (b.x - a.x) * u + nx * off, z = a.z + (b.z - a.z) * u + nz * off, y = a.y + (b.y - a.y) * u;
      car.position.set(x, y, z); car.rotation.set(-0.012 * s.ax / G, -psi + Math.PI / 2, 0.01 * s.ay / G);
      for (const w of car.userData.wheels) { w.spokes.rotation.x -= (s.v / 0.36) * dt * P.x * (P.on ? 1 : 0); w.g.rotation.y = w.name[0] === 'F' ? Math.atan(3.6 * a.k) * 1.2 : 0; }
      const fwd = new THREE.Vector3(Math.cos(psi), 0, Math.sin(psi));
      if (P.cam === 'chase') { this.cam.position.set(x - fwd.x * 11, y + 3.4, z - fwd.z * 11); this.cam.lookAt(x + fwd.x * 6, y + 0.8, z + fwd.z * 6); this.cam.fov = 58; }
      else if (P.cam === 'onboard') { this.cam.position.set(x - fwd.x * 0.05, y + 1.18, z - fwd.z * 0.05); this.cam.lookAt(x + fwd.x * 20, y + 0.6, z + fwd.z * 20); this.cam.fov = 75; }
      else if (P.cam === 'tv') { const ci = Math.floor(i / 120) * 120 + 60, c = pts[ci % N], sd = Math.sign(c.k || this.line[ci % N] || 1), cnx = -Math.sin(c.psi) * sd, cnz = Math.cos(c.psi) * sd; this.cam.position.set(c.x + cnx * 9.5, c.y + 3.2, c.z + cnz * 9.5); this.cam.lookAt(x, y + 0.6, z); const dd = Math.hypot(this.cam.position.x - x, this.cam.position.z - z); this.cam.fov = Math.max(6, Math.min(45, 2 * Math.atan(9 / dd) * 180 / Math.PI)); }
      else { this.cam.position.set(x - fwd.x * 70 + 40, y + 70, z - fwd.z * 70 + 40); this.cam.lookAt(x, y, z); this.cam.fov = 45; }
    } else if (tab === 'strategy') {
      if (!this.mapBox) this.drawMap(this.sampleAt(0));
      const B = this.mapBox, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, r = 0.75 * Math.max(B.x1 - B.x0, B.z1 - B.z0); this.cam.position.set(cx + Math.sin(v.yaw * 0.3) * 0.5 * r, 2.2 * r, cz + Math.cos(v.yaw * 0.3) * 0.5 * r); this.cam.lookAt(cx, 0, cz); this.cam.fov = 50;
      const s = this.sampleAt((time * 4) % this.lap.T), a = pts[s.i]; car.position.set(a.x, a.y, a.z); car.rotation.set(0, -a.psi + Math.PI / 2, 0); car.scale.setScalar(10);
    } else {
      // Garage turntable.
      const Gp = this.W.garage.position; car.scale.setScalar(1); car.position.set(Gp.x, 0.1, Gp.z); car.rotation.set(0, time * 0.12, 0); this.W.turntable.rotation.y = time * 0.12;
      for (const w of car.userData.wheels) w.g.rotation.y = 0;
      const r = tab === 'tyres' ? Math.max(3.2, v.r * 0.45) : v.r, look = tab === 'tyres' ? new THREE.Vector3(Gp.x, 0.4, Gp.z) : new THREE.Vector3(Gp.x, 0.6, Gp.z);
      if (tab === 'tyres') { const wl = new THREE.Vector3(); car.userData.wheels[0].g.getWorldPosition(wl); look.copy(wl); }
      this.cam.position.set(look.x + Math.sin(v.yaw) * Math.cos(v.pitch) * r, look.y + Math.sin(v.pitch) * r + 0.3, look.z + Math.cos(v.yaw) * Math.cos(v.pitch) * r);
      this.cam.lookAt(look); this.cam.fov = 40;
    }
    if (tab !== 'strategy') car.scale.setScalar(1);
    this.W.trackGlow.visible = tab === 'strategy'; this.scene.fog.density = tab === 'strategy' ? 0.0002 : 0.0011;
    // Start lights pulse on the gantry.
    this.W.lights.forEach((l, i) => l.material.color.set((time % 6) > i * 0.6 && (time % 6) < 3.4 ? '#ff1030' : '#2a0006'));
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; this.uiSlow += dt;
    if (this.uiT > 0.06) { this.uiT = 0; const full = this.uiSlow > 0.35; if (full) this.uiSlow = 0; this.refresh(full); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'garage') this.garLive(full);
    if (this.tab === 'lap') this.lapLive(full);
    if (this.tab === 'tyres') this.tyLive(full);
    if (this.tab === 'strategy') this.stLive(full);
  }

  showReport() {
    const S = this.score, d = this.lap.T - this.base.T;
    const rows = [[t('rep.setup'), S.setup], [t('rep.lap'), S.lap], [t('rep.faster', { d: f3(Math.abs(Math.min(0, this.lap.T - lapSim(this.track, DEFAULT_SETUP).T))) }), S.faster], [t('rep.explode'), S.explode], [t('rep.onboard'), S.onboard], [t('rep.tyres'), S.tyres], [t('rep.strategy'), S.strategy], [t('rep.twostop'), S.twostop]];
    void d;
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US'), lap: fmtLap(this.lap.T) });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
export { gearFor, planTime };
