import * as THREE from 'three';
import { G0, spin, gAt, MATS, hoop, scaleHeight, wallFor, archElevation, throwRot, apparentG, HULL, suitMass, minDelay, SCENARIO, shieldSim } from './sim/ring.js';
import { buildWorld, RV, STATION_AT, groundY } from './view/world.js';
import { buildRanger, poseRanger, buildWarden } from './view/suit.js';
import { glowSprite } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// RINGFALL · the app. Design a ring world that does not tear itself apart, throw things on a small
// spin station and watch Coriolis bend them, tune a shield to survive an ambush, then hold the ring
// against three waves of Warden drones.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const sci = (x) => { const e = Math.floor(Math.log10(Math.abs(x))); return `${(x / 10 ** e).toFixed(1)}×10<sup>${e}</sup>`; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hms = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return `${h} h ${String(m).padStart(2, '0')} m`; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
const WAVES = [{ n: 3, big: 0 }, { n: 5, big: 0 }, { n: 6, big: 1 }];
const PW = { plasma: { rpm: 300, v: 70, dS: 18, dH: 6, heat: 9 }, rifle: { rpm: 540, dS: 6, dH: 14, heat: 0 } };

export class Ring {
  constructor(app) {
    this.app = app; this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600000); this.scene.add(this.cam);
    this.me = buildRanger(); this.scene.add(this.me);
    this.drones = [...Array(7)].map(() => buildWarden(false)).concat([buildWarden(true)]); this.drones.forEach((d) => { d.visible = false; this.scene.add(d); });
    this.bolts = [...Array(80)].map(() => { const s = glowSprite('#ff4fa0', 0.9, 0); this.scene.add(s); return s; });
    this.tracers = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 6), 3)), new THREE.LineBasicMaterial({ color: '#ffe2a0', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); this.tracers.frustumCulled = false; this.scene.add(this.tracers); this.trs = [];
    // Coriolis visuals live in the spinning frame of the station.
    this.coPath = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffd27a' })); this.W.spinner.add(this.coPath);
    this.coBall = glowSprite('#ffffff', 1.6, 1); this.W.spinner.add(this.coBall);
    this.coTarget = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fe8ff', side: THREE.DoubleSide })); this.W.spinner.add(this.coTarget);
    this.thrower = buildRanger(); this.thrower.rotation.y = Math.PI; this.W.spinner.add(this.thrower);
    this.rg = { Rkm: 5000, g: 1, mat: 'cnt', lam: 0.5 };
    this.co = { R: 200, vUp: 8, vSpin: 0, target: -12, last: null, anim: null };
    this.sh = { C: 10, tau: minDelay(10), r: 2, run: null };
    this.ff = null; this.ffSeed = 7; this.auto = true;
    this.goal = { ring: false, coriolis: false, shield: false, firefight: false };
    this.view = { yaw: 0.4, pitch: 0.25, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'ring'; this.entered = false; this.uiT = 0; this.time = 0;
    this.calcThrow();
    app.stage.use(this.scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['ring', 'coriolis', 'shield', 'firefight'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  setTab(tab) { this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true; this.render(); this.caption('cap.' + tab); }
  render() { const P = { ring: ['rgP', 'rgS', 'rgB'], coriolis: ['coP', 'coS', 'coB'], shield: ['shP', 'shS', 'shB'], firefight: ['ffP', 'ffS', 'ffB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true); }

  // ═══ RING ═══
  rgP() {
    const S = this.rg;
    return `<header class="lv-head mono">${t('rg.title')}</header><p class="intro">${t('rg.intro')}</p>
      ${this.slider('g-R', t('rg.R'), S.Rkm, 1, 20000, 1, f0(S.Rkm) + ' km')}${this.slider('g-g', t('rg.g'), S.g, 0.3, 1.5, 0.05, f2(S.g) + ' g')}${this.slider('g-l', t('rg.lam'), S.lam, 0, 3, 0.1, f1(S.lam))}
      <header class="lv-sub mono">${t('rg.mat')}</header>${this.chips('mat', Object.keys(MATS), S.mat, (k) => t('mat.' + k))}
      <p class="small">${t('rg.note')}</p>`;
  }
  rgS() { return `<header class="lv-head mono">${t('rg.read')}</header><div class="bigstats" id="rg-big"></div><canvas class="cv chart" id="cv-hoop"></canvas><div class="math mono" id="rg-math"></div><div class="goal" id="rg-goal"></div>`; }
  rgB() { const S = this.rg; document.querySelectorAll('[data-mat]').forEach((b) => (b.onclick = () => { S.mat = b.dataset.mat; sfx.select(); this.render(); })); this.bindSliders(S, [['g-R', 'Rkm', (v) => f0(v) + ' km'], ['g-g', 'g', (v) => f2(v) + ' g'], ['g-l', 'lam', (v) => f1(v)]]); }
  rgLive(full) {
    if (!full) return;
    const S = this.rg, R = S.Rkm * 1000, g = S.g * G0, sp = spin(R, g), H = hoop({ R, g, mat: S.mat, lam: S.lam, SF: 1.5 });
    const big = $('#rg-big'); if (big) big.innerHTML = `<div><b class="mono">${f2(sp.v / 1000)} km/s</b><small>${t('rg.rim')}</small></div><div><b class="mono">${hms(sp.T)}</b><small>${t('rg.day')}</small></div><div><b class="mono ${H.sf >= 1.5 ? 'c-green' : H.sf >= 1 ? 'c-amber' : 'c-red'}">${H.sf >= 100 ? f0(H.sf) : f2(H.sf)}</b><small>${t('rg.sf')}</small></div>`;
    const pts = []; for (let lr = 0; lr <= 4.4; lr += 0.05) { const Rk = 10 ** lr; pts.push([lr, Math.log10(g * Rk * 1000 * (1 + S.lam) * 1.5)]); }
    const cols = { steel: '#9aa3b5', kevlar: '#ffd166', zylon: '#ff9a4a', cfrp: '#c9ced6', cnt: '#7fe8ff', exotic: '#c86bff' };
    lineChart($('#cv-hoop'), { x0: 0, x1: 4.4, y0: 4, y1: 10, xFmt: (x) => (10 ** x >= 1000 ? f0(10 ** x / 1000) + 'k' : f0(10 ** x)) + ' km', yFmt: (y) => '10^' + f0(y), title: t('rg.chart'), series: [{ pts, color: '#ffffff', label: t('rg.need') }], marks: [...Object.keys(MATS).filter((k) => k !== 'exotic').map((k) => ({ y: Math.log10(MATS[k].s / MATS[k].rho), color: cols[k], label: t('mat.' + k) })), { x: Math.log10(S.Rkm), color: '#ff8a2a' }] });
    const m = $('#rg-math');
    if (m) m.innerHTML = `<div>ω = √(g/R) = <b>${sci(sp.w)} rad/s</b> · v = √(gR) = <b>${f0(sp.v)} m/s</b> · ${t('rg.day')} 2π/ω = ${hms(sp.T)}</div>
      <div>σ/ρ = gR(1 + λ) = <b>${sci(H.need)} J/kg</b> vs ${t('mat.' + S.mat)} σ<sub>u</sub>/ρ = <b>${sci(H.spec)}</b> → SF ${f2(H.sf)} · R<sub>max</sub>(SF 1.5) = <b>${f0(H.Rmax / 1000)} km</b></div>
      <div>${t('rg.air')} H = RT/Mg = ${f1(scaleHeight(g) / 1000)} km → ${t('rg.wall')} <b>${f0(wallFor(1e-3, g) / 1000)} km</b> (${t('rg.leak')})</div>
      <div>${t('rg.arch')} 1,000 km → ${f1((archElevation(1e6, R) * 180) / Math.PI)}° · ${t('rg.climb')} g(100 km) = ${f2(gAt(R, g, 1e5) / G0)} g</div>`;
    if (S.mat !== 'exotic' && S.Rkm >= 1000 && S.g >= 0.9 && S.g <= 1.1 && H.sf >= 1.5) this.done('ring');
    const gg = $('#rg-goal'); if (gg) gg.innerHTML = `${badge(this.goal.ring)} ${t('goal.ring')}`;
  }

  // ═══ CORIOLIS ═══
  calcThrow() {
    const C = this.co, r = throwRot({ R: C.R, vUp: C.vUp, vSpin: C.vSpin }); C.last = r;
    const R = C.R, at = (s, h) => { const a = s / R; return [0, -(R - h) * Math.cos(a), -(R - h) * Math.sin(a)]; };
    this.coPath.geometry.dispose(); this.coPath.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r.path.map((p) => new THREE.Vector3(...at(p[0], p[1] + 1.6)))), 120, 0.07, 8);
    const a = C.target / R; this.coTarget.position.set(...at(C.target, 0.05)); this.coTarget.rotation.x = -a; this.thrower.position.set(0, -R, 0);
  }
  coP() {
    const C = this.co;
    return `<header class="lv-head mono">${t('co.title')}</header><p class="intro">${t('co.intro')}</p>
      ${this.slider('c-up', t('co.up'), C.vUp, 2, 15, 0.5, f1(C.vUp) + ' m/s')}${this.slider('c-sp', t('co.spin'), C.vSpin, -15, 15, 0.5, f1(C.vSpin) + ' m/s')}
      <button class="btn primary wide" id="c-go">⚾ ${t('co.throw')}</button>
      <p class="small">${t('co.note', { s: f0(C.target) })}</p>`;
  }
  coS() { return `<header class="lv-head mono">${t('co.read')}</header><div class="bigstats" id="co-big"></div><canvas class="cv chart" id="cv-arc"></canvas><div class="math mono" id="co-math"></div><div class="goal" id="co-goal"></div>`; }
  coB() { this.bindSliders(this.co, [['c-up', 'vUp', (v) => f1(v) + ' m/s'], ['c-sp', 'vSpin', (v) => f1(v) + ' m/s']], () => this.calcThrow()); $('#c-go').onclick = () => this.throwBall(); }
  solveThrow() { const C = this.co; let best = null; for (let vs = -15; vs <= 15; vs += 0.5) { const r = throwRot({ R: C.R, vUp: C.vUp, vSpin: vs }), m = Math.abs(r.land - C.target); if (!best || m < best[0]) best = [m, vs]; } C.vSpin = best[1]; this.calcThrow(); }
  throwBall() { this.calcThrow(); this.co.anim = { t: 0 }; sfx.select(); }
  coLive(full) {
    if (!full) return;
    const C = this.co, r = C.last, miss = r.land - C.target;
    const big = $('#co-big'); if (big) big.innerHTML = `<div><b class="mono">${f2(r.land)} m</b><small>${t('co.land')}</small></div><div><b class="mono">${f2(r.flat)} m</b><small>${t('co.flat')}</small></div><div><b class="mono ${Math.abs(miss) <= 1 ? 'c-green' : 'c-red'}">${f2(miss)} m</b><small>${t('co.miss')}</small></div>`;
    const flat = []; for (let i = 0; i <= 60; i++) { const tt = (r.flatT * i) / 60; flat.push([C.vSpin * tt, C.vUp * tt - 0.5 * G0 * tt * tt]); }
    const xs = [...r.path.map((p) => p[0]), ...flat.map((p) => p[0]), C.target], x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2;
    lineChart($('#cv-arc'), { x0, x1, y0: 0, y1: Math.max(4, Math.ceil(Math.max(r.peak, C.vUp ** 2 / (2 * G0)) + 1)), xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y), title: t('co.chart'), series: [{ pts: r.path.map((p) => [p[0], p[1]]), color: '#ffd27a', label: t('co.rot') }, { pts: flat, color: 'rgba(232,238,252,.5)', dash: [4, 3], label: t('co.flatL') }], marks: [{ x: C.target, color: '#7fe8ff', label: t('co.target') }] });
    const m = $('#co-math'), sp = spin(C.R);
    if (m) m.innerHTML = `<div>R = ${C.R} m · ω = √(g/R) = <b>${f2(sp.w)} rad/s</b> (${f1(sp.rpm)} rpm) · ${t('co.floor')} ωR = <b>${f1(sp.v)} m/s</b></div>
      <div>${t('co.inertial')} u = (v<sub>s</sub> + ωR, v<sub>up</sub>) · t* = 2R·u<sub>y</sub>/|u|² = <b>${f2(r.tHit)} s</b> (${t('co.flatT')} ${f2(r.flatT)} s)</div>
      <div>${t('co.weight')} ${t('co.spinward')} 7 m/s: <b>${f2(apparentG(C.R, G0, 7) / G0)} g</b> · ${t('co.anti')}: <b>${f2(apparentG(C.R, G0, -7) / G0)} g</b> · ${t('co.bigRing')} ${f2(throwRot({ R: 5e6, vUp: C.vUp, vSpin: C.vSpin }).land - C.vSpin * r.flatT)} m</div>`;
    const gg = $('#co-goal'); if (gg) gg.innerHTML = `${badge(this.goal.coriolis)} ${t('goal.coriolis', { s: f0(C.target) })}`;
  }

  // ═══ SHIELD ═══
  shP() {
    const S = this.sh, tm = minDelay(S.C);
    return `<header class="lv-head mono">${t('sh.title')}</header><p class="intro">${t('sh.intro')}</p>
      ${this.slider('s-C', t('sh.C'), S.C, 2, 40, 1, S.C + ' kJ')}${this.slider('s-tau', t('sh.tau'), Math.max(S.tau, tm), tm.toFixed(2), 8, 0.05, f2(Math.max(S.tau, tm)) + ' s')}${this.slider('s-r', t('sh.r'), S.r, 0.5, 12, 0.5, f1(S.r) + ' kW')}
      <button class="btn primary wide" id="s-go">▶ ${t('sh.run')}</button><p class="small">${t('sh.note')}</p>`;
  }
  shS() { return `<header class="lv-head mono">${t('sh.read')}</header><div class="bigstats" id="sh-big"></div><canvas class="cv chart" id="cv-sh"></canvas><div class="math mono" id="sh-math"></div><div class="goal" id="sh-goal"></div>`; }
  shB() { const S = this.sh; this.bindSliders(S, [['s-C', 'C', (v) => v + ' kJ'], ['s-tau', 'tau', (v) => f2(v) + ' s'], ['s-r', 'r', (v) => f1(v) + ' kW']], () => { if (S.tau < minDelay(S.C)) { S.tau = minDelay(S.C); } }); $('#s-C').addEventListener('change', () => this.render()); $('#s-go').onclick = () => this.runShield(); }
  shRes() { const S = this.sh; S.tau = Math.max(S.tau, minDelay(S.C)); return shieldSim({ C: S.C, tau: S.tau, r: S.r }); }
  runShield() { this.sh.run = { t: 0, k: 0 }; sfx.select(); this.caption('cap.ambush'); }
  shLive(full) {
    if (!full) return;
    const S = this.sh, R = this.shRes(), m = suitMass(S.C, S.r);
    const big = $('#sh-big'); if (big) big.innerHTML = `<div><b class="mono ${m <= 200 ? 'c-green' : 'c-red'}">${f0(m)} kg</b><small>${t('sh.mass')}</small></div><div><b class="mono ${R.survived ? 'c-green' : 'c-red'}">${R.survived ? f1(R.minH) + ' kJ' : t('sh.dead')}</b><small>${t('sh.hull')}</small></div><div><b class="mono">${f0((R.absorbed / R.total) * 100)}%</b><small>${t('sh.abs')}</small></div>`;
    lineChart($('#cv-sh'), { x0: 0, x1: 30, y0: 0, y1: Math.max(14, S.C + 2), xFmt: (x) => x + ' s', yFmt: (y) => f0(y), title: t('sh.chart'), series: [{ pts: R.sS, color: '#ffcf6a', label: t('sh.shield'), fill: 'rgba(255,207,106,.1)' }, { pts: R.sH, color: '#ff5a6a', label: t('sh.hullL') }], marks: SCENARIO.filter((e, i) => i % 2 === 0).map((e) => ({ x: e[0], color: 'rgba(255,255,255,.12)' })).concat(this.sh.run ? [{ x: this.sh.run.t, color: '#fff' }] : []) });
    const mm = $('#sh-math');
    if (mm) mm.innerHTML = `<div>${t('sh.m1')} m = 160 + 1.4·C + 4·r = <b>${f0(m)} kg</b> · τ ≥ 0.6 + 0.09·C = ${f2(minDelay(S.C))} s</div>
      <div>${t('sh.m2', { d: f1(R.total), h: HULL })}</div><div>${t('sh.m3')}</div>`;
    if (R.survived && m <= 200) this.done('shield');
    const gg = $('#sh-goal'); if (gg) gg.innerHTML = `${badge(this.goal.shield)} ${t('goal.shield')}`;
  }

  // ═══ FIREFIGHT ═══
  ffP() {
    const F = this.ff;
    return `<header class="lv-head mono">${t('ff.title')}</header><p class="intro">${t('ff.intro')}</p>
      <div class="chips"><button class="btn primary" id="f-go">▶ ${F ? t('ff.again') : t('ff.start')}</button><button class="btn seg ${this.auto ? 'active' : ''}" id="f-auto">${t('ff.auto')}</button></div>
      <p class="small">${t('ff.keys')}</p><div class="status mono" id="f-status"></div>`;
  }
  ffS() { return `<header class="lv-head mono">${t('ff.read')}</header><div class="bigstats" id="ff-big"></div><div class="bars" id="ff-bars"></div><div class="math mono" id="ff-math"></div><div class="goal" id="ff-goal"></div>`; }
  ffB() { $('#f-go').onclick = () => this.startFight(); $('#f-auto').onclick = () => { this.auto = !this.auto; sfx.select(); this.render(); }; }
  startFight(seed) {
    this.ffSeed = seed ?? this.ffSeed + 1;
    this.ff = { t: 0, R: rng(this.ffSeed), wave: -1, next: 1.5, P: { x: 0, z: 12, yaw: Math.PI, sh: 100, hp: 100, last: -9, wpn: 'plasma', heat: 0, lock: 0, acc: 0, kills: 0, alive: true, spd: 0, dir: 1, dirT: 0, firing: false }, E: [], B: [], over: false, win: false };
    this.drones.forEach((d) => (d.visible = false)); sfx.confirm(); this.caption('cap.fight'); this.render();
  }
  spawnWave(i) {
    const F = this.ff, Wv = WAVES[i]; F.wave = i; F.E = [];
    for (let k = 0; k < Wv.n + Wv.big; k++) { const big = k >= Wv.n, a = F.R() * Math.PI * 2, r = 70 + F.R() * 25; F.E.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 8 + F.R() * 8, sh: big ? 160 : 40, hp: big ? 220 : 60, big, cd: 1.5 + F.R() * 2, orb: F.R() < 0.5 ? 1 : -1, alive: true, mesh: big ? this.drones[7] : this.drones[k], flash: 0 }); }
    F.E.forEach((e) => (e.mesh.visible = true)); this.app.feed.push('ff.incoming', 'warn', { n: i + 1, k: F.E.length });
  }
  fightTick(dt) {
    const F = this.ff; if (!F || F.over) return; F.t += dt; const P = F.P;
    if (F.E.every((e) => !e.alive)) { if (F.wave === WAVES.length - 1) { F.over = true; F.win = true; this.done('firefight'); this.caption('cap.win'); this.app.feed.push('ff.won', 'ok'); this.render(); return; } F.next -= dt; if (F.next <= 0) { if (F.wave >= 0) P.hp = Math.min(100, P.hp + 30); this.spawnWave(F.wave + 1); F.next = 3; } }
    // Player movement.
    let mx = 0, mz = 0, spd = 0;
    const tgt = this.pickTarget();
    if (this.auto) {
      P.dirT -= dt; if (P.dirT <= 0) { P.dir = F.R() < 0.5 ? 1 : -1; P.dirT = 2.5 + F.R() * 3; }
      const a = Math.atan2(P.z, P.x) + P.dir * 0.5, r = Math.hypot(P.x, P.z), want = 26; mx = Math.cos(a) * want - P.x + (r > 45 ? -P.x * 0.5 : 0); mz = Math.sin(a) * want - P.z + (r > 45 ? -P.z * 0.5 : 0); spd = 5.2;
      if (tgt) P.yaw = Math.atan2(tgt.x - P.x, tgt.z - P.z);
      P.wpn = tgt && tgt.sh > 0 && P.lock <= 0 ? 'plasma' : 'rifle'; P.firing = !!tgt;
    } else {
      const f = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0), s = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0), yw = this.view.yaw;
      mx = Math.sin(yw) * f - Math.cos(yw) * s; mz = Math.cos(yw) * f + Math.sin(yw) * s; spd = f || s ? (this.keys.has('shift') ? 7 : 4.5) : 0; P.yaw = yw; P.firing = this.keys.has('fire');
    }
    const L = Math.hypot(mx, mz); if (L > 0.01 && spd) { P.vx = (mx / L) * spd; P.vz = (mz / L) * spd; P.x += P.vx * dt; P.z += P.vz * dt; P.spd = spd; } else { P.spd = 0; P.vx = P.vz = 0; }
    const rr = Math.hypot(P.x, P.z); if (rr > 58) { P.x *= 58 / rr; P.z *= 58 / rr; }
    // Shields recharge 3 s after the last hit; plasma heat bleeds off.
    if (F.t - P.last > 3) P.sh = Math.min(100, P.sh + 45 * dt);
    P.heat = Math.max(0, P.heat - 28 * dt); if (P.lock > 0) P.lock -= dt;
    // Player fire.
    const W = PW[P.wpn]; P.acc += P.firing && tgt && !(P.wpn === 'plasma' && P.lock > 0) ? (W.rpm / 60) * dt : 0;
    while (P.acc >= 1) {
      P.acc -= 1; const d = Math.hypot(tgt.x - P.x, tgt.y - 1.5, tgt.z - P.z);
      if (P.wpn === 'plasma') { P.heat += W.heat; if (P.heat >= 100) { P.lock = 2.2; P.heat = 100; if (this.auto) P.wpn = 'rifle'; } const lead = d / W.v, ax = tgt.x + (tgt.vx || 0) * lead, az = tgt.z + (tgt.vz || 0) * lead, ay = tgt.y, dd = Math.hypot(ax - P.x, ay - 1.5, az - P.z); F.B.push({ x: P.x, y: 1.5, z: P.z, vx: ((ax - P.x) / dd) * W.v, vy: ((ay - 1.5) / dd) * W.v, vz: ((az - P.z) / dd) * W.v, mine: true, life: 2.5 }); }
      else { const hit = F.R() < 0.85 * Math.exp(-d / 70) * (P.spd > 0.5 ? 0.85 : 1); this.trs.push({ a: V(P.x, 1.5, P.z), b: V(tgt.x + (hit ? 0 : (F.R() - 0.5) * 3), tgt.y + (hit ? 0 : (F.R() - 0.5) * 3), tgt.z), t: 0.06 }); if (hit) this.damageE(tgt, W.dS, W.dH); }
      this.me.userData.muzzle.material.opacity = 1;
    }
    // Drones.
    for (const e of F.E) {
      if (!e.alive) continue; const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1, want = e.big ? 40 : 28;
      const rad = (d - want) * 0.6, tang = e.orb * (e.big ? 3 : 6);
      e.vx = (dx / d) * rad - (dz / d) * tang; e.vz = (dz / d) * rad + (dx / d) * tang; e.x += e.vx * dt; e.z += e.vz * dt; e.y = (e.big ? 14 : 9) + Math.sin(F.t * 1.3 + e.orb * 3) * 1.5;
      e.cd -= dt; if (e.cd <= 0 && d < 70) { e.cd = (e.big ? 0.7 : 1.3) + F.R() * 0.7; const vb = e.big ? 32 : 26, d0 = Math.hypot(P.x - e.x, 1.2 - e.y, P.z - e.z), lead = (d0 / vb) * (0.4 + 0.5 * F.R()), tx = P.x + (P.vx || 0) * lead, ty = 1.2, tz = P.z + (P.vz || 0) * lead, dd = Math.hypot(tx - e.x, ty - e.y, tz - e.z); F.B.push({ x: e.x, y: e.y, z: e.z, vx: ((tx - e.x) / dd) * vb, vy: ((ty - e.y) / dd) * vb, vz: ((tz - e.z) / dd) * vb, mine: false, life: 4, dmg: e.big ? 22 : 12 }); }
      e.flash = Math.max(0, e.flash - dt * 3);
    }
    // Bolts.
    for (const b of F.B) {
      if (b.life <= 0) continue; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.mine) { for (const e of F.E) if (e.alive && Math.hypot(e.x - b.x, e.y - b.y, e.z - b.z) < (e.big ? 3.2 : 1.8)) { this.damageE(e, PW.plasma.dS, PW.plasma.dH); b.life = 0; break; } }
      else if (Math.hypot(P.x - b.x, 1.2 - b.y, P.z - b.z) < 0.9) { b.life = 0; this.damageP(b.dmg); }
      if (b.y < 0) b.life = 0;
    }
    F.B = F.B.filter((b) => b.life > 0);
  }
  pickTarget() {
    const F = this.ff, P = F.P; let best = null, bd = 1e9;
    for (const e of F.E) { if (!e.alive) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (!this.auto) { const ang = Math.abs(((Math.atan2(e.x - P.x, e.z - P.z) - this.view.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (ang > 0.35) continue; } if (d < bd) { bd = d; best = e; } }
    return best;
  }
  damageE(e, dS, dH) { if (e.sh > 0) { e.sh -= dS; e.flash = 1; if (e.sh <= 0) { e.sh = 0; sfx.select(); } } else { e.hp -= dH; if (e.hp <= 0) { e.alive = false; e.mesh.visible = false; this.ff.P.kills++; this.boom = { at: V(e.x, e.y, e.z), t: 0 }; } } }
  damageP(d) { const P = this.ff.P; P.last = this.ff.t; const a = Math.min(P.sh, d); P.sh -= a; P.hp -= d - a; this.me.userData.shell.material.uniforms.uOpacity.value = 0.55; if (P.hp <= 0 && P.alive) { P.alive = false; this.ff.over = true; this.caption('cap.down'); this.app.feed.push('ff.down', 'warn', { w: this.ff.wave + 1 }); this.render(); } }
  ffLive(full) {
    const F = this.ff, st = $('#f-status');
    if (st) st.textContent = !F ? t('ff.ready') : F.over ? (F.win ? t('ff.victory') : t('ff.lost', { w: F.wave + 1 })) : t('ff.status', { w: Math.max(1, F.wave + 1), n: F.E.filter((e) => e.alive).length });
    if (F) { const P = F.P;
      const big = $('#ff-big'); if (big) big.innerHTML = `<div><b class="mono">${Math.max(1, F.wave + 1)}/3</b><small>${t('ff.wave')}</small></div><div><b class="mono">${P.kills}</b><small>${t('ff.kills')}</small></div><div><b class="mono">${t('w.' + P.wpn)}</b><small>${t('ff.weapon')}</small></div>`;
      const bars = $('#ff-bars'); if (bars) bars.innerHTML = `<div class="bar sh"><i style="width:${Math.max(0, P.sh)}%"></i><span>${t('ff.shield')} ${f0(P.sh)}</span></div><div class="bar hp"><i style="width:${Math.max(0, P.hp)}%"></i><span>${t('ff.hull')} ${f0(Math.max(0, P.hp))}</span></div><div class="bar heat"><i style="width:${P.heat}%"></i><span>${t('ff.heat')} ${f0(P.heat)}${P.lock > 0 ? ' · ' + t('ff.over') : ''}</span></div>`; }
    if (!full) return;
    const m = $('#ff-math'); if (m) m.innerHTML = `<div>${t('ff.m1')}</div><div>${t('w.plasma')}: ${PW.plasma.dS}/${PW.plasma.dH} · ${PW.plasma.rpm} rpm · ${PW.plasma.v} m/s · ${t('ff.heatL')} ${PW.plasma.heat}/${t('ff.shot')}</div><div>${t('w.rifle')}: ${PW.rifle.dS}/${PW.rifle.dH} · ${PW.rifle.rpm} rpm · p(hit) = 0.85·e<sup>−d/70</sup></div><div>${t('ff.m2')}</div>`;
    const g = $('#ff-goal'); if (g) g.innerHTML = `${badge(this.goal.firefight)} ${t('goal.firefight')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-0.4, Math.min(1.3, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.4, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) {
    if (this.tab === 'firefight') { if (k === ' ' || k === 'f') this.keys.add('fire'); if (['w', 'a', 's', 'd', 'shift'].includes(k)) this.keys.add(k); if (k === 'q' && this.ff) this.ff.P.wpn = this.ff.P.wpn === 'plasma' ? 'rifle' : 'plasma'; }
    if (this.tab === 'coriolis' && k === ' ') this.throwBall();
    if (this.tab === 'shield' && k === ' ') this.runShield();
  }
  keyUp(k) { if (k === ' ' || k === 'f') this.keys.delete('fire'); this.keys.delete(k); }

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, W = this.W, space = tab === 'ring' || tab === 'coriolis';
    W.skyMat.uniforms.uAir.value = space ? 0 : 1; W.sky.position.copy(this.cam.position);
    W.pivot.rotation.x = tab === 'ring' ? W.pivot.rotation.x + dt * 0.02 : 0;
    const co = spin(this.co.R); W.spinner.rotation.x += co.w * dt;
    this.coPath.visible = this.coBall.visible = this.coTarget.visible = this.thrower.visible = tab === 'coriolis';
    const ground = tab === 'shield' || tab === 'firefight'; this.me.visible = ground;
    if (tab !== 'firefight') this.drones.forEach((d) => (d.visible = false));
    const shell = this.me.userData.shell.material.uniforms.uOpacity; shell.value = Math.max(0, shell.value - dt * 2.5);
    const mz = this.me.userData.muzzle.material; mz.opacity = Math.max(0, mz.opacity - dt * 12);
    if (!v.drag && performance.now() - v.last > 4000 && tab !== 'firefight') v.yaw += dt * 0.06;
    let cp, look, focus = V(0, 0, 0), upV = V(0, 1, 0), snapCam = false;
    if (tab === 'ring') { const c = V(0, RV, 0), R = RV * 3.4 * v.r; look = c; cp = c.clone().add(V(R * 0.92, R * (0.18 + 0.1 * Math.sin(v.yaw * 0.3)), R * (0.3 + 0.25 * Math.sin(v.yaw * 0.4)))); }
    else if (tab === 'coriolis') {
      const C = this.co, r = C.last; if (C.anim) { C.anim.t += dt; const k = Math.min(1, C.anim.t / Math.max(0.3, r.tHit)), p = r.path[Math.round(k * (r.path.length - 1))], a = p[0] / C.R; this.coBall.position.set(0, -(C.R - p[1] - 1.6) * Math.cos(a), -(C.R - p[1] - 1.6) * Math.sin(a)); if (k >= 1) { C.anim = null; const miss = r.land - C.target; this.app.feed.push(Math.abs(miss) <= 1 ? 'co.hit' : 'co.missed', Math.abs(miss) <= 1 ? 'ok' : 'warn', { m: f2(miss) }); if (Math.abs(miss) <= 1) this.done('coriolis'); } } else this.coBall.position.set(0, -C.R + 1.6, 0);
      // A camera riding with the station: just outside the rim, looking at the thrower's patch of floor.
      W.spinner.updateMatrixWorld(); const R0 = C.R + 12, side = Math.sin(v.yaw) * 30 * v.r;
      cp = W.spinner.localToWorld(V(9 * v.r + side * 0.15, -C.R + 7 * v.r, 12 * v.r)); look = W.spinner.localToWorld(V(0, -C.R + 2.5, -5)); upV = W.spinner.localToWorld(V(0, 0, 0)).sub(W.spinner.localToWorld(V(0, -1, 0))).normalize(); snapCam = true;
    }
    else if (tab === 'shield') {
      const S = this.sh; this.me.position.set(0, groundY(0, 8) + 0.6, 8); this.me.rotation.y = Math.PI * 0.85; poseRanger(this.me, 'aim', time, 0);
      if (S.run) { S.run.t += dt * 3; while (S.run.k < SCENARIO.length && SCENARIO[S.run.k][0] <= S.run.t) { const a = V(-30 + Math.random() * 10, 6 + Math.random() * 4, -30 + Math.random() * 10); this.trs.push({ a, b: V(0, 1.6 + Math.random() * 0.5, 8), t: 0.1 }); shell.value = 0.55; S.run.k++; } if (S.run.t >= 30) { S.run = null; const R = this.shRes(); this.app.feed.push(R.survived ? 'sh.survived' : 'sh.killed', R.survived ? 'ok' : 'warn', { h: f1(R.minH), m: f0(suitMass(S.C, S.r)) }); this.refresh(true); } }
      focus = V(0, 1, 8); look = V(0, 1.5, 8); cp = look.clone().add(V(Math.sin(v.yaw) * 4.2 * v.r, 0.6 + v.pitch, Math.cos(v.yaw) * 4.2 * v.r));
    } else {
      const F = this.ff;
      if (F) { this.fightTick(Math.min(dt, 0.05)); const P = F.P; this.me.position.set(P.x, groundY(P.x, P.z) + 0.6, P.z); this.me.rotation.y = P.yaw; poseRanger(this.me, !P.alive ? 'down' : P.firing ? 'aim' : P.spd ? 'run' : 'stand', time, P.spd);
        for (const e of F.E) { if (!e.alive) continue; const o = e.mesh; o.position.set(e.x, groundY(e.x, e.z) + e.y, e.z); o.lookAt(this.me.position.x, this.me.position.y + 1.4, this.me.position.z); o.userData.vanes.rotation.y += dt * 9; o.userData.bubble.visible = e.sh > 0; o.userData.bubble.material.uniforms.uOpacity.value = 0.18 + e.flash * 0.8; }
        this.bolts.forEach((s, i) => { const b = F.B[i]; if (!b) { s.material.opacity = 0; return; } s.position.set(b.x, groundY(b.x, b.z) + b.y, b.z); s.material.color.set(b.mine ? '#7fe8ff' : '#ff4fa0'); s.material.opacity = 1; s.scale.setScalar(b.mine ? 0.8 : 1.1); });
        if (this.auto && !v.drag && performance.now() - v.last > 2500) v.yaw += (((P.yaw - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3);
        const yw = v.yaw, base = this.me.position; focus = base.clone(); cp = base.clone().add(V(-Math.sin(yw) * 6 + Math.cos(yw) * 1.0, 2.6 + v.pitch * 2, -Math.cos(yw) * 6 - Math.sin(yw) * 1.0)); look = base.clone().add(V(Math.sin(yw) * 25, 4, Math.cos(yw) * 25));
      } else { this.me.position.set(0, groundY(0, 0) + 0.6, 0); poseRanger(this.me, 'stand', time, 0); focus = V(0, 0, 0); look = V(0, 6, -60); cp = V(Math.sin(v.yaw) * 30, 12, Math.cos(v.yaw) * 30 + 10); this.bolts.forEach((s) => (s.material.opacity = 0)); }
    }
    // Tracers.
    const tp = this.tracers.geometry.attributes.position; this.trs = this.trs.filter((q) => (q.t -= dt) > 0).slice(-64);
    for (let i = 0; i < 64; i++) { const q = this.trs[i]; if (q) { tp.setXYZ(i * 2, q.a.x, (tab === 'firefight' ? groundY(q.a.x, q.a.z) : 0) + q.a.y, q.a.z); tp.setXYZ(i * 2 + 1, q.b.x, (tab === 'firefight' ? groundY(q.b.x, q.b.z) : groundY(0, 8)) + q.b.y, q.b.z); } else { tp.setXYZ(i * 2, 0, -1e5, 0); tp.setXYZ(i * 2 + 1, 0, -1e5, 0); } }
    tp.needsUpdate = true;
    this.cam.up.copy(upV); this.cam.position.lerp(cp, this.snap || snapCam ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || snapCam || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook);
    W.sun.position.copy(focus).addScaledVector(V(-0.45, 0.62, -0.64).normalize(), 2000); W.sun.target.position.copy(focus); W.sun.target.updateMatrixWorld();
    this.cam.fov = tab === 'ring' ? 40 : 55; this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    $('#xhair')?.classList.toggle('on', tab === 'firefight' && !!this.ff && !this.auto && this.ff.P.alive);
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 5 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'ring') this.rgLive(full);
    if (this.tab === 'coriolis') this.coLive(full);
    if (this.tab === 'shield') this.shLive(full);
    if (this.tab === 'firefight') this.ffLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const rows = ['ring', 'coriolis', 'shield', 'firefight'].map((k) => [t('rep.' + k), this.goal[k]]);
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
