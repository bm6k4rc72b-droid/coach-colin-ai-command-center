import * as THREE from 'three';
import { necklaces, bracelets, raw, fmtBig, smallestN, divisors, phi, SPELLS, cast, thunderVolts, MP_KJ, WORLDS, hohmann, route, SHIP, KEY, COMBO, knock } from './sim/key.js';
import { buildWorld, paintWindow, PALETTES, PLAT_R, SYSTEM_AT, AU } from './view/world.js';
import { buildHero, poseHero, buildHollow } from './view/hero.js';
import { glowSprite } from './view/holo.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// KEYLIGHT · the app. Dive: the maths of a stained-glass window. Magic: spells with real energy bills.
// Routes: fly the Prism ship between worlds on Hohmann transfers. Battle: combo timing, knockback
// and ring-outs against the Hollows.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MP_MAX = 100, WAVES = [{ n: 3, big: 0 }, { n: 5, big: 0 }, { n: 6, big: 1 }];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }

export class Key {
  constructor(app) {
    this.app = app; this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 20000); this.scene.add(this.cam);
    this.hero = buildHero(); this.scene.add(this.hero);
    this.hollows = [...Array(7)].map(() => { const h = buildHollow(); h.visible = false; this.scene.add(h); return h; });
    this.missile = glowSprite('#ffd27a', 0.9, 0); this.scene.add(this.missile);
    this.dv = { n: 8, k: 3, mirror: true, palette: 'dawn', seed: 3, sample: null };
    this.mg = { mp: { fire: 30, ice: 30, thunder: 10 }, spent: 0, done: { fire: false, ice: false, thunder: false }, anim: null };
    this.rt = { path: ['haven'], fly: null };
    this.bt = null; this.btSeed = 5; this.auto = true;
    this.goal = { dive: false, magic: false, route: false, battle: false };
    this.view = { yaw: 0.5, pitch: 0.5, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'dive'; this.entered = false; this.uiT = 0; this.time = 0;
    this.repaint(); this.drawRoute();
    app.stage.use(this.scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = ['dive', 'magic', 'route', 'battle'].map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  setTab(tab) { this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab; this.snap = true; this.render(); this.caption('cap.' + tab); }
  render() { const P = { dive: ['dvP', 'dvS', 'dvB'], magic: ['mgP', 'mgS', 'mgB'], route: ['rtP', 'rtS', 'rtB'], battle: ['btP', 'btS', 'btB'] }[this.tab]; $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]](); this.refresh(true); }

