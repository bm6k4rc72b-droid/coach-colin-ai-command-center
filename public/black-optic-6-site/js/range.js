/**
 * The range — a ballistics trainer against steel at known distance.
 *
 * What this is: drop, wind drift, time of flight and holdover, solved for a
 * load and a zero, practised against static plates. What it is not, and will
 * not become: anything that acquires, tracks or aims at a person. The concept
 * board asked for an autonomous turret; that row sits in the console's ledger
 * marked UNSOUND and it stays there. Steel does not move, does not need
 * identifying, and is the only thing on this page a solution is computed for.
 *
 * **On the accuracy of the solver, stated up front.** This is the flat-fire
 * exponential-drag approximation: drag is taken as proportional to v², so
 * velocity falls as v₀·e^(−kx) and time of flight closes in a single
 * expression. Real G1 drag varies with Mach number, so a single k cannot be
 * right everywhere — fitted against published tables this model runs within
 * roughly 2 inches to 300 yards and 6 to 500 for ordinary centrefire loads,
 * drifting to about a foot by 600 and degrading badly past transonic, where
 * the real drag curve turns over and a single k cannot follow it. That is
 * fine for learning what a 10 mph crosswind costs you at 400. It is not a
 * substitute for a real solver and a chronograph when you are zeroing, and the
 * console labels every number it produces MODELLED for exactly that reason.
 *
 * Every function here is pure and in imperial units, because that is what
 * turrets, tables and everyone at an American range actually speak.
 *
 * @module black-optic-6-site/range
 */

/** Gravity, inches per second squared. */
export const G_IN = 386.088;

/** Feet per second per mile per hour. */
export const FPS_PER_MPH = 1.4666667;

/** Inches subtended by one minute of angle at 100 yards. A true MOA, not a shooter's inch. */
export const MOA_IN_100 = 1.047;

/** Inches subtended by one milliradian at 100 yards. */
export const MIL_IN_100 = 3.6;

/**
 * The retardation constant, fitted so the single-exponential model tracks
 * published G1 tables across common centrefire velocities.
 *
 * k = RETARDATION / BC, per foot of travel.
 */
export const RETARDATION = 1.25e-4;

/** A handful of loads a ranch actually has in the safe. */
export const LOADS = Object.freeze([
  { id: '223-55', name: '.223 Rem · 55 gr', bc: 0.243, mv: 3240, note: 'Varmint and predator work. Light for wind.' },
  { id: '223-77', name: '.223 Rem · 77 gr', bc: 0.372, mv: 2750, note: 'Heavy-for-calibre. Holds up noticeably better past 300.' },
  { id: '308-168', name: '.308 Win · 168 gr', bc: 0.462, mv: 2650, note: 'The reference load most tables are written around.' },
  { id: '308-175', name: '.308 Win · 175 gr', bc: 0.505, mv: 2600, note: 'Slower, and still flatter past 500 than the 168.' },
  { id: '6-5cm-140', name: '6.5 Creedmoor · 140 gr', bc: 0.610, mv: 2700, note: 'Why everyone changed rifles. Half the wind of a .308.' },
  { id: '3006-180', name: '.30-06 · 180 gr', bc: 0.507, mv: 2700, note: 'The deer rifle in the corner of the barn.' },
  { id: '22lr-40', name: '.22 LR · 40 gr', bc: 0.138, mv: 1080, note: 'Subsonic. Drops like a thrown rock and teaches wind better than anything.' },
]);

/** Steel and paper at measured distance. Sizes are the real plate sizes. */
export const TARGETS = Object.freeze([
  { id: 'plate-100', name: '8" plate', yards: 100, diameterIn: 8, kind: 'steel' },
  { id: 'plate-200', name: '10" plate', yards: 200, diameterIn: 10, kind: 'steel' },
  { id: 'plate-300', name: '12" plate', yards: 300, diameterIn: 12, kind: 'steel' },
  { id: 'ipsc-400', name: 'IPSC A-zone', yards: 400, diameterIn: 11, kind: 'steel' },
  { id: 'plate-500', name: '18" gong', yards: 500, diameterIn: 18, kind: 'steel' },
  { id: 'plate-600', name: '24" gong', yards: 600, diameterIn: 24, kind: 'steel' },
]);

/** Look up a load by id. */
export function load(id) {
  return LOADS.find((l) => l.id === id) || LOADS[2];
}

/** Retardation constant per foot for a ballistic coefficient and air density ratio. */
export function dragK(bc, densityRatio = 1) {
  const coefficient = Math.max(bc, 0.02);
  return (RETARDATION / coefficient) * Math.max(densityRatio, 0.2);
}

/**
 * Air density ratio against sea level standard, from altitude and temperature.
 *
 * The exponential atmosphere for pressure, the ideal gas law for temperature.
 * At 4,000 ft on a 95 °F afternoon this comes out near 0.82 — which is about
 * 4 inches less drop at 500 yards than a sea-level table predicts, and the
 * reason a Napa summer zero and a Sierra hunt are not the same dope.
 */
export function densityRatio(altitudeFt = 0, tempF = 59) {
  const pressureRatio = Math.exp(-altitudeFt / 27500);
  const tempRankine = tempF + 459.67;
  const standardRankine = 59 + 459.67;
  return pressureRatio * (standardRankine / Math.max(tempRankine, 1));
}

/** Remaining velocity, fps, after a distance in yards. */
export function velocityAt(loadSpec, yards, densityRatioValue = 1) {
  const feet = Math.max(yards, 0) * 3;
  return loadSpec.mv * Math.exp(-dragK(loadSpec.bc, densityRatioValue) * feet);
}

