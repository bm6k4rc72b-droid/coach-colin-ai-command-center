/**
 * The face scanner at the door of COLIN Dermal Technologies.
 *
 * The front camera (iPhone, Android or laptop) is read into a small canvas
 * a dozen times a second. The visitor lines their face up in an oval; once
 * skin fills it, the light is good enough and the face is still, regions
 * of the face are sampled frame after frame and averaged. Everything is
 * computed here, on the device: no frame is stored or sent anywhere, and
 * the camera is switched off the moment the scan ends.
 *
 * What a phone camera can honestly see, and how it is measured:
 *
 * - Colour is converted sRGB → linear → CIE XYZ (D65) → CIELAB, so
 *   lightness L* and the red–green axis a* are perceptual, not raw RGB.
 * - Tone evenness: the spread (standard deviation) of L* after a band-pass
 *   — a 5×5 box mean minus a 25×25 one, both over skin pixels only — which
 *   keeps blotches a few millimetres across and drops both pores and the
 *   light falling across the face.
 * - Redness: an erythema index EI = 100·log₁₀(R/G) (after Dawson et al.,
 *   Phys Med Biol 1980), cheeks and nose relative to the forehead, so the
 *   colour of the light and of the skin largely cancel.
 * - Shine: the share of near-specular pixels (bright and colourless,
 *   V > 0.92 and S < 0.22) on the T-zone against the cheeks.
 * - Fine texture: the mean absolute difference between L* and its 3×3
 *   mean, relative to L* — fine detail, which includes the camera's noise.
 * - Under-eye contrast: how much darker (ΔL*) the skin under the eyes is
 *   than the cheeks.
 *
 * These are photo measurements: light, camera, distance and make-up all
 * move them. The scores say how much the camera noticed, 0–100, on fixed
 * heuristic scales; they are not a diagnosis or a skin age.
 *
 * @module astra/showcase/scan
 */

/* ------------------------------------------------------------- colour */

const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;
const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

/**
 * sRGB (0–255) → CIELAB under D65.
 *
 * @returns {[number, number, number]} L*, a*, b*.
 */
export function toLab(r, g, b) {
  const R = LINEAR[r];
  const G = LINEAR[g];
  const B = LINEAR[b];
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const fy = f(Y);
  return [116 * fy - 16, 500 * (f(X) - fy), 200 * (fy - f(Z))];
}

/**
 * A broad skin-colour test in YCbCr (after Chai & Ngan, 1999, widened so
 * that deep and pale skin both pass). It only decides whether a face fills
 * the oval; it measures nothing.
 */
export function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 30 && cr >= 133 && cr <= 182 && cb >= 72 && cb <= 135;
}

/* ------------------------------------------------------------ geometry */

/** The oval guide, as fractions of the frame (portrait). */
export const OVAL = { cx: 0.5, cy: 0.47, rx: 0.3, ry: 0.36 };

/**
 * Face regions in oval coordinates (u, v ∈ [−1, 1], v down). Paired
 * regions are listed as two boxes.
 */
export const REGIONS = {
  forehead: [[-0.45, -0.86, 0.45, -0.56]],
  underEye: [[-0.58, -0.24, -0.2, -0.1], [0.2, -0.24, 0.58, -0.1]],
  cheekA: [[-0.72, 0.0, -0.3, 0.4]],
  cheekB: [[0.3, 0.0, 0.72, 0.4]],
  nose: [[-0.13, -0.1, 0.13, 0.36]],
  chin: [[-0.26, 0.66, 0.26, 0.88]],
};

/** Region boxes in pixels for a frame of `w × h`. */
export function regionBoxes(w, h) {
  const cx = OVAL.cx * w;
  const cy = OVAL.cy * h;
  const rx = OVAL.rx * w;
  const ry = OVAL.ry * h;
  const out = {};
  for (const [id, boxes] of Object.entries(REGIONS)) {
    out[id] = boxes.map(([u0, v0, u1, v1]) => [Math.round(cx + u0 * rx), Math.round(cy + v0 * ry), Math.round(cx + u1 * rx), Math.round(cy + v1 * ry)]);
  }
  return out;
}

/* ---------------------------------------------------------- box filters */

