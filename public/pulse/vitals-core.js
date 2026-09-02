/**
 * PULSE — contactless heart-rate estimation from a camera stream.
 *
 * This module is the signal-processing core: pure functions and small
 * factories with no DOM, no camera and no timers, so it can be unit tested
 * under Node (see `src/vitals/vitalsCore.test.mjs`) and imported unchanged by
 * the browser app (`app.js`). It ships as plain ESM under `public/` so the
 * page runs from any static host with no build step.
 *
 * Pipeline, end to end:
 *
 *   frames --> ROI mean RGB --> uniform resample --> detrend
 *          --> POS projection (face) or red channel (finger)
 *          --> band-limited spectrum --> peak + SNR --> temporal tracker
 *
 * The chrominance projection is POS (Plane-Orthogonal-to-Skin, Wang et al.,
 * "Algorithmic Principles of Remote PPG", IEEE TBME 2017), which cancels the
 * specular/illumination component that motion and lighting changes inject
 * into a raw green-channel trace.
 *
 * NOT A MEDICAL DEVICE. Estimates are for wellness and demonstration only.
 *
 * @module vitals-core
 */

/** Slowest pulse the estimator will report (bpm). */
export const DEFAULT_MIN_BPM = 42;
/** Fastest pulse the estimator will report (bpm). */
export const DEFAULT_MAX_BPM = 240;
/** Sampling rate the irregular camera timestamps are resampled onto (Hz). */
export const ANALYSIS_HZ = 30;
/** Seconds of signal the estimator wants before it trusts a reading. */
export const MIN_WINDOW_SECONDS = 8;
/** Seconds of signal retained for analysis. */
export const MAX_WINDOW_SECONDS = 20;

const TWO_PI = Math.PI * 2;

/* ---------------------------------------------------------------------------
   1. SAMPLE BUFFER
   A fixed-capacity ring of per-frame observations. Camera frames arrive at an
   irregular cadence, so every sample carries its own timestamp.
   ------------------------------------------------------------------------ */

/**
 * Create a ring buffer of per-frame ROI observations.
 *
 * @param {number} capacity Maximum retained frames.
 * @returns {{push: Function, clear: Function, size: () => number,
 *            spanSeconds: () => number, series: () => object}}
 */
export function createSampleBuffer(capacity = ANALYSIS_HZ * MAX_WINDOW_SECONDS * 2) {
  const cap = Math.max(2, Math.floor(capacity));
  const t = new Float64Array(cap);
  const r = new Float64Array(cap);
  const g = new Float64Array(cap);
  const b = new Float64Array(cap);
  const motion = new Float64Array(cap);
  const brightness = new Float64Array(cap);
  let head = 0;
  let count = 0;

  const chronological = (out, source) => {
    const start = count === cap ? head : 0;
    for (let i = 0; i < count; i += 1) out[i] = source[(start + i) % cap];
    return out;
  };

  return {
    /**
     * Append one frame observation.
     * @param {{t: number, r: number, g: number, b: number,
     *          motion?: number, brightness?: number}} sample
     */
    push(sample) {
      t[head] = sample.t;
      r[head] = sample.r;
      g[head] = sample.g;
      b[head] = sample.b;
      motion[head] = sample.motion ?? 0;
      brightness[head] = sample.brightness ?? (sample.r + sample.g + sample.b) / 3;
      head = (head + 1) % cap;
      if (count < cap) count += 1;
    },
    clear() {
      head = 0;
      count = 0;
    },
    size: () => count,
    /** Wall-clock seconds between the oldest and newest retained frame. */
    spanSeconds() {
      if (count < 2) return 0;
      const start = count === cap ? head : 0;
      const oldest = t[start % cap];
      const newest = t[(start + count - 1) % cap];
      return newest - oldest;
    },
    /** Retained frames in chronological order. */
    series() {
      return {
        t: chronological(new Float64Array(count), t),
        r: chronological(new Float64Array(count), r),
        g: chronological(new Float64Array(count), g),
        b: chronological(new Float64Array(count), b),
        motion: chronological(new Float64Array(count), motion),
        brightness: chronological(new Float64Array(count), brightness),
        length: count,
      };
    },
  };
}

