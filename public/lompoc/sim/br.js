// DROPZONE: LOMPOC · the physics of a battle royale. Every number on screen comes from here.

export const G = 9.80665;
// Air density with altitude (isothermal atmosphere, scale height 8.5 km): ρ(h) = ρ₀·e^(−h/H).
export const rho = (h) => 1.225 * Math.exp(-Math.max(0, h) / 8500);

// ── 1 · The drop ────────────────────────────────────────────────────────────────
// A 90 kg jumper with kit. Each body position is a drag area C_D·A and a lift-to-drag ratio L/D:
// belly-to-earth is draggy and falls straight; a "track" (arms back, body arched like a wing)
// glides ~0.9 m forward per metre down; a head-down dive is fastest but barely glides.
// Terminal speed v_t = √(2mg / (ρ·C_D·A)).
export const MASS = 90;
export const BODY = { belly: { CdA: 0.5, LD: 0.22 }, track: { CdA: 0.3, LD: 0.9 }, dive: { CdA: 0.21, LD: 0.3 } };
export const CANOPY = { vh: 11, vz: 5, tau: 1.4 };   // ram-air canopy: 11 m/s forward, 5 m/s down (glide 2.2 : 1)
export const PLANE = { alt: 1500, v: 75 };
export const vTerm = (CdA, h, m = MASS) => Math.sqrt((2 * m * G) / (rho(h) * CdA));

// Integrate one jumper. s = {x, z, h, vx, vz, vy, phase, t}; ctl = {mode, deployAGL, tx, tz, heading}; ground(x, z) → metres.
export function dropStep(s, ctl, dt, ground) {
  const g0 = ground(s.x, s.z), agl = s.h - g0;
  // Desired horizontal direction: toward the target, or a fixed heading.
  let dx, dz, dist = Infinity;
  if (ctl.tx != null) { dx = ctl.tx - s.x; dz = ctl.tz - s.z; dist = Math.hypot(dx, dz) || 1e-6; dx /= dist; dz /= dist; } else { dx = Math.sin(ctl.heading); dz = -Math.cos(ctl.heading); }
  if (s.phase === 'free') {
    const B = BODY[ctl.mode] || BODY.belly;
    // Split horizontal velocity into along-track (vh) and lateral; the jumper turns, so lateral decays (τ = 2 s).
    let vh = s.vx * dx + s.vz * dz; const lx = s.vx - vh * dx, lz = s.vz - vh * dz, k = Math.exp(-dt / 2);
    const vy = s.vy, sp = Math.hypot(vh, vy) || 1e-6, D = (0.5 * rho(s.h) * B.CdA * sp * sp) / MASS, L = B.LD * D;
    // Drag along −v; lift ⟂ v, rotated toward up/forward: n = (−vy, vh)/|v|.
    const ah = -D * (vh / sp) + L * (-vy / sp), ay = -D * (vy / sp) + L * (vh / sp) - G;
    vh += ah * dt; s.vy += ay * dt;
    s.vx = vh * dx + lx * k; s.vz = vh * dz + lz * k;
    if (agl <= ctl.deployAGL) { s.phase = 'canopy'; s.tDeploy = s.t; }
  } else if (s.phase === 'canopy') {
    // Remaining time under canopy; S-turn to bleed off reach so the jumper lands on the target.
    const tRem = Math.max(0.5, agl / CANOPY.vz), want = ctl.tx != null ? Math.min(CANOPY.vh, dist / Math.max(0.5, tRem - 0.5)) : CANOPY.vh;
    const a = 1 - Math.exp(-dt / CANOPY.tau);
    s.vx += (want * dx - s.vx) * a; s.vz += (want * dz - s.vz) * a; s.vy += (-CANOPY.vz - s.vy) * a;
  }
  s.x += s.vx * dt; s.z += s.vz * dt; s.h += s.vy * dt; s.t += dt;
  const gN = ground(s.x, s.z);
  if (s.h <= gN) { s.h = gN; s.phase = 'ground'; s.vx = s.vz = s.vy = 0; }
  return s;
}
export function newJumper(x, z, h, vx, vz) { return { x, z, h, vx, vz, vy: 0, phase: 'free', t: 0, tDeploy: null }; }

// Simulate a full jump; returns the path and the summary.
export function simulateDrop({ x, z, h = PLANE.alt, vx, vz, mode, deployAGL, tx, tz, heading }, ground, dt = 0.05, keep = true) {
  const s = newJumper(x, z, h, vx, vz), ctl = { mode, deployAGL, tx, tz, heading }, path = [];
  let vmax = 0;
  for (let i = 0; i < 20000 && s.phase !== 'ground'; i++) {
    dropStep(s, ctl, dt, ground); vmax = Math.max(vmax, Math.hypot(s.vx, s.vy, s.vz));
    if (keep && i % 4 === 0) path.push([s.t, s.x, s.z, s.h, Math.hypot(s.vx, s.vy, s.vz), s.phase === 'free' ? 0 : 1]);
  }
  return { path, t: s.t, x: s.x, z: s.z, err: tx != null ? Math.hypot(s.x - tx, s.z - tz) : null, vmax, tDeploy: s.tDeploy };
}
// Reach: where straight-line flight in 16 directions ends up (the "drop ring").
export function reachRing(opts, ground, n = 16) { const out = []; for (let i = 0; i < n; i++) { const r = simulateDrop({ ...opts, tx: null, heading: (i / n) * Math.PI * 2 }, ground, 0.1, false); out.push([r.x, r.z]); } return out; }

