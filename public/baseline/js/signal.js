/**
 * Signal processing for camera photoplethysmography.
 *
 * A camera pointed at a face is a very bad optical sensor with one redeeming
 * property: blood absorbs green light, so every heartbeat darkens the skin by
 * roughly half a percent. That pulse is buried under lighting flicker, head
 * motion, sensor noise and the camera's own auto-exposure fighting back — all
 * of which are larger than the signal. Everything in this module exists to
 * pull a 0.7–4 Hz oscillation out from under interference that outweighs it.
 *
 * Nothing here touches the DOM or the camera, which is the point: the maths is
 * driven from Node against synthetic waveforms whose true frequency is known
 * exactly, so a regression in the estimator fails a test rather than quietly
 * reporting a plausible-looking heart rate.
 *
 * @module baseline/signal
 */

/**
 * Arithmetic mean.
 *
 * @param {ArrayLike<number>} series Samples.
 * @returns {number} Mean, or 0 for an empty series.
 */
export function mean(series) {
  if (!series.length) return 0;
  let total = 0;
  for (let i = 0; i < series.length; i += 1) total += series[i];
  return total / series.length;
}

/**
 * Sample standard deviation.
 *
 * @param {ArrayLike<number>} series Samples.
 * @param {number} [average] Precomputed mean, when the caller already has one.
 * @returns {number} Standard deviation, or 0 for fewer than two samples.
 */
export function standardDeviation(series, average = mean(series)) {
  if (series.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < series.length; i += 1) {
    const d = series[i] - average;
    total += d * d;
  }
  return Math.sqrt(total / (series.length - 1));
}

/**
 * Median of a series.
 *
 * @param {ArrayLike<number>} series Samples.
 * @returns {number} Median, or 0 for an empty series.
 */