/* ---------------------------------------------------------------------------
   2. RESAMPLING AND DETRENDING
   ------------------------------------------------------------------------ */

/**
 * Linearly resample an irregularly timed series onto a uniform grid.
 *
 * @param {ArrayLike<number>} t Strictly increasing timestamps (seconds).
 * @param {ArrayLike<number>} values Samples aligned with `t`.
 * @param {number} fs Target sampling rate (Hz).
 * @returns {Float64Array} Uniform samples spanning `t[0]`..`t[n-1]`.
 */
export function resampleUniform(t, values, fs = ANALYSIS_HZ) {
  const n = t.length;
  if (n === 0) return new Float64Array(0);
  if (n === 1) return Float64Array.from([values[0]]);
  const duration = t[n - 1] - t[0];
  const out = new Float64Array(Math.max(1, Math.floor(duration * fs) + 1));
  let cursor = 0;
  for (let i = 0; i < out.length; i += 1) {
    const target = t[0] + i / fs;
    while (cursor < n - 2 && t[cursor + 1] < target) cursor += 1;
    const t0 = t[cursor];
    const t1 = t[cursor + 1];
    const span = t1 - t0;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (target - t0) / span)) : 0;
    out[i] = values[cursor] + (values[cursor + 1] - values[cursor]) * alpha;
  }
  return out;
}

/**
 * Centred moving average, edge-clamped so the output keeps the input length.
 *
 * @param {ArrayLike<number>} x
 * @param {number} window Window length in samples (forced odd, >= 1).
 * @returns {Float64Array}
 */
export function movingAverage(x, window) {
  const n = x.length;
  const out = new Float64Array(n);
  const w = Math.max(1, Math.floor(window) | 1);
  const half = (w - 1) / 2;
  if (n === 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += x[i];
  if (w >= n) {
    out.fill(sum / n);
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    let lo = i - half;
    let hi = i + half;
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > n - 1) { lo -= hi - (n - 1); hi = n - 1; }
    if (lo < 0) lo = 0;
    let acc = 0;
    for (let k = lo; k <= hi; k += 1) acc += x[k];
    out[i] = acc / (hi - lo + 1);
  }
  return out;
}

/**
 * Remove slow drift (breathing, lighting ramps, skin-tone shift) by
 * subtracting a moving average.
 *
 * @param {ArrayLike<number>} x
 * @param {number} window Detrend window in samples.
 * @returns {Float64Array}
 */
export function detrend(x, window) {
  const baseline = movingAverage(x, window);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) out[i] = x[i] - baseline[i];
  return out;
}

/** Arithmetic mean of a series (0 when empty). */
export function mean(x) {
  if (!x.length) return 0;
  let sum = 0;
  for (let i = 0; i < x.length; i += 1) sum += x[i];
  return sum / x.length;
}

/** Population standard deviation of a series. */
export function stdDev(x) {
  if (x.length < 2) return 0;
  const mu = mean(x);
  let acc = 0;
  for (let i = 0; i < x.length; i += 1) {
    const d = x[i] - mu;
    acc += d * d;
  }
  return Math.sqrt(acc / x.length);
}

/** Zero-mean, unit-variance copy of a series. */
export function standardize(x) {
  const mu = mean(x);
  const sd = stdDev(x) || 1;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i += 1) out[i] = (x[i] - mu) / sd;
  return out;
}

/* ---------------------------------------------------------------------------
   3. CHROMINANCE PROJECTION (POS)
   ------------------------------------------------------------------------ */