  // ═══ DIVE ═══
  repaint() { const D = this.dv; paintWindow(this.W.cv, D); this.W.tex.needsUpdate = true; }
  dvP() {
    const D = this.dv;
    return `<header class="lv-head mono">${t('dv.title')}</header><p class="intro">${t('dv.intro')}</p>
      ${this.slider('d-n', t('dv.n'), D.n, 3, 24, 1, D.n)}${this.slider('d-k', t('dv.k'), D.k, 2, 6, 1, D.k)}
      <div class="chips"><button class="btn seg ${D.mirror ? 'active' : ''}" id="d-m">⇋ ${t('dv.mirror')}</button><button class="btn seg" id="d-s">✦ ${t('dv.reroll')}</button></div>
      <header class="lv-sub mono">${t('dv.palette')}</header>${this.chips('pal', Object.keys(PALETTES), D.palette, (k) => t('pal.' + k))}
      <p class="small">${t('dv.note')}</p>`;
  }
  dvS() { return `<header class="lv-head mono">${t('dv.read')}</header><div class="bigstats" id="dv-big"></div><canvas class="cv beads" id="cv-beads"></canvas><canvas class="cv chart" id="cv-count"></canvas><div class="math mono" id="dv-math"></div><div class="goal" id="dv-goal"></div>`; }
  dvB() {
    const D = this.dv, re = () => { D.sample = null; this.repaint(); };
    this.bindSliders(D, [['d-n', 'n', (v) => v], ['d-k', 'k', (v) => v]], re);
    $('#d-m').onclick = () => { D.mirror = !D.mirror; sfx.select(); re(); this.render(); };
    $('#d-s').onclick = () => { D.seed++; D.sample = null; sfx.select(); re(); this.render(); };
    document.querySelectorAll('[data-pal]').forEach((b) => (b.onclick = () => { D.palette = b.dataset.pal; sfx.select(); re(); this.render(); }));
  }
  dvLive(full) {
    if (!full) return;
    const D = this.dv, N = necklaces(D.n, D.k), B = bracelets(D.n, D.k), Rw = raw(D.n, D.k), G = D.mirror ? 2 * D.n : D.n, count = D.mirror ? B : N, target = smallestN(3, 10000);
    const big = $('#dv-big'); if (big) big.innerHTML = `<div><b class="mono">${G}</b><small>${t('dv.order')} ${D.mirror ? 'D' : 'C'}<sub>${D.n}</sub></small></div><div><b class="mono">${fmtBig(Rw)}</b><small>${t('dv.raw')}</small></div><div><b class="mono c-green">${fmtBig(count)}</b><small>${t('dv.distinct')}</small></div>`;
    // A random colouring of the n wedges, and the size of its orbit (how many different-looking versions).
    if (!D.sample || D.sample.length !== D.n) { let a = D.seed * 7 + D.n * 13 + D.k; D.sample = [...Array(D.n)].map(() => { a = (a * 9301 + 49297) % 233280; return Math.floor((a / 233280) * D.k); }); }
    const s = D.sample, rots = new Set(); for (let r = 0; r < D.n; r++) { const x = s.map((_, i) => s[(i + r) % D.n]).join(''); rots.add(x); if (D.mirror) rots.add([...x].reverse().join('')); }
    const cv = $('#cv-beads'); if (cv) { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (r.width > 10) { if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; } const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height); const cx = r.height / 2 + 6, cy = r.height / 2, R = r.height * 0.36, cols = PALETTES[D.palette];
      for (let i = 0; i < D.n; i++) { const a0 = -Math.PI / 2 + (i / D.n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / D.n; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath(); g.fillStyle = cols[s[i]]; g.fill(); g.strokeStyle = '#0a0812'; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = '#e8eefc'; g.font = '11px "JetBrains Mono", monospace'; g.fillText(t('dv.sample'), cx + R + 18, cy - 14); g.fillStyle = '#ffd27a'; g.font = '700 15px "JetBrains Mono", monospace'; g.fillText(t('dv.orbit', { o: rots.size, g: G }), cx + R + 18, cy + 8); g.fillStyle = 'rgba(232,238,252,.7)'; g.font = '10px "JetBrains Mono", monospace'; g.fillText(t('dv.stab', { s: G / rots.size, o: rots.size, g: G }), cx + R + 18, cy + 26); } }
    const pts = [], pts2 = []; for (let n = 3; n <= 24; n++) { pts.push([n, Math.log10(Number(bracelets(n, D.k)))]); pts2.push([n, Math.log10(Number(raw(n, D.k)))]); }
    lineChart($('#cv-count'), { x0: 3, x1: 24, y0: 0, y1: Math.ceil(Math.log10(Number(raw(24, D.k)))), xFmt: (x) => 'n=' + f0(x), yFmt: (y) => '10^' + f0(y), title: t('dv.chart', { k: D.k }), series: [{ pts: pts2, color: 'rgba(232,238,252,.45)', dash: [4, 3], label: 'kⁿ' }, { pts, color: '#ffd27a', label: t('dv.brace') }], marks: [{ y: 4, color: '#7ff0b0', label: '10,000' }, { x: D.n, color: '#fff' }] });
    const divs = divisors(D.n), m = $('#dv-math');
    if (m) m.innerHTML = `<div>${t('dv.burn')} N = (1/n)·Σ<sub>d|n</sub> φ(d)·k<sup>n/d</sup> = (1/${D.n})·(${divs.map((dd) => `${phi(dd)}·${D.k}<sup>${D.n / dd}</sup>`).join(' + ')}) = <b>${fmtBig(N)}</b></div>
      <div>${t('dv.flip')} B = <b>${fmtBig(B)}</b> · ${t('dv.check')}</div><div>${t('dv.q', { t: '10,000' })}</div>`;
    if (D.k === 3 && D.mirror && D.n === target) this.done('dive');
    const gg = $('#dv-goal'); if (gg) gg.innerHTML = `${badge(this.goal.dive)} ${t('goal.dive')}`;
  }