// ── 2 · The circle ──────────────────────────────────────────────────────────────
// Each phase: the next circle (radius r) is drawn uniformly inside the current one (radius R), i.e. its
// centre is uniform in a disc of radius R − r around the current centre. During "shrink" the circle
// slides and shrinks linearly to the next one. Outside it you take dps HP per second.
export const R0 = 3000;
// Timed so that the worst case is runnable on foot: (R − r)/(wait + shrink) ≈ 4.5–6 m/s against a 7 m/s sprint.
export const PHASES = [
  { wait: 120, shrink: 150, r: 1350, dps: 1 }, { wait: 60, shrink: 60, r: 700, dps: 2 }, { wait: 40, shrink: 40, r: 340, dps: 4 },
  { wait: 30, shrink: 30, r: 160, dps: 7 }, { wait: 20, shrink: 20, r: 60, dps: 10 }, { wait: 15, shrink: 25, r: 0, dps: 15 },
];
export const MAP_C = [-1550, -500];
// Area of the lens where two discs (radii a, b, centres d apart) overlap.
export function lensArea(d, a, b) {
  if (d >= a + b) return 0;
  if (d <= Math.abs(a - b)) return Math.PI * Math.min(a, b) ** 2;
  const a2 = a * a, b2 = b * b;
  return a2 * Math.acos((d * d + a2 - b2) / (2 * d * a)) + b2 * Math.acos((d * d + b2 - a2) / (2 * d * b)) - 0.5 * Math.sqrt((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b));
}
// P(a point d metres from the current centre is inside the next circle) = |disc(p, r) ∩ disc(c, R − r)| / π(R − r)².
export function pNext(d, R, r) { const s = R - r; return s <= 0 ? (d <= r ? 1 : 0) : lensArea(d, r, s) / (Math.PI * s * s); }
export function pickCentre(c, R, r, rnd, okFn = () => true) {
  for (let k = 0; k < 40; k++) { const q = (R - r) * Math.sqrt(rnd()), a = rnd() * Math.PI * 2, x = c[0] + q * Math.cos(a), z = c[1] + q * Math.sin(a); if (okFn(x, z) || k === 39) return [x, z]; }
  return c;
}
export function makeCircles(rnd, okFn) { const cs = [{ c: MAP_C, r: R0 }]; for (const P of PHASES) cs.push({ c: pickCentre(cs[cs.length - 1].c, cs[cs.length - 1].r, P.r, rnd, okFn), r: P.r }); return cs; }
// State of the zone at time t (seconds since the match started).
export function zoneAt(t, cs) {
  let t0 = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const P = PHASES[i], A = cs[i], B = cs[i + 1];
    if (t < t0 + P.wait) return { i, stage: 'wait', c: A.c, r: A.r, next: B, left: t0 + P.wait - t, dps: i ? PHASES[i - 1].dps : 0.5 };
    if (t < t0 + P.wait + P.shrink) { const k = (t - t0 - P.wait) / P.shrink; return { i, stage: 'shrink', c: [A.c[0] + (B.c[0] - A.c[0]) * k, A.c[1] + (B.c[1] - A.c[1]) * k], r: A.r + (B.r - A.r) * k, next: B, left: t0 + P.wait + P.shrink - t, dps: P.dps }; }
    t0 += P.wait + P.shrink;
  }
  const L = cs[cs.length - 1]; return { i: PHASES.length, stage: 'end', c: L.c, r: L.r, next: L, left: 0, dps: 20 };
}
export const matchLength = () => PHASES.reduce((s, P) => s + P.wait + P.shrink, 0);
// Worst-case speed of the moving edge: (R − r + |Δc|)/T ≤ 2(R − r)/T.
export const edgeSpeed = (R, r, dc, T) => (R - r + dc) / T;

