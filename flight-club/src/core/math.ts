/** Minimal vector / quaternion maths (no Three.js in the simulation core). */
export type V3 = [number, number, number];
export type Q = [number, number, number, number]; // x, y, z, w

export const v = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export const qIdentity = (): Q => [0, 0, 0, 1];

export function qMul(a: Q, b: Q): Q {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function qNormalize(q: Q): Q {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotate vector by quaternion (body → world). */
export function qRotate(q: Q, p: V3): V3 {
  const u: V3 = [q[0], q[1], q[2]];
  const s = q[3];
  const t = scale(cross(u, p), 2);
  return add(add(p, scale(t, s)), cross(u, t));
}

/** Inverse rotation (world → body). */
export const qRotateInv = (q: Q, p: V3): V3 => qRotate([-q[0], -q[1], -q[2], q[3]], p);

/** Integrate orientation by body angular velocity ω over dt. */
export function qIntegrate(q: Q, w: V3, dt: number): Q {
  const dq: Q = [w[0] * 0.5 * dt, w[1] * 0.5 * dt, w[2] * 0.5 * dt, 0];
  const r = qMul(q, dq);
  return qNormalize([q[0] + r[0], q[1] + r[1], q[2] + r[2], q[3] + r[3]]);
}

/** Yaw (about world up), pitch (nose down positive about body x), roll (about body z) from a quaternion. */
export function euler(q: Q): { yaw: number; pitch: number; roll: number } {
  const fwd = qRotate(q, [0, 0, 1]);
  const up = qRotate(q, [0, 1, 0]);
  const right = qRotate(q, [1, 0, 0]);
  const yaw = Math.atan2(fwd[0], fwd[2]);
  const pitch = Math.asin(clamp(-fwd[1], -1, 1));
  const roll = Math.atan2(-right[1], up[1]);
  return { yaw, pitch, roll };
}

/** Quaternion from yaw (about y), then pitch (about x), then roll (about z). */
export function fromEuler(yaw: number, pitch: number, roll: number): Q {
  const qy: Q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
  const qx: Q = [Math.sin(pitch / 2), 0, 0, Math.cos(pitch / 2)];
  const qz: Q = [0, 0, Math.sin(-roll / 2), Math.cos(roll / 2)];
  return qMul(qMul(qy, qx), qz);
}

export const wrapPi = (a: number) => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

/** Deterministic PRNG. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
