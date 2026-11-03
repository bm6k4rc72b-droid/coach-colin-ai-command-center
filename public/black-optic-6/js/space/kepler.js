/**
 * Two-body orbital mechanics for the Orbit deck: where the planets are, and
 * where an asteroid is, on any date.
 *
 * Planets use JPL's "Keplerian Elements for Approximate Positions of the Major
 * Planets" (E. M. Standish, JPL Solar System Dynamics), Table 1, valid
 * 1800–2050 AD. Its stated errors over that span are at most about 15″ of
 * longitude for Mercury–Mars and a few arcminutes for the outer planets —
 * far below a pixel on a whole-solar-system map. Positions are heliocentric,
 * ecliptic and equinox of J2000, in astronomical units.
 *
 * Asteroids use the osculating elements JPL's Small-Body Database publishes
 * (a, e, i, Ω, ω, M at an epoch, and mean motion n), propagated as a pure
 * two-body ellipse. That is right for drawing the orbit and where the object
 * is along it within months of the epoch. It is not an impact prediction:
 * close approaches are bent by Earth's gravity, which only JPL's numerical
 * integration (the Sentry and close-approach data on this deck) accounts for.
 *
 * Time: the formulas want Barycentric Dynamical Time; this module is given
 * UTC. The difference (about 69 s) moves Earth by 2,000 km, which is nothing
 * at this scale and is stated rather than hidden.
 *
 * @module black-optic-6/space/kepler
 */

export const RAD = Math.PI / 180;
export const AU_KM = 149597870.7; // IAU 2012, exact
export const LD_KM = 384400; // mean lunar distance
export const J2000 = 2451545.0;
/** Gaussian gravitational constant k, in degrees per day: n = K_DEG / a^1.5 for a in au. */
export const K_DEG = 0.01720209895 / RAD;

/** Julian Date of a JS Date (UTC). */
export const julian = (date) => +date / 86400000 + 2440587.5;
/** JS Date of a Julian Date. */
export const fromJulian = (jd) => new Date((jd - 2440587.5) * 86400000);

/**
 * JPL Table 1: [a, e, I, L, ϖ (long. perihelion), Ω (long. node)] at J2000 and
 * their rates per Julian century. Units au and degrees. "earth" is the
 * Earth–Moon barycentre, as in the table.
 */
export const PLANETS = Object.freeze({
  mercury: { el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593], rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081], radiusKm: 2439.7, colour: '#b5a7a1' },
  venus: { el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255], rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418], radiusKm: 6051.8, colour: '#e8c98f' },
  earth: { el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0], radiusKm: 6371.0, colour: '#4fa3ff' },
  mars: { el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891], rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343], radiusKm: 3389.5, colour: '#e0603a' },
  jupiter: { el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106], radiusKm: 69911, colour: '#d9b38c' },
  saturn: { el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], radiusKm: 58232, colour: '#e6d29a' },
  uranus: { el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503], rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589], radiusKm: 25362, colour: '#9fe3e8' },
  neptune: { el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664], radiusKm: 24622, colour: '#5b7cff' },
});

/** Wrap degrees to (−180, 180]. */
export function wrap180(deg) {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/**
 * Solve Kepler's equation M = E − e sin E for the eccentric anomaly.
 * Newton–Raphson to 1e-14 rad; starts at π for high eccentricity so it cannot
 * overshoot.
 *
 * @param {number} M Mean anomaly, radians.
 * @param {number} e Eccentricity, 0 ≤ e < 1.
 * @returns {number} E, radians.
 */
export function solveKepler(M, e) {
  const m = wrap180(M / RAD) * RAD;
  let E = e < 0.8 ? m + e * Math.sin(m) : Math.PI * Math.sign(m || 1);
  for (let k = 0; k < 50; k += 1) {
    const f = E - e * Math.sin(E) - m;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/**
 * Position on an ellipse from classical elements.
 *
 * @param {{a: number, e: number, i: number, om: number, w: number}} o
 *   a in au; i, Ω (om), ω (w) in degrees.
 * @param {number} E Eccentric anomaly, radians.
 * @returns {number[]} [x, y, z] heliocentric ecliptic J2000, au.
 */
export function ellipsePoint(o, E) {
  const xp = o.a * (Math.cos(E) - o.e);
  const yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const cw = Math.cos(o.w * RAD); const sw = Math.sin(o.w * RAD);
  const cO = Math.cos(o.om * RAD); const sO = Math.sin(o.om * RAD);
  const cI = Math.cos(o.i * RAD); const sI = Math.sin(o.i * RAD);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** A planet's elements at a Julian Date, in the small-body form {a, e, i, om, w, M}. */
export function planetElements(name, jd) {
  const p = PLANETS[name];
  if (!p) throw new Error(`Unknown planet ${name}`);
  const T = (jd - J2000) / 36525;
  const [a, e, I, L, varpi, Om] = p.el.map((v, k) => v + p.rate[k] * T);
  return { a, e, i: I, om: Om, w: varpi - Om, M: L - varpi };
}

/** Heliocentric ecliptic J2000 position of a planet, au. */
export function planetPosition(name, jd) {
  const o = planetElements(name, jd);
  return ellipsePoint(o, solveKepler(o.M * RAD, o.e));
}

/**
 * Small-body elements to a position on a date (two-body).
 *
 * @param {{a: number, e: number, i: number, om: number, w: number, ma: number, epoch: number, n?: number}} o
 *   ma = mean anomaly at epoch (deg); epoch is a Julian Date; n in deg/day
 *   (derived from a by Kepler's third law when missing).
 * @param {number} jd
 * @returns {number[]|null} au, or null for an unbound (e ≥ 1) orbit.
 */
export function bodyPosition(o, jd) {
  if (!(o.e < 1) || !(o.a > 0)) return null;
  const n = Number.isFinite(o.n) ? o.n : K_DEG / o.a ** 1.5;
  const M = (o.ma + n * (jd - o.epoch)) * RAD;
  return ellipsePoint(o, solveKepler(M, o.e));
}

/** Orbital period in days (Kepler's third law, Sun's mass only). */
export const periodDays = (a) => 360 / (K_DEG / a ** 1.5);

/** Points around a whole orbit, evenly spaced in eccentric anomaly. */
export function orbitPath(o, steps = 180) {
  if (!(o.e < 1) || !(o.a > 0)) return [];
  const pts = [];
  for (let k = 0; k <= steps; k += 1) pts.push(ellipsePoint(o, (2 * Math.PI * k) / steps));
  return pts;
}

/** Distance between two points, au. */
export const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
