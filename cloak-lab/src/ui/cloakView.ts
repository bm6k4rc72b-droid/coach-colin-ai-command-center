/**
 * Tab 2 — the live software cloak: camera (webcam or synthetic) → AI segmentation → mask
 * refinement → compositing, with per-stage timings, a red-team person detector, and an EMP test
 * that uses the cloak controller's hardening from the EMP Lab.
 */
import { CLOAK } from '../config/lab';
import { blurRGBA, CLOAK_MODES, composite, glitch, maskIoU, refineMask, residualEvidence, type CloakMode } from '../core/cloakMath';
import { cloakDowntime, DEVICES, evaluate, type Outcome } from '../core/emp';
import { state } from '../core/store';
import { PersonDetector } from '../ai/detector';
import { PersonSegmenter } from '../ai/segmenter';
import { simulatedSegmenter, SyntheticCamera } from '../ai/synthetic';
import { $, esc, pct } from './dom';

const W = CLOAK.width;
const H = CLOAK.height;

export class CloakView {
  private root: HTMLElement;
  private out!: HTMLCanvasElement;
  private octx!: CanvasRenderingContext2D;
  private thumbs: CanvasRenderingContext2D[] = [];
  private work: HTMLCanvasElement;
  private wctx: CanvasRenderingContext2D;
  private outWork: HTMLCanvasElement;
  private outWctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  private synth = new SyntheticCamera();
  private seg = new PersonSegmenter();
  private det = new PersonDetector();
  source: 'synthetic' | 'webcam' = 'synthetic';
  mode: CloakMode = 'off';
  threshold = CLOAK.threshold;
  feather = CLOAK.feather;
  dilatePx = CLOAK.dilate;
  redTeam = true;
  private plate: Uint8ClampedArray | null = null;
  private plateBlur: Uint8ClampedArray | null = null;
  private t = 0;
  private frameNo = 0;
  private timings = { capture: 0, segment: 0, refine: 0, composite: 0, detect: 0 };
  private fps = 0;
  private iou: number | null = null;
  private evidence = { raw: 0, out: 0 };
  private detecting = false;
  private lastDetect = 0;
  private detectTurn = 0;
  private emp: { until: number; outcome: Outcome; started: number } | null = null;
  private countdown = 0;
  private lastOut: Uint8ClampedArray | null = null;
  private stream: MediaStream | null = null;
  active = false;

