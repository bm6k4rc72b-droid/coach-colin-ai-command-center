/**
 * Synthetic subjects for the Baseline tests.
 *
 * Photographing a real person under controlled conditions is not repeatable and
 * not checkable — nobody knows what their heart rate was to the beat during the
 * recording. Generating the skin-colour trace instead means the true pulse
 * rate, the true breathing rate and the true amount of motion are all inputs,
 * so every assertion downstream is against a known answer.
 *
 * @module tests/baseline/synthetic
 */

/**
 * Deterministic uniform noise in [-0.5, 0.5].
 *
 * @param {number} seed Seed value.
 * @returns {() => number} Generator.
 */
export function noiseSource(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648 - 0.5;
  };
}

/**
 * Build a scan's worth of per-frame skin measurements.
 *
 * The pulse modulates the three channels by different amounts, as haemoglobin
 * does, and respiratory sinus arrhythmia modulates the instantaneous rate, so
 * both the pulse estimator and the breathing estimator have something true to
 * find. `motion` adds a common-mode intensity wobble — the artefact POS exists
 * to cancel — at a frequency deliberately inside the pulse band, so a method
 * that fails to cancel it reports the artefact as a heart rate.
 *
 * @param {object} [spec] Subject spec.
 * @param {number} [spec.bpm=64] True pulse rate.
 * @param {number} [spec.breaths=15] True breathing rate.
 * @param {number} [spec.seconds=40] Scan length.
 * @param {number} [spec.fps=30] Capture rate.
 * @param {number} [spec.pulse=0.012] Fractional pulse amplitude.
 * @param {number} [spec.motion=0] Common-mode motion amplitude.
 * @param {number} [spec.motionHz=0.9] Motion frequency.
 * @param {number} [spec.rsa=0.07] Fractional rate modulation from breathing.
 * @param {number} [spec.luma=150] Mean skin luminance.
 * @param {number} [spec.breathLuma=2] Frame-brightness swing from breathing
 *   movement, which is the fallback the breathing estimator uses when the beat
 *   rhythm carries no respiratory modulation. Set it to zero for a subject
 *   whose breathing is invisible by either route.
 * @param {number} [spec.clipped=0] Fraction of clipped pixels.
 * @param {boolean} [spec.found=true] Whether skin was found at all.
 * @param {number} [spec.dropFrom] Fraction of the scan after which skin is lost.
 * @param {number} [spec.jitterMs=4] Frame timing jitter.
 * @param {number} [spec.seed=7] Noise seed.
 * @returns {Array<object>} Samples in the shape `estimateVitals` consumes.
 */
export function syntheticScan(spec = {}) {
  const {
    bpm = 64, breaths = 15, seconds = 40, fps = 30, pulse = 0.012, motion = 0,
    motionHz = 0.9, rsa = 0.07, luma = 150, breathLuma = 2, clipped = 0, found = true,
    dropFrom = null, jitterMs = 4, seed = 7,
  } = spec;

  const rnd = noiseSource(seed);
  const base = { r: 190, g: 138, b: 122 };
  const samples = [];
  let phase = 0;

  for (let i = 0; i < Math.round(seconds * fps); i += 1) {
    const t = i / fps;
    const instantaneous = (bpm / 60) * (1 + rsa * Math.sin(2 * Math.PI * (breaths / 60) * t));
    phase += (2 * Math.PI * instantaneous) / fps;
    const p = Math.sin(phase);
    const shake = motion * Math.sin(2 * Math.PI * motionHz * t + 1) + motion * 0.6 * rnd();
    const scale = luma / 150;

    samples.push({
      t: t * 1000 + rnd() * jitterMs,
      // Blood absorbs green most and red least, so the channels move together
      // but not equally — which is the only reason a chrominance method works.
      r: base.r * scale * (1 - pulse * 0.35 * p + shake) + rnd() * 0.6,
      g: base.g * scale * (1 - pulse * p + shake) + rnd() * 0.6,
      b: base.b * scale * (1 - pulse * 0.55 * p + shake) + rnd() * 0.6,
      luma: luma * (1 + shake) + breathLuma * Math.sin(2 * Math.PI * (breaths / 60) * t),
      motion: Math.abs(shake) * 2,
      clipped,
      found: found && (dropFrom === null || t < seconds * dropFrom),
    });
  }
  return samples;
}

/**
 * A scan of a wall: no pulse, only noise.
 *
 * @param {object} [spec] Spec, as for {@link syntheticScan}.
 * @returns {Array<object>} Samples with no periodic content.
 */
export function pulselessScan(spec = {}) {
  return syntheticScan({ ...spec, pulse: 0, rsa: 0 });
}

/**
 * Paint a frame in the shape `measureRegion` consumes.
 *
 * @param {object} spec Frame spec.
 * @param {number} [spec.width=64] Frame width.
 * @param {number} [spec.height=64] Frame height.
 * @param {[number, number, number]} [spec.background] Background colour.
 * @param {[number, number, number]} [spec.subject] Subject colour.
 * @param {{x: number, y: number, w: number, h: number}} [spec.patch] Normalized
 *   rectangle painted in the subject colour.
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} Frame.
 */
export function syntheticFrame(spec = {}) {
  const {
    width = 64, height = 64,
    background = [24, 40, 64],
    subject = [196, 142, 124],
    patch = { x: 0.25, y: 0.15, w: 0.5, h: 0.6 },
  } = spec;

  const data = new Uint8ClampedArray(width * height * 4);
  const x0 = Math.round(patch.x * width);
  const y0 = Math.round(patch.y * height);
  const x1 = Math.round((patch.x + patch.w) * width);
  const y1 = Math.round((patch.y + patch.h) * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      const [r, g, b] = inside ? subject : background;
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * A minimal `localStorage` for tests that touch the ledger.
 *
 * @returns {object} Storage stub with the four methods the ledger uses.
 */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
  };
}
