/**
 * Two cameras, two bearings, one fire — and the error ellipse that goes with it.
 *
 * This is the oldest working method in wildfire detection. Two lookouts on two
 * peaks each take a bearing to a smoke column, the bearings are drawn on a map,
 * and the fire is where they cross. It was done on an Osborne firefinder from
 * 1915 and it is what the modern camera networks do, with the cameras standing
 * in for the lookouts. It still works, it needs no satellite, and it refreshes
 * as fast as somebody can look.
 *
 * What gets skipped, then and now, is the second half: how big the crossing
 * actually is. Two bearings never meet at a point, because a bearing is never
 * exact. They meet in a region, and the shape of that region is set by the
 * angle the lines cross at and by how far away the fire is. Cross at 80° from
 * 5 km and it is a few hundred metres across. Cross at 8° from 30 km and it is
 * a sliver twenty kilometres long — and it prints as a latitude and a longitude
 * exactly like the good one does.
 *
 * So every fix from this module carries a covariance, and the app draws the
 * ellipse rather than the dot. When the ellipse is bad the reader can see that
 * it is bad, and the fix that needs a third bearing announces itself.
 *
 * ## The error that is bigger than the compass
 *
 * A phone or a pan-tilt camera reports a bearing to a few degrees. That is not
 * usually the dominant error. The dominant error is that **a camera sees smoke,
 * and smoke is not where the fire is**. A column leans downwind as it rises, so
 * the visible plume — especially its top, which is the part that shows above a
 * ridge and the part a distant observer actually sees — can be kilometres
 * downwind of the burning ground. Two observers on the same side of a fire who
 * both take a bearing to the top of the column will cross their lines
 * confidently, agree with each other, and both be pointing downwind of the
 * fire.
 *
 * {@link plumeLean} estimates that offset so the fix can be corrected towards
 * upwind and the residual folded into the error, rather than the app producing
 * a tight, precise, wrong answer that two independent sensors appear to confirm.
 *
 * @module emberline/triangulate
 */

import {
  bearingDelta,
  covarianceEllipse,
  crossBearing,
  destination,
  distanceM,
  fromLocal,
  normaliseBearing,
  toLocal,
  toRad,
  toDeg,
} from './geo.js';

/**
 * Default bearing uncertainty by observer type, degrees (one sigma).
 *
 * A phone's magnetometer is the loose one and it is loose in a way that is easy
 * to underestimate: it is pulled by the steel in a vehicle, by a roof, by the
 * phone's own speaker magnet, and the operating system's own accuracy estimate
 * is optimistic. A surveyed pan-tilt camera on a known mount is an order of
 * magnitude better because somebody aligned it once and it has not moved since.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const BEARING_SIGMA_DEG = Object.freeze({
  /** Surveyed, mechanically encoded pan-tilt head on a fixed mount. */
  fixed: 1.0,
  /** A camera on a known mount, aligned by eye against landmarks. */
  aligned: 3.0,
  /** A phone held up, using its magnetometer, declination corrected. */
  phone: 8.0,
  /** A phone whose declination has not been corrected, or that is near metal. */
  rough: 15.0,
});

/**
 * How far downwind the visible part of a smoke column sits from the fire.
 *
 * A plume rises and is blown over at the same time, so the horizontal offset at
 * a given height is roughly the height times the ratio of wind speed to the
 * plume's rise rate. Rise rate depends on the fire's intensity; a few metres per
 * second is typical of a moderate surface fire, more for an intense one.
 *
 * This is a first-order estimate of a genuinely messy thing, and it is used
 * here to *move a fix upwind and widen its error*, never to claim a corrected
 * position is exact.
 *
 * @param {object} options Plume geometry.
 * @param {number} options.observedHeightM Height above ground of the part of
 *   the column that was sighted.
 * @param {number} options.windMs Wind speed at plume height, m/s.
 * @param {number} [options.riseMs=4] Plume rise rate, m/s.
 * @returns {{offsetM: number, note: string}} Downwind offset of the sighted point.
 */
export function plumeLean({ observedHeightM, windMs, riseMs = 4 }) {
  const height = Math.max(0, observedHeightM);
  const rise = Math.max(0.5, riseMs);
  const offsetM = (height * Math.max(0, windMs)) / rise;
  return {
    offsetM,
    note: `A column sighted ${Math.round(height)} m up, in a ${windMs.toFixed(1)} m/s wind rising at about ${rise} m/s, is roughly ${Math.round(offsetM)} m downwind of the ground that is burning.`,
  };
}

