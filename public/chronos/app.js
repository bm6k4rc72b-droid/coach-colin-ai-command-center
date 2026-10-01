import * as THREE from 'three';
import { DESTINATIONS, ENGINES, roundTrip, stateAt, doppler, kinetic, fmtYears, G_LY } from './sim/relativity.js';
import { orbitClock, ORBITS, breakEven, BH, blackHole, rForFactor, R_E } from './sim/gravity.js';
import { exoticMass, timeMachine, MJ } from './sim/wormhole.js';
import { TABLE, simulate, findHistories } from './sim/paradox.js';
import { buildStarfield, buildShip, buildBlackHole, buildWormhole } from './view/space.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHRONOS · the app: twin paradox, gravitational time, wormhole time machine,
// and the billiard-ball paradox.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => Math.round(x).toLocaleString('en-US'), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3);
const sci = (x, d = 2) => { if (!Number.isFinite(x)) return '∞'; if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))); return Math.abs(e) < 4 ? x.toFixed(Math.max(0, d - e)) : `${(x / 10 ** e).toFixed(d)}×10${sup(e)}`; };
const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'['0123456789'.indexOf(c)] ?? (c === '-' ? '⁻' : c)).join('');
const betaStr = (b) => (b > 0.999 ? `1 − ${sci(1 - b, 1)}` : f3(b));

