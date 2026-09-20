/**
 * Growing a fire forward in time, as a band rather than a line.
 *
 * Rothermel gives one number — a head rate of spread for one set of inputs.
 * Turning it into a map needs two more things, and the second is the one that
 * usually gets left out.
 *
 * The first is shape. A fire under wind is not a circle; it is close to an
 * ellipse with the ignition point at the rear focus, running fast downwind,
 * slowly upwind, and somewhere between across the flanks. That is Anderson's
 * (1983) elliptical model, which is what FARSITE propagates and what this file
 * uses.
 *
 * The second is that the inputs are guesses. Fuel moisture is a guess unless
 * someone weighed a sample this morning. Midflame wind is a forecast wind times
 * a shelter factor that is one of four coarse numbers. Fuel model is a person
 * looking at a hillside and picking a category. Every one of those is uncertain
 * by enough to move the arrival time at a given address by an hour, and a
 * single crisp polygon on a map is read as though none of them were.
 *
 * So nothing here returns one ellipse. {@link projectSpread} returns three —
 * slow, expected and fast — computed by running the whole model again at the
 * ends of a stated plausible band for the inputs. The gap between the fast ring
 * and the slow ring *is* the uncertainty, drawn at the size it actually is, and
 * when that gap is embarrassingly wide the honest response is to show it, not to
 * average it away.
 *
 * An arrival time from this file is therefore a window: "between 41 and 118
 * minutes", not "at 74 minutes". A window is what an evacuation decision
 * actually needs, and it is the shape of the answer the model can support.
 *
 * @module emberline/spread
 */

import { destination, distanceM, bearingDeg, fromLocal, toLocal, ringAreaM2, toHectares } from './geo.js';
import { spreadRate, midflameWind, crownFireLikely, suppressionClass } from './rothermel.js';

/**
 * Length-to-breadth ratio of the fire ellipse, from midflame wind.
 *
 * Anderson (1983), as used by FARSITE. At no wind the fire is a circle (ratio
 * 1) and grows equally in every direction; by 10 m/s it is a long finger. The
 * ratio is capped at 8 because past there the ellipse stops being a useful
 * description of anything — a fire that elongated is running in fingers and
 * spotting ahead of itself, and neither is an ellipse.
 *
 * @param {number} midflameWindMs Midflame wind speed, m/s.
 * @returns {number} Length divided by breadth, at least 1.
 */
export function lengthToBreadth(midflameWindMs) {
  const mph = Math.max(0, midflameWindMs) * 2.23694;
  const ratio = 0.936 * Math.exp(0.2566 * mph) + 0.461 * Math.exp(-0.1548 * mph) - 0.397;
  return Math.min(8, Math.max(1, ratio));
}

/**
 * Head-to-back spread ratio implied by an ellipse's shape.
 *
 * @param {number} lb Length-to-breadth ratio.
 * @returns {number} How many times faster the head runs than the back.
 */
export function headBackRatio(lb) {
  const ratio = Math.max(1, lb);
  if (ratio <= 1.0000001) return 1;
  const root = Math.sqrt(ratio * ratio - 1);
  return (ratio + root) / (ratio - root);
}

/**
 * The plausible band the inputs are actually known to.
 *
 * These are not error bars in any statistical sense and the module does not
 * pretend they are. They are the range within which a competent person
 * estimating these quantities in the field would not be surprised to be wrong,
 * and they are stated here, in one place, so a reader can disagree with them
 * explicitly instead of inheriting them silently.
 *
 * @type {Readonly<{windLow: number, windHigh: number, moistureDelta: number}>}
 */
export const INPUT_BAND = Object.freeze({
  /** Midflame wind could be this fraction of the estimate — the shelter factor is coarse. */
  windLow: 0.6,
  /** Or this multiple of it — gusts, terrain channelling, a wrong shelter class. */
  windHigh: 1.6,
  /** Dead fuel moisture, plus or minus this many points of moisture content. */
  moistureDelta: 0.02,
});

