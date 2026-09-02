/**
 * On-device maturity detection.
 *
 * The whole pipeline runs in the phone's own CPU on a downscaled frame — no
 * upload, no API key, no network. That is deliberate: the people who need this
 * are standing in a field with one bar of signal, and a detector that stops
 * working when the connection drops is not a detector.
 *
 * Pipeline, per frame:
 *   1. White-balance the pixels with the operator's calibration gains.
 *   2. Score every pixel against the crop's ripening colour path (crops.js).
 *   3. Measure local texture, because smooth specular fruit and veined foliage
 *      occupy the same green hues and colour alone cannot separate them.
 *   4. Clean the mask with a 3×3 majority filter, then label connected blobs.
 *   5. Reject blobs on shape, size and colour purity; score what survives.
 *
 * Every stage is a documented heuristic rather than a learned model: a grower
 * can read why a fruit was called ripe, and correct it with teach mode. Nothing
 * here claims neural-network accuracy — it claims reproducibility and honesty
 * about its own confidence.
 *
 * @module harvest-eye/vision
 */

import { NEUTRAL_GAINS, rgbToHsv, wrapHue } from './color.js';
import { maturityFromHue, stageFor } from './crops.js';

/**
 * @typedef {object} Cluster
 * @property {number} x Bounding-box left edge, in analysis pixels.
 * @property {number} y Bounding-box top edge.
 * @property {number} w Bounding-box width.
 * @property {number} h Bounding-box height.
 * @property {number} area Member pixel count.
 * @property {number} maturity Mean maturity in [0,1].
 * @property {number} hue Circular-mean hue in degrees.
 * @property {number} confidence Detection confidence in [0,1].
 * @property {number} fillRatio Blob area over bounding-box area.
 * @property {number} texture Mean gradient magnitude, 0 (glassy) to 1 (busy).
 * @property {number} count Estimated fruit in the blob (clusters touch).
 * @property {string} stage Named maturity band.
 * @property {string} color Stage colour for the overlay.
 */

/** Working buffers, reallocated only when the frame geometry changes. */
const buffers = {
  width: 0,
  height: 0,
  maturity: null,
  error: null,
  sat: null,
  val: null,
  hue: null,
  mask: null,
  scratch: null,
  texture: null,
  label: null,
  stack: null,
};

/**
 * Ensure the scratch buffers match the frame size.
 *
 * @param {number} width Frame width in pixels.
 * @param {number} height Frame height in pixels.
 */
function ensureBuffers(width, height) {
  if (buffers.width === width && buffers.height === height) return;
  const n = width * height;
  buffers.width = width;
  buffers.height = height;
  buffers.maturity = new Float32Array(n);
  buffers.error = new Float32Array(n);
  buffers.sat = new Float32Array(n);
  buffers.val = new Float32Array(n);
  buffers.hue = new Float32Array(n);
  buffers.mask = new Uint8Array(n);
  buffers.scratch = new Uint8Array(n);
  buffers.texture = new Float32Array(n);
  buffers.label = new Int32Array(n);
  buffers.stack = new Int32Array(n);
}

/**
 * Classify every pixel against the crop profile.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} frame Source pixels.
 * @param {import('./crops.js').CropProfile} profile Crop being scanned.
 * @param {{r:number,g:number,b:number}} gains White-balance gains.
 * @returns {{fruit:number,foliage:number,decay:number}} Pixel tallies.
 */
