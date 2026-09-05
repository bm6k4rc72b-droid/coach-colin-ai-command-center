/**
 * Turning a stream of skin colour samples into cardiovascular readings.
 *
 * The camera contributes three numbers per frame — the mean red, green and blue
 * of the skin the app can see — and this module turns a scan's worth of them
 * into a pulse rate, a beat-to-beat variability figure, a breathing rate and,
 * most importantly, an honest account of how much any of it can be trusted.
 *
 * The colour mixing is POS — plane-orthogonal-to-skin (Wang et al., 2017) —
 * with CHROM (de Haan & Jeanne, 2013) as a second opinion. Green alone carries
 * the strongest pulse but also the strongest motion artefact, because a head
 * that moves changes how much light every channel receives, roughly equally.
 * Both of these methods project the three channels onto combinations in which
 * that shared intensity term is zero by construction, so a rocking chair or a
 * passing shadow contributes nothing while the pulse survives. It is a few
 * lines of arithmetic and it is the difference between a reading that survives
 * a fidget and one that does not.
 *
 * @module baseline/vitals
 */

import {
  bandpassFir,
  clamp,
  cleanIntervals,
  detrend,
  dominantFrequency,
  findPeaks,
  intervalsFromTimes,
  mean,
  median,
  normalize,
  powerSpectrum,
  refinePeakTimes,
  remap,
  resampleUniform,
  rmssd,
  sdnn,
  spectralSnrDb,
  standardDeviation,
} from './signal.js';

/** Working sample rate for every derived series, in hertz. */
export const ANALYSIS_HZ = 30;

/** Plausible human pulse band, in hertz (36–180 bpm). */
export const PULSE_BAND = Object.freeze({ minHz: 0.6, maxHz: 3.0 });

/**
 * Peak prominence a breathing estimate must clear, in decibels.
 *
 * Calibrated against the synthetic subjects: a rate modulation of 1.5 per cent
 * or more — the shallow end of real respiratory sinus arrhythmia — clears it,
 * while a metronomic pulse with no breathing modulation at all sits nearly two
 * decibels below. Under the floor the app shows a dash instead of the largest
 * bump in a spectrum made of noise.
 */
export const BREATH_SNR_FLOOR = -2;

/** Plausible resting respiration band, in hertz (4.8–30 breaths/min). */
export const BREATH_BAND = Object.freeze({ minHz: 0.08, maxHz: 0.5 });

/**
 * Combine RGB traces into a single pulse waveform using POS.
 *
 * Two projections are taken of the temporally normalized channels:
 * `S1 = G − B` and `S2 = G + B − 2R`. Any distortion that scales all three
 * channels together — the subject leaning toward the lamp, auto-exposure
 * stepping, a cloud — cancels in both, exactly. The pulse does not, because
 * haemoglobin absorbs the three bands differently. The two projections are then
 * added with a weight that equalizes their energy, which is the step that makes
 * POS additive where CHROM is subtractive: a pulse that lands the same way in
 * both reinforces instead of cancelling.
 *
 * The projection is recomputed over a sliding window and overlap-added, so a
 * slow change in skin tone or lighting over a 60-second scan cannot bias the
 * normalization for the whole trace.
 *
 * @param {{r: ArrayLike<number>, g: ArrayLike<number>, b: ArrayLike<number>}} traces
 *   Per-frame channel means, already resampled onto a uniform grid.
 * @param {number} hz Sample rate.
 * @param {number} [windowSec=1.6] Sliding window length; long enough to hold a
 *   slow heartbeat, short enough to track drifting light.
 * @returns {Float64Array} Pulse waveform, band-passed and standardized.
 */
export function posWaveform(traces, hz, windowSec = 1.6) {
  const n = Math.min(traces.r.length, traces.g.length, traces.b.length);
  if (n < hz * 2) return new Float64Array(0);

  const span = Math.max(8, Math.round(windowSec * hz));
  const out = new Float64Array(n);
  const s1 = new Float64Array(span);
  const s2 = new Float64Array(span);

  for (let end = span; end <= n; end += 1) {
    const start = end - span;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (let i = start; i < end; i += 1) {
      rSum += traces.r[i];
      gSum += traces.g[i];
      bSum += traces.b[i];
    }
    const rMean = Math.max(1e-6, rSum / span);
    const gMean = Math.max(1e-6, gSum / span);
    const bMean = Math.max(1e-6, bSum / span);

    for (let i = 0; i < span; i += 1) {
      const rn = traces.r[start + i] / rMean;
      const gn = traces.g[start + i] / gMean;
      const bn = traces.b[start + i] / bMean;
      s1[i] = gn - bn;
      s2[i] = gn + bn - 2 * rn;
    }

    const sd1 = standardDeviation(s1);
    const sd2 = standardDeviation(s2);
    const alpha = sd2 > 1e-12 ? sd1 / sd2 : 0;
    let windowMean = 0;
    for (let i = 0; i < span; i += 1) windowMean += s1[i] + alpha * s2[i];
    windowMean /= span;
    for (let i = 0; i < span; i += 1) out[start + i] += s1[i] + alpha * s2[i] - windowMean;
  }

  return normalize(bandpassFir(out, hz, PULSE_BAND.minHz, PULSE_BAND.maxHz, 121));
}

