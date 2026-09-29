// ORBIT · VOLTA, a fictional single-stage spaceplane with electric-pump-fed
// rocket engines and air-breathing boost engines.
//
// Physics: planar flight in the equatorial plane, integrated in an Earth-
// centred inertial frame with RK4 at 20 ms.
//   gravity  g = −μ·r/|r|³  (plus J2 is ignored: planar equatorial)
//   aero     D, L from the wind-relative velocity v_rel = v − ω⊕ × r
//   thrust   along the body axis, pitched θ above the local horizontal
// Engines:
//   AIR   combined-cycle turbo-ramjet on methane, Isp falls from 3 600 s
//         (turbojet) to ~1 500 s (ramjet at Mach 5); thrust ∝ ρ·f(M).
//   ROCKET methalox, electric-pump-fed. F = ṁ·Isp_vac·g0 − A_e·p_a.
//         Pump power P = ṁ·Δp/(ρ·η) per propellant, drawn from batteries.
//   OMS   small pressure-fed thrusters, Isp 320 s, for circularisation.
// Losses are integrated exactly: gravity ∫g·sinγ dt, drag ∫D/m dt,
// steering ∫(T/m)(1 − cos δ) dt.

import { atmosphere, G0, MU, RE, OMEGA_E } from './atmos.js';

export const VOLTA = {
  dry: 8200, payload: 1000, battery: 2100,           // kg (composite airframe, 12 % of gross)
  lox: 43000, ch4: 12290, ch4Air: 8600, oms: 850,  // kg: rocket LOX/CH4 at O/F 3.5, air-breathing CH4, OMS
  S: 140, CD0: 0.013, k: 0.16, CLa: 3.0,            // wing area m², polar
  air: { T0: 520e3, IspMax: 3600, machOff: 5.4, machSwitch: 5.0, Ac: 3.4 },  // four combined-cycle engines; capture area m²
  rocket: { Fvac: 1150e3, IspVac: 368, IspSl: 332, pc: 12e6, of: 3.5, dpInj: 3.0e6 },
  pump: { eta: 0.68, rhoOx: 1141, rhoF: 422 },
  batt: { whPerKg: 240, wPerKg: 7000 },
  omsIsp: 320, gLimit: 4, qLimit: 55e3,
};

export const tsiolkovsky = (isp, m0, mf) => isp * G0 * Math.log(m0 / mf);
export const massRatioFor = (dv, isp) => Math.exp(dv / (isp * G0));

// Air-breathing performance vs Mach (combined cycle: turbojet → ramjet).
// Turbojet mode: T = T0·σ·(1 + 0.5·M) up to Mach 3. Ramjet mode (Mach ≥ 2): thrust
// scales with dynamic pressure, T = q·A_c·C_T(M), with capture area A_c.
export function airPerf(M, rho, q) {
  const A = VOLTA.air;
  if (M > A.machOff) return { T: 0, isp: 0, mode: 'off' };
  const turbo = M < 3 ? A.T0 * (rho / 1.225) * (1 + 0.5 * M) * (M > 2.5 ? (3 - M) / 0.5 : 1) : 0;
  const ct = M < 1.5 ? 0 : M < 2.2 ? 2.8 * (M - 1.5) / 0.7 : 2.8 - 0.4 * (M - 2.2);
  const ram = q * A.Ac * Math.max(0, ct) * (M > 5 ? Math.max(0, (A.machOff - M) / (A.machOff - 5)) : 1);
  const T = Math.max(turbo, ram), mode = ram > turbo ? 'ram' : 'turbo';
  const isp = mode === 'turbo' ? A.IspMax - 250 * M : 2400 - 280 * (M - 2);          // s, methane
  return { T, isp: Math.max(900, isp), mode };
}
// Electric pump power and battery sizing for a rocket mass flow ṁ (kg/s).
export function pumpPower(mdot) {
  const R = VOLTA.rocket, P = VOLTA.pump, dp = R.pc + R.dpInj;
  const mOx = (mdot * R.of) / (1 + R.of), mF = mdot / (1 + R.of);
  const pOx = (mOx * dp) / (P.rhoOx * P.eta), pF = (mF * dp) / (P.rhoF * P.eta);
  return { pOx, pF, total: pOx + pF, mOx, mF };
}

