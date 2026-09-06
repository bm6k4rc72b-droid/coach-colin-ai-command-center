/**
 * Deciding which pixels are not the scene.
 *
 * Everything downstream — tracks, paths, speeds, alerts — rests on one binary
 * question asked of every pixel thirty times a second: is this the yard, or is
 * this something in the yard? Get it wrong in one direction and a subject walks
 * through the frame unrecorded; get it wrong in the other and the app spends
 * the night alerting on a bush.
 *
 * The background model is sigma-delta (Manzanera & Richefeu, 2004): the stored
 * background creeps toward each new frame by one unit per frame, which converges
 * on the per-pixel *median* rather than the mean. That distinction is the whole
 * reason to use it — a mean is dragged upward by every object that crosses, so a
 * subject who stands still for a minute is slowly absorbed into the background
 * and then leaves a hole behind them when they move. A median ignores anything
 * that occupies a pixel for less than half the window, and the update is two
 * comparisons and an add per pixel, which is what keeps this running on a phone.
 *
 * A second sigma-delta estimate of the absolute difference gives a per-pixel
 * noise level, so the detection threshold adapts: pixels that always flicker —
 * foliage, a reflection off water, compression noise in a dark corner — have to
 * move much further than a quiet patch of tarmac before they count.
 *
 * Shadows are handled separately, because a hard shadow is a genuine luminance
 * change and no luminance threshold can reject it. A shadow scales all three
 * colour channels by roughly the same factor; an object changes their ratios.
 * Comparing chromaticity to the background's therefore separates the two, which
 * matters more than it sounds: an unrejected shadow doubles a subject's apparent
 * width, drags the ground-contact point sideways, and quietly corrupts every
 * metre this app reports.
 *
 * Nothing here touches the DOM or a camera. Frames are plain arrays, so the
 * whole chain runs in Node against synthetic scenes whose contents are known.
 *
 * @module sentry/scene
 */

/**
 * A per-pixel background model.
 *
 * @typedef {object} Background
 * @property {number} width Frame width in pixels.
 * @property {number} height Frame height in pixels.
 * @property {Float32Array} luma Estimated background luminance, 0–255.
 * @property {Float32Array} red Background red channel, 0–255.
 * @property {Float32Array} green Background green channel.
 * @property {Float32Array} blue Background blue channel.
 * @property {Float32Array} variation Estimated per-pixel noise level.
 * @property {number} frames Frames absorbed so far.
 */

/** Detection sensitivity, in multiples of each pixel's own noise level. */
export const DEFAULT_SENSITIVITY = 3.2;

/** Floor under the adaptive threshold, in 8-bit luminance units. */
export const THRESHOLD_FLOOR = 7;

/** Frames of settling before the model's verdicts are trusted. */
export const WARMUP_FRAMES = 20;

/**
 * Rec. 601 luminance.
 *
 * @param {number} r Red, 0–255.
 * @param {number} g Green, 0–255.
 * @param {number} b Blue, 0–255.
 * @returns {number} Luminance, 0–255.
 */
export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Create an empty background model.
 *
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @returns {Background} Model with no frames absorbed.
 */
export function createBackground(width, height) {
  const n = width * height;
  return {
    width,
    height,
    luma: new Float32Array(n),
    red: new Float32Array(n),
    green: new Float32Array(n),
    blue: new Float32Array(n),
    variation: new Float32Array(n).fill(THRESHOLD_FLOOR),
    frames: 0,
  };
}

/**
 * Step the background one frame toward the observation.
 *
 * @param {Background} bg Model, updated in place.
 * @param {{data: Uint8ClampedArray}} frame RGBA pixels.
 * @param {object} [options] Update controls.
 * @param {number} [options.rate=1] Luminance units the model may move per
 *   frame. Raise it to re-learn a scene quickly, lower it to hold a subject who
 *   has stopped moving out of the background for longer.
 * @param {Uint8Array} [options.hold] Optional mask; pixels set to 1 are not
 *   absorbed, which is how a stationary tracked subject is kept in the
 *   foreground instead of dissolving into the wall behind them.
 * @returns {Background} The same model.
 */
