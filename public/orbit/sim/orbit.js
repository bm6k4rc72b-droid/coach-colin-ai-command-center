// ORBIT · orbital mechanics.
//
//   vis-viva            v² = μ(2/r − 1/a)
//   period (Kepler III) T = 2π√(a³/μ)
//   Hohmann transfer    Δv₁ = √(μ/r₁)(√(2r₂/(r₁+r₂)) − 1),  Δv₂ = √(μ/r₂)(1 − √(2r₁/(r₁+r₂)))
//   plane change        Δv = 2v·sin(Δi/2)
//   launch azimuth      sin β = cos i / cos φ   (inertial, before Earth-rotation correction)
//   J2 nodal drift      Ω̇ = −(3/2)·n·J2·(R/p)²·cos i
//   Sun-synchronous     Ω̇ = 360°/365.2422 d  →  cos i = −Ω̇ / ((3/2) n J2 (R/p)²)
// The Orbit tab integrates the full 3D two-body problem (+ optional J2) with RK4.

import { MU, RE, J2, OMEGA_E, G0 } from './atmos.js';

export const vCirc = (r) => Math.sqrt(MU / r);
export const vEsc = (r) => Math.sqrt((2 * MU) / r);
export const visViva = (r, a) => Math.sqrt(MU * (2 / r - 1 / a));
export const period = (a) => 2 * Math.PI * Math.sqrt(a ** 3 / MU);
export function hohmann(r1, r2) {
  const at = (r1 + r2) / 2;
  const dv1 = Math.sqrt(MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
  const dv2 = Math.sqrt(MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  return { dv1, dv2, total: Math.abs(dv1) + Math.abs(dv2), tof: period(at) / 2, at };
}
export const planeChange = (v, di) => 2 * v * Math.sin(di / 2);
export const earthBoost = (latDeg) => OMEGA_E * RE * Math.cos((latDeg * Math.PI) / 180);
export function launchAzimuth(incDeg, latDeg) {
  const s = Math.cos((incDeg * Math.PI) / 180) / Math.cos((latDeg * Math.PI) / 180);
  return Math.abs(s) > 1 ? null : (Math.asin(s) * 180) / Math.PI;
}
export function nodalRate(a, e, incDeg) {
  const n = Math.sqrt(MU / a ** 3), p = a * (1 - e * e);
  return -1.5 * n * J2 * (RE / p) ** 2 * Math.cos((incDeg * Math.PI) / 180);       // rad/s
}
export const SSO_RATE = (2 * Math.PI) / (365.2422 * 86400);
export function ssoInclination(altKm) {
  const a = RE + altKm * 1000, n = Math.sqrt(MU / a ** 3);
  const c = -SSO_RATE / (1.5 * n * J2 * (RE / a) ** 2);
  return Math.abs(c) > 1 ? null : (Math.acos(c) * 180) / Math.PI;
}
export const propFor = (dv, m0, isp) => m0 * (1 - Math.exp(-dv / (isp * G0)));     // kg of propellant for Δv

// Classical elements from a 3D state (z = Earth's axis).
export function elements(r, v) {
  const rm = Math.hypot(...r), vm2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2;
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hm = Math.hypot(...h);
  const eps = vm2 / 2 - MU / rm, a = -MU / (2 * eps);
  const rv = r[0] * v[0] + r[1] * v[1] + r[2] * v[2];
  const ev = [0, 1, 2].map((k) => ((vm2 - MU / rm) * r[k] - rv * v[k]) / MU), e = Math.hypot(...ev);
  const inc = Math.acos(Math.max(-1, Math.min(1, h[2] / hm)));
  const nodeV = [-h[1], h[0], 0], nm = Math.hypot(...nodeV);
  let raan = nm > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, nodeV[0] / nm))) : 0; if (nodeV[1] < 0) raan = 2 * Math.PI - raan;
  return { a, e, inc, raan, apo: a * (1 + e) - RE, peri: a * (1 - e) - RE, period: eps < 0 ? period(a) : Infinity, eps, hm, rm, v: Math.sqrt(vm2), ev };
}