/**
 * How far ahead a steady-state model is worth believing, minutes.
 *
 * Rothermel assumes the wind, the moisture and the fuel hold constant. Over an
 * hour that is a reasonable simplification. Over eight it is not: the wind will
 * have turned, the sun will have gone down and the relative humidity recovered,
 * and the fire will have been burning through fuel the model never looked at.
 * Arrival windows past this are reported with that said out loud rather than
 * printed as though they were a time somebody could plan around.
 */
export const STEADY_STATE_HORIZON_MIN = 8 * 60;

/**
 * Run Rothermel at the expected inputs and at both ends of the band.
 *
 * @param {object} conditions Fire conditions.
 * @param {string} conditions.fuel Fuel model code.
 * @param {number} conditions.windMs Wind speed at the reference height, m/s.
 * @param {number} conditions.windFromDeg Direction the wind blows *from*, degrees.
 * @param {'open'|'sparse'|'moderate'|'dense'} [conditions.shelter='open'] Canopy shelter.
 * @param {'20ft'|'10m'} [conditions.windReference='10m'] Reference height of `windMs`.
 * @param {number} [conditions.moisture1h=0.06] 1-hour dead fuel moisture, fraction.
 * @param {number} [conditions.moistureLive=1.0] Live fuel moisture, fraction.
 * @param {number} [conditions.slopeDeg=0] Slope angle, degrees.
 * @param {number} [conditions.aspectDeg] Downslope direction, degrees. Slope only
 *   pushes the fire uphill; when the wind blows downhill the two fight and the
 *   model here takes the honest, conservative view — see {@link headingOf}.
 * @param {number} [conditions.canopyBaseHeightM] Crown base height for the crowning check.
 * @returns {{expected: object, slow: object, fast: object, midflame: object,
 *   heading: number, lengthToBreadth: number, crown: object, suppression: object}}
 *   The three model runs and what goes with them.
 */
export function evaluate(conditions) {
  const shelter = conditions.shelter ?? 'open';
  const reference = conditions.windReference ?? '10m';
  const moisture = conditions.moisture1h ?? 0.06;
  const midflame = midflameWind(conditions.windMs ?? 0, shelter, reference);

  const run = (windMs, moisture1h) =>
    spreadRate({
      fuel: conditions.fuel,
      moisture1h,
      moistureLive: conditions.moistureLive ?? 1.0,
      midflameWindMs: windMs,
      slopeDeg: conditions.slopeDeg ?? 0,
    });

  const expected = run(midflame.midflameMs, moisture);
  // Slow: less wind and wetter fuel. Fast: more wind and drier fuel. Pairing
  // them this way is deliberate — the two errors are correlated in the field,
  // because the weather that dries fuel is the weather that brings wind.
  const slow = run(midflame.midflameMs * INPUT_BAND.windLow, moisture + INPUT_BAND.moistureDelta);
  const fast = run(
    midflame.midflameMs * INPUT_BAND.windHigh,
    Math.max(0, moisture - INPUT_BAND.moistureDelta),
  );

  return {
    expected,
    slow,
    fast,
    midflame,
    heading: headingOf(conditions),
    lengthToBreadth: lengthToBreadth(midflame.midflameMs),
    crown: crownFireLikely(
      expected.firelineIntensityKwM,
      conditions.canopyBaseHeightM ?? 0,
      conditions.foliarMoisture ?? 1.0,
    ),
    suppression: suppressionClass(expected.flameLengthM),
  };
}

/**
 * Which way the head of the fire points.
 *
 * Wind direction is reported as the direction it comes *from*, so a wind from
 * 315° pushes fire towards 135°. Slope pushes fire straight up, which is the
 * reciprocal of the aspect. When both act they are combined as vectors weighted
 * by the factor each contributes, which is the standard treatment and is right
 * for the common case where they roughly agree.
 *
 * @param {object} conditions The same conditions {@link evaluate} takes.
 * @returns {number} Heading of the fire's head, degrees from true north.
 */
