/**
 * Locking onto one specific thing and following it.
 *
 * The motion tracker already in this console answers "what is moving" — it
 * learns the background and reports whatever is not it. That is the right tool
 * for a perimeter and the wrong one for "follow *that* vehicle", because the
 * moment the thing stops moving, the background model absorbs it and it ceases
 * to exist.
 *
 * So this module holds the two classical appearance trackers, which do not care
 * whether the subject is moving:
 *
 * - **Colour lock** (CAMShift). Take a hue histogram of the region, back-project
 *   it onto each new frame to get a probability map, and walk the window uphill
 *   to the peak, resizing it from the mass it encloses. Cheap, robust to shape
 *   change and rotation, and it follows a red quad bike through a turn where a
 *   template tracker would lose it. Its failure is a background of the same
 *   hue — a green tractor in a vineyard is a hard case and the console says so.
 * - **Template lock** (normalised cross-correlation). Keep a patch of the
 *   subject and search the neighbourhood for the best match. Discriminates
 *   between two things of the same colour, which colour lock cannot, and pays
 *   for it by breaking when the subject turns or the light changes.
 *
 * Both report a confidence and, when they lose the subject, say which way they
 * lost it. A tracker that silently keeps drawing a box on the wrong thing is
 * worse than one that admits it let go.
 *
 * @module black-optic-6/lock
 */

/** Hue bins in the colour histogram. Thirty-two is the usual compromise. */
export const HUE_BINS = 32;

/** Saturation below this is grey, and its hue is meaningless. */
export const MIN_SATURATION = 0.2;

/** Value outside this band is blown out or crushed, and its hue is unreliable. */
export const VALUE_BAND = Object.freeze({ min: 0.12, max: 0.96 });

/** Back-projection density below this means the colour lock has lost its subject. */
export const COLOUR_LOST_BELOW = 0.12;

/** Correlation below this means the template lock has lost its subject. */
export const TEMPLATE_LOST_BELOW = 0.45;

/**
 * Hue, saturation and value of one pixel.
 *
 * @param {number} r Red, 0–255.
 * @param {number} g Green, 0–255.
 * @param {number} b Blue, 0–255.
 * @returns {{h: number, s: number, v: number}} Hue 0..1, saturation 0..1, value 0..1.
 */
export function rgbToHsv(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let h = 0;
  if (delta > 1e-6) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { h, s: max > 1e-6 ? delta / max : 0, v: max };
}

/**
 * A hue histogram of a region, ignoring pixels whose hue means nothing.
 *
 * Grey and near-black pixels are excluded deliberately: their hue is numerical
 * noise, and letting them into the histogram is what makes a colour tracker
 * drift onto shadows.
 *
 * Pixels are weighted by an Epanechnikov kernel — full weight at the centre of
 * the box, falling to nothing at its edge. Without that weighting the corners of
 * any rectangle drawn around a round subject are background, the background
 * colour joins the histogram, and the tracker then finds the background
 * everywhere and never moves. It is the difference between a tracker that works
 * and one that sits still reporting high confidence.
 *
 * @param {ImageData} frame The frame.
 * @param {{x: number, y: number, w: number, h: number}} box The region.
 * @param {number} [bins=HUE_BINS] Histogram bins.
 * @returns {{bins: Float32Array, counted: number, coverage: number}} The histogram,
 *   normalised so its largest bin is one.
 */