export function updateBackground(bg, frame, options = {}) {
  const { rate = 1, hold = null } = options;
  const data = frame.data;
  const n = bg.width * bg.height;
  const first = bg.frames === 0;
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = luminance(r, g, b);
    if (first) {
      bg.luma[i] = y;
      bg.red[i] = r;
      bg.green[i] = g;
      bg.blue[i] = b;
      continue;
    }
    if (hold && hold[i]) continue;
    // Sigma-delta: a fixed step toward the observation, so the estimate walks
    // to the median of the recent past rather than its mean.
    if (y > bg.luma[i]) bg.luma[i] = Math.min(y, bg.luma[i] + rate);
    else if (y < bg.luma[i]) bg.luma[i] = Math.max(y, bg.luma[i] - rate);
    if (r > bg.red[i]) bg.red[i] = Math.min(r, bg.red[i] + rate);
    else if (r < bg.red[i]) bg.red[i] = Math.max(r, bg.red[i] - rate);
    if (g > bg.green[i]) bg.green[i] = Math.min(g, bg.green[i] + rate);
    else if (g < bg.green[i]) bg.green[i] = Math.max(g, bg.green[i] - rate);
    if (b > bg.blue[i]) bg.blue[i] = Math.min(b, bg.blue[i] + rate);
    else if (b < bg.blue[i]) bg.blue[i] = Math.max(b, bg.blue[i] - rate);

    // The noise estimate tracks a multiple of the mean absolute difference, by
    // the same one-step rule. Pixels that never change settle at the floor.
    const target = Math.abs(y - bg.luma[i]) * 4;
    if (target > bg.variation[i]) bg.variation[i] = Math.min(target, bg.variation[i] + rate);
    else if (target < bg.variation[i]) {
      bg.variation[i] = Math.max(Math.max(target, THRESHOLD_FLOOR), bg.variation[i] - rate * 0.25);
    }
  }
  bg.frames += 1;
  return bg;
}

/**
 * Classify every pixel against the background.
 *
 * @param {Background} bg Background model.
 * @param {{data: Uint8ClampedArray}} frame RGBA pixels.
 * @param {object} [options] Detection controls.
 * @param {number} [options.sensitivity=DEFAULT_SENSITIVITY] Multiples of each
 *   pixel's noise level required to call it foreground.
 * @param {boolean} [options.rejectShadows=true] Whether to suppress pixels that
 *   only darkened without changing colour.
 * @returns {{mask: Uint8Array, shadow: Uint8Array, energy: Float32Array,
 *   changed: number}} Foreground mask, the shadow pixels it rejected, the raw
 *   absolute difference per pixel, and the foreground pixel count.
 */
export function segment(bg, frame, options = {}) {
  const { sensitivity = DEFAULT_SENSITIVITY, rejectShadows = true } = options;
  const n = bg.width * bg.height;
  const mask = new Uint8Array(n);
  const shadow = new Uint8Array(n);
  const energy = new Float32Array(n);
  const data = frame.data;
  let changed = 0;
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const y = luminance(r, g, b);
    const diff = Math.abs(y - bg.luma[i]);
    energy[i] = diff;
    const threshold = Math.max(THRESHOLD_FLOOR, sensitivity * bg.variation[i] * 0.25);
    if (diff <= threshold) continue;
    if (rejectShadows && isShadow(bg, i, r, g, b, y)) {
      shadow[i] = 1;
      continue;
    }
    mask[i] = 1;
    changed += 1;
  }
  return { mask, shadow, energy, changed };
}

/**
 * Whether a darkened pixel kept the background's colour.
 *
 * A shadow multiplies all three channels by roughly one factor, so the ratios
 * between them survive; paint, cloth or fur change the ratios. The test is
 * therefore "did it get darker by between 25 and 90 per cent while staying the
 * same colour", which lets a subject wearing something genuinely dark through
 * while rejecting the pool of shade they cast.
 *
 * @param {Background} bg Background model.
 * @param {number} i Pixel index.
 * @param {number} r Observed red.
 * @param {number} g Observed green.
 * @param {number} b Observed blue.
 * @param {number} y Observed luminance.
 * @returns {boolean} True when the pixel looks like shade rather than an object.
 */