  constructor(root: HTMLElement) {
    this.root = root;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    };
    this.work = mk();
    this.wctx = this.work.getContext('2d', { willReadFrequently: true })!;
    this.outWork = mk();
    this.outWctx = this.outWork.getContext('2d', { willReadFrequently: true })!;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <h2>Live software cloak</h2>
      <p class="lede">This is the real technique behind webcam "invisibility": an AI model finds your pixels, and a
        compositor replaces them with a stored picture of the empty scene. Use the synthetic actor, or switch to your
        own webcam — everything runs locally in this tab; no video leaves your device.</p>
      <div class="grid cols-2">
        <div class="card">
          <canvas id="cloak-out" width="${W}" height="${H}" aria-label="Cloak output"></canvas>
          <div class="stages" id="stages">
            ${['1 · Camera input', '2 · AI mask (person confidence)', '3 · Clean plate', '4 · Composite output']
              .map((c, i) => `<figure><canvas width="${W / 2}" height="${H / 2}" data-thumb="${i}"></canvas><figcaption>${c}</figcaption></figure>`)
              .join('')}
          </div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card">
            <h3>Source</h3>
            <div class="row">
              <button data-src="synthetic">Synthetic actor</button>
              <button data-src="webcam">My webcam</button>
              <span id="src-status" class="muted"></span>
            </div>
            <div class="row" style="margin-top:8px">
              <button id="plate-btn" class="primary">Capture clean plate</button>
              <span id="plate-status" class="muted"></span>
            </div>
          </div>
          <div class="card">
            <h3>Cloak mode</h3>
            <div class="modes">${CLOAK_MODES.map((m) => `<button data-mode="${m.id}">${esc(m.name)}</button>`).join('')}</div>
            <p id="mode-info" class="muted" style="margin:8px 0 0"></p>
            <div style="margin-top:8px;display:grid;gap:4px">
              <label class="slider">Mask threshold <input type="range" min="0.1" max="0.9" step="0.05" data-k="threshold"/><span></span></label>
              <label class="slider">Dilate (px) <input type="range" min="0" max="8" step="1" data-k="dilatePx"/><span></span></label>
              <label class="slider">Feather (px) <input type="range" min="0" max="10" step="1" data-k="feather"/><span></span></label>
            </div>
            <div class="row" style="margin-top:8px">
              <button id="drift-btn" aria-pressed="false">Lights change</button>
              <button id="shake-btn" aria-pressed="false">Camera shake</button>
            </div>
          </div>
          <div class="card" id="redteam">
            <h3>Red team: does an AI still see a person?</h3>
            <div id="rt-body"></div>
          </div>
          <div class="card">
            <h3>Pipeline timing</h3>
            <div id="timing" class="kv"></div>
          </div>
          <div class="card">
            <h3>EMP test</h3>
            <p class="muted" style="margin-top:0">Fires the EMP Lab's pulse (threat <span id="emp-threat"></span>) at the cloak controller, using the protection you set there.</p>
            <div class="row"><button id="emp-btn">⚡ Pulse the cloak</button><button id="repair-btn" class="hidden">Repair controller</button></div>
            <div id="emp-status" style="margin-top:6px"></div>
          </div>
        </div>
      </div>`;
    this.out = $('#cloak-out', this.root);
    this.octx = this.out.getContext('2d')!;
    this.thumbs = Array.from(this.root.querySelectorAll<HTMLCanvasElement>('[data-thumb]')).map((c) => c.getContext('2d')!);

    this.root.querySelectorAll<HTMLButtonElement>('[data-src]').forEach((b) =>
      b.addEventListener('click', () => (b.dataset.src === 'webcam' ? void this.useWebcam() : this.useSynthetic())),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode as CloakMode)));
    this.root.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
      const k = inp.dataset.k as 'threshold' | 'dilatePx' | 'feather';
      inp.value = String(this[k]);
      inp.addEventListener('input', () => {
        this[k] = Number(inp.value);
        this.sync();
      });
    });
    $('#plate-btn', this.root).addEventListener('click', () => this.capturePlate());
    $('#drift-btn', this.root).addEventListener('click', () => this.setLightingDrift(!this.synth.lightingDrift));
    $('#shake-btn', this.root).addEventListener('click', () => {
      this.synth.shake = !this.synth.shake;
      this.sync();
    });
    $('#emp-btn', this.root).addEventListener('click', () => this.empTest());
    $('#repair-btn', this.root).addEventListener('click', () => {
      this.emp = null;
      this.sync();
    });
    this.sync();
  }

  private sync(): void {
    const r = this.root;
    r.querySelectorAll<HTMLButtonElement>('[data-src]').forEach((b) => b.classList.toggle('on', b.dataset.src === this.source));
    r.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === this.mode));
    $('#mode-info', r).textContent = CLOAK_MODES.find((m) => m.id === this.mode)!.info;
    r.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
      const k = inp.dataset.k as 'threshold' | 'dilatePx' | 'feather';
      inp.nextElementSibling!.textContent = String(this[k]);
    });
    $('#drift-btn', r).setAttribute('aria-pressed', String(this.synth.lightingDrift));
    $('#shake-btn', r).setAttribute('aria-pressed', String(this.synth.shake));
    $('#drift-btn', r).classList.toggle('hidden', this.source !== 'synthetic');
    $('#shake-btn', r).classList.toggle('hidden', this.source !== 'synthetic');
    $('#plate-status', r).textContent = this.countdown > 0 ? `Step out of frame… ${Math.ceil(this.countdown)}` : this.plate ? 'Plate stored ✓' : 'No plate yet';
    $('#emp-threat', r).textContent = state.threat.toFixed(2);
    $('#repair-btn', r).classList.toggle('hidden', !(this.emp && this.emp.outcome === 'damaged'));
    let src = '';
    if (this.source === 'synthetic') src = 'Synthetic room · simulated segmenter';
    else if (this.seg.status === 'loading') src = 'Loading MediaPipe segmenter…';
    else if (this.seg.status === 'error') src = `Segmenter failed: ${this.seg.error}`;
    else if (this.seg.status === 'ready') src = `MediaPipe (${this.seg.delegate}) live`;
    $('#src-status', r).textContent = src;
  }

  // -------------------------------------------------------------- actions --
  useSynthetic(): void {
    this.stopWebcam();
    this.source = 'synthetic';
    this.plate = null;
    this.sync();
  }

  async useWebcam(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      $('#src-status', this.root).textContent = 'Camera not available (needs HTTPS and permission).';
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.source = 'webcam';
      this.plate = null;
      this.synth.lightingDrift = false;
      this.synth.shake = false;
      this.sync();
      void this.seg.load().then(() => this.sync());
      if (this.redTeam) void this.det.load().then(() => this.sync());
    } catch (e) {
      $('#src-status', this.root).textContent = `Camera blocked: ${e instanceof Error ? e.message : e}`;
    }
  }

  private stopWebcam(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  capturePlate(): void {
    if (this.source === 'synthetic') {
      this.setPlate(this.synth.emptyRoom(this.t));
    } else {
      this.countdown = 3;
    }
    this.sync();
  }

  private setPlate(p: Uint8ClampedArray): void {
    this.plate = p;
    this.plateBlur = blurRGBA(p, W, H, 14);
  }

  setMode(m: CloakMode): void {
    this.mode = m;
    if (m !== 'off' && !this.plate && this.source === 'synthetic') this.capturePlate();
    this.sync();
  }

  setLightingDrift(on: boolean): void {
    this.synth.lightingDrift = on;
    this.sync();
  }

  setRedTeam(on: boolean): void {
    this.redTeam = on;
    if (on && this.source === 'webcam') void this.det.load();
  }

  empTest(): void {
    const res = evaluate(DEVICES.find((d) => d.id === 'cloak')!, state.protection.cloak, state.threat);
    const down = cloakDowntime(res.outcome);
    this.emp = { until: this.t + down, outcome: res.outcome, started: this.t };
    this.out.classList.remove('empflash');
    void this.out.offsetWidth;
    this.out.classList.add('empflash');
    const msg =
      res.outcome === 'ok'
        ? '<span class="o-ok">Controller survived — brief flicker only.</span>'
        : res.outcome === 'upset'
          ? '<span class="o-upset">Controller upset — cloak rebooting for 4 s. You are visible.</span>'
          : '<span class="o-damaged">Controller damaged — the cloak is down until repaired. Harden it in the EMP Lab.</span>';
    $('#emp-status', this.root).innerHTML = `${msg}<div class="muted mono">${Math.round(res.e1V)} V induced (upset ${res.device.upsetV} V, damage ${res.device.damageV} V)</div>`;
    this.sync();
  }

  /** Cloak power 0..1 and glitch strength from the EMP state. */
  private empPower(): { power: number; glitch: number } {
    const e = this.emp;
    if (!e) return { power: 1, glitch: 0 };
    const since = this.t - e.started;
    if (e.outcome === 'damaged') return { power: 0, glitch: since < 1.2 ? 0.8 * (1 - since / 1.2) + 0.08 : 0.08 };
    if (this.t >= e.until) {
      this.emp = null;
      return { power: 1, glitch: 0 };
    }
    if (e.outcome === 'ok') return { power: 0.6 + 0.4 * Math.random(), glitch: 0.5 * (1 - since / 0.4) };
    return { power: since > e.until - e.started - 0.8 ? (since - (e.until - e.started - 0.8)) / 0.8 : 0, glitch: Math.max(0.05, 0.7 * (1 - since / 1.5)) };
  }

  // ---------------------------------------------------------------- frame --
  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    this.frameNo++;
    this.fps = this.fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.setPlate(new Uint8ClampedArray(this.grabWebcam()));
      }
      if (this.frameNo % 10 === 0) this.sync();
    }

    let t0 = performance.now();
    let rgba: Uint8ClampedArray;
    let truth: Float32Array | null = null;
    if (this.source === 'synthetic') {
      this.synth.now = this.t;
      const f = this.synth.frame(this.t);
      rgba = f.rgba;
      truth = f.truth;
    } else {
      if (this.video.readyState < 2) return;
      rgba = this.grabWebcam();
    }
    const t1 = performance.now();
    this.timings.capture = t1 - t0;

    let conf: Float32Array | null;
    t0 = performance.now();
    if (this.source === 'synthetic') conf = simulatedSegmenter(truth!, W, H, CLOAK.syntheticMaskNoise, this.frameNo);
    else conf = this.seg.segment(this.work, W, H, performance.now());
    this.timings.segment = this.source === 'synthetic' ? performance.now() - t0 : this.seg.lastMs;
    if (!conf) conf = new Float32Array(W * H);

    t0 = performance.now();
    const mask = refineMask(conf, W, H, this.threshold, this.dilatePx, this.feather);
    this.timings.refine = performance.now() - t0;

    t0 = performance.now();
    const emp = this.empPower();
    const out = composite(rgba, this.plate, mask, W, H, { mode: this.mode, time: this.t, power: emp.power, plateBlur: this.plateBlur ?? undefined });
    if (emp.glitch > 0) glitch(out, W, H, emp.glitch, this.frameNo);
    this.timings.composite = performance.now() - t0;
    this.lastOut = out;

    this.octx.putImageData(new ImageData(new Uint8ClampedArray(out), W, H), 0, 0);

    if (truth) this.iou = maskIoU(mask, truth);
    // Red team
    if (this.redTeam) {
      if (this.source === 'synthetic' && truth) {
        // Compare with what the empty room really looks like right now (not the stored plate).
        const reality = this.synth.emptyRoom(this.t);
        this.evidence.raw = residualEvidence(rgba, reality, truth);
        this.evidence.out = residualEvidence(out, reality, truth);
      } else this.runRealDetector(out);
    }

    if (this.frameNo % 3 === 0) this.drawThumbs(rgba, conf, out);
    if (this.frameNo % 8 === 0) this.drawStats();
  }

  private grabWebcam(): Uint8ClampedArray {
    const v = this.video;
    const g = this.wctx;
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    // cover-fit
    const ar = v.videoWidth / Math.max(1, v.videoHeight);
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    if (ar > W / H) sw = sh * (W / H);
    else sh = sw / (W / H);
    g.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, W, H);
    g.restore();
    return g.getImageData(0, 0, W, H).data;
  }

  private runRealDetector(out: Uint8ClampedArray): void {
    if (this.det.status === 'idle') void this.det.load();
    if (this.det.status !== 'ready' || this.detecting || this.t - this.lastDetect < 0.25) return;
    this.detecting = true;
    this.lastDetect = this.t;
    const turn = this.detectTurn++ % 2;
    let canvas = this.work;
    if (turn === 1) {
      this.outWctx.putImageData(new ImageData(new Uint8ClampedArray(out), W, H), 0, 0);
      canvas = this.outWork;
    }
    void this.det.detectPerson(canvas).then((d) => {
      if (turn === 0) this.evidence.raw = d.score;
      else this.evidence.out = d.score;
      this.timings.detect = this.det.lastMs;
      this.detecting = false;
    });
  }

  private drawThumbs(rgba: Uint8ClampedArray, conf: Float32Array, out: Uint8ClampedArray): void {
    const put = (ctx: CanvasRenderingContext2D, data: Uint8ClampedArray) => {
      const tmp = this.outWctx;
      tmp.putImageData(new ImageData(new Uint8ClampedArray(data), W, H), 0, 0);
      ctx.drawImage(this.outWork, 0, 0, W / 2, H / 2);
    };
    put(this.thumbs[0], rgba);
    const m = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = conf[i] * 255;
      m[i * 4] = v * 0.4;
      m[i * 4 + 1] = v * 0.9;
      m[i * 4 + 2] = v;
      m[i * 4 + 3] = 255;
    }
    put(this.thumbs[1], m);
    if (this.plate) put(this.thumbs[2], this.plate);
    else {
      const g = this.thumbs[2];
      g.fillStyle = '#000';
      g.fillRect(0, 0, W / 2, H / 2);
      g.fillStyle = '#86a0b4';
      g.font = '12px sans-serif';
      g.fillText('no plate captured', 12, H / 4);
    }
    put(this.thumbs[3], out);
  }

  private drawStats(): void {
    const tm = this.timings;
    const total = tm.segment + tm.refine + tm.composite;
    $('#timing', this.root).innerHTML = `
      <b>Capture</b><span>${tm.capture.toFixed(1)} ms ${this.source === 'synthetic' ? '(drawing the synthetic room)' : '(camera frame)'}</span>
      <b>Segment (AI)</b><span>${tm.segment.toFixed(1)} ms ${this.source === 'synthetic' ? '(simulated)' : `(MediaPipe ${this.seg.delegate})`}</span>
      <b>Refine mask</b><span>${tm.refine.toFixed(1)} ms</span>
      <b>Composite</b><span>${tm.composite.toFixed(1)} ms</span>
      <b>Cloak processing</b><span>${total.toFixed(1)} ms per frame (budget 33 ms at 30 fps)</span>
      <b>Display</b><span>${this.fps.toFixed(0)} fps</span>
      ${this.iou !== null && this.source === 'synthetic' ? `<b>Mask IoU</b><span>${pct(this.iou)} vs ground truth</span>` : ''}
      ${this.redTeam && this.source === 'webcam' ? `<b>Detector</b><span>${tm.detect.toFixed(0)} ms (COCO-SSD, async)</span>` : ''}`;
    const seen = (p: number) => p >= CLOAK.detectThreshold;
    const label =
      this.source === 'synthetic'
        ? 'Pixel-evidence detector (synthetic actor): how much person-like change remains where the person really is.'
        : `Real COCO-SSD person detector${this.det.status === 'loading' ? ' — loading model…' : this.det.status === 'error' ? ` — failed: ${esc(this.det.error)}` : ''}.`;
    $('#rt-body', this.root).innerHTML = `
      <p class="muted" style="margin-top:0">${label}</p>
      <div class="sensor-row"><span>Raw camera</span><div class="bar"><i style="width:${pct(this.evidence.raw)}"></i></div><span class="mono">${pct(this.evidence.raw)}</span></div>
      <div class="sensor-row"><span>Cloaked output</span><div class="bar"><i style="width:${pct(this.evidence.out)}"></i></div><span class="mono">${pct(this.evidence.out)}</span></div>
      <div class="verdict ${seen(this.evidence.out) ? 'seen' : 'unseen'}">${
        seen(this.evidence.out) ? 'PERSON DETECTED in the output' : 'Not detected in the output video'
      }</div>
      <p class="muted" style="margin-bottom:0">Remember: this only judges the video. A camera in the real room — or a thermal camera — still sees you.</p>`;
  }

  /** Last output frame (for tests/automation). */
  get output(): Uint8ClampedArray | null {
    return this.lastOut;
  }
}
