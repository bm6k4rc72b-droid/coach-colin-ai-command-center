import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';
import { ByteTracker, FallWatch } from '../vision-kit/bytetrack.js';
import { LatencyHarness, batchingModel, pctChange } from '../vision-kit/latency.js';
import { Detector, cameraSupported, openCamera, stopCamera } from '../vision-kit/detector.js';
import { loadDepth, estimateDepth, syntheticDepth } from '../vision-kit/depth.js';
import { depthToPoints, disparityToDepth, intrinsicsFromFov } from '../vision-kit/pointcloud.js';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN · SENTINEL live lab: the same pipeline on the viewer's own camera.
// COCO-SSD (TF.js) → ByteTrack → fall watch, with a per-stage latency harness,
// a runtime comparison (WebGL / WASM / CPU) and a Depth Anything point cloud.
// Everything stays in this tab.
// ─────────────────────────────────────────────────────────────────────────────

const t = (k, v) => i18n.t(k, v);
const COLORS = { person: '#3ff3ff', dog: '#ffb86b', cat: '#ffb86b', chair: '#8b5cff', bed: '#8b5cff' };

export class LiveLab {
  constructor() {
    this.el = null;
    this.det = new Detector();
    this.tracker = new ByteTracker({ minHits: 2 });
    this.fall = new FallWatch({ fps: 10, confirmSec: 1.5, stillSec: 30 });
    this.lat = new LatencyHarness(90);
    this.privacy = 'blur';
    this.backend = 'webgl';
    this.running = false;
    this.events = [];
    this.cloud = null;
    this.cloudYaw = 0;
    this.synthT = 0;
  }

  open() {
    if (!this.el) this.build();
    this.el.classList.remove('hidden');
    this.renderText();
    this.loop();
  }

