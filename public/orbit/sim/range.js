// ORBIT · the launch range: surveillance, hazard areas, public risk, the
// launch vehicle's instantaneous impact point (IIP) and the telemetry link.
//
// Map frame: km east (x) and north (y) of the launch pad; the coast runs
// north–south just east of the pad and launches fly due east over the sea.
//
// Public safety (after FAA 14 CFR §450.101): collective expected casualties
// for a launch must stay ≤ 1 × 10⁻⁴ and individual risk ≤ 1 × 10⁻⁶. Ec is
// integrated here over the failure time: for each second of powered flight a
// failure probability, a debris impact distribution centred on the IIP, and
// each exposed ship, aircraft or town's casualty area.
//
// Radar: SNR ∝ σ / R⁴ (radar range equation). Reference: 13 dB for a 1 m²
// target at 150 km; a track is held while SNR ≥ 13 dB.
//
// Link budget (S-band telemetry): C/N0 = EIRP − L_fs + G/T + 228.6 − L_misc,
// L_fs = 92.45 + 20·log10(d km) + 20·log10(f GHz), Eb/N0 = C/N0 − 10·log10(R_b).

import { G0, MU, RE } from './atmos.js';

export const RANGE = {
  latDeg: 28.5, azimuth: 90,
  // Launch hazard area over the sea (km): a corridor downrange, and the pad circle.
  lha: [[4, -12], [60, -24], [170, -30], [170, 30], [60, 24], [4, 12]],   // sized to the debris dispersion
  aha: [[2, -24], [80, -36], [220, -42], [220, 42], [80, 36], [2, 24]],     // aircraft hazard area (up to FL600)
  padR: 5,
  destructY: 26,                                                        // crossrange destruct lines ± km
  town: { x: -9, y: 6, pop: 24000, name: 'Harbor Town' },
};
export const EC_LIMIT = 1e-4, IR_LIMIT = 1e-6;
export const K_BOLTZ_DB = -228.6;

export function inPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export const fspl = (dKm, fGHz) => 92.45 + 20 * Math.log10(Math.max(1e-3, dKm)) + 20 * Math.log10(fGHz);
export function linkBudget({ dKm, pTxW = 5, gTx = -2, fGHz = 2.25, gOverT = 20, rateBps = 2e6, misc = 3, req = 4.4, jam = null }) {
  const eirp = 10 * Math.log10(pTxW) + gTx, L = fspl(dKm, fGHz);
  const cn0 = eirp - L + gOverT - K_BOLTZ_DB - misc, ebn0 = cn0 - 10 * Math.log10(rateBps);
  let js = null, ebn0j = ebn0;
  if (jam) {
    // Jammer seen through the dish sidelobes: J/S in dB, and the jammed Eb/(N0+J0).
    const jEirp = 10 * Math.log10(jam.pW) + jam.g, Lj = fspl(jam.dKm, fGHz);
    const cRx = eirp - L + jam.gMain, jRx = jEirp - Lj + jam.gSide;
    js = jRx - cRx;
    const ebnj = -js + 10 * Math.log10(jam.bwHz / rateBps);          // Eb/J0 = (C/J)·(B_j/R_b)
    ebn0j = -10 * Math.log10(10 ** (-ebn0 / 10) + 10 ** (-ebnj / 10));
  }
  return { eirp, L, cn0, ebn0, margin: ebn0 - req, js, ebn0j, marginJ: ebn0j - req };
}

// Radar range equation relative to a reference detection.
export const radarSnr = (rKm, sigma) => 13 + 10 * Math.log10(sigma) - 40 * Math.log10(Math.max(0.5, rKm) / 150);

