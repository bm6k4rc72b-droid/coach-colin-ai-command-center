/**
 * Rothermel's surface fire spread model, implemented rather than approximated.
 *
 * Most fire maps you can open in a browser draw where a fire *was* — a satellite
 * pixel from an overpass that happened some hours ago — and stop. The question
 * anyone standing near it actually has is where it will be, and that question
 * has had a published answer since 1972: Rothermel's surface spread model, the
 * one inside BEHAVE, BehavePlus, FARSITE, FlamMap and every agency spread
 * calculation in the United States. It is not proprietary and it is not
 * complicated. It is just tedious, which is why apps skip it and print an
 * arrow instead.
 *
 * This file is the whole thing: size-class weighting, packing ratio, reaction
 * intensity, moisture and mineral damping, the propagating flux ratio, the wind
 * and slope factors, and the dynamic live moisture of extinction. Anderson's
 * thirteen standard fuel models come with it. The maths follows Rothermel
 * (1972, INT-115) as restated with corrections in Andrews (2018, RMRS-GTR-371).
 *
 * ## Why the arithmetic is in feet and pounds
 *
 * Because the coefficients are. Every constant in Rothermel — the 495 and
 * 0.0594 in the reaction velocity, the 3.348 in the optimum packing ratio, the
 * 138 in the effective heating number — is dimensional and was fitted in
 * English units. Re-deriving them in SI is possible and is how a factor-of-3.28
 * error gets buried somewhere nobody will find it. So the model runs in its own
 * units and converts once, at the door: {@link spreadRate} takes SI and returns
 * SI, and everything between is the 1972 paper.
 *
 * ## What this model is not
 *
 * It is a *surface* fire model, and its limits are as published as its
 * equations. It assumes a fuel bed that is continuous, uniform and homogeneous,
 * burning in a steady state on a uniform slope under a steady wind. Real fires
 * are none of those things. In particular it does not model:
 *
 * - **Crown fire.** When a fire gets into the canopy it decouples from the
 *   surface fuel and can run several times faster than anything here predicts.
 *   {@link crownFireLikely} flags the condition; it does not model the result.
 * - **Spotting.** Embers land kilometres downwind and start fires ahead of the
 *   front. This is what actually destroys towns and no surface model contains it.
 * - **Plume-dominated behaviour**, fire whirls, and the wind a large fire makes
 *   for itself, which stops being the wind you measured.
 *
 * So the number this file returns is a *floor* under plausible behaviour in
 * conditions that suit the model, not a prediction. The app treats it that way:
 * it draws a spread envelope with the uncertainty in it and labels the crown
 * and spotting conditions separately, rather than drawing one confident line
 * and letting a reader assume the fire agreed to stay inside it.
 *
 * @module emberline/rothermel
 */

/** Oven-dry particle density, lb/ft³ — Rothermel's fixed value for all models. */
export const PARTICLE_DENSITY = 32;
/** Total mineral content, fraction. */
export const TOTAL_MINERAL = 0.0555;
/** Effective (silica-free) mineral content, fraction. */
export const EFFECTIVE_MINERAL = 0.010;
/** Low heat content, Btu/lb. */
export const HEAT_CONTENT = 8000;
/** Surface-area-to-volume ratio of 10-hour dead fuel, ft⁻¹. */
export const SAV_10H = 109;
/** Surface-area-to-volume ratio of 100-hour dead fuel, ft⁻¹. */
export const SAV_100H = 30;

/** Tons per acre to pounds per square foot. */
const TON_PER_ACRE = 2000 / 43560;
/** Feet per minute to metres per second. */
const FT_MIN_TO_M_S = 0.3048 / 60;
/** Metres per second to feet per minute — midflame wind goes in this way. */
const M_S_TO_FT_MIN = 60 / 0.3048;

