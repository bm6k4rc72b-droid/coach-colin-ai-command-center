import * as THREE from 'three';
import { makeFlock, stepFlock, flockStats, waterNeed, intake, P as BOIDS, N_SHEEP, CORE_T, FEVER_T } from './sim/flock.js';
import { makePaddocks, stepPasture, planRotation, capacity, grazeDays, regrowDays, ndvi, SEASONS, B_RES, B_IN, EWE_AU, AU_DAY } from './sim/pasture.js';
import { DRONES, CAMERAS, PART107, power, enduranceMin, bestSpeeds, footprint, gsd, hfov, johnsonP, maxAltFor, lawnmower, podRandom, podSweep, rules, airDensity, G0 } from './sim/drone.js';
import { buildWorld, heightAt, BARN, PEN, TANK } from './view/world.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// RANCH OPS · the app: flock, pasture, drone survey, night watch.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '∞'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '∞');
const DEG = 180 / Math.PI;
const HOME = { x: TANK.x + 14, z: TANK.z + 4 };                // drone landing pad
const LOST = { x: 118, z: 152 };                              // where the missing ewe is caught in the brush
const AREAS = { active: null, all: { x0: -150, x1: 150, z0: -40, z1: 120 }, ranch: { x0: -190, x1: 190, z0: -60, z1: 190 } };
const SHEEP_D = 0.7, COYOTE_D = 0.5;                           // critical dimensions for the Johnson criteria (m)
const MAP = { x0: -260, x1: 260, z0: -150, z1: 270 };

