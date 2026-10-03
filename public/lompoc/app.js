import * as THREE from 'three';
import { BOUNDS, POIS, POI, heightAt, isLand, landUse, rng, SCALE } from './sim/geo.js';
import { G, BODY, CANOPY, PLANE, MASS, vTerm, rho, simulateDrop, reachRing, dropStep, newJumper, PHASES, R0, MAP_C, pNext, makeCircles, zoneAt, edgeSpeed, RIFLE, solution, shoot, cdMach, ttk, WEAPONS, pHit } from './sim/br.js';
import { buildWorld, buildZone, SUN_DIR } from './view/map.js';
import { buildOperator, poseOperator, buildPlane } from './view/actors.js';
import { glowSprite, pointCloud } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// DROPZONE: LOMPOC · the app. Four tabs: the drop (freefall + canopy physics), the circle (where the
// next zone can land — a lens-area probability), the range (external ballistics in Lompoc's wind)
// and the match: 24 operators, one plane, one shrinking circle.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NAMES = ['Arguello', 'Tranquillon', 'Purisima', 'Jalama', 'Honda', 'Sudden', 'Burton', 'Mesa', 'Sage', 'Condor', 'Kestrel', 'Gull', 'Sable', 'Ridge', 'Breaker', 'Marlin', 'Coyote', 'Ember', 'Harbor', 'Sundown', 'Tumbleweed', 'Lupine', 'Poppy'];
const DROP_PATH = [[1350, 2150], [-4450, -3200]];           // the drop-lab flight line (SE → NW)
const RANGE_AT = [-592, 300];                                 // firing point at the edge of the flower fields, facing north
const ZONE_T0 = 60;                                           // the circle clock starts 60 s after the plane