/**
 * Anderson's thirteen standard fire behaviour fuel models (1982, INT-122).
 *
 * Loads are tons per acre as published; depth is feet; `deadMx` is the dead
 * fuel moisture of extinction as a fraction. `sav1h` and `savLive` are the
 * characteristic surface-area-to-volume ratios in ft⁻¹; the 10- and 100-hour
 * classes take the standard 109 and 30.
 *
 * These are the models, not the ground. Fuel model 4 is not "chaparral", it is
 * *a* chaparral — six feet of it, evenly, everywhere, dry. Choosing one is an
 * assertion about a landscape, and the app makes the reader choose rather than
 * picking on their behalf and letting the choice disappear into a number.
 *
 * @type {Readonly<Record<string, {code: string, name: string, group: string,
 *   load1h: number, load10h: number, load100h: number, loadLive: number,
 *   depthFt: number, deadMx: number, sav1h: number, savLive: number,
 *   note: string}>>}
 */
export const FUEL_MODELS = Object.freeze({
  FM1: { code: 'FM1', name: 'Short grass', group: 'Grass', load1h: 0.74, load10h: 0, load100h: 0, loadLive: 0, depthFt: 1.0, deadMx: 0.12, sav1h: 3500, savLive: 1500, note: 'Cured grass under a foot. Fast, light, and out almost as quickly as it arrived.' },
  FM2: { code: 'FM2', name: 'Timber with grass understory', group: 'Grass', load1h: 2.0, load10h: 1.0, load100h: 0.5, loadLive: 0.5, depthFt: 1.0, deadMx: 0.15, sav1h: 3000, savLive: 1500, note: 'Grass carries the fire; the litter and the standing timber add to it.' },
  FM3: { code: 'FM3', name: 'Tall grass', group: 'Grass', load1h: 3.01, load10h: 0, load100h: 0, loadLive: 0, depthFt: 2.5, deadMx: 0.25, sav1h: 1500, savLive: 1500, note: 'Standing grass two to three feet deep. The fastest model in the set.' },
  FM4: { code: 'FM4', name: 'Chaparral', group: 'Brush', load1h: 5.01, load10h: 4.01, load100h: 2.0, loadLive: 5.01, depthFt: 6.0, deadMx: 0.20, sav1h: 2000, savLive: 1500, note: 'Six feet of brush with dead material held up inside it. Intense and hard to stop.' },
  FM5: { code: 'FM5', name: 'Young brush', group: 'Brush', load1h: 1.0, load10h: 0.5, load100h: 0, loadLive: 2.0, depthFt: 2.0, deadMx: 0.20, sav1h: 2000, savLive: 1500, note: 'Green young brush with little dead in it. Fire carries through the litter.' },
  FM6: { code: 'FM6', name: 'Dormant brush', group: 'Brush', load1h: 1.5, load10h: 2.5, load100h: 2.0, loadLive: 0, depthFt: 2.5, deadMx: 0.25, sav1h: 1750, savLive: 1500, note: 'Older brush, cured or dormant. Needs some wind to move.' },
  FM7: { code: 'FM7', name: 'Southern rough', group: 'Brush', load1h: 1.13, load10h: 1.87, load100h: 1.5, loadLive: 0.37, depthFt: 2.5, deadMx: 0.40, sav1h: 1750, savLive: 1500, note: 'Palmetto and gallberry under pine. Burns with the live fuel still green.' },
  FM8: { code: 'FM8', name: 'Closed timber litter', group: 'Timber', load1h: 1.5, load10h: 1.0, load100h: 2.5, loadLive: 0, depthFt: 0.2, deadMx: 0.30, sav1h: 2000, savLive: 1500, note: 'Compact needle and leaf litter under closed canopy. Slow surface creep.' },
  FM9: { code: 'FM9', name: 'Hardwood litter', group: 'Timber', load1h: 2.92, load10h: 0.41, load100h: 0.15, loadLive: 0, depthFt: 0.2, deadMx: 0.25, sav1h: 2500, savLive: 1500, note: 'Long-needle pine or hardwood leaf litter. Faster than FM8, and it spots.' },
  FM10: { code: 'FM10', name: 'Timber with understory', group: 'Timber', load1h: 3.01, load10h: 2.0, load100h: 5.01, loadLive: 2.0, depthFt: 1.0, deadMx: 0.25, sav1h: 2000, savLive: 1500, note: 'Litter plus down material and understory. The model that goes to crown fire.' },
  FM11: { code: 'FM11', name: 'Light slash', group: 'Slash', load1h: 1.5, load10h: 4.51, load100h: 5.51, loadLive: 0, depthFt: 1.0, deadMx: 0.15, sav1h: 1500, savLive: 1500, note: 'Light logging slash, partly covered by herbaceous growth.' },
  FM12: { code: 'FM12', name: 'Medium slash', group: 'Slash', load1h: 4.01, load10h: 14.03, load100h: 16.53, loadLive: 0, depthFt: 2.3, deadMx: 0.20, sav1h: 1500, savLive: 1500, note: 'Continuous slash. Fire intensity is driven by the heavy dead loading.' },
  FM13: { code: 'FM13', name: 'Heavy slash', group: 'Slash', load1h: 7.01, load10h: 23.04, load100h: 28.05, loadLive: 0, depthFt: 3.0, deadMx: 0.25, sav1h: 1500, savLive: 1500, note: 'Heavy slash. Slow to spread, and very hard to put out once it is going.' },
});

