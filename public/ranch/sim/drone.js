// RANCH OPS · drone physics, cameras, search planning and flight rules.
//
// Rotor power (momentum theory)
//   Hover induced velocity   v_h = √(T / (2ρA))            A = n·π·r² (total disc area)
//   Ideal hover power        P_ideal = T·v_h = T^1.5 / √(2ρA)
//   Forward flight (Glauert) v_i = v_h² / √(V² + v_i²)      (solved by fixed-point iteration)
//   Profile power            P₀ = P_ideal·(1/FM − κ),  grows as (1 + 4.65·μ²), μ = V / V_tip
//   Total                    P = κ·T·v_i + P₀·(1 + 4.65μ²) + ½·ρ·CdA·V³ + P_avionics
//                            (κ ≈ 1.15 induced-loss factor; FM = figure of merit, the hover efficiency)
//   Endurance                t = E_usable / P;  range = V·t
//
// Cameras
//   Ground footprint         W = s_w·h / f,   H = s_h·h / f
//   Ground sample distance   GSD = s_w·h / (f·N_px)          (metres per pixel)
//   Johnson criteria         cycles N = d_crit / (2·GSD); P(N) = (N/N50)^E / (1 + (N/N50)^E), E = 2.7 + 0.7·N/N50
//
// Search (Koopman)
//   Coverage                 C = W·L / A
//   Random search            POD = 1 − e^(−C·p)
//   Parallel sweep           POD = p·min(1, C)              (p = single-look detection probability)

export const G0 = 9.80665;
export const RHO0 = 1.225;
export const airDensity = (altM, tempC = 15) => { const T = tempC + 273.15 - 0.0065 * altM; return (101325 * (1 - 2.25577e-5 * altM) ** 5.25588) / (287.05 * T); };

export const DRONES = {
  scout: { name: 'SCOUT quad', mass: 0.95, rotors: 4, r: 0.12, FM: 0.55, CdA: 0.03, avionics: 12, batteryWh: 77, usable: 0.85, vmax: 21, vtip: 95 },
  hauler: { name: 'HAULER hexa', mass: 6.8, rotors: 6, r: 0.27, FM: 0.62, CdA: 0.12, avionics: 35, batteryWh: 700, usable: 0.8, vmax: 17, vtip: 120 },
};
export const CAMERAS = {
  rgb: { name: 'RGB 4/3″', sw: 17.3, sh: 13.0, f: 12.3, px: 5280, py: 3956 },
  thermal: { name: 'Thermal 640', sw: 7.68, sh: 6.14, f: 9.1, px: 640, py: 512 },
};
export const PART107 = { maxAltM: 121.9, maxSpeed: 44.7, vlosM: 800 };   // 400 ft AGL, 100 mph; VLOS by eye (rule of thumb for a small drone)

export const discArea = (D) => D.rotors * Math.PI * D.r * D.r;
export function hoverInduced(D, payload = 0, rho = RHO0) { const T = (D.mass + payload) * G0; return Math.sqrt(T / (2 * rho * discArea(D))); }
// Power (W) at airspeed V (m/s).
export function power(D, V, payload = 0, rho = RHO0) {
  const T = (D.mass + payload) * G0, vh = hoverInduced(D, payload, rho);
  let vi = vh; for (let i = 0; i < 40; i++) vi = 0.5 * vi + 0.5 * (vh * vh) / Math.sqrt(V * V + vi * vi);
  const kappa = 1.15, Pideal = T * vh, mu = V / D.vtip;
  const induced = kappa * T * vi, profile = Pideal * (1 / D.FM - kappa) * (1 + 4.65 * mu * mu), parasite = 0.5 * rho * D.CdA * V ** 3;
  return { total: induced + profile + parasite + D.avionics, induced, profile, parasite, avionics: D.avionics, vi, vh, T };
}
export const hoverPower = (D, payload = 0, rho = RHO0) => power(D, 0, payload, rho).total;
export const enduranceMin = (D, V, payload = 0, rho = RHO0) => ((D.batteryWh * D.usable * 3600) / power(D, V, payload, rho).total) / 60;
// Best-endurance speed (min power) and best-range speed (min P/V, with headwind w: min P/(V − w)).
export function bestSpeeds(D, payload = 0, rho = RHO0, headwind = 0) {
  let vE = 0, pE = Infinity, vR = 0, eR = Infinity;
  for (let V = 0; V <= D.vmax; V += 0.1) {
    const P = power(D, V, payload, rho).total; if (P < pE) { pE = P; vE = V; }
    const gs = V - headwind; if (gs > 0.5 && P / gs < eR) { eR = P / gs; vR = V; }
  }
  return { vE, pE, vR, jPerM: eR };
}

export const footprint = (C, h) => ({ w: (C.sw * h) / C.f, h: (C.sh * h) / C.f });
export const gsd = (C, h) => (C.sw * h) / (C.f * C.px);
export const hfov = (C) => 2 * Math.atan(C.sw / (2 * C.f));
// Johnson criteria (cycles across the critical dimension for 50 % probability).
export const JOHNSON = { detect: 1.0, recognize: 4.0, identify: 6.4 };
export function johnsonP(dCrit, g, task) {
  const N = dCrit / (2 * g), r = N / JOHNSON[task], E = 2.7 + 0.7 * r;
  return { N, P: r ** E / (1 + r ** E) };
}
// The highest altitude at which a task still reaches probability P (solve r from P, then h).
export function maxAltFor(C, dCrit, task, P = 0.5) {
  let lo = 0, hi = 5; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, E = 2.7 + 0.7 * m, p = m ** E / (1 + m ** E); if (p < P) lo = m; else hi = m; }
  const N = hi * JOHNSON[task], g = dCrit / (2 * N);
  return (g * C.f * C.px) / C.sw;
}

// Lawn-mower survey of a W×L rectangle at altitude h with side overlap.
export function lawnmower(C, h, rect, sidelap, V, turnS = 6) {
  const fp = footprint(C, h), swath = fp.w * (1 - sidelap), lanes = Math.max(1, Math.ceil(rect.w / swath));
  const length = lanes * rect.l + (lanes - 1) * swath, time = length / V + (lanes - 1) * turnS;
  const coverage = (lanes * swath * rect.l) / (rect.w * rect.l);
  return { fp, swath, lanes, length, time, coverage };
}
export const podRandom = (C, p) => 1 - Math.exp(-C * p);
export const podSweep = (C, p) => p * Math.min(1, C);

// Flight-rule checks for a planned mission.
export function rules(plan) {
  const out = [];
  out.push({ k: 'alt', ok: plan.alt <= PART107.maxAltM, v: plan.alt });
  out.push({ k: 'speed', ok: plan.V <= PART107.maxSpeed, v: plan.V });
  out.push({ k: 'vlos', ok: plan.maxDist <= PART107.vlosM || plan.observer, v: plan.maxDist });
  out.push({ k: 'night', ok: !plan.night || plan.strobe, v: plan.night });
  out.push({ k: 'reserve', ok: plan.reserve >= 0.2, v: plan.reserve });
  return out;
}

// Thermal contrast: fleece insulates, so the radiating surface sits between core and air.
// Surface ≈ T_air + (T_core − T_air)·k, with k ≈ 0.25 through a full fleece and ≈ 0.7 on the face and legs.
export const surfaceTemp = (core, air, k = 0.25) => air + (core - air) * k;