/**
 * One observer's sighting, normalised and given an uncertainty.
 *
 * @param {object} input The raw sighting.
 * @param {string} input.id Observer name.
 * @param {number} input.lat Observer latitude.
 * @param {number} input.lon Observer longitude.
 * @param {number} input.bearing Bearing to the smoke, degrees from true north.
 * @param {keyof typeof BEARING_SIGMA_DEG|number} [input.quality='aligned']
 *   Observer class, or a one-sigma bearing error in degrees.
 * @param {number} [input.atMs] When the sighting was taken.
 * @returns {{id: string, position: {lat: number, lon: number}, bearing: number,
 *   sigmaDeg: number, atMs: ?number}} A normalised sighting.
 */
export function sighting(input) {
  const sigma =
    typeof input.quality === 'number'
      ? Math.max(0.1, input.quality)
      : (BEARING_SIGMA_DEG[input.quality ?? 'aligned'] ?? BEARING_SIGMA_DEG.aligned);
  return {
    id: input.id,
    position: { lat: input.lat, lon: input.lon },
    bearing: normaliseBearing(input.bearing),
    sigmaDeg: sigma,
    atMs: input.atMs ?? null,
  };
}

/**
 * Least-squares fix from two or more bearings, with its covariance.
 *
 * Each bearing is a line, and the fix is the point that minimises the sum of
 * squared perpendicular distances to all of them, weighted by how well each
 * line is known. The weight is the inverse square of the *cross-range* error —
 * a bearing of a given angular precision is a much looser constraint at 30 km
 * than at 3 km, and weighting by angle alone would let a distant rough sighting
 * drag a good near one off the fire.
 *
 * @param {Array<object>} sightings At least two sightings from {@link sighting}.
 * @returns {?{position: {lat: number, lon: number},
 *   covariance: {ee: number, en: number, nn: number},
 *   ellipse: {semiMajorM: number, semiMinorM: number, orientationDeg: number},
 *   ranges: Array<{id: string, rangeM: number, residualM: number}>,
 *   bestCrossingDeg: number, quality: string, note: string, usable: boolean}}
 *   The fix — which may be flagged unusable, with the reason in `note` — or
 *   null only when fewer than two bearings were supplied.
 */
