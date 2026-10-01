import * as THREE from 'three';
import { G, RHO, CAPE, glide, chute, polar, THREATS, MATERIALS, armour, grapnel, sonar } from './sim/physics.js';
import { buildWorld, animateWorld, drawScreens } from './view/world.js';
import { buildSuit, assemble, pose, stepCape, M as SM } from './view/suit.js';
import { fbm } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// NOCTURNE · the app: the suit and cowl optics, cape gliding, armour ballistics, the grapnel,
// and sonar mapping of the cave — each with a field-readiness goal.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const BL = '#3d8cff', AM = '#ffae55', OK = '#5dffa8', BAD = '#ff4466';
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
// The cave floor (same formula as the mesh) for sonar ray-marching.
const floorY = (x, z) => { const r = Math.hypot(x, z); let y = (fbm(x * 0.15, 0, z * 0.15, 4) - 0.5) * 1.6 * Math.min(1, Math.max(0, (r - 5) / 6)) - (r > 26 ? (r - 26) * 0.2 : 0); if (r < 2.3) y = Math.max(y, 0.3); return y; };

export class Nocturne {
  constructor(app) {
    this.app = app;
    this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 3000); this.scene.add(this.cam);
    this.suit = buildSuit(); this.suit.position.y = 0.3; this.scene.add(this.suit);
    this.asm = { u: 1, target: 1 }; this.vision = 0; this.seenVision = new Set(); this.perch = 0; this.perchT = 0;
    this.gl = { mass: 112, S: 2.4, CL: 0.65, mode: 'rigid', h: 260, chute: true, deploy: 60, A: 22, run: null, last: null };
    this.ar = { mat: 'uhmwpe', ad: 6, threat: 'IIIA', area: 0.55, shot: null, last: null };
    this.gp = { mass: 112, d: 4, L: 30, theta: 60, fall: 2, absorber: 0, run: null };
    this.so = { f: 45, T: 14, budget: 100, found: new Set(), n: 0, ping: null };
    this.view = { yaw: 0.5, pitch: 0.1, r: 4.6, drag: null, last: 0 };
    this.goal = { suit: false, glide: false, armour: false, grapnel: false, sonar: false };
    this.tab = 'suit'; this.entered = false; this.uiT = 0; this.time = 0; this.scrT = 0;
    this.stalList = []; { const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); for (let i = 0; i < this.W.stal.count; i++) { this.W.stal.getMatrixAt(i, m); m.decompose(p, q, s); this.stalList.push({ x: p.x, y: p.y, z: p.z, r: 0.35 * s.x, h: 3 * s.y, up: i < 110 }); } }
    this.layers(); assemble(this.suit, 1);
    app.stage.use(this.scene, this.cam);
  }

  // ── Readiness ──────────────────────────────────────
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['suit', 'glide', 'armour', 'grapnel', 'sonar'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    const city = tab === 'glide' || tab === 'grapnel'; this.W.city.visible = city; this.W.cave.visible = !city; this.W.sonarPts.visible = tab === 'sonar'; this.W.stal.visible = this.W.dome.visible = tab !== 'sonar';
    this.scene.fog.density = city ? 0.0016 : 0.035; this.scene.background.set(city ? '#0a1220' : '#020306');
    this.W.rope.visible = false; this.W.chuteM.visible = false; this.W.trail.visible = tab === 'glide';
    if (tab === 'glide' && !this.gl.run) this.resetGlide(); if (tab === 'grapnel' && !this.gp.run) this.resetGrapnel();
    if (!city) { this.suit.position.set(0, 0.3, 0); this.suit.rotation.set(0, 0, 0); }
    this.suit.userData.cape.p = null; this.snap = true;
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { suit: ['suP', 'suS', 'suB'], glide: ['glP', 'glS', 'glB'], armour: ['arP', 'arS', 'arB'], grapnel: ['gpP', 'gpS', 'gpB'], sonar: ['soP', 'soS', 'soB'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true);
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); this.refresh(true); }; } }

  // ═══ SUIT ═══
  suP() {
    return `<header class="lv-head mono">${t('su.title')}</header><p class="intro">${t('su.intro')}</p>
      <div class="chips"><button class="btn primary" id="su-up">${this.asm.target ? t('su.strip') : t('su.up')}</button><button class="btn seg ${this.perchT ? 'active' : ''}" id="su-perch">${t('su.perch')}</button></div>
      <header class="lv-sub mono">${t('su.vision')}</header>${this.chips('vis', ['0', '1', '2'], String(this.vision), (k) => t('vis.' + k))}
      <p class="small">${t('su.visNote')}</p>
      <header class="lv-sub mono">${t('su.layers')}</header><ul class="layers">${['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((k) => `<li><b>${t('su.' + k)}</b><span>${t('su.' + k + 'd')}</span></li>`).join('')}</ul>`;
  }
  suS() { return `<header class="lv-head mono">${t('su.read')}</header><div class="bigstats" id="su-big"></div><div class="math mono" id="su-math"></div><div class="goal" id="su-goal"></div>`; }
  suB() {
    $('#su-up').onclick = () => { this.asm.target = this.asm.target ? 0 : 1; sfx.confirm(); if (this.asm.target) this.caption('cap.assemble'); this.render(); };
    $('#su-perch').onclick = () => { this.perchT = this.perchT ? 0 : 1; sfx.select(); this.render(); };
    document.querySelectorAll('[data-vis]').forEach((b) => (b.onclick = () => this.setVision(+b.dataset.vis)));
  }
  setVision(v) { this.vision = v; this.seenVision.add(v); this.app.stage.grade.uniforms.uVision.value = v; if (this.seenVision.size >= 3 && this.asm.u > 0.99) this.done('suit'); sfx.select(); this.render(); }
  suLive() {
    const m = this.suitMass(), big = $('#su-big');
    if (big) big.innerHTML = `<div><b class="mono">${f1(m.total)}</b><small>${t('su.mass')} kg</small></div><div><b class="mono">${f0(m.heat)}</b><small>${t('su.heat')} W</small></div><div><b class="mono">${this.vision ? t('vis.' + this.vision) : '—'}</b><small>${t('su.mode')}</small></div>`;
    const el = $('#su-math');
    if (el) el.innerHTML = `<div>${t('su.budget')}: ${m.rows.map(([k, v]) => `${t('su.' + k)} <b>${f1(v)}</b>`).join(' · ')} kg</div>
      <div>${t('su.heatEq')} Q = h·A·ΔT − ${t('su.sweat')} · M ≈ 400 W ${t('su.work')} → <b>${f0(m.heat)} W</b> ${t('su.toShed')}</div>
      <div>${t('su.nv')}: ${t('su.nvEq')}</div><div>${t('su.ir')}: λ<sub>peak</sub> = b/T = 2898 µm·K / 310 K = <b>9.3 µm</b> (${t('su.irNote')})</div>`;
    const g = $('#su-goal'); if (g) g.innerHTML = `${badge(this.goal.suit)} ${t('goal.suit', { n: this.seenVision.size })}`;
  }
  suitMass() { const rows = [['l2', 3.2], ['l3', 9.4], ['l4', 2.1], ['l5', 3.6], ['l6', 2.4], ['l1', 1.8]]; const total = rows.reduce((a, r) => a + r[1], 0); return { rows, total, heat: 400 - 120 }; }

  // ═══ GLIDE ═══
  glP() {
    const g = this.gl;
    return `<header class="lv-head mono">${t('gl.title')}</header><p class="intro">${t('gl.intro')}</p>
      ${this.chips('cm', ['soft', 'rigid'], g.mode, (k) => t('gl.' + k))}
      ${this.slider('g-S', t('gl.S'), g.S, 1.2, 3.6, 0.1, f1(g.S) + ' m²')}${this.slider('g-CL', t('gl.CL'), g.CL, 0.2, 1.2, 0.01, f2(g.CL))}
      ${this.slider('g-h', t('gl.h'), g.h, 40, 400, 5, g.h + ' m')}${this.slider('g-m', t('gl.m'), g.mass, 70, 150, 1, g.mass + ' kg')}
      <label class="toggle"><input type="checkbox" id="g-ch" ${g.chute ? 'checked' : ''}> ${t('gl.chute')}</label>
      ${this.slider('g-dep', t('gl.deploy'), g.deploy, 20, 200, 5, g.deploy + ' m')}${this.slider('g-A', t('gl.A'), g.A, 6, 40, 1, g.A + ' m²')}
      <button class="btn primary wide" id="g-go">▶ ${t('gl.jump')}</button>`;
  }
  glS() { return `<header class="lv-head mono">${t('gl.read')}</header><div class="bigstats" id="gl-big"></div><canvas class="cv chart" id="cv-polar"></canvas><canvas class="cv chart" id="cv-traj"></canvas><div class="math mono" id="gl-math"></div><div class="goal" id="gl-goal"></div>`; }
  glB() {
    const g = this.gl;
    document.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => { g.mode = b.dataset.cm; sfx.select(); this.render(); }));
    this.bindSliders(g, [['g-S', 'S', (v) => f1(v) + ' m²'], ['g-CL', 'CL', f2], ['g-h', 'h', (v) => v + ' m'], ['g-m', 'mass', (v) => v + ' kg'], ['g-dep', 'deploy', (v) => v + ' m'], ['g-A', 'A', (v) => v + ' m²']]);
    $('#g-h').addEventListener('change', () => this.resetGlide());
    $('#g-ch').onchange = (e) => { g.chute = e.target.checked; this.refresh(true); };
    $('#g-go').onclick = () => this.jump();
  }
  resetGlide() { const g = this.gl; g.run = { x: 0, y: g.h, vx: 0.5, vy: 0, t: 0, phase: 'ready', path: [[0, g.h]], cd: 0 }; this.W.launch.scale.y = g.h / 120; this.W.launch.position.y = g.h / 2; this.W.ledge.position.y = g.h + 0.5; }
  jump() { this.resetGlide(); this.gl.run.phase = 'glide'; this.gl.run.vx = 4; sfx.confirm(); this.caption('cap.jump'); }
  // 2-D point mass with lift ⊥ v and drag ∥ v; the canopy adds drag as it inflates over 1.5 s.
  glideStep(dt) {
    const g = this.gl, R = g.run; if (!R || R.phase === 'ready' || R.phase === 'landed') return;
    const c = CAPE[g.mode], k = 1 / (Math.PI * c.e * c.AR);
    for (let s = 0; s < 10; s++) {
      const h = dt / 10, V = Math.hypot(R.vx, R.vy), q = 0.5 * RHO * V * V;
      if (g.chute && R.phase === 'glide' && R.y <= g.deploy) { R.phase = 'chute'; R.tc = R.t; sfx.select(); this.caption('cap.chute'); }
      const inf = R.phase === 'chute' ? Math.min(1, (R.t - R.tc) / 1.5) : 0, CL = g.CL * (1 - inf), CD = c.cd0 + k * CL * CL;
      const L = q * g.S * CL, D = q * g.S * CD + q * 1.5 * g.A * inf, ux = R.vx / V, uy = R.vy / V;
      const ax = (-D * ux - L * uy) / g.mass, ay = (-D * uy + L * ux) / g.mass - G;   // lift ⊥ v (rotated +90°)
      R.vx += ax * h; R.vy += ay * h; R.x += R.vx * h; R.y += R.vy * h; R.t += h;
      if (R.y <= 0) { R.y = 0; R.phase = 'landed'; const V2 = R.vx * R.vx + R.vy * R.vy; g.last = { heq: V2 / (2 * G), V: Math.sqrt(V2), dist: R.x, t: R.t, chute: g.chute }; if (g.last.heq <= 3) this.done('glide'); this.app.feed.push(g.last.heq <= 3 ? 'gl.safe' : 'gl.hard', g.last.heq <= 3 ? 'ok' : 'warn', { h: f1(g.last.heq), v: f1(g.last.V) }); sfx.confirm(); this.render(); break; }
    }
    if (R.path.length === 0 || R.x - R.path[R.path.length - 1][0] > 1 || Math.abs(R.y - R.path[R.path.length - 1][1]) > 1) R.path.push([R.x, R.y]);
  }
  glLive(full) {
    const g = this.gl, s = glide(g), R = g.run, ch = chute(g);
    const big = $('#gl-big');
    if (big) big.innerHTML = `<div><b class="mono">${f2(s.LD)}</b><small>L/D (max ${f2(s.LDmax)})</small></div><div><b class="mono">${f0(s.V * 3.6)}</b><small>km/h · ${t('gl.sink')} ${f1(s.sink)} m/s</small></div><div><b class="mono ${R?.phase === 'landed' ? (g.last.heq <= 3 ? 'c-green' : 'c-red') : ''}">${R?.phase === 'landed' ? f1(g.last.heq) + ' m' : f0(R?.y ?? g.h) + ' m'}</b><small>${R?.phase === 'landed' ? t('gl.heq') : t('gl.alt')}</small></div>`;
    if (!full) return;
    const pp = polar(g);
    lineChart($('#cv-polar'), { x0: 0, x1: 60, y0: 0, y1: 30, xFmt: (x) => x + '', yFmt: (y) => f0(y), title: t('gl.polar'), series: [{ pts: pp.map(([x, y]) => [x, y]), color: BL, label: t('gl.' + g.mode) }, { pts: polar({ ...g, mode: g.mode === 'soft' ? 'rigid' : 'soft' }).map(([x, y]) => [x, y]), color: 'rgba(160,170,190,.4)', width: 1 }], marks: [{ dot: [s.vx, s.sink], color: AM }] });
    const path = R?.path ?? [[0, g.h]], xm = Math.max(100, ...path.map((p) => p[0]), g.h * s.LD);
    lineChart($('#cv-traj'), { x0: 0, x1: xm, y0: 0, y1: g.h * 1.05, xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y), title: t('gl.traj'), series: [{ pts: [[0, g.h], [g.h * s.LD, 0]], color: 'rgba(61,140,255,.35)', dash: [4, 4], label: t('gl.ideal') }, { pts: path, color: AM, label: t('gl.flown') }], marks: g.chute ? [{ y: g.deploy, color: 'rgba(93,255,168,.5)', label: t('gl.dep') }] : [] });
    const m = $('#gl-math');
    if (m) m.innerHTML = `<div>C<sub>D</sub> = C<sub>D0</sub> + kC<sub>L</sub>² = ${CAPE[g.mode].cd0} + ${f2(s.k)}·${f2(g.CL)}² = <b>${f2(s.CD)}</b> · k = 1/(πeAR)</div>
      <div>tan γ = C<sub>D</sub>/C<sub>L</sub> → γ = <b>${f1((s.gam * 180) / Math.PI)}°</b> · (L/D)<sub>max</sub> = 1/(2√(C<sub>D0</sub>k)) at C<sub>L</sub>* = <b>${f2(s.CLstar)}</b></div>
      <div>V = √(2mg cos γ/(ρSC<sub>L</sub>)) = <b>${f1(s.V)} m/s</b> · W/S = <b>${f0(s.wingLoad)} N/m²</b> · d = h·L/D = <b>${f0(s.dist)} m</b></div>
      <div>${t('gl.land')} h<sub>eq</sub> = V²/2g = <b class="c-red">${f1(s.heq)} m</b> · ${t('gl.canopy')} v = √(2mg/(ρC<sub>D</sub>A)) = <b>${f1(ch.v)} m/s</b> → <b class="${ch.heq <= 3 ? 'c-green' : 'c-amber'}">${f1(ch.heq)} m</b></div>`;
    const go = $('#gl-goal'); if (go) go.innerHTML = `${badge(this.goal.glide)} ${t('goal.glide')}`;
  }

  // ═══ ARMOUR ═══
  arP() {
    const a = this.ar;
    return `<header class="lv-head mono">${t('ar.title')}</header><p class="intro">${t('ar.intro')}</p>
      <header class="lv-sub mono">${t('ar.mat')}</header>${this.chips('mt', Object.keys(MATERIALS), a.mat, (k) => t('mat.' + k))}
      ${this.slider('a-ad', t('ar.ad'), a.ad, 1, 40, 0.5, f1(a.ad) + ' kg/m²')}${this.slider('a-area', t('ar.area'), a.area, 0.15, 0.8, 0.01, f2(a.area) + ' m²')}
      <header class="lv-sub mono">${t('ar.threat')}</header>${this.chips('th', THREATS.map((x) => x.id), a.threat, (k) => 'NIJ ' + k)}
      <button class="btn primary wide" id="a-fire">▶ ${t('ar.fire')}</button><p class="small">${t('ar.note')}</p>`;
  }
  arS() { return `<header class="lv-head mono">${t('ar.read')}</header><div class="bigstats" id="ar-big"></div><canvas class="cv chart" id="cv-ke"></canvas><div class="math mono" id="ar-math"></div><div class="goal" id="ar-goal"></div>`; }
  arB() {
    const a = this.ar;
    document.querySelectorAll('[data-mt]').forEach((b) => (b.onclick = () => { a.mat = b.dataset.mt; this.layers(); sfx.select(); this.render(); }));
    document.querySelectorAll('[data-th]').forEach((b) => (b.onclick = () => { a.threat = b.dataset.th; sfx.select(); this.render(); }));
    this.bindSliders(a, [['a-ad', 'ad', (v) => f1(v) + ' kg/m²'], ['a-area', 'area', (v) => f2(v) + ' m²']]);
    $('#a-ad').addEventListener('change', () => this.layers());
    $('#a-fire').onclick = () => this.fireArmour();
  }
  fireArmour() { this.ar.shot = { t: 0, res: armour(this.ar) }; sfx.confirm(); }
  layers() {
    const L = this.W.layers, a = this.ar, r = armour(a); L.clear();
    const n = Math.max(2, Math.min(24, Math.round(r.thick / 1.6))), col = { aramid: '#8a7a3a', uhmwpe: '#d8dde6', ceramic: '#7a7f88' }[a.mat];
    for (let i = 0; i < n; i++) { const strike = a.mat === 'ceramic' && i < n * 0.4; const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.012), new THREE.MeshStandardMaterial({ color: strike ? '#5d636c' : a.mat === 'ceramic' ? '#d8dde6' : col, roughness: 0.6, metalness: strike ? 0.4 : 0.05 })); s.position.z = 0.02 - i * 0.014; L.add(s); }
  }
  armourTick(dt) {
    const S = this.ar.shot, W = this.W; if (!S) { W.proj.visible = false; return; }
    S.t += dt; const z0 = 3.6, zHit = 0.03, k = Math.min(1, S.t / 0.6), z = z0 + (zHit - z0) * k; W.proj.visible = true;
    if (k < 1) { W.proj.position.set(0, 1.45, z); W.flash.material.opacity = 0; }
    else {
      const after = S.t - 0.6;
      if (!S.hit) { S.hit = true; this.ar.last = S.res; sfx.confirm(); this.app.feed.push(S.res.stops ? 'ar.stopped' : 'ar.pen', S.res.stops ? 'ok' : 'warn', { t: S.res.t.id }); if (S.res.stops && S.res.t.id === 'III' && S.res.mass <= 10) this.done('armour'); this.render(); }
      W.flash.material.opacity = Math.max(0, 1 - after * 3); W.flash.scale.setScalar(0.5 + after * 2);
      if (S.res.stops) { W.proj.visible = after < 0.2; W.layers.children.forEach((c, i) => (c.position.x = Math.sin(after * 60 + i) * 0.004 * Math.exp(-after * 6))); }
      else W.proj.position.set(0, 1.45, zHit - after * 6);
      if (after > 1.5) this.ar.shot = null;
    }
  }
  arLive(full) {
    if (!full) return;
    const a = this.ar, r = armour(a), last = a.last;
    const big = $('#ar-big');
    if (big) big.innerHTML = `<div><b class="mono">${f0(r.E)}</b><small>${t('ar.ke')} J</small></div><div><b class="mono">${f1(r.mass)}</b><small>${t('ar.massL')} kg</small></div><div><b class="mono ${r.stops ? 'c-green' : 'c-red'}">${r.need == null ? '✗' : f2(r.margin) + '×'}</b><small>${r.stops ? t('ar.stops') : r.need == null ? t('ar.never') : t('ar.thin')}</small></div>`;
    lineChart($('#cv-ke'), { x0: 0, x1: 4, y0: 0, y1: 4500, xFmt: (x) => THREATS[Math.round(x)]?.id ?? '', xTicks: [0, 1, 2, 3, 4], yFmt: (y) => f0(y), title: t('ar.keChart'), series: [{ pts: THREATS.map((x, i) => [i, 0.5 * (x.g / 1000) * x.v * x.v]), color: AM, label: 'J' }], marks: [{ x: THREATS.findIndex((x) => x.id === a.threat), color: BL }] });
    const m = $('#ar-math');
    if (m) m.innerHTML = `<div>${r.t.round}: m = ${r.t.g} g · v = ${r.t.v} m/s</div>
      <div>E = ½mv² = <b>${f0(r.E)} J</b> · p = mv = <b>${f2(r.p)} N·s</b></div>
      <div>${t('ar.recoil')} Δv = p/M = ${f2(r.p)}/100 = <b>${f2(r.recoil * 100)} cm/s</b> — ${t('ar.myth')}</div>
      <div>${t('ar.need')} <b>${r.need == null ? '—' : f1(r.need) + ' kg/m²'}</b> · t = AD/ρ = ${f1(a.ad)}/${MATERIALS[a.mat].rho} = <b>${f1(r.thick)} mm</b> · ${t('ar.cov')} m = AD·A = <b>${f1(r.mass)} kg</b></div>
      <div class="small">${t('ar.bfd')}</div>${last ? `<div>${t('ar.lastShot')}: <b class="${last.stops ? 'c-green' : 'c-red'}">${last.stops ? t('ar.stopped2') : t('ar.pen2')}</b> (NIJ ${last.t.id})</div>` : ''}`;
    const go = $('#ar-goal'); if (go) go.innerHTML = `${badge(this.goal.armour)} ${t('goal.armour')}`;
  }

  // ═══ GRAPNEL ═══
  gpP() {
    const g = this.gp;
    return `<header class="lv-head mono">${t('gp.title')}</header><p class="intro">${t('gp.intro')}</p>
      ${this.slider('p-d', t('gp.d'), g.d, 2, 10, 0.5, f1(g.d) + ' mm')}${this.slider('p-L', t('gp.L'), g.L, 8, 60, 1, g.L + ' m')}${this.slider('p-th', t('gp.th'), g.theta, 10, 85, 1, g.theta + '°')}
      ${this.slider('p-fall', t('gp.fall'), g.fall, 0, 6, 0.1, f1(g.fall) + ' m')}${this.slider('p-abs', t('gp.abs'), g.absorber, 0, 20000, 250, g.absorber ? f0(g.absorber) + ' N/m' : t('gp.none'))}${this.slider('p-m', t('gl.m'), g.mass, 70, 150, 1, g.mass + ' kg')}
      <button class="btn primary wide" id="p-go">▶ ${t('gp.fire')}</button>`;
  }
  gpS() { return `<header class="lv-head mono">${t('gp.read')}</header><div class="bigstats" id="gp-big"></div><canvas class="cv chart" id="cv-ten"></canvas><div class="math mono" id="gp-math"></div><div class="goal" id="gp-goal"></div>`; }
  gpB() {
    const g = this.gp;
    this.bindSliders(g, [['p-d', 'd', (v) => f1(v) + ' mm'], ['p-L', 'L', (v) => v + ' m'], ['p-th', 'theta', (v) => v + '°'], ['p-fall', 'fall', (v) => f1(v) + ' m'], ['p-abs', 'absorber', (v) => (v ? f0(v) + ' N/m' : t('gp.none'))], ['p-m', 'mass', (v) => v + ' kg']]);
    $('#p-go').onclick = () => this.fire();
    for (const id of ['p-d', 'p-L', 'p-th', 'p-fall', 'p-abs', 'p-m']) $('#' + id).addEventListener('change', () => this.checkGrapnel());
  }
  checkGrapnel() { const r = grapnel(this.gp); if (r.sf >= 5) this.done('grapnel'); }
  resetGrapnel() { const g = this.gp, th = (g.theta * Math.PI) / 180, start = new THREE.Vector3(0, 121, -2.5), anchor = start.clone().add(new THREE.Vector3(0, Math.cos(th) * g.L, -Math.sin(th) * g.L)); g.run = { phase: 'ready', start, anchor, th, om: 0, t: 0, ten: [] }; }
  fire() { this.resetGrapnel(); this.gp.run.phase = 'shot'; this.gp.run.t = 0; sfx.confirm(); this.caption('cap.grapnel'); this.checkGrapnel(); }
  // Pendulum: θ'' = −(g/L)·sin θ − c·θ', tension T = m(g cos θ + Lθ'²).
  grapnelTick(dt) {
    const g = this.gp, R = g.run; if (!R) return;
    if (R.phase === 'shot') { R.t += dt; if (R.t > 0.6) { R.phase = 'swing'; R.t = 0; } }
    else if (R.phase === 'swing') {
      for (let s = 0; s < 8; s++) { const h = dt / 8, a = -(G / g.L) * Math.sin(R.th) - 0.08 * R.om; R.om += a * h; R.th += R.om * h; R.t += h; }
      const T = g.mass * (G * Math.cos(R.th) + g.L * R.om * R.om); R.ten.push([R.t, T]); if (R.ten.length > 600) R.ten.shift();
      if (R.t > 14) R.phase = 'hang';
    }
  }
  gpLive(full) {
    const g = this.gp, r = grapnel(g), R = g.run;
    const big = $('#gp-big');
    if (big) big.innerHTML = `<div><b class="mono">${f0(r.v0)}</b><small>${t('gp.v0')} m/s</small></div><div><b class="mono">${f1(r.peak / 1000)}</b><small>${t('gp.peak')} kN</small></div><div><b class="mono ${r.sf >= 5 ? 'c-green' : r.sf >= 2 ? 'c-amber' : 'c-red'}">${f1(r.sf)}×</b><small>${t('gp.sf')}</small></div>`;
    if (!full) return;
    const ten = R?.ten?.length ? R.ten : [[0, g.mass * G]];
    lineChart($('#cv-ten'), { x0: 0, x1: Math.max(8, ten[ten.length - 1][0]), y0: 0, y1: Math.max(r.Tb, ...ten.map((p) => p[1])) * 1.15, xFmt: (x) => f0(x) + ' s', yFmt: (y) => f1(y / 1000) + 'k', title: t('gp.tenChart'), series: [{ pts: ten, color: AM, label: 'T (N)' }], marks: [{ y: r.Tb, color: 'rgba(61,140,255,.6)', label: 'mg(3−2cosθ₀)' }, { y: g.mass * G, color: 'rgba(232,238,252,.3)', label: 'mg' }] });
    const m = $('#gp-math');
    if (m) m.innerHTML = `<div>${t('gp.launch')}: v = √(2PAL/m) = √(2·3.5 MPa·${f0(Math.PI * 11 * 11)} mm²·0.32 m/0.28 kg) = <b>${f0(r.v0)} m/s</b> · ${t('gp.apex')} v²/2g = <b>${f0(r.apex)} m</b></div>
      <div>${t('gp.line')}: F<sub>break</sub> = σ·A·η = 3.0 GPa·π(${f1(g.d)}/2)²·0.5 = <b>${f1(r.brk / 1000)} kN</b> · k = EA/L = <b>${f0(r.kLine)} N/m</b></div>
      <div>${t('gp.shock')}: F = mg + √((mg)² + 2mg·k<sub>eff</sub>·h) = <b>${f1(r.Fshock / 1000)} kN</b> (${f1(r.gShock)} g ${t('gp.onPilot')})</div>
      <div>${t('gp.swing')}: v<sub>b</sub> = √(2gL(1−cos θ₀)) = <b>${f1(r.vb)} m/s</b> · T<sub>b</sub> = mg(3 − 2cos θ₀) = <b>${f1(r.Tb / 1000)} kN</b></div>
      <div>${t('gp.winch')}: T = m(g + a) = ${f0(r.Tw)} N · P = Tv = <b>${f1(r.Pw / 1000)} kW</b></div>`;
    const go = $('#gp-goal'); if (go) go.innerHTML = `${badge(this.goal.grapnel)} ${t('goal.grapnel')}`;
  }

  // ═══ SONAR ═══
  soP() {
    const s = this.so;
    return `<header class="lv-head mono">${t('so.title')}</header><p class="intro">${t('so.intro')}</p>
      ${this.slider('s-f', t('so.f'), s.f, 15, 120, 1, s.f + ' kHz')}${this.slider('s-T', t('so.T'), s.T, -10, 40, 1, s.T + ' °C')}${this.slider('s-b', t('so.b'), s.budget, 60, 140, 1, s.budget + ' dB')}
      <div class="chips"><button class="btn primary" id="s-ping">◉ ${t('so.ping')}</button><button class="btn seg" id="s-clear">↺ ${t('so.clear')}</button></div>
      <p class="small">${t('so.how')}</p>`;
  }
  soS() { return `<header class="lv-head mono">${t('so.read')}</header><div class="bigstats" id="so-big"></div><canvas class="cv chart" id="cv-loss"></canvas><div class="math mono" id="so-math"></div><div class="goal" id="so-goal"></div>`; }
  soB() {
    const s = this.so;
    this.bindSliders(s, [['s-f', 'f', (v) => v + ' kHz'], ['s-T', 'T', (v) => v + ' °C'], ['s-b', 'budget', (v) => v + ' dB']]);
    $('#s-ping').onclick = () => this.ping();
    $('#s-clear').onclick = () => { s.n = 0; this.W.sonarPts.geometry.setDrawRange(0, 0); this.render(); };
  }
  ping() { const s = sonar(this.so); this.so.ping = { left: 1500, rmax: s.rmax, yaw: this.view.yaw }; sfx.confirm(); this.caption('cap.ping'); }
  // Ray-march pings against the cave (floor height field, dome ellipsoid, stalactites, platform, caches).
  sonarTick() {
    const P = this.so.ping; if (!P) return;
    const pts = this.W.sonarPts, A = pts.geometry.attributes.position.array, C = pts.geometry.attributes.color.array, o = new THREE.Vector3(0, 2.1, 0), d = new THREE.Vector3(), c = new THREE.Color();
    // 60 % of each sweep scans the horizon band (where caches sit), the rest the whole cave.
    for (let k = 0; k < 60 && P.left > 0; k++, P.left--) {
      const az = Math.random() * Math.PI * 2, el = Math.random() < 0.6 ? -0.2 + Math.random() * 0.25 : Math.asin(Math.random() * 1.6 - 0.75); d.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      let hit = null, cache = null;
      for (let s = 0.4; s < P.rmax; s += 0.18) {
        const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
        if (y <= floorY(x, z)) { hit = s; break; }
        const ex = x / 33.8, ey = (y + 2) / 14.3, ez = z / 26; if (ex * ex + ey * ey + ez * ez > 0.93 - 0.08 * (fbm(x * 0.12, y * 0.12, z * 0.12, 3) - 0.5)) { hit = s; break; }
        for (const b of this.W.caches) if (Math.abs(x - b.position.x) < 0.5 && Math.abs(y - b.position.y) < 0.32 && Math.abs(z - b.position.z) < 0.35) { hit = s; cache = b; break; }
        if (hit) break;
        if (s % 0.9 < 0.18) for (const q of this.stalList) { const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz > q.r * q.r * 4) continue; const u = q.up ? (q.y + q.h / 2 - y) / q.h : (y - (q.y - q.h / 2)) / q.h; if (u >= 0 && u <= 1 && Math.hypot(dx, dz) < q.r * (1 - u) * (q.up ? 1 : 1)) { hit = s; break; } }
        if (hit) break;
      }
      if (hit == null || this.so.n >= 9000) continue;
      const i = this.so.n++, hx = o.x + d.x * hit, hy = o.y + d.y * hit, hz = o.z + d.z * hit; A.set([hx, hy, hz], i * 3);
      if (cache) { c.set(AM); if (!this.so.found.has(cache.uuid)) { this.so.found.add(cache.uuid); this.app.feed.push('so.found', 'ok', { n: this.so.found.size }); if (this.so.found.size >= 5) this.done('sonar'); } }
      else c.setHSL(0.55 + 0.17 * (hit / P.rmax), 1, 0.78 - 0.3 * (hit / P.rmax));
      C.set([c.r, c.g, c.b], i * 3);
    }
    pts.geometry.setDrawRange(0, this.so.n); pts.geometry.attributes.position.needsUpdate = true; pts.geometry.attributes.color.needsUpdate = true;
    if (P.left <= 0) this.so.ping = null;
  }
  soLive(full) {
    const s = this.so, r = sonar(s);
    const big = $('#so-big');
    if (big) big.innerHTML = `<div><b class="mono">${f1(r.rmax)}</b><small>${t('so.range')} m</small></div><div><b class="mono">${f1(r.res * 1000)}</b><small>${t('so.res')} mm</small></div><div><b class="mono">${s.found.size}/5</b><small>${t('so.caches')}</small></div>`;
    if (!full) return;
    const pts = []; for (let x = 0.5; x <= 60; x += 0.5) pts.push([x, r.loss(x)]);
    lineChart($('#cv-loss'), { x0: 0, x1: 60, y0: 0, y1: 200, xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y), title: t('so.lossChart'), series: [{ pts, color: BL, label: '40log r + 2αr' }], marks: [{ y: s.budget, color: AM, label: t('so.budget') }, { x: r.rmax, color: OK }] });
    const m = $('#so-math');
    if (m) m.innerHTML = `<div>c = 331.3·√(1 + T/273.15) = <b>${f1(r.c)} m/s</b> · r = ct/2 → t<sub>max</sub> = <b>${f0(r.tmax * 1000)} ms</b></div>
      <div>λ = c/f = <b>${f1(r.lam * 1000)} mm</b> → ${t('so.feat')} λ/2 = <b>${f1(r.res * 1000)} mm</b></div>
      <div>α ≈ 0.03·f = <b>${f2(r.alpha)} dB/m</b> · 40 log₁₀ r + 2αr ≤ ${s.budget} dB → r<sub>max</sub> = <b>${f1(r.rmax)} m</b></div>
      <div>Doppler (10 m/s): f′ = f(c + v)/(c − v) → Δf = <b>${f0(r.shift)} Hz</b></div><div class="small">${t('so.bats')}</div>`;
    const go = $('#so-goal'); if (go) go.innerHTML = `${badge(this.goal.sonar)} ${t('goal.sonar', { n: s.found.size })}`;
  }

  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); this.statusBar(); }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.4, Math.min(1.0, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(1.5, Math.min(14, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === 'v') this.setVision((this.vision + 1) % 3); if (k === ' ' && this.tab === 'sonar') this.ping(); if (k === ' ' && this.tab === 'glide') this.jump(); if (k === ' ' && this.tab === 'grapnel') this.fire(); }

  update(dt, time) {
    this.time = time; const W = this.W, v = this.view, tab = this.tab, suit = this.suit;
    animateWorld(W, dt, time);
    this.asm.u += Math.sign(this.asm.target - this.asm.u) * Math.min(Math.abs(this.asm.target - this.asm.u), dt / (this.asm.target ? 3.5 : 2));
    assemble(suit, this.asm.u); this.perch += (this.perchT - this.perch) * Math.min(1, dt * 2.5);
    // Thermal view: the wearer glows (body heat leaks at the seams), the cave stays cold.
    const hot = this.vision === 2; SM.under.emissive.set(hot ? '#9a9a9a' : '#000000'); SM.shell.emissive.set(hot ? '#3a3a3a' : '#000000');
    let glideAmt = 0, wind = new THREE.Vector3(0.6 * Math.sin(time * 0.7), 0, -0.4);
    if (tab === 'glide') {
      this.glideStep(dt); const R = this.gl.run, flying = R && (R.phase === 'glide' || R.phase === 'chute');
      glideAmt = R?.phase === 'glide' ? 1 : 0;
      suit.position.set(0, R ? R.y + 0.2 : this.gl.h + 1, -2.5 - (R ? R.x : 0));
      const ang = R && flying ? Math.atan2(-R.vy, Math.max(0.1, R.vx)) : 0; suit.rotation.set(R?.phase === 'glide' ? -ang * 0.6 : 0, Math.PI, 0);
      wind = flying ? new THREE.Vector3(0, 6 * glideAmt, 18) : wind;
      W.chuteM.visible = R?.phase === 'chute' || (R?.phase === 'landed' && this.gl.chute); if (W.chuteM.visible) { const inf = Math.min(1, ((R.t - (R.tc ?? R.t)) / 1.5)); W.chuteM.position.set(suit.position.x, suit.position.y + 6, suit.position.z); W.chuteM.scale.set(0.2 + 0.8 * inf * Math.sqrt(this.gl.A / 22), 0.2 + 0.8 * inf, 0.2 + 0.8 * inf * Math.sqrt(this.gl.A / 22)); }
      if (R?.path?.length > 1) W.trail.geometry.setFromPoints(R.path.map(([x, y]) => new THREE.Vector3(0, y + 1, -2.5 - x)));
    } else if (tab === 'grapnel') {
      this.grapnelTick(dt); const R = this.gp.run;
      if (R) {
        let pos = R.start.clone();
        if (R.phase === 'swing' || R.phase === 'hang') { const L = this.gp.L; pos = R.anchor.clone().add(new THREE.Vector3(0, -Math.cos(R.th) * L, Math.sin(R.th) * L)); }
        suit.position.copy(pos).add(new THREE.Vector3(0, -1.9, 0)); suit.rotation.set(R.phase === 'swing' ? -R.th * 0.4 : 0, Math.PI, 0);
        W.rope.visible = R.phase !== 'ready'; const hand = pos.clone().add(new THREE.Vector3(0, 0.2, 0)), tip = R.phase === 'shot' ? hand.clone().lerp(R.anchor, Math.min(1, R.t / 0.6)) : R.anchor;
        W.rope.geometry.setFromPoints([hand, tip]); wind = new THREE.Vector3(0, 0, R.phase === 'swing' ? R.om * this.gp.L * 0.6 : 0);
      }
    } else if (tab === 'armour') this.armourTick(dt);
    if (tab === 'sonar') { this.sonarTick(); this.scene.fog.density = 0.05; } const dark = tab === 'sonar' ? 0.04 : 1; for (const [l, i0] of W.lights) l.intensity = i0 * dark;
    pose(suit, time, { glide: glideAmt, perch: tab === 'suit' ? this.perch : 0, lens: 1 });
    stepCape(suit, dt, { glide: glideAmt, wind, time });
    // Screens.
    this.scrT += dt; if (this.scrT > 0.25 && W.cave.visible) { this.scrT = 0; drawScreens(W, time, ['cowl optics', 'glide polar', 'armour lab', 'grapnel', 'sonar map', 'city grid', 'vitals']); }
    // Camera.
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.1;
    let look = new THREE.Vector3(), r = v.r, yaw = v.yaw, pitch = v.pitch;
    if (tab === 'suit') { look.set(0, 1.2 - this.perch * 0.3, 0); }
    else if (tab === 'armour') { const rg = W.rig; rg.updateMatrixWorld(); look = rg.localToWorld(new THREE.Vector3(0, 1.42, 0.3)); const cp2 = rg.localToWorld(new THREE.Vector3(1.9 + 0.2 * Math.sin(time * 0.3), 1.75, 1.55)); this.cam.position.lerp(cp2, this.snap ? 1 : Math.min(1, dt * 3)); if (this.snap) { this.camLook = look.clone(); this.snap = false; } this.camLook = (this.camLook || look.clone()).lerp(look, Math.min(1, dt * 3)); this.cam.lookAt(this.camLook); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.uiT += dt; if (this.uiT > 0.15) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 3 === 0); } return; }
    else if (tab === 'sonar') { look.set(0, 0, 0); r = 30; pitch = 0.95; }
    else { look.copy(suit.position).add(new THREE.Vector3(0, 1, 0)); r = tab === 'glide' ? 26 : 22; yaw = Math.PI * 0.62 + 0.25 * Math.sin(time * 0.15); pitch = 0.08; }
    const cp = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * r, look.y + Math.sin(pitch) * r, look.z + Math.cos(yaw) * Math.cos(pitch) * r);
    const fast = tab === 'glide' || tab === 'grapnel'; this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * (fast ? 6 : 3))); if (this.snap) { this.camLook = look.clone(); this.snap = false; } this.camLook = (this.camLook || look.clone()).lerp(look, Math.min(1, dt * (fast ? 8 : 3))); this.cam.lookAt(this.camLook);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.15) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 3 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'suit' && full) this.suLive();
    if (this.tab === 'glide') this.glLive(full);
    if (this.tab === 'armour') this.arLive(full);
    if (this.tab === 'grapnel') this.gpLive(full);
    if (this.tab === 'sonar') this.soLive(full);
    if (full) this.statusBar();
  }

  showReport() {
    const rows = ['suit', 'glide', 'armour', 'grapnel', 'sonar'].map((k) => [t('rep.' + k), this.goal[k]]);
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
