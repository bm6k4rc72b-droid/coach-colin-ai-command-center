import * as THREE from 'three';
import { G, kB, g0, Msun, KPC, MW, vcirc, OBS, galYear, atmo, PLACES, place, mfp, boil, sunT, CMB, MAT, potato, BODIES, body, pitchIllusion, gif, SPACEFLIGHT, arrival, WORLDS, catchTrial } from './sim/cosmos.js';
import { buildStations, spinGalaxy } from './view/stations.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// VOIDFRAME · the app. From the scale of a galaxy down to the hair cells in your inner ear: what holds a galaxy
// together, what the vacuum really is, how gravity sculpts worlds, how your body measures gravity, and how
// your brain builds its own physics engine.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const sci = (x, d = 2) => { if (!Number.isFinite(x)) return '∞'; if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return Math.abs(e) < 4 ? (Math.abs(x) >= 100 ? f0(x) : x.toPrecision(3)) : `${m.toFixed(d)}×10<sup>${e}</sup>`; };
const len = (m) => (m < 1e-3 ? sci(m * 1e9, 1) + ' nm' : m < 1 ? f1(m * 1000) + ' mm' : m < 1000 ? f1(m) + ' m' : m < 1.496e11 * 0.5 ? sci(m / 1000, 2) + ' km' : sci(m / 1.496e11, 2) + ' AU');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['galaxy', 'vacuum', 'gravity', 'body', 'perception'];
const CENTER = { galaxy: V(0, 0, 0), vacuum: V(0, 0, -2000), gravity: V(0, 0, -4000), body: V(0, 2, -6000), perception: V(6, -1, -8000) };

