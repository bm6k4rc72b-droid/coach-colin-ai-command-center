/**
 * Crop maturity profiles.
 *
 * A profile describes how a crop travels through colour space as it ripens.
 * `huePath` is an ordered polyline of anchors on the hue circle: the first
 * anchor is an immature fruit, the last is fully ripe, and `m` is the maturity
 * coordinate in [0,1] at that anchor. Scoring a pixel means projecting its hue
 * onto that polyline — see {@link maturityFromHue} — which turns "what colour
 * is this pixel" into "how far along the ripening curve is this pixel".
 *
 * The numbers are field-usable defaults, not gospel: cultivars differ, and the
 * app's teach mode ({@link learnAnchor}) rewrites them from fruit the operator
 * actually points at.
 *
 * @module harvest-eye/crops
 */

import { hueDelta, wrapHue } from './color.js';

/**
 * @typedef {object} HueAnchor
 * @property {number} h Hue in degrees.
 * @property {number} m Maturity coordinate in [0,1] at that hue.
 */

/**
 * @typedef {object} CropProfile
 * @property {string} id Stable identifier used in storage and exports.
 * @property {string} name Display name.
 * @property {string} emoji Compact glyph for the crop picker.
 * @property {HueAnchor[]} huePath Ordered immature → ripe colour path.
 * @property {number} tolerance Maximum hue distance, in degrees, from the path
 *   before a pixel is rejected as "not this crop".
 * @property {number} minSat Minimum saturation for a pixel to count as fruit.
 * @property {number} minVal Minimum value (brightness) for a pixel to count.
 * @property {number} harvestAt Maturity at which the crop is harvest-ready.
 * @property {number} overripeAt Maturity at which colouring is complete and
 *   the picking window is closing.
 * @property {number} cycleDays Nominal days to travel the whole path, m 0 → 1,
 *   at the reference temperature.
 * @property {number} refTempC Temperature the nominal cycle was observed at.
 * @property {number} greenGate Maturity below which a blob is "green fruit" and
 *   must pass the stricter shape/texture gate that separates it from foliage.
 * @property {string} note One-line agronomy note shown in the profile sheet.
 */

