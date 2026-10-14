/**
 * Tokamak plasma physics for teaching: D–T fusion reactivity (Bosch–Hale 1992 fit), fusion
 * power, losses (bremsstrahlung + transport), gain Q, Lawson triple product, plasma beta and
 * the density limit. SI units unless stated; temperatures in keV. Pure and unit tested.
 */

export const KEV_J = 1.602176634e-16; // 1 keV in joules
export const MEV_J = 1.602176634e-13;
export const MU0 = 4e-7 * Math.PI;
/** 1 keV ≈ 11.6 million kelvin. */
export const KEV_TO_K = 1.16045e7;

/** D + T → ⁴He (3.52 MeV) + n (14.07 MeV). */
export const E_FUSION_MEV = 17.59;
export const E_ALPHA_MEV = 3.52;
export const E_NEUTRON_MEV = 14.07;

export const keVToCelsius = (keV: number) => keV * KEV_TO_K - 273.15;
export const kelvinToKeV = (K: number) => K / KEV_TO_K;

/**
 * Maxwellian-averaged D–T reactivity ⟨σv⟩ in m³/s, from the Bosch & Hale (1992) parameterisation.
 * Valid for 0.2–100 keV.
 */
export function reactivityDT(TkeV: number): number {
  const T = Math.min(100, Math.max(0.2, TkeV));
  const BG = 34.3827;
  const mrc2 = 1124656;
  const C1 = 1.17302e-9;
  const C2 = 1.51361e-2;
  const C3 = 7.51886e-2;
  const C4 = 4.60643e-3;
  const C5 = 1.35e-2;
  const C6 = -1.0675e-4;
  const C7 = 1.366e-5;
  const theta = T / (1 - (T * (C2 + T * (C4 + T * C6))) / (1 + T * (C3 + T * (C5 + T * C7))));
  const xi = Math.cbrt((BG * BG) / (4 * theta));
  const sv = C1 * theta * Math.sqrt(xi / (mrc2 * T * T * T)) * Math.exp(-3 * xi); // cm³/s
  return sv * 1e-6;
}

export interface Plasma {
  /** Ion (= electron) density, m⁻³ (50/50 deuterium–tritium). */
  n: number;
  /** Temperature, keV. */
  T: number;
  /** Energy confinement time, s. */
  tauE: number;
  /** Toroidal magnetic field on axis, T. */
  B: number;
  /** Plasma current, MA. */
  Ip: number;
}

/** ITER-like geometry (metres). */
export const GEOMETRY = { R0: 6.2, a: 2.0, kappa: 1.7, delta: 0.33 };

/** Plasma volume of a D-shaped torus ≈ 2π R0 · π a² κ. */
export const plasmaVolume = (g = GEOMETRY) => 2 * Math.PI * g.R0 * Math.PI * g.a * g.a * g.kappa;

/**
 * Profiles are peaked in real plasmas; we evaluate at volume-average values and apply a single
 * profile/dilution factor so whole-plasma powers land near ITER's design point.
 */
export const TUNE = {
  /** Profile peaking factor applied to volume-average powers. */
  profile: 0.6,
  /** Fuel ions per electron: helium ash and impurities dilute the D–T fuel. */
  fuel: 0.85,
  /** Effective charge from impurities (raises bremsstrahlung). */
  zeff: 1.7,
  /** Extra radiation from impurity lines and synchrotron, as a multiple of bremsstrahlung. */
  lineSync: 3.0,
};

/** Radiated power density per n_e² (W·m³), bremsstrahlung + impurity line + synchrotron. */
const radiationCoeff = (TkeV: number) => 5.35e-37 * TUNE.zeff * Math.sqrt(TkeV) * (1 + TUNE.lineSync);