/** Summed-area table of a w × h array (size (w+1) × (h+1)). */
function integral(src, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

/** Sum of a (2r+1)² box around (x, y) in a summed-area table, clipped to the frame. */
function boxSum(I, w, h, x, y, r) {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1);
  const y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
}

/**
 * Mean L* of the skin pixels in a box: Σ(L·skin) / Σ skin. Counting skin
 * only keeps hair, eyes and the background from leaking into the filters
 * at the edges of the face.
 */
function skinMean(IL, IS, w, h, x, y, r) {
  const n = boxSum(IS, w, h, x, y, r);
  return n ? boxSum(IL, w, h, x, y, r) / n : 0;
}

/* ------------------------------------------------------------- one frame */

/**
 * Measure one frame.
 *
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img RGBA pixels.
 * @returns {object} Per-region sums plus whole-oval checks.
 */
export function measureFrame(img) {
  const { data, width: w, height: h } = img;
  const n = w * h;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const skin = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const lab = toLab(r, g, b);
    L[i] = lab[0];
    A[i] = lab[1];
    skin[i] = isSkin(r, g, b) ? 1 : 0;
  }
  const masked = new Float32Array(n);
  for (let i = 0; i < n; i += 1) masked[i] = skin[i] ? L[i] : 0;
  const IL = integral(masked, w, h);
  const IS = integral(skin, w, h);
  const boxes = regionBoxes(w, h);
  const regions = {};
  for (const [id, list] of Object.entries(boxes)) {
    const acc = { n: 0, L: 0, a: 0, ei: 0, spec: 0, fine: 0, band: 0, band2: 0 };
    for (const [x0, y0, x1, y1] of list) {
      for (let y = Math.max(0, y0); y < Math.min(h, y1); y += 1) {
        for (let x = Math.max(0, x0); x < Math.min(w, x1); x += 1) {
          const i = y * w + x;
          if (!skin[i]) continue;
          const p = i * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const band = skinMean(IL, IS, w, h, x, y, 2) - skinMean(IL, IS, w, h, x, y, 12);
          acc.n += 1;
          acc.L += L[i];
          acc.a += A[i];
          acc.ei += 100 * Math.log10((r + 1) / (g + 1));
          acc.spec += max / 255 > 0.92 && (max - min) / Math.max(1, max) < 0.22 ? 1 : 0;
          acc.fine += Math.abs(L[i] - skinMean(IL, IS, w, h, x, y, 1));
          acc.band += band;
          acc.band2 += band * band;
        }
      }
    }
    regions[id] = acc;
  }
  // Whole-oval checks: how much of it is skin, and how bright.
  let inside = 0;
  let skinInside = 0;
  let light = 0;
  const cx = OVAL.cx * w;
  const cy = OVAL.cy * h;
  const rx = OVAL.rx * w;
  const ry = OVAL.ry * h;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const u = (x - cx) / rx;
      const v = (y - cy) / ry;
      if (u * u + v * v > 1) continue;
      const i = y * w + x;
      inside += 1;
      skinInside += skin[i];
      light += L[i];
    }
  }
  return { regions, coverage: inside ? skinInside / inside : 0, light: inside ? light / inside : 0, luma: L };
}

/** Mean absolute change in L* between two frames (sampled), for stillness. */
export function motion(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 7) { sum += Math.abs(a[i] - b[i]); k += 1; }
  return sum / k;
}

/* ------------------------------------------------------ many frames → report */

