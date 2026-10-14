/**
 * Visual positioning, simulated — in the spirit of MultiSet AI's VPS: a device (a phone, a care
 * robot, a ranch drone) sees a handful of mapped visual anchors and solves for its own 6-DoF
 * pose in a shared map, centimetre-accurate and without GPS.
 *
 * A real VPS matches image features against a prebuilt map to get those anchor observations.
 * Here the observations are simulated (range + bearing to known anchors, with noise), and the
 * pose solve is real: Gauss–Newton least squares on (x, y, z, yaw). Roll and pitch are taken from
 * the device's gravity vector, as phones and robots do, so the 4-DoF solve recovers the full pose.
 *
 * Pure: no DOM. Units are metres and radians.
 *
 * @module vision-kit/vps
 */

/** Deterministic PRNG (mulberry32) so simulations and tests are repeatable. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample from a uniform source (Box–Muller). */
export function gauss(rand) {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Predicted observation of an anchor from a pose: range, bearing (relative to heading, in the
 * horizontal plane) and elevation.
 * @param {{x:number,y:number,z:number,yaw:number}} p @param {{x:number,y:number,z:number}} a
 */
export function observe(p, a) {
  const dx = a.x - p.x;
  const dy = a.y - p.y;
  const dz = a.z - p.z;
  const h = Math.hypot(dx, dz);
  return { range: Math.hypot(h, dy), bearing: wrap(Math.atan2(dx, -dz) - p.yaw), elev: Math.atan2(dy, h) };
}

/**
 * Simulated anchor observations with noise.
 * @param {{x:number,y:number,z:number,yaw:number}} truth
 * @param {{id:string,x:number,y:number,z:number}[]} anchors
 * @param {{rangeSigma?:number, angleSigma?:number, maxRange?:number, seed?:number}} [opt]
 */
export function simulateObservations(truth, anchors, opt = {}) {
  const { rangeSigma = 0.02, angleSigma = 0.004, maxRange = 25, seed = 7 } = opt;
  const r = rng(seed);
  const out = [];
  for (const a of anchors) {
    const o = observe(truth, a);
    if (o.range > maxRange) continue;
    out.push({
      id: a.id,
      anchor: a,
      range: o.range + gauss(r) * rangeSigma,
      bearing: o.bearing + gauss(r) * angleSigma,
      elev: o.elev + gauss(r) * angleSigma,
    });
  }
  return out;
}

/** Solve a small dense linear system A x = b (Gaussian elimination, partial pivoting). */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Gauss–Newton pose solve from anchor observations.
 * @param {{anchor:{x:number,y:number,z:number}, range:number, bearing:number, elev:number}[]} obs
 * @param {{x:number,y:number,z:number,yaw:number}} guess
 * @param {{iters?:number, rangeSigma?:number, angleSigma?:number}} [opt]
 * @returns {{pose:{x:number,y:number,z:number,yaw:number}, iters:number, rms:number, sigma:number, ok:boolean}}
 */
export function solvePose(obs, guess, opt = {}) {
  const { iters = 12, rangeSigma = 0.02, angleSigma = 0.004 } = opt;
  let p = { ...guess };
  let k = 0;
  let rms = Infinity;
  let JtJ = null;
  if (obs.length < 2) return { pose: p, iters: 0, rms, sigma: Infinity, ok: false };
  const keys = ['x', 'y', 'z', 'yaw'];
  for (; k < iters; k++) {
    const rows = [];
    const res = [];
    const h = 1e-5;
    for (const o of obs) {
      const f0 = observe(p, o.anchor);
      const r = [(o.range - f0.range) / rangeSigma, wrap(o.bearing - f0.bearing) / angleSigma, (o.elev - f0.elev) / angleSigma];
      const J = [[], [], []];
      for (const key of keys) {
        const q = { ...p, [key]: p[key] + h };
        const f1 = observe(q, o.anchor);
        J[0].push((f1.range - f0.range) / h / rangeSigma);
        J[1].push(wrap(f1.bearing - f0.bearing) / h / angleSigma);
        J[2].push((f1.elev - f0.elev) / h / angleSigma);
      }
      for (let i = 0; i < 3; i++) {
        rows.push(J[i]);
        res.push(r[i]);
      }
    }
    JtJ = keys.map((_, i) => keys.map((__, j) => rows.reduce((s, row) => s + row[i] * row[j], 0)));
    const Jtr = keys.map((_, i) => rows.reduce((s, row, n) => s + row[i] * res[n], 0));
    rms = Math.sqrt(res.reduce((s, v) => s + v * v, 0) / res.length);
    const d = solve(JtJ, Jtr);
    if (!d) break;
    keys.forEach((key, i) => (p[key] += d[i]));
    p.yaw = wrap(p.yaw);
    if (Math.hypot(d[0], d[1], d[2]) < 1e-6) {
      k++;
      break;
    }
  }
  // Horizontal 1-sigma position uncertainty from the inverse information matrix.
  let sigma = Infinity;
  if (JtJ) {
    const ex = solve(JtJ, [1, 0, 0, 0]);
    const ez = solve(JtJ, [0, 0, 1, 0]);
    if (ex && ez) sigma = Math.sqrt(Math.max(0, ex[0]) + Math.max(0, ez[2]));
  }
  return { pose: p, iters: k, rms, sigma, ok: Number.isFinite(rms) && rms < 5 };
}

/** Horizontal and vertical error of a solved pose against the truth (metres) and yaw error (deg). */
export function poseError(est, truth) {
  return {
    horiz: Math.hypot(est.x - truth.x, est.z - truth.z),
    vert: Math.abs(est.y - truth.y),
    yawDeg: (Math.abs(wrap(est.yaw - truth.yaw)) * 180) / Math.PI,
  };
}

/** Raw GPS-like fix for comparison: metre-scale noise, worse indoors. */
export function gpsFix(truth, rand, sigma = 3.5) {
  return { x: truth.x + gauss(rand) * sigma, y: truth.y, z: truth.z + gauss(rand) * sigma, yaw: truth.yaw };
}