/**
 * Combine RGB traces into a single pulse waveform using CHROM.
 *
 * @param {{r: ArrayLike<number>, g: ArrayLike<number>, b: ArrayLike<number>}} traces
 *   Per-frame channel means, already resampled onto a uniform grid.
 * @param {number} hz Sample rate.
 * @returns {Float64Array} Pulse waveform, band-passed and standardized.
 */
export function chromWaveform(traces, hz) {
  const n = Math.min(traces.r.length, traces.g.length, traces.b.length);
  if (n < hz * 2) return new Float64Array(0);

  // Per-channel temporal normalization removes the subject's skin tone and the
  // colour of the room, leaving only how each channel *varies*.
  const rMean = Math.max(1e-6, mean(traces.r));
  const gMean = Math.max(1e-6, mean(traces.g));
  const bMean = Math.max(1e-6, mean(traces.b));

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const rn = traces.r[i] / rMean;
    const gn = traces.g[i] / gMean;
    const bn = traces.b[i] / bMean;
    x[i] = 3 * rn - 2 * gn;
    y[i] = 1.5 * rn + gn - 1.5 * bn;
  }

  const xf = bandpassFir(x, hz, PULSE_BAND.minHz, PULSE_BAND.maxHz, 121);
  const yf = bandpassFir(y, hz, PULSE_BAND.minHz, PULSE_BAND.maxHz, 121);
  const sx = standardDeviation(xf);
  const sy = standardDeviation(yf);
  const alpha = sy > 1e-12 ? sx / sy : 0;

  const s = new Float64Array(n);
  for (let i = 0; i < n; i += 1) s[i] = xf[i] - alpha * yf[i];
  return normalize(s);
}

/**
 * Green-channel fallback waveform.
 *
 * Used when the colour balance is degenerate — a monochrome or heavily
 * white-balanced feed can leave CHROM with nothing to subtract.
 *
 * @param {ArrayLike<number>} green Green channel means.
 * @param {number} hz Sample rate.
 * @returns {Float64Array} Pulse waveform, band-passed and standardized.
 */
export function greenWaveform(green, hz) {
  if (green.length < hz * 2) return new Float64Array(0);
  // Inverted, so a peak is a beat: more blood in the skin means *less*
  // reflected green.
  const inverted = Float64Array.from(green, (value) => -value);
  return normalize(bandpassFir(detrend(inverted, Math.round(hz) | 1),
    hz, PULSE_BAND.minHz, PULSE_BAND.maxHz, 121));
}

/**
 * Estimate pulse rate across overlapping sub-windows.
 *
 * One estimate over the whole scan hides its own instability. Three overlapping
 * windows that agree are a genuinely different claim from three that scatter,
 * and the scatter is reported rather than averaged away.
 *
 * @param {ArrayLike<number>} waveform Pulse waveform.
 * @param {number} hz Sample rate.
 * @returns {{bpm: number, spreadBpm: number, windows: number[]}} Windowed estimates.
 */
export function windowedRate(waveform, hz) {
  const n = waveform.length;
  const windows = [];
  const size = Math.floor(n / 2);
  if (size >= hz * 6) {
    for (const start of [0, Math.floor((n - size) / 2), n - size]) {
      const slice = waveform.slice(start, start + size);
      const spectrum = powerSpectrum(slice, hz, { ...PULSE_BAND, stepHz: 0.005 });
      const peak = dominantFrequency(spectrum);
      if (peak.hz > 0) windows.push(peak.hz * 60);
    }
  }
  if (!windows.length) return { bpm: 0, spreadBpm: 0, windows };
  const centre = median(windows);
  const spread = Math.max(...windows.map((value) => Math.abs(value - centre)));
  return { bpm: centre, spreadBpm: spread, windows };
}

