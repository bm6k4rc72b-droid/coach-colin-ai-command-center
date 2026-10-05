import * as THREE from 'three';
import { PARTS, CENSUS, energy, TD, newTD, tdTrial, tdAsym, uncertainty, MOT, motivate, yd, ydPeak, lc, curiosity, recall, BRIDGE, fisher, power, study, HYP, filter, eegFreq, band, HGSHS } from './sim/mind.js';
import { buildBrain, paintCortex, regionOfHit, COLORS, CORTEX_IDS, S } from './view/anatomy.js';
import { glowSprite } from './view/holo.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// MINDSCAPE · the app. Six rooms around one glass brain: the atlas of its parts, dopamine and prediction,
// motivation (and its absence), arousal and interest, attraction, and suggestion — hypnosis and the
// critical filter that decides what we believe.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(x < 0.1 ? 1 : 0) + '%' : '—');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['atlas', 'dopamine', 'motivation', 'arousal', 'attraction', 'suggestion'];
const GROUPS = ['lobe', 'limbic', 'deep', 'basal', 'stem'];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }
// Which parts each room lights up.
const FOCUS = {
  dopamine: { vta: 1, nacc: 1, sn: 0.6, caudate: 0.5, putamen: 0.5, ofc: 0.6, dlpfc: 0.4 },
  motivation: { nacc: 1, vta: 0.9, acc: 0.9, dlpfc: 0.7, ofc: 0.6, pallidus: 0.5 },
  arousal: { lc: 1, thalamus: 0.7, dlpfc: 0.5, hippocampus: 0.7, pons: 0.5 },
  attraction: {},
  suggestion: { acc: 0.3, dlpfc: 1, insula: 1, pcc: 0.6, thalamus: 0.4 },
};
const SYSTEMS = { lust: { hypothalamus: 1, amygdala: 0.9, pituitary: 0.6 }, attraction: { vta: 1, caudate: 1, nacc: 0.8, lc: 0.6 }, attachment: { pallidus: 1, hypothalamus: 0.8, pituitary: 0.9, nacc: 0.5 } };

