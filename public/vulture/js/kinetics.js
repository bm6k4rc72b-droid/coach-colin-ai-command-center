/**
 * Human-kinetics engine: 33-point pose landmarks in, coaching numbers out.
 *
 * What is measured directly from the pose (and how):
 *   - Joint angles: interior angle at each joint from three landmarks, using
 *     MediaPipe's metric 3-D world landmarks when present (camera-angle
 *     independent) and aspect-corrected image landmarks otherwise.
 *   - Range of motion: running min/max of each smoothed angle.
 *   - Reps: hysteresis on the exercise's primary joint (e.g. knee < 110° then
 *     > 155° is one squat), with depth and concentric velocity per rep.
 *   - Speed, vertical acceleration: hip-centre track, scaled to metres from
 *     the athlete's height, One-Euro smoothed then differentiated.
 *   - Cadence / step length (running): hip vertical-oscillation minima.
 *
 * What is derived with a model (and labelled as an estimate in the UI):
 *   - Force: F = m·(g + a_up), the vertical ground-reaction force implied by
 *     the centre-of-mass acceleration (hip centre as CoM proxy).
 *   - Fatigue: velocity loss — drop in concentric velocity versus the best of
 *     the first reps (velocity-based training), or cadence loss when running.
 *   - Muscle activation: a kinematic demand model (joint flexion × dynamic
 *     load), NOT electromyography. It ranks which muscles a movement loads
 *     and when through the range; it cannot measure a contraction.
 *
 * @module vulture/kinetics
 */

import { jointAngle } from './geometry.js';
import { Derivative, Ema, OneEuro } from './filters.js';

export const G = 9.80665;

/** MediaPipe Pose landmark indices. */
export const LM = Object.freeze({
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28, lHeel: 29, rHeel: 30, lFoot: 31, rFoot: 32,
});

/** Skeleton edges for drawing. */
export const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

/** Joint definitions: [proximal, vertex, distal]. */
export const JOINTS = Object.freeze({
  lShoulder: [23, 11, 13], rShoulder: [24, 12, 14],
  lElbow: [11, 13, 15], rElbow: [12, 14, 16],
  lHip: [11, 23, 25], rHip: [12, 24, 26],
  lKnee: [23, 25, 27], rKnee: [24, 26, 28],
  lAnkle: [25, 27, 31], rAnkle: [26, 28, 32],
});

/** Exercise presets: primary joint, rest/active thresholds and which direction is concentric. */
export const EXERCISES = Object.freeze({
  squat: { label: 'Squat', joint: 'knee', rest: 155, active: 110, concentric: 'extend' },
  lunge: { label: 'Lunge', joint: 'knee', rest: 155, active: 110, concentric: 'extend' },
  pushup: { label: 'Push-up', joint: 'elbow', rest: 150, active: 100, concentric: 'extend' },
  curl: { label: 'Biceps curl', joint: 'elbow', rest: 150, active: 65, concentric: 'flex' },
  run: { label: 'Run / sprint', joint: 'knee', rest: null, active: null, concentric: null },
});

export const MUSCLES = ['Quads', 'Glutes', 'Hamstrings', 'Calves', 'Core', 'Arms'];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const visible = (lm, ids, min = 0.5) => ids.every((i) => lm[i] && (lm[i].visibility ?? 1) >= min);

export class KineticsEngine {
  /**
   * @param {object} [opts]
   * @param {number} [opts.massKg=75] Athlete body mass.
   * @param {number} [opts.heightM=1.75] Athlete standing height.
   * @param {keyof EXERCISES} [opts.exercise='squat'] Movement being coached.
   */
  constructor({ massKg = 75, heightM = 1.75, exercise = 'squat' } = {}) {
    this.massKg = massKg;
    this.heightM = heightM;
    this.exercise = exercise;
    this.treadmillMs = 0;
    this.reset();
  }