/**
 * Read one fuel model by code, case-insensitively.
 *
 * @param {string} code Model code such as `FM10`, or `10`.
 * @returns {?object} The model, or null when nothing matches.
 */
export function fuelModel(code) {
  if (code == null) return null;
  const key = String(code).toUpperCase().startsWith('FM')
    ? String(code).toUpperCase()
    : `FM${String(code).trim()}`;
  return FUEL_MODELS[key] ?? null;
}

/**
 * Weighted characteristics of one fuel category (dead or live).
 *
 * Rothermel weights every size class by the surface area it contributes, not by
 * its mass, because it is surface area that exchanges heat. A tonne of 100-hour
 * logs and a tonne of fine grass are the same mass and nothing like the same
 * fire: the grass has a hundred times the surface area and burns accordingly.
 *
 * @param {Array<{loadLbFt2: number, sav: number, moisture: number}>} classes Size classes.
 * @returns {{area: number, sav: number, load: number, moisture: number,
 *   heating: number, preignition: number}} Surface area, area-weighted SAV,
 *   summed load, weighted moisture, and the weighted heating and preignition
 *   terms the denominator needs.
 */
export function weightCategory(classes) {
  const present = classes.filter((c) => c.loadLbFt2 > 0 && c.sav > 0);
  const area = present.reduce((sum, c) => sum + (c.sav * c.loadLbFt2) / PARTICLE_DENSITY, 0);
  if (area <= 0) {
    return { area: 0, sav: 0, load: 0, moisture: 0, heating: 0, preignition: 0 };
  }
  let sav = 0;
  let load = 0;
  let moisture = 0;
  let heating = 0;
  let preignition = 0;
  for (const c of present) {
    const f = (c.sav * c.loadLbFt2) / PARTICLE_DENSITY / area;
    sav += f * c.sav;
    load += c.loadLbFt2;
    moisture += f * c.moisture;
    const epsilon = Math.exp(-138 / c.sav);
    heating += f * epsilon;
    preignition += f * epsilon * (250 + 1116 * c.moisture);
  }
  return { area, sav, load, moisture, heating, preignition };
}

/**
 * Rothermel's moisture damping coefficient.
 *
 * Runs from 1 at bone dry to 0 at the moisture of extinction, and the app
 * depends on the endpoint being exactly zero: a fuel at its extinction moisture
 * does not spread slowly, it does not spread. Returning a small positive number
 * there would let a spread envelope creep across ground that will not carry
 * fire, which is the failure that gets a line built in the wrong place.
 *
 * @param {number} moisture Fuel moisture, fraction of oven-dry weight.
 * @param {number} mx Moisture of extinction, same units.
 * @returns {number} Damping coefficient in `[0, 1]`.
 */