export function median(series) {
  if (!series.length) return 0;
  const sorted = Array.from(series).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median absolute deviation, scaled to be comparable with a standard deviation.
 *
 * Baselines are built from a handful of readings, and one bad scan — a phone
 * knocked mid-measurement, a scan taken straight after climbing stairs — would
 * drag a mean and inflate an SD enough to make the next week's readings look
 * normal. The MAD ignores it.
 *
 * @param {ArrayLike<number>} series Samples.
 * @param {number} [centre] Precomputed median.
 * @returns {number} Scaled MAD (×1.4826), the robust analogue of an SD.
 */
export function medianAbsoluteDeviation(series, centre = median(series)) {
  if (!series.length) return 0;
  const deviations = Array.from(series, (value) => Math.abs(value - centre));
  return median(deviations) * 1.4826;
}

/**
 * Centred moving average with clamped edges.
 *
 * @param {ArrayLike<number>} series Samples.
 * @param {number} window Window length in samples; forced odd and >= 1.
 * @returns {Float64Array} Smoothed series, same length as the input.
 */
export function movingAverage(series, window) {
  const n = series.length;
  const out = new Float64Array(n);
  const w = Math.max(1, Math.round(window) | 1);
  const half = (w - 1) / 2;
  if (!n) return out;
  for (let i = 0; i < n; i += 1) {
    let total = 0;
    for (let k = -half; k <= half; k += 1) {
      const j = Math.min(n - 1, Math.max(0, i + k));
      total += series[j];
    }
    out[i] = total / w;
  }
  return out;
}

/**
 * Remove slow drift by subtracting a moving average.
 *
 * The drift being removed is real and large: auto-exposure hunting, a cloud
 * crossing a window, the subject slowly leaning in. It lives below the lowest
 * plausible heart rate, so a window a little longer than one beat removes it
 * without touching the pulse.
 *
 * @param {ArrayLike<number>} series Samples.
 * @param {number} window Detrend window in samples.
 * @returns {Float64Array} Zero-mean series.
 */
export function detrend(series, window) {
  const baseline = movingAverage(series, window);
  const out = new Float64Array(series.length);
  for (let i = 0; i < series.length; i += 1) out[i] = series[i] - baseline[i];
  return out;
}

/**
 * Scale a series to zero mean and unit variance.
 *
 * @param {ArrayLike<number>} series Samples.
 * @returns {Float64Array} Standardized series; all zeros if the input is flat.
 */
export function normalize(series) {
  const average = mean(series);
  const sd = standardDeviation(series, average);
  const out = new Float64Array(series.length);
  if (sd < 1e-12) return out;
  for (let i = 0; i < series.length; i += 1) out[i] = (series[i] - average) / sd;
  return out;
}

/**
 * Resample irregularly timed samples onto a uniform grid.
 *
 * Browsers do not deliver camera frames on a metronome: `requestAnimationFrame`
 * drifts, a garbage collection pause drops three frames, and thermal throttling
 * quietly halves the rate mid-scan. Spectral analysis assumes a fixed interval,
 * so treating frame index as time is how a 62 bpm subject gets reported at 71.
 *
 * @param {ArrayLike<number>} values Sample values.
 * @param {ArrayLike<number>} times Sample timestamps in milliseconds, ascending.
 * @param {number} hz Target sample rate.
 * @returns {{values: Float64Array, hz: number, startMs: number, durationSec: number}}
 *   Uniformly spaced series. Empty when there is nothing to interpolate.
 */
export function resampleUniform(values, times, hz) {
  const n = Math.min(values.length, times.length);
  const empty = { values: new Float64Array(0), hz, startMs: 0, durationSec: 0 };
  if (n < 2 || !(hz > 0)) return empty;

  const startMs = times[0];
  const spanSec = (times[n - 1] - startMs) / 1000;
  if (!(spanSec > 0)) return empty;

  const count = Math.floor(spanSec * hz) + 1;
  const out = new Float64Array(count);
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const t = startMs + (i / hz) * 1000;
    while (cursor < n - 2 && times[cursor + 1] < t) cursor += 1;
    const t0 = times[cursor];
    const t1 = times[cursor + 1];
    const span = t1 - t0;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - t0) / span)) : 0;
    out[i] = values[cursor] * (1 - alpha) + values[cursor + 1] * alpha;
  }
  return { values: out, hz, startMs, durationSec: (count - 1) / hz };
}

/**
 * Hamming window coefficients.
 *
 * @param {number} n Window length.
 * @returns {Float64Array} Coefficients.
 */
