// DIRECTOR'S CHAIR · the scene: blocking, performance timeline, cameras,
// and the editing grammar (180° rule, 30° rule, jump cuts, coverage).
//
// Set coordinates in metres: x east, z south (towards the skyline edge at
// z = +10), y up. The scene "THE LAST DEAL" runs 30 seconds.

import { fovH, fovV } from './optics.js';

export const DURATION = 30;
export const EYE = 1.62;                                  // eye height of the actors (m)

// Keyframes: [t, x, z]; facing is derived from motion, or from a look target.
export const BLOCKING = {
  iris: [[0, -10.5, -5.6], [1.2, -10.2, -5.2], [4.8, -2.3, 2.4], [24, -2.3, 2.4], [27.5, -1.2, 6.8], [30, -1.2, 6.8]],
  kane: [[0, 4.6, -2.4], [12, 4.6, -2.4], [15, 0.6, 1.3], [22, 0.6, 1.3], [29, 11.5, -7.5], [30, 11.8, -7.8]],
};
// When standing still, who (or what) each actor looks at.
export function lookTarget(who, t) {
  if (who === 'kane' && t < 6) return { x: 8, z: -5.5 };                 // staring at the water tank
  if (who === 'iris' && t > 24) return { x: -1.2, z: 20 };               // out over the skyline
  return null;                                                           // → look at the other actor
}
export const LINES = [
  { t: 8.0, who: 'kane', k: 'd1' }, { t: 10.2, who: 'iris', k: 'd2' }, { t: 15.6, who: 'kane', k: 'd3' },
  { t: 19.0, who: 'iris', k: 'd4' }, { t: 21.6, who: 'kane', k: 'd5' }, { t: 26.0, who: 'iris', k: 'd6' },
];
export const LINE_LEN = 2.4;

const smooth = (u) => u * u * (3 - 2 * u);
function sample(keys, t) {
  if (t <= keys[0][0]) return { x: keys[0][1], z: keys[0][2], v: 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, x0, z0] = keys[i], [t1, x1, z1] = keys[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0), s = smooth(u), ds = 6 * u * (1 - u) / Math.max(1e-6, t1 - t0);
      const dx = x1 - x0, dz = z1 - z0;
      return { x: x0 + dx * s, z: z0 + dz * s, v: Math.hypot(dx, dz) * ds, dir: Math.atan2(dx, dz) };
    }
  }
  const k = keys[keys.length - 1]; return { x: k[1], z: k[2], v: 0 };
}
// Actor state at time t: position, speed, heading (radians, 0 = +z), walking phase.
export function actorAt(who, t) {
  const p = sample(BLOCKING[who], t), other = sample(BLOCKING[who === 'iris' ? 'kane' : 'iris'], t);
  let heading;
  if (p.v > 0.15) heading = p.dir;
  else { const L = lookTarget(who, t) || other; heading = Math.atan2(L.x - p.x, L.z - p.z); }
  return { x: p.x, z: p.z, v: p.v, heading, walking: p.v > 0.15 };
}
export const speakingAt = (t) => LINES.find((l) => t >= l.t && t < l.t + LINE_LEN) || null;