/** Add one frame's region sums into a running total. */
export function accumulate(total, frame) {
  const out = total || {};
  for (const [id, r] of Object.entries(frame.regions)) {
    const t = out[id] || (out[id] = { n: 0, L: 0, a: 0, ei: 0, spec: 0, fine: 0, band: 0, band2: 0 });
    for (const k of Object.keys(t)) t[k] += r[k];
  }
  return out;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** Map x linearly from [lo, hi] to 0–100, clamped. */
export const scale = (x, lo, hi) => Math.round(100 * clamp01((x - lo) / (hi - lo)));

/**
 * Turn accumulated sums into readings and scores.
 *
 * @param {object} total From accumulate().
 * @returns {{ readings: object, flags: {concern: string, score: number, label: string, detail: string}[], quality: object }} The report.
 */
export function report(total) {
  const mean = (id, k) => (total[id]?.n ? total[id][k] / total[id].n : NaN);
  const pool = (ids, k) => {
    let s = 0;
    let n = 0;
    for (const id of ids) { s += total[id]?.[k] || 0; n += total[id]?.n || 0; }
    return n ? s / n : NaN;
  };
  const sd = (ids) => {
    let n = 0;
    let s = 0;
    let s2 = 0;
    for (const id of ids) { n += total[id]?.n || 0; s += total[id]?.band || 0; s2 += total[id]?.band2 || 0; }
    if (!n) return NaN;
    const m = s / n;
    return Math.sqrt(Math.max(0, s2 / n - m * m));
  };
  const cheeks = ['cheekA', 'cheekB'];
  const readings = {
    light: pool(['forehead', 'cheekA', 'cheekB', 'nose', 'chin'], 'L'),
    asymmetry: Math.abs(mean('cheekA', 'L') - mean('cheekB', 'L')),
    blotch: sd(['forehead', ...cheeks]),
    redness: pool([...cheeks, 'nose'], 'ei') - mean('forehead', 'ei'),
    shine: pool(['forehead', 'nose'], 'spec') - pool(cheeks, 'spec'),
    fine: pool([...cheeks, 'forehead'], 'fine') / Math.max(1, pool([...cheeks, 'forehead'], 'L')),
    underEye: pool(cheeks, 'L') - mean('underEye', 'L'),
    samples: Object.values(total).reduce((s, r) => s + r.n, 0),
  };
  const flags = [
    { concern: 'tone', label: 'Tone evenness', score: scale(readings.blotch, 0.9, 3.2), detail: `L* spread ${readings.blotch.toFixed(2)} (band-pass)` },
    { concern: 'redness', label: 'Redness', score: scale(readings.redness, 0.5, 8), detail: `ΔEI ${readings.redness.toFixed(1)} vs forehead` },
    { concern: 'oil', label: 'Shine', score: scale(readings.shine, 0.004, 0.06), detail: `${(readings.shine * 100).toFixed(1)}% more specular on the T-zone` },
    { concern: 'dryness', label: 'Fine texture', score: scale(readings.fine, 0.012, 0.045), detail: `${(readings.fine * 100).toFixed(2)}% fine detail` },
    { concern: 'eyes', label: 'Under-eye contrast', score: scale(readings.underEye, 2, 12), detail: `ΔL* ${readings.underEye.toFixed(1)} darker than cheeks` },
  ].map((x) => ({ ...x, score: Number.isFinite(x.score) ? x.score : 0 }));
  const issues = [];
  if (!(readings.light > 32)) issues.push('dim light');
  if (readings.light > 88) issues.push('very bright light');
  if (readings.asymmetry > 10) issues.push('light from one side');
  if (readings.samples < 4000) issues.push('few samples');
  const confidence = issues.length === 0 ? 'good' : issues.length === 1 ? 'fair' : 'low';
  return { readings, flags, quality: { confidence, issues } };
}

/* ------------------------------------------------------------- the UI */

const SIZE = { w: 180, h: 240 };
const NEEDED_FRAMES = 36;

const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid);
  return n;
};
const svg = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * The scanner overlay. `onDone(result)` receives the report, a hologram-
 * ready snapshot (a small canvas, kept in memory only) and how the visitor
 * got in; `onCancel()` if they back out.
 */
export class FaceScanner {
  constructor({ say, onDone, onCancel, reduced }) {
    this.say = say;
    this.onDone = onDone;
    this.onCancel = onCancel;
    this.reduced = reduced;
    this.root = null;
  }