export function hammingWindow(n) {
  const out = new Float64Array(n);
  if (n === 1) {
    out[0] = 1;
    return out;
  }
  for (let i = 0; i < n; i += 1) out[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  return out;
}

/**
 * Zero-phase windowed-sinc band-pass filter.
 *
 * The kernel is symmetric and applied centred, so peaks come out where they
 * went in. That matters more than the stopband: beat-to-beat intervals are the
 * whole basis of the HRV reading, and a filter that shifts peaks by a variable
 * amount manufactures variability that the heart never produced.
 *
 * @param {ArrayLike<number>} series Samples.
 * @param {number} hz Sample rate.
 * @param {number} lowHz Lower cutoff.
 * @param {number} highHz Upper cutoff.
 * @param {number} [taps=127] Kernel length; forced odd.
 * @returns {Float64Array} Filtered series, same length as the input.
 */
export function bandpassFir(series, hz, lowHz, highHz, taps = 127) {
  const n = series.length;
  const out = new Float64Array(n);
  if (!n) return out;

  const length = Math.max(3, Math.min(n | 1, Math.round(taps) | 1));
  const half = (length - 1) / 2;
  const fLow = Math.max(0, lowHz / hz);
  const fHigh = Math.min(0.5, highHz / hz);
  const window = hammingWindow(length);
  const kernel = new Float64Array(length);

  let gain = 0;
  for (let i = 0; i < length; i += 1) {
    const k = i - half;
    // sinc(2f·k) with the removable singularity at k = 0 filled in by hand.
    const hiPass = k === 0 ? 2 * fHigh : Math.sin(2 * Math.PI * fHigh * k) / (Math.PI * k);
    const loPass = k === 0 ? 2 * fLow : Math.sin(2 * Math.PI * fLow * k) / (Math.PI * k);
    kernel[i] = (hiPass - loPass) * window[i];
    gain += Math.abs(kernel[i]);
  }
  if (gain > 0) for (let i = 0; i < length; i += 1) kernel[i] /= gain / 2;

  for (let i = 0; i < n; i += 1) {
    let total = 0;
    for (let k = 0; k < length; k += 1) {
      // Reflect at the edges: zero padding would ring, and clamping would drag
      // the first and last beat toward the mean.
      let j = i + k - half;
      if (j < 0) j = -j;
      if (j >= n) j = 2 * (n - 1) - j;
      if (j < 0) j = 0;
      total += series[j] * kernel[k];
    }
    out[i] = total;
  }
  return out;
}

/**
 * Power spectrum over a frequency band, by direct evaluation.
 *
 * A full FFT would resolve nothing useful here: a 30-second scan gives 0.033 Hz
 * bins, which is 2 bpm — coarse enough to matter. Evaluating the transform
 * directly at whatever resolution is asked for costs nothing at these lengths
 * and puts the bin spacing under the caller's control.
 *
 * @param {ArrayLike<number>} series Samples, ideally already detrended.
 * @param {number} hz Sample rate.
 * @param {object} [band] Band options.
 * @param {number} [band.minHz=0.7] Lowest frequency evaluated.
 * @param {number} [band.maxHz=4] Highest frequency evaluated.
 * @param {number} [band.stepHz=0.005] Bin spacing.
 * @returns {{freqs: Float64Array, power: Float64Array, hz: number}} Spectrum.
 */
export function powerSpectrum(series, hz, band = {}) {
  const { minHz = 0.7, maxHz = 4, stepHz = 0.005 } = band;
  const n = series.length;
  const bins = Math.max(1, Math.round((maxHz - minHz) / stepHz) + 1);
  const freqs = new Float64Array(bins);
  const power = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) freqs[i] = minHz + i * stepHz;
  if (n < 4) return { freqs, power, hz };

  // Window first: a scan is an arbitrary slice of an ongoing signal, and the
  // discontinuity at its ends smears energy across the whole band.
  const window = hammingWindow(n);
  const windowed = new Float64Array(n);
  const average = mean(series);
  for (let i = 0; i < n; i += 1) windowed[i] = (series[i] - average) * window[i];

  for (let b = 0; b < bins; b += 1) {
    const omega = (2 * Math.PI * freqs[b]) / hz;
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i += 1) {
      re += windowed[i] * Math.cos(omega * i);
      im += windowed[i] * Math.sin(omega * i);
    }
    power[b] = (re * re + im * im) / (n * n);
  }
  return { freqs, power, hz };
}

/**
 * Strongest frequency in a spectrum, refined by parabolic interpolation.
 *
 * @param {{freqs: ArrayLike<number>, power: ArrayLike<number>}} spectrum Spectrum.
 * @returns {{hz: number, power: number, index: number}} Peak location; `hz` is 0
 *   when the spectrum carries no energy.
 */
export function dominantFrequency(spectrum) {
  const { freqs, power } = spectrum;
  let index = -1;
  let best = 0;
  for (let i = 0; i < power.length; i += 1) {
    if (power[i] > best) {
      best = power[i];
      index = i;
    }
  }
  if (index < 0) return { hz: 0, power: 0, index: -1 };

  let hz = freqs[index];
  if (index > 0 && index < power.length - 1) {
    const y0 = power[index - 1];
    const y1 = power[index];
    const y2 = power[index + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-18) {
      const offset = (0.5 * (y0 - y2)) / denom;
      if (Math.abs(offset) <= 1) hz = freqs[index] + offset * (freqs[1] - freqs[0]);
    }
  }
  return { hz, power: best, index };
}