/**
 * Project uniformly sampled RGB traces onto the pulse-bearing plane (POS).
 *
 * Each overlapping window is temporally normalised, projected through
 * `[[0, 1, -1], [-2, 1, 1]]`, tuned so the two projections cancel their
 * specular component, then overlap-added.
 *
 * @param {ArrayLike<number>} r
 * @param {ArrayLike<number>} g
 * @param {ArrayLike<number>} b
 * @param {number} fs Sampling rate (Hz).
 * @param {{windowSeconds?: number}} [options]
 * @returns {Float64Array} Pulse signal, same length as the inputs.
 */
export function posProject(r, g, b, fs = ANALYSIS_HZ, options = {}) {
  const n = Math.min(r.length, g.length, b.length);
  const out = new Float64Array(n);
  if (n === 0) return out;
  const l = Math.max(8, Math.round((options.windowSeconds ?? 1.6) * fs));
  if (n < l) return posWindow(r, g, b, 0, n, out, true);
  for (let start = 0; start + l <= n; start += 1) {
    posWindow(r, g, b, start, l, out, false);
  }
  return out;
}

/**
 * Project a single window and accumulate it into `out`.
 * @private
 */
function posWindow(r, g, b, start, length, out, replace) {
  let mr = 0;
  let mg = 0;
  let mb = 0;
  for (let i = 0; i < length; i += 1) {
    mr += r[start + i];
    mg += g[start + i];
    mb += b[start + i];
  }
  mr = mr / length || 1;
  mg = mg / length || 1;
  mb = mb / length || 1;

  const s1 = new Float64Array(length);
  const s2 = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const cr = r[start + i] / mr;
    const cg = g[start + i] / mg;
    const cb = b[start + i] / mb;
    s1[i] = cg - cb;
    s2[i] = -2 * cr + cg + cb;
  }
  const sd2 = stdDev(s2);
  const alpha = sd2 > 1e-12 ? stdDev(s1) / sd2 : 0;
  const h = new Float64Array(length);
  for (let i = 0; i < length; i += 1) h[i] = s1[i] + alpha * s2[i];
  const mu = mean(h);
  for (let i = 0; i < length; i += 1) {
    if (replace) out[start + i] = h[i] - mu;
    else out[start + i] += h[i] - mu;
  }
  return out;
}

/**
 * Build the pulse waveform for a capture mode.
 *
 * `face` uses POS across all three channels. `finger` (fingertip pressed to
 * the lens with the torch on) uses the red channel, which carries almost all
 * of the transmitted signal there; it is negated so a systolic upstroke
 * points up, matching a conventional PPG trace.
 *
 * @param {{r: ArrayLike<number>, g: ArrayLike<number>, b: ArrayLike<number>}} rgb
 * @param {number} fs
 * @param {'face'|'finger'} mode
 * @returns {Float64Array}
 */
export function pulseSignal(rgb, fs = ANALYSIS_HZ, mode = 'face') {
  if (mode === 'finger') {
    const detrended = detrend(rgb.r, Math.round(fs * 1.0));
    const out = new Float64Array(detrended.length);
    for (let i = 0; i < detrended.length; i += 1) out[i] = -detrended[i];
    return out;
  }
  // POS normalises each window by its own channel means, so it takes the raw
  // traces: pre-detrending to zero mean would make that division explode.
  return posProject(rgb.r, rgb.g, rgb.b, fs);
}

/* ---------------------------------------------------------------------------
   4. SPECTRAL ESTIMATION
   ------------------------------------------------------------------------ */

/** Periodic Hann window of length `n`. */
export function hannWindow(n) {
  const w = new Float64Array(n);
  if (n === 1) { w[0] = 1; return w; }
  for (let i = 0; i < n; i += 1) w[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / n);
  return w;
}

/** Smallest power of two >= `n`. */
export function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * In-place iterative radix-2 FFT.
 *
 * @param {Float64Array} re Real parts (length must be a power of two).
 * @param {Float64Array} im Imaginary parts.
 */
export function fftInPlace(re, im) {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`FFT length must be a power of two; received ${n}`);
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TWO_PI / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Hann-windowed, zero-padded one-sided power spectrum.
 *
 * @param {ArrayLike<number>} x
 * @param {number} fs Sampling rate (Hz).
 * @param {{zeroPadFactor?: number}} [options]
 * @returns {{freqs: Float64Array, power: Float64Array, binHz: number}}
 */
