import * as THREE from 'three';
import { G, AETHER, reactor, aetherRun, CARDS, newDuel, play, score, minimax, treeSize, GASES, rhoAir, airship, ballK, pass, pressureAtm, PARTY, WYRM, SPELLS, damage, turnsPerMin, LV, ATB_RATE } from './sim/rift.js';
import { buildWorlds, LOOK, buildHero, poseHero, buildWyrm, poseWyrm } from './view/worlds.js';
import { glowSprite } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// CRYSTAL RIFT · the app. A rift has opened between four worlds. In each, a hero meets the science of
// their home: a reactor that could drain a planet, a card duel solved by game trees, an airship that
// must clear a mountain, and a sport played inside a floating ball of water. Then all four meet the
// Wyrm in the Rift.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['ferrum', 'academy', 'mist', 'isles', 'rift'];
const rankStr = (n) => (n === 10 ? 'A' : String(n));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }

export class Rift {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.fog = new THREE.FogExp2('#000', 0.01); scene.background = new THREE.Color('#000'); scene.environmentIntensity = 0.5;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000); scene.add(this.cam);
    this.sun = new THREE.DirectionalLight('#fff', 2); this.sun.position.set(40, 80, 30); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); Object.assign(this.sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 300 }); scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight('#fff', '#333', 0.6); scene.add(this.hemi);
    this.W = buildWorlds(scene);
    this.heroes = Object.fromEntries(['vey', 'lio', 'pip', 'mara'].map((id) => { const h = buildHero(id); scene.add(h); return [id, h]; }));
    this.wyrm = buildWyrm(); this.W.rift.add(this.wyrm); this.wyrm.position.set(0, 0, -8);
    this.fx = [...Array(10)].map(() => { const s = glowSprite('#fff', 1.4, 0); scene.add(s); return s; });
    this.fe = { Th: 600, f: 0.6, save: 0, demand: 800 };
    this.ac = { D: null, sel: null, result: null, aiWait: 0, seed: 2 };
    this.ms = { V: 30000, gas: 'helium', P: 600, cargo: 20000 };
    this.is = { v0: 10, ang: 0, x: -6, y: 0, goals: 0, shot: null, anim: null };
    this.rf = null; this.rfSeed = 3; this.auto = true;
    this.goal = { ferrum: false, academy: false, mist: false, isles: false, rift: false };
    this.view = { yaw: 0.3, pitch: 0.3, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'ferrum'; this.entered = false; this.uiT = 0; this.time = 0;
    app.stage.use(scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true;
    for (const [k, g] of Object.entries(this.W)) g.visible = k === tab;
    const L = LOOK[tab]; this.scene.background.set(L.bg); this.scene.fog.color.set(L.fog[0]); this.scene.fog.density = L.fog[1]; this.sun.color.set(L.sun[0]); this.sun.intensity = L.sun[1]; this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    if (tab === 'academy' && !this.ac.D) this.newDuel();
    $('#duel')?.classList.toggle('on', tab === 'academy');
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { ferrum: ['feP', 'feS', 'feB'], academy: ['acP', 'acS', 'acB'], mist: ['msP', 'msS', 'msB'], isles: ['isP', 'isS', 'isB'], rift: ['rfP', 'rfS', 'rfB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); if (this.tab === 'academy') this.drawDuel(); this.refresh(true); }

  // ═══ FERRUM ═══
  feP() {
    const F = this.fe;
    return `<header class="lv-head mono">${t('fe.title')}</header><p class="intro">${t('fe.intro')}</p>
      ${this.slider('f-th', t('fe.th'), F.Th, 400, 1100, 10, F.Th + ' K')}${this.slider('f-f', t('fe.f'), F.f, 0.4, 0.75, 0.01, f0(F.f * 100) + ' %')}${this.slider('f-s', t('fe.save'), F.save, 0, 0.3, 0.01, f0(F.save * 100) + ' %')}
      <p class="small">${t('fe.note')}</p>`;
  }
  feS() { return `<header class="lv-head mono">${t('fe.read')}</header><div class="bigstats" id="fe-big"></div><canvas class="cv chart" id="cv-aether"></canvas><div class="math mono" id="fe-math"></div><div class="goal" id="fe-goal"></div>`; }
  feB() { this.bindSliders(this.fe, [['f-th', 'Th', (v) => v + ' K'], ['f-f', 'f', (v) => f0(v * 100) + ' %'], ['f-s', 'save', (v) => f0(v * 100) + ' %']]); }
  feLive(full) {
    if (!full) return;
    const F = this.fe, R = reactor(F), run = aetherRun(R.h);
    const big = $('#fe-big'); if (big) big.innerHTML = `<div><b class="mono">${f1(R.eta * 100)}%</b><small>${t('fe.eff')} (Carnot ${f0(R.etaC * 100)}%)</small></div><div><b class="mono ${R.ok ? 'c-green' : 'c-red'}">${f0(R.Q)} MW</b><small>${t('fe.heat')} · MSY ${f0(R.msyMW)}</small></div><div><b class="mono ${run.collapse ? 'c-red' : 'c-green'}">${run.collapse ? t('fe.dead') : f0((run.end / AETHER.K) * 100) + '%'}</b><small>${t('fe.pool80')}</small></div>`;
    const msyRun = aetherRun(R.msy * 0.999);
    lineChart($('#cv-aether'), { x0: 0, x1: 80, y0: 0, y1: AETHER.K, xFmt: (x) => x + ' y', yFmt: (y) => f0(y), title: t('fe.chart'), series: [{ pts: run.pts, color: run.collapse ? '#ff5a6a' : '#59ffa8', label: t('fe.pool') }, { pts: msyRun.pts, color: 'rgba(255,255,255,.35)', dash: [4, 3], label: 'MSY' }], marks: [{ y: AETHER.K / 2, color: 'rgba(255,209,102,.6)', label: 'K/2' }] });
    const m = $('#fe-math');
    if (m) m.innerHTML = `<div>η<sub>C</sub> = 1 − T<sub>c</sub>/T<sub>h</sub> = 1 − 300/${F.Th} = <b>${f2(R.etaC)}</b> · η = f·η<sub>C</sub> = <b>${f2(R.eta)}</b></div>
      <div>Q = P<sub>e</sub>/η = ${f0(R.Pe)}/${f2(R.eta)} = <b>${f0(R.Q)} MW</b> · ${t('fe.waste')} ${f0(R.waste)} MW · h = <b>${f1(R.h)} PJ/yr</b></div>
      <div>dA/dt = rA(1 − A/K) − h · r = ${AETHER.r}/yr, K = ${AETHER.K} PJ → MSY = rK/4 = <b>${f0(R.msy)} PJ/yr</b> · ${t('fe.eq')} ${run.eq ? f0(run.eq) + ' PJ' : t('fe.none')}</div>`;
    this.W.ferrum.userData.light.intensity = run.collapse ? 120 : 800; this.W.ferrum.userData.wellGlow.material.opacity = run.collapse ? 0.08 : 0.35;
    if (R.ok && !run.collapse) this.done('ferrum');
    const g = $('#fe-goal'); if (g) g.innerHTML = `${badge(this.goal.ferrum)} ${t('goal.ferrum')}`;
  }

  // ═══ ACADEMY: Rift Cards ═══
  newDuel() { this.ac.seed++; this.ac.D = newDuel(this.ac.seed); this.ac.sel = null; this.ac.result = null; this.ac.aiWait = 0.8; this.drawDuel(); }
  acP() { return `<header class="lv-head mono">${t('ac.title')}</header><p class="intro">${t('ac.intro')}</p><div class="chips"><button class="btn primary" id="a-new">🂠 ${t('ac.new')}</button><button class="btn seg ${this.auto ? 'active' : ''}" id="a-auto">${t('ac.auto')}</button></div><p class="small">${t('ac.rules')}</p>`; }
  acS() { return `<header class="lv-head mono">${t('ac.read')}</header><div class="bigstats" id="ac-big"></div><div class="math mono" id="ac-math"></div><div class="goal" id="ac-goal"></div>`; }
  acB() { $('#a-new').onclick = () => { this.newDuel(); sfx.select(); this.refresh(true); }; $('#a-auto').onclick = () => { this.auto = !this.auto; sfx.select(); this.render(); }; }
  drawDuel() {
    const el = $('#duel'), A = this.ac, D = A.D; if (!el || !D) return;
    const card = (c, o, extra = '') => { const C = CARDS[c]; return `<div class="card o${o} ${extra}"><b>${rankStr(C[1])}</b><i class="r">${rankStr(C[2])}</i><b class="b">${rankStr(C[3])}</b><i class="l">${rankStr(C[4])}</i><span>${C[0]}</span></div>`; };
    el.innerHTML = `<div class="hand ai">${D.hands[0].map((c) => card(c, 0, 'small')).join('')}</div>
      <div class="board">${D.board.map((q, i) => `<div class="cell ${D.flips?.includes(i) ? 'flip' : ''}" data-cell="${i}">${q ? card(q.c, q.o) : ''}</div>`).join('')}</div>
      <div class="hand you">${D.hands[1].map((c, k) => `<div data-hand="${k}" class="pick ${A.sel === k ? 'sel' : ''}">${card(c, 1)}</div>`).join('')}</div>
      <div class="duel-score mono"><span class="o0">${t('ac.ai')} ${score(D)}</span><span class="o1">${t('ac.you')} ${10 - score(D)}</span>${A.result ? `<b>${t('ac.' + A.result)}</b>` : ''}</div>`;
    el.querySelectorAll('[data-hand]').forEach((b) => (b.onclick = () => { if (D.turn !== 1 || A.result) return; A.sel = +b.dataset.hand; sfx.select(); this.drawDuel(); }));
    el.querySelectorAll('[data-cell]').forEach((b) => (b.onclick = () => { const i = +b.dataset.cell; if (D.turn !== 1 || A.sel == null || D.board[i] || A.result) return; this.move(i, A.sel); }));
    // Mirror the board on the 3D table.
    this.W.academy.userData.slots.forEach((s, i) => { const q = D.board[i]; s.visible = !!q; if (q) s.material.color.set(q.o ? '#4a8aff' : '#ff5a6a'); });
  }
  move(cell, k) { const A = this.ac; A.D = play(A.D, cell, k); A.sel = null; sfx.select(); if (A.D.flips.length) this.app.feed.push('ac.flip', 'ok', { n: A.D.flips.length }); this.checkDuel(); A.aiWait = 0.9; this.drawDuel(); this.refresh(true); }
  checkDuel() { const A = this.ac, D = A.D; if (D.moves < 9) return; const you = 10 - score(D); A.result = you > 5 ? 'win' : you < 5 ? 'lose' : 'draw'; this.app.feed.push('ac.' + A.result, A.result === 'win' ? 'ok' : 'warn'); if (A.result === 'win') this.done('academy'); }
  duelTick(dt) {
    const A = this.ac, D = A.D; if (!D || A.result) return; A.aiWait -= dt; if (A.aiWait > 0) return;
    if (D.turn === 0) { const mv = minimax(D, 2); this.move(mv.cell, mv.k); }
    else if (this.auto) { const mv = minimax(D, D.moves >= 3 ? 9 : 3); this.move(mv.cell, mv.k); }
  }
  acLive(full) {
    if (!full) return; const D = this.ac.D; if (!D) return;
    const st = { n: 0 }; const best = D.moves < 9 && D.turn === 1 ? minimax(D, D.moves >= 3 ? 9 : 2, -1e9, 1e9, st) : null;
    const big = $('#ac-big'); if (big) big.innerHTML = `<div><b class="mono">${10 - score(D)} : ${score(D)}</b><small>${t('ac.score')}</small></div><div><b class="mono">${D.moves}/9</b><small>${t('ac.moves')}</small></div><div><b class="mono">${best ? f0(st.n) : '—'}</b><small>${t('ac.nodes')}</small></div>`;
    const m = $('#ac-math'); if (m) m.innerHTML = `<div>${t('ac.tree')} Π (cells × cards) = 9·5·8·5·7·4·6·4·5·3·4·3·3·2·2·2·1·1 ≈ <b>${treeSize().toExponential(1)}</b></div><div>${t('ac.mm')}</div><div>${best ? t('ac.hint', { v: best.v > 0 ? t('ac.youWin') : best.v < 0 ? t('ac.aiWin') : t('ac.drawn') }) : ''}</div><div>${t('ac.second')}</div>`;
    const g = $('#ac-goal'); if (g) g.innerHTML = `${badge(this.goal.academy)} ${t('goal.academy')}`;
  }

  // ═══ MIST: the airship ═══
  msP() {
    const S = this.ms;
    return `<header class="lv-head mono">${t('ms.title')}</header><p class="intro">${t('ms.intro')}</p>
      <header class="lv-sub mono">${t('ms.gas')}</header>${this.chips('gas', Object.keys(GASES), S.gas, (k) => t('gas.' + k))}
      ${this.slider('m-V', t('ms.V'), S.V, 10000, 120000, 1000, f0(S.V) + ' m³')}${this.slider('m-P', t('ms.P'), S.P, 200, 4000, 50, f0(S.P) + ' kW')}
      <p class="small">${t('ms.note')}</p>`;
  }
  msS() { return `<header class="lv-head mono">${t('ms.read')}</header><div class="bigstats" id="ms-big"></div><canvas class="cv chart" id="cv-lift"></canvas><div class="math mono" id="ms-math"></div><div class="goal" id="ms-goal"></div>`; }
  msB() { const S = this.ms; document.querySelectorAll('[data-gas]').forEach((b) => (b.onclick = () => { S.gas = b.dataset.gas; sfx.select(); this.render(); })); this.bindSliders(S, [['m-V', 'V', (v) => f0(v) + ' m³'], ['m-P', 'P', (v) => f0(v) + ' kW']]); }
  msLive(full) {
    if (!full) return;
    const S = this.ms, A = airship(S), ratio = GASES[S.gas].ratio;
    const big = $('#ms-big'); if (big) big.innerHTML = `<div><b class="mono ${A.ceiling >= 1500 ? 'c-green' : 'c-red'}">${A.ceiling < 0 ? t('ms.grounded') : f0(A.ceiling) + ' m'}</b><small>${t('ms.ceiling')}</small></div><div><b class="mono ${A.v >= 20 ? 'c-green' : 'c-red'}">${f0(A.kmh)} km/h</b><small>${t('ms.speed')}</small></div><div><b class="mono">${f0(A.m / 1000)} t</b><small>${t('ms.mass')}</small></div>`;
    const lift = [], wt = []; for (let h = 0; h <= 6000; h += 100) { lift.push([h, (rhoAir(h) * (1 - ratio) * S.V) / 1000]); wt.push([h, A.m / 1000]); }
    lineChart($('#cv-lift'), { x0: 0, x1: 6000, y0: 0, y1: Math.max(60, Math.ceil(A.lift0 / 10000) * 10 + 10), xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y) + ' t', title: t('ms.chart'), series: [{ pts: lift, color: '#ffd27a', label: t('ms.lift') }, { pts: wt, color: '#ff7a6a', dash: [4, 3], label: t('ms.weight') }], marks: [{ x: 1500, color: 'rgba(255,255,255,.6)', label: t('ms.ridge') }] });
    const m = $('#ms-math');
    if (m) m.innerHTML = `<div>${t('ms.liftL')} (ρ<sub>air</sub> − ρ<sub>gas</sub>)V = ρ<sub>air</sub>(h)·(1 − M<sub>gas</sub>/M<sub>air</sub>)·V · ${t('gas.' + S.gas)}: 1 − ${f2(ratio)} = <b>${f2(1 - ratio)}</b></div>
      <div>${t('ms.mL')} 6 t + 0.28 kg/m³·V + 1.3 kg/kW·P + 20 t ${t('ms.cargo')} = <b>${f0(A.m / 1000)} t</b> · ${t('ms.ceilL')} h = 8500·ln(1.225(1−M/M)V/m) = <b>${A.ceiling < 0 ? '—' : f0(A.ceiling) + ' m'}</b></div>
      <div>${t('ms.speedL')} 0.7·P = ½ρ·0.03·V<sup>2/3</sup>·v³ → v = <b>${f1(A.v)} m/s</b></div><div>${t('ms.h2')}</div>`;
    if (A.ok && A.v >= 20) this.done('mist');
    const g = $('#ms-goal'); if (g) g.innerHTML = `${badge(this.goal.mist)} ${t('goal.mist')}`;
  }

  // ═══ ISLES: sphere-ball ═══
  shoot() {
    const S = this.is, ang = (S.ang * Math.PI) / 180, P = pass(S.v0, ang, [S.x, S.y]), goal = [10.4, 0];
    let result = 'short', tt = 0, at = null;
    for (let i = 0; i < P.path.length; i++) { const [x, y, v] = P.path[i]; tt += 0.05 / Math.max(v, 0.1);
      for (const d of [[4, 2], [6.5, -2]]) if (Math.hypot(x - d[0], y - d[1]) < 0.7) { result = 'blocked'; at = i; break; }
      if (result === 'blocked') break;
      if (Math.hypot(x, y) > 11.6 && x < 9.8) { result = 'out'; at = i; break; }
      if (x >= 9.8) { const off = Math.abs(y - goal[1]); result = off <= 1.5 ? (v >= 2 ? 'goal' : 'saved') : 'wide'; at = i; S.lastV = v; S.lastT = tt; break; }
    }
    S.shot = { path: P.path.slice(0, (at ?? P.path.length - 1) + 1), result, range: P.range }; S.anim = { t: 0 };
    const L = this.W.isles.userData.path.geometry; const pa = L.attributes.position; S.shot.path.forEach((p, i) => { if (i < pa.count) pa.setXYZ(i, p[0], 18 + p[1], 0); }); L.setDrawRange(0, Math.min(pa.count, S.shot.path.length)); pa.needsUpdate = true;
    sfx.select();
  }
  isP() {
    const S = this.is;
    return `<header class="lv-head mono">${t('is.title')}</header><p class="intro">${t('is.intro')}</p>
      ${this.slider('i-x', t('is.x'), S.x, -9, 6, 0.5, f1(S.x) + ' m')}${this.slider('i-y', t('is.y'), S.y, -8, 8, 0.5, f1(S.y) + ' m')}${this.slider('i-a', t('is.ang'), S.ang, -60, 60, 1, S.ang + '°')}${this.slider('i-v', t('is.v'), S.v0, 4, 25, 0.5, f1(S.v0) + ' m/s')}
      <button class="btn primary wide" id="i-go">⚽ ${t('is.shoot')}</button><p class="small">${t('is.note')}</p>`;
  }
  isS() { return `<header class="lv-head mono">${t('is.read')}</header><div class="bigstats" id="is-big"></div><canvas class="cv chart" id="cv-ball"></canvas><div class="math mono" id="is-math"></div><div class="goal" id="is-goal"></div>`; }
  isB() { this.bindSliders(this.is, [['i-x', 'x', (v) => f1(v) + ' m'], ['i-y', 'y', (v) => f1(v) + ' m'], ['i-a', 'ang', (v) => v + '°'], ['i-v', 'v0', (v) => f1(v) + ' m/s']]); $('#i-go').onclick = () => this.shoot(); }
  isLive(full) {
    if (!full) return;
    const S = this.is, B = ballK(), P = pass(S.v0, 0, [0, 0]), dist = Math.hypot(10.4 - S.x, 0 - S.y), vAt = S.v0 * Math.exp(-B.k * dist), depth = 12 - S.y;
    const big = $('#is-big'); if (big) big.innerHTML = `<div><b class="mono">${f1(P.range)} m</b><small>${t('is.range')}</small></div><div><b class="mono ${vAt >= 2 ? 'c-green' : 'c-red'}">${f1(vAt)} m/s</b><small>${t('is.atGoal')} (${f1(dist)} m)</small></div><div><b class="mono">${S.goals}/3</b><small>${t('is.goals')}</small></div>`;
    const pts = []; for (let d = 0; d <= 12; d += 0.2) pts.push([d, S.v0 * Math.exp(-B.k * d)]);
    const air = []; for (let d = 0; d <= 12; d += 0.2) air.push([d, S.v0 * Math.exp(-((0.5 * 1.2 * 0.47 * Math.PI * 0.11 ** 2) / 0.45) * d)]);
    lineChart($('#cv-ball'), { x0: 0, x1: 12, y0: 0, y1: Math.ceil(S.v0), xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y), title: t('is.chart'), series: [{ pts, color: '#5ad0ff', label: t('is.water') }, { pts: air, color: 'rgba(255,255,255,.4)', dash: [4, 3], label: t('is.air') }], marks: [{ y: 2, color: '#ffd27a', label: t('is.keeper') }, { x: dist, color: '#fff' }] });
    const m = $('#is-math');
    if (m) m.innerHTML = `<div>${t('is.ballL')} m = ρV = ${f2(B.m)} kg · m<sub>eff</sub> = m + ½ρV = <b>${f2(B.meff)} kg</b> (${t('is.added')})</div>
      <div>v(x) = v₀e<sup>−kx</sup>, k = ½ρC<sub>D</sub>A/m<sub>eff</sub> = <b>${f2(B.k)} /m</b> · ${t('is.half')} ln2/k = <b>${f2(Math.LN2 / B.k)} m</b></div>
      <div>${t('is.press')} p = p₀ + ρg·${f1(depth)} m = <b>${f2(pressureAtm(depth))} atm</b> · ${t('is.bottom')} ${f2(pressureAtm(24))} atm</div>`;
    const g = $('#is-goal'); if (g) g.innerHTML = `${badge(this.goal.isles)} ${t('goal.isles')}`;
  }
  islesTick(dt) {
    const S = this.is, U = this.W.isles.userData; if (!S.anim) { U.ball.position.set(S.x, 18 + S.y, 0); return; }
    S.anim.t += dt; const P = S.shot.path, i = Math.min(P.length - 1, Math.floor(S.anim.t * 60)), p = P[i]; U.ball.position.set(p[0], 18 + p[1], 0);
    if (i >= P.length - 1 && !S.anim.done) { S.anim.done = true; const r = S.shot.result; if (r === 'goal') { S.goals++; sfx.confirm(); if (S.goals >= 3) this.done('isles'); } this.app.feed.push('is.' + r, r === 'goal' ? 'ok' : 'warn', { v: f1(S.lastV ?? 0) }); this.refresh(true); }
    if (S.anim.t > P.length / 60 + 0.8) S.anim = null;
  }

  // ═══ RIFT: the battle ═══
  rfP() { const R = this.rf; return `<header class="lv-head mono">${t('rf.title')}</header><p class="intro">${t('rf.intro')}</p><div class="chips"><button class="btn primary" id="r-go">⚔ ${R ? t('rf.again') : t('rf.start')}</button><button class="btn seg ${this.auto ? 'active' : ''}" id="r-auto">${t('rf.auto')}</button></div><div id="r-cmd"></div><p class="small">${t('rf.keys')}</p>`; }
  rfS() { return `<header class="lv-head mono">${t('rf.read')}</header><div id="rf-party"></div><div class="math mono" id="rf-math"></div><div class="goal" id="rf-goal"></div>`; }
  rfB() { $('#r-go').onclick = () => this.startBattle(); $('#r-auto').onclick = () => { this.auto = !this.auto; sfx.select(); this.render(); }; }
  startBattle(seed) {
    this.rfSeed = seed ?? this.rfSeed + 1; const R = rng(this.rfSeed);
    this.rf = { R, t: 0, party: PARTY.map((p, i) => ({ ...p, hpMax: p.hp, mpMax: p.mp, g: R() * 40, lim: 0, alive: true, i, act: null, def: false })), boss: { ...WYRM, hpMax: WYRM.hp, g: 0, n: 0, act: null }, log: [], over: false, win: false, ready: null };
    sfx.confirm(); this.caption('cap.fight'); this.render();
  }
  bossTarget() { const al = this.rf.party.filter((p) => p.alive); return al[Math.floor(this.rf.R() * al.length)]; }
  float(txt, at, col) { const el = document.createElement('div'); el.className = 'dmg mono'; el.textContent = txt; el.style.color = col; $('#fx')?.appendChild(el); this.floats = this.floats || []; this.floats.push({ el, at: at.clone(), t: 0 }); }
  heroAct(h, cmd) {
    const B = this.rf, W = B.boss, R = B.R; if (!h.alive || B.over) return; h.g = 0; h.def = false; let txt = '';
    const crit = R() * 100 < h.lck, hit = (pow, elem, stat = 'atk', mdef = false) => { const d = damage(h[stat], mdef ? W.mdef : W.def, pow, elem, crit, R()); W.hp = elem < 0 ? Math.min(W.hpMax, W.hp - d) : W.hp - d; return d; };
    if (cmd === 'attack') { const d = hit(1, 1); txt = (crit ? '!' : '') + d; this.float(txt, this.wyrm.userData.head.getWorldPosition(V()), crit ? '#ffd27a' : '#fff'); }
    else if (['fire', 'ice', 'bolt'].includes(cmd)) { const S = SPELLS[cmd]; if (h.mp < S.mp) return this.heroAct(h, 'attack'); h.mp -= S.mp; const e = WYRM.weak[cmd], d = hit(S.pow, e, 'mag', true); this.float(e < 0 ? '+' + Math.abs(d) : String(d), this.wyrm.userData.head.getWorldPosition(V()), { fire: '#ff8a4a', ice: '#9fe8ff', bolt: '#ffe86a' }[cmd]); this.spell(h, cmd); }
    else if (cmd === 'cure') { const S = SPELLS.cure; if (h.mp < S.mp) return this.heroAct(h, 'attack'); h.mp -= S.mp; const tg = B.party.filter((p) => p.alive).sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0], heal = Math.round(h.mag * S.pow * 4 * (0.9 + 0.2 * R())); tg.hp = Math.min(tg.hpMax, tg.hp + heal); this.float('+' + heal, this.heroes[tg.id].position.clone().add(V(0, 2, 0)), '#7ff0b0'); this.spell(h, 'cure', tg); }
    else if (cmd === 'limit') { if (h.lim < 100) return; h.lim = 0; const pw = { vey: [4.2, 1, 'atk'], lio: [1, 5, 'atk'], pip: [3.4, 1, 'mag'], mara: [4.4, 1, 'mag'] }[h.id]; let tot = 0; for (let k = 0; k < pw[1]; k++) tot += hit(pw[0], h.id === 'pip' ? WYRM.weak.ice : 1, pw[2], pw[2] === 'mag'); this.float(t('rf.limitFx') + ' ' + tot, this.wyrm.userData.head.getWorldPosition(V()), '#ff9ad5'); this.app.stage.flash?.('#ff9ad5'); this.app.feed.push('rf.limit', 'ok', { h: t('h.' + h.id), n: f0(tot) }); }
    else if (cmd === 'defend') h.def = true;
    h.act = { cmd, t: 0 }; sfx.select();
    if (W.hp <= 0 && !B.over) { W.hp = 0; B.over = true; B.win = true; this.done('rift'); this.caption('cap.win'); this.app.feed.push('rf.won', 'ok'); this.render(); }
  }
  spell(h, cmd, tg) { const s = this.fx.find((x) => x.material.opacity <= 0.01) || this.fx[0], from = this.heroes[h.id].position.clone().add(V(0, 1.4, 0)), to = tg ? this.heroes[tg.id].position.clone().add(V(0, 1.2, 0)) : this.wyrm.userData.head.getWorldPosition(V()); s.material.color.set({ fire: '#ff8a4a', ice: '#9fe8ff', bolt: '#ffe86a', cure: '#7ff0b0' }[cmd]); s.userData = { from, to, t: 0 }; s.material.opacity = 1; }
  bossAct() {
    const B = this.rf, W = B.boss, R = B.R; W.g = 0; W.n++; let kind;
    if (W.n % 4 === 0) { kind = 'flare'; for (const p of B.party) if (p.alive) this.hurt(p, damage(W.mag, p.def * 0.8, 0.72, 1, false, R())); this.app.stage.flash?.('#a88aff'); }
    else if (R() < 0.5) { kind = 'bite'; const p = this.bossTarget(); if (p) this.hurt(p, damage(W.atk, p.def, 1.3, 1, R() < 0.08, R())); }
    else { kind = 'sweep'; for (const p of B.party) if (p.alive) this.hurt(p, damage(W.atk, p.def, 0.55, 1, false, R())); }
    W.act = { kind, t: 0 }; this.app.feed.push('rf.' + kind, 'warn');
  }
  hurt(p, d) { if (p.def) d = Math.round(d / 2); p.hp = Math.max(0, p.hp - d); p.lim = Math.min(100, p.lim + (d / p.hpMax) * 160); this.float(String(d), this.heroes[p.id].position.clone().add(V(0, 2.1, 0)), '#ff6a7a'); if (p.hp <= 0 && p.alive) { p.alive = false; this.app.feed.push('rf.ko', 'warn', { h: t('h.' + p.id) }); } const B = this.rf; if (B.party.every((q) => !q.alive) && !B.over) { B.over = true; this.caption('cap.lose'); this.render(); } }
  autoCmd(h) {
    const B = this.rf, low = B.party.filter((p) => p.alive && p.hp / p.hpMax < 0.55);
    if (h.lim >= 100) return 'limit';
    if ((h.id === 'mara' || h.id === 'pip') && low.length && h.mp >= SPELLS.cure.mp && (h.id === 'mara' || low.length >= 2)) return 'cure';
    if ((h.id === 'pip' || h.id === 'mara') && h.mp >= SPELLS.ice.mp) return 'ice';
    if (h.id === 'lio' && h.mp >= SPELLS.ice.mp && B.R() < 0.4) return 'ice';
    return 'attack';
  }
  battleTick(dt) {
    const B = this.rf; if (!B || B.over) return; B.t += dt;
    const waiting = !this.auto && B.ready; if (waiting) return;                       // wait mode: time stops while you choose
    for (const h of B.party) { if (!h.alive) continue; h.g = Math.min(100, h.g + h.spd * ATB_RATE * dt); if (h.g >= 100) { if (this.auto) this.heroAct(h, this.autoCmd(h)); else if (!B.ready) { B.ready = h; this.render(); } } }
    const W = B.boss; W.g = Math.min(100, W.g + W.spd * ATB_RATE * dt); if (W.g >= 100) this.bossAct();
  }
  rfLive(full) {
    const B = this.rf, P = $('#rf-party');
    if (P) P.innerHTML = !B ? `<p class="small">${t('rf.ready')}</p>` : `<div class="boss"><b>${t('h.wyrm')}</b><div class="bar hp"><i style="width:${(B.boss.hp / B.boss.hpMax) * 100}%"></i><span>${f0(B.boss.hp)} / ${f0(B.boss.hpMax)}</span></div><div class="bar atb"><i style="width:${B.boss.g}%"></i></div></div>` +
      B.party.map((h) => `<div class="pm ${h.alive ? '' : 'ko'} ${B.ready === h ? 'rdy' : ''}"><b>${t('h.' + h.id)}</b><div class="bar hp"><i style="width:${(h.hp / h.hpMax) * 100}%"></i><span>${f0(h.hp)}</span></div><div class="bar mp"><i style="width:${(h.mp / h.mpMax) * 100}%"></i><span>MP ${f0(h.mp)}</span></div><div class="bar atb"><i style="width:${h.g}%"></i></div><div class="bar lim"><i style="width:${h.lim}%"></i></div></div>`).join('');
    const C = $('#r-cmd'); if (C) C.innerHTML = B && B.ready && !this.auto ? `<div class="cmd"><b>${t('h.' + B.ready.id)}</b>${['attack', 'fire', 'ice', 'bolt', 'cure', 'limit', 'defend'].map((c) => `<button class="btn seg" data-cmd="${c}" ${c === 'limit' && B.ready.lim < 100 ? 'disabled' : ''}>${t('cmd.' + c)}</button>`).join('')}</div>` : '';
    C?.querySelectorAll('[data-cmd]').forEach((b) => (b.onclick = () => { const h = B.ready; B.ready = null; this.heroAct(h, b.dataset.cmd); this.render(); }));
    if (!full) return;
    const m = $('#rf-math'); if (m) m.innerHTML = `<div>${t('rf.dmgL')} ${LV}·ATK²/(ATK + DEF) × ${t('rf.pow')} × ${t('rf.elem')} × (0.9–1.1) × ${t('rf.crit')}</div><div>${t('rf.atb')} g += SPD·${ATB_RATE}·dt → ${PARTY.map((p) => `${t('h.' + p.id)} ${f1(turnsPerMin(p.spd))}`).join(' · ')} ${t('rf.tpm')}</div><div>${t('rf.weak')} ×${WYRM.weak.ice} · ${t('rf.absorb')}</div><div>${t('rf.ex', { a: damage(PARTY[0].atk, WYRM.def), i: damage(PARTY[2].mag, WYRM.mdef, SPELLS.ice.pow, WYRM.weak.ice) })}</div>`;
    const g = $('#rf-goal'); if (g) g.innerHTML = `${badge(this.goal.rift)} ${t('goal.rift')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.1, Math.min(1.2, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.4, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'isles' && k === ' ') this.shoot(); }
  keyUp() {}

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, W = this.W;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.07;
    for (const h of Object.values(this.heroes)) h.visible = false;
    let cp, look;
    if (tab === 'ferrum') {
      const U = W.ferrum.userData; U.reactors.forEach(({ plume }, i) => { const A = plume.geometry.attributes.position, C = plume.geometry.attributes.color; for (let k = 0; k < A.count; k++) { const ph = (time * 0.25 + k / A.count + i * 0.3) % 1; A.setXYZ(k, Math.sin(k * 1.7 + time) * (1 + ph * 6), 32 + ph * 40, Math.cos(k * 2.3 + time) * (1 + ph * 6)); C.setXYZ(k, 0.3 * (1 - ph), 1 * (1 - ph), 0.6 * (1 - ph)); } A.needsUpdate = C.needsUpdate = true; });
      const h = this.heroes.vey; h.visible = true; h.position.set(...U.heroAt); h.rotation.y = Math.PI; poseHero(h, 'ready', time);
      const r = 115 * v.r; look = V(0, 14, 0); cp = V(Math.sin(v.yaw) * r, 38 + v.pitch * 30, Math.cos(v.yaw) * r);
    } else if (tab === 'academy') {
      this.duelTick(dt); W.academy.userData.halo.rotation.z = time * 0.2;
      const h = this.heroes.lio; h.visible = true; h.position.set(...W.academy.userData.heroAt); h.rotation.y = Math.PI; poseHero(h, 'idle', time);
      look = V(0, 6, -8); cp = V(Math.sin(v.yaw * 0.4) * 30 + 14, 14, 34);
    } else if (tab === 'mist') {
      const A = airship(this.ms), U = W.mist.userData, s = (A.length / 30) * 4 / 2, alt = A.ceiling < 0 ? 2 : Math.min(A.ceiling, 2200) / 30;
      U.ship.scale.setScalar(s); const x = Math.sin(time * 0.08) * 40, z = -60 + Math.cos(time * 0.08) * 40; U.ship.position.set(x, Math.max(0.5, alt) + Math.sin(time * 0.7) * 0.3, z + 20); U.ship.rotation.y = -time * 0.08; U.props.forEach((p) => (p.rotation.x += dt * Math.min(30, A.v)));
      U.mist2.position.y = 4 + Math.sin(time * 0.3) * 0.5;
      const h = this.heroes.pip; h.visible = true; h.position.set(18, 2, 30); h.rotation.y = -2.4; poseHero(h, 'idle', time);
      look = U.ship.position.clone().add(V(0, 6, 0)); cp = look.clone().add(V(Math.sin(v.yaw) * 75 * v.r, 14 + v.pitch * 18, Math.cos(v.yaw) * 75 * v.r));
    } else if (tab === 'isles') {
      this.islesTick(dt); const U = W.isles.userData; U.keeper.position.y = 18 + Math.sin(time * 1.5) * 1.0;
      const h = this.heroes.mara; h.visible = true; h.position.set(...U.heroAt); h.rotation.y = Math.PI; poseHero(h, 'idle', time);
      look = V(1, 17, 0); cp = V(Math.sin(v.yaw * 0.3) * 6, 21, 30 * v.r);
    } else {
      this.battleTick(Math.min(dt, 0.05)); const B = this.rf, U = W.rift.userData; U.crystal.rotation.y += dt * 0.2; U.cglow.material.opacity = 0.4 + 0.1 * Math.sin(time * 2);
      const order = ['vey', 'lio', 'pip', 'mara'];
      order.forEach((id, i) => { const h = this.heroes[id], p = B?.party[i]; h.visible = true; const x = -4.5 + i * 3, z = 7 + Math.abs(i - 1.5) * 0.6; let step = 0, mode = 'ready', k = 0; if (p?.act) { p.act.t += dt; k = p.act.t / 0.6; if (k < 1) { mode = p.act.cmd === 'attack' || p.act.cmd === 'limit' ? 'attack' : p.act.cmd === 'defend' ? 'ready' : 'cast'; step = mode === 'attack' ? Math.sin(k * Math.PI) * 3 : 0; } else p.act = null; } h.position.set(x, 0, z - step); h.rotation.y = Math.PI; poseHero(h, p && !p.alive ? 'down' : mode, time, k); h.userData.aura.material.opacity = p && B.ready === p ? 0.6 : p?.lim >= 100 ? 0.4 + 0.3 * Math.sin(time * 8) : 0; });
      let rear = 0; if (B?.boss.act) { B.boss.act.t += dt; rear = Math.sin(Math.min(1, B.boss.act.t / 0.8) * Math.PI) * (B.boss.act.kind === 'flare' ? 1 : 0.5); if (B.boss.act.t > 0.8) B.boss.act = null; }
      this.wyrm.visible = !(B?.win); poseWyrm(this.wyrm, time, rear);
      look = V(0, 3.8, -1); cp = V(Math.sin(v.yaw * 0.5) * 7 + 6, 5.5 + v.pitch * 5, 17 * v.r);
    }
    // Spell sprites and floating numbers.
    for (const s of this.fx) { const U = s.userData; if (!U?.from || s.material.opacity <= 0) continue; U.t += dt * 2.2; const k = Math.min(1, U.t); s.position.lerpVectors(U.from, U.to, k); s.position.y += Math.sin(k * Math.PI) * 1.5; s.scale.setScalar(1 + k * 1.5); if (k >= 1) s.material.opacity = Math.max(0, s.material.opacity - dt * 3); }
    if (this.floats) { const r = $('#scene').getBoundingClientRect(); this.floats = this.floats.filter((f) => { f.t += dt; const p = f.at.clone().add(V(0, f.t * 1.2, 0)).project(this.cam); f.el.style.left = ((p.x + 1) / 2) * r.width + 'px'; f.el.style.top = ((1 - p.y) / 2) * r.height + 'px'; f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.4)); if (f.t > 1.4 || tab !== 'rift') { f.el.remove(); return false; } return true; }); }
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook);
    this.sun.position.copy(look).add(V(40, 80, 30)); this.sun.target.position.copy(look); this.sun.target.updateMatrixWorld();
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 5 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'ferrum') this.feLive(full);
    if (this.tab === 'academy') this.acLive(full);
    if (this.tab === 'mist') this.msLive(full);
    if (this.tab === 'isles') this.isLive(full);
    if (this.tab === 'rift') this.rfLive(full);
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
void G; void CARDS;