export function isShadow(bg, i, r, g, b, y) {
  const bgY = bg.luma[i];
  if (bgY < 12) return false;
  const ratio = y / bgY;
  if (ratio >= 0.92 || ratio <= 0.25) return false;
  const scaledR = bg.red[i] * ratio;
  const scaledG = bg.green[i] * ratio;
  const scaledB = bg.blue[i] * ratio;
  const drift = (Math.abs(r - scaledR) + Math.abs(g - scaledG) + Math.abs(b - scaledB)) / 3;
  return drift < 9;
}

/**
 * Open, then close, a binary mask.
 *
 * Segmentation leaves two kinds of damage. There is speckle — single pixels
 * flipped by sensor noise — and there are holes, where a subject's colour
 * happens to match whatever is behind them. Opening (erode, then dilate) clears
 * the speckle; closing (dilate, then erode) fills the holes. The order matters:
 * closing first would grow every noise pixel into a blob that opening then has
 * to be strong enough to remove, and a strong enough opening takes the subject
 * with it.
 *
 * Both passes treat the area outside the frame as set rather than clear. A
 * subject halfway through the edge of the picture is the most interesting thing
 * on the screen — somebody arriving — and the alternative convention quietly
 * erodes them away at exactly that moment.
 *
 * @param {Uint8Array} mask Binary mask, not modified.
 * @param {number} width Mask width.
 * @param {number} height Mask height.
 * @param {object} [options] Structuring rounds.
 * @param {number} [options.erode=1] Opening radius, in passes.
 * @param {number} [options.dilate=1] Closing radius, in passes.
 * @returns {Uint8Array} Cleaned mask.
 */
export function clean(mask, width, height, options = {}) {
  const { erode: openRounds = 1, dilate: closeRounds = 1 } = options;
  let current = mask;
  for (let i = 0; i < openRounds; i += 1) current = erode(current, width, height);
  for (let i = 0; i < openRounds; i += 1) current = dilate(current, width, height);
  for (let i = 0; i < closeRounds; i += 1) current = dilate(current, width, height);
  for (let i = 0; i < closeRounds; i += 1) current = erode(current, width, height);
  return current;
}

/**
 * Shrink a mask by one pixel: a set pixel survives only with all eight
 * neighbours set.
 *
 * @param {Uint8Array} mask Input mask.
 * @param {number} width Mask width.
 * @param {number} height Mask height.
 * @returns {Uint8Array} Eroded mask.
 */
export function erode(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let survives = true;
      for (let dy = -1; dy <= 1 && survives; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const ny = y + dy;
          const nx = x + dx;
          // Outside the frame counts as set, so an arriving subject is not
          // eaten away at the edge of the picture.
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
          if (!mask[ny * width + nx]) {
            survives = false;
            break;
          }
        }
      }
      out[i] = survives ? 1 : 0;
    }
  }
  return out;
}

/**
 * Grow a mask by one pixel: a clear pixel is set if any neighbour is.
 *
 * @param {Uint8Array} mask Input mask.
 * @param {number} width Mask width.
 * @param {number} height Mask height.
 * @returns {Uint8Array} Dilated mask.
 */
export function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (mask[i]) {
        out[i] = 1;
        continue;
      }
      let touched = false;
      for (let dy = -1; dy <= 1 && !touched; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
          if (mask[ny * width + nx]) {
            touched = true;
            break;
          }
        }
      }
      out[i] = touched ? 1 : 0;
    }
  }
  return out;
}