export class Drop {
  constructor(app) {
    this.app = app; this.W = buildWorld(); this.scene = this.W.scene; this.zone = buildZone(this.scene);
    this.cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 60000); this.scene.add(this.cam);
    this.plane = buildPlane(); this.scene.add(this.plane);
    this.me = buildOperator('#4e5a3c', '#ff8a2a'); this.scene.add(this.me);
    this.bots = NAMES.map((n, i) => { const o = buildOperator(['#6b6a52', '#4f5b4a', '#5a5040', '#3f4a52'][i % 4], ['#d0d0d0', '#59b7ff', '#ffd166', '#c86bff'][i % 4]); o.visible = false; this.scene.add(o); return o; });
    // Markers and lines.
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1, 24, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); this.beacon.scale.y = 900; this.scene.add(this.beacon);
    this.youMark = glowSprite('#ffffff', 90, 0.9); this.scene.add(this.youMark);
    this.pathLine = this.mkLine(800, '#ffd166'); this.flightLine = this.mkLine(2, '#ffffff', 0.5); this.ringLine = this.mkLine(33, '#7fe0ff', 0.9, true);
    this.tracers = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(256 * 6), 3)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(256 * 6), 3)), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false; this.scene.add(this.tracers); this.tr = []; this.trI = 0;
    this.mcPts = pointCloud(2500, 28, '#ffd166'); this.mcPts.visible = false; this.scene.add(this.mcPts);
    this.spark = glowSprite('#ffd166', 2, 0); this.scene.add(this.spark);
    this.bullet = glowSprite('#ffe9a8', 1.2, 0); this.scene.add(this.bullet);
    // Range: a steel plate on a post, a prone shooter.
    this.plate = new THREE.Group(); const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), new THREE.MeshStandardMaterial({ color: '#3a3a3a' })); post.position.y = 0.7; this.plate.add(post);
    this.disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.5, metalness: 0.4, emissive: '#ff7a1a', emissiveIntensity: 0.25 })); this.disc.position.y = 1.55; this.plate.add(this.disc); const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.1), new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.9 })); back.position.set(0, 1.4, -1.5); this.plate.add(back); this.scene.add(this.plate);
    this.dp = { poi: 'oldtown', jump: 0.5, deploy: 300, mode: 'track', sim: null, ring: null, anim: null, last: null };
    this.zn = { phase: 0, seed: 3, you: [-900, -250], mc: null, mcN: 0, cs: null };
    this.rg = { R: 300, w: 6, holdE: 0, holdW: 0, shots: [], anim: null, best: null };
    this.ms = { auto: true, speed: 1, seed: 7 }; this.mt = null;
    this.goal = { drop: false, zone: false, range: false, match: false };
    this.view = { yaw: 0, pitch: 0.35, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'drop'; this.entered = false; this.uiT = 0; this.time = 0;
    this.zn.cs = makeCircles(rng(this.zn.seed), isLand);
    this.mapImg = this.buildMapImage();
    this.dp.jump = this.bestJump(); this.calcDrop();
    app.stage.use(this.scene, this.cam);
  }
  mkLine(n, color, opacity = 1, loop = false) { const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const L = new (loop ? THREE.LineLoop : THREE.Line)(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); L.frustumCulled = false; L.renderOrder = 4; this.scene.add(L); return L; }
  setLine(L, pts) { const p = L.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const q = pts[Math.min(i, pts.length - 1)] || [0, 0, 0]; p.setXYZ(i, q[0], q[1], q[2]); } p.needsUpdate = true; L.geometry.setDrawRange(0, Math.min(p.count, pts.length)); }

  // ── Shared UI helpers ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['drop', 'zone', 'range', 'match'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true;
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { drop: ['dpP', 'dpS', 'dpB'], zone: ['znP', 'znS', 'znB'], range: ['rgP', 'rgS', 'rgB'], match: ['mtP', 'mtS', 'mtB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true); }

  // ── The map as a picture (for the minimap and the circle tab) ──
  buildMapImage() {
    const w = 300, h = Math.round((300 * (BOUNDS.z1 - BOUNDS.z0)) / (BOUNDS.x1 - BOUNDS.x0)), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), COL = { sea: [28, 52, 66], beach: [214, 196, 154], water: [70, 110, 124], riparian: [84, 112, 60], city: [150, 142, 130], village: [150, 145, 120], base: [140, 136, 122], field: [170, 110, 150], grass: [176, 148, 92], chaparral: [96, 104, 58] };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x = BOUNDS.x0 + ((i + 0.5) / w) * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + ((j + 0.5) / h) * (BOUNDS.z1 - BOUNDS.z0), lu = landUse(x, z), hh = heightAt(x, z), c0 = COL[lu] || COL.grass, sh = lu === 'sea' ? 1 : 0.8 + Math.min(0.35, hh / 900) + (heightAt(x - 20, z - 20) - hh) * -0.004; const k = (j * w + i) * 4; img.data[k] = c0[0] * sh; img.data[k + 1] = c0[1] * sh; img.data[k + 2] = c0[2] * sh; img.data[k + 3] = 255; }
    g.putImageData(img, 0, 0); return c;
  }
  // Draw the map into a canvas; returns world→pixel transform.
  drawMap(cv, extra) {
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (r.width < 10) return null; if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, sx = W / (BOUNDS.x1 - BOUNDS.x0), sz = H / (BOUNDS.z1 - BOUNDS.z0), s = Math.min(sx, sz), ox = (W - s * (BOUNDS.x1 - BOUNDS.x0)) / 2, oz = (H - s * (BOUNDS.z1 - BOUNDS.z0)) / 2;
    const P = (x, z) => [ox + (x - BOUNDS.x0) * s, oz + (z - BOUNDS.z0) * s];
    g.clearRect(0, 0, W, H); g.drawImage(this.mapImg, ox, oz, s * (BOUNDS.x1 - BOUNDS.x0), s * (BOUNDS.z1 - BOUNDS.z0));
    g.font = '600 9px "JetBrains Mono", monospace'; g.textAlign = 'center';
    for (const p of POIS) { const [x, y] = P(p.x, p.z); g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(t('poi.' + p.id), x + 1, y + 1); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(t('poi.' + p.id), x, y); }
    extra?.(g, P, s, W, H); return { P, s };
  }

  // ═══ DROP ═══
  pathPoint(f) { const [A, B] = DROP_PATH; return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]; }
  pathDir() { const [A, B] = DROP_PATH, L = Math.hypot(B[0] - A[0], B[1] - A[1]); return [(B[0] - A[0]) / L, (B[1] - A[1]) / L, L]; }
  bestJump() { const [A] = DROP_PATH, [dx, dz, L] = this.pathDir(), p = POI[this.dp.poi]; return Math.max(0, Math.min(1, ((p.x - A[0]) * dx + (p.z - A[1]) * dz) / L)); }
  calcDrop() {
    const D = this.dp, [x, z] = this.pathPoint(D.jump), [dx, dz] = this.pathDir(), p = POI[D.poi];
    const o = { x, z, h: PLANE.alt, vx: dx * PLANE.v, vz: dz * PLANE.v, mode: D.mode, deployAGL: D.deploy };
    D.sim = simulateDrop({ ...o, tx: p.x, tz: p.z }, heightAt); D.ring = reachRing(o, heightAt, 32);
    this.setLine(this.pathLine, D.sim.path.map((q) => [q[1], q[3], q[2]]));
    this.setLine(this.ringLine, D.ring.map(([a, b]) => [a, Math.max(2, heightAt(a, b)) + 12, b]));
    const [A, B] = DROP_PATH; this.setLine(this.flightLine, [[A[0], PLANE.alt, A[1]], [B[0], PLANE.alt, B[1]]]);
  }
  dpP() {
    const D = this.dp, [, , L] = this.pathDir();
    return `<header class="lv-head mono">${t('dp.title')}</header><p class="intro">${t('dp.intro')}</p>
      <header class="lv-sub mono">${t('dp.target')}</header>${this.chips('poi', POIS.map((p) => p.id), D.poi, (k) => t('poi.' + k))}
      ${this.slider('d-j', t('dp.jump'), D.jump, 0, 1, 0.005, f1((D.jump * L) / 1000) + ' km')}
      <button class="btn seg wide" id="d-best">⌖ ${t('dp.best')}</button>
      <header class="lv-sub mono">${t('dp.body')}</header>${this.chips('mode', Object.keys(BODY), D.mode, (k) => t('body.' + k))}
      ${this.slider('d-h', t('dp.deploy'), D.deploy, 150, 1200, 10, D.deploy + ' m')}
      <button class="btn primary wide" id="d-go">🪂 ${t('dp.go')}</button><p class="small">${t('dp.note')}</p>`;
  }
  dpS() { return `<header class="lv-head mono">${t('dp.read')}</header><div class="bigstats" id="dp-big"></div><canvas class="cv chart" id="cv-drop"></canvas><div class="math mono" id="dp-math"></div><div class="goal" id="dp-goal"></div>`; }
  dpB() {
    const D = this.dp, [, , L] = this.pathDir(), re = () => { this.calcDrop(); };
    document.querySelectorAll('[data-poi]').forEach((b) => (b.onclick = () => { D.poi = b.dataset.poi; sfx.select(); this.calcDrop(); this.render(); }));
    document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { D.mode = b.dataset.mode; sfx.select(); this.calcDrop(); this.render(); }));
    this.bindSliders(D, [['d-j', 'jump', (v) => f1((v * L) / 1000) + ' km'], ['d-h', 'deploy', (v) => v + ' m']], re);
    $('#d-best').onclick = () => { D.jump = this.bestJump(); this.calcDrop(); this.render(); };
    $('#d-go').onclick = () => this.jump();
  }
  jump() { const D = this.dp; this.calcDrop(); D.anim = { t: 0, sim: D.sim }; sfx.confirm(); this.caption('cap.jump'); }
  dpLive(full) {
    if (!full) return;
    const D = this.dp, S = D.sim; if (!S) return;
    const big = $('#dp-big'); if (big) big.innerHTML = `<div><b class="mono">${f1(S.t)} s</b><small>${t('dp.time')}</small></div><div><b class="mono ${S.err <= 50 ? 'c-green' : 'c-red'}">${f0(S.err)} m</b><small>${t('dp.err')}</small></div><div><b class="mono">${f0(S.vmax * 3.6)}</b><small>${t('dp.vmax')} km/h</small></div>`;
    const sp = S.path.map((q) => [q[0], q[4]]), al = S.path.map((q) => [q[0], (q[3] - heightAt(q[1], q[2])) / 20]);
    lineChart($('#cv-drop'), { x0: 0, x1: Math.max(30, Math.ceil(S.t / 10) * 10), y0: 0, y1: 100, xFmt: (x) => x + ' s', title: t('dp.chart'), series: [{ pts: sp, color: '#ffd166', label: t('dp.speed') }, { pts: al, color: '#7fe0ff', dash: [4, 3], label: t('dp.agl') }], marks: S.tDeploy != null ? [{ x: S.tDeploy, color: '#ff8a2a', label: t('dp.open') }] : [] });
    const B = BODY[D.mode], m = $('#dp-math');
    if (m) m.innerHTML = `<div>v<sub>t</sub> = √(2mg/ρC<sub>D</sub>A) · m = ${MASS} kg · ρ(1 km) = 1.225·e<sup>−h/8500</sup> = <b>${f2(rho(1000))}</b> kg/m³</div>
      <div>${Object.entries(BODY).map(([k, b]) => `${t('body.' + k)} C<sub>D</sub>A ${b.CdA} m² → <b>${f0(vTerm(b.CdA, 1000))} m/s</b>, L/D ${b.LD}`).join(' · ')}</div>
      <div>${t('dp.canopy')} ${CANOPY.vh} m/s ${t('dp.fwd')}, ${CANOPY.vz} m/s ${t('dp.down')} → ${t('dp.glide')} ${f1(CANOPY.vh / CANOPY.vz)} : 1 · ${t('dp.reach')} ≈ (H − h<sub>d</sub>)·L/D + h<sub>d</sub>·${f1(CANOPY.vh / CANOPY.vz)} = ${f0((PLANE.alt - 40 - D.deploy) * B.LD + D.deploy * (CANOPY.vh / CANOPY.vz))} m</div>
      <div>${t('dp.tfall')} ≈ (H − h<sub>d</sub>)/v<sub>t</sub> + h<sub>d</sub>/${CANOPY.vz} · ${t('dp.real')}</div>`;
    const g = $('#dp-goal'); if (g) g.innerHTML = `${badge(this.goal.drop)} ${t('goal.drop')}`;
  }
  dropTick(dt) {
    const A = this.dp.anim; if (!A) return;
    A.t += dt * 4; const P = A.sim.path, i = P.findIndex((q) => q[0] >= A.t), q = P[i < 0 ? P.length - 1 : i];
    this.me.visible = true; this.me.position.set(q[1], q[3], q[2]);
    const q2 = P[Math.max(0, (i < 0 ? P.length - 1 : i) - 1)], hd = Math.atan2(q[1] - q2[1], q[2] - q2[2]); this.me.rotation.y = hd;
    poseOperator(this.me, i < 0 ? 'stand' : q[5] ? 'canopy' : this.dp.mode === 'belly' ? 'fall' : 'track', this.time, 0);
    if (i < 0) { this.dp.anim = null; const S = A.sim; this.app.feed.push(S.err <= 50 ? 'dp.landed' : 'dp.missed', S.err <= 50 ? 'ok' : 'warn', { e: f0(S.err), t: f1(S.t) }); if (S.err <= 50 && S.t <= 70) this.done('drop'); this.render(); }
  }

  // ═══ ZONE ═══
  znP() {
    const Z = this.zn, P = PHASES[Z.phase];
    return `<header class="lv-head mono">${t('zn.title')}</header><p class="intro">${t('zn.intro')}</p>
      <header class="lv-sub mono">${t('zn.phase')}</header>${this.chips('ph', PHASES.map((_, i) => i), Z.phase, (k) => k + 1)}
      <p class="small mono">R ${f0(this.zn.cs[Z.phase].r)} m → r ${f0(P.r)} m · ${t('zn.wait')} ${P.wait} s · ${t('zn.shrink')} ${P.shrink} s · ${P.dps} HP/s</p>
      <div class="chips"><button class="btn seg" id="z-new">↻ ${t('zn.new')}</button><button class="btn primary" id="z-mc">🎲 ${t('zn.mc')}</button></div>
      <p class="small">${t('zn.click')}</p>`;
  }
  znS() { return `<header class="lv-head mono">${t('zn.read')}</header><div class="bigstats" id="zn-big"></div><canvas class="cv map" id="cv-zmap"></canvas><div class="math mono" id="zn-math"></div><div class="goal" id="zn-goal"></div>`; }
  znB() {
    const Z = this.zn;
    document.querySelectorAll('[data-ph]').forEach((b) => (b.onclick = () => { Z.phase = +b.dataset.ph; sfx.select(); this.render(); }));
    $('#z-new').onclick = () => { Z.seed++; Z.cs = makeCircles(rng(Z.seed), isLand); sfx.select(); this.render(); };
    $('#z-mc').onclick = () => this.monteCarlo(2000);
    $('#cv-zmap').onclick = (e) => { const r = e.target.getBoundingClientRect(), W = r.width, H = r.height, s = Math.min(W / (BOUNDS.x1 - BOUNDS.x0), H / (BOUNDS.z1 - BOUNDS.z0)), ox = (W - s * (BOUNDS.x1 - BOUNDS.x0)) / 2, oz = (H - s * (BOUNDS.z1 - BOUNDS.z0)) / 2; Z.you = [BOUNDS.x0 + (e.clientX - r.left - ox) / s, BOUNDS.z0 + (e.clientY - r.top - oz) / s]; sfx.select(); this.refresh(true); };
  }
  monteCarlo(n) {
    const Z = this.zn, R = rng(1000 + Z.seed), pts = [];
    for (let k = 0; k < n; k++) { const cs = makeCircles(R, isLand); pts.push(cs[PHASES.length - 1].c); }
    Z.mc = pts; Z.mcN = n; const P = this.mcPts.geometry.attributes.position, Cc = this.mcPts.geometry.attributes.color;
    for (let i = 0; i < P.count; i++) { const q = pts[i % pts.length]; P.setXYZ(i, q[0], Math.max(2, heightAt(q[0], q[1])) + 30, q[1]); Cc.setXYZ(i, 1, 0.82, 0.4); }
    P.needsUpdate = Cc.needsUpdate = true; this.mcPts.visible = true;
    // How far do final circles land from the map centre? (mean and the share within 1 km)
    const ds = pts.map((q) => Math.hypot(q[0] - MAP_C[0], q[1] - MAP_C[1])); Z.mcMean = ds.reduce((a, b) => a + b, 0) / n; Z.mcIn1 = ds.filter((d) => d < 1000).length / n;
    this.app.feed.push('zn.mcDone', 'ok', { n: f0(n) }); sfx.confirm(); this.refresh(true);
  }
  znLive(full) {
    if (!full) return;
    const Z = this.zn, A = Z.cs[Z.phase], Bc = Z.cs[Z.phase + 1], P = PHASES[Z.phase], d = Math.hypot(Z.you[0] - A.c[0], Z.you[1] - A.c[1]), p = d > A.r ? 0 : pNext(d, A.r, P.r);
    const dc = Math.hypot(Bc.c[0] - A.c[0], Bc.c[1] - A.c[1]), ve = edgeSpeed(A.r, P.r, dc, P.shrink), dIn = Math.max(0, Math.hypot(Z.you[0] - Bc.c[0], Z.you[1] - Bc.c[1]) - Bc.r);
    const big = $('#zn-big'); if (big) big.innerHTML = `<div><b class="mono ${p >= 0.8 ? 'c-green' : p > 0.4 ? 'c-amber' : 'c-red'}">${f0(p * 100)}%</b><small>${t('zn.p')}</small></div><div><b class="mono">${f1(ve)} m/s</b><small>${t('zn.edge')}</small></div><div><b class="mono">${f0(dIn / 7)} s</b><small>${t('zn.run')}</small></div>`;
    const cv = $('#cv-zmap'); if (cv) this.drawMap(cv, (g, Pm, s) => {
      // Heat map of P(in next circle) over the current circle.
      const N = 46; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = A.c[0] - A.r + ((i + 0.5) / N) * 2 * A.r, z = A.c[1] - A.r + ((j + 0.5) / N) * 2 * A.r, dd = Math.hypot(x - A.c[0], z - A.c[1]); if (dd > A.r) continue; const q = pNext(dd, A.r, P.r), [px, py] = Pm(x - A.r / N, z - A.r / N); g.fillStyle = `rgba(255,${Math.round(90 + 140 * q)},60,${0.12 + q * 0.45})`; g.fillRect(px, py, (2 * A.r * s) / N + 0.5, (2 * A.r * s) / N + 0.5); }
      const circ = (c, r, st, dash) => { const [x, y] = Pm(c[0], c[1]); g.beginPath(); g.arc(x, y, r * s, 0, Math.PI * 2); g.setLineDash(dash || []); g.strokeStyle = st; g.lineWidth = 1.6; g.stroke(); g.setLineDash([]); };
      circ(A.c, A.r, '#ffffff'); circ(A.c, A.r - P.r, 'rgba(255,209,102,.9)', [4, 3]); circ(Bc.c, Bc.r, '#7fe0ff', [3, 3]);
      if (Z.mc) { g.fillStyle = 'rgba(255,209,102,.5)'; for (const q of Z.mc) { const [x, y] = Pm(q[0], q[1]); g.fillRect(x - 0.6, y - 0.6, 1.4, 1.4); } }
      const [yx, yy] = Pm(Z.you[0], Z.you[1]); g.fillStyle = '#fff'; g.beginPath(); g.arc(yx, yy, 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    });
    const m = $('#zn-math'), pc = pNext(0, A.r, P.r);
    if (m) m.innerHTML = `<div>${t('zn.rule')} |c′ − c| ≤ R − r = <b>${f0(A.r - P.r)} m</b> (${t('zn.dashed')})</div>
      <div>P(${t('zn.in')}) = |D(p, r) ∩ D(c, R−r)| / π(R−r)² · ${t('zn.lens')}</div>
      <div>${t('zn.atc')} P = min(1, r²/(R−r)²) = <b>${f0(pc * 100)}%</b> · ${t('zn.you')} d = ${f0(d)} m → <b>${f0(p * 100)}%</b></div>
      <div>${t('zn.edgeL')} v = (R − r + |Δc|)/T = (${f0(A.r)} − ${f0(P.r)} + ${f0(dc)})/${P.shrink} = <b>${f1(ve)} m/s</b> vs ${t('zn.sprint')} 7 m/s</div>
      ${Z.mc ? `<div>${t('zn.mcL', { n: f0(Z.mcN) })} <b>${f0(Z.mcMean)} m</b> · ${t('zn.mcIn')} <b>${f0(Z.mcIn1 * 100)}%</b></div>` : ''}`;
    if (Z.mc && p >= 0.8) this.done('zone');
    const gg = $('#zn-goal'); if (gg) gg.innerHTML = `${badge(this.goal.zone)} ${t('goal.zone')}`;
  }

  // ═══ RANGE ═══
  rgP() {
    const S = this.rg;
    return `<header class="lv-head mono">${t('rg.title')}</header><p class="intro">${t('rg.intro')}</p>
      ${this.slider('r-R', t('rg.R'), S.R, 100, 800, 25, S.R + ' m')}${this.slider('r-w', t('rg.w'), S.w, 0, 12, 0.5, f1(S.w) + ' m/s')}
      <header class="lv-sub mono">${t('rg.holds')}</header>${this.slider('r-e', t('rg.holdE'), S.holdE, 0, 10, 0.1, f1(S.holdE) + ' mil')}${this.slider('r-h', t('rg.holdW'), S.holdW, -5, 5, 0.1, f1(S.holdW) + ' mil')}
      <button class="btn primary wide" id="r-fire">◎ ${t('rg.fire')}</button><p class="small">${t('rg.note')}</p>`;
  }
  rgS() { return `<header class="lv-head mono">${t('rg.read')}</header><canvas class="cv scope" id="cv-scope"></canvas><div class="bigstats" id="rg-big"></div><canvas class="cv chart" id="cv-traj"></canvas><div class="math mono" id="rg-math"></div><div class="goal" id="rg-goal"></div>`; }
  rgB() {
    const S = this.rg; this.bindSliders(S, [['r-R', 'R', (v) => v + ' m'], ['r-w', 'w', (v) => f1(v) + ' m/s'], ['r-e', 'holdE', (v) => f1(v) + ' mil'], ['r-h', 'holdW', (v) => f1(v) + ' mil']], () => { if (this.rg.lastR !== S.R || this.rg.lastW !== S.w) { S.shots = []; S.lastR = S.R; S.lastW = S.w; } });
    $('#r-fire').onclick = () => this.fire();
  }
  solution(R, w) { return solution(R, w); }
  fire() {
    const S = this.rg; if (S.anim) return; const k = shoot(S.R, S.w, S.holdE, S.holdW), hit = Math.hypot(k.y, k.z) <= 0.25;
    S.anim = { t: 0, k, hit }; sfx.select();
  }
  rangeTick(dt) {
    const S = this.rg, A = S.anim; this.plate.position.set(RANGE_AT[0], heightAt(RANGE_AT[0], RANGE_AT[1] - S.R), RANGE_AT[1] - S.R);
    this.disc.rotation.x = (this.swingT ?? 0) > 0 ? Math.sin((this.swingT -= dt) * 14) * this.swingT * 0.8 : 0;
    if (!A) { this.bullet.material.opacity = 0; this.spark.material.opacity = Math.max(0, this.spark.material.opacity - dt * 2); return; }
    A.t += dt; const k = A.k, f = Math.min(1, A.t / k.t), tr = k.tr, i = Math.min(tr.length - 1, Math.floor(f * (tr.length - 1))), q = tr[i], y0 = heightAt(RANGE_AT[0], RANGE_AT[1]) + 0.35;
    this.bullet.position.set(RANGE_AT[0] + q[2], y0 + q[1] + (1.55 - 0.35) * (q[0] / S.R), RANGE_AT[1] - q[0]); this.bullet.material.opacity = f < 1 ? 1 : 0;
    if (f >= 1 && !A.done) {
      A.done = true; S.shots.push({ y: k.y, z: k.z, hit: A.hit }); if (S.shots.length > 12) S.shots.shift();
      this.spark.position.set(RANGE_AT[0] + k.z, this.plate.position.y + 1.55 + k.y, RANGE_AT[1] - S.R + 0.2); this.spark.material.color.set(A.hit ? '#ffd166' : '#d8c49a'); this.spark.scale.setScalar(A.hit ? 2.5 : 4); this.spark.material.opacity = 1;
      if (A.hit) { this.swingT = 1; sfx.confirm(); }
      this.app.feed.push(A.hit ? 'rg.hit' : 'rg.miss', A.hit ? 'ok' : 'warn', { dy: f0(k.y * 100), dz: f0(k.z * 100), r: S.R });
      if (A.hit && S.R >= 500 && S.w >= 5) this.done('range');
      this.refresh(true);
    }
    if (A.t > k.t + 0.6) S.anim = null;
  }
  rgLive(full) {
    if (!full) return;
    const S = this.rg, sol = solution(S.R, S.w);
    const big = $('#rg-big'); if (big) big.innerHTML = `<div><b class="mono">${f2(sol.t)} s</b><small>${t('rg.tof')}</small></div><div><b class="mono">${f0(sol.v)} m/s</b><small>${t('rg.vimp')} · M ${f2(sol.mach)}</small></div><div><b class="mono">${f0(sol.E)} J</b><small>${t('rg.energy')}</small></div>`;
    const ser = [], ser2 = []; for (let R = 50; R <= 800; R += 25) { const s2 = solution(R, S.w); ser.push([R, s2.holdE]); ser2.push([R, s2.holdW]); }
    lineChart($('#cv-traj'), { x0: 50, x1: 800, y0: 0, y1: 12, xFmt: (x) => x + ' m', title: t('rg.chart'), series: [{ pts: ser, color: '#ffd166', label: t('rg.elev') }, { pts: ser2, color: '#7fe0ff', label: t('rg.wind') }], marks: [{ x: S.R, color: '#fff' }] });
    this.drawScope(sol);
    const m = $('#rg-math');
    if (m) m.innerHTML = `<div>a = −(ρC<sub>D</sub>(M)A/2m)|v<sub>rel</sub>|v<sub>rel</sub> − g · m ${f1(RIFLE.m * 1000)} g · Ø ${f2(RIFLE.d * 1000)} mm · v₀ ${RIFLE.v0} m/s · C<sub>D</sub>(M ${f2(RIFLE.v0 / 343)}) = ${f2(cdMach(RIFLE.v0 / 343))}</div>
      <div>${t('rg.at', { r: S.R })}: ${t('rg.drop')} <b>${f0(-sol.drop * 100)} cm</b> = <b>${f1(sol.holdE)} mil</b> · ${t('rg.drift')} <b>${f0(sol.drift * 100)} cm</b> = <b>${f1(sol.holdW)} mil</b></div>
      <div>1 mil = 1 m ${t('rg.per')} 1000 m · ${t('rg.plate')} Ø 50 cm = ${f2(500 / S.R)} mil · ${t('rg.lompoc')}</div>`;
    const g = $('#rg-goal'); if (g) g.innerHTML = `${badge(this.goal.range)} ${t('goal.range')}`;
  }
  drawScope(sol) {
    const cv = $('#cv-scope'); if (!cv) return; const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (r.width < 10) return; if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, cx = W / 2, cy = H * 0.3, k = W / 14, S = this.rg;
    g.fillStyle = '#d9c39a'; g.fillRect(0, 0, W, H); const gr = g.createLinearGradient(0, 0, 0, H * 0.25); gr.addColorStop(0, '#f2c79a'); gr.addColorStop(1, '#e6d2b0'); g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.22);
    // Field stripes beyond the target.
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#8f6bd0', '#f0c92e', '#d8463c', '#ee8fc0', '#6a9a3c', '#f2f0e6'][i]; g.globalAlpha = 0.35; g.fillRect(0, H * 0.22 + i * 6, W, 5); } g.globalAlpha = 1;
    // Plate position relative to the crosshair: holding E mil high puts the target E mil below the centre.
    const px = cx - S.holdW * k, py = cy + S.holdE * k, pr = Math.max(2, (0.25 / S.R) * 1000 * k);
    g.fillStyle = '#3a3a3a'; g.fillRect(px - 1.5, py, 3, (1.55 / S.R) * 1000 * k); g.fillStyle = '#ff7a1a'; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    for (const s of S.shots) { const ix = px + (s.z / S.R) * 1000 * k, iy = py - (s.y / S.R) * 1000 * k; g.fillStyle = s.hit ? '#ffffff' : '#222'; g.beginPath(); g.arc(ix, iy, 2.6, 0, Math.PI * 2); g.fill(); }
    // Mil reticle.
    g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, cy); g.lineTo(W, cy); g.moveTo(cx, 0); g.lineTo(cx, H); g.stroke();
    g.font = '9px "JetBrains Mono", monospace'; g.fillStyle = '#000';
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(cx + i * k, cy - (i % 2 ? 3 : 6)); g.lineTo(cx + i * k, cy + (i % 2 ? 3 : 6)); g.stroke(); }
    for (let i = 1; i <= 12; i++) { g.beginPath(); g.moveTo(cx - (i % 2 ? 3 : 7), cy + i * k); g.lineTo(cx + (i % 2 ? 3 : 7), cy + i * k); g.stroke(); if (i % 2 === 0) g.fillText(i, cx + 9, cy + i * k + 3); }
    const vg = g.createRadialGradient(cx, H / 2, Math.min(W, H) * 0.38, cx, H / 2, Math.max(W, H) * 0.65); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.95)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    void sol;
  }

  // ═══ MATCH ═══
  mtP() {
    const M = this.ms, T = this.mt;
    return `<header class="lv-head mono">${t('mt.title')}</header><p class="intro">${t('mt.intro')}</p>
      <header class="lv-sub mono">${t('dp.target')}</header>${this.chips('mpoi', POIS.map((p) => p.id), this.dp.poi, (k) => t('poi.' + k))}
      <div class="chips"><button class="btn seg ${M.auto ? 'active' : ''}" id="m-auto">${t('mt.auto')}</button>${[1, 2, 4].map((s) => `<button class="btn seg ${M.speed === s ? 'active' : ''}" data-spd="${s}">×${s}</button>`).join('')}</div>
      <button class="btn primary wide" id="m-go">✈ ${T ? t('mt.again') : t('mt.start')}</button>
      <p class="small">${t('mt.keys')}</p><div class="status mono" id="m-status"></div>`;
  }
  mtS() { return `<header class="lv-head mono">${t('mt.read')}</header><div class="bigstats" id="mt-big"></div><div class="bars" id="mt-bars"></div><canvas class="cv map" id="cv-mm"></canvas><div class="math mono" id="mt-math"></div><div class="goal" id="mt-goal"></div>`; }
  mtB() {
    const M = this.ms;
    document.querySelectorAll('[data-mpoi]').forEach((b) => (b.onclick = () => { this.dp.poi = b.dataset.mpoi; if (this.mt) this.mt.A[0].dest = [POI[this.dp.poi].x, POI[this.dp.poi].z]; sfx.select(); this.calcDrop(); this.render(); }));
    document.querySelectorAll('[data-spd]').forEach((b) => (b.onclick = () => { M.speed = +b.dataset.spd; sfx.select(); this.render(); }));
    $('#m-auto').onclick = () => { M.auto = !M.auto; sfx.select(); this.render(); };
    $('#m-go').onclick = () => this.startMatch();
  }
  startMatch(seed) {
    if (seed != null) this.ms.seed = seed; else this.ms.seed++;
    const R = rng(this.ms.seed), cs = makeCircles(R, isLand), ang = R() * Math.PI * 2, cx = MAP_C[0] + (R() - 0.5) * 1200, cz = MAP_C[1] + (R() - 0.5) * 1200, dx = Math.cos(ang), dz = Math.sin(ang), half = 2700;
    const path = [[cx - dx * half, cz - dz * half], [cx + dx * half, cz + dz * half]];
    const proj = (x, z) => Math.max(0.03, Math.min(0.97, ((x - path[0][0]) * dx + (z - path[0][1]) * dz) / (2 * half)));
    const A = [];
    const mk = (i, me) => { const p = me ? POI[this.dp.poi] : POIS[Math.floor(R() * POIS.length)], a = R() * Math.PI * 2, rr = me ? 0 : R() * p.r, dest = [p.x + Math.cos(a) * rr, p.z + Math.sin(a) * rr];
      return { i, me, name: me ? t('mt.you') : NAMES[i - 1], dest, jumpF: Math.max(0.02, Math.min(0.98, proj(dest[0], dest[1]) + (me ? 0 : (R() - 0.5) * 0.08))), deploy: me ? 250 : 220 + R() * 380, mode: 'track', phase: 'plane', s: null, x: 0, z: 0, y: 0, hp: 100, armor: 0, wpn: 'pistol', loot: me ? 6 : 10 + R() * 14, kills: 0, alive: true, acc: 0, wp: null, wpT: 0, target: null, heading: ang + Math.PI / 2, mesh: me ? this.me : this.bots[i - 1], spd: 0, hurtT: 0, skill: me ? 1.7 : 0.85 + R() * 0.3, rnd: R() }; };
    for (let i = 0; i < 24; i++) A.push(mk(i, i === 0));
    this.mt = { t: 0, R, cs, path, dir: [dx, dz], half, A, over: false, place: null, feed: [], tick: 0, specT: 0 };
    this.bots.forEach((b) => { b.visible = false; b.userData.mark.material.opacity = 0; }); this.me.visible = false;
    this.zone.set(cs[0].c, cs[0].r); this.zone.setNext(cs[1].c, cs[1].r);
    this.view.yaw = ang; sfx.confirm(); this.caption('cap.plane'); this.app.feed.push('mt.started', 'ok', { s: this.ms.seed }); this.render();
  }
  planePos(T) { const f = Math.min(1, (T.t * PLANE.v) / (2 * T.half)); return [T.path[0][0] + T.dir[0] * f * 2 * T.half, T.path[0][1] + T.dir[1] * f * 2 * T.half, f]; }
  exit(a) { const T = this.mt, [px, pz] = this.planePos(T); a.phase = 'free'; a.s = newJumper(px, pz, PLANE.alt, T.dir[0] * PLANE.v, T.dir[1] * PLANE.v); if (a.me) { this.caption('cap.free'); sfx.select(); } }
  matchTick(dt) {
    const T = this.mt; if (!T || T.over && T.specT > 60) return;
    T.t += dt; const [, , pf] = this.planePos(T), me = T.A[0], auto = this.ms.auto, Z = zoneAt(Math.max(0, T.t - ZONE_T0), T.cs);
    if (T.t > ZONE_T0) { this.zone.set(Z.c, Z.r); this.zone.setNext(Z.next.c, Z.next.r); }
    for (const a of T.A) {
      if (!a.alive) continue;
      if (a.phase === 'plane') { if ((a.me && !auto) ? (pf >= 0.985 || this.keys.has('jump')) : pf >= a.jumpF) { this.keys.delete('jump'); this.exit(a); } continue; }
      if (a.phase === 'free' || a.phase === 'canopy') {
        const ctl = a.me && !auto ? { mode: this.keys.has('w') ? 'track' : this.keys.has('s') ? 'belly' : 'track', deployAGL: this.keys.has('deploy') || a.s.phase === 'canopy' ? 1e9 : 150, tx: null, heading: Math.PI - a.heading } : { mode: a.mode, deployAGL: a.deploy, tx: a.dest[0], tz: a.dest[1] };
        if (a.me && !auto) { if (this.keys.has('a')) a.heading -= dt * 1.2; if (this.keys.has('d')) a.heading += dt * 1.2; }
        dropStep(a.s, ctl, dt, heightAt); a.phase = a.s.phase === 'ground' ? 'ground' : a.s.phase; a.x = a.s.x; a.z = a.s.z; a.y = a.s.h;
        if (!(a.me && !auto) && Math.hypot(a.s.vx, a.s.vz) > 3) a.heading = Math.atan2(a.s.vx, a.s.vz);
        if (a.phase === 'ground') { a.y = heightAt(a.x, a.z); if (a.me) { this.caption('cap.land'); this.keys.delete('deploy'); } }
        continue;
      }
      // On the ground.
      if (a.loot > 0) { a.loot -= dt; if (a.loot <= 0) { const k = a.rnd; a.wpn = k < 0.45 ? 'ar' : k < 0.75 ? 'smg' : 'dmr'; a.armor = 50 + Math.floor(a.rnd * 3) * 50; if (a.me) this.app.feed.push('mt.looted', 'ok', { w: t('w.' + a.wpn), a: a.armor }); } }
      let gx = null, gz = null, spd = 4.5;
      if (a.me && !auto) {
        const f = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0), r = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0), yaw = this.view.yaw;
        if (f || r) { const L = Math.hypot(f, r); gx = a.x + ((Math.sin(yaw) * f + Math.cos(yaw) * -r) / L) * 10; gz = a.z + ((Math.cos(yaw) * f - Math.sin(yaw) * -r) / L) * 10; spd = this.keys.has('shift') ? 7 : 4.5; }
      } else {
        const dN = Math.hypot(a.x - Z.next.c[0], a.z - Z.next.c[1]), inNext = dN < Z.next.r * (a.me ? 0.6 : 0.8), dZ = Math.hypot(a.x - Z.c[0], a.z - Z.c[1]);
        const tNeed = Math.max(0, dN - Z.next.r * 0.6) / 6.5, tLeft = Z.stage === 'wait' ? Z.left + PHASES[Math.min(Z.i, PHASES.length - 1)].shrink * 0.6 : Z.left;   // seconds needed to get inside vs seconds before the edge arrives
        const urgent = T.t > ZONE_T0 && (Z.stage === 'end' ? dN > 5 : !inNext && (tNeed > tLeft - (a.me ? 35 : 15) || dZ > Z.r * 0.85));
        const weaker = a.me && a.target && a.hp + a.armor < (a.target.hp + a.target.armor) * 0.8;
        if (weaker && !urgent) { const dx = a.x - a.target.x, dz = a.z - a.target.z, L = Math.hypot(dx, dz) || 1, cx = Z.next.c[0] - a.x, cz = Z.next.c[1] - a.z, C = Math.hypot(cx, cz) || 1; gx = a.x + (dx / L) * 12 + (cx / C) * 12; gz = a.z + (dz / L) * 12 + (cz / C) * 12; spd = 7; }
        else if (a.target && a.hp > 40 && !urgent) { const d = Math.hypot(a.target.x - a.x, a.target.z - a.z), want = WEAPONS[a.wpn].fall * 0.7; if (d > want) { gx = a.target.x; gz = a.target.z; spd = 4.5; } }
        else if (urgent || dZ > Z.r) { const k = Z.next.r * 0.45 / Math.max(1, dN); gx = Z.next.c[0] + (a.x - Z.next.c[0]) * k; gz = Z.next.c[1] + (a.z - Z.next.c[1]) * k; spd = 7; }
        else if (a.loot <= 0) { a.wpT -= dt; if (!a.wp || a.wpT <= 0) { const rr = Math.min(Z.r, Z.next.r * 1.2) * 0.6 * Math.sqrt(T.R()), aa = T.R() * Math.PI * 2; a.wp = [Z.next.c[0] + Math.cos(aa) * rr, Z.next.c[1] + Math.sin(aa) * rr]; if (!isLand(a.wp[0], a.wp[1])) a.wp = [Z.next.c[0], Z.next.c[1]]; a.wpT = 18 + T.R() * 15; } gx = a.wp[0]; gz = a.wp[1]; spd = 3.5; }
      }
      if (a.firing && !(a.me && auto && spd >= 7)) spd = Math.min(spd, a.me && auto && gx != null ? 0 : 2.5);
      if (a.firing && spd === 0) gx = null;
      if (gx != null) { const dx = gx - a.x, dz = gz - a.z, L = Math.hypot(dx, dz); if (L > 2) { const st = Math.min(L, spd * dt); a.x += (dx / L) * st; a.z += (dz / L) * st; a.heading = Math.atan2(dx, dz); a.spd = spd; if (!isLand(a.x, a.z)) { a.x -= (dx / L) * st; a.z -= (dz / L) * st; } } else a.spd = 0; } else a.spd = 0;
      a.x = Math.max(BOUNDS.x0 + 20, Math.min(BOUNDS.x1 - 20, a.x)); a.z = Math.max(BOUNDS.z0 + 20, Math.min(BOUNDS.z1 - 20, a.z)); a.y = heightAt(a.x, a.z);
      // The gas.
      if (T.t > ZONE_T0 && Math.hypot(a.x - Z.c[0], a.z - Z.c[1]) > Z.r) { a.hp -= Z.dps * dt; a.hurtT = 0.3; if (a.hp <= 0) this.kill(a, null); }
    }
    // Combat, every 0.1 s.
    T.tick += dt;
    while (T.tick >= 0.1) {
      T.tick -= 0.1;
      const ground = T.A.filter((a) => a.alive && a.phase === 'ground');
      for (const a of ground) {
        let best = null, bd = Infinity; const W = WEAPONS[a.wpn], range = W.fall * 1.5;
        for (const b of ground) { if (b === a) continue; const d = Math.hypot(b.x - a.x, b.z - a.z); if (d < range && d < bd) { if (a.me && !auto) { const ang = Math.abs(((Math.atan2(b.x - a.x, b.z - a.z) - this.view.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (ang > 0.2) continue; } bd = d; best = b; } }
        a.target = best; a.firing = !!best && (!a.me || auto || this.keys.has('fire'));
        if (!a.firing) continue;
        a.heading = Math.atan2(best.x - a.x, best.z - a.z);
        a.acc += (W.rpm / 60) * 0.1 * 0.7;
        let traced = false;
        while (a.acc >= 1 && best.alive) {
          a.acc -= 1; const hit = T.R() < pHit(a.wpn, bd, best.spd > 0.5, a.skill) * (a.spd > 0.5 ? 0.75 : 1);   // shooting on the move costs accuracy
          if (!traced) { traced = true; this.addTracer(a, best, hit); }
          if (hit) { let dmg = W.dmg; if (best.armor > 0) { const ab = Math.min(best.armor, dmg); best.armor -= ab; dmg -= ab; } best.hp -= dmg; best.hurtT = 0.25; if (best.hp <= 0) this.kill(best, a); }
        }
      }
    }
    const alive = T.A.filter((a) => a.alive).length;
    if (!T.over && (!me.alive || alive === 1)) { T.over = true; T.place = me.alive ? 1 : T.deathPlace; this.caption(T.place === 1 ? 'cap.win' : 'cap.dead', { n: T.place }); this.app.feed.push(T.place === 1 ? 'mt.won' : 'mt.placed', T.place <= 3 ? 'ok' : 'warn', { n: T.place }); if (T.place <= 3) this.done('match'); this.render(); }
    if (T.over) T.specT += dt;
  }
  kill(a, by) { const T = this.mt; if (!a.alive) return; a.alive = false; a.hp = 0; if (by) by.kills++; const left = T.A.filter((b) => b.alive).length; if (a.me) { T.deathPlace = left + 1; const Zd = zoneAt(Math.max(0, T.t - ZONE_T0), T.cs); T.deathBy = by ? by.wpn + '@' + f0(Math.hypot(by.x - a.x, by.z - a.z)) : `gas ph${Zd.i} ${Zd.stage} out${f0(Math.hypot(a.x - Zd.c[0], a.z - Zd.c[1]) - Zd.r)} r${f0(Zd.r)} land${isLand(a.x, a.z)} fire${a.firing} tgt${!!a.target}`; } if (a.me || by?.me) this.app.feed.push(a.me ? (by ? 'mt.killedBy' : 'mt.gasYou') : 'mt.youKilled', a.me ? 'warn' : 'ok', { n: by?.name ?? '', v: a.name, left }); }
  addTracer(a, b, hit) { this.tr[this.trI] = { a: V(a.x, a.y + 1.4, a.z), b: V(b.x + (hit ? 0 : (Math.random() - 0.5) * 3), b.y + 1.2 + (hit ? 0 : Math.random() * 2), b.z), t: 0.12 }; this.trI = (this.trI + 1) % 256; }
  drawTracers(dt) {
    const p = this.tracers.geometry.attributes.position, c = this.tracers.geometry.attributes.color;
    for (let i = 0; i < 256; i++) { const q = this.tr[i]; if (!q || q.t <= 0) { p.setXYZ(i * 2, 0, -1e4, 0); p.setXYZ(i * 2 + 1, 0, -1e4, 0); continue; } q.t -= dt; const k = Math.max(0, q.t / 0.12); p.setXYZ(i * 2, q.a.x, q.a.y, q.a.z); p.setXYZ(i * 2 + 1, q.b.x, q.b.y, q.b.z); c.setXYZ(i * 2, k, k * 0.8, k * 0.4); c.setXYZ(i * 2 + 1, k * 0.6, k * 0.3, 0); }
    p.needsUpdate = c.needsUpdate = true;
  }
  mtLive(full) {
    const T = this.mt, st = $('#m-status');
    if (st) { if (!T) st.textContent = t('mt.ready'); else { const Z = zoneAt(Math.max(0, T.t - ZONE_T0), T.cs), me = T.A[0]; st.textContent = T.over ? (T.place === 1 ? t('mt.victory') : t('mt.out', { n: T.place })) : me.phase === 'plane' ? t('mt.inPlane') : T.t < ZONE_T0 ? t('mt.zoneSoon', { s: f0(ZONE_T0 - T.t) }) : t('mt.zone', { i: Math.min(6, Z.i + 1), st: t('zs.' + Z.stage), s: f0(Z.left) }); } }
    if (!T) { const b = $('#mt-big'); if (b) b.innerHTML = ''; } else {
      const me = T.A[0], alive = T.A.filter((a) => a.alive).length;
      const big = $('#mt-big'); if (big) big.innerHTML = `<div><b class="mono">${alive}</b><small>${t('mt.alive')}</small></div><div><b class="mono">${me.kills}</b><small>${t('mt.kills')}</small></div><div><b class="mono">${t('w.' + me.wpn)}</b><small>${t('mt.weapon')}</small></div>`;
      const bars = $('#mt-bars'); if (bars) bars.innerHTML = `<div class="bar hp"><i style="width:${Math.max(0, me.hp)}%"></i><span>HP ${f0(Math.max(0, me.hp))}</span></div><div class="bar ar"><i style="width:${(me.armor / 150) * 100}%"></i><span>${t('mt.armor')} ${me.armor}</span></div>`;
      const cv = $('#cv-mm'); if (cv) this.drawMap(cv, (g, P, s) => {
        const Z = zoneAt(Math.max(0, T.t - ZONE_T0), T.cs), circ = (c, r, st, dash) => { const [x, y] = P(c[0], c[1]); g.beginPath(); g.arc(x, y, r * s, 0, Math.PI * 2); g.setLineDash(dash || []); g.strokeStyle = st; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); };
        const [a1, b1] = P(...T.path[0]), [a2, b2] = P(...T.path[1]); g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke(); g.setLineDash([]);
        if (T.t > ZONE_T0) { circ(Z.c, Z.r, '#ff8a2a'); circ(Z.next.c, Z.next.r, '#ffffff', [3, 3]); } else circ(T.cs[0].c, T.cs[0].r, 'rgba(255,138,42,.6)');
        for (const a of T.A) { if (a.me || !a.alive || a.phase === 'plane') continue; const d = Math.hypot(a.x - me.x, a.z - me.z); if (me.phase !== 'ground' || d < 350) { const [x, y] = P(a.x, a.z); g.fillStyle = '#ff4a4a'; g.fillRect(x - 1.5, y - 1.5, 3, 3); } }
        const [mx, my] = me.phase === 'plane' ? P(...this.planePos(T)) : P(me.x, me.z); g.fillStyle = '#fff'; g.beginPath(); g.arc(mx, my, 3.5, 0, Math.PI * 2); g.fill();
        const [dx, dy] = P(...me.dest); g.strokeStyle = '#ffd166'; g.beginPath(); g.arc(dx, dy, 4, 0, Math.PI * 2); g.stroke();
      });
    }
    if (!full) return;
    const m = $('#mt-math');
    if (m) m.innerHTML = `<div>${t('mt.ttkL')} n = ⌈(HP + ${t('mt.armorL')})/dmg⌉ · TTK = (n − 1)·60/rpm + d/v</div>${['smg', 'ar', 'dmr'].map((w) => `<div>${t('w.' + w)}: ${WEAPONS[w].dmg} dmg · ${WEAPONS[w].rpm} rpm → n = ${ttk(w, 0).n} · TTK@25 m <b>${f2(ttk(w, 25).t)} s</b> · p(hit@100 m) ${f0(pHit(w, 100) * 100)}%</div>`).join('')}<div>${t('mt.zoneL')}</div>`;
    const g = $('#mt-goal'); if (g) g.innerHTML = `${badge(this.goal.match)} ${t('goal.match')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-0.3, Math.min(1.3, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.3, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); }
  key(k) {
    if (this.tab === 'match' && this.mt) { if (k === ' ') { const me = this.mt.A[0]; this.keys.add(me.phase === 'plane' ? 'jump' : me.phase === 'free' ? 'deploy' : 'fire'); } if (k === 'f') this.keys.add('fire'); if (['w', 'a', 's', 'd', 'shift'].includes(k)) this.keys.add(k); }
    if (this.tab === 'range' && k === ' ') this.fire();
    if (this.tab === 'drop' && k === 'j') this.jump();
  }
  keyUp(k) { if (k === ' ' || k === 'f') this.keys.delete('fire'); this.keys.delete(k); }

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, W = this.W;
    W.sea.material.uniforms.uTime.value = time; this.zone.wall.material.uniforms.uTime.value = time;
    W.plume.scale.set(3 + Math.sin(time * 2) * 0.3, 6 + Math.sin(time * 1.3), 3); W.plume.material.opacity = 0.25 + 0.1 * Math.sin(time * 1.7);
    let focus = V(0, 30, 0), cp = null, look = null;
    const showBots = tab === 'match' && this.mt;
    this.beacon.visible = tab === 'drop' || tab === 'match'; this.pathLine.visible = this.ringLine.visible = this.flightLine.visible = tab === 'drop';
    this.mcPts.visible = tab === 'zone' && !!this.zn.mc; this.plate.visible = tab === 'range'; this.youMark.visible = tab === 'zone';
    const p = POI[this.dp.poi]; this.beacon.position.set(p.x, heightAt(p.x, p.z), p.z);
    if (tab !== 'match') { this.bots.forEach((b) => (b.visible = false)); }
    if (tab === 'drop') {
      const D = this.dp, [A, B] = DROP_PATH, L = Math.hypot(B[0] - A[0], B[1] - A[1]), f = ((time * PLANE.v) % L) / L, [dx, dz] = this.pathDir();
      this.plane.visible = true; this.plane.position.set(A[0] + (B[0] - A[0]) * f, PLANE.alt, A[1] + (B[1] - A[1]) * f); this.plane.rotation.set(0, Math.atan2(-dx, -dz), 0);
      this.dropTick(dt); const [jx, jz] = this.pathPoint(D.jump);
      if (D.anim) { focus = this.me.position.clone(); const hd = this.me.rotation.y; const ph = this.me.userData.canopy.visible; cp = focus.clone().add(V(-Math.sin(hd + v.yaw * 0.3) * (ph ? 15 : 11), ph ? 4 : 5, -Math.cos(hd + v.yaw * 0.3) * (ph ? 15 : 11))); look = focus.clone().add(V(0, ph ? 3 : 0, 0)); }
      else { this.me.visible = !!D.sim; if (D.sim) { this.me.position.set(D.sim.x, heightAt(D.sim.x, D.sim.z), D.sim.z); poseOperator(this.me, 'stand', time, 0); }
        const mid = V((jx + p.x) / 2, 300, (jz + p.z) / 2); focus = mid; if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.05; const R = 3600 * v.r; cp = mid.clone().add(V(Math.sin(v.yaw) * R * Math.cos(v.pitch), 600 + R * Math.sin(v.pitch), Math.cos(v.yaw) * R * Math.cos(v.pitch))); look = mid; }
      this.youMark.position.set(jx, PLANE.alt, jz);
    } else if (tab === 'zone') {
      this.plane.visible = false; this.me.visible = false; const Z = this.zn, A = Z.cs[Z.phase], B = Z.cs[Z.phase + 1];
      this.zone.set(A.c, A.r, 1400); this.zone.setNext(B.c, B.r); this.youMark.position.set(Z.you[0], Math.max(2, heightAt(Z.you[0], Z.you[1])) + 60, Z.you[1]); this.youMark.scale.setScalar(160);
      focus = V(A.c[0], 100, A.c[1]); if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.04; const R = Math.max(2500, A.r * 2.1) * v.r; cp = focus.clone().add(V(Math.sin(v.yaw) * R * 0.55, R * 0.85, Math.cos(v.yaw) * R * 0.55)); look = focus;
    } else if (tab === 'range') {
      this.plane.visible = false; this.rangeTick(dt); const y0 = heightAt(RANGE_AT[0], RANGE_AT[1]);
      this.me.visible = true; this.me.position.set(RANGE_AT[0], y0 + 0.05, RANGE_AT[1]); this.me.rotation.set(0, Math.PI, 0); poseOperator(this.me, 'fall', time); this.me.rotation.y = Math.PI;
      focus = V(RANGE_AT[0], y0, RANGE_AT[1] - 20); cp = V(RANGE_AT[0] + 1.1, y0 + 2.1, RANGE_AT[1] + 3.6); look = V(RANGE_AT[0] - 2, y0 + 1.2, RANGE_AT[1] - 60);
    } else if (tab === 'match') {
      const T = this.mt;
      if (!T) { this.plane.visible = false; this.me.visible = false; focus = V(MAP_C[0], 100, MAP_C[1]); const R = 4200; v.yaw += dt * 0.03; cp = focus.clone().add(V(Math.sin(v.yaw) * R, 2200, Math.cos(v.yaw) * R)); look = focus; this.zone.set([0, 0], 0); this.zone.setNext([0, 0], 0); }
      else {
        this.mAcc = Math.min(1, (this.mAcc || 0) + dt * this.ms.speed); while (this.mAcc >= 0.05) { this.matchTick(0.05); this.mAcc -= 0.05; }   // fixed 50 ms steps: the same seed always plays out the same way
        const [px, pz, pf] = this.planePos(T); this.plane.visible = pf < 1; this.plane.position.set(px, PLANE.alt, pz); this.plane.rotation.set(0, Math.atan2(-T.dir[0], -T.dir[1]), 0);
        const me = T.A[0];
        for (const a of T.A) {
          const o = a.mesh; o.visible = a.phase !== 'plane'; if (!o.visible) continue;
          o.position.set(a.x, a.y, a.z); o.rotation.set(0, a.heading, 0);
          const mode = !a.alive ? 'dead' : a.phase === 'free' ? (a.mode === 'belly' ? 'fall' : 'track') : a.phase === 'canopy' ? 'canopy' : a.firing ? 'aim' : a.spd > 0.5 ? 'run' : 'stand';
          poseOperator(o, mode, time + a.i, a.spd); if (mode === 'fall' || mode === 'track') o.rotation.y = a.heading;
          if (!a.me) { const d = Math.hypot(a.x - me.x, a.z - me.z, a.y - me.y), mk = o.userData.mark; mk.material.opacity = a.alive && d < 400 && me.alive ? 0.85 : 0; mk.scale.setScalar(Math.max(2, d * 0.012)); mk.position.y = 2.6 + d * 0.004; }
        }
        // Camera.
        if (me.phase === 'plane') { focus = this.plane.position.clone(); const hd = Math.atan2(T.dir[0], T.dir[1]) + v.yaw * 0.5; cp = focus.clone().add(V(-Math.sin(hd) * 70, 22, -Math.cos(hd) * 70)); look = focus; }
        else if (!me.alive || T.over) { const Z = zoneAt(Math.max(0, T.t - ZONE_T0), T.cs); focus = V(Z.c[0], heightAt(Z.c[0], Z.c[1]), Z.c[1]); v.yaw += dt * 0.08; const R = Math.max(300, Z.r * 1.6 + 200); cp = focus.clone().add(V(Math.sin(v.yaw) * R, R * 0.6, Math.cos(v.yaw) * R)); look = focus; }
        else if (me.phase !== 'ground') { focus = V(me.x, me.y, me.z); const hd = me.heading; cp = focus.clone().add(V(-Math.sin(hd) * (me.phase === 'canopy' ? 16 : 13), me.phase === 'canopy' ? 4 : 7, -Math.cos(hd) * (me.phase === 'canopy' ? 16 : 13))); look = focus.clone().add(V(0, me.phase === 'canopy' ? 3 : 0, 0)); }
        else { if (this.ms.auto && !v.drag && performance.now() - v.last > 2500) v.yaw += (((me.heading - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 2); const yw = v.yaw; focus = V(me.x, me.y, me.z); cp = focus.clone().add(V(-Math.sin(yw) * 6.5 + Math.cos(yw) * 0.9, 2.6 + v.pitch * 2, -Math.cos(yw) * 6.5 - Math.sin(yw) * 0.9)); look = focus.clone().add(V(Math.sin(yw) * 20, 1.4, Math.cos(yw) * 20)); }
        this.drawTracers(dt * this.ms.speed);
      }
    }
    if (tab !== 'match') this.drawTracers(dt);
    if (tab !== 'match' && tab !== 'zone') { this.zone.set([0, 0], 0); this.zone.setNext([0, 0], 0); }
    if (tab === 'match' || tab === 'drop') { /* plane visibility handled above */ } else this.plane.visible = false;
    if (cp) { const minY = Math.max(heightAt(cp.x, cp.z), 0) + 1.2; if (cp.y < minY) cp.y = minY; this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook); }
    // Sun shadow follows what we look at.
    W.sun.position.copy(focus).addScaledVector(SUN_DIR, 1500); W.sun.target.position.copy(focus); W.sun.target.updateMatrixWorld();
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    $('#xhair')?.classList.toggle('on', tab === 'match' && !!this.mt && this.mt.A[0].phase === 'ground' && this.mt.A[0].alive && !this.ms.auto);
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 5 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'drop') this.dpLive(full);
    if (this.tab === 'zone') this.znLive(full);
    if (this.tab === 'range') this.rgLive(full);
    if (this.tab === 'match') this.mtLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const T = this.mt, rows = ['drop', 'zone', 'range', 'match'].map((k) => [t('rep.' + k), this.goal[k]]);
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    if (T?.place) { const li = document.createElement('li'); li.className = 'ok'; li.textContent = t('rep.result', { n: T.place, k: T.A[0].kills }); list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-title').textContent = sc === 100 ? t('rep.ready') : t('rep.notReady');
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
void G; void R0; void SCALE; void vTerm;