// ── Launch vehicle (generic two-stage, "ARROW-2") and the IIP ──────────────
export const ARROW = {
  s1: { dry: 22.2e3, prop: 411e3, T: 7.6e6, ispSl: 282, ispVac: 311 },
  s2: { dry: 4.0e3, prop: 107.5e3, T: 981e3, isp: 348 },
  fairing: 1900, payload: 8000,
};
// Vacuum ballistic impact point from altitude h, speed v, flight path γ (inertial, planar):
// downrange angle along the conic from the current radius down to Earth's surface.
export function iip(r, v, gam) {
  const hmag = r * v * Math.cos(gam), eps = (v * v) / 2 - MU / r;
  const p = (hmag * hmag) / MU, e = Math.sqrt(Math.max(0, 1 + (2 * eps * hmag * hmag) / (MU * MU)));
  if (eps >= 0 || e < 1e-9) return { orbital: true };
  // True anomaly now (ascending branch ν∈[0,π], descending ν∈[π,2π]) and at impact (descending, r = R⊕).
  if ((p / RE - 1) / e > 1) return { orbital: true };                    // perigee above the surface
  const nr = Math.acos(Math.max(-1, Math.min(1, (p / r - 1) / e)));
  const nuNow = gam >= 0 ? nr : 2 * Math.PI - nr;
  const nuImp = 2 * Math.PI - Math.acos(Math.max(-1, Math.min(1, (p / RE - 1) / e)));
  const d = Math.max(0, nuImp - nuNow);
  return { orbital: false, angle: d, km: (d * RE) / 1000 };
}

export class Launch {
  constructor() {
    this.t = 0; this.stage = 1; this.x = 0; this.h = 0; this.v = 0.01; this.gam = Math.PI / 2;
    this.m = ARROW.s1.dry + ARROW.s1.prop + ARROW.s2.dry + ARROW.s2.prop + ARROW.fairing + ARROW.payload; this.prop1 = ARROW.s1.prop; this.prop2 = ARROW.s2.prop;
    this.cross = 0; this.crossRate = 0; this.fault = false; this.terminated = false; this.done = false;
    this.track = []; this.events = [];
  }
  step(dt) {
    if (this.done || this.terminated) { this.t += dt; return; }
    const n = Math.ceil(dt / 0.05);
    for (let i = 0; i < n; i++) this.sub(dt / n);
  }
  sub(h) {
    if (this.done || this.terminated) { this.t += h; return; }
    const r = RE + this.h, g = MU / (r * r);
    const rho = 1.225 * Math.exp(-this.h / 7200), q = 0.5 * rho * this.v * this.v;
    let T = 0, mdot = 0;
    if (this.stage === 1 && this.prop1 > 0) { const pa = Math.exp(-this.h / 7200); const isp = ARROW.s1.ispVac - (ARROW.s1.ispVac - ARROW.s1.ispSl) * pa; T = ARROW.s1.T * (isp / ARROW.s1.ispSl); mdot = ARROW.s1.T / (ARROW.s1.ispSl * G0); this.prop1 -= mdot * h; }
    else if (this.stage === 1) { this.stage = 2; this.m -= ARROW.s1.dry; this.events.push({ t: this.t, k: 'rg.meco' }); }
    if (this.stage === 2 && this.prop2 > 0) { T = ARROW.s2.T; mdot = T / (ARROW.s2.isp * G0); this.prop2 -= mdot * h; if (this.h > 110e3 && ARROW.fairing && !this.fairingGone) { this.fairingGone = true; this.m -= ARROW.fairing; } }
    const D = q * 10.5 * 0.3;
    // Gravity turn after a short vertical rise and pitch-over kick.
    let steer = 0; if (this.t > 12 && this.t < 22) steer = -0.0065;
    const m = this.m;
    // Upper stage: pitch the thrust above the velocity to fly a shallow, lofted climb (δ = steering angle).
    let delta = 0;
    if (this.stage === 2) { const gCmd = Math.max(0, 0.3 * (1 - this.v / 7800)) + (this.h < 180e3 ? 0.02 : 0); delta = Math.max(-0.8, Math.min(0.8, 6 * (gCmd - this.gam))); }
    this.v += ((T * Math.cos(delta)) / m - D / m - g * Math.sin(this.gam)) * h;
    this.gam += (steer + (T * Math.sin(delta)) / (m * this.v) + (-(g / this.v) + this.v / r) * Math.cos(this.gam) * (this.t > 12 ? 1 : 0)) * h;
    this.h += this.v * Math.sin(this.gam) * h; this.x += (RE / r) * this.v * Math.cos(this.gam) * h;
    this.m -= mdot * h; this.t += h;
    if (this.fault) this.crossRate += 0.004 * h;                          // guidance fault: growing crossrange drift
    this.cross += this.crossRate * h * Math.max(1, this.v / 1000);
    const I = iip(r, this.v, this.gam);
    this.iip = I.orbital ? null : { x: I.km + this.x / 1000, y: this.cross };
    if (this.stage === 2 && (this.prop2 <= 0 || this.v >= Math.sqrt(MU / r))) { this.done = true; this.events.push({ t: this.t, k: 'rg.seco' }); }
    if (!this.track.length || this.t - this.track[this.track.length - 1].t > 1) this.track.push({ t: this.t, x: this.x / 1000, y: this.cross * 0.3, h: this.h / 1000, iip: this.iip });
  }
  get slantKm() { const x = this.x / 1000, h = this.h / 1000; return Math.hypot(x, h, this.cross); }
}