/**
 * Estimate breathing rate from respiratory sinus arrhythmia.
 *
 * The heart speeds up on the inhale and slows on the exhale, so the sequence of
 * beat intervals is itself a breathing trace. Reading breath this way rather
 * than from chest movement is what allows the app to keep working when the
 * subject is a head and shoulders in a phone frame.
 *
 * @param {ArrayLike<number>} beatTimes Beat times in seconds.
 * @param {ArrayLike<number>} intervals Inter-beat intervals in milliseconds.
 * @returns {{breathsPerMin: number, power: number}} Estimate; rate is 0 when
 *   there are too few beats to say anything.
 */
export function respirationFromIntervals(beatTimes, intervals) {
  if (intervals.length < 12) return { breathsPerMin: 0, power: 0 };
  // The interval series is sampled at the beats, which are themselves irregular:
  // resample onto an even 4 Hz grid before looking for a breathing rhythm.
  const times = [];
  for (let i = 1; i < beatTimes.length && i <= intervals.length; i += 1) {
    times.push(beatTimes[i] * 1000);
  }
  const resampled = resampleUniform(intervals.slice(0, times.length), times, 4);
  if (resampled.values.length < 16) return { breathsPerMin: 0, power: 0 };

  const detrended = detrend(resampled.values, 17);
  const spectrum = powerSpectrum(detrended, 4, { ...BREATH_BAND, stepHz: 0.002 });
  const peak = dominantFrequency(spectrum);
  if (!(peak.hz > 0)) return { breathsPerMin: 0, power: 0, snrDb: -30 };
  // Beat intervals always have *some* slow structure, so the largest bump in
  // the breathing band exists whether or not the subject's heart is following
  // their breath. Without a prominent peak there is no breathing rate to
  // report, and reporting one anyway would be inventing a vital sign.
  const snrDb = spectralSnrDb(spectrum, peak.hz, 0.03);
  if (snrDb < BREATH_SNR_FLOOR) return { breathsPerMin: 0, power: peak.power, snrDb };
  return { breathsPerMin: peak.hz * 60, power: peak.power, snrDb };
}

/**
 * Estimate breathing rate from slow intensity drift.
 *
 * Fallback for short scans: breathing moves the head and the chest slightly, and
 * that shows up below the pulse band.
 *
 * @param {ArrayLike<number>} luma Frame luminance means, resampled.
 * @param {number} hz Sample rate.
 * @returns {{breathsPerMin: number, power: number}} Estimate.
 */
export function respirationFromBaseband(luma, hz) {
  if (luma.length < hz * 12) return { breathsPerMin: 0, power: 0 };
  const filtered = bandpassFir(luma, hz, BREATH_BAND.minHz, BREATH_BAND.maxHz, 181);
  // A trace with no slow content at all — a perfectly steady frame — leaves
  // only floating-point residue, whose ratios are meaningless. Rule it out
  // before the ratio test, which would otherwise find a beautiful peak in it.
  if (standardDeviation(filtered) < 1e-3) return { breathsPerMin: 0, power: 0, snrDb: -30 };
  const spectrum = powerSpectrum(filtered, hz, { ...BREATH_BAND, stepHz: 0.002 });
  const peak = dominantFrequency(spectrum);
  if (!(peak.hz > 0)) return { breathsPerMin: 0, power: 0, snrDb: -30 };
  const snrDb = spectralSnrDb(spectrum, peak.hz, 0.03);
  if (snrDb < BREATH_SNR_FLOOR) return { breathsPerMin: 0, power: peak.power, snrDb };
  return { breathsPerMin: peak.hz * 60, power: peak.power, snrDb };
}

/**
 * Score how usable a scan was, and say what to fix when it was not.
 *
 * @param {object} stats Scan statistics.
 * @param {number} stats.snrDb Pulse signal-to-noise ratio.
 * @param {number} stats.spreadBpm Disagreement between sub-window estimates.
 * @param {number} stats.coverage Fraction of frames where skin was found.
 * @param {number} stats.motion Median per-frame motion, 0–1.
 * @param {number} stats.luma Mean skin luminance, 0–255.
 * @param {number} stats.clipped Fraction of skin pixels at the top of the range.
 * @param {number} stats.durationSec Usable scan length.
 * @returns {{confidence: number, grade: string, advice: string[]}} Quality verdict.
 */