/**
 * Total power in a frequency range.
 *
 * @param {{freqs: ArrayLike<number>, power: ArrayLike<number>}} spectrum Spectrum.
 * @param {number} lowHz Range start.
 * @param {number} highHz Range end.
 * @returns {number} Summed power.
 */
export function bandPower(spectrum, lowHz, highHz) {
  let total = 0;
  for (let i = 0; i < spectrum.freqs.length; i += 1) {
    const f = spectrum.freqs[i];
    if (f >= lowHz && f <= highHz) total += spectrum.power[i];
  }
  return total;
}

/**
 * Signal-to-noise ratio of a pulse peak, in decibels.
 *
 * This is the standard photoplethysmography quality measure: energy inside a
 * narrow window around the candidate rate and its first harmonic, against
 * everything else in the band. A real pulse is periodic, so it puts energy in
 * both; motion is broadband and puts energy everywhere. It is what lets the app
 * say "I could not read that" instead of reporting the largest bump in a
 * spectrum made entirely of noise.
 *
 * @param {{freqs: ArrayLike<number>, power: ArrayLike<number>}} spectrum Spectrum.
 * @param {number} peakHz Candidate pulse frequency.
 * @param {number} [widthHz=0.12] Half-width of the signal window.
 * @returns {number} SNR in dB; -30 when the band is empty.
 */
export function spectralSnrDb(spectrum, peakHz, widthHz = 0.12) {
  if (!(peakHz > 0)) return -30;
  let signal = 0;
  let total = 0;
  for (let i = 0; i < spectrum.freqs.length; i += 1) {
    const f = spectrum.freqs[i];
    const p = spectrum.power[i];
    total += p;
    if (Math.abs(f - peakHz) <= widthHz || Math.abs(f - 2 * peakHz) <= widthHz) signal += p;
  }
  const noise = total - signal;
  if (total <= 0) return -30;
  if (noise <= 1e-18) return 30;
  return Math.max(-30, Math.min(30, 10 * Math.log10(signal / noise)));
}

/**
 * Locate peaks in a filtered waveform.
 *
 * @param {ArrayLike<number>} series Band-passed samples.
 * @param {number} hz Sample rate.
 * @param {object} [options] Detection options.
 * @param {number} [options.minSpacingSec=0.33] Refractory period; 0.33 s caps
 *   detection at 180 bpm and stops the dicrotic notch counting as a beat.
 * @param {number} [options.threshold=0.25] Minimum height, in standard
 *   deviations of the series.
 * @returns {number[]} Peak sample indices, ascending.
 */