export function hueHistogram(frame, box, bins = HUE_BINS) {
  const histogram = new Float32Array(bins);
  let counted = 0;
  let total = 0;

  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const radius = { x: Math.max(1, box.w / 2), y: Math.max(1, box.h / 2) };

  for (let y = Math.max(0, Math.round(box.y)); y < Math.min(frame.height, Math.round(box.y + box.h)); y += 1) {
    for (let x = Math.max(0, Math.round(box.x)); x < Math.min(frame.width, Math.round(box.x + box.w)); x += 1) {
      const p = (y * frame.width + x) * 4;
      total += 1;
      const normalised = ((x - centre.x) / radius.x) ** 2 + ((y - centre.y) / radius.y) ** 2;
      if (normalised >= 1) continue;
      const weight = 1 - normalised;
      const { h, s, v } = rgbToHsv(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
      if (s < MIN_SATURATION || v < VALUE_BAND.min || v > VALUE_BAND.max) continue;
      histogram[Math.min(bins - 1, Math.floor(h * bins))] += weight;
      counted += 1;
    }
  }

  let peak = 0;
  for (const value of histogram) peak = Math.max(peak, value);
  if (peak > 0) {
    for (let i = 0; i < bins; i += 1) histogram[i] /= peak;
  }
  // Coverage is judged against the kernel's own footprint — about π/4 of the
  // box — rather than the whole rectangle, whose corners were never counted.
  const footprint = Math.max(1, total * (Math.PI / 4));
  return { bins: histogram, counted, coverage: Math.min(1, counted / footprint) };
}

/**
 * Back-project a histogram onto a frame.
 *
 * @param {ImageData} frame The frame.
 * @param {Float32Array} histogram Normalised hue histogram.
 * @returns {Float32Array} Per-pixel probability that this is the subject's colour.
 */
export function backProject(frame, histogram) {
  const bins = histogram.length;
  const count = frame.width * frame.height;
  const map = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const { h, s, v } = rgbToHsv(frame.data[p], frame.data[p + 1], frame.data[p + 2]);
    if (s < MIN_SATURATION || v < VALUE_BAND.min || v > VALUE_BAND.max) continue;
    map[i] = histogram[Math.min(bins - 1, Math.floor(h * bins))];
  }
  return map;
}

/**
 * Walk a window uphill to the peak of a probability map, and size it to the mass.
 *
 * This is CAMShift: mean shift for the position, then the zeroth moment for the
 * scale, which is what lets the box grow as a subject approaches instead of
 * tracking a corner of it.
 *
 * @param {Float32Array} map Back-projection.
 * @param {number} width Map width.
 * @param {{x: number, y: number, w: number, h: number}} start Starting window.
 * @param {object} [options] Iteration limits.
 * @param {number} [options.maxIterations=12] Steps before giving up.
 * @param {number} [options.epsilon=0.6] Movement in pixels below which it has converged.
 * @param {boolean} [options.resize=true] Whether to adapt the window size.
 * @returns {{box: object, density: number, iterations: number, mass: number}} Where it settled.
 */
export function camShift(map, width, start, options = {}) {
  const maxIterations = options.maxIterations ?? 12;
  const epsilon = options.epsilon ?? 0.6;
  const resize = options.resize ?? true;
  const height = map.length / width;
  const box = { ...start };
  let mass = 0;
  let iterations = 0;

  for (; iterations < maxIterations; iterations += 1) {
    let m00 = 0;
    let m10 = 0;
    let m01 = 0;
    const left = Math.max(0, Math.round(box.x));
    const top = Math.max(0, Math.round(box.y));
    const right = Math.min(width, Math.round(box.x + box.w));
    const bottom = Math.min(height, Math.round(box.y + box.h));

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const value = map[y * width + x];
        if (value <= 0) continue;
        m00 += value;
        m10 += x * value;
        m01 += y * value;
      }
    }

    mass = m00;
    if (m00 <= 1e-6) break;

    const centroid = { x: m10 / m00, y: m01 / m00 };
    const moved = Math.hypot(centroid.x - (box.x + box.w / 2), centroid.y - (box.y + box.h / 2));
    box.x = centroid.x - box.w / 2;
    box.y = centroid.y - box.h / 2;
    if (moved < epsilon) break;
  }

  if (resize && mass > 1e-6) {
    // The window is sized from the mass it encloses, which is what makes the box
    // follow a subject that is getting closer rather than clipping it.
    const side = 2 * Math.sqrt(mass);
    const target = Math.max(8, Math.min(width * 0.9, side));
    const aspect = start.h / Math.max(1, start.w);
    const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    box.w = target;
    box.h = target * aspect;
    box.x = centre.x - box.w / 2;
    box.y = centre.y - box.h / 2;
  }

  box.x = Math.max(0, Math.min(width - box.w, box.x));
  box.y = Math.max(0, Math.min(height - box.h, box.y));
  const area = Math.max(1, box.w * box.h);
  return { box, density: mass / area, iterations, mass };
}

/**
 * Follow one subject by its colour.
 */
export class ColourLock {
  /**
   * @param {object} [options] Settings.
   * @param {number} [options.bins=HUE_BINS] Histogram bins.
   * @param {number} [options.lostBelow=COLOUR_LOST_BELOW] Density at which the lock is dropped.
   */
  constructor(options = {}) {
    this.bins = options.bins ?? HUE_BINS;
    this.lostBelow = options.lostBelow ?? COLOUR_LOST_BELOW;
    this.histogram = null;
    this.box = null;
    this.coverage = 0;
    this.lost = true;
  }