export function powerSpectrum(x, fs = ANALYSIS_HZ, options = {}) {
  const n = x.length;
  if (n < 4) return { freqs: new Float64Array(0), power: new Float64Array(0), binHz: 0 };
  const padded = nextPowerOfTwo(n * (options.zeroPadFactor ?? 4));
  const re = new Float64Array(padded);
  const im = new Float64Array(padded);
  const win = hannWindow(n);
  const mu = mean(x);
  for (let i = 0; i < n; i += 1) re[i] = (x[i] - mu) * win[i];
  fftInPlace(re, im);
  const half = padded / 2;
  const power = new Float64Array(half);
  const freqs = new Float64Array(half);
  const binHz = fs / padded;
  for (let i = 0; i < half; i += 1) {
    power[i] = re[i] * re[i] + im[i] * im[i];
    freqs[i] = i * binHz;
  }
  return { freqs, power, binHz };
}

/**
 * Zero-phase band-pass by spectral masking — used for the on-screen waveform,
 * where a linear-phase result matters more than filter economy.
 *
 * @param {ArrayLike<number>} x
 * @param {number} fs
 * @param {number} lowHz
 * @param {number} highHz
 * @returns {Float64Array} Filtered signal, same length as `x`.
 */
export function bandpass(x, fs, lowHz, highHz) {
  const n = x.length;
  if (n < 4) return Float64Array.from(x);
  const padded = nextPowerOfTwo(n);
  const re = new Float64Array(padded);
  const im = new Float64Array(padded);
  const mu = mean(x);
  for (let i = 0; i < n; i += 1) re[i] = x[i] - mu;
  // Reflect the tail into the pad so the transform does not see a step edge.
  for (let i = n; i < padded; i += 1) re[i] = re[Math.max(0, 2 * n - i - 2)] ?? 0;
  fftInPlace(re, im);
  const binHz = fs / padded;
  for (let i = 0; i <= padded / 2; i += 1) {
    const f = i * binHz;
    if (f < lowHz || f > highHz) {
      re[i] = 0;
      im[i] = 0;
      const mirror = (padded - i) % padded;
      re[mirror] = 0;
      im[mirror] = 0;
    }
  }
  // Inverse transform via conjugation.
  for (let i = 0; i < padded; i += 1) im[i] = -im[i];
  fftInPlace(re, im);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) out[i] = re[i] / padded;
  return out;
}

/**
 * Estimate pulse rate from a band-limited spectral peak.
 *
 * Confidence is derived from the spectral SNR: power near the fundamental and
 * its first harmonic against the rest of the plausible pulse band. A clean
 * periodic signal concentrates its energy there; motion artefacts and sensor
 * noise spread it out.
 *
 * @param {ArrayLike<number>} signal Uniformly sampled pulse waveform.
 * @param {number} fs Sampling rate (Hz).
 * @param {{minBpm?: number, maxBpm?: number}} [options]
 * @returns {{bpm: number, freq: number, snrDb: number, confidence: number,
 *            spectrum: {bpms: Float64Array, power: Float64Array}} | null}
 */
