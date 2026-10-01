import * as THREE from 'three';
import { makeAnalyzer, W as AW, H as AH } from './sim/saliency.js';
import { makeViewer, params, PRESETS, PROFILE_KEYS, REGIONS, THETA, schultzTD } from './sim/neuro.js';
import { buildBrain, REGION_DEF, SYS_COL } from './view/brain.js';
import { SHOT_TYPES, MOVES, ICON, REELS, drawShot, reelDuration, shotAt } from './view/reel.js';
import { lineChart, radar } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// NEUROLENS · the app: brain atlas, viewer profile, screening room, photo lab.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => Math.round(x).toString(), f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), pct = (x) => `${Math.round(x * 100)}%`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const SAMPLE = 0.1;                                       // analysis rate: 10 Hz
const FW = 640, FH = 360;                                 // film resolution
const SYSTEMS = ['reward', 'salience', 'control', 'memory', 'visual', 'dmn'];

export class NeuroLens {
  constructor(app) {
    this.app = app;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog('#f7f2f7', 7, 16);
    this.cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 100); this.scene.add(this.cam);
    this.B = buildBrain(); this.scene.add(this.B.group);
    this.decor();
    this.view = { yaw: 0.9, pitch: 0.18, r: 6.2, drag: null, last: 0, target: new THREE.Vector3(), offset: 0 };
    this.profile = clone(PRESETS.scroller); this.preset = 'scroller';
    this.viewer = makeViewer(this.profile);
    this.reel = clone(REELS.launch); this.reelName = 'launch'; this.sel = 0;
    this.film = $('#film'); this.film.width = FW; this.film.height = FH; this.fg = this.film.getContext('2d');
    this.heatCv = $('#heat'); this.an = makeAnalyzer();
    this.play = { t: 0, on: false, acc: 0, lastShot: -1, feat: null, gaze: { x: 0.5, y: 0.5 } };
    this.mode = 'reel'; this.video = null; this.upload = null;
    this.heatOn = true; this.gazeOn = true; this.thirdsOn = true;
    this.pred = null; this.draftPred = null;
    this.photo = { src: 'portrait', img: null, stats: null, comp: null, path: [] };
    this.schultz = 'expected';
    this.atlasSeen = new Set(); this.edits = 0;
    this.score = { atlas: false, schultz: false, profile: false, screened: false, heat: false, improved: false, edited: false, photo: false };
    this.tab = 'brain'; this.entered = false; this.uiT = 0; this.uiSlow = 0;
    app.stage.use(this.scene, this.cam);
    this.idle = 0;
    this.predict();
    this.draftPred = this.pred;
  }

  // Floating holographic rings, a soft pink floor glow and drifting motes around the brain.
  decor() {
    const g = new THREE.Group(); this.scene.add(g); this.rings = [];
    for (const [r, tilt, col, op] of [[2.2, 0.25, '#ff4fa3', 0.35], [2.6, -0.15, '#c58bff', 0.25], [3.1, 0.05, '#ffb3d6', 0.22]]) {
      const pts = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: col, dashSize: 0.18, gapSize: 0.08, transparent: true, opacity: op }));
      ring.computeLineDistances(); ring.rotation.x = tilt; ring.position.y = -0.2; g.add(ring); this.rings.push(ring);
      for (let k = 0; k < 6; k++) { const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op * 1.6 })); const a = (k / 6) * Math.PI * 2; tick.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); tick.lookAt(0, 0, 0); ring.add(tick); }
    }
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,120,190,.55)'); gr.addColorStop(0.5, 'rgba(255,170,215,.18)'); gr.addColorStop(1, 'rgba(255,200,230,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.3; g.add(floor);
    const mg = new THREE.BufferGeometry(), mp = []; for (let i = 0; i < 260; i++) mp.push((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9);
    mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: '#ff8cc6', size: 0.035, transparent: true, opacity: 0.6, depthWrite: false })); g.add(this.motes);
    this.decorG = g;
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    if (tab !== 'screen') this.pause();
    if (tab === 'photo') this.analysePhoto();
    if (tab === 'screen') this.drawFrame();
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { brain: ['brainPanel', 'brainSide', 'bindBrain'], viewer: ['viewerPanel', 'viewerSide', 'bindViewer'], screen: ['screenPanel', 'screenSide', 'bindScreen'], photo: ['photoPanel', 'photoSide', 'bindPhoto'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  slider(id, label, v, min, max, step, unit = '') { return `<label class="sl"><span>${label}</span><b class="mono" id="${id}-v">${v}${unit}</b><em></em><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`; }
  presetChips() { return `<div class="chips">${Object.keys(PRESETS).map((k) => `<button class="btn seg ${this.preset === k ? 'active' : ''}" data-pre="${k}">${t('pre.' + k)}</button>`).join('')}</div>`; }
  bindPresets() { document.querySelectorAll('[data-pre]').forEach((b) => (b.onclick = () => this.setPreset(b.dataset.pre))); }
  setPreset(k) { this.preset = k; this.profile = clone(PRESETS[k]); this.viewer.setProfile(this.profile); this.score.profile = true; sfx.select(); this.predict(); this.render(); this.caption('cap.pre.' + k); }

  // ═══ BRAIN ══════════════════════════════════════════
  brainPanel() {
    return `<header class="lv-head mono">${t('b.title')}</header><p class="intro">${t('b.intro')}</p>
      ${SYSTEMS.map((s) => `<header class="lv-sub mono" style="--c:${SYS_COL[s]}"><i class="dot"></i>${t('sys.' + s)}</header><div class="chips">${Object.keys(REGION_DEF).filter((k) => REGION_DEF[k].sys === s).map((k) => `<button class="btn seg region ${this.B.focus === k ? 'active' : ''}" data-rg="${k}" style="--c:${SYS_COL[s]}">${t('r.' + k)}</button>`).join('')}</div>`).join('')}
      <div class="card" id="atlas-card">${this.B.focus ? this.regionCard(this.B.focus) : `<p class="small">${t('b.pick')}</p>`}</div>`;
  }
  regionCard(k) {
    return `<h3 style="--c:${SYS_COL[REGION_DEF[k].sys]}"><i class="dot"></i>${t('r.' + k)} <small class="mono">${t('rf.' + k)}</small></h3>
      <p>${t('rd.' + k)}</p><p class="chem mono">${t('rc.' + k)}</p><p class="tip"><b>${t('b.forYou')}</b> ${t('rt.' + k)}</p>`;
  }
  brainSide() {
    return `<header class="lv-head mono">${t('s.title')}</header><p class="small">${t('s.intro')}</p>
      <div class="chips">${['expected', 'omitted', 'bigger'].map((k) => `<button class="btn seg ${this.schultz === k ? 'active' : ''}" data-sc="${k}">${t('s.' + k)}</button>`).join('')}</div>
      <canvas class="cv chart" id="cv-schultz"></canvas>
      <div class="math mono">δ(t) = r(t) + γ·V(t+1) − V(t) · V ← V + α·δ<br><span class="small">${t('s.' + this.schultz + 'Why')}</span></div>
      <header class="lv-sub mono">${t('b.live')}</header><div class="bars" id="b-bars"></div>`;
  }
  bindBrain() {
    document.querySelectorAll('[data-rg]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.rg; this.B.focus = this.B.focus === k ? null : k; if (this.B.focus) { this.atlasSeen.add(k); if (this.atlasSeen.size >= 3) this.score.atlas = true; }
      sfx.select(); document.querySelectorAll('[data-rg]').forEach((x) => x.classList.toggle('active', x.dataset.rg === this.B.focus));
      $('#atlas-card').innerHTML = this.B.focus ? this.regionCard(this.B.focus) : `<p class="small">${t('b.pick')}</p>`;
    }));
    document.querySelectorAll('[data-sc]').forEach((b) => (b.onclick = () => { this.schultz = b.dataset.sc; if (this.schultz === 'omitted') this.score.schultz = true; sfx.select(); this.render(); }));
    const s = schultzTD({ test: this.schultz });
    lineChart($('#cv-schultz'), { x0: 0, x1: 2, y0: -1.1, y1: 1.1, xTicks: [0, 0.5, 1, 1.5, 2], xFmt: (v) => v + ' s', yFmt: (v) => v.toFixed(1), title: t('s.chart'),
      series: [{ pts: s.naive, color: 'rgba(176,92,255,.6)', label: t('s.naive'), width: 1.4 }, { pts: s.trained, color: '#ff2f8e', label: t('s.trained'), width: 2.2 }],
      marks: [{ x: s.cueT, color: '#b05cff', label: t('s.cue') }, { x: s.rewT, color: '#ff8a3d', label: this.schultz === 'omitted' ? t('s.noRew') : t('s.rew') }, { y: 0, color: 'rgba(74,53,80,.25)', dash: [] }] });
  }

  // ═══ VIEWER ═════════════════════════════════════════
  viewerPanel() {
    const p = this.profile;
    return `<header class="lv-head mono">${t('v.title')}</header><p class="intro">${t('v.intro')}</p>${this.presetChips()}
      ${PROFILE_KEYS.map((k) => this.slider('p-' + k, t('p.' + k), Math.round(p[k] * 100), 0, 100, 1, '%')).join('')}
      <p class="small">${t('v.caveat')}</p>`;
  }
  viewerSide() {
    return `<header class="lv-head mono">${t('v.model')}</header><canvas class="cv radar" id="cv-radar"></canvas>
      <div class="bigstats" id="v-big"></div><div class="math mono" id="v-math"></div>
      <header class="lv-sub mono">${t('v.why')}</header><ul class="roles">${['drd4', 'comt', 'adhd', 'age', 'sleep', 'caffeine'].map((k) => `<li><b>${t('w.' + k)}</b><span>${t('w.' + k + '.d')}</span></li>`).join('')}</ul>`;
  }
  bindViewer() {
    this.bindPresets();
    for (const k of PROFILE_KEYS) $('#p-' + k).oninput = (e) => { this.profile[k] = +e.target.value / 100; $('#p-' + k + '-v').textContent = e.target.value + '%'; this.preset = null; this.viewer.setProfile(this.profile); this.score.profile = true; document.querySelectorAll('[data-pre]').forEach((b) => b.classList.remove('active')); clearTimeout(this.pt); this.pt = setTimeout(() => { this.predict(); this.viewerLive(true); }, 250); this.viewerLive(true); };
  }
  // How long this viewer stays with a single unedited, average shot.
  rawSpan(profile) {
    const v = makeViewer(profile); let lost = null;
    for (let i = 0; i < 400 && lost === null; i++) { v.step(SAMPLE, { contrast: 0.4, colourfulness: 30, edgeDensity: 0.1, motion: 0.002, focus: 0.5, face: 0, cut: i === 0, cutMag: i === 0 ? 0.5 : 0, type: 'x' }); if (!v.engaged) lost = v.t; }
    return lost ?? 40;
  }
  viewerLive() {
    const p = this.profile, P = params(p), avg = { novelty: 0.55, reward: 0.6, faces: 0.6, colour: 0.6, motion: 0.55, arousal: 0.5, focus: 0.55 };
    radar($('#cv-radar'), PROFILE_KEYS, PROFILE_KEYS.map((k) => p[k]), PROFILE_KEYS.map((k) => t('p.' + k + '.s')), PROFILE_KEYS.map((k) => avg[k]));
    const span = this.rawSpan(p), sum = this.pred ? this.pred.sum : null;
    const big = $('#v-big'); if (big) big.innerHTML = `<div><b class="mono">${f1(span)} s</b><small>${t('v.rawSpan')}</small></div><div><b class="mono">${f1(P.pace)} s</b><small>${t('v.pace')}</small></div><div><b class="mono">${sum ? pct(sum.retention) : '—'}</b><small>${t('v.reelRet')}</small></div>`;
    const m = $('#v-math');
    if (m) m.innerHTML = `<div>τ<sub>h</sub> = 2 + 7·(1 − novelty) = <b>${f1(P.tauH)} s</b> · β = 0.15 + 0.55·novelty = <b>${f2(P.beta)}</b></div>
      <div>${t('v.gain')} = 0.6 + 1.2·reward = <b>${f2(P.gainDA)}</b> · α = <b>${f2(P.alpha)}</b>/s · τ<sub>fall</sub> = 1.2 + 3.5·focus = <b>${f1(P.tauFall)} s</b></div>
      <div>η = exp(−((NE − 0.5)/0.25)²) · NE<sub>0</sub> = <b>${f2(p.arousal)}</b> → η = <b>${f2(Math.exp(-(((p.arousal - 0.5) / 0.25) ** 2)))}</b> (Yerkes–Dodson)</div>
      <div>r = Σ wₖ·featureₖ·(0.3 + 0.7·e^(−t/τ<sub>h</sub>)) + β/√(n+1) · w<sub>face</sub> <b>${f2(P.w.face)}</b> · w<sub>colour</sub> <b>${f2(P.w.colour)}</b> · w<sub>motion</sub> <b>${f2(P.w.motion)}</b></div>`;
  }

  // ═══ SCREEN ═════════════════════════════════════════
  screenPanel() {
    const s = this.reel[this.sel];
    return `<header class="lv-head mono">${t('sc.title')}</header><p class="intro">${t('sc.intro')}</p>
      <div class="chips">${['launch', 'tuned'].map((k) => `<button class="btn seg ${this.reelName === k && this.mode === 'reel' ? 'active' : ''}" data-reel="${k}">${t('reel.' + k)}</button>`).join('')}<label class="btn seg file">⇪ ${t('sc.upload')}<input type="file" id="sc-file" accept="video/*" hidden></label></div>
      <div class="chips"><button class="btn primary" id="sc-play">${this.play.on ? '❚❚ ' + t('sc.pause') : '▶ ' + t('sc.play')}</button><button class="btn seg" id="sc-restart">↺</button></div>
      <label class="toggle"><input type="checkbox" id="sc-heat" ${this.heatOn ? 'checked' : ''}> <span>${t('sc.heat')}</span></label>
      <label class="toggle"><input type="checkbox" id="sc-gaze" ${this.gazeOn ? 'checked' : ''}> <span>${t('sc.gaze')}</span></label>
      <header class="lv-sub mono">${t('sc.viewer')}</header>${this.presetChips()}
      ${this.mode === 'reel' ? `<header class="lv-sub mono">${t('sc.shot', { n: this.sel + 1 })}</header>
      <div class="chips types">${SHOT_TYPES.map((k) => `<button class="btn seg ${s.type === k ? 'active' : ''}" data-ty="${k}" title="${t('ty.' + k)}">${ICON[k]} ${t('ty.' + k)}</button>`).join('')}</div>
      ${this.slider('sh-dur', t('sc.dur'), s.dur, 0.5, 8, 0.1, ' s')}${this.slider('sh-sat', t('sc.sat'), s.sat, 0.2, 1.4, 0.05, '×')}
      <div class="chips">${MOVES.map((k) => `<button class="btn seg ${s.move === k ? 'active' : ''}" data-mv="${k}">${t('mv.' + k)}</button>`).join('')}</div>
      <div class="chips"><button class="btn seg" id="sh-left">◀</button><button class="btn seg" id="sh-right">▶</button><button class="btn seg" id="sh-dup">＋ ${t('sc.dup')}</button><button class="btn seg" id="sh-del">✕ ${t('sc.del')}</button></div>` : `<p class="small">${t('sc.uploadNote')}</p>`}`;
  }
  screenSide() {
    return `<header class="lv-head mono">${t('sc.read')}</header><div class="bigstats four" id="sc-big"></div>
      <canvas class="cv chart" id="cv-live"></canvas><canvas class="cv chart small" id="cv-ret"></canvas>
      <header class="lv-sub mono">${t('sc.notes')}</header><ul class="events" id="sc-events"></ul>
      <div class="math mono" id="sc-math"></div>`;
  }
  bindScreen() {
    document.querySelectorAll('[data-reel]').forEach((b) => (b.onclick = () => this.loadReel(b.dataset.reel)));
    $('#sc-file').onchange = (e) => { const f = e.target.files?.[0]; if (f) this.loadVideo(f); };
    $('#sc-play').onclick = () => (this.play.on ? this.pause() : this.start());
    $('#sc-restart').onclick = () => this.restart();
    $('#sc-heat').onchange = (e) => { this.heatOn = e.target.checked; };
    $('#sc-gaze').onchange = (e) => { this.gazeOn = e.target.checked; };
    this.bindPresets();
    if (this.mode === 'reel') {
      const s = this.reel[this.sel], edit = () => { this.edits++; this.score.edited = true; this.reelName = 'custom'; clearTimeout(this.pt); this.pt = setTimeout(() => this.predict(), 200); };
      document.querySelectorAll('[data-ty]').forEach((b) => (b.onclick = () => { s.type = b.dataset.ty; edit(); this.render(); this.drawFrame(); }));
      document.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { s.move = b.dataset.mv; edit(); this.render(); }));
      $('#sh-dur').oninput = (e) => { s.dur = +e.target.value; $('#sh-dur-v').textContent = e.target.value + ' s'; edit(); this.timeline(); };
      $('#sh-sat').oninput = (e) => { s.sat = +e.target.value; $('#sh-sat-v').textContent = e.target.value + '×'; edit(); this.drawFrame(); };
      $('#sh-left').onclick = () => { if (this.sel > 0) { [this.reel[this.sel - 1], this.reel[this.sel]] = [this.reel[this.sel], this.reel[this.sel - 1]]; this.sel--; edit(); this.render(); } };
      $('#sh-right').onclick = () => { if (this.sel < this.reel.length - 1) { [this.reel[this.sel + 1], this.reel[this.sel]] = [this.reel[this.sel], this.reel[this.sel + 1]]; this.sel++; edit(); this.render(); } };
      $('#sh-dup').onclick = () => { this.reel.splice(this.sel + 1, 0, clone(s)); this.sel++; edit(); this.render(); };
      $('#sh-del').onclick = () => { if (this.reel.length > 2) { this.reel.splice(this.sel, 1); this.sel = Math.min(this.sel, this.reel.length - 1); edit(); this.render(); } };
    }
    this.timeline();
  }
  loadReel(k) { this.mode = 'reel'; this.stopVideo(); this.reel = clone(REELS[k]); this.reelName = k; this.sel = 0; this.restart(); this.predict(); if (k === 'tuned') this.checkImproved(); this.render(); sfx.select(); }
  loadVideo(file) {
    this.stopVideo(); const v = document.createElement('video'); v.src = URL.createObjectURL(file); v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.onloadeddata = () => { this.mode = 'video'; this.video = v; this.restart(); this.render(); this.caption('cap.upload'); };
  }
  stopVideo() { if (this.video) { this.video.pause(); URL.revokeObjectURL(this.video.src); this.video = null; } }
  duration() { return this.mode === 'video' && this.video ? this.video.duration || 10 : reelDuration(this.reel); }
  start() { if (this.play.t >= this.duration() - 0.05) this.restart(); this.play.on = true; if (this.video) this.video.play(); const b = $('#sc-play'); if (b) b.textContent = '❚❚ ' + t('sc.pause'); sfx.select(); }
  pause() { this.play.on = false; if (this.video) this.video.pause(); const b = $('#sc-play'); if (b) b.textContent = '▶ ' + t('sc.play'); }
  restart() { this.play.t = 0; this.play.acc = 0; this.play.lastShot = -1; this.viewer = makeViewer(this.profile); this.an.reset(); if (this.video) this.video.currentTime = 0; this.drawFrame(); this.timeline(); }
  // Draw the current frame into the film canvas; returns semantic priors.
  drawFrame() {
    const g = this.fg;
    if (this.mode === 'video' && this.video) {
      const v = this.video, ar = v.videoWidth / v.videoHeight || 16 / 9, a = FW / FH; let w = FW, h = FH; if (ar > a) h = FW / ar; else w = FH * ar;
      g.fillStyle = '#fff'; g.fillRect(0, 0, FW, FH); g.drawImage(v, (FW - w) / 2, (FH - h) / 2, w, h); return { type: 'upload', faces: [] };
    }
    const st = shotAt(this.reel, Math.min(this.play.t, this.duration() - 1e-3)); const meta = drawShot(g, FW, FH, st.s, st.ts);
    return { ...meta, type: st.s.type, shot: st.i };
  }
  // Analyse the film frame and advance the simulated viewer by one sample.
  sample(meta) {
    const stats = this.an.analyse(this.film, { faces: meta.faces || [] });
    let cut = false;
    if (this.mode === 'reel') { cut = meta.shot !== this.play.lastShot; this.play.lastShot = meta.shot; }
    else cut = stats.motion > 0.09 || this.play.acc === 0 && this.viewer.t === 0;
    const f = { ...stats, face: meta.face || 0, eyes: meta.eyes || 0, cute: meta.cute || 0, text: meta.text || 0, cut, cutMag: cut ? Math.min(1, 0.35 + stats.motion * 6) : 0, type: meta.type };
    this.viewer.step(SAMPLE, f); this.play.feat = f;
    if (this.heatOn && this.heatCv) this.an.heat(this.heatCv);
    const fx = this.an.scanpath(1)[0]; if (fx) this.play.gaze = fx;
    if (this.heatOn) this.score.heat = true;
  }
  // Offline prediction of the whole reel (same pipeline, no rendering to screen).
  predict() {
    if (this.mode !== 'reel') return;
    const cv = this.predCv || (this.predCv = Object.assign(document.createElement('canvas'), { width: FW / 2, height: FH / 2 })), g = cv.getContext('2d');
    const an = makeAnalyzer(), v = makeViewer(this.profile), T = reelDuration(this.reel); let last = -1;
    for (let tt = 0; tt < T; tt += SAMPLE) {
      const st = shotAt(this.reel, tt), meta = drawShot(g, FW / 2, FH / 2, st.s, st.ts), stats = an.analyse(cv, { faces: meta.faces || [] }), cut = st.i !== last; last = st.i;
      v.step(SAMPLE, { ...stats, face: meta.face || 0, eyes: meta.eyes || 0, cute: meta.cute || 0, text: meta.text || 0, cut, cutMag: cut ? Math.min(1, 0.35 + stats.motion * 6) : 0, type: st.s.type });
    }
    this.pred = { trace: v.trace, events: v.events, sum: v.summary(), T };
    if (this.tab === 'screen') this.timeline();
  }
  checkImproved() { const a = this.draftPred?.sum, b = this.pred?.sum; if (a && b && (b.retention > a.retention + 0.05 || b.span > a.span * 1.2)) { this.score.improved = true; } }
  // Shot strip under the film: widths ∝ duration, predicted lost moments and dopamine peaks.
  timeline() {
    const el = $('#strip'); if (!el) return;
    const T = this.duration();
    if (this.mode === 'reel') {
      let a = 0; el.innerHTML = this.reel.map((s, i) => { const w = (s.dur / T) * 100, html = `<button class="shot ${i === this.sel ? 'sel' : ''}" data-shot="${i}" style="width:${w}%"><span>${ICON[s.type]}</span><small>${f1(s.dur)}s</small></button>`; a += s.dur; return html; }).join('');
      el.querySelectorAll('[data-shot]').forEach((b) => (b.onclick = () => { this.sel = +b.dataset.shot; let a2 = 0; for (let i = 0; i < this.sel; i++) a2 += this.reel[i].dur; this.play.t = a2 + 0.01; this.render(); this.drawFrame(); }));
    } else el.innerHTML = `<div class="shot sel" style="width:100%"><span>⇪</span><small>${f1(T)}s</small></div>`;
    const mk = $('#marks'); if (mk && this.pred && this.mode === 'reel') mk.innerHTML = this.pred.events.map((e) => `<i class="mk ${e.k}" style="left:${(e.t / this.pred.T) * 100}%" title="${e.k}"></i>`).join('');
    else if (mk) mk.innerHTML = '';
  }
  screenLive(full) {
    const v = this.viewer, sum = v.summary(), T = this.duration();
    const ph = $('#playhead'); if (ph) ph.style.left = `${(this.play.t / T) * 100}%`;
    const st = $('#film-state'); if (st) { st.textContent = v.engaged ? t('sc.engaged') : t('sc.wandering'); st.className = 'state mono ' + (v.engaged ? 'on' : 'off'); }
    const tc = $('#film-tc'); if (tc) tc.textContent = `${f1(this.play.t)} / ${f1(T)} s`;
    const big = $('#sc-big');
    if (big) big.innerHTML = [[pct(sum.hook), t('sc.hook')], [`${f1(sum.span)} s`, t('sc.span')], [pct(v.S), t('sc.ret')], [v.peaks, t('sc.peaks')]].map(([b, s]) => `<div><b class="mono">${b}</b><small>${s}</small></div>`).join('');
    if (!full) return;
    const tr = v.trace.length ? v.trace : this.pred?.trace || [], src = v.trace.length ? v : null;
    const spans = []; let s0 = null; for (const p of tr) { if (!p.engaged && s0 === null) s0 = p.t; if (p.engaged && s0 !== null) { spans.push({ from: s0, to: p.t, color: 'rgba(125,107,255,.1)' }); s0 = null; } } if (s0 !== null) spans.push({ from: s0, to: tr[tr.length - 1].t, color: 'rgba(125,107,255,.1)' });
    lineChart($('#cv-live'), { x0: 0, x1: T, y0: 0, y1: 1.2, xTicks: [0, T / 2, T].map((x) => Math.round(x)), xFmt: (x) => x + 's', yFmt: (y) => y.toFixed(1), title: src ? t('sc.liveChart') : t('sc.predChart'), spans,
      series: [{ pts: tr.map((p) => [p.t, p.dmn]), color: '#7d6bff', label: 'DMN', width: 1.2 }, { pts: tr.map((p) => [p.t, Math.min(1.2, p.ne)]), color: '#ff8a3d', label: 'NE', width: 1.2 }, { pts: tr.map((p) => [p.t, Math.max(0, p.da)]), color: '#e04bd6', label: 'DA', width: 1.3 }, { pts: tr.map((p) => [p.t, p.A]), color: '#ff2f8e', label: t('sc.attn'), width: 2.4, fill: 'rgba(255,47,142,.08)' }],
      marks: [{ y: THETA, color: 'rgba(125,107,255,.6)', label: 'θ' }], now: src ? this.play.t : null });
    const P = this.pred;
    lineChart($('#cv-ret'), { x0: 0, x1: T, y0: 0, y1: 1, xTicks: [], yFmt: (y) => pct(y), title: t('sc.retChart'),
      series: [...(this.draftPred && this.draftPred !== P && this.mode === 'reel' ? [{ pts: this.draftPred.trace.map((p) => [p.t * (T / this.draftPred.T), p.S]), color: 'rgba(176,92,255,.5)', label: t('reel.launch'), width: 1.2 }] : []), ...(P && this.mode === 'reel' ? [{ pts: P.trace.map((p) => [p.t, p.S]), color: '#ff2f8e', label: t('sc.thisCut'), fill: 'rgba(255,47,142,.07)' }] : []), ...(src ? [{ pts: tr.map((p) => [p.t, p.S]), color: '#4a3550', label: t('sc.now'), width: 1.2 }] : [])] });
    const ev = (src ? v.events : P?.events || []).filter((e) => e.k !== 'peak' || (src ? true : false)).slice(-9).reverse();
    const ul = $('#sc-events'); if (ul) ul.innerHTML = ev.map((e) => `<li class="${e.k}"><b class="mono">${f1(e.t)}s</b><span>${t('ev.' + e.k, { why: e.k === 'peak' && e.why === 'cut' && e.type && e.type !== 'upload' ? t('why.cutTo', { ty: t('ty.' + e.type), d: f2(e.d) }) : t('why.' + e.why) })}${e.k === 'lost' ? `<em>${t('fix.' + e.why)}</em>` : ''}</span></li>`).join('') || `<li class="empty">${t('sc.noEvents')}</li>`;
    const f = this.play.feat, m = $('#sc-math');
    if (m && f) m.innerHTML = `<div>${t('sc.frame')}: C<sub>rms</sub> <b>${f2(f.contrast)}</b> · ${t('sc.colourful')} <b>${f0(f.colourfulness)}</b> · ${t('sc.edges')} <b>${pct(f.edgeDensity)}</b> · ${t('sc.motion')} <b>${(f.motion * 1000).toFixed(1)}</b> · ${t('sc.focus')} <b>${f2(f.focus)}</b></div>
      <div>r = <b>${f2(v.r)}</b> · V = <b>${f2(v.V)}</b> · δ = r − V = <b class="${v.delta >= 0 ? 'c-pink' : 'c-violet'}">${v.delta >= 0 ? '+' : ''}${f2(v.delta)}</b> · NE<sub>tonic</sub> <b>${f2(v.neT)}</b> · A <b>${f2(v.A)}</b></div>`;
  }
  drawGaze() {
    const o = $('#gaze'); if (!o) return;
    const show = this.gazeOn && (this.tab === 'screen' || this.tab === 'photo');
    o.style.opacity = show ? 1 : 0;
    if (show && this.tab === 'screen') { o.style.left = `${this.play.gaze.x * 100}%`; o.style.top = `${this.play.gaze.y * 100}%`; }
    $('#heat').style.opacity = (this.tab === 'screen' && this.heatOn) || (this.tab === 'photo' && this.heatOn) ? 0.75 : 0;
  }

  // ═══ PHOTO ══════════════════════════════════════════
  photoPanel() {
    return `<header class="lv-head mono">${t('ph.title')}</header><p class="intro">${t('ph.intro')}</p>
      <div class="chips types">${SHOT_TYPES.map((k) => `<button class="btn seg ${this.photo.src === k ? 'active' : ''}" data-ph="${k}">${ICON[k]} ${t('ty.' + k)}</button>`).join('')}</div>
      <div class="chips"><label class="btn primary file">⇪ ${t('ph.upload')}<input type="file" id="ph-file" accept="image/*" hidden></label></div>
      <label class="toggle"><input type="checkbox" id="ph-heat" ${this.heatOn ? 'checked' : ''}> <span>${t('sc.heat')}</span></label>
      <label class="toggle"><input type="checkbox" id="ph-gaze" ${this.gazeOn ? 'checked' : ''}> <span>${t('ph.path')}</span></label>
      <label class="toggle"><input type="checkbox" id="ph-thirds" ${this.thirdsOn ? 'checked' : ''}> <span>${t('ph.thirds')}</span></label>
      <header class="lv-sub mono">${t('sc.viewer')}</header>${this.presetChips()}`;
  }
  photoSide() { return `<header class="lv-head mono">${t('ph.read')}</header><div class="bigstats" id="ph-big"></div><div class="math mono" id="ph-math"></div><header class="lv-sub mono">${t('ph.who')}</header><div class="bars" id="ph-bars"></div><header class="lv-sub mono">${t('ph.tips')}</header><ul class="roles" id="ph-tips"></ul>`; }
  bindPhoto() {
    document.querySelectorAll('[data-ph]').forEach((b) => (b.onclick = () => { this.photo.src = b.dataset.ph; this.photo.img = null; sfx.select(); this.analysePhoto(); this.render(); }));
    $('#ph-file').onchange = (e) => { const f = e.target.files?.[0]; if (!f) return; const img = new Image(); img.onload = () => { this.photo.img = img; this.photo.src = 'upload'; this.analysePhoto(); this.render(); this.caption('cap.photoUp'); }; img.src = URL.createObjectURL(f); };
    $('#ph-heat').onchange = (e) => { this.heatOn = e.target.checked; this.analysePhoto(); };
    $('#ph-gaze').onchange = (e) => { this.gazeOn = e.target.checked; this.drawPhotoOverlay(); };
    $('#ph-thirds').onchange = (e) => { this.thirdsOn = e.target.checked; this.drawPhotoOverlay(); };
    this.bindPresets();
  }
  analysePhoto() {
    const g = this.fg; let meta = { faces: [] };
    if (this.photo.img) { const im = this.photo.img, ar = im.width / im.height, a = FW / FH; let sx = 0, sy = 0, sw = im.width, sh = im.height; if (ar > a) { sw = im.height * a; sx = (im.width - sw) / 2; } else { sh = im.width / a; sy = (im.height - sh) / 2; } g.drawImage(im, sx, sy, sw, sh, 0, 0, FW, FH); }
    else meta = drawShot(g, FW, FH, { type: this.photo.src, dur: 3, move: 'static', sat: 1 }, 1.2);
    this.an.reset();
    const stats = this.an.analyse(this.film, { faces: meta.faces || [], motionW: 0 });
    this.photo.stats = stats; this.photo.meta = meta; this.photo.comp = this.an.composition(); this.photo.path = this.an.scanpath(7);
    this.an.heat(this.heatCv); this.score.photo = true;
    this.drawPhotoOverlay();
  }
  // Static appeal of a still for a profile (no habituation, no novelty).
  appeal(profile, stats, meta, comp) {
    const w = params(profile).w, colour = Math.min(1, stats.colourfulness / 90), contrast = Math.min(1, stats.contrast / 0.8), clutter = Math.max(0, stats.edgeDensity - 0.22);
    return Math.max(0, w.face * (meta.face || 0) + w.eyes * (meta.eyes || 0) + w.colour * colour + w.contrast * contrast + w.focus * stats.focus + w.cute * (meta.cute || 0) + w.text * (meta.text || 0) - w.clutter * clutter + 0.12 * Math.max(comp.thirds, comp.centred * 0.7) + 0.06 * comp.symmetry);
  }
  // Attraction 0–100: saturating, 100·(1 − e^(−appeal/0.5)).
  score100(a) { return Math.round(100 * (1 - Math.exp(-Math.max(0, a) / 0.5))); }
  drawPhotoOverlay() {
    const o = $('#overlay'); if (!o) return;
    const r = o.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); o.width = r.width * d; o.height = r.height * d;
    const g = o.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
    if (this.tab !== 'photo') return;
    const Wd = r.width, Hd = r.height;
    if (this.thirdsOn) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.setLineDash([4, 4]); for (const u of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(Wd * u, 0); g.lineTo(Wd * u, Hd); g.moveTo(0, Hd * u); g.lineTo(Wd, Hd * u); g.stroke(); } g.setLineDash([]); }
    if (this.gazeOn && this.photo.path.length) {
      g.strokeStyle = 'rgba(255,47,142,.85)'; g.lineWidth = 1.6; g.beginPath(); this.photo.path.forEach((p, i) => (i ? g.lineTo(p.x * Wd, p.y * Hd) : g.moveTo(p.x * Wd, p.y * Hd))); g.stroke();
      this.photo.path.forEach((p, i) => { const rr = 8 + p.dur / 40; g.fillStyle = i === 0 ? '#ff2f8e' : 'rgba(255,255,255,.92)'; g.strokeStyle = '#ff2f8e'; g.beginPath(); g.arc(p.x * Wd, p.y * Hd, rr, 0, 7); g.fill(); g.stroke(); g.fillStyle = i === 0 ? '#fff' : '#ff2f8e'; g.font = '600 11px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i + 1, p.x * Wd, p.y * Hd); });
    }
  }
  photoLive() {
    const S = this.photo.stats, C = this.photo.comp, M = this.photo.meta || {}; if (!S) return;
    const mine = this.appeal(this.profile, S, M, C);
    const big = $('#ph-big'); if (big) big.innerHTML = `<div><b class="mono">${this.score100(mine)}</b><small>${t('ph.attract')}</small></div><div><b class="mono">${f2(S.focus)}</b><small>${t('sc.focus')}</small></div><div><b class="mono">${Math.round(this.photo.path[0]?.dur || 0)} ms</b><small>${t('ph.fix1')}</small></div>`;
    const m = $('#ph-math');
    if (m) m.innerHTML = `<div>${t('sc.colourful')} M = √(σ²<sub>rg</sub> + σ²<sub>yb</sub>) + 0.3·√(μ²<sub>rg</sub> + μ²<sub>yb</sub>) = <b>${f0(S.colourfulness)}</b> (${S.colourfulness < 15 ? t('ph.c0') : S.colourfulness < 45 ? t('ph.c1') : S.colourfulness < 80 ? t('ph.c2') : t('ph.c3')})</div>
      <div>C<sub>rms</sub> = σ<sub>L</sub>/μ<sub>L</sub> = <b>${f2(S.contrast)}</b> · ${t('sc.edges')} <b>${pct(S.edgeDensity)}</b> · H(S)/H<sub>max</sub> = <b>${f2(S.entropy)}</b> → ${t('sc.focus')} <b>${f2(S.focus)}</b></div>
      <div>${t('ph.thirdsFit')} <b>${pct(C.thirds)}</b> · ${t('ph.centred')} <b>${pct(C.centred)}</b> · ${t('ph.sym')} <b>${pct(C.symmetry)}</b> · ${t('ph.faceP')} <b>${M.face ? t('ph.yes') : this.photo.img ? t('ph.unknown') : t('ph.no')}</b></div>`;
    const bars = $('#ph-bars');
    if (bars) { const rows = [[t('ph.you'), mine, true], ...Object.keys(PRESETS).map((k) => [t('pre.' + k), this.appeal(PRESETS[k], S, M, C), false])]; bars.innerHTML = rows.map(([n, v, me]) => `<div class="bar ${me ? 'me' : ''}"><span>${n}</span><i style="width:${this.score100(v)}%"></i><b class="mono">${this.score100(v)}</b></div>`).join(''); }
    const tips = []; if (C.thirds < 0.4 && C.centred < 0.5) tips.push('thirds'); if (S.focus < 0.3) tips.push('clutter'); if (S.colourfulness < 25) tips.push('colour'); if (S.contrast < 0.2) tips.push('contrast'); if (!M.face && this.profile.faces > 0.6) tips.push('face'); if (!tips.length) tips.push('good');
    const tl = $('#ph-tips'); if (tl) tl.innerHTML = tips.map((k) => `<li><b>${t('tip.' + k)}</b><span>${t('tip.' + k + '.d')}</span></li>`).join('');
  }

  // ── Input / frame ──────────────────────────────────
  pointerDown(e) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.last = performance.now(); }
  pointerMove(e) { const v = this.view; if (!v.drag) return; v.yaw -= (e.clientX - v.drag.x) * 0.006; v.pitch = Math.max(-0.6, Math.min(0.9, v.pitch + (e.clientY - v.drag.y) * 0.004)); v.drag.x = e.clientX; v.drag.y = e.clientY; v.last = performance.now(); }
  pointerUp() { this.view.drag = null; }
  wheel(e) { this.view.r = Math.max(3.5, Math.min(11, this.view.r * Math.exp(e.deltaY * 0.001))); this.view.last = performance.now(); }
  key(k) { if (k === ' ' && this.tab === 'screen') this.play.on ? this.pause() : this.start(); }

  update(dt, time) {
    // Playback (fixed 10 Hz analysis so the model is deterministic).
    if (this.tab === 'screen' && this.play.on) {
      this.play.t += dt; this.play.acc += dt; const T = this.duration();
      const meta = this.drawFrame();
      while (this.play.acc >= SAMPLE) { this.play.acc -= SAMPLE; this.sample(meta); }
      if (this.play.t >= T) { this.play.t = T; this.pause(); this.score.screened = true; this.app.feed.push('sc.done', 'ok', { r: pct(this.viewer.S) }); this.render(); }
    } else if (this.tab === 'screen' && this.mode === 'reel') {
      // Keep procedural shots alive when paused (blinks, sweeps) without advancing the model.
      const st = shotAt(this.reel, Math.min(this.play.t, this.duration() - 1e-3)); drawShot(this.fg, FW, FH, st.s, st.ts + (time % 4));
    }
    // Brain activity: live viewer when screening; otherwise a gentle idle rhythm.
    let act = this.viewer.act;
    if (!(this.tab === 'screen' && this.viewer.t > 0)) { this.idle += dt; act = {}; REGIONS.forEach((k, i) => { act[k] = 0.22 + 0.18 * Math.sin(this.idle * 0.8 + i * 1.3) ** 2; }); }
    const dim = this.tab === 'screen' || this.tab === 'photo' ? 0.55 : 1;
    this.B.update(dt, time, act, { dim });
    this.rings.forEach((r, i) => (r.rotation.y += dt * (0.05 + i * 0.03) * (i % 2 ? -1 : 1)));
    this.motes.rotation.y += dt * 0.01;
    // Camera: brain centred between the panels on Brain/Viewer; raised and pushed back behind the film.
    const v = this.view; if (!v.drag && performance.now() - v.last > 4000) v.yaw += dt * 0.12;
    const behind = this.tab === 'screen' || this.tab === 'photo';
    v.offset += ((behind ? 1 : 0) - v.offset) * Math.min(1, dt * 2.5);
    const r = v.r + v.offset * 3.5, tgt = new THREE.Vector3(0, -0.1 - v.offset * 0.9, 0);
    this.cam.position.set(tgt.x + Math.sin(v.yaw) * Math.cos(v.pitch) * r, tgt.y + Math.sin(v.pitch) * r, tgt.z + Math.cos(v.yaw) * Math.cos(v.pitch) * r);
    this.cam.lookAt(tgt); this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    this.labels();
    this.drawGaze();
    this.uiT += dt; this.uiSlow += dt;
    if (this.uiT > 0.1) { this.uiT = 0; const full = this.uiSlow > 0.35; if (full) this.uiSlow = 0; this.refresh(full); }
  }
  // Region labels projected from 3D (Brain tab only).
  labels() {
    const host = $('#labels'); if (!host) return;
    if (this.tab !== 'brain' || !this.entered) { host.innerHTML = ''; return; }
    if (!host.children.length) host.innerHTML = Object.keys(REGION_DEF).map((k) => `<span class="rl" data-rl="${k}" style="--c:${SYS_COL[REGION_DEF[k].sys]}">${t('r.' + k)}</span>`).join('');
    const v = new THREE.Vector3();
    for (const el of host.children) {
      const k = el.dataset.rl, n = this.B.nodes[k][0]; v.copy(n.p).applyMatrix4(this.B.group.matrixWorld).project(this.cam);
      el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`;
      el.classList.toggle('on', this.B.focus === k); el.style.opacity = this.B.focus && this.B.focus !== k ? 0.25 : 1;
    }
  }
  refresh(full) {
    if (!this.entered) return;
    if (this.tab === 'brain' && full) { const b = $('#b-bars'); if (b) { const act = this.viewer.t > 0 ? this.viewer.act : null; b.innerHTML = act ? REGIONS.map((k) => `<div class="bar"><span>${t('r.' + k)}</span><i style="width:${Math.round(act[k] * 100)}%;--c:${SYS_COL[REGION_DEF[k].sys]}"></i></div>`).join('') : `<p class="small">${t('b.liveHint')}</p>`; } }
    if (this.tab === 'viewer' && full && !this.viewerDrawn) { this.viewerLive(); this.viewerDrawn = true; setTimeout(() => (this.viewerDrawn = false), 400); }
    if (this.tab === 'screen') this.screenLive(full);
    if (this.tab === 'photo' && full) this.photoLive();
  }

  showReport() {
    const S = this.score, P = this.pred?.sum;
    const rows = [[t('rep.atlas', { n: this.atlasSeen.size }), S.atlas], [t('rep.schultz'), S.schultz], [t('rep.profile'), S.profile], [t('rep.screened'), S.screened], [t('rep.heat'), S.heat], [t('rep.edited'), S.edited], [t('rep.improved'), S.improved], [t('rep.photo'), S.photo]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k, { span: P ? f1(P.span) : '—', ret: P ? pct(P.retention) : '—' }); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
export { AW, AH };