export function moistureDamping(moisture, mx) {
  if (!(mx > 0)) return 0;
  const r = Math.min(1, Math.max(0, moisture / mx));
  if (r >= 1) return 0;
  return Math.max(0, 1 - 2.59 * r + 5.11 * r ** 2 - 3.52 * r ** 3);
}

/** Mineral damping coefficient — a constant for the standard mineral content. @returns {number} */
export function mineralDamping() {
  return Math.min(1, 0.174 * EFFECTIVE_MINERAL ** -0.19);
}

/**
 * Live fuel moisture of extinction, which is not a constant.
 *
 * Green fuel will not carry fire by itself; it burns because dry dead fuel
 * beside it drives off the water first. So the moisture at which live fuel
 * stops spreading depends on how dry the dead fuel is — Rothermel's dynamic
 * live extinction. Treating it as a fixed 250% (a common shortcut) makes brush
 * models spread in conditions where they would not, which is the wrong
 * direction for an error in this app to point.
 *
 * @param {{load: number, heating: number, moisture: number}} dead Weighted dead category.
 * @param {{load: number, heating: number}} liveCat Weighted live category.
 * @param {number} deadMx Dead moisture of extinction.
 * @returns {number} Live moisture of extinction, fraction.
 */
export function liveExtinction(dead, liveCat, deadMx) {
  if (!(liveCat.load > 0) || !(liveCat.heating > 0)) return deadMx;
  const ratio = (dead.load * dead.heating) / (liveCat.load * liveCat.heating);
  const fineDeadMoisture = dead.moisture;
  const mx = 2.9 * ratio * (1 - fineDeadMoisture / deadMx) - 0.226;
  return Math.max(deadMx, mx);
}

/**
 * The whole spread calculation, in SI at both ends.
 *
 * @param {object} input Conditions.
 * @param {string} input.fuel Fuel model code, e.g. `FM10`.
 * @param {number} [input.moisture1h=0.06] 1-hour dead fuel moisture, fraction.
 * @param {number} [input.moisture10h] 10-hour moisture; defaults to 1-hour + 1 point.
 * @param {number} [input.moisture100h] 100-hour moisture; defaults to 1-hour + 3 points.
 * @param {number} [input.moistureLive=1.0] Live fuel moisture, fraction (1.0 = 100%).
 * @param {number} [input.midflameWindMs=0] Midflame wind speed, m/s. Not the
 *   20-foot wind and not the forecast wind — see {@link midflameWind}.
 * @param {number} [input.slopeDeg=0] Upslope angle in degrees.
 * @returns {{rateOfSpreadMs: number, rateOfSpreadMMin: number,
 *   reactionIntensityKwM2: number, firelineIntensityKwM: number,
 *   flameLengthM: number, packingRatio: number, relativePackingRatio: number,
 *   windFactor: number, slopeFactor: number, heatPerAreaKjM2: number,
 *   characteristicSav: number, willSpread: boolean, limit: ?string}}
 *   Spread rate and the intermediates worth showing, in SI.
 */