export class Ranch {
  constructor(app) {
    this.app = app;
    this.pads = makePaddocks(); this.active = this.pads[0];
    this.W = buildWorld(this.pads);
    this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 30000); this.scene.add(this.cam);
    this.view = { yaw: 2.6, pitch: 0.3, r: 58, focus: new THREE.Vector3(), want: new THREE.Vector3(), drag: null, last: 0, mode: 'orbit' };
    this.sheep = makeFlock(this.active, LOST);
    for (const s of this.sheep) { s.rnd = ((s.id * 0.6180339) % 1); s.rnd2 = ((s.id * 0.4142135 + 0.3) % 1); }
    const st = flockStats(this.sheep);
    this.dog = { x: st.cx - 25, z: st.cz - 10, heading: 0, speed: 0, mode: 'guard', target: null };
    this.coy = [{ x: 60, z: 230, heading: Math.PI, speed: 0, state: 'hidden', seen: false, near: 0 }, { x: 78, z: 238, heading: Math.PI, speed: 0, state: 'hidden', seen: false, near: 0 }];
    this.drone = { x: HOME.x, y: heightAt(HOME.x, HOME.z) + 0.3, z: HOME.z, vx: 0, vy: 0, vz: 0, heading: 0, tilt: 0, mode: 'idle', E: 0, wp: [], wi: 0, flightT: 0, dist: 0, maxDist: 0, violations: new Set(), lights: true, spot: false, siren: false, gimbal: -90 };
    this.cfg = { airframe: 'scout', camera: 'thermal', alt: 60, V: 10, sidelap: 0.2, area: 'ranch', wind: 4, observer: false, warp: 8 };
    this.drone.E = DRONES.scout.batteryWh * 3600;
    this.boids = { wSep: BOIDS.wSep, wAli: BOIDS.wAli, wCoh: BOIDS.wCoh };
    this.season = 'spring'; this.day = 1; this.tankL = 5000; this.airC = 21;
    this.survey = { counted: new Set(), fever: new Set(), lame: new Set(), found: false, done: false, looks: 0 };
    this.goal = null; this.route = []; this.log = []; this.watchT = 0; this.losses = 0; this.threat = 0;
    this.tab = 'flock'; this.entered = false; this.uiT = 0; this.uiSlow = 0; this.time = 0; this.ndviView = false; this.thermal = false;
    this.score = { spook: false, ndvi: false, rotate: false, survey: false, count: false, lost: false, fever: false, legal: true, flights: 0, deter: false, noLoss: true, pen: false };
    app.stage.use(this.scene, this.cam);
    this.setHour(17.3);
    this.update(0, 0);
  }

  // ── Time of day / thermal ───────────────────────────
  setHour(h) { this.hour = h; const r = this.W.setTime(h); this.airC = r.night ? 9 : 21; this.app.stage.renderer.toneMappingExposure = r.night ? 1.7 : 0.62; if (this.thermal) this.W.setThermal(true, this.airC, this.sheep); }
  setThermal(on) { this.thermal = on; this.W.setThermal(on, this.airC, this.sheep); this.app.stage.grade.uniforms.uHolo.value = on ? 0.1 : 0.4; }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    const was = this.tab; this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab === 'watch' && was !== 'watch') this.startWatch();
    if (tab !== 'watch' && was === 'watch') this.endWatch();
    if (tab === 'drone') { this.view.mode = this.drone.mode === 'idle' ? 'orbit' : 'drone'; this.setThermal(this.cfg.camera === 'thermal' && this.view.mode === 'drone'); }
    else if (tab !== 'watch') { this.view.mode = 'orbit'; this.setThermal(false); }
    if (tab === 'pasture') { this.view.pitch = 0.95; this.view.r = 430; this.view.yaw = 3.14; }
    if (tab === 'flock') { this.view.pitch = 0.3; this.view.r = 58; }
    this.W.paintTerrain(tab === 'pasture' && this.ndviView ? 'ndvi' : 'natural');
    this.view.snap = true; this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { flock: ['flockPanel', 'flockSide', 'bindFlock'], pasture: ['pastPanel', 'pastSide', 'bindPast'], drone: ['dronePanel', 'droneSide', 'bindDrone'], watch: ['watchPanel', 'watchSide', 'bindWatch'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  push(key, level = 'ok', vars = {}) { this.app.feed.push(key, level, vars); const hh = Math.floor(this.hour), mm = Math.floor((this.hour % 1) * 60); this.log.unshift({ time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, text: t(key, vars), level }); if (this.log.length > 12) this.log.pop(); }
  chips(name, list, cur, label = (k) => t(name + '.' + k)) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  slider(id, label, v, min, max, step, unit) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${v}${unit}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }

  // ═══ FLOCK ══════════════════════════════════════════
  flockPanel() {
    return `<header class="lv-head mono">${t('f.title')}</header><p class="intro">${t('f.intro')}</p>
      <div class="vitals" id="f-vitals"></div>
      <header class="lv-sub mono">${t('f.boids')}</header>
      ${this.slider('f-sep', t('f.sep'), this.boids.wSep, 0, 6, 0.1, '')}${this.slider('f-ali', t('f.ali'), this.boids.wAli, 0, 2, 0.05, '')}${this.slider('f-coh', t('f.coh'), this.boids.wCoh, 0, 1.5, 0.05, '')}
      <div class="chips"><button class="btn primary" id="f-spook">${t('f.spook')}</button><button class="btn seg" id="f-reset">${t('f.resetW')}</button></div>
      <header class="lv-sub mono">${t('f.move')}</header>
      <div class="chips">${this.pads.map((p) => `<button class="btn seg ${p === this.active ? 'active' : ''}" data-mv="${p.id}">P${p.id}</button>`).join('')}</div>
      <p class="small">${t('f.moveHint')}</p>
      <header class="lv-sub mono">${t('f.health')}</header><ul class="alerts" id="f-health"></ul>`;
  }
  flockSide() {
    return `<header class="lv-head mono">${t('f.math')}</header><div class="math mono" id="f-math"></div>
      <header class="lv-sub mono">${t('f.feed')}</header><div class="math mono" id="f-feed"></div>
      <canvas class="cv chart" id="cv-w"></canvas>`;
  }
  bindFlock() {
    for (const [id, k] of [['f-sep', 'wSep'], ['f-ali', 'wAli'], ['f-coh', 'wCoh']]) $('#' + id).oninput = (e) => { this.boids[k] = +e.target.value; BOIDS[k] = this.boids[k]; $('#' + id + '-v').textContent = e.target.value; };
    $('#f-spook').onclick = () => this.spook();
    $('#f-reset').onclick = () => { Object.assign(this.boids, { wSep: 3.2, wAli: 0.55, wCoh: 0.35 }); Object.assign(BOIDS, this.boids); this.render(); };
    document.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => this.moveFlock(this.pads[+b.dataset.mv - 1])));
    const cv = $('#cv-w'); if (cv) { const ws = this.sheep.map((s) => s.w), bins = []; for (let w = 45; w <= 95; w += 2.5) bins.push([w, ws.filter((x) => x >= w - 1.25 && x < w + 1.25).length]); lineChart(cv, { x0: 45, x1: 95, y0: 0, y1: Math.max(...bins.map((b) => b[1])) + 2, xTicks: [50, 60, 70, 80, 90], xFmt: (v) => v + ' kg', yFmt: (v) => Math.round(v), title: t('f.wChart'), series: [{ pts: bins, color: '#5dffa8', label: t('f.ewes') }] }); }
  }
  spook() { this.dog.mode = 'spook'; const st = flockStats(this.sheep); const a = Math.random() * 6.28; this.dog.x = st.cx + Math.cos(a) * 45; this.dog.z = st.cz + Math.sin(a) * 45; this.dog.target = { x: st.cx - Math.cos(a) * 30, z: st.cz - Math.sin(a) * 30 }; this.score.spook = true; this.caption('cap.spook'); sfx.warn?.(); }
  // Drive the flock gate to gate: out of the current paddock (north-row paddocks open into the
  // paddock below), along the south lane, and in through the target's gate(s).
  exitRoute(pad) { const x = pad.gate.x, R = []; if (pad.z0 > 0) R.push({ x, z: pad.z0 + 6 }, { x, z: pad.z0 - 6 }); R.push({ x, z: -34 }, { x, z: -50 }); return R; }
  moveFlock(target) {
    if (target === this.active || this.goal || this.active.id === 'pen') return;
    const x = target.gate.x, R = [...this.exitRoute(this.active), { x, z: -50 }, { x, z: -34 }];
    if (target.z0 > 0) R.push({ x, z: 34 }, { x, z: 46 });
    R.push({ x: (target.x0 + target.x1) / 2, z: (target.z0 + target.z1) / 2 });
    this.route = R; this.goal = R.shift(); this.moving = target; this.dog.mode = 'drive'; this.score.rotate = true;
    this.push('f.moving', 'ok', { from: this.active.id, to: target.id }); sfx.confirm(); this.render();
  }
  flockLive(full) {
    const st = flockStats(this.sheep), v = $('#f-vitals'), B = this.boids;
    const known = this.survey.done ? this.survey.counted.size : null;
    if (v) v.innerHTML = [[t('f.count'), known === null ? '—' : `${known}/${N_SHEEP}`], [t('f.spread'), `${f1(st.rms)} m`], [t('f.pol'), f2(st.pol)], [t('f.threat'), `${Math.round(this.threat * 100)}%`]].map(([k, x]) => `<div class="vt"><small>${k}</small><b class="mono">${x}</b></div>`).join('');
    if (!full) return;
    const m = $('#f-math');
    if (m) m.innerHTML = `<div>s = Σ(pᵢ−pⱼ)/|pᵢ−pⱼ|² (r &lt; ${BOIDS.rSep} m) · a = v̄ⱼ − vᵢ · c = p̄ⱼ − pᵢ (R = ${BOIDS.rNb} m)</div>
      <div>F = <b>${f1(B.wSep)}</b>·s + <b>${f2(B.wAli)}</b>·a + <b>${f2(B.wCoh)}</b>·(1 + 5·fear)·c + ${BOIDS.wFlee}·flee</div>
      <div>${t('f.flight')}: ${t('f.dog')} ${BOIDS.dogR} m · ${t('f.coyote')} ${BOIDS.predR} m · v<sub>max</sub> ${BOIDS.graze}→${BOIDS.walk}→<b>${BOIDS.run} m/s</b></div>
      <div>${t('f.centroid')} (${f0(st.cx)}, ${f0(st.cz)}) · RMS r = √(Σ|pᵢ−p̄|²/n) = <b>${f1(st.rms)} m</b> · ${t('f.pol')} |Σv̂|/n = <b>${f2(st.pol)}</b></div>
      <div class="small">${t('f.herdWhy')}</div>`;
    const live = this.sheep.filter((s) => !s.dead), W = live.reduce((a, s) => a + s.w, 0) / live.length, I = live.reduce((a, s) => a + intake(s.w), 0), water = live.reduce((a, s) => a + waterNeed(s.w, this.airC + 4), 0);
    const fd = $('#f-feed');
    if (fd) fd.innerHTML = `<div>${t('f.meanW')} <b>${f1(W)} kg</b> · ${t('f.dmi')} = 2.7% × W = <b>${f2(intake(W))} kg DM</b>/${t('f.day')} → ${t('f.flockDmi')} <b>${f0(I)} kg DM/${t('f.day')}</b></div>
      <div>${t('f.water')} = (4·W/70 + 0.12·(T−15)) = <b>${f1(waterNeed(W, this.airC + 4))} L</b> → ${t('f.flockW')} <b>${f0(water)} L/${t('f.day')}</b></div>
      <div>${t('f.tank')} ${f0(this.tankL)} L → <b>${f1(this.tankL / water)} ${t('f.days')}</b> ${t('f.tankLeft')}</div>
      <div>${t('f.stock')}: ${live.length} × ${EWE_AU} AU = <b>${f1(live.length * EWE_AU)} AU</b> on P${this.active.id} (${this.active.ha} ha) → <b>${f0(live.length / this.active.ha)}</b> ${t('f.perHa')}</div>`;
    const h = $('#f-health');
    if (h) {
      const rows = [];
      for (const id of this.survey.fever) { const s = this.sheep[id]; rows.push(`<li class="bad"><span class="sev critical">${t('f.fever')}</span>${s.tag} · ${f1(s.core)} °C (${t('f.core')} > ${FEVER_T})</li>`); }
      for (const id of this.survey.lame) rows.push(`<li class="bad"><span class="sev high">${t('f.lame')}</span>${this.sheep[id].tag}</li>`);
      if (this.survey.found) rows.push(`<li class="ok"><span class="sev medium">${t('f.found')}</span>${this.sheep[104].tag}</li>`);
      h.innerHTML = rows.join('') || `<li class="empty">${t('f.noHealth')}</li>`;
    }
  }

  // ═══ PASTURE ════════════════════════════════════════
  pastPanel() {
    const N = this.sheep.filter((s) => !s.dead).length, I = intake(68), r = SEASONS[this.season];
    const rows = this.pads.map((p) => `<tr class="${p === this.active ? 'on' : ''}"><td>P${p.id}${p === this.active ? ' ●' : ''}</td><td>${f0(p.B)}</td><td>${f2(ndvi(p.B))}</td><td>${f0(p.rest)}</td><td>${f1(grazeDays(p, N, I))}</td><td>${p.B >= B_IN ? '✓' : f0(regrowDays(r, p.B, B_IN))}</td></tr>`).join('');
    return `<header class="lv-head mono">${t('p.title')}</header><p class="intro">${t('p.intro')}</p>
      ${this.chips('season', Object.keys(SEASONS), this.season)}
      <label class="toggle"><input type="checkbox" id="p-ndvi" ${this.ndviView ? 'checked' : ''}> <span>${t('p.ndvi')}</span></label>
      <table class="tbl mono"><thead><tr><th></th><th>kg DM/ha</th><th>NDVI</th><th>${t('p.rest')}</th><th>${t('p.gdays')}</th><th>${t('p.regrow')}</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="chips"><span class="small mono">${t('p.dayN', { d: this.day })}</span><button class="btn seg" id="p-d1">+1 ${t('f.day')}</button><button class="btn seg" id="p-d7">+7 ${t('f.days')}</button><button class="btn primary" id="p-best">${t('p.best')}</button></div>
      <p class="small">${t('p.rule', { res: B_RES, inn: B_IN })}</p>`;
  }
  pastSide() {
    return `<header class="lv-head mono">${t('p.plan')}</header><canvas class="cv chart tall" id="cv-plan"></canvas><div class="small mono" id="p-moves"></div>
      <header class="lv-sub mono">${t('p.math')}</header><div class="math mono" id="p-math"></div>`;
  }
  bindPast() {
    this.bindChips('season', (k) => { this.season = k; });
    $('#p-ndvi').onchange = (e) => { this.ndviView = e.target.checked; if (this.ndviView) this.score.ndvi = true; this.W.paintTerrain(this.ndviView ? 'ndvi' : 'natural'); this.caption(this.ndviView ? 'cap.ndvi' : 'cap.pasture'); };
    $('#p-d1').onclick = () => this.advance(1); $('#p-d7').onclick = () => this.advance(7);
    $('#p-best').onclick = () => { const best = this.pads.filter((p) => p !== this.active).sort((a, b) => b.B - a.B)[0]; this.setTab('flock'); this.moveFlock(best); };
    const N = this.sheep.filter((s) => !s.dead).length, I = intake(68), r = SEASONS[this.season];
    const plan = planRotation(this.pads, 60, r, N, I, this.active), cols = ['#3ff3ff', '#ff4fd8', '#ffb86b', '#5dffa8', '#8b5cff', '#ffd24a'];
    lineChart($('#cv-plan'), { x0: 0, x1: 60, y0: 0, y1: 4400, xTicks: [0, 15, 30, 45, 60], xFmt: (v) => v + ' d', yFmt: (v) => (v / 1000).toFixed(1) + 't', title: t('p.chart'),
      series: plan.series.map((s, i) => ({ pts: s, color: cols[i], label: 'P' + (i + 1) })), marks: [{ y: B_RES, color: 'rgba(255,68,102,.8)', label: t('p.res') }, { y: B_IN, color: 'rgba(93,255,168,.7)', label: t('p.in') }] });
    $('#p-moves').innerHTML = plan.moves.length ? plan.moves.map((m) => `${t('p.dayShort')} ${f0(m.d)}: P${m.from}→P${m.to}`).join(' · ') : t('p.noMoves');
    const cap = capacity(this.pads, N), p = this.active;
    $('#p-math').innerHTML = `<div>dB/dt = r·B·(1 − B/K) − N·I/A, r = <b>${r}</b>/d, K = 4200 → ${t('p.growth')} P${p.id}: <b>${f0(r * p.B * (1 - p.B / 4200))}</b> kg/ha/d</div>
      <div>${t('p.eat')}: N·I/A = ${N}·${f2(I)}/${p.ha} = <b>${f0((N * I) / p.ha)}</b> kg/ha/d</div>
      <div>D = (B − B<sub>res</sub>)·A/(N·I) = (${f0(p.B)} − ${B_RES})·${p.ha}/(${N}·${f2(I)}) = <b>${f1(grazeDays(p, N, I))} ${t('f.days')}</b></div>
      <div>t<sub>regrow</sub> = (1/r)·ln[B₁(K−B₀)/(B₀(K−B₁))] = <b>${f1(regrowDays(r, B_RES, B_IN))} ${t('f.days')}</b> (${B_RES}→${B_IN})</div>
      <div>AUM = Σ(B − B<sub>res</sub>)·A·0.7 / (${AU_DAY}·30.4) = <b>${f1(cap.aum)}</b> · ${t('p.demand')} ${N}×${EWE_AU} = ${f1(cap.demand)} AU → <b>${f1(cap.months)} ${t('p.months')}</b></div>
      <div>NDVI = (NIR − Red)/(NIR + Red) ≈ 0.15 + 0.75·(1 − e^(−B/1400))</div>`;
  }
  advance(days) {
    const N = this.sheep.filter((s) => !s.dead).length, I = intake(68), r = SEASONS[this.season];
    for (let i = 0; i < days * 4; i++) stepPasture(this.pads, 0.25, r, this.active, N, I);
    const water = this.sheep.reduce((a, s) => a + (s.dead ? 0 : waterNeed(s.w, this.airC + 4)), 0);
    this.tankL = Math.max(0, Math.min(5000, this.tankL - water * days + 700 * days));   // bore pump refills ~700 L/day
    this.day += days; this.W.paintTerrain(this.ndviView ? 'ndvi' : 'natural');
    if (this.active.B < B_RES) this.push('p.overgrazed', 'bad', { p: this.active.id });
    sfx.select(); this.render();
  }

  // ═══ DRONE ══════════════════════════════════════════
  area() { const A = AREAS[this.cfg.area]; return A || { x0: this.active.x0, x1: this.active.x1, z0: this.active.z0, z1: this.active.z1 }; }
  plan() {
    const c = this.cfg, D = DRONES[c.airframe], C = CAMERAS[c.camera], A = this.area(), rect = { w: A.x1 - A.x0, l: A.z1 - A.z0 };
    const lm = lawnmower(C, c.alt, rect, c.sidelap, c.V), rho = airDensity(heightAt(HOME.x, HOME.z) + 900 + c.alt, this.airC);
    const P = power(D, c.V, 0, rho), Pup = power(D, Math.hypot(c.V, c.wind) , 0, rho);
    const toArea = Math.hypot(A.x0 - HOME.x, A.z0 - HOME.z) + Math.hypot(A.x1 - HOME.x, A.z1 - HOME.z);
    const tTot = lm.time + toArea / c.V + (2 * c.alt) / 4;
    const Eclimb = ((D.mass * G0 * c.alt) / 0.5) / 3600, Ewh = ((P.total + Pup.total) / 2) * (tTot / 3600) + Eclimb;
    const reserve = 1 - Ewh / D.batteryWh, maxDist = Math.max(...[[A.x0, A.z0], [A.x1, A.z0], [A.x0, A.z1], [A.x1, A.z1]].map(([x, z]) => Math.hypot(x - HOME.x, z - HOME.z)));
    const g = gsd(C, c.alt), night = this.tab === 'watch' || this.W.night;
    const pd = johnsonP(SHEEP_D, g, 'detect').P, pr = johnsonP(SHEEP_D, g, 'recognize').P, pi = johnsonP(SHEEP_D, g, 'identify').P;
    const light = c.camera === 'rgb' && night ? 0.05 : 1;
    const R = rules({ alt: c.alt, V: c.V, maxDist, observer: c.observer, night, strobe: this.drone.lights, reserve });
    const tilt = Math.atan((0.5 * rho * D.CdA * c.V * c.V) / (D.mass * G0));
    return { D, C, A, lm, P, rho, tTot, Ewh, reserve, maxDist, g, pd: pd * light, pr: pr * light, pi: pi * light, R, tilt, fp: footprint(C, c.alt), best: bestSpeeds(D, 0, rho, c.wind), endur: enduranceMin(D, c.V, 0, rho), pod: podSweep(lm.coverage, pd * light), podR: podRandom(lm.coverage, pd * light), maxId: maxAltFor(C, SHEEP_D, 'identify') };
  }
  dronePanel() {
    const c = this.cfg, busy = this.drone.mode !== 'idle';
    return `<header class="lv-head mono">${t('d.title')}</header><p class="intro">${t('d.intro')}</p>
      ${this.chips('air', Object.keys(DRONES), c.airframe, (k) => DRONES[k].name)}
      ${this.chips('camx', Object.keys(CAMERAS), c.camera, (k) => CAMERAS[k].name)}
      ${this.chips('area', Object.keys(AREAS), c.area, (k) => t('d.area.' + k))}
      ${this.slider('d-alt', t('d.alt'), c.alt, 15, 160, 1, ' m')}${this.slider('d-v', t('d.v'), c.V, 2, 20, 0.5, ' m/s')}${this.slider('d-lap', t('d.lap'), Math.round(c.sidelap * 100), 0, 60, 5, '%')}${this.slider('d-wind', t('d.wind'), c.wind, 0, 14, 0.5, ' m/s')}
      <label class="toggle"><input type="checkbox" id="d-lights" ${this.drone.lights ? 'checked' : ''}> <span>${t('d.lights')}</span></label>
      <label class="toggle"><input type="checkbox" id="d-obs" ${c.observer ? 'checked' : ''}> <span>${t('d.observer')}</span></label>
      <div class="chips"><button class="btn primary" id="d-go" ${busy ? 'disabled' : ''}>▲ ${t('d.launch')}</button><button class="btn seg" id="d-rtl" ${busy ? '' : 'disabled'}>⌂ ${t('d.rtl')}</button></div>
      <div class="chips"><span class="small">${t('d.view')}</span>${['drone', 'orbit'].map((k) => `<button class="btn seg ${this.view.mode === k ? 'active' : ''}" data-vw="${k}">${t('d.vw.' + k)}</button>`).join('')}<span class="small">×</span>${[1, 4, 8, 20].map((w) => `<button class="btn seg ${c.warp === w ? 'active' : ''}" data-warp="${w}">${w}</button>`).join('')}</div>`;
  }
  droneSide() {
    return `<header class="lv-head mono">${t('d.plan')}</header><div class="bigstats" id="d-big"></div>
      <canvas class="cv map" id="cv-map"></canvas>
      <header class="lv-sub mono">${t('d.rules')}</header><ul class="poll" id="d-rules"></ul>
      <div class="math mono" id="d-math"></div>
      <canvas class="cv chart" id="cv-pow"></canvas>`;
  }
  bindDrone() {
    const c = this.cfg;
    this.bindChips('air', (k) => { c.airframe = k; if (this.drone.mode === 'idle') this.drone.E = DRONES[k].batteryWh * 3600; });
    this.bindChips('camx', (k) => { c.camera = k; if (this.view.mode === 'drone') this.setThermal(k === 'thermal'); });
    this.bindChips('area', (k) => { c.area = k; });
    for (const [id, k, s] of [['d-alt', 'alt', 1], ['d-v', 'V', 1], ['d-lap', 'sidelap', 0.01], ['d-wind', 'wind', 1]]) $('#' + id).oninput = (e) => { c[k] = +e.target.value * s; $('#' + id + '-v').textContent = e.target.value + (k === 'alt' ? ' m' : k === 'sidelap' ? '%' : ' m/s'); this.refresh(true); };
    $('#d-lights').onchange = (e) => { this.drone.lights = e.target.checked; };
    $('#d-obs').onchange = (e) => { c.observer = e.target.checked; };
    $('#d-go').onclick = () => this.launch();
    $('#d-rtl').onclick = () => this.rtl();
    document.querySelectorAll('[data-vw]').forEach((b) => (b.onclick = () => { this.view.mode = b.dataset.vw; this.setThermal(this.view.mode === 'drone' && c.camera === 'thermal'); this.render(); }));
    document.querySelectorAll('[data-warp]').forEach((b) => (b.onclick = () => { c.warp = +b.dataset.warp; this.render(); }));
  }
  launch() {
    const p = this.plan(), c = this.cfg, A = p.A, D = this.drone, sw = p.lm.swath;
    if (p.reserve < 0.05) { this.push('d.noBattery', 'bad'); sfx.deny?.(); return; }
    const y = (x, z) => heightAt(x, z) + c.alt, wp = [{ x: HOME.x, z: HOME.z, y: heightAt(HOME.x, HOME.z) + c.alt }];
    for (let i = 0; i < p.lm.lanes; i++) { const x = Math.min(A.x1, A.x0 + sw / 2 + i * sw), z0 = i % 2 ? A.z1 : A.z0, z1 = i % 2 ? A.z0 : A.z1; wp.push({ x, z: z0, y: y(x, z0) }, { x, z: z1, y: y(x, z1) }); }
    wp.push({ x: HOME.x, z: HOME.z, y: heightAt(HOME.x, HOME.z) + c.alt }, { x: HOME.x, z: HOME.z, y: heightAt(HOME.x, HOME.z) + 0.3, land: true });
    Object.assign(D, { mode: 'mission', wp, wi: 0, flightT: 0, dist: 0, maxDist: 0, violations: new Set(), E: DRONES[c.airframe].batteryWh * 3600, gimbal: -90 });
    this.survey.looks = 0; this.W.setPath(wp); this.view.mode = 'drone'; this.setThermal(c.camera === 'thermal');
    this.score.flights++; this.push('d.launched', 'ok', { n: p.lm.lanes, km: f2(p.lm.length / 1000) }); sfx.ignite?.(); this.render();
  }
  rtl() { const D = this.drone; D.mode = 'rtl'; D.wp = [{ x: HOME.x, z: HOME.z, y: D.y }, { x: HOME.x, z: HOME.z, y: heightAt(HOME.x, HOME.z) + 0.3, land: true }]; D.wi = 0; this.push('d.rtlGo', 'warn'); this.render(); }
  droneLive(full) {
    const p = this.plan(), c = this.cfg, D = this.drone;
    const big = $('#d-big');
    if (big) big.innerHTML = `<div><b class="mono">${f1(p.g * 100)}</b><small>GSD cm/px</small></div><div><b class="mono">${f1(p.tTot / 60)}</b><small>${t('d.min')}</small></div><div><b class="mono ${p.reserve < 0.2 ? 'c-red' : ''}">${f0(p.reserve * 100)}%</b><small>${t('d.reserve')}</small></div>`;
    if (!full) return;
    const m = $('#d-math');
    if (m) m.innerHTML = `
      <div>ρ = <b>${p.rho.toFixed(3)}</b> kg/m³ · A = n·π·r² = ${f2(p.D.rotors * Math.PI * p.D.r ** 2)} m² · T = m·g = ${f1(p.P.T)} N</div>
      <div>v<sub>h</sub> = √(T/2ρA) = <b>${f2(p.P.vh)} m/s</b> · v<sub>i</sub>(V) = v<sub>h</sub>²/√(V²+v<sub>i</sub>²) = <b>${f2(p.P.vi)} m/s</b></div>
      <div>P = κ·T·v<sub>i</sub> + P₀(1+4.65μ²) + ½ρC<sub>D</sub>A·V³ + P<sub>av</sub> = ${f0(p.P.induced)} + ${f0(p.P.profile)} + ${f0(p.P.parasite)} + ${p.D.avionics} = <b>${f0(p.P.total)} W</b></div>
      <div>${t('d.endur')} = E·η/P = ${p.D.batteryWh}·${p.D.usable}/${f0(p.P.total)} = <b>${f1(p.endur)} ${t('d.min')}</b> · V<sub>E</sub> <b>${f1(p.best.vE)}</b> · V<sub>R</sub> <b>${f1(p.best.vR)} m/s</b> (${t('d.headwind')} ${c.wind})</div>
      <div>${t('d.tilt')} θ = atan(D/W) = <b>${f1(p.tilt * DEG)}°</b></div>
      <div>${t('d.fp')} W = s<sub>w</sub>·h/f = ${p.C.sw}·${c.alt}/${p.C.f} = <b>${f1(p.fp.w)} × ${f1(p.fp.h)} m</b> · GSD = s<sub>w</sub>·h/(f·N) = <b>${f1(p.g * 100)} cm</b></div>
      <div>${t('d.lanes')} ⌈${f0(p.A.x1 - p.A.x0)}/(${f1(p.fp.w)}·${f2(1 - c.sidelap)})⌉ = <b>${p.lm.lanes}</b> · L = <b>${f2(p.lm.length / 1000)} km</b> · ${t('d.energy')} <b>${f1(p.Ewh)} Wh</b> / ${p.D.batteryWh}</div>
      <div>Johnson (${t('d.sheep')} ${SHEEP_D} m): N = d/(2·GSD) = <b>${f1(SHEEP_D / (2 * p.g))}</b> ${t('d.cycles')} → P<sub>det</sub> <b>${f2(p.pd)}</b> · P<sub>rec</sub> <b>${f2(p.pr)}</b> · P<sub>id</sub> <b>${f2(p.pi)}</b></div>
      <div>${t('d.idAlt')} ≤ <b>${f0(p.maxId)} m</b> · POD<sub>sweep</sub> = p·min(1, C) = <b>${f2(p.pod)}</b> (C = WL/A = ${f2(p.lm.coverage)}; ${t('d.random')} ${f2(p.podR)})</div>
      ${D.mode !== 'idle' ? `<div class="c-cyan">${t('d.inflight')}: ${f1(D.flightT / 60)} ${t('d.min')} · ${f2(D.dist / 1000)} km · ${t('d.battery')} ${f0((D.E / (DRONES[c.airframe].batteryWh * 3600)) * 100)}% · ${t('d.counted')} ${this.survey.counted.size}</div>` : ''}`;
    const ru = $('#d-rules');
    if (ru) ru.innerHTML = p.R.map((r) => `<li class="${r.ok ? 'go' : 'nogo'}"><span>${t('d.r.' + r.k)}</span><b class="mono">${r.k === 'alt' ? f0(r.v) + ' m' : r.k === 'speed' ? f1(r.v) + ' m/s' : r.k === 'vlos' ? f0(r.v) + ' m' : r.k === 'reserve' ? f0(r.v * 100) + '%' : r.v ? t('d.yes') : t('d.no')}</b><i>${r.ok ? 'OK' : 'NO'}</i></li>`).join('');
    const cv = $('#cv-pow');
    if (cv) { const pts = [], ptsR = []; for (let V = 0; V <= p.D.vmax; V += 0.5) { const P = power(p.D, V, 0, p.rho).total; pts.push([V, P]); } lineChart(cv, { x0: 0, x1: p.D.vmax, y0: 0, y1: Math.max(...pts.map((q) => q[1])) * 1.1, xTicks: [0, 5, 10, 15, 20].filter((v) => v <= p.D.vmax), xFmt: (v) => v + ' m/s', yFmt: (v) => Math.round(v), title: t('d.powChart'), series: [{ pts, color: '#ffb86b', label: 'P (W)' }], marks: [{ x: p.best.vE, color: '#5dffa8', label: 'V_E' }, { x: p.best.vR, color: '#3ff3ff', label: 'V_R' }, { x: c.V, color: '#ff4fd8', label: 'V' }] }); void ptsR; }
    this.drawMap($('#cv-map'), p);
  }

  // ═══ WATCH (night) ══════════════════════════════════
  startWatch() {
    this.setHour(22.25); this.watchT = 0; this.threat = 0;
    const st = flockStats(this.sheep);
    this.coy.forEach((c, i) => Object.assign(c, { x: st.cx + 60 + i * 14, z: 176 + i * 6, state: 'hidden', seen: false, near: 0, speed: 0 }));   // at the edge of the timber
    this.dog.mode = 'guard'; this.drone.spot = false; this.drone.siren = false;
    this.cfg.camera = 'thermal'; this.view.mode = 'orbit'; this.setThermal(false); this.caption('cap.watch');
  }
  endWatch() { for (const c of this.coy) c.state = 'hidden'; this.drone.spot = this.drone.siren = false; if (this.drone.mode === 'patrol') this.rtl(); this.setHour(17.3); }
  watchPanel() {
    const D = this.drone;
    return `<header class="lv-head mono">${t('w.title')}</header><p class="intro">${t('w.intro')}</p>
      <div class="chips"><button class="btn primary" id="w-patrol" ${D.mode === 'patrol' ? 'disabled' : ''}>◎ ${t('w.patrol')}</button><button class="btn seg" id="w-rtl" ${D.mode === 'idle' ? 'disabled' : ''}>⌂ ${t('d.rtl')}</button></div>
      <div class="chips"><span class="small">${t('d.view')}</span>${['drone', 'orbit'].map((k) => `<button class="btn seg ${this.view.mode === k ? 'active' : ''}" data-vw="${k}">${t('d.vw.' + k)}</button>`).join('')}</div>
      <header class="lv-sub mono">${t('w.respond')}</header>
      <div class="opts"><button class="btn opt" id="w-spot">🔦 ${t('w.spot')}</button><button class="btn opt" id="w-dog">🐕 ${t('w.dog')}</button><button class="btn opt" id="w-pen">⌂ ${t('w.pen')}</button></div>
      <p class="small">${t('w.nonlethal')}</p>
      <header class="lv-sub mono">${t('w.log')}</header><ul class="log mono" id="w-log"></ul>`;
  }
  watchSide() {
    return `<header class="lv-head mono">${t('w.picture')}</header><canvas class="cv map tall" id="cv-map"></canvas>
      <div class="bigstats" id="w-big"></div><div class="math mono" id="w-math"></div>`;
  }
  bindWatch() {
    $('#w-patrol').onclick = () => this.patrol();
    $('#w-rtl').onclick = () => this.rtl();
    $('#w-spot').onclick = () => this.respondSpot();
    $('#w-dog').onclick = () => { const c = this.nearestThreat(true); if (!c || !c.seen) { this.push('w.noTarget', 'warn'); return; } this.dog.mode = 'chase'; this.dog.target = c || flockStats(this.sheep); this.push('w.dogGo', 'ok'); sfx.select(); };
    $('#w-pen').onclick = () => this.penFlock();
    document.querySelectorAll('[data-vw]').forEach((b) => (b.onclick = () => { this.view.mode = b.dataset.vw; this.setThermal(this.view.mode === 'drone'); this.render(); }));
  }
  patrol() {
    const D = this.drone; if (D.mode === 'idle') D.E = DRONES[this.cfg.airframe].batteryWh * 3600;
    D.mode = 'patrol'; D.patrolA = Math.atan2(D.z - flockStats(this.sheep).cz, D.x - flockStats(this.sheep).cx); D.gimbal = -32; D.flightT = D.flightT || 0;
    if (!this.drone.lights) this.drone.violations.add('night');
    this.score.flights++; this.view.mode = 'drone'; this.setThermal(true); this.push('w.patrolUp', 'ok'); sfx.ignite?.(); this.render();
  }
  nearestThreat(seenOnly = false) { const act = this.coy.filter((c) => c.state !== 'hidden' && c.state !== 'gone' && c.state !== 'flee' && (!seenOnly || c.seen)); if (!act.length) return null; const st = flockStats(this.sheep); return act.sort((a, b) => Math.hypot(a.x - st.cx, a.z - st.cz) - Math.hypot(b.x - st.cx, b.z - st.cz))[0]; }
  respondSpot() { const c = this.nearestThreat(true); const D = this.drone; if (!c || !c.seen) { this.push('w.noTarget', 'warn'); if (D.mode === 'idle') this.patrol(); return; } if (D.mode === 'idle') this.patrol(); D.mode = 'intercept'; D.target = c; D.spot = D.siren = true; D.gimbal = -55; this.push('w.spotGo', 'ok'); sfx.alarm?.(); this.render(); }
  penFlock() { if (this.goal || this.active.id === 'pen') return; this.route = [...this.exitRoute(this.active), { x: PEN.x1 + 10, z: -60 }, { x: PEN.x1 + 8, z: (PEN.z0 + PEN.z1) / 2 }, { x: (PEN.x0 + PEN.x1) / 2, z: (PEN.z0 + PEN.z1) / 2 }]; this.goal = this.route.shift(); this.moving = 'pen'; this.dog.mode = 'drive'; this.score.pen = true; this.push('w.penGo', 'ok'); sfx.confirm(); }
  watchLive(full) {
    const big = $('#w-big'), seen = this.coy.filter((c) => c.seen && c.state !== 'gone' && c.state !== 'flee').length;
    if (big) big.innerHTML = `<div><b class="mono ${seen ? 'c-red' : ''}">${seen}</b><small>${t('w.threats')}</small></div><div><b class="mono">${this.sheep.filter((s) => !s.dead && !s.lost).length}</b><small>${t('w.safe')}</small></div><div><b class="mono ${this.losses ? 'c-red' : ''}">${this.losses}</b><small>${t('w.losses')}</small></div>`;
    if (!full) return;
    this.drawMap($('#cv-map'), null);
    const lg = $('#w-log'); if (lg) lg.innerHTML = this.log.map((l) => `<li class="${l.level}"><span>${l.time}</span>${l.text}</li>`).join('');
    const m = $('#w-math'), D = this.drone, c = this.nearestThreat(), C = CAMERAS.thermal;
    if (m) {
      if (c && D.mode !== 'idle') {
        const R = Math.hypot(c.x - D.x, heightAt(c.x, c.z) - D.y, c.z - D.z), g = gsd(C, R), J = johnsonP(COYOTE_D, g, 'detect'), Jr = johnsonP(COYOTE_D, g, 'recognize');
        m.innerHTML = `<div>${t('w.slant')} R = <b>${f0(R)} m</b> · GSD = s<sub>w</sub>·R/(f·N) = <b>${f1(g * 100)} cm</b></div><div>N = ${COYOTE_D}/(2·GSD) = <b>${f1(J.N)}</b> → P<sub>det</sub> <b>${f2(J.P)}</b> · P<sub>rec</sub> <b>${f2(Jr.P)}</b></div>
          <div>ΔT ${t('w.coyote')} ≈ (37.5 − ${this.airC})·0.55 = <b>${f1((37.5 - this.airC) * 0.55)} K</b> ≫ NETD 0.05 K</div>`;
      } else m.innerHTML = `<div>${t('w.detWhy')}</div><div>R<sub>det</sub> (P = 0.5) ≈ <b>${f0(maxAltFor(C, COYOTE_D, 'detect'))} m</b> · R<sub>rec</sub> ≈ <b>${f0(maxAltFor(C, COYOTE_D, 'recognize'))} m</b></div>`;
    }
  }

  // ── Top-down map (drone + watch) ────────────────────
  drawMap(cv, plan) {
    if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const W = r.width, H = r.height, k = Math.min(W / (MAP.x1 - MAP.x0), H / (MAP.z1 - MAP.z0)), ox = (W - (MAP.x1 - MAP.x0) * k) / 2, oy = (H - (MAP.z1 - MAP.z0) * k) / 2;
    const X = (x) => ox + (x - MAP.x0) * k, Y = (z) => oy + (MAP.z1 - z) * k;
    g.clearRect(0, 0, W, H); g.fillStyle = this.W.night ? '#05070d' : '#0b1209'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(40,70,35,.5)'; g.fillRect(X(MAP.x0), Y(270), (MAP.x1 - MAP.x0) * k, (270 - 170) * k);
    for (const p of this.pads) { const v = ndvi(p.B); g.fillStyle = `hsla(${120 * Math.max(0, Math.min(1, (v - 0.6) / 0.28))},80%,${this.W.night ? 18 : 30}%,.8)`; g.fillRect(X(p.x0), Y(p.z1), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k); g.strokeStyle = 'rgba(220,220,220,.35)'; g.strokeRect(X(p.x0), Y(p.z1), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k); g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '9px JetBrains Mono'; g.fillText('P' + p.id, X(p.x0) + 3, Y(p.z1) + 10); }
    g.strokeStyle = 'rgba(255,210,74,.6)'; g.strokeRect(X(PEN.x0), Y(PEN.z1), (PEN.x1 - PEN.x0) * k, (PEN.z1 - PEN.z0) * k);
    g.fillStyle = '#b0453a'; g.fillRect(X(BARN.x - 13), Y(BARN.z + 8), 26 * k, 16 * k);
    if (plan) { const A = plan.A; g.setLineDash([4, 3]); g.strokeStyle = '#3ff3ff'; g.strokeRect(X(A.x0), Y(A.z1), (A.x1 - A.x0) * k, (A.z1 - A.z0) * k); g.setLineDash([]); }
    const D = this.drone;
    if (D.wp && D.wp.length && (D.mode === 'mission' || D.mode === 'rtl')) { g.strokeStyle = 'rgba(255,79,216,.7)'; g.beginPath(); D.wp.forEach((w, i) => (i ? g.lineTo(X(w.x), Y(w.z)) : g.moveTo(X(w.x), Y(w.z)))); g.stroke(); }
    for (const s of this.sheep) { if (s.dead) continue; const flag = this.survey.fever.has(s.id) ? '#ff4466' : s.lost ? (this.survey.found ? '#ffd24a' : null) : this.survey.counted.has(s.id) ? '#5dffa8' : '#e8e2d4'; if (!flag) continue; g.fillStyle = flag; g.fillRect(X(s.x) - 1, Y(s.z) - 1, 2.2, 2.2); }
    g.fillStyle = '#3ff3ff'; g.beginPath(); g.arc(X(this.dog.x), Y(this.dog.z), 3, 0, 7); g.fill();
    for (const c of this.coy) if (c.seen && c.state !== 'gone' && c.state !== 'hidden') { g.fillStyle = '#ff2040'; g.beginPath(); g.moveTo(X(c.x), Y(c.z) - 5); g.lineTo(X(c.x) + 4, Y(c.z) + 3); g.lineTo(X(c.x) - 4, Y(c.z) + 3); g.fill(); }
    if (D.mode !== 'idle') { g.fillStyle = '#ff4fd8'; g.beginPath(); g.arc(X(D.x), Y(D.z), 3.5, 0, 7); g.fill(); if (this.fpCorners) { g.strokeStyle = '#ff4fd8'; g.beginPath(); this.fpCorners.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.z)) : g.moveTo(X(q.x), Y(q.z)))); g.closePath(); g.stroke(); } }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(HOME.x), Y(HOME.z), 2.5, 0, 7); g.fill();
    g.fillStyle = 'rgba(232,238,252,.7)'; g.font = '9px JetBrains Mono'; g.fillText('N ↑', W - 26, 12); g.fillText('100 m', 8, H - 6); g.fillRect(8, H - 16, 100 * k, 2);
  }

  // ── Simulation step ─────────────────────────────────
  simStep(dt) {
    this.time += dt;
    const threats = [];
    const dg = this.dog;
    // Guardian dog: patrols near the flock; drives from behind when moving; chases a threat.
    const st = flockStats(this.sheep);
    let dtx = st.cx - 18, dtz = st.cz - 12, dv = 1.2;
    if (dg.mode === 'spook' && dg.target) { dtx = dg.target.x; dtz = dg.target.z; dv = 7; if (Math.hypot(dtx - dg.x, dtz - dg.z) < 3) { dg.mode = 'guard'; } }
    if (dg.mode === 'drive' && this.goal) { const gx = this.goal.x - st.cx, gz = this.goal.z - st.cz, gl = Math.hypot(gx, gz) || 1; dtx = st.cx - (gx / gl) * (st.rms + 10); dtz = st.cz - (gz / gl) * (st.rms + 10); dv = 3; }
    if (dg.mode === 'chase') { const c = this.nearestThreat(true); if (c) { dtx = c.x; dtz = c.z; dv = 11; } else dg.mode = 'guard'; }
    { const dx = dtx - dg.x, dz = dtz - dg.z, dd = Math.hypot(dx, dz); const v = dd > 1.5 ? Math.min(dv, dd) : 0; dg.speed = v; if (v > 0.1) { dg.heading = Math.atan2(dx, dz); dg.x += (dx / dd) * v * dt; dg.z += (dz / dd) * v * dt; } }
    if (dg.mode === 'spook' || dg.mode === 'drive' || dg.speed > 4) threats.push({ x: dg.x, z: dg.z, R: dg.mode === 'drive' ? 16 : BOIDS.dogR });
    // Coyotes.
    if (this.tab === 'watch') this.stepCoyotes(dt, st, threats);
    // Flock.
    if (this.goal && Math.hypot(this.goal.x - st.cx, this.goal.z - st.cz) < Math.max(5, st.rms * 0.8)) {
      this.goal = this.route.shift() || null;
      if (!this.goal) { if (this.moving === 'pen') { this.push('w.penned', 'ok'); this.active = { ...PEN, id: 'pen', ha: 0.06, gate: { x: PEN.x1, z: 0 } }; } else if (this.moving) { this.active = this.moving; this.push('f.arrived', 'ok', { p: this.active.id }); } this.moving = null; this.dog.mode = 'guard'; if (this.tab === 'flock' || this.tab === 'watch') this.render(); }
    }
    const pad = this.active.x0 !== undefined ? this.active : null;
    const r = stepFlock(this.sheep, { pad, threats, goal: this.goal, dt });
    this.threat = Math.max(r.alarm, this.threat - dt * 0.2);
    // Drone.
    this.stepDrone(dt);
  }
  stepCoyotes(dt, st, threats) {
    this.watchT += dt;
    const D = this.drone;
    for (const [i, c] of this.coy.entries()) {
      if (c.state === 'hidden' && this.watchT > 6 + i * 3) { c.state = 'stalk'; }
      if (c.state === 'hidden' || c.state === 'gone') { c.visible = false; continue; }
      c.visible = true;
      // Deterrence: light + siren within 45 m, or the guardian dog within 25 m → retreat to the timber.
      const dDrone = Math.hypot(c.x - D.x, c.z - D.z), dDog = Math.hypot(c.x - this.dog.x, c.z - this.dog.z);
      if (c.state !== 'flee' && ((D.spot && D.siren && dDrone < 45 && D.mode !== 'idle') || dDog < 25)) { c.state = 'flee'; this.score.deter = true; this.push(dDog < 25 ? 'w.dogDeter' : 'w.spotDeter', 'ok'); sfx.confirm(); }
      let tx = st.cx, tz = st.cz, v = 4.2;                     // a coyote trots at ~15 km/h
      if (c.state === 'stalk' && Math.hypot(c.x - st.cx, c.z - st.cz) < 55 + st.rms) c.state = 'rush';
      if (c.state === 'rush') { let best = null, bd = 1e9; for (const s of this.sheep) { if (s.dead || s.lost) continue; const d = Math.hypot(s.x - c.x, s.z - c.z); if (d < bd) { bd = d; best = s; } } if (best) { tx = best.x; tz = best.z; v = 11; if (bd < 1.4) { c.near += dt; if (c.near > 2.5) { best.dead = true; c.near = 0; this.losses++; this.score.noLoss = false; this.push('w.loss', 'bad', { tag: best.tag }); sfx.alarm?.(); c.state = 'flee'; } } } }
      if (c.state === 'flee') { tx = c.x + (c.x - st.cx) * 2; tz = 330; v = 12; if (c.z > 300) { c.state = 'gone'; this.push('w.gone', 'ok'); } }
      const dx = tx - c.x, dz = tz - c.z, dd = Math.hypot(dx, dz) || 1; c.speed = v; c.heading = Math.atan2(dx, dz); c.x += (dx / dd) * v * dt; c.z += (dz / dd) * v * dt;
      if (c.state !== 'flee') threats.push({ x: c.x, z: c.z, R: BOIDS.predR });
      // Thermal detection from the drone camera (within the gimbal cone, Johnson probability ≥ 0.5).
      if (!c.seen && D.mode !== 'idle') {
        const R = Math.hypot(c.x - D.x, heightAt(c.x, c.z) - D.y, c.z - D.z), J = johnsonP(COYOTE_D, gsd(CAMERAS.thermal, R), 'detect').P;
        // Inside the camera's horizontal field right now (heading + gimbal pan ± half the lens field)?
        let db = Math.atan2(c.x - D.x, c.z - D.z) - D.heading - (D.pan || 0); db = Math.abs(Math.atan2(Math.sin(db), Math.cos(db)));
        if (J > 0.5 && db < hfov(CAMERAS.thermal) / 2 + 0.1) { c.seen = true; this.push('w.detect', 'bad', { r: f0(R) }); this.app.stage.flash('#ff2040'); sfx.alarm?.(); }
      }
    }
  }
  gimbalDir() { const D = this.drone, p = (D.gimbal * Math.PI) / 180, h = D.heading + (D.pan || 0); return new THREE.Vector3(Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)); }
  stepDrone(dt) {
    const D = this.drone, c = this.cfg, AF = DRONES[c.airframe];
    if (D.mode === 'idle') { D.x = HOME.x; D.z = HOME.z; D.y = heightAt(HOME.x, HOME.z) + 0.3; return; }
    let tgt = null, V = c.V;
    if (D.mode === 'mission' || D.mode === 'rtl') tgt = D.wp[D.wi];
    if (D.mode === 'patrol') { const st = flockStats(this.sheep); D.patrolA += dt * (10 / 110); tgt = { x: st.cx + Math.cos(D.patrolA) * 110, z: st.cz + Math.sin(D.patrolA) * 110, y: heightAt(st.cx, st.cz) + 60 }; V = 10; }
    if (D.mode === 'intercept') { if (!D.target || D.target.state === 'flee' || D.target.state === 'gone') D.target = this.nearestThreat(true); const cc = D.target; if (!cc) { D.mode = 'patrol'; D.spot = D.siren = false; D.gimbal = -32; } else { tgt = { x: cc.x, z: cc.z - 10, y: heightAt(cc.x, cc.z) + 25 }; V = 16; } }
    if (!tgt) return;
    const dx = tgt.x - D.x, dz = tgt.z - D.z, dh = Math.hypot(dx, dz), dy = tgt.y - D.y;
    const want = dh > 0.5 ? Math.min(V, dh * 0.8 + 0.5) : 0, vxW = dh > 0.01 ? (dx / dh) * want : 0, vzW = dh > 0.01 ? (dz / dh) * want : 0;
    const acc = 4 * dt; D.vx += Math.max(-acc, Math.min(acc, vxW - D.vx)); D.vz += Math.max(-acc, Math.min(acc, vzW - D.vz)); D.vy = Math.max(-3, Math.min(4, dy * 0.8));
    D.x += D.vx * dt; D.z += D.vz * dt; D.y += D.vy * dt;
    const gs = Math.hypot(D.vx, D.vz); if (gs > 0.5) { let d = Math.atan2(D.vx, D.vz) - D.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); D.heading += d * Math.min(1, dt * 2.5); }
    // Patrol: the airframe faces outward and the gimbal slews a full circle every 18 s (a 'sweep and stare').
    if (D.mode === 'patrol') { const st = flockStats(this.sheep); D.heading = Math.atan2(D.x - st.cx, D.z - st.cz); D.pan = ((D.flightT * 2 * Math.PI) / 18) % (2 * Math.PI); } else D.pan = 0;
    // Intercept: the gimbal tracks the target (pan to its bearing, tilt to its depression angle).
    if (D.mode === 'intercept' && D.target) { const c = D.target, hx = c.x - D.x, hz = c.z - D.z; D.pan = Math.atan2(hx, hz) - D.heading; D.gimbal = (Math.atan2(heightAt(c.x, c.z) - D.y, Math.hypot(hx, hz)) * 180) / Math.PI; }
    D.dist += gs * dt; D.flightT += dt; D.maxDist = Math.max(D.maxDist, Math.hypot(D.x - HOME.x, D.z - HOME.z));
    const air = Math.hypot(D.vx - c.wind, D.vz), rho = airDensity(D.y + 900, this.airC), P = power(AF, air, 0, rho).total + Math.max(0, D.vy) * AF.mass * G0 / 0.5;
    D.E = Math.max(0, D.E - P * dt); D.tilt = Math.atan((0.5 * rho * AF.CdA * air * air) / (AF.mass * G0));
    // Rule monitoring while airborne.
    const agl = D.y - heightAt(D.x, D.z);
    if (agl > PART107.maxAltM + 1) D.violations.add('alt');
    if (D.maxDist > PART107.vlosM && !c.observer) D.violations.add('vlos');
    if (this.W.night && !D.lights) D.violations.add('night');
    if (D.violations.size) this.score.legal = false;
    if (D.E / (AF.batteryWh * 3600) < 0.15 && D.mode !== 'rtl') { this.push('d.lowBatt', 'bad'); this.rtl(); }
    if (dh < 1.5 && Math.abs(dy) < 1.5 && (D.mode === 'mission' || D.mode === 'rtl')) {
      if (tgt.land) { D.mode = 'idle'; D.vx = D.vz = D.vy = 0; this.missionDone(); return; }
      D.wi++;
    }
    if (D.mode === 'mission') this.surveyLook();
  }
  // What the camera sees this frame: sheep inside the footprint roll against the Johnson probabilities.
  surveyLook() {
    const D = this.drone, C = CAMERAS[this.cfg.camera], agl = Math.max(1, D.y - heightAt(D.x, D.z)), fp = footprint(C, agl), g = gsd(C, agl);
    const ch = Math.cos(D.heading), sh = Math.sin(D.heading), hw = fp.w / 2, hl = fp.h / 2;
    this.fpCorners = [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([a, b]) => ({ x: D.x + a * ch + b * sh, z: D.z - a * sh + b * ch }));
    const pd = johnsonP(SHEEP_D, g, 'detect').P, pr = johnsonP(SHEEP_D, g, 'recognize').P, pi = johnsonP(SHEEP_D, g, 'identify').P;
    for (const s of this.sheep) {
      if (s.dead) continue;
      const rx = s.x - D.x, rz = s.z - D.z, a = rx * ch - rz * sh, b = rx * sh + rz * ch;
      if (Math.abs(a) > hw || Math.abs(b) > hl) continue;
      const cover = s.lost ? (this.cfg.camera === 'thermal' ? 0.8 : 0.3) : 1;      // brush canopy hides more in visible light
      if (!this.survey.counted.has(s.id) && pd * cover > s.rnd) { this.survey.counted.add(s.id); if (s.lost && !this.survey.found) { this.survey.found = true; this.score.lost = true; this.push('d.foundLost', 'ok', { tag: s.tag }); sfx.confirm(); } }
      if (this.cfg.camera === 'thermal' && s.fever && !this.survey.fever.has(s.id) && pi > s.rnd2) { this.survey.fever.add(s.id); this.push('d.feverFlag', 'bad', { tag: s.tag, t: f1(s.core) }); }
      if (this.cfg.camera === 'rgb' && s.lame && !this.survey.lame.has(s.id) && pr > s.rnd2 && (s.speed || 0) > 0.05) { this.survey.lame.add(s.id); this.push('d.lameFlag', 'warn', { tag: s.tag }); }
    }
  }
  missionDone() {
    const n = this.survey.counted.size; this.survey.done = true; this.score.survey = true;
    if (n >= N_SHEEP - 1) this.score.count = true;
    if (this.survey.fever.size >= 2) this.score.fever = true;
    this.push('d.landed', n === N_SHEEP ? 'ok' : 'warn', { n, N: N_SHEEP, f: this.survey.fever.size });
    this.W.setPath([]); this.fpCorners = null; this.drone.wp = [];
    if (this.tab === 'drone') { this.view.mode = 'orbit'; this.setThermal(false); }
    this.render();
  }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(0.08, Math.min(1.45, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(12, Math.min(900, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === 't' && this.tab === 'drone') { this.cfg.camera = this.cfg.camera === 'thermal' ? 'rgb' : 'thermal'; if (this.view.mode === 'drone') this.setThermal(this.cfg.camera === 'thermal'); this.render(); } }

  // ── Frame ──────────────────────────────────────────
  update(dt, time) {
    const warp = this.tab === 'drone' && this.drone.mode !== 'idle' ? this.cfg.warp : 1;
    let left = dt * warp; while (left > 1e-6) { const h = Math.min(0.1, left); this.simStep(h); left -= h; }
    if (this.tab === 'watch') this.hour = 22.25 + this.watchT / 3600;
    const W = this.W, D = this.drone;
    W.poseFlock(this.sheep);
    W.poseAnimal(W.dog, this.dog, time);
    this.coy.forEach((c, i) => W.poseAnimal(W.coyotes[i], c, time));
    // Drone pose, rotors, lights, spotlight.
    W.drone.position.set(D.x, D.y, D.z); W.drone.rotation.set(0, D.heading, 0); W.drone.rotateX(D.tilt);
    W.rotors.forEach((r, i) => (r.rotation.y += (D.mode === 'idle' ? 0 : 60) * dt * (i % 2 ? 1 : -1)));
    W.gimbal.rotation.x = -(D.gimbal * Math.PI) / 180;
    const on = D.mode !== 'idle' && D.lights; W.strobe.material.opacity = on && (time % 1.2) < 0.08 ? 1 : 0; W.navL.material.opacity = W.navR.material.opacity = on ? 1 : 0.2;
    W.spot.intensity = D.spot ? 60000 : 0; W.beam.visible = D.spot && !this.thermal;
    if (D.spot) { const c = D.target; if (c) { const loc = W.drone.worldToLocal(new THREE.Vector3(c.x, heightAt(c.x, c.z), c.z)); W.spot.target.position.copy(loc); W.beam.lookAt(W.drone.localToWorld(loc.clone())); W.beam.rotateX(-Math.PI / 2); } }
    W.footprint.visible = D.mode === 'mission' && this.view.mode !== 'drone';
    if (this.fpCorners && D.mode === 'mission') W.setFootprint(this.fpCorners);
    // Camera.
    const v = this.view, st = flockStats(this.sheep);
    if (v.mode === 'drone' && D.mode !== 'idle') {
      const dir = this.gimbalDir(); this.cam.position.set(D.x, D.y - 0.4, D.z);
      this.cam.up.set(Math.sin(D.heading), 0, Math.cos(D.heading)); if (D.gimbal > -80) this.cam.up.set(0, 1, 0);
      this.cam.lookAt(D.x + dir.x * 10, D.y - 0.4 + dir.y * 10, D.z + dir.z * 10);
      const C = CAMERAS[this.tab === 'watch' ? 'thermal' : this.cfg.camera], hf = hfov(C), a = innerWidth / innerHeight;
      this.cam.fov = 2 * Math.atan(Math.tan(hf / 2) / a) * DEG; this.cam.near = 0.5;
    } else {
      if (this.tab === 'pasture') v.want.set(0, heightAt(0, 40), 40);
      else if (this.tab === 'drone') v.want.set(D.mode === 'idle' ? 0 : D.x, D.mode === 'idle' ? heightAt(0, 40) : D.y - 10, D.mode === 'idle' ? 40 : D.z);
      else v.want.set(st.cx, heightAt(st.cx, st.cz) + 1, st.cz);
      if (this.tab === 'drone' && D.mode === 'idle' && v.r < 200) { v.r = 260; v.pitch = 0.9; }
      if (this.tab === 'watch') { const c = this.nearestThreat(); if (c && c.seen) v.want.lerp(new THREE.Vector3(c.x, heightAt(c.x, c.z), c.z), 0.35); if (v.r < 90) v.r = 110; }
      if (v.snap) { v.focus.copy(v.want); v.snap = false; } else v.focus.lerp(v.want, Math.min(1, dt * 2.5));
      if (!v.drag && performance.now() - v.last > 6000) v.yaw += dt * 0.03;
      const cp = new THREE.Vector3(v.focus.x + Math.sin(v.yaw) * Math.cos(v.pitch) * v.r, v.focus.y + Math.sin(v.pitch) * v.r, v.focus.z + Math.cos(v.yaw) * Math.cos(v.pitch) * v.r);
      cp.y = Math.max(cp.y, heightAt(cp.x, cp.z) + 2); this.cam.position.copy(cp); this.cam.up.set(0, 1, 0); this.cam.lookAt(v.focus); this.cam.fov = 42; this.cam.near = 0.3;
    }
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    // Shadows follow the action.
    const sfocus = this.view.mode === 'drone' ? new THREE.Vector3(D.x, 0, D.z) : v.focus; W.sun.target.position.copy(sfocus); if (!W.night) W.sun.position.copy(sfocus).add(new THREE.Vector3().copy(W.sky.material.uniforms.sunPosition.value).multiplyScalar(500));
    this.drawOverlay();
    this.uiT += dt; this.uiSlow += dt;
    if (this.uiT > 0.1) { this.uiT = 0; const full = this.uiSlow > 0.4; if (full) this.uiSlow = 0; this.refresh(full); }
  }
  // Drone camera HUD: reticle, telemetry and detection boxes projected from the world.
  drawOverlay() {
    const cv = $('#overlay'); if (!cv) return;
    const d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(innerWidth * d)) { cv.width = innerWidth * d; cv.height = innerHeight * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    const D = this.drone; if (this.view.mode !== 'drone' || D.mode === 'idle' || !this.entered) return;
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, col = this.thermal ? '#ffffff' : '#3ff3ff';
    g.strokeStyle = col; g.lineWidth = 1; g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(cx - 30, cy); g.lineTo(cx - 8, cy); g.moveTo(cx + 8, cy); g.lineTo(cx + 30, cy); g.moveTo(cx, cy - 30); g.lineTo(cx, cy - 8); g.moveTo(cx, cy + 8); g.lineTo(cx, cy + 30); g.stroke();
    for (const [x, y, sx, sy] of [[cx - 200, cy - 120, 1, 1], [cx + 200, cy - 120, -1, 1], [cx - 200, cy + 120, 1, -1], [cx + 200, cy + 120, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * 20); g.lineTo(x, y); g.lineTo(x + sx * 20, y); g.stroke(); }
    g.globalAlpha = 1; g.font = '11px "JetBrains Mono", monospace'; g.fillStyle = col;
    const agl = D.y - heightAt(D.x, D.z), C = CAMERAS[this.tab === 'watch' ? 'thermal' : this.cfg.camera], AF = DRONES[this.cfg.airframe];
    const lines = [`${this.thermal ? 'LWIR · IRONBOW' : 'EO · RGB'}  ${C.name}`, `AGL ${agl.toFixed(0)} m  GS ${Math.hypot(D.vx, D.vz).toFixed(1)} m/s  HDG ${((D.heading * DEG + 360) % 360).toFixed(0)}°${D.pan ? '  PAN ' + ((D.pan * DEG) % 360).toFixed(0) + '°' : ''}`, `BATT ${Math.round((D.E / (AF.batteryWh * 3600)) * 100)}%  T+${(D.flightT / 60).toFixed(1)} min  GSD ${(gsd(C, agl) * 100).toFixed(1)} cm`, `${this.W.night ? 'NIGHT · STROBE ' + (D.lights ? 'ON' : 'OFF') : 'DAY'}  ${D.spot ? '· SPOT+SIREN' : ''}`];
    lines.forEach((l, i) => g.fillText(l, cx - 200, cy + 140 + i * 15));
    // Detection boxes.
    const v3 = new THREE.Vector3();
    const box = (x, y, z, r, color, label) => { v3.set(x, y, z).project(this.cam); if (v3.z > 1 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) return; const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H, dist = this.cam.position.distanceTo(new THREE.Vector3(x, y, z)), s = Math.max(5, (r / dist) * (H / 2) / Math.tan((this.cam.fov / DEG) / 2)); g.strokeStyle = color; g.strokeRect(sx - s, sy - s, s * 2, s * 2); if (label) { g.fillStyle = color; g.fillText(label, sx + s + 3, sy - s + 9); } };
    if (this.tab === 'drone') for (const s of this.sheep) { if (s.dead || !this.survey.counted.has(s.id)) continue; const fever = this.survey.fever.has(s.id), lame = this.survey.lame.has(s.id); box(s.x, heightAt(s.x, s.z) + 0.6, s.z, 0.8, fever ? '#ff3355' : lame ? '#ffb86b' : s.lost ? '#ffd24a' : 'rgba(93,255,168,.7)', fever ? `${s.tag} ${s.core.toFixed(1)}°C` : lame ? `${s.tag} LAME` : s.lost ? `${s.tag} FOUND` : null); }
    for (const c of this.coy) if (c.seen && c.state !== 'gone' && c.visible) box(c.x, heightAt(c.x, c.z) + 0.5, c.z, 1.2, '#ff2040', `CANID ${c.state === 'flee' ? '· RETREAT' : c.state === 'rush' ? '· ATTACK' : '· STALK'}`);
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'flock') this.flockLive(full);
    if (this.tab === 'drone') this.droneLive(full);
    if (this.tab === 'watch') this.watchLive(full);
  }

  showReport() {
    const S = this.score;
    const rows = [[t('rep.spook'), S.spook], [t('rep.ndvi'), S.ndvi], [t('rep.rotate'), S.rotate], [t('rep.survey'), S.survey], [t('rep.count', { n: this.survey.counted.size, N: N_SHEEP }), S.count], [t('rep.lost'), S.lost], [t('rep.fever', { n: this.survey.fever.size }), S.fever], [t('rep.legal'), S.legal && S.flights > 0], [t('rep.deter'), S.deter], [t('rep.noLoss', { n: this.losses }), S.noLoss && S.deter]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
export { CORE_T };