  // ═══ MAGIC ═══
  mgP() {
    const M = this.mg;
    return `<header class="lv-head mono">${t('mg.title')}</header><p class="intro">${t('mg.intro', { m: MP_MAX })}</p>
      ${['fire', 'ice', 'thunder'].map((k) => `<div class="spell ${M.done[k] ? 'ok' : ''}"><header><b>${t('sp.' + k)}</b><em>${M.done[k] ? '✓' : ''}</em></header>${this.slider('m-' + k, t('mg.mp'), M.mp[k], 0, 60, 1, M.mp[k] + ' MP')}<button class="btn seg wide" data-cast="${k}">✦ ${t('mg.cast')}</button></div>`).join('')}
      <button class="btn seg" id="m-reset">↺ ${t('mg.reset')}</button>`;
  }
  mgS() { return `<header class="lv-head mono">${t('mg.read')}</header><div class="bigstats" id="mg-big"></div><div class="mpbar"><i id="mg-bar"></i></div><div class="math mono" id="mg-math"></div><div class="goal" id="mg-goal"></div>`; }
  mgB() {
    const M = this.mg; this.bindSliders(M.mp, ['fire', 'ice', 'thunder'].map((k) => ['m-' + k, k, (v) => v + ' MP']));
    document.querySelectorAll('[data-cast]').forEach((b) => (b.onclick = () => this.castSpell(b.dataset.cast)));
    $('#m-reset').onclick = () => { M.spent = 0; M.done = { fire: false, ice: false, thunder: false }; this.resetTargets(); sfx.select(); this.render(); };
  }
  resetTargets() { this.W.ice.scale.setScalar(0.01); this.W.orb.visible = true; this.W.fire.children.forEach((f) => (f.material.opacity = 0)); this.burn = 0; }
  castSpell(k) {
    const M = this.mg; if (M.anim || M.spent + M.mp[k] > MP_MAX) { if (M.spent + M.mp[k] > MP_MAX) this.app.feed.push('mg.noMp', 'warn'); return; }
    const r = cast(k, M.mp[k]); M.spent += M.mp[k]; M.anim = { k, t: 0, r }; sfx.select();
  }
  magicTick(dt) {
    const M = this.mg, A = M.anim, W = this.W, hp = this.hero.position;
    this.W.fire.children.forEach((f, i) => { if (this.burn > 0) { f.material.opacity = Math.min(1, this.burn) * (0.6 + 0.4 * Math.sin(this.time * 9 + i)); f.position.set(Math.sin(i * 2.1 + this.time * 3) * 0.25, Math.abs(Math.sin(this.time * 5 + i)) * 0.6, Math.cos(i * 1.7) * 0.25); f.scale.setScalar(0.8 + Math.sin(this.time * 7 + i) * 0.3); } });
    W.bolt.material.opacity = Math.max(0, W.bolt.material.opacity - dt * 3); W.flash.material.opacity = Math.max(0, W.flash.material.opacity - dt * 3);
    if (!A) { this.missile.material.opacity = 0; return; }
    A.t += dt; const tgt = { fire: W.totem, ice: W.orb.parent, thunder: W.rod }[A.k].position, end = V(tgt.x, A.k === 'fire' ? 1.6 : 1.6, tgt.z);
    if (A.k !== 'thunder') { const f = Math.min(1, A.t / 0.7), start = V(hp.x, 1.3, hp.z); this.missile.position.lerpVectors(start, end, f); this.missile.position.y += Math.sin(f * Math.PI) * 1.2; this.missile.material.color.set(A.k === 'fire' ? '#ff9a3a' : '#9fe8ff'); this.missile.material.opacity = f < 1 ? 1 : 0; this.missile.scale.setScalar(0.9 + 0.2 * Math.sin(A.t * 30)); }
    if (A.t > 0.7 && !A.hit) {
      A.hit = true; const ok = A.r.ok, k = A.k;
      if (k === 'fire') this.burn = ok ? 1 : 0.25;
      if (k === 'ice') { W.ice.scale.setScalar(ok ? 1 : 0.55); W.orb.visible = !ok; }
      if (k === 'thunder') { const reach = ok ? 1 : A.r.ratio, P = W.bolt.geometry.attributes.position, top = V(tgt.x + 1, 14, tgt.z - 1), bot = V(tgt.x, 3.5 + (1 - reach) * 9, tgt.z); for (let i = 0; i < 24; i++) { const f = i / 23; P.setXYZ(i, top.x + (bot.x - top.x) * f + (i && i < 23 ? (Math.random() - 0.5) * 0.8 : 0), top.y + (bot.y - top.y) * f, top.z + (bot.z - top.z) * f + (i && i < 23 ? (Math.random() - 0.5) * 0.8 : 0)); } P.needsUpdate = true; W.bolt.material.opacity = 1; W.flash.position.copy(bot); W.flash.material.opacity = ok ? 1 : 0.4; this.app.stage.flash?.('#bfe0ff'); }
      if (ok) { M.done[k] = true; sfx.confirm(); }
      this.app.feed.push(ok ? 'mg.ok' : 'mg.fizzle', ok ? 'ok' : 'warn', { s: t('sp.' + k), d: f0(A.r.delivered), n: f0(A.r.need) });
      this.render();
    }
    if (A.t > 1.3) M.anim = null;
  }
  mgLive(full) {
    if (!full) return;
    const M = this.mg, ok = Object.values(M.done).filter(Boolean).length;
    const big = $('#mg-big'); if (big) big.innerHTML = `<div><b class="mono ${M.spent <= MP_MAX ? '' : 'c-red'}">${M.spent}/${MP_MAX}</b><small>${t('mg.spent')}</small></div><div><b class="mono">${ok}/3</b><small>${t('mg.cast2')}</small></div><div><b class="mono">${f0(M.spent * MP_KJ)} kJ</b><small>${t('mg.energy')}</small></div>`;
    const bar = $('#mg-bar'); if (bar) bar.style.width = Math.min(100, M.spent) + '%';
    const r = Object.fromEntries(['fire', 'ice', 'thunder'].map((k) => [k, cast(k, M.mp[k])])), m = $('#mg-math');
    if (m) m.innerHTML = `<div>1 MP = ${MP_KJ} kJ · ${t('mg.eta')}</div>
      <div>🔥 Q = m·c·ΔT = 0.5·1.7·(300 − 20) = <b>${f0(SPELLS.fire.need())} kJ</b> · η 0.6 → ${t('mg.needs')} <b>${r.fire.mpMin} MP</b> · ${t('mg.now')} ${f0(r.fire.delivered)} kJ</div>
      <div>❄ Q = m(c<sub>w</sub>·20 + L<sub>f</sub> + c<sub>ice</sub>·10) = 0.5·(83.7 + 334 + 20.9) = <b>${f1(SPELLS.ice.need())} kJ</b> · η 0.7 → <b>${r.ice.mpMin} MP</b></div>
      <div>⚡ V = E<sub>b</sub>·d = 3 MV/m·4 m = 12 MV · E = ½CV² = ½·1 nF·(12 MV)² = <b>${f0(SPELLS.thunder.need())} kJ</b> → <b>${r.thunder.mpMin} MP</b> · ${t('mg.now')} V = ${f1(thunderVolts(M.mp.thunder) / 1e6)} MV</div>
      <div>${t('mg.latent')}</div>`;
    if (ok === 3 && M.spent <= MP_MAX) this.done('magic');
    const g = $('#mg-goal'); if (g) g.innerHTML = `${badge(this.goal.magic)} ${t('goal.magic', { m: MP_MAX })}`;
  }