export function estimateRate(signal, fs = ANALYSIS_HZ, options = {}) {
  const minBpm = options.minBpm ?? DEFAULT_MIN_BPM;
  const maxBpm = options.maxBpm ?? DEFAULT_MAX_BPM;
  const lowHz = minBpm / 60;
  const highHz = maxBpm / 60;
  const clean = standardize(detrend(signal, Math.max(3, Math.round(fs * 1.5))));
  const { freqs, power, binHz } = powerSpectrum(clean, fs);
  if (!power.length || binHz <= 0) return null;

  const loBin = Math.max(1, Math.ceil(lowHz / binHz));
  const hiBin = Math.min(power.length - 2, Math.floor(highHz / binHz));
  if (hiBin <= loBin) return null;

  let peak = loBin;
  for (let i = loBin; i <= hiBin; i += 1) if (power[i] > power[peak]) peak = i;

  // Parabolic interpolation on log power for sub-bin frequency resolution.
  const a = Math.log(power[peak - 1] + 1e-20);
  const bb = Math.log(power[peak] + 1e-20);
  const c = Math.log(power[peak + 1] + 1e-20);
  const denom = a - 2 * bb + c;
  const shift = Math.abs(denom) > 1e-12 ? Math.min(0.5, Math.max(-0.5, (0.5 * (a - c)) / denom)) : 0;
  const freq = (peak + shift) * binHz;

  // SNR: fundamental + first harmonic against the remaining pulse band.
  const halfWidth = Math.max(1, Math.round(0.12 / binHz));
  let signalPower = 0;
  let bandPower = 0;
  const harmonicBin = Math.round((2 * freq) / binHz);
  for (let i = loBin; i <= hiBin; i += 1) {
    bandPower += power[i];
    if (Math.abs(i - peak) <= halfWidth || Math.abs(i - harmonicBin) <= halfWidth) {
      signalPower += power[i];
    }
  }
  const noisePower = Math.max(bandPower - signalPower, 1e-20);
  const snr = signalPower / noisePower;
  const snrDb = 10 * Math.log10(snr);
  const confidence = clamp01((snrDb + 2) / 14);

  const bpms = new Float64Array(hiBin - loBin + 1);
  const bandSpectrum = new Float64Array(hiBin - loBin + 1);
  for (let i = loBin; i <= hiBin; i += 1) {
    bpms[i - loBin] = freqs[i] * 60;
    bandSpectrum[i - loBin] = power[i];
  }

  return {
    bpm: freq * 60,
    freq,
    snrDb,
    confidence,
    spectrum: { bpms, power: bandSpectrum },
  };
}

/** Clamp to the unit interval. */
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/* ---------------------------------------------------------------------------
   5. TEMPORAL TRACKING
   ------------------------------------------------------------------------ */

/**
 * Smooth a stream of per-window estimates into a stable displayed rate.
 *
 * Low-confidence estimates are discarded outright; survivors are combined as a
 * confidence-weighted median over a trailing window, which rejects the
 * occasional harmonic slip (a doubled or halved peak) that a mean would drag
 * the reading toward.
 *
 * @param {{windowSeconds?: number, minConfidence?: number}} [options]
 */
export function createRateTracker(options = {}) {
  const windowSeconds = options.windowSeconds ?? 10;
  const minConfidence = options.minConfidence ?? 0.35;
  /** @type {{t: number, bpm: number, confidence: number}[]} */
  let history = [];

  return {
    /**
     * Offer one estimate to the tracker.
     * @param {number} t Timestamp (seconds).
     * @param {number} bpm
     * @param {number} confidence 0..1
     * @returns {boolean} Whether the estimate was accepted.
     */
    push(t, bpm, confidence) {
      history = history.filter((entry) => t - entry.t <= windowSeconds);
      if (!Number.isFinite(bpm) || confidence < minConfidence) return false;
      history.push({ t, bpm, confidence });
      return true;
    },
    clear() { history = []; },
    /** Number of accepted estimates currently in the window. */
    size: () => history.length,
    /**
     * Current smoothed reading.
     * @returns {{bpm: number, confidence: number, stability: number,
     *            samples: number} | null}
     */
    value() {
      if (!history.length) return null;
      const bpm = weightedMedian(
        history.map((entry) => entry.bpm),
        history.map((entry) => entry.confidence),
      );
      const confidence = history.reduce((acc, entry) => acc + entry.confidence, 0) / history.length;
      const spread = stdDev(Float64Array.from(history.map((entry) => entry.bpm)));
      // 0 bpm spread reads as fully stable; >= 8 bpm spread reads as unstable.
      const stability = clamp01(1 - spread / 8);
      return { bpm, confidence, stability, samples: history.length };
    },
  };
}