export function findPeaks(series, hz, options = {}) {
  const { minSpacingSec = 0.33, threshold = 0.25 } = options;
  const peaks = [];
  const n = series.length;
  if (n < 3) return peaks;

  const sd = standardDeviation(series);
  const floor = sd * threshold;
  const spacing = Math.max(1, Math.round(minSpacingSec * hz));

  for (let i = 1; i < n - 1; i += 1) {
    if (!(series[i] > series[i - 1] && series[i] >= series[i + 1])) continue;
    if (series[i] < floor) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && i - last < spacing) {
      // Two candidates inside one refractory period: keep the taller.
      if (series[i] > series[last]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

/**
 * Refine peak positions to sub-sample precision.
 *
 * At 30 frames per second, a peak located to the nearest frame is only known to
 * ±17 ms — and RMSSD, the number the coach reads, is often 25 ms. Quantization
 * alone would therefore manufacture most of the variability. Fitting a parabola
 * through the peak and its neighbours recovers the vertex between samples and
 * drops that floor to a few milliseconds.
 *
 * @param {ArrayLike<number>} series Band-passed samples.
 * @param {number} hz Sample rate.
 * @param {ArrayLike<number>} peaks Peak sample indices.
 * @returns {number[]} Peak times in seconds from the start of the series.
 */
export function refinePeakTimes(series, hz, peaks) {
  const out = [];
  for (let k = 0; k < peaks.length; k += 1) {
    const i = peaks[k];
    let offset = 0;
    if (i > 0 && i < series.length - 1) {
      const y0 = series[i - 1];
      const y1 = series[i];
      const y2 = series[i + 1];
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-18) {
        const shift = (0.5 * (y0 - y2)) / denom;
        if (Math.abs(shift) <= 1) offset = shift;
      }
    }
    out.push((i + offset) / hz);
  }
  return out;
}

/**
 * Inter-beat intervals from refined peak times.
 *
 * @param {ArrayLike<number>} times Peak times in seconds.
 * @returns {number[]} Intervals in milliseconds.
 */
export function intervalsFromTimes(times) {
  const out = [];
  for (let i = 1; i < times.length; i += 1) out.push((times[i] - times[i - 1]) * 1000);
  return out;
}

/**
 * Convert peak indices to inter-beat intervals.
 *
 * @param {ArrayLike<number>} peaks Peak sample indices.
 * @param {number} hz Sample rate.
 * @returns {number[]} Intervals in milliseconds.
 */
export function intervalsFromPeaks(peaks, hz) {
  const out = [];
  for (let i = 1; i < peaks.length; i += 1) out.push(((peaks[i] - peaks[i - 1]) / hz) * 1000);
  return out;
}

/**
 * Drop intervals that cannot be consecutive beats.
 *
 * A missed peak doubles an interval and a spurious one halves it; either would
 * inflate RMSSD by an order of magnitude, which is exactly the direction that
 * makes a tired user look well recovered.
 *
 * @param {ArrayLike<number>} intervals Intervals in milliseconds.
 * @param {number} [tolerance=0.25] Allowed fractional jump from the running median.
 * @returns {number[]} Retained intervals.
 */
export function cleanIntervals(intervals, tolerance = 0.25) {
  if (intervals.length < 3) return Array.from(intervals);
  const centre = median(intervals);
  if (!(centre > 0)) return [];
  return Array.from(intervals).filter((value) => {
    if (value < 300 || value > 2000) return false;
    return Math.abs(value - centre) / centre <= tolerance;
  });
}

/**
 * Root mean square of successive interval differences.
 *
 * RMSSD is the short-window HRV measure that tracks parasympathetic (rest and
 * digest) activity, which is why it is the one worth reading before training.
 *
 * @param {ArrayLike<number>} intervals Intervals in milliseconds.
 * @returns {number} RMSSD in milliseconds, or 0 with fewer than three intervals.
 */
export function rmssd(intervals) {
  if (intervals.length < 3) return 0;
  let total = 0;
  for (let i = 1; i < intervals.length; i += 1) {
    const d = intervals[i] - intervals[i - 1];
    total += d * d;
  }
  return Math.sqrt(total / (intervals.length - 1));
}

/**
 * Standard deviation of inter-beat intervals.
 *
 * @param {ArrayLike<number>} intervals Intervals in milliseconds.
 * @returns {number} SDNN in milliseconds.
 */
export function sdnn(intervals) {
  return standardDeviation(intervals);
}

/**
 * Clamp a value into a range.
 *
 * @param {number} value Value.
 * @param {number} low Lower bound.
 * @param {number} high Upper bound.
 * @returns {number} Clamped value.
 */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Map a value from one range onto another, clamped at both ends.
 *
 * @param {number} value Value.
 * @param {number} inLow Input range start.
 * @param {number} inHigh Input range end.
 * @param {number} outLow Output range start.
 * @param {number} outHigh Output range end.
 * @returns {number} Mapped value.
 */
export function remap(value, inLow, inHigh, outLow, outHigh) {
  if (inHigh === inLow) return outLow;
  const t = clamp((value - inLow) / (inHigh - inLow), 0, 1);
  return outLow + t * (outHigh - outLow);
}
