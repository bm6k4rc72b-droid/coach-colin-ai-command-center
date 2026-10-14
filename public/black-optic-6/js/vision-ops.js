/**
 * Vision operations decks: Ranch Twin (3D architect), Flock & Crew (tracking
 * feed, headcount, crew safety, assets), Depth (point cloud) and Speed lab
 * (latency harness).
 *
 * The provenance rule of the console holds here too: the twin and the drone
 * feed are a model and are badged "Modelled"; a live camera's detections are
 * badged "Live · on-device"; benchmark numbers are "Measured · this device".
 * Crew appear only through tags they opted in to carry, only on shift, and
 * nothing in this file recognises a face.
 *
 * @module black-optic-6/vision-ops
 */

import { RanchSim, sampleLayout, parseLayout, TYPES, penGate, CREW, BOUNDS, layoutCameras, inPolygon } from './ranch-sim.js';
import { ByteTracker, LineCounter } from '../../vision-kit/bytetrack.js';
import { LatencyHarness, batchingModel, pctChange, quantile } from '../../vision-kit/latency.js';
import { Detector, openCamera, stopCamera, cameraSupported, groupOf } from '../../vision-kit/detector.js';
import { loadDepth, estimateDepth, syntheticDepth } from '../../vision-kit/depth.js';
import { depthToPoints, disparityToDepth, intrinsicsFromFov } from '../../vision-kit/pointcloud.js';

const $ = (id) => document.getElementById(id);
const STORE = 'bo6.twin.layout.v1';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function loadLayout() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { layout: parseLayout(raw), saved: true };
  } catch {
    /* storage unavailable or corrupt: fall back to the sample */
  }
  return { layout: sampleLayout(), saved: false };
}