  reset() {
    this.angleF = Object.fromEntries(Object.keys(JOINTS).map((k) => [k, new OneEuro(1.2, 0.03)]));
    this.angles = {};
    this.rom = {};
    this.angVel = Object.fromEntries(Object.keys(JOINTS).map((k) => [k, new Derivative(0.06)]));
    this.angRate = {};
    this.posF = { x: new OneEuro(1.5, 0.5), y: new OneEuro(1.5, 0.5) };
    this.vel = { x: new Derivative(0.1), y: new Derivative(0.1) };
    this.acc = new Derivative(0.12);
    this.speedEma = new Ema(0.6);
    this.mpu = null; // metres per iso-unit (frame-height units)
    this.standUnits = [];
    this.reps = [];
    this.repState = 'rest';
    this.repStart = null;
    this.repBottom = null;
    this.repMin = Infinity;
    this.repMax = -Infinity;
    this.repVel = [];
    this.steps = [];
    this.hipYHist = [];
    this.cadenceBase = null;
    this.forceEma = new Ema(0.08);
    this.peakForce = 0;
    this.impactHist = [];
    this.activation = Object.fromEntries(MUSCLES.map((m) => [m, new Ema(0.25)]));
    this.romHeat = Object.fromEntries(MUSCLES.map((m) => [m, { sum: new Array(10).fill(0), n: new Array(10).fill(0) }]));
    this.log = [];
    this.lastLog = -Infinity;
    this.last = null;
    this.flags = [];
    this.imu = null;
  }

  /** Clear ROM and rep history but keep calibration. */
  resetSet() {
    const { mpu, standUnits } = this;
    this.reset();
    this.mpu = mpu;
    this.standUnits = standUnits;
  }

  /**
   * Feed an IMU reading (phone accelerometer, including gravity, m/s²).
   *
   * @param {number} gTotal |a| / g.
   * @param {number} t Seconds.
   */
  pushImu(gTotal, t) {
    this.imu = { g: gTotal, t };
    this.impactHist.push([t, gTotal]);
  }

