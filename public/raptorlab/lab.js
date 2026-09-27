import * as THREE from 'three';
import { Engine, LIMITS, RATED_INFO, TP } from './engine/model.js';
import { buildScene, EXPLODE, THROAT_Y } from './engine/scene3d.js';
import { buildScope } from './engine/scope.js';
import { GEOM, RATED, BAR, G0, P_SL, products, cstar, Gamma } from './engine/thermo.js';
import { sfx, engineSound } from './core/audio.js';
import { i18n } from './core/i18n.js';

// ─────────────────────────────────────────────────────────────────────────────
// RAPTOR LAB · the lab: tools, stages, telemetry, visuals and the debrief.
// The physics lives in engine/model.js (RK4 turbomachinery + hydraulic network)
// and engine/thermo.js (nozzle theory); this file only reads and commands it.
// ─────────────────────────────────────────────────────────────────────────────

const ICON = {
  chill: '<path d="M12 2v20M4 6l16 12M20 6L4 18"/><path d="M9 3l3 3 3-3M9 21l3-3 3 3"/>',
  purge: '<path d="M3 12h11"/><path d="M3 7h7M3 17h7"/><circle cx="18" cy="12" r="3"/>',
  spin: '<path d="M12 3a9 9 0 109 9"/><path d="M21 3v6h-6"/><circle cx="12" cy="12" r="2"/>',
  ign: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  fpb: '<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M12 15v6M8 21h8"/><path d="M5 8h3"/>',
  opb: '<rect x="8" y="3" width="8" height="12" rx="4"/><path d="M12 15v6M8 21h8"/><path d="M16 8h3"/>',
  main: '<circle cx="12" cy="12" r="7"/><path d="M5 12h14M12 5v14"/>',
  throttle: '<path d="M4 20h16"/><path d="M6 16l4-6 3 3 5-8"/>',
  gimbal: '<circle cx="12" cy="12" r="8"/><ellipse cx="12" cy="12" rx="3" ry="8"/><path d="M4 12h16"/>',
  abort: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9 9l6 6M15 9l-6 6"/>',
};
const RATED_F = RATED_INFO.perf.F;
const VIEWS = { stand: { r: 17, y: -1.2, pitch: 0.08 }, engine: { r: 5, y: 2.3, pitch: 0.1 }, plume: { r: 14, y: -3.5, pitch: 0.02 } };