// ── 3 · External ballistics ─────────────────────────────────────────────────────
// Point-mass model: a = −(ρ·C_D(M)·A / 2m)·|v_rel|·v_rel − g, with v_rel = v − wind. C_D depends on Mach:
// it peaks just above the sound barrier. A game marksman rifle: 9.7 g, 7.8 mm, 830 m/s, 100 m zero.
export const RIFLE = { m: 0.0097, d: 0.00782, v0: 830, sight: 0.045, zero: 100 };
const CD = [[0, 0.17], [0.7, 0.17], [0.9, 0.2], [1.0, 0.36], [1.1, 0.4], [1.3, 0.38], [1.6, 0.35], [2.0, 0.32], [2.5, 0.29], [3.0, 0.27]];
export function cdMach(M) { if (M >= 3) return 0.27; for (let i = 1; i < CD.length; i++) if (M <= CD[i][0]) { const [m0, c0] = CD[i - 1], [m1, c1] = CD[i]; return c0 + ((c1 - c0) * (M - m0)) / (m1 - m0); } return 0.27; }
// Fly to range R (m) with launch elevation el and azimuth az (rad), crosswind w (m/s, +z). Returns y, z relative to the line of sight.
export function fly(R, el, az, w = 0, gun = RIFLE, alt = 50) {
  const A = (Math.PI * gun.d * gun.d) / 4, r0 = rho(alt), a = 343;
  let x = 0, y = -gun.sight, z = 0, vx = gun.v0 * Math.cos(el) * Math.cos(az), vy = gun.v0 * Math.sin(el), vz = gun.v0 * Math.cos(el) * Math.sin(az), t = 0;
  const acc = (vx, vy, vz) => { const rx = vx, ry = vy, rz = vz - w, s = Math.hypot(rx, ry, rz), k = (r0 * cdMach(s / a) * A) / (2 * gun.m); return [-k * s * rx, -k * s * ry - G, -k * s * rz]; };
  const dt = 0.0005, tr = [];
  while (x < R && t < 5) {
    const [ax, ay, az1] = acc(vx, vy, vz), mx = vx + ax * dt / 2, my = vy + ay * dt / 2, mz = vz + az1 * dt / 2, [bx, by, bz] = acc(mx, my, mz);
    const nx = x + mx * dt; if (nx >= R) { const f = (R - x) / (mx * dt); y += my * dt * f; z += mz * dt * f; t += dt * f; vx += bx * dt * f; vy += by * dt * f; vz += bz * dt * f; x = R; break; }
    x = nx; y += my * dt; z += mz * dt; vx += bx * dt; vy += by * dt; vz += bz * dt; t += dt;
    if (tr.length < 400 && Math.round(t / dt) % 40 === 0) tr.push([x, y, z]);
  }
  tr.push([x, y, z]);
  return { y, z, t, v: Math.hypot(vx, vy, vz), tr };
}
let zeroCache = null;
export function zeroAngle(gun = RIFLE) { if (zeroCache) return zeroCache; let lo = -0.01, hi = 0.02; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (fly(gun.zero, m, 0, 0, gun).y > 0) hi = m; else lo = m; } return (zeroCache = (lo + hi) / 2); }
// Holds (milliradians) to hit at range R in crosswind w: elevation up, windage into the wind.
export function solution(R, w, gun = RIFLE) {
  const th = zeroAngle(gun), f = fly(R, th, 0, w, gun), E = 0.5 * gun.m * f.v * f.v;
  return { drop: f.y, drift: f.z, holdE: (-f.y / R) * 1000, holdW: (f.z / R) * 1000, t: f.t, v: f.v, E, mach: f.v / 343 };
}
// A shot with the shooter's holds (mil) and a small random dispersion (σ = 0.12 mil each axis).
export function shoot(R, w, holdE, holdW, rnd = Math.random, gun = RIFLE) {
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const el = zeroAngle(gun) + (holdE + 0.12 * gauss()) / 1000, az = -(holdW + 0.12 * gauss()) / 1000;
  const f = fly(R, el, az, w, gun);
  return { y: f.y, z: f.z, t: f.t, v: f.v, tr: f.tr };
}

// ── 4 · Time to kill (game weapons; fictional stats) ───────────────────────────
// Shots to kill n = ⌈(HP + armour)/damage⌉; TTK = (n − 1)·60/rpm + d/v_bullet.
export const WEAPONS = {
  pistol: { dmg: 20, rpm: 400, v: 360, fall: 45, acc: 0.5 },
  smg: { dmg: 22, rpm: 950, v: 400, fall: 70, acc: 0.6 },
  ar: { dmg: 30, rpm: 720, v: 880, fall: 170, acc: 0.55 },
  dmr: { dmg: 70, rpm: 220, v: 830, fall: 320, acc: 0.5 },
};
export function ttk(wpn, d, hp = 100, armour = 150) { const W = WEAPONS[wpn], n = Math.ceil((hp + armour) / W.dmg); return { n, t: ((n - 1) * 60) / W.rpm + d / W.v }; }
// Chance that one shot hits at distance d: p = acc·e^(−d/fall) (× 0.8 if the target is moving).
export const pHit = (wpn, d, moving = false, skill = 1) => Math.min(0.95, WEAPONS[wpn].acc * skill * Math.exp(-d / WEAPONS[wpn].fall) * (moving ? 0.8 : 1));
