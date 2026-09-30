import * as THREE from 'three';
import { SENSORS, T_STOPS, LENSES, FRAMINGS, cocLimit, fovH, fovV, hyperfocal, dof, blurCircle, shutterTime, ev100, focalForFraming, frameHeightAt, kelvinRGB, lux, stopsRatio } from './sim/optics.js';
import { DURATION, LINES, LINE_LEN, CAM_IDS, defaultCams, targetPoint, actorAt, speakingAt, side, analyse, EYE } from './sim/blocking.js';
import { buildSet, poseActor } from './view/set.js';
import { lineChart } from './view/charts.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTOR'S CHAIR · the app: set & blocking, camera & lens, light, cut.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s, r = document) => r.querySelector(s);
const t = (k, v) => i18n.t(k, v);
const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '∞'), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '∞'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '∞');
const deg = (r) => (r * 180) / Math.PI;
const K_METER = 250;                                            // incident-meter calibration constant (lux·s)
// With physical light units a grey card of reflectance ρ under the metered E gives
// pixel = ρ·E·t·ISO/(C·N²) = ρ at the metered stop, so no fudge factor is needed.
const EXPOSURE_GAIN = 1;
const CAM_COL = { A: '#3ff3ff', B: '#ffb86b', C: '#5dffa8' };
const SUBJECT = new THREE.Vector3(-0.9, 1.3, 1.9);              // centre of the dialogue for the light plot
export const LIGHT_PRESETS = {
  noir: { key: { az: 55, el: 38, d: 3.8, lux: 55, K: 3200 }, fill: { az: -70, el: 15, d: 4.5, lux: 6, K: 5600 }, back: { az: 170, el: 40, d: 4, lux: 70, K: 5600 }, neon: 1 },
  beauty: { key: { az: 25, el: 30, d: 3.2, lux: 260, K: 4300 }, fill: { az: -35, el: 10, d: 3.5, lux: 130, K: 4300 }, back: { az: 160, el: 35, d: 4, lux: 120, K: 5600 }, neon: 0.5 },
  neon: { key: { az: 90, el: 20, d: 5, lux: 25, K: 6500 }, fill: { az: -90, el: 10, d: 5, lux: 8, K: 6500 }, back: { az: 180, el: 30, d: 5, lux: 30, K: 9000 }, neon: 1.6 },
  golden: { key: { az: 70, el: 12, d: 4, lux: 300, K: 2600 }, fill: { az: -50, el: 10, d: 4, lux: 60, K: 3200 }, back: { az: 190, el: 20, d: 4, lux: 220, K: 2400 }, neon: 0.3 },
};