export class Mind {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.fog = new THREE.FogExp2('#04030a', 0.025); scene.background = new THREE.Color('#04030a'); scene.environmentIntensity = 0.6;
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 200); scene.add(this.cam);
    const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(5, 6, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#7a8cff', 1.4); rim.position.set(-6, 2, -5); scene.add(rim);
    scene.add(new THREE.HemisphereLight('#bcd0ff', '#2a1830', 0.55));
    this.B = buildBrain(scene);
    this.tokens = [...Array(26)].map(() => { const s = glowSprite('#ffffff', 0.32, 0); s.renderOrder = 8; s.material.depthTest = false; scene.add(s); return { s, t: 1 + Math.random(), acc: false, dir: V(0, 0, 0) }; });
    this.ray = new THREE.Raycaster();
    this.at = { sel: 'frontal', glass: false, quiz: null };
    this.da = { L: newTD(), alpha: 0.25, gamma: 0.98, p: 1, R: 1, run: false, acc: 0, omitNext: false, sawOmit: false, anim: null };
    this.mo = { R: 10, delay: 30, E: 3, now: 0, A: 1.5, DA: 0.6 };
    this.ar = { a: 0.88, diff: 0.7, conf: 0.92 };
    this.tt = { sys: 'attraction', n: 16, seed: 0, res: null, runs: [] };
    this.sg = { load: 0, fatigue: 0, depth: 0, h: 'high', reps: 1, trust: false, prompt: false, sawWorst: false };
    this.goal = { atlas: false, dopamine: false, motivation: false, arousal: false, attraction: false, suggestion: false };
    this.view = { yaw: 0.9, pitch: 0.12, r: 1, drag: null, last: 0, moved: 0 };
    this.keys = new Set(); this.tab = 'atlas'; this.entered = false; this.uiT = 0; this.time = 0;
    app.stage.use(scene, this.cam); this.paint();
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  toggle(id, on, label) { return `<button class="btn seg ${on ? 'active' : ''}" id="${id}">${label}: ${on ? t('on') : t('off')}</button>`; }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab;
    this.view.yaw = { atlas: 0.9, dopamine: 0.35, motivation: 0.6, arousal: -0.6, attraction: 0.25, suggestion: 0.75 }[tab]; this.view.pitch = 0.12; this.view.r = 1; this.snap = true;
    if (tab !== 'atlas' && this.at.quiz) this.at.quiz = null;
    this.paint(); this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { atlas: 'at', dopamine: 'da', motivation: 'mo', arousal: 'ar', attraction: 'tt', suggestion: 'sg' }[this.tab]; $('#panel').innerHTML = this[P + 'P'](); $('#side').innerHTML = this[P + 'S'](); this[P + 'B'](); this.refresh(true); }
  // Which parts glow, and whether the brain is glass (so deep structures show).
  highlights() {
    if (this.tab === 'atlas') { const q = this.at.quiz; return q ? {} : { [this.at.sel]: 1 }; }
    if (this.tab === 'attraction') return SYSTEMS[this.tt.sys];
    if (this.tab === 'suggestion') { const d = this.sg.depth * HYP.h[this.sg.h]; return { ...FOCUS.suggestion, acc: 0.9 - 0.8 * d, pcc: 0.7 - 0.5 * d }; }
    return FOCUS[this.tab];
  }
  glassy() { if (this.tab === 'atlas') { const p = PARTS.find((q) => q.id === this.at.sel); return this.at.glass || (!this.at.quiz && p?.kind === 'd'); } return true; }
  paint() {
    const h = this.highlights(), glass = this.glassy(), focus = Object.keys(h).length > 0;
    paintCortex(this.B, h, focus);
    for (const m of this.B.cortex) { m.material.opacity = glass ? 0.16 : 1; m.material.depthWrite = !glass; m.material.needsUpdate = true; }
    for (const [id, list] of Object.entries(this.B.parts)) for (const m of list) { const k = h[id] || 0; m.material.emissiveIntensity = focus ? 0.08 + 1.4 * k : 0.3; m.material.opacity = focus && !k && id !== 'cerebellum' && id !== 'pons' && id !== 'medulla' && id !== 'midbrain' ? 0.35 : 1; m.material.color.set(COLORS[id]).multiplyScalar(focus && !k ? 0.35 : 1); }
    for (const [id, s] of Object.entries(this.B.markers)) s.userData.k = h[id] || (this.tab === 'atlas' && this.at.quiz ? 0.25 : 0);
  }

  // ═══ 1 · ATLAS ═══
  atP() {
    const A = this.at, q = A.quiz;
    return `<header class="lv-head mono">${t('at.title')}</header><p class="intro">${t('at.intro')}</p>
      <div class="chips"><button class="btn ${q ? 'seg active' : 'primary'}" id="a-quiz">${q ? t('at.quizStop') : '◎ ' + t('at.quiz')}</button>${this.toggle('a-glass', A.glass, t('at.glass'))}</div>
      ${GROUPS.map((g) => `<header class="lv-sub mono">${t('grp.' + g)}</header><div class="parts">${PARTS.filter((p) => p.group === g).map((p) => `<button class="part ${A.sel === p.id && !q ? 'on' : ''}" data-part="${p.id}" ${q ? 'disabled' : ''}><i style="background:${COLORS[p.id]}"></i>${q ? '•••' : t('r.' + p.id)}</button>`).join('')}</div>`).join('')}
      <p class="small">${t('at.note')}</p>`;
  }
  atS() { return `<header class="lv-head mono">${t('at.read')}</header><div id="at-card"></div><div class="bigstats" id="at-big"></div><div class="math mono" id="at-math"></div><div class="goal" id="at-goal"></div>`; }
  atB() {
    const A = this.at; $('#a-quiz').onclick = () => { if (A.quiz) A.quiz = null; else this.newQuiz(); this.paint(); this.render(); };
    $('#a-glass').onclick = () => { A.glass = !A.glass; this.paint(); this.render(); };
    this.bindChips('part', (id) => { A.sel = id; this.paint(); });
  }
  newQuiz() { const A = this.at; A.quiz = { score: 0, asked: 0, wrong: 0, target: null, rnd: rng(7 + (A.quiz?.asked || 0)) }; this.nextQuestion(); }
  nextQuestion() { const q = this.at.quiz, pool = PARTS.filter((p) => p.id !== q.target); q.target = pool[Math.floor(q.rnd() * pool.length)].id; q.asked++; this.caption('at.find', { p: t('r.' + q.target) }); }
  answer(id) {
    const A = this.at, q = A.quiz; if (!q) { A.sel = id; this.paint(); this.render(); return; }
    if (id === q.target) { q.score++; sfx.confirm(); this.app.feed.push('at.right', 'ok', { p: t('r.' + id) }); if (q.score >= 6) { this.done('atlas'); A.quiz = null; A.sel = id; this.paint(); this.render(); return; } }
    else { q.wrong++; sfx.deny(); this.app.feed.push('at.wrong', 'warn', { p: t('r.' + id), q: t('r.' + q.target) }); }
    this.nextQuestion(); this.render();
  }
  atLive(full) {
    if (!full) return;
    const A = this.at, q = A.quiz, id = A.sel, E = energy();
    const c = $('#at-card');
    if (c) c.innerHTML = q ? `<div class="card-q"><small class="mono">${t('at.quizH')}</small><b>${t('at.find', { p: t('r.' + q.target) })}</b><p class="small">${t('at.hint.' + PARTS.find((p) => p.id === q.target).group)}</p></div>`
      : `<div class="pcard" style="--c:${COLORS[id]}"><small class="mono">${t('grp.' + PARTS.find((p) => p.id === id).group)}</small><h3>${t('r.' + id)}</h3><p>${t('f.' + id)}</p><p class="fact">${t('x.' + id)}</p></div>`;
    const b = $('#at-big'); if (b) b.innerHTML = q ? `<div><b class="mono c-green">${q.score}/6</b><small>${t('at.score')}</small></div><div><b class="mono">${q.asked}</b><small>${t('at.asked')}</small></div><div><b class="mono ${q.wrong ? 'c-amber' : ''}">${q.wrong}</b><small>${t('at.wrongN')}</small></div>`
      : `<div><b class="mono">86 B</b><small>${t('at.neurons')}</small></div><div><b class="mono">${f0(E.brainW)} W</b><small>${t('at.power')}</small></div><div><b class="mono">${f0(E.mass * 100)} %</b><small>${t('at.mass')}</small></div>`;
    const m = $('#at-math');
    if (m) m.innerHTML = `<div>${t('at.census')} ${f1(CENSUS.cortex / 1e9)} B ${t('at.cx')} + ${f1(CENSUS.cerebellum / 1e9)} B ${t('at.cb')} + ${f2(CENSUS.rest / 1e9)} B ${t('at.rest')} = <b>${f1(CENSUS.total / 1e9)} B</b></div>
      <div>${t('at.cbShare')} ${f0(CENSUS.cerebellum / 1e9)}/${f0(CENSUS.total / 1e9)} = <b>${f0((CENSUS.cerebellum / CENSUS.total) * 100)} %</b> ${t('at.cbNote')}</div>
      <div>${t('at.energyL')} 2,000 kcal × 4,184 J ÷ 86,400 s = <b>${f0(E.wholeW)} W</b> → 20 % = <b>${f1(E.brainW)} W</b> · ${t('at.perNeuron')} ≈ <b>${f0(E.perNeuronPW)} pW</b></div>`;
    const g = $('#at-goal'); if (g) g.innerHTML = `${badge(this.goal.atlas)} ${t('goal.atlas')}`;
  }

  // ═══ 2 · DOPAMINE ═══
  daP() {
    const D = this.da;
    return `<header class="lv-head mono">${t('da.title')}</header><p class="intro">${t('da.intro')}</p>
      <div class="chips"><button class="btn primary" id="d-run">${D.run ? '❚❚ ' + t('da.pause') : '▶ ' + t('da.run')}</button><button class="btn seg" id="d-one">${t('da.one')}</button><button class="btn seg ${D.omitNext ? 'active' : ''}" id="d-omit">${t('da.omit')}</button><button class="btn seg" id="d-reset">${t('da.reset')}</button></div>
      ${this.slider('d-a', t('da.alpha'), D.alpha, 0.05, 0.6, 0.01, f2(D.alpha))}${this.slider('d-g', t('da.gamma'), D.gamma, 0.85, 1, 0.005, f3(D.gamma))}${this.slider('d-p', t('da.p'), D.p, 0, 1, 0.05, pct(D.p))}
      <p class="small">${t('da.note')}</p>`;
  }
  daS() { return `<header class="lv-head mono">${t('da.read')}</header><div class="bigstats" id="da-big"></div><canvas class="cv chart" id="cv-trial"></canvas><canvas class="cv chart" id="cv-learn"></canvas><div class="math mono" id="da-math"></div><div class="goal" id="da-goal"></div>`; }
  daB() {
    const D = this.da; $('#d-run').onclick = () => { D.run = !D.run; sfx.select(); this.render(); }; $('#d-one').onclick = () => this.trial();
    $('#d-omit').onclick = () => { D.omitNext = !D.omitNext; sfx.select(); this.render(); }; $('#d-reset').onclick = () => { D.L = newTD(); D.sawOmit = false; sfx.select(); this.render(); };
    this.bindSliders(D, [['d-a', 'alpha', f2], ['d-g', 'gamma', f3], ['d-p', 'p', pct]]);
  }
  trial() {
    const D = this.da, omit = D.omitNext, r = tdTrial(D.L, { alpha: D.alpha, gamma: D.gamma, R: D.R, p: D.p, omit }); D.anim = { d: r.d, t: 0 };
    const asym = tdAsym(D);
    if (omit) { D.omitNext = false; const dip = r.d[TD.tr - 1]; if (dip < -0.5 * D.R && D.p >= 0.8) D.sawOmit = true; this.app.feed.push('da.dip', 'warn', { d: f2(dip) }); this.render(); }
    const learned = r.d[TD.tc - 1] >= 0.7 * asym.cue && D.p >= 0.8;
    if (learned && !D.learnedMsg) { D.learnedMsg = true; this.app.feed.push('da.learned', 'ok'); }
    if (learned && D.sawOmit) this.done('dopamine');
    return r;
  }
  daTick(dt) { const D = this.da; if (D.anim) { D.anim.t += dt; if (D.anim.t > 1.2) D.anim = null; } if (!D.run) return; D.acc += dt; while (D.acc > 0.12) { D.acc -= 0.12; this.trial(); } }
  daLive(full) {
    if (!full) return;
    const D = this.da, L = D.L, last = L.last, asym = tdAsym(D);
    const b = $('#da-big'); if (b) b.innerHTML = `<div><b class="mono c-amber">${last ? f2(last.d[TD.tc - 1]) : '—'}</b><small>${t('da.atCue')}</small></div><div><b class="mono ${last && last.d[TD.tr - 1] < -0.05 ? 'c-red' : 'c-green'}">${last ? f2(last.d[TD.tr - 1]) : '—'}</b><small>${t('da.atRew')}</small></div><div><b class="mono">${L.n}</b><small>${t('da.trials')}</small></div>`;
    const bars = last ? [...last.d].map((v, i) => ({ x: i, y: v, color: v >= 0 ? '#ffd23a' : '#ff5a6a', glow: Math.abs(v) > 0.2 })) : [];
    barChart($('#cv-trial'), { bars: bars.map((q) => ({ ...q, y: q.y + 1.1 })), x0: -0.5, x1: TD.T - 0.5, y0: 0, y1: 2.3, w: 0.8, xTicks: [TD.tc - 1, TD.tr - 1], xFmt: (i) => (i === TD.tc - 1 ? t('da.cue') : t('da.reward')), yFmt: (y) => f1(y - 1.1), title: t('da.chart1'), marks: [] });
    const H = L.hist;
    lineChart($('#cv-learn'), { x0: Math.max(0, L.n - 150), x1: Math.max(20, L.n), y0: -1.1, y1: 1.2, xFmt: (x) => f0(x), yFmt: f1, title: t('da.chart2'), series: [{ pts: H.map((q) => [q[0], q[1]]), color: '#ffd23a', label: t('da.cue') }, { pts: H.map((q) => [q[0], q[2]]), color: '#7cff9e', label: t('da.reward') }], marks: [{ y: asym.cue, color: 'rgba(255,210,58,.45)' }, { y: 0, color: 'rgba(255,255,255,.2)' }] });
    const m = $('#da-math');
    if (m) m.innerHTML = `<div>δ<sub>t</sub> = r<sub>t+1</sub> + γ·V(t+1) − V(t) · V(t) ← V(t) + α·δ<sub>t</sub> (α = ${f2(D.alpha)}, γ = ${f3(D.gamma)})</div>
      <div>${t('da.asymL')} δ<sub>cue</sub> → γ<sup>${TD.tr - TD.tc}</sup>·p·R = <b>${f3(asym.cue)}</b> · δ<sub>reward</sub> → (1 − p)R = <b>${f2(asym.reward)}</b> · ${t('da.omitL')} −pR = <b>${f2(asym.omit)}</b></div>
      <div>${t('da.unc')} p(1 − p) = <b>${f2(uncertainty(D.p))}</b> (${t('da.uncNote')})</div>
      <div>${t('da.wl')}</div>`;
    const g = $('#da-goal'); if (g) g.innerHTML = `${badge(this.goal.dopamine)} ${t('goal.dopamine')}`;
  }

  // ═══ 3 · MOTIVATION ═══
  moP() {
    const M = this.mo;
    return `<header class="lv-head mono">${t('mo.title')}</header><p class="intro">${t('mo.intro')}</p>
      ${this.slider('m-E', t('mo.E'), M.E, 0.1, 4, 0.05, f0(M.E * 60) + ' min')}${this.slider('m-d', t('mo.delay'), M.delay, 0, 60, 1, M.delay + ' ' + t('mo.days'))}${this.slider('m-n', t('mo.now'), M.now, 0, 3, 0.1, f1(M.now))}
      ${this.slider('m-A', t('mo.A'), M.A, 0, 3, 0.1, f1(M.A))}${this.slider('m-DA', t('mo.DA'), M.DA, 0.3, 1.5, 0.05, f2(M.DA))}${this.slider('m-R', t('mo.R'), M.R, 2, 20, 1, f0(M.R))}
      <p class="small">${t('mo.note')}</p>`;
  }
  moS() { return `<header class="lv-head mono">${t('mo.read')}</header><div class="bigstats" id="mo-big"></div><div class="meters" id="mo-bars"></div><canvas class="cv chart" id="cv-mot"></canvas><div class="math mono" id="mo-math"></div><div class="goal" id="mo-goal"></div>`; }
  moB() { this.bindSliders(this.mo, [['m-E', 'E', (v) => f0(v * 60) + ' min'], ['m-d', 'delay', (v) => v + ' ' + t('mo.days')], ['m-n', 'now', f1], ['m-A', 'A', f1], ['m-DA', 'DA', f2], ['m-R', 'R', f0]]); }
  moLive(full) {
    if (!full) return;
    const M = this.mo, R = motivate(M), ok = R.P >= 0.8 && M.DA <= 0.7 && M.R <= 10;
    const b = $('#mo-big'); if (b) b.innerHTML = `<div><b class="mono ${R.P >= 0.8 ? 'c-green' : R.P < 0.3 ? 'c-red' : 'c-amber'}">${pct(R.P)}</b><small>${t('mo.P')}</small></div><div><b class="mono">${f2(R.task)}</b><small>${t('mo.task')}</small></div><div><b class="mono">${f1(R.tau)} s</b><small>${t('mo.tau')}</small></div>`;
    const mt = (label, v, max, txt, c) => `<div class="mt" style="--c:${c}"><span>${label}</span><i><b style="width:${Math.max(0, Math.min(100, (Math.abs(v) / max) * 100))}%"></b></i><em>${txt}</em></div>`;
    const bb = $('#mo-bars'); if (bb) bb.innerHTML = mt(t('mo.gain'), R.gain, 8, '+' + f2(R.gain), '#7cff9e') + mt(t('mo.bonus'), R.bonus, 8, '+' + f2(R.bonus), '#ffd23a') + mt(t('mo.cost'), R.cost, 8, '−' + f2(R.cost), '#ff6a7a') + mt(t('mo.alt'), R.alt, 8, f2(R.alt), '#b48cff');
    const pts = [], pts2 = []; for (let e = 0.1; e <= 4.001; e += 0.05) { pts.push([e * 60, motivate({ ...M, E: e }).P * 100]); pts2.push([e * 60, motivate({ ...M, E: e, DA: 1.2 }).P * 100]); }
    lineChart($('#cv-mot'), { x0: 6, x1: 240, y0: 0, y1: 100, xFmt: (x) => f0(x) + 'm', yFmt: (y) => f0(y) + '%', title: t('mo.chart'), series: [{ pts, color: '#7cff9e', label: 'DA ' + f2(M.DA) }, { pts: pts2, color: 'rgba(255,210,58,.6)', dash: [4, 3], label: 'DA 1.20' }], marks: [{ y: 80, color: 'rgba(255,255,255,.35)', label: '80 %' }, { dot: [M.E * 60, R.P * 100], color: '#ff6a7a' }] });
    const m = $('#mo-math');
    if (m) m.innerHTML = `<div>SV<sub>task</sub> = DA·R/(1 + k·D) + DA·r<sub>now</sub> − c·E²/DA = ${f2(R.gain)} + ${f2(R.bonus)} − ${f2(R.cost)} = <b>${f2(R.task)}</b> (k = ${MOT.k}/${t('mo.day')}, c = ${MOT.c}/h²)</div>
      <div>SV<sub>alt</sub> = DA·A = <b>${f2(R.alt)}</b> · P = 1/(1 + e<sup>−β(SV<sub>task</sub> − SV<sub>alt</sub>)</sup>) = <b>${pct(R.P)}</b> (β = ${MOT.beta})</div>
      <div>${t('mo.vigor')} τ* = √(C<sub>v</sub>/R̄) = √(${MOT.Cv}/${f2(R.Rbar)}) = <b>${f2(R.tau)} s</b></div>
      <div>${t('mo.care')}</div>`;
    if (ok) this.done('motivation');
    const g = $('#mo-goal'); if (g) g.innerHTML = `${badge(this.goal.motivation)} ${t('goal.motivation')}`;
  }

  // ═══ 4 · AROUSAL & INTEREST ═══
  arP() {
    const A = this.ar;
    return `<header class="lv-head mono">${t('ar.title')}</header><p class="intro">${t('ar.intro')}</p>
      ${this.slider('r-a', t('ar.a'), A.a, 0, 1, 0.01, f0(A.a * 100) + ' %')}${this.slider('r-d', t('ar.diff'), A.diff, 0, 1, 0.05, f0(A.diff * 100) + ' %')}
      <header class="lv-sub mono">${t('ar.curH')}</header><p class="small">${t('ar.curIntro')}</p>${this.slider('r-c', t('ar.conf'), A.conf, 0, 1, 0.01, f0(A.conf * 100) + ' %')}
      <p class="small">${t('ar.note')}</p>`;
  }
  arS() { return `<header class="lv-head mono">${t('ar.read')}</header><div class="bigstats" id="ar-big"></div><canvas class="cv chart" id="cv-yd"></canvas><canvas class="cv chart" id="cv-cur"></canvas><div class="math mono" id="ar-math"></div><div class="goal" id="ar-goal"></div>`; }
  arB() { this.bindSliders(this.ar, [['r-a', 'a', (v) => f0(v * 100) + ' %'], ['r-d', 'diff', (v) => f0(v * 100) + ' %'], ['r-c', 'conf', (v) => f0(v * 100) + ' %']]); }
  arLive(full) {
    if (!full) return;
    const A = this.ar, perf = yd(A.a, A.diff), L = lc(A.a), cu = curiosity(A.conf), ok = perf >= 0.95 && A.diff >= 0.6 && cu >= 0.95;
    const b = $('#ar-big'); if (b) b.innerHTML = `<div><b class="mono ${perf >= 0.95 ? 'c-green' : perf < 0.5 ? 'c-red' : 'c-amber'}">${pct(perf)}</b><small>${t('ar.perf')}</small></div><div><b class="mono">${t('lc.' + L.mode)}</b><small>${t('ar.mode')}</small></div><div><b class="mono ${cu >= 0.95 ? 'c-green' : ''}">${pct(cu)}</b><small>${t('ar.cur')}</small></div>`;
    const curve = (d) => { const p = []; for (let a = 0; a <= 1.0001; a += 0.01) p.push([a * 100, yd(a, d) * 100]); return p; };
    lineChart($('#cv-yd'), { x0: 0, x1: 100, y0: 0, y1: 105, xFmt: (x) => f0(x) + '%', yFmt: (y) => f0(y), title: t('ar.chart1'), series: [{ pts: curve(0.1), color: 'rgba(124,255,158,.5)', dash: [4, 3], label: t('ar.easy') }, { pts: curve(A.diff), color: '#5ab4ff', label: t('ar.yours') }], marks: [{ dot: [A.a * 100, perf * 100], color: '#ff6a7a' }, { x: ydPeak(A.diff) * 100, color: 'rgba(90,180,255,.4)' }] });
    const cp = []; for (let c = 0; c <= 1.0001; c += 0.01) cp.push([c * 100, curiosity(c) * 100]);
    lineChart($('#cv-cur'), { x0: 0, x1: 100, y0: 0, y1: 105, xFmt: (x) => f0(x) + '%', yFmt: (y) => f0(y), title: t('ar.chart2'), series: [{ pts: cp, color: '#ffd23a', label: t('ar.cur') }], marks: [{ dot: [A.conf * 100, cu * 100], color: '#ff6a7a' }] });
    const m = $('#ar-math'), s = 0.26 - 0.08 * A.diff;
    if (m) m.innerHTML = `<div>perf = exp(−(a − a*)²/2σ²), a* = 0.72 − 0.32·d = <b>${f2(ydPeak(A.diff))}</b>, σ = <b>${f2(s)}</b> → <b>${pct(perf)}</b></div>
      <div>LC ${t('ar.tonic')} ≈ <b>${f1(L.tonic)} Hz</b> · ${t('ar.phasic')} <b>${f2(L.phasic)}</b> · ${t('ar.pupil')} ≈ ${f1(L.pupil)} mm</div>
      <div>${t('ar.curL')} 4·P(1 − P) = 4 × ${f2(A.conf)} × ${f2(1 - A.conf)} = <b>${f2(cu)}</b> · ${t('ar.recall')} ≈ <b>${pct(recall(cu))}</b></div>`;
    if (ok) this.done('arousal');
    const g = $('#ar-goal'); if (g) g.innerHTML = `${badge(this.goal.arousal)} ${t('goal.arousal')}`;
  }

  // ═══ 5 · ATTRACTION ═══
  ttP() {
    const T = this.tt;
    return `<header class="lv-head mono">${t('tt.title')}</header><p class="intro">${t('tt.intro')}</p>
      <header class="lv-sub mono">${t('tt.sysH')}</header>${this.chips('sys', Object.keys(SYSTEMS), T.sys, (k) => t('sys.' + k))}<p class="small">${t('sysd.' + T.sys)}</p>
      <header class="lv-sub mono">${t('tt.bridgeH')}</header><p class="small">${t('tt.bridge')}</p>
      ${this.slider('t-n', t('tt.n'), T.n, 8, 100, 1, T.n)}<button class="btn primary wide" id="t-run">🌉 ${t('tt.run')}</button>`;
  }
  ttS() { return `<header class="lv-head mono">${t('tt.read')}</header><div class="bigstats" id="tt-big"></div><canvas class="cv chart" id="cv-pow"></canvas><div class="math mono" id="tt-math"></div><div class="goal" id="tt-goal"></div>`; }
  ttB() { this.bindChips('sys', (k) => { this.tt.sys = k; this.paint(); }); this.bindSliders(this.tt, [['t-n', 'n', (v) => v]]); $('#t-run').onclick = () => this.runStudy(); }
  runStudy(seed) {
    const T = this.tt; T.seed = seed ?? T.seed + 1; const r = study(T.n, rng(1000 + T.seed)); r.pow = power(0.5, 0.125, T.n); T.res = r; T.runs.push(r); if (T.runs.length > 12) T.runs.shift();
    this.app.feed.push(r.p < 0.05 ? 'tt.sig' : 'tt.ns', r.p < 0.05 ? 'ok' : 'warn', { p: f3(r.p) }); sfx.select();
    if (r.p < 0.05 && r.pow >= 0.8) this.done('attraction');
    this.refresh(true);
  }
  ttLive(full) {
    if (!full) return;
    const T = this.tt, r = T.res, pw = power(0.5, 0.125, T.n), p0 = fisher(...BRIDGE.high, ...BRIDGE.low);
    const b = $('#tt-big'); if (b) b.innerHTML = r ? `<div><b class="mono c-green">${r.a}/${r.n}</b><small>${t('tt.high')}</small></div><div><b class="mono">${r.b}/${r.n}</b><small>${t('tt.low')}</small></div><div><b class="mono ${r.p < 0.05 ? 'c-green' : 'c-red'}">p = ${r.p < 0.001 ? '<0.001' : f3(r.p)}</b><small>${t('tt.p')}</small></div>`
      : `<div><b class="mono">9/18</b><small>${t('tt.high')} (1974)</small></div><div><b class="mono">2/16</b><small>${t('tt.low')} (1974)</small></div><div><b class="mono">p = ${f3(p0)}</b><small>${t('tt.p')}</small></div>`;
    const pts = []; for (let n = 8; n <= 100; n++) pts.push([n, power(0.5, 0.125, n) * 100]);
    lineChart($('#cv-pow'), { x0: 8, x1: 100, y0: 0, y1: 100, xFmt: (x) => f0(x), yFmt: (y) => f0(y) + '%', title: t('tt.chart'), series: [{ pts, color: '#ff7ad9', label: t('tt.power') }], marks: [{ y: 80, color: 'rgba(255,255,255,.35)', label: '80 %' }, { dot: [T.n, pw * 100], color: '#ffd23a' }, { x: 17, color: 'rgba(255,255,255,.25)', label: '1974' }] });
    const m = $('#tt-math');
    if (m) m.innerHTML = `<div>${t('tt.orig')} 9/18 = 50 % vs 2/16 = 12.5 % · Fisher ${t('tt.exact')} p = <b>${f3(p0)}</b></div>
      <div>${t('tt.powL')} 1 − β = Φ((|p₁ − p₂| − 1.645·SE₀)/SE₁) at n = ${T.n}: <b>${pct(pw)}</b></div>
      ${r ? `<div>${t('tt.yours')} ${r.a}/${r.n} = ${pct(r.a / r.n)} vs ${r.b}/${r.n} = ${pct(r.b / r.n)} → p = <b>${r.p < 0.001 ? '<0.001' : f3(r.p)}</b> · ${t('tt.runsN')} ${T.runs.filter((q) => q.p < 0.05).length}/${T.runs.length} ${t('tt.sigN')}</div>` : ''}
      <div>${t('tt.caveat')}</div>`;
    const g = $('#tt-goal'); if (g) g.innerHTML = `${badge(this.goal.attraction)} ${t('goal.attraction')}`;
  }

  // ═══ 6 · SUGGESTION ═══
  sgP() {
    const G = this.sg;
    return `<header class="lv-head mono">${t('sg.title')}</header><p class="intro">${t('sg.intro')}</p>
      <header class="lv-sub mono">${t('sg.stateH')}</header>${this.slider('s-depth', t('sg.depth'), G.depth, 0, 1, 0.01, f0(G.depth * 100) + ' %')}${this.slider('s-load', t('sg.load'), G.load, 0, 0.9, 0.01, f0(G.load * 100) + ' %')}${this.slider('s-fat', t('sg.fatigue'), G.fatigue, 0, 1, 0.01, f0(G.fatigue * 100) + ' %')}
      <header class="lv-sub mono">${t('sg.trait')}</header>${this.chips('hyp', ['low', 'medium', 'high'], G.h, (k) => t('h.' + k))}
      <header class="lv-sub mono">${t('sg.msgH')}</header>${this.slider('s-reps', t('sg.reps'), G.reps, 1, 20, 1, '×' + G.reps)}
      <div class="chips">${this.toggle('s-trust', G.trust, t('sg.trust'))}${this.toggle('s-prompt', G.prompt, t('sg.prompt'))}</div>
      <p class="small">${t('sg.note')}</p>`;
  }
  sgS() { return `<header class="lv-head mono">${t('sg.read')}</header><div class="bigstats" id="sg-big"></div><canvas class="cv chart" id="cv-eeg"></canvas><div class="math mono" id="sg-math"></div><div class="facts">${t('sg.facts')}</div><div class="goal" id="sg-goal"></div>`; }
  sgB() {
    const G = this.sg; this.bindSliders(G, [['s-depth', 'depth', (v) => f0(v * 100) + ' %'], ['s-load', 'load', (v) => f0(v * 100) + ' %'], ['s-fat', 'fatigue', (v) => f0(v * 100) + ' %'], ['s-reps', 'reps', (v) => '×' + v]], () => this.paint());
    this.bindChips('hyp', (k) => { G.h = k; this.paint(); }); $('#s-trust').onclick = () => { G.trust = !G.trust; sfx.select(); this.render(); }; $('#s-prompt').onclick = () => { G.prompt = !G.prompt; sfx.select(); this.render(); };
  }
  sgCalc() { const G = this.sg; return filter({ ...G, trust: G.trust ? 1 : 0 }); }
  sgLive(full) {
    if (!full) return;
    const G = this.sg, R = this.sgCalc(), f = eegFreq(G.depth * (0.4 + 0.6 * HYP.h[G.h])), bd = band(f);
    if (R.P >= 0.5 && !G.sawWorst) { G.sawWorst = true; this.app.feed.push('sg.open', 'warn'); }
    if (G.sawWorst && R.P <= 0.1 && G.reps >= 8) this.done('suggestion');
    const b = $('#sg-big'); if (b) b.innerHTML = `<div><b class="mono ${R.P <= 0.1 ? 'c-green' : R.P >= 0.4 ? 'c-red' : 'c-amber'}">${pct(R.P)}</b><small>${t('sg.P')}</small></div><div><b class="mono">${f2(R.S)}</b><small>${t('sg.S')}</small></div><div><b class="mono">${f1(f)} Hz</b><small>${t('band.' + bd)}</small></div>`;
    const pts = [], r = rng(3); for (let i = 0; i <= 400; i++) { const x = i / 400; pts.push([x * 1000, Math.sin(2 * Math.PI * f * x) * 0.8 + 0.35 * Math.sin(2 * Math.PI * f * 1.9 * x + 1) + (r() - 0.5) * 0.35]); }
    lineChart($('#cv-eeg'), { x0: 0, x1: 1000, y0: -1.8, y1: 1.8, xFmt: (x) => f0(x) + ' ms', yFmt: () => '', title: t('sg.chart', { b: t('band.' + bd), f: f1(f) }), series: [{ pts, color: bd === 'beta' ? '#5ab4ff' : bd === 'alpha' ? '#7cff9e' : '#c79bff', width: 1.3 }] });
    const m = $('#sg-math');
    if (m) m.innerHTML = `<div>S = (1 − ${f2(G.load)})·(1 − 0.5·${f2(G.fatigue)})·(1 − 0.6·${f2(G.depth)}·${HYP.h[G.h]})·${f2(R.motive)} = <b>${f2(R.S)}</b></div>
      <div>z = −1.2 + 0.45·ln(1 + ${G.reps}) + 0.8·${G.trust ? 1 : 0} − 2.5·S = <b>${f2(R.z)}</b> → P = 1/(1 + e<sup>−z</sup>) = <b>${pct(R.P)}</b></div>
      <div>${t('sg.hyp')} ${HGSHS.slice(9).reduce((a, b) => a + b, 0)}/${HGSHS.reduce((a, b) => a + b, 0)} ≈ <b>${f0((HGSHS.slice(9).reduce((a, b) => a + b, 0) / HGSHS.reduce((a, b) => a + b, 0)) * 100)} %</b> ${t('sg.hypHigh')}</div>`;
    const g = $('#sg-goal'); if (g) g.innerHTML = `${badge(this.goal.suggestion)} ${t('goal.suggestion')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.9, Math.min(1.1, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp(e) {
    const v = this.view, d = v.drag; v.drag = null;
    if (!d || !e || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5 || this.tab !== 'atlas') return;
    const r = $('#scene').getBoundingClientRect(), ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const glass = this.glassy(), hits = this.ray.intersectObjects(this.B.pick, false).filter((h) => !(glass && h.object.userData.cortex));
    if (hits.length) { const id = regionOfHit(hits[0]); this.answer(id); }
  }
  wheel(e) { this.view.r = Math.max(0.45, Math.min(2.2, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === 'g' && this.tab === 'atlas') { this.at.glass = !this.at.glass; this.paint(); this.render(); } if (k === ' ' && this.tab === 'dopamine') this.trial(); if (k === ' ' && this.tab === 'attraction') this.runStudy(); }
  keyUp() {}

  // ── Frame ──
  flowLevels() {
    const tab = this.tab, z = { mesolimbic: 0, mesocortical: 0, nigrostriatal: 0, noradrenergic: 0 };
    if (tab === 'atlas') { const s = this.at.sel; if (['vta', 'nacc'].includes(s)) z.mesolimbic = 1; if (['vta', 'dlpfc', 'ofc', 'frontal'].includes(s)) z.mesocortical = s === 'vta' ? 1 : 0.6; if (['sn', 'caudate', 'putamen'].includes(s)) z.nigrostriatal = 1; if (s === 'lc') z.noradrenergic = 1; }
    if (tab === 'dopamine') { const A = this.da.anim, d = A ? A.d[Math.min(TD.T - 1, Math.floor((A.t / 1.2) * TD.T))] : 0; z.mesolimbic = Math.max(0.12, Math.min(1.5, 0.3 + 1.6 * d)); z.mesocortical = z.mesolimbic * 0.6; z.nigrostriatal = 0.2; }
    if (tab === 'motivation') { z.mesolimbic = Math.min(1.4, 0.2 + this.mo.DA * motivate(this.mo).P * 1.2); z.mesocortical = this.mo.DA * 0.5; }
    if (tab === 'arousal') { const L = lc(this.ar.a); z.noradrenergic = 0.1 + this.ar.a * 1.2; z.mesocortical = 0.15 + 0.5 * curiosity(this.ar.conf); z.phasic = L.phasic; }
    if (tab === 'attraction') { const s = this.tt.sys; z.mesolimbic = s === 'attraction' ? 1.2 : s === 'attachment' ? 0.5 : 0.25; z.noradrenergic = s === 'attraction' ? 0.6 : 0.15; z.nigrostriatal = s === 'attraction' ? 0.5 : 0; }
    if (tab === 'suggestion') { z.noradrenergic = 0.6 * (1 - this.sg.depth) + 0.1; }
    return z;
  }
  update(dt, time) {
    this.time = time; const v = this.view, B = this.B, tab = this.tab;
    if (tab === 'dopamine') this.daTick(dt);
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.08;
    // Pathway particles.
    const lv = this.flowLevels();
    for (const [k, F] of Object.entries(B.flow)) {
      const target = lv[k] || 0; F.level += (target - F.level) * Math.min(1, dt * 4);
      const P = F.pts.geometry.attributes.position, sp = 0.4 + F.level * 0.8, tmp = V(0, 0, 0);
      F.seeds.forEach((s, i) => { s.t = (s.t + dt * s.v * sp * 0.6) % 1; F.curves[s.c].getPointAt(s.t, tmp); P.setXYZ(i, tmp.x, tmp.y, tmp.z); });
      P.needsUpdate = true; F.pts.material.opacity = Math.min(1, F.level); F.pts.material.size = 0.05 + 0.05 * Math.min(1.5, F.level); F.line.material.opacity = Math.min(0.5, F.level * 0.3);
      if (k === 'noradrenergic' && lv.phasic !== undefined) F.pts.material.opacity = Math.min(1, F.level * (0.6 + 0.8 * lv.phasic * (0.5 + 0.5 * Math.sin(time * 6))));
    }
    for (const s of Object.values(B.markers)) s.material.opacity = Math.min(1, (s.userData.k || 0) * (0.7 + 0.3 * Math.sin(time * 3)));
    // Hypnosis network links.
    const sgOn = tab === 'suggestion', d = this.sg.depth * HYP.h[this.sg.h];
    B.links.dlpfcInsula.material.opacity = sgOn ? 0.15 + 0.6 * d : 0; B.links.dlpfcPcc.material.opacity = sgOn ? 0.6 * (1 - d) + 0.05 : 0;
    // Claims flying in (suggestion room): accepted ones enter and turn pink, rejected ones bounce off.
    const P = sgOn ? this.sgCalc().P : 0;
    for (const k of this.tokens) {
      if (!sgOn) { k.s.material.opacity = 0; continue; }
      k.t += dt * 0.35;
      if (k.t > 1) { k.t = 0; k.dir.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize(); k.acc = Math.random() < P; }
      const r = k.t < 0.6 ? 6 - (k.t / 0.6) * (k.acc ? 5.2 : 3.6) : k.acc ? 0.8 * (1 - (k.t - 0.6) / 0.4) : 2.4 + ((k.t - 0.6) / 0.4) * 4;
      k.s.position.copy(k.dir).multiplyScalar(r); k.s.material.color.set(k.t > 0.55 ? (k.acc ? '#ff5aa8' : '#9fe8ff') : '#ffffff'); k.s.material.opacity = Math.sin(Math.PI * k.t) * 0.9; k.s.scale.setScalar(k.t > 0.55 && !k.acc ? 0.45 : 0.32);
    }
    B.dust.rotation.y += dt * 0.01;
    // Camera orbit.
    const look = V(0, -0.1, 0), R = 7.6 * v.r, cp = V(Math.sin(v.yaw) * Math.cos(v.pitch) * R, Math.sin(v.pitch) * R + 0.3, Math.cos(v.yaw) * Math.cos(v.pitch) * R);
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 5)); this.snap = false; this.cam.lookAt(look);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 3 === 0); }
  }
  refresh(full) {
    if (!this.entered) return;
    const P = { atlas: 'at', dopamine: 'da', motivation: 'mo', arousal: 'ar', attraction: 'tt', suggestion: 'sg' }[this.tab];
    this[P + 'Live'](full);
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
void CORTEX_IDS; void S;
