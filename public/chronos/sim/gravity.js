// CHRONOS · gravitational time dilation: GPS clocks and black holes.
//
// Weak field, clock at radius r moving at v, compared with a clock on the ground (R⊕):
//   Δrate ≈ GM/c²·(1/R⊕ − 1/r) − v²/(2c²) + v⊕²/(2c²)
//   GPS (r = 26 571 km, v = 3.87 km/s):  +45.7 µs/day (gravity) − 7.2 µs/day (speed) = +38.5 µs/day
//   If uncorrected, ranging error grows at c·38.5 µs ≈ 11.5 km per day.
// Schwarzschild black hole, r_s = 2GM/c²:
//   hovering static observer        dτ/dt = √(1 − r_s/r)
//   circular geodesic orbit         dτ/dt = √(1 − 3r_s/(2r))     (photon sphere at 1.5 r_s, ISCO at 3 r_s)
//   proper acceleration to hover    a = GM / (r²·√(1 − r_s/r))
//   tidal stretch over length L     Δa ≈ 2GM·L / r³

export const G = 6.674e-11, C = 2.99792458e8, MSUN = 1.989e30, GM_E = 3.986004418e14, R_E = 6.371e6, DAY = 86400;
const OMEGA_E = 7.2921e-5;

// Clock-rate offset (seconds per day) of a circular-orbit clock at altitude h (m) vs a clock on the equator.
export function orbitClock(h) {
  const r = R_E + h, v = Math.sqrt(GM_E / r), vg = OMEGA_E * R_E;
  const grav = (GM_E / C ** 2) * (1 / R_E - 1 / r) * DAY;
  const speed = -((v * v - vg * vg) / (2 * C ** 2)) * DAY;
  return { r, v, grav, speed, net: grav + speed, error: Math.abs(grav + speed) * C };   // error: metres of range per day
}
export const ORBITS = { iss: 408e3, starlink: 550e3, gps: 20.2e6, geo: 35.786e6 };
// Altitude where the two effects cancel: v²/2 = GM(1/R − 1/r) → r = 1.5 R (ignoring Earth's rotation).
export const breakEven = () => 0.5 * R_E;

export const BH = { stellar: 10, sgra: 4.3e6, m87: 6.5e9, gargantua: 1e8 };
export function blackHole(Msun, rOverRs, L = 2) {
  const M = Msun * MSUN, rs = (2 * G * M) / C ** 2, r = rOverRs * rs;
  const hover = Math.sqrt(Math.max(0, 1 - 1 / rOverRs));
  const orbit = rOverRs > 1.5 ? Math.sqrt(1 - 1.5 / rOverRs) : NaN;
  const aHover = (G * M) / (r * r * Math.max(1e-12, hover));
  const tidal = (2 * G * M * L) / r ** 3;
  return { M, rs, r, hover, orbit, factor: 1 / hover, aHover, tidal, stableOrbit: rOverRs >= 3 };
}
// How close (r/r_s) a static hover must be for a given slow-down factor f:  1 − r_s/r = 1/f²
export const rForFactor = (f) => 1 / (1 - 1 / (f * f));