export function fix(sightings) {
  const valid = sightings.filter((s) => s && Number.isFinite(s.bearing));
  if (valid.length < 2) return null;

  const origin = valid[0].position;
  const points = valid.map((s) => toLocal(origin, s.position));
  const directions = valid.map((s) => ({
    e: Math.sin(toRad(s.bearing)),
    n: Math.cos(toRad(s.bearing)),
  }));

  // A first guess from the best-crossing pair gives the ranges the weights need.
  const seed = seedFromBestPair(valid);
  if (!seed) return null;
  const seedLocal = toLocal(origin, seed.position);

  // Normal equations: for each line, the perpendicular-distance residual is
  // n_i . (x - p_i) where n_i is the unit normal. Weighted least squares on
  // those residuals is a 2x2 solve.
  let m00 = 0;
  let m01 = 0;
  let m11 = 0;
  let b0 = 0;
  let b1 = 0;
  valid.forEach((s, i) => {
    const d = directions[i];
    const normal = { e: d.n, n: -d.e };
    const range = Math.max(
      50,
      Math.hypot(seedLocal.e - points[i].e, seedLocal.n - points[i].n),
    );
    // Cross-range standard deviation of this bearing at the seed range.
    const crossSigma = Math.max(1, range * toRad(s.sigmaDeg));
    const w = 1 / (crossSigma * crossSigma);
    const c = normal.e * points[i].e + normal.n * points[i].n;
    m00 += w * normal.e * normal.e;
    m01 += w * normal.e * normal.n;
    m11 += w * normal.n * normal.n;
    b0 += w * normal.e * c;
    b1 += w * normal.n * c;
  });

  const det = m00 * m11 - m01 * m01;
  // A vanishing determinant means every bearing points the same way: the lines
  // are parallel and there is no crossing, however many of them there are. This
  // returns a result rather than nothing, because "your observers are in line
  // with each other and the smoke" is actionable — move one of them — and a
  // null would reach the operator as a blank panel.
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return parallelResult(valid);

  const e = (b0 * m11 - b1 * m01) / det;
  const n = (m00 * b1 - m01 * b0) / det;
  const position = fromLocal(origin, { e, n });

  // Inverting the information matrix gives the covariance directly.
  const covariance = { ee: m11 / det, en: -m01 / det, nn: m00 / det };
  const ellipse = covarianceEllipse(covariance, 2);

  const ranges = valid.map((s, i) => {
    const d = directions[i];
    const normal = { e: d.n, n: -d.e };
    const rangeM = distanceM(s.position, position);
    const along = (e - points[i].e) * d.e + (n - points[i].n) * d.n;
    return {
      id: s.id,
      rangeM,
      residualM: Math.abs((e - points[i].e) * normal.e + (n - points[i].n) * normal.n),
      behind: along <= 0,
    };
  });

  let bestCrossing = 0;
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const raw = Math.abs(bearingDelta(valid[i].bearing, valid[j].bearing));
      bestCrossing = Math.max(bestCrossing, raw > 90 ? 180 - raw : raw);
    }
  }

  const behind = ranges.filter((r) => r.behind).map((r) => r.id);
  const major = ellipse.semiMajorM;
  let quality;
  let note;
  let usable = true;
  if (behind.length) {
    quality = 'contradictory';
    usable = false;
    note = `The crossing falls behind ${behind.join(' and ')} — that observer is pointing away from it. One of these bearings is wrong; the fix is not usable until that is resolved.`;
  } else if (bestCrossing < 12) {
    quality = 'grazing';
    usable = false;
    note = `The bearings cross at only ${bestCrossing.toFixed(0)}°. The fix runs ${(major / 1000).toFixed(1)} km along the line of sight — it says roughly which direction, not where. A third observer off to one side would fix it.`;
  } else if (major > 2000) {
    quality = 'loose';
    note = `A ${bestCrossing.toFixed(0)}° crossing at this range gives an ellipse ${(major / 1000).toFixed(1)} km on its long axis. Good enough to send someone towards, not to send them to.`;
  } else if (major > 500) {
    quality = 'fair';
    note = `Crossing at ${bestCrossing.toFixed(0)}°, fix good to about ${Math.round(major)} m on its long axis.`;
  } else {
    quality = 'good';
    note = `Crossing at ${bestCrossing.toFixed(0)}° with ${valid.length} bearings, fix good to about ${Math.round(major)} m.`;
  }

  return { position, covariance, ellipse, ranges, bestCrossingDeg: bestCrossing, quality, note, usable };
}

/**
 * The result for bearings that never cross.
 *
 * @param {Array<object>} sightings The normalised sightings.
 * @returns {object} An unusable fix that explains itself.
 */
function parallelResult(sightings) {
  return {
    position: sightings[0].position,
    covariance: { ee: Infinity, en: 0, nn: Infinity },
    ellipse: { semiMajorM: Infinity, semiMinorM: Infinity, orientationDeg: sightings[0].bearing },
    ranges: sightings.map((s) => ({ id: s.id, rangeM: Infinity, residualM: 0, behind: false })),
    bestCrossingDeg: 0,
    quality: 'parallel',
    usable: false,
    note: `These bearings are parallel — every observer is looking the same way, so the lines never cross and there is no fix at any distance. The observers and the smoke are in a straight line. Moving one observer off that line, in any direction, is what produces a fix.`,
  };
}

/**
 * A starting point for the weighted solve, from the pair that crosses best.
 *
 * @param {Array<object>} sightings Normalised sightings.
 * @returns {?{position: {lat: number, lon: number}, crossingAngleDeg: number}} The seed.
 */
function seedFromBestPair(sightings) {
  let best = null;
  for (let i = 0; i < sightings.length; i += 1) {
    for (let j = i + 1; j < sightings.length; j += 1) {
      const crossing = crossBearing(sightings[i], sightings[j]);
      if (!crossing) continue;
      if (!best || crossing.crossingAngleDeg > best.crossingAngleDeg) best = crossing;
    }
  }
  if (best) return best;
  // Every pair either crossed behind an observer or was parallel. Fall back to
  // a point a nominal distance along the first bearing, purely so the weighted
  // solve has ranges to work with; the quality checks downstream will reject
  // whatever comes out of it.
  const first = sightings[0];
  return { position: destination(first.position, first.bearing, 10000), crossingAngleDeg: 0 };
}