export function headingOf(conditions) {
  const windTo = ((conditions.windFromDeg ?? 0) + 180) % 360;
  const slope = conditions.slopeDeg ?? 0;
  if (!(slope > 0) || conditions.aspectDeg == null) return windTo;
  const upslope = ((conditions.aspectDeg ?? 0) + 180) % 360;
  const midflame = midflameWind(conditions.windMs ?? 0, conditions.shelter ?? 'open', conditions.windReference ?? '10m');
  const model = spreadRate({
    fuel: conditions.fuel,
    moisture1h: conditions.moisture1h ?? 0.06,
    moistureLive: conditions.moistureLive ?? 1.0,
    midflameWindMs: midflame.midflameMs,
    slopeDeg: slope,
  });
  const w = model.windFactor;
  const s = model.slopeFactor;
  if (!(w + s > 0)) return windTo;
  const rad = Math.PI / 180;
  const e = w * Math.sin(windTo * rad) + s * Math.sin(upslope * rad);
  const n = w * Math.cos(windTo * rad) + s * Math.cos(upslope * rad);
  return ((Math.atan2(e, n) / rad) + 360) % 360;
}

/**
 * The ellipse a fire of a given head rate occupies after a given time.
 *
 * @param {{lat: number, lon: number}} origin Ignition point.
 * @param {number} headRateMs Head rate of spread, m/s.
 * @param {number} headingDeg Direction the head runs, degrees from north.
 * @param {number} lb Length-to-breadth ratio.
 * @param {number} seconds Elapsed time.
 * @param {number} [steps=64] Vertices in the returned ring.
 * @returns {{ring: Array<{lat: number, lon: number}>, headM: number, backM: number,
 *   widthM: number, areaHa: number}} The perimeter and its dimensions.
 */
export function fireEllipse(origin, headRateMs, headingDeg, lb, seconds, steps = 64) {
  const head = Math.max(0, headRateMs) * Math.max(0, seconds);
  const back = head / headBackRatio(lb);
  const semiMajor = (head + back) / 2;
  const semiMinor = semiMajor / Math.max(1, lb);
  // The ignition point is not the centre: it sits `back` behind the head, so
  // the ellipse centre is offset forward along the heading by this much.
  const offset = semiMajor - back;
  const rad = Math.PI / 180;
  const theta = headingDeg * rad;
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const along = offset + semiMajor * Math.cos(t);
    const across = semiMinor * Math.sin(t);
    const n = along * Math.cos(theta) - across * Math.sin(theta);
    const e = along * Math.sin(theta) + across * Math.cos(theta);
    ring.push(fromLocal(origin, { e, n }));
  }
  return {
    ring,
    headM: head,
    backM: back,
    widthM: semiMinor * 2,
    areaHa: toHectares(Math.PI * semiMajor * semiMinor),
  };
}

/**
 * Project a fire forward and return the slow, expected and fast perimeters.
 *
 * @param {{lat: number, lon: number}} origin Ignition point.
 * @param {object} conditions Conditions as {@link evaluate} takes them.
 * @param {number} minutes How far forward to project.
 * @returns {{minutes: number, heading: number, slow: object, expected: object,
 *   fast: object, model: object, spreadsAtAll: boolean}} Three perimeters and
 *   the model run behind them.
 */
export function projectSpread(origin, conditions, minutes) {
  const model = evaluate(conditions);
  const seconds = Math.max(0, minutes) * 60;
  const lb = model.lengthToBreadth;
  return {
    minutes,
    heading: model.heading,
    slow: fireEllipse(origin, model.slow.rateOfSpreadMs, model.heading, lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windLow), seconds),
    expected: fireEllipse(origin, model.expected.rateOfSpreadMs, model.heading, lb, seconds),
    fast: fireEllipse(origin, model.fast.rateOfSpreadMs, model.heading, lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windHigh), seconds),
    model,
    spreadsAtAll: model.expected.willSpread || model.fast.willSpread,
  };
}

