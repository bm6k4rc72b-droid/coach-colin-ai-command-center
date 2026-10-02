/**
 * The software cloak pipeline, as pure array maths (RGBA Uint8ClampedArray frames, Float32 masks):
 * threshold → dilate → feather → composite (clean plate, shimmer, adaptive camo, outline),
 * plus a residual-evidence "red team" detector. Unit tested; runs per frame in the browser.
 */
import { CLOAK } from '../config/lab';

export type CloakMode = 'off' | 'plate' | 'shimmer' | 'adaptive' | 'outline';

export const CLOAK_MODES: { id: CloakMode; name: string; info: string }[] = [
  { id: 'off', name: 'Off', info: 'Raw camera frame.' },
  { id: 'plate', name: 'Clean plate', info: 'Replace your pixels with the stored empty background — the classic VFX trick. Perfect only while the camera and lighting do not change.' },
  { id: 'shimmer', name: 'Refraction shimmer', info: 'Show the background, but bend it along the mask edges: the "heat-haze" look from films. Easier on artefacts, easier to spot.' },
  { id: 'adaptive', name: 'Adaptive camo', info: 'Fill your silhouette with the blurred local colours of the background — what a real colour-changing skin can do. Hides colour, keeps the outline.' },
  { id: 'outline', name: 'Mask debug', info: 'Show the segmentation mask the AI produced, to see where the cloak will fail.' },
];

/** Binary-ish mask from confidences. */
export function thresholdMask(conf: Float32Array, threshold: number, out = new Float32Array(conf.length)): Float32Array {
  for (let i = 0; i < conf.length; i++) out[i] = conf[i] >= threshold ? 1 : 0;
  return out;
}

/** Morphological dilation by r px (max filter, separable). */
export function dilate(mask: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return mask.slice();
  const tmp = new Float32Array(mask.length);
  const out = new Float32Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && mask[y * w + xx] > m) m = mask[y * w + xx];
      }
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && tmp[yy * w + x] > m) m = tmp[yy * w + x];
      }
      out[y * w + x] = m;
    }
  }
  return out;
}

/** Box blur (separable, r px) — used to feather mask edges and to blur the plate. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[y * w + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      const add = Math.min(w - 1, x + r + 1);
      const sub = Math.max(0, x - r);
      acc += src[y * w + add] - src[y * w + sub];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      const add = Math.min(h - 1, y + r + 1);
      const sub = Math.max(0, y - r);
      acc += tmp[add * w + x] - tmp[sub * w + x];
    }
  }
  return out;
}

/** threshold → dilate → feather. */
export function refineMask(conf: Float32Array, w: number, h: number, threshold: number, dilatePx: number, featherPx: number): Float32Array {
  return boxBlur(dilate(thresholdMask(conf, threshold), w, h, dilatePx), w, h, featherPx);
}

/** Per-channel blur of an RGBA frame (for adaptive camo). */
export function blurRGBA(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const ch = new Float32Array(w * h);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < w * h; i++) ch[i] = src[i * 4 + c];
    const b = boxBlur(ch, w, h, r);
    for (let i = 0; i < w * h; i++) out[i * 4 + c] = b[i];
  }
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = 255;
  return out;
}

export interface CompositeParams {
  mode: CloakMode;
  time: number;
  /** Cloak power: 1 = working, 0 = failed (EMP), in between = glitching. */
  power: number;
  /** Pre-blurred plate (adaptive camo). */
  plateBlur?: Uint8ClampedArray;
}