export const PHASE = ['roll', 'climb', 'air', 'rocket', 'coast', 'circ', 'orbit', 'deployed', 'fail'];

export class Ascent {
  constructor(opts = {}) {
    this.o = { targetKm: 400, payload: VOLTA.payload, airbreathe: true, dropBatt: true, lat: 0, ...opts };
    const r0 = RE + 10;
    this.x = r0; this.y = 0;                                        // start on the equator, x axis
    const vRot = OMEGA_E * r0;
    this.vx = 0; this.vy = vRot;                                    // rotating with Earth, facing east (+y)
    this.lox = VOLTA.lox; this.ch4 = VOLTA.ch4; this.ch4Air = this.o.airbreathe ? VOLTA.ch4Air : 0; this.oms = VOLTA.oms;
    this.batt = VOLTA.battery; this.battE = VOLTA.battery * VOLTA.batt.whPerKg * 3600;    // J
    this.battE0 = this.battE; this.battDropped = 0;
    this.payload = this.o.payload;
    this.phase = 'roll'; this.t = 0; this.throttle = 1;
    this.loss = { grav: 0, drag: 0, steer: 0 }; this.dv = { air: 0, rocket: 0, oms: 0 };
    this.maxQ = 0; this.maxG = 0; this.events = []; this.hist = [];
    this.pitch = 0; this.alpha = 0; this.omsDvLeft = 0;
    this.m0 = this.mass;
    this.update(0);
  }
  get mass() { return VOLTA.dry + this.payload + this.batt + this.lox + this.ch4 + this.ch4Air + this.oms; }
  event(k, v = {}) { this.events.push({ t: this.t, k, ...v }); this.onEvent?.(k, v); }

