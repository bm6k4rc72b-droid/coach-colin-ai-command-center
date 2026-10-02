/**
 * Synthetic camera: a procedurally drawn room with an animated walking figure, plus its exact
 * ground-truth mask. Lets the whole cloak pipeline run without a webcam (and in tests/headless).
 */
import { CLOAK } from '../config/lab';

export class SyntheticCamera {
  readonly w = CLOAK.width;
  readonly h = CLOAK.height;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private maskCanvas: HTMLCanvasElement;
  private mctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private driftOn = false;
  private driftStart = 0;
  /** Scene time (set by the caller each frame) so drift starts when toggled. */
  now = 0;
  shake = false;
  /** Actor visible (false = "step out of frame"). */
  actorIn = true;

  constructor() {
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = this.w;
      c.height = this.h;
      return c;
    };
    this.canvas = mk();
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.maskCanvas = mk();
    this.mctx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!;
    this.bg = mk();
    this.paintRoom(this.bg.getContext('2d')!);
  }

  private paintRoom(g: CanvasRenderingContext2D): void {
    const { w, h } = this;
    const wall = g.createLinearGradient(0, 0, 0, h * 0.72);
    wall.addColorStop(0, '#4b5563');
    wall.addColorStop(1, '#6b7280');
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    // window with sky
    g.fillStyle = '#9cc7e8';
    g.fillRect(w * 0.62, h * 0.12, w * 0.26, h * 0.32);
    g.fillStyle = '#d6e8f5';
    g.fillRect(w * 0.62, h * 0.12, w * 0.26, h * 0.06);
    g.strokeStyle = '#e5e7eb';
    g.lineWidth = 5;
    g.strokeRect(w * 0.62, h * 0.12, w * 0.26, h * 0.32);
    g.beginPath();
    g.moveTo(w * 0.75, h * 0.12);
    g.lineTo(w * 0.75, h * 0.44);
    g.stroke();
    // bookshelf
    g.fillStyle = '#5b3a24';
    g.fillRect(w * 0.06, h * 0.16, w * 0.24, h * 0.52);
    const colors = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1'];
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = h * (0.19 + shelf * 0.125);
      g.fillStyle = '#3e2716';
      g.fillRect(w * 0.06, y + h * 0.1, w * 0.24, h * 0.015);
      let x = w * 0.075;
      let k = shelf * 3;
      while (x < w * 0.28) {
        const bw = 6 + ((k * 7) % 9);
        g.fillStyle = colors[k % colors.length];
        g.fillRect(x, y + ((k * 5) % 10), bw, h * 0.1 - ((k * 5) % 10));
        x += bw + 2;
        k++;
      }
    }
    // floor
    const floor = g.createLinearGradient(0, h * 0.72, 0, h);
    floor.addColorStop(0, '#8b6b4a');
    floor.addColorStop(1, '#5e4630');
    g.fillStyle = floor;
    g.fillRect(0, h * 0.72, w, h * 0.28);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo((i / 12) * w, h * 0.72);
      g.lineTo((i / 12) * w * 1.6 - w * 0.3, h);
      g.stroke();
    }
    // plant
    g.fillStyle = '#b45f3c';
    g.fillRect(w * 0.9, h * 0.6, w * 0.06, h * 0.12);
    g.fillStyle = '#2f7d32';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(w * 0.93 + Math.sin(i * 1.7) * 14, h * 0.55 - i * 6, 7, 18, i * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    // lamp
    g.fillStyle = '#facc15';
    g.beginPath();
    g.arc(w * 0.46, h * 0.1, 10, 0, Math.PI * 2);
    g.fill();
  }

  /** Draw the walking figure into a context with given fill styles. */
  private figure(g: CanvasRenderingContext2D, t: number, skin: string, jacket: string, pants: string): void {
    const { w, h } = this;
    const span = w * 0.8;
    const phase = (t * CLOAK.syntheticSpeed) % 2;
    const u = phase < 1 ? phase : 2 - phase;
    const cx = w * 0.1 + u * span;
    const dir = phase < 1 ? 1 : -1;
    const s = h / 360;
    const step = Math.sin(t * 6.5);
    const top = h * 0.24 + Math.abs(step) * 2 * s;
    const limb = (x1: number, y1: number, x2: number, y2: number, wdt: number) => {
      g.lineWidth = wdt;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    };
    // legs
    g.strokeStyle = pants;
    limb(cx - 6 * s, top + 120 * s, cx - 6 * s + step * 22 * s, top + 205 * s, 17 * s);
    limb(cx + 6 * s, top + 120 * s, cx + 6 * s - step * 22 * s, top + 205 * s, 17 * s);
    // torso
    g.fillStyle = jacket;
    g.beginPath();
    g.roundRect(cx - 24 * s, top + 34 * s, 48 * s, 92 * s, 12 * s);
    g.fill();
    // arms
    g.strokeStyle = jacket;
    limb(cx - 20 * s, top + 42 * s, cx - 20 * s - step * 16 * s * dir, top + 112 * s, 13 * s);
    limb(cx + 20 * s, top + 42 * s, cx + 20 * s + step * 16 * s * dir, top + 112 * s, 13 * s);
    // head
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(cx, top + 16 * s, 15 * s, 19 * s, 0, 0, Math.PI * 2);
    g.fill();
  }

  get lightingDrift(): boolean {
    return this.driftOn;
  }

  set lightingDrift(on: boolean) {
    if (on && !this.driftOn) this.driftStart = this.now;
    this.driftOn = on;
  }

  /** Light multiplier: dims smoothly from the moment drift is switched on, then breathes. */
  light(t: number): number {
    if (!this.driftOn) return 1;
    return 1 - CLOAK.lightingDrift * (0.5 - 0.5 * Math.cos(1.3 * Math.max(0, t - this.driftStart)));
  }

  /** Render a frame; returns RGBA pixels and the exact person mask. */
  frame(t: number): { rgba: Uint8ClampedArray; truth: Float32Array } {
    const g = this.ctx;
    const ox = this.shake ? Math.round(Math.sin(t * 13) * 3) : 0;
    const oy = this.shake ? Math.round(Math.cos(t * 11) * 2) : 0;
    g.save();
    g.translate(ox, oy);
    g.drawImage(this.bg, 0, 0);
    if (this.actorIn) this.figure(g, t, '#e0ac8a', '#1d4ed8', '#1f2937');
    g.restore();
    const L = this.light(t);
    if (L < 0.999) {
      g.fillStyle = `rgba(0,0,0,${1 - L})`;
      g.fillRect(0, 0, this.w, this.h);
    }
    const m = this.mctx;
    m.fillStyle = '#000';
    m.fillRect(0, 0, this.w, this.h);
    if (this.actorIn) {
      m.save();
      m.translate(ox, oy);
      this.figure(m, t, '#fff', '#fff', '#fff');
      m.restore();
    }
    const md = m.getImageData(0, 0, this.w, this.h).data;
    const truth = new Float32Array(this.w * this.h);
    for (let i = 0; i < truth.length; i++) truth[i] = md[i * 4] / 255;
    return { rgba: g.getImageData(0, 0, this.w, this.h).data, truth };
  }

  /** The empty room, as the "clean plate" (lit as at time t). */
  emptyRoom(t: number): Uint8ClampedArray {
    const was = this.actorIn;
    this.actorIn = false;
    const f = this.frame(t).rgba;
    this.actorIn = was;
    return new Uint8ClampedArray(f);
  }
}

/** Simulated segmenter for synthetic mode: ground truth with edge noise and a little blur. */
export function simulatedSegmenter(truth: Float32Array, w: number, h: number, noise: number, seed: number): Float32Array {
  const out = new Float32Array(truth.length);
  let s = (seed * 2246822519) >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = truth[i];
      const l = truth[y * w + Math.max(0, x - 2)];
      const r = truth[y * w + Math.min(w - 1, x + 2)];
      const u = truth[Math.max(0, y - 2) * w + x];
      const d = truth[Math.min(h - 1, y + 2) * w + x];
      const edge = v !== l || v !== r || v !== u || v !== d;
      out[i] = edge && rnd() < noise * 4 ? 1 - v : v * (0.85 + 0.15 * rnd());
    }
  }
  return out;
}