/**
 * Time of flight, seconds, to a distance in yards.
 *
 * With v = v₀·e^(−kx), integrating dx/v gives t = (e^(kx) − 1) / (k·v₀). The
 * k → 0 branch is the vacuum case and is here so the function does not divide
 * by zero for an absurd BC.
 */
export function timeOfFlight(loadSpec, yards, densityRatioValue = 1) {
  const feet = Math.max(yards, 0) * 3;
  const k = dragK(loadSpec.bc, densityRatioValue);
  if (k <= 0) return feet / loadSpec.mv;
  return (Math.exp(k * feet) - 1) / (k * loadSpec.mv);
}

/** Drop below the bore line, inches — pure gravity acting for the time of flight. */
export function dropInches(loadSpec, yards, densityRatioValue = 1) {
  const t = timeOfFlight(loadSpec, yards, densityRatioValue);
  return 0.5 * G_IN * t * t;
}

/**
 * Bullet path relative to the line of sight, inches. Negative is low.
 *
 * At the muzzle the bullet starts `sightHeight` below the sight line, crosses
 * it twice, and is zero at the zero range by construction.
 */
export function pathInches(loadSpec, yards, { zeroYd = 100, sightHeight = 1.8, densityRatio: dr = 1 } = {}) {
  const dropX = dropInches(loadSpec, yards, dr);
  const dropZ = dropInches(loadSpec, zeroYd, dr);
  const ratio = zeroYd > 0 ? yards / zeroYd : 0;
  return ratio * (dropZ + sightHeight) - dropX - sightHeight;
}

/**
 * Crosswind drift, inches, by the lag-time rule.
 *
 * Drift is the crosswind speed multiplied by how much longer the bullet took
 * than a vacuum round would have — not by the full time of flight. Getting
 * this wrong roughly doubles every wind call, and it is the single most common
 * error in home-made ballistics code.
 */
export function windDriftInches(loadSpec, yards, { windMph = 0, windAngleDeg = 90, densityRatio: dr = 1 } = {}) {
  const t = timeOfFlight(loadSpec, yards, dr);
  const vacuum = (yards * 3) / loadSpec.mv;
  const lag = Math.max(t - vacuum, 0);
  const crosswind = windMph * FPS_PER_MPH * Math.sin((windAngleDeg * Math.PI) / 180);
  return crosswind * lag * 12;
}

/** Inches at a distance → minutes of angle. */
export function inchesToMoa(inches, yards) {
  if (!(yards > 0)) return 0;
  return inches / (MOA_IN_100 * (yards / 100));
}

/** Inches at a distance → milliradians. */
export function inchesToMil(inches, yards) {
  if (!(yards > 0)) return 0;
  return inches / (MIL_IN_100 * (yards / 100));
}

/**
 * The full firing solution for one target.
 *
 * `holdMoa` and `holdMil` are what to dial *up*, so they are positive when the
 * bullet is low — which is what a turret expects and the opposite sign to the
 * path itself.
 */
export function solve(loadSpec, yards, options = {}) {
  const dr = options.densityRatio ?? densityRatio(options.altitudeFt ?? 0, options.tempF ?? 59);
  const opts = { ...options, densityRatio: dr };
  const path = pathInches(loadSpec, yards, opts);
  const drift = windDriftInches(loadSpec, yards, opts);
  const t = timeOfFlight(loadSpec, yards, dr);
  const v = velocityAt(loadSpec, yards, dr);
  return {
    yards,
    timeOfFlight: t,
    velocity: v,
    /** Mach, near enough — 1125 fps at sea level standard. Below 1.2 the model is fraying. */
    mach: v / 1125,
    pathIn: path,
    driftIn: drift,
    holdMoa: inchesToMoa(-path, yards),
    holdMil: inchesToMil(-path, yards),
    windMoa: inchesToMoa(drift, yards),
    windMil: inchesToMil(drift, yards),
    densityRatio: dr,
    /** Honest flag: past transonic the single-k model is outside its fit. */
    confident: v / 1125 > 1.2,
  };
}

/** A whole dope card, one row per distance. */
export function dopeCard(loadSpec, options = {}, distances = [100, 200, 300, 400, 500, 600]) {
  return distances.map((yards) => solve(loadSpec, yards, options));
}

/**
 * Score a shot.
 *
 * The trainer's job is to teach that a miss has a cause. `aim` is where the
 * shooter put the crosshair relative to target centre, in inches at the
 * target; the solution says where the bullet actually went. The returned
 * `cause` names the dominant error so the feedback is "you under-held for
 * drop", not "miss".
 */
export function scoreShot(loadSpec, target, aim = { x: 0, y: 0 }, options = {}) {
  const firing = solve(loadSpec, target.yards, options);
  const impactX = aim.x + firing.driftIn;
  const impactY = aim.y + firing.pathIn;
  const miss = Math.hypot(impactX, impactY);
  const radius = target.diameterIn / 2;
  const hit = miss <= radius;

  let cause = 'centre hit';
  if (!hit) {
    cause = Math.abs(impactY) > Math.abs(impactX)
      ? (impactY < 0 ? 'low — not enough elevation for the drop' : 'high — over-held')
      : (impactX > 0 ? 'right — under-called the wind' : 'left — over-called the wind');
  } else if (miss > radius * 0.5) {
    cause = 'edge hit';
  }

  return {
    hit,
    impactIn: { x: impactX, y: impactY },
    missIn: miss,
    missMoa: inchesToMoa(miss, target.yards),
    cause,
    firing,
  };
}

/** The perfect hold for a target — what the trainer reveals after the shot. */
export function perfectHold(loadSpec, target, options = {}) {
  const firing = solve(loadSpec, target.yards, options);
  return { x: -firing.driftIn, y: -firing.pathIn, firing };
}
