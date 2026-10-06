import * as THREE from 'three';
import { PEW2023, QUIZ, stance, appraise, grow, mature, newSociety, stepSociety, clusters, polar, APPROACHES, PERSONAS, converse, opennessP } from './sim/divide.js';
import { buildBrain, paintCortex, COLORS } from './view/anatomy.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// TWO MINDS · the app. Why some people embrace AI and others push back: the landscape of opinion, the brain's
// threat and reward systems, how growing up tunes them, how groups pull apart, and what actually builds bridges.
// Neither side is a cult; both are running the same brain on different inputs.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const pct = (x) => f0(x * 100) + ' %';
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['split', 'brain', 'roots', 'tribes', 'bridge'];
const opinionColor = (x, c = new THREE.Color()) => c.setHSL(0.08 + 0.42 * (x + 1) / 2, 0.85, 0.5);   // amber (concerned) → cyan (enthusiastic)

export class Minds {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.background = new THREE.Color('#05040a'); scene.fog = new THREE.FogExp2('#05040a', 0.02);
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 300); scene.add(this.cam);
    const k = new THREE.DirectionalLight('#ffffff', 1.5); k.position.set(5, 6, 4); scene.add(k); const r = new THREE.DirectionalLight('#7a8cff', 1.2); r.position.set(-6, 2, -5); scene.add(r); scene.add(new THREE.HemisphereLight('#c0d0ff', '#2a1830', 0.55));
    this.B = buildBrain(scene);
    // A crowd: 360 people as glowing dots, used for the opinion landscape and the tribes simulation.
    const n = 360; this.crowd = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }), n);
    this.crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.crowd); this.home = [...Array(n)].map((_, i) => V(0, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4)); this.cpos = this.home.map((h) => h.clone());
    const axis = new THREE.Mesh(new THREE.BoxGeometry(9, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: '#8a8aa8' })); axis.position.y = -1.8; scene.add(axis); this.axis = axis;
    this.sp = { ans: Array(QUIZ.length).fill(null), you: null };
    this.br = { benefit: 10, threat: 6, unc: 0.6, lambda: 2, iu: 1, low: false, high: false };
    this.rt = { harsh: 0.3, unpred: 0.3, support: 0.5, autonomy: 0.5, age: 25 };
    this.tr = { eps: 0.2, h: 0.4, zeal: 0, S: newSociety(n, 3), saw2: false, saw1: false, hist: [] };
    this.bg = { who: 'worker', x: Object.fromEntries(Object.entries(PERSONAS).map(([k, p]) => [k, p.start])), used: {}, open: 0.5, won: new Set() };
    this.goal = { split: false, brain: false, roots: false, tribes: false, bridge: false };
    this.view = { yaw: 0.9, pitch: 0.15, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'split'; this.entered = false; this.uiT = 0; this.time = 0; this.col = new THREE.Color();
    app.stage.use(scene, this.cam);
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const el = $('#caption'); if (!el) return; el.textContent = t(key, vars); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  facts(prefix, n) { return `<details class="ledger"><summary>${t('facts')}</summary><ul class="facts">${[...Array(n)].map((_, i) => `<li>${t(prefix + (i + 1))}</li>`).join('')}</ul></details>`; }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab;
    Object.assign(this.view, { yaw: { split: 0, brain: 0.9, roots: 1.15, tribes: 0, bridge: 0.6 }[tab], pitch: { split: 0.12, brain: 0.15, roots: 0.12, tribes: 0.2, bridge: 0.15 }[tab], r: 1 }); this.snap = true;
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { split: 'sp', brain: 'br', roots: 'rt', tribes: 'tr', bridge: 'bg' }[this.tab]; $('#panel').innerHTML = this[P + 'P'](); $('#side').innerHTML = this[P + 'S'](); this[P + 'B'](); this.refresh(true); }
  // Light up brain parts: h[id] 0…1.
  paint(h) {
    paintCortex(this.B, h, true);
    for (const m of this.B.cortex) { m.material.opacity = 0.17; m.material.depthWrite = false; }
    for (const [id, list] of Object.entries(this.B.parts)) for (const m of list) { const k = h[id] || 0; m.material.emissiveIntensity = 0.06 + 0.7 * k; m.material.opacity = k ? 1 : 0.3; m.material.color.set(COLORS[id]).multiplyScalar(k ? 1 : 0.35); }
    for (const [id, s] of Object.entries(this.B.markers)) s.userData.k = h[id] || 0;
  }

  // ═══ 1 · THE SPLIT ═══
  spP() { const A = this.sp.ans, L = ['−2', '−1', '0', '+1', '+2']; return `<header class="lv-head mono">${t('sp.title')}</header><p class="intro">${t('sp.intro')}</p><header class="lv-sub mono">${t('sp.quiz')}</header>${QUIZ.map(([k], i) => `<div class="q"><span>${t('sp.' + k)}</span><div class="chips">${[-2, -1, 0, 1, 2].map((v, j) => `<button class="btn seg ${A[i] === v ? 'active' : ''}" data-ans="${i}:${v}">${L[j]}</button>`).join('')}</div></div>`).join('')}<p class="small">${t('sp.scale')}</p>${this.facts('sp.f', 6)}`; }
  spS() { return `<header class="lv-head mono">${t('sp.read')}</header><div class="bigstats" id="sp-big"></div><canvas class="cv chart" id="cv-pew"></canvas><div class="math mono" id="sp-math"></div><div class="goal" id="sp-goal"></div>`; }
  spB() { document.querySelectorAll('[data-ans]').forEach((b) => (b.onclick = () => { const [i, v] = b.dataset.ans.split(':').map(Number); this.sp.ans[i] = v; sfx.select(); if (this.sp.ans.every((a) => a !== null)) { this.sp.you = stance(this.sp.ans); this.done('split'); } this.render(); })); }
  spLive(full) {
    if (!full) return; const you = this.sp.you;
    const b = $('#sp-big'); if (b) b.innerHTML = `<div><b class="mono c-amber">${PEW2023.concerned} %</b><small>${t('sp.conc')}</small></div><div><b class="mono">${PEW2023.mixed} %</b><small>${t('sp.mixed')}</small></div><div><b class="mono" style="color:var(--cyan)">${PEW2023.excited} %</b><small>${t('sp.exc')}</small></div>`;
    barChart($('#cv-pew'), { bars: [{ x: 0, y: PEW2023.concerned, color: '#ffb347' }, { x: 1, y: PEW2023.mixed, color: '#c8c0ff' }, { x: 2, y: PEW2023.excited, color: '#7fd0ff' }], x0: -0.6, x1: 2.6, y1: 60, w: 0.6, xTicks: [0, 1, 2], xFmt: (i) => [t('sp.conc'), t('sp.mixed'), t('sp.exc')][i].split(' ')[0], yFmt: (y) => f0(y) + '%', title: t('sp.chart'), marks: you == null ? [] : [{ x: 1 + you, color: '#7cff9e', label: t('sp.you') }] });
    const m = $('#sp-math');
    if (m) m.innerHTML = you == null ? `<div>${t('sp.answer')}</div>` : `<div>${t('sp.yourScore')} <b>${f2(you)}</b> (−1 ${t('sp.veryConc')} … +1 ${t('sp.veryExc')}) → <b>${t(you < -0.3 ? 'sp.lean1' : you > 0.3 ? 'sp.lean3' : 'sp.lean2')}</b></div><div>${t('sp.both')}</div>`;
    const g = $('#sp-goal'); if (g) g.innerHTML = `${badge(this.goal.split)} ${t('goal.split')}`;
  }

  // ═══ 2 · THE BRAIN ═══
  brP() { const B = this.br; return `<header class="lv-head mono">${t('br.title')}</header><p class="intro">${t('br.intro')}</p><header class="lv-sub mono">${t('br.ai')}</header>${this.slider('b-b', t('br.benefit'), B.benefit, 0, 20, 0.5, f1(B.benefit))}${this.slider('b-t', t('br.threat'), B.threat, 0, 15, 0.5, f1(B.threat))}${this.slider('b-u', t('br.unc'), B.unc, 0, 1, 0.01, pct(B.unc))}<header class="lv-sub mono">${t('br.person')}</header>${this.slider('b-l', t('br.lambda'), B.lambda, 1, 3, 0.05, f2(B.lambda))}${this.slider('b-i', t('br.iu'), B.iu, 0, 1.5, 0.01, f2(B.iu))}${this.facts('br.f', 6)}`; }
  brS() { return `<header class="lv-head mono">${t('br.read')}</header><div class="bigstats" id="br-big"></div><div class="meters" id="br-bars"></div><canvas class="cv chart" id="cv-app"></canvas><div class="math mono" id="br-math"></div><div class="goal" id="br-goal"></div>`; }
  brB() { this.bindSliders(this.br, [['b-b', 'benefit', f1], ['b-t', 'threat', f1], ['b-u', 'unc', pct], ['b-l', 'lambda', f2], ['b-i', 'iu', f2]]); }
  brLive(full) {
    const B = this.br, R = appraise(B); this.paint({ amygdala: R.threatDrive, insula: R.threatDrive * 0.9, acc: R.threatDrive * 0.7, nacc: R.rewardDrive, vta: R.rewardDrive, ofc: R.rewardDrive * 0.8, dlpfc: 0.4 });
    if (!full) return;
    const same = B.benefit === 10 && B.threat === 6; if (same && R.P <= 0.2) B.low = true; if (same && R.P >= 0.8) B.high = true; if (B.low && B.high) this.done('brain');
    const b = $('#br-big'); if (b) b.innerHTML = `<div><b class="mono ${R.P >= 0.5 ? 'c-green' : 'c-amber'}">${pct(R.P)}</b><small>${t('br.P')}</small></div><div><b class="mono">${f1(R.value)}</b><small>${t('br.value')}</small></div><div><b class="mono">${B.low ? '✓' : '·'} ${B.high ? '✓' : '·'}</b><small>${t('br.found')}</small></div>`;
    const mt = (l, v, c) => `<div class="mt" style="--c:${c}"><span>${l}</span><i><b style="width:${f0(v * 100)}%"></b></i><em>${pct(v)}</em></div>`;
    const bb = $('#br-bars'); if (bb) bb.innerHTML = mt(t('br.threatNet'), R.threatDrive, '#ffb347') + mt(t('br.rewardNet'), R.rewardDrive, '#7fd0ff');
    const pts = [], p2 = []; for (let u = 0; u <= 1.001; u += 0.02) { pts.push([u * 100, appraise({ ...B, unc: u }).P * 100]); p2.push([u * 100, appraise({ ...B, unc: u, lambda: 1, iu: 0.2 }).P * 100]); }
    lineChart($('#cv-app'), { x0: 0, x1: 100, y0: 0, y1: 100, xFmt: (x) => f0(x) + '%', yFmt: (y) => f0(y) + '%', title: t('br.chart'), series: [{ pts, color: '#ffb347', label: t('br.thisP') }, { pts: p2, color: 'rgba(127,208,255,.7)', dash: [4, 3], label: t('br.calm') }], marks: [{ dot: [B.unc * 100, R.P * 100], color: '#ff6a7a' }] });
    const m = $('#br-math');
    if (m) m.innerHTML = `<div>${t('br.lossL')} λ·threat·(1 + IU·unc) = ${f2(B.lambda)} × ${f1(B.threat)} × (1 + ${f2(B.iu)} × ${f2(B.unc)}) = <b>${f1(R.loss)}</b></div><div>${t('br.valL')} ${f1(B.benefit)} − ${f1(R.loss)} = <b>${f1(R.value)}</b> → P = 1/(1 + e<sup>−0.45·value</sup>) = <b>${pct(R.P)}</b></div><div>${t('br.same')}</div>`;
    const g = $('#br-goal'); if (g) g.innerHTML = `${badge(this.goal.brain)} ${t('goal.brain')}`;
  }

  // ═══ 3 · ROOTS ═══
  rtP() { const R = this.rt; return `<header class="lv-head mono">${t('rt.title')}</header><p class="intro">${t('rt.intro')}</p>${this.slider('r-h', t('rt.harsh'), R.harsh, 0, 1, 0.01, pct(R.harsh))}${this.slider('r-u', t('rt.unpred'), R.unpred, 0, 1, 0.01, pct(R.unpred))}${this.slider('r-s', t('rt.support'), R.support, 0, 1, 0.01, pct(R.support))}${this.slider('r-a', t('rt.autonomy'), R.autonomy, 0, 1, 0.01, pct(R.autonomy))}${this.slider('r-age', t('rt.age'), R.age, 0, 25, 0.5, f1(R.age))}${this.facts('rt.f', 7)}`; }
  rtS() { return `<header class="lv-head mono">${t('rt.read')}</header><div class="bigstats" id="rt-big"></div><div class="meters" id="rt-bars"></div><canvas class="cv chart" id="cv-res"></canvas><div class="math mono" id="rt-math"></div><div class="goal" id="rt-goal"></div>`; }
  rtB() { this.bindSliders(this.rt, [['r-h', 'harsh', pct], ['r-u', 'unpred', pct], ['r-s', 'support', pct], ['r-a', 'autonomy', pct], ['r-age', 'age', f1]]); }
  rtLive(full) {
    const R = this.rt, O = grow(R), M = mature(R.age); this.paint({ amygdala: O.threat * M.amygdala, hippocampus: 0.5 * M.amygdala, dlpfc: O.control * M.pfc, frontal: 0.6 * M.pfc, ofc: 0.6 * M.pfc, acc: 0.5 * M.pfc, nacc: O.explore * M.striatum, vta: O.explore * M.striatum });
    if (!full) return;
    if (O.resil >= 0.8 && O.adv >= 0.2) this.done('roots');
    const b = $('#rt-big'); if (b) b.innerHTML = `<div><b class="mono ${O.resil >= 0.8 ? 'c-green' : ''}">${pct(O.resil)}</b><small>${t('rt.resil')}</small></div><div><b class="mono c-amber">${pct(O.forced)}</b><small>${t('rt.forced')}</small></div><div><b class="mono" style="color:var(--cyan)">${pct(O.chosen)}</b><small>${t('rt.chosen')}</small></div>`;
    const mt = (l, v, c) => `<div class="mt" style="--c:${c}"><span>${l}</span><i><b style="width:${f0(v * 100)}%"></b></i><em>${pct(v)}</em></div>`;
    const bb = $('#rt-bars'); if (bb) bb.innerHTML = mt(t('rt.threat'), O.threat, '#ffb347') + mt(t('rt.control'), O.control, '#7cff9e') + mt(t('rt.explore'), O.explore, '#7fd0ff') + mt(t('rt.pfc'), M.pfc, '#c8a0ff');
    const pts = []; for (let a = 0; a <= 1.001; a += 0.02) { const k = a / Math.max(0.001, 0.6 * R.harsh + 0.4 * R.unpred || 1); pts.push([a * 100, grow({ ...R, harsh: a, unpred: a }).resil * 100]); void k; }
    lineChart($('#cv-res'), { x0: 0, x1: 100, y0: 0, y1: 100, xFmt: (x) => f0(x) + '%', yFmt: (y) => f0(y) + '%', title: t('rt.chart'), series: [{ pts, color: '#7cff9e', label: t('rt.resil') }], marks: [{ x: O.adv * 100, color: 'rgba(255,255,255,.4)', label: t('rt.you') }, { y: 80, color: 'rgba(124,255,158,.35)' }] });
    const m = $('#rt-math');
    if (m) m.innerHTML = `<div>${t('rt.advL')} 0.6·harsh + 0.4·unpredictable = <b>${pct(O.adv)}</b> · ${t('rt.buffer')} × (1 − 0.65·support)</div><div>${t('rt.resL')} [1 − ((adversity − 0.35)/0.5)²] × support × control = <b>${pct(O.resil)}</b></div><div>${t('rt.age2', { a: f1(R.age) })} ${t('rt.amy')} ${pct(M.amygdala)} · ${t('rt.pfcL')} ${pct(M.pfc)}</div>`;
    const g = $('#rt-goal'); if (g) g.innerHTML = `${badge(this.goal.roots)} ${t('goal.roots')}`;
  }

  // ═══ 4 · TRIBES ═══
  trP() { const T = this.tr; return `<header class="lv-head mono">${t('tr.title')}</header><p class="intro">${t('tr.intro')}</p>${this.slider('t-e', t('tr.eps'), T.eps, 0.05, 1, 0.01, f2(T.eps))}${this.slider('t-h', t('tr.h'), T.h, 0, 1, 0.01, pct(T.h))}${this.slider('t-z', t('tr.zeal'), T.zeal, 0, 0.2, 0.005, pct(T.zeal))}<div class="chips"><button class="btn primary" id="t-new">↺ ${t('tr.new')}</button></div>${this.facts('tr.f', 6)}`; }
  trS() { return `<header class="lv-head mono">${t('tr.read')}</header><div class="bigstats" id="tr-big"></div><canvas class="cv chart" id="cv-hist"></canvas><div class="math mono" id="tr-math"></div><div class="goal" id="tr-goal"></div>`; }
  trB() { this.bindSliders(this.tr, [['t-e', 'eps', f2], ['t-h', 'h', pct], ['t-z', 'zeal', pct]]); $('#t-new').onclick = () => { this.tr.S = newSociety(360, Math.floor(Math.random() * 1e6)); sfx.select(); }; }
  trLive(full) {
    if (!full) return; const T = this.tr, C = clusters(T.S), pol = polar(T.S), settled = T.S.t > 25000;
    if (settled && C.length === 2) T.saw2 = true; if (settled && C.length === 1 && T.saw2) T.saw1 = true; if (T.saw1) this.done('tribes');
    const b = $('#tr-big'); if (b) b.innerHTML = `<div><b class="mono">${C.length}</b><small>${t('tr.camps')}</small></div><div><b class="mono">${f2(pol)}</b><small>${t('tr.pol')}</small></div><div><b class="mono">${T.saw2 ? '✓' : '·'} ${T.saw1 ? '✓' : '·'}</b><small>${t('tr.steps')}</small></div>`;
    const bins = Array(24).fill(0); for (const x of T.S.x) bins[Math.min(23, Math.floor((x + 1) * 12))]++;
    barChart($('#cv-hist'), { bars: bins.map((v, i) => ({ x: i, y: v, color: '#' + opinionColor(i / 11.5 - 1).getHexString() })), x0: -0.5, x1: 23.5, y1: Math.max(40, Math.max(...bins) + 10), w: 0.85, xTicks: [0, 12, 23], xFmt: (i) => (i === 0 ? t('tr.against') : i === 12 ? '0' : t('tr.for')), yFmt: (y) => f0(y), title: t('tr.chart'), marks: [] });
    const m = $('#tr-math');
    if (m) m.innerHTML = `<div>${t('tr.rule')} |x<sub>i</sub> − x<sub>j</sub>| &lt; ε → x<sub>i</sub> += μ(x<sub>j</sub> − x<sub>i</sub>), μ = 0.3</div><div>${t('tr.expect')} ≈ 1/(2ε) = <b>${f1(1 / (2 * T.eps))}</b> · ${t('tr.found')} <b>${C.length}</b>: ${C.map((c) => f2(c.c) + ' (' + c.n + ')').join(' · ')}</div><div>${t('tr.kahan')}</div>`;
    const g = $('#tr-goal'); if (g) g.innerHTML = `${badge(this.goal.tribes)} ${t('goal.tribes')}`;
  }

  // ═══ 5 · BRIDGE ═══
  bgP() { const G = this.bg; return `<header class="lv-head mono">${t('bg.title')}</header><p class="intro">${t('bg.intro')}</p><header class="lv-sub mono">${t('bg.who')}</header>${this.chips('who', Object.keys(PERSONAS), G.who, (k) => t('p.' + k))}<p class="small">${t('pd.' + G.who)}</p>${this.slider('g-o', t('bg.open'), G.open, 0, 1, 0.01, pct(G.open))}<header class="lv-sub mono">${t('bg.try')}</header><div class="acts">${Object.keys(APPROACHES).map((a) => `<button class="act" data-ap="${a}"><b>${t('a.' + a)}</b><small>${t('ad.' + a)}</small></button>`).join('')}</div>${this.facts('bg.f', 6)}`; }
  bgS() { return `<header class="lv-head mono">${t('bg.read')}</header><div class="bigstats" id="bg-big"></div><div class="meters" id="bg-bars"></div><div class="math mono" id="bg-math"></div><div class="goal" id="bg-goal"></div>`; }
  bgB() { const G = this.bg; this.bindChips('who', (k) => { G.who = k; }); this.bindSliders(G, [['g-o', 'open', pct]]); document.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => this.talk(b.dataset.ap))); }
  talk(ap) {
    const G = this.bg, key = G.who + ':' + ap, n = (G.used[key] = (G.used[key] || 0) + 1), gain = converse(G.who, ap, G.open) * (n > 1 && ap !== 'mock' ? 0.5 ** (n - 1) : 1);
    G.x[G.who] += gain; const P = opennessP(G.x[G.who]); this.app.feed.push(gain < 0 ? 'bg.backfire' : 'bg.moved', gain < 0 ? 'bad' : 'ok', { p: t('p.' + G.who), d: (gain >= 0 ? '+' : '') + f0(gain * 40) });
    if (P >= 0.6) G.won.add(G.who); if (G.won.size >= 3) this.done('bridge'); sfx.select(); this.refresh(true);
  }
  bgLive(full) {
    const G = this.bg; this.paint({ dlpfc: 0.4 + 0.5 * G.open, acc: 0.6, pcc: 0.5, nacc: opennessP(G.x[G.who]), amygdala: 1 - opennessP(G.x[G.who]), insula: 0.5 * (1 - opennessP(G.x[G.who])) });
    if (!full) return;
    const b = $('#bg-big'); if (b) b.innerHTML = `<div><b class="mono ${opennessP(G.x[G.who]) >= 0.6 ? 'c-green' : 'c-amber'}">${pct(opennessP(G.x[G.who]))}</b><small>${t('bg.openNow')}</small></div><div><b class="mono">${G.won.size}/3</b><small>${t('bg.bridged')}</small></div><div><b class="mono">${f0(Object.values(G.used).reduce((a, b) => a + b, 0))}</b><small>${t('bg.convos')}</small></div>`;
    const mt = (l, v, c) => `<div class="mt" style="--c:${c}"><span>${l}</span><i><b style="width:${f0(v * 100)}%"></b></i><em>${pct(v)}</em></div>`;
    const bb = $('#bg-bars'); if (bb) bb.innerHTML = Object.keys(PERSONAS).map((k) => mt(t('p.' + k), opennessP(G.x[k]), G.won.has(k) ? '#7cff9e' : '#ffb347')).join('');
    const m = $('#bg-math'); if (m) m.innerHTML = `<div>${t('bg.model')}</div><div>${t('bg.both')}</div>`;
    const g = $('#bg-goal'); if (g) g.innerHTML = `${badge(this.goal.bridge)} ${t('goal.bridge')}`;
  }

  newSociety(seed) { return newSociety(360, seed); }
  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.9, Math.min(1.1, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.45, Math.min(2.2, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key() {}
  keyUp() {}

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, crowdOn = tab === 'split' || tab === 'tribes';
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * (crowdOn ? 0.02 : 0.07);
    this.B.group.visible = !crowdOn; this.B.dust.visible = true; this.crowd.visible = crowdOn; this.axis.visible = crowdOn;
    if (tab === 'tribes') stepSociety(this.tr.S, this.tr, 400);
    if (crowdOn) {
      const m4 = new THREE.Matrix4(), n = this.home.length; let r = 1;
      for (let i = 0; i < n; i++) {
        let x;
        if (tab === 'split') { const u = (i + 0.5) / n; x = u < 0.52 ? -1 + (u / 0.52) * 0.85 : u < 0.88 ? -0.15 + ((u - 0.52) / 0.36) * 0.3 : 0.15 + ((u - 0.88) / 0.12) * 0.85; x = Math.sign(x) * Math.pow(Math.abs(x), 1.3); r = 1; }
        else { x = this.tr.S.x[i]; r = this.tr.S.z[i] ? 1.8 : 1; }
        const target = V(x * 4.2, this.home[i].y, this.home[i].z); this.cpos[i].lerp(target, Math.min(1, dt * 3));
        m4.makeScale(r, r, r).setPosition(this.cpos[i]); this.crowd.setMatrixAt(i, m4); this.crowd.setColorAt(i, opinionColor(x, this.col));
      }
      this.crowd.instanceMatrix.needsUpdate = true; if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    }
    if (tab === 'split') this.paint({});
    for (const s of Object.values(this.B.markers)) s.material.opacity = Math.min(1, (s.userData.k || 0) * (0.7 + 0.3 * Math.sin(time * 3)));
    const look = crowdOn ? V(0, 0, 0) : V(0, -0.15, 0), R = (crowdOn ? 10.5 : 9.6) * v.r, cp = V(Math.sin(v.yaw) * Math.cos(v.pitch) * R, Math.sin(v.pitch) * R + 0.3, Math.cos(v.yaw) * Math.cos(v.pitch) * R).add(look);
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(look);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 3 === 0); }
  }
  refresh(full) { if (!this.entered) return; const P = { split: 'sp', brain: 'br', roots: 'rt', tribes: 'tr', bridge: 'bg' }[this.tab]; this[P + 'Live'](full); if (full) this.statusBar(); }
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