  /**
   * Process one pose frame.
   *
   * @param {{x:number,y:number,z:number,visibility?:number}[]} lm Normalised image landmarks.
   * @param {{x:number,y:number,z:number}[]|null} world Metric world landmarks (or null).
   * @param {number} tMs Timestamp, ms.
   * @param {number} aspect Frame width / height.
   * @returns {object} Frame metrics.
   */
  update(lm, world, tMs, aspect = 16 / 9) {
    const t = tMs / 1000;
    const iso = (p) => ({ x: p.x * aspect, y: p.y, z: (p.z ?? 0) * aspect });
    // Angles.
    for (const [name, ids] of Object.entries(JOINTS)) {
      if (!visible(lm, ids)) continue;
      const src = world && world.length === lm.length ? ids.map((i) => world[i]) : ids.map((i) => iso(lm[i]));
      const raw = jointAngle(src[0], src[1], src[2]);
      if (!Number.isFinite(raw)) continue;
      const a = this.angleF[name].filter(raw, t);
      this.angles[name] = a;
      this.angRate[name] = this.angVel[name].push(a, t);
      const r = this.rom[name] ?? { min: Infinity, max: -Infinity };
      r.min = Math.min(r.min, a); r.max = Math.max(r.max, a);
      this.rom[name] = r;
    }
    const pair = (j) => mean([this.angles[`l${j}`], this.angles[`r${j}`]].filter(Number.isFinite));
    const knee = pair('Knee');
    const hip = pair('Hip');
    const elbow = pair('Elbow');
    const ankle = pair('Ankle');

    // Scale: nose → mid-ankle span while standing tall ≈ 0.89 × stature.
    let span = NaN;
    if (visible(lm, [0, 27, 28], 0.4)) {
      const n = iso(lm[0]);
      const a = { x: (iso(lm[27]).x + iso(lm[28]).x) / 2, y: (lm[27].y + lm[28].y) / 2 };
      span = Math.hypot(n.x - a.x, n.y - a.y);
      if (Number.isFinite(knee) && knee > 165 && Number.isFinite(hip) && hip > 160) {
        this.standUnits.push(span);
        if (this.standUnits.length > 90) this.standUnits.shift();
        const sorted = [...this.standUnits].sort((x, y) => x - y);
        const ref = sorted[Math.floor(sorted.length * 0.8)];
        this.mpu = (this.heightM * 0.89) / ref;
      }
    }

    // Hip-centre kinematics.
    let speed = NaN; let aUp = NaN; let force = NaN;
    if (visible(lm, [23, 24], 0.4)) {
      const hx = ((lm[23].x + lm[24].x) / 2) * aspect;
      const hy = (lm[23].y + lm[24].y) / 2;
      const mpu = this.mpu ?? (Number.isFinite(span) && span > 0 ? (this.heightM * 0.89) / span : null);
      if (mpu) {
        const px = this.posF.x.filter(hx * mpu, t);
        const py = this.posF.y.filter(hy * mpu, t);
        const vx = this.vel.x.push(px, t);
        const vy = this.vel.y.push(py, t);
        aUp = -this.acc.push(vy, t); // image y grows downward
        speed = this.speedEma.push(Math.abs(vx), t);
        if (this.treadmillMs > 0) speed = this.treadmillMs;
        force = this.forceEma.push(this.massKg * (G + aUp), t);
        this.hipYHist.push([t, py]);
        if (this.hipYHist.length > 240) this.hipYHist.shift();
        this.detectStep(t);
      }
    }
    if (Number.isFinite(force)) {
      this.peakForce = Math.max(this.peakForce, force);
      if (!this.imu || t - this.imu.t > 1) this.impactHist.push([t, (G + aUp) / G]);
    }
    while (this.impactHist.length && t - this.impactHist[0][0] > 2) this.impactHist.shift();
    const impactG = this.impactHist.reduce((m, [, g]) => Math.max(m, g), 0);

    // Reps.
    const ex = EXERCISES[this.exercise];
    let primary = NaN;
    if (ex.joint === 'knee') primary = this.exercise === 'lunge' ? Math.min(this.angles.lKnee ?? Infinity, this.angles.rKnee ?? Infinity) : knee;
    if (ex.joint === 'elbow') primary = elbow;
    if (ex.rest !== null && Number.isFinite(primary)) this.detectRep(primary, t, ex);

    // Muscle demand model.
    const load = Number.isFinite(aUp) ? Math.max(0.5, Math.min(3, (G + aUp) / G)) : 1;
    const lf = load ** 0.7;
    const kneeFlex = clamp01((180 - (knee || 180)) / 100);
    const hipFlex = clamp01((180 - (hip || 180)) / 110);
    const elbowFlex = clamp01((180 - (elbow || 180)) / 120);
    const dorsi = clamp01((115 - (ankle || 115)) / 35);
    const plantar = clamp01(((ankle || 115) - 115) / 35);
    const kneeExtVel = clamp01(mean([this.angRate.lKnee, this.angRate.rKnee].filter(Number.isFinite)) / 300 || 0);
    const hipExtVel = clamp01(mean([this.angRate.lHip, this.angRate.rHip].filter(Number.isFinite)) / 300 || 0);
    const trunk = this.trunkLean(lm, aspect);
    const upper = this.exercise === 'pushup' || this.exercise === 'curl';
    const targets = {
      Quads: 0.08 + 0.72 * kneeFlex * lf + 0.2 * kneeExtVel,
      Glutes: 0.06 + 0.66 * hipFlex * lf + 0.25 * hipExtVel,
      Hamstrings: 0.06 + 0.55 * hipFlex * (1 - 0.5 * kneeFlex) * lf + 0.15 * hipExtVel,
      Calves: 0.08 + 0.5 * plantar * lf + 0.25 * dorsi * lf + 0.25 * clamp01(impactG - 1),
      Core: 0.1 + 0.5 * clamp01((trunk || 0) / 50) + (this.exercise === 'pushup' ? 0.35 : 0),
      Arms: 0.05 + (upper ? 0.85 * elbowFlex * (this.exercise === 'pushup' ? lf : 1) : 0.1 * elbowFlex),
    };
    const activation = {};
    for (const m of MUSCLES) activation[m] = Math.round(100 * clamp01(this.activation[m].push(clamp01(targets[m]), t)));

    // Heat through the range of motion of the primary joint.
    const pj = ex.joint === 'elbow' ? (this.rom.lElbow ?? this.rom.rElbow) : (this.rom.lKnee ?? this.rom.rKnee);
    if (pj && Number.isFinite(primary) && pj.max - pj.min > 15) {
      const pos = clamp01((pj.max - primary) / (pj.max - pj.min));
      const bin = Math.min(9, Math.floor(pos * 10));
      for (const m of MUSCLES) { this.romHeat[m].sum[bin] += activation[m]; this.romHeat[m].n[bin]++; }
    }

    // Fatigue.
    const fatigue = this.fatigue(t);

    // Form flags (safety cues).
    const flags = [];
    if (Number.isFinite(trunk) && trunk > 45 && ex.joint === 'knee' && this.exercise !== 'run') flags.push('Trunk lean > 45°');
    const valgus = this.kneeValgus(lm, aspect);
    if (valgus) flags.push(`Knee valgus (${valgus})`);
    if (impactG > 3.5) flags.push(`High impact ${impactG.toFixed(1)} G`);
    this.flags = flags;

    const cad = this.cadence(t);
    const frame = {
      t: tMs, angles: { ...this.angles }, knee, hip, elbow, ankle, trunk, speed, aUp, force,
      impactG, activation, fatigue, reps: this.reps.length, lastRep: this.reps[this.reps.length - 1] ?? null,
      cadence: cad, stepLength: Number.isFinite(speed) && cad > 0 ? speed / (cad / 60) : NaN,
      calibrated: this.mpu !== null, flags, repState: this.repState,
    };
    this.last = frame;
    if (tMs - this.lastLog >= 100) {
      this.lastLog = tMs;
      this.log.push(frame);
      if (this.log.length > 36000) this.log.shift();
    }
    return frame;
  }