/**
 * Weighted median — the value where cumulative weight first reaches half.
 *
 * @param {number[]} values
 * @param {number[]} weights
 * @returns {number}
 */
export function weightedMedian(values, weights) {
  if (!values.length) return Number.NaN;
  const pairs = values
    .map((value, i) => ({ value, weight: Math.max(weights[i] ?? 1, 1e-9) }))
    .sort((x, y) => x.value - y.value);
  const total = pairs.reduce((acc, pair) => acc + pair.weight, 0);
  let cumulative = 0;
  for (const pair of pairs) {
    cumulative += pair.weight;
    if (cumulative >= total / 2) return pair.value;
  }
  return pairs[pairs.length - 1].value;
}

/* ---------------------------------------------------------------------------
   6. BEAT DETECTION AND VARIABILITY
   ------------------------------------------------------------------------ */

/**
 * Locate systolic peaks in a band-passed pulse waveform.
 *
 * @param {ArrayLike<number>} x Band-passed signal.
 * @param {number} fs
 * @param {{minBpm?: number, maxBpm?: number}} [options]
 * @returns {number[]} Peak sample indices.
 */
export function detectPeaks(x, fs = ANALYSIS_HZ, options = {}) {
  const maxBpm = options.maxBpm ?? DEFAULT_MAX_BPM;
  const refractory = Math.max(1, Math.round((60 / maxBpm) * fs));
  const threshold = stdDev(x) * 0.4;
  const peaks = [];
  for (let i = 1; i < x.length - 1; i += 1) {
    if (x[i] <= x[i - 1] || x[i] < x[i + 1] || x[i] < threshold) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < refractory) {
      if (x[i] > x[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

/**
 * Inter-beat interval statistics.
 *
 * SDNN and RMSSD are the two standard short-window variability measures.
 * Camera PPG timing is far noisier than an ECG, so treat them as indicative.
 *
 * @param {number[]} peaks Peak sample indices.
 * @param {number} fs
 * @returns {{ibis: number[], meanIbi: number, bpm: number, sdnn: number,
 *            rmssd: number} | null}
 */
export function intervalStats(peaks, fs = ANALYSIS_HZ) {
  if (peaks.length < 3) return null;
  const ibis = [];
  for (let i = 1; i < peaks.length; i += 1) ibis.push(((peaks[i] - peaks[i - 1]) / fs) * 1000);
  const arr = Float64Array.from(ibis);
  const meanIbi = mean(arr);
  let acc = 0;
  for (let i = 1; i < ibis.length; i += 1) {
    const d = ibis[i] - ibis[i - 1];
    acc += d * d;
  }
  return {
    ibis,
    meanIbi,
    bpm: meanIbi > 0 ? 60000 / meanIbi : Number.NaN,
    sdnn: stdDev(arr),
    rmssd: ibis.length > 1 ? Math.sqrt(acc / (ibis.length - 1)) : 0,
  };
}

/* ---------------------------------------------------------------------------
   7. FRAME ANALYSIS
   ------------------------------------------------------------------------ */

/**
 * Broad RGB skin-tone test (Kovac et al., uniform daylight rule).
 *
 * @param {number} r 0..255
 * @param {number} g 0..255
 * @param {number} b 0..255
 * @returns {boolean}
 */
export function isSkinPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 60 && g > 30 && b > 15 && max - min > 12 && r > g && r >= b - 4;
}

/**
 * Region of interest for a capture mode, in pixels.
 *
 * Face mode targets the forehead when a detector supplies a face box, since
 * it is the least occluded, best-perfused patch that stays still while the
 * subject talks or blinks. Without a detector it falls back to a centred box
 * matching the on-screen alignment guide.
 *
 * @param {'face'|'finger'} mode
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {{x: number, y: number, width: number, height: number}} [face]
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function roiForMode(mode, width, height, face) {
  if (mode === 'finger') {
    return {
      x: Math.round(width * 0.25),
      y: Math.round(height * 0.25),
      width: Math.round(width * 0.5),
      height: Math.round(height * 0.5),
    };
  }
  if (face && face.width > 0 && face.height > 0) {
    return {
      x: Math.round(face.x + face.width * 0.25),
      y: Math.round(face.y + face.height * 0.08),
      width: Math.round(face.width * 0.5),
      height: Math.round(face.height * 0.22),
    };
  }
  return {
    x: Math.round(width * 0.33),
    y: Math.round(height * 0.2),
    width: Math.round(width * 0.34),
    height: Math.round(height * 0.28),
  };
}

/**
 * Mean RGB over a region, optionally restricted to skin-like pixels.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{skinOnly?: boolean, step?: number}} [options]
 * @returns {{r: number, g: number, b: number, brightness: number,
 *            pixels: number, skinFraction: number, clippedFraction: number}}
 */
export function meanRgbInRegion(image, rect, options = {}) {
  const step = Math.max(1, Math.floor(options.step ?? 1));
  const skinOnly = options.skinOnly ?? true;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(image.width, Math.floor(rect.x + rect.width));
  const y1 = Math.min(image.height, Math.floor(rect.y + rect.height));

  let sumR = 0; let sumG = 0; let sumB = 0;
  let allR = 0; let allG = 0; let allB = 0;
  let skinCount = 0; let total = 0; let clipped = 0;

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i];
      const g = image.data[i + 1];
      const b = image.data[i + 2];
      total += 1;
      allR += r; allG += g; allB += b;
      if (r >= 253 || g >= 253 || b >= 253) clipped += 1;
      if (isSkinPixel(r, g, b)) {
        skinCount += 1;
        sumR += r; sumG += g; sumB += b;
      }
    }
  }
  if (total === 0) {
    return { r: 0, g: 0, b: 0, brightness: 0, pixels: 0, skinFraction: 0, clippedFraction: 0 };
  }
  const skinFraction = skinCount / total;
  // Fall back to every pixel when the skin rule rejects most of the region —
  // deep skin tones under warm light, or a fingertip lit by the torch.
  const useSkin = skinOnly && skinFraction >= 0.15;
  const count = useSkin ? skinCount : total;
  const r = (useSkin ? sumR : allR) / count;
  const g = (useSkin ? sumG : allG) / count;
  const b = (useSkin ? sumB : allB) / count;
  return {
    r,
    g,
    b,
    brightness: (r + g + b) / 3,
    pixels: count,
    skinFraction,
    clippedFraction: clipped / total,
  };
}