function saveLayout(layout) {
  try {
    localStorage.setItem(STORE, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}

const tone = (lvl) => ({ alert: 'alert', caution: 'caution', ok: 'confirm' })[lvl] ?? 'primary';
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class VisionOps {
  constructor() {
    const { layout, saved } = loadLayout();
    this.sim = new RanchSim(layout);
    this.saved = saved;
    this.deck = null;
    this.twin = null;
    this.twinLoading = null;
    this.last = performance.now();
    this.t = 0;
    this.feed = { tracker: new ByteTracker({ minHits: 2, maxLost: 15 }), mode: 'drone', counter: null, frame: 0 };
    this.det = new Detector();
    this.uiT = 0;
    this.night = false;
    this.offline = [];
    this.ir = false;
  }

  init() {
    this.buildTwinUi();
    this.buildFlockUi();
    this.buildDepthUi();
    this.buildSpeedUi();
    requestAnimationFrame((n) => this.loop(n));
  }

  /** Called by the shell whenever a deck opens. */
  onDeck(id) {
    this.deck = id;
    if (id === 'twin') this.ensureTwin();
    if (id === 'depth') this.ensureDepth();
  }

  /* ================================================================ TWIN */

  buildTwinUi() {
    const tools = [
      ['select', 'Select / move'], ['fence', 'Draw fence'], ['barn', 'Barn'], ['house', 'House'], ['shed', 'Shed'], ['silo', 'Silo'], ['tank', 'Tank'],
      ['trough', 'Trough'], ['gate', 'Gate'], ['camera', 'Camera'], ['tree', 'Tree'],
    ];
    $('twin-tools').innerHTML = tools.map(([k, l]) => `<button type="button" data-tool="${k}" aria-pressed="${k === 'select'}">${l}</button>`).join('');
    $('twin-tools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b || !this.twin) return;
      this.twin.setTool(b.dataset.tool);
      for (const x of $('twin-tools').children) x.setAttribute('aria-pressed', String(x === b));
      $('twin-hint').textContent = b.dataset.tool === 'fence'
        ? 'Click to drop fence posts; double-click or Enter to finish, Esc to cancel. A gate placed on a fence opens it.'
        : TYPES[b.dataset.tool]
          ? `Click the ground to place a ${TYPES[b.dataset.tool].label.toLowerCase()}. R rotates before placing.`
          : 'Drag an object to move it. R rotates, Delete removes. Drag empty ground to orbit, right-drag to pan, wheel to zoom.';
    });
    const seg = (id, fn) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      for (const x of $(id).querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      fn(b.dataset.v);
    });
    seg('twin-overlay', (v) => this.twin?.setOverlay(v));
    seg('twin-time', (v) => {
      this.night = v === 'night';
      this.twin?.setNight(this.night ? 1 : 0);
      this.renderTwinPanels();
    });
    $('twin-cinema').addEventListener('click', () => {
      const on = $('twin-cinema').getAttribute('aria-pressed') !== 'true';
      $('twin-cinema').setAttribute('aria-pressed', String(on));
      $('twin-view').classList.toggle('cinema', on);
      this.twin?.setCinema(on);
    });
    $('twin-rotate').addEventListener('click', () => this.twin?.rotateSelected());
    $('twin-delete').addEventListener('click', () => this.twin?.deleteSelected());
    $('twin-unfence').addEventListener('click', () => this.twin?.removeLastFence());
    $('twin-reset').addEventListener('click', () => {
      if (!confirm('Replace your layout with the sample ranch?')) return;
      const L = sampleLayout();
      this.sim.layout.objects = L.objects;
      this.sim.layout.fences = L.fences;
      this.sim.layout.zones = L.zones;
      this.twin?.relayout();
    });
    $('twin-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.sim.layout, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ranch-layout.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('twin-import').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const L = parseLayout(await f.text());
        Object.assign(this.sim.layout, L);
        this.twin?.relayout();
      } catch (err) {
        $('twin-hint').textContent = `That file is not a ranch layout (${err.message}).`;
      }
      e.target.value = '';
    });
    $('twin-ir').addEventListener('change', (e) => {
      this.ir = e.target.checked;
      this.twin?.setScenario({ ir: this.ir });
      this.renderTwinPanels();
    });
    addEventListener('keydown', (e) => {
      if (this.deck !== 'twin' || !this.twin || e.target.matches('input, select, textarea')) return;
      if (e.key === 'r' || e.key === 'R') this.twin.rotateSelected(e.shiftKey ? -Math.PI / 12 : Math.PI / 12);
      if (e.key === 'Delete' || e.key === 'Backspace') this.twin.deleteSelected();
      if (e.key === 'Enter') this.twin.finishFence();
      if (e.key === 'Escape') this.twin.cancelFence();
    });
    this.renderTwinPanels();
  }

  async ensureTwin() {
    if (this.twin || this.twinLoading) return;
    $('twin-loading').hidden = false;
    this.twinLoading = import('./twin3d.js')
      .then(({ createTwin }) => {
        this.twin = createTwin($('twin-canvas'), {
          sim: this.sim,
          onSelect: (o) => this.renderSelection(o),
          onChange: (L) => {
            this.saved = saveLayout(L);
            this.renderTwinPanels();
          },
        });
        $('twin-loading').hidden = true;
        this.renderTwinPanels();
      })
      .catch((err) => {
        $('twin-loading').textContent = `3D view unavailable: ${err.message}. WebGL is required.`;
      });
  }

  renderSelection(o) {
    const el = $('twin-sel');
    if (!o) {
      el.innerHTML = '<p class="empty">Nothing selected. Pick an object on the twin, or choose a tool and click the ground to build.</p>';
      return;
    }
    const t = TYPES[o.type];
    const deg = Math.round((((o.type === 'camera' ? o.yaw : o.rot) ?? 0) * 180) / Math.PI) % 360;
    el.innerHTML = `
      <div class="readouts">
        <div class="readout"><span class="k">Object</span><span class="v">${esc(o.name ?? t.label)}</span></div>
        <div class="readout"><span class="k">Position</span><span class="v">${o.x.toFixed(0)}, ${o.z.toFixed(0)} m</span></div>
        <div class="readout"><span class="k">${o.type === 'camera' ? 'Facing' : 'Rotation'}</span><span class="v">${(deg + 360) % 360}°</span></div>
        <div class="readout"><span class="k">Footprint</span><span class="v">${t.w} × ${t.d} m</span></div>
      </div>
      ${o.type === 'camera' ? `<div class="controls" style="margin-top:9px"><label class="field" style="flex:1"><span>Name</span><input type="text" id="twin-camname" value="${esc(o.name ?? '')}" maxlength="24" /></label><label class="field" style="flex:0 0 auto;justify-content:flex-end"><span>State</span><button class="ghost" id="twin-camoff" type="button">${this.offline.includes(o.id) ? 'Bring online' : 'Take offline'}</button></label></div>` : ''}`;
    if (o.type === 'camera') {
      $('twin-camname').addEventListener('change', (e) => {
        o.name = e.target.value.trim() || 'Camera';
        this.twin.relayout();
        this.twin.select(o.id);
      });
      $('twin-camoff').addEventListener('click', () => {
        this.offline = this.offline.includes(o.id) ? this.offline.filter((x) => x !== o.id) : [...this.offline, o.id];
        this.twin.setScenario({ offline: this.offline });
        this.renderSelection(o);
        this.renderTwinPanels();
      });
    }
  }

  renderTwinPanels() {
    const L = this.sim.layout;
    $('twin-layout-prov').textContent = this.saved ? 'Your layout · saved here' : 'Sample layout';
    const cams = layoutCameras(L, { offline: this.offline, ir: this.ir });
    const cov = this.twin?.coverage;
    $('twin-cov').innerHTML = `
      <div class="readout"><span class="k">Camera coverage</span><span class="v" data-tone="${cov && cov.ratio < 0.4 ? 'caution' : 'confirm'}">${cov ? Math.round(cov.ratio * 100) + '%' : '—'}</span><div class="n">of the ranch floor seen by at least one camera${this.night ? ', at night' : ''}</div></div>
      <div class="readout"><span class="k">Blind cells</span><span class="v">${cov ? cov.gaps.length : '—'}</span><div class="n">2 m squares no camera sees</div></div>
      <div class="readout"><span class="k">Cameras online</span><span class="v">${cams.filter((c) => c.online).length}/${cams.length}</span><div class="n">${this.ir ? 'all with infrared' : 'infrared only where fitted'}</div></div>
      <div class="readout"><span class="k">Objects · fences</span><span class="v">${L.objects.length} · ${L.fences.length}</span><div class="n">fence runs feed the flock simulation</div></div>`;
  }

  tickTwinLive() {
    const s = this.sim;
    const h = s.headcount();
    $('twin-live').innerHTML = `
      <div class="readout"><span class="k">Sheep</span><span class="v">${s.sheep.length}</span><div class="n">${h.inPen} in the pen</div></div>
      <div class="readout"><span class="k">Cattle</span><span class="v">${s.cattle.length}</span></div>
      <div class="readout"><span class="k">Crew on map</span><span class="v">${s.visibleCrew().length}/${s.crew.length}</span><div class="n">opted-in tags, on shift</div></div>
      <div class="readout"><span class="k">Machines moving</span><span class="v" data-tone="${s.assets.some((a) => a.moving) ? 'caution' : 'muted'}">${s.assets.filter((a) => a.moving).length}</span></div>`;
  }

  /* =============================================================== FLOCK */

  buildFlockUi() {
    this.flockCanvas = $('flock-canvas');
    this.flockCtx = this.flockCanvas.getContext('2d');
    this.view = { x0: -3, z0: -48, x1: 77, z1: -3 };
    this.bg = this.drawFlockBackground();
    this.grain = document.createElement('canvas');
    this.grain.width = this.grain.height = 256;
    {
      const g = this.grain.getContext('2d');
      const img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 22;
      }
      g.putImageData(img, 0, 0);
    }
    $('flock-pen').addEventListener('click', () => this.sim.command('pen'));
    $('flock-graze').addEventListener('click', () => this.sim.command('graze'));
    $('flock-dog').addEventListener('click', () => this.sim.releaseDog());
    $('flock-cam').addEventListener('click', () => (this.feed.mode === 'live' ? this.stopFlockCamera() : this.startFlockCamera()));
    $('flock-crew').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'checkin') this.sim.checkIn(b.dataset.id);
      if (b.dataset.act === 'consent') this.sim.setConsent(b.dataset.id, !this.sim.consent[b.dataset.id]);
      this.renderCrew();
    });
    this.renderCrew();
  }

  w2c(x, z) {
    const V = this.view;
    const W = this.flockCanvas.width;
    const H = this.flockCanvas.height;
    return [((x - V.x0) / (V.x1 - V.x0)) * W, ((z - V.z0) / (V.z1 - V.z0)) * H];
  }

  drawFlockBackground() {
    const c = document.createElement('canvas');
    c.width = this.flockCanvas.width;
    c.height = this.flockCanvas.height;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, c.width, c.height);
    grd.addColorStop(0, '#46552a');
    grd.addColorStop(1, '#5c6a30');
    g.fillStyle = grd;
    g.fillRect(0, 0, c.width, c.height);
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsla(${60 + r() * 30}, ${30 + r() * 30}%, ${18 + r() * 20}%, ${0.1 + r() * 0.2})`;
      const x = r() * c.width;
      const y = r() * c.height;
      g.fillRect(x, y, 1 + r() * 3, 4 + r() * 10);
    }
    this.bgFences(g);
    return c;
  }

  bgFences(g) {
    const L = this.sim.layout;
    g.strokeStyle = 'rgba(70,52,34,.95)';
    g.lineWidth = 3;
    for (const f of L.fences) {
      g.beginPath();
      f.pts.forEach(([x, z], i) => (i ? g.lineTo(...this.w2c(x, z)) : g.moveTo(...this.w2c(x, z))));
      g.stroke();
    }
    for (const o of L.objects) {
      const [x, y] = this.w2c(o.x, o.z);
      if (o.type === 'gate') {
        g.fillStyle = '#e0a526';
        g.save();
        g.translate(x, y);
        g.rotate(o.rot ?? 0);
        g.fillRect(-48, -3, 96, 6);
        g.restore();
      } else if (o.type === 'trough') {
        g.fillStyle = '#9aa3a8';
        g.fillRect(x - 24, y - 8, 48, 16);
        g.fillStyle = '#2b5f7a';
        g.fillRect(x - 21, y - 5, 42, 10);
      } else if (o.type === 'tree') {
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.ellipse(x + 26, y + 16, 46, 32, 0.4, 0, 7);
        g.fill();
        g.fillStyle = '#2f4a1c';
        g.beginPath();
        g.arc(x, y, 40, 0, 7);
        g.fill();
      }
    }
  }

  async startFlockCamera() {
    if (!cameraSupported()) {
      $('flock-status').textContent = 'No camera in this browser. The modelled drone feed keeps running.';
      return;
    }
    try {
      this.feed.stream = await openCamera($('flock-video'), 'environment');
      this.feed.mode = 'live';
      this.feed.tracker.reset();
      this.feed.counter = null;
      $('flock-cam').textContent = 'Back to drone feed';
      $('flock-prov').textContent = 'Live · on-device';
      $('flock-prov').dataset.tone = 'confirm';
      await this.det.load('webgl', (m) => ($('flock-status').textContent = m));
    } catch (err) {
      $('flock-status').textContent = `Camera or model unavailable: ${err.message}`;
      if (!this.det.model) this.stopFlockCamera();
    }
  }

  stopFlockCamera() {
    stopCamera(this.feed.stream);
    this.feed.stream = null;
    this.feed.mode = 'drone';
    this.feed.tracker.reset();
    this.feed.counter = null;
    $('flock-cam').textContent = 'Use a camera (COCO-SSD)';
    $('flock-prov').textContent = 'Modelled feed';
    $('flock-prov').dataset.tone = 'caution';
  }

  /** Synthetic detections from the simulation, as a drone's detector would see them. */
  droneDetections() {
    const out = [];
    const ppm = this.flockCanvas.width / (this.view.x1 - this.view.x0);
    const R = this.sim.rand;
    const add = (a, cls, w, h) => {
      const [x, y] = this.w2c(a.x, a.z);
      if (x < -20 || y < -20 || x > this.flockCanvas.width + 20 || y > this.flockCanvas.height + 20) return;
      // Crowded animals score lower: exactly the case ByteTrack's second pass rescues.
      let near = 0;
      for (const b of this.sim.sheep) if (b !== a && Math.abs(b.x - a.x) < 1.6 && Math.abs(b.z - a.z) < 1.6) near++;
      const score = Math.max(0.12, 0.9 - near * 0.25 + (R() - 0.5) * 0.08);
      if (R() < 0.03) return;
      const bw = w * ppm;
      const bh = h * ppm;
      out.push({ box: [x - bw / 2 + (R() - 0.5) * 2, y - bh / 2 + (R() - 0.5) * 2, bw, bh], score, cls });
    };
    for (const s of this.sim.sheep) add(s, 'sheep', 1.8, 1.8);
    for (const w of this.sim.visibleCrew()) add(w, 'person', 1.6, 1.6);
    if (this.sim.dog) add(this.sim.dog, 'dog', 1.6, 1.6);
    for (const a of this.sim.assets) if (a.kind === 'tractor' || a.kind === 'quad') add(a, 'vehicle', a.kind === 'tractor' ? 4 : 2.4, a.kind === 'tractor' ? 4 : 2.4);
    return out;
  }

  async drawFlock(t) {
    const c = this.flockCanvas;
    const g = this.flockCtx;
    const W = c.width;
    const H = c.height;
    const F = this.feed;
    let tracks;
    if (F.mode === 'live' && this.det.model && $('flock-video').readyState >= 2) {
      if (this.flockBusy) return;
      this.flockBusy = true;
      g.drawImage($('flock-video'), 0, 0, W, H);
      const dets = (await this.det.detect(c, 30, 0.15)).filter((d) => ['person', 'sheep', 'cow', 'horse', 'dog'].includes(d.cls));
      g.drawImage($('flock-video'), 0, 0, W, H);
      tracks = F.tracker.update(dets);
      F.counter ??= new LineCounter([0, H * 0.55], [W, H * 0.55]);
      F.counter.update(tracks);
      this.flockBusy = false;
      // People in a live frame are blurred: identity is not this console's business.
      for (const tr of tracks) {
        if (tr.cls !== 'person') continue;
        const [x, y, w, h] = tr.box;
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        g.filter = 'blur(14px)';
        g.drawImage(c, 0, 0);
        g.restore();
      }
      g.strokeStyle = 'rgba(255,178,61,.9)';
      g.setLineDash([14, 10]);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, H * 0.55);
      g.lineTo(W, H * 0.55);
      g.stroke();
      g.setLineDash([]);
    } else {
      // Modelled drone feed.
      g.drawImage(this.bg, 0, 0);
      const ppm = W / (this.view.x1 - this.view.x0);
      const shadow = (x, y, rx, ry) => {
        g.fillStyle = 'rgba(0,0,0,.32)';
        g.beginPath();
        g.ellipse(x + rx * 0.5, y + ry * 0.6, rx, ry, 0.5, 0, 7);
        g.fill();
      };
      for (const s of this.sim.sheep) {
        const [x, y] = this.w2c(s.x, s.z);
        shadow(x, y, 0.75 * ppm, 0.45 * ppm);
        g.save();
        g.translate(x, y);
        g.rotate(s.heading);
        g.fillStyle = '#ece6d6';
        g.beginPath();
        g.ellipse(0, 0, 0.75 * ppm, 0.5 * ppm, 0, 0, 7);
        g.fill();
        g.fillStyle = '#211d19';
        g.beginPath();
        g.ellipse(0.75 * ppm, 0, 0.28 * ppm, 0.22 * ppm, 0, 0, 7);
        g.fill();
        g.restore();
      }
      for (const w of this.sim.visibleCrew()) {
        const [x, y] = this.w2c(w.x, w.z);
        shadow(x, y, 0.5 * ppm, 0.4 * ppm);
        g.fillStyle = w.colour;
        g.beginPath();
        g.arc(x, y, 0.45 * ppm, 0, 7);
        g.fill();
        g.fillStyle = '#d9c39a';
        g.beginPath();
        g.arc(x, y, 0.28 * ppm, 0, 7);
        g.fill();
      }
      for (const a of this.sim.assets) {
        if (a.kind !== 'tractor' && a.kind !== 'quad') continue;
        const [x, y] = this.w2c(a.x, a.z);
        g.save();
        g.translate(x, y);
        g.rotate(a.heading);
        g.fillStyle = a.kind === 'tractor' ? '#2f7a32' : '#b3261e';
        g.fillRect(-1.6 * ppm, -0.8 * ppm, 3.2 * ppm, 1.6 * ppm);
        g.restore();
        if (a.machine && a.moving) {
          g.strokeStyle = `rgba(255,59,78,${0.4 + 0.3 * Math.sin(t * 5)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, 6 * ppm, 0, 7);
          g.stroke();
        }
      }
      if (this.sim.dog) {
        const [x, y] = this.w2c(this.sim.dog.x, this.sim.dog.z);
        g.fillStyle = '#7a5a3a';
        g.beginPath();
        g.ellipse(x, y, 0.6 * ppm, 0.3 * ppm, this.sim.dog.heading, 0, 7);
        g.fill();
      }
      tracks = F.tracker.update(this.droneDetections());
      const gate = penGate(this.sim.layout);
      if (gate) {
        const [ax, ay] = this.w2c(gate.x - 3, gate.z);
        const [bx, by] = this.w2c(gate.x + 3, gate.z);
        g.strokeStyle = 'rgba(255,178,61,.95)';
        g.setLineDash([10, 8]);
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(ax, ay);
        g.lineTo(bx, by);
        g.stroke();
        g.setLineDash([]);
        const h = this.sim.headcount();
        g.font = '600 18px ui-monospace, Menlo, monospace';
        const txt = `GATE  IN ${h.gateIn}  OUT ${h.gateOut}  NET ${h.net}`;
        g.fillStyle = 'rgba(4,6,10,.8)';
        g.fillRect(bx + 10, by - 16, g.measureText(txt).width + 16, 28);
        g.fillStyle = '#ffb23d';
        g.fillText(txt, bx + 18, by + 4);
      }
    }
    // Tracks.
    const strays = new Set([...this.sim.flagged].filter((k) => k.startsWith('stray:')).map((k) => k.slice(6)));
    g.font = '600 12px ui-monospace, Menlo, monospace';
    for (const tr of F.tracker.tracks) {
      if (tr.state === 'tentative') continue;
      const [x, y, w, h] = tr.box;
      const col = tr.cls === 'dog' ? '#ff3b4e' : tr.cls === 'person' ? '#ffb23d' : tr.cls === 'vehicle' ? '#29e07f' : '#4fe8ff';
      g.strokeStyle = col;
      g.globalAlpha = tr.lost ? 0.5 : 0.95;
      g.lineWidth = 1.5;
      const k = Math.min(8, w / 3);
      g.beginPath();
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        g.moveTo(cx + sx * k, cy);
        g.lineTo(cx, cy);
        g.lineTo(cx, cy + sy * k);
      }
      g.stroke();
      if (tr.cls !== 'sheep' || tr.id % 3 === 0 || F.mode === 'live') {
        g.fillStyle = col;
        g.fillText(`${tr.id}${tr.cls === 'sheep' ? '' : ' ' + tr.cls}`, x, y - 3);
      }
      g.globalAlpha = 1;
    }
    if (F.mode !== 'live') {
      for (const s of this.sim.sheep) {
        if (!strays.has(s.id)) continue;
        const [x, y] = this.w2c(s.x, s.z);
        g.strokeStyle = `rgba(255,178,61,${0.6 + 0.4 * Math.sin(t * 6)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 22, 0, 7);
        g.stroke();
        g.fillStyle = '#ffb23d';
        g.fillText('STRAGGLER', x + 24, y - 10);
      }
    }
    // Cinematic finish: vignette, grain, letterbox, OSD.
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,170,90,.05)';
    g.fillRect(0, 0, W, H);
    g.drawImage(this.grain, (Math.random() * 256) | 0, (Math.random() * 256) | 0, W, H, 0, 0, W * 4, H * 4);
    const bar = Math.round((H - W / 2.39) / 2);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);
    g.font = '13px ui-monospace, Menlo, monospace';
    g.fillStyle = '#4fe8ff';
    g.fillText(F.mode === 'live' ? `LIVE CAMERA · COCO-SSD · ${this.det.backend ?? '—'} · ON-DEVICE` : 'DRONE 01 · ALT 60 m · MODELLED FEED · ON-DEVICE', 18, bar + 24);
    g.fillStyle = '#8aa6ba';
    g.fillText(`TRACKS ${F.tracker.visible().length} · T+${fmtT(this.sim.t)}`, W - 230, bar + 24);
    g.strokeStyle = 'rgba(79,232,255,.5)';
    g.lineWidth = 1;
    for (const [x, y, sx, sy] of [[16, bar + 36, 1, 1], [W - 16, bar + 36, -1, 1], [16, H - bar - 16, 1, -1], [W - 16, H - bar - 16, -1, -1]]) {
      g.beginPath();
      g.moveTo(x + sx * 26, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * 26);
      g.stroke();
    }
    this.flockTracks = tracks;
  }

  renderCrew() {
    const s = this.sim;
    $('flock-crew').innerHTML = s.crew
      .map((w) => {
        const on = s.consent[w.id];
        const inBarn = Math.abs(w.x + 22) < 10 && Math.abs(w.z - 22) < 7;
        const fix = !on ? 'not tracked' : inBarn ? 'VPS fix ±3 cm (indoors, no GPS)' : 'GNSS ±2.5 m · VPS ±4 cm near mapped anchors';
        const overdue = s.t - w.lastCheckIn;
        const flagged = [...s.flagged].some((k) => k.endsWith(':' + w.id) || k.includes(':' + w.id + ':'));
        return `<li class="row" data-tone="${!on ? 'muted' : flagged ? 'caution' : 'confirm'}">
          <div class="row-head"><b style="color:${w.colour}">${esc(w.name)}</b><span class="prov" data-tone="${on ? 'confirm' : 'muted'}">${on ? 'Tag opted in' : 'Opted out'}</span><time>${on ? `check-in ${fmtT(overdue)} ago` : ''}</time></div>
          <p>${esc(w.role)} · ${fix}</p>
          <div class="controls" style="margin-top:7px"><button class="ghost" type="button" data-act="checkin" data-id="${w.id}" ${on ? '' : 'disabled'}>Check in</button><button class="ghost" type="button" data-act="consent" data-id="${w.id}">${on ? 'Opt out' : 'Opt in'}</button></div>
        </li>`;
      })
      .join('');
  }

  tickFlockPanels() {
    const s = this.sim;
    const h = s.headcount();
    const strays = [...s.flagged].filter((k) => k.startsWith('stray:')).length;
    const live = this.feed.mode === 'live';
    const lc = this.feed.counter;
    $('flock-count').innerHTML = live
      ? `<div class="readout"><span class="k">Crossed line · in</span><span class="v">${lc?.in ?? 0}</span></div>
         <div class="readout"><span class="k">Crossed line · out</span><span class="v">${lc?.out ?? 0}</span></div>
         <div class="readout"><span class="k">Tracked now</span><span class="v">${this.feed.tracker.visible().length}</span></div>
         <div class="readout"><span class="k">By class</span><span class="v" style="font-size:12px">${Object.entries(this.feed.tracker.counts()).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</span></div>`
      : `<div class="readout"><span class="k">Flock</span><span class="v">${h.flock}</span><div class="n">expected head</div></div>
         <div class="readout"><span class="k">Through gate</span><span class="v" data-tone="${h.net === h.inPen ? 'confirm' : 'caution'}">${h.net}</span><div class="n">in ${h.gateIn} · out ${h.gateOut}</div></div>
         <div class="readout"><span class="k">In the pen</span><span class="v">${h.inPen}</span><div class="n">${h.outPen} still out</div></div>
         <div class="readout"><span class="k">Stragglers</span><span class="v" data-tone="${strays ? 'caution' : 'confirm'}">${strays}</span><div class="n">far from the flock &gt; 8 s</div></div>
         <div class="readout"><span class="k">Tracker IDs</span><span class="v">${this.feed.tracker.visible().length}</span><div class="n">ByteTrack, two-pass</div></div>
         <div class="readout"><span class="k">Dog</span><span class="v" data-tone="${s.dog ? 'alert' : 'muted'}">${s.dog ? 'IN FIELD' : 'none'}</span></div>`;
    $('flock-assets').innerHTML = s.assets
      .map((a) => {
        const inB = a.x >= BOUNDS.x0 && a.x <= BOUNDS.x1 && a.z >= BOUNDS.z0 && a.z <= BOUNDS.z1;
        const where = inPolygon([a.x, a.z], s.layout.zones.pen) ? 'holding pen' : a.x < -25 && a.z > -5 ? 'yard / shed' : a.z < -10 ? 'paddocks' : 'track';
        return `<li class="row" data-tone="${inB ? (a.moving ? 'caution' : 'primary') : 'alert'}"><div class="row-head"><b>${esc(a.name)}</b><span class="prov" data-tone="primary">Tag</span><time>${a.moving ? 'moving' : 'parked'}</time></div><p>${where} · ${a.x.toFixed(0)}, ${a.z.toFixed(0)} m · ${inB ? 'inside boundary' : 'OUTSIDE BOUNDARY'}</p></li>`;
      })
      .join('');
    const ev = s.events.slice(0, 8);
    $('flock-events').innerHTML = ev.length
      ? ev.map((e) => `<li class="row" data-tone="${tone(e.level)}"><div class="row-head"><b>${esc(e.type.toUpperCase())}</b><time>T+${fmtT(e.t)}</time></div><p>${esc(e.text)}</p></li>`).join('')
      : '<li class="empty">No events yet. Send the flock to the pen, or release a dog, and watch the rules fire.</li>';
    if (this.uiCrewT === undefined || this.uiCrewT > 2) {
      this.renderCrew();
      this.uiCrewT = 0;
    }
    this.uiCrewT += 0.5;
  }

  /* =============================================================== DEPTH */

  buildDepthUi() {
    $('depth-run').addEventListener('click', () => this.runDepth());
    $('depth-synth').addEventListener('click', () => {
      this.depthSrc = { ...syntheticDepth(192, 108, Math.random() * 10), real: false };
      this.rebuildCloud();
    });
    for (const id of ['depth-stride', 'depth-max', 'depth-fov', 'depth-colour']) $(id).addEventListener('input', () => this.rebuildCloud());
    this.depthSrc = { ...syntheticDepth(192, 108, 0), real: false };
  }

  async ensureDepth() {
    if (this.depthView || this.depthLoading) return;
    this.depthLoading = true;
    try {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      const { createCinemaStage } = await import('../../vision-kit/cinema.js');
      const canvas = $('depth-canvas');
      const stage = createCinemaStage(canvas, { bloom: [0.7, 0.5, 0.6], exposure: 1.1 });
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#020306');
      scene.fog = new THREE.Fog('#020306', 14, 40);
      const cam = new THREE.PerspectiveCamera(45, 2, 0.05, 100);
      cam.position.set(2.2, 1.4, 2.2);
      stage.use(scene, cam);
      const controls = new OrbitControls(cam, canvas);
      controls.target.set(0, 0, -3);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      const grid = new THREE.GridHelper(20, 40, '#0a5c72', '#0a2230');
      grid.position.y = -1.2;
      scene.add(grid);
      const frustum = new THREE.Group();
      scene.add(frustum);
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
      const points = new THREE.Points(geo, mat);
      scene.add(points);
      this.depthView = { THREE, stage, scene, cam, controls, points, frustum };
      this.rebuildCloud();
    } catch (err) {
      $('depth-note').textContent = `3D view unavailable: ${err.message}`;
    }
  }

  rebuildCloud() {
    const V = this.depthView;
    const S = this.depthSrc;
    if (!S) return;
    const stride = Number($('depth-stride').value);
    const maxDepth = Number($('depth-max').value);
    const fov = Number($('depth-fov').value);
    const colorBy = $('depth-colour').value;
    $('depth-max-v').textContent = `${maxDepth} m`;
    $('depth-fov-v').textContent = `${fov}°`;
    const K = intrinsicsFromFov(S.width, S.height, fov);
    const depth = disparityToDepth(S.disparity, 1.5, 0.02);
    const t0 = performance.now();
    const pc = depthToPoints(depth, K, { stride, maxDepth, rgb: colorBy === 'rgb' ? S.rgb : null, colorBy });
    const ms = performance.now() - t0;
    $('depth-stats').innerHTML = `
      <div class="readout"><span class="k">Points</span><span class="v">${pc.count.toLocaleString()}</span><div class="n">${pc.dropped.toLocaleString()} dropped (sky / beyond max)</div></div>
      <div class="readout"><span class="k">fx · fy</span><span class="v">${K.fx.toFixed(1)}</span><div class="n">from ${fov}° horizontal FOV</div></div>
      <div class="readout"><span class="k">cx · cy</span><span class="v">${K.cx} · ${K.cy}</span><div class="n">${S.width} × ${S.height} depth map</div></div>
      <div class="readout"><span class="k">Back-project</span><span class="v">${ms.toFixed(1)} ms</span><div class="n">${S.ms ? `model ${S.ms.toFixed(0)} ms` : 'synthetic input'}</div></div>`;
    $('depth-prov').textContent = S.real ? 'Measured · Depth Anything V2' : 'Synthetic scene';
    $('depth-prov').dataset.tone = S.real ? 'confirm' : 'caution';
    if (!V) return;
    const { THREE } = V;
    V.points.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pc.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pc.colors, 3));
    V.points.geometry = g;
    // Camera frustum wireframe at the origin, like an RViz camera marker.
    V.frustum.clear();
    const far = Math.min(maxDepth, 3);
    const hw = (far * S.width) / 2 / K.fx;
    const hh = (far * S.height) / 2 / K.fy;
    const c = [[0, 0, 0], [-hw, hh, -far], [hw, hh, -far], [hw, -hh, -far], [-hw, -hh, -far]];
    const idx = [0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 2, 3, 3, 4, 4, 1];
    const fg = new THREE.BufferGeometry().setFromPoints(idx.map((i) => new THREE.Vector3(...c[i])));
    V.frustum.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: '#ffb23d', transparent: true, opacity: 0.7 })));
  }

  async runDepth() {
    const note = $('depth-note');
    try {
      let src;
      if (cameraSupported()) {
        const v = document.createElement('video');
        const stream = await openCamera(v, 'environment');
        await new Promise((r) => setTimeout(r, 400));
        src = document.createElement('canvas');
        src.width = 480;
        src.height = 270;
        src.getContext('2d').drawImage(v, 0, 0, 480, 270);
        stopCamera(stream);
      } else throw new Error('no camera');
      await loadDepth((m) => (note.textContent = m));
      const r = await estimateDepth(src);
      const rc = document.createElement('canvas');
      rc.width = r.width;
      rc.height = r.height;
      const rg = rc.getContext('2d');
      rg.drawImage(src, 0, 0, r.width, r.height);
      this.depthSrc = { disparity: r.disparity, rgb: rg.getImageData(0, 0, r.width, r.height).data, width: r.width, height: r.height, ms: r.ms, real: true };
      note.textContent = 'One frame, estimated on this device and discarded. Units are relative until calibrated against one known distance.';
      this.rebuildCloud();
    } catch (err) {
      note.textContent = `Could not run the model here (${err.message}). The synthetic scene stays up.`;
    }
  }

  /* ========================================================== SPEED LAB */

  buildSpeedUi() {
    $('speed-run').addEventListener('click', () => this.runBench());
    $('speed-track').addEventListener('click', () => this.runTrackerBench());
    $('speed-q').addEventListener('input', () => this.renderBatching());
    this.renderBatching();
  }

  frameSource(size) {
    const c = (this.benchCanvas ??= document.createElement('canvas'));
    c.width = size;
    c.height = Math.round((size * 9) / 16);
    const g = c.getContext('2d');
    if (this.benchStream && this.benchVideo?.readyState >= 2) g.drawImage(this.benchVideo, 0, 0, c.width, c.height);
    else g.drawImage(this.flockCanvas, 0, 0, c.width, c.height);
    return c;
  }

  async runBench() {
    const out = $('speed-results');
    const size = Number($('speed-size').value);
    const N = Number($('speed-n').value);
    const runtimes = [...document.querySelectorAll('#speed-runtimes input:checked')].map((i) => i.value);
    if (!runtimes.length) return;
    $('speed-run').disabled = true;
    try {
      if ($('speed-usecam').checked && cameraSupported() && !this.benchStream) {
        this.benchVideo = document.createElement('video');
        this.benchStream = await openCamera(this.benchVideo, 'environment');
      }
      await this.det.load(runtimes[0], (m) => ($('speed-status').textContent = m));
      const rows = [];
      for (const rt of runtimes) {
        const got = await this.det.setBackend(rt, (m) => ($('speed-status').textContent = m));
        const H = new LatencyHarness(N);
        for (let i = 0; i < N + 3; i++) {
          const t0 = performance.now();
          H.begin(t0);
          const src = this.frameSource(size);
          H.mark('capture', performance.now());
          const dets = await this.det.detect(src, 20, 0.2);
          H.mark('inference', performance.now());
          this.feed.tracker.update(dets.map((d) => ({ ...d })));
          H.mark('scoring', performance.now());
          H.end(performance.now());
          if (i < 3) H.samples = {}; // warm-up frames are not measured
          $('speed-status').textContent = `${got}: frame ${i + 1}/${N + 3}`;
        }
        rows.push({ rt: got, asked: rt, st: H.stats() });
      }
      this.benchRows = rows;
      const base = rows[0].st.loop.median;
      out.innerHTML = rows
        .map((r) => `<li class="row" data-tone="${r.st.loop.median <= base ? 'confirm' : 'primary'}"><div class="row-head"><b>${r.rt.toUpperCase()}${r.rt !== r.asked ? ` (asked ${r.asked})` : ''}</b><span class="prov" data-tone="confirm">Measured · this device</span><time>${size}px · n=${r.st.loop.n}</time></div>
          <p>full loop median ${r.st.loop.median.toFixed(1)} ms · p95 ${r.st.loop.p95.toFixed(1)} ms · ${(1000 / r.st.loop.median).toFixed(1)} fps${r !== rows[0] ? ` · ${pctChange(base, r.st.loop.median).toFixed(0)} % vs ${rows[0].rt}` : ''}</p>
          <p class="why">capture ${r.st.capture.median.toFixed(1)} · inference ${r.st.inference.median.toFixed(1)} · tracking + rules ${r.st.scoring.median.toFixed(2)} ms (medians)</p></li>`)
        .join('');
      this.drawStages(rows);
      $('speed-status').textContent = 'Done. Numbers are for this browser on this device only.';
      this.renderBatching();
    } catch (err) {
      $('speed-status').textContent = `Benchmark could not run: ${err.message}. The tracker benchmark below needs no model.`;
    } finally {
      $('speed-run').disabled = false;
    }
  }

  runTrackerBench() {
    const rows = [];
    for (const n of [10, 50, 200]) {
      const tr = new ByteTracker({ minHits: 1 });
      const boxes = Array.from({ length: n }, (_, i) => [(i * 37) % 1200, (i * 53) % 650, 30, 30]);
      const times = [];
      // Browsers coarsen the clock to ~0.1 ms, so time batches of 10 frames and divide.
      const frame = (f) => boxes.map((b, i) => ({ box: [b[0] + f * 0.8 + Math.sin(i + f) * 1.5, b[1] + Math.cos(i * 0.3 + f) * 1.5, 30, 30], score: i % 5 ? 0.85 : 0.3, cls: i % 4 ? 'sheep' : 'cow' }));
      for (let f = 0; f < 6; f++) tr.update(frame(f));
      for (let k = 0; k < 24; k++) {
        const batch = Array.from({ length: 10 }, (_, j) => frame(6 + k * 10 + j));
        const t0 = performance.now();
        for (const d of batch) tr.update(d);
        times.push((performance.now() - t0) / 10);
      }
      rows.push({ n, med: quantile(times, 0.5), p95: quantile(times, 0.95) });
    }
    $('speed-tracker').innerHTML = rows
      .map((r) => `<div class="readout"><span class="k">${r.n} objects</span><span class="v">${r.med.toFixed(3)} ms</span><div class="n">p95 ${r.p95.toFixed(3)} ms · measured</div></div>`)
      .join('');
  }

  renderBatching() {
    const q = Number($('speed-q').value);
    $('speed-q-v').textContent = q;
    const r = this.benchRows?.[0];
    const inf = r ? r.st.inference.median : 40;
    const sc = r ? Math.max(0.2, r.st.scoring.median) : 1.5;
    const b = batchingModel(inf, sc + 0.8, q);
    $('speed-batch').innerHTML = `
      <div class="readout"><span class="k">One question at a time</span><span class="v">${b.sequential.toFixed(0)} ms</span><div class="n">${q} × (inference + rules)</div></div>
      <div class="readout"><span class="k">All ${q} in one pass</span><span class="v" data-tone="confirm">${b.batched.toFixed(0)} ms</span><div class="n">detect once, run every rule on it</div></div>
      <div class="readout"><span class="k">Speed-up</span><span class="v" data-tone="confirm">${b.speedup.toFixed(1)}×</span><div class="n">${r ? 'from your measured inference' : 'with a 40 ms model, until you run the benchmark'}</div></div>`;
  }

  drawStages(rows) {
    const c = $('speed-chart');
    const g = c.getContext('2d');
    const W = (c.width = c.clientWidth * (devicePixelRatio || 1));
    const H = (c.height = 46 * rows.length * (devicePixelRatio || 1));
    const dpr = devicePixelRatio || 1;
    g.clearRect(0, 0, W, H);
    const max = Math.max(...rows.map((r) => r.st.loop.p95));
    const cols = { capture: '#8aa6ba', inference: '#4fe8ff', scoring: '#29e07f' };
    rows.forEach((r, i) => {
      let x = 90 * dpr;
      const y = i * 46 * dpr + 10 * dpr;
      g.fillStyle = '#8aa6ba';
      g.font = `${11 * dpr}px ui-monospace, monospace`;
      g.fillText(r.rt.toUpperCase(), 6 * dpr, y + 16 * dpr);
      for (const k of ['capture', 'inference', 'scoring']) {
        const w = ((r.st[k].median / max) * (W - 100 * dpr));
        g.fillStyle = cols[k];
        g.fillRect(x, y, Math.max(1, w), 20 * dpr);
        x += w;
      }
      const px = 90 * dpr + (r.st.loop.p95 / max) * (W - 100 * dpr);
      g.fillStyle = '#ff3b4e';
      g.fillRect(px - dpr, y - 4 * dpr, 2 * dpr, 28 * dpr);
    });
  }

  /* ================================================================ LOOP */

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const d = this.deck;
    if (d === 'twin' || d === 'flock') {
      this.sim.step(dt);
      if (d === 'twin' && this.twin) this.twin.update(dt, this.t);
      if (d === 'flock') this.drawFlock(this.t);
      this.uiT += dt;
      if (this.uiT > 0.5) {
        this.uiT = 0;
        if (d === 'twin') {
          this.tickTwinLive();
          this.renderTwinPanels();
        } else this.tickFlockPanels();
      }
    }
    if (d === 'depth' && this.depthView) {
      this.depthView.controls.update();
      this.depthView.stage.render(this.t, dt);
    }
    requestAnimationFrame((n) => this.loop(n));
  }
}

export { CREW, groupOf };
