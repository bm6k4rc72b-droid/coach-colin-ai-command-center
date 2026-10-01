import * as THREE from 'three';
import { SNPS, PANELS, BY_ID, panelSnps, genoLabel, hwe, favCount, popDist, score, percentile, pOptimal, genoFreq, distStats, punnett, childDist, offspring, rng, PRESETS } from './sim/genes.js';
import { HER, CAL, predict, cohort, phi, timeFactor } from './sim/train.js';
import { buildWorld } from './view/world.js';
import { updateHelix } from './view/helix.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// GENOME ATHLETE · the app: your gene panel, inheritance, trainability, and the plan.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => Math.round(x).toLocaleString('en-US'), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);
const pct = (x) => (x >= 99.95 ? '>99.9' : x < 0.05 ? '<0.1' : f1(x));
const oneIn = (p) => (p > 0.5 ? f1(1 / p) : f0(1 / p));
const PCOL = { endurance: '#3dffb4', power: '#ff5c8a', injury: '#ffd166' };
const ALC = ['#3dffb4', '#ff5c8a'];

export class GenomeApp {
  constructor(app) {
    this.app = app;
    this.r = rng(20261001);
    this.cohort = cohort(2200, rng(42));
    this.W = buildWorld(this.cohort); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 400); this.scene.add(this.cam);
    this.geno = PRESETS.average(); this.preset = 'average';
    this.partner = PRESETS.random(rng(7)); this.partnerName = 'random';
    this.sel = 'actn3'; this.seen = new Set(['actn3']); this.panelView = 'endurance';
    this.inh = { gene: 'actn3', panel: 'power', mid: 52, h2: 0.5 };
    this.tr = { k: 13, vo2: 42, mass: 70, weeks: 20, sessions: 3 };
    this.view = { yaw: 0.6, pitch: 0.1, r: 11, drag: null, last: 0, y: 0 };
    this.score = { geno: false, preset: false, explore: false, punnett: false, breeder: false, train: false, responder: false, plan: false };
    this.tab = 'genome'; this.entered = false; this.uiT = 0;
    app.stage.use(this.scene, this.cam);
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab === 'plan') this.score.plan = true;
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { genome: ['gePanel', 'geSide', 'bindGe'], inherit: ['inPanel', 'inSide', 'bindIn'], train: ['trPanel', 'trSide', 'bindTr'], plan: ['plPanel', 'plSide', 'bindPl'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh();
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  tags(s) { return PANELS.filter((p) => s.role[p]).map((p) => `<i class="ptag" style="--c:${PCOL[p]}" title="${t('p.' + p)}">${t('p.' + p)[0]}</i>`).join(''); }
  panelScores(geno) { return Object.fromEntries(PANELS.map((p) => { const sc = score(geno, p), d = popDist(p); return [p, { ...sc, pct: percentile(d, sc.sum), dist: d }]; })); }

  // ═══ GENOME ════════════════════════════════════════
  gePanel() {
    return `<header class="lv-head mono">${t('g.title')}</header><p class="intro">${t('g.intro')}</p>
      ${this.chips('pre', ['average', 'sprinter', 'marathoner', 'random'], this.preset, (k) => t('pre.' + k))}
      <div class="snps">${SNPS.map((s) => { const p = hwe(s.q); return `<div class="snp ${s.id === this.sel ? 'sel' : ''}" data-pick="${s.id}"><div class="snp-h"><b>${s.gene}</b><small class="mono">${s.rs} · ${s.name}</small><span class="ptags">${this.tags(s)}</span></div>
        <div class="gts">${[0, 1, 2].map((g) => `<button class="gt ${this.geno[s.id] === g ? 'on' : ''}" data-snp="${s.id}" data-g="${g}"><b class="mono">${genoLabel(s, g)}</b><em class="mono">${f1(p[g] * 100)}%</em></button>`).join('')}</div></div>`; }).join('')}</div>`;
  }
  geSide() {
    return `<header class="lv-head mono">${t('g.read')}</header><div class="gcard" id="g-card"></div>
      <div class="bigstats" id="g-big"></div>
      ${this.chips('pv', PANELS, this.panelView, (k) => t('p.' + k))}<canvas class="cv chart" id="cv-pop"></canvas><div class="math mono" id="g-math"></div>`;
  }
  bindGe() {
    document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => { this.applyPreset(b.dataset.pre); }));
    document.querySelectorAll('.gt').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); this.geno[b.dataset.snp] = +b.dataset.g; this.preset = null; this.score.geno = true; this.pick(b.dataset.snp, false); sfx.select(); this.render(); }));
    document.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { this.pick(b.dataset.pick); this.render(); }));
    document.querySelectorAll('[data-pv]').forEach((b) => (b.onclick = () => { this.panelView = b.dataset.pv; sfx.select(); this.render(); }));
  }
  applyPreset(k) { this.geno = PRESETS[k](this.r); this.preset = k; this.score.preset = true; this.score.geno = true; sfx.confirm(); this.app.feed.push('pre.fed', 'ok', { n: t('pre.' + k) }); this.render(); }
  pick(id, sound = true) { this.sel = id; this.seen.add(id); if (this.seen.size >= 4) this.score.explore = true; if (sound) sfx.select(); }
  geLive() {
    const s = BY_ID[this.sel], g = this.geno[s.id], p = hwe(s.q), S = this.panelScores(this.geno);
    const card = $('#g-card');
    if (card) card.innerHTML = `<div class="gc-h"><b>${s.gene}</b> <span class="mono">${s.rs} · ${s.name} · chr ${s.chr}</span></div><p>${t('gene.' + s.id)}</p>
      <div class="gc-you"><span>${t('g.you')}</span><b class="mono">${genoLabel(s, g)}</b><em>${t('g.share', { p: f1(p[g] * 100) })}</em></div>
      <div class="gc-roles">${PANELS.filter((pp) => s.role[pp]).map((pp) => `<span style="--c:${PCOL[pp]}">${t('p.' + pp)}: <b>${s.role[pp] === 'a' ? s.a : s.b}</b> · ${t('g.youHave')} ${favCount(s, pp, g)}/2</span>`).join('')}</div>
      <div class="afbar"><i style="flex:${1 - s.q};background:${ALC[0]}">${s.a} ${f0((1 - s.q) * 100)}%</i><i style="flex:${s.q};background:${ALC[1]}">${s.b} ${f0(s.q * 100)}%</i></div>`;
    const big = $('#g-big');
    if (big) big.innerHTML = PANELS.map((pp) => `<div style="--c:${PCOL[pp]}"><b class="mono">${f0(S[pp].tgs)}</b><small>${t('p.' + pp)} TGS</small><em class="mono">${t('g.pct', { p: pct(S[pp].pct) })}</em></div>`).join('');
    const P = this.panelView, D = S[P].dist, st = distStats(D);
    barChart($('#cv-pop'), { bars: D.map((y, i) => ({ x: (100 * i) / (D.length - 1), y: y * 100, color: i === S[P].sum ? '#ffd166' : PCOL[P] + '99', glow: i === S[P].sum })), x0: -4, x1: 104, y1: Math.ceil(Math.max(...D) * 100 / 5) * 5, w: 100 / (D.length - 1) * 0.8, xTicks: [0, 25, 50, 75, 100], yFmt: (v) => f0(v) + '%', title: t('g.popChart', { p: t('p.' + P) }), marks: [{ x: S[P].tgs, color: '#ffd166', label: t('g.youMark') }] });
    const m = $('#g-math');
    if (m) m.innerHTML = `<div>TGS = 100·Σ s<sub>i</sub> / (2n) = 100·${S[P].sum}/${S[P].max} = <b>${f1(S[P].tgs)}</b> · n = ${panelSnps(P).length}</div>
      <div>HWE (${s.gene}): p² : 2pq : q² = <b>${f1(p[0] * 100)} : ${f1(p[1] * 100)} : ${f1(p[2] * 100)} %</b> (q<sub>${s.b}</sub> = ${s.q})</div>
      <div>${t('g.popMean')} <b>${f1((100 * st.mean) / (D.length - 1))}</b> ± ${f1((100 * st.sd) / (D.length - 1))} · ${t('g.pctile')} <b>${pct(S[P].pct)}</b></div>
      <div>P(${t('g.optimal')}) = Π f<sub>i</sub>² = <b>1 in ${oneIn(pOptimal(P))}</b></div>
      <div>${t('g.whole', { n: SNPS.length })} <b>1 in ${oneIn(genoFreq(this.geno))}</b></div>`;
  }

  // ═══ INHERITANCE ═══════════════════════════════════
  inPanel() {
    const s = BY_ID[this.inh.gene], P = punnett(s, this.geno[s.id], this.partner[s.id]);
    return `<header class="lv-head mono">${t('i.title')}</header><p class="intro">${t('i.intro')}</p>
      <header class="lv-sub mono">${t('i.partner')}</header>${this.chips('pp', ['average', 'sprinter', 'marathoner', 'random', 'you'], this.partnerName, (k) => t(k === 'you' ? 'i.clone' : 'pre.' + k))}
      <label class="selw"><span>${t('i.gene')}</span><select id="i-gene">${SNPS.map((x) => `<option value="${x.id}" ${x.id === this.inh.gene ? 'selected' : ''}>${x.gene} · ${x.name}</option>`).join('')}</select></label>
      <div class="punnett"><div class="pn-c mono"></div>${P.cols.map((c) => `<div class="pn-h mono b">${c}</div>`).join('')}
        ${P.rows.map((rw, i) => `<div class="pn-h mono a">${rw}</div>${P.cells[i].map((c) => `<div class="pn-cell g${c.g}"><b class="mono">${c.label}</b><small>25%</small></div>`).join('')}`).join('')}</div>
      <div class="pn-sum mono">${[0, 1, 2].map((g) => `<span class="g${g}">${genoLabel(s, g)} <b>${f0(P.dist[g] * 100)}%</b></span>`).join('')}</div>
      <p class="small">${t('i.punnettNote', { a: genoLabel(s, this.geno[s.id]), b: genoLabel(s, this.partner[s.id]) })}</p>`;
  }
  inSide() {
    const I = this.inh;
    return `<header class="lv-head mono">${t('i.child')}</header>${this.chips('ip', PANELS, I.panel, (k) => t('p.' + k))}
      <canvas class="cv chart" id="cv-child"></canvas><div class="bigstats" id="i-big"></div>
      <header class="lv-sub mono">${t('i.breeder')}</header>
      ${this.slider('i-mid', t('i.mid'), I.mid, 28, 80, 1, I.mid + ' mL/kg/min')}${this.slider('i-h2', t('i.h2'), I.h2, 0, 1, 0.01, f2(I.h2))}
      <canvas class="cv chart" id="cv-breed"></canvas><div class="math mono" id="i-math"></div>`;
  }
  bindIn() {
    document.querySelectorAll('[data-pp]').forEach((b) => (b.onclick = () => { const k = b.dataset.pp; this.partner = k === 'you' ? { ...this.geno } : PRESETS[k](this.r); this.partnerName = k; this.score.punnett = true; sfx.select(); this.render(); }));
    $('#i-gene').onchange = (e) => { this.inh.gene = e.target.value; this.sel = e.target.value; this.score.punnett = true; sfx.select(); this.render(); };
    document.querySelectorAll('[data-ip]').forEach((b) => (b.onclick = () => { this.inh.panel = b.dataset.ip; sfx.select(); this.render(); }));
    $('#i-mid').oninput = (e) => { this.inh.mid = +e.target.value; $('#i-mid-v').textContent = this.inh.mid + ' mL/kg/min'; this.score.breeder = true; this.refresh(); };
    $('#i-h2').oninput = (e) => { this.inh.h2 = +e.target.value; $('#i-h2-v').textContent = f2(this.inh.h2); this.score.breeder = true; this.refresh(); };
  }
  inLive() {
    const I = this.inh, P = I.panel, D = childDist(this.geno, this.partner, P), n2 = D.length - 1, sA = score(this.geno, P).sum, sB = score(this.partner, P).sum, st = distStats(D);
    const above = D.reduce((a, p, i) => a + (i > Math.max(sA, sB) ? p : 0), 0), between = D.reduce((a, p, i) => a + (i >= Math.min(sA, sB) && i <= Math.max(sA, sB) ? p : 0), 0);
    barChart($('#cv-child'), { bars: D.map((y, i) => ({ x: (100 * i) / n2, y: y * 100, color: PCOL[P] + 'cc' })), x0: -4, x1: 104, y1: Math.max(10, Math.ceil(Math.max(...D) * 100 / 10) * 10), w: (100 / n2) * 0.8, xTicks: [0, 25, 50, 75, 100], yFmt: (v) => f0(v) + '%', title: t('i.childChart', { p: t('p.' + P) }), marks: [{ x: (100 * sA) / n2, color: '#4aa8ff', label: 'A' }, { x: (100 * sB) / n2, color: '#ff5c8a', label: 'B' }] });
    const big = $('#i-big');
    if (big) big.innerHTML = `<div><b class="mono">${f1((100 * st.mean) / n2)}</b><small>${t('i.expected')}</small></div><div><b class="mono">${f1(between * 100)}%</b><small>${t('i.between')}</small></div><div><b class="mono">${f1(above * 100)}%</b><small>${t('i.above')}</small></div>`;
    const mu = 40, sd = 7, o = offspring(I.mid, mu, sd, I.h2), pdf = (m, s) => { const pts = []; for (let x = 15; x <= 85; x += 0.5) pts.push([x, phi((x - m) / s) / s]); return pts; };
    lineChart($('#cv-breed'), { x0: 15, x1: 85, y0: 0, y1: 0.09, xFmt: (x) => x, yFmt: () => '', title: t('i.breedChart'), series: [{ pts: pdf(mu, sd), color: 'rgba(160,180,220,.6)', label: t('i.pop'), fill: 'rgba(160,180,220,.08)' }, { pts: pdf(o.mean, o.sd), color: '#ffd166', label: t('i.kids'), fill: 'rgba(255,209,102,.12)' }], marks: [{ x: I.mid, color: '#3dffb4', label: t('i.midMark') }] });
    const m = $('#i-math');
    if (m) m.innerHTML = `<div>P(${t('i.childGets')} b) = g<sub>A</sub>/2 · g<sub>B</sub>/2 … ${t('i.conv')}</div>
      <div>E[${t('i.kid')}] = μ + h²(m − μ) = 40 + ${f2(I.h2)}·(${I.mid} − 40) = <b>${f1(o.mean)}</b></div>
      <div>SD = σ√(1 − h⁴/2) = 7·√(1 − ${f2(I.h2 ** 2)}/2) = <b>${f2(o.sd)}</b></div>
      <div class="small">${t('i.regress')}</div>`;
  }

  // ═══ TRAINABILITY ══════════════════════════════════
  trPanel() {
    const T = this.tr;
    return `<header class="lv-head mono">${t('t.title')}</header><p class="intro">${t('t.intro')}</p>
      ${this.slider('t-k', t('t.k'), T.k, 0, 30, 1, T.k + ' / 42')}
      <div class="chips"><button class="btn seg" data-tk="6">${t('t.low')}</button><button class="btn seg" data-tk="13">${t('t.typ')}</button><button class="btn seg" data-tk="21">${t('t.high')}</button><button class="btn seg" data-tk="rnd">${t('pre.random')}</button></div>
      ${this.slider('t-vo2', t('t.vo2'), T.vo2, 25, 80, 1, T.vo2 + ' mL/kg/min')}${this.slider('t-mass', t('t.mass'), T.mass, 40, 120, 1, T.mass + ' kg')}
      ${this.slider('t-weeks', t('t.weeks'), T.weeks, 1, 40, 1, T.weeks)}${this.slider('t-ses', t('t.ses'), T.sessions, 1, 6, 1, T.sessions)}
      <p class="small">${t('t.doseNote')}</p>`;
  }
  trSide() { return `<header class="lv-head mono">${t('t.read')}</header><div class="bigstats" id="t-big"></div><canvas class="cv chart" id="cv-resp"></canvas><canvas class="cv chart" id="cv-time"></canvas><div class="math mono" id="t-math"></div>`; }
  bindTr() {
    const T = this.tr, U = { k: ' / 42', vo2: ' mL/kg/min', mass: ' kg', weeks: '', sessions: '' };
    for (const [id, key] of [['t-k', 'k'], ['t-vo2', 'vo2'], ['t-mass', 'mass'], ['t-weeks', 'weeks'], ['t-ses', 'sessions']]) $('#' + id).oninput = (e) => { T[key] = +e.target.value; $('#' + id + '-v').textContent = T[key] + U[key]; this.score.train = true; if (key === 'k' && (T.k <= 9 || T.k >= 19)) this.score.responder = true; this.refresh(); };
    document.querySelectorAll('[data-tk]').forEach((b) => (b.onclick = () => { const v = b.dataset.tk; T.k = v === 'rnd' ? this.cohort[Math.floor(this.r() * this.cohort.length)].k : +v; this.score.train = true; if (T.k <= 9 || T.k >= 19) this.score.responder = true; sfx.select(); this.render(); }));
  }
  trLive() {
    const T = this.tr, P = predict(T);
    const big = $('#t-big');
    if (big) big.innerHTML = `<div><b class="mono">+${f0(P.mean)}</b><small>${t('t.gain')} ± ${f0(P.sd)}</small></div><div><b class="mono">+${f1(P.pct)}%</b><small>${t('t.rel', { r: f1(P.rel) })}</small></div><div><b class="mono">${f0(P.pLow * 100)}% / ${f0(P.pHigh * 100)}%</b><small>${t('t.lowHigh')}</small></div>`;
    const pdf = (m, s) => { const pts = []; for (let x = -400; x <= 1400; x += 10) pts.push([x, 1000 * phi((x - m) / s) / s]); return pts; };
    lineChart($('#cv-resp'), { x0: -400, x1: 1400, y0: 0, y1: 3.2, xFmt: (x) => (x > 0 ? '+' : '') + x, yFmt: () => '', title: t('t.respChart'), series: [{ pts: pdf(P.pop, P.popSd), color: 'rgba(160,180,220,.6)', label: t('t.popL'), fill: 'rgba(160,180,220,.08)' }, { pts: pdf(P.mean, P.sd), color: '#3dffb4', label: t('t.youL'), fill: 'rgba(61,255,180,.12)' }], marks: [{ x: 100 * P.f, color: '#8b5cff', label: t('t.lowL') }, { x: 600 * P.f, color: '#ffd166', label: t('t.highL') }] });
    const base = HER.mu + CAL.beta * (T.k - CAL.meanK), sf = P.f / timeFactor(T.weeks), mean = [], hi = [], lo = [];
    for (let w = 0; w <= 40; w += 0.5) { const f = timeFactor(w) * sf; mean.push([w, base * f]); hi.push([w, (base + CAL.sdE) * f]); lo.push([w, (base - CAL.sdE) * f]); }
    lineChart($('#cv-time'), { x0: 0, x1: 40, y0: -200, y1: 1100, xFmt: (x) => x + ' wk', yFmt: (y) => f0(y), title: t('t.timeChart'), series: [{ pts: hi, color: 'rgba(61,255,180,.35)', width: 1, dash: [3, 3] }, { pts: lo, color: 'rgba(61,255,180,.35)', width: 1, dash: [3, 3] }, { pts: mean, color: '#3dffb4', label: t('t.youL') }], marks: [{ x: T.weeks, color: '#ffd166' }, { y: 0, color: 'rgba(232,238,252,.3)' }] });
    const m = $('#t-math');
    if (m) m.innerHTML = `<div>Δ = μ + β(k − E[k]) + ε · μ = ${HER.mu} · β = <b>${f1(CAL.beta)}</b> mL/min/allele</div>
      <div>k ~ Bin(42, p = ${CAL.p.toFixed(3)}) · E[k] = ${f2(CAL.meanK)} · SD = ${f2(CAL.sdK)} · ${t('t.kpct', { p: pct(P.kPct) })}</div>
      <div>${t('t.check')} E[Δ|k≤9] = <b>${f0(CAL.fitLo)}</b> · E[Δ|k≥19] = <b>${f0(CAL.fitHi)}</b> (HERITAGE 221 / 604)</div>
      <div>R² = β²Var(k)/σ² = <b>${f2(CAL.r2)}</b> · σ<sub>ε</sub> = √(202² − β²Var k) = <b>${f0(CAL.sdE)}</b> mL/min</div>
      <div>Δ(w) ∝ (1 − e<sup>−w/τ</sup>)/(1 − e<sup>−20/τ</sup>), τ = ${HER.tau} wk · ×√(s/3) = <b>${f2(P.f)}</b></div>
      <div>${t('t.abs')} ${f2(P.abs)} L/min → +${f1(P.pct)}% · h²<sub>response</sub> ≈ ${HER.h2}</div>`;
    const C = this.W.cloud.userData, d = HER.mu + CAL.beta * (T.k - CAL.meanK);
    C.you.position.set(C.XK(T.k), C.YD(d), 0.2);
    C.youLine.position.set(C.XK(T.k), C.YD(-300), 0.2); C.youLine.scale.y = C.YD(d) - C.YD(-300);
    C.band.position.set(C.XK(T.k), C.YD(d), 0.15); C.band.scale.set(0.34, (2 * CAL.sdE) / 110, 1);
  }

  // ═══ PLAN ══════════════════════════════════════════
  profile() { const S = this.panelScores(this.geno), P = predict(this.tr); return { E: S.endurance.pct, Pw: S.power.pct, I: S.injury.pct, T: P.kPct }; }
  plan() {
    const p = this.profile(), lean = p.E - p.Pw > 15 ? 'endurance' : p.Pw - p.E > 15 ? 'power' : 'balanced', out = [];
    const W = { endurance: ['s.long', 's.thresh', 's.vo2', 's.easy', 's.strength'], power: ['s.max', 's.sprint', 's.plyo', 's.strength2', 's.aerobic'], balanced: ['s.strength', 's.vo2', 's.sprint', 's.long', 's.easy'] }[lean];
    for (const k of W) out.push(p.I < 35 && k === 's.plyo' ? 's.lowimpact' : k);
    if (p.I < 35) out.push('s.tendon');
    out.push(p.T < 30 ? 's.lowresp' : 's.retest');
    return { lean, out, p };
  }
  plPanel() {
    const P = this.plan();
    return `<header class="lv-head mono">${t('pl.title')}</header><p class="intro">${t('pl.intro')}</p>
      <div class="meters">${[['E', 'endurance'], ['Pw', 'power'], ['I', 'injury']].map(([k, p]) => `<div class="mt" style="--c:${PCOL[p]}"><span>${t('p.' + p)}</span><i><b style="width:${P.p[k]}%"></b></i><em class="mono">${f0(P.p[k])}</em></div>`).join('')}<div class="mt" style="--c:#4aa8ff"><span>${t('pl.train')}</span><i><b style="width:${P.p.T}%"></b></i><em class="mono">${f0(P.p.T)}</em></div></div>
      <div class="lean mono">${t('pl.lean')}: <b>${t('pl.' + P.lean)}</b></div>
      <ol class="week">${P.out.map((k) => `<li>${t(k)}</li>`).join('')}</ol>`;
  }
  plSide() { return `<header class="lv-head mono">${t('pl.radar')}</header><canvas class="cv radar" id="cv-radar"></canvas><header class="lv-sub mono">${t('pl.cant')}</header><ul class="cant">${['c1', 'c2', 'c3', 'c4'].map((k) => `<li>${t('pl.' + k)}</li>`).join('')}</ul><div class="ethics">${t('pl.ethics')}</div>`; }
  bindPl() {}
  plLive() {
    const cv = $('#cv-radar'); if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 30, p = this.profile();
    const ax = [[t('p.endurance'), p.E, PCOL.endurance], [t('p.power'), p.Pw, PCOL.power], [t('p.injury'), p.I, PCOL.injury], [t('pl.train'), p.T, '#4aa8ff']];
    g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(141,151,179,.25)'; g.font = '10px "JetBrains Mono", monospace';
    for (const k of [25, 50, 75, 100]) { g.beginPath(); ax.forEach((_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 4, x = cx + Math.cos(a) * R * k / 100, y = cy + Math.sin(a) * R * k / 100; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); }
    g.beginPath(); ax.forEach(([, v], i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 4, x = cx + Math.cos(a) * R * v / 100, y = cy + Math.sin(a) * R * v / 100; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
    g.fillStyle = 'rgba(61,255,180,.18)'; g.fill(); g.strokeStyle = '#3dffb4'; g.lineWidth = 2; g.shadowColor = '#3dffb4'; g.shadowBlur = 12; g.stroke(); g.shadowBlur = 0; g.lineWidth = 1;
    ax.forEach(([lab, v, c], i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 4, x = cx + Math.cos(a) * (R + 16), y = cy + Math.sin(a) * (R + 12); g.fillStyle = c; g.textAlign = Math.abs(Math.cos(a)) < 0.1 ? 'center' : Math.cos(a) > 0 ? 'right' : 'left'; g.fillText(`${lab} ${Math.round(v)}`, Math.abs(Math.cos(a)) < 0.1 ? x : Math.cos(a) > 0 ? W - 4 : 4, y + 3); });
    g.textAlign = 'left';
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.8, Math.min(0.9, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(5, Math.min(40, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'genome' && (k === 'arrowdown' || k === 'arrowup')) { const i = SNPS.findIndex((s) => s.id === this.sel), j = (i + (k === 'arrowdown' ? 1 : -1) + SNPS.length) % SNPS.length; this.pick(SNPS[j].id); this.render(); } }

  update(dt, time) {
    const v = this.view, W = this.W, tab = this.tab;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.12;
    W.helix.visible = tab === 'genome' || tab === 'plan'; W.inherit.visible = tab === 'inherit'; W.cloud.visible = tab === 'train';
    W.dust.rotation.y += dt * 0.01; W.floor.rotation.y -= dt * 0.03;
    updateHelix(W.helix, time, tab === 'plan' ? SNPS[Math.floor(time / 2) % SNPS.length].id : this.sel);
    W.helix.userData.rung.rotation.y = 0;
    let look = new THREE.Vector3(), r = v.r;
    if (tab === 'genome') { const L = W.helix.userData.loci.find((l) => l.id === this.sel); v.y += ((L ? L.y : 0) - v.y) * Math.min(1, dt * 2.5); look.set(0, v.y, 0); r = v.r * 0.85; }
    else if (tab === 'plan') { v.y += (0 - v.y) * Math.min(1, dt * 2); look.set(0, 0, 0); r = v.r * 2.7; }
    else if (tab === 'inherit') { look.set(0, 0.5, 0); r = v.r * 1.95; this.stream(dt, time); for (const h of [W.inherit.userData.pA, W.inherit.userData.pB, W.inherit.userData.child]) { updateHelix(h, time, 'x'); h.rotation.y += dt * 0.25; } }
    else { look.set(0.4, 0.6, 0); r = v.r * 1.75; }
    const yaw = tab === 'train' || tab === 'inherit' ? Math.sin(v.yaw * 0.6) * 0.45 : v.yaw;
    this.cam.position.set(look.x + Math.sin(yaw) * Math.cos(v.pitch) * r, look.y + Math.sin(v.pitch) * r + (tab === 'plan' ? 2 : 0), look.z + Math.cos(yaw) * Math.cos(v.pitch) * r);
    this.cam.lookAt(look); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.4) { this.uiT = 0; if (this.tab === 'plan') this.plLive(); }
  }
  // Allele stream: particles leave each parent carrying the allele that parent transmits.
  stream(dt, time) {
    const U = this.W.inherit.userData, P = U.stream.geometry.attributes.position.array, C = U.stream.geometry.attributes.color.array, s = BY_ID[this.inh.gene];
    const gA = this.geno[s.id], gB = this.partner[s.id], cA = new THREE.Color(ALC[0]), cB = new THREE.Color(ALC[1]);
    U.seeds.forEach((q, i) => {
      q.u += dt * q.sp; if (q.u >= 1 || q.al === undefined) { q.u %= 1; q.al = Math.random() < (q.side ? gB : gA) / 2 ? 1 : 0; }
      const sx = q.side ? 4.6 : -4.6, u = q.u, a = new THREE.Vector3(sx + Math.cos(q.ph + time) * 0.8, q.y * 0.85, -2), c = new THREE.Vector3(Math.cos(q.ph - time) * 0.9, q.y, 1.5), m = new THREE.Vector3(sx * 0.4, q.y + 3.5, 2.5);
      const x = (1 - u) ** 2 * a.x + 2 * u * (1 - u) * m.x + u * u * c.x, y = (1 - u) ** 2 * a.y + 2 * u * (1 - u) * m.y + u * u * c.y, z = (1 - u) ** 2 * a.z + 2 * u * (1 - u) * m.z + u * u * c.z;
      P.set([x, y, z], i * 3); const col = q.al ? cB : cA, k = Math.sin(Math.PI * u); C.set([col.r * k, col.g * k, col.b * k], i * 3);
    });
    U.stream.geometry.attributes.position.needsUpdate = true; U.stream.geometry.attributes.color.needsUpdate = true;
  }
  refresh() {
    if (!this.entered) return;
    if (this.tab === 'genome') this.geLive();
    if (this.tab === 'inherit') this.inLive();
    if (this.tab === 'train') this.trLive();
    if (this.tab === 'plan') this.plLive();
  }

  showReport() {
    const S = this.score, p = this.profile();
    const rows = [[t('rep.geno'), S.geno], [t('rep.preset'), S.preset], [t('rep.explore', { n: this.seen.size }), S.explore], [t('rep.punnett'), S.punnett], [t('rep.breeder'), S.breeder], [t('rep.train'), S.train], [t('rep.responder'), S.responder], [t('rep.plan'), S.plan]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US'), e: f0(p.E), p: f0(p.Pw) });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