/**
 * Normalised mean absolute difference between two downsampled luma frames.
 *
 * @param {ArrayLike<number>|null} previous
 * @param {ArrayLike<number>} current
 * @returns {number} 0 when identical, ~1 for a full-scale change.
 */
export function frameMotion(previous, current) {
  if (!previous || previous.length !== current.length || !current.length) return 0;
  let acc = 0;
  for (let i = 0; i < current.length; i += 1) acc += Math.abs(current[i] - previous[i]);
  return acc / current.length / 255;
}

/**
 * Turn frame statistics into a capture-quality score and a corrective hint.
 *
 * @param {{brightness?: number, clippedFraction?: number, motion?: number,
 *          skinFraction?: number, snrDb?: number, mode?: 'face'|'finger'}} stats
 * @returns {{score: number, hint: string, level: 'good'|'fair'|'poor'}}
 */
export function assessQuality(stats = {}) {
  const mode = stats.mode ?? 'face';
  const brightness = stats.brightness ?? 0;
  const motion = stats.motion ?? 0;
  const clipped = stats.clippedFraction ?? 0;
  const skin = stats.skinFraction ?? 1;

  let score = 1;
  let hint = mode === 'finger' ? 'Hold steady — reading' : 'Hold still — reading';

  if (brightness < 45) {
    score = Math.min(score, 0.2);
    hint = mode === 'finger' ? 'Too dark — turn the torch on' : 'Too dark — face a light source';
  } else if (brightness > 235 || clipped > 0.35) {
    score = Math.min(score, 0.3);
    hint = mode === 'finger' ? 'Overexposed — ease off the lens' : 'Overexposed — move out of direct light';
  }
  if (mode === 'face' && skin < 0.12) {
    score = Math.min(score, 0.35);
    hint = 'No face detected — centre your face in the guide';
  }
  if (motion > 0.06) {
    score = Math.min(score, 0.25);
    hint = mode === 'finger' ? 'Finger moving — rest it on the lens' : 'Too much movement — hold still';
  } else if (motion > 0.03) {
    score = Math.min(score, 0.6);
    hint = 'Slight movement detected';
  }
  if (Number.isFinite(stats.snrDb)) {
    score = Math.min(score, clamp01((stats.snrDb + 2) / 14) * 0.4 + 0.6);
  }
  const level = score >= 0.7 ? 'good' : score >= 0.4 ? 'fair' : 'poor';
  return { score, hint, level };
}

