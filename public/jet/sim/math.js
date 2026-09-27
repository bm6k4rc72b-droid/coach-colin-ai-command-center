// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · FLIGHT MATHEMATICS
//
//  Geodesy on a spherical Earth (mean radius R = 6371.0088 km):
//    haversine distance   d = 2R·asin √( sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2) )
//    initial bearing      θ = atan2( sinΔλ·cosφ₂ , cosφ₁·sinφ₂ − sinφ₁·cosφ₂·cosΔλ )
//    destination point    φ₂ = asin( sinφ₁·cosδ + cosφ₁·sinδ·cosθ )
//                         λ₂ = λ₁ + atan2( sinθ·sinδ·cosφ₁ , cosδ − sinφ₁·sinφ₂ )
//    intermediate points  spherical linear interpolation (slerp) of unit vectors
//  Atmosphere: ICAO standard atmosphere (ISA) to 20 km.
//  Cruise: Breguet range equation for jets,  R = (V / c) · (L/D) · ln(W_i / W_f),
//    c = thrust-specific fuel consumption expressed per second (1/s).
// ─────────────────────────────────────────────────────────────────────────────

export const R_EARTH_KM = 6371.0088;
export const NM = 1.852;                 // km per nautical mile
export const FT = 0.3048;                // m per foot
export const G0 = 9.80665;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

export function haversineKm(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function initialBearing(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}
export function destination(a, bearingDeg, distKm) {
  const p1 = a.lat * D2R, l1 = a.lon * D2R, th = bearingDeg * D2R, d = distKm / R_EARTH_KM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * R2D, lon: ((l2 * R2D + 540) % 360) - 180 };
}
export const toVec = (p) => { const f = p.lat * D2R, l = p.lon * D2R; return [Math.cos(f) * Math.cos(l), Math.sin(f), -Math.cos(f) * Math.sin(l)]; };
// Great-circle path as unit vectors (slerp), n + 1 points.
export function greatCircle(a, b, n = 96) {
  const A = toVec(a), B = toVec(b);
  const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const om = Math.acos(dot), so = Math.sin(om);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (so < 1e-9) { pts.push(A.slice()); continue; }
    const k1 = Math.sin((1 - t) * om) / so, k2 = Math.sin(t * om) / so;
    pts.push([k1 * A[0] + k2 * B[0], k1 * A[1] + k2 * B[1], k1 * A[2] + k2 * B[2]]);
  }
  return pts;
}
// Small circle of radius distKm around a point (the reachable ring).
export function rangeRing(a, distKm, n = 180) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(toVec(destination(a, (i / n) * 360, Math.min(distKm, Math.PI * R_EARTH_KM * 0.999))));
  return pts;
}

// ── ICAO standard atmosphere ───────────────────────────────────
// Troposphere (h ≤ 11 km): T = 288.15 − 0.0065·h,  p = 101325·(T/288.15)^(g0/(L·R))
// Tropopause (11–20 km):   T = 216.65,           p = 22632.06·exp(−g0·(h−11000)/(R·T))
const RAIR = 287.05287, L = 0.0065, EXP = G0 / (L * RAIR);
export function isa(hMetres) {
  const h = Math.max(0, hMetres);
  if (h <= 11000) { const T = 288.15 - L * h; return { T, p: 101325 * Math.pow(T / 288.15, EXP), a: Math.sqrt(1.4 * RAIR * T) }; }
  const T = 216.65; return { T, p: 22632.06 * Math.exp(-G0 * (h - 11000) / (RAIR * T)), a: Math.sqrt(1.4 * RAIR * T) };
}
// Inverse: pressure altitude for a pressure (Pa).
export function pressureAltitude(p) {
  if (p >= 22632.06) return (288.15 / L) * (1 - Math.pow(p / 101325, 1 / EXP));
  return 11000 - (RAIR * 216.65 / G0) * Math.log(p / 22632.06);
}
// Cabin altitude at a cruise altitude with a maximum pressure differential Δp (psi).
export function cabinAltitudeFt(cruiseFt, dpPsi) {
  const pAmb = isa(cruiseFt * FT).p;
  const pCab = Math.min(101325, pAmb + dpPsi * 6894.757);
  return Math.max(0, pressureAltitude(pCab) / FT);
}

// ── Mission: Breguet cruise with fixed allowances ──────────────
// W_zf = empty + interior + payload.  Arrival weight must still carry the reserve
// fuel F_r, so  W_f = W_zf + F_r  and  W_i = W_f · e^(R/K),  K = (V/c)·(L/D).
// Fuel required = W_i − W_zf + taxi/climb allowance. Feasible if ≤ capacity and W_i ≤ MTOW.
export function mission(ac, { distKm, payloadKg, interiorKg }) {
  const atm = isa(ac.cruiseFt * FT);
  const V = ac.mach * atm.a;                                      // true airspeed, m/s
  const c = ac.tsfc / 3600;                                       // 1/s
  const K = (V / c) * ac.LD;                                      // metres
  const Wzf = ac.oew + interiorKg + payloadKg;
  // Reserves (NBAA-style): 200 nm to an alternate + 30 min hold, both at cruise efficiency.
  const reserveDist = 200 * NM * 1000 + V * 1800;
  const Fr = Wzf * (Math.exp(reserveDist / K) - 1);
  const Rm = distKm * 1000 * 1.02;                                // 2 % routing allowance
  const Wf = Wzf + Fr;
  const Wi = Wf * Math.exp(Rm / K);
  const allowance = ac.taxiClimbKg;
  const fuel = Wi - Wzf + allowance;
  const tow = Wzf + fuel;
  // Maximum still-air range with full tanks (or MTOW-limited), same reserves.
  const fuelMax = Math.min(ac.fuelCap, ac.mtow - Wzf);
  const WiMax = Wzf + fuelMax - allowance;
  const rangeMaxKm = Math.max(0, (K * Math.log(WiMax / Wf)) / 1000 / 1.02);
  const timeH = distKm * 1000 * 1.02 / V / 3600 + ac.climbDescentH;
  return {
    V, ktas: V / 0.514444, K, Wzf, Fr, fuel, tow, feasible: fuel <= ac.fuelCap && tow <= ac.mtow,
    fuelLimited: fuel > ac.fuelCap, mtowLimited: tow > ac.mtow, rangeMaxKm, timeH,
    burn: Wi - Wf, co2: (Wi - Wf + allowance) * 3.16,                // 3.16 kg CO₂ per kg Jet-A
  };
}

// ── Colour temperature → linear-ish sRGB (Tanner Helland fit to CIE 1931 black body) ──
export function kelvinToRGB(K) {
  const t = K / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = (v) => Math.max(0, Math.min(255, v)) / 255;
  return [cl(r), cl(g), cl(b)];
}
