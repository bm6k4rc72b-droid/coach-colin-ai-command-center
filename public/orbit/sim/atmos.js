// ORBIT · shared constants and the atmosphere.
//
// U.S. Standard Atmosphere 1976 to 84.852 km geopotential (seven layers with
// fixed lapse rates, hydrostatic pressure in closed form), then an
// exponential tail with a 7 km scale height, which is plenty for drag above
// the Kármán line.

export const G0 = 9.80665;              // m/s², standard gravity
export const MU = 3.986004418e14;       // m³/s², Earth GM (WGS-84 / IERS)
export const RE = 6.378137e6;           // m, equatorial radius (WGS-84)
export const R_MEAN = 6.371e6;          // m, mean radius (atmosphere geopotential)
export const OMEGA_E = 7.2921159e-5;    // rad/s, Earth sidereal rotation rate
export const J2 = 1.08262668e-3;
export const R_AIR = 287.05287, GAMMA = 1.4;

const LAYERS = [
  // base geopotential height (m), base temperature (K), lapse (K/m), base pressure (Pa)
  [0, 288.15, -0.0065, 101325],
  [11000, 216.65, 0, 22632.06],
  [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187],
  [47000, 270.65, 0, 110.9063],
  [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
  [84852, 186.946, 0, 0.3733836],
];

// Geometric altitude z (m) → { T, p, rho, a }.
export function atmosphere(z) {
  const h = Math.max(-500, (R_MEAN * z) / (R_MEAN + z));      // geopotential
  if (h > 84852) {
    const L = LAYERS[7], T = 186.87, rho84 = L[3] / (R_AIR * L[1]);
    const k = Math.exp(-(h - 84852) / 7000);
    return { T, p: L[3] * k, rho: rho84 * k, a: Math.sqrt(GAMMA * R_AIR * T) };
  }
  let i = LAYERS.length - 1; while (i > 0 && h < LAYERS[i][0]) i--;
  const [hb, Tb, L, pb] = LAYERS[i], T = Tb + L * (h - hb);
  const p = L === 0 ? pb * Math.exp((-G0 * (h - hb)) / (R_AIR * Tb)) : pb * (Tb / T) ** (G0 / (R_AIR * L));
  return { T, p, rho: p / (R_AIR * T), a: Math.sqrt(GAMMA * R_AIR * T) };
}
export const RHO0 = 1.225;