function classifyPixels(frame, profile, gains) {
  const { data, width, height } = frame;
  const n = width * height;
  const hsv = { h: 0, s: 0, v: 0 };
  let fruit = 0;
  let foliage = 0;
  let decay = 0;

  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r = Math.min(255, data[p] * gains.r);
    const g = Math.min(255, data[p + 1] * gains.g);
    const b = Math.min(255, data[p + 2] * gains.b);
    rgbToHsv(r, g, b, hsv);
    buffers.hue[i] = hsv.h;
    buffers.sat[i] = hsv.s;
    buffers.val[i] = hsv.v;

    // Senescence: dark, washed-out browns. Read as lost fruit, never as ripe.
    const decaying = hsv.v < 0.34 && hsv.s < 0.55 && hsv.h > 12 && hsv.h < 48;
    if (decaying) decay += 1;

    if (hsv.s < profile.minSat || hsv.v < profile.minVal || decaying) {
      buffers.mask[i] = 0;
      buffers.maturity[i] = 0;
      buffers.error[i] = 180;
      continue;
    }

    const { m, error } = maturityFromHue(profile, hsv.h);
    buffers.maturity[i] = m;
    buffers.error[i] = error;
    if (error <= profile.tolerance) {
      buffers.mask[i] = 1;
      fruit += 1;
      if (m < profile.greenGate) foliage += 1;
    } else {
      buffers.mask[i] = 0;
      if (hsv.h > 70 && hsv.h < 160) foliage += 1;
    }
  }
  return { fruit, foliage, decay };
}

/**
 * Local gradient magnitude of the value channel, normalized to [0,1].
 *
 * Fruit skin is smooth and often specular; leaves carry veins, serrated edges
 * and self-shadowing. Texture is what lets a green tomato survive the mask
 * while the canopy behind it does not.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 */
function computeTexture(width, height) {
  const { val, texture } = buffers;
  texture.fill(0);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = val[i + 1] - val[i - 1];
      const gy = val[i + width] - val[i - width];
      texture[i] = Math.min(1, Math.sqrt(gx * gx + gy * gy) * 2.2);
    }
  }
}

/**
 * 3×3 majority filter — removes salt-and-pepper speckle and closes pinholes.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} [passes=2] Number of smoothing passes.
 */
function denoiseMask(width, height, passes = 2) {
  for (let pass = 0; pass < passes; pass += 1) {
    buffers.scratch.set(buffers.mask);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        const sum = buffers.scratch[i - width - 1] + buffers.scratch[i - width]
          + buffers.scratch[i - width + 1] + buffers.scratch[i - 1]
          + buffers.scratch[i] + buffers.scratch[i + 1]
          + buffers.scratch[i + width - 1] + buffers.scratch[i + width]
          + buffers.scratch[i + width + 1];
        buffers.mask[i] = sum >= 5 ? 1 : 0;
      }
    }
  }
}

/**
 * Label blobs in the mask and collect their statistics.
 *
 * Connectivity is *maturity-aware*: two neighbouring mask pixels only join the
 * same blob when their maturity is close. A plain binary flood fill would weld
 * a ripe tomato to the immature-green canopy it is touching — both are "fruit
 * coloured" for a crop whose path starts in green — and report the pair as one
 * enormous, barely-ripe object.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} minArea Smallest blob worth reporting, in pixels.
 * @param {number} [maturityStep=0.14] Largest maturity jump a blob may cross.
 * @returns {Array<object>} Raw blob records, before shape and colour gating.
 */
function labelBlobs(width, height, minArea, maturityStep = 0.14) {
  const { mask, label, stack, maturity, sat, error, texture, hue } = buffers;
  label.fill(0);
  const blobs = [];
  let next = 1;

  for (let seed = 0; seed < mask.length; seed += 1) {
    if (mask[seed] !== 1 || label[seed] !== 0) continue;
    const id = next;
    next += 1;
    let top = 0;
    stack[top] = seed;
    top += 1;
    label[seed] = id;

    let area = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let sumM = 0;
    let sumSat = 0;
    let sumErr = 0;
    let sumTex = 0;
    let hx = 0;
    let hy = 0;

    while (top > 0) {
      top -= 1;
      const i = stack[top];
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumM += maturity[i];
      sumSat += sat[i];
      sumErr += error[i];
      sumTex += texture[i];
      const rad = (hue[i] * Math.PI) / 180;
      hx += Math.cos(rad);
      hy += Math.sin(rad);

      const here = maturity[i];
      const joins = (n) => mask[n] === 1 && label[n] === 0
        && Math.abs(maturity[n] - here) <= maturityStep;
      if (x > 0 && joins(i - 1)) {
        label[i - 1] = id;
        stack[top] = i - 1;
        top += 1;
      }
      if (x < width - 1 && joins(i + 1)) {
        label[i + 1] = id;
        stack[top] = i + 1;
        top += 1;
      }
      if (y > 0 && joins(i - width)) {
        label[i - width] = id;
        stack[top] = i - width;
        top += 1;
      }
      if (y < height - 1 && joins(i + width)) {
        label[i + width] = id;
        stack[top] = i + width;
        top += 1;
      }
    }

    if (area < minArea) continue;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    blobs.push({
      x: minX,
      y: minY,
      w,
      h,
      area,
      maturity: sumM / area,
      saturation: sumSat / area,
      hueError: sumErr / area,
      texture: sumTex / area,
      hue: wrapHue((Math.atan2(hy, hx) * 180) / Math.PI),
      fillRatio: area / (w * h),
      aspect: Math.min(w, h) / Math.max(w, h),
    });
  }
  return blobs;
}

