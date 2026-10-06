import * as THREE from 'three';
import { CORPUS, network, payload, trainBPE, encode, attention, D, DK, trainLM, nextDist, sample, GPU, serve } from './sim/llm.js';
import { buildWorld, setTokens, setArcs, setBars, drawScreen, tokColor, TF } from './view/flow.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTFLOW · the app. Five stops on a prompt's journey: the network, the tokenizer, attention inside the
// transformer, choosing the next token, and the GPUs that pay for it all.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—'), f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');
const ms = (s) => (s < 1 ? f1(s * 1000) + ' ms' : f2(s) + ' s');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TABS = ['send', 'tokens', 'attention', 'predict', 'compute'];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; }; }

export class Flow {
  constructor(app) {
    this.app = app; const scene = (this.scene = new THREE.Scene()); scene.background = new THREE.Color('#03050c'); scene.fog = new THREE.FogExp2('#03050c', 0.006);
    this.cam = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 2000); scene.add(this.cam);
    const k = new THREE.DirectionalLight('#ffffff', 1.6); k.position.set(20, 40, 30); scene.add(k); scene.add(new THREE.HemisphereLight('#9fb8ff', '#120a1a', 0.7));
    this.W = buildWorld(scene);
    this.T = trainBPE(CORPUS); this.LM = trainLM(this.T, CORPUS); this.inv = new Map([...this.T.vocab].map(([s, i]) => [i, s]));
    this.prompt = 'Explain how attention works in a transformer, step by step.';
    this.sd = { km: 4000, anim: null, sent: 0 };
    this.at = { head: 0, q: null };
    this.pr = { T: 0.8, topP: 0.9, gen: [], seed: 1, run: false, acc: 0, last: null };
    this.cp = { lN: Math.log10(70), bytes: 2, G: 2, B: 4, Lout: 300 };
    this.goal = { send: false, tokens: false, attention: false, predict: false, compute: false };
    this.view = { yaw: 0.35, pitch: 0.25, r: 1, drag: null, last: 0 };
    this.keys = new Set(); this.tab = 'send'; this.entered = false; this.uiT = 0; this.time = 0; this.flow = null;
    this.retokenize(); app.stage.use(scene, this.cam);
  }
  retokenize() {
    this.toks = encode(this.T, this.prompt).slice(0, 64); setTokens(this.W, this.toks);
    if (this.at.q == null || this.at.q >= this.toks.length) this.at.q = Math.max(0, this.toks.length - 1);
    this.att = this.toks.length ? attention(this.toks, this.at.head) : null; setArcs(this.W, this.att?.A, this.tab === 'attention' ? this.at.q : null);
    this.pr.gen = []; this.pr.last = null; setBars(this.W, []); drawScreen(this.W, this.prompt, '');
  }

  // ── Shared UI ──
  statusBar() { const el = $('#clear'); if (!el) return; const all = Object.values(this.goal).every(Boolean); el.innerHTML = TABS.map((k) => `<span class="${this.goal[k] ? 'ok' : ''}">${t('tab.' + k)}</span>`).join('') + `<b class="${all ? 'ok' : ''}">${all ? t('ready') : t('notReady')}</b>`; }
  done(k) { if (this.goal[k]) return; this.goal[k] = true; this.app.feed.push('goal.done', 'ok', { g: t('tab.' + k) }); sfx.confirm(); this.statusBar(); }
  caption(key, vars) { const el = $('#caption'); if (!el) return; el.textContent = t(key, vars); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${String(cur) === String(k) ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  bindSliders(obj, defs, after) { for (const [id, key, fmt] of defs) { const el = $('#' + id); if (!el) continue; el.oninput = (e) => { obj[key] = +e.target.value; $('#' + id + '-v').textContent = fmt(obj[key]); after?.(); this.refresh(true); }; } }
  bindChips(name, fn) { document.querySelectorAll(`[data-${name}]`).forEach((b) => (b.onclick = () => { fn(b.dataset[name]); sfx.select(); this.render(); })); }
  promptBox() { return `<textarea id="p-text" class="prompt mono" rows="3" maxlength="300">${esc(this.prompt)}</textarea>`; }
  bindPrompt() { const el = $('#p-text'); if (el) el.oninput = () => { this.prompt = el.value; this.retokenize(); this.refresh(true); }; }
  setPrompt(s) { this.prompt = s; this.retokenize(); this.render(); }
  setTab(tab) {
    this.tab = tab; sfx.select(); document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); document.body.dataset.tab = tab;
    Object.assign(this.view, { yaw: { send: 0.35, tokens: 0.1, attention: 0.2, predict: 0.15, compute: 0.6 }[tab], pitch: { send: 0.3, tokens: 0.15, attention: 0.2, predict: 0.15, compute: 0.45 }[tab], r: 1 }); this.snap = true;
    setArcs(this.W, this.att?.A, tab === 'attention' ? this.at.q : null);
    this.render(); this.caption('cap.' + tab);
  }
  render() { const P = { send: 'sd', tokens: 'tk', attention: 'at', predict: 'pr', compute: 'cp' }[this.tab]; $('#panel').innerHTML = this[P + 'P'](); $('#side').innerHTML = this[P + 'S'](); this[P + 'B'](); this.bindPrompt(); this.refresh(true); }

  // ═══ 1 · SEND ═══
  sdP() { return `<header class="lv-head mono">${t('sd.title')}</header><p class="intro">${t('sd.intro')}</p>${this.promptBox()}${this.slider('s-km', t('sd.km'), this.sd.km, 50, 16000, 50, f0(this.sd.km) + ' km')}<button class="btn primary wide" id="s-go">➤ ${t('sd.send')}</button><ol class="steps">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${t('sd.s' + i)}</li>`).join('')}</ol>`; }
  sdS() { return `<header class="lv-head mono">${t('sd.read')}</header><div class="bigstats" id="sd-big"></div><canvas class="cv chart" id="cv-net"></canvas><div class="math mono" id="sd-math"></div><div class="goal" id="sd-goal"></div>`; }
  sdB() { this.bindSliders(this.sd, [['s-km', 'km', (v) => f0(v) + ' km']]); $('#s-go').onclick = () => this.send(); }
  send() { const N = network(this.sd.km); this.sd.anim = { t: 0, dur: 1.6 }; this.flow = { t: 0 }; this.sd.sent++; sfx.select(); this.app.feed.push('sd.sent', 'ok', { ms: ms(N.rtt) }); if (N.rtt < 0.05) this.done('send'); }
  sdLive(full) {
    if (!full) return;
    const N = network(this.sd.km), P = payload(this.prompt);
    const b = $('#sd-big'); if (b) b.innerHTML = `<div><b class="mono ${N.rtt < 0.05 ? 'c-green' : 'c-amber'}">${ms(N.rtt)}</b><small>${t('sd.rtt')}</small></div><div><b class="mono">${f0(P.wire)} B</b><small>${t('sd.bytes')}</small></div><div><b class="mono">${ms(N.total)}</b><small>${t('sd.hand')}</small></div>`;
    const pts = []; for (let k = 0; k <= 16000; k += 200) pts.push([k, network(k).rtt * 1000]);
    lineChart($('#cv-net'), { x0: 0, x1: 16000, y0: 0, y1: 260, xFmt: (x) => f0(x / 1000) + 'k km', yFmt: (y) => f0(y) + ' ms', title: t('sd.chart'), series: [{ pts, color: '#5ab4ff', label: 'RTT' }], marks: [{ y: 50, color: 'rgba(124,255,158,.5)', label: '50 ms' }, { dot: [this.sd.km, N.rtt * 1000], color: '#ff6a7a' }] });
    const m = $('#sd-math');
    if (m) m.innerHTML = `<div>${t('sd.utf8')} "${esc(this.prompt.slice(0, 18))}…" = <b>${P.bytes} B</b> + JSON ≈ 220 B + TLS 29 B + TCP/IP 40 B = <b>${f0(P.wire)} B</b></div>
      <div>v = c/n = 299,792 km/s ÷ 1.468 = <b>${f0(N.speed / 1000)} km/s</b> · ${t('sd.path')} 1.5 × ${f0(this.sd.km)} km</div>
      <div>RTT = 2 × (${f0(N.path / 1000)} km ÷ v + 14 × 0.05 ms) = <b>${ms(N.rtt)}</b> · TCP + TLS 1.3 + ${t('sd.req')} ≈ 3 RTT = <b>${ms(N.total)}</b></div>`;
    const g = $('#sd-goal'); if (g) g.innerHTML = `${badge(this.goal.send)} ${t('goal.send')}`;
  }

  // ═══ 2 · TOKENS ═══
  tkP() { return `<header class="lv-head mono">${t('tk.title')}</header><p class="intro">${t('tk.intro')}</p>${this.promptBox()}<div class="chips"><button class="btn seg" id="k-ex1">${t('tk.ex1')}</button><button class="btn seg" id="k-ex2">${t('tk.ex2')}</button></div><p class="small">${t('tk.note', { v: this.T.size, m: this.T.rules.length })}</p>`; }
  tkS() { return `<header class="lv-head mono">${t('tk.read')}</header><div class="bigstats" id="tk-big"></div><div class="toks" id="tk-list"></div><div class="math mono" id="tk-math"></div><div class="goal" id="tk-goal"></div>`; }
  tkB() { $('#k-ex1').onclick = () => this.setPrompt('The model reads every token and the answer streams back one token at a time.'); $('#k-ex2').onclick = () => this.setPrompt('Supercalifragilistic quokka photosynthesis!'); }
  tkLive(full) {
    if (!full) return;
    const n = this.toks.length, chars = this.prompt.length, words = (this.prompt.match(/\S+/g) || []).length, cpt = n ? chars / n : 0, ok = n >= 8 && cpt >= 3;
    const b = $('#tk-big'); if (b) b.innerHTML = `<div><b class="mono">${n}</b><small>${t('tk.n')}</small></div><div><b class="mono ${cpt >= 3 ? 'c-green' : 'c-amber'}">${f2(cpt)}</b><small>${t('tk.cpt')}</small></div><div><b class="mono">${f2(words ? n / words : 0)}</b><small>${t('tk.tpw')}</small></div>`;
    const L = $('#tk-list'); if (L) L.innerHTML = this.toks.map((q) => `<span style="--c:#${tokColor(q.id).getHexString()}"><i>${esc(q.s).replace(/ /g, '␣')}</i><em>${q.id}</em></span>`).join('');
    const m = $('#tk-math');
    if (m) m.innerHTML = `<div>${t('tk.algo')}</div><div>${t('tk.first')} ${this.T.rules.slice(0, 10).map(([a, c]) => `<b>${esc(a + c).replace(/ /g, '␣')}</b>`).join(' · ')}</div><div>${t('tk.real')}</div>`;
    if (ok) this.done('tokens');
    const g = $('#tk-goal'); if (g) g.innerHTML = `${badge(this.goal.tokens)} ${t('goal.tokens')}`;
  }

  // ═══ 3 · ATTENTION ═══
  atP() { const n = this.toks.length; return `<header class="lv-head mono">${t('at.title')}</header><p class="intro">${t('at.intro')}</p><header class="lv-sub mono">${t('at.head')}</header>${this.chips('head', [0, 1, 2, 3], this.at.head, (k) => 'head ' + k)}${this.slider('a-q', t('at.q'), this.at.q, 0, Math.max(0, n - 1), 1, esc(this.toks[this.at.q]?.s ?? '').replace(/ /g, '␣'))}<p class="small">${t('at.note')}</p>`; }
  atS() { return `<header class="lv-head mono">${t('at.read')}</header><div class="bigstats" id="at-big"></div><canvas class="cv heat" id="cv-heat"></canvas><div class="math mono" id="at-math"></div><div class="goal" id="at-goal"></div>`; }
  atB() { this.bindChips('head', (k) => { this.at.head = +k; this.att = attention(this.toks, this.at.head); setArcs(this.W, this.att.A, this.at.q); }); this.bindSliders(this.at, [['a-q', 'q', (v) => esc(this.toks[v]?.s ?? '').replace(/ /g, '␣')]], () => setArcs(this.W, this.att?.A, this.at.q)); }
  setHead(h, q) { this.at.head = h; this.at.q = Math.min(q, this.toks.length - 1); this.att = attention(this.toks, h); setArcs(this.W, this.att.A, this.at.q); this.render(); }
  drawHeat() {
    const cv = $('#cv-heat'); if (!cv || !this.att) return; const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; const g = cv.getContext('2d'); g.scale(d, d);
    const A = this.att.A, n = A.length, s = Math.min((r.width - 20) / n, (r.height - 20) / n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { const w = A[i][j]; g.fillStyle = `hsl(${200 - 160 * w}, 100%, ${10 + 55 * Math.sqrt(w)}%)`; g.fillRect(14 + j * s, 6 + i * s, s - 0.5, s - 0.5); }
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(14, 6 + this.at.q * s, (this.at.q + 1) * s, s);
    g.fillStyle = 'rgba(200,210,240,.7)'; g.font = '9px "JetBrains Mono"'; g.fillText(t('at.keys'), 14, r.height - 2); g.save(); g.translate(9, 40); g.rotate(-Math.PI / 2); g.fillText(t('at.queries'), 0, 0); g.restore();
  }
  atLive(full) {
    if (!full || !this.att) return;
    const q = this.at.q, row = this.att.A[q] || [], others = row.slice(0, q), best = others.length ? Math.max(...others) : 0, bj = others.indexOf(best), ok = best >= 0.5 && q >= 4;
    if (ok) this.done('attention');
    const b = $('#at-big'); if (b) b.innerHTML = `<div><b class="mono">${esc(this.toks[q]?.s ?? '').replace(/ /g, '␣')}</b><small>${t('at.query')}</small></div><div><b class="mono ${best >= 0.5 ? 'c-green' : ''}">${f0(best * 100)} %</b><small>${t('at.top')} ${bj >= 0 ? '“' + esc(this.toks[bj].s).replace(/ /g, '␣') + '”' : ''}</small></div><div><b class="mono">${f0((row[q] || 0) * 100)} %</b><small>${t('at.self')}</small></div>`;
    this.drawHeat();
    const Q = this.att.Q[q], K = this.att.K, sc = row.map((_, j) => { let d = 0; for (let k = 0; k < DK; k++) d += Q[k] * K[j][k]; return d / Math.sqrt(DK); });
    const m = $('#at-math');
    if (m) m.innerHTML = `<div>x = E[id] + PE(pos), d = ${D} · q = xW<sub>Q</sub>, k = xW<sub>K</sub>, v = xW<sub>V</sub> (d<sub>k</sub> = ${DK})</div>
      <div>${t('at.scores')} q·k/√${DK} = [${sc.slice(-6).map(f2).join(', ')}]</div>
      <div>softmax → [${row.slice(-6).map(f2).join(', ')}] (Σ = 1) · ${t('at.out')} = Σ a<sub>j</sub>v<sub>j</sub></div>
      <div>${t('at.real')}</div>`;
    const g = $('#at-goal'); if (g) g.innerHTML = `${badge(this.goal.attention)} ${t('goal.attention')}`;
  }

  // ═══ 4 · PREDICT ═══
  prP() { const P = this.pr; return `<header class="lv-head mono">${t('pr.title')}</header><p class="intro">${t('pr.intro')}</p>${this.slider('r-T', t('pr.T'), P.T, 0, 2, 0.05, f2(P.T))}${this.slider('r-p', t('pr.p'), P.topP, 0.1, 1, 0.01, f2(P.topP))}<div class="chips"><button class="btn primary" id="r-go">${P.run ? '❚❚' : '▶'} ${t('pr.go')}</button><button class="btn seg" id="r-step">${t('pr.step')}</button><button class="btn seg" id="r-reset">${t('pr.reset')}</button></div><div class="reply mono" id="pr-text"></div><p class="small">${t('pr.note')}</p>`; }
  prS() { return `<header class="lv-head mono">${t('pr.read')}</header><div class="bigstats" id="pr-big"></div><canvas class="cv chart" id="cv-probs"></canvas><div class="math mono" id="pr-math"></div><div class="goal" id="pr-goal"></div>`; }
  prB() { const P = this.pr; this.bindSliders(P, [['r-T', 'T', f2], ['r-p', 'topP', f2]]); $('#r-go').onclick = () => { P.run = !P.run; sfx.select(); this.render(); }; $('#r-step').onclick = () => this.step(); $('#r-reset').onclick = () => { P.gen = []; P.last = null; setBars(this.W, []); drawScreen(this.W, this.prompt, ''); this.refresh(true); }; }
  step() {
    const P = this.pr, ctx = [...this.toks.map((q) => q.id), ...P.gen], dist = nextDist(this.LM, ctx), r = rng(P.seed * 9973 + P.gen.length * 31)();
    const S = sample(dist, { T: P.T, topP: P.topP, r }); P.gen.push(S.pick); P.last = { dist, S };
    setBars(this.W, dist.slice(0, 8).map(([w, p]) => [this.inv.get(w) ?? '?', p, w === S.pick])); this.flow = { t: 0.9 };
    drawScreen(this.W, this.prompt, P.gen.map((w) => this.inv.get(w) ?? '').join('').trim());
    if (P.gen.length >= 15 && P.T >= 0.3 && P.T <= 1.2) this.done('predict');
    if (P.gen.length >= 60) P.run = false;
    this.refresh(true);
  }
  prLive(full) {
    const P = this.pr, el = $('#pr-text'); if (el) el.innerHTML = `<span class="pp">${esc(this.prompt)}</span>${esc(P.gen.map((w) => this.inv.get(w) ?? '').join(''))}<i class="cursor">▍</i>`;
    if (!full) return;
    const L = P.last, top = L ? L.dist.slice(0, 10) : nextDist(this.LM, this.toks.map((q) => q.id)).slice(0, 10), ent = top.reduce((a, [, p]) => a - p * Math.log2(p + 1e-12), 0);
    const b = $('#pr-big'); if (b) b.innerHTML = `<div><b class="mono">${P.gen.length}</b><small>${t('pr.n')}</small></div><div><b class="mono">${L ? f0(L.S.kept.length) : '—'}</b><small>${t('pr.kept')}</small></div><div><b class="mono">${f2(ent)} bits</b><small>${t('pr.ent')}</small></div>`;
    barChart($('#cv-probs'), { bars: top.map(([w, p], i) => ({ x: i, y: p * 100, color: L && w === L.S.pick ? '#7cff9e' : '#ffb347', glow: L && w === L.S.pick })), x0: -0.6, x1: 9.6, y0: 0, y1: Math.max(10, Math.ceil(top[0][1] * 110)), w: 0.75, xTicks: top.map((_, i) => i), xFmt: (i) => (this.inv.get(top[i]?.[0]) ?? '').replace(/ /g, '␣').slice(0, 6), yFmt: (y) => f0(y) + '%', title: t('pr.chart'), marks: [] });
    const m = $('#pr-math');
    if (m) m.innerHTML = `<div>P(w | u, v) = c(u,v,w)/c(u,v) · ${t('pr.back')} 0.4·c(v,w)/c(v) · 0.16·c(w)/N</div>
      <div>${t('pr.temp')} p<sub>i</sub>′ = e<sup>ln p<sub>i</sub>/T</sup>/Σ e<sup>ln p<sub>j</sub>/T</sup> (T = ${f2(P.T)}${P.T <= 0.01 ? ', ' + t('pr.greedy') : ''})</div>
      <div>top-p = ${f2(P.topP)}: ${t('pr.nuc')} · ${t('pr.kv')}</div>`;
    const g = $('#pr-goal'); if (g) g.innerHTML = `${badge(this.goal.predict)} ${t('goal.predict')}`;
  }

  // ═══ 5 · COMPUTE ═══
  cpIn() { const C = this.cp; return { N: 10 ** C.lN * 1e9, bytes: C.bytes, G: C.G, B: C.B, Lin: Math.max(1, this.toks.length), Lout: C.Lout, rtt: network(this.sd.km).rtt }; }
  cpP() { const C = this.cp; return `<header class="lv-head mono">${t('cp.title')}</header><p class="intro">${t('cp.intro')}</p>${this.slider('c-N', t('cp.N'), C.lN, 0.85, 2.6, 0.01, f0(10 ** C.lN) + ' B')}<header class="lv-sub mono">${t('cp.prec')}</header>${this.chips('prec', [2, 1, 0.5], C.bytes, (k) => ({ 2: 'BF16', 1: 'INT8', 0.5: 'FP4' })[k])}${this.slider('c-G', t('cp.G'), C.G, 1, 16, 1, C.G)}${this.slider('c-B', t('cp.B'), C.B, 1, 128, 1, C.B)}${this.slider('c-L', t('cp.L'), C.Lout, 50, 2000, 10, C.Lout)}<p class="small">${t('cp.note')}</p>`; }
  cpS() { return `<header class="lv-head mono">${t('cp.read')}</header><div class="bigstats" id="cp-big"></div><canvas class="cv chart" id="cv-batch"></canvas><div class="math mono" id="cp-math"></div><div class="goal" id="cp-goal"></div>`; }
  cpB() { this.bindSliders(this.cp, [['c-N', 'lN', (v) => f0(10 ** v) + ' B'], ['c-G', 'G', (v) => v], ['c-B', 'B', (v) => v], ['c-L', 'Lout', (v) => v]]); this.bindChips('prec', (k) => { this.cp.bytes = +k; }); }
  cpLive(full) {
    if (!full) return;
    const I = this.cpIn(), R = serve(I), ok = R.fits && R.ttft <= 0.3 && R.tps >= 50 && R.Wh <= 0.05 && I.N >= 69e9;
    const b = $('#cp-big'); if (b) b.innerHTML = `<div><b class="mono ${R.ttft <= 0.3 ? 'c-green' : 'c-amber'}">${ms(R.ttft)}</b><small>${t('cp.ttft')}</small></div><div><b class="mono ${R.tps >= 50 ? 'c-green' : 'c-amber'}">${f0(R.tps)}</b><small>${t('cp.tps')}</small></div><div><b class="mono ${R.Wh <= 0.05 ? 'c-green' : 'c-amber'}">${f3(R.Wh)} Wh</b><small>${t('cp.wh')}</small></div>`;
    const pts = [], pe = []; for (let B = 1; B <= 128; B++) { const q = serve({ ...I, B }); pts.push([B, q.tps]); pe.push([B, Math.min(200, (q.Wh * 1000) / 5)]); }
    lineChart($('#cv-batch'), { x0: 1, x1: 128, y0: 0, y1: Math.max(100, Math.ceil(pts[0][1] / 50) * 50), xFmt: (x) => f0(x), yFmt: (y) => f0(y), title: t('cp.chart'), series: [{ pts, color: '#7cff9e', label: t('cp.tpsS') }, { pts: pe, color: 'rgba(255,179,71,.7)', dash: [4, 3], label: 'mWh/5' }], marks: [{ dot: [I.B, R.tps], color: '#ff6a7a' }, { y: 50, color: 'rgba(255,255,255,.3)' }] });
    const m = $('#cp-math');
    if (m) m.innerHTML = `<div>${t('cp.wL')} N × ${I.bytes} B = <b>${f0(R.W / 1e9)} GB</b> ${R.fits ? '≤' : '>'} ${I.G} × 80 GB ${R.fits ? '' : '<b class="c-red">' + t('cp.nofit') + '</b>'}</div>
      <div>${t('cp.pre')} 2·N·L<sub>in</sub>/(G·989 TF·45 %) = <b>${ms(R.prefill)}</b> (L<sub>in</sub> = ${I.Lin})</div>
      <div>${t('cp.dec')} max(W/(G·3.35 TB/s·80 %), 2NB/(G·peak·45 %)) = max(${ms(R.tMem)}, ${ms(R.tCmp)}) = <b>${ms(R.step)}</b> → ${R.memBound ? t('cp.mem') : t('cp.cmp')}</div>
      <div>TTFT = RTT + prefill + step = <b>${ms(R.ttft)}</b> · ${t('cp.answer')} ${I.Lout} tokens = <b>${f1(R.total)} s</b> · E = G·700 W·t/B = <b>${f2(R.joules)} J/token</b></div>`;
    if (ok) this.done('compute');
    const g = $('#cp-goal'); if (g) g.innerHTML = `${badge(this.goal.compute)} ${t('goal.compute')}`;
  }

  // ── Input ──
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.005; v.pitch = Math.max(-0.3, Math.min(1.2, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(0.35, Math.min(2.5, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (this.tab === 'predict' && k === ' ') this.step(); }
  keyUp() {}

  // ── Frame ──
  update(dt, time) {
    this.time = time; const tab = this.tab, v = this.view, W = this.W;
    if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.03 * (tab === 'send' ? 1 : 0.4);
    if (tab === 'predict' && this.pr.run) { this.pr.acc += dt; if (this.pr.acc > 0.22) { this.pr.acc = 0; this.step(); } }
    // Packets along the road, then a pulse up the layer stack.
    const S = this.sd; if (S.anim) { S.anim.t += dt; if (S.anim.t > S.anim.dur + 0.6) S.anim = null; }
    W.packets.forEach((p, i) => { if (!S.anim) { p.s.material.opacity = 0; return; } const u = (S.anim.t - i * 0.04) / S.anim.dur; if (u < 0 || u > 1) { p.s.material.opacity = 0; return; } W.route.getPointAt(u, p.s.position); p.s.material.opacity = 0.9; });
    if (this.flow) { this.flow.t += dt * 0.7; const k = this.flow.t - (S.anim ? 1.2 : 0); if (k > 1.6) this.flow = null; else if (k > 0 && W.span) { W.pulse.position.set(W.span.mid, k < 1 ? TF.y0 + k * TF.layers * TF.dy : TF.y0 + TF.layers * TF.dy + (k - 1) * 4, 0); W.pulse.material.opacity = 0.7; W.pulse.scale.setScalar(2.2); } }
    else W.pulse.material.opacity = 0;
    W.slabs.forEach((s, i) => (s.material.emissiveIntensity = 0.3 + (this.flow && W.span ? Math.max(0, 1 - Math.abs(W.pulse.position.y - s.position.y) / 1.5) * 1.2 : 0)));
    W.tokens.forEach((o, i) => { o.cube.position.y = Math.sin(time * 2 + i * 0.5) * 0.08; o.cube.rotation.y = tab === 'tokens' ? Math.sin(time + i) * 0.2 : 0; });
    const R = serve(this.cpIn()); W.leds.forEach((l, i) => l.material.color.setHSL(0.52 - 0.5 * Math.min(1, R.tCmp / R.step), 1, 0.45 + 0.25 * Math.sin(time * 6 + i)));
    W.phone.rotation.y = 0.5 + Math.sin(time * 0.4) * 0.08;
    // Camera stations.
    const mid = W.span?.mid ?? TF.x0, wid = W.span?.w ?? 10; let look, dist;
    if (tab === 'send') { look = V(-40, 2, 0); dist = 92; }
    else if (tab === 'tokens') { look = V(mid, 0.5, 0); dist = Math.max(18, wid * 0.85); }
    else if (tab === 'attention') { look = V(mid, TF.y0 + 4 * TF.dy, 0); dist = Math.max(22, wid * 0.95); }
    else if (tab === 'predict') { look = V(mid, TF.y0 + TF.layers * TF.dy + 2, 0); dist = Math.max(24, wid * 0.9); }
    else { look = V(2, 0, 0); dist = 30; }
    const r = dist * v.r, cp = V(Math.sin(v.yaw) * Math.cos(v.pitch) * r, Math.sin(v.pitch) * r, Math.cos(v.yaw) * Math.cos(v.pitch) * r).add(look);
    this.cam.position.lerp(cp, this.snap ? 1 : Math.min(1, dt * 3)); this.camLook = this.snap || !this.camLook ? look.clone() : this.camLook.lerp(look, Math.min(1, dt * 4)); this.snap = false; this.cam.lookAt(this.camLook);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiN = (this.uiN || 0) + 1; this.refresh(this.uiN % 4 === 0); }
  }
  refresh(full) { if (!this.entered) return; const P = { send: 'sd', tokens: 'tk', attention: 'at', predict: 'pr', compute: 'cp' }[this.tab]; this[P + 'Live'](full); if (full) this.statusBar(); }
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
void GPU;