/**
 * Correct a fix upwind for plume lean, and widen its error by what the
 * correction could not resolve.
 *
 * Half the correction is added back as uncertainty, because the sighted height
 * of a column is itself a guess and the rise rate depends on how hard the fire
 * is burning — which is the thing being looked for. Correcting without widening
 * would replace a known bias with an unknown one and lose the record of it.
 *
 * @param {object} fixResult A result from {@link fix}.
 * @param {object} plume Plume conditions.
 * @param {number} plume.windFromDeg Direction the wind blows from, degrees.
 * @param {number} plume.windMs Wind speed, m/s.
 * @param {number} plume.observedHeightM Height of the sighted part of the column.
 * @param {number} [plume.riseMs=4] Plume rise rate, m/s.
 * @returns {object} A fix corrected towards upwind, with a wider ellipse and
 *   the correction recorded.
 */
export function correctForPlume(fixResult, plume) {
  if (!fixResult) return fixResult;
  const lean = plumeLean({
    observedHeightM: plume.observedHeightM,
    windMs: plume.windMs,
    riseMs: plume.riseMs ?? 4,
  });
  if (!(lean.offsetM > 0)) {
    return { ...fixResult, plumeCorrectionM: 0, plumeNote: 'No plume-lean correction applied.' };
  }
  // The column leans downwind, so the fire is upwind of the sighting: walk back
  // towards where the wind is coming from.
  const upwind = normaliseBearing(plume.windFromDeg);
  const position = destination(fixResult.position, upwind, lean.offsetM);
  const extra = (lean.offsetM / 2) ** 2;
  const covariance = {
    ee: fixResult.covariance.ee + extra,
    en: fixResult.covariance.en,
    nn: fixResult.covariance.nn + extra,
  };
  return {
    ...fixResult,
    position,
    covariance,
    ellipse: covarianceEllipse(covariance, 2),
    plumeCorrectionM: lean.offsetM,
    plumeNote: `${lean.note} The fix has been moved ${Math.round(lean.offsetM)} m upwind to account for it, and its error widened by half that again, because the height and the rise rate are both estimates.`,
  };
}

/**
 * Where a third observer should stand to fix a bad crossing.
 *
 * When two bearings graze, the useful thing to say is not "the fix is poor" but
 * "go here". The best place for another observer is perpendicular to the long
 * axis of the current error ellipse — that is the direction the fix is blind
 * in, and a bearing taken across it collapses the ellipse fastest.
 *
 * @param {object} fixResult A result from {@link fix}.
 * @returns {?{bearingFromFix: number, note: string}} Where to go, or null when
 *   the fix is already good.
 */
export function suggestThirdObserver(fixResult) {
  if (!fixResult || fixResult.ellipse.semiMajorM < 500) return null;
  const across = normaliseBearing(fixResult.ellipse.orientationDeg + 90);
  return {
    bearingFromFix: across,
    note: `The fix is long in the ${Math.round(fixResult.ellipse.orientationDeg)}° direction. A third bearing taken from somewhere on the ${Math.round(across)}° line out of the fix — across the ellipse, not along it — would shorten it the fastest.`,
  };
}

/**
 * Where a bearing line runs, as a drawable segment.
 *
 * @param {object} s A normalised sighting.
 * @param {number} [lengthM=40000] How far to draw it.
 * @returns {{line: Array<{lat: number, lon: number}>, wedge: Array<{lat: number, lon: number}>}}
 *   The centre line and the uncertainty wedge either side of it.
 */
export function bearingGeometry(s, lengthM = 40000) {
  const line = [s.position, destination(s.position, s.bearing, lengthM)];
  const spread = s.sigmaDeg * 2;
  const wedge = [
    s.position,
    destination(s.position, s.bearing - spread, lengthM),
    destination(s.position, s.bearing, lengthM),
    destination(s.position, s.bearing + spread, lengthM),
    s.position,
  ];
  return { line, wedge };
}

export { toDeg };
