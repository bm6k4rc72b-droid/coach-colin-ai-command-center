import * as THREE from 'three';
import { BODY, squatPose, deadliftPose, benchPose, moments, activation, faultState, repsPossible, freshVelocity } from './biomech.js';
import { buildLifter, poseLifter, buildBarbell, buildGym } from './body.js';
import { sfx } from '../core/audio.js';
import { i18n } from '../core/i18n.js';

// WEIGHT ROOM (Iron Lab): a form coach for the squat, deadlift and bench press.
// Set up the lift, brace, choose a load, and perform a set. The biomechanics
// model shows joint torques, bar path, bar speed and fatigue live, and flags
// faults as fatigue sets in.

const ICON = {
  lift: '<path d="M3 12h18M6 8v8M18 8v8M4 10v4M20 10v4"/>',
  load: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
  stance: '<path d="M8 20l2-8M16 20l-2-8M10 12h4M12 12V4"/>',
  bar: '<path d="M3 7h18"/><circle cx="12" cy="11" r="2.5"/><path d="M12 14v6"/>',
  depth: '<path d="M12 3v14"/><path d="M8 13l4 4 4-4"/><path d="M5 21h14"/>',
  brace: '<ellipse cx="12" cy="12" rx="6" ry="8"/><path d="M6 12h12"/>',
  cue: '<path d="M4 12h5M15 12h5"/><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/>',
  tempo: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>',
  go: '<path d="M7 4l12 8-12 8z"/>',
  view: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};
const LIFTS = ['squat', 'deadlift', 'bench'];
const ONE_RM = { squat: 140, deadlift: 170, bench: 105 };
const DEFAULTS = {
  squat: { stance: 'narrow', bar: 'high', depth: 'quarter', brace: false, cue: false, tempo: '2-0-1' },
  deadlift: { stance: 'shoulder', bar: 'toes', depth: 'parallel', brace: false, cue: false, tempo: '2-0-1' },
  bench: { stance: 'wide', bar: 'high', depth: 'parallel', brace: false, cue: false, tempo: '2-0-1' },
};
const TEMPO = { '2-0-1': [2, 0, 1], '3-1-1': [3, 1, 1], '1-0-X': [1.2, 0, 0.8] };
const VIEWS = ['side', 'three', 'front'];