export function spreadRate(input) {
  const model = fuelModel(input.fuel);
  if (!model) throw new Error(`Unknown fuel model: ${input.fuel}`);

  const m1 = clampMoisture(input.moisture1h ?? 0.06);
  const m10 = clampMoisture(input.moisture10h ?? m1 + 0.01);
  const m100 = clampMoisture(input.moisture100h ?? m1 + 0.03);
  const mLive = clampMoisture(input.moistureLive ?? 1.0, 5);

  const dead = weightCategory([
    { loadLbFt2: model.load1h * TON_PER_ACRE, sav: model.sav1h, moisture: m1 },
    { loadLbFt2: model.load10h * TON_PER_ACRE, sav: SAV_10H, moisture: m10 },
    { loadLbFt2: model.load100h * TON_PER_ACRE, sav: SAV_100H, moisture: m100 },
  ]);
  const liveCat = weightCategory([
    { loadLbFt2: model.loadLive * TON_PER_ACRE, sav: model.savLive, moisture: mLive },
  ]);

  const totalArea = dead.area + liveCat.area;
  if (!(totalArea > 0)) {
    return notSpreading('This fuel model carries no load.');
  }
  const fDead = dead.area / totalArea;
  const fLive = liveCat.area / totalArea;
  // Bed characteristic SAV: categories weighted by their share of surface area.
  const sigma = fDead * dead.sav + fLive * liveCat.sav;

  const totalLoad = dead.load + liveCat.load;
  const bulkDensity = totalLoad / model.depthFt;
  const beta = bulkDensity / PARTICLE_DENSITY;
  const betaOp = 3.348 * sigma ** -0.8189;
  const relativeBeta = beta / betaOp;

  const A = 133 * sigma ** -0.7913;
  const gammaMax = sigma ** 1.5 / (495 + 0.0594 * sigma ** 1.5);
  const gamma = gammaMax * relativeBeta ** A * Math.exp(A * (1 - relativeBeta));

  const etaS = mineralDamping();
  const deadEtaM = moistureDamping(dead.moisture, model.deadMx);
  const liveMx = liveExtinction(dead, liveCat, model.deadMx);
  const liveEtaM = liveCat.load > 0 ? moistureDamping(liveCat.moisture, liveMx) : 0;

  // Net loads: mineral-free, because minerals do not burn.
  const netDead = dead.load * (1 - TOTAL_MINERAL);
  const netLive = liveCat.load * (1 - TOTAL_MINERAL);
  const reactionIntensity =
    gamma * HEAT_CONTENT * etaS * (netDead * deadEtaM + netLive * liveEtaM); // Btu/ft²/min

  if (!(reactionIntensity > 0)) {
    const reason =
      dead.moisture >= model.deadMx
        ? `Dead fuel is at or above this model's moisture of extinction (${(model.deadMx * 100).toFixed(0)}%).`
        : 'Nothing in this fuel bed is dry enough to sustain a reaction.';
    return notSpreading(reason);
  }

  const xi =
    Math.exp((0.792 + 0.681 * Math.sqrt(sigma)) * (beta + 0.1)) / (192 + 0.2595 * sigma);

  const windFtMin = Math.max(0, input.midflameWindMs ?? 0) * M_S_TO_FT_MIN;
  const C = 7.47 * Math.exp(-0.133 * sigma ** 0.55);
  const B = 0.02526 * sigma ** 0.54;
  const E = 0.715 * Math.exp(-3.59e-4 * sigma);
  let phiW = C * windFtMin ** B * relativeBeta ** -E;

  const slopeRad = (Math.max(0, input.slopeDeg ?? 0) * Math.PI) / 180;
  const phiS = 5.275 * beta ** -0.3 * Math.tan(slopeRad) ** 2;

  // Rothermel's effective wind limit: past it the model is extrapolating beyond
  // the wind tunnel it was fitted in, and the published guidance is to cap it
  // rather than let the exponent run away. Capping is reported, not hidden.
  const maxPhiW = 0.9 * reactionIntensity;
  let limit = null;
  if (phiW > maxPhiW) {
    phiW = maxPhiW;
    limit = 'Wind factor capped at Rothermel’s effective wind limit — the model is past the data it was fitted on, and the real fire may be faster than this.';
  }

  // The heat sink: bulk density times the area-weighted effective heating
  // number times the heat of preignition, both of which weightCategory already
  // folded together per category.
  const heatSink = bulkDensity * (fDead * dead.preignition + fLive * liveCat.preignition);
  if (!(heatSink > 0)) return notSpreading('The fuel bed has no heat sink to overcome.');

  const rosFtMin = (reactionIntensity * xi * (1 + phiW + phiS)) / heatSink;

  // Byram's fireline intensity needs residence time; Anderson's 384/sigma is
  // the standard estimate, in minutes.
  const residenceMin = 384 / sigma;
  const heatPerAreaBtuFt2 = reactionIntensity * residenceMin;
  const firelineBtuFtS = (heatPerAreaBtuFt2 * rosFtMin) / 60;
  const firelineKwM = firelineBtuFtS * 3.46414;
  // Byram (1959): flame length in feet = 0.45 * I^0.46 with I in Btu/ft/s.
  const flameLengthFt = firelineBtuFtS > 0 ? 0.45 * firelineBtuFtS ** 0.46 : 0;

  return {
    rateOfSpreadMs: rosFtMin * FT_MIN_TO_M_S,
    rateOfSpreadMMin: rosFtMin * 0.3048,
    reactionIntensityKwM2: reactionIntensity * 0.189422,
    firelineIntensityKwM: firelineKwM,
    flameLengthM: flameLengthFt * 0.3048,
    packingRatio: beta,
    relativePackingRatio: relativeBeta,
    windFactor: phiW,
    slopeFactor: phiS,
    heatPerAreaKjM2: heatPerAreaBtuFt2 * 11.3565,
    characteristicSav: sigma,
    willSpread: rosFtMin > 0,
    limit,
  };
}