/**
 * Score a blob's plausibility as a single fruit or a touching cluster.
 *
 * @param {object} blob Raw blob record.
 * @param {import('./crops.js').CropProfile} profile Crop being scanned.
 * @param {number} frameArea Total analysis pixels.
 * @returns {number} Confidence in [0,1].
 */
function confidenceOf(blob, profile, frameArea) {
  // A disc inscribed in its bounding box fills π/4 of it; solid rectangles and
  // stringy leaf gaps both fall away from that.
  const shape = 1 - Math.min(1, Math.abs(blob.fillRatio - 0.78) / 0.55);
  const purity = 1 - Math.min(1, blob.hueError / Math.max(1, profile.tolerance));
  const smooth = 1 - Math.min(1, blob.texture / 0.35);
  const size = Math.min(1, blob.area / (frameArea * 0.004));
  const balance = Math.min(1, blob.aspect / 0.55);
  const score = shape * 0.26 + purity * 0.3 + smooth * 0.16 + size * 0.16 + balance * 0.12;
  return Math.max(0, Math.min(1, score));
}

/**
 * Analyse one frame.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} frame Downscaled
 *   RGBA frame, typically 224 px wide.
 * @param {import('./crops.js').CropProfile} profile Crop being scanned.
 * @param {object} [options] Tuning overrides.
 * @param {{r:number,g:number,b:number}} [options.gains] White-balance gains.
 * @param {number} [options.minConfidence=0.42] Reporting threshold.
 * @param {number} [options.maxClusters=24] Cap on reported clusters.
 * @returns {{
 *   width:number, height:number, clusters:Cluster[],
 *   fruitShare:number, foliageShare:number, decayShare:number,
 *   readyShare:number, meanMaturity:number, stageMix:Record<string, number>
 * }} Frame analysis.
 */