export class Chronos {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#02030a');
    this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 5000); this.scene.add(this.cam);
    this.scene.add(new THREE.HemisphereLight('#9fb7ff', '#1a1020', 0.6));
    const key = new THREE.DirectionalLight('#ffe2b0', 2.2); key.position.set(4, 3, 2); this.scene.add(key);
    this.stars = buildStarfield(); this.scene.add(this.stars);
    this.ship = buildShip(); this.scene.add(this.ship);
    this.bh = buildBlackHole(); this.scene.add(this.bh);
    this.worm = buildWormhole(1.2); this.scene.add(this.worm);
    this.view = { yaw: 0.35, pitch: 0.2, r: 9, drag: null, last: 0 };
    // Twin paradox.
    this.trip = { dest: 'proxima', a: 1, cap: 0.999999, engine: 'photon', playing: false, u: 0, speed: 1 };
    this.computeTrip();
    // Gravity.
    this.grav = { orbit: 'gps', h: ORBITS.gps, M: 'gargantua', r: 6, disk: true, local: 0, earth: 0 };
    // Wormhole.
    this.wh = { b: 10, D: 1, T: 10, beta: 0.9 };
    // Paradox.
    this.px = { delta: 13.5, aim: 0, res: null, sel: -1, time: -2, playing: false };
    this.score = { twin: false, extreme: false, gps: false, bh: false, miller: false, exotic: false, ctc: false, paradox: false };
    this.tab = 'twin'; this.entered = false; this.uiT = 0; this.uiSlow = 0;
    app.stage.use(this.scene, this.cam);
  }

  computeTrip() { const T = this.trip; this.rt = roundTrip(DESTINATIONS[T.dest].d, T.a, T.cap, T.engine); }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab === 'paradox' && !this.px.res) this.solveParadox(false);
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { twin: ['twinPanel', 'twinSide', 'bindTwin'], gravity: ['gravPanel', 'gravSide', 'bindGrav'], wormhole: ['whPanel', 'whSide', 'bindWh'], paradox: ['pxPanel', 'pxSide', 'bindPx'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }

  // ═══ TWIN PARADOX ══════════════════════════════════
  twinPanel() {
    const T = this.trip, capExp = -Math.log10(1 - T.cap);
    return `<header class="lv-head mono">${t('tw.title')}</header><p class="intro">${t('tw.intro')}</p>
      <header class="lv-sub mono">${t('tw.dest')}</header>${this.chips('dest', Object.keys(DESTINATIONS), T.dest, (k) => `${t('dest.' + k)} <small>${DESTINATIONS[k].d >= 1000 ? sci(DESTINATIONS[k].d, 1) : DESTINATIONS[k].d} ly</small>`)}
      ${this.slider('tw-a', t('tw.accel'), T.a, 0.1, 5, 0.1, f1(T.a) + ' g')}
      ${this.slider('tw-cap', t('tw.cap'), capExp, 0.3, 12, 0.1, 'β ≤ ' + betaStr(T.cap))}
      <header class="lv-sub mono">${t('tw.engine')}</header>${this.chips('eng', Object.keys(ENGINES), T.engine, (k) => t('eng.' + k))}
      <div class="chips"><button class="btn primary" id="tw-go">${T.playing ? '❚❚ ' + t('tw.pause') : '▶ ' + t('tw.launch')}</button><button class="btn seg" id="tw-reset">↺</button></div>
      <div class="clocks"><div><small>${t('tw.earthClock')}</small><b class="mono" id="ck-earth">—</b></div><div><small>${t('tw.shipClock')}</small><b class="mono gold" id="ck-ship">—</b></div></div>
      <div class="kv mono" id="tw-kv"></div>`;
  }
  twinSide() {
    return `<header class="lv-head mono">${t('tw.result')}</header><div class="bigstats" id="tw-big"></div>
      <canvas class="cv mink" id="cv-mink"></canvas><div class="math mono" id="tw-math"></div>`;
  }
  bindTwin() {
    const T = this.trip;
    this.bindChips('dest', (k) => { T.dest = k; T.u = 0; T.playing = false; this.computeTrip(); if (['galcentre', 'andromeda', 'pleiades'].includes(k)) this.score.extreme = true; });
    this.bindChips('eng', (k) => { T.engine = k; this.computeTrip(); });
    $('#tw-a').oninput = (e) => { T.a = +e.target.value; $('#tw-a-v').textContent = f1(T.a) + ' g'; this.computeTrip(); this.refresh(true); };
    $('#tw-cap').oninput = (e) => { T.cap = 1 - 10 ** -+e.target.value; $('#tw-cap-v').textContent = 'β ≤ ' + betaStr(T.cap); if (+e.target.value >= 4) this.score.extreme = true; this.computeTrip(); this.refresh(true); };
    $('#tw-go').onclick = () => { if (T.u >= 1) T.u = 0; T.playing = !T.playing; sfx.select(); this.render(); if (T.playing) this.caption('cap.launch'); };
    $('#tw-reset').onclick = () => { T.u = 0; T.playing = false; this.render(); };
  }
  // Journey state at fraction u of the round trip (Earth time).
  journey(u) {
    const L = this.rt.L, te = u * 2 * L.T;
    if (te <= L.T) { const s = stateAt(L, te); return { ...s, te, tau: s.tau, x: s.x, dir: 1 }; }
    const s = stateAt(L, te - L.T); return { ...s, te, tau: L.tau + s.tau, x: L.D - s.x, dir: -1 };
  }
  twinLive(full) {
    const R = this.rt, L = R.L, J = this.journey(this.trip.u);
    const e = $('#ck-earth'), s = $('#ck-ship'); if (e) e.textContent = fmtYears(J.te); if (s) s.textContent = fmtYears(J.tau);
    const kv = $('#tw-kv'); if (kv) kv.innerHTML = `<span>${t('tw.phase')}</span><b>${t('ph.' + J.phase)}</b><span>β</span><b>${betaStr(J.beta)}</b><span>γ</span><b>${sci(J.gamma, 2)}</b><span>${t('tw.dist')}</span><b>${f2(J.x)} ly</b><span>${t('tw.doppler')}</span><b>×${sci(doppler(J.beta), 2)}</b>`;
    if (!full) return;
    const big = $('#tw-big');
    if (big) big.innerHTML = `<div><b class="mono">${fmtYears(R.earth)}</b><small>${t('tw.earthAges')}</small></div><div><b class="mono gold">${fmtYears(R.ship)}</b><small>${t('tw.shipAges')}</small></div><div><b class="mono">${fmtYears(R.gap)}</b><small>${t('tw.gap')}</small></div>`;
    const m = $('#tw-math'), a = L.a;
    if (m) m.innerHTML = `<div>a = ${f1(this.trip.a)} g = <b>${f3(a)}</b> ly/yr² · η<sub>max</sub> = ${L.coast > 0 ? 'artanh(β<sub>cap</sub>)' : 'arcosh(1 + aD/2)'} = <b>${f2(L.eta1)}</b></div>
      <div>τ<sub>burn</sub> = η/a = <b>${fmtYears(L.tau1)}</b> · t<sub>burn</sub> = sinh(η)/a = <b>${fmtYears(L.t1)}</b> · x = (cosh η − 1)/a = <b>${sci(L.x1, 2)} ly</b></div>
      <div>β<sub>max</sub> = tanh η = <b>${betaStr(L.beta)}</b> · γ<sub>max</sub> = cosh η = <b>${sci(L.gamma, 2)}</b>${L.coast > 0 ? ` · ${t('tw.coast')} ${sci(L.coast, 2)} ly` : ''}</div>
      <div>${t('tw.massRatio')} m₀/m₁ = e^(4η·c/u) = <b>10${sup(Math.round(R.log10MR))}</b> (${t('eng.' + this.trip.engine)})</div>
      <div>${t('tw.energy')} (γ − 1)mc² ${t('tw.per1000t')} = <b>${sci(kinetic(L.gamma, 1e6), 2)} J</b> ≈ <b>${sci(kinetic(L.gamma, 1e6) / 5.8e20, 1)}</b> × ${t('tw.worldYear')}</div>`;
    this.drawMinkowski();
  }
  // Minkowski diagram: Earth time up, distance across; light cones at 45°, the ship's worldline with
  // a tick every tenth of its proper time, and the ship's line of simultaneity at "now".
  drawMinkowski() {
    const cv = $('#cv-mink'); if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d;
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height, L = this.rt.L, Tt = 2 * L.T, D = L.D, pad = 26;
    const k = Math.min((W - pad * 2) / (D * 1.25), (H - pad * 2) / Tt);   // same scale on both axes keeps light at 45°
    const X = (x) => pad + x * k, Y = (tt) => H - pad - tt * k;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,204,102,.25)'; g.setLineDash([3, 4]);
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(Math.min(D * 1.25, Tt)), Y(Math.min(D * 1.25, Tt))); g.stroke(); g.setLineDash([]);
    g.strokeStyle = 'rgba(127,232,255,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(Tt)); g.stroke();
    g.strokeStyle = '#ffcc66'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 200; i++) { const J = this.journey(i / 200); i ? g.lineTo(X(J.x), Y(J.te)) : g.moveTo(X(J.x), Y(J.te)); } g.stroke();
    // Proper-time ticks.
    const tauTot = this.rt.ship, step = tauTot / 10; let next = step;
    g.fillStyle = '#ffcc66';
    for (let i = 0; i <= 2000; i++) { const J = this.journey(i / 2000); if (J.tau >= next) { g.beginPath(); g.arc(X(J.x), Y(J.te), 2.4, 0, 7); g.fill(); next += step; } }
    g.fillStyle = 'rgba(127,232,255,.9)'; for (let i = 1; i <= 10; i++) { g.fillRect(X(0) - 4, Y((Tt * i) / 10) - 1, 8, 2); }
    // Now + simultaneity.
    const J = this.journey(this.trip.u), b = J.beta * J.dir;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(0), Y(J.te - b * J.x)); g.lineTo(X(J.x), Y(J.te)); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(J.x), Y(J.te), 4, 0, 7); g.fill();
    g.font = '10px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(232,238,252,.8)';
    g.fillText(t('tw.mkTitle'), pad, 14); g.fillText(`x (ly) → ${sci(D, 1)}`, W - 110, H - 8); g.save(); g.translate(10, H - pad); g.rotate(-Math.PI / 2); g.fillText(`t_Earth (yr) → ${sci(Tt, 1)}`, 0, 0); g.restore();
    g.fillStyle = '#7fe8ff'; g.fillText(t('tw.earth'), X(0) + 6, Y(0) - 6); g.fillStyle = '#ffcc66'; g.fillText(t('tw.ship'), X(D) - 20, Y(L.T) - 6);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText(t('tw.simul', { y: fmtYears(Math.max(0, J.te - b * J.x)) }), pad, 28);
  }

  // ═══ GRAVITY ═══════════════════════════════════════
  gravPanel() {
    const G = this.grav, hk = G.h / 1000;
    return `<header class="lv-head mono">${t('gr.title')}</header><p class="intro">${t('gr.intro')}</p>
      <header class="lv-sub mono">${t('gr.gps')}</header>${this.chips('orb', Object.keys(ORBITS), G.orbit, (k) => t('orb.' + k))}
      ${this.slider('gr-h', t('gr.alt'), Math.log10(hk), 2, 4.7, 0.01, f0(hk) + ' km')}
      <div class="math mono" id="gr-gps"></div>
      <header class="lv-sub mono">${t('gr.bh')}</header>${this.chips('bhm', Object.keys(BH), G.M, (k) => t('bh.' + k))}
      ${this.slider('gr-r', t('gr.r'), Math.log10(G.r - 1), -4, 1.3, 0.01, f3(G.r) + ' r<sub>s</sub>')}
      <label class="toggle"><input type="checkbox" id="gr-disk" ${G.disk ? 'checked' : ''}> <span>${t('gr.disk')}</span></label>
      <div class="chips"><button class="btn primary" id="gr-miller">${t('gr.miller')}</button></div>`;
  }
  gravSide() {
    return `<header class="lv-head mono">${t('gr.clocks')}</header>
      <div class="clocks"><div><small>${t('gr.you')}</small><b class="mono gold" id="gc-you">—</b></div><div><small>${t('gr.earth')}</small><b class="mono" id="gc-earth">—</b></div></div>
      <div class="bigstats" id="gr-big"></div><div class="math mono" id="gr-bhm"></div>
      <canvas class="cv chart" id="cv-gps"></canvas>`;
  }
  bindGrav() {
    const G = this.grav;
    this.bindChips('orb', (k) => { G.orbit = k; G.h = ORBITS[k]; this.score.gps = true; });
    $('#gr-h').oninput = (e) => { G.h = 10 ** +e.target.value * 1000; G.orbit = null; $('#gr-h-v').textContent = f0(G.h / 1000) + ' km'; this.score.gps = true; this.refresh(true); };
    this.bindChips('bhm', (k) => { G.M = k; });
    $('#gr-r').oninput = (e) => { G.r = 1 + 10 ** +e.target.value; $('#gr-r-v').innerHTML = (G.r < 1.001 ? '1 + ' + sci(G.r - 1, 1) : f3(G.r)) + ' r<sub>s</sub>'; if (G.r < 1.1) this.score.bh = true; G.local = G.earth = 0; this.refresh(true); };
    $('#gr-disk').onchange = (e) => { G.disk = e.target.checked; };
    $('#gr-miller').onclick = () => { G.M = 'gargantua'; G.r = rForFactor(61320); G.local = G.earth = 0; this.score.miller = this.score.bh = true; this.render(); this.caption('cap.miller'); sfx.select(); };
  }
  gravLive(full) {
    const G = this.grav, B = blackHole(BH[G.M], G.r);
    const y = $('#gc-you'), e = $('#gc-earth'); if (y) y.textContent = fmtYears(G.local / 8766); if (e) e.textContent = fmtYears(G.earth / 8766);
    if (!full) return;
    const o = orbitClock(G.h), gp = $('#gr-gps');
    if (gp) gp.innerHTML = `<div>v = √(GM/r) = <b>${f2(o.v / 1000)} km/s</b> · r = ${f0(o.r / 1000)} km</div>
      <div>${t('gr.gravTerm')} GM/c²·(1/R⊕ − 1/r) = <b>${o.grav >= 0 ? '+' : ''}${f1(o.grav * 1e6)} µs/${t('gr.day')}</b></div>
      <div>${t('gr.speedTerm')} −v²/2c² = <b>${f1(o.speed * 1e6)} µs/${t('gr.day')}</b></div>
      <div>${t('gr.net')} <b class="${o.net > 0 ? 'c-green' : 'c-red'}">${o.net >= 0 ? '+' : ''}${f1(o.net * 1e6)} µs/${t('gr.day')}</b> · ${t('gr.error')} c·Δt = <b>${f1(o.error / 1000)} km/${t('gr.day')}</b></div>
      <div class="small">${t('gr.breakEven', { h: f0(breakEven() / 1000) })}</div>`;
    const big = $('#gr-big');
    if (big) big.innerHTML = `<div><b class="mono gold">${sci(B.factor, 3)}×</b><small>${t('gr.factor')}</small></div><div><b class="mono">${fmtYears(B.factor / 8766)}</b><small>${t('gr.perHour')}</small></div><div><b class="mono ${B.stableOrbit ? '' : 'c-red'}">${G.r >= 3 ? t('gr.stable') : G.r > 1.5 ? t('gr.unstable') : t('gr.noOrbit')}</b><small>${t('gr.orbitQ')}</small></div>`;
    const m = $('#gr-bhm');
    if (m) m.innerHTML = `<div>r<sub>s</sub> = 2GM/c² = <b>${sci(B.rs / 1000, 3)} km</b> · M = ${sci(BH[G.M], 2)} M☉</div>
      <div>dτ/dt = √(1 − r<sub>s</sub>/r) = <b>${sci(B.hover, 4)}</b> → ${t('gr.hourHere')} = <b>${fmtYears(B.factor / 8766)}</b> ${t('gr.onEarth')}</div>
      <div>${t('gr.hoverA')} GM/(r²√(1 − r<sub>s</sub>/r)) = <b>${sci(B.aHover / 9.81, 2)} g</b></div>
      <div>${t('gr.tidal')} 2GM·L/r³ (L = 2 m) = <b class="${B.tidal > 9.81 * 50 ? 'c-red' : ''}">${sci(B.tidal / 9.81, 2)} g</b>${B.tidal > 9.81 * 50 ? ' — ' + t('gr.spaghetti') : ''}</div>
      ${G.r < 1.0001 ? `<div class="small">${t('gr.millerNote')}</div>` : ''}`;
    const pts = []; for (let lg = 2; lg <= 4.7; lg += 0.02) { const h = 10 ** lg * 1000; pts.push([lg, orbitClock(h).net * 1e6]); }
    const now = orbitClock(G.h).net * 1e6;
    lineChart($('#cv-gps'), { x0: 2, x1: 4.7, y0: -35, y1: 55, xTicks: [2, 3, 4, Math.log10(35786)], xFmt: (v) => f0(10 ** v) + ' km', yFmt: (v) => Math.round(v), title: t('gr.chart'),
      series: [{ pts, color: '#ffcc66', label: 'µs/day' }], marks: [{ y: 0, color: 'rgba(232,238,252,.4)' }, { x: Math.log10(breakEven() / 1000), color: '#7fe8ff', label: t('gr.even') }, { dot: [Math.log10(G.h / 1000), now], color: '#ff4fd8' }] });
  }

  // ═══ WORMHOLE ══════════════════════════════════════
  whPanel() {
    const W = this.wh;
    return `<header class="lv-head mono">${t('wh.title')}</header><p class="intro">${t('wh.intro')}</p>
      ${this.slider('wh-b', t('wh.throat'), Math.log10(W.b), 0, 4, 0.01, sci(W.b, 2) + ' m')}
      <header class="lv-sub mono">${t('wh.machine')}</header><p class="small">${t('wh.machineHow')}</p>
      ${this.slider('wh-D', t('wh.D'), W.D, 0.1, 10, 0.1, f1(W.D) + ' ly')}
      ${this.slider('wh-T', t('wh.T'), W.T, 1, 40, 0.5, f1(W.T) + ' yr')}
      ${this.slider('wh-beta', t('wh.beta'), W.beta, 0.1, 0.999, 0.001, 'β = ' + f3(W.beta))}
      <div class="kv mono" id="wh-kv"></div>`;
  }
  whSide() {
    return `<header class="lv-head mono">${t('wh.result')}</header><div class="bigstats" id="wh-big"></div><div class="math mono" id="wh-math"></div>
      <canvas class="cv chart tall" id="cv-wh"></canvas>
      <header class="lv-sub mono">${t('wh.other')}</header><ul class="roles">${['tipler', 'godel', 'alcubierre', 'protect'].map((k) => `<li><b>${t('o.' + k)}</b><span>${t('o.' + k + '.d')}</span></li>`).join('')}</ul>`;
  }
  bindWh() {
    const W = this.wh;
    $('#wh-b').oninput = (e) => { W.b = 10 ** +e.target.value; $('#wh-b-v').textContent = sci(W.b, 2) + ' m'; this.score.exotic = true; this.refresh(true); };
    for (const [id, k, fmt] of [['wh-D', 'D', (v) => f1(v) + ' ly'], ['wh-T', 'T', (v) => f1(v) + ' yr'], ['wh-beta', 'beta', (v) => 'β = ' + f3(v)]]) $('#' + id).oninput = (e) => { W[k] = +e.target.value; $('#' + id + '-v').textContent = fmt(W[k]); this.refresh(true); };
  }
  whLive(full) {
    if (!full) return;
    const W = this.wh, m = exoticMass(W.b), M = timeMachine(W.T, W.beta, W.D);
    if (M.ctc) this.score.ctc = true;
    const big = $('#wh-big');
    if (big) big.innerHTML = `<div><b class="mono">${sci(m / MJ, 2)}</b><small>${t('wh.jupiters')}</small></div><div><b class="mono gold">${fmtYears(M.delta)}</b><small>${t('wh.offset')}</small></div><div><b class="mono ${M.ctc ? 'c-green' : 'c-red'}">${M.ctc ? t('wh.on') : t('wh.off')}</b><small>${t('wh.ctc')}</small></div>`;
    const kv = $('#wh-kv'); if (kv) kv.innerHTML = `<span>γ</span><b>${f2(M.gamma)}</b><span>${t('wh.mouthAge')}</span><b>${fmtYears(M.mouthAge)}</b><span>${t('wh.margin')}</span><b class="${M.ctc ? 'c-green' : 'c-red'}">${M.margin >= 0 ? '+' : ''}${fmtYears(Math.abs(M.margin))}</b>`;
    const mt = $('#wh-math');
    if (mt) mt.innerHTML = `<div>r(l) = √(b² + l²) · z(r) = b·arcosh(r/b)</div>
      <div>|m<sub>exotic</sub>| ≈ c²b/G = ${sci(m, 2)} kg = <b>${sci(m / MJ, 2)} M<sub>Jupiter</sub></b> (${sci(m / 1.989e30, 2)} M☉)</div>
      <div>Δ = T·(1 − 1/γ) = ${f1(W.T)}·(1 − 1/${f2(M.gamma)}) = <b>${fmtYears(M.delta)}</b></div>
      <div>${t('wh.cond')} Δ > D/c = ${f1(W.D)} yr → <b class="${M.ctc ? 'c-green' : 'c-red'}">${M.ctc ? t('wh.formed') : t('wh.notYet')}</b></div>
      <div class="small">${t('wh.earliest')}</div>`;
    // Mouth clocks vs coordinate (Earth) time.
    const pts = [], pts2 = []; for (let i = 0; i <= 100; i++) { const tt = (W.T * 1.4 * i) / 100; pts.push([tt, tt]); pts2.push([tt, tt <= W.T ? tt / M.gamma : W.T / M.gamma + (tt - W.T)]); }
    lineChart($('#cv-wh'), { x0: 0, x1: W.T * 1.4, y0: 0, y1: W.T * 1.4, xFmt: (v) => f1(v), title: t('wh.chart'), series: [{ pts, color: '#7fe8ff', label: t('wh.mouthA') }, { pts: pts2, color: '#ffcc66', label: t('wh.mouthB') }], marks: [{ x: W.T, color: 'rgba(255,79,216,.6)', label: t('wh.back') }] });
  }

  // ═══ PARADOX ═══════════════════════════════════════
  solveParadox(announce = true) {
    const P = this.px; P.res = findHistories((P.aim * Math.PI) / 180, P.delta); P.sel = P.res.histories.length ? 0 : -1; P.time = -2; P.playing = true;
    if (P.res.histories.some((h) => h.kind === 'glancing')) this.score.paradox = true;
    if (announce) { this.app.feed.push(P.res.histories.length ? 'px.found' : 'px.none', P.res.histories.length ? 'ok' : 'warn', { n: P.res.histories.length }); sfx.confirm(); }
  }
  pxPanel() {
    const P = this.px;
    return `<header class="lv-head mono">${t('px.title')}</header><p class="intro">${t('px.intro')}</p>
      ${this.slider('px-delta', t('px.delta'), P.delta, 10, 17, 0.1, f1(P.delta) + ' s')}
      ${this.slider('px-aim', t('px.aim'), P.aim, -3, 3, 0.05, f2(P.aim) + '°')}
      <div class="chips"><button class="btn primary" id="px-solve">${t('px.solve')}</button><button class="btn seg" id="px-naive">${t('px.naiveBtn')}</button><button class="btn seg" id="px-play">${P.playing ? '❚❚' : '▶'}</button></div>
      <header class="lv-sub mono">${t('px.histories')}</header><ul class="hist" id="px-list"></ul>`;
  }
  pxSide() { return `<header class="lv-head mono">${t('px.ideas')}</header><ul class="roles">${['novikov', 'branch', 'deutsch', 'protect'].map((k) => `<li><b>${t('pi.' + k)}</b><span>${t('pi.' + k + '.d')}</span></li>`).join('')}</ul><div class="math mono" id="px-math"></div>`; }
  bindPx() {
    const P = this.px;
    $('#px-delta').oninput = (e) => { P.delta = +e.target.value; $('#px-delta-v').textContent = f1(P.delta) + ' s'; P.res = null; clearTimeout(this.pt); this.pt = setTimeout(() => { this.solveParadox(false); this.render(); }, 250); };
    $('#px-aim').oninput = (e) => { P.aim = +e.target.value; $('#px-aim-v').textContent = f2(P.aim) + '°'; P.res = null; clearTimeout(this.pt); this.pt = setTimeout(() => { this.solveParadox(false); this.render(); }, 250); };
    $('#px-solve').onclick = () => { this.solveParadox(true); this.render(); };
    $('#px-naive').onclick = () => { P.sel = -1; P.time = -2; P.playing = true; this.render(); this.caption(P.res?.paradox ? 'cap.paradox' : 'cap.noParadox'); };
    $('#px-play').onclick = () => { P.playing = !P.playing; this.render(); };
  }
  pxLive(full) {
    this.drawTable();
    if (!full) return;
    const P = this.px, R = P.res, ul = $('#px-list');
    if (ul && R) ul.innerHTML = `<li class="${P.sel === -1 ? 'sel' : ''} ${R.paradox ? 'bad' : 'ok'}" data-h="-1"><b>${t('px.naive')}</b><span>${R.paradox ? t('px.naiveBad') : t('px.naiveOk')}</span></li>` + R.histories.map((h, i) => `<li class="${P.sel === i ? 'sel' : ''} ok" data-h="${i}"><b>${t('px.hist', { n: i + 1 })} · ${t('px.k.' + h.kind)}</b><span>${h.kind === 'glancing' ? t('px.glance', { d: f1(Math.abs(h.deflect)), te: f2(h.H.te) }) : t('px.missD')}</span></li>`).join('') + (R.histories.length ? '' : `<li class="bad"><span>${t('px.noneFound')}</span></li>`);
    ul?.querySelectorAll('[data-h]').forEach((li) => (li.onclick = () => { P.sel = +li.dataset.h; P.time = -2; P.playing = true; this.refresh(true); sfx.select(); }));
    const m = $('#px-math'); const H = P.sel >= 0 ? R?.histories[P.sel]?.H : R?.naive.R;
    if (m) m.innerHTML = `<div>${t('px.map')}</div>${H ? `<div>H = (t<sub>e</sub> ${f2(H.te)}, x ${f2(H.px)}, y ${f2(H.py)}, v ${f2(Math.hypot(H.vx, H.vy))} @ ${f1((Math.atan2(H.vy, H.vx) * 180) / Math.PI)}°)</div>` : ''}<div class="small">${t('px.mapWhy')}</div>`;
  }
  // The billiard table: mouths, both balls, trails, time.
  drawTable() {
    const cv = $('#table'); if (!cv || this.tab !== 'paradox') return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, Hh = r.height, k = Math.min(W / 20, Hh / 13), X = (x) => W / 2 + (x + 0.5) * k, Y = (y) => Hh / 2 - (y + 2.5) * k;
    g.fillStyle = 'rgba(4,8,18,.92)'; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = 'rgba(127,232,255,.07)'; for (let x = -10; x <= 10; x++) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), Hh); g.stroke(); } for (let y = -10; y <= 5; y++) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
    const { A, B, Rm, rb, P0 } = TABLE, P = this.px, R = P.res; if (!R) return;
    const mouth = (c, col, label) => { const gr = g.createRadialGradient(X(c.x), Y(c.y), 0, X(c.x), Y(c.y), Rm * k); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, col + '33'); gr.addColorStop(1, col + 'cc'); g.fillStyle = gr; g.beginPath(); g.arc(X(c.x), Y(c.y), Rm * k, 0, 7); g.fill(); g.fillStyle = col; g.font = '600 11px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(label, X(c.x), Y(c.y) - Rm * k - 6); };
    mouth(A, '#ff4fd8', t('px.mouthA')); mouth(B, '#7fe8ff', t('px.mouthB', { d: f1(P.delta) }));
    const H = P.sel >= 0 ? R.histories[P.sel]?.H : R.naive.R;
    const sim = simulate((P.aim * Math.PI) / 180, P.delta, H);
    const tEnd = 28, tt = P.time;
    // Trails.
    for (const [fn, col] of [[sim.young, '#7fe8ff'], [sim.old, '#ffcc66']]) { g.strokeStyle = col; g.globalAlpha = 0.45; g.setLineDash([4, 4]); g.beginPath(); let started = false; for (let s = -6; s <= tEnd; s += 0.05) { const p = fn(s); if (!p) { started = false; continue; } if (!started) { g.moveTo(X(p.x), Y(p.y)); started = true; } else g.lineTo(X(p.x), Y(p.y)); } g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
    if (sim.hit) { g.strokeStyle = '#fff'; g.beginPath(); g.arc(X(sim.hit.x), Y(sim.hit.y), 9, 0, 7); g.stroke(); }
    // Balls now.
    const ball = (p, col, label) => { if (!p) return; const gr = g.createRadialGradient(X(p.x) - 3, Y(p.y) - 3, 1, X(p.x), Y(p.y), rb * k); gr.addColorStop(0, '#fff'); gr.addColorStop(1, col); g.fillStyle = gr; g.shadowColor = col; g.shadowBlur = 16; g.beginPath(); g.arc(X(p.x), Y(p.y), rb * k, 0, 7); g.fill(); g.shadowBlur = 0; g.fillStyle = col; g.font = '10px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillText(label, X(p.x) + rb * k + 4, Y(p.y) - 4); };
    ball(sim.young(tt), '#7fe8ff', t('px.young')); ball(sim.old(tt), '#ffcc66', t('px.older'));
    g.fillStyle = 'rgba(232,238,252,.8)'; g.font = '11px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillText(`t = ${f1(tt)} s`, 12, 18);
    g.fillText(P.sel === -1 ? (R.paradox ? t('px.statusParadox') : t('px.statusOk')) : t('px.statusConsistent'), 12, 34);
    if (sim.entered && tt > sim.entered.tA) { g.fillStyle = '#ff4fd8'; g.fillText(t('px.enteredAt', { t: f2(sim.entered.tA), te: f2(sim.entered.tA - P.delta) }), 12, 50); }
    if (P.sel === -1 && R.paradox && !sim.entered && tt > 14) { g.fillStyle = '#ff5577'; g.fillText(t('px.never'), 12, 50); }
    void P0;
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-1.2, Math.min(1.2, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(4, Math.min(40, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === ' ') { if (this.tab === 'twin') $('#tw-go')?.click(); if (this.tab === 'paradox') $('#px-play')?.click(); } }

  update(dt, time) {
    const v = this.view; if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.05;
    const tab = this.tab;
    this.ship.visible = tab === 'twin'; this.bh.visible = tab === 'gravity'; this.worm.visible = tab === 'wormhole'; this.stars.visible = tab !== 'gravity';
    // Twin: advance the journey (whole round trip in ~30 s), drive the starfield.
    let beta = 0;
    if (tab === 'twin') {
      const T = this.trip; if (T.playing) { T.u = Math.min(1, T.u + dt / 30); if (T.u >= 1) { T.playing = false; if (this.rt.L.beta >= 0.9) this.score.twin = true; this.app.feed.push('tw.home', 'ok', { e: fmtYears(this.rt.earth), s: fmtYears(this.rt.ship) }); this.render(); } }
      const J = this.journey(T.u); beta = J.beta;
      const fwd = new THREE.Vector3(0, 0, -J.dir);
      this.stars.material.uniforms.uFwd.value.copy(fwd);
      this.ship.rotation.set(0, J.dir > 0 ? 0 : Math.PI, 0);
      // During deceleration the ship flips: engine faces the direction of travel.
      if (J.phase === 'decel') this.ship.rotation.y += Math.PI;
      const thrust = J.phase === 'accel' || J.phase === 'decel';
      this.ship.userData.flame.visible = thrust && T.playing; this.ship.userData.flame.scale.set(1, 0.8 + 0.3 * Math.sin(time * 40), 1);
      // Chase camera behind the ship, looking along the direction of travel, so the aberration
      // tunnel of stars opens ahead (drag swings it around).
      const r = v.r, sw = Math.sin(v.yaw) * 0.6, back = fwd.clone().multiplyScalar(-1);
      this.cam.position.set(back.x * r * Math.cos(sw) + sw * r * 0.6, 1.6 + Math.sin(v.pitch) * r * 0.5, back.z * r * Math.cos(sw));
      this.cam.lookAt(fwd.x * 6, 0, fwd.z * 6); this.cam.fov = 62;
    } else if (tab === 'gravity') {
      const G = this.grav, B = blackHole(BH[G.M], G.r); G.local += dt * 0.25; G.earth += dt * 0.25 * B.factor;   // 1 s of screen ≈ 15 min here
      const u = this.bh.material.uniforms, R = 22 + v.r - 9;
      const cp = new THREE.Vector3(Math.sin(v.yaw) * Math.cos(0.12 + v.pitch * 0.2) * R, Math.sin(0.12 + v.pitch * 0.2) * R, Math.cos(v.yaw) * Math.cos(0.12 + v.pitch * 0.2) * R);
      this.cam.position.copy(cp); this.cam.lookAt(0, 0, 0); this.cam.fov = 50; this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
      u.uCam.value.copy(cp); u.uInvProj.value.copy(this.cam.projectionMatrixInverse); u.uCamRot.value.extractRotation(this.cam.matrixWorld); u.uTime.value = time; u.uProbe.value = Math.min(20, Math.max(1.02, G.r)); u.uDisk.value = G.disk ? 1 : 0;
    } else if (tab === 'wormhole') {
      const r = v.r + 4; this.cam.position.set(Math.sin(v.yaw) * Math.cos(0.45) * r, Math.sin(0.45) * r + 1, Math.cos(v.yaw) * Math.cos(0.45) * r); this.cam.lookAt(0, 0, 0); this.cam.fov = 50;
      this.worm.userData.mat.opacity = 0.35 + 0.15 * Math.sin(time * 1.5); this.worm.rotation.y += dt * 0.05;
      this.worm.scale.setScalar(1 + 0.25 * Math.log10(this.wh.b) / 4);
    } else {
      this.cam.position.set(Math.sin(time * 0.02) * 2, 0.5, 6); this.cam.lookAt(0, 0, -10); this.cam.fov = 55;
      const P = this.px; if (P.playing) { P.time += dt * 2.2; if (P.time > 28) P.time = -2; }
    }
    this.stars.material.uniforms.uBeta.value = beta;
    this.stars.material.uniforms.uPix.value = Math.min(2, devicePixelRatio || 1);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; this.uiSlow += dt;
    if (this.uiT > 0.08) { this.uiT = 0; const full = this.uiSlow > 0.35; if (full) this.uiSlow = 0; this.refresh(full); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'twin') this.twinLive(full);
    if (this.tab === 'gravity') this.gravLive(full);
    if (this.tab === 'wormhole') this.whLive(full);
    if (this.tab === 'paradox') this.pxLive(full);
  }

  showReport() {
    const S = this.score;
    const rows = [[t('rep.twin'), S.twin], [t('rep.extreme'), S.extreme], [t('rep.gps'), S.gps], [t('rep.bh'), S.bh], [t('rep.miller'), S.miller], [t('rep.exotic'), S.exotic], [t('rep.ctc'), S.ctc], [t('rep.paradox'), S.paradox]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
export { G_LY, R_E };
