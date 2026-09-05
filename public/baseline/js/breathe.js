/**
 * Paced breathing, and measuring whether it actually did anything.
 *
 * Breathing exercises are the one recovery intervention a phone can both
 * prescribe and verify. The heart speeds up on the inhale and slows on the
 * exhale, and at around six breaths a minute that oscillation lines up with the
 * baroreflex's own resonance, so the swing gets very large — often 15 bpm or
 * more between the top of the inhale and the bottom of the exhale.
 *
 * That is what makes this worth building on top of a camera rather than an
 * animation: the app can show the swing happening, in the subject's own pulse,
 * while they breathe. An app that only draws an expanding circle is asking for
 * trust; one that measures the response is earning it.
 *
 * @module baseline/breathe
 */

import {
  clamp,
  detrend,
  dominantFrequency,
  mean,
  powerSpectrum,
  resampleUniform,
} from './signal.js';

/**
 * Breathing protocols, each a cycle of phases in seconds.
 *
 * @type {ReadonlyArray<{id: string, name: string, purpose: string,
 *   phases: Array<{phase: string, label: string, seconds: number}>}>}
 */
export const PROTOCOLS = Object.freeze([
  {
    id: 'coherent',
    name: 'Coherent · 6 per minute',
    purpose: 'The resonance rate for most adults. Use it before a session to settle, or after one to come down.',
    phases: [
      { phase: 'in', label: 'In', seconds: 4 },
      { phase: 'out', label: 'Out', seconds: 6 },
    ],
  },
  {
    id: 'extended',
    name: 'Long exhale · 4 in, 8 out',
    purpose: 'The strongest parasympathetic pull of the four. Best straight after hard work, or before sleep.',
    phases: [
      { phase: 'in', label: 'In', seconds: 4 },
      { phase: 'out', label: 'Out', seconds: 8 },
    ],
  },
  {
    id: 'box',
    name: 'Box · 4-4-4-4',
    purpose: 'Steadies attention without deeply sedating. Useful before a lift, where you want calm but not soft.',
    phases: [
      { phase: 'in', label: 'In', seconds: 4 },
      { phase: 'hold', label: 'Hold', seconds: 4 },
      { phase: 'out', label: 'Out', seconds: 4 },
      { phase: 'holdOut', label: 'Hold', seconds: 4 },
    ],
  },
  {
    id: 'primer',
    name: 'Primer · 3 in, 3 out',
    purpose: 'Ten breaths a minute, to wake the system up rather than settle it. For a warm-up, not a wind-down.',
    phases: [
      { phase: 'in', label: 'In', seconds: 3 },
      { phase: 'out', label: 'Out', seconds: 3 },
    ],
  },
]);

/**
 * Look up a protocol by id.
 *
 * @param {string} id Protocol id.
 * @returns {object} The protocol, defaulting to coherent breathing.
 */
export function protocolFor(id) {
  return PROTOCOLS.find((protocol) => protocol.id === id) || PROTOCOLS[0];
}

/**
 * Length of one full cycle, in seconds.
 *
 * @param {object} protocol Protocol.
 * @returns {number} Cycle duration.
 */
export function cycleSeconds(protocol) {
  return protocol.phases.reduce((total, phase) => total + phase.seconds, 0);
}

/**
 * Breaths per minute a protocol paces.
 *
 * @param {object} protocol Protocol.
 * @returns {number} Breathing rate.
 */
export function protocolRate(protocol) {
  return 60 / cycleSeconds(protocol);
}

/**
 * Where in the cycle the subject should be right now.
 *
 * @param {number} elapsedSec Seconds since the protocol started.
 * @param {object} protocol Protocol.
 * @returns {{phase: string, label: string, remaining: number, progress: number,
 *   cycle: number, scale: number}} Guidance state. `scale` drives the animated
 *   orb: 0.35 fully exhaled, 1 fully inhaled, held steady through the holds.
 */
export function breathState(elapsedSec, protocol) {
  const cycle = cycleSeconds(protocol);
  const time = Math.max(0, elapsedSec);
  const position = time % cycle;
  const cycleIndex = Math.floor(time / cycle);

  let offset = 0;
  for (const phase of protocol.phases) {
    if (position < offset + phase.seconds) {
      const progress = (position - offset) / phase.seconds;
      // Cosine easing rather than linear: real breathing does not change
      // direction instantaneously, and a linear orb makes people snatch at the
      // turn, which is exactly the habit the exercise is meant to break.
      const eased = (1 - Math.cos(Math.PI * progress)) / 2;
      const scale = phase.phase === 'in' ? 0.35 + 0.65 * eased
        : phase.phase === 'out' ? 1 - 0.65 * eased
          : phase.phase === 'hold' ? 1 : 0.35;
      return {
        phase: phase.phase,
        label: phase.label,
        remaining: offset + phase.seconds - position,
        progress,
        cycle: cycleIndex,
        scale,
      };
    }
    offset += phase.seconds;
  }
  const last = protocol.phases[protocol.phases.length - 1];
  return { phase: last.phase, label: last.label, remaining: 0, progress: 1, cycle: cycleIndex, scale: 0.35 };
}

/**
 * Instantaneous heart rate sampled evenly, from beat times.
 *
 * @param {ArrayLike<number>} beatTimes Beat times in seconds.
 * @param {ArrayLike<number>} intervals Inter-beat intervals in milliseconds.
 * @param {number} [hz=4] Output sample rate.
 * @returns {{values: Float64Array, hz: number, durationSec: number}} Rate trace in bpm.
 */