  // ═══ ROUTES ═══
  rtP() {
    const R = this.rt;
    return `<header class="lv-head mono">${t('rt.title')}</header><p class="intro">${t('rt.intro')}</p>
      <div class="route mono">${R.path.map((id) => `<span style="--c:${WORLDS.find((w) => w.id === id).col}">${t('w.' + id)}</span>`).join('<i>→</i>')}</div>
      <header class="lv-sub mono">${t('rt.add')}</header>${this.chips('wd', WORLDS.filter((w) => w.id !== 'haven').map((w) => w.id), '', (k) => `<i class="dot" style="background:${WORLDS.find((w) => w.id === k).col}"></i>${t('w.' + k)} <em class="mono">r ${WORLDS.find((w) => w.id === k).r}</em>`)}
      <div class="chips"><button class="btn seg" id="r-undo">⌫ ${t('rt.undo')}</button><button class="btn seg" id="r-clear">↺ ${t('rt.clear')}</button><button class="btn primary" id="r-go">🚀 ${t('rt.launch')}</button></div>
      <p class="small">${t('rt.note')}</p>`;
  }
  rtS() { return `<header class="lv-head mono">${t('rt.read')}</header><div class="bigstats" id="rt-big"></div><canvas class="cv chart" id="cv-fuel"></canvas><div class="math mono" id="rt-math"></div><div class="goal" id="rt-goal"></div>`; }
  rtB() {
    const R = this.rt;
    document.querySelectorAll('[data-wd]').forEach((b) => (b.onclick = () => { const id = b.dataset.wd; if (R.path[R.path.length - 1] !== id) R.path.push(id); sfx.select(); this.drawRoute(); this.render(); }));
    $('#r-undo').onclick = () => { if (R.path.length > 1) R.path.pop(); this.drawRoute(); this.render(); };
    $('#r-clear').onclick = () => { R.path = ['haven']; this.drawRoute(); this.render(); };
    $('#r-go').onclick = () => this.launch();
  }
  // Legs drawn as half-ellipses: each starts where the previous one ended (angle advances by π).
  legCurve(r1, r2, a0, n = 80) { const a = (r1 + r2) / 2, e = Math.abs(r2 - r1) / (r1 + r2), pts = []; for (let i = 0; i <= n; i++) { const nu = (i / n) * Math.PI, r = r2 > r1 ? (a * (1 - e * e)) / (1 + e * Math.cos(nu)) : (a * (1 - e * e)) / (1 - e * Math.cos(nu)); pts.push([Math.cos(a0 + nu) * r * AU, Math.sin(a0 + nu) * r * AU]); } return pts; }
  drawRoute() {
    const R = this.rt, all = []; let a0 = 0;
    for (let i = 1; i < R.path.length; i++) { const r1 = WORLDS.find((w) => w.id === R.path[i - 1]).r, r2 = WORLDS.find((w) => w.id === R.path[i]).r; all.push(...this.legCurve(r1, r2, a0)); a0 += Math.PI; }
    const P = this.W.transfer.geometry.attributes.position; for (let i = 0; i < P.count; i++) { const q = all[Math.min(i, all.length - 1)] || [AU, 0]; P.setXYZ(i, q[0], 0, q[1]); } P.needsUpdate = true; this.W.transfer.geometry.setDrawRange(0, Math.max(0, all.length)); this.W.transfer.computeLineDistances(); this.routePts = all;
  }
  launch() { if (this.rt.path.length < 2) return; this.rt.fly = { t: 0 }; sfx.confirm(); this.caption('cap.launch'); }
  rtLive(full) {
    if (!full) return;
    const R = this.rt, r = route(R.path), visited = new Set(R.path);
    const big = $('#rt-big'); if (big) big.innerHTML = `<div><b class="mono">${f3(r.dv)}</b><small>${t('rt.dv')} (max ${f3(r.dvMax)})</small></div><div><b class="mono ${r.ok ? 'c-green' : 'c-red'}">${f2(r.fuelUsed)} / ${SHIP.fuel} t</b><small>${t('rt.fuel')}</small></div><div><b class="mono">${f1(r.t)}</b><small>${t('rt.time')}</small></div>`;
    const pts = [[0, SHIP.fuel]]; let m = SHIP.dry + SHIP.fuel; r.legs.forEach((L, i) => { m /= Math.exp(L.dv / SHIP.ve); pts.push([i + 1, m - SHIP.dry]); });
    lineChart($('#cv-fuel'), { x0: 0, x1: Math.max(4, r.legs.length), y0: Math.min(0, Math.floor(pts[pts.length - 1][1])), y1: SHIP.fuel, xFmt: (x) => t('rt.leg') + ' ' + f0(x), yFmt: (y) => f1(y) + ' t', title: t('rt.chart'), series: [{ pts, color: r.ok ? '#7ff0b0' : '#ff7a6a', label: t('rt.left'), fill: 'rgba(127,240,176,.08)' }], marks: [{ y: 0, color: '#ff5a6a', label: t('rt.empty') }] });
    const L = r.legs[r.legs.length - 1], mm = $('#rt-math');
    if (mm) mm.innerHTML = (L ? `<div>${t('w.' + L.from)} → ${t('w.' + L.to)}: Δv₁ = √(μ/r₁)(√(2r₂/(r₁+r₂)) − 1) = <b>${f3(L.dv1)}</b> · Δv₂ = <b>${f3(L.dv2)}</b> · t = π√(a³/μ) = ${f2(L.t)} · ${t('rt.lead')} θ = <b>${f0((L.phase * 180) / Math.PI)}°</b></div>` : `<div>${t('rt.pick')}</div>`) +
      `<div>${t('rt.rocket')} m₀/m<sub>f</sub> = e<sup>Δv/v<sub>e</sub></sup> · m₀ = ${SHIP.dry + SHIP.fuel} t, v<sub>e</sub> = ${SHIP.ve} → Δv<sub>max</sub> = v<sub>e</sub>·ln(m₀/m<sub>dry</sub>) = <b>${f3(r.dvMax)}</b></div><div>${t('rt.why')}</div>`;
    if (WORLDS.every((w) => visited.has(w.id)) && r.ok) this.done('route');
    const g = $('#rt-goal'); if (g) g.innerHTML = `${badge(this.goal.route)} ${t('goal.route')}`;
  }

