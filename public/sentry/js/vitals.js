/**
 * Breathing and pulse from a subject who is not moving.
 *
 * This is the part of the brief that most needs its limits stated up front,
 * because the demand — "read a stranger's heart rate off a security camera" —
 * is a thing cameras cannot generally do, and an app that returns a number
 * anyway is lying at exactly the moment somebody is deciding whether a person
 * is a threat.
 *
 * What is real: remote photoplethysmography works. Blood absorbs green light, a
 * face brightens and darkens by roughly half a per cent per beat, and the
 * estimator in the Baseline app — POS and CHROM, on a media-clock time base —
 * recovers that reliably. What it needs is a face that fills a decent number of
 * pixels, holds still for the better part of a minute, and is lit well enough
 * that the sensor is not spending its whole dynamic range on noise.
 *
 * A perimeter camera at ten metres delivers a head about twelve pixels across,
 * on a subject who is walking, at night. There is no pulse in that, and no
 * amount of processing puts one there. So this module measures the conditions
 * first and refuses by default: it reports *why* a reading is unavailable far
 * more often than it reports a rate, and that ratio is the honest one.
 *
 * Breathing is the easier of the two and survives conditions that defeat pulse:
 * it is a slow, roughly 0.2–0.4 Hz rise and fall of the whole torso, visible as
 * a low-frequency wobble in the subject's silhouette long after their face has
 * become a smudge. It still needs stillness — a walking chest moves for reasons
 * that have nothing to do with air.
 *
 * @module sentry/vitals
 */

import { estimateVitals, respirationFromBaseband } from '../../baseline/js/vitals.js';
import { resampleUniform } from '../../baseline/js/signal.js';

/** Head ROI width in pixels below which pulse is not attempted. */
export const MIN_HEAD_PX = 24;

/** Ground speed above which a subject counts as moving, metres per second. */
export const STILLNESS_MPS = 0.18;

/** Seconds of continuous stillness before pulse is attempted. */
export const PULSE_WINDOW_SEC = 24;

/** Seconds of continuous stillness before breathing is attempted. */
export const BREATH_WINDOW_SEC = 14;

/** Rate the traces are analysed at, hertz. */
export const ANALYSIS_HZ = 20;

/**
 * Per-track accumulation of the traces a vitals estimate needs.
 *
 * One of these is attached to each track and reset the moment the subject moves,
 * because a window that spans a step is a window whose "pulse" is a footfall.
 */
export class VitalsProbe {
  constructor() {
    this.samples = [];
    this.torso = [];
    this.stillSinceMs = null;
    this.headPx = 0;
    this.reason = 'waiting for the subject to hold still';
  }

  /** Discard the window; called whenever the subject moves. */
  reset(reason) {
    this.samples.length = 0;
    this.torso.length = 0;
    this.stillSinceMs = null;
    this.reason = reason;
  }

  /**
   * Take one frame's measurement for a track.
   *
   * @param {object} input Frame measurement.
   * @param {number} input.timeMs Capture time.
   * @param {number} input.speedMps Track ground speed.
   * @param {{data: Uint8ClampedArray}} input.frame RGBA pixels.
   * @param {number} input.width Frame width.
   * @param {import('./scene.js').Blob} input.blob The track's region this frame.
   * @returns {void}
   */
  observe({ timeMs, speedMps, frame, width, blob }) {
    if (speedMps > STILLNESS_MPS) {
      this.reset('the subject is moving');
      return;
    }
    if (this.stillSinceMs === null) this.stillSinceMs = timeMs;

    const boxHeight = blob.maxY - blob.minY + 1;
    const boxWidth = blob.maxX - blob.minX + 1;
    // The head is the top fifth of an upright silhouette, centred; the torso is
    // the band below it. Neither needs face detection, which would not work at
    // these sizes anyway.
    const headTop = blob.minY;
    const headBottom = blob.minY + Math.max(1, Math.round(boxHeight * 0.2));
    const headLeft = Math.round(blob.cx - boxWidth * 0.2);
    const headRight = Math.round(blob.cx + boxWidth * 0.2);
    this.headPx = Math.max(0, headRight - headLeft);

    const head = meanColour(frame, width, headLeft, headTop, headRight, headBottom);
    const torsoTop = headBottom;
    const torsoBottom = blob.minY + Math.max(2, Math.round(boxHeight * 0.6));
    const torso = meanColour(frame, width, blob.minX, torsoTop, blob.maxX, torsoBottom);

    this.samples.push({
      t: timeMs,
      r: head.r,
      g: head.g,
      b: head.b,
      luma: head.luma,
      motion: Math.min(1, speedMps / STILLNESS_MPS),
      clipped: head.clipped,
      found: head.count > 0,
    });
    this.torso.push({ t: timeMs, value: torso.luma });
    // Ninety seconds is more than any estimate here uses; beyond that the
    // oldest samples describe a different posture.
    const cutoff = timeMs - 90_000;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    while (this.torso.length && this.torso[0].t < cutoff) this.torso.shift();
  }