export class Director {
  constructor(app) {
    this.app = app;
    this.set = buildSet();
    this.scene = this.set.scene;
    this.god = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 900);
    this.lens = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 900);
    this.scene.add(this.god, this.lens);
    this.orbit = { yaw: 0.6, pitch: 0.85, r: 27, target: new THREE.Vector3(0, 0, 0), drag: null, last: 0 };
    this.cams = defaultCams(); this.sel = 'A';
    this.lensSet = { A: { N: 2, focus: 'two', manual: 4 }, B: { N: 2, focus: 'kane', manual: 3 }, C: { N: 2, focus: 'iris', manual: 3 } };
    this.body = { sensor: 's35', anamorphic: false, aspect: '2.39', fps: 24, angle: 180, iso: 800, nd: 0, wb: 4300, guides: true, falseColor: false };
    this.light = JSON.parse(JSON.stringify(LIGHT_PRESETS.noir)); this.lightPreset = 'noir';
    this.t = 0; this.playing = false; this.rain = true;
    this.edl = [{ cam: 'A', t: 0 }]; this.live = false; this.review = false;
    this.takes = []; this.tab = 'set'; this.entered = false; this.uiT = 0; this.dz = null;
    this.score = { blocked: false, lens: false, dof: false, light: false, meter: false, cut: false, clean: false, dolly: false, take: false };
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    app.stage.use(this.scene, this.god);
    this.applyLights(); this.update(0, 0);
  }

  // The image area actually recorded (mm on the sensor): a spherical 2.39 frame crops the height
  // (h = w/aspect); a 2× anamorphic uses the full height and crops the sides (w = h·aspect/2).
  // All framing, field-of-view and circle-of-confusion math uses this area.
  get S() { const S = SENSORS[this.body.sensor], h = Math.min(S.h, (S.w * this.squeeze) / this.aspect); return { ...S, h, w: (h * this.aspect) / this.squeeze }; }
  get squeeze() { return this.body.anamorphic ? 2 : 1; }
  get aspect() { return this.body.anamorphic ? 2.39 : +this.body.aspect; }
  focusDist(id, time = this.t) {
    const c = this.cams[id], L = this.lensSet[id];
    if (L.focus === 'manual') return L.manual;
    const p = L.focus === 'two' ? targetPoint({ ...c, target: 'two' }, time) : (() => { const a = actorAt(L.focus, time); return { x: a.x, y: EYE, z: a.z }; })();
    return Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(tab) {
    this.tab = tab; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.body.dataset.tab = tab;
    this.app.stage.use(this.scene, tab === 'set' ? this.god : this.lens);
    if (tab === 'cut') this.review = true;
    this.render(); this.caption('cap.' + tab);
  }
  caption(key, vars) { const c = $('#caption'); if (!c) return; c.textContent = t(key, vars); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  render() {
    const P = { set: ['setPanel', 'setSide', 'bindSet'], camera: ['camPanel', 'camSide', 'bindCam'], light: ['lightPanel', 'lightSide', 'bindLight'], cut: ['cutPanel', 'cutSide', 'bindCut'] }[this.tab];
    $('#panel').innerHTML = this[P[0]](); $('#side').innerHTML = this[P[1]](); this[P[2]]();
    this.refresh(true);
  }
  transport() {
    return `<div class="transport"><button class="btn seg" id="tp-play">${this.playing ? '❚❚' : '▶'}</button><button class="btn seg" id="tp-back">⏮</button>
      <input type="range" id="tp-t" min="0" max="${DURATION}" step="0.05" value="${this.t}"><b class="mono" id="tp-tc">00:00:00</b></div>`;
  }
  bindTransport() {
    $('#tp-play').onclick = () => this.togglePlay();
    $('#tp-back').onclick = () => { this.t = 0; this.playing = false; this.render(); };
    $('#tp-t').oninput = (e) => { this.t = +e.target.value; this.playing = false; };
  }
  togglePlay() { this.playing = !this.playing; if (this.playing && this.t >= DURATION - 0.05) this.t = 0; const b = $('#tp-play'); if (b) b.textContent = this.playing ? '❚❚' : '▶'; sfx.select(); }
  camChips() { return `<div class="chips cams">${CAM_IDS.map((id) => `<button class="btn seg cam ${this.sel === id ? 'active' : ''}" data-cam="${id}" style="--c:${CAM_COL[id]}">${t('cam')} ${id}</button>`).join('')}</div>`; }
  bindCamChips() { document.querySelectorAll('[data-cam]').forEach((b) => (b.onclick = () => { this.sel = b.dataset.cam; this.render(); })); }

  // ═══ SET ═══════════════════════════════════════════
  setPanel() {
    const c = this.cams[this.sel];
    return `<header class="lv-head mono">${t('s.title')}</header><p class="intro">${t('s.intro')}</p>
      ${this.transport()}
      <header class="lv-sub mono">${t('s.cams')}</header>${this.camChips()}
      <p class="small">${t('s.place')}</p>
      <div class="chips">${['two', 'iris', 'kane'].map((k) => `<button class="btn seg ${c.target === k ? 'active' : ''}" data-tgt="${k}">${t('tgt.' + k)}</button>`).join('')}</div>
      <label class="sl"><span>${t('s.height')}</span><b class="mono" id="s-h-v">${c.y.toFixed(2)} m</b><em></em><input type="range" id="s-h" min="0.3" max="4" step="0.05" value="${c.y}"></label>
      <div class="kv mono" id="s-kv"></div>
      <header class="lv-sub mono">${t('s.script')}</header>
      <ol class="script">${LINES.map((l) => `<li data-line="${l.t}"><b>${t('who.' + l.who)}</b> <span>${t('line.' + l.k)}</span><em class="mono">${f1(l.t)}s</em></li>`).join('')}</ol>`;
  }
  setSide() {
    return `<header class="lv-head mono">${t('s.rules')}</header>
      <ul class="roles"><li><b>${t('r.180')}</b><span>${t('r.180.d')}</span></li><li><b>${t('r.30')}</b><span>${t('r.30.d')}</span></li><li><b>${t('r.cover')}</b><span>${t('r.cover.d')}</span></li></ul>
      <header class="lv-sub mono">${t('s.sides')}</header><div class="kv mono" id="s-sides"></div>
      <label class="toggle"><input type="checkbox" id="s-rain" ${this.rain ? 'checked' : ''}> <span>${t('s.rain')}</span></label>`;
  }
  bindSet() {
    this.bindTransport(); this.bindCamChips();
    document.querySelectorAll('[data-tgt]').forEach((b) => (b.onclick = () => { this.cams[this.sel].target = b.dataset.tgt; this.render(); }));
    $('#s-h').oninput = (e) => { this.cams[this.sel].y = +e.target.value; $('#s-h-v').textContent = `${(+e.target.value).toFixed(2)} m`; };
    $('#s-rain').onchange = (e) => { this.rain = e.target.checked; };
  }
  moveCam(x, z) {
    const c = this.cams[this.sel]; c.x = Math.max(-15, Math.min(15, x)); c.z = Math.max(-10.5, Math.min(10.5, z)); this.score.blocked = true; sfx.select();
  }
  setLive(full) {
    const c = this.cams[this.sel], d = this.focusDist(this.sel);
    const kv = $('#s-kv'); if (kv) kv.innerHTML = `<span>${t('s.pos')}</span><b>${f1(c.x)}, ${f1(c.z)} m</b><span>${t('s.dist')}</span><b>${f2(d)} m</b><span>${t('c.lens')}</span><b>${c.f} mm</b><span>${t('s.side')}</span><b class="${side(c, this.t) === side(this.cams.A, this.t) ? 'c-green' : 'c-red'}">${side(c, this.t) > 0 ? t('s.sideR') : t('s.sideL')}</b>`;
    if (!full) return;
    const sd = $('#s-sides'); if (sd) sd.innerHTML = CAM_IDS.map((id) => `<span style="color:${CAM_COL[id]}">${t('cam')} ${id}</span><b>${side(this.cams[id], this.t) > 0 ? t('s.sideR') : t('s.sideL')}</b>`).join('');
    const sp = speakingAt(this.t); document.querySelectorAll('[data-line]').forEach((li) => li.classList.toggle('on', sp && +li.dataset.line === sp.t));
  }

  // ═══ CAMERA ════════════════════════════════════════
  camPanel() {
    const c = this.cams[this.sel], L = this.lensSet[this.sel], B = this.body;
    return `<header class="lv-head mono">${t('c.title')}</header>${this.camChips()}${this.transport()}
      <header class="lv-sub mono">${t('c.lens')}</header>
      <div class="chips lenses">${LENSES.map((f) => `<button class="btn seg ${c.f === f ? 'active' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
      <label class="sl"><span>${t('c.focal')}</span><b class="mono" id="c-f-v">${c.f} mm</b><em></em><input type="range" id="c-f" min="12" max="200" step="1" value="${c.f}"></label>
      <div class="chips">${Object.keys(FRAMINGS).map((k) => `<button class="btn seg" data-frm="${k}">${t('frm.' + k)}</button>`).join('')}</div>
      <header class="lv-sub mono">${t('c.aperture')}</header>
      <div class="chips">${T_STOPS.map((n) => `<button class="btn seg ${L.N === n ? 'active' : ''}" data-n="${n}">T${n}</button>`).join('')}</div>
      <header class="lv-sub mono">${t('c.focus')}</header>
      <div class="chips">${['iris', 'kane', 'two', 'manual'].map((k) => `<button class="btn seg ${L.focus === k ? 'active' : ''}" data-fc="${k}">${t('fc.' + k)}</button>`).join('')}</div>
      <label class="sl ${L.focus === 'manual' ? '' : 'dim'}"><span>${t('c.manual')}</span><b class="mono" id="c-m-v">${f2(L.manual)} m</b><em></em><input type="range" id="c-m" min="0.5" max="30" step="0.05" value="${L.manual}"></label>
      <header class="lv-sub mono">${t('c.body')}</header>
      <div class="chips">${Object.keys(SENSORS).map((k) => `<button class="btn seg ${B.sensor === k ? 'active' : ''}" data-sn="${k}">${SENSORS[k].name}</button>`).join('')}</div>
      <label class="toggle"><input type="checkbox" id="c-ana" ${B.anamorphic ? 'checked' : ''}> <span>${t('c.ana')}</span></label>
      <div class="chips">${['2.39', '1.85', '1.78'].map((a) => `<button class="btn seg ${this.aspect.toFixed(2) === (+a).toFixed(2) ? 'active' : ''}" data-ar="${a}" ${B.anamorphic ? 'disabled' : ''}>${a}:1</button>`).join('')}</div>
      <div class="chips"><button class="btn seg" id="c-dz">${t('c.dolly')}</button><button class="btn primary" id="c-take">● ${t('c.take')}</button></div>`;
  }
  camSide() {
    return `<header class="lv-head mono">${t('c.optics')}</header><div class="math mono" id="c-math"></div>
      <canvas class="cv chart" id="cv-dof"></canvas>
      <header class="lv-sub mono">${t('c.takes')}</header><div class="takes" id="c-takes"></div>`;
  }
  bindCam() {
    this.bindCamChips(); this.bindTransport();
    const c = this.cams[this.sel], L = this.lensSet[this.sel];
    document.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { c.f = +b.dataset.f; this.score.lens = true; sfx.select(); this.render(); }));
    $('#c-f').oninput = (e) => { c.f = +e.target.value; $('#c-f-v').textContent = `${c.f} mm`; this.score.lens = true; };
    document.querySelectorAll('[data-frm]').forEach((b) => (b.onclick = () => this.frame(b.dataset.frm)));
    document.querySelectorAll('[data-n]').forEach((b) => (b.onclick = () => { L.N = +b.dataset.n; if (L.N <= 2) this.score.dof = true; sfx.select(); this.render(); }));
    document.querySelectorAll('[data-fc]').forEach((b) => (b.onclick = () => { L.focus = b.dataset.fc; sfx.select(); this.render(); }));
    $('#c-m').oninput = (e) => { L.manual = +e.target.value; $('#c-m-v').textContent = `${f2(L.manual)} m`; };
    document.querySelectorAll('[data-sn]').forEach((b) => (b.onclick = () => { this.body.sensor = b.dataset.sn; this.render(); }));
    $('#c-ana').onchange = (e) => { this.body.anamorphic = e.target.checked; this.render(); };
    document.querySelectorAll('[data-ar]').forEach((b) => (b.onclick = () => { this.body.aspect = b.dataset.ar; this.render(); }));
    $('#c-dz').onclick = () => this.dollyZoom();
    $('#c-take').onclick = () => this.recordTake();
    this.renderTakes();
  }
  frame(k) {
    const c = this.cams[this.sel], p = targetPoint(c, this.t), d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    c.f = Math.round(Math.max(12, Math.min(200, focalForFraming(this.S, d, FRAMINGS[k]))));
    this.score.lens = true; sfx.confirm(); this.app.feed.push('c.framed', 'ok', { k: t('frm.' + k), f: c.f, d: f2(d) }); this.render();
  }
  // Dolly zoom: move toward the subject while zooming out, keeping its size: f₂ = f₁·d₂/d₁.
  dollyZoom() {
    const c = this.cams[this.sel], p = targetPoint(c, this.t), d1 = Math.hypot(p.x - c.x, p.z - c.z);
    this.dz = { t: 0, dur: 4, from: { x: c.x, z: c.z, f: c.f }, p, d1, d2: Math.max(1.4, d1 * 0.35) };
    this.score.dolly = true; this.caption('cap.dolly'); sfx.valve?.();
  }
  recordTake() {
    const id = this.sel, c = this.cams[id], L = this.lensSet[id];
    this.app.stage.render(this.app.state.time, 0);
    const src = this.app.stage.renderer.domElement, fr = this.frameRect();
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = Math.round(320 / this.aspect);
    const pr = this.app.stage.renderer.getPixelRatio();
    cv.getContext('2d').drawImage(src, fr.x * pr, fr.y * pr, fr.w * pr, fr.h * pr, 0, 0, cv.width, cv.height);
    this.takes.unshift({ img: cv.toDataURL('image/jpeg', 0.8), meta: `${id} · ${c.f}mm · T${L.N} · ${f2(this.focusDist(id))}m · ${this.body.iso} ISO`, n: this.takes.length + 1 });
    if (this.takes.length > 6) this.takes.pop();
    this.score.take = true; this.app.stage.flash('#ffffff'); sfx.confirm(); this.renderTakes();
  }
  renderTakes() { const b = $('#c-takes'); if (b) b.innerHTML = this.takes.map((k) => `<figure><img src="${k.img}" alt=""><figcaption class="mono">${t('c.takeN', { n: k.n })} · ${k.meta}</figcaption></figure>`).join('') || `<p class="small">${t('c.noTakes')}</p>`; }
  camLive(full) {
    if (!full) return;
    const c = this.cams[this.sel], L = this.lensSet[this.sel], S = this.S, coc = cocLimit(S), s = this.focusDist(this.sel), D = dof(c.f, L.N, coc, s);
    const tt = shutterTime(this.body.angle, this.body.fps), H = hyperfocal(c.f, L.N, coc) / 1000;
    const m = $('#c-math');
    if (m) m.innerHTML = `
      <div>FOV = 2·atan(w/2f) = 2·atan(${f2(S.w * this.squeeze)}/(2·${c.f})) = <b>${f1(deg(fovH(S, c.f, this.squeeze)))}° × ${f1(deg(fovV(S, c.f)))}°</b></div>
      <div>c = d<sub>image</sub>/1500 = ${f1(Math.hypot(S.w, S.h))}/1500 = <b>${coc.toFixed(4)} mm</b></div>
      <div>H = f²/(N·c) + f = ${c.f}²/(${L.N}·${coc.toFixed(4)}) + ${c.f} = <b>${f2(H)} m</b></div>
      <div>${t('c.focusAt')} s = <b>${f2(s)} m</b> → ${t('c.near')} <b>${f2(D.near)} m</b> · ${t('c.far')} <b>${f2(D.far)} m</b> · DOF <b>${Number.isFinite(D.total) ? f2(D.total * 100) + ' cm' : '∞'}</b></div>
      <div>${t('c.frameH')} h = d·S<sub>h</sub>/f = <b>${f2(frameHeightAt(S, c.f, s))} m</b></div>
      <div>t = (${this.body.angle}°/360°)/${this.body.fps} fps = <b>1/${f0(1 / tt)} s</b> · EV₁₀₀ = log₂(N²/t) − log₂(ISO/100) = <b>${f1(ev100(L.N, tt, this.body.iso))}</b></div>
      ${this.body.anamorphic ? `<div>${t('c.anaNote')}</div>` : ''}`;
    // Blur-circle curve vs distance.
    const cv = $('#cv-dof');
    if (cv) {
      const pts = []; for (let d = 0.5; d <= 30; d += 0.1) pts.push([d, blurCircle(c.f, L.N, s, d) * 1000]);
      lineChart(cv, { x0: 0, x1: 30, y0: 0, y1: Math.max(coc * 4000, 40), xTicks: [0, 5, 10, 20, 30], xFmt: (v) => v + (v === 30 ? ' m' : ''), yFmt: (v) => Math.round(v), title: t('c.blurChart'),
        series: [{ pts, color: '#ff4fd8', label: 'b (µm)' }], marks: [{ y: coc * 1000, color: 'rgba(93,255,168,.8)', label: `c = ${f0(coc * 1000)} µm` }, { x: s, color: '#3ff3ff', label: 's' }],
        bands: Number.isFinite(D.far) ? [{ from: D.near, to: D.far, color: 'rgba(93,255,168,.1)' }] : [{ from: D.near, to: 30, color: 'rgba(93,255,168,.1)' }] });
    }
  }

  // ═══ LIGHT ═════════════════════════════════════════
  lightPanel() {
    const Lg = this.light, B = this.body, sl = (grp, k, min, max, step, unit) => `<label class="sl"><span>${t('l.' + k)}</span><b class="mono" data-lv="${grp}.${k}">${Lg[grp][k]}${unit}</b><em></em><input type="range" data-lk="${grp}.${k}" min="${min}" max="${max}" step="${step}" value="${Lg[grp][k]}"></label>`;
    return `<header class="lv-head mono">${t('l.title')}</header><p class="intro">${t('l.intro')}</p>${this.camChips()}
      <div class="chips">${Object.keys(LIGHT_PRESETS).map((k) => `<button class="btn seg ${this.lightPreset === k ? 'active' : ''}" data-lp="${k}">${t('lp.' + k)}</button>`).join('')}</div>
      ${['key', 'fill', 'back'].map((g) => `<header class="lv-sub mono">${t('l.' + g)}</header>${sl(g, 'lux', 0, 800, 1, ' lx')}${sl(g, 'az', -180, 180, 1, '°')}${sl(g, 'K', 2000, 10000, 100, ' K')}`).join('')}
      <label class="sl"><span>${t('l.neon')}</span><b class="mono" data-lv="neon">${Lg.neon}×</b><em></em><input type="range" data-lk="neon" min="0" max="2" step="0.05" value="${Lg.neon}"></label>`;
  }
  lightSide() {
    const B = this.body;
    return `<header class="lv-head mono">${t('l.meter')}</header>
      <div class="chips"><span class="small">ISO</span>${[400, 800, 1600, 3200].map((i) => `<button class="btn seg ${B.iso === i ? 'active' : ''}" data-iso="${i}">${i}</button>`).join('')}</div>
      <div class="chips"><span class="small">ND</span>${[0, 0.3, 0.6, 0.9, 1.2].map((n) => `<button class="btn seg ${Math.abs(B.nd - n / 0.3) < 0.01 ? 'active' : ''}" data-nd="${n}">${n.toFixed(1)}</button>`).join('')}</div>
      <label class="sl"><span>${t('l.shutter')}</span><b class="mono" id="l-ang-v">${B.angle}°</b><em></em><input type="range" id="l-ang" min="45" max="360" step="1" value="${B.angle}"></label>
      <label class="sl"><span>${t('l.wb')}</span><b class="mono" id="l-wb-v">${B.wb} K</b><em></em><input type="range" id="l-wb" min="2500" max="9000" step="100" value="${B.wb}"></label>
      <label class="toggle"><input type="checkbox" id="l-false" ${B.falseColor ? 'checked' : ''}> <span>${t('l.false')}</span></label>
      <div class="legend-fc mono small"><i style="background:#7300a0"></i>0–3 <i style="background:#0033e6"></i>3–10 <i style="background:#1ad933"></i>40–48 (18%) <i style="background:#ff8cb3"></i>55–62 ${t('l.skin')} <i style="background:#ffe600"></i>93–98 <i style="background:#ff1a1a"></i>${t('l.clip')}</div>
      <div class="math mono" id="l-math"></div>
      <canvas class="cv plot" id="cv-plot"></canvas>`;
  }
  bindLight() {
    this.bindCamChips();
    document.querySelectorAll('[data-lp]').forEach((b) => (b.onclick = () => { this.light = JSON.parse(JSON.stringify(LIGHT_PRESETS[b.dataset.lp])); this.lightPreset = b.dataset.lp; this.score.light = true; this.applyLights(); this.render(); this.caption('cap.lp.' + b.dataset.lp); }));
    document.querySelectorAll('[data-lk]').forEach((el) => (el.oninput = () => {
      const [g, k] = el.dataset.lk.split('.'); if (k) this.light[g][k] = +el.value; else this.light[g] = +el.value;
      const lab = $(`[data-lv="${el.dataset.lk}"]`); if (lab) lab.textContent = el.value + (k === 'lux' ? ' lx' : k === 'K' ? ' K' : k ? '°' : '×');
      this.lightPreset = null; this.score.light = true; this.applyLights();
    }));
    document.querySelectorAll('[data-iso]').forEach((b) => (b.onclick = () => { this.body.iso = +b.dataset.iso; this.render(); }));
    document.querySelectorAll('[data-nd]').forEach((b) => (b.onclick = () => { this.body.nd = +b.dataset.nd / 0.3; this.render(); }));
    $('#l-ang').oninput = (e) => { this.body.angle = +e.target.value; $('#l-ang-v').textContent = `${this.body.angle}°`; };
    $('#l-wb').oninput = (e) => { this.body.wb = +e.target.value; $('#l-wb-v').textContent = `${this.body.wb} K`; };
    $('#l-false').onchange = (e) => { this.body.falseColor = e.target.checked; this.score.meter = true; };
  }
  // Place each fixture around the subject; SpotLight intensity (cd) = E · d² for the requested lux.
  // Azimuth 0° points from the subject toward the camera side of the line (−z), 180° is behind.
  applyLights() {
    const Lg = this.light, S = this.set;
    for (const k of ['key', 'fill', 'back']) {
      const L = Lg[k], a = (L.az * Math.PI) / 180, e = (L.el * Math.PI) / 180;
      const pos = new THREE.Vector3(SUBJECT.x + Math.sin(a) * Math.cos(e) * L.d, SUBJECT.y + Math.sin(e) * L.d, SUBJECT.z - Math.cos(a) * Math.cos(e) * L.d);
      const sp = S.lights[k]; sp.position.copy(pos); sp.target.position.copy(SUBJECT);
      sp.intensity = L.lux * L.d * L.d; sp.color.setRGB(...kelvinRGB(L.K));
      sp.angle = k === 'fill' ? 0.75 : 0.5; sp.penumbra = k === 'fill' ? 1 : 0.55;
      const fx = S.fixtures[k]; fx.head.position.copy(pos); fx.head.lookAt(SUBJECT); fx.lens.position.copy(pos); fx.lens.material.color.setRGB(...kelvinRGB(L.K));
      fx.stand.position.set(pos.x, pos.y / 2, pos.z); fx.stand.scale.y = pos.y;
    }
    S.neonPink.intensity = 12 * Lg.neon; S.neonTeal.intensity = 9 * Lg.neon;
  }
  // Illuminance on the subject from each light (cosine-weighted for a face turned toward the camera axis).
  meter() {
    const Lg = this.light, B = this.body, L = this.lensSet[this.sel];
    const E = {}; for (const k of ['key', 'fill', 'back']) E[k] = Lg[k].lux;
    const incident = E.key + E.fill;                         // what an incident meter at the face reads
    const tt = shutterTime(B.angle, B.fps);
    const Nmeter = Math.sqrt((incident * tt * B.iso) / (K_METER * 2 ** B.nd));
    const dev = 2 * Math.log2(Nmeter / L.N);               // + = over-exposed by this many stops
    return { E, incident, tt, Nmeter, dev, ratio: (E.key + E.fill) / Math.max(1e-6, E.fill), stops: stopsRatio(E.key, E.fill) };
  }
  lightLive(full) {
    if (!full) return;
    const M = this.meter(), B = this.body, L = this.lensSet[this.sel];
    const m = $('#l-math');
    if (m) m.innerHTML = `
      <div>E = I/d² → ${t('l.key')} ${f0(M.E.key)} lx · ${t('l.fill')} ${f0(M.E.fill)} lx · ${t('l.back')} ${f0(M.E.back)} lx</div>
      <div>${t('l.ratio')} (K+F):F = <b>${f1(M.ratio)}:1</b> = <b>${f1(M.stops)} ${t('l.stops')}</b></div>
      <div>N = √(E·t·ISO/C), C = 250 → √(${f0(M.incident)}·${M.tt.toFixed(4)}·${B.iso}/${K_METER}${B.nd ? '·2^' + f1(B.nd) : ''}) = <b>T${f1(M.Nmeter)}</b></div>
      <div class="${Math.abs(M.dev) < 0.5 ? 'c-green' : M.dev > 0 ? 'c-amber' : 'c-red'}">${t('l.set')} T${L.N} → <b>${M.dev >= 0 ? '+' : ''}${f1(M.dev)} ${t('l.stops')}</b> ${Math.abs(M.dev) < 0.5 ? t('l.ok') : M.dev > 0 ? t('l.over') : t('l.under')}</div>
      <div>${t('l.blur')}: ${t('l.exposure')} 1/${f0(1 / M.tt)} s</div>`;
    if (Math.abs(M.dev) < 0.5) this.score.meter = true;
    // Light plot (top view).
    const cv = $('#cv-plot'); if (!cv) return;
    const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d;
    const g = cv.getContext('2d'); g.scale(d, d); const W = r.width, H = r.height, k = Math.min(W, H) / 16, X = (x) => W / 2 + (x - SUBJECT.x) * k, Y = (z) => H / 2 + (z - SUBJECT.z) * k;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(141,151,179,.2)'; for (let i = -8; i <= 8; i += 2) { g.beginPath(); g.moveTo(X(SUBJECT.x + i), 0); g.lineTo(X(SUBJECT.x + i), H); g.moveTo(0, Y(SUBJECT.z + i)); g.lineTo(W, Y(SUBJECT.z + i)); g.stroke(); }
    for (const who of ['iris', 'kane']) { const a = actorAt(who, this.t); g.fillStyle = who === 'iris' ? '#ffd24a' : '#5dd6ff'; g.beginPath(); g.arc(X(a.x), Y(a.z), 6, 0, Math.PI * 2); g.fill(); g.font = '10px JetBrains Mono'; g.fillText(t('who.' + who), X(a.x) + 8, Y(a.z) + 3); }
    for (const kk of ['key', 'fill', 'back']) {
      const Lk = this.light[kk], a = (Lk.az * Math.PI) / 180, px = SUBJECT.x + Math.sin(a) * Lk.d * Math.cos((Lk.el * Math.PI) / 180), pz = SUBJECT.z - Math.cos(a) * Lk.d * Math.cos((Lk.el * Math.PI) / 180);
      const [cr, cg, cb] = kelvinRGB(Lk.K); g.strokeStyle = g.fillStyle = `rgb(${cr * 255},${cg * 255},${cb * 255})`;
      g.beginPath(); g.moveTo(X(px), Y(pz)); g.lineTo(X(SUBJECT.x), Y(SUBJECT.z)); g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
      g.fillRect(X(px) - 5, Y(pz) - 5, 10, 10); g.fillText(`${t('l.' + kk)} ${Lk.lux} lx`, X(px) + 8, Y(pz) - 6);
    }
    for (const id of CAM_IDS) { const c = this.cams[id]; g.fillStyle = CAM_COL[id]; g.beginPath(); g.moveTo(X(c.x), Y(c.z) - 7); g.lineTo(X(c.x) + 6, Y(c.z) + 5); g.lineTo(X(c.x) - 6, Y(c.z) + 5); g.closePath(); g.fill(); g.fillText(id, X(c.x) + 8, Y(c.z)); }
  }

  // ═══ CUT ═══════════════════════════════════════════
  cutPanel() {
    return `<header class="lv-head mono">${t('e.title')}</header><p class="intro">${t('e.intro')}</p>
      ${this.transport()}
      <div class="chips"><button class="btn primary" id="e-live">● ${t('e.live')}</button><button class="btn seg" id="e-review">▶ ${t('e.review')}</button><button class="btn seg" id="e-auto">${t('e.auto')}</button><button class="btn seg" id="e-clear">↺</button></div>
      <div class="switcher">${CAM_IDS.map((id) => `<button class="sw" data-sw="${id}" style="--c:${CAM_COL[id]}"><kbd>${CAM_IDS.indexOf(id) + 1}</kbd><b>${t('cam')} ${id}</b><small>${this.cams[id].f}mm · ${t('tgt.' + this.cams[id].target)}</small></button>`).join('')}</div>
      <p class="small">${t('e.how')}</p>
      <canvas class="cv timeline" id="cv-tl"></canvas>`;
  }
  cutSide() {
    return `<header class="lv-head mono">${t('e.report')}</header>
      <div class="bigstats"><div><b class="mono" data-e="score">—</b><small>${t('e.score')}</small></div><div><b class="mono" data-e="shots">—</b><small>${t('e.shots')}</small></div><div><b class="mono" data-e="cover">—</b><small>${t('e.cover')}</small></div></div>
      <ul class="cuts" id="e-cuts"></ul>`;
  }
  bindCut() {
    this.bindTransport();
    $('#e-live').onclick = () => { this.edl = [{ cam: this.sel, t: 0 }]; this.t = 0; this.live = true; this.review = false; this.playing = true; this.caption('cap.live'); this.render(); };
    $('#e-review').onclick = () => { this.live = false; this.review = true; this.t = 0; this.playing = true; this.render(); };
    $('#e-auto').onclick = () => { this.edl = [{ cam: 'A', t: 0 }, { cam: 'B', t: 7.7 }, { cam: 'C', t: 10 }, { cam: 'B', t: 15.3 }, { cam: 'C', t: 18.8 }, { cam: 'B', t: 21.4 }, { cam: 'A', t: 24.2 }]; this.live = false; this.review = true; this.t = 0; this.playing = true; this.render(); };
    $('#e-clear').onclick = () => { this.edl = [{ cam: 'A', t: 0 }]; this.render(); };
    document.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = () => this.cutTo(b.dataset.sw)));
  }
  cutTo(id) {
    if (!this.live || !this.playing) { this.sel = id; sfx.select(); this.render(); return; }
    const last = this.edl[this.edl.length - 1]; if (last.cam === id) return;
    if (this.t - last.t < 0.05) last.cam = id; else this.edl.push({ cam: id, t: this.t });
    sfx.select(); this.app.stage.flash('rgba(255,255,255,0.1)');
  }
  programCam() {
    if (this.tab !== 'cut') return this.sel;
    let cam = this.edl[0].cam; for (const e of this.edl) if (e.t <= this.t) cam = e.cam; return cam;
  }
  cutLive(full) {
    const tl = $('#cv-tl');
    const A = analyse(this.edl, this.cams, this.S, this.squeeze);
    if (tl) {
      const r = tl.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); if (tl.width !== Math.round(r.width * d)) { tl.width = r.width * d; tl.height = r.height * d; }
      const g = tl.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const W = r.width, H = r.height, X = (s) => 6 + (s / DURATION) * (W - 12);
      g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, H);
      for (const s of A.shots) { g.fillStyle = CAM_COL[s.cam]; g.globalAlpha = 0.75; g.fillRect(X(s.t), 18, X(Math.min(s.end, this.live ? this.t : DURATION)) - X(s.t) - 1, 20); g.globalAlpha = 1; g.fillStyle = '#07080d'; g.font = '700 10px JetBrains Mono'; if (X(s.end) - X(s.t) > 14) g.fillText(s.cam, X(s.t) + 4, 32); }
      for (const L of LINES) { g.fillStyle = L.who === 'iris' ? '#ffd24a' : '#5dd6ff'; g.fillRect(X(L.t), 42, X(L.t + LINE_LEN) - X(L.t), 5); }
      for (const c of A.cuts) if (!c.ok) { g.fillStyle = '#ff4466'; g.beginPath(); g.moveTo(X(c.t), 14); g.lineTo(X(c.t) - 5, 6); g.lineTo(X(c.t) + 5, 6); g.fill(); }
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X(this.t), 2); g.lineTo(X(this.t), H - 2); g.stroke();
      g.fillStyle = 'rgba(232,238,252,.6)'; g.font = '9px JetBrains Mono'; for (let s = 0; s <= DURATION; s += 5) g.fillText(`${s}s`, X(s) - 6, H - 3);
    }
    document.querySelectorAll('[data-sw]').forEach((b) => b.classList.toggle('on', b.dataset.sw === this.programCam()));
    if (!full) return;
    const set = (k, v) => { const el = $(`[data-e="${k}"]`); if (el) el.textContent = v; };
    set('score', A.score); set('shots', A.shots.length); set('cover', `${A.covered}/${A.lines}`);
    const ul = $('#e-cuts');
    if (ul) ul.innerHTML = A.cuts.map((c) => `<li class="${c.ok ? 'ok' : 'bad'}"><b class="mono">${f1(c.t)}s ${c.from}→${c.to}</b><span>${c.ok ? t('e.clean', { a: f0(c.angle) }) : c.notes.map((n) => t('e.n.' + n)).join(' · ')}</span></li>`).join('') || `<li class="empty">${t('e.none')}</li>`;
    if (A.shots.length >= 4) this.score.cut = true; if (A.shots.length >= 4 && A.issues.length === 0 && A.covered >= 5) this.score.clean = true;
    this.lastAnalysis = A;
  }

  // ── Frame geometry for the viewfinder ──────────────
  frameRect() {
    const lb = innerHeight * 0.055, narrow = innerWidth < 1000;
    const L = narrow ? 16 : innerWidth < 1280 ? 352 : 392, R = narrow ? 16 : innerWidth < 1280 ? 352 : 392;
    const top = lb + 64, bottom = innerHeight - lb - (this.tab === 'cut' ? 36 : 40);
    const gw = innerWidth - L - R, gh = bottom - top, a = this.aspect;
    let w = gw, h = gw / a; if (h > gh) { h = gh; w = h * a; }
    return { x: L + (gw - w) / 2, y: top + (gh - h) / 2, w, h };
  }
  updateLensCam(id) {
    const c = this.cams[id], cam = this.lens, S = this.S, p = targetPoint(c, this.t);
    // Singles: aim below the eyes by a sixth of the frame height so the eyes sit on the upper third.
    if (c.target !== 'two') p.y = EYE - Math.min(0.5, frameHeightAt(S, c.f, Math.hypot(p.x - c.x, p.z - c.z)) / 6);
    cam.position.set(c.x, c.y, c.z); cam.up.set(0, 1, 0); cam.lookAt(p.x, p.y, p.z);
    // Map the lens' horizontal FOV onto the frame rectangle, and centre the optical axis on it.
    const R = this.frameRect(), W = innerWidth, H = innerHeight;
    const hf = fovH(S, c.f, this.squeeze), vFrame = 2 * Math.atan(Math.tan(hf / 2) / (R.w / R.h));
    cam.fov = deg(2 * Math.atan(Math.tan(vFrame / 2) * (H / R.h)));
    cam.aspect = W / H;
    cam.setViewOffset(W, H, W / 2 - (R.x + R.w / 2), H / 2 - (R.y + R.h / 2), W, H);
    cam.updateProjectionMatrix();
    // Depth of field + exposure for this camera.
    const L = this.lensSet[id], U = this.app.stage.dof.uniforms, pr = this.app.stage.renderer.getPixelRatio();
    U.uF.value = c.f; U.uN.value = L.N; U.uS.value = this.focusDist(id) * 1000; U.uSensorW.value = S.w * this.squeeze;
    U.uRes.value.set(W * pr, H * pr); U.uFrameW.value = R.w * pr;   // CoC mm → px uses the frame width on screen
    U.uEnabled.value = 1; U.uOval.value = this.body.anamorphic ? 1.8 : 1; U.uMaxPx.value = 22 * pr * (R.w / W);
  }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { this.orbit.drag = { x: e.clientX, y: e.clientY, moved: 0 }; this.orbit.last = performance.now(); }
  pointerMove(e) {
    const o = this.orbit; if (!o.drag) return;
    o.yaw -= (e.clientX - o.drag.x) * 0.005; o.pitch = Math.max(0.15, Math.min(1.45, o.pitch + (e.clientY - o.drag.y) * 0.004));
    o.drag.moved += Math.abs(e.clientX - o.drag.x) + Math.abs(e.clientY - o.drag.y); o.drag.x = e.clientX; o.drag.y = e.clientY; o.last = performance.now();
  }
  pointerUp(e) {
    const o = this.orbit, d = o.drag; o.drag = null;
    if (!d || d.moved > 6 || this.tab !== 'set' || !e) return;
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.god);
    const hit = new THREE.Vector3(); if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) this.moveCam(hit.x, hit.z);
  }
  wheel(e) { this.orbit.r = Math.max(8, Math.min(60, this.orbit.r * Math.exp(e.deltaY * 0.001))); this.orbit.last = performance.now(); }
  key(k) {
    if (this.tab === 'cut' && /^[1-3]$/.test(k)) this.cutTo(CAM_IDS[+k - 1]);
    if (k === ' ') this.togglePlay();
  }

  // ── Frame ──────────────────────────────────────────
  update(dt, time) {
    if (this.playing) { this.t += dt; if (this.t >= DURATION) { this.t = DURATION; this.playing = false; if (this.live) { this.live = false; this.app.feed.push('e.done', 'ok'); this.render(); } } }
    // Dolly zoom animation.
    if (this.dz) {
      const Z = this.dz, c = this.cams[this.sel]; Z.t += dt; const u = Math.min(1, Z.t / Z.dur), s = u * u * (3 - 2 * u), d = Z.d1 + (Z.d2 - Z.d1) * s;
      const dx = Z.from.x - Z.p.x, dz = Z.from.z - Z.p.z, l = Math.hypot(dx, dz);
      c.x = Z.p.x + (dx / l) * d; c.z = Z.p.z + (dz / l) * d; c.f = Math.max(10, Math.round(Z.from.f * d / Z.d1 * 10) / 10);
      if (u >= 1) { this.dz = null; this.render(); }
    }
    const S = this.set;
    S.iris.snap = S.iris.snap ?? true; S.kane.snap = S.kane.snap ?? true;
    const a = poseActor(S.iris, 'iris', this.t, dt || 1), b = poseActor(S.kane, 'kane', this.t, dt || 1);
    // Envelope: Kane's hand until the hand-off, then Iris's.
    const holder = this.t < 17 ? S.kane : S.iris; const hand = new THREE.Vector3(); holder.limbs.R.hand.getWorldPosition(hand); S.envelope.position.copy(hand); S.envelope.rotation.y = holder.g.rotation.y;
    // Rain.
    S.rain.visible = this.rain;
    if (this.rain) { const P = S.rain.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 6) { P[i + 1] -= dt * 11; P[i + 4] -= dt * 11; if (P[i + 4] < 0) { P[i + 1] += 14; P[i + 4] += 14; } } S.rain.geometry.attributes.position.needsUpdate = true; }
    // Line of action and camera rigs.
    const pa = new THREE.Vector3(a.x, 0.03, a.z), pb = new THREE.Vector3(b.x, 0.03, b.z), dir = pb.clone().sub(pa).normalize();
    S.loa.geometry.setFromPoints([pa.clone().addScaledVector(dir, -12), pb.clone().addScaledVector(dir, 12)]); S.loa.computeLineDistances();
    const showRigs = this.tab === 'set';
    S.loa.visible = S.marks.visible = showRigs;
    for (const id of CAM_IDS) {
      const c = this.cams[id], R = S.rigs[id], p = targetPoint(c, this.t);
      R.g.position.set(c.x, c.y, c.z); R.g.lookAt(p.x, p.y, p.z); R.g.visible = showRigs; R.legs.visible = showRigs; R.fr.visible = showRigs;
      R.lens.scale.y = 0.6 + c.f / 50; R.lens.position.z = -0.2 - 0.1 * (0.6 + c.f / 50);
      R.tally.material.opacity = id === this.sel ? 1 : 0.35;
      R.legs.children.forEach((l, i) => { const ang = (i / 3) * Math.PI * 2, fx = c.x + Math.cos(ang) * 0.45, fz = c.z + Math.sin(ang) * 0.45; l.position.set((fx + c.x) / 2, (c.y - 0.15) / 2, (fz + c.z) / 2); l.scale.y = Math.hypot(c.y - 0.15, 0.45); l.lookAt(c.x, c.y - 0.15, c.z); l.rotateX(Math.PI / 2); });
      // Frustum: four rays of 6 m along the lens' field of view.
      const fw = Math.tan(fovH(this.S, c.f, this.squeeze) / 2), len = Math.min(9, Math.hypot(p.x - c.x, p.z - c.z) + 1);
      const F = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z).normalize(), Rt = new THREE.Vector3().crossVectors(F, new THREE.Vector3(0, 1, 0)).normalize(), Up = new THREE.Vector3().crossVectors(Rt, F);
      const o = new THREE.Vector3(c.x, c.y, c.z), corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => o.clone().add(F.clone().add(Rt.clone().multiplyScalar(sx * fw)).add(Up.clone().multiplyScalar(sy * fw / this.aspect)).multiplyScalar(len)));
      const arr = R.fr.geometry.attributes.position.array; let k = 0;
      for (let i = 0; i < 4; i++) { arr.set([o.x, o.y, o.z, corners[i].x, corners[i].y, corners[i].z], k); k += 6; }
      for (let i = 0; i < 4; i++) { const q = corners[(i + 1) % 4]; arr.set([corners[i].x, corners[i].y, corners[i].z, q.x, q.y, q.z], k); k += 6; }
      R.fr.geometry.attributes.position.needsUpdate = true;
    }
    // Cameras.
    const st = this.app.stage;
    if (this.tab === 'set') {
      const o = this.orbit; if (!o.drag && performance.now() - o.last > 5000) o.yaw += dt * 0.04;
      this.god.position.set(o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.r, o.target.y + Math.sin(o.pitch) * o.r, o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.r);
      this.god.lookAt(o.target); this.god.clearViewOffset(); this.god.aspect = innerWidth / innerHeight; this.god.updateProjectionMatrix();
      // The overview is exposed like a video-assist monitor: metered for the key at T2.8, 1/48 s, ISO 800.
      st.dof.uniforms.uEnabled.value = 0; st.renderer.toneMappingExposure = this.exposure(2, 1 / 48, 800, 0) * 3; st.grade.uniforms.uFalse.value = 0;
    } else {
      this.updateLensCam(this.programCam());
      const B = this.body, L = this.lensSet[this.programCam()];
      st.renderer.toneMappingExposure = this.exposure(L.N, shutterTime(B.angle, B.fps), B.iso, B.nd);
      st.grade.uniforms.uFalse.value = this.tab === 'light' && B.falseColor ? 1 : 0;
    }
    // White balance: divide by the (linearised) colour of a blackbody at the set Kelvin, normalised to green.
    const w = kelvinRGB(this.body.wb).map((c) => Math.max(0.05, c) ** 2.2);
    st.dof.uniforms.uWB.value.set(w[1] / w[0], 1, w[1] / w[2]);
    this.drawGuides();
    this.uiT += dt; this.uiSlow = (this.uiSlow || 0) + dt;
    if (this.uiT > 0.08) { this.uiT = 0; const full = this.uiSlow > 0.3; if (full) this.uiSlow = 0; this.refresh(full); }
  }
  // Exposure: pixel = scene radiance × π·t·ISO/(C·N²·2^ND) — the same constant as the meter,
  // so a face lit to the metered level lands at mid grey. 
  exposure(N, tt, iso, nd) { return (Math.PI * tt * iso) / (K_METER * N * N * 2 ** nd) * EXPOSURE_GAIN; }
  drawGuides() {
    const cv = $('#guides'); if (!cv) return;
    const d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(innerWidth * d)) { cv.width = innerWidth * d; cv.height = innerHeight * d; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
    if (this.tab === 'set' || !this.entered) return;
    const R = this.frameRect(), id = this.programCam(), c = this.cams[id], L = this.lensSet[id];
    // Mask outside the frame.
    g.fillStyle = 'rgba(2,3,8,0.94)'; g.beginPath(); g.rect(0, 0, innerWidth, innerHeight); g.rect(R.x, R.y, R.w, R.h); g.fill('evenodd');
    g.strokeStyle = CAM_COL[id]; g.lineWidth = 1.5; g.strokeRect(R.x, R.y, R.w, R.h);
    if (this.body.guides) {
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
      for (const u of [1 / 3, 2 / 3]) { g.beginPath(); g.moveTo(R.x + R.w * u, R.y); g.lineTo(R.x + R.w * u, R.y + R.h); g.moveTo(R.x, R.y + R.h * u); g.lineTo(R.x + R.w, R.y + R.h * u); g.stroke(); }
      g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(R.x + R.w * 0.05, R.y + R.h * 0.05, R.w * 0.9, R.h * 0.9); g.setLineDash([]);
      g.beginPath(); g.moveTo(R.x + R.w / 2 - 8, R.y + R.h / 2); g.lineTo(R.x + R.w / 2 + 8, R.y + R.h / 2); g.moveTo(R.x + R.w / 2, R.y + R.h / 2 - 8); g.lineTo(R.x + R.w / 2, R.y + R.h / 2 + 8); g.stroke();
    }
    // Info strip.
    g.font = '11px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(232,238,252,.85)'; g.textBaseline = 'top';
    const tt = shutterTime(this.body.angle, this.body.fps);
    g.fillText(`${t('cam')} ${id} · ${c.f}mm${this.body.anamorphic ? ' 2×ANA' : ''} · T${L.N} · ${f2(this.focusDist(id))}m · ${this.body.fps}fps ${this.body.angle}° (1/${f0(1 / tt)}) · ISO ${this.body.iso}${this.body.nd ? ' · ND' + (this.body.nd * 0.3).toFixed(1) : ''} · ${this.body.wb}K`, R.x + 8, R.y + 8);
    const tc = `${String(Math.floor(this.t / 60)).padStart(2, '0')}:${String(Math.floor(this.t) % 60).padStart(2, '0')}:${String(Math.floor((this.t % 1) * this.body.fps)).padStart(2, '0')}`;
    g.textAlign = 'right'; g.fillText(tc, R.x + R.w - 8, R.y + 8);
    if (this.playing && (this.live || this.tab !== 'cut')) { g.fillStyle = '#ff2040'; g.beginPath(); g.arc(R.x + R.w - 92, R.y + 14, 5, 0, Math.PI * 2); g.fill(); g.fillText('REC', R.x + R.w - 60, R.y + 8); }
    g.textAlign = 'left';
    // Subtitles.
    const sp = speakingAt(this.t);
    if (sp) { g.font = '600 16px "Space Grotesk", "Noto Sans JP", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; const txt = `${t('who.' + sp.who)}: ${t('line.' + sp.k)}`; g.fillStyle = 'rgba(0,0,0,.6)'; const w = g.measureText(txt).width; g.fillRect(R.x + R.w / 2 - w / 2 - 10, R.y + R.h - 42, w + 20, 28); g.fillStyle = '#fff'; g.fillText(txt, R.x + R.w / 2, R.y + R.h - 22); g.textAlign = 'left'; }
  }
  refresh(full) {
    if (!this.entered) return;
    const tc = $('#tp-tc'); if (tc) tc.textContent = `00:${String(Math.floor(this.t)).padStart(2, '0')}:${String(Math.floor((this.t % 1) * this.body.fps)).padStart(2, '0')}`;
    const sl = $('#tp-t'); if (sl && document.activeElement !== sl) sl.value = this.t;
    if (this.tab === 'set') this.setLive(full);
    if (this.tab === 'camera') this.camLive(full);
    if (this.tab === 'light') this.lightLive(full);
    if (this.tab === 'cut') this.cutLive(full);
  }

  showReport() {
    const S = this.score, A = this.lastAnalysis || analyse(this.edl, this.cams, this.S, this.squeeze);
    const rows = [[t('rep.blocked'), S.blocked], [t('rep.lens'), S.lens], [t('rep.dof'), S.dof], [t('rep.dolly'), S.dolly], [t('rep.light'), S.light], [t('rep.meter'), S.meter], [t('rep.take'), S.take], [t('rep.cut', { n: A.shots.length }), S.cut], [t('rep.clean', { s: A.score }), S.clean]];
    const list = $('#rep-list'); list.innerHTML = '';
    for (const [txt, ok] of rows) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'todo'; li.textContent = txt; list.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = ''; for (const k of ['n1', 'n2', 'n3', 'n4']) { const li = document.createElement('li'); li.textContent = t('rep.' + k); nx.appendChild(li); }
    const score = Math.round((100 * rows.filter((r) => r[1]).length) / rows.length);
    const ring = $('#rep-ring'); ring.style.setProperty('--p', score); ring.querySelector('b').textContent = score;
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    $('#report').classList.remove('hidden'); sfx.confirm();
  }
}