export class IronMode {
  constructor(app) {
    this.app = app;
    this.id = 'iron';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 60);
    this.gym = buildGym(this.scene);
    this.lifter = buildLifter(); this.scene.add(this.lifter.group);
    this.barbell = buildBarbell(); this.scene.add(this.barbell);
    this.pathGeo = new THREE.BufferGeometry();
    this.pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2000), 3));
    this.pathGeo.setDrawRange(0, 0);
    this.pathLine = new THREE.Line(this.pathGeo, new THREE.LineBasicMaterial({ color: '#5dffa8', transparent: true, opacity: 0.95 }));
    this.pathLine.frustumCulled = false;
    this.scene.add(this.pathLine);
    const midfoot = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 2.4), new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.5 }));
    midfoot.position.set(BODY.midfoot, 1.2, 0.5); this.midfootLine = midfoot; this.scene.add(midfoot);
    this.cam = { view: 'three', yaw: 0.6, pitch: 0.12, dist: 3.4, drag: null };
    this.oneRM = { ...ONE_RM };
  }

  enter() {
    const a = this.app;
    a.stage.use(this.scene, this.camera);
    a.stage.bloom.strength = 0.3; a.stage.bloom.threshold = 0.86;   // softer glow: the lifter must stay readable
    a.checklist.setTitle('iron.title');
    this.lift = 'squat';
    this.params = JSON.parse(JSON.stringify(DEFAULTS));
    this.pct = 0.4; this.reps = 5;
    this.sets = []; this.set = null; this.risk = 0; this.riskPeak = 0;
    this.facts = {};
    this.viewTimer = 0;
    a.toolbar.set([
      { id: 'lift', key: '1', icon: ICON.lift, labelKey: 'iron.tool.lift', onSelect: () => this.openChooser('lift') },
      { id: 'load', key: '2', icon: ICON.load, labelKey: 'iron.tool.load', onSelect: () => this.openChooser('load') },
      { id: 'stance', key: '3', icon: ICON.stance, labelKey: 'iron.tool.stance', onSelect: () => this.openChooser('stance') },
      { id: 'bar', key: '4', icon: ICON.bar, labelKey: 'iron.tool.bar', onSelect: () => this.openChooser('bar') },
      { id: 'depth', key: '5', icon: ICON.depth, labelKey: 'iron.tool.depth', onSelect: () => this.openChooser('depth'), disabled: () => this.lift !== 'squat' },
      { id: 'brace', key: '6', icon: ICON.brace, labelKey: 'iron.tool.brace', onSelect: () => this.toggle('brace'), active: () => this.p.brace },
      { id: 'cue', key: '7', icon: ICON.cue, labelKey: 'iron.tool.cue', onSelect: () => this.toggle('cue'), active: () => this.p.cue },
      { id: 'tempo', key: '8', icon: ICON.tempo, labelKey: 'iron.tool.tempo', onSelect: () => this.openChooser('tempo') },
      { id: 'go', key: '9', icon: ICON.go, labelKey: 'iron.tool.go', onSelect: () => this.startSet(), active: () => !!this.set && !this.set.done, disabled: () => !!this.set && !this.set.done },
      { id: 'view', key: '0', icon: ICON.view, labelKey: 'iron.tool.view', onSelect: () => { this.cam.view = VIEWS[(VIEWS.indexOf(this.cam.view) + 1) % VIEWS.length]; this.setView(); }, active: () => this.cam.view === 'side' },
    ], (id) => `iron.rule.${id === 'cue' ? 'cue.' + this.lift : id}`);
    a.live.innerHTML = LIVE_HTML;
    i18n.apply(a.live);
    this.chart = a.live.querySelector('#ir-path');
    this.newSession();
    this.setView();
  }
  exit() { this.demo?.stop(); this.app.chooser.classList.add('hidden'); }

  get p() { return this.params[this.lift]; }
  get loadKg() { return Math.round(this.oneRM[this.lift] * this.pct / 2.5) * 2.5; }

  newSession() {
    this.facts = {};
    this.sets = []; this.set = null; this.risk = 0; this.riskPeak = 0;
    this.pathGeo.setDrawRange(0, 0);
    this.app.stages.load('iron', STAGES(this), { urgentHint: () => this.urgentHint() });
    this.barbell.userData.setLoad(this.loadKg);
    this.gym.rack.visible = this.lift === 'squat';
    this.gym.bench.visible = this.lift === 'bench';
    this.midfootLine.visible = this.lift !== 'bench';
    this.pose(0, 0);
    this.app.feed.push('iron.feed.session', 'ok', { lift: i18n.t('iron.lift.' + this.lift) });
    this.app.toolbar.refresh();
  }

  toggle(k) {
    if (this.set && !this.set.done) return;
    this.p[k] = !this.p[k];
    sfx.select();
    this.app.feed.push(`iron.feed.${k}${this.p[k] ? 'On' : 'Off'}`, this.p[k] ? 'ok' : 'warn', { cue: i18n.t('iron.cueName.' + this.lift) });
    this.pose(0, 0);
    this.app.toolbar.refresh();
  }

  openChooser(kind) {
    if (this.set && !this.set.done) { sfx.deny(); return; }
    const el = this.app.chooser;
    el.querySelector('.ch-title').textContent = i18n.t('iron.ch.' + kind);
    const body = el.querySelector('.ch-body'); body.innerHTML = '';
    const add = (label, sub, on, active, cls = '') => {
      const b = document.createElement('button');
      b.className = 'ch-opt ' + cls + (active ? ' active' : '');
      b.innerHTML = '<b></b><small></small>';
      b.children[0].textContent = label; b.children[1].textContent = sub;
      b.onclick = () => { on(); sfx.select(); this.pose(0, 0); this.app.toolbar.refresh(); };
      body.appendChild(b);
    };
    const close = () => el.classList.add('hidden');
    const P = this.p;
    if (kind === 'lift') LIFTS.forEach((l) => add(i18n.t('iron.lift.' + l), `1RM ${this.oneRM[l]} kg`, () => { this.lift = l; this.pct = 0.4; this.newSession(); close(); }, this.lift === l, 'third'));
    if (kind === 'load') {
      [0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].forEach((pc) => add(`${Math.round(pc * 100)} %`, `${Math.round(this.oneRM[this.lift] * pc / 2.5) * 2.5} kg · ${i18n.t('iron.ch.maxReps')} ${repsPossible(pc)}`, () => { this.pct = pc; this.barbell.userData.setLoad(this.loadKg); sfx.plates(); this.openChooser('load'); }, Math.abs(this.pct - pc) < 1e-3, 'third'));
      [3, 5, 8].forEach((r) => add(`${r} ${i18n.t('iron.ch.reps')}`, '', () => { this.reps = r; this.openChooser('load'); }, this.reps === r, 'third'));
    }
    if (kind === 'stance') ['narrow', 'shoulder', 'wide'].forEach((s) => add(i18n.t(`iron.stance.${this.lift}.${s}`), i18n.t(`iron.stanceSub.${this.lift}.${s}`), () => { P.stance = s; close(); }, P.stance === s, 'third'));
    if (kind === 'bar') (this.lift === 'squat' ? ['high', 'low'] : this.lift === 'deadlift' ? ['midfoot', 'toes'] : ['high', 'low']).forEach((b) => add(i18n.t(`iron.bar.${this.lift}.${b}`), i18n.t(`iron.barSub.${this.lift}.${b}`), () => { P.bar = b; close(); }, P.bar === b, 'half'));
    if (kind === 'depth') ['quarter', 'parallel', 'deep'].forEach((d) => add(i18n.t('iron.depth.' + d), i18n.t('iron.depthSub.' + d), () => { P.depth = d; close(); }, P.depth === d, 'third'));
    if (kind === 'tempo') Object.keys(TEMPO).forEach((t) => add(t, i18n.t('iron.tempoSub.' + t), () => { P.tempo = t; close(); }, P.tempo === t, 'third'));
    el.classList.remove('hidden');
  }

  // ── The set ────────────────────────────────────────
  startSet() {
    if (this.set && !this.set.done) return;
    this.app.chooser.classList.add('hidden');
    const max = repsPossible(this.pct);
    this.set = {
      lift: this.lift, pct: this.pct, kg: this.loadKg, target: this.reps, max, p: { ...this.p },
      rep: 0, phase: 'start', t: 0, s: this.lift === 'deadlift' ? 1 : 0, done: false, failed: false,
      velocities: [], maxDrift: 0, peak: { knee: 0, hip: 0, lumbar: 0, shoulder: 0, elbow: 0 }, faults: {}, pathN: 0, riskStart: this.risk,
    };
    this.pathGeo.setDrawRange(0, 0);
    this.pathPts = [];
    sfx.plates();
    this.app.feed.push('iron.feed.setStart', 'ok', { kg: this.set.kg, reps: this.reps, pct: Math.round(this.pct * 100) });
    this.app.toolbar.refresh();
  }

  stepSet(dt) {
    const S = this.set;
    if (!S || S.done) return;
    const [ecc, pause, conBase] = TEMPO[S.p.tempo];
    const f = S.rep / (S.max + 1);
    const fresh = Math.max(0.12, freshVelocity(S.lift, S.pct));
    const vel = fresh * (1 - 0.55 * f);
    const rom = this.rom || 0.5;
    const conDur = Math.max(conBase * 0.6, rom / vel);
    const dl = S.lift === 'deadlift';
    S.t += dt;
    const next = (phase) => { S.phase = phase; S.t = 0; };
    switch (S.phase) {
      case 'start': if (S.t > 0.6) next(dl ? 'con' : 'ecc'); break;
      // Lowering: s runs 0 → 1 (to the bottom for the squat and bench, back to the floor for the deadlift).
      case 'ecc': S.s = Math.min(1, S.t / ecc); if (S.t >= ecc) next(dl ? 'bottom' : 'pause'); break;
      case 'pause': if (S.t >= pause) next('con'); break;
      case 'con': {
        const willFail = S.rep + 1 > S.max;
        const k = Math.min(1, S.t / conDur);
        const prog = willFail ? Math.min(0.55, k) : k;
        S.s = 1 - prog;
        if (willFail && S.t > conDur * 1.4) { S.failed = true; this.risk += 0.12 * S.pct; this.fault('fail', true); return this.endSet(); }
        if (!willFail && k >= 1) { S.rep++; S.velocities.push(rom / conDur); sfx.rep(); next(dl ? 'lockout' : 'top'); }
        break;
      }
      case 'top': if (S.t > 0.35) { if (S.rep >= S.target) return this.endSet(); next('ecc'); } break;
      case 'lockout': if (S.t > 0.35) { if (S.rep >= S.target) return this.endSet(); next('ecc'); } break;
      case 'bottom': if (S.t > 0.25) next('con'); break;
    }
    // Pose, forces and faults for this instant.
    const ascending = S.phase === 'con';
    const res = this.pose(S.s, f, ascending, S);
    S.maxDrift = Math.max(S.maxDrift, res.drift);
    for (const k of Object.keys(S.peak)) S.peak[k] = Math.max(S.peak[k], res.M[k] || 0);
    // Hidden injury risk: loaded flexion, knee cave and a bar far from the base all add to it.
    const L = S.pct;
    this.risk += dt * L * (res.pose.wink * 0.004 + res.valgus * 1.2 + Math.max(0, res.drift - 0.04) * 1.5 + (S.lift === 'bench' && res.pose.flare > 70 ? 0.03 : 0));
    this.risk = Math.min(1, this.risk);
    this.riskPeak = Math.max(this.riskPeak, this.risk);
    if (res.pose.wink > 8 && L > 0.6) this.fault('wink');
    if (res.valgus > 0.03 && L > 0.5) this.fault('valgus');
    if (res.drift > 0.05) this.fault(S.lift === 'bench' ? 'face' : 'drift');
    if (S.lift === 'bench' && res.pose.flare > 70 && L > 0.6) this.fault('flare');
    if (ascending && res.gm > 0.12 && S.lift !== 'bench') this.fault('hips');
    // Bar path trace.
    const arr = this.pathGeo.attributes.position.array;
    if (S.pathN < 2000) { const b = this.barbell.position; arr[S.pathN * 3] = b.x; arr[S.pathN * 3 + 1] = b.y; arr[S.pathN * 3 + 2] = 0.45; S.pathN++; this.pathGeo.setDrawRange(0, S.pathN); this.pathGeo.attributes.position.needsUpdate = true; }
    this.pathPts.push({ x: res.pose.bar.x, y: res.pose.bar.y });
  }

  fault(kind, force = false) {
    const S = this.set;
    if (!S) return;
    if (S.faults[kind] && !force) { S.faults[kind]++; return; }
    S.faults[kind] = (S.faults[kind] || 0) + 1;
    this.app.feed.push('iron.fault.' + kind, kind === 'fail' ? 'bad' : 'warn');
    if (kind === 'fail') { sfx.hit(); this.app.stage.flash('#ff4466'); } else sfx.warn();
  }

  endSet() {
    const S = this.set;
    S.done = true;
    S.rir = S.max - S.rep;
    S.velLoss = S.velocities.length > 1 ? 1 - S.velocities[S.velocities.length - 1] / S.velocities[0] : 0;
    this.sets.push(S);
    if (S.pct <= 0.55 && S.rep >= 3 && !S.failed) this.facts.warmup = true;
    if (S.pct >= 0.7 && S.pct <= 0.87 && S.rep >= 5) { this.facts.work = S; }
    this.app.feed.push(S.failed ? 'iron.feed.failed' : 'iron.feed.setDone', S.failed ? 'bad' : 'ok', { reps: S.rep, rir: Math.max(0, S.rir), loss: Math.round(S.velLoss * 100) });
    this.pose(this.lift === 'deadlift' ? 1 : 0, 0);
    this.app.toolbar.refresh();
    this.drawChart();
  }

  // Solve and render the lifter at depth s.
  pose(s, fatigue = 0, ascending = false, S = null) {
    const lift = S ? S.lift : this.lift, P = S ? S.p : this.p, pct = S ? S.pct : this.pct, kg = S ? S.kg : this.loadKg;
    const st = faultState(lift, P, fatigue, s, ascending, pct);
    const fn = lift === 'squat' ? squatPose : lift === 'deadlift' ? deadliftPose : benchPose;
    const pose = fn(s, P, st);
    const M = moments(lift, pose, kg, P);
    const act = activation(lift, M, kg);
    const stanceHalf = { narrow: 0.12, shoulder: 0.19, wide: 0.28 }[P.stance];
    const gripHalf = lift === 'bench' ? { narrow: 0.2, medium: 0.28, wide: 0.36, shoulder: 0.28 }[P.stance] : lift === 'deadlift' ? stanceHalf + 0.08 : 0.34;
    poseLifter(this.lifter, pose, lift, { stanceHalf, gripHalf, valgus: st.valgus, activation: act });
    this.barbell.position.set(pose.bar.x, pose.bar.y, 0);
    // Range of motion of the bar for this setup (for bar speed).
    if (!S || s === 0) {
      const top = fn(0, P, faultState(lift, P, 0, 0, false, pct)), bottom = fn(1, P, faultState(lift, P, 0, 1, false, pct));
      this.rom = Math.abs(top.bar.y - bottom.bar.y);
    }
    const ideal = lift === 'bench' ? benchPose(s, P, { drift: 0 }).bar.x : BODY.midfoot + (lift === 'deadlift' && P.bar === 'toes' ? 0.05 : 0);
    const drift = Math.abs(pose.bar.x - (lift === 'bench' ? ideal : BODY.midfoot));
    this.now = { pose, M, act, drift, valgus: st.valgus, gm: st.goodMorning, s, fatigue };
    return this.now;
  }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { if (e.button === 2 || e.button === 0) this.cam.drag = { x: e.clientX, y: e.clientY }; }
  pointerMove(e) {
    this.mouse = { x: e.clientX, y: e.clientY };
    if (!this.cam.drag) return;
    this.cam.yaw -= (e.clientX - this.cam.drag.x) * 0.006;
    this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + (e.clientY - this.cam.drag.y) * 0.004, -0.2, 1.2);
    this.cam.drag = { x: e.clientX, y: e.clientY };
    this.cam.view = 'free';
  }
  pointerUp() { this.cam.drag = null; }
  wheel(e) { this.cam.dist = THREE.MathUtils.clamp(this.cam.dist * Math.exp(e.deltaY * 0.001), 1.6, 7); }
  key(e) { if (e.key === ' ') { this.startSet(); return true; } if (e.key === 'Escape') { this.app.chooser.classList.add('hidden'); return true; } return false; }
  setView() {
    const v = { side: [0.3, 0.1], three: [0.65, 0.18], front: [Math.PI / 2, 0.08] }[this.cam.view];
    if (v) { this.cam.yaw = v[0]; this.cam.pitch = v[1]; }
    this.app.toolbar.refresh();
  }

  update(dt) {
    const a = this.app;
    this.demo?.update(dt);
    this.stepSet(dt);
    if (!this.set || this.set.done) {
      // Idle: a gentle breathing sway.
      const idleS = this.lift === 'deadlift' ? 1 : 0;
      if (!this.idleT || a.frame % 20 === 0) this.pose(idleS, 0);
    }
    // Camera orbit around the lifter.
    const tgt = new THREE.Vector3(this.lift === 'bench' ? 0.35 : 0.05, this.lift === 'bench' ? 0.6 : 0.95, 0);
    const c = this.cam;
    const pos = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist).add(tgt);
    this.camera.position.lerp(pos, 1 - Math.exp(-dt * 6));
    this.camera.lookAt(tgt);
    // Review: time spent in the side view after the working set.
    if (this.facts.work && this.cam.view === 'side') this.viewTimer += dt;
    if (this.viewTimer > 2) this.facts.review = true;
    a.stages.update();
    if (a.frame % 4 === 0) this.updateLive();
  }

  // ── Panels ─────────────────────────────────────────
  updateLive() {
    const q = (id) => this.app.live.querySelector('#' + id);
    const S = this.set && !this.set.done ? this.set : this.sets[this.sets.length - 1];
    const now = this.now;
    q('ir-lift').textContent = i18n.t('iron.lift.' + this.lift);
    q('ir-load').textContent = `${this.loadKg} kg · ${Math.round(this.pct * 100)} %`;
    q('ir-reps').textContent = S ? `${S.rep}/${S.target}` : `0/${this.reps}`;
    const rir = S ? S.max - S.rep : repsPossible(this.pct);
    q('ir-rir').textContent = S && S.failed ? '✕' : String(Math.max(0, rir));
    q('ir-rir').className = rir <= 0 ? 'alert' : rir === 1 ? 'warn' : '';
    const vl = S && S.velocities.length ? S.velocities[S.velocities.length - 1] : null;
    q('ir-vel').textContent = vl ? `${vl.toFixed(2)} m/s` : '—';
    const loss = S && S.velocities.length > 1 ? 1 - S.velocities[S.velocities.length - 1] / S.velocities[0] : 0;
    q('ir-loss').textContent = `${Math.round(loss * 100)} %`;
    q('ir-loss').className = loss > 0.3 ? 'alert' : loss > 0.2 ? 'warn' : '';
    // Joint moments.
    const keys = this.lift === 'bench' ? ['shoulder', 'elbow'] : ['knee', 'hip', 'lumbar'];
    const bars = q('ir-moments'); bars.innerHTML = '';
    const ref = this.oneRM[this.lift] * 9.81 * 0.3;
    for (const k of keys) {
      const val = now?.M[k] || 0;
      const frac = Math.min(1, val / ref);
      const row = document.createElement('div');
      row.className = 'ir-m';
      row.innerHTML = `<label></label><div class="lv-bar"><i></i></div><b class="mono"></b>`;
      row.children[0].textContent = i18n.t('iron.joint.' + k);
      row.querySelector('i').style.width = `${Math.round(frac * 100)}%`;
      row.querySelector('i').className = frac > 0.8 ? 'hot' : frac > 0.6 ? 'warm' : '';
      row.children[2].textContent = `${Math.round(val)} N·m`;
      bars.appendChild(row);
    }
    // Muscles.
    const mus = q('ir-muscles'); mus.innerHTML = '';
    const order = this.lift === 'bench' ? ['pecs', 'triceps', 'delts', 'lats'] : this.lift === 'deadlift' ? ['glutes', 'hams', 'erectors', 'quads', 'lats'] : ['quads', 'glutes', 'erectors', 'hams'];
    for (const m of order) {
      const val = now?.act[m] || 0;
      const chip = document.createElement('span');
      chip.className = 'ir-chip';
      chip.style.setProperty('--a', val.toFixed(2));
      chip.textContent = `${i18n.t('iron.muscle.' + m)} ${Math.round(val * 100)}`;
      mus.appendChild(chip);
    }
    q('ir-drift').textContent = now ? `${(now.drift * 100).toFixed(1)} cm` : '—';
    q('ir-drift').className = now && now.drift > 0.05 ? 'alert' : now && now.drift > 0.03 ? 'warn' : '';
    q('ir-setup').textContent = [i18n.t(`iron.stance.${this.lift}.${this.p.stance}`), this.lift === 'squat' ? i18n.t('iron.depth.' + this.p.depth) : '', i18n.t(`iron.bar.${this.lift}.${this.p.bar}`), this.p.tempo].filter(Boolean).join(' · ');
    q('ir-cues').textContent = `${i18n.t('iron.tool.brace')} ${this.p.brace ? '✓' : '✕'} · ${i18n.t('iron.cueName.' + this.lift)} ${this.p.cue ? '✓' : '✕'}`;
    if (this.set && !this.set.done && this.app.frame % 8 === 0) this.drawChart();
  }

  // Side-view bar path: horizontal drift (exaggerated ×3) against height.
  drawChart() {
    const cv = this.chart; if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const pts = this.pathPts || [];
    if (!pts.length) return;
    const ys = pts.map((p) => p.y), yMin = Math.min(...ys) - 0.05, yMax = Math.max(...ys) + 0.05;
    const ref = this.lift === 'bench' ? pts[0].x : BODY.midfoot;
    const X = (x) => W / 2 + (x - ref) * 3 * W / 0.6, Y = (y) => H - (y - yMin) / (yMax - yMin) * H;
    g.strokeStyle = 'rgba(63,243,255,.5)'; g.setLineDash([4 * dpr, 4 * dpr]); g.lineWidth = dpr;
    g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([]);
    for (const band of [0.05]) { g.fillStyle = 'rgba(93,255,168,.07)'; g.fillRect(X(ref - band), 0, X(ref + band) - X(ref - band), H); }
    g.strokeStyle = '#5dffa8'; g.lineWidth = 2 * dpr; g.shadowColor = '#5dffa8'; g.shadowBlur = 6 * dpr;
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke();
    g.shadowBlur = 0;
  }

  urgentHint() {
    if (this.set && !this.set.done) {
      const S = this.set, rir = S.max - S.rep;
      if (rir <= 0) return 'iron.hint.urgentFail';
      if (this.now?.valgus > 0.03) return 'iron.hint.urgentValgus';
      if (this.now?.pose.wink > 8 && S.pct > 0.6) return 'iron.hint.urgentWink';
    }
    if (this.app.stages.complete) return 'iron.hint.done';
    return null;
  }

  // ── Debrief ────────────────────────────────────────
  showDebrief() {
    const W = this.facts.work || this.sets[this.sets.length - 1];
    if (!W) { this.app.feed.push('iron.feed.noSet', 'warn'); return; }
    const faults = W.faults;
    const faultCount = Object.values(faults).reduce((s, n) => s + n, 0);
    let score = 100;
    score -= W.failed ? 25 : 0;
    score -= Math.min(20, Math.max(0, W.maxDrift - 0.03) * 400);
    score -= Math.min(20, Object.keys(faults).length * 7);
    score -= W.rir < 1 ? 10 : 0;
    score -= Math.round(this.riskPeak * 20);
    score -= !this.facts.warmup ? 10 : 0;
    score = Math.max(0, Math.round(score));
    const tips = [];
    const add = (k, v = {}) => tips.push(i18n.t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? ''));
    if (!this.facts.warmup) add('iron.tip.warmup');
    if (!W.p.brace) add('iron.tip.brace');
    if (faults.wink) add('iron.tip.wink');
    if (faults.valgus) add('iron.tip.valgus');
    if (faults.drift) add(W.lift === 'deadlift' ? 'iron.tip.driftDl' : 'iron.tip.drift', { cm: (W.maxDrift * 100).toFixed(1) });
    if (faults.hips) add('iron.tip.hips');
    if (faults.flare) add('iron.tip.flare');
    if (faults.face) add('iron.tip.face');
    if (W.failed || W.rir < 1) add('iron.tip.rir', { pct: Math.round(W.pct * 100), max: W.max });
    if (W.velLoss > 0.3) add('iron.tip.velloss', { loss: Math.round(W.velLoss * 100) });
    if (W.lift === 'squat' && W.p.depth === 'quarter') add('iron.tip.depth');
    if (!tips.length) add('iron.tip.great');
    if (tips.length < 3) add('iron.tip.generic');
    this.app.debrief.show({
      title: i18n.t('iron.db.title').replace('{lift}', i18n.t('iron.lift.' + W.lift)), sub: `${i18n.t('app.title')} · ${i18n.t('app.by')}`, score,
      stats: [
        { label: i18n.t('iron.db.load'), value: `${W.kg} kg`, cls: '' },
        { label: i18n.t('iron.db.reps'), value: `${W.rep}/${W.target}`, cls: W.failed ? 'bad' : 'ok' },
        { label: 'RIR', value: String(Math.max(0, W.rir)), cls: W.rir >= 1 ? 'ok' : 'bad' },
        { label: i18n.t('iron.db.speed'), value: `${(W.velocities[0] || 0).toFixed(2)} m/s`, cls: '' },
        { label: i18n.t('iron.db.loss'), value: `${Math.round(W.velLoss * 100)} %`, cls: W.velLoss > 0.3 ? 'warn' : 'ok' },
        { label: i18n.t('iron.db.drift'), value: `${(W.maxDrift * 100).toFixed(1)} cm`, cls: W.maxDrift > 0.05 ? 'bad' : W.maxDrift > 0.03 ? 'warn' : 'ok' },
        { label: i18n.t('iron.db.peak'), value: `${Math.round(Math.max(W.peak.hip, W.peak.knee, W.peak.shoulder))} N·m`, cls: '' },
        { label: i18n.t('iron.db.faults'), value: String(faultCount ? Object.keys(faults).length : 0), cls: faultCount ? 'warn' : 'ok' },
      ],
      checks: [
        { label: i18n.t('iron.chk.warmup'), value: this.facts.warmup ? '✓' : '—', ok: !!this.facts.warmup },
        { label: i18n.t('iron.chk.brace'), value: W.p.brace ? '✓' : '✕', ok: W.p.brace },
        { label: i18n.t('iron.chk.cue'), value: W.p.cue ? '✓' : '✕', ok: W.p.cue },
        { label: i18n.t('iron.chk.path'), value: `${(W.maxDrift * 100).toFixed(1)} cm`, ok: W.maxDrift <= 0.05 },
        { label: i18n.t('iron.chk.rir'), value: String(Math.max(0, W.rir)), ok: W.rir >= 1 },
      ],
      tips: tips.slice(0, 5),
      onAgain: () => this.newSession(),
    });
  }
}