  /**
   * Take a subject from a frame.
   *
   * @param {ImageData} frame The frame.
   * @param {{x: number, y: number, w: number, h: number}} box The subject.
   * @returns {{locked: boolean, reason: string, coverage: number}} Whether the
   *   region had a usable colour in it at all.
   */
  lockOn(frame, box) {
    const histogram = hueHistogram(frame, box, this.bins);
    this.coverage = histogram.coverage;

    // A region of grey, shadow or blown highlight has no hue to track. Saying so
    // now is far better than locking and drifting onto the first red thing.
    if (histogram.coverage < 0.15 || histogram.counted < 24) {
      this.histogram = null;
      this.lost = true;
      return {
        locked: false,
        coverage: histogram.coverage,
        reason: 'Too little colour in that region — mostly grey, shadow or blown highlight. Pick something saturated.',
      };
    }

    this.histogram = histogram.bins;
    this.box = { ...box };
    this.lost = false;
    return { locked: true, coverage: histogram.coverage, reason: 'Locked on colour.' };
  }

  /**
   * Find the subject in a new frame.
   *
   * @param {ImageData} frame The frame.
   * @returns {{box: object|null, confidence: number, lost: boolean, reason: string}} The result.
   */
  track(frame) {
    if (!this.histogram || !this.box) {
      return { box: null, confidence: 0, lost: true, reason: 'Nothing locked.' };
    }
    const map = backProject(frame, this.histogram);
    let result = camShift(map, frame.width, this.box);

    // Mean shift is a local climb: a subject that jumped further than its own
    // window leaves no gradient to follow. One widened pass recovers that case
    // before the lock is given up on.
    if (result.density < this.lostBelow) {
      const wide = {
        x: this.box.x - this.box.w / 2,
        y: this.box.y - this.box.h / 2,
        w: this.box.w * 2,
        h: this.box.h * 2,
      };
      const recovered = camShift(map, frame.width, wide, { resize: false });
      if (recovered.density >= this.lostBelow) {
        result = camShift(map, frame.width, {
          x: recovered.box.x + this.box.w / 2,
          y: recovered.box.y + this.box.h / 2,
          w: this.box.w,
          h: this.box.h,
        });
      }
    }

    this.box = result.box;

    if (result.density < this.lostBelow) {
      this.lost = true;
      return {
        box: result.box,
        confidence: result.density,
        lost: true,
        reason: 'Lost it — the colour is no longer where the window is. Occluded, out of frame, or the light changed.',
      };
    }

    this.lost = false;
    return { box: result.box, confidence: result.density, lost: false, reason: 'Holding.' };
  }
}

/**
 * Grey values of a patch, for correlation.
 *
 * @param {ImageData} frame The frame.
 * @param {{x: number, y: number, w: number, h: number}} box The patch.
 * @returns {{data: Float32Array, w: number, h: number}} The patch.
 */
export function greyPatch(frame, box) {
  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.max(0, Math.min(frame.width - 1, Math.round(box.x) + x));
      const sy = Math.max(0, Math.min(frame.height - 1, Math.round(box.y) + y));
      const p = (sy * frame.width + sx) * 4;
      data[y * w + x] = 0.2126 * frame.data[p] + 0.7152 * frame.data[p + 1] + 0.0722 * frame.data[p + 2];
    }
  }
  return { data, w, h };
}

/**
 * Normalised cross-correlation between a template and a patch of a frame.
 *
 * Normalised because a plain difference is dominated by brightness: a cloud
 * passing over changes every pixel and would read as the subject vanishing.
 *
 * @param {{data: Float32Array, w: number, h: number}} template The template.
 * @param {ImageData} frame The frame.
 * @param {number} offsetX Left edge of the candidate patch.
 * @param {number} offsetY Top edge of the candidate patch.
 * @returns {number} Correlation in −1..1.
 */