  /** @returns {number} Seconds the subject has been still. */
  stillSeconds(nowMs) {
    return this.stillSinceMs === null ? 0 : (nowMs - this.stillSinceMs) / 1000;
  }

  /**
   * Produce whatever the accumulated window can support.
   *
   * @param {number} nowMs Current time.
   * @returns {{breathsPerMin: number|null, bpm: number|null, grade: string,
   *   stillSec: number, reason: string}} Reading, with nulls where the
   *   conditions did not support a number.
   */
  read(nowMs) {
    const stillSec = this.stillSeconds(nowMs);
    const out = {
      breathsPerMin: null,
      bpm: null,
      grade: 'unavailable',
      stillSec,
      reason: this.reason,
    };
    if (stillSec < BREATH_WINDOW_SEC) {
      out.reason = `needs ${Math.ceil(BREATH_WINDOW_SEC - stillSec)} s more stillness`;
      return out;
    }

    const times = this.torso.map((s) => s.t);
    const grid = resampleUniform(this.torso.map((s) => s.value), times, ANALYSIS_HZ);
    if (grid.values.length >= ANALYSIS_HZ * 12) {
      const breath = respirationFromBaseband(grid.values, ANALYSIS_HZ);
      if (breath.breathsPerMin > 0) {
        out.breathsPerMin = breath.breathsPerMin;
        out.grade = 'breathing only';
        out.reason = 'torso motion carries a breathing rhythm';
      } else {
        out.reason = 'no breathing rhythm above the noise';
      }
    }

    if (this.headPx < MIN_HEAD_PX) {
      out.reason = `${out.breathsPerMin ? out.reason + '; ' : ''}head is ${this.headPx} px across, too small for a pulse (needs ${MIN_HEAD_PX})`;
      return out;
    }
    if (stillSec < PULSE_WINDOW_SEC) {
      out.reason = `${out.breathsPerMin ? out.reason + '; ' : ''}pulse needs ${Math.ceil(PULSE_WINDOW_SEC - stillSec)} s more stillness`;
      return out;
    }

    const reading = estimateVitals(this.samples, { hz: ANALYSIS_HZ });
    if (reading.ok && reading.grade !== 'unusable') {
      out.bpm = reading.bpm;
      out.grade = reading.grade;
      out.reason = reading.advice?.[0] ?? 'pulse recovered from skin colour';
      if (!out.breathsPerMin && reading.breathsPerMin) out.breathsPerMin = reading.breathsPerMin;
    } else {
      out.reason = `${out.breathsPerMin ? out.reason + '; ' : ''}${reading.advice?.[0] ?? 'no pulse above the noise'}`;
    }
    return out;
  }
}

/**
 * Mean colour of a rectangular region.
 *
 * @param {{data: Uint8ClampedArray}} frame RGBA pixels.
 * @param {number} width Frame width.
 * @param {number} left Region bounds, inclusive.
 * @param {number} top Region bounds, inclusive.
 * @param {number} right Region bounds, exclusive.
 * @param {number} bottom Region bounds, exclusive.
 * @returns {{r: number, g: number, b: number, luma: number, clipped: number,
 *   count: number}} Channel means, luminance, the fraction of pixels at the top
 *   of the range, and how many pixels contributed.
 */
export function meanColour(frame, width, left, top, right, bottom) {
  let r = 0;
  let g = 0;
  let b = 0;
  let clipped = 0;
  let count = 0;
  const height = frame.data.length / 4 / width;
  for (let y = Math.max(0, top); y < Math.min(height, bottom); y += 1) {
    for (let x = Math.max(0, left); x < Math.min(width, right); x += 1) {
      const p = (y * width + x) * 4;
      r += frame.data[p];
      g += frame.data[p + 1];
      b += frame.data[p + 2];
      if (frame.data[p + 1] >= 250) clipped += 1;
      count += 1;
    }
  }
  if (!count) return { r: 0, g: 0, b: 0, luma: 0, clipped: 0, count: 0 };
  const mr = r / count;
  const mg = g / count;
  const mb = b / count;
  return {
    r: mr,
    g: mg,
    b: mb,
    luma: 0.299 * mr + 0.587 * mg + 0.114 * mb,
    clipped: clipped / count,
    count,
  };
}