export function rateTrace(beatTimes, intervals, hz = 4) {
  const times = [];
  const rates = [];
  for (let i = 0; i < intervals.length && i + 1 < beatTimes.length; i += 1) {
    if (!(intervals[i] > 0)) continue;
    times.push(beatTimes[i + 1] * 1000);
    rates.push(60000 / intervals[i]);
  }
  if (times.length < 4) return { values: new Float64Array(0), hz, durationSec: 0 };
  const grid = resampleUniform(rates, times, hz);
  return { values: grid.values, hz, durationSec: grid.durationSec };
}

/**
 * Score how well the heart followed the breathing.
 *
 * Two numbers, both meaningful on their own:
 *
 * - `swingBpm` — how far the pulse travelled between the top of the inhale and
 *   the bottom of the exhale. This is respiratory sinus arrhythmia, and it is
 *   the size of the effect.
 * - `coherence` — how much of the pulse's slow variation sat at the paced rate
 *   rather than anywhere else. This is whether the effect was *yours*, or just
 *   noise that happened to be there.
 *
 * @param {object} input Measurement input.
 * @param {ArrayLike<number>} input.beatTimes Beat times in seconds.
 * @param {ArrayLike<number>} input.intervals Inter-beat intervals in milliseconds.
 * @param {object} input.protocol Protocol that was paced.
 * @returns {{swingBpm: number, coherence: number, breathsPerMin: number,
 *   paced: number, ok: boolean}} Response measurement.
 */
export function breathingResponse(input) {
  const { beatTimes, intervals, protocol } = input;
  const paced = protocolRate(protocol);
  const trace = rateTrace(beatTimes, intervals, 4);
  const blank = { swingBpm: 0, coherence: 0, breathsPerMin: 0, paced, ok: false };
  if (trace.values.length < 24) return blank;

  const detrended = detrend(trace.values, 41);
  const spectrum = powerSpectrum(detrended, 4, { minHz: 0.04, maxHz: 0.45, stepHz: 0.002 });
  const peak = dominantFrequency(spectrum);

  const pacedHz = paced / 60;
  let atPaced = 0;
  let total = 0;
  for (let i = 0; i < spectrum.freqs.length; i += 1) {
    total += spectrum.power[i];
    if (Math.abs(spectrum.freqs[i] - pacedHz) <= 0.02) atPaced += spectrum.power[i];
  }

  // Swing is measured from the smoothed trace's spread rather than its extremes,
  // so one mis-detected beat cannot report a heroic 40 bpm oscillation.
  const sorted = Array.from(detrended).sort((a, b) => a - b);
  const low = sorted[Math.floor(sorted.length * 0.1)];
  const high = sorted[Math.floor(sorted.length * 0.9)];

  return {
    swingBpm: Math.max(0, high - low),
    coherence: total > 0 ? clamp(atPaced / total, 0, 1) : 0,
    breathsPerMin: peak.hz > 0 ? peak.hz * 60 : 0,
    paced,
    meanBpm: mean(trace.values),
    ok: true,
  };
}

/**
 * Put a breathing response into words.
 *
 * @param {object} response Output of {@link breathingResponse}.
 * @returns {string} One or two sentences for the screen and for speech.
 */
export function describeResponse(response) {
  if (!response.ok) {
    return 'Not enough clean beats during that round to measure the response. '
      + 'Keep your face in the oval for the whole set and try again.';
  }
  const swing = Math.round(response.swingBpm);
  const locked = response.coherence >= 0.45;
  if (swing >= 10 && locked) {
    return `Your pulse swung ${swing} bpm with the pacing, and it stayed locked to it. `
      + 'That is a strong vagal response — this protocol is working on you.';
  }
  if (swing >= 5 && locked) {
    return `A ${swing} bpm swing, in time with the pacing. That is a real response; it usually grows over a week or two of practice.`;
  }
  if (locked) {
    return 'Your rhythm followed the pacing, but the swing was small. Try breathing lower — into the belly, not the chest — and lengthen the exhale.';
  }
  return `Your pulse varied by about ${swing} bpm but not in time with the pacing. `
    + 'Usually that means the breath was not actually following the orb, or the scan lost too many beats.';
}

/**
 * Compare a scan taken before an intervention with one taken after.
 *
 * @param {object} before Reading before.
 * @param {object} after Reading after.
 * @returns {{deltaBpm: number, deltaRmssd: number|null, deltaBreaths: number|null,
 *   text: string}} The difference, with a sentence describing it.
 */
export function compareScans(before, after) {
  const deltaBpm = after.bpm - before.bpm;
  const bothHrv = before.hrvReliable && after.hrvReliable;
  const deltaRmssd = bothHrv ? after.rmssd - before.rmssd : null;
  const deltaBreaths = before.breathsPerMin > 0 && after.breathsPerMin > 0
    ? after.breathsPerMin - before.breathsPerMin
    : null;

  const parts = [];
  parts.push(deltaBpm <= -2
    ? `Resting rate down ${Math.abs(Math.round(deltaBpm))} bpm.`
    : deltaBpm >= 2
      ? `Resting rate up ${Math.round(deltaBpm)} bpm.`
      : 'Resting rate unchanged.');
  if (deltaRmssd !== null) {
    parts.push(deltaRmssd >= 3
      ? `Variability up ${Math.round(deltaRmssd)} ms — that is the parasympathetic side taking over.`
      : deltaRmssd <= -3
        ? `Variability down ${Math.abs(Math.round(deltaRmssd))} ms.`
        : 'Variability about the same.');
  }
  if (deltaBreaths !== null && deltaBreaths <= -2) {
    parts.push(`Breathing settled by ${Math.abs(Math.round(deltaBreaths))} per minute.`);
  }
  return { deltaBpm, deltaRmssd, deltaBreaths, text: parts.join(' ') };
}
