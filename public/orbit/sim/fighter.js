// ORBIT · fighter flight model ("STRIKER", F-16-class numbers).
//
// Translational dynamics are exact point-mass physics in a flat-Earth frame
// (x east, y up, z south):  m·dv/dt = T + L + Y + D + m·g.
// Rotation uses a fly-by-wire rate model like a real FBW jet: the stick
// commands load factor (pitch) and roll rate, the computer turns that into an
// angle-of-attack demand, limited to +9/−3 g and 25° AoA.
//
// Aerodynamics: CL = CLα·α up to the stall, CD = CD0(M) + k·CL², with a
// transonic drag rise. Thrust lapses with density and gains ram effect with
// Mach; fuel flow = TSFC × thrust (dry ≈ 0.76, reheat ≈ 1.95 lb/lbf/h).

import { atmosphere, G0, RHO0 } from './atmos.js';

export const JET = {
  name: 'STRIKER', S: 27.87, span: 9.96, empty: 8570, pilotGear: 380, fuelMax: 3175,
  tDry: 79e3, tAB: 129e3,                      // N, sea-level static (F100-PW-229 class)
  tsfcDry: 21.5e-6, tsfcAB: 55.2e-6,           // kg/(N·s)
  CLa: 3.9, alphaStall: 0.44, CLmax: 1.72, k: 0.124, nMax: 9, nMin: -3, alphaMax: 25 * Math.PI / 180,
  pMax: 4.2,                                   // rad/s max roll rate (≈ 240°/s)
};

export function cd0(M) {
  // Subsonic 0.020, drag rise through Mach 0.85–1.1, easing to 0.036 supersonic.
  if (M < 0.85) return 0.02;
  if (M < 1.1) return 0.02 + 0.026 * Math.sin(((M - 0.85) / 0.25) * Math.PI / 2) ** 2;
  return 0.046 - 0.01 * Math.min(1, (M - 1.1) / 0.9);
}

// Terrain: ocean at y = 0 west of the coast, rolling hills and a ridge inland.
function h2(x, z) { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf); const a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function terrain(x, z) {
  const coast = Math.min(1, Math.max(0, (x + 6000) / 12000));                 // sea to the west
  let n = 0, amp = 1, f = 1 / 9000;
  for (let i = 0; i < 5; i++) { n += amp * vnoise(x * f, z * f); amp *= 0.5; f *= 2.1; }
  const ridge = Math.max(0, 1 - Math.abs(x - 26000 - 4000 * Math.sin(z / 15000)) / 9000);
  return coast * (n * 900 + ridge * 1600) - 40 * (1 - coast);
}

const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, k) => v3(a.x * k, a.y * k, a.z * k);
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const norm = (a) => { const l = len(a) || 1; return scale(a, 1 / l); };
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
// Rotate vector v about unit axis k by angle th (Rodrigues).
const rot = (v, k, th) => { const c = Math.cos(th), s = Math.sin(th); return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c))); };

export class Fighter {
  constructor() { this.reset(); }
  reset({ alt = 3000, speed = 230, heading = 90 } = {}) {
    const hd = (heading * Math.PI) / 180;
    this.pos = v3(-2000, alt, 0);
    this.f = v3(Math.sin(hd), 0, -Math.cos(hd));          // heading 0 = north (−z), 90 = east (+x)
    this.u = v3(0, 1, 0); this.r = norm(cross(this.f, this.u));
    this.vel = scale(this.f, speed);
    this.fuel = JET.fuelMax; this.throttle = 0.75; this.ab = false;
    this.stick = { x: 0, y: 0 }; this.rudder = 0;
    this.p = 0; this.q = 0; this.rr = 0; this.aPerp = 0;
    this.t = 0; this.crashed = false; this.maxG = 1; this.dist = 0; this.fuelUsed = 0;
    this.ap = null; this.out = {};
    this.compute();
  }
  get mass() { return JET.empty + JET.pilotGear + this.fuel; }