export function scanQuality(stats) {
  const advice = [];
  // SNR is the backbone: below about 0 dB there is more noise in the pulse band
  // than pulse, and any rate reported from it is a coin toss dressed as a number.
  let confidence = remap(stats.snrDb, -2, 9, 0, 1);

  if (stats.spreadBpm > 3) {
    confidence *= remap(stats.spreadBpm, 3, 14, 1, 0.15);
    advice.push('The rate drifted between the start and end of the scan — stay still and scan again.');
  }
  if (stats.coverage < 0.85) {
    confidence *= remap(stats.coverage, 0.4, 0.85, 0.2, 1);
    advice.push('Your face left the oval part-way through. Prop the phone up rather than holding it.');
  }
  if (stats.motion > 0.035) {
    confidence *= remap(stats.motion, 0.035, 0.14, 1, 0.2);
    advice.push('Too much movement. Rest your elbows, or lean the phone against something.');
  }
  if (stats.luma < 55) {
    confidence *= remap(stats.luma, 20, 55, 0.2, 1);
    advice.push('Too dark. Face a window or a lamp — front light, not backlight.');
  }
  if (stats.clipped > 0.12) {
    confidence *= remap(stats.clipped, 0.12, 0.4, 1, 0.25);
    advice.push('Your face is blown out by a bright light. Move out of direct sun or turn a lamp away.');
  }
  if (stats.durationSec < 18) {
    confidence *= remap(stats.durationSec, 8, 18, 0.3, 1);
    advice.push('Short scan. Thirty seconds is the minimum for a variability figure worth reading.');
  }

  confidence = clamp(confidence, 0, 1);
  const grade = confidence >= 0.62 ? 'good' : confidence >= 0.32 ? 'fair' : 'unusable';
  if (grade === 'good' && !advice.length) advice.push('Clean read.');
  return { confidence, grade, advice };
}

/**
 * Run the whole estimation pipeline over a scan.
 *
 * @param {Array<{t: number, r: number, g: number, b: number, luma: number,
 *   motion: number, clipped: number, found: boolean}>} samples Per-frame
 *   measurements in capture order; `t` is milliseconds.
 * @param {object} [options] Estimation options.
 * @param {number} [options.hz=ANALYSIS_HZ] Analysis sample rate.
 * @returns {object} A reading: rates, variability, quality and the waveform for
 *   display. `ok` is false when the scan cannot support any number at all.
 */
