import * as THREE from 'three';
import { c, G, g0, Msun, LY, PC, AU, YR, ENGINES, rocketDv, trip, tripCurve, DEST, G_TH, shadow, warp, jump, hole, HOLES, chirp, waveform, RUN, runShadowPc, route } from './sim/space.js';
import { buildShip, setThrust, buildPlanet } from './view/ship.js';
import { buildSky } from './view/sky.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx, chirpTone, jumpSound } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// RUSTWING · the app. Five stations for an old freighter: the hangar (why rockets can't take you to the
// stars), hyperspace (faster than light, on paper), a black hole up close, two black holes colliding,
// and the Throat Run, a smuggler's shortcut through a black-hole cluster in under 12 parsecs.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const sci = (x, d = 2) => { if (!Number.isFinite(x) || x === 0) return x === 0 ? '0' : '∞'; const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return Math.abs(e) < 4 ? (Math.abs(x) >= 100 ? f0(x) : x.toPrecision(3)) : `${m.toFixed(d)}×10<sup>${e}</sup>`; };
const dur = (s) => (s < 120 ? f1(s) + ' s' : s < 7200 ? f1(s / 60) + ' min' : s < 172800 ? f1(s / 3600) + ' h' : s < 2 * YR ? f1(s / 86400) + ' d' : sci(s / YR, 2) + ' y');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['hangar', 'hyper', 'hole', 'merger', 'run'];
const RS = 4;                                                            // black hole: r_s in scene units

