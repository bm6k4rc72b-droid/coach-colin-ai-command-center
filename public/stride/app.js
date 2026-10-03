import * as THREE from 'three';
import { FOAMS, PLATES, REF, shoeModel, hysteresis, wearCurve, wearPenalty, crossover, racePredict, newSpeed, DIST, fmtTime, EVIDENCE } from './sim/run.js';
import { buildShoe, shapeShoe, buildTrack, trackPoint, lapLength, buildRunner, poseRunner } from './view/shoe.js';
import { glowSprite } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// STRIDE · the app. Build a racing shoe and see what the evidence says it is worth, turn running
// economy into race time, watch foam wear away its advantage, and read the studies behind it all.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(x).toFixed(1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RANGES = { '5k': [12 * 60, 45 * 60, 5], '10k': [26 * 60, 90 * 60, 5], half: [57 * 60, 210 * 60, 10], marathon: [120 * 60, 360 * 60, 30] };

export class Stride {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.background = new THREE.Color('#07080b'); scene.fog = new THREE.Fog('#07080b', 2, 9); scene.environmentIntensity = 0.45;
    this.cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.01, 2000); scene.add(this.cam);
    // Studio: key, rim and fill lights, a glossy floor and a soft halo behind the shoe.
    const key = new THREE.SpotLight('#ffffff', 3.2, 6, 0.5, 0.6, 2); key.position.set(0.6, 1.4, 0.9); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; scene.add(key, key.target); this.key = key;
    const rim = new THREE.SpotLight('#7fe0ff', 2.6, 6, 0.6, 0.7, 2); rim.position.set(-0.9, 0.6, -0.8); scene.add(rim, rim.target);
    const rim2 = new THREE.SpotLight('#dcff4a', 1.4, 6, 0.6, 0.7, 2); rim2.position.set(0.9, 0.4, -0.9); scene.add(rim2, rim2.target);
    scene.add(new THREE.HemisphereLight('#c9d6ff', '#202020', 0.35)); this.studio = [key, rim, rim2];
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(3, 96).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#0b0d11', roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.35 })); this.floor.receiveShadow = true; scene.add(this.floor);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.262, 128).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#dcff4a', transparent: true, opacity: 0.6 })); this.ring.position.y = 0.001; scene.add(this.ring);
    this.halo = glowSprite('#7fe0ff', 1.6, 0.08); this.halo.position.set(0, 0.1, -0.6); scene.add(this.halo);
    this.shoe = buildShoe(); scene.add(this.shoe);
    // Stadium for the race tab.
    this.stadium = new THREE.Group(); this.stadium.visible = false; scene.add(this.stadium);
    this.stadium.add(buildTrack());
    this.sun = new THREE.DirectionalLight('#ffe2c0', 2.4); this.sun.position.set(-80, 120, 60); this.sun.castShadow = true; Object.assign(this.sun.shadow.camera, { left: -110, right: 110, top: 80, bottom: -80, near: 1, far: 400 }); this.sun.shadow.mapSize.set(2048, 2048); this.stadium.add(this.sun);
    for (const [x, z] of [[-75, -60], [75, -60], [-75, 60], [75, 60]]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 40, 8), new THREE.MeshStandardMaterial({ color: '#555' })); pole.position.set(x, 20, z); this.stadium.add(pole); const lamp = glowSprite('#fff6dc', 14, 0.9); lamp.position.set(x, 41, z); this.stadium.add(lamp); }
    this.ghostA = buildRunner('#9aa3b5'); this.ghostB = buildRunner('#dcff4a'); this.stadium.add(this.ghostA, this.ghostB);
    this.sh = { foam: 'peba', stack: 39, drop: 8, plate: 'plate', mass: 210, explode: 0, xray: false, stepT: null };
    this.rc = { dist: 'marathon', t: 3.5 * 3600, mass: 65, useShoe: true, saving: 4, race: 0, seen: { elite: false, rec: false } };
    this.wr = { km: 0 }; this.ev = { open: new Set() };
    this.goal = { shoe: false, race: false, wear: false, evidence: false };
    this.view = { yaw: 0.6, pitch: 0.25, r: 1, drag: null, last: 0 };
    this.tab = 'shoe'; this.entered = false; this.uiT = 0; this.time = 0;
    this.reshape();
    app.stage.use(scene, this.cam);
  }
  saving() { return this.rc.useShoe ? -shoeModel(this.sh).total : this.rc.saving; }
  reshape() { const S = this.sh, comp = S.stepT != null ? Math.sin(Math.min(1, S.stepT / 0.35) * Math.PI) * FOAMS[S.foam].strain * 0.9 : 0; shapeShoe(this.shoe, { stack: S.stack, drop: S.drop, plate: S.plate, col: FOAMS[S.foam].col, comp, explode: S.explode, xray: S.xray, worn: this.tab === 'wear' ? Math.min(1, this.wr.km / 800) : 0 }); }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['shoe', 'race', 'wear', 'evidence'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  setTab(tab) { this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true; this.reshape(); this.render(); this.caption('cap.' + tab); }
  render() { const P = { shoe: ['shP', 'shS', 'shB'], race: ['rcP', 'rcS', 'rcB'], wear: ['wrP', 'wrS', 'wrB'], evidence: ['evP', 'evS', 'evB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true); }

  // ═══ SHOE ═══
  shP() {
    const S = this.sh;
    return `<header class="lv-head mono">${t('sh.title')}</header><p class="intro">${t('sh.intro')}</p>
      <header class="lv-sub mono">${t('sh.foam')}</header>${this.chips('foam', Object.keys(FOAMS), S.foam, (k) => `${t('foam.' + k)} <em class="mono">${f0(FOAMS[k].er * 100)}%</em>`)}
      ${this.slider('s-stack', t('sh.stack'), S.stack, 15, 50, 1, S.stack + ' mm')}${this.slider('s-drop', t('sh.drop'), S.drop, 0, 12, 1, S.drop + ' mm')}
      <header class="lv-sub mono">${t('sh.plate')}</header>${this.chips('plate', Object.keys(PLATES), S.plate, (k) => t('plate.' + k))}
      ${this.slider('s-mass', t('sh.mass'), S.mass, 140, 330, 5, S.mass + ' g')}
      <div class="chips"><button class="btn seg ${S.explode ? 'active' : ''}" id="s-exp">⇕ ${t('sh.explode')}</button><button class="btn seg ${S.xray ? 'active' : ''}" id="s-xray">◐ ${t('sh.xray')}</button><button class="btn primary" id="s-step">👟 ${t('sh.step')}</button></div>
      <p class="small">${t('sh.note')}</p>`;
  }
  shS() { return `<header class="lv-head mono">${t('sh.read')}</header><div class="bigstats" id="sh-big"></div><canvas class="cv chart" id="cv-hyst"></canvas><div class="math mono" id="sh-math"></div><div class="goal" id="sh-goal"></div>`; }
  shB() {
    const S = this.sh, re = () => this.reshape();
    document.querySelectorAll('[data-foam]').forEach((b) => (b.onclick = () => { S.foam = b.dataset.foam; sfx.select(); re(); this.render(); }));
    document.querySelectorAll('[data-plate]').forEach((b) => (b.onclick = () => { S.plate = b.dataset.plate; sfx.select(); re(); this.render(); }));
    this.bindSliders(S, [['s-stack', 'stack', (v) => v + ' mm'], ['s-drop', 'drop', (v) => v + ' mm'], ['s-mass', 'mass', (v) => v + ' g']], re);
    $('#s-exp').onclick = () => { S.explode = S.explode ? 0 : 1; sfx.select(); this.render(); };
    $('#s-xray').onclick = () => { S.xray = !S.xray; sfx.select(); re(); this.render(); };
    $('#s-step').onclick = () => this.step();
  }
  step() { this.sh.stepT = 0; sfx.select(); }
  shLive(full) {
    if (!full) return;
    const S = this.sh, M = shoeModel(S), H = hysteresis({ foam: S.foam, stack: S.stack, bw: 70 });
    const big = $('#sh-big'); if (big) big.innerHTML = `<div><b class="mono ${M.total < -3 ? 'c-green' : M.total < 0 ? 'c-amber' : 'c-red'}">${sgn(M.total)}%</b><small>${t('sh.re')}</small></div><div><b class="mono">${f1(H.back)} J</b><small>${t('sh.back')}</small></div><div><b class="mono ${M.legalRoad ? 'c-green' : 'c-red'}">${M.legalRoad ? t('sh.legal') : t('sh.illegal')}</b><small>${t('sh.road')} · ${t('sh.track')} ${M.legalTrack ? '✓' : '✗'}</small></div>`;
    lineChart($('#cv-hyst'), { x0: 0, x1: Math.ceil(H.xmax + 1), y0: 0, y1: 2000, xFmt: (x) => x + ' mm', yFmt: (y) => f1(y / 1000) + 'k', title: t('sh.chart'), series: [{ pts: H.load, color: '#7fe0ff', label: t('sh.load'), fill: 'rgba(127,224,255,.08)' }, { pts: H.unload, color: '#dcff4a', label: t('sh.unload'), fill: 'rgba(220,255,74,.14)' }] });
    const T = M.terms, m = $('#sh-math');
    if (m) m.innerHTML = `<div>${t('sh.vs')}: ${t('foam.eva')}, 25 mm, ${t('plate.none')}, 230 g</div>
      <div>${t('sh.tFoam')} −8.1·(ER√(h/35) − 0.66√(25/35)) = <b>${sgn(T.foam)}%</b> · ${t('sh.tLever')} <b>${sgn(T.lever)}%</b>${T.instab ? ` · ${t('sh.tInstab')} <b>${sgn(T.instab)}%</b>` : ''}</div>
      <div>${t('sh.tPlate')} <b>${sgn(T.plate)}%</b> · ${t('sh.tMass')} 1.11%/100 g → <b>${sgn(T.mass)}%</b> · ${t('sh.total')} <b>${sgn(M.total)}%</b> (± ~1.5 % ${t('sh.indiv')})</div>
      <div>${t('sh.hyst')} ${f1(H.stored)} J ${t('sh.stored')}, ${f1(H.back)} J ${t('sh.returned')} (ER ${f0(H.er * 100)}%), ${f1(H.lost)} J ${t('sh.heat')}</div>`;
    if (M.legalRoad && M.total <= -4 && S.mass <= 230) this.done('shoe');
    const g = $('#sh-goal'); if (g) g.innerHTML = `${badge(this.goal.shoe)} ${t('goal.shoe')}`;
  }

  // ═══ RACE ═══
  rcP() {
    const R = this.rc, [a, b, st] = RANGES[R.dist];
    return `<header class="lv-head mono">${t('rc.title')}</header><p class="intro">${t('rc.intro')}</p>
      ${this.chips('dist', Object.keys(DIST), R.dist, (k) => t('dist.' + k))}
      ${this.slider('r-t', t('rc.time'), R.t, a, b, st, fmtTime(R.t))}${this.slider('r-m', t('rc.mass'), R.mass, 45, 100, 1, R.mass + ' kg')}
      <div class="chips"><button class="btn seg ${R.useShoe ? 'active' : ''}" id="r-use">👟 ${t('rc.useShoe', { s: f1(-shoeModel(this.sh).total) })}</button><button class="btn seg ${!R.useShoe ? 'active' : ''}" id="r-cust">${t('rc.custom')}</button></div>
      ${R.useShoe ? '' : this.slider('r-s', t('rc.saving'), R.saving, 0, 6, 0.1, f1(R.saving) + ' %')}
      <button class="btn primary wide" id="r-go">🏁 ${t('rc.race')}</button><p class="small">${t('rc.note')}</p>`;
  }
  rcS() { return `<header class="lv-head mono">${t('rc.read')}</header><div class="bigstats" id="rc-big"></div><canvas class="cv chart" id="cv-race"></canvas><div class="math mono" id="rc-math"></div><div class="goal" id="rc-goal"></div>`; }
  rcB() {
    const R = this.rc;
    document.querySelectorAll('[data-dist]').forEach((b) => (b.onclick = () => { R.dist = b.dataset.dist; const [a, c] = RANGES[R.dist]; R.t = Math.round((a + (c - a) * 0.35) / 10) * 10; sfx.select(); this.render(); }));
    this.bindSliders(R, [['r-t', 't', (v) => fmtTime(v)], ['r-m', 'mass', (v) => v + ' kg'], ['r-s', 'saving', (v) => f1(v) + ' %']]);
    $('#r-use').onclick = () => { R.useShoe = true; this.render(); }; $('#r-cust').onclick = () => { R.useShoe = false; this.render(); };
    $('#r-go').onclick = () => this.race();
  }
  race() { this.rc.race = 0.001; sfx.confirm(); this.caption('cap.go'); }
  rcLive(full) {
    if (!full) return;
    const R = this.rc, s = this.saving(), P = racePredict(R.dist, R.t, s, R.mass);
    const big = $('#rc-big'); if (big) big.innerHTML = `<div><b class="mono c-green">${fmtTime(P.t1)}</b><small>${t('rc.new')}</small></div><div><b class="mono">${fmtTime(P.dt)}</b><small>${t('rc.saved')}</small></div><div><b class="mono">${f2(P.pct)}%</b><small>${t('rc.faster')} (${t('rc.from')} ${f1(s)}% RE)</small></div>`;
    const [a, b] = RANGES[R.dist], pts = [], naive = []; for (let k = 0; k <= 60; k++) { const T = a + ((b - a) * k) / 60; pts.push([T / 60, racePredict(R.dist, T, s, R.mass).pct]); naive.push([T / 60, s]); }
    lineChart($('#cv-race'), { x0: a / 60, x1: b / 60, y0: 0, y1: Math.max(1, Math.ceil(s * 1.25)), xFmt: (x) => fmtTime(x * 60), yFmt: (y) => f1(y) + '%', title: t('rc.chart'), series: [{ pts, color: '#dcff4a', label: t('rc.model') }, { pts: naive, color: 'rgba(232,238,252,.45)', dash: [4, 3], label: t('rc.naive') }], marks: [{ x: R.t / 60, color: '#fff', dot: [R.t / 60, P.pct] }] });
    const m = $('#rc-math');
    if (m) m.innerHTML = `<div>VO₂ = 2.209 + 3.1633·v (km/h) · 1 ml O₂ ≈ 20.1 J · P<sub>air</sub> = ½ρC<sub>d</sub>A·v³/0.28 (${t('rc.air')} ${f1(P.airShare * 100)}%)</div>
      <div>(1 − s)·P<sub>run</sub>(v′) + P<sub>air</sub>(v′) = P<sub>run</sub>(v) + P<sub>air</sub>(v) → v = ${f2(P.v0)} → <b>${f2(P.v1)} m/s</b></div>
      <div>${t('rc.why')}</div><div>${t('rc.bermon')}</div>`;
    if (R.dist === 'marathon') { if (R.t <= 2 * 3600 + 10 * 60) R.seen.elite = true; if (R.t >= 3.5 * 3600) R.seen.rec = true; }
    if (R.seen.elite && R.seen.rec) this.done('race');
    const g = $('#rc-goal'); if (g) g.innerHTML = `${badge(this.goal.race)} ${t('goal.race')} <span class="mono small">${R.seen.elite ? '✓' : '·'} ≤2:10 · ${R.seen.rec ? '✓' : '·'} ≥3:30</span>`;
  }

  // ═══ WEAR ═══
  wrP() {
    const W = this.wr;
    return `<header class="lv-head mono">${t('wr.title')}</header><p class="intro">${t('wr.intro')}</p>
      ${this.slider('w-km', t('wr.km'), W.km, 0, 1000, 5, W.km + ' km')}
      <div class="card"><b>${t('wr.placeboH')}</b><p>${t('wr.placebo')}</p></div>
      <div class="card warn"><b>${t('wr.injuryH')}</b><p>${t('wr.injury')}</p></div>`;
  }
  wrS() { return `<header class="lv-head mono">${t('wr.read')}</header><div class="bigstats" id="wr-big"></div><canvas class="cv chart" id="cv-wear"></canvas><canvas class="cv chart" id="cv-whyst"></canvas><div class="math mono" id="wr-math"></div><div class="goal" id="wr-goal"></div>`; }
  wrB() { this.bindSliders(this.wr, [['w-km', 'km', (v) => v + ' km']], () => this.reshape()); }
  wrLive(full) {
    if (!full) return;
    const W = this.wr, cx = crossover(), pe = wearCurve('peba', W.km), ev = wearCurve('eva', W.km);
    const big = $('#wr-big'); if (big) big.innerHTML = `<div><b class="mono">${sgn(pe)}%</b><small>PEBA ${t('wr.vsNew')}</small></div><div><b class="mono">${sgn(ev)}%</b><small>EVA ${t('wr.vsNew')}</small></div><div><b class="mono">${f0(cx)} km</b><small>${t('wr.cross')}</small></div>`;
    const a = [], b = []; for (let k = 0; k <= 1000; k += 10) { a.push([k, wearCurve('peba', k)]); b.push([k, wearCurve('eva', k)]); }
    lineChart($('#cv-wear'), { x0: 0, x1: 1000, y0: -2.5, y1: 2.5, xFmt: (x) => x + ' km', yFmt: (y) => (y > 0 ? '+' : '') + f1(y) + '%', title: t('wr.chart'), series: [{ pts: a, color: '#dcff4a', label: 'PEBA' }, { pts: b, color: '#c9ced6', label: 'EVA' }], marks: [{ x: W.km, color: '#fff' }, { x: 450, color: 'rgba(255,209,102,.6)', label: '450 km' }] });
    const Hn = hysteresis({ foam: 'peba', stack: this.sh.stack }), Hw = hysteresis({ foam: 'peba', stack: this.sh.stack, wornKm: W.km });
    lineChart($('#cv-whyst'), { x0: 0, x1: Math.ceil(Hn.xmax + 1), y0: 0, y1: 2000, xFmt: (x) => x + ' mm', yFmt: (y) => f1(y / 1000) + 'k', title: t('wr.hyst'), series: [{ pts: Hn.unload, color: 'rgba(220,255,74,.5)', dash: [4, 3], label: t('wr.new') }, { pts: Hw.load, color: '#7fe0ff', label: t('sh.load') }, { pts: Hw.unload, color: '#dcff4a', label: t('wr.worn') }] });
    const m = $('#wr-math');
    if (m) m.innerHTML = `<div>${t('wr.data')}</div><div>PEBA: −1.8 + 2.28·km/450 · EVA: 0.4·km/450 → ${t('wr.cross')} −1.8 + 1.88·km/450 = 0 → <b>${f0(cx)} km</b></div><div>${t('wr.tip')}</div>`;
    if (Math.abs(W.km - cx) <= 20) this.done('wear');
    const g = $('#wr-goal'); if (g) g.innerHTML = `${badge(this.goal.wear)} ${t('goal.wear')}`;
  }

  // ═══ EVIDENCE ═══
  evP() {
    const E = this.ev;
    return `<header class="lv-head mono">${t('ev.title')}</header><p class="intro">${t('ev.intro')}</p>
      <div class="cards">${EVIDENCE.slice().sort((a, b) => b.y - a.y).map((e) => `<button class="study ${E.open.has(e.id) ? 'open' : ''}" data-ev="${e.id}"><span class="yr mono">${e.y}</span><b>${t('ev.' + e.id + '.h')}</b>${e.effect != null ? `<em class="mono ${e.effect < 0 ? 'c-green' : e.effect > 0 ? 'c-red' : ''}">${sgn(e.effect)}%</em>` : '<em class="mono">—</em>'}${E.open.has(e.id) ? `<p>${t('ev.' + e.id + '.t')}</p><small>${e.ref}</small>` : ''}</button>`).join('')}</div>`;
  }
  evS() { return `<header class="lv-head mono">${t('ev.read')}</header><canvas class="cv forest" id="cv-forest"></canvas><div class="math mono" id="ev-math"></div><div class="goal" id="ev-goal"></div>`; }
  evB() { document.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => this.openStudy(b.dataset.ev))); }
  openStudy(id) { const E = this.ev; if (E.open.has(id)) E.open.delete(id); else { E.open.add(id); E.read = (E.read || new Set()).add(id); } sfx.select(); this.render(); }
  evLive(full) {
    if (!full) return;
    const cv = $('#cv-forest'); if (cv) {
      const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (r.width > 10) { if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
        const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, rows = EVIDENCE.filter((e) => e.effect != null && e.kind !== 'mass'), x0 = -5, x1 = 2, X = (v) => 120 + ((v - x0) / (x1 - x0)) * (W - 132), rh = (H - 30) / rows.length;
        g.clearRect(0, 0, W, H); g.font = '10px "JetBrains Mono", monospace'; g.strokeStyle = 'rgba(141,151,179,.25)';
        for (let v = x0; v <= x1; v++) { g.beginPath(); g.moveTo(X(v), 4); g.lineTo(X(v), H - 20); g.stroke(); g.fillStyle = 'rgba(141,151,179,.9)'; g.fillText((v > 0 ? '+' : '') + v + '%', X(v) - 9, H - 6); }
        g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X(0), 4); g.lineTo(X(0), H - 20); g.stroke();
        rows.forEach((e, i) => { const y = 10 + i * rh + rh / 2, col = { RE: '#dcff4a', perf: '#7fe0ff', meta: '#ffd166' }[e.kind] || '#c9ced6'; g.fillStyle = this.ev.open.has(e.id) ? '#fff' : 'rgba(232,238,252,.75)'; g.fillText(t('ev.' + e.id + '.s'), 4, y + 3); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.beginPath(); if (e.kind === 'meta') { g.moveTo(X(e.effect) - 7, y); g.lineTo(X(e.effect), y - 5); g.lineTo(X(e.effect) + 7, y); g.lineTo(X(e.effect), y + 5); } else g.arc(X(e.effect), y, 4.5, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0; });
        const mine = shoeModel(this.sh).total; g.strokeStyle = '#ff8a2a'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(Math.max(x0, mine)), 4); g.lineTo(X(Math.max(x0, mine)), H - 20); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff8a2a'; g.fillText(t('ev.yours'), X(Math.max(x0, mine)) + 3, 12);
      } }
    const m = $('#ev-math'); if (m) m.innerHTML = `<div>${t('ev.legend')}</div><div>${t('ev.caveat')}</div>`;
    if ((this.ev.read?.size || 0) >= 5) this.done('evidence');
    const g = $('#ev-goal'); if (g) g.innerHTML = `${badge(this.goal.evidence)} ${t('goal.evidence')} <span class="mono small">${this.ev.read?.size || 0}/5</span>`;
  }

  // ── Input / frame ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.1, Math.min(1.2, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.5, Math.min(2.5, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'shoe' && k === ' ') this.step(); if (this.tab === 'shoe' && k === 'e') $('#s-exp')?.click(); if (this.tab === 'race' && k === ' ') this.race(); }
  update(dt, time) {
    this.time = time; const v = this.view, tab = this.tab, race = tab === 'race';
    this.stadium.visible = race; this.shoe.visible = this.floor.visible = this.ring.visible = this.halo.visible = !race; this.studio.forEach((l) => (l.visible = !race));
    this.scene.background.set(race ? '#8fb3d9' : '#07080b'); this.scene.fog.near = race ? 150 : 2; this.scene.fog.far = race ? 700 : 9; this.scene.fog.color.set(race ? '#c9d9ea' : '#07080b');
    if (this.sh.stepT != null) { this.sh.stepT += dt; this.reshape(); if (this.sh.stepT > 0.7) { this.sh.stepT = null; this.reshape(); } }
    if (!v.drag && performance.now() - v.last > 3500) v.yaw += dt * 0.25;
    let cp, look;
    if (!race) {
      this.shoe.rotation.y = 0; const R = (tab === 'evidence' ? 1.1 : 0.95) * v.r, ex = this.sh.explode;
      look = V(0, 0.05 + ex * 0.03, 0); cp = V(Math.sin(v.yaw) * R * Math.cos(v.pitch), 0.12 + R * Math.sin(v.pitch) + ex * 0.05, Math.cos(v.yaw) * R * Math.cos(v.pitch));
      this.halo.material.opacity = 0.06 + 0.03 * Math.sin(time * 1.3);
    } else {
      const R = this.rc, s = this.saving(), P = racePredict(R.dist, R.t, s, R.mass), K = 6;   // ghost race at 6× speed
      if (R.race) R.race += dt * K;
      const dA = R.race * P.v0, dB = R.race * P.v1, [ax, az, aa] = trackPoint(dA, 0), [bx, bz, ba] = trackPoint(dB, 1);
      this.ghostA.position.set(ax, 0, az); this.ghostA.rotation.y = aa; this.ghostB.position.set(bx, 0, bz); this.ghostB.rotation.y = ba;
      poseRunner(this.ghostA, R.race * P.v0 * 2.6); poseRunner(this.ghostB, R.race * P.v1 * 2.6);
      const mid = V((ax + bx) / 2, 1, (az + bz) / 2), Rr = 70 * v.r;
      look = R.race ? mid : V(0, 0, 0); cp = R.race ? mid.clone().add(V(Math.sin(v.yaw) * 14, 6, Math.cos(v.yaw) * 14)) : V(Math.sin(v.yaw) * Rr * 1.6, 55, Math.cos(v.yaw) * Rr * 1.6);
      if (R.race && Math.floor(R.race / 40) !== Math.floor((R.race - dt * K) / 40)) this.app.feed.push('rc.gap', 'ok', { m: f1(dB - dA), t: f0(R.race) });
    }
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook);
    this.cam.fov = race ? 45 : 32; this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'shoe') this.shLive(full);
    if (this.tab === 'race') this.rcLive(full);
    if (this.tab === 'wear') this.wrLive(full);
    if (this.tab === 'evidence') this.evLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const rows = ['shoe', 'race', 'wear', 'evidence'].map((k) => [t('rep.' + k), this.goal[k]]), M = shoeModel(this.sh), P = racePredict('marathon', this.rc.t, this.saving(), this.rc.mass);
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const li = document.createElement('li'); li.className = 'ok'; li.textContent = t('rep.yourShoe', { s: f1(-M.total), a: fmtTime(this.rc.t), b: fmtTime(P.t1) }); list.appendChild(li);
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const l = document.createElement('li'); l.textContent = t('rep.' + k); nx.appendChild(l); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-title').textContent = sc === 100 ? t('rep.ready') : t('rep.notReady');
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
void REF; void wearPenalty; void newSpeed; void lapLength;