/**
 * Plain-language band for a resting rate, per adult reference ranges.
 * Descriptive only — this is not a diagnosis.
 *
 * @param {number} bpm
 * @returns {{label: string, tone: 'low'|'normal'|'high'}}
 */
export function classifyRate(bpm) {
  if (!Number.isFinite(bpm)) return { label: 'no reading', tone: 'normal' };
  if (bpm < 60) return { label: 'below typical resting range', tone: 'low' };
  if (bpm > 100) return { label: 'above typical resting range', tone: 'high' };
  return { label: 'typical resting range', tone: 'normal' };
}

/* ---------------------------------------------------------------------------
   8. PIPELINE
   ------------------------------------------------------------------------ */

/**
 * Run the full estimate over a buffered capture session.
 *
 * @param {ReturnType<typeof createSampleBuffer>} buffer
 * @param {{mode?: 'face'|'finger', fs?: number, minBpm?: number,
 *          maxBpm?: number, minWindowSeconds?: number,
 *          maxWindowSeconds?: number}} [options]
 * @returns {{status: 'acquiring'|'ready', progress: number, bpm?: number,
 *            confidence?: number, snrDb?: number, waveform?: Float64Array,
 *            spectrum?: object, variability?: object|null, fs?: number}}
 */
export function analyzeBuffer(buffer, options = {}) {
  const fs = options.fs ?? ANALYSIS_HZ;
  const mode = options.mode ?? 'face';
  const minWindow = options.minWindowSeconds ?? MIN_WINDOW_SECONDS;
  const maxWindow = options.maxWindowSeconds ?? MAX_WINDOW_SECONDS;
  const span = buffer.spanSeconds();
  const progress = clamp01(span / minWindow);
  if (span < minWindow || buffer.size() < fs * 2) return { status: 'acquiring', progress };

  const series = buffer.series();
  const cutoff = series.t[series.length - 1] - maxWindow;
  let start = 0;
  while (start < series.length - 1 && series.t[start] < cutoff) start += 1;

  const t = series.t.subarray(start);
  const rgb = {
    r: resampleUniform(t, series.r.subarray(start), fs),
    g: resampleUniform(t, series.g.subarray(start), fs),
    b: resampleUniform(t, series.b.subarray(start), fs),
  };
  const raw = pulseSignal(rgb, fs, mode);
  const estimate = estimateRate(raw, fs, options);
  if (!estimate) return { status: 'acquiring', progress };

  const minBpm = options.minBpm ?? DEFAULT_MIN_BPM;
  const maxBpm = options.maxBpm ?? DEFAULT_MAX_BPM;
  const waveform = bandpass(raw, fs, minBpm / 60, maxBpm / 60);
  const variability = intervalStats(detectPeaks(waveform, fs, { maxBpm }), fs);

  return {
    status: 'ready',
    progress: 1,
    fs,
    bpm: estimate.bpm,
    confidence: estimate.confidence,
    snrDb: estimate.snrDb,
    waveform,
    spectrum: estimate.spectrum,
    variability,
  };
}