// Expected casualties from a nominal flight for a set of exposed people.
// P_fail = 5 % (a young vehicle) spread over 180 s of powered flight. A failure
// breaks the vehicle into ~300 fragments that land around the IIP with
// σ_down = 1.5 + 0.1·d km and σ_cross = 2 + 0.15·d km (d = IIP downrange).
// P(hit) for an exposure = fragments × pdf × vulnerable area; casualties =
// P(hit) × people × fatality fraction.  Ec = Σ over time and exposures.
export const P_FAIL = 0.05, N_FRAG = 300;
// Nominal IIP downrange vs time, from one run of the launch model (cached).
let IIP_TABLE = null;
export function nominalIip() {
  if (IIP_TABLE) return IIP_TABLE;
  const L = new Launch(); IIP_TABLE = [];
  for (let t = 0; t <= 180; t += 1) { L.step(t - L.t); IIP_TABLE.push(L.iip ? L.iip.x : 0); }
  return IIP_TABLE;
}
export function expectedCasualties(exposures, fault = 0) {
  const pf = P_FAIL, T = 180, dt = 1;
  let ec = 0, worstIndividual = 0;
  const per = exposures.map(() => 0);
  for (let t = 5; t <= T; t += dt) {
    const d = nominalIip()[Math.min(180, Math.round(t))], sx = 1.5 + 0.1 * d, sy = 2 + 0.15 * d + fault * 5;
    const w = (pf / T) * dt;
    exposures.forEach((E, i) => {
      const pdf = Math.exp(-0.5 * (((E.x - d) / sx) ** 2 + (E.y / sy) ** 2)) / (2 * Math.PI * sx * sy);   // per km²
      const pHit = Math.min(1, w * N_FRAG * pdf * E.ac);
      per[i] += pHit;
    });
  }
  exposures.forEach((E, i) => { ec += per[i] * E.n * E.fatal; worstIndividual = Math.max(worstIndividual, per[i] * E.fatal); });
  return { ec, ir: worstIndividual, per };
}