  close() {
    this.stop();
    this.el?.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  build() {
    const el = document.createElement('section');
    el.id = 'live-lab';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="ll-card panel">
        <header class="ll-head"><b class="mono" data-t="lv.title"></b><button class="btn panel" id="ll-close" data-t="lv.close"></button></header>
        <div class="ll-grid">
          <div class="ll-view"><canvas id="ll-canvas" width="960" height="540"></canvas><video id="ll-video" playsinline muted></video></div>
          <div class="ll-side">
            <div class="row-btns"><button class="btn primary" id="ll-start" data-t="lv.start"></button></div>
            <p class="mono small" id="ll-status"></p>
            <div class="lv-sub mono" data-t="lv.privacy"></div>
            <div class="sn-seg" id="ll-priv">${['blur', 'outline', 'off'].map((m) => `<button data-m="${m}" data-t="lv.p.${m}"></button>`).join('')}</div>
            <div class="lv-sub mono" data-t="lv.backend"></div>
            <div class="sn-seg" id="ll-be">${['webgl', 'wasm', 'cpu'].map((m) => `<button data-m="${m}">${m.toUpperCase()}</button>`).join('')}</div>
            <div class="row-btns"><button class="btn panel" id="ll-cmp" data-t="lv.compare"></button></div>
            <p class="mono small" id="ll-cmp-out"></p>
            <div class="lv-sub mono" data-t="sn.lat"></div>
            <div class="sn-lat" id="ll-lat"></div>
            <p class="mono small" id="ll-batch"></p>
            <div class="lv-sub mono"><span data-t="lv.counts"></span> · <span id="ll-count">0</span></div>
            <div class="lv-sub mono" data-t="lv.events"></div>
            <ul class="ll-events" id="ll-events"></ul>
          </div>
          <div class="ll-depth">
            <div class="lv-sub mono"><span data-t="lv.depth"></span> <small id="ll-depth-note"></small></div>
            <canvas id="ll-cloud" width="640" height="300"></canvas>
            <div class="row-btns"><button class="btn panel" id="ll-depth-btn">Depth Anything V2 ▸</button></div>
          </div>
        </div>
        <p class="small sn-note" data-t="sn.liveNote"></p>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.canvas = el.querySelector('#ll-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.video = el.querySelector('#ll-video');
    this.cloudCanvas = el.querySelector('#ll-cloud');
    this.off = document.createElement('canvas');
    this.off.width = 480;
    this.off.height = 270;
    el.querySelector('#ll-close').onclick = () => this.close();
    el.querySelector('#ll-start').onclick = () => (this.running ? this.stop() : this.start());
    el.querySelectorAll('#ll-priv button').forEach((b) => (b.onclick = () => { this.privacy = b.dataset.m; this.renderText(); }));
    el.querySelectorAll('#ll-be button').forEach((b) => (b.onclick = () => this.switchBackend(b.dataset.m)));
    el.querySelector('#ll-cmp').onclick = () => this.compare();
    el.querySelector('#ll-depth-btn').onclick = () => this.depth();
    el.addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
    i18n.onChange(() => this.renderText());
    this.status(t('lv.status.idle'));
    this.makeCloud({ ...syntheticDepth(160, 90, 0), rgb: null });
  }

  renderText() {
    if (!this.el) return;
    this.el.querySelectorAll('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
    this.el.querySelector('#ll-start').textContent = this.running ? t('lv.stop') : t('lv.start');
    this.el.querySelectorAll('#ll-priv button').forEach((b) => b.classList.toggle('on', b.dataset.m === this.privacy));
    this.el.querySelectorAll('#ll-be button').forEach((b) => b.classList.toggle('on', b.dataset.m === this.backend));
    if (!this.depthReal) this.el.querySelector('#ll-depth-note').textContent = '· ' + t('lv.depthSynth');
  }

  status(s) {
    const n = this.el?.querySelector('#ll-status');
    if (n) n.textContent = s;
  }

  async start() {
    sfx.select();
    this.running = true;
    this.renderText();
    try {
      if (cameraSupported()) this.stream = await openCamera(this.video, 'user');
      else throw new Error('no camera');
    } catch {
      this.stream = null;
      this.status(t('lv.noCam'));
    }
    try {
      await this.det.load(this.backend, (m) => this.status(m));
    } catch (err) {
      this.status(`Model unavailable: ${err.message}. Tracking runs on the synthetic scene.`);
    }
  }

  stop() {
    this.running = false;
    stopCamera(this.stream);
    this.stream = null;
    this.renderText();
  }

  async switchBackend(name) {
    this.backend = name;
    this.renderText();
    if (window.tf) {
      const got = await this.det.setBackend(name, (m) => this.status(m));
      this.status(`Runtime: ${got}${got !== name ? ` (${name} unavailable)` : ''}`);
      this.lat = new LatencyHarness(90);
    }
  }

  /** Time N inferences on each runtime, like glance-speedlab's runtime table. */
  async compare() {
    if (!this.det.model) {
      this.status('Start the camera first so the model is loaded.');
      return;
    }
    const out = this.el.querySelector('#ll-cmp-out');
    const res = {};
    for (const be of ['webgl', 'wasm']) {
      out.textContent = `Timing ${be}…`;
      const got = await this.det.setBackend(be);
      const times = [];
      for (let i = 0; i < 12; i++) {
        const t0 = performance.now();
        await this.det.detect(this.source());
        if (i >= 2) times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      res[got] = times[Math.floor(times.length / 2)];
    }
    await this.det.setBackend(this.backend);
    const [a, b] = Object.keys(res);
    out.textContent = b ? t('lv.cmp', { a, ma: res[a].toFixed(1), b, mb: res[b].toFixed(1), p: pctChange(res[a], res[b]).toFixed(0) }) : `${a}: ${res[a].toFixed(1)} ms`;
  }

  source() {
    const g = this.off.getContext('2d');
    if (this.stream && this.video.readyState >= 2) g.drawImage(this.video, 0, 0, this.off.width, this.off.height);
    else this.drawSynthetic(g, this.off.width, this.off.height);
    return this.off;
  }

  /** A synthetic room with a walking figure, used when there is no camera. */
  drawSynthetic(g, W, H) {
    this.synthT += 1 / 15;
    const s = this.synthT;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#1d2433');
    grd.addColorStop(0.6, '#2c3446');
    grd.addColorStop(1, '#4a3f36');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const x = W * (0.5 + 0.35 * Math.sin(s * 0.4));
    const fallen = Math.sin(s * 0.13) > 0.85;
    g.fillStyle = '#c9b49a';
    if (fallen) g.fillRect(x - 50, H * 0.8, 100, 26);
    else {
      g.beginPath();
      g.arc(x, H * 0.36, 11, 0, 7);
      g.fill();
      g.fillRect(x - 13, H * 0.4, 26, H * 0.42);
    }
    this.synthBox = fallen ? [x - 50, H * 0.8, 100, 26] : [x - 14, H * 0.32, 28, H * 0.5];
  }

  async loop() {
    if (this.el.classList.contains('hidden')) return;
    const now = () => performance.now();
    const W = this.canvas.width;
    const H = this.canvas.height;
    const g = this.ctx;
    if (this.running) {
      this.lat.begin(now());
      const src = this.source();
      this.lat.mark('capture', now());
      let dets = [];
      if (this.det.model) {
        this.lat.mark('transport', now());
        dets = await this.det.detect(src, 20, 0.15);
        this.lat.mark('inference', now());
      } else if (!this.stream && this.synthBox) {
        dets = [{ box: this.synthBox.slice(), score: 0.88, cls: 'person' }];
      }
      const sx = W / src.width;
      const sy = H / src.height;
      const scaled = dets.map((d) => ({ ...d, box: [d.box[0] * sx, d.box[1] * sy, d.box[2] * sx, d.box[3] * sy] }));
      const tracks = this.tracker.update(scaled);
      for (const ev of this.fall.update(tracks, now() / 1000)) {
        this.events.unshift(`${new Date().toLocaleTimeString()} · ${ev.type.toUpperCase()} · track ${ev.id}`);
        if (ev.type === 'fall') sfx.warn();
        this.events.length = Math.min(6, this.events.length);
      }
      this.lat.mark('scoring', now());
      // Draw.
      if (this.privacy === 'outline') {
        g.fillStyle = '#05070d';
        g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(63,243,255,.08)';
        for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      } else {
        g.save();
        if (this.privacy === 'blur') g.filter = 'blur(18px) saturate(0.6)';
        g.drawImage(src, 0, 0, W, H);
        g.restore();
      }
      for (const tr of this.tracker.tracks.filter((x) => x.state !== 'tentative')) {
        const [x, y, w, h] = tr.box;
        const fallen = this.fall.state.get(tr.id)?.fallen;
        const col = fallen ? '#ff4466' : COLORS[tr.cls] ?? '#5dffa8';
        if (this.privacy !== 'off' && tr.cls === 'person') {
          const grd = g.createLinearGradient(x, y, x, y + h);
          grd.addColorStop(0, col + '55');
          grd.addColorStop(1, col + '11');
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + w * 0.15, y, w * 0.7, h, Math.min(w, h) * 0.3);
          g.fill();
        }
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.setLineDash(tr.lost ? [8, 6] : []);
        g.strokeRect(x, y, w, h);
        g.setLineDash([]);
        g.font = '600 18px JetBrains Mono, monospace';
        const tag = `ID ${tr.id} · ${tr.cls} · ${tr.score.toFixed(2)}${fallen ? ' · FALL' : ''}`;
        g.fillStyle = 'rgba(4,8,16,.8)';
        g.fillRect(x, Math.max(0, y - 26), g.measureText(tag).width + 12, 24);
        g.fillStyle = col;
        g.fillText(tag, x + 6, Math.max(18, y - 8));
      }
      g.font = '16px JetBrains Mono, monospace';
      g.fillStyle = '#5dffa8';
      g.fillText(`ON-DEVICE · ${this.det.backend ?? '—'} · ${this.lat.fps().toFixed(1)} fps · privacy ${this.privacy}`, 16, H - 16);
      this.lat.end(now());
      this.updateStats();
    } else {
      g.fillStyle = '#05070d';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#8d97b3';
      g.font = '18px JetBrains Mono, monospace';
      g.textAlign = 'center';
      g.fillText(t('lv.status.idle'), W / 2, H / 2);
      g.textAlign = 'left';
    }
    this.drawCloud();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  updateStats() {
    const st = this.lat.stats();
    const keys = ['capture', 'transport', 'inference', 'scoring', 'loop'].filter((k) => st[k]);
    const max = Math.max(1, ...keys.map((k) => st[k].p95));
    this.el.querySelector('#ll-lat').innerHTML = keys
      .map((k) => `<div class="sn-lr${k === 'loop' ? ' tot' : ''}"><span>${t('sn.lat.' + k)}</span><i><b style="width:${(100 * st[k].median) / max}%"></b><em style="left:${(100 * st[k].p95) / max}%"></em></i><span class="mono">${st[k].median.toFixed(1)} / ${st[k].p95.toFixed(1)}</span></div>`)
      .join('');
    if (st.inference) {
      const b = batchingModel(st.inference.median, (st.scoring?.median ?? 0.5) + 1, 4);
      this.el.querySelector('#ll-batch').textContent = t('sn.batch', { b: b.batched.toFixed(0), s: b.sequential.toFixed(0), x: b.speedup.toFixed(1) });
    }
    this.el.querySelector('#ll-count').textContent = this.tracker.visible().length;
    this.el.querySelector('#ll-events').innerHTML = this.events.map((e) => `<li>${e}</li>`).join('');
  }

  async depth() {
    const note = this.el.querySelector('#ll-depth-note');
    try {
      await loadDepth((m) => (note.textContent = '· ' + m));
      const src = this.source();
      const r = await estimateDepth(src);
      const rgbCanvas = document.createElement('canvas');
      rgbCanvas.width = r.width;
      rgbCanvas.height = r.height;
      const rg = rgbCanvas.getContext('2d');
      rg.drawImage(src, 0, 0, r.width, r.height);
      const rgb = rg.getImageData(0, 0, r.width, r.height).data;
      this.depthReal = true;
      this.makeCloud({ disparity: r.disparity, rgb: this.privacy === 'off' ? rgb : null, width: r.width, height: r.height });
      note.textContent = `· Depth Anything V2 small · ${r.ms.toFixed(0)} ms · ${this.cloud.count} pts · relative units`;
    } catch (err) {
      note.textContent = `· model unavailable (${err.message}); synthetic scene shown`;
    }
  }

  makeCloud({ disparity, rgb, width, height }) {
    const K = intrinsicsFromFov(width, height, 70);
    const depth = disparityToDepth(disparity, 1, 0.02);
    const stride = Math.max(1, Math.round(Math.sqrt((width * height) / 9000)));
    this.cloud = depthToPoints(depth, K, { stride, maxDepth: 12, rgb, colorBy: rgb ? 'rgb' : 'depth' });
  }

  drawCloud() {
    const c = this.cloudCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const H = c.height;
    g.fillStyle = '#04060b';
    g.fillRect(0, 0, W, H);
    const pc = this.cloud;
    if (!pc) return;
    this.cloudYaw += 0.006;
    const cy = Math.cos(Math.sin(this.cloudYaw) * 0.7);
    const sy = Math.sin(Math.sin(this.cloudYaw) * 0.7);
    const P = pc.positions;
    const C = pc.colors;
    const f = H * 1.1;
    for (let i = 0; i < pc.count; i++) {
      let x = P[i * 3];
      const y = P[i * 3 + 1];
      let z = P[i * 3 + 2] + 2.2;
      const rx = x * cy - z * sy;
      const rz = x * sy + z * cy - 2.2;
      x = rx;
      z = rz;
      if (z > -0.1) continue;
      const u = W / 2 + (x / -z) * f;
      const v = H / 2 - (y / -z) * f;
      if (u < 0 || v < 0 || u >= W || v >= H) continue;
      g.fillStyle = `rgb(${(C[i * 3] * 255) | 0},${(C[i * 3 + 1] * 255) | 0},${(C[i * 3 + 2] * 255) | 0})`;
      g.fillRect(u, v, 2, 2);
    }
  }
}