/**
 * A sequence of perimeters at several horizons, for drawing time rings.
 *
 * @param {{lat: number, lon: number}} origin Ignition point.
 * @param {object} conditions Conditions.
 * @param {number[]} [horizons=[30, 60, 120, 180]] Minutes to project to.
 * @returns {Array<object>} One {@link projectSpread} result per horizon.
 */
export function spreadSeries(origin, conditions, horizons = [30, 60, 120, 180]) {
  const model = evaluate(conditions);
  const lb = model.lengthToBreadth;
  const lbSlow = lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windLow);
  const lbFast = lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windHigh);
  return horizons.map((minutes) => {
    const seconds = minutes * 60;
    return {
      minutes,
      heading: model.heading,
      slow: fireEllipse(origin, model.slow.rateOfSpreadMs, model.heading, lbSlow, seconds),
      expected: fireEllipse(origin, model.expected.rateOfSpreadMs, model.heading, lb, seconds),
      fast: fireEllipse(origin, model.fast.rateOfSpreadMs, model.heading, lbFast, seconds),
      model,
      spreadsAtAll: model.expected.willSpread || model.fast.willSpread,
    };
  });
}

/**
 * When the fire reaches a place — as a window, and never as a single time.
 *
 * This is the output the whole file exists for. Somebody has a house, a road, a
 * camp, a substation, and one question about it. The answer that helps them is
 * "the earliest plausible arrival is 41 minutes"; the answer that hurts them is
 * a single confident "74 minutes" that they plan against and that was computed
 * from a moisture value nobody measured.
 *
 * The rate along a bearing that is not the heading is taken from the ellipse,
 * so a target on the flank correctly gets a much later window than one directly
 * downwind, and a target upwind of the fire gets the backing rate.
 *
 * @param {{lat: number, lon: number}} origin Ignition point.
 * @param {{lat: number, lon: number}} target The place in question.
 * @param {object} conditions Conditions.
 * @returns {{distanceM: number, bearingDeg: number, offHeadingDeg: number,
 *   earliestMin: ?number, expectedMin: ?number, latestMin: ?number,
 *   reachable: boolean, beyondHorizon: boolean, note: string}} The arrival window.
 */