export class Lab {
  constructor(app) {
    this.app = app;
    this.S = buildScene();
    this.scope = buildScope();
    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 400);
    this.cam = { yaw: 0.0, pitch: 0.08, r: 17, y: -1.2, target: { ...VIEWS.stand }, drag: null, shake: 0, view: 'stand' };
    this.explode = 0; this.explodeTarget = 0; this.cutaway = false; this.scopeSide = null;
    this.tmp = new THREE.Vector3();
    this.heat = 0;
  }

  // ── Lifecycle ───────────────────────────────────────
  enter() {
    const a = this.app;
    a.stage.use(this.S.scene, this.camera);
    a.stage.renderer.localClippingEnabled = true;
    a.stage.bloom.strength = 0.5; a.stage.bloom.threshold = 0.8; a.stage.bloom.radius = 0.4; a.stage.grade.uniforms.uHolo.value = 0.45;
    a.checklist.setTitle('rl.title');
    const E = () => this.E;
    a.toolbar.set([
      { id: 'chill', key: '1', icon: ICON.chill, labelKey: 'rl.tool.chill', onSelect: () => this.toggleValve('chill'), active: () => E().v.chill.cmd > 0 },
      { id: 'purge', key: '2', icon: ICON.purge, labelKey: 'rl.tool.purge', onSelect: () => this.toggleValve('purge'), active: () => E().v.purge.cmd > 0 },
      { id: 'spin', key: '3', icon: ICON.spin, labelKey: 'rl.tool.spin', onSelect: () => this.toggleSpin(), active: () => E().spin },
      { id: 'ign', key: '4', icon: ICON.ign, labelKey: 'rl.tool.ign', onSelect: () => this.toggleIgn(), active: () => E().ign },
      { id: 'main', key: '5', icon: ICON.main, labelKey: 'rl.tool.main', onSelect: () => this.toggleMain(), active: () => E().v.mfv.cmd > 0 },
      { id: 'fpb', key: '6', icon: ICON.fpb, labelKey: 'rl.tool.fpb', onSelect: () => this.togglePB('fpb'), active: () => E().v.fpb.cmd > 0 },
      { id: 'opb', key: '7', icon: ICON.opb, labelKey: 'rl.tool.opb', onSelect: () => this.togglePB('opb'), active: () => E().v.opb.cmd > 0 },
      { id: 'throttle', key: '8', icon: ICON.throttle, labelKey: 'rl.tool.throttle', onSelect: () => this.openThrottle(), active: () => E().closedLoop },
      { id: 'gimbal', key: '9', icon: ICON.gimbal, labelKey: 'rl.tool.gimbal', onSelect: () => this.startGimbal(), active: () => !!this.gimbalRun },
      { id: 'abort', key: '0', icon: ICON.abort, labelKey: 'rl.tool.abort', onSelect: () => this.abort() },
    ], (id) => `rl.rule.${id}`);
    a.live.innerHTML = LIVE_HTML;
    i18n.apply(a.live);
    a.live.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => this.setTab(b.dataset.tab); });
    this.spec = a.live.querySelector('#rl-spec');
    this.setTab('tele');
    this.newRun();
  }
  exit() { this.demo?.stop(); this.app.chooser.classList.add('hidden'); engineSound({}); }

  newRun() {
    this.E = new Engine();
    this.facts = { gimbal: false, stableT: 0, runT: 0 };
    this.eventIdx = 0; this.alarmT = 0; this.gimbalRun = null; this.heat = 0; this.resultShown = false;
    this.S.plumeMat.uniforms.uPower.value = 0;
    this.app.stages.load('rl', STAGES(this), { urgentHint: () => this.urgentHint() });
    this.app.feed.push('rl.feed.ready', 'ok');
    this.app.toolbar.refresh();
  }

  // ── Commands ───────────────────────────────────────
  deny(key) { sfx.deny(); this.app.feed.push(key, 'warn'); }
  locked() { if (this.E.failed) { this.deny('rl.feed.failedLock'); return true; } return false; }
  toggleValve(k) {
    if (this.locked()) return;
    const open = this.E.v[k].cmd === 0;
    this.E.set(k, open ? 1 : 0); sfx.valve(); if (k === 'purge' && open) sfx.hiss();
    this.app.feed.push(`rl.feed.${k}${open ? 'On' : 'Off'}`, 'ok');
    this.app.toolbar.refresh();
  }
  toggleSpin() { if (this.locked()) return; this.E.spin = !this.E.spin; this.E.log('spin:' + (this.E.spin ? 'on' : 'off')); sfx.hiss(); this.app.feed.push(this.E.spin ? 'rl.feed.spinOn' : 'rl.feed.spinOff', 'ok'); this.app.toolbar.refresh(); }
  toggleIgn() { if (this.locked()) return; this.E.ign = !this.E.ign; this.E.log('ign:' + (this.E.ign ? 'on' : 'off')); if (this.E.ign) sfx.spark(); this.app.feed.push(this.E.ign ? 'rl.feed.ignOn' : 'rl.feed.ignOff', 'ok'); this.app.toolbar.refresh(); }
  toggleMain() {
    if (this.locked()) return;
    const open = this.E.v.mfv.cmd === 0;
    this.E.set('mfv', open ? 1 : 0); this.E.set('mov', open ? 1 : 0); sfx.valve();
    this.app.feed.push(open ? 'rl.feed.mainOn' : 'rl.feed.mainOff', 'ok');
    this.app.toolbar.refresh();
  }
  togglePB(k) {
    if (this.locked()) return;
    const E = this.E, open = E.v[k].cmd === 0;
    if (!open && E.closedLoop) { E.closedLoop = false; E.log('open-loop'); }
    E.set(k, open ? RATED_INFO.RATED_POS[k] : 0); sfx.valve();
    this.app.feed.push(`rl.feed.${k}${open ? 'On' : 'Off'}`, 'ok');
    this.app.toolbar.refresh();
  }
  openThrottle() {
    const E = this.E;
    if (!E.closedLoop) { this.deny('rl.feed.noLoop'); return; }
    const el = this.app.chooser;
    el.querySelector('.ch-title').textContent = i18n.t('rl.ch.throttle');
    const body = el.querySelector('.ch-body'); body.innerHTML = '';
    for (const v of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]) {
      const b = document.createElement('button');
      b.className = 'ch-opt quarter' + (Math.abs(E.throttleCmd - v) < 1e-3 ? ' active' : '') + (v > 1 ? ' danger' : '');
      const p = v * 300;
      b.innerHTML = `<b>${Math.round(v * 100)} %</b><small>${p.toFixed(0)} bar${v > 1 ? ' · ' + i18n.t('rl.ch.over') : v < 0.5 ? ' · ' + i18n.t('rl.ch.deep') : ''}</small>`;
      b.onclick = () => { E.throttleCmd = v; E.log('throttle:' + v); sfx.select(); el.classList.add('hidden'); this.app.feed.push('rl.feed.throttle', 'ok', { pct: Math.round(v * 100) }); this.app.toolbar.refresh(); };
      body.appendChild(b);
    }
    el.classList.remove('hidden');
  }
  startGimbal() {
    if (!this.E.closedLoop || this.E.s.pc < 200 * BAR) { this.deny('rl.feed.gimbalNeed'); return; }
    this.gimbalRun = { t: 0 }; sfx.select(); this.E.log('gimbal:start');
    this.app.feed.push('rl.feed.gimbal', 'ok'); this.app.toolbar.refresh();
  }
  abort() {
    if (this.E.s.pc < 1 * BAR && !this.E.v.mfv.cmd) { this.deny('rl.feed.nothingToAbort'); return; }
    this.E.log('abort'); this.E.safe(); this.aborted = true; sfx.alarm(); this.app.stage.flash('#ffb86b');
    this.app.feed.push('rl.feed.abort', 'bad'); this.app.toolbar.refresh();
  }
  setTab(tab) { this.tab = tab; this.app.live.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); this.app.live.querySelector('#rl-tele').classList.toggle('hidden', tab !== 'tele'); this.app.live.querySelector('#rl-math').classList.toggle('hidden', tab !== 'math'); }
  cycleView() { const k = Object.keys(VIEWS); this.cam.view = k[(k.indexOf(this.cam.view) + 1) % k.length]; this.cam.target = { ...VIEWS[this.cam.view] }; this.app.feed.push('rl.feed.view.' + this.cam.view, 'ok'); }
  toggleCutaway() { this.cutaway = !this.cutaway; for (const m of this.S.clipped) { m.clippingPlanes = this.cutaway ? [this.S.clipPlane] : []; m.clipShadows = true; m.needsUpdate = true; } this.app.feed.push(this.cutaway ? 'rl.feed.cutOn' : 'rl.feed.cutOff', 'ok'); }
  toggleExplode() { this.explodeTarget = this.explodeTarget ? 0 : 1; this.app.feed.push(this.explodeTarget ? 'rl.feed.expOn' : 'rl.feed.expOff', 'ok'); }
  toggleScope() { this.scopeSide = this.scopeSide === null ? 'F' : this.scopeSide === 'F' ? 'O' : null; this.app.setScope(this.scopeSide ? i18n.t('rl.scope.' + this.scopeSide) : null); }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { this.cam.drag = { x: e.clientX, y: e.clientY }; }
  pointerMove(e) {
    if (!this.cam.drag) return;
    this.cam.yaw -= (e.clientX - this.cam.drag.x) * 0.005;
    this.cam.target.pitch = THREE.MathUtils.clamp(this.cam.target.pitch + (e.clientY - this.cam.drag.y) * 0.003, -0.35, 0.9);
    this.cam.drag = { x: e.clientX, y: e.clientY };
  }
  pointerUp() { this.cam.drag = null; }
  wheel(e) { this.cam.target.r = THREE.MathUtils.clamp(this.cam.target.r * Math.exp(e.deltaY * 0.001), 2.2, 40); }
  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'z') { this.cycleView(); return true; }
    if (k === 'c') { this.toggleCutaway(); return true; }
    if (k === 'x') { this.toggleExplode(); return true; }
    if (k === 'v') { this.toggleScope(); return true; }
    if (k === 'm') { this.setTab(this.tab === 'math' ? 'tele' : 'math'); return true; }
    if (k === 'escape') { this.app.chooser.classList.add('hidden'); return true; }
    return false;
  }

  // ── Frame ──────────────────────────────────────────
  update(dt, t) {
    const a = this.app, E = this.E;
    this.demo?.update(dt);
    E.runPending();
    // Engine computer takes over once both preburners and the chamber are lit and pressure is up.
    if (!E.closedLoop && !E.failed && E.lit.F && E.lit.O && E.lit.main && E.s.pc > 150 * BAR && E.v.fpb.cmd > 0 && E.v.opb.cmd > 0) {
      E.engage(E.throttleCmd || 1); a.feed.push('rl.feed.loop', 'ok'); sfx.confirm();
    }
    // Gimbal test: one full circle at 6°, 4 s per revolution, then back to centre.
    if (this.gimbalRun) {
      const g = this.gimbalRun; g.t += dt;
      const ph = Math.min(1, g.t / 4) * Math.PI * 2;
      E.gimbal.cmdP = g.t < 4 ? 6 * Math.sin(ph) : 0; E.gimbal.cmdY = g.t < 4 ? 6 * Math.sin(ph + Math.PI / 2) * Math.min(1, g.t * 2) : 0;
      if (g.t > 4.8) { this.gimbalRun = null; if (E.s.pc > 200 * BAR && !E.failed) { this.facts.gimbal = true; a.feed.push('rl.feed.gimbalDone', 'ok'); } a.toolbar.refresh(); }
    }
    const o = E.step(Math.min(dt, 0.05));
    this.o = o;
    this.#events();
    // Stability bookkeeping for the mainstage stage.
    const nearRated = E.closedLoop && Math.abs(o.pcBar - 300) < 6 && Math.abs(o.MR - 3.6) < 0.08 && E.throttleCmd === 1;
    this.facts.stableT = nearRated ? this.facts.stableT + dt : 0;
    if (nearRated && !this.facts.ratedIsp) this.facts.ratedIsp = o.Isp;
    if (o.thrust > 0.9 * RATED_F && this.facts.t90 === undefined) this.facts.t90 = E.t;
    this.#visuals(dt, t, o);
    a.stages.update();
    if (a.frame % 3 === 0) this.updateLive(o);
    if (a.frame % 2 === 0) this.drawSpectrum(o);
    // Alarms.
    const alarm = this.urgentHint();
    this.alarmT -= dt;
    if (alarm && alarm.includes('urgent') && this.alarmT <= 0) { sfx.warn(); this.alarmT = 1.6; }
    if (E.failed && !this.resultShown) this.#onFail();
  }

  #events() {
    const ev = this.E.events;
    while (this.eventIdx < ev.length) {
      const e = ev[this.eventIdx++].e, a = this.app;
      // Were the lines cold when propellant was first admitted?
      if (e === 'mfv:open' && this.facts.chilledAtMain === undefined) { this.facts.chilledAtMain = this.E.s.TlineF < 125 && this.E.s.TlineO < 100; this.facts.linesAtMain = [this.E.s.TlineF, this.E.s.TlineO]; }
      if (e === 'lit:FPB') { a.feed.push('rl.feed.litF', 'ok'); sfx.ignite(); }
      if (e === 'lit:OPB') { a.feed.push('rl.feed.litO', 'ok'); sfx.ignite(); }
      if (e === 'lit:main') {
        const hard = this.E.ignitionMacc > 20;
        a.feed.push(hard ? 'rl.feed.pooled' : 'rl.feed.litMain', hard ? 'bad' : 'ok', { kg: Math.round(this.E.ignitionMacc) });
        if (hard) { sfx.bang(); a.stage.flash('#ff4466'); this.cam.shake = 1.2; } else { sfx.ignite(); a.stage.flash('#8aa4ff'); this.cam.shake = 0.35; }
      }
      if (e === 'out:main') a.feed.push('rl.feed.outMain', 'ok');
    }
  }

  #onFail() {
    this.resultShown = true;
    const k = this.E.failed.kind;
    this.app.feed.push('rl.fail.' + k, 'bad'); sfx.bang(); sfx.alarm();
    this.app.stage.flash(k === 'wall' ? '#5dffa8' : '#ff4466'); this.cam.shake = 1.4;
    this.app.banner(i18n.t('rl.banner.cutoff'), i18n.t('rl.fail.' + k));
  }

  // ── Visuals driven by the model ─────────────────────
  #visuals(dt, t, o) {
    const S = this.S, E = this.E;
    const thr = Math.min(1.2, o.thrust / RATED_F);
    const lit = E.lit.main && o.pcBar > 3;
    // Gimbal (degrees → radians) and exploded view.
    S.gimbalPivot.rotation.x = THREE.MathUtils.degToRad(E.gimbal.p); S.gimbalPivot.rotation.z = THREE.MathUtils.degToRad(E.gimbal.y);
    this.explode += (this.explodeTarget - this.explode) * (1 - Math.exp(-dt * 4));
    for (const [k, off] of Object.entries(EXPLODE)) S.parts[k].position.set(off[0] * this.explode, off[1] * this.explode, off[2] * this.explode);
    // Flow particles along each line: visible amount and speed follow the real mass flows.
    const fr = { ch4In: o.mf / RATED_INFO.MDOT_F, loxIn: o.mo / RATED_INFO.MDOT_O, ch4Dis: o.mf / RATED_INFO.MDOT_F, loxDis: o.mo / RATED_INFO.MDOT_O,
      xOx: E.v.fpb.pos * o.nO, xFu: E.v.opb.pos * o.nF, hotF: E.lit.F ? o.mf / RATED_INFO.MDOT_F : 0, hotO: E.lit.O ? o.mo / RATED_INFO.MDOT_O : 0 };
    const chillFlow = E.v.chill.pos * 0.25;
    for (const f of S.flows) {
      let level = fr[f.key] || 0;
      if (f.key.endsWith('In') || f.key.endsWith('Dis')) level = Math.max(level, chillFlow);
      f.level += (Math.min(1.2, level) - f.level) * (1 - Math.exp(-dt * 6));
      f.pts.material.opacity = Math.min(1, f.level * 1.4) * (this.cutaway ? 1 : 0.4);
      const arr = f.pts.geometry.attributes.position.array;
      for (let i = 0; i < f.phase.length; i++) {
        f.phase[i] = (f.phase[i] + dt * (0.15 + 1.6 * f.level)) % 1;
        f.curve.getPointAt(f.phase[i], this.tmp);
        arr[i * 3] = this.tmp.x + (Math.random() - 0.5) * 0.03; arr[i * 3 + 1] = this.tmp.y; arr[i * 3 + 2] = this.tmp.z + (Math.random() - 0.5) * 0.03;
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
    }
    // Frost on the feed lines from their wall temperature; the lines weep cold vapour.
    const frostF = THREE.MathUtils.clamp((215 - o.TlineF) / 85, 0, 1), frostO = THREE.MathUtils.clamp((215 - o.TlineO) / 100, 0, 1);
    S.frostMat.F.opacity = frostF * 0.7; S.frostMat.O.opacity = frostO * 0.75;
    const V = S.vapor, vp = V.pos, frost = Math.max(frostF, frostO);
    V.pts.material.opacity = 0.16 * frost;
    for (let i = 0; i < V.n; i++) {
      V.life[i] -= dt;
      if (V.life[i] <= 0) {
        const key = Math.random() < 0.5 ? (frostF > 0.1 ? 'ch4In' : 'loxIn') : (frostO > 0.1 ? 'loxIn' : 'ch4In');
        S.curves[key].getPointAt(Math.random() * 0.9, this.tmp);
        vp[i * 3] = this.tmp.x; vp[i * 3 + 1] = this.tmp.y; vp[i * 3 + 2] = this.tmp.z;
        V.vel[i * 3] = (Math.random() - 0.5) * 0.15; V.vel[i * 3 + 1] = -0.25 - Math.random() * 0.3; V.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
        V.life[i] = 1.5 + Math.random() * 2;
      }
      vp[i * 3] += V.vel[i * 3] * dt; vp[i * 3 + 1] += V.vel[i * 3 + 1] * dt; vp[i * 3 + 2] += V.vel[i * 3 + 2] * dt;
    }
    V.pts.geometry.attributes.position.needsUpdate = true;
    // Plume: length, brightness, shock-cell spacing (Prandtl–Pack), separation flicker, green for burning copper.
    const U = S.plumeMat.uniforms;
    U.uTime.value = t;
    const target = lit ? Math.pow(Math.min(1.1, o.pcBar / 300), 0.85) : 0;
    U.uPower.value += (target - U.uPower.value) * (1 - Math.exp(-dt * 12));
    U.uLen.value = 3 + 13 * Math.min(1.1, thr);
    if (o.plume) U.uCell.value = THREE.MathUtils.clamp(o.plume.L, 0.6, 9);
    U.uSep.value = o.perf ? o.perf.sep : 0;
    U.uMR.value = o.MR || 3.6;
    const green = Math.min(1, E.health.wall * 1.4 + ((E.MReff || 0) > LIMITS.MRhot && lit ? 0.55 : 0));
    U.uGreen.value += (green - U.uGreen.value) * (1 - Math.exp(-dt * 6));
    U.uFlick.value = Math.max(o.cavF, o.cavO);
    S.plume.visible = U.uPower.value > 0.004;
    this.camera.updateMatrixWorld(); S.plume.updateWorldMatrix(true, false);
    U.uCam.value.copy(this.camera.position); S.plume.worldToLocal(U.uCam.value);
    const flick = 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 23.7);
    S.glow.material.opacity = 0.75 * U.uPower.value * flick; S.glow.material.color.set(U.uGreen.value > 0.3 ? '#5dffa8' : '#9fb2ff');
    S.throatGlow.material.opacity = 0.7 * U.uPower.value;
    S.plumeLight.intensity = 9 * U.uPower.value * flick; S.plumeLight.color.set(U.uGreen.value > 0.3 ? '#5dffa8' : '#8aa4ff');
    S.trenchLight.intensity = 12 * U.uPower.value * flick;
    // Nozzle heat glows with the chamber, and cools (slowly) after shutdown.
    this.heat += ((lit ? Math.min(1, o.pcBar / 300) : 0) - this.heat) * (1 - Math.exp(-dt * (lit ? 1.2 : 0.18)));
    S.nozzleMat.emissiveIntensity = 1.1 * this.heat;
    // Igniter sparks.
    for (const k of ['F', 'O', 'M']) {
      const litK = k === 'M' ? E.lit.main : E.lit[k];
      S.sparks[k].material.opacity = E.ign && !litK ? (Math.random() < 0.35 ? 1 : 0.1) : litK ? 0.25 * Math.random() + (k === 'M' ? 0 : 0.35) : 0;
      S.sparks[k].material.color.set(k === 'O' ? '#9ff4ff' : k === 'F' ? '#ffc4ef' : '#fff2c4');
    }
    // Steam clouds from the flame trench: spawn while firing, drift outward and up, fade.
    for (const c of S.clouds) {
      const u = c.userData; u.life += dt;
      if (u.life > u.max || (u.life > 0 && c.material.opacity === 0 && U.uPower.value < 0.05)) {
        if (U.uPower.value < 0.05 && this.heat < 0.05) { c.material.opacity = 0; u.life = -Math.random(); continue; }
        u.life = 0; u.ang = Math.random() * Math.PI * 2; u.spd = 2 + Math.random() * 5 * (0.4 + U.uPower.value);
      }
      if (u.life < 0) { c.material.opacity = 0; continue; }
      const k = u.life / u.max, dist = 1.5 + u.spd * u.life;
      c.position.set(Math.cos(u.ang) * dist, -9 + u.life * 0.5 + k * k, Math.sin(u.ang) * dist);
      const sc = 3 + u.life * 2.6; c.scale.set(sc, sc * 0.8, 1);
      c.material.rotation += u.rot * dt;
      c.material.opacity = Math.sin(Math.PI * k) * 0.22 * Math.max(this.heat, U.uPower.value);
      c.material.color.set(U.uPower.value > 0.1 ? (U.uGreen.value > 0.3 ? '#7fd9a0' : '#a99be0') : '#6d6780');
    }
    // Camera: eased orbit, with a shake that follows thrust (and big events).
    const c = this.cam;
    c.r += (c.target.r - c.r) * (1 - Math.exp(-dt * 3)); c.y += (c.target.y - c.y) * (1 - Math.exp(-dt * 3)); c.pitch += (c.target.pitch - c.pitch) * (1 - Math.exp(-dt * 3));
    c.shake = Math.max(0, c.shake - dt * 1.5);
    const sh = (0.012 * U.uPower.value + 0.05 * c.shake) * (c.view === 'engine' ? 0.6 : 1);
    this.camera.position.set(Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, c.y + Math.sin(c.pitch) * c.r, Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
    this.camera.position.x += (Math.random() - 0.5) * sh; this.camera.position.y += (Math.random() - 0.5) * sh;
    this.camera.lookAt(0, c.y, 0);
    // Sound.
    engineSound({ thrust: U.uPower.value, rpmF: o.rpmF, rpmO: o.rpmO, rough: (o.perf?.sep || 0) + Math.max(o.cavF, o.cavO) });
    // Turbopump scope.
    if (this.scopeSide) this.scope.update(dt, this.scopeSide === 'F' ? { rpm: o.rpmF, cav: o.cavF, color: '#ff6fd8' } : { rpm: o.rpmO, cav: o.cavO, color: '#58d8ff' });
  }
  // Called after the main composer pass: draws the turbopump scope into its window.
  postRender(renderer) {
    if (!this.scopeSide) return;
    const el = document.querySelector('#scope .scope-view'); if (!el) return;
    const r = el.getBoundingClientRect();
    this.scope.render(renderer, r);
  }

  // ── Panels ─────────────────────────────────────────
  updateLive(o) {
    const q = (id) => this.app.live.querySelector('#' + id);
    const E = this.E, fx = (v, d = 0) => (isFinite(v) ? v.toFixed(d) : '—');
    q('rl-pc').textContent = fx(o.pcBar, 1);
    q('rl-f').textContent = fx(o.thrust / 1e3, 0);
    q('rl-isp').textContent = o.Isp ? fx(o.Isp, 1) : '—';
    q('rl-mr').textContent = o.mf > 1 ? fx(o.MR, 2) : '—';
    q('rl-mr').className = o.mf > 1 && Math.abs(o.MR - 3.6) > 0.3 ? 'alert' : '';
    const bar = (id, v, lim, max) => { const i = q(id); i.style.width = `${Math.min(100, v / max * 100)}%`; i.className = v > lim ? 'hot' : v > lim * 0.9 ? 'warm' : ''; };
    q('rl-tpbf').textContent = `${fx(o.TpbF)} K`; bar('rl-tpbf-b', o.TpbF, LIMITS.TpbF, 1300);
    q('rl-tpbo').textContent = `${fx(o.TpbO)} K`; bar('rl-tpbo-b', o.TpbO, LIMITS.TpbO, 1100);
    q('rl-rpmf').textContent = `${fx(o.rpmF)} rpm`; bar('rl-rpmf-b', o.nF, LIMITS.over, 1.3);
    q('rl-rpmo').textContent = `${fx(o.rpmO)} rpm`; bar('rl-rpmo-b', o.nO, LIMITS.over, 1.3);
    q('rl-linef').textContent = `${fx(o.TlineF)} K`; q('rl-lineo').textContent = `${fx(o.TlineO)} K`;
    q('rl-linef').className = o.TlineF > 125 ? 'warn' : 'ok'; q('rl-lineo').className = o.TlineO > 100 ? 'warn' : 'ok';
    q('rl-npspf').textContent = `${fx(o.marginF / BAR, 2)} bar`; q('rl-npspo').textContent = `${fx(o.marginO / BAR, 2)} bar`;
    q('rl-npspf').className = o.cavF > 0.05 ? 'alert' : ''; q('rl-npspo').className = o.cavO > 0.05 ? 'alert' : '';
    const perf = o.perf;
    q('rl-pe').textContent = perf ? `${fx(perf.pe / BAR, 3)} bar · pe/pa ${fx(perf.pe / P_SL, 2)}` : '—';
    q('rl-sep').textContent = perf ? `${fx(perf.sep * 100)} %` : '—';
    q('rl-sep').className = perf && perf.sep > 0.2 ? 'alert' : '';
    q('rl-cell').textContent = o.plume ? `${fx(o.plume.L, 2)} m · Mj ${fx(o.plume.Mj, 2)}` : '—';
    q('rl-wall').textContent = `${fx(Math.min(100, E.health.wall * 100))} %`;
    q('rl-wall').className = E.health.wall > 0.05 ? 'alert' : '';
    q('rl-mode').textContent = i18n.t(E.failed ? 'rl.mode.cutoff' : E.closedLoop ? 'rl.mode.closed' : E.lit.main ? 'rl.mode.start' : E.v.mfv.pos > 0.05 ? 'rl.mode.flow' : 'rl.mode.safe');
    q('rl-mode').className = E.failed ? 'alert' : E.closedLoop ? 'ok' : '';
    if (this.tab === 'math') this.updateMath(o);
  }

  // Live equations with the current numbers substituted.
  updateMath(o) {
    const E = this.E, perf = o.perf, g = perf ? perf.gamma : products(3.6).gamma;
    const P = products(o.MR > 0.5 ? o.MR : 3.6);
    const cs = cstar(P.gamma, P.R, P.Tc) * RATED.etaCstar;
    const f = (v, d = 3) => (isFinite(v) ? Number(v).toFixed(d) : '—');
    const m = this.app.live.querySelector('#rl-math-body');
    const rows = [
      ['c* = √(R·Tc)/Γ(γ)', `R = ${f(P.R, 1)} J/kg·K, Tc = ${f(P.Tc, 0)} K, Γ = ${f(Gamma(P.gamma), 4)} → c* = ${f(cs, 1)} m/s (η 0.98)`],
      ['A/A* = ε → Me (Newton)', perf ? `ε = ${GEOM.eps} → Me = ${f(perf.Me, 4)}, pe/pc = ${f(perf.pePc, 5)}` : `ε = ${GEOM.eps}`],
      ['CF = √(2γ²/(γ−1)·(2/(γ+1))^((γ+1)/(γ−1))·[1−(pe/pc)^((γ−1)/γ)]) + ε_eff(pe−pa)/pc', perf ? `γ = ${f(g, 3)}, ε_eff = ${f(perf.epsEff, 1)} → CF = ${f(perf.CF, 4)}` : '—'],
      ['F = CF·pc·At', perf ? `${f(perf.CF, 4)} × ${f(o.pcBar, 1)} bar × ${f(GEOM.At, 5)} m² = ${f(o.thrust / 1e3, 0)} kN` : '—'],
      ['Isp = F/(ṁ·g0)', perf ? `${f(o.thrust / 1e3, 0)} kN / (${f(o.mdot, 1)} kg/s × ${G0}) = ${f(o.Isp, 1)} s` : '—'],
      ['L_cell ≈ 1.306·Dj·√(Mj²−1)', o.plume ? `Mj = ${f(o.plume.Mj, 3)}, Dj = ${f(o.plume.Dj, 3)} m → ${f(o.plume.L, 2)} m` : '—'],
      ['f₁T = 1.8412·a/(π·Dc)', o.ac ? `a = ${f(o.ac.a, 0)} m/s → ${f(o.ac.f1T, 0)} Hz` : '—'],
      ['J·ω·dω/dt = P_turb − P_pump', `F: ${f(o.PtF / 1e6, 2)} − ${f(o.PpF / 1e6, 2)} MW · O: ${f(o.PtO / 1e6, 2)} − ${f(o.PpO / 1e6, 2)} MW`],
      ['T_OPB = T_in + (f·LHV − (1−f)·h_vap)/cp', `f = ${f(o.fracOPB, 4)} → ${f(o.TpbO, 0)} K (limit ${LIMITS.TpbO} K)`],
      ['p_v = p_b·exp(−ΔH/R·(1/T − 1/T_b))', `LOX inlet ${f(o.TinO, 1)} K, margin ${f(o.marginO / BAR, 2)} bar`],
      ['RK4, h = 1 ms', `t = ${f(E.t, 2)} s`],
    ];
    m.innerHTML = rows.map(([eq, v]) => `<div class="eq"><code></code><span></span></div>`).join('');
    [...m.children].forEach((d, i) => { d.children[0].textContent = rows[i][0]; d.children[1].textContent = rows[i][1]; });
  }

  // Vibration spectrum: synchronous pump lines and harmonics, the chamber's first
  // tangential acoustic mode, broadband cavitation and a low-frequency separation hump.
  drawSpectrum(o) {
    const cv = this.spec; if (!cv || this.tab !== 'tele') return;
    const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, fmax = 3000;
    g.clearRect(0, 0, W, H);
    const lines = [];
    const fF = o.rpmF / 60, fO = o.rpmO / 60;
    const on = o.pcBar > 1 || o.nF > 0.05;
    if (on) {
      lines.push([fF, 0.5 + 0.4 * o.nF, '#ff6fd8'], [2 * fF, 0.25 * o.nF, '#ff6fd8'], [fO, 0.5 + 0.4 * o.nO, '#58d8ff'], [2 * fO, 0.25 * o.nO, '#58d8ff']);
      if (o.ac) lines.push([o.ac.f1T, 0.15 + (o.perf?.sep || 0) * 0.4, '#ffb86b'], [o.ac.f1L, 0.1, '#ffb86b']);
    }
    const cav = Math.max(o.cavF, o.cavO), sep = o.perf?.sep || 0, rough = Math.min(1, o.pcBar / 300);
    g.strokeStyle = 'rgba(141,151,179,.25)'; g.lineWidth = dpr;
    for (let k = 1; k < 6; k++) { const x = k / 6 * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath();
    for (let px = 0; px <= W; px += 2 * dpr) {
      const fq = px / W * fmax;
      let a = 0.04 + 0.06 * rough * Math.exp(-fq / 1500) + 0.02 * Math.random() * rough;
      a += cav * (0.25 + 0.1 * Math.random()) * Math.exp(-fq / 2200);
      a += sep * 0.5 * Math.exp(-(((fq - 60) / 45) ** 2));
      for (const [f0, amp] of lines) a += amp * Math.exp(-(((fq - f0) / 18) ** 2));
      const y = H - Math.min(0.95, a) * H;
      px ? g.lineTo(px, y) : g.moveTo(px, y);
    }
    g.strokeStyle = '#5dffa8'; g.lineWidth = 1.4 * dpr; g.shadowColor = '#5dffa8'; g.shadowBlur = 6 * dpr; g.stroke(); g.shadowBlur = 0;
    g.font = `${9 * dpr}px JetBrains Mono, monospace`;
    for (const [f0, amp, col] of lines) { if (f0 < 20 || f0 > fmax) continue; g.fillStyle = col; g.fillRect(f0 / fmax * W - dpr, H - 4 * dpr, 2 * dpr, 4 * dpr); }
    g.fillStyle = 'rgba(200,210,235,.6)'; g.fillText('0', 2 * dpr, H - 6 * dpr); g.fillText('3 kHz', W - 34 * dpr, H - 6 * dpr);
  }

  urgentHint() {
    const E = this.E, o = this.o; if (!o) return null;
    if (E.failed) return 'rl.hint.urgentFailed';
    if (!E.lit.main && o.macc > 15) return 'rl.hint.urgentPool';
    if (Math.max(o.cavF, o.cavO) > 0.1 && (o.nF > 0.05 || o.nO > 0.05)) return 'rl.hint.urgentCav';
    if (o.TpbO > LIMITS.TpbO * 0.96) return 'rl.hint.urgentHotO';
    if ((E.MReff || 0) > LIMITS.MRhot && o.pcBar > 20) return 'rl.hint.urgentRich';
    if (o.nF > LIMITS.over || o.nO > LIMITS.over) return 'rl.hint.urgentOver';
    if (o.perf && o.perf.sep > 0.2) return 'rl.hint.sep';
    if (this.app.stages.complete) return 'rl.hint.done';
    return null;
  }

  // ── Debrief ────────────────────────────────────────
  showDebrief() {
    const E = this.E, H = E.health, P = E.peak, ev = E.events;
    const first = (name) => ev.find((x) => x.e === name);
    const tMain = first('mfv:open'), tIgn = first('ign:on'), tF = first('fpb:open'), tO = first('opb:open');
    const shutO = ev.find((x, i) => x.e === 'opb:close' && x.t > (first('closed-loop')?.t ?? 0)), shutF = ev.find((x) => x.e === 'fpb:close' && x.t > (first('closed-loop')?.t ?? 0));
    const checks = {
      chill: this.facts.chilledAtMain === true,
      purge: E.purgeTime >= 2,
      ignFirst: !!tIgn && !!tMain && tIgn.t <= tMain.t + 0.05,
      fuelLead: !!tF && !!tO && tF.t < tO.t,
      rated: !!this.facts.ratedIsp,
      gimbal: this.facts.gimbal,
      richShutdown: !!shutO && (!shutF || shutO.t <= shutF.t),
      safed: E.s.pc < BAR && E.v.mfv.cmd === 0 && E.purgeAfter >= 2,
    };
    let score = 100;
    score -= E.failed ? 35 : 0;
    score -= Math.min(20, H.hardStart * 25) + Math.min(15, H.wall * 30) + Math.min(10, H.cavTime * 3) + Math.min(10, H.sepTime * 1.2) + Math.min(10, H.overspeed * 10);
    score -= Math.max(0, (P.TpbO - LIMITS.TpbO)) * 0.2;
    score -= Object.values(checks).filter((v) => !v).length * 4;
    score = Math.max(0, Math.round(score));
    const tips = [];
    const add = (k, v = {}) => tips.push(i18n.t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''));
    if (!checks.chill) add(H.cavTime > 0.2 ? 'rl.tip.chill' : 'rl.tip.chillWarm', { f: (this.facts.linesAtMain?.[0] ?? 0).toFixed(0), o: (this.facts.linesAtMain?.[1] ?? 0).toFixed(0) });
    if (!checks.purge) add('rl.tip.purge');
    if (!checks.ignFirst && tMain) add('rl.tip.ign', { kg: Math.round(E.ignitionMacc || 0), x: P.pcRatio.toFixed(2) });
    if (tF && tO && !checks.fuelLead) add('rl.tip.oxLead', { dt: (tF.t - tO.t).toFixed(2) });
    if (P.TpbO > LIMITS.TpbO) add('rl.tip.hotO', { t: P.TpbO.toFixed(0) });
    if (H.overspeed > 0.05) add('rl.tip.over', { n: (Math.max(P.nF, P.nO) * 100).toFixed(0) });
    if (H.sepTime > 0.5) add('rl.tip.sep', { s: H.sepTime.toFixed(1) });
    if (shutF && shutO && shutF.t < shutO.t) add('rl.tip.shutdown');
    if (!checks.safed && checks.rated) add('rl.tip.safe');
    if (!checks.gimbal && checks.rated) add('rl.tip.gimbal');
    if (!tips.length) add('rl.tip.great');
    if (tips.length < 3) add('rl.tip.generic');
    const lbl = (k) => i18n.t('rl.db.' + k);
    this.app.debrief.show({
      title: i18n.t('rl.db.title'), sub: `${i18n.t('app.title')} · ${i18n.t('app.by')}`, score,
      stats: [
        { label: lbl('isp'), value: this.facts.ratedIsp ? `${this.facts.ratedIsp.toFixed(1)} s` : '—', cls: this.facts.ratedIsp ? 'ok' : 'warn' },
        { label: lbl('thrust'), value: `${(P.pc / BAR).toFixed(0)} bar`, cls: P.pcRatio > LIMITS.pcHard ? 'bad' : 'ok' },
        { label: lbl('t90'), value: this.facts.t90 && tMain ? `${(this.facts.t90 - tMain.t).toFixed(2)} s` : '—', cls: '' },
        { label: lbl('tpbo'), value: `${P.TpbO.toFixed(0)} K`, cls: P.TpbO > LIMITS.TpbO ? 'bad' : P.TpbO > 850 ? 'warn' : 'ok' },
        { label: lbl('tpbf'), value: `${P.TpbF.toFixed(0)} K`, cls: P.TpbF > LIMITS.TpbF ? 'bad' : 'ok' },
        { label: lbl('hard'), value: `${P.pcRatio.toFixed(2)}×`, cls: P.pcRatio > LIMITS.pcHard ? 'bad' : 'ok' },
        { label: lbl('cav'), value: `${H.cavTime.toFixed(1)} s`, cls: H.cavTime > 0.2 ? 'bad' : 'ok' },
        { label: lbl('wall'), value: `${Math.min(100, H.wall * 100).toFixed(0)} %`, cls: H.wall > 0.05 ? 'bad' : 'ok' },
      ],
      checks: Object.entries(checks).map(([k, v]) => ({ label: i18n.t('rl.chk.' + k), value: v ? '✓' : '✕', ok: v })),
      tips: tips.slice(0, 5),
      onAgain: () => this.newRun(),
    });
  }
}