// ── Cameras ──────────────────────────────────────────
export const CAM_IDS = ['A', 'B', 'C'];
export const defaultCams = () => ({
  A: { x: -0.8, y: 1.55, z: -6.5, target: 'two', f: 32 },                 // wide two-shot from upstage
  B: { x: -5.6, y: 1.6, z: 0.4, target: 'kane', f: 65 },                  // over Iris' shoulder onto Kane
  C: { x: 5.5, y: 1.6, z: -4.2, target: 'iris', f: 65 },                  // over Kane's shoulder onto Iris (same side as A and B)
});
export function targetPoint(cam, t) {
  const a = actorAt('iris', t), b = actorAt('kane', t);
  if (cam.target === 'iris') return { x: a.x, y: EYE - 0.2, z: a.z };                 // eyes land near the upper third
  if (cam.target === 'kane') return { x: b.x, y: EYE - 0.2, z: b.z };
  return { x: (a.x + b.x) / 2, y: EYE - 0.35, z: (a.z + b.z) / 2 };
}
// Is a world point inside a camera's frame? (Forward = toward the target.)
export function inFrame(cam, t, p, S, squeeze) {
  const tp = targetPoint(cam, t), fx = tp.x - cam.x, fy = tp.y - cam.y, fz = tp.z - cam.z, fl = Math.hypot(fx, fy, fz);
  const F = [fx / fl, fy / fl, fz / fl];
  const R = [F[2], 0, -F[0]], rl = Math.hypot(R[0], R[2]) || 1; R[0] /= rl; R[2] /= rl;
  const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
  const v = [p.x - cam.x, p.y - cam.y, p.z - cam.z];
  const zf = v[0] * F[0] + v[1] * F[1] + v[2] * F[2]; if (zf <= 0.1) return false;
  const xr = v[0] * R[0] + v[2] * R[2], yu = v[0] * U[0] + v[1] * U[1] + v[2] * U[2];
  return Math.abs(Math.atan2(xr, zf)) < fovH(S, cam.f, squeeze) / 2 && Math.abs(Math.atan2(yu, zf)) < fovV(S, cam.f) / 2;
}

// ── Editing grammar ─────────────────────────────────
// Which side of the line of action (Iris → Kane) is a camera on? +1 / −1.
export function side(cam, t) {
  const a = actorAt('iris', t), b = actorAt('kane', t);
  const lx = b.x - a.x, lz = b.z - a.z, cx = cam.x - a.x, cz = cam.z - a.z;
  return Math.sign(lx * cz - lz * cx) || 1;
}
// Angle (degrees) between two cameras as seen from the subject they frame.
export function angleBetween(c1, c2, t) {
  const p = targetPoint(c1, t), a1 = Math.atan2(c1.x - p.x, c1.z - p.z), a2 = Math.atan2(c2.x - p.x, c2.z - p.z);
  let d = Math.abs(a1 - a2) * 180 / Math.PI; if (d > 180) d = 360 - d; return d;
}
// Analyse an edit decision list: [{ cam, t }] cut-ins sorted by time (first at 0).
export function analyse(edl, cams, S, squeeze) {
  const cuts = [], issues = [];
  const shots = edl.map((e, i) => ({ ...e, end: i + 1 < edl.length ? edl[i + 1].t : DURATION }));
  for (let i = 1; i < shots.length; i++) {
    const A = cams[shots[i - 1].cam], B = cams[shots[i].cam], tc = shots[i].t;
    const c = { t: tc, from: shots[i - 1].cam, to: shots[i].cam, ok: true, notes: [] };
    if (shots[i - 1].cam === shots[i].cam) { c.ok = false; c.notes.push('same'); }
    else {
      if (side(A, tc) !== side(B, tc)) { c.ok = false; c.notes.push('cross180'); }
      const ang = angleBetween(A, B, tc), ratio = Math.max(A.f, B.f) / Math.min(A.f, B.f);
      c.angle = ang; c.ratio = ratio;
      if (A.target === B.target && ang < 30 && ratio < 1.4) { c.ok = false; c.notes.push('jump30'); }
    }
    if (shots[i].end - shots[i].t < 0.8) { c.notes.push('flash'); }
    cuts.push(c); if (!c.ok) issues.push(c);
  }
  // Dialogue coverage: is the speaker in frame for most of each line?
  let covered = 0;
  for (const L of LINES) {
    let inside = 0, n = 0;
    for (let t = L.t; t < L.t + LINE_LEN; t += 0.2) {
      const sh = shots.find((s) => t >= s.t && t < s.end); if (!sh) continue;
      const who = actorAt(L.who, t); n++;
      if (inFrame(cams[sh.cam], t, { x: who.x, y: EYE, z: who.z }, S, squeeze)) inside++;
    }
    if (n && inside / n > 0.6) covered++;
  }
  const avgLen = shots.length ? DURATION / shots.length : DURATION;
  const score = Math.max(0, Math.round(100 - issues.length * 12 - (LINES.length - covered) * 8 - (shots.length < 3 ? 15 : 0) - cuts.filter((c) => c.notes.includes('flash')).length * 4));
  return { shots, cuts, issues, covered, lines: LINES.length, avgLen, score };
}