/** @type {readonly CropProfile[]} */
export const CROP_PROFILES = Object.freeze([
  {
    id: 'tomato',
    name: 'Tomato',
    emoji: '🍅',
    huePath: [
      { h: 108, m: 0.0 },
      { h: 78, m: 0.2 },
      { h: 56, m: 0.4 },
      { h: 32, m: 0.6 },
      { h: 16, m: 0.8 },
      { h: 4, m: 1.0 },
    ],
    tolerance: 15,
    minSat: 0.3,
    minVal: 0.18,
    harvestAt: 0.72,
    overripeAt: 0.96,
    cycleDays: 18,
    refTempC: 22,
    greenGate: 0.3,
    note: 'Breaker stage begins around m 0.35; vine-ripe picking from 0.72.',
  },
  {
    id: 'strawberry',
    name: 'Strawberry',
    emoji: '🍓',
    huePath: [
      { h: 96, m: 0.0 },
      { h: 62, m: 0.15 },
      { h: 24, m: 0.5 },
      { h: 8, m: 0.78 },
      { h: 354, m: 1.0 },
    ],
    tolerance: 14,
    minSat: 0.32,
    minVal: 0.2,
    harvestAt: 0.8,
    overripeAt: 0.97,
    cycleDays: 12,
    refTempC: 20,
    greenGate: 0.28,
    note: 'Non-climacteric — colour after picking barely moves. Pick at 0.8+.',
  },
  {
    id: 'chili',
    name: 'Chili / pepper',
    emoji: '🌶️',
    huePath: [
      { h: 112, m: 0.0 },
      { h: 84, m: 0.2 },
      { h: 52, m: 0.45 },
      { h: 28, m: 0.7 },
      { h: 8, m: 0.9 },
      { h: 358, m: 1.0 },
    ],
    tolerance: 15,
    minSat: 0.34,
    minVal: 0.18,
    harvestAt: 0.85,
    overripeAt: 0.98,
    cycleDays: 26,
    refTempC: 24,
    greenGate: 0.3,
    note: 'Green-stage picking is valid too — drop harvestAt to 0.1 for green.',
  },
  {
    id: 'banana',
    name: 'Banana',
    emoji: '🍌',
    huePath: [
      { h: 104, m: 0.0 },
      { h: 82, m: 0.25 },
      { h: 64, m: 0.55 },
      { h: 52, m: 0.8 },
      { h: 44, m: 1.0 },
    ],
    tolerance: 13,
    minSat: 0.25,
    minVal: 0.22,
    harvestAt: 0.55,
    overripeAt: 0.92,
    cycleDays: 10,
    refTempC: 25,
    greenGate: 0.35,
    note: 'Export fruit ships green — harvest window opens well before yellow.',
  },
  {
    id: 'mango',
    name: 'Mango',
    emoji: '🥭',
    huePath: [
      { h: 106, m: 0.0 },
      { h: 80, m: 0.25 },
      { h: 56, m: 0.5 },
      { h: 38, m: 0.75 },
      { h: 22, m: 1.0 },
    ],
    tolerance: 16,
    minSat: 0.28,
    minVal: 0.2,
    harvestAt: 0.65,
    overripeAt: 0.94,
    cycleDays: 20,
    refTempC: 27,
    greenGate: 0.32,
    note: 'Blush is cultivar-dependent — teach mode pays for itself here.',
  },
  {
    id: 'citrus',
    name: 'Orange / citrus',
    emoji: '🍊',
    huePath: [
      { h: 104, m: 0.0 },
      { h: 72, m: 0.3 },
      { h: 48, m: 0.6 },
      { h: 32, m: 0.85 },
      { h: 24, m: 1.0 },
    ],
    tolerance: 14,
    minSat: 0.3,
    minVal: 0.2,
    harvestAt: 0.8,
    overripeAt: 0.97,
    cycleDays: 30,
    refTempC: 21,
    greenGate: 0.3,
    note: 'Re-greening in warm nights can walk maturity backwards — trend it.',
  },
  {
    id: 'coffee',
    name: 'Coffee cherry',
    emoji: '☕',
    huePath: [
      { h: 110, m: 0.0 },
      { h: 76, m: 0.3 },
      { h: 48, m: 0.55 },
      { h: 20, m: 0.8 },
      { h: 2, m: 1.0 },
    ],
    tolerance: 13,
    minSat: 0.34,
    minVal: 0.16,
    harvestAt: 0.9,
    overripeAt: 0.99,
    cycleDays: 34,
    refTempC: 20,
    greenGate: 0.3,
    note: 'Selective picking: only the deep-red fraction should leave the tree.',
  },
  {
    id: 'grape',
    name: 'Wine grape',
    emoji: '🍇',
    huePath: [
      { h: 100, m: 0.0 },
      { h: 70, m: 0.25 },
      { h: 20, m: 0.55 },
      { h: 340, m: 0.8 },
      { h: 300, m: 1.0 },
    ],
    tolerance: 17,
    minSat: 0.22,
    minVal: 0.12,
    harvestAt: 0.88,
    overripeAt: 0.99,
    cycleDays: 32,
    refTempC: 22,
    greenGate: 0.28,
    note: 'Véraison is the 0.4–0.6 band; colour leads sugar by roughly a week.',
  },
]);

/**
 * Named maturity bands, ordered immature → full colour.
 *
 * The scale ends at *full colour*, not at spoilage: hue stops moving once a
 * fruit has finished colouring, so a perfect vine-ripe tomato and one that sat
 * three days too long are the same hue. Spoilage is a separate signal — the
 * dulling and browning that `vision.js` counts as decay — and it is reported
 * on its own rather than inferred from redness.
 */
