import * as THREE from 'three';
import { G, TEAM, photonEV, morph, strike, TARGETS, jump, MATS, giant, teamPeak } from './sim/hero.js';
import { buildWorld, combine, MECH_AT, MONSTER_AT } from './view/world.js';
import { buildRanger, morphTo, poseRanger } from './view/ranger.js';
import { pointCloud } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// CHROMA FORCE · the app: morph the team (light and E = mc²), the strike lab (impulse, force,
// jumps), the combining mech (square–cube law) and the battle (a five-lane rhythm game in which
// the team's timing sets the combined strike force).
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const sci = (x) => { const e = Math.floor(Math.log10(Math.abs(x))); return `${(x / 10 ** e).toFixed(2)}×10<sup>${e}</sup>`; };
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const LANES = ['a', 's', 'd', 'f', 'g'];

export class Chroma {
  constructor(app) {
    this.app = app; this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 4000); this.scene.add(this.cam);
    this.team = TEAM.map((c, i) => { const r = buildRanger(c); r.position.set((i - 2) * 1.35, 0, -Math.abs(i - 2) * 0.35); this.scene.add(r); return { r, c, u: 0, target: 0, z0: r.position.z }; });
    this.team.sort((a, b) => a.r.position.x - b.r.position.x);
    this.sparks = pointCloud(600, 0.06, '#ffffff'); this.scene.add(this.sparks);
    this.sl = { who: 0, meff: 3, v: 9, dt: 12, amp: 1, target: 'concrete', vJ: 3.2, turns: 1, anim: null, broke: null };
    this.board = this.buildBoard(); this.resetBoard();
    this.mc = { u: 0, target: 0, H: 40, mat: 'steel' };
    this.bt = null; this.grow = 0;
    this.goal = { morph: false, strike: false, mech: false, battle: false };
    this.view = { yaw: 0, pitch: 0.1, r: 10.5, drag: null, last: 0 };
    this.tab = 'morph'; this.entered = false; this.uiT = 0; this.time = 0;
    app.stage.use(this.scene, this.cam);
  }
  now() { return this.simClock ? this.time * 1000 : performance.now(); }
  buildBoard() {
    const g = new THREE.Group(); g.position.set(0, 0, 2.4); this.scene.add(g);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), new THREE.MeshStandardMaterial({ color: '#333', metalness: 0.7 })); stand.position.y = 0.6; g.add(stand);
    const halves = [-1, 1].map((s) => { const h = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.04), new THREE.MeshStandardMaterial({ color: '#b48a5a', roughness: 0.8 })); h.position.set(s * 0.075, 1.3, 0); h.castShadow = true; g.add(h); return h; });
    g.userData = { halves }; g.visible = false; return g;
  }

  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['morph', 'strike', 'mech', 'battle'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true;
    this.board.visible = tab === 'strike'; if (tab !== 'battle') this.bt = null;
    if (tab === 'battle' && this.mc.target < 1) { this.mc.target = 1; }
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() { const P = { morph: ['moP', 'moS', 'moB'], strike: ['stP', 'stS', 'stB'], mech: ['meP', 'meS', 'meB'], battle: ['baP', 'baS', 'baB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); this.refresh(true); }; } }

  // ═══ MORPH ═══
  moP() {
    return `<header class="lv-head mono">${t('mo.title')}</header><p class="intro">${t('mo.intro')}</p>
      <button class="btn primary wide" id="m-all">⚡ ${t('mo.all')}</button>
      <div class="roster">${TEAM.map((c, i) => { const R = this.team.find((x) => x.c.id === c.id); return `<button class="hero ${R.u > 0.99 ? 'on' : ''}" data-mo="${c.id}" style="--c:${c.hex}"><i></i><b>${t('c.' + c.id)}</b><small>${t('role.' + c.role)}</small><em class="mono">${Array.isArray(c.nm) ? c.nm.join(' + ') : c.nm} nm</em></button>`; }).join('')}</div>
      <button class="btn seg" id="m-reset">↺ ${t('mo.reset')}</button>`;
  }
  moS() { return `<header class="lv-head mono">${t('mo.read')}</header><div class="bigstats" id="mo-big"></div><canvas class="cv chart" id="cv-spec"></canvas><div class="math mono" id="mo-math"></div><div class="goal" id="mo-goal"></div>`; }
  moB() {
    $('#m-all').onclick = () => { this.team.forEach((R, i) => setTimeout(() => this.morphOne(R), i * 260)); this.caption('cap.morph'); };
    document.querySelectorAll('[data-mo]').forEach((b) => (b.onclick = () => this.morphOne(this.team.find((R) => R.c.id === b.dataset.mo))));
    $('#m-reset').onclick = () => { this.team.forEach((R) => { R.target = 0; }); this.render(); };
  }
  morphOne(R) { R.target = 1; R.t0 = this.time; sfx.confirm(); }
  moLive(full) {
    if (!full) return;
    const M = morph({}), n = this.team.filter((R) => R.u > 0.99).length;
    const big = $('#mo-big'); if (big) big.innerHTML = `<div><b class="mono">${n}/5</b><small>${t('mo.morphed')}</small></div><div><b class="mono">${f0(M.Mt)}</b><small>${t('mo.mt')}</small></div><div><b class="mono">${f1(M.Ek)} J</b><small>${t('mo.deploy')}</small></div>`;
    const pts = []; for (let nm = 400; nm <= 700; nm += 2) pts.push([nm, photonEV(nm)]);
    lineChart($('#cv-spec'), { x0: 400, x1: 700, y0: 1.6, y1: 3.2, xFmt: (x) => x + ' nm', yFmt: (y) => y.toFixed(1), title: t('mo.chart'), series: [{ pts, color: 'rgba(232,238,252,.6)', label: 'E = hc/λ' }], marks: TEAM.flatMap((c) => (Array.isArray(c.nm) ? c.nm : [c.nm]).map((nm) => ({ x: nm, color: c.hex, dot: [nm, photonEV(nm)] }))) });
    const m = $('#mo-math');
    if (m) m.innerHTML = `<div>E<sub>photon</sub> = hc/λ = 1239.8/λ[nm] eV · ${TEAM.filter((c) => !Array.isArray(c.nm)).map((c) => `${t('c.' + c.id)} <b>${f2(photonEV(c.nm))}</b>`).join(' · ')}</div>
      <div>${t('mo.pink')}</div>
      <div>${t('mo.emc')} E = mc² = 11 kg·(3.0×10⁸)² = <b>${sci(M.E)} J</b> = <b>${f0(M.Mt)} Mt</b> TNT (${t('mo.homes', { n: sci(M.homes) })})</div>
      <div>${t('mo.fold')} ½mv² = ½·11·3² = <b>${f1(M.Ek)} J</b> in 0.6 s = <b>${f0(M.P)} W</b></div>`;
    if (n === 5) this.done('morph');
    const g = $('#mo-goal'); if (g) g.innerHTML = `${badge(this.goal.morph)} ${t('goal.morph')}`;
  }

  // ═══ STRIKE LAB ═══
  stP() {
    const S = this.sl;
    return `<header class="lv-head mono">${t('st.title')}</header><p class="intro">${t('st.intro')}</p>
      ${this.chips('who', [0, 1, 2, 3, 4], S.who, (k) => `<i class="dot" style="background:${TEAM[k].hex}"></i>${t('c.' + TEAM[k].id)}`)}
      ${this.slider('s-m', t('st.meff'), S.meff, 1, 14, 0.5, f1(S.meff) + ' kg')}${this.slider('s-v', t('st.v'), S.v, 3, 16, 0.5, f1(S.v) + ' m/s')}${this.slider('s-dt', t('st.dt'), S.dt, 3, 30, 1, S.dt + ' ms')}${this.slider('s-amp', t('st.amp'), S.amp, 1, 5, 0.1, '×' + f1(S.amp))}
      <header class="lv-sub mono">${t('st.target')}</header>${this.chips('tg', Object.keys(TARGETS), S.target, (k) => t('tg.' + k))}
      <button class="btn primary wide" id="s-hit">👊 ${t('st.hit')}</button>
      <header class="lv-sub mono">${t('st.jumpH')}</header>${this.slider('s-vj', t('st.vj'), S.vJ, 1.5, 6, 0.1, f1(S.vJ) + ' m/s')}${this.slider('s-tn', t('st.turns'), S.turns, 0, 2, 0.5, S.turns)}
      <button class="btn seg wide" id="s-jump">⤴ ${t('st.jump')}</button>`;
  }
  stS() { return `<header class="lv-head mono">${t('st.read')}</header><div class="bigstats" id="st-big"></div><canvas class="cv chart" id="cv-force"></canvas><div class="math mono" id="st-math"></div><div class="goal" id="st-goal"></div>`; }
  stB() {
    const S = this.sl;
    document.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => { S.who = +b.dataset.who; sfx.select(); this.render(); }));
    document.querySelectorAll('[data-tg]').forEach((b) => (b.onclick = () => { S.target = b.dataset.tg; this.resetBoard(); sfx.select(); this.render(); }));
    this.bindSliders(S, [['s-m', 'meff', (v) => f1(v) + ' kg'], ['s-v', 'v', (v) => f1(v) + ' m/s'], ['s-dt', 'dt', (v) => v + ' ms'], ['s-amp', 'amp', (v) => '×' + f1(v)], ['s-vj', 'vJ', (v) => f1(v) + ' m/s'], ['s-tn', 'turns', (v) => v]]);
    $('#s-hit').onclick = () => this.hit(); $('#s-jump').onclick = () => { S.anim = { kind: 'jump', t: 0 }; sfx.select(); };
  }
  resetBoard() { this.board.userData.halves.forEach((h, i) => { h.position.set((i ? 1 : -1) * 0.075, 1.3, 0); h.rotation.set(0, 0, 0); }); this.sl.broke = null; const col = { pine: '#b48a5a', concrete: '#8d8f93', brick: '#9a4a32' }[this.sl.target]; this.board.userData.halves.forEach((h) => h.material.color.set(col)); }
  hit() { const S = this.sl, r = strike(S); S.anim = { kind: 'hit', t: 0, r }; sfx.select(); }
  strikeTick(dt) {
    const S = this.sl, A = S.anim; if (!A) return;
    A.t += dt; const hero = this.team[S.who].r;
    if (A.kind === 'hit') {
      if (A.t > 0.18 && !A.done) { A.done = true; const ok = A.r.breaks[S.target]; S.broke = ok ? { t: 0 } : null; this.app.stage.flash?.(ok ? TEAM[S.who].hex : '#ffffff'); this.app.feed.push(ok ? 'st.broke' : 'st.held', ok ? 'ok' : 'warn', { f: f0(A.r.F), n: t('tg.' + S.target) }); if (ok && S.target === 'concrete' && S.amp <= 1.001 && S.meff <= 4) this.done('strike'); this.render(); }
      if (A.t > 1.6) { S.anim = null; this.resetBoard(); }
    }
    if (A.kind === 'jump') { const J = jump({ v: S.vJ, turns: S.turns }); if (A.t > J.t + 0.4) S.anim = null; }
    if (S.broke) { S.broke.t += dt; this.board.userData.halves.forEach((h, i) => { const s = i ? 1 : -1; h.position.x = s * (0.075 + S.broke.t * 0.5); h.position.y = 1.3 + S.broke.t * 0.6 - 4.9 * S.broke.t ** 2; h.position.z = -S.broke.t * 0.8; h.rotation.z = s * S.broke.t * 4; }); }
    void hero;
  }
  stLive(full) {
    if (!full) return;
    const S = this.sl, r = strike(S), J = jump({ v: S.vJ, turns: S.turns });
    const big = $('#st-big'); if (big) big.innerHTML = `<div><b class="mono ${r.breaks[S.target] ? 'c-green' : 'c-red'}">${f0(r.F)}</b><small>${t('st.force')} N</small></div><div><b class="mono">${f0(r.KE)}</b><small>${t('st.ke')} J</small></div><div><b class="mono">${f2(J.h)} m</b><small>${t('st.height')} · ${f0(J.rpm)} rpm</small></div>`;
    const pts = []; for (let d = 3; d <= 30; d += 0.5) pts.push([d, strike({ ...S, dt: d }).F]);
    lineChart($('#cv-force'), { x0: 3, x1: 30, y0: 0, y1: Math.max(8000, Math.ceil(pts[0][1] / 4000) * 4000), xFmt: (x) => x + ' ms', yFmt: (y) => (y / 1000).toFixed(y % 1000 ? 1 : 0) + 'k', title: t('st.chart'), series: [{ pts, color: TEAM[S.who].hex, label: 'F̄ = mv/Δt' }], marks: [...Object.entries(TARGETS).map(([k, f]) => ({ y: f, color: 'rgba(232,238,252,.4)', label: t('tg.' + k) })), { x: S.dt, color: '#fff' }] });
    const m = $('#st-math');
    if (m) m.innerHTML = `<div>p = m<sub>eff</sub>v = ${f1(S.meff)}·${f1(S.v)} = <b>${f1(r.p)} N·s</b> · F̄ = p/Δt × ${f1(S.amp)} = <b>${f0(r.F)} N</b> (${t('tg.' + S.target)} ${f0(TARGETS[S.target])} N)</div>
      <div>KE = ½m<sub>eff</sub>v² = <b>${f0(r.KE)} J</b> · ${t('st.why')}</div>
      <div>${t('st.jumpH')}: h = v²/2g = <b>${f2(J.h)} m</b> · t<sub>air</sub> = 2v/g = <b>${f2(J.t)} s</b> · ω = 2πn/t = <b>${f1(J.omega)} rad/s</b></div>`;
    const g = $('#st-goal'); if (g) g.innerHTML = `${badge(this.goal.strike)} ${t('goal.strike')}`;
  }

  // ═══ MECH ═══
  meP() {
    const M = this.mc;
    return `<header class="lv-head mono">${t('me.title')}</header><p class="intro">${t('me.intro')}</p>
      <button class="btn primary wide" id="c-go">${M.target ? '↺ ' + t('me.split') : '⚙ ' + t('me.combine')}</button>
      ${this.slider('c-H', t('me.H'), M.H, 5, 90, 1, M.H + ' m')}
      <header class="lv-sub mono">${t('me.mat')}</header>${this.chips('mat', Object.keys(MATS), M.mat, (k) => t('mat.' + k))}
      <p class="small">${t('me.note')}</p>`;
  }
  meS() { return `<header class="lv-head mono">${t('me.read')}</header><div class="bigstats" id="me-big"></div><canvas class="cv chart" id="cv-sc"></canvas><div class="math mono" id="me-math"></div><div class="goal" id="me-goal"></div>`; }
  meB() {
    const M = this.mc;
    $('#c-go').onclick = () => { M.target = M.target ? 0 : 1; sfx.confirm(); if (M.target) this.caption('cap.combine'); this.render(); };
    document.querySelectorAll('[data-mat]').forEach((b) => (b.onclick = () => { M.mat = b.dataset.mat; sfx.select(); this.render(); }));
    this.bindSliders(M, [['c-H', 'H', (v) => v + ' m']]);
  }
  meLive(full) {
    if (!full) return;
    const M = this.mc, g = giant({ Hm: M.H, mat: M.mat });
    const big = $('#me-big'); if (big) big.innerHTML = `<div><b class="mono">${f0(g.mass / 1000)}</b><small>${t('me.mass')} t</small></div><div><b class="mono ${g.sf >= 2 ? 'c-green' : g.sf >= 1 ? 'c-amber' : 'c-red'}">${f2(g.sf)}</b><small>${t('me.sf')}</small></div><div><b class="mono">${f0(g.kmh)}</b><small>${t('me.walk')} km/h</small></div>`;
    const ser = Object.keys(MATS).map((k) => { const pts = []; for (let h = 5; h <= 90; h += 1) pts.push([h, Math.min(8, giant({ Hm: h, mat: k }).sf)]); return { pts, color: { aluminium: '#c9ced6', steel: '#8fa2b8', titanium: '#7fe0ff', nanotube: '#c86bff' }[k], label: t('mat.' + k), width: k === M.mat ? 2.4 : 1.1 }; });
    lineChart($('#cv-sc'), { x0: 5, x1: 90, y0: 0, y1: 8, xFmt: (x) => x + ' m', yFmt: (y) => y.toFixed(0), title: t('me.chart'), series: ser, marks: [{ y: 2, color: '#ffd166', label: 'SF 2' }, { y: 1, color: '#ff4466', label: t('me.yield') }, { x: M.H, color: '#fff' }] });
    const m = $('#me-math');
    if (m) m.innerHTML = `<div>s = H/1.8 = <b>${f1(g.s)}</b> · m = 90·ρ·s³ = 90·${MATS[M.mat].rho}·${f1(g.s)}³ = <b>${f0(g.mass / 1000)} t</b></div>
      <div>σ = σ₀·ρ·s = 3.8·${MATS[M.mat].rho}·${f1(g.s)} = <b>${f0(g.sigma)} MPa</b> vs σ<sub>y</sub> ${MATS[M.mat].y} MPa → SF <b>${f2(g.sf)}</b> · H<sub>max</sub>(SF 2) = <b>${f0(g.Hmax)} m</b></div>
      <div>${t('me.froude')} v = √(0.25·g·L) = √(0.25·9.81·${f1(g.L)}) = <b>${f1(g.vWalk)} m/s</b> · ${t('me.step')} π√(L/g) = <b>${f1(g.step)} s</b></div>
      <div>${t('me.press')} p = mg/A<sub>feet</sub> = <b>${f2(g.pFoot)} MPa</b> (${g.pFoot > 1 ? t('me.sinksA') : g.pFoot > 0.2 ? t('me.sinksS') : t('me.firm')}) · ${t('me.fall')} <b>${f1(g.tFall)} s</b></div>`;
    if (M.u > 0.98 && M.H >= 40 && g.sf >= 2) this.done('mech');
    const gg = $('#me-goal'); if (gg) gg.innerHTML = `${badge(this.goal.mech)} ${t('goal.mech')}`;
  }

  // ═══ BATTLE ═══
  baP() {
    const B = this.bt;
    return `<header class="lv-head mono">${t('ba.title')}</header><p class="intro">${t('ba.intro')}</p>
      <div class="chips"><button class="btn primary" id="b-go">▶ ${B ? t('ba.again') : t('ba.start')}</button><button class="btn seg" id="b-auto">${t('ba.auto')}</button></div>
      <div class="lanes">${TEAM.map((c, i) => `<span style="--c:${c.hex}"><kbd>${LANES[i].toUpperCase()}</kbd>${t('c.' + c.id)}</span>`).join('')}</div>
      <p class="small">${t('ba.keys')}</p><div class="status mono" id="b-status"></div>`;
  }
  baS() { return `<header class="lv-head mono">${t('ba.read')}</header><div class="bigstats" id="ba-big"></div><canvas class="cv chart" id="cv-peak"></canvas><div class="math mono" id="ba-math"></div><div class="goal" id="ba-goal"></div>`; }
  baB() { $('#b-go').onclick = () => this.startBattle(false); $('#b-auto').onclick = () => this.startBattle(true); }
  startBattle(auto) {
    const beat = 500, notes = []; let k = 0;
    const pattern = [0, 1, 2, 3, 4, 'all', 4, 2, 0, 3, 1, 'all', 0, 2, 4, 1, 3, 'all', 2, 2, 0, 4, 'all'];
    for (const p of pattern) { const at = 2600 + k * beat; if (p === 'all') { for (let l = 0; l < 5; l++) notes.push({ lane: l, at, chord: k, hit: null }); k += 2; } else { notes.push({ lane: p, at, hit: null }); k++; } }
    this.bt = { t0: this.now(), notes, hp: 100, auto, done: false, peaks: [], hits: 0, perfect: 0, miss: 0, lastPeak: 0 };
    this.grow = 0; this.W.monster.visible = true; this.mc.target = 1; sfx.confirm(); this.caption('cap.grow'); this.render();
  }
  press(lane, at) {
    const B = this.bt; if (!B || B.done) return; const now = at ?? this.now() - B.t0;
    let best = null; for (const n of B.notes) if (n.lane === lane && n.hit == null && Math.abs(now - n.at) < 160 && (!best || Math.abs(now - n.at) < Math.abs(now - best.at))) best = n;
    if (!best) return; best.hit = now - best.at; B.hits++; if (Math.abs(best.hit) <= 50) B.perfect++;
    if (best.chord == null) this.damage(3.2, TEAM[lane].hex);
    else { const chord = B.notes.filter((n) => n.chord === best.chord); if (chord.every((n) => n.hit != null)) { const peak = teamPeak(chord.map((n) => n.at + n.hit)); B.peaks.push(peak); B.lastPeak = peak; this.damage((peak / 20000) * 20, '#ffffff', true); } }
  }
  damage(d, col, big = false) { const B = this.bt; B.hp = Math.max(0, B.hp - d); this.flashHit = { t: 0, col, big }; this.swing = 0; if (B.hp <= 0 && !B.done) { B.done = true; B.win = true; this.done('battle'); this.caption('cap.win'); this.app.feed.push('ba.win', 'ok'); sfx.confirm(); this.render(); } }
  battleTick(dt) {
    const B = this.bt; if (!B) return; const now = this.now() - B.t0;
    this.grow = Math.min(1, now / 2200);
    if (!B.done) for (const n of B.notes) {
      if (n.hit == null && B.auto && now >= n.at + n.err0) this.press(n.lane, n.at + n.err0);   // auto-play: the simulated hand's exact time
      if (n.err0 == null) n.err0 = (Math.random() - 0.5) * 30;
      if (n.hit == null && now > n.at + 160) { n.hit = Infinity; B.miss++; }
    }
    if (!B.done && now > B.notes[B.notes.length - 1].at + 600) { B.done = true; B.win = B.hp <= 0; if (!B.win) { this.caption('cap.lose'); this.app.feed.push('ba.lose', 'warn'); } this.render(); }
  }
  drawGame() {
    const cv = $('#game'), B = this.bt; if (!cv) return; cv.classList.toggle('on', !!B && this.tab === 'battle'); if (!B || this.tab !== 'battle') return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, now = this.now() - B.t0, hitY = H - 46, lw = W / 5, fall = 1500;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(8,6,14,.55)'; g.fillRect(0, 0, W, H);
    TEAM.forEach((c, i) => { g.fillStyle = c.hex + '22'; g.fillRect(i * lw + 2, 0, lw - 4, H); g.fillStyle = c.hex; g.fillRect(i * lw + 6, hitY - 2, lw - 12, 4); g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 12px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(LANES[i].toUpperCase(), i * lw + lw / 2, H - 16); });
    for (const n of B.notes) {
      if (n.hit != null && n.hit !== Infinity) continue; const y = hitY - ((n.at - now) / fall) * (hitY - 10); if (y < -20 || y > H + 20) continue;
      const c = TEAM[n.lane].hex; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = n.chord != null ? 22 : 12; g.beginPath(); g.roundRect(n.lane * lw + 10, y - 9, lw - 20, 18, 8); g.fill(); g.shadowBlur = 0;
      if (n.chord != null) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    g.fillStyle = '#fff'; g.font = '700 13px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillText(`${t('ba.hp')} ${f0(B.hp)}%`, 10, 20);
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(10, 26, W - 20, 6); g.fillStyle = '#c86bff'; g.fillRect(10, 26, (W - 20) * B.hp / 100, 6);
  }
  baLive(full) {
    const B = this.bt, st = $('#b-status');
    if (st) st.innerHTML = B ? `${B.done ? (B.win ? t('ba.won') : t('ba.lost')) : t('ba.fighting')} · ${t('ba.hp')} ${f0(B.hp)}% · ${t('ba.hits')} ${B.hits} · ${t('ba.perfect')} ${B.perfect} · ${t('ba.miss')} ${B.miss}` : t('ba.ready');
    if (!full) return;
    const mg = giant({ Hm: 44, mat: 'steel' }), monsterSF = 130 / (3.8 * 1.05 * (44 / 1.8));
    const big = $('#ba-big'); if (big) big.innerHTML = `<div><b class="mono">${f0(B?.lastPeak ?? 0)}</b><small>${t('ba.peak')} N</small></div><div><b class="mono">×${f0(1 + this.grow * 21)}</b><small>${t('ba.grow')}</small></div><div><b class="mono ${monsterSF < 1 ? 'c-red' : ''}">${f2(monsterSF)}</b><small>${t('ba.msf')}</small></div>`;
    const pts = []; for (let s = 0; s <= 80; s += 1) pts.push([s, teamPeak([0, s, 2 * s, -s, -2 * s].map((x) => x / 2))]);
    lineChart($('#cv-peak'), { x0: 0, x1: 80, y0: 0, y1: 21000, xFmt: (x) => x + ' ms', yFmt: (y) => f0(y / 1000) + 'k', title: t('ba.chart'), series: [{ pts, color: '#ffd166', label: t('ba.peakL') }], marks: (B?.peaks ?? []).map((p, i) => ({ y: p, color: 'rgba(200,107,255,.6)', label: i === 0 ? t('ba.yours') : '' })) });
    const m = $('#ba-math');
    if (m) m.innerHTML = `<div>F<sub>peak</sub> = max<sub>t</sub> Σ F·e<sup>−(t−tᵢ)²/2w²</sup> · F = 4 kN, w = 12 ms → ${t('ba.perfectSync')} <b>20 kN</b></div>
      <div>${t('ba.monster')}: ×22 → ${t('ba.mass')} ×22³ = ×${f0(22 ** 3)}, ${t('ba.area')} ×22² = ×${f0(22 ** 2)} → ${t('ba.stress')} ×22</div>
      <div>${t('ba.bone')} σ<sub>ult</sub> ≈ 130 MPa vs σ = 3.8·${f1(44 / 1.8)} ≈ ${f0(3.8 * 1.05 * 44 / 1.8)} MPa → SF <b class="c-red">${f2(monsterSF)}</b> — ${t('ba.collapse')}</div><div>${t('ba.mech')} ${f0(mg.mass / 1000)} t · σ ${f0(mg.sigma)} MPa</div>`;
    const g = $('#ba-goal'); if (g) g.innerHTML = `${badge(this.goal.battle)} ${t('goal.battle')}`;
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { const cv = $('#game'); if (this.bt && cv?.classList.contains('on')) { const r = cv.getBoundingClientRect(); if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top) { this.press(Math.min(4, Math.floor(((e.clientX - r.left) / r.width) * 5))); return; } } this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.2, Math.min(1.0, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(3, Math.min(20, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'battle' && LANES.includes(k)) this.press(LANES.indexOf(k)); if (this.tab === 'morph' && k === 'm') $('#m-all')?.click(); if (this.tab === 'strike' && k === ' ') this.hit(); }

  update(dt, time) {
    this.time = time; const W = this.W, v = this.view, tab = this.tab;
    // Morph progress + converging light particles.
    const P = this.sparks.geometry.attributes.position.array, Cc = this.sparks.geometry.attributes.color.array, col = new THREE.Color();
    this.team.forEach((R, i) => {
      R.u += Math.sign(R.target - R.u) * Math.min(Math.abs(R.target - R.u), dt / (R.target ? 1.6 : 0.5)); morphTo(R.r, R.u);
      col.set(R.c.hex); const k = R.target && R.u < 1 ? R.u : 0;
      for (let j = 0; j < 120; j++) { const n = i * 120 + j, a = j * 2.399 + time * 4, rad = (1 - k) * 1.6 + 0.12, y = (j / 120) * 2.0; P.set([R.r.position.x + Math.cos(a) * rad, y * (k > 0 ? 1 : 0) + (k > 0 ? 0 : -50), R.r.position.z + Math.sin(a) * rad], n * 3); const b = k > 0 ? Math.sin(Math.PI * k) : 0; Cc.set([col.r * b, col.g * b, col.b * b], n * 3); }
      const strikeAmt = tab === 'strike' && this.sl.who === i && this.sl.anim?.kind === 'hit' ? Math.sin(Math.min(1, this.sl.anim.t / 0.18) * Math.PI / 2) * (this.sl.anim.t < 0.6 ? 1 : 0) : 0;
      const J = tab === 'strike' && this.sl.who === i && this.sl.anim?.kind === 'jump' ? jump({ v: this.sl.vJ, turns: this.sl.turns }) : null, ta = J ? this.sl.anim.t : 0, air = J && ta < J.t ? this.sl.vJ * ta - 0.5 * G * ta * ta : 0;
      poseRanger(R.r, time, { stance: R.u > 0.99 ? (tab === 'strike' && this.sl.who === i ? 1 : 0.6) : 0, strike: strikeAmt, jump: Math.max(0, air), idx: i });
      R.r.rotation.x = J && ta < J.t ? -(ta / J.t) * Math.PI * 2 * this.sl.turns : 0;
      const zt = R.z0 - (tab === 'strike' && this.sl.who !== i ? 2.6 : 0); R.r.position.z += (zt - R.r.position.z) * Math.min(1, dt * 4);
    });
    this.sparks.geometry.attributes.position.needsUpdate = true; this.sparks.geometry.attributes.color.needsUpdate = true;
    if (tab === 'strike') { this.strikeTick(dt); const hero = this.team[this.sl.who].r; this.board.position.set(hero.position.x, 0, hero.position.z + 0.64); }
    // Mech.
    this.mc.u += Math.sign(this.mc.target - this.mc.u) * Math.min(Math.abs(this.mc.target - this.mc.u), dt / (this.mc.target ? 4.5 : 2.5));
    combine(W, this.mc.u, time); W.mech.scale.setScalar(tab === 'mech' ? this.mc.H / 43 : 1);
    // Battle.
    if (tab === 'battle') { this.battleTick(dt); }
    const gs = 1 + (tab === 'battle' ? this.grow : 0) * 21, B = this.bt;
    W.monster.visible = tab === 'battle'; W.monster.scale.setScalar(B?.win ? Math.max(0.01, gs * (1 - Math.min(1, (this.winT = (this.winT || 0) + dt) / 1.2))) : gs); if (!B?.win) this.winT = 0;
    W.monster.rotation.y = -0.9 + Math.sin(time * 0.7) * 0.15;
    if (this.flashHit) { this.flashHit.t += dt; const k = this.flashHit.t; W.hit.position.copy(MONSTER_AT).add(new THREE.Vector3(-8, 26, 6)); W.hit.material.color.set(this.flashHit.col); W.hit.material.opacity = Math.max(0, 1 - k * 3); W.hit.scale.setScalar((this.flashHit.big ? 70 : 30) * (0.5 + k)); W.monster.position.x = MONSTER_AT.x + Math.sin(k * 60) * Math.exp(-k * 6) * 1.5; if (k > 0.5) this.flashHit = null; }
    const arm = W.zords[4].g; if (this.swing != null) { this.swing += dt * 4; arm.rotation.x = -Math.sin(Math.min(Math.PI, this.swing * Math.PI)) * 1.1; if (this.swing > 1) this.swing = null; }
    W.mech.rotation.y = tab === 'battle' ? 0.55 : 0;
    this.drawGame();
    // Camera.
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.08;
    let look, cp;
    if (tab === 'morph') { look = new THREE.Vector3(0, 1.0, -0.3); cp = look.clone().add(new THREE.Vector3(Math.sin(v.yaw * 0.5) * v.r, 0.45 + Math.sin(v.pitch) * 2, Math.cos(v.yaw * 0.5) * v.r)); }
    else if (tab === 'strike') { const h = this.team[this.sl.who].r.position; look = new THREE.Vector3(h.x, 1.2, h.z + 0.4); cp = look.clone().add(new THREE.Vector3(3.3 + Math.sin(time * 0.2) * 0.3, 0.5, 2.9)); }
    else if (tab === 'mech') { const s = this.mc.H / 43; look = MECH_AT.clone().add(new THREE.Vector3(0, 22 * s, 0)); cp = new THREE.Vector3(Math.sin(v.yaw * 0.4) * 30, 14, -30 + Math.cos(v.yaw * 0.4) * 10); }
    else { look = MECH_AT.clone().lerp(MONSTER_AT, 0.5).add(new THREE.Vector3(0, 44, 0)); cp = new THREE.Vector3(-50 + Math.sin(time * 0.1) * 8, 2, -5); }
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 3)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 4)); this.snap = false; this.cam.lookAt(this.camLook);
    this.cam.fov = tab === 'mech' || tab === 'battle' ? 50 : 40; this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.1) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'morph') this.moLive(full);
    if (this.tab === 'strike') this.stLive(full);
    if (this.tab === 'mech') this.meLive(full);
    if (this.tab === 'battle') this.baLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const rows = ['morph', 'strike', 'mech', 'battle'].map((k) => [t('rep.' + k), this.goal[k]]);
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