/**
 * The zero result, with the reason attached.
 *
 * @param {string} reason Why nothing spreads.
 * @returns {object} A spread result with every rate at zero.
 */
function notSpreading(reason) {
  return {
    rateOfSpreadMs: 0,
    rateOfSpreadMMin: 0,
    reactionIntensityKwM2: 0,
    firelineIntensityKwM: 0,
    flameLengthM: 0,
    packingRatio: 0,
    relativePackingRatio: 0,
    windFactor: 0,
    slopeFactor: 0,
    heatPerAreaKjM2: 0,
    characteristicSav: 0,
    willSpread: false,
    limit: reason,
  };
}

/**
 * Keep a moisture fraction inside something physical.
 *
 * @param {number} value Moisture as a fraction.
 * @param {number} [max=3] Upper bound; live fuel legitimately exceeds 100%.
 * @returns {number} The clamped value.
 */
function clampMoisture(value, max = 3) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

/**
 * Convert a 20-foot or 10-metre wind to the midflame wind the model wants.
 *
 * This conversion is where most casual spread estimates go wrong, and it goes
 * wrong in the dangerous direction. Rothermel wants the wind at the flames.
 * Forecasts give the wind well above them. Under a closed canopy the midflame
 * wind can be a fifth of the wind aloft; feeding the forecast straight in
 * predicts a fire several times faster than the one that will actually happen,
 * and a prediction that cries wolf gets switched off before the day it is right.
 *
 * The factors are the standard sheltered/unsheltered values from Albini and
 * Baughman via Andrews (2018). They are coarse. They are still much better than
 * skipping the step.
 *
 * @param {number} windMs Wind speed at the reference height, m/s.
 * @param {'open'|'sparse'|'moderate'|'dense'} [shelter='open'] Canopy shelter.
 * @param {'20ft'|'10m'} [reference='10m'] Which reference height the wind is at.
 * @returns {{midflameMs: number, factor: number, note: string}} Midflame wind
 *   and the factor applied.
 */