export interface Balance {
  reactivity: number;
  /** Power densities, W/m³ */
  pFusion: number;
  pAlpha: number;
  pBrems: number;
  pTransport: number;
  /** Whole-plasma powers, MW */
  fusionMW: number;
  alphaMW: number;
  neutronMW: number;
  lossMW: number;
  /** External heating needed to hold the plasma steady, MW (≤ 0 means self-sustaining). */
  heatingMW: number;
  /** Fusion gain Q = P_fusion / P_heating (Infinity at ignition). */
  Q: number;
  tripleProduct: number;
  ignited: boolean;
  beta: number;
  betaLimit: number;
  greenwald: number;
  stable: boolean;
  instability: string | null;
}

/** Troyon beta limit β_max ≈ g · I / (a B) with g ≈ 2.8 %·m·T/MA. */
export const betaLimit = (p: Plasma, a = GEOMETRY.a) => (0.028 * p.Ip) / (a * p.B);

/** Greenwald density limit n_G = I / (π a²) in 10²⁰ m⁻³ (I in MA). */
export const greenwaldLimit = (Ip: number, a = GEOMETRY.a) => (Ip / (Math.PI * a * a)) * 1e20;

export function balance(p: Plasma): Balance {
  const sv = reactivityDT(p.T);
  const nD = (p.n * TUNE.fuel) / 2;
  const nT = (p.n * TUNE.fuel) / 2;
  const pFusion = nD * nT * sv * E_FUSION_MEV * MEV_J;
  const pAlpha = pFusion * (E_ALPHA_MEV / E_FUSION_MEV);
  // Radiation: bremsstrahlung 5.35e-37 Z_eff n_e² √T (W/m³) plus impurity-line and synchrotron losses
  const pBrems = radiationCoeff(p.T) * p.n * p.n;
  // Thermal energy W = 3 n T (ions + electrons) lost over τ_E
  const pTransport = (3 * p.n * p.T * KEV_J) / p.tauE;
  const V = plasmaVolume() * TUNE.profile;
  const fusionMW = (pFusion * V) / 1e6;
  const alphaMW = (pAlpha * V) / 1e6;
  const lossMW = ((pBrems + pTransport) * V) / 1e6;
  const heatingMW = lossMW - alphaMW;
  const ignited = heatingMW <= 0;
  const Q = ignited ? Infinity : fusionMW / Math.max(heatingMW, 1e-6);
  const pressure = 2 * p.n * p.T * KEV_J;
  const beta = pressure / ((p.B * p.B) / (2 * MU0));
  const bl = betaLimit(p);
  const gw = greenwaldLimit(p.Ip);
  let instability: string | null = null;
  if (beta > bl) instability = `Pressure too high for the field: β = ${(beta * 100).toFixed(1)}% exceeds the Troyon limit of ${(bl * 100).toFixed(1)}%. The plasma kinks and disrupts.`;
  else if (p.n > gw) instability = `Density above the Greenwald limit (${(gw / 1e20).toFixed(2)}×10²⁰ m⁻³): the edge cools, radiates and the plasma disrupts.`;
  return {
    reactivity: sv,
    pFusion,
    pAlpha,
    pBrems,
    pTransport,
    fusionMW,
    alphaMW,
    neutronMW: fusionMW - alphaMW,
    lossMW,
    heatingMW,
    Q,
    tripleProduct: p.n * p.T * p.tauE,
    ignited,
    beta,
    betaLimit: bl,
    greenwald: gw,
    stable: instability === null,
    instability,
  };
}

/** Lawson ignition threshold for D–T near its optimum: n T τ ≳ 3×10²¹ keV·s/m³. */
export const IGNITION_TRIPLE = 3e21;

/** Minimum nτ for ignition at temperature T (ignition when alpha heating = losses). */
export function ignitionNTau(TkeV: number): number {
  const sv = reactivityDT(TkeV);
  // n τ = 3T / (¼ ⟨σv⟩ E_α − C_B √T) with powers per n²
  const alpha = 0.25 * TUNE.fuel * TUNE.fuel * sv * E_ALPHA_MEV * MEV_J;
  const brems = radiationCoeff(TkeV);
  const denom = alpha - brems;
  return denom > 0 ? (3 * TkeV * KEV_J) / denom : Infinity;
}