export class Rustwing {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.environmentIntensity = 0.7;
    this.cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 6000); scene.add(this.cam);
    this.sun = new THREE.DirectionalLight('#fff4e6', 2.6); this.sun.position.set(-60, 40, 50); scene.add(this.sun);
    this.rim = new THREE.DirectionalLight('#6a8cff', 1.2); this.rim.position.set(40, -10, -60); scene.add(this.rim);
    scene.add(new THREE.HemisphereLight('#8aa0d0', '#201a14', 0.35));
    this.sky = buildSky(scene); this.ship = buildShip(); scene.add(this.ship);
    this.planet = buildPlanet(); this.planet.scale.setScalar(160); this.planet.position.set(-260, -90, -520); scene.add(this.planet);
    this.orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...Array(129)].map((_, i) => V(Math.cos((i / 128) * Math.PI * 2), 0, Math.sin((i / 128) * Math.PI * 2)))), new THREE.LineBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.5 })); scene.add(this.orbitLine);
    // Space-time grid for the merger: ripples travel outward as the holes spiral in.
    { const g = new THREE.PlaneGeometry(220, 220, 110, 110); g.rotateX(-Math.PI / 2); this.gridU = { uT: { value: 0 }, uA: { value: 0 }, uW: { value: 1 } };
      const m = new THREE.ShaderMaterial({ uniforms: this.gridU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true,
        vertexShader: `uniform float uT, uA, uW; varying float vA; void main(){ vec3 p = position; float r = length(p.xz) + 0.001; float w = uA * sin(r * 0.35 * uW - uT * 6.0 * uW + 2.0 * atan(p.z, p.x)) * 18.0 / (r + 8.0); p.y += w - 40.0 / (r + 6.0); vA = clamp(1.0 - r / 110.0, 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * vA * 0.35, 1.0); }` });
      this.grid = new THREE.Mesh(g, m); this.grid.position.y = -18; scene.add(this.grid); }
    this.hg = { aG: 0.3, eng: 'chem', dest: 'proxima', thr: 0.5 };
    this.hy = { dest: 'proxima', lk: 3, au: 1, lR: 1.7, lD: 0, jumped: null, anim: null };
    this.bh = { lm: Math.log10(HOLES.sgr), x: 6, disk: true, ang: 0 };
    this.mg = { m1: 36, m2: 29, d: 410, anim: null, done: false };
    this.rn = { w: [[4.2, 3.7], [8.3, 3.0]], drag: -1, flown: false, anim: null };
    this.goal = { hangar: false, hyper: false, hole: false, merger: false, run: false };
    this.view = { yaw: 0.6, pitch: 0.25, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'hangar'; this.entered = false; this.uiT = 0; this.time = 0; this.warp = 0;
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
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab;
    Object.assign(this.view, { yaw: { hangar: 0.6, hyper: 0.25, hole: 0.4, merger: 0.3, run: 0.5 }[tab], pitch: { hangar: 0.25, hyper: 0.12, hole: 0.12, merger: 0.38, run: 0.2 }[tab], r: 1 }); this.snap = true;
    $('#runmap')?.classList.toggle('on', tab === 'run');
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { hangar: 'hg', hyper: 'hy', hole: 'bh', merger: 'mg', run: 'rn' }[this.tab]; $('#panel').innerHTML = this[P + 'P'](); $('#side').innerHTML = this[P + 'S'](); this[P + 'B'](); this.refresh(true); }

  // ═══ 1 · HANGAR ═══
  hgP() {
    const H = this.hg;
    return `<header class="lv-head mono">${t('hg.title')}</header><p class="intro">${t('hg.intro')}</p>
      <header class="lv-sub mono">${t('hg.dest')}</header>${this.chips('hdest', ['proxima', 'sirius', 'vega'], H.dest, (k) => t('d.' + k))}
      <header class="lv-sub mono">${t('hg.eng')}</header>${this.chips('eng', Object.keys(ENGINES), H.eng, (k) => t('e.' + k))}
      ${this.slider('h-a', t('hg.a'), H.aG, 0.1, 5, 0.05, f2(H.aG) + ' g')}${this.slider('h-t', t('hg.thr'), H.thr, 0, 1, 0.01, f0(H.thr * 100) + ' %')}
      <p class="small">${t('hg.note')}</p>`;
  }
  hgS() { return `<header class="lv-head mono">${t('hg.read')}</header><div class="bigstats" id="hg-big"></div><canvas class="cv chart" id="cv-trip"></canvas><div class="math mono" id="hg-math"></div><div class="goal" id="hg-goal"></div>`; }
  hgB() { const H = this.hg; this.bindSliders(H, [['h-a', 'aG', (v) => f2(v) + ' g'], ['h-t', 'thr', (v) => f0(v * 100) + ' %']]); this.bindChips('hdest', (k) => { H.dest = k; }); this.bindChips('eng', (k) => { H.eng = k; }); }
  hgLive(full) {
    if (!full) return;
    const H = this.hg, d = DEST[H.dest], T = trip(d, H.aG, ENGINES[H.eng]), ok = H.dest === 'proxima' && T.tau < 4 && H.aG <= 3;
    const b = $('#hg-big'); if (b) b.innerHTML = `<div><b class="mono ${T.tau < 4 ? 'c-green' : 'c-amber'}">${f2(T.tau)} y</b><small>${t('hg.tau')}</small></div><div><b class="mono">${f2(T.t)} y</b><small>${t('hg.tE')}</small></div><div><b class="mono ${T.lnR > 50 ? 'c-red' : ''}">${T.lnR > 50 ? 'e<sup>' + f0(T.lnR) + '</sup>' : sci(T.R)}</b><small>${t('hg.R')}</small></div>`;
    const pts = tripCurve(d, H.aG), tm = pts[pts.length - 1][0];
    lineChart($('#cv-trip'), { x0: 0, x1: Math.max(tm, d), y0: 0, y1: Math.max(tm, d), xFmt: (x) => f1(x) + ' y', yFmt: (y) => f1(y), title: t('hg.chart'), series: [{ pts, color: '#5ab4ff', label: t('hg.ship') }, { pts: [[0, 0], [Math.max(tm, d), Math.max(tm, d)]], color: 'rgba(255,255,255,.3)', dash: [4, 3], label: t('hg.earthClock') }] });
    const m = $('#hg-math'), ve = ENGINES[H.eng];
    if (m) m.innerHTML = `<div>γ<sub>max</sub> = 1 + a·d/(2c²) = <b>${f3(T.gamma)}</b> → v<sub>max</sub> = <b>${f3(T.vmax)} c</b></div>
      <div>τ = (2c/a)·acosh(γ) = <b>${f2(T.tau)} y</b> · t = (2c/a)·sinh(acosh γ) = <b>${f2(T.t)} y</b></div>
      <div>${t('hg.ratioL')} R = exp(2·acosh(γ)·c/v<sub>e</sub>) = exp(${f1(T.lnR)}) = <b>${T.lnR > 50 ? 'e<sup>' + f0(T.lnR) + '</sup>' : sci(T.R)}</b> (v<sub>e</sub> = ${ve >= c ? 'c' : sci(ve) + ' m/s'})</div>
      <div>${t('hg.dvL')} R = 10: Δv = c·tanh((v<sub>e</sub>/c)·ln 10) = <b>${rocketDv(ve, 10) > 1e6 ? f3(rocketDv(ve, 10) / c) + ' c' : f1(rocketDv(ve, 10) / 1000) + ' km/s'}</b></div>`;
    if (ok) this.done('hangar');
    const g = $('#hg-goal'); if (g) g.innerHTML = `${badge(this.goal.hangar)} ${t('goal.hangar')}`;
  }

  // ═══ 2 · HYPERSPACE ═══
  hyP() {
    const Y = this.hy;
    return `<header class="lv-head mono">${t('hy.title')}</header><p class="intro">${t('hy.intro')}</p>
      <header class="lv-sub mono">${t('hy.dest')}</header>${this.chips('ydest', Object.keys(DEST), Y.dest, (k) => t('d.' + k))}
      ${this.slider('y-k', t('hy.k'), Y.lk, 0, 8, 0.05, sci(10 ** Y.lk) + ' c')}${this.slider('y-au', t('hy.au'), Y.au, 0.5, 6, 0.05, f2(Y.au) + ' AU')}
      <button class="btn primary wide" id="y-go">⟫ ${t('hy.jump')}</button>
      <header class="lv-sub mono">${t('hy.bubble')}</header>${this.slider('y-R', t('hy.R'), Y.lR, 0, 3, 0.05, f0(10 ** Y.lR) + ' m')}${this.slider('y-D', t('hy.D'), Y.lD, -35, 0, 0.5, sci(10 ** Y.lD) + ' m')}
      <p class="small">${t('hy.note')}</p>`;
  }
  hyS() { return `<header class="lv-head mono">${t('hy.read')}</header><div class="bigstats" id="hy-big"></div><canvas class="cv chart" id="cv-jump"></canvas><div class="math mono" id="hy-math"></div><div class="goal" id="hy-goal"></div>`; }
  hyB() { const Y = this.hy; this.bindSliders(Y, [['y-k', 'lk', (v) => sci(10 ** v) + ' c'], ['y-au', 'au', (v) => f2(v) + ' AU'], ['y-R', 'lR', (v) => f0(10 ** v) + ' m'], ['y-D', 'lD', (v) => sci(10 ** v) + ' m']]); this.bindChips('ydest', (k) => { Y.dest = k; }); $('#y-go').onclick = () => this.doJump(); }
  doJump() {
    const Y = this.hy, rj = shadow(Msun) / AU, J = jump(DEST[Y.dest], 10 ** Y.lk);
    if (Y.au < rj) { this.app.feed.push('hy.blocked', 'bad', { r: f2(rj) }); sfx.deny(); this.caption('cap.blocked'); return; }
    Y.anim = { t: 0 }; Y.jumped = { dest: Y.dest, s: J.s }; jumpSound(); this.app.stage.flash?.('#9fd0ff'); this.app.feed.push('hy.jumped', 'ok', { d: t('d.' + Y.dest), t: dur(J.s) });
    if (Y.dest === 'center' && J.h <= 24) this.done('hyper');
  }
  hyLive(full) {
    if (!full) return;
    const Y = this.hy, d = DEST[Y.dest], k = 10 ** Y.lk, J = jump(d, k), W = warp({ k, R: 10 ** Y.lR, D: 10 ** Y.lD }), rj = shadow(Msun) / AU;
    const b = $('#hy-big'); if (b) b.innerHTML = `<div><b class="mono ${J.h <= 24 ? 'c-green' : ''}">${dur(J.s)}</b><small>${t('hy.time')}</small></div><div><b class="mono ${Y.au >= rj ? 'c-green' : 'c-red'}">${f2(rj)} AU</b><small>${t('hy.shadow')}</small></div><div><b class="mono c-red">${sci(W.suns, 1)}</b><small>${t('hy.E')}</small></div>`;
    const pts = []; for (let l = 0; l <= 8.001; l += 0.05) pts.push([l, Math.log10(jump(d, 10 ** l).s / 3600)]);
    lineChart($('#cv-jump'), { x0: 0, x1: 8, y0: Math.floor(Math.min(...pts.map((p) => p[1]))), y1: Math.ceil(Math.max(...pts.map((p) => p[1]))), xFmt: (x) => '10^' + f0(x), yFmt: (y) => '10^' + f0(y) + 'h', title: t('hy.chart'), series: [{ pts, color: '#9fd0ff', label: t('d.' + Y.dest) }], marks: [{ y: Math.log10(24), color: 'rgba(124,255,158,.5)', label: '24 h' }, { dot: [Y.lk, Math.log10(J.h)], color: '#ff6a7a' }] });
    const m = $('#hy-math');
    if (m) m.innerHTML = `<div>${t('hy.dL')} ${sci(d)} ly = ${sci(d * LY)} m = <b>${sci((d * LY) / PC)} pc</b> · ${t('hy.light')} ${d >= 1 ? sci(d) + ' y' : ''}</div>
      <div>t = d/(k·c) = ${sci(d * LY)}/(${sci(k)} × ${sci(c)}) = <b>${dur(J.s)}</b></div>
      <div>${t('hy.shL')} r<sub>j</sub> = √(GM/g<sub>th</sub>) = √(${sci(G * Msun)}/10<sup>−3</sup>) = <b>${sci(shadow(Msun))} m = ${f2(rj)} AU</b></div>
      <div>${t('hy.EL')} |E| ~ (c⁴/G)·k²·R²/Δ = <b>${sci(W.E)} J</b> ≈ <b>${sci(W.suns, 1)}</b> ${t('hy.suns')}</div>
      <div>${t('hy.caus')}</div>`;
    const g = $('#hy-goal'); if (g) g.innerHTML = `${badge(this.goal.hyper)} ${t('goal.hyper')}`;
  }

  // ═══ 3 · BLACK HOLE ═══
  bhP() {
    const B = this.bh;
    return `<header class="lv-head mono">${t('bh.title')}</header><p class="intro">${t('bh.intro')}</p>
      <header class="lv-sub mono">${t('bh.which')}</header>${this.chips('hole', Object.keys(HOLES), Object.keys(HOLES).find((k) => Math.abs(Math.log10(HOLES[k]) - B.lm) < 0.01) ?? '', (k) => t('h.' + k))}
      ${this.slider('b-m', t('bh.m'), B.lm, 0.5, 10.5, 0.05, sci(10 ** B.lm) + ' M☉')}${this.slider('b-x', t('bh.x'), B.x, 1.6, 20, 0.05, f2(B.x) + ' r<sub>s</sub>')}
      <div class="chips"><button class="btn seg ${B.disk ? 'active' : ''}" id="b-disk">${t('bh.disk')}: ${B.disk ? t('on') : t('off')}</button></div><p class="small">${t('bh.note')}</p>`;
  }
  bhS() { return `<header class="lv-head mono">${t('bh.read')}</header><div class="bigstats" id="bh-big"></div><canvas class="cv chart" id="cv-hole"></canvas><div class="math mono" id="bh-math"></div><div class="goal" id="bh-goal"></div>`; }
  bhB() { const B = this.bh; this.bindSliders(B, [['b-m', 'lm', (v) => sci(10 ** v) + ' M☉'], ['b-x', 'x', (v) => f2(v) + ' r_s']]); this.bindChips('hole', (k) => { B.lm = Math.log10(HOLES[k]); }); $('#b-disk').onclick = () => { B.disk = !B.disk; sfx.select(); this.render(); }; }
  bhLive(full) {
    if (!full) return;
    const B = this.bh, M = 10 ** B.lm, H = hole(M, B.x), ok = H.stable && B.x <= 3.5 && H.tidal <= g0;
    const b = $('#bh-big'); if (b) b.innerHTML = `<div><b class="mono">${H.rs < 1e6 ? f1(H.rs / 1000) + ' km' : sci(H.rs / AU, 2) + ' AU'}</b><small>${t('bh.rs')}</small></div><div><b class="mono ${H.stable ? 'c-green' : 'c-red'}">×${f3(H.slow)}</b><small>${t('bh.slow')}</small></div><div><b class="mono ${H.tidal <= g0 ? 'c-green' : 'c-red'}">${sci(H.tidal / g0, 1)} g</b><small>${t('bh.tidal')}</small></div>`;
    const sp = [], tp = []; for (let x = 1.55; x <= 20; x += 0.05) { const q = hole(M, x); sp.push([x, Math.min(4, q.slow)]); }
    lineChart($('#cv-hole'), { x0: 1.5, x1: 20, y0: 1, y1: 4, xFmt: (x) => f0(x) + ' r_s', yFmt: (y) => '×' + f1(y), title: t('bh.chart'), series: [{ pts: sp, color: '#ffb347', label: t('bh.slowS') }], bands: [{ from: 1.5, to: 3, color: 'rgba(255,90,106,.1)', label: t('bh.unstable') }], marks: [{ x: 3, color: 'rgba(124,255,158,.6)', label: 'ISCO' }, { x: 1.5, color: 'rgba(255,255,255,.4)' }, { dot: [B.x, Math.min(4, H.slow)], color: '#ff6a7a' }] });
    const m = $('#bh-math');
    if (m) m.innerHTML = `<div>r<sub>s</sub> = 2GM/c² = 2 × ${sci(G)} × ${sci(M * Msun)}/c² = <b>${sci(H.rs)} m</b> · ${t('bh.shadowL')} (3√3/2)r<sub>s</sub> = ${sci(H.shadowR)} m</div>
      <div>${t('bh.orbitL')} r = ${f2(B.x)} r<sub>s</sub>: dτ/dt = √(1 − 1.5/x) = <b>${f3(H.rate)}</b> → ${t('bh.hour')} <b>${f2(H.slow)} h</b> ${t('bh.far')}</div>
      <div>T = 2π√(r³/GM) = <b>${dur(H.T)}</b> · v = c/√(2(x − 1)) = <b>${f3(H.v)} c</b> · ${t('bh.z')} z = <b>${f3(H.z)}</b></div>
      <div>${t('bh.tidL')} Δa = 2GML/r³ (L = 30 m) = <b>${sci(H.tidal)} m/s²</b> = ${sci(H.tidal / g0, 2)} g</div>
      <div>${t('bh.big')}</div>`;
    if (ok) this.done('hole');
    const g = $('#bh-goal'); if (g) g.innerHTML = `${badge(this.goal.hole)} ${t('goal.hole')}`;
  }

  // ═══ 4 · MERGER ═══
  mgP() {
    const M = this.mg;
    return `<header class="lv-head mono">${t('mg.title')}</header><p class="intro">${t('mg.intro')}</p>
      ${this.slider('g-1', t('mg.m1'), M.m1, 3, 90, 1, M.m1 + ' M☉')}${this.slider('g-2', t('mg.m2'), M.m2, 3, 90, 1, M.m2 + ' M☉')}${this.slider('g-d', t('mg.d'), M.d, 40, 3000, 10, f0(M.d) + ' Mpc')}
      <div class="chips"><button class="btn primary" id="g-go">◎ ${t('mg.go')}</button><button class="btn seg" id="g-150914">GW150914</button></div><p class="small">${t('mg.note')}</p>`;
  }
  mgS() { return `<header class="lv-head mono">${t('mg.read')}</header><div class="bigstats" id="mg-big"></div><canvas class="cv chart" id="cv-wave"></canvas><div class="math mono" id="mg-math"></div><div class="goal" id="mg-goal"></div>`; }
  mgB() { const M = this.mg; this.bindSliders(M, [['g-1', 'm1', (v) => v + ' M☉'], ['g-2', 'm2', (v) => v + ' M☉'], ['g-d', 'd', (v) => f0(v) + ' Mpc']]); $('#g-go').onclick = () => this.merge(); $('#g-150914').onclick = () => { Object.assign(M, { m1: 36, m2: 29, d: 410 }); sfx.select(); this.render(); }; }
  merge() {
    const M = this.mg, W = waveform(M.m1, M.m2, M.d, 0.25, 600), C = W.C; M.anim = { t: 0 };
    // Play the chirp four times higher than real so small speakers carry it; loudness follows the strain.
    const fr = W.pts.map((p) => Math.min(2000, p[2] * 4)), hmax = Math.max(...W.pts.map((p) => Math.abs(p[1]))), am = W.pts.map((p, i) => (i % 1 === 0 ? Math.min(1, (C.h(Math.max(20, p[2])) / C.hpeak) ** 1) * (p[0] > 0 ? Math.exp(-p[0] * 40) : 1) : 0));
    chirpTone(fr, am, 2.6); void hmax;
    const ok = C.hpeak >= 1e-21 && C.fisco >= 30 && C.fisco <= 500;
    this.app.feed.push(ok ? 'mg.detected' : 'mg.missed', ok ? 'ok' : 'warn', { h: sci(C.hpeak, 1).replace(/<\/?sup>/g, '') }); if (ok) this.done('merger');
  }
  mgLive(full) {
    if (!full) return;
    const M = this.mg, W = waveform(M.m1, M.m2, M.d), C = W.C, ok = C.hpeak >= 1e-21 && C.fisco >= 30 && C.fisco <= 500;
    const b = $('#mg-big'); if (b) b.innerHTML = `<div><b class="mono">${f1(C.Mc)} M☉</b><small>${t('mg.mc')}</small></div><div><b class="mono ${C.fisco >= 30 && C.fisco <= 500 ? 'c-green' : 'c-red'}">${f0(C.fisco)} Hz</b><small>${t('mg.fend')}</small></div><div><b class="mono ${C.hpeak >= 1e-21 ? 'c-green' : 'c-red'}">${sci(C.hpeak, 1)}</b><small>${t('mg.h')}</small></div>`;
    const hm = Math.max(...W.pts.map((p) => Math.abs(p[1])));
    lineChart($('#cv-wave'), { x0: -0.25, x1: 0.04, y0: -1.1, y1: 1.1, xFmt: (x) => f2(x) + ' s', yFmt: (y) => f1(y), title: t('mg.chart', { h: sci(hm, 1).replace(/<\/?sup>/g, '') }), series: [{ pts: W.pts.map((p) => [p[0], p[1] / hm]), color: '#7fd0ff', width: 1.2 }], marks: [{ x: 0, color: 'rgba(255,210,58,.5)', label: t('mg.merge') }] });
    const m = $('#mg-math');
    if (m) m.innerHTML = `<div>M<sub>c</sub> = (m₁m₂)<sup>3/5</sup>/(m₁+m₂)<sup>1/5</sup> = <b>${f2(C.Mc)} M☉</b> · f<sub>ISCO</sub> = c³/(6<sup>3/2</sup>πGM) = <b>${f0(C.fisco)} Hz</b></div>
      <div>τ(20 Hz) = (5/256)(GM<sub>c</sub>/c³)<sup>−5/3</sup>(πf)<sup>−8/3</sup> = <b>${dur(C.tau20)}</b> ${t('mg.toMerge')}</div>
      <div>h = (4/d)(GM<sub>c</sub>/c²)<sup>5/3</sup>(πf/c)<sup>2/3</sup> = <b>${sci(C.hpeak, 2)}</b> · ${t('mg.arm')} ${sci(C.hpeak * 4000, 1)} m</div>
      <div>${t('mg.final')} ≈ ${f1(C.Mf)} M☉ · ${t('mg.ring')} f = 0.5226·c³/(2πGM<sub>f</sub>) = <b>${f0(C.fring)} Hz</b> · E ≈ 0.05·Mc² = <b>${sci(C.Erad)} J</b></div>`;
    const g = $('#mg-goal'); if (g) g.innerHTML = `${badge(this.goal.merger)} ${t('goal.merger')}`;
    void ok;
  }

  // ═══ 5 · THE RUN ═══
  rnP() { return `<header class="lv-head mono">${t('rn.title')}</header><p class="intro">${t('rn.intro')}</p><div class="chips"><button class="btn primary" id="r-fly">⟫ ${t('rn.fly')}</button><button class="btn seg" id="r-reset">${t('rn.reset')}</button></div><p class="small">${t('rn.note')}</p>`; }
  rnS() { return `<header class="lv-head mono">${t('rn.read')}</header><div class="bigstats" id="rn-big"></div><div class="math mono" id="rn-math"></div><div class="goal" id="rn-goal"></div>`; }
  rnB() { $('#r-fly').onclick = () => this.flyRun(); $('#r-reset').onclick = () => { this.rn.w = [[4.2, 3.7], [8.3, 3.0]]; sfx.select(); this.refresh(true); }; this.bindMap(); }
  flyRun() {
    const R = route(this.rn.w);
    if (!R.ok) { this.app.feed.push('rn.pulled', 'bad'); sfx.deny(); this.rn.anim = { t: 0, fail: true }; return; }
    this.rn.anim = { t: 0 }; jumpSound(); this.app.stage.flash?.('#9fd0ff'); this.app.feed.push('rn.made', 'ok', { L: f2(R.L) });
    if (R.L <= 12) { this.rn.flown = true; this.done('run'); this.caption('cap.runwin'); }
  }
  mapXY(cv) { const r = cv.getBoundingClientRect(), pad = 26, sx = (r.width - 2 * pad) / 12.4, sy = sx; return { X: (x) => pad + (x + 0.6) * sx, Y: (y) => r.height / 2 - y * sy, ix: (px) => (px - pad) / sx - 0.6, iy: (py) => (r.height / 2 - py) / sy, r }; }
  bindMap() {
    const cv = $('#runmap canvas'); if (!cv || cv.dataset.bound) return; cv.dataset.bound = 1;
    const pos = (e) => { const M = this.mapXY(cv); return [M.ix(e.clientX - M.r.left), M.iy(e.clientY - M.r.top)]; };
    cv.addEventListener('pointerdown', (e) => { const [x, y] = pos(e); let best = -1, bd = 0.6; this.rn.w.forEach((w, i) => { const d = Math.hypot(w[0] - x, w[1] - y); if (d < bd) { bd = d; best = i; } }); this.rn.drag = best; if (best >= 0) cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (this.rn.drag < 0) return; const [x, y] = pos(e); this.rn.w[this.rn.drag] = [Math.max(0.3, Math.min(10.9, x)), Math.max(-4.4, Math.min(4.4, y))]; this.drawMap(); this.refresh(true); });
    cv.addEventListener('pointerup', () => { this.rn.drag = -1; });
  }
  drawMap() {
    const cv = $('#runmap canvas'); if (!cv) return; const M = this.mapXY(cv), d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(M.r.width * d)) { cv.width = Math.round(M.r.width * d); cv.height = Math.round(M.r.height * d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, M.r.width, M.r.height);
    const sc = M.X(1) - M.X(0);
    g.strokeStyle = 'rgba(141,151,179,.12)'; for (let x = 0; x <= 11; x++) { g.beginPath(); g.moveTo(M.X(x), 0); g.lineTo(M.X(x), M.r.height); g.stroke(); }
    g.fillStyle = 'rgba(141,151,179,.6)'; g.font = '10px "JetBrains Mono", monospace'; for (let x = 0; x <= 11; x += 2) g.fillText(x + ' pc', M.X(x) + 2, M.r.height - 6);
    for (const [x, y, m] of RUN.holes) { const rr = runShadowPc(m) * sc; const gr = g.createRadialGradient(M.X(x), M.Y(y), 0, M.X(x), M.Y(y), rr); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.12, 'rgba(255,170,80,.55)'); gr.addColorStop(0.2, 'rgba(255,120,60,.15)'); gr.addColorStop(1, 'rgba(255,90,106,.05)'); g.fillStyle = gr; g.beginPath(); g.arc(M.X(x), M.Y(y), rr, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,106,122,.6)'; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,200,170,.8)'; g.fillText(f0(m / 1e9) + 'B M☉', M.X(x) - 18, M.Y(y) + 3); }
    const R = route(this.rn.w), pts = [RUN.start, ...this.rn.w, RUN.end];
    g.strokeStyle = R.ok ? (R.L <= 12 ? '#7cff9e' : '#9fd0ff') : '#ff5a6a'; g.lineWidth = 2.5; g.shadowColor = g.strokeStyle; g.shadowBlur = 10; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(M.X(p[0]), M.Y(p[1])) : g.moveTo(M.X(p[0]), M.Y(p[1])))); g.stroke(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([3, 5]); g.beginPath(); g.moveTo(M.X(RUN.start[0]), M.Y(0)); g.lineTo(M.X(RUN.end[0]), M.Y(0)); g.stroke(); g.setLineDash([]);
    for (const [i, p] of pts.entries()) { g.fillStyle = i === 0 || i === pts.length - 1 ? '#ffd27a' : '#fff'; g.beginPath(); g.arc(M.X(p[0]), M.Y(p[1]), i === 0 || i === pts.length - 1 ? 6 : 8, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffd27a'; g.fillText(t('rn.from'), M.X(0) - 8, M.Y(0) - 12); g.fillText(t('rn.to'), M.X(RUN.end[0]) - 20, M.Y(0) - 12);
    const A = this.rn.anim; if (A && !A.fail && A.t < 3) { const k = Math.min(1, A.t / 2.6), segs = []; let tot = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(l); tot += l; } let s = k * tot, i = 0; while (i < segs.length - 1 && s > segs[i]) { s -= segs[i]; i++; } const u = Math.min(1, s / segs[i]), px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u; g.fillStyle = '#9fd0ff'; g.shadowColor = '#9fd0ff'; g.shadowBlur = 16; g.beginPath(); g.arc(M.X(px), M.Y(py), 5, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; }
  }
  rnLive(full) {
    this.drawMap(); if (!full) return;
    const R = route(this.rn.w);
    const b = $('#rn-big'); if (b) b.innerHTML = `<div><b class="mono ${R.ok && R.L <= 12 ? 'c-green' : R.ok ? 'c-amber' : 'c-red'}">${f2(R.L)} pc</b><small>${t('rn.len')}</small></div><div><b class="mono">${f1(R.ly)} ly</b><small>${t('rn.ly')}</small></div><div><b class="mono ${R.ok ? 'c-green' : 'c-red'}">${R.ok ? f2(R.clear) + ' pc' : t('rn.blocked')}</b><small>${t('rn.clear')}</small></div>`;
    const m = $('#rn-math');
    if (m) m.innerHTML = `<div>${t('rn.pcL')} 1 pc = 1 AU / tan(1″) = <b>${sci(PC)} m</b> = <b>${f3(PC / LY)} ly</b> · ${t('rn.distance')}</div>
      <div>r<sub>j</sub> = √(GM/g<sub>th</sub>): ${RUN.holes.map(([, , m]) => f0(m / 1e9) + 'B → ' + f2(runShadowPc(m)) + ' pc').join(' · ')}</div>
      <div>L = Σ|P<sub>i+1</sub> − P<sub>i</sub>| = <b>${f3(R.L)} pc</b> · ${t('rn.straight')} ${f1(RUN.end[0])} pc ${t('rn.blockedBy')}</div>`;
    const g = $('#rn-goal'); if (g) g.innerHTML = `${badge(this.goal.run)} ${t('goal.run')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-1.2, Math.min(1.3, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.35, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === 'j' && this.tab === 'hyper') this.doJump(); if (k === 'j' && this.tab === 'run') this.flyRun(); if (k === 'm' && this.tab === 'merger') this.merge(); }
  keyUp() {}

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, S = this.sky.U;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.04;
    // Warp level: jump animations ramp the tunnel in and out.
    let warpT = 0; const Y = this.hy, Rn = this.rn;
    if (Y.anim) { Y.anim.t += dt; const a = Y.anim.t; warpT = a < 1.2 ? (a / 1.2) ** 2 : a < 4.2 ? 1 : Math.max(0, 1 - (a - 4.2) / 0.8); if (a > 5.2) Y.anim = null; }
    if (Rn.anim) { Rn.anim.t += dt; const a = Rn.anim.t; if (!Rn.anim.fail) warpT = a < 0.6 ? a / 0.6 : a < 2.6 ? 1 : Math.max(0, 1 - (a - 2.6) / 0.6); if (a > 3.4) Rn.anim = null; }
    this.warp = tab === 'hyper' || tab === 'run' ? warpT : 0; S.uWarp.value = this.warp;
    // Scene per tab.
    const ship = this.ship; let look = V(0, 0, 0), dist = 26;
    ship.visible = tab !== 'merger'; this.planet.visible = (tab === 'hangar' || tab === 'hyper') && this.warp < 0.5; this.orbitLine.visible = tab === 'hole'; this.grid.visible = tab === 'merger';
    S.uMode.value = tab === 'hole' || tab === 'run' ? 1 : tab === 'merger' ? 2 : 0; S.uDisk.value = tab === 'hole' ? (this.bh.disk ? 1 : 0) : 1;
    if (tab === 'hangar') { ship.position.set(0, 0, 0); ship.rotation.set(0.05 * Math.sin(time * 0.4), Math.PI * 0.15, 0.04 * Math.sin(time * 0.5)); ship.scale.setScalar(1); setThrust(ship, this.hg.thr, time); dist = 24; }
    else if (tab === 'hyper') { const shake = this.warp * 0.12; ship.position.set(Math.sin(time * 37) * shake, Math.sin(time * 41) * shake, 0); ship.rotation.set(0, 0, Math.sin(time * 0.6) * 0.03); ship.scale.setScalar(1); setThrust(ship, 0.4 + 0.6 * this.warp, time); dist = 22; }
    else if (tab === 'hole') {
      S.uBH.value.set(0, 0, 0); S.uRs.value = RS; const B = this.bh, rr = B.x * RS; B.ang += dt * 0.35 / Math.pow(B.x / 3, 1.5);
      ship.scale.setScalar(0.12); ship.position.set(Math.cos(B.ang) * rr, 0, Math.sin(B.ang) * rr); ship.rotation.set(0, -B.ang, 0.2); setThrust(ship, 0.2, time);
      this.orbitLine.scale.setScalar(rr); this.orbitLine.material.color.set(B.x >= 3 ? '#7cff9e' : '#ff5a6a'); look = V(0, 0, 0); dist = 22 * RS;
    } else if (tab === 'merger') {
      const M = this.mg; let sep = 34, ph = time * 0.9, merged = false;
      if (M.anim) { M.anim.t += dt; const k = M.anim.t / 2.6; if (k < 1) { sep = 34 * Math.pow(1 - k, 0.25); ph = 12 * (1 - Math.pow(1 - k, 0.625)) * 6 + time * 0.2; } else { merged = true; if (k > 2.4) M.anim = null; } }
      const r1 = 1.5 * M.m1 / 30, r2 = 1.5 * M.m2 / 30, q = M.m2 / (M.m1 + M.m2);
      if (merged) { S.uMode.value = 1; S.uDisk.value = 0; S.uBH.value.set(0, 0, 0); S.uRs.value = 1.5 * (0.95 * (M.m1 + M.m2)) / 30; }
      else { S.uB1.value.set(Math.cos(ph) * sep * q, 0, Math.sin(ph) * sep * q); S.uB2.value.set(-Math.cos(ph) * sep * (1 - q), 0, -Math.sin(ph) * sep * (1 - q)); S.uR1.value = Math.max(0.6, r1); S.uR2.value = Math.max(0.6, r2); }
      this.gridU.uT.value = time; this.gridU.uA.value = M.anim ? (merged ? Math.max(0, 1.2 - (M.anim.t - 2.6)) : 0.3 + 0.9 * Math.min(1, M.anim.t / 2.6)) : 0.15; this.gridU.uW.value = M.anim && !merged ? 1 + 2 * (M.anim.t / 2.6) : 1;
      dist = 95;
    } else {
      S.uBH.value.set(-60, 8, -260); S.uRs.value = 14; ship.position.set(0, 0, 0); ship.rotation.set(0, Math.PI + 0.25 * Math.sin(time * 0.3), Math.sin(time * 0.5) * 0.1); ship.scale.setScalar(1); setThrust(ship, 0.5 + 0.5 * this.warp, time); dist = 24;
    }
    const R = dist * v.r, cp = V(Math.sin(v.yaw) * Math.cos(v.pitch) * R, Math.sin(v.pitch) * R, Math.cos(v.yaw) * Math.cos(v.pitch) * R).add(look);
    if (tab === 'hyper' && this.warp > 0) cp.lerp(V(0, 4, 18), this.warp);
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.snap = false; this.cam.lookAt(tab === 'hyper' && this.warp > 0 ? V(0, 0, -30).lerp(look, 1 - this.warp) : look);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.sky.sync(this.cam, time);
    this.uiT += dt; if (this.uiT > 0.1) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0 || tab === 'run'); }
  }
  refresh(full) {
    if (!this.entered) return;
    const P = { hangar: 'hg', hyper: 'hy', hole: 'bh', merger: 'mg', run: 'rn' }[this.tab];
    this[P + 'Live'](full);
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
void g0; void G_TH; void AU;