export function midflameWind(windMs, shelter = 'open', reference = '10m') {
  // A 10 m wind is about 1.15 times the 20 ft (6.1 m) wind over open ground.
  const at20ft = reference === '10m' ? Math.max(0, windMs) / 1.15 : Math.max(0, windMs);
  const factors = { open: 0.4, sparse: 0.3, moderate: 0.2, dense: 0.1 };
  const notes = {
    open: 'Open fuel, no overstory — 0.4 of the 20-foot wind.',
    sparse: 'Scattered overstory — 0.3 of the 20-foot wind.',
    moderate: 'Partly sheltered under canopy — 0.2 of the 20-foot wind.',
    dense: 'Fully sheltered under closed canopy — 0.1 of the 20-foot wind.',
  };
  const factor = factors[shelter] ?? factors.open;
  return {
    midflameMs: at20ft * factor,
    factor,
    note: notes[shelter] ?? notes.open,
  };
}

/**
 * Van Wagner's crowning condition, as a flag rather than a model.
 *
 * If the surface fire's intensity exceeds what it takes to ignite the base of
 * the canopy, the fire can leave the surface — and once it does, nothing else
 * in this file applies. The app raises this as a separate warning precisely
 * because the spread envelope it draws is a surface envelope: under crowning
 * conditions the envelope is not conservative, it is wrong.
 *
 * @param {number} firelineIntensityKwM Surface fireline intensity, kW/m.
 * @param {number} canopyBaseHeightM Height to the bottom of the live crown, m.
 * @param {number} [foliarMoisture=1.0] Foliar moisture content, fraction.
 * @returns {{likely: boolean, thresholdKwM: number, note: string}} Whether the
 *   threshold is crossed, and by how much.
 */
export function crownFireLikely(firelineIntensityKwM, canopyBaseHeightM, foliarMoisture = 1.0) {
  if (!(canopyBaseHeightM > 0)) {
    return { likely: false, thresholdKwM: Infinity, note: 'No canopy given — surface fire only.' };
  }
  // Van Wagner (1977): I0 = (0.010 * CBH * (460 + 25.9 * FMC))^1.5, kW/m.
  const threshold = (0.010 * canopyBaseHeightM * (460 + 25.9 * foliarMoisture * 100)) ** 1.5;
  const likely = firelineIntensityKwM >= threshold;
  return {
    likely,
    thresholdKwM: threshold,
    note: likely
      ? `Surface intensity ${Math.round(firelineIntensityKwM)} kW/m is past the ${Math.round(threshold)} kW/m it takes to reach a crown base at ${canopyBaseHeightM} m. Everything this app draws is a surface prediction and a crown run would outpace it.`
      : `Surface intensity ${Math.round(firelineIntensityKwM)} kW/m is below the ${Math.round(threshold)} kW/m crowning threshold for a ${canopyBaseHeightM} m crown base.`,
  };
}

/**
 * What a fire of this flame length can be fought with.
 *
 * The thresholds are the standard fire-suppression interpretations that go with
 * Byram's flame length — the ones printed on the back of a fire behaviour
 * field reference — and they are the reason flame length is worth computing at
 * all. A rate of spread tells you where the fire goes. Flame length tells you
 * whether anybody can stand in front of it.
 *
 * @param {number} flameLengthM Flame length, metres.
 * @returns {{class: string, headline: string, detail: string}} The interpretation.
 */
export function suppressionClass(flameLengthM) {
  const ft = flameLengthM / 0.3048;
  if (ft < 4) {
    return {
      class: 'direct-hand',
      headline: 'Hand crews can work the head',
      detail: 'Under 4 ft of flame. Hand tools at the fire edge, direct attack.',
    };
  }
  if (ft < 8) {
    return {
      class: 'direct-equipment',
      headline: 'Too hot for hand tools at the head',
      detail: '4–8 ft. Dozers, engines and retarder drops; hand crews on the flanks only.',
    };
  }
  if (ft < 11) {
    return {
      class: 'indirect',
      headline: 'Direct attack at the head will fail',
      detail: '8–11 ft. Expect torching, spotting and crowning. Indirect attack.',
    };
  }
  return {
    class: 'no-attack',
    headline: 'Control efforts at the head are not effective',
    detail: 'Over 11 ft. Crowning and major spotting. Nothing holds the head until the weather changes.',
  };
}