  // Local frame and derived quantities for a state.
  frame(x, y, vx, vy) {
    const r = Math.hypot(x, y), up = [x / r, y / r], east = [-up[1], up[0]];
    const vrx = vx + OMEGA_E * y, vry = vy - OMEGA_E * x;          // v_rel = v − ω×r  (ω×r = ω(−y, x))
    const vRel = Math.hypot(vrx, vry), v = Math.hypot(vx, vy);
    const gRel = Math.atan2(vrx * up[0] + vry * up[1], vrx * east[0] + vry * east[1]);
    const gIn = Math.atan2(vx * up[0] + vy * up[1], vx * east[0] + vy * east[1]);
    const h = r - RE, atm = atmosphere(Math.max(0, h));
    return { r, up, east, vrx, vry, vRel, v, gRel, gIn, h, atm, M: vRel / atm.a, q: 0.5 * atm.rho * vRel * vRel };
  }
  // Orbit from state: specific energy and angular momentum → a, e, apo, peri.
  orbit(x = this.x, y = this.y, vx = this.vx, vy = this.vy) {
    const r = Math.hypot(x, y), v2 = vx * vx + vy * vy, eps = v2 / 2 - MU / r, hh = x * vy - y * vx;
    const a = -MU / (2 * eps), e = Math.sqrt(Math.max(0, 1 + (2 * eps * hh * hh) / (MU * MU)));
    return { a, e, apo: a * (1 + e) - RE, peri: a * (1 - e) - RE, eps, hh, period: eps < 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / MU) : Infinity };
  }

  // Guidance + engine model: returns forces for a state.
  forces(s) {
    const F = this.frame(s.x, s.y, s.vx, s.vy), m = s.m, ph = this.phase;
    let T = 0, mdotF = 0, mdotAir = 0, mdotOx = 0, mdotOms = 0, pitch = F.gRel, isp = 0, pumpP = 0;
    const g = MU / (F.r * F.r);
    let alpha = 0;
    // Guidance: commanded flight-path angle (relative) per phase.
    let gCmd = 0;
    if (ph === 'roll') gCmd = 0;
    else if (ph === 'climb') gCmd = 0.26;                                       // 15° climb-out
    if (ph === 'air') { const qStar = 50e3; gCmd = Math.max(-0.03, Math.min(0.2, 0.03 * (F.q - qStar) / 5e3 + 0.02)); }
    if (ph === 'rocket') { const v0 = this.vIgn ?? F.v; gCmd = Math.max(0.0, 0.33 * (1 - (F.v - v0) / 5200)); if (F.h < 70e3) gCmd = Math.max(gCmd, 0.05); }
    // Aerodynamic lift to follow the command (α limited), rocket vectoring above the air.
    const qS = F.q * VOLTA.S;
    if (ph !== 'roll') {
      const vGamma = Math.max(1, F.vRel);
      const need = m * (g - (F.vRel * Math.cos(F.gRel)) ** 2 / F.r) * Math.cos(F.gRel) + m * vGamma * 1.2 * (gCmd - F.gRel);
      const aMax = ph === 'rocket' ? 0.05 : 0.26;
      alpha = qS > 50 ? Math.max(-0.05, Math.min(aMax, need / (qS * VOLTA.CLa))) : 0;
      pitch = F.gRel + alpha;
    }
    const CL = VOLTA.CLa * alpha, L = qS * CL;
    const CD = VOLTA.CD0 * (F.M > 0.9 && F.M < 1.3 ? 2.0 : F.M > 1.3 ? 1.2 : 1) + VOLTA.k * CL * CL, D = qS * CD;
    // Propulsion.
    if (ph === 'roll' || ph === 'climb' || ph === 'air') {
      const ap = airPerf(F.M, F.atm.rho, F.q); this.airMode = ap.mode;
      if (this.ch4Air > 0 && this.o.airbreathe) { T = ap.T * this.throttle; isp = ap.isp; mdotAir = T / (isp * G0); }
    }
    let steer = 0;
    if (ph === 'rocket' || (!this.o.airbreathe && (ph === 'roll' || ph === 'climb' || ph === 'air'))) {
      const R = VOLTA.rocket, mdot = (R.Fvac / (R.IspVac * G0)) * this.throttle;
      const Ae = (R.Fvac * (1 - R.IspSl / R.IspVac)) / 101325;                  // exit area from the SL/vac Isp gap
      T = mdot * R.IspVac * G0 - Ae * F.atm.p; isp = T / (mdot * G0);
      mdotOx = (mdot * R.of) / (1 + R.of); mdotF = mdot / (1 + R.of);
      pumpP = pumpPower(mdot).total;
      // Above the thick air, steer with thrust vector toward the command.
      if (F.q < 3e3) { const need = (gCmd - F.gIn) * 0.8; steer = Math.max(-0.3, Math.min(0.3, need)); pitch = F.gIn + steer; }
    }
    if (ph === 'circ') { T = 36e3; isp = VOLTA.omsIsp; mdotOms = T / (isp * G0); pitch = F.gIn; }
    // Force vectors (inertial). Thrust at "pitch" above local horizontal; drag against v_rel; lift ⊥ v_rel.
    const th = [Math.cos(pitch) * F.east[0] + Math.sin(pitch) * F.up[0], Math.cos(pitch) * F.east[1] + Math.sin(pitch) * F.up[1]];
    const vr = F.vRel > 0.1 ? [F.vrx / F.vRel, F.vry / F.vRel] : [F.east[0], F.east[1]];
    const ln = [vr[1], -vr[0]];                                               // v_rel rotated 90° toward local up (eastward flight)
    const ax = (T * th[0] - D * vr[0] + L * ln[0]) / m - (MU * s.x) / F.r ** 3;
    const ay = (T * th[1] - D * vr[1] + L * ln[1]) / m - (MU * s.y) / F.r ** 3;
    // Runway: the ground pushes back while rolling (no sinking below the strip).
    let axx = ax, ayy = ay;
    if (ph === 'roll') { const ar = ax * F.up[0] + ay * F.up[1]; if (ar < 0) { axx -= ar * F.up[0]; ayy -= ar * F.up[1]; } }
    return { ax: axx, ay: ayy, T, D, L, mdotF, mdotAir, mdotOx, mdotOms, F, pitch, alpha, isp, pumpP, steer, g, thrustAcc: T / m };
  }

  deriv(s) {
    const f = this.forces(s);
    return { f, d: { x: s.vx, y: s.vy, vx: f.ax, vy: f.ay, m: -(f.mdotF + f.mdotAir + f.mdotOx + f.mdotOms) } };
  }
  step(dt) { const n = Math.max(1, Math.ceil(dt / 0.02)); for (let i = 0; i < n; i++) this.sub(dt / n); }
  sub(h) {
    if (this.phase === 'fail' || this.phase === 'deployed' || this.phase === 'orbit') { this.t += h; this.coastOrbit(h); this.update(h); return; }
    const s = { x: this.x, y: this.y, vx: this.vx, vy: this.vy, m: this.mass };
    const k1 = this.deriv(s);
    const s2 = {}; for (const k in s) s2[k] = s[k] + 0.5 * h * k1.d[k];
    const k2 = this.deriv(s2);
    const s3 = {}; for (const k in s) s3[k] = s[k] + 0.5 * h * k2.d[k];
    const k3 = this.deriv(s3);
    const s4 = {}; for (const k in s) s4[k] = s[k] + h * k3.d[k];
    const k4 = this.deriv(s4);
    for (const k of ['x', 'y', 'vx', 'vy']) this[k] += (h / 6) * (k1.d[k] + 2 * k2.d[k] + 2 * k3.d[k] + k4.d[k]);
    const f = k1.f;
    // Propellant bookkeeping (from the RK-averaged rates at the start of the step; small dt).
    this.ch4 = Math.max(0, this.ch4 - f.mdotF * h); this.ch4Air = Math.max(0, this.ch4Air - f.mdotAir * h); this.lox = Math.max(0, this.lox - f.mdotOx * h); this.oms = Math.max(0, this.oms - f.mdotOms * h);
    if (f.pumpP > 0) { this.battE = Math.max(0, this.battE - f.pumpP * h); }
    // Δv and loss integrals.
    const m = this.mass, a = f.T / m;
    const key = f.mdotOms > 0 ? 'oms' : f.mdotOx > 0 ? 'rocket' : 'air';
    if (f.T > 0) this.dv[key] += a * h;
    this.loss.grav += f.g * Math.sin(f.F.gIn) * h * (f.T > 0 ? 1 : 0);
    this.loss.drag += (f.D / m) * h;
    this.loss.steer += a * (1 - Math.cos(f.steer || 0)) * h;
    this.last = f; this.t += h;
    this.maxQ = Math.max(this.maxQ, f.F.q); this.maxG = Math.max(this.maxG, Math.hypot(f.ax + (MU * this.x) / f.F.r ** 3, f.ay + (MU * this.y) / f.F.r ** 3) / G0);
    this.update(h);
  }
  // Phase logic, limits and the battery.
  update() {
    const F = this.frame(this.x, this.y, this.vx, this.vy), O = this.orbit();
    this.now = { ...F, orbit: O };
    const ph = this.phase;
    if (ph === 'fail' || ph === 'deployed') return;
    if (F.h < -5) { this.phase = 'fail'; this.event('ev.crash'); return; }
    if (ph === 'roll' && F.vRel > 118) { this.phase = 'climb'; this.event('ev.rotate'); }
    if (ph === 'climb' && this.o.airbreathe && (F.h > 7000 || F.q > 60e3)) { this.phase = 'air'; this.event('ev.corridor'); }
    const airDone = !this.o.airbreathe || F.M > VOLTA.air.machSwitch || this.ch4Air <= 0;
    if ((ph === 'air' || ph === 'climb') && airDone && this.o.airbreathe) { this.phase = 'rocket'; this.vIgn = F.v; this.event('ev.rocket', { m: F.M.toFixed(1), h: (F.h / 1000).toFixed(1) }); }
    if (!this.o.airbreathe && ph === 'climb' && F.h > 2000) { this.phase = 'rocket'; this.vIgn = F.v; this.event('ev.rocket', { m: F.M.toFixed(1), h: (F.h / 1000).toFixed(1) }); }
    if (this.phase === 'rocket') {
      // Throttle to respect the g-limit and max-Q.
      const T = VOLTA.rocket.Fvac, m = this.mass;
      this.throttle = Math.max(0.3, Math.min(1, (VOLTA.gLimit * G0 * m) / T, F.q > VOLTA.qLimit ? 0.6 : 1));
      if (O.apo >= this.o.targetKm * 1000) { this.phase = 'coast'; this.throttle = 0; this.event('ev.meco', { a: (O.apo / 1000).toFixed(0) }); }
      if (this.lox <= 0 || this.ch4 <= 0) { this.phase = O.peri > 120e3 ? 'orbit' : 'fail'; this.event(this.phase === 'fail' ? 'ev.dry' : 'ev.orbit'); }
      if (this.battE <= 0) { this.phase = 'fail'; this.event('ev.battery'); }
      // Drop spent battery packs (they are dead mass).
      if (this.o.dropBatt && this.battDropped < 2 && this.battE < this.battE0 * (1 - (this.battDropped + 1) / 3)) {
        const drop = VOLTA.battery / 3; this.batt -= drop; this.battDropped++; this.event('ev.battDrop', { kg: drop.toFixed(0) });
      }
    } else if (ph !== 'rocket') this.throttle = ph === 'coast' || ph === 'orbit' || ph === 'deployed' ? 0 : 1;
    if (this.phase === 'coast') {
      // Circularise at apoapsis: burn when radial velocity changes sign.
      const vr = (this.x * this.vx + this.y * this.vy) / F.r;
      if (vr <= 0) {
        const r = F.r, vc = Math.sqrt(MU / r), v = F.v;
        this.omsDvLeft = Math.max(0, vc - v); this.phase = 'circ'; this.event('ev.circ', { dv: this.omsDvLeft.toFixed(0) });
      }
    }
    if (this.phase === 'circ') {
      if (this.oms <= 0 || O.peri >= this.o.targetKm * 1000 * 0.97 || this.orbit().e < 0.0015) { this.phase = O.peri > 150e3 ? 'orbit' : 'fail'; this.event(this.phase === 'orbit' ? 'ev.orbit' : 'ev.dryOms'); }
    }
    if (!this.hist.length || this.t - this.hist[this.hist.length - 1].t >= 2) this.hist.push({ t: this.t, h: F.h, v: F.v, vRel: F.vRel, q: F.q, m: this.mass, M: F.M, down: F.r * Math.atan2(this.y, this.x) });
  }
  coastOrbit(h) {
    // Two-body RK4 once in orbit.
    const a = (x, y) => { const r3 = Math.hypot(x, y) ** 3; return [(-MU * x) / r3, (-MU * y) / r3]; };
    const s = [this.x, this.y, this.vx, this.vy], f = (s) => { const g = a(s[0], s[1]); return [s[2], s[3], g[0], g[1]]; };
    const k1 = f(s), k2 = f(s.map((v, i) => v + 0.5 * h * k1[i])), k3 = f(s.map((v, i) => v + 0.5 * h * k2[i])), k4 = f(s.map((v, i) => v + h * k3[i]));
    [this.x, this.y, this.vx, this.vy] = s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  deploy() { if (this.phase !== 'orbit') return false; this.phase = 'deployed'; this.deployedKg = this.payload; this.payload = 0; this.event('ev.deploy'); return true; }
  get propTotal() { return this.lox + this.ch4 + this.oms; }
}