  // Autopilot: hold altitude and heading (used by the tour and the "AP" button).
  autopilot(dt) {
    const A = this.ap; if (!A) return;
    const o = this.out, hdgErr = ((((A.hdg - o.heading) % 360) + 540) % 360) - 180;
    const bankCmd = Math.max(-60, Math.min(60, hdgErr * 2));
    this.stick.x = Math.max(-1, Math.min(1, (bankCmd - o.bank) / 40));
    const vsCmd = Math.max(-60, Math.min(60, (A.alt - this.pos.y) * 0.08));
    const nCmd = 1 / Math.max(0.3, Math.cos((o.bank * Math.PI) / 180)) + (vsCmd - o.vs) * 0.02;
    this.stick.y = nCmd >= 1 ? (nCmd - 1) / (JET.nMax - 1) : (nCmd - 1) / (1 - JET.nMin);
    if (A.spd) this.throttle = Math.max(0.2, Math.min(0.95, this.throttle + (A.spd - o.V) * 0.002 * dt * 60));
  }

  step(dt) {
    if (this.crashed) return;
    this.autopilot(dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) this.sub(dt / n);
    this.compute();
  }
  sub(h) {
    const m = this.mass, atm = atmosphere(this.pos.y), V = Math.max(1, len(this.vel)), vh = scale(this.vel, 1 / V);
    const M = V / atm.a, qbar = 0.5 * atm.rho * V * V;
    const vf = dot(this.vel, this.f), vu = dot(this.vel, this.u), vr = dot(this.vel, this.r);
    const alpha = Math.atan2(-vu, vf), beta = Math.atan2(vr, Math.hypot(vf, vu));
    // Lift coefficient with a soft stall.
    let CL = JET.CLa * alpha;
    if (Math.abs(alpha) > JET.alphaStall) CL = Math.sign(alpha) * JET.CLmax * Math.max(0.55, 1 - 1.8 * (Math.abs(alpha) - JET.alphaStall));
    const CD = cd0(M) + JET.k * CL * CL + 0.6 * beta * beta;
    const liftDir = norm(sub(this.u, scale(vh, dot(this.u, vh))));
    const sideDir = norm(sub(this.r, scale(vh, dot(this.r, vh))));
    const L = qbar * JET.S * CL, D = qbar * JET.S * CD, Y = -qbar * JET.S * 1.0 * beta;
    // Thrust: lapse ∝ σ^0.75 with ram gain; reheat only above 95 % throttle.
    const sigma = atm.rho / RHO0, ram = 1 + 0.25 * Math.min(M, 1.6);
    const ab = this.ab && this.throttle > 0.95 && this.fuel > 0;
    const Tmax = (ab ? JET.tAB : JET.tDry) * sigma ** 0.75 * ram;
    const T = this.fuel > 0 ? Tmax * (ab ? 1 : Math.max(0.06, this.throttle)) : 0;
    const ff = T * (ab ? JET.tsfcAB : JET.tsfcDry);
    const F = add(add(add(scale(this.f, T), scale(liftDir, L)), add(scale(sideDir, Y), scale(vh, -D))), v3(0, -m * G0, 0));
    const acc = scale(F, 1 / m);
    this.vel = add(this.vel, scale(acc, h));
    this.pos = add(this.pos, scale(this.vel, h));
    this.fuel = Math.max(0, this.fuel - ff * h); this.fuelUsed += ff * h;
    this.dist += V * h;
    // Fly-by-wire: stick → load-factor demand → AoA demand → pitch rate.
    const W = m * G0, s = this.stick.y;
    const nCmd = s >= 0 ? 1 + s * (JET.nMax - 1) : 1 + s * (1 - JET.nMin);
    const alphaCmd = Math.max(-0.2, Math.min(JET.alphaMax, (nCmd * W) / Math.max(1, qbar * JET.S * JET.CLa)));
    const gammaDot = (dot(acc, liftDir)) / V;                      // how fast the velocity vector is turning
    const qCmd = gammaDot + 5 * (alphaCmd - alpha);
    this.q += (qCmd - this.q) * Math.min(1, h / 0.08);
    const pCmd = this.stick.x * JET.pMax * Math.min(1, qbar / 12000);
    this.p += (pCmd - this.p) * Math.min(1, h / 0.12);
    const rCmd = this.rudder * 0.4 + 3 * beta;                     // yaw damper + turn coordination
    this.rr += (rCmd - this.rr) * Math.min(1, h / 0.2);
    // Rotate the body frame.
    this.f = rot(this.f, this.r, this.q * h); this.u = rot(this.u, this.r, this.q * h);   // pitch (nose up about +r)
    this.u = rot(this.u, this.f, this.p * h); this.r = rot(this.r, this.f, this.p * h);   // roll right
    this.f = rot(this.f, this.u, -this.rr * h); this.r = rot(this.r, this.u, -this.rr * h);
    this.f = norm(this.f); this.r = norm(cross(this.f, this.u)); this.u = norm(cross(this.r, this.f));
    this.last = { alpha, beta, CL, CD, L, D, T, ff, M, qbar, atm, W, ab };
    this.t += h;
    const ground = terrain(this.pos.x, this.pos.z);
    if (this.pos.y < Math.max(0, ground) + 2) { this.crashed = true; this.pos.y = Math.max(0, ground) + 2; }
  }
  compute() {
    if (!this.last) this.sub(1e-4);
    const L = this.last;
    const V = len(this.vel), g = G0, n = L.L / L.W;
    this.maxG = Math.max(this.maxG, n);
    const heading = ((Math.atan2(this.f.x, -this.f.z) * 180) / Math.PI + 360) % 360;
    const pitch = (Math.asin(Math.max(-1, Math.min(1, this.f.y))) * 180) / Math.PI;
    const bank = (Math.atan2(-this.r.y, this.u.y) * 180) / Math.PI;
    const vs = this.vel.y, gamma = Math.asin(Math.max(-1, Math.min(1, vs / Math.max(1, V))));
    const nH = Math.sqrt(Math.max(0, n * n - 1));
    const turnRate = nH > 0.01 ? (g * nH) / V : 0, turnRadius = nH > 0.01 ? (V * V) / (g * nH) : Infinity;
    const Ps = (V * (L.T - L.D)) / L.W;                       // specific excess power, m/s
    const eas = V * Math.sqrt(L.atm.rho / RHO0);
    this.out = {
      V, M: L.M, kcas: eas / 0.514444, alt: this.pos.y, altFt: this.pos.y / 0.3048, heading, pitch, bank, vs, gamma,
      n, alpha: (L.alpha * 180) / Math.PI, beta: (L.beta * 180) / Math.PI, qbar: L.qbar, T: L.T, D: L.D, CL: L.CL, CD: L.CD, LD: L.CL / L.CD,
      ff: L.ff, ffPph: L.ff * 3600 / 0.45359237, fuel: this.fuel, turnRate: (turnRate * 180) / Math.PI, turnRadius, Ps, He: this.pos.y + (V * V) / (2 * g),
      specRange: L.ff > 0 ? V / L.ff / 1000 : Infinity,       // km per kg of fuel
      endurance: L.ff > 0 ? this.fuel / L.ff : Infinity,     // s
      rangeLeft: L.ff > 0 ? (this.fuel * V) / L.ff / 1000 : Infinity, ab: L.ab, mass: this.mass, TW: L.T / L.W,
    };
  }
}

// Breguet range for a jet (constant altitude-cruise approximation):
//   R = (V / (g·TSFC)) · (L/D) · ln(Wi / Wf)
export const breguet = (V, LD, tsfc, wi, wf) => (V / (G0 * tsfc)) * LD * Math.log(wi / wf);