export function correlate(template, frame, offsetX, offsetY) {
  const { data, w, h } = template;
  let sumA = 0;
  let sumB = 0;
  const patch = new Float32Array(w * h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = offsetX + x;
      const sy = offsetY + y;
      if (sx < 0 || sy < 0 || sx >= frame.width || sy >= frame.height) return -1;
      const p = (sy * frame.width + sx) * 4;
      const grey = 0.2126 * frame.data[p] + 0.7152 * frame.data[p + 1] + 0.0722 * frame.data[p + 2];
      patch[y * w + x] = grey;
      sumA += data[y * w + x];
      sumB += grey;
    }
  }

  const n = w * h;
  const meanA = sumA / n;
  const meanB = sumB / n;
  let numerator = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const a = data[i] - meanA;
    const b = patch[i] - meanB;
    numerator += a * b;
    varA += a * a;
    varB += b * b;
  }
  const denominator = Math.sqrt(varA * varB);
  return denominator > 1e-6 ? numerator / denominator : 0;
}

/**
 * Follow one subject by its appearance.
 */
export class TemplateLock {
  /**
   * @param {object} [options] Settings.
   * @param {number} [options.searchRadius=16] Pixels searched around the last position.
   * @param {number} [options.step=2] Search step; two is four times cheaper than one and rarely worse.
   * @param {number} [options.lostBelow=TEMPLATE_LOST_BELOW] Correlation at which the lock is dropped.
   */
  constructor(options = {}) {
    this.searchRadius = options.searchRadius ?? 16;
    this.step = options.step ?? 2;
    this.lostBelow = options.lostBelow ?? TEMPLATE_LOST_BELOW;
    this.template = null;
    this.box = null;
    this.lost = true;
  }

  /**
   * Take a subject from a frame.
   *
   * @param {ImageData} frame The frame.
   * @param {{x: number, y: number, w: number, h: number}} box The subject.
   * @returns {{locked: boolean, reason: string}} Whether the patch is trackable.
   */
  lockOn(frame, box) {
    const patch = greyPatch(frame, box);
    let mean = 0;
    for (const value of patch.data) mean += value;
    mean /= patch.data.length;
    let variance = 0;
    for (const value of patch.data) variance += (value - mean) ** 2;
    variance /= patch.data.length;

    // A flat patch — sky, a painted wall — correlates equally well with
    // everywhere, so the tracker would wander. Refuse the lock instead.
    if (variance < 24) {
      this.template = null;
      this.lost = true;
      return { locked: false, reason: 'That patch has no texture to match on. Pick something with detail in it.' };
    }

    this.template = patch;
    this.box = { ...box };
    this.lost = false;
    return { locked: true, reason: 'Locked on appearance.' };
  }

  /**
   * Find the subject in a new frame.
   *
   * @param {ImageData} frame The frame.
   * @returns {{box: object|null, confidence: number, lost: boolean, reason: string}} The result.
   */
  track(frame) {
    if (!this.template || !this.box) {
      return { box: null, confidence: 0, lost: true, reason: 'Nothing locked.' };
    }

    let best = { score: -1, x: this.box.x, y: this.box.y };
    for (let dy = -this.searchRadius; dy <= this.searchRadius; dy += this.step) {
      for (let dx = -this.searchRadius; dx <= this.searchRadius; dx += this.step) {
        const x = Math.round(this.box.x + dx);
        const y = Math.round(this.box.y + dy);
        const score = correlate(this.template, frame, x, y);
        if (score > best.score) best = { score, x, y };
      }
    }

    this.box = { ...this.box, x: best.x, y: best.y };
    if (best.score < this.lostBelow) {
      this.lost = true;
      return {
        box: this.box,
        confidence: best.score,
        lost: true,
        reason: 'Lost it — nothing nearby looks like the subject any more. It turned, went behind something, or the light changed.',
      };
    }

    this.lost = false;
    return { box: this.box, confidence: best.score, lost: false, reason: 'Holding.' };
  }
}

/** The trackers the console offers, and when each one is the right choice. */
export const LOCK_MODES = Object.freeze([
  {
    id: 'motion',
    name: 'Motion',
    note: 'The background model. Reports everything that moves and nothing that stops. The right default for a perimeter.',
  },
  {
    id: 'colour',
    name: 'Colour',
    note: 'Follows a hue through turns and shape changes. For a vehicle, a hi-vis vest, a tagged animal. Struggles when the background shares the colour.',
  },
  {
    id: 'template',
    name: 'Appearance',
    note: 'Follows a patch of detail. Tells two similar-coloured things apart, and breaks when the subject turns or the light changes.',
  },
]);