  /** Torso angle from vertical, degrees. */
  trunkLean(lm, aspect) {
    if (!visible(lm, [11, 12, 23, 24], 0.4)) return NaN;
    const sx = ((lm[11].x + lm[12].x) / 2) * aspect; const sy = (lm[11].y + lm[12].y) / 2;
    const hx = ((lm[23].x + lm[24].x) / 2) * aspect; const hy = (lm[23].y + lm[24].y) / 2;
    return (Math.atan2(Math.abs(sx - hx), Math.abs(hy - sy)) * 180) / Math.PI;
  }

  /**
   * Frontal-plane knee collapse: the knee sits medial to the hip-ankle line
   * by more than 4 % of leg length. Only meaningful from a front-on camera.
   */
  kneeValgus(lm, aspect) {
    if (!visible(lm, [23, 24, 25, 26, 27, 28], 0.6)) return null;
    const hipW = Math.abs(lm[23].x - lm[24].x) * aspect;
    const legL = Math.hypot((lm[23].x - lm[27].x) * aspect, lm[23].y - lm[27].y);
    if (hipW < legL * 0.25) return null; // side-on view
    const sides = [];
    const mid = (lm[23].x + lm[24].x) / 2;
    for (const [h, k, a, name] of [[23, 25, 27, 'L'], [24, 26, 28, 'R']]) {
      const t = (lm[k].y - lm[h].y) / ((lm[a].y - lm[h].y) || 1e-6);
      const lineX = lm[h].x + (lm[a].x - lm[h].x) * t;
      const medial = (Math.abs(lineX - mid) - Math.abs(lm[k].x - mid)) * aspect;
      if (medial > legL * 0.04) sides.push(name);
    }
    return sides.length ? sides.join('+') : null;
  }