// State from circular orbit parameters (altitude, inclination, RAAN, argument of latitude).
export function circularState(altKm, incDeg, raanDeg = 0, uDeg = 0) {
  const r = RE + altKm * 1000, v = vCirc(r), i = (incDeg * Math.PI) / 180, O = (raanDeg * Math.PI) / 180, u = (uDeg * Math.PI) / 180;
  const pos = [Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i), Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i), Math.sin(u) * Math.sin(i)].map((c) => c * r);
  const vel = [-Math.cos(O) * Math.sin(u) - Math.sin(O) * Math.cos(u) * Math.cos(i), -Math.sin(O) * Math.sin(u) + Math.cos(O) * Math.cos(u) * Math.cos(i), Math.cos(u) * Math.sin(i)].map((c) => c * v);
  return { pos, vel };
}

export class Craft {
  constructor({ altKm = 400, incDeg = 28.5, mass = 9800, isp = 320, prop = 700 } = {}) {
    const s = circularState(altKm, incDeg, 0, 0);
    this.r = s.pos; this.v = s.vel; this.t = 0; this.j2 = true;
    this.mass = mass; this.isp = isp; this.prop = prop; this.dvUsed = 0; this.burns = [];
  }
  accel(r) {
    const rm = Math.hypot(...r), k = -MU / rm ** 3, a = r.map((c) => k * c);
    if (this.j2) {
      const z2 = (r[2] / rm) ** 2, f = (1.5 * J2 * MU * RE * RE) / rm ** 5;
      a[0] += f * r[0] * (5 * z2 - 1); a[1] += f * r[1] * (5 * z2 - 1); a[2] += f * r[2] * (5 * z2 - 3);
    }
    return a;
  }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / 10)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const s = [...this.r, ...this.v];
      const f = (s) => { const a = this.accel(s.slice(0, 3)); return [s[3], s[4], s[5], ...a]; };
      const k1 = f(s), k2 = f(s.map((x, j) => x + 0.5 * h * k1[j])), k3 = f(s.map((x, j) => x + 0.5 * h * k2[j])), k4 = f(s.map((x, j) => x + h * k3[j]));
      const ns = s.map((x, j) => x + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
      this.r = ns.slice(0, 3); this.v = ns.slice(3); this.t += h;
    }
  }
  // Impulsive burn in the local orbital frame: prograde, normal, radial (m/s).
  burn(dvPro, dvNorm = 0, dvRad = 0) {
    const vm = Math.hypot(...this.v), T = this.v.map((c) => c / vm);
    const h = [this.r[1] * this.v[2] - this.r[2] * this.v[1], this.r[2] * this.v[0] - this.r[0] * this.v[2], this.r[0] * this.v[1] - this.r[1] * this.v[0]], hm = Math.hypot(...h), N = h.map((c) => c / hm);
    const rm = Math.hypot(...this.r), Rv = this.r.map((c) => c / rm);
    const dv = Math.hypot(dvPro, dvNorm, dvRad);
    const need = propFor(dv, this.mass, this.isp);
    if (need > this.prop + 1e-6) return { ok: false, need };
    this.v = this.v.map((c, k) => c + dvPro * T[k] + dvNorm * N[k] + dvRad * Rv[k]);
    this.prop -= need; this.mass -= need; this.dvUsed += dv; this.burns.push({ t: this.t, dv, kg: need });
    return { ok: true, kg: need };
  }
  get el() { return elements(this.r, this.v); }
  // Latitude/longitude of the sub-satellite point (Earth rotating; GMST = ω⊕·t).
  ground() {
    const [x, y, z] = this.r, rm = Math.hypot(x, y, z);
    const lat = Math.asin(z / rm), lonI = Math.atan2(y, x), lon = ((((lonI - OMEGA_E * this.t) * 180) / Math.PI + 540) % 360) - 180;
    return { lat: (lat * 180) / Math.PI, lon };
  }
  // Sample the osculating orbit for drawing (two-body, no J2).
  path(n = 180) {
    const E = this.el, pts = [];
    if (!(E.a > 0) || E.e >= 1) return pts;
    const tmp = new Craft(); tmp.j2 = false; tmp.r = [...this.r]; tmp.v = [...this.v];
    const dt = E.period / n;
    for (let i = 0; i <= n; i++) { pts.push([...tmp.r]); tmp.step(dt); }
    return pts;
  }
}
