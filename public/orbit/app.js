import * as THREE from 'three';
import { Fighter, JET, cd0, breguet, terrain } from './sim/fighter.js';
import { atmosphere, G0, RE, MU, OMEGA_E } from './sim/atmos.js';
import { Ascent, VOLTA, pumpPower, tsiolkovsky, massRatioFor, airPerf } from './sim/spaceplane.js';
import { Craft, hohmann, vCirc, vEsc, period, planeChange, earthBoost, launchAzimuth, nodalRate, ssoInclination, propFor, circularState } from './sim/orbit.js';
import { Surveillance, Launch, expectedCasualties, linkBudget, EC_LIMIT, RANGE, radarSnr, P_FAIL, N_FRAG } from './sim/range.js';
import { SCENARIOS, OPTIONS, evidence, crypto } from './sim/cyber.js';
import { buildWorld } from './view/world.js';
import { buildCockpit } from './view/cockpit.js';
import { buildFighter } from './view/models.js';
import { buildSpaceScene } from './view/spacescene.js';
import { buildOrbitScene, toThree } from './view/orbitscene.js';
import { drawRange } from './view/rangemap.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// ORBIT · the app: fighter cockpit, spaceplane to orbit, orbital mechanics,
// launch range surveillance and the cyber range.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const mmss = (s) => { const x = Math.max(0, Math.floor(s)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };
const hms = (s) => { const x = Math.max(0, Math.floor(s)); return `${Math.floor(x / 3600)}:${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const sci = (x) => (x === 0 ? '0' : x.toExponential(1).replace('e', '×10^').replace('^-', '⁻').replace('^+', '').replace(/\^?(\d+)$/, (m, d) => d.split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('')));
const WARPS_ASC = [1, 5, 20, 60], WARPS_ORB = [1, 10, 100, 1000];

export class OrbitApp {
  constructor(app) {
    this.app = app; this.tab = 'cockpit'; this.entered = false; this.uiT = 0; this.uiSlow = 0;
    // Fighter world.
    this.world = buildWorld();
    this.fcam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 500000);
    this.world.scene.add(this.fcam);
    this.cockpit = buildCockpit(this.fcam);
    this.jetModel = buildFighter(); this.world.scene.add(this.jetModel.group);
    this.jet = new Fighter(); this.jet.ap = { alt: 3000, hdg: 90, spd: 230 };
    this.keys = new Set(); this.view = 'cockpit'; this.chase = { yaw: 0, pitch: 0.12 };
    // Spaceplane.
    this.space = buildSpaceScene();
    this.ascOpts = { payload: VOLTA.payload, airbreathe: true, dropBatt: true, targetKm: 400 };
    this.asc = new Ascent(this.ascOpts); this.ascRun = false; this.warpAsc = 2;
    // Orbit.
    this.orb = buildOrbitScene();
    this.craft = new Craft({ altKm: 400, incDeg: 28.5 }); this.warpOrb = 1; this.orbRun = true; this.plan = { dv: 100, dir: 'pro' }; this.pending = null; this.fromAscent = false;
    // Range.
    this.surv = new Surveillance(); this.launch = null; this.count = { t: -600, run: false, hold: false }; this.fts = { armed: true, tested: false };
    this.wx = { lightningKm: 34, windKt: 14 }; this.sel = null; this.soc = { open: [], done: {}, t: 0, pick: null };
    this.score = { jet: false, super: false, pull9: false, orbit: false, deploy: false, burn: false, range: false, launch: false, cyber: 0 };
    this.bindKeys();
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    const S = this.app.stage;
    if (tab === 'cockpit') S.use(this.world.scene, this.fcam);
    if (tab === 'space') S.use(this.space.scene, this.space.cam);
    if (tab === 'orbit' || tab === 'range') S.use(this.orb.scene, this.orb.cam);
    S.bloom.strength = tab === 'cockpit' ? 0.25 : 0.6; S.bloom.threshold = tab === 'cockpit' ? 0.95 : 0.82;
    S.renderer.toneMappingExposure = tab === 'cockpit' ? 0.32 : tab === 'space' ? 0.75 : 0.9;
    $('#map').classList.toggle('hidden', tab !== 'range');
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const p = $('#panel'), s = $('#side');
    const views = { cockpit: ['jetPanel', 'jetSide', 'bindJet'], space: ['ascPanel', 'ascSide', 'bindAsc'], orbit: ['orbPanel', 'orbSide', 'bindOrb'], range: ['rngPanel', 'rngSide', 'bindRng'] }[this.tab];
    p.innerHTML = this[views[0]](); s.innerHTML = this[views[1]](); this[views[2]]();
    this.live(true);
  }

  // ═══ COCKPIT ═══════════════════════════════════════
  bindKeys() {
    addEventListener('keydown', (e) => { if (e.target.matches?.('input, select, textarea')) return; this.keys.add(e.key.toLowerCase()); if (this.tab !== 'cockpit' || !this.entered) return;
      const k = e.key.toLowerCase();
      if (k === 'b') { this.jet.ab = !this.jet.ab; sfx.valve(); }
      if (k === 'v') { this.view = this.view === 'cockpit' ? 'chase' : 'cockpit'; }
      if (k === 'p') { this.toggleAP(); }
      if (k === 'r') this.jetReset();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }
  toggleAP() { const o = this.jet.out; this.jet.ap = this.jet.ap ? null : { alt: Math.round(o.alt / 100) * 100, hdg: Math.round(o.heading), spd: o.V }; this.render(); }
  jetReset(preset = 'cruise') {
    const P = { cruise: { alt: 9000, speed: 235 }, low: { alt: 1200, speed: 200 }, dash: { alt: 11000, speed: 300 }, turn: { alt: 4500, speed: 285 } }[preset] || { alt: 3000, speed: 230 };
    this.jet.reset(P); this.jet.ap = preset === 'cruise' ? { alt: 9000, hdg: 90, spd: 235 } : null;
    if (preset === 'dash') { this.jet.ab = true; this.jet.throttle = 1; this.jet.ap = { alt: 11000, hdg: 90 }; }
    this.render();
  }
  jetPanel() {
    return `<header class="lv-head mono">${t('j.title')}</header><p class="intro">${t('j.intro')}</p>
      <div class="vitals">${['kcas', 'mach', 'alt', 'g', 'fuel', 'sr'].map((k) => `<div class="vt" data-j="${k}"><small>${t('j.v.' + k)}</small><b class="mono">—</b></div>`).join('')}</div>
      <div class="chips">${['cruise', 'turn', 'dash', 'low'].map((k) => `<button class="btn seg" data-pre="${k}">${t('j.pre.' + k)}</button>`).join('')}</div>
      <div class="chips"><button class="btn seg ${this.jet.ap ? 'active' : ''}" id="j-ap">AP (P)</button><button class="btn seg ${this.jet.ab ? 'active' : ''}" id="j-ab">${t('j.ab')} (B)</button><button class="btn seg" id="j-view">${t('j.view')} (V)</button></div>
      <label class="sl"><span>${t('j.throttle')}</span><b class="mono" id="j-thr">${Math.round(this.jet.throttle * 100)}%</b><em></em><input type="range" id="j-thr-in" min="0" max="100" value="${Math.round(this.jet.throttle * 100)}"></label>
      <header class="lv-sub mono">${t('j.controls')}</header>
      <div class="keys mono small">${t('j.keys')}</div>
      <div class="pad-touch">${['↖', '▲', '↗', '◀', '·', '▶', '↙', '▼', '↘'].map((c, i) => `<button class="tp" data-tp="${i}">${c}</button>`).join('')}</div>
      <header class="lv-sub mono">${t('j.math')}</header>
      <div class="math mono" id="j-math"></div>`;
  }
  jetSide() {
    return `<header class="lv-head mono">${t('j.econ')}</header><p class="small">${t('j.econWhy')}</p>
      <canvas class="cv chart tall" id="cv-sr"></canvas>
      <div class="kv mono" id="j-econ"></div>
      <header class="lv-sub mono">${t('j.thrustLapse')}</header>
      <div class="math mono" id="j-lapse"></div>`;
  }
  bindJet() {
    document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { this.jetReset(b.dataset.pre); this.caption('cap.j.' + b.dataset.pre); }));
    $('#j-ap').onclick = () => this.toggleAP();
    $('#j-ab').onclick = () => { this.jet.ab = !this.jet.ab; if (this.jet.ab) this.jet.throttle = 1; this.render(); };
    $('#j-view').onclick = () => { this.view = this.view === 'cockpit' ? 'chase' : 'cockpit'; };
    $('#j-thr-in').oninput = (e) => { this.jet.throttle = +e.target.value / 100; this.jet.ap && (this.jet.ap.spd = null); };
    // Touch pad: 3×3 stick.
    document.querySelectorAll('[data-tp]').forEach((b) => {
      const i = +b.dataset.tp, sx = (i % 3) - 1, sy = 1 - Math.floor(i / 3);
      const on = (e) => { e.preventDefault(); this.touch = { x: sx, y: sy }; this.jet.ap = null; };
      const off = () => { this.touch = null; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
    });
  }
  jetInput(dt) {
    const K = this.keys, J = this.jet;
    let sx = 0, sy = 0, rud = 0;
    if (K.has('a') || K.has('arrowleft')) sx -= 1; if (K.has('d') || K.has('arrowright')) sx += 1;
    if (K.has('s') || K.has('arrowdown')) sy += 1; if (K.has('w') || K.has('arrowup')) sy -= 1;     // pull back = S / ↓
    if (K.has('q')) rud -= 1; if (K.has('e')) rud += 1;
    if (this.touch) { sx = this.touch.x; sy = this.touch.y; }
    if (sx || sy || rud) J.ap = null;
    if (!J.ap) { J.stick.x += (sx - J.stick.x) * Math.min(1, dt * 6); J.stick.y += (sy * (sy > 0 ? 1 : 0.5) - J.stick.y) * Math.min(1, dt * 5); J.rudder = rud; }
    if (K.has('shift')) J.throttle = Math.min(1, J.throttle + dt * 0.4);
    if (K.has('control')) J.throttle = Math.max(0, J.throttle - dt * 0.4);
  }
  // Specific range (km/kg) vs true airspeed for 1-g level flight at the current altitude and weight.
  srCurve() {
    const J = this.jet, h = Math.max(0, J.pos.y), atm = atmosphere(h), W = J.mass * G0, pts = [];
    let best = { v: 0, sr: 0 };
    for (let v = 120; v <= 620; v += 5) {
      const q = 0.5 * atm.rho * v * v, CL = W / (q * JET.S), M = v / atm.a;
      if (CL > JET.CLmax * 0.9) continue;
      const D = q * JET.S * (cd0(M) + JET.k * CL * CL), sigma = atm.rho / 1.225, Tmax = JET.tDry * sigma ** 0.75 * (1 + 0.25 * Math.min(M, 1.6));
      const ab = D > Tmax, ff = D * (ab ? JET.tsfcAB : JET.tsfcDry), sr = v / ff / 1000;
      pts.push([v, sr, ab]); if (sr > best.sr) best = { v, sr };
    }
    return { pts, best, atm };
  }
  jetLive(full) {
    const o = this.jet.out, J = this.jet;
    const set = (k, v) => { const el = $(`[data-j="${k}"] b`); if (el) el.textContent = v; };
    set('kcas', f0(o.kcas)); set('mach', f2(o.M)); set('alt', `${f0(o.alt)} m`); set('g', f1(o.n)); set('fuel', `${f0(o.fuel)} kg`); set('sr', Number.isFinite(o.specRange) ? f3(o.specRange) : '—');
    const thr = $('#j-thr'); if (thr) thr.textContent = `${Math.round(J.throttle * 100)}%${o.ab ? ' AB' : ''}`;
    const inp = $('#j-thr-in'); if (inp && document.activeElement !== inp) inp.value = Math.round(J.throttle * 100);
    if (!full) return;
    const m = $('#j-math');
    if (m) m.innerHTML = `
      <div>q̄ = ½ρV² = ½·${f3(J.last.atm.rho)}·${f0(o.V)}² = <b>${f1(o.qbar / 1000)} kPa</b></div>
      <div>L = q̄·S·C<sub>L</sub> = ${f1(o.qbar / 1000)}k·${JET.S}·${f2(o.CL)} = <b>${f0(J.last.L / 1000)} kN</b> → n = L/W = <b>${f2(o.n)}</b></div>
      <div>C<sub>D</sub> = C<sub>D0</sub>(M) + k·C<sub>L</sub>² = ${f3(cd0(o.M))} + ${JET.k}·${f2(o.CL)}² = <b>${f3(o.CD)}</b></div>
      <div>T = ${f1(o.T / 1000)} kN · D = ${f1(o.D / 1000)} kN · T/W = <b>${f2(o.TW)}</b></div>
      <div>ṁ<sub>f</sub> = TSFC·T = <b>${f2(o.ff)} kg/s</b> · SR = V/ṁ<sub>f</sub> = <b>${f3(o.specRange)} km/kg</b></div>
      <div>M = V/a = ${f0(o.V)}/${f0(J.last.atm.a)} = <b>${f2(o.M)}</b> · a = √(γRT), T = ${f1(J.last.atm.T)} K</div>`;
    const C = this.srCurve(), cv = $('#cv-sr');
    if (cv && C.pts.length) {
      lineChart(cv, { x0: 100, x1: 620, y0: 0, y1: Math.max(0.3, C.best.sr * 1.25), xTicks: [150, 250, 350, 450, 550], xFmt: (v) => v + (v === 550 ? ' m/s' : ''), yFmt: (v) => v.toFixed(2), title: t('j.srChart', { h: f0(o.alt) }),
        series: [{ pts: C.pts.filter((p) => !p[2]).map((p) => [p[0], p[1]]), color: '#5dffa8', label: t('j.dry'), fill: 'rgba(93,255,168,.08)' }, { pts: C.pts.filter((p) => p[2]).map((p) => [p[0], p[1]]), color: '#ffb86b', label: t('j.reheat') }],
        marks: [{ x: C.best.v, color: 'rgba(63,243,255,.8)', label: t('j.best') }, { x: o.V, color: '#ff4fd8', dot: [o.V, Math.min(C.best.sr * 1.2, o.specRange)] }] });
    }
    const ec = $('#j-econ');
    if (ec) {
      ec.innerHTML = `<span>${t('j.bestSpeed')}</span><b>${f0(C.best.v)} m/s · M ${f2(C.best.v / C.atm.a)}</b><span>${t('j.bestSr')}</span><b>${f3(C.best.sr)} km/kg</b><span>${t('j.nowSr')}</span><b>${f3(o.specRange)} km/kg</b><span>${t('j.rangeAtBest')}</span><b>${f0(C.best.sr * Math.max(0, o.fuel - 400))} km</b><span>${t('j.endur')}</span><b>${Number.isFinite(o.endurance) ? mmss(o.endurance) : '—'}</b>`;
    }
    const lp = $('#j-lapse');
    if (lp) { const s = J.last.atm.rho / 1.225; lp.innerHTML = `<div>T = T<sub>SL</sub>·σ<sup>0.75</sup>·(1 + 0.25·M)</div><div>σ = ρ/ρ₀ = ${f3(s)} → σ<sup>0.75</sup> = ${f3(s ** 0.75)}</div><div>${t('j.dryMax')} ${f1((JET.tDry * s ** 0.75 * (1 + 0.25 * Math.min(o.M, 1.6))) / 1000)} kN · ${t('j.abMax')} ${f1((JET.tAB * s ** 0.75 * (1 + 0.25 * Math.min(o.M, 1.6))) / 1000)} kN</div><div>TSFC ${t('j.dry')} 0.76 · ${t('j.reheat')} 1.95 lb/(lbf·h) = ${(JET.tsfcDry * 1e6).toFixed(1)} · ${(JET.tsfcAB * 1e6).toFixed(1)} mg/(N·s)</div>`; }
  }
  jetFrame(dt, time) {
    const J = this.jet;
    this.jetInput(dt);
    J.step(dt);
    const o = J.out;
    J.groundH = Math.max(0, terrain(J.pos.x, J.pos.z));
    this.world.recentre(J.pos.x, J.pos.z);
    this.flightT = (this.flightT || 0) + (J.crashed ? 0 : dt); this.peakG = Math.max(this.peakG || 1, o.n);   // session totals survive preset resets
    if (o.n > 8.5) this.score.pull9 = true; if (o.M > 1.05) this.score.super = true; if (this.flightT > 20) this.score.jet = true;
    // Camera: pilot's eye, or chase.
    const f = new THREE.Vector3(J.f.x, J.f.y, J.f.z), u = new THREE.Vector3(J.u.x, J.u.y, J.u.z), r = new THREE.Vector3(J.r.x, J.r.y, J.r.z);
    const pos = new THREE.Vector3(J.pos.x, J.pos.y, J.pos.z);
    const m = new THREE.Matrix4().makeBasis(r, u, f.clone().negate());
    this.jetModel.group.position.copy(pos); this.jetModel.group.quaternion.setFromRotationMatrix(m);
    this.jetModel.abMat.uniforms.uPow.value = o.ab ? 1 : 0.15 * J.throttle; this.jetModel.abMat.uniforms.uTime.value = time;
    this.jetModel.ab.scale.set(1, 1, o.ab ? 1 : 0.4);
    if (this.view === 'cockpit') {
      this.fcam.position.copy(pos).addScaledVector(f, -4.1).addScaledVector(u, 1.1);
      this.fcam.quaternion.setFromRotationMatrix(m); this.cockpit.root.visible = true; this.jetModel.group.visible = false;
    } else {
      const back = f.clone().multiplyScalar(-24).addScaledVector(u, 5.5);
      this.fcam.position.lerp(pos.clone().add(back), 1 - Math.exp(-dt * 6));
      this.fcam.up.copy(u); this.fcam.lookAt(pos.clone().addScaledVector(f, 20)); this.cockpit.root.visible = false; this.jetModel.group.visible = true;
    }
    this.world.clouds.position.set(Math.round(J.pos.x / 40000) * 40000, 0, Math.round(J.pos.z / 40000) * 40000);
    this.hudT = (this.hudT || 0) + dt;
    if (this.hudT > 1 / 30) { this.hudT = 0; this.cockpit.draw(J, time, { thr: t('j.thr'), fuel: t('j.fuelS'), crash: t('j.crash'), pullUp: t('j.pullUp'), bingo: t('j.bingo'), overG: t('j.overG'), eng: t('j.mfd.eng'), energy: t('j.mfd.energy'), ff: t('j.mfd.ff'), fuelRem: t('j.mfd.fuel'), endur: t('j.mfd.endur'), spec: t('j.mfd.spec'), rangeLeft: t('j.mfd.range'), em: t('j.mfd.em') }); }
    if (J.crashed && !this.crashNoted) { this.crashNoted = true; this.app.stage.flash('#ff4466'); sfx.bang(); this.app.feed.push('j.crashed', 'bad'); }
    if (!J.crashed) this.crashNoted = false;
  }

  // ═══ SPACEPLANE ════════════════════════════════════
  ascPanel() {
    const A = this.asc, O = this.ascOpts, run = this.ascRun || A.phase !== 'roll';
    const phases = ['roll', 'climb', 'air', 'rocket', 'coast', 'circ', 'orbit', 'deployed'];
    return `<header class="lv-head mono">${t('a.title')}</header><p class="intro">${t('a.intro')}</p>
      <label class="sl"><span>${t('a.payload')}</span><b class="mono" id="a-pl-v">${O.payload} kg</b><em></em><input type="range" id="a-pl" min="0" max="3000" step="100" value="${O.payload}" ${run ? 'disabled' : ''}></label>
      <label class="sl"><span>${t('a.target')}</span><b class="mono" id="a-tg-v">${O.targetKm} km</b><em></em><input type="range" id="a-tg" min="250" max="700" step="10" value="${O.targetKm}" ${run ? 'disabled' : ''}></label>
      <label class="toggle"><input type="checkbox" id="a-air" ${O.airbreathe ? 'checked' : ''} ${run ? 'disabled' : ''}> <span>${t('a.air')}</span></label>
      <label class="toggle"><input type="checkbox" id="a-drop" ${O.dropBatt ? 'checked' : ''} ${run ? 'disabled' : ''}> <span>${t('a.drop')}</span></label>
      <div class="chips"><button class="btn primary" id="a-go" ${run ? 'disabled' : ''}>${t('a.launch')}</button><button class="btn seg" id="a-reset">↺ ${t('a.reset')}</button>
        ${WARPS_ASC.map((w, i) => `<button class="btn seg ${this.warpAsc === i ? 'active' : ''}" data-aw="${i}">${w}×</button>`).join('')}</div>
      <ol class="phases">${phases.map((p) => `<li data-ph="${p}">${t('ph.' + p)}</li>`).join('')}</ol>
      <div class="vitals">${['alt', 'vrel', 'vin', 'mach', 'q', 'g'].map((k) => `<div class="vt" data-a="${k}"><small>${t('a.v.' + k)}</small><b class="mono">—</b></div>`).join('')}</div>
      <div class="kv mono" id="a-orbit"></div>
      <button class="btn primary wide ${A.phase === 'orbit' ? '' : 'hidden'}" id="a-deploy">${t('a.deploy')}</button>
      <button class="btn panel wide ${A.phase === 'orbit' || A.phase === 'deployed' ? '' : 'hidden'}" id="a-toorbit">${t('a.toOrbit')} →</button>
      <header class="lv-sub mono">${t('a.log')}</header><ul class="log mono" id="a-log"></ul>`;
  }
  ascSide() {
    return `<header class="lv-head mono">${t('a.budget')}</header>
      <div class="dvbar" id="a-dv"></div>
      <div class="kv mono" id="a-dvk"></div>
      <header class="lv-sub mono">${t('a.mass')}</header>
      <div class="massbar" id="a-mass"></div>
      <canvas class="cv chart" id="cv-asc"></canvas>
      <header class="lv-sub mono">${t('a.eqs')}</header>
      <div class="math mono" id="a-math"></div>
      <header class="lv-sub mono">${t('a.electric')}</header>
      <div class="math mono" id="a-pump"></div>
      <p class="small">${t('a.electricWhy')}</p>`;
  }
  bindAsc() {
    const O = this.ascOpts;
    const pl = $('#a-pl'); if (pl) pl.oninput = (e) => { O.payload = +e.target.value; $('#a-pl-v').textContent = `${O.payload} kg`; this.asc = new Ascent(O); };
    const tg = $('#a-tg'); if (tg) tg.oninput = (e) => { O.targetKm = +e.target.value; $('#a-tg-v').textContent = `${O.targetKm} km`; this.asc = new Ascent(O); };
    $('#a-air').onchange = (e) => { O.airbreathe = e.target.checked; this.asc = new Ascent(O); this.render(); };
    $('#a-drop').onchange = (e) => { O.dropBatt = e.target.checked; this.asc = new Ascent(O); };
    $('#a-go').onclick = () => this.ascLaunch();
    $('#a-reset').onclick = () => { this.asc = new Ascent(O); this.ascRun = false; this.render(); };
    document.querySelectorAll('[data-aw]').forEach((b) => (b.onclick = () => { this.warpAsc = +b.dataset.aw; this.render(); }));
    $('#a-deploy').onclick = () => this.ascDeploy();
    $('#a-toorbit').onclick = () => { this.toOrbitFromAscent(); this.setTab('orbit'); };
  }
  ascLaunch() {
    this.asc = new Ascent(this.ascOpts); this.ascRun = true;
    this.asc.onEvent = (k, v) => { this.app.feed.push(k, k.includes('fail') || k === 'ev.crash' || k === 'ev.dry' || k === 'ev.battery' || k === 'ev.dryOms' ? 'bad' : 'ok', v); sfx.confirm(); if (k === 'ev.rocket') { sfx.ignite(); this.app.stage.flash('#7fb6ff'); } if (k === 'ev.orbit') { this.score.orbit = true; this.render(); } };
    sfx.ignite(); this.caption('cap.a.launch'); this.render();
  }
  ascDeploy() { if (this.asc.deploy()) { this.asc.depT = 0; this.score.deploy = true; sfx.confirm(); this.app.feed.push('ev.deploy', 'ok'); this.caption('cap.a.deploy'); this.render(); } }
  toOrbitFromAscent() {
    // Rotate the planar (equatorial-frame) state into a 28.5° inclined plane (launch due east from 28.5° N).
    const A = this.asc, i = (28.5 * Math.PI) / 180;
    const C = new Craft({ altKm: 400, incDeg: 28.5 });
    C.r = [A.x, A.y * Math.cos(i), A.y * Math.sin(i)]; C.v = [A.vx, A.vy * Math.cos(i), A.vy * Math.sin(i)];
    C.prop = A.oms + A.lox + A.ch4; C.isp = VOLTA.omsIsp; C.mass = A.mass;
    this.craft = C; this.fromAscent = true; this.orb.reset();
  }
  ascLive(full) {
    const A = this.asc, n = A.now, f = A.last;
    const set = (k, v) => { const el = $(`[data-a="${k}"] b`); if (el) el.textContent = v; };
    set('alt', `${f1(n.h / 1000)} km`); set('vrel', `${f0(n.vRel)} m/s`); set('vin', `${f0(n.v)} m/s`); set('mach', f1(n.M)); set('q', `${f1(n.q / 1000)} kPa`); set('g', f2(f ? Math.hypot(f.ax + (MU * A.x) / n.r ** 3, f.ay + (MU * A.y) / n.r ** 3) / G0 : 0));
    document.querySelectorAll('[data-ph]').forEach((li) => { const order = ['roll', 'climb', 'air', 'rocket', 'coast', 'circ', 'orbit', 'deployed']; li.className = li.dataset.ph === A.phase ? 'on' : order.indexOf(li.dataset.ph) < order.indexOf(A.phase) ? 'done' : ''; });
    if (A.phase === 'fail') document.querySelectorAll('[data-ph]').forEach((li) => li.classList.add('fail'));
    const O = n.orbit, ao = $('#a-orbit');
    if (ao) ao.innerHTML = `<span>${t('a.apo')}</span><b>${f0(O.apo / 1000)} km</b><span>${t('a.peri')}</span><b>${O.peri > -RE + 1 ? f0(O.peri / 1000) + ' km' : '—'}</b><span>${t('a.mt')}</span><b>${f0(A.mass)} kg</b><span>${t('a.batt')}</span><b>${f0((A.battE / A.battE0) * 100)} % · ${f1((f?.pumpP || 0) / 1e6)} MW</b><span>T+</span><b>${mmss(A.t)}</b>`;
    if (!full) return;
    const dep = $('#a-deploy'); if (dep) dep.classList.toggle('hidden', A.phase !== 'orbit');
    const to = $('#a-toorbit'); if (to) to.classList.toggle('hidden', !(A.phase === 'orbit' || A.phase === 'deployed'));
    const lg = $('#a-log'); if (lg) lg.innerHTML = A.events.slice(-7).map((e) => `<li><span>T+${mmss(e.t)}</span> ${t(e.k, e)}</li>`).join('');
    // Δv budget.
    const dv = A.dv, L = A.loss, tot = dv.air + dv.rocket + dv.oms + OMEGA_E * RE, w = (x) => `${Math.max(0, (x / Math.max(9500, tot)) * 100)}%`;
    const dvb = $('#a-dv'); if (dvb) dvb.innerHTML = `<i class="rot" style="width:${w(OMEGA_E * RE)}"></i><i class="air" style="width:${w(dv.air)}"></i><i class="rkt" style="width:${w(dv.rocket)}"></i><i class="oms" style="width:${w(dv.oms)}"></i>`;
    const dk = $('#a-dvk'); if (dk) dk.innerHTML = `<span class="c-cyan">${t('a.rot')}</span><b>${f0(OMEGA_E * RE)} m/s</b><span class="c-amber">${t('a.dvAir')}</span><b>${f0(dv.air)} m/s</b><span class="c-mag">${t('a.dvRkt')}</span><b>${f0(dv.rocket)} m/s</b><span class="c-green">OMS</span><b>${f0(dv.oms)} m/s</b><span>${t('a.lossG')}</span><b>−${f0(L.grav)} m/s</b><span>${t('a.lossD')}</span><b>−${f0(L.drag)} m/s</b><span>${t('a.lossS')}</span><b>−${f0(L.steer)} m/s</b><span>${t('a.vNow')}</span><b>${f0(n.v)} m/s · v<sub>circ</sub> ${f0(Math.sqrt(MU / n.r))}</b>`;
    const parts = [['dry', VOLTA.dry], ['payload', A.payload], ['battery', A.batt], ['lox', A.lox], ['ch4', A.ch4], ['ch4Air', A.ch4Air], ['oms', A.oms]], M = A.mass;
    const mb = $('#a-mass'); if (mb) mb.innerHTML = parts.map(([k, v]) => `<div class="mrow"><span>${t('a.m.' + k)}</span><i><b class="${k}" style="width:${(v / A.m0) * 100}%"></b></i><em class="mono">${f0(v)} kg</em></div>`).join('') + `<div class="mrow tot"><span>${t('a.m.total')}</span><i></i><em class="mono">${f0(M)} / ${f0(A.m0)} kg</em></div>`;
    const cv = $('#cv-asc');
    if (cv) { const H = A.hist, x1 = Math.max(200, A.t); lineChart(cv, { x0: 0, x1, y0: 0, y1: Math.max(120, ...H.map((p) => p.h / 1000)) * 1.1, xFmt: (v) => mmss(v), title: t('a.chart'), series: [{ pts: H.map((p) => [p.t, p.h / 1000]), color: '#3ff3ff', label: 'km' }, { pts: H.map((p) => [p.t, p.vRel / 100]), color: '#ffb86b', label: 'v/100' }] }); }
    const R = VOLTA.rocket, mf = A.m0 - (VOLTA.lox + VOLTA.ch4 + VOLTA.ch4Air), mr = massRatioFor(9300 - OMEGA_E * RE, R.IspVac);
    const am = $('#a-math');
    if (am) am.innerHTML = `
      <div>Δv = I<sub>sp</sub>·g₀·ln(m₀/m<sub>f</sub>) — ${t('a.tsiol')}</div>
      <div>${t('a.rocketOnly')}: 9 300 − ${f0(OMEGA_E * RE)} m/s → m₀/m<sub>f</sub> = e<sup>Δv/(368·g₀)</sup> = <b>${f2(mr)}</b> → ${t('a.propFrac')} <b>${f1((1 - 1 / mr) * 100)} %</b></div>
      <div>VOLTA: ${t('a.dryFrac')} (${f0(VOLTA.dry + A.o.payload)} kg) / ${f0(A.m0)} kg = <b>${f1(((VOLTA.dry + A.o.payload) / A.m0) * 100)} %</b></div>
      <div>${t('a.airIsp')}: I<sub>sp</sub> ≈ ${f0(airPerf(Math.min(5, Math.max(0.3, n.M)), n.atm.rho, n.q).isp)} s vs ${R.IspVac} s — ${t('a.airWhy')}</div>
      <div>F = ṁ·I<sub>sp,vac</sub>·g₀ − A<sub>e</sub>·p<sub>a</sub> · ${t('a.maxq')} <b>${f1(A.maxQ / 1000)} kPa</b> · ${t('a.maxg')} <b>${f2(A.maxG)} g</b></div>
      <div>${t('a.econ')}: <b>${f0((A.m0 - A.mass) / Math.max(1, (A.dv.air + A.dv.rocket + A.dv.oms) / 1000))} kg ${t('a.perKms')}</b> · ${t('a.propUsed')} ${f0(A.m0 - A.mass - (VOLTA.battery - A.batt) - (this.ascOpts.payload - A.payload))} kg</div>`;
    const mdot = R.Fvac / (R.IspVac * G0), P = pumpPower(mdot), E = (P.total * (VOLTA.lox + VOLTA.ch4)) / mdot / 3.6e6;
    const ap = $('#a-pump');
    if (ap) ap.innerHTML = `
      <div>ṁ = F/(I<sub>sp</sub>·g₀) = ${f0(R.Fvac / 1000)} kN / (${R.IspVac}·9.80665) = <b>${f1(mdot)} kg/s</b> (O/F ${R.of})</div>
      <div>P = ṁ·Δp/(ρ·η), Δp = p<sub>c</sub> + Δp<sub>inj</sub> = ${f1((R.pc + R.dpInj) / 1e6)} MPa, η = ${VOLTA.pump.eta}</div>
      <div>LOX: ${f1(P.mOx)} kg/s → <b>${f2(P.pOx / 1e6)} MW</b> · CH₄: ${f1(P.mF)} kg/s → <b>${f2(P.pF / 1e6)} MW</b></div>
      <div>${t('a.fullBurn')}: E = P·t = <b>${f0(E)} kWh</b> → ${f0((E * 1000) / VOLTA.batt.whPerKg)} kg @ ${VOLTA.batt.whPerKg} Wh/kg · ${t('a.powerLimit')} ${f0(P.total / VOLTA.batt.wPerKg)} kg</div>`;
  }
  ascFrame(dt, time) {
    const A = this.asc;
    if (this.ascRun) A.step(Math.min(dt, 0.05) * WARPS_ASC[this.warpAsc]);
    this.space.update(A, dt, time);
  }

  // ═══ ORBIT ═════════════════════════════════════════
  orbPanel() {
    const P = this.plan;
    return `<header class="lv-head mono">${t('o.title')}</header><p class="intro">${t(this.fromAscent ? 'o.introAsc' : 'o.intro')}</p>
      <div class="vitals">${['alt', 'v', 'apo', 'peri', 'inc', 'per'].map((k) => `<div class="vt" data-o="${k}"><small>${t('o.v.' + k)}</small><b class="mono">—</b></div>`).join('')}</div>
      <div class="chips">${WARPS_ORB.map((w, i) => `<button class="btn seg ${this.warpOrb === i ? 'active' : ''}" data-ow="${i}">${w}×</button>`).join('')}<button class="btn seg" id="o-follow">${t('o.follow')}</button></div>
      <header class="lv-sub mono">${t('o.burn')}</header>
      <label class="sl"><span>Δv</span><b class="mono" id="o-dv-v">${P.dv} m/s</b><em></em><input type="range" id="o-dv" min="-500" max="2500" step="5" value="${P.dv}"></label>
      <div class="chips">${['pro', 'norm', 'rad'].map((d) => `<button class="btn seg ${P.dir === d ? 'active' : ''}" data-dir="${d}">${t('o.dir.' + d)}</button>`).join('')}</div>
      <div class="chips"><button class="btn primary" id="o-now">${t('o.now')}</button><button class="btn seg" id="o-apo">${t('o.atApo')}</button><button class="btn seg" id="o-peri">${t('o.atPeri')}</button></div>
      <div class="kv mono" id="o-fuel"></div>
      <header class="lv-sub mono">${t('o.missions')}</header>
      <div class="chips">${['circ', 'raise', 'geo', 'plane'].map((m) => `<button class="btn seg" data-mis="${m}">${t('o.m.' + m)}</button>`).join('')}</div>
      <div class="result mono small" id="o-mres">${this.misMsg || t('o.misHint')}</div>`;
  }
  orbSide() {
    return `<header class="lv-head mono">${t('o.calc')}</header>
      <label class="sl"><span>${t('o.h1')}</span><b class="mono" id="c-h1v">400 km</b><em></em><input type="range" id="c-h1" min="200" max="2000" step="10" value="400"></label>
      <label class="sl"><span>${t('o.h2')}</span><b class="mono" id="c-h2v">35786 km</b><em></em><input type="range" id="c-h2" min="200" max="40000" step="50" value="35786"></label>
      <div class="math mono" id="c-hoh"></div>
      <label class="sl"><span>${t('o.inc')}</span><b class="mono" id="c-iv">51.6°</b><em></em><input type="range" id="c-i" min="0" max="120" step="0.1" value="51.6"></label>
      <div class="math mono" id="c-az"></div>
      <header class="lv-sub mono">${t('o.live')}</header>
      <div class="math mono" id="o-math"></div>`;
  }
  bindOrb() {
    document.querySelectorAll('[data-ow]').forEach((b) => (b.onclick = () => { this.warpOrb = +b.dataset.ow; this.render(); }));
    $('#o-follow').onclick = () => { this.orb.cam0.follow = !this.orb.cam0.follow; this.orb.cam0.r = this.orb.cam0.follow ? 4 : 30; };
    $('#o-dv').oninput = (e) => { this.plan.dv = +e.target.value; $('#o-dv-v').textContent = `${this.plan.dv} m/s`; };
    document.querySelectorAll('[data-dir]').forEach((b) => (b.onclick = () => { this.plan.dir = b.dataset.dir; this.render(); }));
    $('#o-now').onclick = () => this.doBurn(this.plan.dv, this.plan.dir);
    $('#o-apo').onclick = () => { this.pending = { at: 'apo', dv: this.plan.dv, dir: this.plan.dir }; this.app.feed.push('o.scheduled', 'ok', { w: t('o.atApo') }); };
    $('#o-peri').onclick = () => { this.pending = { at: 'peri', dv: this.plan.dv, dir: this.plan.dir }; this.app.feed.push('o.scheduled', 'ok', { w: t('o.atPeri') }); };
    document.querySelectorAll('[data-mis]').forEach((b) => (b.onclick = () => this.mission(b.dataset.mis)));
    for (const id of ['c-h1', 'c-h2', 'c-i']) $('#' + id).oninput = () => this.calcLive();
    this.calcLive();
  }
  doBurn(dv, dir) {
    const C = this.craft, r = C.burn(dir === 'pro' ? dv : 0, dir === 'norm' ? dv : 0, dir === 'rad' ? dv : 0);
    if (r.ok) { this.score.burn = true; sfx.ignite(); this.orb.flashBurn(C); this.app.feed.push('o.burned', 'ok', { dv: f0(Math.abs(dv)), kg: f0(r.kg) }); }
    else { sfx.deny(); this.app.feed.push('o.noFuel', 'bad', { kg: f0(r.need), have: f0(C.prop) }); }
    this.render(); return r.ok;
  }
  mission(m) {
    const C = this.craft, E = C.el, r = Math.hypot(...C.r);
    if (m === 'circ') { const dv = vCirc(r) - E.v; this.pending = null; this.doBurn(dv, 'pro'); this.misMsg = t('o.r.circ', { dv: f1(dv) }); }
    if (m === 'raise' || m === 'geo') {
      const r2 = m === 'geo' ? 42164e3 : RE + 800e3, H = hohmann(r, r2), kg = propFor(H.total, C.mass, C.isp);
      this.misMsg = t('o.r.hoh', { a: f0(H.dv1), b: f0(H.dv2), h: f1(H.tof / 3600), kg: f0(kg), have: f0(C.prop) }) + (kg > C.prop ? ' ' + t('o.r.short') : '');
      if (kg <= C.prop) { this.doBurn(H.dv1, 'pro'); this.pending = { at: 'apo', dv: H.dv2, dir: 'pro', mission: true }; const tgt = new Craft(); const s = circularState((r2 - RE) / 1000, (E.inc * 180) / Math.PI, (E.raan * 180) / Math.PI, 0); tgt.r = s.pos; tgt.v = s.vel; tgt.j2 = false; this.orb.setTarget(tgt.path(360).map(toThree)); }
      else { sfx.deny(); }
    }
    if (m === 'plane') { const dv = planeChange(E.v, (5 * Math.PI) / 180); this.misMsg = t('o.r.plane', { dv: f0(dv), kg: f0(propFor(dv, C.mass, C.isp)) }); this.doBurn(dv, 'norm'); }
    this.render();
  }
  calcLive() {
    const h1 = +$('#c-h1').value, h2 = +$('#c-h2').value, inc = +$('#c-i').value;
    $('#c-h1v').textContent = `${h1} km`; $('#c-h2v').textContent = `${h2} km`; $('#c-iv').textContent = `${inc}°`;
    const r1 = RE + h1 * 1000, r2 = RE + h2 * 1000, H = hohmann(r1, r2), C = this.craft;
    $('#c-hoh').innerHTML = `<div>v<sub>c1</sub> = √(μ/r₁) = ${f0(vCirc(r1))} m/s · v<sub>c2</sub> = ${f0(vCirc(r2))} m/s</div>
      <div>Δv₁ = v<sub>c1</sub>(√(2r₂/(r₁+r₂)) − 1) = <b>${f1(H.dv1)} m/s</b></div><div>Δv₂ = v<sub>c2</sub>(1 − √(2r₁/(r₁+r₂))) = <b>${f1(H.dv2)} m/s</b></div>
      <div>Σ = <b>${f1(H.total)} m/s</b> · TOF = π√(a³/μ) = <b>${f2(H.tof / 3600)} h</b> · ${t('o.prop')} ${f0(propFor(H.total, C.mass, C.isp))} kg</div>`;
    const az = launchAzimuth(inc, 28.5), sso = ssoInclination(h1), nr = nodalRate(r1, 0, inc);
    $('#c-az').innerHTML = `<div>sin β = cos i / cos φ → β = <b>${az === null ? t('o.noAz') : f2(az) + '°'}</b> (φ = 28.5°)</div>
      <div>${t('o.boost')} ω⊕·R⊕·cos φ = <b>${f1(earthBoost(28.5))} m/s</b> (${t('o.eq')} ${f1(earthBoost(0))})</div>
      <div>Ω̇ = −(3/2)·n·J₂·(R/p)²·cos i = <b>${f3((nr * 86400 * 180) / Math.PI)} °/day</b></div>
      <div>${t('o.sso', { h: h1 })} <b>${sso ? f2(sso) + '°' : '—'}</b></div>`;
  }
  orbLive(full) {
    const C = this.craft, E = C.el, r = Math.hypot(...C.r);
    const set = (k, v) => { const el = $(`[data-o="${k}"] b`); if (el) el.textContent = v; };
    set('alt', `${f0((r - RE) / 1000)} km`); set('v', `${f0(E.v)} m/s`); set('apo', `${f0(E.apo / 1000)} km`); set('peri', `${f0(E.peri / 1000)} km`); set('inc', `${f2((E.inc * 180) / Math.PI)}°`); set('per', Number.isFinite(E.period) ? `${f1(E.period / 60)} min` : '∞');
    const dvLeft = C.isp * G0 * Math.log(C.mass / Math.max(1, C.mass - C.prop));
    const fu = $('#o-fuel'); if (fu) fu.innerHTML = `<span>${t('o.propLeft')}</span><b>${f0(C.prop)} kg</b><span>Δv ${t('o.left')} = I<sub>sp</sub>g₀ln(m/(m−m<sub>p</sub>))</span><b>${f0(dvLeft)} m/s</b><span>${t('o.kgPerMs')}</span><b>${f2(C.mass / (C.isp * G0))} kg/(m/s)</b><span>${t('o.used')}</span><b>${f0(C.dvUsed)} m/s</b><span>${t('o.pending')}</span><b>${this.pending ? `${f0(this.pending.dv)} m/s @ ${this.pending.at}` : '—'}</b>`;
    if (!full) return;
    const om = $('#o-math');
    if (om) om.innerHTML = `<div>v = √(μ(2/r − 1/a)) = √(3.986×10¹⁴(2/${f0(r / 1000)}k − 1/${f0(E.a / 1000)}k)) = <b>${f0(E.v)} m/s</b></div>
      <div>a = ${f0(E.a / 1000)} km · e = ${E.e.toFixed(4)} · ε = v²/2 − μ/r = ${f0(E.eps / 1000)} kJ/kg</div>
      <div>T = 2π√(a³/μ) = <b>${Number.isFinite(E.period) ? f1(E.period / 60) + ' min' : '∞'}</b> · v<sub>esc</sub> = √(2μ/r) = ${f0(vEsc(r))} m/s</div>
      <div>J₂: Ω̇ = ${f3((nodalRate(E.a, E.e, (E.inc * 180) / Math.PI) * 86400 * 180) / Math.PI)} °/day · RAAN ${f2((E.raan * 180) / Math.PI)}°</div>
      <div>${t('o.clock')} ${hms(C.t)}</div>`;
  }
  orbFrame(dt, time) {
    const C = this.craft;
    if (this.orbRun) {
      const w = WARPS_ORB[this.warpOrb], step = Math.min(dt, 0.05) * w;
      // Execute a scheduled burn when crossing apoapsis / periapsis (radial velocity changes sign).
      const rv0 = C.r[0] * C.v[0] + C.r[1] * C.v[1] + C.r[2] * C.v[2];
      C.step(step);
      const rv1 = C.r[0] * C.v[0] + C.r[1] * C.v[1] + C.r[2] * C.v[2];
      if (this.pending) {
        const hit = (this.pending.at === 'apo' && rv0 > 0 && rv1 <= 0) || (this.pending.at === 'peri' && rv0 < 0 && rv1 >= 0);
        if (hit) { const P = this.pending; this.pending = null; if (P.mission) { const r = Math.hypot(...C.r); this.doBurn(vCirc(r) - Math.hypot(...C.v), 'pro'); this.orb.setTarget([]); } else this.doBurn(P.dv, P.dir); }
      }
      if (Math.hypot(...C.r) < RE + 100e3 && !this.reentry) { this.reentry = true; this.app.feed.push('o.reentry', 'bad'); }
    }
    this.orb.update(C, dt, time);
  }

  // ═══ RANGE ═════════════════════════════════════════
  polls() {
    const S = this.surv, viol = S.tracks.filter((T) => T.violation && !T.cleared).length;
    const ec = expectedCasualties(S.exposures()).ec;
    const slant = this.launch ? this.launch.slantKm : 30, jam = this.soc.done.jam === undefined && this.soc.open.includes('jam');
    const lb = linkBudget({ dKm: slant, jam: jam ? { pW: 100, g: 10, dKm: 60, gMain: 45, gSide: 0, bwHz: 20e6 } : null });
    const openCrit = this.soc.open.filter((id) => this.soc.done[id] === undefined && ['critical', 'high'].includes(SCENARIOS.find((s) => s.id === id).sev)).length;
    return {
      range: { ok: viol === 0, v: viol ? t('r.viol', { n: viol }) : t('r.clear') },
      ec: { ok: ec <= EC_LIMIT, v: `Ec = ${sci(ec)}` , ec },
      wx: { ok: this.wx.lightningKm > 18.5 && this.wx.windKt < 30, v: `⚡ ${f0(this.wx.lightningKm)} km · ${f0(this.wx.windKt)} kt` },
      tlm: { ok: (jam ? lb.marginJ : lb.margin) > 3, v: `${t('r.margin')} ${f1(jam ? lb.marginJ : lb.margin)} dB` , lb },
      fts: { ok: this.fts.armed && this.fts.tested, v: this.fts.tested ? t('r.ftsOk') : t('r.ftsTest') },
      cyber: { ok: openCrit === 0, v: openCrit ? t('r.alerts', { n: openCrit }) : t('r.secure') },
    };
  }
  rngPanel() {
    return `<header class="lv-head mono">${t('r.title')}</header><p class="intro">${t('r.intro')}</p>
      <div class="clock"><small>${t('r.count')}</small><b class="mono" id="r-clock">T−10:00</b>
        <div class="speeds"><button class="btn seg" id="r-start">${this.count.run ? '❚❚ ' + t('r.hold') : '▶ ' + t('r.startCount')}</button><button class="btn seg" id="r-fts">${t('r.testFts')}</button></div></div>
      <header class="lv-sub mono">${t('r.poll')}</header>
      <ul class="poll" id="r-poll">${['range', 'ec', 'wx', 'tlm', 'fts', 'cyber'].map((k) => `<li data-poll="${k}"><b>${t('r.p.' + k)}</b><span class="mono"></span><i></i></li>`).join('')}</ul>
      <button class="btn primary wide" id="r-launch" disabled>${t('r.launch')}</button>
      <div class="chips"><button class="btn seg" id="r-fault">${t('r.fault')}</button><button class="btn seg danger" id="r-term" disabled>${t('r.terminate')}</button></div>
      <header class="lv-sub mono">${t('r.track')}</header>
      <div class="trackcard" id="r-trk">${t('r.pick')}</div>
      <header class="lv-sub mono">${t('r.mathT')}</header>
      <div class="math mono" id="r-math"></div>`;
  }
  rngSide() {
    return `<header class="lv-head mono">${t('c.title')}</header><p class="small">${t('c.intro')}</p>
      <div class="kv mono"><span>${t('c.score')}</span><b id="c-score">0</b></div>
      <ul class="alerts" id="c-list"></ul>
      <div class="alertcard" id="c-card"></div>
      <header class="lv-sub mono">${t('c.crypto')}</header>
      <div class="math mono">${t('c.cryptoTxt', { y: sci(crypto.yearsToBrute(128)), y2: sci(crypto.yearsToBrute(256)), f: sci(crypto.forgery(64)) })}</div>
      <header class="lv-sub mono">${t('c.principles')}</header>
      <ul class="roles">${['zeroTrust', 'defense', 'segment', 'least'].map((k) => `<li><b>${t('pr.' + k)}</b><span>${t('pr.' + k + '.d')}</span></li>`).join('')}</ul>`;
  }
  bindRng() {
    $('#r-start').onclick = () => { this.count.run = !this.count.run; this.count.hold = !this.count.run; sfx.select(); this.render(); };
    $('#r-fts').onclick = () => { this.fts.tested = true; sfx.confirm(); this.app.feed.push('r.ftsDone', 'ok'); };
    $('#r-launch').onclick = () => this.rangeLaunch();
    $('#r-fault').onclick = () => { if (this.launch && !this.launch.done) { this.launch.fault = true; this.app.feed.push('r.faultIn', 'warn'); } else this.app.feed.push('r.faultWait', 'warn'); };
    $('#r-term').onclick = () => { if (this.launch && !this.launch.terminated) { this.launch.terminated = true; this.app.stage.flash('#ff4466'); sfx.bang(); this.app.feed.push('r.terminated', 'bad'); this.fts.used = true; this.render(); } };
    this.renderSoc();
  }
  rangeLaunch() {
    this.launch = new Launch(); this.count.run = true; sfx.ignite(); this.app.stage.flash('#ffd08a'); this.caption('cap.r.launch');
    this.score.range = true; this.render();
  }
  mapClick(e) {
    const cv = $('#map'); if (!cv || this.tab !== 'range') return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 20;
    for (const T of this.surv.tracks) { if (T._sx === undefined) continue; const d = Math.hypot(T._sx - x, T._sy - y); if (d < bd) { bd = d; best = T; } }
    if (best) { this.sel = best.id; sfx.select(); this.renderTrack(); }
  }
  renderTrack() {
    const box = $('#r-trk'); if (!box) return;
    const T = this.surv.tracks.find((x) => x.id === this.sel); if (!T) { box.textContent = t('r.pick'); return; }
    const acts = T.own ? [] : T.kind === 'sea' ? ['uscg'] : T.src === 'primary' ? ['intercept'] : ['contact'];
    box.innerHTML = `<b class="mono">${T.cs}</b> <span class="small">${t('r.kind.' + T.kind)} · ${T.src.toUpperCase()}</span>
      <div class="kv mono small"><span>${t('r.pos')}</span><b>${f1(T.x)} E · ${f1(T.y)} N km</b><span>${t('r.spd')}</span><b>${f0(T.spd * 1944)} kt · ${f0(T.hdg)}°</b><span>SNR = 13 + 10log σ − 40log(R/150)</span><b>${f1(T.snr)} dB</b><span>${t('r.pob')}</span><b>${T.n}</b></div>
      <div class="chips">${acts.map((a) => `<button class="btn seg ${T.action ? 'active' : ''}" data-tact="${a}" ${T.action ? 'disabled' : ''}>${t('r.act.' + a)}</button>`).join('')}</div>
      <p class="small">${T.violation ? t('r.inArea') : T.own ? t('r.own') : t('r.outArea')}</p>`;
    box.querySelectorAll('[data-tact]').forEach((b) => (b.onclick = () => { this.surv.resolve(T, b.dataset.tact); sfx.confirm(); this.app.feed.push('r.done.' + b.dataset.tact, 'ok', { cs: T.cs }); if (b.dataset.tact === 'intercept') this.caption('cap.r.intercept'); this.renderTrack(); }));
  }
  renderSoc() {
    const L = $('#c-list'); if (!L) return;
    const S = this.soc;
    const scEl = $('#c-score'); if (scEl) scEl.textContent = `${this.score.cyber} / ${Object.keys(S.done).length}`;
    L.innerHTML = S.open.map((id) => { const sc = SCENARIOS.find((s) => s.id === id), d = S.done[id]; return `<li class="${d === undefined ? 'new' : d ? 'ok' : 'bad'} ${S.pick === id ? 'sel' : ''}" data-al="${id}"><span class="sev ${sc.sev}">${t('sev.' + sc.sev)}</span> ${t('cy.' + id + '.t')}</li>`; }).join('') || `<li class="empty">${t('c.none')}</li>`;
    L.querySelectorAll('[data-al]').forEach((li) => (li.onclick = () => { S.pick = li.dataset.al; this.renderSoc(); }));
    const card = $('#c-card'); if (!card) return;
    const id = S.pick; if (!id) { card.innerHTML = ''; return; }
    const sc = SCENARIOS.find((s) => s.id === id), d = S.done[id];
    card.innerHTML = `<b>${t('cy.' + id + '.t')}</b><p>${t('cy.' + id + '.e')}</p>${evidence(id) ? '<canvas class="cv chart small" id="cv-ev"></canvas>' : ''}
      <div class="opts">${Array.from({ length: OPTIONS }, (_, i) => `<button class="btn seg opt ${d !== undefined && i === sc.correct ? 'right' : ''} ${d !== undefined && S.choice?.[id] === i && i !== sc.correct ? 'wrong' : ''}" data-opt="${i}" ${d !== undefined ? 'disabled' : ''}>${t('cy.' + id + '.o' + i)}</button>`).join('')}</div>
      ${d !== undefined ? `<p class="fb ${d ? 'ok' : 'bad'}">${t(d ? 'c.right' : 'c.wrong')} ${t('cy.' + id + '.why')}</p><p class="small">${t('c.principle')}: <b>${t('pp.' + sc.principle)}</b></p>` : ''}`;
    card.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => { const i = +b.dataset.opt, ok = i === sc.correct; S.done[id] = ok; (S.choice ??= {})[id] = i; if (ok) this.score.cyber++; (ok ? sfx.confirm : sfx.warn)(); this.renderSoc(); const sc2 = $('#c-score'); if (sc2) sc2.textContent = `${this.score.cyber} / ${Object.keys(S.done).length}`; }));
    const ev = evidence(id), cv = $('#cv-ev');
    if (ev && cv) lineChart(cv, { x0: 0, x1: 20, y0: 0, y1: Math.max(ev.limit * 1.4, ...ev.pts.map((p) => p[1])) * 1.1, xFmt: (v) => v + 's', title: `${ev.label} (${ev.unit})`, series: [{ pts: ev.pts, color: '#ff4466' }], marks: [{ y: ev.limit, color: 'rgba(255,184,107,.8)', label: t('c.limit') }] });
  }
  rngLive(full) {
    const P = this.polls();
    const c = $('#r-clock'); if (c) { const T = this.count.t; c.textContent = T < 0 ? `T−${mmss(-T)}` : `T+${mmss(T)}`; c.classList.toggle('hold', !this.count.run); }
    let allGo = true;
    for (const [k, v] of Object.entries(P)) { const li = $(`[data-poll="${k}"]`); if (li) { li.className = v.ok ? 'go' : 'nogo'; li.querySelector('span').textContent = v.v; li.querySelector('i').textContent = v.ok ? 'GO' : 'NO-GO'; } allGo = allGo && v.ok; }
    this.allGo = allGo;
    const lb = $('#r-launch'); if (lb) lb.disabled = !(allGo && this.count.t >= -1 && !this.launch);
    const tb = $('#r-term'); if (tb) tb.disabled = !(this.launch && !this.launch.terminated && !this.launch.done);
    if (!full) return;
    const L = this.launch, lbud = P.tlm.lb, ec = P.ec.ec;
    const m = $('#r-math');
    if (m) m.innerHTML = `
      <div>E<sub>c</sub> = Σ P<sub>f</sub>(t)·N<sub>frag</sub>·φ(x,y)·A<sub>v</sub>·N<sub>people</sub>·f = <b>${sci(ec)}</b> ${ec <= EC_LIMIT ? '≤' : '>'} 1×10⁻⁴</div>
      <div>P<sub>fail</sub> = ${P_FAIL * 100} % · N<sub>frag</sub> = ${N_FRAG} · σ<sub>cross</sub> = 2 + 0.15·d km</div>
      <div>L<sub>fs</sub> = 92.45 + 20log(${f0(L ? L.slantKm : 30)} km) + 20log(2.25 GHz) = <b>${f1(lbud.L)} dB</b></div>
      <div>C/N₀ = EIRP − L<sub>fs</sub> + G/T + 228.6 − 3 = <b>${f1(lbud.cn0)} dB·Hz</b> · E<sub>b</sub>/N₀ = C/N₀ − 10log(2 Mb/s) = <b>${f1(lbud.ebn0)} dB</b></div>
      ${lbud.js !== null ? `<div class="c-red">J/S = ${f1(lbud.js)} dB → E<sub>b</sub>/(N₀+J₀) = <b>${f1(lbud.ebn0j)} dB</b></div>` : ''}
      ${L ? `<div>${t('r.vehicle')}: h ${f1(L.h / 1000)} km · v ${f0(L.v)} m/s · ${t('r.stage')} ${L.stage} · IIP ${L.iip ? f0(L.iip.x) + ' km, ' + f1(L.iip.y) + ' km' : t('r.orbital')}</div>` : ''}`;
    this.renderTrack();
  }
  rngFrame(dt) {
    const S = this.surv; S.step(dt * 3);
    if (this.count.run) {
      this.count.t += dt * (this.count.t < -30 ? 30 : 1);                 // fast-forward the long part of the count
      // Auto-hold at T−10 s unless every poll is GO.
      if (this.count.t > -10 && this.count.t < 0 && !this.allGo) { this.count.t = -10; this.count.run = false; this.count.autoHeld = true; this.app.feed.push('r.autoHold', 'warn'); sfx.warn(); this.render(); }
      if (this.count.t >= 0 && !this.launch && this.allGo) this.rangeLaunch();
    }
    // Recycle: after an automatic hold, the count resumes by itself once every poll is GO.
    if (this.count.autoHeld && this.allGo) { this.count.autoHeld = false; this.count.run = true; this.app.feed.push('r.resume', 'ok'); sfx.confirm(); if (this.tab === 'range') this.render(); }
    // Weather drifts; a thunderstorm cell approaches then leaves.
    this.wx.lightningKm = 30 + 16 * Math.sin(S.t / 220); this.wx.windKt = 14 + 6 * Math.sin(S.t / 130);
    // Security alerts arrive on a schedule once the countdown is running.
    if (this.count.run || this.launch) { this.soc.t += dt; for (const sc of SCENARIOS) if (this.soc.t >= sc.at / 4 && !this.soc.open.includes(sc.id)) { this.soc.open.push(sc.id); this.app.feed.push('c.new', sc.sev === 'critical' ? 'bad' : 'warn', { a: t('cy.' + sc.id + '.t') }); sfx.alarm(); if (this.tab === 'range') this.renderSoc(); } }
    if (this.launch) {
      this.launch.step(dt * (this.launchWarp || 3));
      const L = this.launch;
      if (L.iip && Math.abs(L.iip.y) > RANGE.destructY && !L.terminated && !this.destructWarned) { this.destructWarned = true; this.app.feed.push('r.destructLine', 'bad'); sfx.alarm(); this.caption('cap.r.destruct'); }
      if (L.done && !this.launchDone) { this.launchDone = true; this.score.launch = !L.terminated; this.app.feed.push('r.orbit', 'ok'); }
    }
    const cv = $('#map');
    if (cv && this.tab === 'range') drawRange(cv, S, this.launch, { sel: this.sel, lab: { destruct: t('r.destructL'), town: t('r.town'), pad: t('r.pad') } });
  }

  // ═══ Debrief ═══════════════════════════════════════
  showReport() {
    const S = this.score, rows = [
      [t('rep.jet', { g: f1(this.peakG || this.jet.maxG) }), S.jet], [t('rep.super'), S.super], [t('rep.pull9'), S.pull9],
      [t('rep.orbit'), S.orbit], [t('rep.deploy'), S.deploy], [t('rep.burn'), S.burn],
      [t('rep.range'), S.range], [t('rep.launch'), S.launch], [t('rep.cyber', { n: S.cyber, m: Object.keys(this.soc.done).length }), S.cyber >= 5],
    ];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = '';
    for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }

  // ── Input (orbit cameras) ──────────────────────────
  pointerDown(e) { const c = this.camRef(); if (c) { c.drag = { x: e.clientX, y: e.clientY }; c.last = performance.now(); } if (this.tab === 'range') this.mapClick(e); }
  pointerMove(e) { const c = this.camRef(); if (!c || !c.drag) return; c.yaw -= (e.clientX - c.drag.x) * 0.005; c.pitch = Math.max(-1.3, Math.min(1.3, c.pitch + (e.clientY - c.drag.y) * 0.004)); c.drag = { x: e.clientX, y: e.clientY }; c.last = performance.now(); }
  pointerUp() { const c = this.camRef(); if (c) c.drag = null; }
  wheel(e) { const c = this.camRef(); if (c) { c.r *= Math.exp(e.deltaY * 0.001); c.r = Math.max(this.tab === 'space' ? 25 : 1.5, Math.min(this.tab === 'space' ? 400 : 200, c.r)); c.last = performance.now(); } }
  camRef() { return this.tab === 'space' ? this.space.cam0 : this.tab === 'orbit' ? this.orb.cam0 : null; }

  // ── Frame ──────────────────────────────────────────
  update(dt, time) {
    // Every system keeps running in the background so the story stays consistent.
    if (this.tab === 'cockpit') this.jetFrame(dt, time); else { this.jet.step(Math.min(dt, 0.05)); }
    this.ascFrame(dt, time);
    this.orbFrame(dt, time);
    this.rngFrame(dt);
    this.uiT += dt; this.uiSlow += dt;
    if (this.uiT > 0.08) { this.uiT = 0; const full = this.uiSlow > 0.33; if (full) this.uiSlow = 0; this.live(full); }
  }
  live(full) {
    if (!this.entered) return;
    if (this.tab === 'cockpit') this.jetLive(full);
    if (this.tab === 'space') this.ascLive(full);
    if (this.tab === 'orbit') this.orbLive(full);
    if (this.tab === 'range') this.rngLive(full);
  }
}
export { radarSnr, tsiolkovsky, period };