export function analyzeFrame(frame, profile, options = {}) {
  const { width, height } = frame;
  const gains = options.gains || NEUTRAL_GAINS;
  const minConfidence = options.minConfidence ?? 0.42;
  const maxClusters = options.maxClusters ?? 24;

  ensureBuffers(width, height);
  const tally = classifyPixels(frame, profile, gains);
  computeTexture(width, height);
  denoiseMask(width, height);

  const frameArea = width * height;
  const minArea = Math.max(20, Math.round(frameArea * 0.0007));
  const blobs = labelBlobs(width, height, minArea);

  const accepted = [];
  for (const blob of blobs) {
    const confidence = confidenceOf(blob, profile, frameArea);
    // Green fruit and green canopy share a hue band, so unripe blobs have to
    // earn their place on shape and smoothness before they are reported.
    const unripe = blob.maturity < profile.greenGate;
    const gate = unripe ? Math.max(minConfidence, 0.58) : minConfidence;
    if (confidence < gate) continue;
    if (unripe) {
      if (blob.texture > 0.24 || blob.fillRatio < 0.5) continue;
      // A green region spanning a third of the view is the canopy, not one
      // enormous green fruit. Ripe blobs are exempt: a red tomato held up to
      // the lens legitimately fills the frame.
      if (blob.area > frameArea * 0.3) continue;
    }
    accepted.push({ ...blob, confidence });
  }

  accepted.sort((a, b) => b.area * b.confidence - a.area * a.confidence);
  const reported = accepted.slice(0, maxClusters);

  // One fruit's worth of pixels: the median accepted blob is a better yardstick
  // than any fixed constant, because it scales with how close the phone is.
  const areas = reported.map((blob) => blob.area).sort((a, b) => a - b);
  const referenceArea = areas.length ? areas[Math.floor(areas.length / 2)] : minArea;

  /** @type {Cluster[]} */
  const clusters = reported.map((blob) => {
    const stage = stageFor(blob.maturity);
    return {
      x: blob.x,
      y: blob.y,
      w: blob.w,
      h: blob.h,
      area: blob.area,
      maturity: blob.maturity,
      hue: blob.hue,
      confidence: blob.confidence,
      fillRatio: blob.fillRatio,
      texture: blob.texture,
      count: Math.max(1, Math.round(blob.area / Math.max(1, referenceArea))),
      stage: stage.label,
      color: stage.color,
    };
  });

  const stageMix = {};
  let weight = 0;
  let weightedMaturity = 0;
  let readyWeight = 0;
  for (const cluster of clusters) {
    const w = cluster.area;
    weight += w;
    weightedMaturity += cluster.maturity * w;
    if (cluster.maturity >= profile.harvestAt) readyWeight += w;
    stageMix[cluster.stage] = (stageMix[cluster.stage] || 0) + cluster.count;
  }

  return {
    width,
    height,
    clusters,
    fruitShare: tally.fruit / frameArea,
    foliageShare: tally.foliage / frameArea,
    decayShare: tally.decay / frameArea,
    readyShare: weight ? readyWeight / weight : 0,
    meanMaturity: weight ? weightedMaturity / weight : 0,
    stageMix,
  };
}

/**
 * Mean sRGB of a centred square, used by white-balance calibration.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} frame Source frame.
 * @param {number} [fraction=0.3] Side length as a fraction of the short edge.
 * @returns {{r:number,g:number,b:number}} Mean colour of the patch.
 */
export function samplePatch(frame, fraction = 0.3) {
  const { data, width, height } = frame;
  const side = Math.max(2, Math.round(Math.min(width, height) * fraction));
  const x0 = Math.round((width - side) / 2);
  const y0 = Math.round((height - side) / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = y0; y < y0 + side; y += 1) {
    for (let x = x0; x < x0 + side; x += 1) {
      const p = (y * width + x) * 4;
      r += data[p];
      g += data[p + 1];
      b += data[p + 2];
      n += 1;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Mean hue of a small patch around a point, used by teach mode.
 *
 * @param {{data:Uint8ClampedArray,width:number,height:number}} frame Source frame.
 * @param {number} cx Patch centre x, in frame pixels.
 * @param {number} cy Patch centre y, in frame pixels.
 * @param {number} [radius=6] Patch half-width in pixels.
 * @returns {{hue:number,saturation:number,value:number}} Mean colour in HSV.
 */
export function sampleHue(frame, cx, cy, radius = 6) {
  const { data, width, height } = frame;
  const hsv = { h: 0, s: 0, v: 0 };
  let hx = 0;
  let hy = 0;
  let sat = 0;
  let val = 0;
  let n = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      const p = (y * width + x) * 4;
      rgbToHsv(data[p], data[p + 1], data[p + 2], hsv);
      const rad = (hsv.h * Math.PI) / 180;
      hx += Math.cos(rad);
      hy += Math.sin(rad);
      sat += hsv.s;
      val += hsv.v;
      n += 1;
    }
  }
  return {
    hue: wrapHue((Math.atan2(hy, hx) * 180) / Math.PI),
    saturation: sat / n,
    value: val / n,
  };
}
