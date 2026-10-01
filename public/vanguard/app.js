import * as THREE from 'three';
import { hover, SUIT, LABS, LAB_GROUPS, labStatus, homaIR, tgHdl, LIFTS, epley, liftWork, liftPass, BIKE, hrMax, bikeStats, sleepScore, physScore, ansScore, NEURO, median, LB } from './sim/health.js';
import { analyse, synth, FS } from './sim/rppg.js';
import { buildWorld, emitSparks, updateSparks } from './view/world.js';
import { buildSuit, assemble, pose } from './view/suit.js';
import { lineChart, barChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// VANGUARD · the app: the suit, and the five-part pilot clearance protocol
// (wellness skin scan · labs · fitness gates · neuro battery · briefing).
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '—'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const OK = '#5dffa8', WARN = '#ffb347', BAD = '#ff4466', CY = '#3fe0ff';
const badge = (ok) => `<b class="badge ${ok ? 'ok' : 'no'}">${ok ? t('ok') : t('no')}</b>`;

export class Vanguard {
  constructor(app) {
    this.app = app;
    this.W = buildWorld(); this.scene = this.W.scene;
    this.cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 200); this.scene.add(this.cam);
    this.suit = buildSuit(); this.suit.position.y = 0.1; this.scene.add(this.suit);
    this.asm = { u: 0, target: 0 }; assemble(this.suit, 0);
    this.fly = { h: 0, target: 0 }; this.power = 0;
    this.phys = { pilot: 90, repD: 0.24, coreKWh: 120, v: 80, r: 150 };
    this.scan = { state: 'idle', samples: [], t0: 0, res: null, mode: null, video: null, stream: null, live: [] };
    this.survey = { phq1: 0, phq2: 0, gad1: 0, gad2: 0, hours: 7.5, latency: 15, wakes: 1, rested: 2, days: 5, pain: 1, injury: false, steps: 9 };
    this.labs = Object.fromEntries(LABS.map((L) => [L.id, L.def])); this.labGroup = 'heart';
    this.body = { kg: 95, age: 32 };
    this.lifts = Object.fromEntries(LIFTS.map((L) => [L.id, { lb: 0, reps: 0, checks: {} }]));
    this.bike = { p: Array(10).fill(0), hr: Array(10).fill(0) };
    this.neuro = { test: null, res: { simple: null, choice: null, gonogo: null }, auto: false };
    this.done = { suitUp: false, hover: false, physics: false };
    this.view = { yaw: 0.35, pitch: 0.08, r: 4.6, drag: null, last: 0, mode: 'orbit' };
    this.tab = 'suit'; this.entered = false; this.uiT = 0; this.time = 0;
    this.pill = []; for (let i = 0; i < 5; i++) { const p = this.W.mkPillar(); this.W.pillars.add(p); this.pill.push(p); }
    app.stage.use(this.scene, this.cam);
  }

  // ── Clearance status ───────────────────────────────
  status() {
    const s = this.scan.res, S = this.survey, mental = S.phq1 + S.phq2 < 3 && S.gad1 + S.gad2 < 3;
    const ans = s ? ansScore(s.hr, s.rmssd) : 0, sleep = sleepScore(S), phys = physScore(S);
    const wellness = !!s && s.snr > 0 && ans >= 50 && mental && sleep >= 60 && phys >= 60;
    const labs = LABS.every((L) => labStatus(L, this.labs[L.id]) !== 'out');
    const lifts = LIFTS.map((L) => liftPass(L, this.lifts[L.id])), bk = bikeStats(this.bike.p, this.bike.hr, this.body.age, this.body.kg);
    const fitness = lifts.every(Boolean) && bk.pass;
    const R = this.neuro.res, neuro = !!(R.simple?.pass && R.choice?.pass && R.gonogo?.pass);
    const brief = this.done.suitUp && this.done.hover && this.done.physics;
    return { wellness, labs, fitness, neuro, brief, all: wellness && labs && fitness && neuro && brief, ans, sleep, phys, mental, lifts, bk };
  }
  statusBar() {
    const S = this.status(), el = $('#clear'); if (!el) return;
    el.innerHTML = ['brief', 'wellness', 'labs', 'fitness', 'neuro'].map((k) => `<span class="${S[k] ? 'ok' : ''}">${t('chk.' + k)}</span>`).join('') + `<b class="${S.all ? 'ok' : ''}">${S.all ? t('cleared') : t('notCleared')}</b>`;
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    if (this.tab === 'wellness' && tab !== 'wellness') this.stopCamera();
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab !== 'neuro') this.neuro.test = null;
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { suit: ['suPanel', 'suSide', 'bindSu'], wellness: ['wePanel', 'weSide', 'bindWe'], labs: ['laPanel', 'laSide', 'bindLa'], fitness: ['fiPanel', 'fiSide', 'bindFi'], neuro: ['nePanel', 'neSide', 'bindNe'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  chips(name, list, cur, label) { return `<div class="chips">${list.map((k) => `<button class="btn seg ${cur === k ? 'active' : ''}" data-${name}="${k}">${label(k)}</button>`).join('')}</div>`; }
  slider(id, label, v, min, max, step, shown) { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${shown}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }

  // ═══ SUIT ══════════════════════════════════════════
  suPanel() {
    const P = this.phys;
    return `<header class="lv-head mono">${t('su.title')}</header><p class="intro">${t('su.intro')}</p>
      <div class="chips"><button class="btn primary" id="su-up">${this.asm.target ? t('su.down') : '⚡ ' + t('su.up')}</button><button class="btn seg ${this.fly.target ? 'active' : ''}" id="su-fly">${t('su.hover')}</button></div>
      ${this.chips('vm', ['orbit', 'front', 'helmet', 'back'], this.view.mode, (k) => t('vm.' + k))}
      <header class="lv-sub mono">${t('su.physics')}</header>
      ${this.slider('p-pilot', t('su.pilot'), P.pilot, 50, 140, 1, P.pilot + ' kg')}${this.slider('p-repD', t('su.repD'), P.repD, 0.12, 0.4, 0.01, f2(P.repD) + ' m')}
      ${this.slider('p-core', t('su.core'), P.coreKWh, 20, 300, 5, P.coreKWh + ' kWh')}${this.slider('p-v', t('su.v'), P.v, 10, 250, 5, P.v + ' m/s')}${this.slider('p-r', t('su.r'), P.r, 30, 800, 10, P.r + ' m')}`;
  }
  suSide() { return `<header class="lv-head mono">${t('su.read')}</header><div class="bigstats" id="su-big"></div><div class="math mono" id="su-math"></div><canvas class="cv chart" id="cv-pow"></canvas><div class="parts mono" id="su-parts"></div>`; }
  bindSu() {
    $('#su-up').onclick = () => { this.asm.target = this.asm.target ? 0 : 1; if (this.asm.target) { this.done.suitUp = true; sfx.confirm(); this.caption('cap.assemble'); } else { this.fly.target = 0; } this.render(); };
    $('#su-fly').onclick = () => { if (this.asm.u < 0.99) { this.asm.target = 1; this.done.suitUp = true; } this.fly.target = this.fly.target ? 0 : 1; if (this.fly.target) { this.done.hover = true; this.caption('cap.hover'); } sfx.select(); this.render(); };
    document.querySelectorAll('[data-vm]').forEach((b) => (b.onclick = () => { this.view.mode = b.dataset.vm; this.view.last = 0; sfx.select(); this.render(); }));
    const P = this.phys, U = { pilot: ' kg', repD: ' m', coreKWh: ' kWh', v: ' m/s', r: ' m' };
    for (const [id, k] of [['p-pilot', 'pilot'], ['p-repD', 'repD'], ['p-core', 'coreKWh'], ['p-v', 'v'], ['p-r', 'r']]) $('#' + id).oninput = (e) => { P[k] = +e.target.value; $('#' + id + '-v').textContent = (k === 'repD' ? f2(P[k]) : P[k]) + U[k]; this.done.physics = true; this.refresh(true); };
  }
  suLive() {
    const H = hover(this.phys), P = this.phys;
    const big = $('#su-big'); if (big) big.innerHTML = `<div><b class="mono">${f2(H.T / 1000)}</b><small>${t('su.thrust')} kN</small></div><div><b class="mono">${f0(H.P / 1000)}</b><small>${t('su.power')} kW</small></div><div><b class="mono">${f1(H.endurance)}</b><small>${t('su.endur')} min</small></div>`;
    const m = $('#su-math');
    if (m) m.innerHTML = `<div>m = ${SUIT.mass} + ${P.pilot} = <b>${H.m} kg</b> · T = mg = <b>${f0(H.T)} N</b></div>
      <div>A = 4·π(d/2)² = <b>${f2(H.A * 1e4 / 1e4)} m²</b> · ${t('su.dl')} T/A = <b>${f0(H.diskLoading)} N/m²</b></div>
      <div>P<sub>ideal</sub> = T<sup>3/2</sup>/√(2ρA) = <b>${f0(H.Pi / 1000)} kW</b> · P = P<sub>i</sub>/FM(${SUIT.fm}) = <b>${f0(H.P / 1000)} kW</b></div>
      <div>w = √(T/2ρA) = <b>${f1(H.w)} m/s</b> · ${t('su.jet')} 2w = <b>${f0(H.jet)} m/s</b></div>
      <div>t = ηE/P = 0.9·${P.coreKWh} kWh / ${f0(H.P / 1000)} kW = <b>${f1(H.endurance)} min</b></div>
      <div>n = √(1 + (v²/rg)²) = <b class="${H.n > 9 ? 'c-red' : H.n > 5 ? 'c-amber' : 'c-green'}">${f1(H.n)} g</b> ${H.n > 9 ? t('su.gloc') : H.n > 5 ? t('su.gsuit') : ''}</div>`;
    const pts = []; for (let d = 0.12; d <= 0.4; d += 0.005) pts.push([d, hover({ ...P, repD: d }).P / 1000]);
    lineChart($('#cv-pow'), { x0: 0.12, x1: 0.4, y0: 0, y1: Math.max(1200, Math.ceil(pts[0][1] / 200) * 200), xFmt: (x) => x.toFixed(2) + ' m', yFmt: (y) => f0(y), title: t('su.powChart'), series: [{ pts, color: CY, label: 'kW' }], marks: [{ x: P.repD, color: WARN }] });
    const p = $('#su-parts'); if (p) p.innerHTML = this.suit.userData.parts.length + ' ' + t('su.plates') + ' · ' + f0(this.asm.u * 100) + '% ' + t('su.locked');
  }

  // ═══ WELLNESS ══════════════════════════════════════
  wePanel() {
    const S = this.survey, q = (id) => `<div class="q"><span>${t('q.' + id)}</span><div class="chips">${[0, 1, 2, 3].map((v) => `<button class="btn seg ${S[id] === v ? 'active' : ''}" data-q="${id}" data-v="${v}">${t('q.opt' + v)}</button>`).join('')}</div></div>`;
    return `<header class="lv-head mono">${t('we.title')}</header><p class="intro">${t('we.intro')}</p>
      <div class="scanbox"><video id="we-video" playsinline muted></video><canvas id="we-cap" width="160" height="120"></canvas><div class="oval"></div><div class="scanline"></div><div class="sc-msg mono" id="we-msg"></div></div>
      <div class="chips"><button class="btn primary" id="we-cam">📷 ${t('we.cam')}</button><button class="btn seg" id="we-demo">${t('we.demo')}</button></div>
      <p class="small">${t('we.privacy')}</p>
      <header class="lv-sub mono">${t('we.mental')}</header>${['phq1', 'phq2', 'gad1', 'gad2'].map(q).join('')}
      <header class="lv-sub mono">${t('we.sleep')}</header>
      ${this.slider('s-hours', t('we.hours'), S.hours, 3, 11, 0.25, S.hours + ' h')}${this.slider('s-lat', t('we.lat'), S.latency, 0, 90, 5, S.latency + ' min')}${this.slider('s-wakes', t('we.wakes'), S.wakes, 0, 6, 1, S.wakes)}${this.slider('s-rested', t('we.rested'), S.rested, 0, 3, 1, t('q.rest' + S.rested))}
      <header class="lv-sub mono">${t('we.phys')}</header>
      ${this.slider('s-days', t('we.days'), S.days, 0, 7, 1, S.days)}${this.slider('s-pain', t('we.pain'), S.pain, 0, 10, 1, S.pain + '/10')}${this.slider('s-steps', t('we.steps'), S.steps, 0, 20, 1, S.steps + 'k')}
      <label class="toggle"><input type="checkbox" id="s-inj" ${S.injury ? 'checked' : ''}> ${t('we.injury')}</label>`;
  }
  weSide() { return `<header class="lv-head mono">${t('we.read')}</header><div class="gauges" id="we-g"></div><canvas class="cv chart" id="cv-pulse"></canvas><canvas class="cv chart" id="cv-spec"></canvas><div class="math mono" id="we-math"></div><div id="we-help"></div>`; }
  bindWe() {
    const S = this.survey;
    $('#we-cam').onclick = () => this.startCamera();
    $('#we-demo').onclick = () => this.demoScan();
    document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => { S[b.dataset.q] = +b.dataset.v; sfx.select(); this.render(); }));
    const U = { hours: ' h', latency: ' min', wakes: '', rested: '', days: '', pain: '/10', steps: 'k' };
    for (const [id, k] of [['s-hours', 'hours'], ['s-lat', 'latency'], ['s-wakes', 'wakes'], ['s-rested', 'rested'], ['s-days', 'days'], ['s-pain', 'pain'], ['s-steps', 'steps']]) $('#' + id).oninput = (e) => { S[k] = +e.target.value; $('#' + id + '-v').textContent = k === 'rested' ? t('q.rest' + S[k]) : S[k] + U[k]; this.refresh(true); };
    $('#s-inj').onchange = (e) => { S.injury = e.target.checked; this.refresh(true); };
    if (this.scan.stream) { const v = $('#we-video'); v.srcObject = this.scan.stream; v.play().catch(() => {}); }
  }
  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { this.app.feed.push('we.noCam', 'warn'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      this.scan.stream = stream; const v = $('#we-video'); v.srcObject = stream; await v.play();
      this.scan.state = 'scan'; this.scan.mode = 'cam'; this.scan.samples = []; this.scan.t0 = performance.now(); this.scan.res = null; sfx.confirm(); this.caption('cap.scan');
    } catch { this.app.feed.push('we.denied', 'warn'); }
  }
  stopCamera() { if (this.scan.stream) { this.scan.stream.getTracks().forEach((k) => k.stop()); this.scan.stream = null; } if (this.scan.state === 'scan' && this.scan.mode === 'cam') this.scan.state = 'idle'; }
  demoScan(speed = 1) { this.stopCamera(); this.scan.speed = speed; this.scan.state = 'scan'; this.scan.mode = 'demo'; this.scan.samples = []; this.scan.demo = synth({ seconds: 30, hr: 58 + Math.random() * 8, rsa: 5 + Math.random() * 3, noise: 0.6, seed: (Math.random() * 1e9) | 0 }); this.scan.t0 = this.time; this.scan.res = null; sfx.confirm(); this.caption('cap.scan'); }
  // Called every frame while scanning: sample the face ROI (camera) or replay the demo signal.
  scanTick() {
    const sc = this.scan, dur = 30;
    if (sc.mode === 'demo') { const el = (this.time - sc.t0) * (sc.speed || 1); while (sc.samples.length < sc.demo.length && sc.demo[sc.samples.length].t <= el) sc.samples.push(sc.demo[sc.samples.length]); if (el >= dur) this.finishScan(); return; }
    const v = $('#we-video'), cv = $('#we-cap'); if (!v || !cv || v.readyState < 2) return;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(v, 0, 0, 160, 120);
    // Forehead + cheeks region inside the oval guide (central 40 % wide, upper-middle band).
    const d = g.getImageData(52, 30, 56, 50).data; let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const R = d[i], Gc = d[i + 1], B = d[i + 2]; if (R > 60 && R > B && R > Gc * 0.9) { r += R; gg += Gc; b += B; n++; } }   // crude skin mask
    const el = (performance.now() - sc.t0) / 1000;
    if (n > 200) sc.samples.push({ t: el, r: r / n, g: gg / n, b: b / n });
    if (el >= dur) this.finishScan();
  }
  finishScan() {
    const sc = this.scan; sc.state = 'done'; sc.res = analyse(sc.samples); if (sc.mode === 'cam') this.stopCamera();
    if (!sc.res) { this.app.feed.push('we.fail', 'warn'); sc.state = 'idle'; } else { sfx.confirm(); this.app.feed.push('we.done', 'ok', { hr: f0(sc.res.hr), rm: f0(sc.res.rmssd) }); }
    this.render();
  }
  weLive(full) {
    const sc = this.scan, msg = $('#we-msg');
    if (msg) msg.textContent = sc.state === 'scan' ? `${t('we.scanning')} ${f0(Math.min(100, ((sc.mode === 'demo' ? (this.time - sc.t0) * (sc.speed || 1) : (performance.now() - sc.t0) / 1000) / 30) * 100))}% · ${sc.samples.length} ${t('we.frames')}` : sc.res ? `HR ${f0(sc.res.hr)} · RMSSD ${f0(sc.res.rmssd)} ms` : t('we.ready');
    // Live green-channel trace while scanning.
    if (sc.state === 'scan' && sc.samples.length > 3) { const s = sc.samples.slice(-FS * 8), m = s.reduce((a, b) => a + b.g, 0) / s.length; lineChart($('#cv-pulse'), { x0: s[0].t, x1: s[s.length - 1].t + 0.01, y0: -2, y1: 2, xFmt: (x) => f0(x) + 's', yFmt: () => '', title: t('we.raw'), series: [{ pts: s.map((p) => [p.t, p.g - m]), color: OK }] }); }
    if (!full) return;
    const S = this.status(), r = sc.res, G = $('#we-g');
    const gauge = (k, v, ok) => `<div class="gauge ${ok ? 'ok' : 'no'}" style="--p:${v}"><b class="mono">${f0(v)}</b><small>${t('g.' + k)}</small></div>`;
    if (G) G.innerHTML = gauge('ans', S.ans, r && S.ans >= 50) + gauge('mental', S.mental ? 100 - 12 * (this.survey.phq1 + this.survey.phq2 + this.survey.gad1 + this.survey.gad2) : 30, S.mental) + gauge('sleep', S.sleep, S.sleep >= 60) + gauge('phys', S.phys, S.phys >= 60);
    if (r && sc.state !== 'scan') {
      const pts = Array.from(r.S).map((v, i) => [i / FS, v]).filter((_, i) => i % 2 === 0), mx = Math.max(...r.S.map(Math.abs));
      lineChart($('#cv-pulse'), { x0: 0, x1: r.seconds, y0: -mx * 1.2, y1: mx * 1.2, xFmt: (x) => f0(x) + 's', yFmt: () => '', title: t('we.pulse'), series: [{ pts, color: OK }], marks: r.t.slice(0, 60).map((x) => ({ x, color: 'rgba(255,179,71,.35)' })) });
      const mp = Math.max(...r.curve.map((c) => c[1]));
      lineChart($('#cv-spec'), { x0: 42, x1: 180, y0: 0, y1: 1.05, xFmt: (x) => f0(x), yFmt: () => '', title: t('we.spec'), series: [{ pts: r.curve.map(([x, y]) => [x, y / mp]), color: CY, fill: 'rgba(63,224,255,.12)' }], marks: [{ x: r.hr, color: WARN, label: f0(r.hr) + ' bpm' }] });
    }
    const m = $('#we-math');
    if (m) m.innerHTML = r ? `<div>X = 3r̂ − 2ĝ · Y = 1.5r̂ + ĝ − 1.5b̂ · S = X − αY, α = σX/σY</div>
      <div>HR = 60·f<sub>peak</sub> = <b>${f1(r.hr)} bpm</b> · SNR = <b class="${r.snr > 0 ? 'c-green' : 'c-amber'}">${f1(r.snr)} dB</b></div>
      <div>RMSSD = √(mean ΔIBI²) = <b>${f1(r.rmssd)} ms</b> · ln = ${f2(Math.log(r.rmssd))} · ${r.kept}/${r.ibi.length} ${t('we.beats')}</div>
      <div>${t('g.ans')} = 100·(0.6·v + 0.4·h) = <b>${S.ans}</b> · PHQ-2 ${this.survey.phq1 + this.survey.phq2} · GAD-2 ${this.survey.gad1 + this.survey.gad2}</div>` : `<div>${t('we.noScan')}</div>`;
    const h = $('#we-help'); if (h) h.innerHTML = S.mental ? '' : `<div class="help">${t('we.help')}</div>`;
  }

  // ═══ LABS ══════════════════════════════════════════
  laPanel() {
    const rows = LABS.filter((L) => L.grp === this.labGroup);
    return `<header class="lv-head mono">${t('la.title')}</header><p class="intro">${t('la.intro')}</p>
      ${this.chips('lg', LAB_GROUPS, this.labGroup, (k) => t('lg.' + k))}
      <div class="labs">${rows.map((L) => { const v = this.labs[L.id], st = labStatus(L, v); return `<div class="lab ${st}" data-lab="${L.id}"><div class="lab-h"><b>${t('lab.' + L.id)}</b><em class="mono">${L.lo}–${L.hi} ${L.unit}</em></div>
        <div class="lab-in"><input type="range" min="0" max="${L.max}" step="${L.step}" value="${v}" data-lr="${L.id}"><input class="mono" type="number" min="0" max="${L.max}" step="${L.step}" value="${v}" data-ln="${L.id}"></div><div class="bar mono">${this.rangeBar(L, v)}</div></div>`; }).join('')}</div>
      <button class="btn seg" id="la-reset">↺ ${t('la.reset')}</button>`;
  }
  rangeBar(L, v) { const X = (x) => Math.max(0, Math.min(100, (x / L.max) * 100)); return `<i class="rg" style="left:${X(L.lo)}%;width:${X(L.hi) - X(L.lo)}%"></i><i class="op" style="left:${X(L.opt[0])}%;width:${X(L.opt[1]) - X(L.opt[0])}%"></i><i class="pt ${labStatus(L, v)}" style="left:${X(v)}%"></i>`; }
  laSide() { return `<header class="lv-head mono">${t('la.read')}</header><div class="grps" id="la-grps"></div><div class="math mono" id="la-math"></div><div class="outs" id="la-outs"></div>`; }
  bindLa() {
    document.querySelectorAll('[data-lg]').forEach((b) => (b.onclick = () => { this.labGroup = b.dataset.lg; sfx.select(); this.render(); }));
    const set = (id, v) => { const L = LABS.find((x) => x.id === id); this.labs[id] = Math.max(0, Math.min(L.max, v)); const row = document.querySelector(`[data-lab="${id}"]`); row.className = 'lab ' + labStatus(L, this.labs[id]); row.querySelector('.bar').innerHTML = this.rangeBar(L, this.labs[id]); this.refresh(true); };
    document.querySelectorAll('[data-lr]').forEach((i) => (i.oninput = (e) => { set(i.dataset.lr, +e.target.value); document.querySelector(`[data-ln="${i.dataset.lr}"]`).value = this.labs[i.dataset.lr]; }));
    document.querySelectorAll('[data-ln]').forEach((i) => (i.onchange = (e) => { set(i.dataset.ln, +e.target.value); document.querySelector(`[data-lr="${i.dataset.ln}"]`).value = this.labs[i.dataset.ln]; }));
    $('#la-reset').onclick = () => { this.labs = Object.fromEntries(LABS.map((L) => [L.id, L.def])); this.render(); };
  }
  laLive(full) {
    if (!full) return;
    const g = $('#la-grps'), V = this.labs;
    if (g) g.innerHTML = LAB_GROUPS.map((k) => { const L = LABS.filter((x) => x.grp === k), out = L.filter((x) => labStatus(x, V[x.id]) === 'out').length, opt = L.filter((x) => labStatus(x, V[x.id]) === 'opt').length; return `<div class="grp ${out ? 'no' : 'ok'}"><b>${t('lg.' + k)}</b><span class="mono">${L.length - out}/${L.length} ${t('la.inRange')} · ${opt} ${t('la.optimal')}</span>${badge(!out)}</div>`; }).join('');
    const m = $('#la-math'), hi = homaIR(V.glucose, V.insulin), th = tgHdl(V.tg, V.hdl);
    if (m) m.innerHTML = `<div>HOMA-IR = glucose·insulin/405 = ${V.glucose}·${V.insulin}/405 = <b class="${hi < 2 ? 'c-green' : 'c-amber'}">${f2(hi)}</b> (${t('la.homa')})</div>
      <div>TG/HDL = ${V.tg}/${V.hdl} = <b class="${th < 2 ? 'c-green' : 'c-amber'}">${f2(th)}</b> (${t('la.tghdl')})</div>
      <div>non-HDL ≈ ApoB proxy · Lp(a) ${V.lpa} nmol/L · hs-CRP ${V.hscrp} mg/L</div>
      <div class="small">${t('la.note')}</div>`;
    const o = $('#la-outs'), outs = LABS.filter((L) => labStatus(L, V[L.id]) === 'out');
    if (o) o.innerHTML = outs.length ? `<header class="lv-sub mono">${t('la.outs')}</header>` + outs.map((L) => `<div class="out"><b>${t('lab.' + L.id)}</b> <span class="mono">${V[L.id]} ${L.unit}</span> → ${L.lo}–${L.hi}<p>${t('lab.' + L.id + '.d')}</p></div>`).join('') : `<div class="allgood">${t('la.all')}</div>`;
  }

  // ═══ FITNESS ═══════════════════════════════════════
  fiPanel() {
    const B = this.body;
    return `<header class="lv-head mono">${t('fi.title')}</header><p class="intro">${t('fi.intro')}</p>
      ${this.slider('b-kg', t('fi.kg'), B.kg, 50, 160, 1, B.kg + ' kg')}${this.slider('b-age', t('fi.age'), B.age, 18, 70, 1, B.age)}
      ${LIFTS.map((L) => { const E = this.lifts[L.id], ok = liftPass(L, E); return `<div class="lift ${ok ? 'ok' : ''}"><div class="lift-h"><b>${t('lift.' + L.id)}</b>${badge(ok)}</div><p class="small">${t('lift.' + L.id + '.d')}</p>
        <div class="lift-in"><label>${t('fi.load')} <input class="mono" type="number" min="0" max="1000" step="5" value="${E.lb}" data-ll="${L.id}"> lb</label><label>${t('fi.reps')} <input class="mono" type="number" min="0" max="30" step="1" value="${E.reps}" data-lrp="${L.id}"></label><em class="mono">${t('fi.need')} ${L.lb} lb × ${L.reps}</em></div>
        <div class="chk3">${L.checks.map((c) => `<label><input type="checkbox" data-lc="${L.id}" data-c="${c}" ${E.checks[c] ? 'checked' : ''}> ${t('ck.' + c)}</label>`).join('')}</div></div>`; }).join('')}
      <p class="warnbox">${t('fi.safety')}</p>`;
  }
  fiSide() {
    return `<header class="lv-head mono">${t('fi.bike')}</header><p class="small">${t('fi.bikeIntro')}</p>
      <div class="bikegrid mono"><span></span><span>W</span><span>bpm</span>${this.bike.p.map((p, i) => `<span>#${i + 1}</span><input type="number" min="0" max="3000" step="10" value="${p || ''}" data-bp="${i}"><input type="number" min="0" max="230" step="1" value="${this.bike.hr[i] || ''}" data-bh="${i}">`).join('')}</div>
      <div class="chips"><button class="btn seg" id="bk-sample">${t('fi.sample')}</button><button class="btn seg" id="bk-clear">↺</button></div>
      <canvas class="cv chart" id="cv-bike"></canvas><div class="math mono" id="fi-math"></div>`;
  }
  bindFi() {
    const B = this.body;
    $('#b-kg').oninput = (e) => { B.kg = +e.target.value; $('#b-kg-v').textContent = B.kg + ' kg'; this.refresh(true); };
    $('#b-age').oninput = (e) => { B.age = +e.target.value; $('#b-age-v').textContent = B.age; this.refresh(true); };
    const re = () => { this.render(); };
    document.querySelectorAll('[data-ll]').forEach((i) => (i.onchange = (e) => { this.lifts[i.dataset.ll].lb = +e.target.value; re(); }));
    document.querySelectorAll('[data-lrp]').forEach((i) => (i.onchange = (e) => { this.lifts[i.dataset.lrp].reps = +e.target.value; re(); }));
    document.querySelectorAll('[data-lc]').forEach((i) => (i.onchange = (e) => { this.lifts[i.dataset.lc].checks[i.dataset.c] = e.target.checked; re(); }));
    document.querySelectorAll('[data-bp]').forEach((i) => (i.onchange = (e) => { this.bike.p[+i.dataset.bp] = +e.target.value || 0; this.refresh(true); }));
    document.querySelectorAll('[data-bh]').forEach((i) => (i.onchange = (e) => { this.bike.hr[+i.dataset.bh] = +e.target.value || 0; this.refresh(true); }));
    $('#bk-sample').onclick = () => { this.sampleBike(); this.render(); };
    $('#bk-clear').onclick = () => { this.bike = { p: Array(10).fill(0), hr: Array(10).fill(0) }; this.render(); };
  }
  sampleBike() { const hm = hrMax(this.body.age), pk = this.body.kg * 15.5; this.bike = { p: Array.from({ length: 10 }, (_, i) => Math.round((pk * (1 - 0.022 * i)) / 10) * 10), hr: Array.from({ length: 10 }, (_, i) => Math.round(hm * (0.8 + 0.18 * (1 - Math.exp(-i / 2.5))))) }; }
  fiLive(full) {
    if (!full) return;
    const bk = bikeStats(this.bike.p, this.bike.hr, this.body.age, this.body.kg), n = this.bike.p.length;
    lineChart($('#cv-bike'), { x0: 1, x1: n, y0: 0, y1: Math.max(2000, Math.ceil(bk.best / 500) * 500), xFmt: (x) => '#' + f0(x), yFmt: (y) => f0(y), title: t('fi.bikeChart'), series: [{ pts: this.bike.p.map((p, i) => [i + 1, p]), color: WARN, label: 'W' }, { pts: this.bike.hr.map((h, i) => [i + 1, (h / 220) * Math.max(2000, Math.ceil(bk.best / 500) * 500)]), color: BAD, label: 'HR', dash: [4, 3] }] });
    const m = $('#fi-math'), ck = (b) => (b ? '<b class="c-green">✓</b>' : '<b class="c-red">✗</b>');
    const liftRows = LIFTS.map((L) => { const E = this.lifts[L.id], w = liftWork(L, E.lb, this.body.kg); return `<div>${t('lift.' + L.id + '.s')}: 1RM≈w(1+r/30) = <b>${f0(epley(E.lb, E.reps))} lb</b> · W/rep = mgh = <b>${f0(w)} J</b> · ${f2((E.lb * LB) / this.body.kg)}×BW</div>`; }).join('');
    if (m) m.innerHTML = `<div>HR<sub>max</sub> = 208 − 0.7·${this.body.age} = <b>${f1(bk.hm)}</b> · ${t('fi.peak')} ${f0(bk.peakHr)} (${f0((100 * bk.peakHr) / bk.hm)}%) ${ck(bk.ok.hr)}</div>
      <div>FI = (P<sub>best</sub> − P<sub>worst</sub>)/P<sub>best</sub> = <b>${f0(bk.fi * 100)}%</b> ≤ 30% ${ck(bk.ok.fi)} · ${t('fi.sprints')} ${this.bike.p.filter((p) => p > 0).length}/10 ${ck(bk.ok.count)}</div>
      <div>P̄ = <b>${f0(bk.mean)} W</b> = <b>${f1(bk.wkgMean)} W/kg</b> ≥ ${BIKE.wkg} ${ck(bk.ok.wkg)} · ${t('fi.work')} Σ P·10 s = <b>${f1(bk.work)} kJ</b></div>${liftRows}`;
  }

  // ═══ NEURO ═════════════════════════════════════════
  nePanel() {
    const R = this.neuro.res;
    return `<header class="lv-head mono">${t('ne.title')}</header><p class="intro">${t('ne.intro')}</p>
      ${['simple', 'choice', 'gonogo'].map((k) => `<div class="ntest ${R[k]?.pass ? 'ok' : ''}"><div class="lift-h"><b>${t('ne.' + k)}</b>${R[k] ? badge(R[k].pass) : ''}</div><p class="small">${t('ne.' + k + '.d')}</p><button class="btn primary" data-nt="${k}">▶ ${t('ne.start')}</button>${R[k] ? `<div class="mono nres">${this.neuroLine(k, R[k])}</div>` : ''}</div>`).join('')}
      <p class="small">${t('ne.note')}</p>`;
  }
  neuroLine(k, r) { return k === 'simple' ? `${t('ne.med')} <b>${f0(r.med)} ms</b> (< ${NEURO.simple.med}) · ${t('ne.false')} ${r.fs}` : k === 'choice' ? `${t('ne.med')} <b>${f0(r.med)} ms</b> (< ${NEURO.choice.med}) · ${t('ne.acc')} <b>${f0(r.acc * 100)}%</b> (≥ 90)` : `${t('ne.med')} <b>${f0(r.med)} ms</b> (< ${NEURO.gonogo.med}) · ${t('ne.comm')} <b>${r.errs}</b> (≤ 1) · ${t('ne.omit')} ${r.omit}`; }
  neSide() { return `<header class="lv-head mono">${t('ne.read')}</header><canvas class="cv chart tall" id="cv-rt"></canvas><div class="math mono" id="ne-math"></div>`; }
  bindNe() { document.querySelectorAll('[data-nt]').forEach((b) => (b.onclick = () => this.startNeuro(b.dataset.nt))); }
  now() { return this.simClock ? this.time * 1000 : performance.now(); }
  startNeuro(kind, auto = false) {
    const N = NEURO[kind], trials = [];
    for (let i = 0; i < N.n; i++) trials.push(kind === 'choice' ? (Math.random() < 0.5 ? 'L' : 'R') : kind === 'gonogo' ? (i % 4 === 3 ? 'nogo' : 'go') : 'go');
    if (kind === 'gonogo') trials.sort(() => Math.random() - 0.5);
    this.neuro.test = { kind, trials, i: 0, phase: 'ready', at: this.now() + 900, rts: [], correct: 0, fs: 0, errs: 0, omit: 0, flash: 0 };
    this.neuro.auto = auto; sfx.confirm(); this.caption('cap.neuroGo');
  }
  // Input from keys / clicks while a test runs. side = 'L' | 'R' | null.
  respond(side = null) {
    const T = this.neuro.test; if (!T) return;
    const now = this.now();
    if (T.phase === 'wait') { T.fs++; T.phase = 'false'; T.at = now + 700; sfx.select(); return; }
    if (T.phase !== 'go') return;
    const rt = now - T.onset, stim = T.trials[T.i];
    if (rt < 100) { T.fs++; T.phase = 'false'; T.at = now + 700; return; }
    if (stim === 'nogo') { T.errs++; T.fb = 'no'; } else if (T.kind === 'choice') { const ok = side === stim; if (ok) T.correct++; T.rts.push(rt); T.fb = ok ? 'ok' : 'no'; } else { T.rts.push(rt); T.correct++; T.fb = 'ok'; }
    T.last = rt; T.phase = 'iti'; T.at = now + (this.neuro.auto ? 300 : 650);
  }
  neuroTick() {
    const T = this.neuro.test; if (!T) return; const now = this.now(), q = this.neuro.auto ? 0.4 : 1;
    if (T.phase === 'ready' && now >= T.at) { T.phase = 'wait'; T.at = now + q * (1000 + Math.random() * 1500); }
    else if (T.phase === 'false' && now >= T.at) { T.phase = 'wait'; T.at = now + 1000 + Math.random() * 1500; }
    else if (T.phase === 'wait' && now >= T.at) { T.phase = 'go'; T.onset = now; T.auto = 165 + Math.random() * 70 + (T.kind === 'choice' ? 80 : 0); sfx.select(); }
    else if (T.phase === 'go') {
      const stim = T.trials[T.i], el = now - T.onset;
      if (this.neuro.auto && stim !== 'nogo' && el >= T.auto) this.respond(T.kind === 'choice' ? stim : null);
      else if (el > (stim === 'nogo' ? 800 : 1200)) { if (stim === 'nogo') { T.fb = 'ok'; } else { T.omit++; T.fb = 'no'; } T.phase = 'iti'; T.at = now + 500; }
    } else if (T.phase === 'iti' && now >= T.at) {
      T.i++; T.fb = null;
      if (T.i >= T.trials.length) return this.finishNeuro();
      T.phase = 'wait'; T.at = now + q * (900 + Math.random() * 1400);
    }
  }
  // Tour helper: run a test instantly with plausible simulated responses (same scoring).
  autoComplete(kind) { this.startNeuro(kind, true); const T = this.neuro.test; T.trials.forEach((st) => { if (st === 'nogo') return; const rt = 165 + Math.random() * 70 + (kind === 'choice' ? 80 : 0); T.rts.push(rt); T.correct++; }); this.finishNeuro(); }
  finishNeuro() {
    const T = this.neuro.test, N = NEURO[T.kind], med = median(T.rts); let r;
    if (T.kind === 'simple') r = { med, fs: T.fs, rts: T.rts, pass: med < N.med };
    else if (T.kind === 'choice') { const acc = T.correct / T.trials.length; r = { med, acc, fs: T.fs, rts: T.rts, pass: med < N.med && acc >= N.acc }; }
    else r = { med, errs: T.errs, omit: T.omit, fs: T.fs, rts: T.rts, pass: med < N.med && T.errs <= N.errs && T.omit <= 1 };
    this.neuro.res[T.kind] = r; this.neuro.test = null; this.app.feed.push(r.pass ? 'ne.passed' : 'ne.failed', r.pass ? 'ok' : 'warn', { m: f0(med) }); sfx.confirm(); this.render();
  }
  drawGame() {
    const cv = $('#game'); if (!cv) return; const T = this.neuro.test;
    cv.classList.toggle('on', !!T); if (!T) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(r.width * d)) { cv.width = r.width * d; cv.height = r.height * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, cx = W / 2, cy = H / 2, now = this.now();
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(2,6,12,.55)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(63,224,255,.25)'; g.lineWidth = 1; for (const rr of [60, 120, 180]) { g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.moveTo(cx, cy - 12); g.lineTo(cx, cy + 12); g.stroke();
    g.font = '600 13px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(232,238,252,.8)'; g.textAlign = 'center';
    g.fillText(`${t('ne.' + T.kind).toUpperCase()} · ${Math.min(T.i + 1, T.trials.length)}/${T.trials.length}`, cx, 28);
    if (T.phase === 'ready') g.fillText(t('ne.getReady'), cx, cy + 70);
    if (T.phase === 'false') { g.fillStyle = BAD; g.fillText(t('ne.tooSoon'), cx, cy + 70); }
    if (T.phase === 'go') {
      const stim = T.trials[T.i], k = Math.min(1, (now - T.onset) / 90), col = stim === 'nogo' ? BAD : T.kind === 'gonogo' ? OK : CY;
      const x = T.kind === 'choice' ? cx + (stim === 'L' ? -1 : 1) * 150 : cx;
      g.shadowColor = col; g.shadowBlur = 40; g.fillStyle = col; g.beginPath(); g.arc(x, cy, 26 + 10 * k, 0, 7); g.fill(); g.shadowBlur = 0;
      g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(x, cy, 46 + 30 * k, 0, 7); g.stroke();
      if (T.kind === 'choice') { g.fillStyle = '#02060c'; g.font = '700 26px sans-serif'; g.fillText(stim === 'L' ? '◀' : '▶', x, cy + 9); }
    }
    if (T.phase === 'iti' && T.fb) { g.fillStyle = T.fb === 'ok' ? OK : BAD; g.font = '700 28px "JetBrains Mono", monospace'; g.fillText(T.last && T.fb === 'ok' ? f0(T.last) + ' ms' : T.fb === 'ok' ? '✓' : '✗', cx, cy + 10); }
    g.font = '11px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(232,238,252,.6)'; g.fillText(t('ne.keys.' + T.kind), cx, H - 18);
  }
  neLive(full) {
    if (!full) return;
    const R = this.neuro.res, all = [], ser = [];
    const cols = { simple: CY, choice: WARN, gonogo: OK };
    for (const k of ['simple', 'choice', 'gonogo']) if (R[k]) { const pts = R[k].rts.map((v, i) => [i + 1, v]); ser.push({ pts, color: cols[k], label: t('ne.' + k) }); all.push(...R[k].rts); }
    lineChart($('#cv-rt'), { x0: 1, x1: 20, y0: 100, y1: 600, xFmt: (x) => f0(x), yFmt: (y) => f0(y), title: t('ne.rtChart'), series: ser, marks: [{ y: 250, color: 'rgba(63,224,255,.5)', label: '250' }, { y: 400, color: 'rgba(255,179,71,.5)', label: '400' }] });
    const m = $('#ne-math');
    if (m) m.innerHTML = `<div>${t('ne.mathMed')}</div><div>${t('ne.hick')}</div>${all.length ? `<div>${t('ne.allMed')} <b>${f0(median(all))} ms</b> · n = ${all.length}</div>` : ''}<div class="small">${t('ne.frame')}</div>`;
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { if (this.neuro.test) { const cv = $('#game').getBoundingClientRect(); this.respond(e.clientX < cv.left + cv.width / 2 ? 'L' : 'R'); return; } this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.3, Math.min(0.9, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(1.4, Math.min(12, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) {
    if (this.neuro.test) { if (k === ' ') this.respond(null); if (k === 'arrowleft' || k === 'f') this.respond('L'); if (k === 'arrowright' || k === 'j') this.respond('R'); return; }
    if (k === 'u' && this.tab === 'suit') $('#su-up')?.click();
    if (k === 'h' && this.tab === 'suit') $('#su-fly')?.click();
  }

  update(dt, time) {
    this.time = time; const W = this.W, v = this.view, tab = this.tab, suit = this.suit;
    // Assembly and flight.
    const prev = this.asm.u; this.asm.u += Math.sign(this.asm.target - this.asm.u) * Math.min(Math.abs(this.asm.target - this.asm.u), dt / (this.asm.target ? 4.2 : 2.2));
    if (this.asm.u !== prev) { const locked = assemble(suit, this.asm.u); for (const p of locked.slice(0, 3)) { const wp = new THREE.Vector3(); p.m.getWorldPosition(wp); emitSparks(W, wp, 6, Math.random() < 0.5 ? '#ffb347' : '#7ff6ff'); } }
    this.power += ((this.asm.u > 0.97 ? 1 : this.asm.u * 0.15) - this.power) * Math.min(1, dt * 2.5);
    this.fly.h += ((this.fly.target && this.asm.u > 0.99 ? 1 : 0) - this.fly.h) * Math.min(1, dt * 1.2);
    suit.position.y = 0.1 + this.fly.h * (1.3 + 0.08 * Math.sin(time * 1.7)); suit.rotation.y = this.fly.h * 0.15 * Math.sin(time * 0.4);
    pose(suit, time, { hover: this.fly.h, power: this.power, look: tab === 'neuro' ? 0 : 0.15 * Math.sin(time * 0.3) });
    if (this.fly.h > 0.2) for (const k of ['soleL', 'soleR', 'palmL', 'palmR']) { const p = new THREE.Vector3(); suit.userData.J[k].getWorldPosition(p); if (Math.random() < this.fly.h * 0.9) emitSparks(W, p, 1, '#7ff6ff'); }
    updateSparks(W, dt);
    // Gantry arms swing in during assembly.
    W.arms.forEach((a, i) => { const s = i ? 1 : -1, act = this.asm.u > 0.02 && this.asm.u < 0.98 ? 1 : 0; a.userData.boom.rotation.y = s * (0.5 - act * 0.5 + act * 0.15 * Math.sin(time * 3 + i)); a.userData.tip.material.opacity = act * (0.5 + 0.5 * Math.random()); });
    W.rings.forEach((r, i) => { r.rotation.z = time * (i % 2 ? -0.2 : 0.3); });
    W.cone.material.uniforms.uT.value = time; W.dust.rotation.y += dt * 0.01;
    // Scan beam.
    W.scan.visible = tab === 'wellness' && this.scan.state === 'scan';
    if (W.scan.visible) { W.scan.position.y = 0.3 + (0.5 + 0.5 * Math.sin(time * 1.6)) * 1.7; W.scan.children[1].material.opacity = 0.1 + 0.05 * Math.sin(time * 9); }
    if (this.scan.state === 'scan') this.scanTick();
    // Pillars: lab groups or fitness gates.
    W.pillars.visible = tab === 'labs' || tab === 'fitness';
    if (W.pillars.visible) this.updatePillars(time);
    W.panels.forEach((p, i) => { p.position.y = 2.6 + 0.05 * Math.sin(time + i); });
    // Neuro.
    if (this.neuro.test) this.neuroTick(); this.drawGame();
    // Camera.
    if (!v.drag && performance.now() - v.last > 4000 && v.mode === 'orbit') v.yaw += dt * 0.12;
    const sy = suit.position.y;
    let look = new THREE.Vector3(0, sy + 1.05, 0), r = v.r, yaw = v.yaw, pitch = v.pitch;
    if (tab === 'suit') { if (v.mode === 'front') { yaw = 0.05; pitch = 0.05; } else if (v.mode === 'helmet') { look.set(0, sy + 1.9, 0); r = 1.35; yaw = 0.25 * Math.sin(time * 0.3); pitch = 0.02; } else if (v.mode === 'back') { yaw = Math.PI + 0.3; pitch = 0.15; } }
    else if (tab === 'wellness') { look.set(0, sy + 1.2, 0); r = 3.6; yaw = 0.4 * Math.sin(time * 0.15); pitch = 0.05; }
    else if (tab === 'labs' || tab === 'fitness') { look.set(0, 1.0, 0); r = 6.4; pitch = 0.3; yaw = 0.5 * Math.sin(time * 0.12); }
    else if (tab === 'neuro') { look.set(0, sy + 1.86, 0); r = 1.25; yaw = 0.12 * Math.sin(time * 0.4); pitch = 0.0; }
    const cp = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * r, look.y + Math.sin(pitch) * r, look.z + Math.cos(yaw) * Math.cos(pitch) * r);
    this.cam.position.lerp(cp, Math.min(1, dt * 3)); this.camLook = (this.camLook || look.clone()).lerp(look, Math.min(1, dt * 3)); this.cam.lookAt(this.camLook);
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.uiT += dt; if (this.uiT > 0.12) { this.uiT = 0; this.uiSlow = (this.uiSlow || 0) + 1; this.refresh(this.uiSlow % 4 === 0); }
  }
  updatePillars(time) {
    let items;
    if (this.tab === 'labs') items = LAB_GROUPS.map((k) => { const L = LABS.filter((x) => x.grp === k), ok = L.filter((x) => labStatus(x, this.labs[x.id]) !== 'out').length; return { f: ok / L.length, ok: ok === L.length }; });
    else { const S = this.status(); items = [...LIFTS.map((L, i) => { const E = this.lifts[L.id]; return { f: Math.min(1, (E.lb / L.lb) * Math.min(1, E.reps / L.reps)), ok: S.lifts[i] }; }), { f: Math.min(1, S.bk.mean / (BIKE.wkg * this.body.kg)), ok: S.bk.pass }]; }
    this.pill.forEach((p, i) => {
      const it = items[i]; p.visible = !!it; if (!it) return;
      const a = (i / items.length) * Math.PI * 2 + 0.3 + time * 0.05; p.position.set(Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6);
      const h = Math.max(0.02, it.f) * 1.6, c = it.ok ? OK : it.f > 0.6 ? WARN : BAD, U = p.userData;
      U.fillM.scale.y = h; U.fillM.position.y = h / 2; U.fillM.material.color.set(c); U.top.position.y = h; U.top.material.color.set(c);
    });
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'suit') this.suLive(full);
    if (this.tab === 'wellness') this.weLive(full);
    if (this.tab === 'labs') this.laLive(full);
    if (this.tab === 'fitness') this.fiLive(full);
    if (this.tab === 'neuro') this.neLive(full);
    if (full) this.statusBar();
  }

  showReport() {
    const S = this.status();
    const rows = [[t('rep.brief'), S.brief], [t('rep.wellness'), S.wellness], [t('rep.labs'), S.labs], [t('rep.fitness'), S.fitness], [t('rep.neuro'), S.neuro]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const sc = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', sc); ring.querySelector('b').textContent = sc;
    $('#rep-title').textContent = S.all ? t('rep.cleared') : t('rep.notCleared');
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
    if (S.all) this.app.stage.flash?.('#5dffa8');
  }
}
export { barChart };