export class Void {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.background = new THREE.Color('#020208');
    this.cam = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 4000); scene.add(this.cam);
    this.key = new THREE.DirectionalLight('#fff2e0', 1.3); this.key.position.set(30, 40, 20); scene.add(this.key, this.key.target); scene.add(new THREE.HemisphereLight('#8aa0ff', '#140a10', 0.45));
    this.S = buildStations(scene);
    this.gx = { dm: 0 };
    this.vc = { lh: 0, beyond: null };
    this.gr = { lR: Math.log10(150), mat: 'rock' };
    this.bd = { a: 0, world: 'earth' };
    this.pc = { world: 'moon', gm: 9.81, h: 1.5, adapt: true, trials: [], anim: null, wins: 0 };
    this.goal = { galaxy: false, vacuum: false, gravity: false, body: false, perception: false };
    this.view = { yaw: 0.5, pitch: 0.45, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'galaxy'; this.entered = false; this.uiT = 0; this.time = 0;
    app.stage.use(scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const el = $('#caption'); if (!el) return; el.textContent = t(key, vars); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  facts(prefix, n) { return `<details class="ledger" open><summary>${t('facts')}</summary><ul class="facts">${[...Array(n)].map((_, i) => `<li>${t(prefix + (i + 1))}</li>`).join('')}</ul></details>`; }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab;
    Object.assign(this.view, { yaw: { galaxy: 0.5, vacuum: 0.15, gravity: 0.6, body: 0.55, perception: 0.25 }[tab], pitch: { galaxy: 0.55, vacuum: 0.15, gravity: 0.2, body: 0.2, perception: 0.1 }[tab], r: 1 }); this.snap = true;
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { galaxy: 'gx', vacuum: 'vc', gravity: 'gr', body: 'bd', perception: 'pc' }[this.tab]; $('#panel').innerHTML = this[P + 'P'](); $('#side').innerHTML = this[P + 'S'](); this[P + 'B'](); this.refresh(true); }

  // ═══ 1 · GALAXY ═══
  gxP() { return `<header class="lv-head mono">${t('gx.title')}</header><p class="intro">${t('gx.intro')}</p>${this.slider('g-dm', t('gx.dm'), this.gx.dm, 0, 1.6, 0.01, f0(this.gx.dm * 100) + ' %')}${this.facts('gx.f', 5)}`; }
  gxS() { return `<header class="lv-head mono">${t('gx.read')}</header><div class="bigstats" id="gx-big"></div><canvas class="cv chart tall" id="cv-rot"></canvas><div class="math mono" id="gx-math"></div><div class="goal" id="gx-goal"></div>`; }
  gxB() { this.bindSliders(this.gx, [['g-dm', 'dm', (v) => f0(v * 100) + ' %']]); }
  gxLive(full) {
    if (!full) return;
    const f = this.gx.dm, vs = vcirc(MW.sun, f), v20 = vcirc(20, f), ok = Math.abs(vs.v - 230) <= 8 && Math.abs(v20.v - 218) <= 15;
    const b = $('#gx-big'); if (b) b.innerHTML = `<div><b class="mono ${Math.abs(vs.v - 230) <= 8 ? 'c-green' : 'c-amber'}">${f0(vs.v)} km/s</b><small>${t('gx.vsun')}</small></div><div><b class="mono">${f0(galYear(MW.sun, vs.v))} Myr</b><small>${t('gx.year')}</small></div><div><b class="mono">${f0(v20.v)} km/s</b><small>${t('gx.v20')}</small></div>`;
    const tot = [], vis = [], halo = []; for (let r = 0.3; r <= 25; r += 0.2) { const q = vcirc(r, f); tot.push([r, q.v]); vis.push([r, q.vis]); halo.push([r, Math.sqrt(f) * q.halo]); }
    lineChart($('#cv-rot'), { x0: 0, x1: 25, y0: 0, y1: 300, xFmt: (x) => f0(x) + ' kpc', yFmt: (y) => f0(y), title: t('gx.chart'), series: [{ pts: tot, color: '#ffd27a', label: t('gx.total') }, { pts: vis, color: '#7fd0ff', dash: [4, 3], label: t('gx.visible') }, { pts: halo, color: 'rgba(160,120,255,.8)', dash: [2, 3], label: t('gx.halo') }], marks: OBS.map(([r, v]) => ({ dot: [r, v], color: '#ff6a7a' })).concat([{ x: MW.sun, color: 'rgba(255,210,122,.5)', label: '☉' }]) });
    const m = $('#gx-math'), Menc = ((vs.v * 1e3) ** 2 * MW.sun * KPC) / G / Msun;
    if (m) m.innerHTML = `<div>v² = GM(&lt;r)/r → M(&lt;8.2 kpc) = v²r/G = <b>${sci(Menc, 2)} M☉</b> (${t('gx.visOnly')} ${sci(((vs.vis * 1e3) ** 2 * MW.sun * KPC) / G / Msun, 2)})</div>
      <div>${t('gx.yearL')} T = 2πR/v = 2π × 8.2 kpc / ${f0(vs.v)} km/s = <b>${f0(galYear(MW.sun, vs.v))} Myr</b> · ${t('gx.orbits')} ≈ ${f0(4600 / galYear(MW.sun, vs.v))}</div>
      <div>${t('gx.haloL')} v<sub>h</sub>² = v₀²(1 − (r<sub>c</sub>/r)·atan(r/r<sub>c</sub>)), v₀ = ${MW.v0} km/s, r<sub>c</sub> = ${MW.rc} kpc</div>`;
    if (ok) this.done('galaxy');
    const g = $('#gx-goal'); if (g) g.innerHTML = `${badge(this.goal.galaxy)} ${t('goal.galaxy')}`;
  }

  // ═══ 2 · VACUUM ═══
  vcEnv() { const B = this.vc.beyond; if (B) return { ...place(B), name: t('pl.' + B) }; const h = 10 ** this.vc.lh - 1; return { ...atmo(h), h, name: f1(h) + ' km' }; }
  vcP() { const C = this.vc; return `<header class="lv-head mono">${t('vc.title')}</header><p class="intro">${t('vc.intro')}</p>${this.slider('v-h', t('vc.h'), C.lh, 0, 3, 0.002, f1(10 ** C.lh - 1) + ' km')}<header class="lv-sub mono">${t('vc.beyond')}</header>${this.chips('pl', ['none', 'wind', 'ism', 'igm'], C.beyond ?? 'none', (k) => t('pl.' + k))}${this.facts('vc.f', 6)}`; }
  vcS() { return `<header class="lv-head mono">${t('vc.read')}</header><div class="bigstats" id="vc-big"></div><canvas class="cv chart" id="cv-boil"></canvas><div class="math mono" id="vc-math"></div><div class="goal" id="vc-goal"></div>`; }
  vcB() { this.bindSliders(this.vc, [['v-h', 'lh', (v) => f1(10 ** v - 1) + ' km']], () => { this.vc.beyond = null; document.querySelectorAll('[data-pl]').forEach((b) => b.classList.toggle('active', b.dataset.pl === 'none')); }); this.bindChips('pl', (k) => { this.vc.beyond = k === 'none' ? null : k; }); }
  vcLive(full) {
    if (!full) return;
    const E = this.vcEnv(), bp = boil(E.p), lam = mfp(E.n), ok = !this.vc.beyond && bp >= 36 && bp <= 38;
    const b = $('#vc-big'); if (b) b.innerHTML = `<div><b class="mono">${sci(E.n, 1)}</b><small>${t('vc.n')}</small></div><div><b class="mono">${E.p >= 1 ? f0(E.p) + ' Pa' : sci(E.p, 1) + ' Pa'}</b><small>${t('vc.p')}</small></div><div><b class="mono ${bp >= 36 && bp <= 38 ? 'c-green' : ''}">${bp > -150 ? f1(bp) + ' °C' : '—'}</b><small>${t('vc.boil')}</small></div>`;
    const pts = []; for (let h = 0; h <= 40; h += 0.25) pts.push([h, boil(atmo(h).p)]);
    lineChart($('#cv-boil'), { x0: 0, x1: 40, y0: -40, y1: 100, xFmt: (x) => f0(x) + ' km', yFmt: (y) => f0(y) + '°', title: t('vc.chart'), series: [{ pts, color: '#7fd0ff', label: t('vc.boilS') }], marks: [{ y: 37, color: 'rgba(255,106,122,.6)', label: '37 °C' }, ...(this.vc.beyond ? [] : [{ dot: [Math.min(40, E.h), Math.max(-40, bp)], color: '#ffd27a' }])] });
    const m = $('#vc-math');
    if (m) m.innerHTML = `<div>p = n·k<sub>B</sub>·T = ${sci(E.n, 2)} × 1.381×10<sup>−23</sup> × ${f0(E.T)} K = <b>${sci(E.p, 2)} Pa</b></div>
      <div>${t('vc.mfpL')} λ = 1/(√2·π·d²·n), d = 0.37 nm → <b>${len(lam)}</b></div>
      <div>${t('vc.boilL')} log₁₀P = 8.07131 − 1730.63/(233.426 + T) → <b>${bp > -150 ? f1(bp) + ' °C' : '—'}</b></div>
      <div>${t('vc.tempL')} CMB ${CMB} K · ${t('vc.sunlit')} T = (S(1−a)/4σ)<sup>¼</sup> = <b>${f0(sunT())} K</b></div>`;
    if (ok) this.done('vacuum');
    const g = $('#vc-goal'); if (g) g.innerHTML = `${badge(this.goal.vacuum)} ${t('goal.vacuum')}`;
  }

  // ═══ 3 · GRAVITY ═══
  grP() { const R = this.gr; return `<header class="lv-head mono">${t('gr.title')}</header><p class="intro">${t('gr.intro')}</p><header class="lv-sub mono">${t('gr.mat')}</header>${this.chips('mat', Object.keys(MAT), R.mat, (k) => t('m.' + k))}${this.slider('r-R', t('gr.R'), R.lR, 1, 3.6, 0.005, f0(10 ** R.lR) + ' km')}<header class="lv-sub mono">${t('gr.real')}</header>${this.chips('bod', Object.keys(BODIES), '', (k) => t('b.' + k))}${this.facts('gr.f', 5)}`; }
  grS() { return `<header class="lv-head mono">${t('gr.read')}</header><div class="bigstats" id="gr-big"></div><canvas class="cv chart" id="cv-pot"></canvas><div class="math mono" id="gr-math"></div><div class="goal" id="gr-goal"></div>`; }
  grB() { this.bindSliders(this.gr, [['r-R', 'lR', (v) => f0(10 ** v) + ' km']]); this.bindChips('mat', (k) => { this.gr.mat = k; }); this.bindChips('bod', (k) => { const B = BODIES[k]; this.gr.mat = B.m; this.gr.lR = Math.log10(B.R / 1000); this.app.feed.push(B.round ? 'gr.isRound' : 'gr.notRound', 'ok', { b: t('b.' + k) }); }); }
  grLive(full) {
    if (!full) return;
    const R = this.gr, Rm = 10 ** R.lR * 1000, B = body(Rm, R.mat), near = Math.abs(Rm / B.Rp - 1) <= 0.1, ok = near && R.mat === 'rock';
    const b = $('#gr-big'); if (b) b.innerHTML = `<div><b class="mono ${B.round ? 'c-green' : 'c-amber'}">${B.round ? t('gr.round') : t('gr.potato')}</b><small>${t('gr.shape')}</small></div><div><b class="mono">${f0(B.Rp / 1000)} km</b><small>${t('gr.Rp')}</small></div><div><b class="mono">${f2(B.g)} m/s²</b><small>${t('gr.g')}</small></div>`;
    const pts = []; for (let l = 1; l <= 3.6; l += 0.02) pts.push([l, Math.log10(body(10 ** l * 1000, R.mat).ratio)]);
    lineChart($('#cv-pot'), { x0: 1, x1: 3.6, y0: -3, y1: 3, xTicks: [1, 2, 3, 3.6], xFmt: (x) => f0(10 ** x) + ' km', yFmt: (y) => '10^' + f0(y), title: t('gr.chart'), series: [{ pts, color: '#ffb347', label: 'P_c/σ' }], bands: [{ from: Math.log10(B.Rp / 1000), to: 3.6, color: 'rgba(124,255,158,.07)', label: t('gr.round') }], marks: [{ y: 0, color: 'rgba(255,255,255,.4)' }, { dot: [R.lR, Math.log10(B.ratio)], color: '#ff6a7a' }] });
    const m = $('#gr-math'), M = MAT[R.mat];
    if (m) m.innerHTML = `<div>P<sub>c</sub> = (2π/3)·G·ρ²·R² = (2π/3) × ${sci(G)} × ${M.rho}² × (${sci(Rm)})² = <b>${sci(B.Pc)} Pa</b> vs σ = ${sci(M.sigma)} Pa</div>
      <div>R<sub>p</sub> = √(3σ/(2πGρ²)) = <b>${f0(B.Rp / 1000)} km</b> · M = ${sci(B.mass)} kg · g = GM/R² = ${f3(B.g)} m/s²</div>
      <div>${t('gr.mountain')} h ≈ σ/(ρg) = <b>${B.hmax > Rm ? t('gr.noLimit') : f1(B.hmax / 1000) + ' km'}</b> · ${t('gr.vesc')} √(2GM/R) = ${f0(B.vesc)} m/s</div>
      <div>${t('gr.earth')}</div>`;
    if (ok) this.done('gravity');
    const g = $('#gr-goal'); if (g) g.innerHTML = `${badge(this.goal.gravity)} ${t('goal.gravity')}`;
  }

  // ═══ 4 · BODY ═══
  bdP() { const B = this.bd; return `<header class="lv-head mono">${t('bd.title')}</header><p class="intro">${t('bd.intro')}</p><header class="lv-sub mono">${t('bd.world')}</header>${this.chips('bw', ['earth', 'moon', 'iss'], B.world, (k) => t('w.' + k))}${this.slider('b-a', t('bd.a'), B.a, -15, 15, 0.1, f1(B.a) + ' m/s²')}${this.facts('bd.f', 6)}`; }
  bdS() { return `<header class="lv-head mono">${t('bd.read')}</header><div class="bigstats" id="bd-big"></div><canvas class="cv chart" id="cv-pitch"></canvas><div class="math mono" id="bd-math"></div><div class="goal" id="bd-goal"></div>`; }
  bdB() { this.bindSliders(this.bd, [['b-a', 'a', (v) => f1(v) + ' m/s²']]); this.bindChips('bw', (k) => { this.bd.world = k; }); }
  bdLive(full) {
    if (!full) return;
    const B = this.bd, gw = WORLDS[B.world], th = pitchIllusion(B.a, gw), f = gif(B.a, gw), ok = B.world === 'earth' && th >= 43 && th <= 47;
    const b = $('#bd-big'); if (b) b.innerHTML = `<div><b class="mono ${Math.abs(th) > 5 ? 'c-amber' : ''}">${f1(th)}°</b><small>${t('bd.pitch')}</small></div><div><b class="mono">${f2(f / g0)} g</b><small>${t('bd.gif')}</small></div><div><b class="mono">${gw === 0 ? t('bd.none') : f2(gw / g0) + ' g'}</b><small>${t('bd.grav')}</small></div>`;
    const pts = []; for (let a = -15; a <= 15; a += 0.2) pts.push([a, pitchIllusion(a, gw)]);
    lineChart($('#cv-pitch'), { x0: -15, x1: 15, y0: -90, y1: 90, xFmt: (x) => f0(x), yFmt: (y) => f0(y) + '°', title: t('bd.chart'), series: [{ pts, color: '#ffd27a', label: t('bd.pitchS') }], marks: [{ y: 45, color: 'rgba(124,255,158,.4)', label: '45°' }, { dot: [B.a, th], color: '#ff6a7a' }] });
    const m = $('#bd-math');
    if (m) m.innerHTML = `<div>f = g − a: |f| = √(g² + a²) = √(${f2(gw)}² + ${f2(B.a)}²) = <b>${f2(f)} m/s²</b></div>
      <div>${t('bd.tilt')} θ = atan(a/g) = <b>${f1(th)}°</b> ${gw === 0 ? '· ' + t('bd.zeroG') : ''}</div>
      <div>${t('bd.equiv')}</div>`;
    if (ok) this.done('body');
    const g = $('#bd-goal'); if (g) g.innerHTML = `${badge(this.goal.body)} ${t('goal.body')}`;
  }

  // ═══ 5 · PERCEPTION ═══
  pcP() { const P = this.pc; return `<header class="lv-head mono">${t('pc.title')}</header><p class="intro">${t('pc.intro')}</p><header class="lv-sub mono">${t('pc.world')}</header>${this.chips('pw', Object.keys(WORLDS).filter((k) => k !== 'iss'), P.world, (k) => t('w.' + k))}${this.slider('p-h', t('pc.h'), P.h, 0.5, 3, 0.05, f2(P.h) + ' m')}<div class="chips"><button class="btn primary" id="p-drop">● ${t('pc.drop')}</button><button class="btn seg ${P.adapt ? 'active' : ''}" id="p-ad">${t('pc.adapt')}</button><button class="btn seg" id="p-reset">${t('pc.reset')}</button></div><div class="chips"><button class="btn seg" id="p-light">${t('pc.light')}</button></div>${this.facts('pc.f', 6)}`; }
  pcS() { return `<header class="lv-head mono">${t('pc.read')}</header><div class="bigstats" id="pc-big"></div><canvas class="cv chart" id="cv-catch"></canvas><div class="math mono" id="pc-math"></div><div class="goal" id="pc-goal"></div>`; }
  pcB() { const P = this.pc; this.bindSliders(P, [['p-h', 'h', (v) => f2(v) + ' m']]); this.bindChips('pw', (k) => { P.world = k; P.trials = []; }); $('#p-drop').onclick = () => this.drop(); $('#p-ad').onclick = () => { P.adapt = !P.adapt; sfx.select(); this.render(); }; $('#p-reset').onclick = () => { P.gm = 9.81; P.trials = []; sfx.select(); this.refresh(true); }; $('#p-light').onclick = () => { this.flipLight = !this.flipLight; sfx.select(); }; }
  drop() {
    const P = this.pc, gw = WORLDS[P.world], R = catchTrial(P.h, 0, gw, P.gm); P.trials.push({ ...R, gm: P.gm }); if (P.trials.length > 30) P.trials.shift();
    P.anim = { t: 0, R }; this.app.feed.push(R.ok ? 'pc.caught' : R.dt < 0 ? 'pc.early' : 'pc.late', R.ok ? 'ok' : 'warn', { ms: f0(Math.abs(R.dt) * 1000) });
    if (P.adapt) P.gm += 0.45 * (gw - P.gm);
    if (R.ok && P.world !== 'earth') this.done('perception');
    this.refresh(true); return R;
  }
  pcLive(full) {
    if (!full) return;
    const P = this.pc, gw = WORLDS[P.world], R = catchTrial(P.h, 0, gw, P.gm);
    const b = $('#pc-big'); if (b) b.innerHTML = `<div><b class="mono">${f2(P.gm)} m/s²</b><small>${t('pc.gm')}</small></div><div><b class="mono">${f0(R.tr * 1000)} ms</b><small>${t('pc.real')}</small></div><div><b class="mono ${R.ok ? 'c-green' : 'c-red'}">${R.dt >= 0 ? '+' : ''}${f0(R.dt * 1000)} ms</b><small>${t('pc.err')}</small></div>`;
    const tr = P.trials.map((q, i) => [i + 1, q.dt * 1000]);
    lineChart($('#cv-catch'), { x0: 0, x1: Math.max(10, tr.length + 1), y0: -900, y1: 300, xFmt: (x) => f0(x), yFmt: (y) => f0(y), title: t('pc.chart'), series: [{ pts: tr, color: '#ffb347', label: t('pc.errS') }], bands: [], marks: [{ y: 40, color: 'rgba(124,255,158,.5)' }, { y: -40, color: 'rgba(124,255,158,.5)', label: '±40 ms' }, ...tr.map(([x, y]) => ({ dot: [x, y], color: Math.abs(y) < 40 ? '#7cff9e' : '#ff6a7a' }))] });
    const m = $('#pc-math');
    if (m) m.innerHTML = `<div>h = ½gt² → t = √(2h/g): ${t('pc.world2')} √(2 × ${f2(P.h)}/${f2(gw)}) = <b>${f0(R.tr * 1000)} ms</b> · ${t('pc.brain')} √(2 × ${f2(P.h)}/${f2(P.gm)}) = <b>${f0(R.tp * 1000)} ms</b></div>
      <div>${t('pc.learn')} g<sub>m</sub> ← g<sub>m</sub> + 0.45·(g − g<sub>m</sub>) ${P.adapt ? '' : '(' + t('off') + ')'}</div>
      <div>${t('pc.shade')}</div>`;
    const g = $('#pc-goal'); if (g) g.innerHTML = `${badge(this.goal.perception)} ${t('goal.perception')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-1.2, Math.min(1.4, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.3, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'perception' && k === ' ') this.drop(); }
  keyUp() {}

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, S = this.S;
    for (const k of TABS) S[{ galaxy: 'galaxy', vacuum: 'vacuum', gravity: 'gravity', body: 'ear', perception: 'perc' }[k]].visible = k === tab;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.05;
    let dist = 60;
    if (tab === 'galaxy') { spinGalaxy(S, dt, this.gx.dm); const th = time * 0.05; S.sun.position.set(MW.sun * Math.cos(th), 0.3, MW.sun * Math.sin(th)); S.halo.material.opacity = 0.03 + 0.06 * this.gx.dm; dist = 46; }
    else if (tab === 'vacuum') {
      const E = this.vcEnv(), lg = Math.log10(Math.max(1e-3, E.n)), N = Math.floor(2500 * Math.max(0, Math.min(1, (lg + 1) / 26.5)) ** 3), sp = Math.sqrt(E.T / 300) * 6;
      const P = S.mol.geometry.attributes.position; S.molV.forEach((m, i) => { if (i < N) { m.p.addScaledVector(m.v, dt * sp); for (const ax of ['x', 'y', 'z']) if (Math.abs(m.p[ax]) > 8.6) { m.p[ax] = Math.sign(m.p[ax]) * 8.6; m.v[ax] *= -1; } P.setXYZ(i, m.p.x, m.p.y, m.p.z); } else P.setXYZ(i, 0, -9999, 0); }); P.needsUpdate = true;
      const h = this.vc.beyond ? 2000 : 10 ** this.vc.lh - 1, rr = 20 + Math.min(14, Math.log10(1 + h) * 4.4); S.alt.position.set(-26 + rr * Math.cos(0.6), rr * Math.sin(0.6), 0); S.alt.visible = !this.vc.beyond; S.earth.rotation.y += dt * 0.05; dist = 64;
    } else if (tab === 'gravity') {
      const R = this.gr, Rm = 10 ** R.lR * 1000, B = body(Rm, R.mat), amp = B.round ? 0.015 * Math.min(1, B.Rp / Rm) : 0.08 + 0.32 * Math.min(1, (B.Rp / Rm - 1) * 1.2), P = S.body.geometry.attributes.position, base = S.bodyBase;
      if (this.lastAmp === undefined || Math.abs(this.lastAmp - amp) > 0.002) { this.lastAmp = amp; for (let i = 0; i < S.bodyNoise.length; i++) { const k = 1 + amp * S.bodyNoise[i]; P.setXYZ(i, base[i * 3] * k, base[i * 3 + 1] * k * (B.round ? 1 : 0.85), base[i * 3 + 2] * k); } P.needsUpdate = true; S.body.geometry.computeVertexNormals(); }
      S.body.material.color.set({ rock: '#9a8a7a', ice: '#c8dcf0', iron: '#7a7068' }[R.mat]); S.body.rotation.y += dt * 0.15; dist = 40;
    } else if (tab === 'body') {
      const B = this.bd, gw = WORLDS[B.world], f = V(-B.a, -gw, 0), th = Math.atan2(B.a, gw);
      S.otoconia.position.x = Math.max(-1.2, Math.min(1.2, -B.a * 0.12)); S.hairs.forEach((h) => (h.rotation.z = Math.max(-0.9, Math.min(0.9, B.a * 0.06)) + (gw === 0 ? Math.sin(time * 2 + h.position.x) * 0.25 : 0)));
      const setA = (A, vec, scale) => { const l = vec.length(); A.visible = l > 0.05; if (l > 0.05) { A.setDirection(vec.clone().normalize()); A.setLength(Math.min(12, l * scale + 0.5), 1.4, 0.8); } };
      setA(S.gArrow, V(0, -gw, 0), 0.8); setA(S.aArrow, V(B.a, 0, 0), 0.8); setA(S.fArrow, f, 0.8);
      S.horizon.rotation.z = -th; S.canals.forEach((c, i) => (c.material.emissiveIntensity = 0.1 + 0.08 * Math.sin(time * 3 + i))); dist = 38;
    } else {
      const P = this.pc, A = P.anim, top = 8;
      if (A) { A.t += dt; const T = Math.max(A.R.tr, A.R.tp) + 0.6, k = Math.min(A.t, T), slow = 1, y = (tt, g) => top - Math.min(top + 6, 0.5 * g * (tt * slow) ** 2 * (top + 6) / P.h / 2 * 0.98);
        S.ball.position.set(0, Math.max(-5.2, top - Math.min(1, (k / A.R.tr)) ** 2 * (top + 5.2)), 0); S.ghost.position.set(0, Math.max(-5.2, top - Math.min(1, (k / A.R.tp)) ** 2 * (top + 5.2)), 0);
        const closed = k >= A.R.tp; S.fingers.forEach((fg) => (fg.rotation.x = closed ? -1.2 : 0)); if (A.t > T + 1) P.anim = null; void y; }
      else { S.ball.position.set(0, top, 0); S.ghost.position.set(0, top, 0); S.fingers.forEach((fg) => (fg.rotation.x = 0)); }
      S.discs.forEach((d) => (d.material.uniforms.uTop.value = this.flipLight ? 1 - d.userData.flip : d.userData.flip)); dist = 34;
    }
    const look = CENTER[tab], R = dist * v.r, cp = V(Math.sin(v.yaw) * Math.cos(v.pitch) * R, Math.sin(v.pitch) * R, Math.cos(v.yaw) * Math.cos(v.pitch) * R).add(look);
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 3)); this.snap = false; this.cam.lookAt(look);
    this.key.target.position.copy(look); this.key.position.copy(look).add(V(30, 40, 20));
    S.stars.position.copy(this.cam.position);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) { if (!this.entered) return; const P = { galaxy: 'gx', vacuum: 'vc', gravity: 'gr', body: 'bd', perception: 'pc' }[this.tab]; this[P + 'Live'](full); if (full) this.statusBar(); }
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
void kB; void PLACES; void potato; void SPACEFLIGHT; void arrival;
