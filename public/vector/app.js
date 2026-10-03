import * as THREE from 'three';
import { ENVS, camoMatch, adapt, camoFactor, dE, thermal, GAITS, SURF, AMB, footstep, link, visibility, STANCE } from './sim/stealth.js';
import { buildWorld, buildGuard, segHitsBox, ZONES, START, GOAL } from './view/world.js';
import { buildOperative, setCamo, poseOp, camoTexture, M as OM } from './view/operative.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// SILENT VECTOR · the app: adaptive camouflage and thermal signature, a playable infiltration
// mission against patrolling guards (sight + hearing), footstep acoustics and covert comms.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '∞'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const G = '#5dffa8', AM = '#ffd166', BL = '#7fd0ff', RD = '#ff4466';
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const BASE = ['#3b4048', '#555b63', '#2a2e34'];
const GAIT_OF = { stand: 'walk', crouch: 'crouch', crawl: 'crawl' };
const HEIGHT = { stand: 1.7, crouch: 1.0, crawl: 0.4 };
const PATROLS = [[[-12, 10], [12, 14], [12, 4], [-12, 4]], [[8, -4], [8, -24], [-10, -22], [-10, -4]], [[24, -20], [24, 20]], [[-14, 20], [14, 20]]];
const ROUTE = [[0, 22], [-0.5, 12], [0.5, 0], [0, -8], [-1.5, -18], [-4, -22.6]];