export type Status = 'cold' | 'heating' | 'fusing' | 'breakeven' | 'burning' | 'ignition' | 'disrupted';

export function status(p: Plasma, b: Balance): Status {
  if (!b.stable) return 'disrupted';
  if (p.T < 1) return 'cold';
  if (b.ignited) return 'ignition';
  if (b.Q >= 5) return 'burning';
  if (b.Q >= 1) return 'breakeven';
  if (b.fusionMW > 1) return 'fusing';
  return 'heating';
}

export const STATUS_TEXT: Record<Status, string> = {
  cold: 'Cold gas — heat it to millions of degrees',
  heating: 'Heating — barely any fusion yet',
  fusing: 'Fusing — but using more power than it makes (Q < 1)',
  breakeven: 'Scientific breakeven — fusion power exceeds heating (Q ≥ 1)',
  burning: 'Burning plasma — alpha particles do most of the heating (Q ≥ 5)',
  ignition: 'Ignition — the plasma heats itself; external heating can switch off',
  disrupted: 'Disruption — the plasma lost confinement',
};

/** ITER's design point. */
export const ITER: Plasma = { n: 1.0e20, T: 13, tauE: 3.7, B: 5.3, Ip: 15 };

/** Energy split by momentum conservation: the lighter neutron carries 4/5 of the energy. */
export function energySplit(totalMeV = E_FUSION_MEV): { alpha: number; neutron: number } {
  const mAlpha = 4.0026;
  const mN = 1.00866;
  return { alpha: (totalMeV * mN) / (mAlpha + mN), neutron: (totalMeV * mAlpha) / (mAlpha + mN) };
}

/** Mass defect of D + T → He + n, in atomic mass units, and its E = mc² value. */
export function massDefect(): { du: number; MeV: number } {
  const D = 2.014102;
  const T = 3.016049;
  const He = 4.002603;
  const n = 1.008665;
  const du = D + T - He - n;
  return { du, MeV: du * 931.494 };
}

/** nτ (s/m³) needed for a given gain Q at temperature T (Q = Infinity gives ignition). */
export function nTauForQ(TkeV: number, Q: number): number {
  const sv = reactivityDT(TkeV);
  const fus = 0.25 * TUNE.fuel * TUNE.fuel * sv * E_FUSION_MEV * MEV_J;
  const alpha = fus * (E_ALPHA_MEV / E_FUSION_MEV);
  const denom = (Number.isFinite(Q) ? fus / Q : 0) + alpha - radiationCoeff(TkeV);
  return denom > 0 ? (3 * TkeV * KEV_J) / denom : Infinity;
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  p: Plasma;
}

export const PRESETS: Preset[] = [
  { id: 'cold', name: 'Cold start', blurb: 'Gas just puffed in and barely ionised. No fusion at all.', p: { n: 0.6e20, T: 0.5, tauE: 1, B: 5.3, Ip: 10 } },
  { id: 'jet', name: 'JET 1997', blurb: 'The UK\'s Joint European Torus: 16 MW of fusion power, Q ≈ 0.6.', p: { n: 0.5e20, T: 14, tauE: 0.7, B: 3.6, Ip: 4.2 } },
  { id: 'iter', name: 'ITER design', blurb: 'ITER\'s goal: 500 MW of fusion from 50 MW of heating, Q = 10.', p: { ...ITER } },
  { id: 'demo', name: 'Power plant (DEMO)', blurb: 'A future power plant: larger confinement, nearly self-heating.', p: { n: 1.1e20, T: 14, tauE: 5.5, B: 5.9, Ip: 18 } },
  { id: 'dense', name: 'Too dense', blurb: 'Pushed past the Greenwald density limit.', p: { n: 1.6e20, T: 10, tauE: 3.7, B: 5.3, Ip: 12 } },
  { id: 'pressure', name: 'Too much pressure', blurb: 'Hot and dense with too weak a field: beta limit exceeded.', p: { n: 1.1e20, T: 22, tauE: 3.7, B: 3.4, Ip: 15 } },
];