// Stage definitions for one test.
const STAGES = (m) => [
  { id: 'chill', tasks: [
    { id: 'chillF', check: () => m.o && m.o.TlineF < 125, progress: () => m.o ? THREE.MathUtils.clamp((290 - m.o.TlineF) / 165, 0, 1) : 0 },
    { id: 'chillO', check: () => m.o && m.o.TlineO < 100, progress: () => m.o ? THREE.MathUtils.clamp((290 - m.o.TlineO) / 190, 0, 1) : 0 },
  ] },
  { id: 'purge', tasks: [
    { id: 'purge', check: () => m.E.purgeTime >= 2, progress: () => m.E.purgeTime / 2 },
    { id: 'ignArm', check: () => m.E.ign },
  ] },
  { id: 'start', tasks: [
    { id: 'main', check: () => m.E.v.mfv.pos > 0.9 },
    { id: 'spin', check: () => m.E.peak.nF > 0.2 && m.E.peak.nO > 0.2, progress: () => Math.min(m.E.peak.nF, m.E.peak.nO) / 0.2 },
    { id: 'lit', check: () => m.E.lit.F && m.E.lit.O && m.E.lit.main && m.E.s.pc > 100 * BAR, progress: () => (m.E.lit.F + m.E.lit.O + m.E.lit.main) / 3 },
  ] },
  { id: 'mainstage', tasks: [
    { id: 'loop', check: () => m.E.closedLoop },
    { id: 'rated', check: () => m.facts.stableT > 2, progress: () => m.facts.stableT / 2 },
  ] },
  { id: 'gimbal', tasks: [{ id: 'gimbal', check: () => m.facts.gimbal, progress: () => (m.gimbalRun ? m.gimbalRun.t / 4.8 : 0) }] },
  { id: 'shutdown', tasks: [
    { id: 'off', check: () => m.E.s.pc < BAR && m.E.v.mfv.cmd === 0 && m.E.v.opb.cmd === 0 && m.E.v.fpb.cmd === 0 },
    { id: 'safe', check: () => m.E.purgeAfter >= 2 && !m.E.ign, progress: () => m.E.purgeAfter / 2 },
  ] },
];