export function arrivalWindow(origin, target, conditions) {
  const model = evaluate(conditions);
  const range = distanceM(origin, target);
  const bearing = bearingDeg(origin, target);
  let off = Math.abs(((bearing - model.heading + 540) % 360) - 180);

  const rateAt = (headRateMs, lb) => {
    if (!(headRateMs > 0)) return 0;
    // Speed along a bearing on an ellipse whose head runs at headRateMs: solve
    // the ellipse's radius from the rear focus at this angle off the heading.
    const hb = headBackRatio(lb);
    const back = headRateMs / hb;
    const a = (headRateMs + back) / 2;
    const b = a / Math.max(1, lb);
    const c = Math.sqrt(Math.max(0, a * a - b * b));
    const theta = (off * Math.PI) / 180;
    // Polar form of an ellipse measured from a focus.
    const denominator = a - c * Math.cos(theta);
    if (!(denominator > 0)) return 0;
    return (b * b) / denominator;
  };

  const fastRate = rateAt(model.fast.rateOfSpreadMs, lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windHigh));
  const expectedRate = rateAt(model.expected.rateOfSpreadMs, model.lengthToBreadth);
  const slowRate = rateAt(model.slow.rateOfSpreadMs, lengthToBreadth(model.midflame.midflameMs * INPUT_BAND.windLow));

  const minutesFor = (rate) => (rate > 0 ? range / rate / 60 : null);
  const expected = minutesFor(expectedRate);
  // The window is the envelope of all three runs, not "the fast run is the
  // early edge". Off the heading it genuinely is not: a weaker wind makes a
  // rounder fire, and a rounder fire spreads *faster* on its flanks than an
  // elongated one does, even though its head is slower. Taking the fast run as
  // the early bound would have quietly reported a flank window whose early edge
  // was later than its late edge.
  const candidates = [fastRate, expectedRate, slowRate].map(minutesFor).filter((m) => m != null);
  const earliest = candidates.length ? Math.min(...candidates) : null;
  const latest = candidates.length ? Math.max(...candidates) : null;

  const reachable = earliest != null;
  // Past this, "the conditions stay as they are" has stopped being an
  // assumption and become a fiction: the wind will have turned, the sun will
  // have set and the humidity recovered, or a crew will have been there for
  // hours. The number is still returned, flagged, because refusing to answer is
  // its own kind of dishonesty.
  const beyondHorizon = earliest != null && earliest > STEADY_STATE_HORIZON_MIN;
  let note;
  if (!reachable) {
    note = model.expected.limit ?? 'The model does not spread fire into this place under these conditions.';
  } else if (beyondHorizon) {
    note = `Every plausible arrival here is more than ${Math.round(STEADY_STATE_HORIZON_MIN / 60)} hours out. The model assumes today's wind and moisture hold for that whole time, and they will not — treat this as "not soon", not as a time.`;
  } else if (off < 30) {
    note = 'This place is close to directly downwind of the fire — the fastest part of the front is pointed at it.';
  } else if (off > 150) {
    note = 'This place is upwind. The fire backs towards it slowly, and a wind shift is what would change that, not the spread rate.';
  } else {
    note = 'This place is on the flank. Flank rates are the least reliable part of the model, and a wind shift turns a flank into a head.';
  }

  return {
    distanceM: range,
    bearingDeg: bearing,
    offHeadingDeg: off,
    earliestMin: earliest,
    expectedMin: expected,
    latestMin: latest,
    reachable,
    beyondHorizon,
    note,
  };
}

/**
 * How much a wind shift would change things, stated before it happens.
 *
 * Wind shifts are the single most consequential thing that happens on a fire,
 * because a flank that has been creeping for three hours is a long front, and
 * when the wind comes round it all becomes a head at once. This tests the
 * places that are quiet now and would not be.
 *
 * @param {{lat: number, lon: number}} origin Ignition point.
 * @param {Array<{name: string, lat: number, lon: number}>} places Places of concern.
 * @param {object} conditions Current conditions.
 * @param {number} [shiftDeg=45] Size of the shift to test, either way.
 * @returns {Array<{name: string, nowMin: ?number, shiftedMin: ?number,
 *   shiftDeg: number, factor: ?number}>} What each place's earliest arrival
 *   becomes under the worse of the two shifts.
 */
export function windShiftExposure(origin, places, conditions, shiftDeg = 45) {
  return places.map((place) => {
    const target = { lat: place.lat, lon: place.lon };
    const now = arrivalWindow(origin, target, conditions).earliestMin;
    let worst = now;
    let worstShift = 0;
    for (const delta of [-shiftDeg, shiftDeg]) {
      const shifted = arrivalWindow(origin, target, {
        ...conditions,
        windFromDeg: (((conditions.windFromDeg ?? 0) + delta) % 360 + 360) % 360,
      }).earliestMin;
      if (shifted != null && (worst == null || shifted < worst)) {
        worst = shifted;
        worstShift = delta;
      }
    }
    return {
      name: place.name,
      nowMin: now,
      shiftedMin: worst,
      shiftDeg: worstShift,
      factor: now != null && worst != null && worst > 0 ? now / worst : null,
    };
  });
}

/**
 * Area actually enclosed by a projected perimeter.
 *
 * @param {object} projection A {@link projectSpread} result.
 * @returns {{slowHa: number, expectedHa: number, fastHa: number}} Hectares.
 */
export function projectedArea(projection) {
  return {
    slowHa: toHectares(ringAreaM2(projection.slow.ring)),
    expectedHa: toHectares(ringAreaM2(projection.expected.ring)),
    fastHa: toHectares(ringAreaM2(projection.fast.ring)),
  };
}

export { destination, toLocal };
