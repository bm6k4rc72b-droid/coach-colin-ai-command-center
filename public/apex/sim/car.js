// APEX · the car: aerodynamics from the setup, power unit, gearing and tyres.
//
// Aerodynamic forces (ρ = 1.2 kg/m³):   Downforce  F_z = ½ρ·C_L A·v²    Drag  F_d = ½ρ·C_D A·v²
//   C_L A grows with wing angle and with ground effect; ground effect peaks at an optimal ride height
//   and collapses (porpoising) when the floor runs too low.
// Weight transfer:   longitudinal ΔF_z = m·a_x·h/L,   lateral ΔF_z = m·a_y·h/t
// Tyres (Pacejka "magic formula"):   F = D·sin(C·atan(B·x − E·(B·x − atan(B·x)))),   D = μ·F_z
//   load sensitivity  μ = μ₀·(1 − k·(F_z/F_z0 − 1))       temperature window  μ·exp(−½((T − T_opt)/w)²)
// Top speed: P·η = ½ρ·C_D A·v³ + C_rr·m·g·v

export const RHO = 1.2, G = 9.81;
export const CAR = { mass: 798, power: 735e3, eta: 0.92, crr: 0.012, h: 0.30, L: 3.6, track: 1.6, rWheel: 0.36, rpmMax: 12500, rearShare: 0.54 };
export const COMPOUNDS = {
  soft: { mu: 1.88, deg: 0.085, cliff: 16, color: '#ff3b4e', Topt: 105, w: 14, delta: -0.65 },
  medium: { mu: 1.80, deg: 0.052, cliff: 28, color: '#ffd23f', Topt: 100, w: 16, delta: 0 },
  hard: { mu: 1.72, deg: 0.032, cliff: 42, color: '#f2f2f2', Topt: 95, w: 18, delta: 0.55 },
  inter: { mu: 1.45, deg: 0.04, cliff: 30, color: '#3fd36b', Topt: 70, w: 20, delta: 3.5 },
};
export const GEARS = [3.3, 2.55, 2.1, 1.78, 1.55, 1.38, 1.24, 1.12];       // × final drive
export const DEFAULT_SETUP = { fw: 6, rw: 7, ride: 30, final: 3.6, bias: 0.57, compound: 'medium', fuel: 50 };

// Ground-effect contribution vs ride height (mm): a peak near 28 mm, collapsing below ~22 mm.
export function groundEffect(ride) {
  const peak = 1.7 * Math.exp(-(((ride - 28) / 13) ** 2) / 2);
  const stall = ride < 24 ? Math.exp(-((24 - ride) / 2.5)) : 1;               // porpoising / stall
  return peak * (0.35 + 0.65 * stall);
}
export function aero(s) {
  const ge = groundEffect(s.ride);
  const CLA = 0.95 + 0.11 * s.fw + 0.12 * s.rw + ge;
  const CDA = 0.72 + 0.03 * s.fw + 0.048 * s.rw + 0.12 * ge;
  const front = (0.5 + 0.115 * s.fw + 0.45 * ge * 0.9) / CLA;                 // share of downforce on the front axle
  return { CLA, CDA, LD: CLA / CDA, front, ge, porpoise: s.ride < 24 };
}
// Engine power vs rpm (normalised): rises to the peak at 11 500 rpm, falls off toward the limiter.
export const powerFrac = (rpm) => Math.max(0.25, Math.min(1, 0.35 + 0.65 * Math.sin(Math.min(1, rpm / 11500) * Math.PI / 2) ** 1.4)) * (rpm > 11500 ? 1 - 0.6 * ((rpm - 11500) / 1000) ** 2 : 1);
export function gearFor(v, s) {
  for (let i = 0; i < GEARS.length; i++) { const rpm = (v / CAR.rWheel) * GEARS[i] * s.final * 60 / (2 * Math.PI); if (rpm < 11800) return { gear: i + 1, rpm: Math.max(4000, rpm) }; }
  const rpm = (v / CAR.rWheel) * GEARS[7] * s.final * 60 / (2 * Math.PI); return { gear: 8, rpm };
}
export function topSpeed(s) {
  const A = aero(s), m = CAR.mass + s.fuel; let v = 50;
  for (let i = 0; i < 80; i++) { const g = gearFor(v, s); const P = CAR.power * CAR.eta * powerFrac(g.rpm); const f = 0.5 * RHO * A.CDA * v ** 3 + CAR.crr * m * G * v - P; v -= f / (1.5 * RHO * A.CDA * v * v + CAR.crr * m * G); }
  // Gearing can cap it before drag does.
  const vLim = (12500 * 2 * Math.PI / 60) * CAR.rWheel / (GEARS[7] * s.final);
  return Math.min(v, vLim);
}
// Tyre friction coefficient with load sensitivity, temperature and wear.
export function mu(compound, Fz, T = null, age = 0) {
  const c = COMPOUNDS[compound], Fz0 = 4000;
  let m = c.mu * (1 - 0.08 * (Fz / Fz0 - 1));
  if (T !== null) m *= Math.exp(-0.5 * ((T - c.Topt) / c.w) ** 2) * 0.35 + 0.65;
  return m * (1 - 0.0045 * age - (age > c.cliff ? 0.004 * (age - c.cliff) ** 1.6 : 0));
}
// Pacejka magic formula. x = slip angle (rad) or slip ratio.
export function pacejka(x, D, kind = 'lat') {
  const P = kind === 'lat' ? { B: 9.5, C: 1.35, E: 0.1 } : { B: 12, C: 1.65, E: 0.15 };
  const Bx = P.B * x; return D * Math.sin(P.C * Math.atan(Bx - P.E * (Bx - Math.atan(Bx))));
}
export function wheelLoads(s, v, ax, ay) {
  const A = aero(s), m = CAR.mass + s.fuel, df = 0.5 * RHO * A.CLA * v * v;
  const Wf = m * G * 0.46 + df * A.front, Wr = m * G * 0.54 + df * (1 - A.front);
  const dLong = (m * ax * CAR.h) / CAR.L, dLatF = (m * ay * CAR.h) / CAR.track * 0.48, dLatR = (m * ay * CAR.h) / CAR.track * 0.52;
  return { FL: Wf / 2 - dLong / 2 - dLatF / 2, FR: Wf / 2 - dLong / 2 + dLatF / 2, RL: Wr / 2 + dLong / 2 - dLatR / 2, RR: Wr / 2 + dLong / 2 + dLatR / 2, df };
}