const LIVE_HTML = `
  <header class="lv-head mono"><button data-tab="tele" data-i18n="rl.tab.tele"></button><button data-tab="math" data-i18n="rl.tab.math"></button><span id="rl-mode" class="lv-mode"></span></header>
  <div id="rl-tele">
    <div class="lv-grid big mono">
      <div><label>P<sub>c</sub> · bar</label><b id="rl-pc">0.0</b></div>
      <div><label data-i18n="rl.live.thrust"></label><b id="rl-f">0</b></div>
      <div><label>I<sub>sp</sub> · s</label><b id="rl-isp">—</b></div>
      <div><label data-i18n="rl.live.mr"></label><b id="rl-mr">—</b></div>
    </div>
    <div class="lv-sub mono" data-i18n="rl.live.turbines"></div>
    <div class="rl-row"><label class="mono" data-i18n="rl.live.fpb"></label><div class="lv-bar lim" style="--lim:${(1050 / 1300 * 100).toFixed(1)}%"><i id="rl-tpbf-b"></i></div><b id="rl-tpbf" class="mono"></b></div>
    <div class="rl-row"><label class="mono" data-i18n="rl.live.opb"></label><div class="lv-bar lim" style="--lim:${(900 / 1100 * 100).toFixed(1)}%"><i id="rl-tpbo-b"></i></div><b id="rl-tpbo" class="mono"></b></div>
    <div class="rl-row"><label class="mono" data-i18n="rl.live.pumpF"></label><div class="lv-bar lim" style="--lim:${(1.12 / 1.3 * 100).toFixed(1)}%"><i id="rl-rpmf-b"></i></div><b id="rl-rpmf" class="mono"></b></div>
    <div class="rl-row"><label class="mono" data-i18n="rl.live.pumpO"></label><div class="lv-bar lim" style="--lim:${(1.12 / 1.3 * 100).toFixed(1)}%"><i id="rl-rpmo-b"></i></div><b id="rl-rpmo" class="mono"></b></div>
    <div class="lv-grid mono small">
      <div><label data-i18n="rl.live.lineF"></label><b id="rl-linef">—</b></div>
      <div><label data-i18n="rl.live.lineO"></label><b id="rl-lineo">—</b></div>
      <div><label data-i18n="rl.live.npspF"></label><b id="rl-npspf">—</b></div>
      <div><label data-i18n="rl.live.npspO"></label><b id="rl-npspo">—</b></div>
    </div>
    <div class="lv-kv mono"><label data-i18n="rl.live.exit"></label><b id="rl-pe">—</b></div>
    <div class="lv-grid mono small">
      <div><label data-i18n="rl.live.sep"></label><b id="rl-sep">—</b></div>
      <div><label data-i18n="rl.live.wall"></label><b id="rl-wall">0 %</b></div>
    </div>
    <div class="lv-kv mono"><label data-i18n="rl.live.cell"></label><b id="rl-cell">—</b></div>
    <div class="lv-sub mono" data-i18n="rl.live.spec"></div>
    <canvas id="rl-spec" class="rl-spec"></canvas>
  </div>
  <div id="rl-math" class="hidden"><div class="lv-sub mono" data-i18n="rl.live.math"></div><div id="rl-math-body" class="rl-math"></div></div>`;