// Session stages for one lift.
const STAGES = (m) => [
  { id: 'warmup', tasks: [{ id: 'warmup', check: () => !!m.facts.warmup }] },
  { id: 'setup', tasks: [
    { id: 'stance', check: () => (m.lift === 'bench' ? m.p.stance !== 'wide' : m.p.stance !== 'narrow') },
    { id: 'setupBar', check: () => (m.lift === 'squat' ? m.p.depth !== 'quarter' : m.lift === 'deadlift' ? m.p.bar === 'midfoot' : true) },
  ] },
  { id: 'brace', tasks: [{ id: 'brace', check: () => m.p.brace }, { id: 'cue', check: () => m.p.cue }] },
  { id: 'load', tasks: [{ id: 'load', check: () => m.pct >= 0.7 && m.pct <= 0.87 }] },
  { id: 'work', tasks: [
    { id: 'work', check: () => !!m.facts.work, progress: () => (m.set && !m.set.done ? m.set.rep / m.set.target : 0) },
    { id: 'path', check: () => !!m.facts.work && m.facts.work.maxDrift <= 0.05 },
    { id: 'rir', check: () => !!m.facts.work && m.facts.work.rir >= 1 },
  ] },
  { id: 'review', tasks: [{ id: 'review', check: () => !!m.facts.review, progress: () => Math.min(1, m.viewTimer / 2) }] },
];