  // ═══ BATTLE ═══
  btP() {
    const B = this.bt;
    return `<header class="lv-head mono">${t('bt.title')}</header><p class="intro">${t('bt.intro')}</p>
      <div class="chips"><button class="btn primary" id="b-go">▶ ${B ? t('bt.again') : t('bt.start')}</button><button class="btn seg ${this.auto ? 'active' : ''}" id="b-auto">${t('bt.auto')}</button></div>
      <p class="small">${t('bt.keys')}</p><div class="status mono" id="b-status"></div>`;
  }
  btS() { return `<header class="lv-head mono">${t('bt.read')}</header><div class="bigstats" id="bt-big"></div><div class="bars" id="bt-bars"></div><div class="combo mono" id="bt-combo"></div><div class="math mono" id="bt-math"></div><div class="goal" id="bt-goal"></div>`; }
  btB() { $('#b-go').onclick = () => this.startBattle(); $('#b-auto').onclick = () => { this.auto = !this.auto; sfx.select(); this.render(); }; }
  startBattle(seed) {
    this.btSeed = seed ?? this.btSeed + 1;
    this.bt = { t: 0, R: rng(this.btSeed), wave: -1, next: 1.2, P: { x: 0, z: 3, yaw: Math.PI, vx: 0, vz: 0, hp: 100, mp: 40, swing: null, queue: false, roll: null, inv: 0, combo: 0, perfect: 0, ringouts: 0, kills: 0, alive: true, spd: 0 }, E: [], over: false, win: false };
    this.hollows.forEach((h) => (h.visible = false)); sfx.confirm(); this.caption('cap.battle'); this.render();
  }
  spawnWave(i) {
    const B = this.bt, Wv = WAVES[i]; B.wave = i; B.E = [];
    for (let k = 0; k < Wv.n + Wv.big; k++) { const big = k >= Wv.n, a = B.R() * Math.PI * 2, r = 5 + B.R() * 5; B.E.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, vx: 0, vz: 0, hp: big ? 180 : 50, hpMax: big ? 180 : 50, m: big ? 60 : 20, big, st: 'rise', st0: B.t, alive: true, hitBy: -1, mesh: this.hollows[k], fall: 0 }); }
    B.E.forEach((e) => { e.mesh.visible = true; e.mesh.scale.setScalar(e.big ? 1.8 : 1); }); this.app.feed.push('bt.incoming', 'warn', { n: i + 1, k: B.E.length });
  }
  attack() {
    const P = this.bt?.P; if (!P || !P.alive || P.roll) return;
    if (!P.swing) { P.swing = { step: 0, t: 0, hitIds: new Set() }; return; }
    const S = P.swing, dur = 0.42, ph = S.t / dur, win = COMBO[S.step].win;
    if (win && ph >= win[0] && ph <= win[1]) { P.queue = true; P.qPerfect = true; } else if (win && ph > win[1]) P.queue = true;
  }
  dodge() { const P = this.bt?.P; if (!P || !P.alive || P.roll) return; P.swing = null; P.queue = false; const yw = this.auto ? P.dodgeYaw ?? P.yaw + Math.PI : this.view.yaw + Math.PI; P.roll = { t: 0, dx: Math.sin(yw), dz: Math.cos(yw) }; P.inv = 0.45; }
  castFire() { const B = this.bt, P = B?.P; if (!P || P.mp < 10 || !P.alive) return; P.mp -= 10; const tx = P.x + Math.sin(P.yaw) * 2.5, tz = P.z + Math.cos(P.yaw) * 2.5; for (const e of B.E) if (e.alive && e.st !== 'rise' && Math.hypot(e.x - tx, e.z - tz) < 2.5) { e.hp -= 20; e.vx += (e.x - P.x) * 1.5; e.vz += (e.z - P.z) * 1.5; } this.missile.position.set(tx, 1.2, tz); this.missile.material.color.set('#ff9a3a'); this.missile.material.opacity = 1; this.missile.scale.setScalar(3); sfx.select(); }
  battleTick(dt) {
    const B = this.bt; if (!B || B.over) return; B.t += dt; const P = B.P;
    if (B.E.every((e) => !e.alive)) { if (B.wave === WAVES.length - 1) { B.over = true; B.win = true; this.done('battle'); this.caption('cap.win'); this.app.feed.push('bt.won', 'ok'); this.render(); return; } B.next -= dt; if (B.next <= 0) { if (B.wave >= 0) { P.hp = Math.min(100, P.hp + 25); P.mp = Math.min(40, P.mp + 20); } this.spawnWave(B.wave + 1); B.next = 2; } }
    // Autopilot: keep the nearest Hollow in front; dodge a lunge you can see coming; chain combos on the beat.
    let near = null, nd = 1e9; for (const e of B.E) { if (!e.alive || e.st === 'rise') continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < nd) { nd = d; near = e; } }
    let mx = 0, mz = 0, spd = 0;
    if (this.auto && P.alive) {
      const threat = B.E.find((e) => e.alive && e.st === 'windup' && Math.hypot(e.x - P.x, e.z - P.z) < 1.8 && B.t - e.st0 > e.react);
      if (threat && !P.roll && (!P.swing || P.swing.step < 2)) { const away = Math.atan2(P.x - threat.x, P.z - threat.z), toC = Math.atan2(-P.x, -P.z); P.dodgeYaw = Math.hypot(P.x, P.z) > PLAT_R - 3.5 ? toC : away; this.dodge(); }
      else if (near) { P.yaw = Math.atan2(near.x - P.x, near.z - P.z); if (nd > 1.5) { mx = near.x - P.x; mz = near.z - P.z; spd = 4.5; } else { if (!P.swing) this.attack(); else { const ph = P.swing.t / 0.42, w = COMBO[P.swing.step].win; if (w && ph >= (w[0] + w[1]) / 2 && !P.queue) this.attack(); } } if (B.E.filter((e) => e.alive && Math.hypot(e.x - P.x, e.z - P.z) < 3).length >= 3 && P.mp >= 10 && !P.swing) this.castFire(); }
      // Fight with your back to the centre: stay away from the edge.
      const r = Math.hypot(P.x, P.z); if (r > PLAT_R - 2.5) { mx -= P.x * 0.8; mz -= P.z * 0.8; spd = Math.max(spd, 3); }
    } else if (P.alive) {
      const f = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0), s = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0), yw = this.view.yaw;
      mx = Math.sin(yw) * f - Math.cos(yw) * s; mz = Math.cos(yw) * f + Math.sin(yw) * s; spd = f || s ? 5 : 0; if (spd) P.yaw = Math.atan2(mx, mz); else if (near && nd < 3) P.yaw = Math.atan2(near.x - P.x, near.z - P.z);
    }
    if (P.roll) { P.roll.t += dt; P.x += P.roll.dx * 7 * dt; P.z += P.roll.dz * 7 * dt; if (P.roll.t > 0.45) P.roll = null; }
    else if (!P.swing && spd) { const L = Math.hypot(mx, mz) || 1; P.x += (mx / L) * spd * dt; P.z += (mz / L) * spd * dt; P.spd = spd; } else P.spd = 0;
    const pr = Math.hypot(P.x, P.z); if (pr > PLAT_R - 0.6) { P.x *= (PLAT_R - 0.6) / pr; P.z *= (PLAT_R - 0.6) / pr; }
    P.inv = Math.max(0, P.inv - dt);
    // Swings: hits land in the active part of the arc; a well-timed press chains the next step.
    if (P.swing) {
      const S = P.swing, dur = 0.42; S.t += dt; const ph = S.t / dur, st = COMBO[S.step];
      if (ph > 0.25 && ph < 0.6) for (const e of B.E) {
        if (!e.alive || e.st === 'rise' || S.hitIds.has(e)) continue; const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz), ang = Math.abs(((Math.atan2(dx, dz) - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < KEY.L + (e.big ? 1.3 : 0.8) && (S.step === 3 || ang < 1.3)) { S.hitIds.add(e); e.hp -= st.dmg; const dv = knock(S.step, e.m) * 8; e.vx += (dx / (d || 1)) * dv; e.vz += (dz / (d || 1)) * dv; if (e.st === 'windup' && S.step >= 2) { e.st = 'stagger'; e.st0 = B.t; } sfx.select(); }
      }
      if (ph >= 1) { if (P.queue && S.step < 3) { if (P.qPerfect) P.perfect++; P.swing = { step: S.step + 1, t: 0, hitIds: new Set() }; P.combo = Math.max(P.combo, S.step + 2); } else P.swing = null; P.queue = false; P.qPerfect = false; }
    }
    // Hollows.
    for (const e of B.E) {
      if (!e.alive) continue;
      if (e.fall > 0) { e.fall += dt; if (e.fall > 1.2) { e.alive = false; e.mesh.visible = false; } continue; }
      const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
      if (e.st === 'rise') { if (B.t - e.st0 > 1) e.st = 'chase'; }
      else if (e.st === 'chase') { const sp = e.big ? 1.8 : 2.6; e.x += (dx / d) * sp * dt; e.z += (dz / d) * sp * dt; if (d < 1.4) { e.st = 'windup'; e.st0 = B.t; e.react = 0.12 + B.R() * 0.42; } }
      else if (e.st === 'windup') { if (B.t - e.st0 > 0.42) { e.st = 'lunge'; e.st0 = B.t; e.ldx = dx / d; e.ldz = dz / d; e.didHit = false; } }
      else if (e.st === 'lunge') { e.x += e.ldx * 6 * dt; e.z += e.ldz * 6 * dt; if (!e.didHit && d < 0.9 && P.inv <= 0 && P.alive) { e.didHit = true; P.hp -= e.big ? 16 : 9; P.swing = null; this.app.stage.flash?.('#7a3aff'); if (P.hp <= 0) { P.alive = false; B.over = true; this.caption('cap.down'); this.app.feed.push('bt.down', 'warn', { w: B.wave + 1 }); this.render(); } } if (B.t - e.st0 > 0.25) { e.st = 'recover'; e.st0 = B.t; } }
      else if (e.st === 'recover' || e.st === 'stagger') { if (B.t - e.st0 > (e.st === 'stagger' ? 0.6 : 0.8)) e.st = 'chase'; }
      // Knockback with floor friction; pushed past the edge = ring-out.
      e.x += e.vx * dt; e.z += e.vz * dt; const fr = Math.exp(-6 * dt); e.vx *= fr; e.vz *= fr;
      if (Math.hypot(e.x, e.z) > PLAT_R + 0.2) { e.fall = 0.001; P.ringouts++; P.kills++; this.app.feed.push('bt.ringout', 'ok'); }
      else if (e.hp <= 0) { e.alive = false; e.mesh.visible = false; P.kills++; }
    }
  }
  btLive(full) {
    const B = this.bt, st = $('#b-status');
    if (st) st.textContent = !B ? t('bt.ready') : B.over ? (B.win ? t('bt.victory') : t('bt.lost', { w: B.wave + 1 })) : t('bt.status', { w: Math.max(1, B.wave + 1), n: B.E.filter((e) => e.alive).length });
    if (B) { const P = B.P;
      const big = $('#bt-big'); if (big) big.innerHTML = `<div><b class="mono">${Math.max(1, B.wave + 1)}/3</b><small>${t('bt.wave')}</small></div><div><b class="mono">${P.kills}</b><small>${t('bt.kills')} · ${P.ringouts} ${t('bt.ro')}</small></div><div><b class="mono">${P.perfect}</b><small>${t('bt.perfect')}</small></div>`;
      const bars = $('#bt-bars'); if (bars) bars.innerHTML = `<div class="bar hp"><i style="width:${Math.max(0, P.hp)}%"></i><span>HP ${f0(Math.max(0, P.hp))}</span></div><div class="bar mp"><i style="width:${(P.mp / 40) * 100}%"></i><span>MP ${f0(P.mp)}</span></div>`;
      const cb = $('#bt-combo'); if (cb) cb.innerHTML = COMBO.map((c, i) => `<span class="${P.swing && P.swing.step >= i ? 'on' : ''}">${i < 3 ? i + 1 : '★'}</span>`).join('');
    }
    if (!full) return;
    const m = $('#bt-math'); if (m) m.innerHTML = `<div>${t('bt.m1')} v = ωL: ${COMBO.map((c) => f1(c.w * KEY.L)).join(' → ')} m/s</div><div>J = m<sub>eff</sub>·v = ${KEY.meff}·${f1(COMBO[3].w * KEY.L)} = ${f1(KEY.meff * COMBO[3].w * KEY.L)} N·s → Δv = J/m: ${t('bt.small')} ${f2(knock(3, 20))} m/s, ${t('bt.big')} ${f2(knock(3, 60))} m/s (${t('bt.boost')})</div><div>${t('bt.m2')}</div>`;
    const g = $('#bt-goal'); if (g) g.innerHTML = `${badge(this.goal.battle)} ${t('goal.battle')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(0.05, Math.min(1.35, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.4, Math.min(3, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) {
    if (this.tab === 'battle') { if (k === ' ' || k === 'j') this.attack(); if (k === 'shift' || k === 'k') this.dodge(); if (k === 'l') this.castFire(); if (['w', 'a', 's', 'd'].includes(k)) this.keys.add(k); }
    if (this.tab === 'route' && k === ' ') this.launch();
  }
  keyUp(k) { this.keys.delete(k); }

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, W = this.W;
    // Motes drift up; the platform glows.
    const A = W.motes.geometry.attributes.position.array; for (let i = 0; i < A.length; i += 3) { A[i + 1] += dt * 0.6; if (A[i + 1] > 18) A[i + 1] = -4; } W.motes.geometry.attributes.position.needsUpdate = true;
    W.glass.emissiveIntensity = 0.28 + 0.05 * Math.sin(time * 1.5);
    W.targets.visible = tab === 'magic'; this.hero.visible = tab !== 'route';
    if (tab !== 'battle') this.hollows.forEach((h) => (h.visible = false));
    // System: worlds orbit (period ∝ r^1.5); the ship flies the route on Launch.
    W.worlds.forEach((w, i) => { const a = time * 0.12 / w.r ** 1.5 + i * 1.3; w.g.position.set(Math.cos(a) * w.r * AU, Math.sin(time * 0.6 + i) * 4, Math.sin(a) * w.r * AU); w.g.rotation.y += dt * 0.2; });
    const R = this.rt; if (R.fly && this.routePts?.length) { R.fly.t += dt * 60; const i = Math.min(this.routePts.length - 1, Math.floor(R.fly.t)), q = this.routePts[i], q2 = this.routePts[Math.min(this.routePts.length - 1, i + 1)]; W.ship.position.set(q[0], 6, q[1]); W.ship.lookAt(SYSTEM_AT.x + q2[0], SYSTEM_AT.y + 6, SYSTEM_AT.z + q2[1]); W.ship.rotateY(Math.PI); if (i >= this.routePts.length - 1) { R.fly = null; const r = route(R.path); this.app.feed.push(r.ok ? 'rt.arrived' : 'rt.stranded', r.ok ? 'ok' : 'warn', { f: f2(r.fuelUsed) }); } } else if (!R.fly) W.ship.position.set(AU, 6, 0);
    let cp, look;
    if (!v.drag && performance.now() - v.last > 4000 && tab !== 'battle') v.yaw += dt * 0.08;
    if (tab === 'dive') { const r = 24 * v.r; look = V(0, 0, 0); cp = V(Math.sin(v.yaw) * r * Math.cos(v.pitch + 0.35), 4 + r * Math.sin(v.pitch + 0.35), Math.cos(v.yaw) * r * Math.cos(v.pitch + 0.35)); this.hero.position.set(0, 0, 0); this.hero.rotation.y = v.yaw; poseHero(this.hero, 'idle', time); }
    else if (tab === 'magic') { this.magicTick(dt); const A2 = this.mg.anim, tg = A2 ? { fire: W.totem, ice: W.orb.parent, thunder: W.rod }[A2.k].position : V(0, 0, -6); this.hero.position.set(0, 0, 1.5); this.hero.rotation.y = Math.atan2(tg.x, tg.z - 1.5); poseHero(this.hero, A2 && A2.t < 0.6 ? 'cast' : 'idle', time); look = V(0, 1.5, -4.2); cp = V(Math.sin(v.yaw * 0.3) * 3, 4.6, 7.5 * v.r); }
    else if (tab === 'route') { const c = SYSTEM_AT.clone(), r = 820 * v.r; look = c; cp = c.clone().add(V(Math.sin(v.yaw * 0.5) * r * 0.6, r * 0.75, Math.cos(v.yaw * 0.5) * r * 0.6)); }
    else {
      const B = this.bt;
      if (B) { this.battleTick(Math.min(dt, 0.05)); const P = B.P; this.hero.position.set(P.x, 0, P.z); this.hero.rotation.y = P.yaw; poseHero(this.hero, !P.alive ? 'down' : P.roll ? 'roll' : P.swing ? 'swing' : P.spd ? 'run' : 'idle', time, { spd: P.spd, ph: P.roll ? P.roll.t / 0.45 : P.swing ? P.swing.t / 0.42 : 0, step: P.swing?.step ?? 0 });
        if (P.swing?.step === 3) this.hero.rotation.y = P.yaw + (P.swing.t / 0.42) * Math.PI * 2;
        for (const e of B.E) { const o = e.mesh; if (!e.alive) continue; const rise = e.st === 'rise' ? Math.min(1, (B.t - e.st0) / 1) : 1; o.position.set(e.x, (rise - 1) * 1.2 - (e.fall ? e.fall * e.fall * 9 : 0), e.z); o.rotation.y = Math.atan2(P.x - e.x, P.z - e.z); const U = o.userData; U.eye.material.opacity = e.st === 'windup' ? 0.6 + 0.4 * Math.sin(time * 30) : 0.9; U.eye.scale.setScalar(e.st === 'windup' ? 0.9 : 0.55); U.body.scale.set(1 + 0.05 * Math.sin(time * 5 + e.x), 1 - 0.05 * Math.sin(time * 5 + e.x) + (e.st === 'lunge' ? -0.15 : 0), 1); U.limbs.forEach((l, i) => (l.rotation.y = Math.sin(time * 6 + i) * 0.4)); U.puddle.material.opacity = e.st === 'rise' ? 0.7 : 0.35; }
        this.missile.material.opacity = Math.max(0, this.missile.material.opacity - dt * 2);
        if (this.auto && !v.drag && performance.now() - v.last > 2500) v.yaw += (((P.yaw - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 1.5);
        const yw = v.yaw; look = V(P.x, 1.0, P.z); cp = look.clone().add(V(-Math.sin(yw) * 7 * v.r, 3.6 + v.pitch * 2, -Math.cos(yw) * 7 * v.r));
      } else { this.hero.position.set(0, 0, 0); poseHero(this.hero, 'idle', time); look = V(0, 1, 0); cp = V(Math.sin(v.yaw) * 10, 5, Math.cos(v.yaw) * 10); }
    }
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 4)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(this.camLook);
    this.cam.fov = tab === 'route' ? 45 : 50; this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 5 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'dive') this.dvLive(full);
    if (this.tab === 'magic') this.mgLive(full);
    if (this.tab === 'route') this.rtLive(full);
    if (this.tab === 'battle') this.btLive(full);
    if (full) this.statusBar();
  }
  showReport() {
    const rows = ['dive', 'magic', 'route', 'battle'].map((k) => [t('rep.' + k), this.goal[k]]);
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
void hohmann;