export const STAGES = Object.freeze([
  { id: 'immature', label: 'Immature', max: 0.25, color: '#2f9e44' },
  { id: 'developing', label: 'Developing', max: 0.5, color: '#8fce2b' },
  { id: 'turning', label: 'Turning', max: 0.72, color: '#f0c419' },
  { id: 'ripening', label: 'Ripening', max: 0.88, color: '#f28c28' },
  { id: 'ready', label: 'Harvest-ready', max: 0.97, color: '#e8443a' },
  { id: 'peak', label: 'Full colour', max: Infinity, color: '#b3241b' },
]);

/**
 * Look up the named stage for a maturity value.
 *
 * @param {number} m Maturity in [0,1].
 * @returns {{id:string,label:string,max:number,color:string}} Matching stage.
 */
export function stageFor(m) {
  for (const stage of STAGES) if (m <= stage.max) return stage;
  return STAGES[STAGES.length - 1];
}

/**
 * Project a hue onto a crop's ripening polyline.
 *
 * Each segment of the path is an arc on the hue circle. A hue that falls inside
 * an arc interpolates that segment's maturity exactly; a hue outside every arc
 * is scored against the nearest endpoint and carries the leftover angular
 * distance as `error`, which the caller compares against `profile.tolerance`.
 *
 * @param {CropProfile} profile Crop being scanned.
 * @param {number} hue Pixel hue in degrees.
 * @returns {{m:number,error:number}} Maturity coordinate and hue error in
 *   degrees. `m` is meaningless when `error` exceeds the profile tolerance.
 */
export function maturityFromHue(profile, hue) {
  const path = profile.huePath;
  let best = { m: 0, error: 360 };
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const sweep = hueDelta(a.h, b.h);
    if (Math.abs(sweep) < 1e-6) continue;
    const offset = hueDelta(a.h, hue);
    const t = offset / sweep;
    let error;
    let clamped;
    if (t >= 0 && t <= 1) {
      error = 0;
      clamped = t;
    } else if (t < 0) {
      error = Math.abs(offset);
      clamped = 0;
    } else {
      error = Math.abs(hueDelta(b.h, hue));
      clamped = 1;
    }
    if (error < best.error) {
      best = { m: a.m + (b.m - a.m) * clamped, error };
    }
    if (error === 0) break;
  }
  return best;
}

/**
 * Fold a freshly sampled hue into the profile anchor it belongs to.
 *
 * Teach mode: the operator frames one fruit they can name the stage of, taps
 * it, and the anchor nearest that stage drifts toward the observed hue. A
 * partial step (rather than a hard set) keeps a single bad tap — a shadowed
 * fruit, a stray leaf — from wrecking a profile that already works.
 *
 * @param {CropProfile} profile Profile to adapt. Not mutated.
 * @param {number} m Maturity the operator asserts for the sampled fruit.
 * @param {number} hue Observed hue in degrees.
 * @param {number} [rate=0.4] Fraction of the gap to close, in [0,1].
 * @returns {CropProfile} New profile with one anchor moved.
 */
export function learnAnchor(profile, m, hue, rate = 0.4) {
  let index = 0;
  let bestGap = Infinity;
  profile.huePath.forEach((anchor, i) => {
    const gap = Math.abs(anchor.m - m);
    if (gap < bestGap) {
      bestGap = gap;
      index = i;
    }
  });
  const huePath = profile.huePath.map((anchor, i) => (
    i === index
      ? { h: wrapHue(anchor.h + hueDelta(anchor.h, hue) * rate), m: anchor.m }
      : { ...anchor }
  ));
  return { ...profile, huePath };
}

/**
 * Merge stored operator overrides over the shipped defaults.
 *
 * @param {Record<string, Partial<CropProfile>>} overrides Keyed by crop id.
 * @returns {CropProfile[]} Effective profiles for this device.
 */
export function resolveProfiles(overrides = {}) {
  return CROP_PROFILES.map((profile) => {
    const override = overrides[profile.id];
    return override ? { ...profile, ...override } : { ...profile };
  });
}