  open() {
    if (this.root) return;
    this.snapshot = null;
    const video = el('video', { class: 'ds-video', playsinline: '', muted: '', autoplay: '', 'aria-hidden': 'true' });
    video.muted = true;
    video.playsInline = true;
    const overlay = svg('svg', { class: 'ds-overlay', viewBox: `0 0 ${SIZE.w} ${SIZE.h}`, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    const { cx, cy, rx, ry } = OVAL;
    const ov = { cx: cx * SIZE.w, cy: cy * SIZE.h, rx: rx * SIZE.w, ry: ry * SIZE.h };
    const mask = svg('path', { class: 'ds-mask', d: `M0 0H${SIZE.w}V${SIZE.h}H0Z M${ov.cx - ov.rx} ${ov.cy}a${ov.rx} ${ov.ry} 0 1 0 ${ov.rx * 2} 0a${ov.rx} ${ov.ry} 0 1 0 ${-ov.rx * 2} 0Z`, 'fill-rule': 'evenodd' });
    const ring = svg('ellipse', { class: 'ds-oval', cx: ov.cx, cy: ov.cy, rx: ov.rx, ry: ov.ry });
    const progress = svg('ellipse', { class: 'ds-progress', cx: ov.cx, cy: ov.cy, rx: ov.rx + 4, ry: ov.ry + 4, pathLength: '100', 'stroke-dasharray': '0 100' });
    const laser = svg('line', { class: 'ds-laser', x1: ov.cx - ov.rx, x2: ov.cx + ov.rx, y1: ov.cy, y2: ov.cy });
    const mesh = svg('g', { class: 'ds-mesh' });
    // A face mesh that fills in with the scan: points on an ellipse grid.
    for (let j = -4; j <= 4; j += 1) {
      for (let i = -4; i <= 4; i += 1) {
        const u = i / 4.6;
        const v = j / 4.6;
        if (u * u + v * v > 1) continue;
        mesh.append(svg('circle', { cx: ov.cx + u * ov.rx, cy: ov.cy + v * ov.ry, r: 0.9, 'data-k': String(Math.abs(i) + Math.abs(j)) }));
      }
    }
    const boxes = svg('g', { class: 'ds-regions' });
    for (const [id, list] of Object.entries(regionBoxes(SIZE.w, SIZE.h))) {
      for (const [x0, y0, x1, y1] of list) boxes.append(svg('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 2, 'data-region': id }));
    }
    overlay.append(mask, mesh, boxes, laser, ring, progress);
    const status = el('p', { class: 'ds-status', 'aria-live': 'polite', text: 'Your camera stays on this device. Nothing is recorded or sent.' });
    const pct = el('span', { class: 'ds-pct', text: '0%' });
    const start = el('button', { class: 'ds-btn primary', type: 'button', text: '◉ Start face scan', onclick: () => this.start() });
    const manual = el('button', { class: 'ds-btn', type: 'button', text: 'No camera? Enter by questionnaire', onclick: () => this.finish(null, 'questionnaire') });
    const cancel = el('button', { class: 'ds-close', type: 'button', 'aria-label': 'Close scanner', text: '✕', onclick: () => this.cancel() });
    this.root = el('div', { class: 'dermscan', role: 'dialog', 'aria-label': 'Face skin scan' }, [
      el('div', { class: 'ds-bg' }),
      el('header', { class: 'ds-hud' }, [el('span', { class: 'ds-brand' }, [el('b', { text: 'COLIN' }), ' DERMAL TECHNOLOGIES']), el('span', { class: 'ds-meta', text: 'ENTRY CHECKPOINT · FACIAL SKIN ASSESSMENT' }), cancel]),
      el('div', { class: 'ds-stage' }, [el('div', { class: 'ds-view' }, [video, overlay, el('div', { class: 'ds-sweep' }), pct])]),
      el('div', { class: 'ds-panel' }, [status, el('div', { class: 'ds-actions' }, [start, manual]), el('p', { class: 'ds-fine', text: 'Educational · not a diagnosis · camera analysed on-device, never uploaded' })]),
    ]);
    document.body.append(this.root);
    document.body.classList.add('lab-open');
    requestAnimationFrame(() => this.root?.classList.add('on'));
    Object.assign(this, { video, overlay, ring, progress, laser, mesh, boxes, status, pct, startBtn: start, manualBtn: manual });
    this.say('The dermal wing. Entry is by face scan. Your camera stays on this device; I only look, I never keep.');
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.status.textContent = 'This browser has no camera access here. Use the questionnaire instead.';
      return;
    }
    this.startBtn.disabled = true;
    this.status.textContent = 'Asking for the camera…';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (error) {
      this.startBtn.disabled = false;
      this.status.textContent = error?.name === 'NotAllowedError'
        ? 'Camera permission was declined. You can allow it in your browser settings, or enter by questionnaire.'
        : 'No camera was found. Enter by questionnaire instead.';
      return;
    }
    if (!this.root) { this.stopCamera(); return; }
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (error) { /* autoplay with muted video is allowed */ }
    this.root.classList.add('live');
    this.startBtn.hidden = true;
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE.w;
    this.canvas.height = SIZE.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.total = null;
    this.frames = 0;
    this.prev = null;
    this.lastTick = 0;
    this.hint = '';
    this.loop = (now) => {
      if (!this.root || !this.stream) return;
      this.raf = requestAnimationFrame(this.loop);
      if (now - this.lastTick < 80) return;
      this.lastTick = now;
      this.tick();
    };
    this.raf = requestAnimationFrame(this.loop);
    this.say('Look into the oval. Good light, face still. Think of it as a passport photo with better manners.');
  }

  /** Grab, check and (if the face is ready) measure one frame. */
  tick() {
    const v = this.video;
    if (!v.videoWidth) return;
    // Cover-crop the camera to portrait 3:4 and mirror it, like a selfie.
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const aspect = SIZE.w / SIZE.h;
    const sw = Math.min(vw, vh * aspect);
    const sh = sw / aspect;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(SIZE.w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, SIZE.w, SIZE.h);
    ctx.restore();
    const img = ctx.getImageData(0, 0, SIZE.w, SIZE.h);
    const frame = measureFrame(img);
    const still = motion(this.prev, frame.luma);
    this.prev = frame.luma;
    let hint = '';
    if (frame.coverage < 0.4) hint = 'Bring your face into the oval';
    else if (frame.light < 28) hint = 'More light, please — face a window or lamp';
    else if (frame.light > 90) hint = 'Too bright — step out of direct light';
    else if (still > 6) hint = 'Hold still';
    const ready = !hint;
    this.root.classList.toggle('ready', ready);
    if (ready) {
      this.total = accumulate(this.total, frame);
      this.frames += 1;
      if (this.frames === 1) this.snapshot = this.copyFrame();
      if (this.frames === Math.round(NEEDED_FRAMES / 2)) this.snapshot = this.copyFrame();
    }
    const k = Math.min(1, this.frames / NEEDED_FRAMES);
    this.progress.setAttribute('stroke-dasharray', `${(k * 100).toFixed(1)} 100`);
    this.pct.textContent = `${Math.round(k * 100)}%`;
    const lit = Math.floor(k * 9);
    for (const dot of this.mesh.children) dot.classList.toggle('on', Number(dot.dataset.k) <= lit);
    const order = ['forehead', 'underEye', 'nose', 'cheekA', 'cheekB', 'chin'];
    for (const r of this.boxes.children) r.classList.toggle('on', order.indexOf(r.dataset.region) < k * 7);
    const status = ready ? (k < 1 ? `Scanning ${['forehead', 'eye area', 'nose and T-zone', 'cheeks', 'cheeks', 'chin'][Math.min(5, Math.floor(k * 6))]}…` : 'Scan complete') : hint;
    if (status !== this.hint) { this.hint = status; this.status.textContent = status; }
    if (this.frames >= NEEDED_FRAMES) this.complete();
  }

  copyFrame() {
    const c = document.createElement('canvas');
    c.width = SIZE.w;
    c.height = SIZE.h;
    c.getContext('2d').drawImage(this.canvas, 0, 0);
    return c;
  }

  complete() {
    cancelAnimationFrame(this.raf);
    const result = report(this.total);
    this.stopCamera();
    this.root.classList.add('granted');
    this.status.textContent = `ACCESS GRANTED · ${result.quality.confidence.toUpperCase()} READING${result.quality.issues.length ? ` (${result.quality.issues.join(', ')})` : ''}`;
    this.say('Scan complete. Access granted. Mind the doors.');
    setTimeout(() => this.finish(result, 'scan'), this.reduced ? 300 : 1900);
  }

  finish(result, via) {
    const snapshot = this.snapshot || null;
    this.close();
    this.onDone?.({ report: result, snapshot, via });
  }

  stopCamera() {
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  cancel() {
    this.close();
    this.onCancel?.();
  }

  close() {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    this.stopCamera();
    this.root.remove();
    this.root = null;
    this.prev = null;
    this.total = null;
    document.body.classList.remove('lab-open');
  }
}