// ── Surveillance picture ───────────────────────────────────────────────
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export class Surveillance {
  constructor(seed = 3) {
    const r = rng(seed); this.r = r; this.t = 0; this.sweep = 0; this.tracks = []; this.nextId = 1;
    const add = (o) => this.tracks.push({ id: this.nextId++, hist: [], cleared: false, action: null, ...o });
    add({ kind: 'air', src: 'adsb', cs: 'SKY218', x: -60, y: 40, hdg: 115, spd: 0.21, alt: 11000, sigma: 20, n: 160, ac: 0.02, fatal: 1 });
    add({ kind: 'air', src: 'adsb', cs: 'N47TX', x: 70, y: -70, hdg: 350, spd: 0.07, alt: 2400, sigma: 2, n: 4, ac: 0.005, fatal: 1 });
    add({ kind: 'sea', src: 'ais', cs: 'MV CORAL', x: 45, y: 9, hdg: 200, spd: 0.006, alt: 0, sigma: 800, n: 22, ac: 0.03, fatal: 0.5 });
    add({ kind: 'sea', src: 'ais', cs: 'FV LUCKY 7', x: 110, y: -28, hdg: 20, spd: 0.004, alt: 0, sigma: 60, n: 6, ac: 0.02, fatal: 0.5 });
    add({ kind: 'sea', src: 'primary', cs: 'UNKNOWN', x: 28, y: -16, hdg: 70, spd: 0.009, alt: 0, sigma: 15, n: 3, ac: 0.01, fatal: 0.5 });
    add({ kind: 'air', src: 'primary', cs: 'UNKNOWN', x: 150, y: 60, hdg: 235, spd: 0.12, alt: 900, sigma: 1, n: 2, ac: 0.004, fatal: 1 });
    add({ kind: 'air', src: 'adsb', cs: 'CHASE 1', x: -5, y: -8, hdg: 90, spd: 0.2, alt: 9000, sigma: 5, n: 1, ac: 0, fatal: 0, own: true });
  }
  step(dt) {
    this.t += dt; this.sweep = (this.sweep + (dt / 12) * Math.PI * 2) % (Math.PI * 2);     // 5 rpm antenna
    for (const T of this.tracks) {
      if (T.goal !== undefined) { let d = ((T.goal - T.hdg + 540) % 360) - 180; T.hdg += Math.sign(d) * Math.min(Math.abs(d), dt * 3); }
      const a = (T.hdg * Math.PI) / 180;
      T.x += Math.sin(a) * T.spd * dt; T.y += Math.cos(a) * T.spd * dt;
      if (T.own) { T.hdg += dt * 1.5; }                                           // chase jet orbiting
      const rk = Math.hypot(T.x, T.y);
      T.snr = radarSnr(rk, T.sigma); T.detected = T.snr >= 13;
      T.inLha = inPoly([T.x, T.y], RANGE.lha); T.inAha = T.kind === 'air' && T.alt < 18300 && inPoly([T.x, T.y], RANGE.aha);
      T.violation = !T.own && (T.kind === 'sea' ? T.inLha : T.inAha);
      if (!T.hist.length || this.t - T.hist[T.hist.length - 1][2] > 4) { T.hist.push([T.x, T.y, this.t]); if (T.hist.length > 12) T.hist.shift(); }
    }
  }
  // Resolve a track: vector it away from the hazard area.
  resolve(T, how) {
    T.action = how; T.cleared = true;
    const away = T.kind === 'sea' ? (T.y >= 0 ? 0 : 180) : (T.y >= 0 ? 0 : 180);
    T.goal = away; T.spd = T.kind === 'sea' ? Math.max(T.spd * 3, 0.4) : Math.max(T.spd * 1.4, 0.25);   // escorted vessels leave at speed
    if (how === 'intercept') { T.src = 'identified'; T.cs = T.kind === 'air' ? 'N-CESSNA' : 'SV DRIFTER'; }
  }
  exposures() {
    const E = this.tracks.filter((T) => !T.own).map((T) => ({ x: T.x, y: T.y, n: T.n, ac: T.ac, fatal: T.fatal, id: T.id }));
    E.push({ x: RANGE.town.x, y: RANGE.town.y, n: RANGE.town.pop, ac: 0.0004, fatal: 0.3, id: 'town' });
    return E;
  }
}