  detectRep(angle, t, ex) {
    const flexMode = ex.concentric === 'flex';
    if (this.repState === 'rest') {
      if (angle < ex.active) {
        this.repState = 'active';
        this.repStart = t;
        this.repMin = angle;
        this.repBottom = t;
      }
      return;
    }
    if (angle < this.repMin) { this.repMin = angle; this.repBottom = t; }
    if (angle > ex.rest) {
      const ecc = this.repBottom - this.repStart;
      const con = t - this.repBottom;
      const span = ex.rest - this.repMin;
      const v = flexMode ? span / Math.max(ecc, 0.05) : span / Math.max(con, 0.05);
      this.reps.push({
        n: this.reps.length + 1, t, depth: this.repMin, eccentricS: ecc, concentricS: con,
        velocity: v, peakForce: this.peakForce,
      });
      this.peakForce = 0;
      this.repState = 'rest';
    }
  }

  detectStep(t) {
    const h = this.hipYHist;
    if (h.length < 7) return;
    const i = h.length - 4;
    const y = h[i][1];
    for (let k = i - 3; k <= i + 3; k++) if (k !== i && h[k][1] > y) return; // need a local max of y (lowest hip)
    const win = h.slice(-60).map((p) => p[1]);
    const amp = Math.max(...win) - Math.min(...win);
    if (amp < 0.015) return; // < 1.5 cm oscillation: not running
    const last = this.steps[this.steps.length - 1];
    if (last !== undefined && h[i][0] - last < 0.22) return;
    this.steps.push(h[i][0]);
    if (this.steps.length > 40) this.steps.shift();
  }

  /** Steps per minute from the last ~8 step intervals. */
  cadence(t) {
    const s = this.steps.filter((x) => t - x < 6);
    if (s.length < 4) return 0;
    const iv = [];
    for (let i = 1; i < s.length; i++) iv.push(s[i] - s[i - 1]);
    const c = 60 / mean(iv.slice(-8));
    if (this.cadenceBase === null && s.length >= 10) this.cadenceBase = c;
    return c;
  }

  /** Fatigue %, velocity-loss model (or cadence loss when running). */
  fatigue(t) {
    if (this.exercise === 'run') {
      const c = this.cadence(t);
      if (!this.cadenceBase || !c) return 0;
      return Math.max(0, Math.min(100, ((this.cadenceBase - c) / this.cadenceBase) * 100 * 3));
    }
    if (this.reps.length < 2) return 0;
    const best = Math.max(...this.reps.slice(0, 3).map((r) => r.velocity));
    const recent = mean(this.reps.slice(-2).map((r) => r.velocity));
    return Math.max(0, Math.min(100, ((best - recent) / best) * 100));
  }

  /** Mean activation per ROM decile for one muscle (NaN where never visited). */
  heat(muscle) {
    const h = this.romHeat[muscle];
    return h.sum.map((s, i) => (h.n[i] ? s / h.n[i] : NaN));
  }

  /** Session log → CSV. */
  toCsv() {
    const joints = Object.keys(JOINTS);
    const head = ['t_ms', ...joints.map((j) => `${j}_deg`), 'trunk_deg', 'speed_ms', 'a_up_ms2', 'force_N', 'impact_G', 'cadence_spm', 'fatigue_pct', 'reps', ...MUSCLES.map((m) => `${m}_est_pct`)];
    const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '');
    const rows = this.log.map((r) => [
      Math.round(r.t), ...joints.map((j) => f(r.angles[j], 1)), f(r.trunk, 1), f(r.speed), f(r.aUp), f(r.force, 0),
      f(r.impactG), f(r.cadence, 0), f(r.fatigue, 0), r.reps, ...MUSCLES.map((m) => r.activation[m]),
    ]);
    return [head, ...rows].map((r) => r.join(',')).join('\n');
  }
}