/**
 * A connected region of foreground.
 *
 * @typedef {object} Blob
 * @property {number} area Pixel count.
 * @property {number} minX Bounding box, inclusive.
 * @property {number} minY Bounding box, inclusive.
 * @property {number} maxX Bounding box, inclusive.
 * @property {number} maxY Bounding box, inclusive.
 * @property {number} cx Centroid column.
 * @property {number} cy Centroid row.
 * @property {number} footU Ground-contact column: the centroid of the bottom
 *   rows, which is where the subject actually meets the floor.
 * @property {number} footV Ground-contact row.
 * @property {number} fill Area over bounding-box area — solidity, which
 *   separates a body from a sprawling foliage detection.
 * @property {number} upperEnergy Mean change energy in the top third, which is
 *   where arm and hand movement shows up.
 */

/**
 * Label connected foreground regions.
 *
 * Two-pass union-find over an 8-connected neighbourhood: the first pass assigns
 * provisional labels and records equivalences, the second resolves them. It is
 * the textbook algorithm, chosen because it is linear in pixels and does not
 * recurse — a flood fill on a mask where half the frame has changed (headlights
 * sweeping a wall) overflows the stack on exactly the frame you most want.
 *
 * @param {Uint8Array} mask Cleaned binary mask.
 * @param {number} width Mask width.
 * @param {number} height Mask height.
 * @param {object} [options] Filtering.
 * @param {number} [options.minArea=12] Regions smaller than this are dropped.
 * @param {Float32Array} [options.energy] Per-pixel change energy, for the limb
 *   activity measures.
 * @returns {Blob[]} Regions, largest first.
 */
export function blobs(mask, width, height, options = {}) {
  const { minArea = 12, energy = null } = options;
  const labels = new Int32Array(mask.length);
  const parent = [0];
  const find = (a) => {
    let root = a;
    while (parent[root] !== root) root = parent[root];
    let walk = a;
    while (parent[walk] !== root) {
      const next = parent[walk];
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  let next = 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let best = 0;
      for (let dy = -1; dy <= 0; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dy === 0 && dx >= 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || nx < 0 || nx >= width) continue;
          const label = labels[ny * width + nx];
          if (!label) continue;
          if (!best) best = label;
          else union(best, label);
        }
      }
      if (!best) {
        best = next;
        parent[next] = next;
        next += 1;
      }
      labels[i] = best;
    }
  }

  const regions = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (!labels[i]) continue;
      const root = find(labels[i]);
      let region = regions.get(root);
      if (!region) {
        region = {
          area: 0,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          sumX: 0,
          sumY: 0,
          energySum: 0,
        };
        regions.set(root, region);
      }
      region.area += 1;
      region.sumX += x;
      region.sumY += y;
      if (x < region.minX) region.minX = x;
      if (x > region.maxX) region.maxX = x;
      if (y < region.minY) region.minY = y;
      if (y > region.maxY) region.maxY = y;
      if (energy) region.energySum += energy[i];
    }
  }

  const out = [];
  for (const [root, region] of regions) {
    if (region.area < minArea) continue;
    const boxHeight = region.maxY - region.minY + 1;
    const third = Math.max(1, Math.round(boxHeight / 3));
    let upper = 0;
    let upperCount = 0;
    let footSum = 0;
    let footCount = 0;
    const footBand = Math.max(region.maxY - 2, region.minY);
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let x = region.minX; x <= region.maxX; x += 1) {
        const i = y * width + x;
        if (!labels[i] || find(labels[i]) !== root) continue;
        if (y >= footBand) {
          footSum += x;
          footCount += 1;
        }
        if (energy && y < region.minY + third) {
          upper += energy[i];
          upperCount += 1;
        }
      }
    }
    out.push({
      area: region.area,
      minX: region.minX,
      minY: region.minY,
      maxX: region.maxX,
      maxY: region.maxY,
      cx: region.sumX / region.area,
      cy: region.sumY / region.area,
      footU: footCount ? footSum / footCount : region.sumX / region.area,
      footV: region.maxY,
      fill: region.area / ((region.maxX - region.minX + 1) * boxHeight),
      upperEnergy: upperCount ? upper / upperCount : 0,
    });
  }
  out.sort((a, b) => b.area - a.area);
  return out;
}