export function estimateVitals(samples, options = {}) {
  const hz = options.hz || ANALYSIS_HZ;
  const usable = samples.filter((sample) => sample.found);
  const coverage = samples.length ? usable.length / samples.length : 0;

  const blank = {
    ok: false,
    bpm: 0,
    confidence: 0,
    grade: 'unusable',
    advice: ['No usable frames. Make sure your face fills the oval and the room is lit.'],
    snrDb: -30,
    spreadBpm: 0,
    hrv: { rmssd: 0, sdnn: 0, beats: 0, reliable: false },
    breathsPerMin: 0,
    breathSource: null,
    waveform: new Float64Array(0),
    beatTimes: [],
    intervals: [],
    coverage,
    motion: 1,
    luma: 0,
    durationSec: 0,
    sampleRate: hz,
  };
  if (usable.length < hz * 6) return blank;

  const times = usable.map((sample) => sample.t);
  const grid = {
    r: resampleUniform(usable.map((s) => s.r), times, hz),
    g: resampleUniform(usable.map((s) => s.g), times, hz),
    b: resampleUniform(usable.map((s) => s.b), times, hz),
    luma: resampleUniform(usable.map((s) => s.luma), times, hz),
  };
  const durationSec = grid.g.durationSec;
  if (grid.g.values.length < hz * 6) return { ...blank, durationSec };

  const motion = median(usable.map((s) => s.motion));
  const luma = mean(usable.map((s) => s.luma));
  const clipped = mean(usable.map((s) => s.clipped));

  const rgb = { r: grid.r.values, g: grid.g.values, b: grid.b.values };
  const spectrumOf = (wave) => powerSpectrum(wave, hz, { ...PULSE_BAND, stepHz: 0.005 });

  let waveform = posWaveform(rgb, hz);
  let method = 'pos';
  let spectrum = spectrumOf(waveform);
  let peak = dominantFrequency(spectrum);
  let snrDb = spectralSnrDb(spectrum, peak.hz);

  // CHROM's subtraction can cancel the pulse outright when a subject's channel
  // ratios happen to line up with its weighting, so it is never preferred
  // outright — but on some skin tones and lighting it is the cleaner of the two,
  // and when POS is struggling it is worth asking.
  if (snrDb < 6) {
    const chrom = chromWaveform(rgb, hz);
    if (chrom.length) {
      const chromSpectrum = spectrumOf(chrom);
      const chromPeak = dominantFrequency(chromSpectrum);
      const chromSnr = spectralSnrDb(chromSpectrum, chromPeak.hz);
      if (chromSnr > snrDb + 1.5) {
        waveform = chrom;
        spectrum = chromSpectrum;
        peak = chromPeak;
        snrDb = chromSnr;
        method = 'chrom';
      }
    }
  }

  // A greyscale or aggressively white-balanced feed leaves the two chrominance
  // projections collinear, and CHROM then cancels the pulse along with the
  // motion. Green alone recovers that case — but green also happily reports a
  // rocking chair or a flickering lamp as a heartbeat, which is the artefact
  // CHROM exists to reject. So the fallback is deliberately hard to reach: only
  // when CHROM has genuinely failed, green is decisively better, and the scan
  // was still enough that a strong periodic signal is unlikely to be movement.
  const green = greenWaveform(grid.g.values, hz);
  if (green.length && snrDb < 2 && motion < 0.03) {
    const greenSpectrum = spectrumOf(green);
    const greenPeak = dominantFrequency(greenSpectrum);
    const greenSnr = spectralSnrDb(greenSpectrum, greenPeak.hz);
    if (greenSnr > snrDb + 4) {
      waveform = green;
      spectrum = greenSpectrum;
      peak = greenPeak;
      snrDb = greenSnr;
      method = 'green';
    }
  }
  if (!waveform.length || !(peak.hz > 0)) return { ...blank, durationSec };

  const windowed = windowedRate(waveform, hz);
  const bpm = windowed.bpm > 0 && Math.abs(windowed.bpm - peak.hz * 60) < 12
    ? (windowed.bpm + peak.hz * 60) / 2
    : peak.hz * 60;

  // Peak picking is constrained to a narrow band around the spectral rate: a
  // waveform filtered around its own dominant frequency cannot produce beats
  // that contradict it, so intervals measure jitter rather than filter ringing.
  const narrow = bandpassFir(
    waveform,
    hz,
    Math.max(PULSE_BAND.minHz, peak.hz - 0.6),
    Math.min(PULSE_BAND.maxHz, peak.hz + 0.8),
    151,
  );
  const peaks = findPeaks(narrow, hz, { minSpacingSec: Math.max(0.3, (60 / bpm) * 0.62) });
  const beatTimes = refinePeakTimes(narrow, hz, peaks);
  const intervals = cleanIntervals(intervalsFromTimes(beatTimes), 0.22);

  const quality = scanQuality({
    snrDb,
    spreadBpm: windowed.spreadBpm,
    coverage,
    motion,
    luma,
    clipped,
    durationSec,
  });

  // Variability is held to a stricter bar than rate. A rate survives a mediocre
  // scan because it only needs the dominant frequency; RMSSD needs the position
  // of every individual beat, and a scan that cannot supply that must say so
  // rather than print a number that looks like recovery data.
  const rmssdMs = rmssd(intervals);
  const hrvReliable = quality.confidence >= 0.55
    && intervals.length >= 12
    && snrDb >= 3
    && durationSec >= 20;

  const rsa = respirationFromIntervals(beatTimes, intervals);
  const baseband = respirationFromBaseband(grid.luma.values, hz);
  const breath = rsa.breathsPerMin > 0 && intervals.length >= 16
    ? { ...rsa, source: 'rsa' }
    : baseband.breathsPerMin > 0
      ? { ...baseband, source: 'baseband' }
      : { breathsPerMin: 0, source: null };

  return {
    ok: quality.grade !== 'unusable',
    bpm,
    method,
    confidence: quality.confidence,
    grade: quality.grade,
    advice: quality.advice,
    snrDb,
    spreadBpm: windowed.spreadBpm,
    hrv: {
      rmssd: rmssdMs,
      sdnn: sdnn(intervals),
      beats: intervals.length + 1,
      reliable: hrvReliable,
    },
    breathsPerMin: breath.breathsPerMin,
    breathSource: breath.source,
    waveform,
    spectrum,
    beatTimes,
    intervals,
    coverage,
    motion,
    luma,
    clipped,
    durationSec,
    sampleRate: hz,
  };
}