export class Vector {
  constructor(app) {
    this.app = app; this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 400); this.scene.add(this.cam);
    this.op = buildOperative(); this.scene.add(this.op);
    this.su = { env: 'night', a: 0.2, Tenv: 12, clo: 1.5, eps: 0.9, cooling: 0, M: 260, vision: 0 };
    this.ac = { gait: 'walk', surf: 'concrete', amb: 'night', soles: 6 };
    this.cm = { ptx: 30, f: 400, d: 8, gtx: 2, spread: 64, tau: 0.4, dEnemy: 3 };
    this.goal = { camo: false, mission: false, sound: false, comms: false };
    this.view = { yaw: 0.5, pitch: 0.15, r: 4.2, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'suit'; this.entered = false; this.uiT = 0; this.time = 0;
    // Camouflage backdrop for the suit tab.
    this.backdrop = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 4, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ side: THREE.BackSide, roughness: 0.9 })); this.backdrop.position.set(0, 2, 27); this.scene.add(this.backdrop);
    this.guards = PATROLS.map((p) => { const m = buildGuard(); this.scene.add(m); return { m, path: p, wp: 1, pos: new THREE.Vector3(p[0][0], 0, p[0][1]), head: 0, D: 0, state: 'patrol', pause: 0, target: null, phase: Math.random() * 6 }; });
    this.resetMission(); this.applyCamo();
    app.stage.use(this.scene, this.cam);
  }

  // ── Camo ───────────────────────────────────────────
  suitPal() { return adapt(BASE, ENVS[this.su.env], this.su.a); }
  applyCamo() { const p = this.suitPal(); setCamo(this.op, p); const bm = this.backdrop.material; if (bm.map) bm.map.dispose(); bm.map = camoTexture(ENVS[this.su.env], 21); bm.map.repeat.set(6, 2); bm.needsUpdate = true; }
  camoNow() { return camoFactor(camoMatch(this.suitPal(), ENVS.night)); }

  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['camo', 'mission', 'sound', 'comms'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('g.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  setTab(tab) {
    this.tab = tab; sfx.select(); this.keys.clear();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab; this.snap = true; this.backdrop.visible = tab === 'suit';
    if (tab !== 'infiltrate') { this.op.position.set(0, 0, 27); this.op.rotation.set(0, 0, 0); }
    if (tab === 'comms') this.op.position.set(-8, 2.6, 16);
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { suit: ['suP', 'suS', 'suB'], infiltrate: ['inP', 'inS', 'inB'], acoustics: ['acP', 'acS', 'acB'], comms: ['cmP', 'cmS', 'cmB'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true);
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(key); this.refresh(true); }; } }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('g.' + k) }); sfx.confirm(); this.statusBar(); }

  // ═══ SUIT / CAMO ═══
  suP() {
    const S = this.su;
    return `<header class="lv-head mono">${t('su.title')}</header><p class="intro">${t('su.intro')}</p>
      <header class="lv-sub mono">${t('su.env')}</header>${this.chips('env', Object.keys(ENVS), S.env, (k) => t('env.' + k))}
      ${this.slider('u-a', t('su.adapt'), S.a, 0, 1, 0.01, Math.round(S.a * 100) + ' %')}
      <header class="lv-sub mono">${t('su.thermal')}</header>
      ${this.slider('u-T', t('su.Tenv'), S.Tenv, -15, 40, 1, S.Tenv + ' °C')}${this.slider('u-clo', t('su.clo'), S.clo, 0.3, 4, 0.1, f1(S.clo) + ' clo')}
      ${this.slider('u-eps', t('su.eps'), S.eps, 0.3, 0.98, 0.01, f2(S.eps))}${this.slider('u-cool', t('su.cool'), S.cooling, 0, 200, 5, S.cooling + ' W')}
      ${this.chips('act', [100, 260, 600], S.M, (k) => t('act.' + k))}
      <header class="lv-sub mono">${t('su.vision')}</header>${this.chips('vis', [0, 1, 2], S.vision, (k) => t('vis.' + k))}`;
  }
  suS() { return `<header class="lv-head mono">${t('su.read')}</header><div class="bigstats" id="su-big"></div><div class="swatch" id="su-sw"></div><div class="math mono" id="su-math"></div><div class="goal" id="su-goal"></div>`; }
  suB() {
    const S = this.su;
    document.querySelectorAll('[data-env]').forEach((b) => (b.onclick = () => { S.env = b.dataset.env; this.applyCamo(); sfx.select(); this.render(); }));
    document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => { S.M = +b.dataset.act; this.render(); }));
    document.querySelectorAll('[data-vis]').forEach((b) => (b.onclick = () => this.setVision(+b.dataset.vis)));
    this.bindSliders(S, [['u-a', 'a', (v) => Math.round(v * 100) + ' %'], ['u-T', 'Tenv', (v) => v + ' °C'], ['u-clo', 'clo', (v) => f1(v) + ' clo'], ['u-eps', 'eps', f2], ['u-cool', 'cooling', (v) => v + ' W']], (k) => { if (k === 'a') { clearTimeout(this.ct); this.ct = setTimeout(() => this.applyCamo(), 40); } });
  }
  setVision(v) { this.su.vision = v; this.app.stage.grade.uniforms.uVision.value = v; sfx.select(); if (this.tab === 'suit') this.render(); }
  suLive() {
    const S = this.su, pal = this.suitPal(), de = camoMatch(pal, ENVS[S.env]), th = thermal(S);
    const big = $('#su-big'); if (big) big.innerHTML = `<div><b class="mono ${de < 6 ? 'c-green' : de < 15 ? 'c-amber' : 'c-red'}">${f1(de)}</b><small>ΔE*ab</small></div><div><b class="mono ${Math.abs(th.dT) < 2 ? 'c-green' : 'c-amber'}">${th.dT >= 0 ? '+' : ''}${f1(th.dT)} K</b><small>${t('su.contrast')}</small></div><div><b class="mono ${th.minsToPlus1 >= 45 ? 'c-green' : 'c-red'}">${th.minsToPlus1 === Infinity ? '∞' : f0(th.minsToPlus1)}</b><small>${t('su.heat')}</small></div>`;
    const sw = $('#su-sw'); if (sw) sw.innerHTML = `<div><small>${t('su.suitPal')}</small>${pal.map((c) => `<i style="background:${c}"></i>`).join('')}</div><div><small>${t('env.' + S.env)}</small>${ENVS[S.env].map((c) => `<i style="background:${c}"></i>`).join('')}</div>`;
    const m = $('#su-math');
    if (m) m.innerHTML = `<div>sRGB → XYZ → L*a*b* · ΔE*ab = √(ΔL*² + Δa*² + Δb*²) = <b>${f1(de)}</b> (${de < 2.3 ? t('su.jnd') : de < 6 ? t('su.close') : t('su.visible')})</div>
      <div>q = (T<sub>skin</sub> − T<sub>env</sub>)/(R<sub>suit</sub> + R<sub>surf</sub>) = (34 − ${S.Tenv})/(${f2(S.clo * 0.155)} + 0.077) = <b>${f1(th.q)} W/m²</b></div>
      <div>T<sub>surface</sub> = <b>${f1(th.Ts)} °C</b> · T<sub>app</sub> = (εT<sub>s</sub>⁴ + (1−ε)T<sub>env</sub>⁴)<sup>¼</sup> = <b>${f1(th.Tapp)} °C</b> · M = εσT⁴ = ${f0(th.Mexit)} W/m²</div>
      <div>${t('su.store')} M − qA − P<sub>cool</sub> = ${S.M} − ${f0(th.q * 1.9)} − ${S.cooling} = <b>${f0(th.store)} W</b> → <b>${f2(th.rate)} °C/h</b></div>`;
    const ok = de < 6 && Math.abs(th.dT) < 2 && th.minsToPlus1 >= 45 && S.M >= 260; if (ok) this.done('camo');
    const g = $('#su-goal'); if (g) g.innerHTML = `${badge(this.goal.camo)} ${t('goal.camo')}`;
    // Thermal view: the suit glows in proportion to its apparent temperature contrast.
    const k = Math.max(0, Math.min(1, th.dT / 8)), hot = S.vision === 2; OM.suit.emissive.setScalar(hot ? 0.9 * k : 0); OM.gear.emissive.setScalar(hot ? 0.5 * k : 0); OM.suit.color.setScalar(hot ? 0.25 + 0.75 * k : 1); OM.gear.color.set(hot ? '#0e0f11' : '#23262b');
  }

  // ═══ INFILTRATE ═══
  resetMission() {
    this.mi = { state: 'ready', pos: START.clone(), head: Math.PI, stance: 'stand', run: false, dl: 0, t: 0, auto: false, ai: 0, phase: 0, noise: 0, light: 0, vis: 0, surf: 'concrete', alerts: 0 };
    this.guards?.forEach((g, i) => { g.pos.set(g.path[0][0], 0, g.path[0][1]); g.wp = 1; g.D = 0; g.state = 'patrol'; g.pause = i * 0.7; g.target = null; });
  }
  inP() {
    const I = this.mi;
    return `<header class="lv-head mono">${t('in.title')}</header><p class="intro">${t('in.intro')}</p>
      <div class="brief mono">${t('in.obj')}</div>
      <div class="chips"><button class="btn primary" id="i-go">${I.state === 'ready' ? '▶ ' + t('in.start') : '↺ ' + t('in.restart')}</button><button class="btn seg" id="i-auto">${t('in.auto')}</button></div>
      <header class="lv-sub mono">${t('in.stance')}</header>${this.chips('st', ['stand', 'crouch', 'crawl'], I.stance, (k) => t('st.' + k))}
      <p class="small">${t('in.keys')}</p><div class="status mono" id="i-status"></div>`;
  }
  inS() { return `<header class="lv-head mono">${t('in.read')}</header><canvas class="cv map" id="cv-map"></canvas><div class="meters" id="i-meters"></div><div class="math mono" id="i-math"></div><div class="goal" id="i-goal"></div>`; }
  inB() {
    $('#i-go').onclick = () => { this.resetMission(); this.mi.state = 'go'; sfx.confirm(); this.caption('cap.go'); this.render(); };
    $('#i-auto').onclick = () => this.autoRun();
    document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { this.mi.stance = b.dataset.st; sfx.select(); this.render(); }));
  }
  autoRun() { this.resetMission(); this.mi.state = 'go'; this.mi.auto = true; this.mi.stance = 'crouch'; sfx.confirm(); this.caption('cap.auto'); this.render(); }
  surfaceAt(x, z) { for (const Z of ZONES) if (x >= Z.b[0] && x <= Z.b[2] && z >= Z.b[1] && z <= Z.b[3]) return Z.s; return 'concrete'; }
  lightAt(x, z) {
    let L = 0.08; for (const l of this.W.lamps) { const d = Math.hypot(x - l.x, z - l.z); if (d < l.r) L += l.I * (1 - d / l.r) ** 2; }
    const p = this.W.pool.position; if (Math.hypot(x - p.x, z - p.z) < 2.6) L += 1.4; return Math.min(1.6, L);
  }
  los(a, b, h) { for (const o of this.W.obstacles) if (o[4] >= h && segHitsBox(a.x, a.z, b.x, b.z, o)) return false; return true; }
  missionStep(dt) {
    const I = this.mi; if (I.state !== 'go' && I.state !== 'dl' && I.state !== 'exfil') return;
    I.t += dt;
    // Movement: keyboard or autopilot.
    let mx = 0, mz = 0;
    if (I.auto) { const tgt = I.state === 'exfil' ? null : ROUTE[Math.min(I.ai, ROUTE.length - 1)]; if (tgt && I.state === 'go') { const dx = tgt[0] - I.pos.x, dz = tgt[1] - I.pos.z, d = Math.hypot(dx, dz); if (d < 0.4) I.ai++; else { mx = dx / d; mz = dz / d; } } }
    else { if (this.keys.has('w') || this.keys.has('arrowup')) mz -= 1; if (this.keys.has('s') || this.keys.has('arrowdown')) mz += 1; if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1; if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1; I.run = this.keys.has('shift') && I.stance === 'stand'; }
    const mv = Math.hypot(mx, mz), gait = I.run ? 'run' : GAIT_OF[I.stance], v = GAITS[gait].v * (I.auto ? 3.5 : 1);   // the demo route runs as a 3.5× time-lapse
    if (mv > 0 && I.state !== 'dl') { mx /= mv; mz /= mv; I.pos.x += mx * v * dt; I.pos.z += mz * v * dt; I.head = Math.atan2(mx, mz); I.phase += dt * v * 4.2; }
    // Collisions (circle r = 0.3 vs boxes) and the fence.
    for (const o of this.W.obstacles) { const cx = Math.max(o[0], Math.min(I.pos.x, o[2])), cz = Math.max(o[1], Math.min(I.pos.z, o[3])), dx = I.pos.x - cx, dz = I.pos.z - cz, d = Math.hypot(dx, dz); if (d < 0.3) { if (d > 1e-6) { I.pos.x = cx + (dx / d) * 0.3; I.pos.z = cz + (dz / d) * 0.3; } else I.pos.z = o[3] + 0.3; } }
    I.pos.x = Math.max(-31, Math.min(31, I.pos.x)); I.pos.z = Math.max(-31, Math.min(31, I.pos.z));
    I.moving = mv > 0; I.surf = this.surfaceAt(I.pos.x, I.pos.z); I.light = this.lightAt(I.pos.x, I.pos.z);
    I.noise = I.moving ? footstep({ gait, surf: I.surf, amb: 'rain', soles: this.ac.soles }).r : 0;
    I.vis = visibility({ light: I.light, camo: this.camoNow(), stance: I.stance, moving: I.moving });
    // Objective.
    const dGoal = Math.hypot(I.pos.x - GOAL.x, I.pos.z - (GOAL.z + 1.2));
    if (I.state === 'go' && dGoal < 1.4) { I.state = 'dl'; this.caption('cap.dl'); }
    if (I.state === 'dl') { I.dl += dt / 4; if (dGoal > 1.6) I.state = 'go'; if (I.dl >= 1) { I.state = 'exfil'; sfx.confirm(); this.caption('cap.exfil'); this.app.feed.push('in.got', 'ok'); } }
    if (I.state === 'exfil') { if (I.auto) { const route = [...ROUTE].reverse().concat([[START.x, START.z]]); I.bi = I.bi ?? 0; const tg = route[Math.min(I.bi, route.length - 1)], dx = tg[0] - I.pos.x, dz = tg[1] - I.pos.z, d = Math.hypot(dx, dz); if (d < 0.4) I.bi++; else { I.pos.x += (dx / d) * v * dt; I.pos.z += (dz / d) * v * dt; I.head = Math.atan2(dx, dz); I.phase += dt * v * 4.2; I.moving = true; } }
      if (Math.hypot(I.pos.x - START.x, I.pos.z - START.z) < 1.6) { I.state = 'done'; this.done('mission'); this.app.feed.push('in.win', 'ok', { t: f0(I.t) }); this.caption('cap.win'); this.render(); } }
    // Guards.
    for (const g of this.guards) {
      const toP = new THREE.Vector3().subVectors(I.pos, g.pos), dist = toP.length(), R = 13;
      if (g.state === 'alert') continue;
      // Hearing.
      if (I.noise > dist && g.state === 'patrol') { g.state = 'investigate'; g.target = I.pos.clone(); g.pause = 1.2; this.app.feed.push('in.heard', 'warn'); }
      // Sight.
      const ang = Math.atan2(toP.x, toP.z), da = Math.atan2(Math.sin(ang - g.head), Math.cos(ang - g.head));
      const sees = dist < R && Math.abs(da) < 0.87 && this.los(g.pos, I.pos, HEIGHT[I.stance] - 0.05);
      if (sees) g.D += dt * 2.6 * I.vis * (1 - dist / R) ** 2 * (I.auto ? 0 : 1); else g.D = Math.max(0, g.D - dt * 0.2);
      if (g.D > 0.35 && g.state === 'patrol') { g.state = 'investigate'; g.target = I.pos.clone(); g.pause = 1.5; }
      if (g.D >= 1) { g.state = 'alert'; I.state = 'alert'; I.alerts++; this.app.stage.flash?.('#ff3355'); sfx.select(); this.caption('cap.alert'); this.app.feed.push('in.spotted', 'warn'); this.render(); }
      // Movement.
      let tgt = g.state === 'investigate' ? g.target : new THREE.Vector3(g.path[g.wp][0], 0, g.path[g.wp][1]);
      if (g.pause > 0) { g.pause -= dt; if (g.state === 'investigate' && g.target) g.head += Math.atan2(Math.sin(Math.atan2(g.target.x - g.pos.x, g.target.z - g.pos.z) - g.head), Math.cos(Math.atan2(g.target.x - g.pos.x, g.target.z - g.pos.z) - g.head)) * Math.min(1, dt * 3); }
      else {
        const d = new THREE.Vector3().subVectors(tgt, g.pos); d.y = 0; const L = d.length();
        if (L < 0.3) { if (g.state === 'investigate') { g.state = 'patrol'; g.pause = 2.5; g.D *= 0.5; } else { g.wp = (g.wp + 1) % g.path.length; g.pause = 1.2; } }
        else { const sp = g.state === 'investigate' ? 1.8 : 1.15; g.pos.addScaledVector(d.normalize(), sp * dt); const hd = Math.atan2(d.x, d.z); g.head += Math.atan2(Math.sin(hd - g.head), Math.cos(hd - g.head)) * Math.min(1, dt * 4); g.phase += dt * sp * 4; }
      }
    }
  }
  drawGuards(time) {
    for (const g of this.guards) {
      const U = g.m.userData, sweep = g.state === 'patrol' ? 0.35 * Math.sin(time * 0.8 + g.phase) : 0;
      g.m.position.copy(g.pos); g.m.rotation.y = g.head + sweep + Math.PI; g.lookHead = g.head + sweep;
      U.cone.scale.set(13, 13, 1); U.cone.material.color.set(g.state === 'alert' ? RD : g.D > 0.35 ? '#ff9a3c' : AM); U.cone.material.opacity = 0.1 + 0.25 * Math.min(1, g.D);
      U.legs.forEach((l, i) => (l.rotation.x = Math.sin(g.phase + i * Math.PI) * 0.5)); U.mark.material.opacity = g.state === 'patrol' ? 0 : 0.9; U.mark.material.color.set(g.state === 'alert' ? RD : AM);
      g.m.visible = this.tab === 'infiltrate';
    }
    // Use the swept head direction for sight from now on.
    for (const g of this.guards) g.headSight = g.lookHead;
  }
  inLive(full) {
    const I = this.mi, st = $('#i-status');
    if (st) st.innerHTML = `${t('in.state.' + I.state)}${I.state === 'dl' ? ` · ${f0(I.dl * 100)}%` : ''} · ${t('in.time')} ${f0(I.t)} s`;
    const me = $('#i-meters');
    if (me) me.innerHTML = this.guards.map((g, i) => `<div class="mt" style="--c:${g.D >= 1 ? RD : g.D > 0.35 ? '#ff9a3c' : AM}"><span>${t('in.guard')} ${i + 1}</span><i><b style="width:${Math.min(100, g.D * 100)}%"></b></i><em class="mono">${t('gs.' + g.state)}</em></div>`).join('');
    this.drawMap();
    if (!full) return;
    const m = $('#i-math'), cf = this.camoNow();
    if (m) m.innerHTML = `<div>${t('in.light')} <b>${f2(I.light)}</b> · ${t('in.camo')} <b>${f2(cf)}</b> · ${t('st.' + I.stance)} ×${STANCE[I.stance]} · ${I.moving ? t('in.moving') + ' ×1.5' : t('in.still')}</div>
      <div>v = light·(1 − 0.85·camo)·stance·motion = <b>${f2(I.vis)}</b></div><div>dD/dt = 2.6·v·(1 − r/R)² ${t('in.inCone')} · D ≥ 1 → ${t('in.alert')}</div>
      <div>${t('in.surface')} <b>${t('surf.' + I.surf)}</b> · ${t('in.noise')} r = 10^((L₁ − L<sub>rain</sub> − 3)/20) = <b>${f1(I.noise)} m</b></div>`;
    const g = $('#i-goal'); if (g) g.innerHTML = `${badge(this.goal.mission)} ${t('goal.mission')}`;
  }
  drawMap() {
    const cv = $('#cv-map'); if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, s = Math.min(W, H) / 66, X = (x) => W / 2 + x * s, Z = (z) => H / 2 + z * s;
    g.fillStyle = 'rgba(4,10,14,.9)'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(93,255,168,.12)'; for (let i = -30; i <= 30; i += 5) { g.beginPath(); g.moveTo(X(i), Z(-32)); g.lineTo(X(i), Z(32)); g.moveTo(X(-32), Z(i)); g.lineTo(X(32), Z(i)); g.stroke(); }
    for (const Zn of ZONES) { g.fillStyle = Zn.s === 'gravel' ? 'rgba(140,130,110,.18)' : Zn.s === 'grating' ? 'rgba(120,140,170,.2)' : 'rgba(80,140,70,.18)'; g.fillRect(X(Zn.b[0]), Z(Zn.b[1]), (Zn.b[2] - Zn.b[0]) * s, (Zn.b[3] - Zn.b[1]) * s); }
    for (const l of this.W.lamps) { const gr = g.createRadialGradient(X(l.x), Z(l.z), 0, X(l.x), Z(l.z), l.r * s); gr.addColorStop(0, 'rgba(255,176,90,.35)'); gr.addColorStop(1, 'rgba(255,176,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X(l.x), Z(l.z), l.r * s, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(160,175,190,.55)'; for (const o of this.W.obstacles) g.fillRect(X(o[0]), Z(o[1]), (o[2] - o[0]) * s, (o[3] - o[1]) * s);
    const p = this.W.pool.position; g.fillStyle = 'rgba(220,232,255,.35)'; g.beginPath(); g.arc(X(p.x), Z(p.z), 2.6 * s, 0, 7); g.fill();
    for (const gd of this.guards) { const h = gd.headSight ?? gd.head; g.fillStyle = gd.state === 'alert' ? 'rgba(255,68,102,.35)' : gd.D > 0.35 ? 'rgba(255,154,60,.3)' : 'rgba(255,209,102,.18)'; g.beginPath(); g.moveTo(X(gd.pos.x), Z(gd.pos.z)); for (let a = -0.87; a <= 0.87; a += 0.1) g.lineTo(X(gd.pos.x + Math.sin(h + a) * 13), Z(gd.pos.z + Math.cos(h + a) * 13)); g.closePath(); g.fill(); g.fillStyle = gd.state === 'alert' ? RD : AM; g.beginPath(); g.arc(X(gd.pos.x), Z(gd.pos.z), 3.5, 0, 7); g.fill(); }
    g.strokeStyle = '#3dffb0'; g.lineWidth = 2; g.strokeRect(X(GOAL.x) - 5, Z(GOAL.z) - 5, 10, 10); g.strokeStyle = BL; g.beginPath(); g.arc(X(START.x), Z(START.z), 1.7 * s, 0, 7); g.stroke();
    const I = this.mi; if (I.noise > 0.1) { g.strokeStyle = 'rgba(255,209,102,.7)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(X(I.pos.x), Z(I.pos.z), I.noise * s, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = G; g.shadowColor = G; g.shadowBlur = 10; g.beginPath(); g.arc(X(I.pos.x), Z(I.pos.z), 4, 0, 7); g.fill(); g.shadowBlur = 0;
  }

  // ═══ ACOUSTICS ═══
  acP() {
    const A = this.ac;
    return `<header class="lv-head mono">${t('ac.title')}</header><p class="intro">${t('ac.intro')}</p>
      <header class="lv-sub mono">${t('ac.gait')}</header>${this.chips('ga', Object.keys(GAITS), A.gait, (k) => t('gait.' + k))}
      <header class="lv-sub mono">${t('ac.surf')}</header>${this.chips('sf', Object.keys(SURF), A.surf, (k) => t('surf.' + k))}
      <header class="lv-sub mono">${t('ac.amb')}</header>${this.chips('am', Object.keys(AMB), A.amb, (k) => t('amb.' + k))}
      ${this.slider('a-sole', t('ac.soles'), A.soles, 0, 15, 1, A.soles + ' dB')}`;
  }
  acS() { return `<header class="lv-head mono">${t('ac.read')}</header><div class="bigstats" id="ac-big"></div><canvas class="cv chart" id="cv-spl"></canvas><div class="math mono" id="ac-math"></div><div class="goal" id="ac-goal"></div>`; }
  acB() {
    const A = this.ac;
    for (const [n, k] of [['ga', 'gait'], ['sf', 'surf'], ['am', 'amb']]) document.querySelectorAll(`[data-${n}]`).forEach((b) => (b.onclick = () => { A[k] = b.dataset[n]; sfx.select(); this.render(); }));
    this.bindSliders(A, [['a-sole', 'soles', (v) => v + ' dB']]);
  }
  acLive(full) {
    if (!full) return;
    const A = this.ac, F = footstep(A), big = $('#ac-big');
    if (big) big.innerHTML = `<div><b class="mono">${f0(F.L1)}</b><small>dB SPL @ 1 m</small></div><div><b class="mono ${F.r < 3 ? 'c-green' : F.r < 10 ? 'c-amber' : 'c-red'}">${f1(F.r)} m</b><small>${t('ac.radius')}</small></div><div><b class="mono">${f1(F.v)}</b><small>m/s</small></div>`;
    const pts = []; for (let r = 0.2; r <= 60; r *= 1.06) pts.push([r, F.at(r)]);
    lineChart($('#cv-spl'), { x0: 0, x1: 60, y0: 0, y1: 90, xFmt: (x) => f0(x) + ' m', yFmt: (y) => f0(y), title: t('ac.chart'), series: [{ pts, color: AM, label: t('ac.step') }], marks: [{ y: F.La, color: BL, label: t('amb.' + A.amb) }, { x: F.r, color: G }] });
    const m = $('#ac-math');
    if (m) m.innerHTML = `<div>L₁ = ${GAITS[A.gait].L} (${t('gait.' + A.gait)}) ${SURF[A.surf] >= 0 ? '+' : '−'} ${Math.abs(SURF[A.surf])} (${t('surf.' + A.surf)}) − ${A.soles} (${t('ac.soleS')}) = <b>${F.L1} dB</b></div>
      <div>L(r) = L₁ − 20·log₁₀ r · ${t('ac.heard')} L(r) ≥ L<sub>amb</sub> + 3</div><div>r = 10^((${F.L1} − ${F.La} − 3)/20) = <b>${f1(F.r)} m</b></div>
      <div class="small">${t('ac.note')}</div>`;
    if (A.gait === 'walk' && A.surf === 'concrete' && A.amb === 'night' && F.r < 3) this.done('sound');
    const g = $('#ac-goal'); if (g) g.innerHTML = `${badge(this.goal.sound)} ${t('goal.sound')}`;
  }

  // ═══ COMMS ═══
  cmP() {
    const C = this.cm;
    return `<header class="lv-head mono">${t('cm.title')}</header><p class="intro">${t('cm.intro')}</p>
      ${this.slider('c-p', t('cm.ptx'), C.ptx, -10, 40, 1, C.ptx + ' dBm')}${this.slider('c-f', t('cm.f'), C.f, 30, 2400, 10, C.f + ' MHz')}${this.slider('c-d', t('cm.d'), C.d, 0.5, 30, 0.5, f1(C.d) + ' km')}
      <header class="lv-sub mono">${t('cm.ant')}</header>${this.chips('an', [2, 12], C.gtx, (k) => t('ant.' + k))}
      <header class="lv-sub mono">${t('cm.spread')}</header>${this.chips('sp', [1, 16, 64, 256, 1024], C.spread, (k) => k + '×')}
      ${this.slider('c-tau', t('cm.tau'), C.tau, 0.1, 5, 0.1, f1(C.tau) + ' s')}${this.slider('c-e', t('cm.de'), C.dEnemy, 0.5, 10, 0.5, f1(C.dEnemy) + ' km')}
      <button class="btn primary wide" id="c-tx">◉ ${t('cm.tx')}</button>`;
  }
  cmS() { return `<header class="lv-head mono">${t('cm.read')}</header><div class="bigstats" id="cm-big"></div><canvas class="cv chart" id="cv-link"></canvas><div class="math mono" id="cm-math"></div><div class="goal" id="cm-goal"></div>`; }
  cmB() {
    const C = this.cm;
    this.bindSliders(C, [['c-p', 'ptx', (v) => v + ' dBm'], ['c-f', 'f', (v) => v + ' MHz'], ['c-d', 'd', (v) => f1(v) + ' km'], ['c-tau', 'tau', (v) => f1(v) + ' s'], ['c-e', 'dEnemy', (v) => f1(v) + ' km']]);
    document.querySelectorAll('[data-an]').forEach((b) => (b.onclick = () => { C.gtx = +b.dataset.an; sfx.select(); this.render(); }));
    document.querySelectorAll('[data-sp]').forEach((b) => (b.onclick = () => { C.spread = +b.dataset.sp; sfx.select(); this.render(); }));
    $('#c-tx').onclick = () => this.transmit();
  }
  transmit() { this.txT = 0; const L = link(this.cm); sfx.confirm(); const clean = L.margin >= 10 && L.eMargin < 0 && L.pIntercept < 0.05; this.app.feed.push(L.margin < 10 ? 'cm.lost' : clean ? 'cm.clean' : 'cm.heard', clean ? 'ok' : 'warn'); if (L.margin >= 10 && L.eMargin < 0 && L.pIntercept < 0.05) this.done('comms'); }
  cmLive(full) {
    if (!full) return;
    const C = this.cm, L = link(C), big = $('#cm-big');
    if (big) big.innerHTML = `<div><b class="mono ${L.margin >= 10 ? 'c-green' : 'c-red'}">${L.margin >= 0 ? '+' : ''}${f1(L.margin)}</b><small>${t('cm.margin')} dB</small></div><div><b class="mono ${L.eMargin < 0 ? 'c-green' : 'c-red'}">${L.eMargin >= 0 ? '+' : ''}${f1(L.eMargin)}</b><small>${t('cm.emargin')} dB</small></div><div><b class="mono ${L.pIntercept < 0.05 ? 'c-green' : 'c-amber'}">${f1(L.pIntercept * 100)}%</b><small>${t('cm.pint')}</small></div>`;
    const fr = [], en = []; for (let d = 0.2; d <= 30; d += 0.2) { fr.push([d, link({ ...C, d }).prx]); en.push([d, link({ ...C, dEnemy: d }).pEnemy - L.Gp]); }
    lineChart($('#cv-link'), { x0: 0, x1: 30, y0: -150, y1: -30, xFmt: (x) => f0(x) + ' km', yFmt: (y) => f0(y), title: t('cm.chart'), series: [{ pts: fr, color: G, label: t('cm.base') }, { pts: en, color: RD, label: t('cm.enemy'), dash: [4, 3] }], marks: [{ y: L.sens, color: AM, label: t('cm.sens') }, { x: C.d, color: G }, { x: C.dEnemy, color: RD }] });
    const m = $('#cm-math');
    if (m) m.innerHTML = `<div>FSPL = 20log d + 20log f + 32.44 = <b>${f1(L.fspl)} dB</b> · P<sub>rx</sub> = ${C.ptx} + ${C.gtx} + 9 − ${f1(L.fspl)} − 12 = <b>${f1(L.prx)} dBm</b></div>
      <div>${t('cm.sensL')} = −174 + 10log(25 kHz) + 6 + 10 = <b>${f1(L.sens)} dBm</b> → ${t('cm.margin')} <b>${f1(L.margin)} dB</b></div>
      <div>G<sub>p</sub> = 10log(${C.spread}) = <b>${f1(L.Gp)} dB</b> · ${t('cm.side')} ${L.gSide} dBi → ${t('cm.emargin')} <b>${f1(L.eMargin)} dB</b></div>
      <div>P<sub>intercept</sub> = 1 − e<sup>−τ/T</sup> = 1 − e<sup>−${f1(C.tau)}/12</sup> = <b>${f1(L.pIntercept * 100)}%</b> · ${t('cm.hor')} 4.12(√2 + √30) = <b>${f1(L.horizon)} km</b></div>`;
    const g = $('#cm-goal'); if (g) g.innerHTML = `${badge(this.goal.comms)} ${t('goal.comms')}`;
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.2, Math.min(1.1, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(1.6, Math.min(14, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) {
    this.keys.add(k);
    if (k === 'n') this.setVision(this.su.vision === 1 ? 0 : 1); if (k === 't') this.setVision(this.su.vision === 2 ? 0 : 2);
    if (this.tab === 'infiltrate') { if (k === 'c') { this.mi.stance = this.mi.stance === 'crouch' ? 'stand' : 'crouch'; this.render(); } if (k === 'z') { this.mi.stance = this.mi.stance === 'crawl' ? 'stand' : 'crawl'; this.render(); } if (k === 'enter' && this.mi.state !== 'go') $('#i-go')?.click(); }
  }
  keyUp(k) { this.keys.delete(k); }

  update(dt, time) {
    this.time = time; const W = this.W, v = this.view, tab = this.tab, op = this.op;
    // Rain, searchlight sweep.
    const R = W.rain.geometry.attributes.position.array; for (let i = 1; i < R.length; i += 3) { R[i] -= dt * 14; if (R[i] < 0) R[i] += 25; } W.rain.geometry.attributes.position.needsUpdate = true;
    const sa = time * 0.35, sx = 18 + Math.cos(sa) * -14, sz = Math.sin(sa) * 14; W.search.target.position.set(sx, 0, sz); W.pool.position.set(sx, 0.03, sz);
    const from = W.search.position, to = new THREE.Vector3(sx, 0, sz), mid = from.clone().add(to).multiplyScalar(0.5), len = from.distanceTo(to); W.beam.position.copy(mid); W.beam.scale.set(1, len, 1); W.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
    W.scr.material.color.setHSL(0.42, 1, 0.4 + 0.15 * Math.sin(time * 6));
    // Operative per tab.
    let speed = 0, stance = 'stand', phase = time * 4;
    if (tab === 'infiltrate') { this.missionStep(dt); const I = this.mi; op.position.set(I.pos.x, 0, I.pos.z); op.rotation.y = I.head; stance = I.stance; speed = I.moving ? GAITS[I.run ? 'run' : GAIT_OF[I.stance]].v : 0; phase = I.phase; }
    else if (tab === 'acoustics') { speed = GAITS[this.ac.gait].v; stance = this.ac.gait === 'crouch' ? 'crouch' : this.ac.gait === 'crawl' ? 'crawl' : 'stand'; phase = time * speed * 4.2; op.rotation.y = time * 0.25; }
    else if (tab === 'comms') stance = 'crouch';
    poseOp(op, time, { stance, speed, phase, nvg: this.su.vision === 1 ? 1 : 0, wind: 0.6 });
    this.drawGuards(time);
    // Noise ring and pulses.
    const nr = tab === 'infiltrate' ? this.mi.noise : tab === 'acoustics' ? footstep(this.ac).r : 0;
    W.noise.visible = nr > 0.05; W.noise.position.set(op.position.x, 0.05, op.position.z); W.noise.scale.setScalar(Math.max(0.05, nr));
    this.txT = (this.txT ?? 99) + dt;
    W.pulses.forEach((p, i) => {
      if (tab === 'acoustics') { const ph = (time * GAITS[this.ac.gait].v * 0.7 + i / 4) % 1; p.position.set(op.position.x, 0.06, op.position.z); p.scale.setScalar(0.1 + ph * Math.min(40, footstep(this.ac).r)); p.material.opacity = 0.7 * (1 - ph); p.material.color.set(AM); }
      else if (tab === 'comms' && this.txT < 3) { const ph = Math.min(1, this.txT / 3 + i * 0.12); p.position.set(op.position.x, op.position.y + 0.1, op.position.z); p.scale.setScalar(1 + ph * 40); p.material.opacity = 0.8 * (1 - ph); p.material.color.set(BL); }
      else p.material.opacity = 0;
    });
    // Camera.
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.12;
    let look, cp;
    if (tab === 'infiltrate') { look = op.position.clone().add(new THREE.Vector3(0, 0.6, 0)); cp = look.clone().add(new THREE.Vector3(Math.sin(v.yaw * 0.2) * 3, 11, 8)); }
    else if (tab === 'acoustics') { look = new THREE.Vector3(0, 0.9, 27); const r = 9 + 0.5 * v.r; cp = look.clone().add(new THREE.Vector3(Math.sin(v.yaw) * r, 4.5, Math.cos(v.yaw) * r)); }
    else if (tab === 'comms') { look = op.position.clone().add(new THREE.Vector3(0, 0.6, 0)); cp = look.clone().add(new THREE.Vector3(Math.sin(v.yaw) * 7, 3, Math.cos(v.yaw) * 7)); }
    else { look = new THREE.Vector3(0, 1.0, 27); cp = look.clone().add(new THREE.Vector3(Math.sin(v.yaw * 0.5) * v.r, 0.2 + Math.sin(v.pitch) * v.r * 0.6, Math.cos(v.yaw * 0.5) * v.r)); }
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.1) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'suit' && full) this.suLive();
    if (this.tab === 'infiltrate') this.inLive(full);
    if (this.tab === 'acoustics') this.acLive(full);
    if (this.tab === 'comms') this.cmLive(full);
    if (full) this.statusBar();
  }

  showReport() {
    const rows = ['camo', 'mission', 'sound', 'comms'].map((k) => [t('rep.' + k), this.goal[k]]);
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-title').textContent = sc === 100 ? t('rep.ready') : t('rep.notReady');
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US'), a: this.mi.alerts });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
export { dE };