const LIVE_HTML = `
  <header class="lv-head mono"><span data-i18n="iron.live.title"></span></header>
  <div class="lv-grid mono">
    <div><label data-i18n="iron.live.lift"></label><b id="ir-lift">—</b></div>
    <div><label data-i18n="iron.live.load"></label><b id="ir-load">—</b></div>
    <div><label data-i18n="iron.live.reps"></label><b id="ir-reps">0/5</b></div>
    <div><label>RIR</label><b id="ir-rir">—</b></div>
    <div><label data-i18n="iron.live.vel"></label><b id="ir-vel">—</b></div>
    <div><label data-i18n="iron.live.loss"></label><b id="ir-loss">0 %</b></div>
  </div>
  <div class="lv-sub mono" data-i18n="iron.live.moments"></div>
  <div id="ir-moments" class="ir-moments"></div>
  <div class="lv-sub mono"><span data-i18n="iron.live.path"></span> · <b id="ir-drift" class="mono">—</b></div>
  <canvas id="ir-path" class="ir-path"></canvas>
  <div class="lv-sub mono" data-i18n="iron.live.muscles"></div>
  <div id="ir-muscles" class="ir-muscles"></div>
  <div class="lv-kv mono"><label data-i18n="iron.live.setup"></label><b id="ir-setup">—</b></div>
  <div class="lv-kv mono"><label data-i18n="iron.live.cues"></label><b id="ir-cues">—</b></div>`;
