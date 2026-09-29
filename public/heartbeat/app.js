import * as THREE from 'three';
import { Heart, HEART_DEFAULT, hemo, CHADS_ITEMS, chadsVasc } from './sim/heart.js';
import { StrokeCase, TIMES, NEURONS_PER_ML, SAVER, theta, abc2, ellipsoid, ichScore, COLLATERALS } from './sim/stroke.js';
import { Neuron, ATP_LEDGER, ATP_TOTAL, H_PER_ATP, RT_F, ROS_PTP, DG0, RT_kJ } from './sim/mito.js';
import { prep2, recoveryCurve, PHASES, PREP2_ARAT, phaseAt, MITO_RECOVERY, PREVENTION, FM_MAX } from './sim/recovery.js';
import { buildHeart } from './view/heart3d.js';
import { buildBrain } from './view/brain3d.js';
import { buildMito } from './view/mito3d.js';
import { lineChart, monitor } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT · the app: heart, stroke, mitochondria, recovery.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const big = (n) => { if (!Number.isFinite(n)) return '—'; if (n >= 1e9) return (n / 1e9).toFixed(2) + ' B'; if (n >= 1e6) return (n / 1e6).toFixed(1) + ' M'; if (n >= 1e3) return (n / 1e3).toFixed(0) + ' k'; return Math.round(n).toString(); };
const hmm = (min) => { const m = Math.max(0, Math.floor(min)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const mmss = (s) => { const x = Math.max(0, Math.floor(s)); return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; };

const PRESETS = {
  rest: {},
  exercise: { hr: 135, emax: 3.6, R: 0.55, pla: 11, C: 1.0 },
  hf: { emax: 0.95, pla: 17, R: 1.25 },
  htn: { R: 1.65, C: 0.6 },
  af: { af: true, hr: 105 },
};
const SPEEDS_CASE = [1, 4, 15];      // simulated minutes per real second
const SPEEDS_MITO = [5, 20, 60];     // simulated seconds per real second

export class Heartbeat {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#020308');
    this.scene.fog = new THREE.FogExp2('#020308', 0.035);
    this.camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.05, 200);
    this.cam = { yaw: 0.3, pitch: 0.18, r: 8, target: new THREE.Vector3(), goal: { yaw: 0.3, pitch: 0.18, r: 8, t: new THREE.Vector3(0, 0.4, 0) }, drag: null };
    this.buildWorld();
    app.stage.use(this.scene, this.camera);

    // Models.
    this.heart = new Heart();
    this.heart.onBeat = () => { if (this.tab === 'heart' && this.entered) this.beatSound(); };
    this.chads = { htn: true, age65: true };
    this.caseOpts = { type: 'isch', collat: 'moderate', cardio: false };
    this.sc = null; this.caseRun = false; this.speedCase = 1; this.cachedUntreated = null;
    this.neuron = new Neuron(); this.mitoRun = true; this.speedMito = 1; this.mitoScenario = 'normal'; this.ischStart = null;
    this.rec = { month: 0, play: false, safe: 3, age: 68, mep: true, nihss: 9, fm0: 22, practice: 1, aerobic: true };
    this.seen = { heart: false, af: false, stroke: false, mito: false, rescue: false, recovery: false };
    this.defaultLesion = this.makeDefaultLesion();
    this.tab = 'heart'; this.entered = false; this.uiT = 0;
  }

  // ── World ──────────────────────────────────────────
  buildWorld() {
    const S = this.scene;
    S.add(new THREE.AmbientLight('#8090c0', 0.5));
    const key = new THREE.PointLight('#ffd0e0', 30, 30); key.position.set(3, 4, 5); S.add(key);
    const rim = new THREE.PointLight('#3ff3ff', 20, 30); rim.position.set(-4, 1, -4); S.add(rim);
    this.H3 = buildHeart(); this.B3 = buildBrain(); this.M3 = buildMito();
    this.H3.group.position.set(0, 0, 0);
    this.B3.group.position.set(0, 0.2, 0);
    this.M3.group.position.set(0, 0, 0);
    S.add(this.H3.group, this.B3.group, this.M3.group);
    // Holographic floor: concentric rings and radial ticks under the subject.
    const floor = new THREE.Group(); floor.position.y = -2.3;
    const ringMat = new THREE.LineBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let r = 1; r <= 6; r++) { const pts = []; for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7)); } floor.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat)); }
    const tick = []; for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2, r0 = 3.9, r1 = i % 6 ? 4.05 : 4.3; tick.push(new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0), new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1)); }
    floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tick), ringMat));
    this.floor = floor; S.add(floor);
    // Dust motes for depth.
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const r = 4 + Math.random() * 16, a = Math.random() * Math.PI * 2; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - 0.4) * 9; pos[i * 3 + 2] = Math.sin(a) * r; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#7fb8ff', size: 0.035, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    S.add(this.dust);
  }

  // A reference lesion for the recovery tab if no case has been run.
  makeDefaultLesion() {
    const sc = new StrokeCase(this.B3.weights, this.B3.mlPerVoxel, { collat: 'moderate' });
    sc.update(150); sc.r = 0.93; sc.update(1);
    return sc.dead;
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    this.H3.group.visible = tab === 'heart';
    this.B3.group.visible = tab === 'stroke' || tab === 'recovery';
    this.M3.group.visible = tab === 'mito';
    this.floor.visible = tab !== 'mito';
    const G = this.cam.goal;
    if (tab === 'heart') { Object.assign(G, { r: 9.4, pitch: 0.16 }); G.t.set(0.15, 0.55, 0); }
    if (tab === 'stroke' || tab === 'recovery') { Object.assign(G, { r: 8.2, pitch: 0.22, yaw: tab === 'stroke' ? 0.9 : 0.6 }); G.t.set(0, 0.1, 0); }
    if (tab === 'mito') { Object.assign(G, { r: 11.5, pitch: 0.3, yaw: 0.45 }); G.t.set(0, 0, 0); }
    this.seen[tab === 'stroke' ? 'stroke' : tab] = true;
    this.render();
    this.caption(`cap.${tab}`);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const p = $('#panel'), s = $('#side');
    if (this.tab === 'heart') { p.innerHTML = this.heartPanel(); s.innerHTML = this.heartSide(); this.bindHeart(); }
    if (this.tab === 'stroke') { p.innerHTML = this.strokePanel(); s.innerHTML = this.strokeSide(); this.bindStroke(); }
    if (this.tab === 'mito') { p.innerHTML = this.mitoPanel(); s.innerHTML = this.mitoSide(); this.bindMito(); }
    if (this.tab === 'recovery') { p.innerHTML = this.recPanel(); s.innerHTML = this.recSide(); this.bindRec(); }
    this.live(true);
  }

  // ═══ HEART ═════════════════════════════════════════
  heartPanel() {
    const P = this.heart.p, sl = (k, min, max, step, unit) => `
      <label class="sl"><span>${t('h.sl.' + k)}</span><b class="mono" data-v="${k}">${P[k]}</b><em>${unit}</em>
      <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${P[k]}"></label>`;
    const chads = CHADS_ITEMS.map(([k, w]) => `<label class="chk"><input type="checkbox" data-c="${k}" ${this.chads[k] ? 'checked' : ''}> ${t('ch.' + k)} <em>+${w}</em></label>`).join('');
    return `
      <header class="lv-head mono">${t('h.title')}</header>
      <p class="intro">${t('h.intro')}</p>
      <div class="vitals">
        ${['hr', 'bp', 'map', 'sv', 'ef', 'co'].map((k) => `<div class="vt" data-vt="${k}"><small>${t('v.' + k)}</small><b class="mono">—</b><em>${t('u.' + k)}</em></div>`).join('')}
      </div>
      <div class="chips">${Object.keys(PRESETS).map((k) => `<button class="btn seg ${this.preset === k ? 'active' : ''}" data-pre="${k}">${t('pre.' + k)}</button>`).join('')}</div>
      ${sl('hr', 40, 170, 1, 'bpm')}${sl('emax', 0.6, 4.5, 0.05, 'mmHg/mL')}${sl('pla', 3, 22, 0.5, 'mmHg')}${sl('R', 0.4, 2.4, 0.01, 'mmHg·s/mL')}${sl('C', 0.4, 2.2, 0.01, 'mL/mmHg')}
      <label class="toggle"><input type="checkbox" id="h-af" ${P.af ? 'checked' : ''}> <span>${t('h.af')}</span></label>
      <div class="afcard ${P.af ? '' : 'hidden'}">
        <header class="lv-sub mono">${t('h.afTitle')}</header>
        <p class="small">${t('h.afWhy')}</p>
        <div class="meter"><span>${t('h.stasis')}</span><i><b data-m="stasis"></b></i></div>
        <header class="lv-sub mono">CHA₂DS₂-VASc</header>
        <div class="chads">${chads}</div>
        <div class="result mono" data-chads></div>
        <button class="btn primary" id="h-launch">${t('h.launch')}</button>
      </div>`;
  }
  heartSide() {
    return `
      <header class="lv-head mono">${t('h.monitor')}</header>
      <div class="mon-row"><span class="mono tag g">II</span><canvas class="cv ecg" id="cv-ecg"></canvas><b class="mono big g" data-vt2="hr">—</b></div>
      <div class="mon-row"><span class="mono tag r">ART</span><canvas class="cv ecg" id="cv-art"></canvas><b class="mono big r" data-vt2="bp">—</b></div>
      <canvas class="cv chart" id="cv-press"></canvas>
      <canvas class="cv loop" id="cv-pv"></canvas>
      <header class="lv-sub mono">${t('h.math')}</header>
      <div class="math mono" id="h-math"></div>`;
  }
  bindHeart() {
    const p = $('#panel');
    p.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.k, v = +el.value; this.heart.set(k, v); p.querySelector(`[data-v="${k}"]`).textContent = v; this.preset = null; p.querySelectorAll('[data-pre]').forEach((b) => b.classList.remove('active')); }));
    p.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => this.applyPreset(b.dataset.pre)));
    $('#h-af').onchange = (e) => { this.heart.set('af', e.target.checked); if (e.target.checked) this.seen.af = true; this.render(); };
    p.querySelectorAll('[data-c]').forEach((el) => (el.onchange = () => { this.chads[el.dataset.c] = el.checked; this.live(true); }));
    const L = $('#h-launch'); if (L) L.onclick = () => this.launchEmbolus();
  }
  applyPreset(k) {
    const base = { ...HEART_DEFAULT, ...PRESETS[k] };
    for (const key of ['hr', 'emax', 'pla', 'R', 'C', 'af']) this.heart.set(key, base[key]);
    this.heart.nextRR = this.heart.drawRR();
    if (k === 'af') this.seen.af = true;
    this.preset = k; sfx.confirm(); this.render(); this.caption('cap.pre.' + k);
  }
  launchEmbolus() {
    if (this.H3.embState && !this.H3.embState.done) return;
    this.heart.stasis = Math.max(this.heart.stasis, 0.6);
    sfx.alarm(); this.caption('cap.embolus');
    this.H3.launch(() => {
      this.app.stage.flash('#ff2040'); sfx.bang();
      this.app.feed.push('feed.embolus', 'bad');
      setTimeout(() => { this.caseOpts = { type: 'isch', collat: 'moderate', cardio: true }; this.startCase(); this.setTab('stroke'); this.H3.clearEmbolus(); }, 900);
    });
  }
  beatSound() { sfx.beat?.(this.heart.p.af); }
  heartLive(full) {
    const B = this.heart.last; if (!B) return;
    const set = (k, v) => { const el = document.querySelector(`[data-vt="${k}"] b`); if (el) el.textContent = v; const e2 = document.querySelector(`[data-vt2="${k}"]`); if (e2) e2.textContent = v; };
    set('hr', f0(B.hr)); set('bp', `${f0(B.sbp)}/${f0(B.dbp)}`); set('map', f0(B.map)); set('sv', f0(B.sv)); set('ef', f0(B.ef * 100)); set('co', f1(B.co));
    const m = document.querySelector('[data-m="stasis"]'); if (m) m.style.width = `${Math.round(this.heart.stasis * 100)}%`;
    const r = chadsVasc(this.chads), cr = $('[data-chads]');
    if (cr) cr.innerHTML = t('h.chadsRes', { s: r.score, r: r.rate.toFixed(1) }) + `<br><span class="small">${t(r.score >= 2 || (r.score >= 1 && !this.chads.female) ? 'h.chadsAc' : 'h.chadsLow')}</span>`;
    const mt = $('#h-math');
    if (mt && full) {
      const P = this.heart.p, cvp = P.Pv, svrW = hemo.svrWood(B.map, cvp, B.co), est = hemo.mapFormula(B.sbp, B.dbp);
      mt.innerHTML = `
        <div>CO = HR × SV = ${f0(B.hr)} × ${f0(B.sv)} mL = <b>${f2(B.co)} L/min</b></div>
        <div>EF = SV / EDV = ${f0(B.sv)} / ${f0(B.edv)} = <b>${f0(B.ef * 100)} %</b></div>
        <div>MAP = (1/T)∫P<sub>ao</sub>dt = <b>${f0(B.map)}</b> · ${t('h.bedside')} DBP + PP/3 = ${f0(est)} mmHg</div>
        <div>SVR = (MAP − CVP)/CO = ${f1(svrW)} WU = <b>${f0(svrW * 80)} dyn·s·cm⁻⁵</b></div>
        <div>P<sub>LV</sub> = E(t)·(V − V₀), E<sub>es</sub> = ${P.emax.toFixed(2)} mmHg/mL</div>
        <div>τ<sub>RC</sub> = R·C = ${(P.R * P.C).toFixed(2)} s · QT<sub>c</sub> = QT/√RR = 400 ms</div>`;
    }
  }
  heartCharts() {
    const tr = this.heart.trace; if (!tr.length) return;
    const tNow = tr[tr.length - 1][0];
    const e = $('#cv-ecg'); if (e) monitor(e, tr.map((r) => [r[0], r[5]]), { span: 4, lo: -0.5, hi: 1.5, color: '#5dffa8', now: tNow });
    const a = $('#cv-art'); if (a) monitor(a, tr.map((r) => [r[0], r[2]]), { span: 4, lo: 40, hi: 190, color: '#ff4466', now: tNow });
    const pr = $('#cv-press');
    if (pr) {
      const win = tr.filter((r) => r[0] > tNow - 2.5);
      lineChart(pr, { x0: tNow - 2.5, x1: tNow, y0: 0, y1: 180, xFmt: (v) => (v - tNow).toFixed(1) + 's', yTicks: [0, 60, 120, 180], title: t('h.pressures'),
        series: [{ pts: win.map((r) => [r[0], r[3]]), color: '#c85cff', label: 'LA', width: 1.2 }, { pts: win.map((r) => [r[0], r[2]]), color: '#ff4466', label: 'Ao' }, { pts: win.map((r) => [r[0], r[1]]), color: '#3ff3ff', label: 'LV' }] });
    }
    const pv = $('#cv-pv');
    if (pv) {
      const last = tr.slice(-Math.min(tr.length, Math.round((this.heart.rr * 1.02) / 0.004)));
      lineChart(pv, { x0: 0, x1: 200, y0: 0, y1: 180, xTicks: [0, 50, 100, 150, 200], yTicks: [0, 60, 120, 180], xFmt: (v) => v + (v === 200 ? ' mL' : ''), title: t('h.pvloop'),
        series: [{ pts: last.map((r) => [r[4], r[1]]), color: '#ffd36b', width: 2 }, { pts: [[this.heart.p.v0, 0], [this.heart.p.v0 + 180 / this.heart.p.emax, 180]], color: 'rgba(255,79,216,.55)', dash: [4, 4], width: 1, label: 'ESPVR' }] });
    }
  }

  // ═══ STROKE ════════════════════════════════════════
  startCase() {
    this.sc = new StrokeCase(this.B3.weights, this.B3.mlPerVoxel, { type: this.caseOpts.type, collat: this.caseOpts.collat, seed: 7 });
    this.sc.onNote = (key, v) => { this.app.feed.push(key, key.includes('recan') || key.includes('lysisEffect') ? 'ok' : 'warn', v); sfx.confirm(); if (this.tab === 'stroke') this.renderStrokeActions(); };
    this.caseRun = true; this.cachedUntreated = null; this.seen.stroke = true;
    this.befast = new Set();
    if (this.tab === 'stroke') this.render();
  }
  untreatedFinal() {
    if (this.cachedUntreated !== null || !this.sc) return this.cachedUntreated;
    const sc = this.sc; let n = 0;
    for (let i = 0; i < sc.N; i++) { if (sc.w[i] <= 0) continue; const cbf = 50 - Math.min(48, (50 - sc.cbfCentre) * sc.w[i] * sc.n[i]); if (cbf < 18) n++; }
    return (this.cachedUntreated = n * sc.ml);
  }
  strokePanel() {
    const sc = this.sc, O = this.caseOpts;
    if (!sc) {
      return `<header class="lv-head mono">${t('s.title')}</header><p class="intro">${t('s.intro')}</p>
        <div class="split mono"><div><b class="c-red">87 %</b><small>${t('s.isch')}</small></div><div><b class="c-amber">13 %</b><small>${t('s.hem')}</small></div></div>
        <header class="lv-sub mono">${t('s.scenario')}</header>
        <div class="chips">${['isch', 'ich'].map((k) => `<button class="btn seg ${O.type === k ? 'active' : ''}" data-type="${k}">${t('s.type.' + k)}</button>`).join('')}</div>
        <header class="lv-sub mono">${t('s.collat')}</header>
        <div class="chips">${Object.keys(COLLATERALS).map((k) => `<button class="btn seg ${O.collat === k ? 'active' : ''}" data-col="${k}">${t('s.col.' + k)}</button>`).join('')}</div>
        <p class="small">${t('s.collatWhy')}</p>
        <button class="btn primary wide" id="s-start">${t('s.start')}</button>`;
    }
    const ich = sc.type === 'ich';
    return `
      <header class="lv-head mono">${t(ich ? 's.titleIch' : 's.titleIsch')}${O.cardio ? ' · ' + t('s.cardio') : ''}</header>
      <p class="story">${t(ich ? 's.storyIch' : 's.story')}</p>
      <div class="clock"><small>${t('s.since')}</small><b class="mono" id="s-clock">0:00</b>
        <div class="speeds">${SPEEDS_CASE.map((v, i) => `<button class="btn seg ${this.speedCase === i ? 'active' : ''}" data-sp="${i}">${v} ${t('s.minPerS')}</button>`).join('')}<button class="btn seg" id="s-pause">${this.caseRun ? '❚❚' : '▶'}</button></div></div>
      <header class="lv-sub mono">BE-FAST</header>
      <div class="befast">${['B', 'E', 'F', 'A', 'S', 'T'].map((k) => `<button class="bf ${this.befast?.has(k) ? 'on' : ''}" data-bf="${k}"><b>${k}</b><small>${t('bf.' + k)}</small></button>`).join('')}</div>
      <div class="bf-note small" id="bf-note">${t('bf.hint')}</div>
      <header class="lv-sub mono">${t('s.actions')}</header>
      <div class="actions-grid" id="s-actions"></div>
      <button class="btn panel wide" id="s-reset">↺ ${t('s.reset')}</button>`;
  }
  strokeSide() {
    const sc = this.sc;
    if (!sc) return `<header class="lv-head mono">${t('s.timeBrain')}</header>
      <div class="bigstats"><div><b class="mono">1.9 M</b><small>${t('s.nPerMin')}</small></div><div><b class="mono">14 B</b><small>${t('s.synPerMin')}</small></div><div><b class="mono">12 km</b><small>${t('s.kmPerMin')}</small></div></div>
      <p class="small">${t('s.saver')}</p>
      <header class="lv-sub mono">${t('s.model')}</header>
      <div class="math mono">CBF = 50 − (50 − CBF<sub>c</sub>)·w<br>θ(t) = 18 − 12·e<sup>−t/180 min</sup> mL/100 g/min<br>${t('s.dies')}<br>${t('s.penDef')}</div>`;
    if (sc.type === 'ich') return `<header class="lv-head mono">${t('s.hematoma')}</header>
      <div class="bigstats"><div><b class="mono" data-s="vol">—</b><small>ABC/2 (mL)</small></div><div><b class="mono" data-s="volE">—</b><small>4/3·π·abc (mL)</small></div><div><b class="mono" data-s="sbp">—</b><small>SBP (mmHg)</small></div></div>
      <div class="math mono" data-s="abc"></div>
      <header class="lv-sub mono">ICH score (Hemphill 2001)</header>
      <div class="result mono" data-s="ichs"></div>
      <canvas class="cv chart" id="cv-case"></canvas>
      <p class="small">${t('s.ichWhy')}</p>`;
    return `
      <header class="lv-head mono">${t('s.tissue')}</header>
      <div class="bigstats">
        <div><b class="mono c-red" data-s="core">—</b><small>${t('s.core')} (mL)</small></div>
        <div><b class="mono c-amber" data-s="pen">—</b><small>${t('s.pen')} (mL)</small></div>
        <div><b class="mono" data-s="ratio">—</b><small>${t('s.ratio')}</small></div>
      </div>
      <div class="neurons"><small>${t('s.lost')}</small><b class="mono" data-s="neurons">0</b><span class="mono small" data-s="rate"></span></div>
      <div class="kv mono"><span>θ(t)</span><b data-s="theta">—</b><span>${t('s.age')}</span><b data-s="years">—</b><span>DEFUSE 3</span><b data-s="d3">—</b></div>
      <canvas class="cv chart" id="cv-case"></canvas>
      <div class="kv mono" id="s-times"></div>
      <div class="outcome hidden" id="s-outcome"></div>`;
  }
  bindStroke() {
    const p = $('#panel');
    p.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { this.caseOpts.type = b.dataset.type; this.render(); }));
    p.querySelectorAll('[data-col]').forEach((b) => (b.onclick = () => { this.caseOpts.collat = b.dataset.col; this.render(); }));
    const st = $('#s-start'); if (st) st.onclick = () => { this.caseOpts.cardio = false; this.startCase(); this.render(); this.caption('cap.caseStart'); };
    p.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => { this.speedCase = +b.dataset.sp; this.render(); }));
    const ps = $('#s-pause'); if (ps) ps.onclick = () => { this.caseRun = !this.caseRun; ps.textContent = this.caseRun ? '❚❚' : '▶'; };
    const rs = $('#s-reset'); if (rs) rs.onclick = () => { this.sc = null; this.render(); };
    p.querySelectorAll('[data-bf]').forEach((b) => (b.onclick = () => this.toggleBF(b.dataset.bf)));
    if (this.sc) this.renderStrokeActions();
  }
  toggleBF(k) {
    const present = this.sc?.type === 'ich' ? ['F', 'A', 'S', 'T'] : ['E', 'F', 'A', 'S', 'T'];
    if (!this.befast) this.befast = new Set();
    this.befast.has(k) ? this.befast.delete(k) : this.befast.add(k);
    const el = document.querySelector(`[data-bf="${k}"]`); if (el) el.classList.toggle('on', this.befast.has(k));
    const n = $('#bf-note'); if (n) { n.textContent = present.includes(k) ? t('bf.yes.' + k) : t('bf.no.' + k); n.className = 'bf-note small ' + (present.includes(k) ? 'ok' : 'warn'); }
    sfx.select();
  }
  renderStrokeActions() {
    const box = $('#s-actions'); if (!box || !this.sc) return;
    const sc = this.sc, ev = sc.ev, ich = sc.type === 'ich';
    const acts = ich ? ['call', 'ct', 'lysis', 'bp', 'reverse'] : ['call', 'ct', 'cta', 'lysis', 'evt'];
    const state = (a) => {
      const done = { call: ev.call, ct: ev.ct, cta: ev.cta, lysis: ev.lysis, evt: ev.recan, bp: ev.bp, reverse: ev.rev }[a];
      const pend = { ct: ev.ctReq != null && ev.ct == null, cta: ev.ctaReq != null && ev.cta == null, evt: ev.evt != null && ev.recan == null, call: ev.call != null && ev.door == null }[a];
      return done != null && !pend ? 'done' : pend ? 'pend' : '';
    };
    box.innerHTML = acts.map((a) => `<button class="act ${state(a)}" data-act="${a}"><b>${t('a.' + a)}</b><small>${t('a.' + a + '.d')}</small></button>`).join('');
    box.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => this.act(b.dataset.act)));
  }
  act(a) {
    const sc = this.sc; if (!sc) return;
    const r = sc[a === 'reverse' ? 'reverse' : a]();
    if (r.ok) { sfx.confirm(); this.app.feed.push(r.key, 'ok'); }
    else { sfx.deny(); this.app.feed.push(r.key, r.key === 'cs.lysisIch' ? 'bad' : 'warn'); if (r.key === 'cs.lysisIch') this.app.stage.flash('#ff2040'); }
    this.renderStrokeActions();
  }
  strokeLive(full) {
    const sc = this.sc; if (!sc) return;
    const c = $('#s-clock'); if (c) c.textContent = hmm(sc.t);
    const set = (k, v) => { const el = document.querySelector(`[data-s="${k}"]`); if (el) el.innerHTML = v; };
    if (sc.type === 'ich') {
      const [A, B, C] = sc.ichAxes(), v = abc2(A, B, C), ve = ellipsoid(A, B, C), s = ichScore({ gcs: v >= 30 ? 12 : 14, vol: v, ivh: false, infra: false, age: 68 });
      set('vol', f1(v)); set('volE', f1(ve)); set('sbp', f0(sc.ich.sbp));
      set('abc', `A = ${f1(A)} cm · B = ${f1(B)} cm · C = ${f1(C)} cm<br>ABC/2 = ${f1(v)} mL · ${t('s.exact')} = ${f1(ve)} mL (π/6 ≈ 0.524 vs 0.5)`);
      set('ichs', t('s.ichRes', { s: s.score, m: s.mortality }));
    } else {
      const m = sc.metrics(), rate = sc.rate();
      set('core', f1(m.core)); set('pen', f1(m.pen)); set('ratio', m.core > 0.5 ? f1((m.core + m.pen) / m.core) : '∞');
      set('neurons', big(m.neurons)); set('rate', rate > 1e4 ? `−${big(rate)}/min` : '');
      set('theta', `${f1(m.theta)} mL/100g/min`); set('years', `${f1(m.years)} ${t('s.yrs')}`);
      set('d3', m.d3.ok ? `<span class="c-green">${t('s.d3ok')}</span>` : `<span class="c-amber">${t('s.d3no')}</span>`);
      const ev = sc.ev, rel = (a, b) => (a != null && b != null ? hmm(b - a) : '—');
      const tm = $('#s-times');
      if (tm && full) tm.innerHTML = `<span>${t('s.t.door')}</span><b>${rel(0, ev.door)}</b><span>${t('s.t.ct')}</span><b>${rel(ev.door, ev.ct)}</b><span>${t('s.t.dtn')}</span><b>${rel(ev.door, ev.lysis)}</b><span>${t('s.t.groin')}</span><b>${rel(ev.door, ev.groin)}</b><span>${t('s.t.recan')}</span><b>${rel(0, ev.recan)}</b>`;
      const oc = $('#s-outcome');
      if (oc && full && ev.recan != null && sc.t - ev.recan > 30) {
        const u = this.untreatedFinal(), saved = Math.max(0, u - m.core);
        oc.classList.remove('hidden');
        oc.innerHTML = `<b>${t('s.outcome')}</b><p>${t('s.outcomeTxt', { c: f0(m.core), u: f0(u), s: f0(saved), n: big(saved * NEURONS_PER_ML) })}</p>`;
      }
    }
    const cv = $('#cv-case');
    if (cv) {
      const H = sc.hist, x1 = Math.max(120, sc.t);
      if (sc.type === 'ich') {
        lineChart(cv, { x0: 0, x1, y0: 0, y1: Math.max(40, sc.ich.v * 1.3), xFmt: (v) => hmm(v), title: t('s.volChart'), series: [{ pts: this.ichHist ?? [], color: '#ff4466', label: 'mL', fill: 'rgba(255,68,102,.12)' }], marks: [{ y: 30, color: 'rgba(255,184,107,.8)', label: '30 mL' }] });
      } else {
        const marks = [];
        if (sc.ev.lysis != null) marks.push({ x: sc.ev.lysis, color: '#3ff3ff', label: t('a.lysis') });
        if (sc.ev.recan != null) marks.push({ x: sc.ev.recan, color: '#5dffa8', label: t('s.recan') });
        marks.push({ x: TIMES.lysisWindow, color: 'rgba(255,184,107,.5)', label: '4.5 h' });
        lineChart(cv, { x0: 0, x1, y0: 0, y1: Math.max(60, ...H.map((h) => h[1] + h[2])) * 1.1, xFmt: (v) => hmm(v), title: t('s.chart'), marks,
          series: [{ pts: H.map((h) => [h[0], h[1] + h[2]]), color: '#ffae3b', label: t('s.pen'), fill: 'rgba(255,174,59,.12)' }, { pts: H.map((h) => [h[0], h[1]]), color: '#ff1f5a', label: t('s.core'), fill: 'rgba(255,31,90,.18)' }] });
      }
    }
  }
  tickCase(dt) {
    if (!this.sc || !this.caseRun) return;
    const dm = dt * SPEEDS_CASE[this.speedCase];
    // Advance in ≤1-minute steps so scheduled events land on time.
    let left = dm; while (left > 1e-6) { const h = Math.min(1, left); this.sc.update(h); left -= h; }
    if (this.sc.type === 'ich') { (this.ichHist ??= []); if (!this.ichHist.length || this.sc.t - this.ichHist[this.ichHist.length - 1][0] >= 1) this.ichHist.push([this.sc.t, abc2(...this.sc.ichAxes())]); }
    if (this.sc.t >= 24 * 60) this.caseRun = false;
  }

  // ═══ MITOCHONDRIA ══════════════════════════════════
  mitoPanel() {
    const N = this.neuron;
    return `
      <header class="lv-head mono">${t('m.title')}</header>
      <p class="intro">${t('m.intro')}</p>
      <div class="chips">${['normal', 'pen', 'core'].map((k) => `<button class="btn seg ${this.mitoScenario === k ? 'active' : ''}" data-sc="${k}">${t('m.sc.' + k)}</button>`).join('')}
        <button class="btn seg go" id="m-reperf" ${this.mitoScenario === 'normal' || this.mitoScenario === 'reperf' ? 'disabled' : ''}>${t('m.reperf')}</button></div>
      <div class="clock small-clock"><small>${t('m.clock')}</small><b class="mono" id="m-clock">0:00</b>
        <div class="speeds">${SPEEDS_MITO.map((v, i) => `<button class="btn seg ${this.speedMito === i ? 'active' : ''}" data-msp="${i}">${v}×</button>`).join('')}<button class="btn seg" id="m-pause">${this.mitoRun ? '❚❚' : '▶'}</button><button class="btn seg" id="m-reset">↺</button></div></div>
      <header class="lv-sub mono">${t('m.rescue')}</header>
      <label class="toggle"><input type="checkbox" id="m-grad" ${N.gradual ? 'checked' : ''}> <span>${t('m.grad')}</span><em class="ev clin">${t('ev.clin')}</em></label>
      <label class="toggle"><input type="checkbox" id="m-sdh" ${N.sdhBlock ? 'checked' : ''}> <span>${t('m.sdh')}</span><em class="ev pre">${t('ev.pre')}</em></label>
      <label class="toggle"><input type="checkbox" id="m-cool" ${N.temp < 37 ? 'checked' : ''}> <span>${t('m.cool')}</span><em class="ev clin">${t('ev.clin')}</em></label>
      <header class="lv-sub mono">${t('m.cascade')}</header>
      <ol class="cascade" id="m-cascade">${['o2', 'psi', 'pcr', 'atp', 'ad', 'ca', 'ros', 'ptp', 'fate'].map((k, i) => `<li data-cs="${k}"><i>${i + 1}</i><div><b>${t('cas.' + k)}</b><small>${t('cas.' + k + '.d')}</small></div></li>`).join('')}</ol>`;
  }
  mitoSide() {
    const R = ['atp', 'pcr', 'psi', 'vm', 'ko', 'glu', 'ca', 'ph', 'ros', 'ptp', 'cytc', 'fate'];
    return `
      <header class="lv-head mono">${t('m.readouts')}</header>
      <div class="grid-ro">${R.map((k) => `<div class="ro" data-ro="${k}"><small>${t('ro.' + k)}</small><b class="mono">—</b></div>`).join('')}</div>
      <canvas class="cv chart tall" id="cv-mito"></canvas>
      <header class="lv-sub mono">${t('m.energy')}</header>
      <div class="math mono" id="m-math"></div>
      <details class="ledger"><summary class="mono">${t('m.ledger')}</summary>
        <table class="mono">${ATP_LEDGER.map((r) => `<tr><td>${t('lg.' + r[0])}</td><td>${r[2]} ${r[1]}</td><td>× ${r[3]}</td><td>= ${r[4]}</td></tr>`).join('')}<tr class="tot"><td colspan="3">${t('lg.total')}</td><td>${ATP_TOTAL}</td></tr></table>
        <p class="small">${t('m.ledgerNote')}</p></details>
      <header class="lv-sub mono">${t('m.roles')}</header>
      <ul class="roles">${['energy', 'calcium', 'ros', 'ptp', 'apop', 'infl'].map((k) => `<li><b>${t('role.' + k)}</b><span>${t('role.' + k + '.d')}</span></li>`).join('')}</ul>`;
  }
  bindMito() {
    const p = $('#panel'), N = this.neuron;
    p.querySelectorAll('[data-sc]').forEach((b) => (b.onclick = () => this.mitoSet(b.dataset.sc)));
    $('#m-reperf').onclick = () => this.mitoSet('reperf');
    p.querySelectorAll('[data-msp]').forEach((b) => (b.onclick = () => { this.speedMito = +b.dataset.msp; this.render(); }));
    $('#m-pause').onclick = () => { this.mitoRun = !this.mitoRun; this.render(); };
    $('#m-reset').onclick = () => { this.mitoReset(); this.render(); };
    $('#m-grad').onchange = (e) => { N.gradual = e.target.checked; };
    $('#m-sdh').onchange = (e) => { N.sdhBlock = e.target.checked; };
    $('#m-cool').onchange = (e) => { N.temp = e.target.checked ? 33 : 37; };
  }
  mitoReset() { const keep = { gradual: this.neuron.gradual, sdhBlock: this.neuron.sdhBlock, temp: this.neuron.temp }; this.neuron = Object.assign(new Neuron(), keep); this.mitoScenario = 'normal'; this.ischStart = null; this.rescueFlag = false; }
  mitoSet(k) {
    const N = this.neuron;
    if (k === 'reperf') {
      N.setPerfusion(1, { ramp: N.gradual ? 180 : 0 }); this.mitoScenario = 'reperf'; this.reperfAt = N.t;
      this.rescueFlag = N.gradual || N.sdhBlock || N.temp < 37;
      this.caption('cap.reperf'); sfx.valve?.();
    } else {
      if (this.mitoScenario === 'reperf' || (k !== 'normal' && this.mitoScenario !== 'normal')) this.mitoReset();
      const p = { normal: 1, pen: 0.3, core: 0.05 }[k];
      this.neuron.setPerfusion(p); this.mitoScenario = k; this.ischStart = k === 'normal' ? null : this.neuron.t;
      this.caption('cap.m.' + k); sfx.warn();
    }
    this.seen.mito = true; this.render();
  }
  mitoLive(full) {
    const N = this.neuron, s = N.s, d = N.derived();
    const c = $('#m-clock'); if (c) c.textContent = mmss(N.t);
    const set = (k, v, cls = '') => { const el = document.querySelector(`[data-ro="${k}"] b`); if (el) { el.innerHTML = v; el.className = 'mono ' + cls; } };
    set('atp', `${f2(s.atp)} mM`, s.atp < 0.5 ? 'c-red' : s.atp < 1.8 ? 'c-amber' : 'c-green');
    set('pcr', `${f1(s.pcr)} mM`); set('psi', `−${f0(s.psi)} mV`, s.psi < 120 ? 'c-red' : s.psi < 155 ? 'c-amber' : 'c-green');
    set('vm', `${f0(d.Vm)} mV`, d.Vm > -40 ? 'c-red' : ''); set('ko', `${f1(s.ko)} mM`, s.ko > 12 ? 'c-red' : '');
    set('glu', `${f0(s.glu)} µM`, s.glu > 20 ? 'c-red' : ''); set('ca', `${s.cai < 1 ? (s.cai * 1000).toFixed(0) + ' nM' : f1(s.cai) + ' µM'}`, s.cai > 1 ? 'c-red' : '');
    set('ph', f2(d.pH), d.pH < 6.8 ? 'c-amber' : ''); set('ros', f2(s.ros), s.ros > ROS_PTP ? 'c-red' : '');
    set('ptp', `${f0(s.ptp * 100)} %`, s.ptp > 0.3 ? 'c-red' : ''); set('cytc', `${f0(s.cytc * 100)} %`, s.cytc > 0.2 ? 'c-red' : '');
    set('fate', t('fate.' + N.fate), N.fate === 'alive' ? 'c-green' : N.fate === 'committed' ? 'c-amber' : 'c-red');
    // Cascade lights.
    const ev = N.events, on = {
      o2: s.o < 0.5, psi: s.psi < 140, pcr: ev.pcr != null && s.pcr < 1, atp: s.atp < 0.5, ad: s.ko > 20, ca: s.cai > 1, ros: s.ros > ROS_PTP * 0.8, ptp: s.ptp > 0.2, fate: N.fate !== 'alive',
    };
    document.querySelectorAll('[data-cs]').forEach((li) => li.classList.toggle('on', !!on[li.dataset.cs]));
    if (this.mitoScenario === 'reperf' && N.t - this.reperfAt > 300 && this.rescueFlag && N.fate === 'alive' && N.s.ptp < 0.05) this.seen.rescue = true;
    const mt = $('#m-math');
    if (mt && full) {
      const nF = H_PER_ATP * 96.485 * (d.dp / 1000), dir = d.drive >= 0;
      const EK = d.EK, ko = s.ko, ki = d.ki;
      mt.innerHTML = `
        <div>ΔG<sub>ATP</sub> = ΔG°′ + RT·ln([ATP]/[ADP][Pᵢ]) = ${DG0} + ${RT_kJ.toFixed(3)}·ln(${f2(s.atp)}/(${f2(d.adp)}·${f2(d.pi)})·10³) = <b>${f1(d.dG)} kJ/mol</b></div>
        <div>n·F·Δp = ${H_PER_ATP.toFixed(2)} × 96.485 × ${(d.dp / 1000).toFixed(3)} V = <b>${f1(nF)} kJ/mol</b></div>
        <div class="${dir ? 'c-green' : 'c-red'}">→ ${t(dir ? 'm.fwd' : 'm.rev')} (${d.drive >= 0 ? '+' : ''}${f1(d.drive)} kJ/mol)</div>
        <div>E<sub>K</sub> = (RT/F)·ln([K⁺]ₒ/[K⁺]ᵢ) = ${RT_F.toFixed(2)}·ln(${f1(ko)}/${f0(ki)}) = <b>${f0(EK)} mV</b></div>
        <div>V<sub>m</sub> = (g<sub>Na</sub>E<sub>Na</sub> + g<sub>K</sub>E<sub>K</sub> − I<sub>pump</sub>)/(g<sub>Na</sub> + g<sub>K</sub>) = <b>${f0(d.Vm)} mV</b></div>`;
    }
    const cv = $('#cv-mito');
    if (cv) {
      const tr = N.trace, t1 = Math.max(120, N.t), t0 = Math.max(0, t1 - 900);
      const w = tr.filter((r) => r[0] >= t0);
      const marks = []; if (this.ischStart != null && this.ischStart >= t0) marks.push({ x: this.ischStart, color: '#ffae3b', label: t('m.mIsch') }); if (this.reperfAt != null && this.mitoScenario === 'reperf') marks.push({ x: this.reperfAt, color: '#5dffa8', label: t('m.mRep') });
      lineChart(cv, { x0: t0, x1: t1, y0: 0, y1: 1.15, yTicks: [0, 0.5, 1], yFmt: (v) => v.toFixed(1), xFmt: (v) => mmss(v), title: t('m.chart'), marks,
        series: [
          { pts: w.map((r) => [r[0], r[1] / 2.5]), color: '#ffd36b', label: 'ATP' },
          { pts: w.map((r) => [r[0], r[2] / 180]), color: '#ff6fb8', label: 'ΔΨm' },
          { pts: w.map((r) => [r[0], (r[3] + 90) / 110]), color: '#3ff3ff', label: 'Vm' },
          { pts: w.map((r) => [r[0], Math.min(1.1, Math.log10(1 + r[4] * 10) / 2.6)]), color: '#7dff9a', label: 'Ca²⁺' },
          { pts: w.map((r) => [r[0], Math.min(1.1, r[5] / 0.6)]), color: '#ff5a3a', label: 'ROS' },
          { pts: w.map((r) => [r[0], r[6]]), color: '#c08bff', label: 'mPTP' },
        ] });
    }
  }

  // ═══ RECOVERY ══════════════════════════════════════
  recPanel() {
    const R = this.rec, pr = prep2(R);
    const sl = (k, min, max, step, lab) => `<label class="sl"><span>${lab}</span><b class="mono" data-rv="${k}">${R[k]}</b><em></em><input type="range" data-rk="${k}" min="${min}" max="${max}" step="${step}" value="${R[k]}"></label>`;
    return `
      <header class="lv-head mono">${t('r.title')}</header>
      <p class="intro">${t('r.intro')}</p>
      <div class="clock"><small>${t('r.since')}</small><b class="mono" id="r-month">0</b><span class="mono small" id="r-phase"></span>
        <div class="speeds"><button class="btn seg" id="r-play">${R.play ? '❚❚' : '▶'}</button></div></div>
      <input type="range" id="r-scrub" min="0" max="12" step="0.05" value="${R.month}" class="scrub">
      <header class="lv-sub mono">PREP2 · ${t('r.prep')}</header>
      ${sl('safe', 0, 10, 1, t('r.safe'))}${sl('age', 30, 95, 1, t('r.age'))}${sl('nihss', 0, 30, 1, 'NIHSS')}
      <div class="chips"><span class="small">MEP (TMS)</span>${[['pos', true], ['neg', false]].map(([k, v]) => `<button class="btn seg ${R.mep === v ? 'active' : ''}" data-mep="${k}">${t('r.mep.' + k)}</button>`).join('')}</div>
      <div class="result mono prep ${pr.cat || ''}">${pr.cat ? t('r.cat.' + pr.cat) + ` · ARAT ${PREP2_ARAT[pr.cat]} / 57` : t('r.needMep')}<br><span class="small">${pr.path.map((k) => t('r.path.' + k)).join(' → ')}</span></div>
      <header class="lv-sub mono">${t('r.curve')}</header>
      ${sl('fm0', 0, 66, 1, t('r.fm0'))}
      <div class="chips"><span class="small">${t('r.practice')}</span>${[0, 1, 2].map((i) => `<button class="btn seg ${R.practice === i ? 'active' : ''}" data-pr="${i}">${t('r.pr' + i)}</button>`).join('')}</div>
      <label class="toggle"><input type="checkbox" id="r-aer" ${R.aerobic ? 'checked' : ''}> <span>${t('r.aerobic')}</span></label>
      <p class="small warn-note">${t('r.avert')}</p>
      <header class="lv-sub mono">${t('r.prevent')}</header>
      <ul class="prevent">${PREVENTION.map((k) => `<li><b>${t('pv.' + k)}</b><span>${t('pv.' + k + '.d')}</span></li>`).join('')}</ul>`;
  }
  recSide() {
    return `
      <header class="lv-head mono">${t('r.fmTitle')}</header>
      <div class="bigstats"><div><b class="mono" data-r="fm">—</b><small>FM-UE / 66</small></div><div><b class="mono" data-r="gain">—</b><small>${t('r.gain')}</small></div><div><b class="mono" data-r="pred">—</b><small>${t('r.pred')}</small></div></div>
      <canvas class="cv chart tall" id="cv-rec"></canvas>
      <div class="math mono">ΔFM ≈ 0.7 × (66 − FM₀)<br>FM(t) = FM₀ + ΔFM·(1 − e<sup>−t/τ</sup>), τ ≈ 4 ${t('r.weeks')}</div>
      <p class="small">${t('r.caveat')}</p>
      <header class="lv-sub mono">${t('r.mitoTitle')}</header>
      <ul class="roles">${MITO_RECOVERY.map((m) => `<li><b>${t('mr.' + m.id)} <em class="ev ${m.ev}">${t('ev.' + m.ev)}</em></b><span>${t('mr.' + m.id + '.d')}</span></li>`).join('')}</ul>`;
  }
  bindRec() {
    const p = $('#panel'), R = this.rec;
    p.querySelectorAll('[data-rk]').forEach((el) => el.addEventListener('input', () => { R[el.dataset.rk] = +el.value; p.querySelector(`[data-rv="${el.dataset.rk}"]`).textContent = el.value; }));
    p.querySelectorAll('[data-rk]').forEach((el) => el.addEventListener('change', () => this.render()));
    p.querySelectorAll('[data-mep]').forEach((b) => (b.onclick = () => { R.mep = b.dataset.mep === 'pos'; this.render(); }));
    p.querySelectorAll('[data-pr]').forEach((b) => (b.onclick = () => { R.practice = +b.dataset.pr; this.render(); }));
    $('#r-aer').onchange = (e) => { R.aerobic = e.target.checked; };
    $('#r-play').onclick = () => { R.play = !R.play; if (R.play && R.month >= 12) R.month = 0; $('#r-play').textContent = R.play ? '❚❚' : '▶'; };
    $('#r-scrub').oninput = (e) => { R.month = +e.target.value; R.play = false; $('#r-play').textContent = '▶'; };
  }
  recModel() {
    const R = this.rec, pr = prep2(R), fitter = pr.cat !== 'poor';
    return { pr, fitter, curve: recoveryCurve({ fm0: R.fm0, fitter, practice: R.practice, aerobic: R.aerobic }) };
  }
  recLive(full) {
    const R = this.rec, { curve, fitter } = this.recModel(), fm = curve(R.month), f12 = curve(12);
    const m = $('#r-month'); if (m) m.textContent = R.month < 1 ? `${Math.round(R.month * 30.44)} ${t('r.days')}` : `${R.month.toFixed(1)} ${t('r.months')}`;
    const ph = $('#r-phase'); if (ph) ph.textContent = t('ph.' + phaseAt(R.month));
    const sc = $('#r-scrub'); if (sc && document.activeElement !== sc) sc.value = R.month;
    const set = (k, v) => { const el = document.querySelector(`[data-r="${k}"]`); if (el) el.textContent = v; };
    set('fm', f0(fm)); set('gain', `+${f0(fm - R.fm0)}`); set('pred', `${f0(f12)}${fitter ? '' : ' *'}`);
    const cv = $('#cv-rec');
    if (cv) {
      const pts = [], base = [];
      const cBase = recoveryCurve({ fm0: R.fm0, fitter, practice: 0, aerobic: false });
      for (let x = 0; x <= 12.001; x += 0.1) { pts.push([x, curve(x)]); base.push([x, cBase(x)]); }
      lineChart(cv, { x0: 0, x1: 12, y0: 0, y1: 66, yTicks: [0, 22, 44, 66], xTicks: [0, 1, 3, 6, 12], xFmt: (v) => v + (v === 12 ? ' mo' : ''),
        bands: [{ from: 7 / 30.44, to: 3, color: 'rgba(93,255,168,.07)', label: t('r.window') }, { from: 3, to: 6, color: 'rgba(63,243,255,.04)' }],
        marks: [{ x: R.month, color: '#ffd36b', dot: [R.month, fm] }, { y: R.fm0 + 0.7 * (FM_MAX - R.fm0), color: 'rgba(255,79,216,.45)', label: '0.7 × potential' }],
        series: [{ pts: base, color: 'rgba(141,151,179,.7)', dash: [4, 4], label: t('r.usual'), width: 1.2 }, { pts, color: '#5dffa8', label: t('r.plan'), fill: 'rgba(93,255,168,.08)' }] });
    }
    if (full) this.seen.recovery = true;
  }
  recLesion() {
    if (this.sc && this.sc.type === 'isch' && this.sc.t > 30) return this.sc.dead;
    return this.defaultLesion;
  }

  // ═══ Report ═════════════════════════════════════════
  showReport() {
    const sc = this.sc, m = sc && sc.type === 'isch' ? sc.metrics() : null, B = this.heart.last, chads = chadsVasc(this.chads), R = this.rec, pr = prep2(R);
    const rows = [
      [t('rep.heart', { bp: B ? `${f0(B.sbp)}/${f0(B.dbp)}` : '—', co: B ? f1(B.co) : '—', ef: B ? f0(B.ef * 100) : '—' }), this.seen.heart],
      [t('rep.af', { s: chads.score, r: chads.rate.toFixed(1) }), this.seen.af],
      [sc ? (sc.type === 'isch' ? t('rep.case', { t: sc.ev.recan != null ? hmm(sc.ev.recan) : '—', c: f0(m.core), n: big(m.neurons) }) : t('rep.caseIch', { v: f0(abc2(...sc.ichAxes())) })) : t('rep.caseNone'), !!(sc && (sc.ev.recan != null || sc.ev.bp != null))],
      [t('rep.mito', { f: t('fate.' + this.neuron.fate) }), this.seen.mito],
      [t('rep.rescue'), this.seen.rescue],
      [t('rep.rec', { c: pr.cat ? t('r.cat.' + pr.cat) : '—' }), this.seen.recovery],
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

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { this.cam.drag = { x: e.clientX, y: e.clientY }; this.cam.lastTouch = performance.now(); }
  pointerMove(e) {
    if (!this.cam.drag) return;
    const G = this.cam.goal;
    G.yaw -= (e.clientX - this.cam.drag.x) * 0.006;
    G.pitch = THREE.MathUtils.clamp(G.pitch + (e.clientY - this.cam.drag.y) * 0.004, -0.9, 1.2);
    this.cam.drag.x = e.clientX; this.cam.drag.y = e.clientY; this.cam.lastTouch = performance.now();
  }
  pointerUp() { this.cam.drag = null; }
  wheel(e) { const G = this.cam.goal; G.r = THREE.MathUtils.clamp(G.r * Math.exp(e.deltaY * 0.001), 3.2, 16); this.cam.lastTouch = performance.now(); }

  // ── Frame ──────────────────────────────────────────
  update(dt, time) {
    const c = this.cam, G = c.goal, k = 1 - Math.exp(-dt * 2.2);
    if (!c.drag && performance.now() - (c.lastTouch || 0) > 4000) G.yaw += dt * 0.06;
    c.yaw += (G.yaw - c.yaw) * k; c.pitch += (G.pitch - c.pitch) * k; c.r += (G.r - c.r) * k; c.target.lerp(G.t, k);
    this.camera.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, c.target.y + Math.sin(c.pitch) * c.r, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
    this.camera.lookAt(c.target);
    // Physiology always runs (the heart keeps beating behind the other tabs).
    this.heart.step(Math.min(dt, 0.05));
    this.tickCase(dt);
    if (this.mitoRun) this.neuron.step(Math.min(dt, 0.05) * SPEEDS_MITO[this.speedMito]);
    if (this.rec.play) { this.rec.month = Math.min(12, this.rec.month + dt * 0.8); if (this.rec.month >= 12) this.rec.play = false; }
    // 3D.
    if (this.tab === 'heart') this.H3.update(this.heart, dt, time);
    if (this.tab === 'stroke') this.B3.update(dt, time, { sc: this.sc, mode: 'stroke' });
    if (this.tab === 'recovery') { const { curve } = this.recModel(); const fm = curve(this.rec.month), f12 = curve(12); this.B3.update(dt, time, { mode: 'recovery', rec: Math.max(0, (fm - this.rec.fm0) / Math.max(1, f12 - this.rec.fm0)), lesion: this.recLesion() }); }
    if (this.tab === 'mito') this.M3.update(this.neuron, dt, time);
    this.dust.rotation.y += dt * 0.01;
    // UI at ~12 Hz; heavier text blocks at ~3 Hz.
    this.uiT += dt; this.uiSlow = (this.uiSlow || 0) + dt;
    if (this.uiT > 0.08) { this.uiT = 0; const full = this.uiSlow > 0.33; if (full) this.uiSlow = 0; this.live(full); }
  }
  live(full) {
    if (!this.entered) return;
    if (this.tab === 'heart') { this.heartLive(full); this.heartCharts(); }
    if (this.tab === 'stroke') this.strokeLive(full);
    if (this.tab === 'mito') this.mitoLive(full);
    if (this.tab === 'recovery') this.recLive(full);
  }
}

export { theta, SAVER, PHASES };