/** Composite one frame. Returns a new RGBA buffer. */
export function composite(
  frame: Uint8ClampedArray,
  plate: Uint8ClampedArray | null,
  mask: Float32Array,
  w: number,
  h: number,
  p: CompositeParams,
  out = new Uint8ClampedArray(frame.length),
): Uint8ClampedArray {
  if (p.mode === 'off' || !plate) {
    out.set(frame);
    return out;
  }
  if (p.mode === 'outline') {
    for (let i = 0; i < w * h; i++) {
      const m = mask[i];
      out[i * 4] = frame[i * 4] * 0.35 + 255 * m * 0.65;
      out[i * 4 + 1] = frame[i * 4 + 1] * 0.35 + 60 * m;
      out[i * 4 + 2] = frame[i * 4 + 2] * 0.35 + 180 * m * 0.65;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  const S = CLOAK.shimmerStrength;
  const t = p.time;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mask[i] * p.power;
      const o = i * 4;
      if (m <= 0.001) {
        out[o] = frame[o];
        out[o + 1] = frame[o + 1];
        out[o + 2] = frame[o + 2];
        out[o + 3] = 255;
        continue;
      }
      let br: number;
      let bg: number;
      let bb: number;
      if (p.mode === 'shimmer') {
        // Displace the plate along the mask gradient with a travelling ripple.
        const gx = mask[y * w + Math.min(w - 1, x + 1)] - mask[y * w + Math.max(0, x - 1)];
        const gy = mask[Math.min(h - 1, y + 1) * w + x] - mask[Math.max(0, y - 1) * w + x];
        const wave = Math.sin(y * 0.09 + t * 5) * 0.6 + Math.sin(x * 0.07 - t * 3.3) * 0.4;
        const dx = Math.round(gx * S * 3 + wave * S * 0.35);
        const dy = Math.round(gy * S * 3 + wave * S * 0.2);
        const sx = Math.min(w - 1, Math.max(0, x + dx));
        const sy = Math.min(h - 1, Math.max(0, y + dy));
        const so = (sy * w + sx) * 4;
        const edge = Math.min(1, Math.abs(gx) + Math.abs(gy));
        br = plate[so] + 25 * edge;
        bg = plate[so + 1] + 25 * edge;
        bb = plate[so + 2] + 30 * edge;
      } else if (p.mode === 'adaptive') {
        const pb = p.plateBlur ?? plate;
        // Blotchy pattern quantised to the blurred background colours.
        const q = (Math.sin(x * 0.21 + y * 0.13) + Math.sin(x * 0.07 - y * 0.19)) * 6;
        br = pb[o] + q;
        bg = pb[o + 1] + q;
        bb = pb[o + 2] + q;
      } else {
        br = plate[o];
        bg = plate[o + 1];
        bb = plate[o + 2];
      }
      out[o] = frame[o] * (1 - m) + br * m;
      out[o + 1] = frame[o + 1] * (1 - m) + bg * m;
      out[o + 2] = frame[o + 2] * (1 - m) + bb * m;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** EMP glitch: scanline tearing and noise, strength 0..1, deterministic for a seed. */
export function glitch(buf: Uint8ClampedArray, w: number, h: number, strength: number, seed: number): void {
  if (strength <= 0) return;
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let y = 0; y < h; y++) {
    const shift = rnd() < strength * 0.3 ? Math.round((rnd() - 0.5) * 60 * strength) : 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (shift) {
        const sx = Math.min(w - 1, Math.max(0, x + shift));
        const so = (y * w + sx) * 4;
        buf[o] = buf[so];
        buf[o + 1] = buf[so + 1];
        buf[o + 2] = buf[so + 2];
      }
      if (rnd() < strength * 0.25) {
        const v = rnd() * 255;
        buf[o] = buf[o + 1] = buf[o + 2] = v;
      }
    }
  }
}

/**
 * Red-team "evidence" detector: how much the output still differs from the clean background
 * inside the actor's region. A pixel-based person detector needs evidence; a perfect clean-plate
 * composite leaves almost none. Returns a confidence 0..1.
 */
export function residualEvidence(out: Uint8ClampedArray, plate: Uint8ClampedArray, truth: Float32Array): number {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < truth.length; i++) {
    if (truth[i] < 0.5) continue;
    const o = i * 4;
    acc += (Math.abs(out[o] - plate[o]) + Math.abs(out[o + 1] - plate[o + 1]) + Math.abs(out[o + 2] - plate[o + 2])) / (3 * 255);
    n++;
  }
  if (!n) return 0;
  const e = acc / n;
  return 1 / (1 + Math.exp(-(e - CLOAK.evidenceMid) * CLOAK.evidenceSlope));
}

/** Mask quality vs ground truth: intersection-over-union. */
export function maskIoU(mask: Float32Array, truth: Float32Array, threshold = 0.5): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i] >= threshold;
    const b = truth[i] >= 0.5;
    if (a && b) inter++;
    if (a || b) uni++;
  }
  return uni ? inter / uni : 1;
}
