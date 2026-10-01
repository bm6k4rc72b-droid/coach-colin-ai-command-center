// CHRONOS · the billiard-ball paradox (Polchinski; Echeverria, Klinkhammer & Thorne 1991).
//
// A ball rolls into wormhole mouth A and comes out of mouth B a time Δ EARLIER, turned 90°.
// Aimed one way, the older ball knocks its younger self away so it never enters A — a paradox.
// Novikov's self-consistency principle: only histories that are their own cause happen.
// We look for fixed points of the map  H → R(H):
//   H = the hypothesised older ball (exit time, position, velocity)
//   R = what actually enters A after simulating both balls with elastic collisions
// A history is consistent when R(H) = H. There is often more than one.

export const TABLE = { rb: 0.5, A: { x: 6, y: 0 }, B: { x: -1, y: -7 }, Rm: 2, P0: { x: -8, y: 0 }, T: 34 };
const rot = (x, y) => ({ x: -y, y: x });                     // mouth B turns velocities by +90°

// Simulate one history exactly (straight lines, one elastic collision, ray–circle entry).
// aim = launch angle (rad); H = older ball or null. Returns what entered A, the collision and
// position functions for drawing.
const hitTime = (p, v, c, R) => {                               // first t ≥ 0 with |p + v t − c| = R
  const dx = p.x - c.x, dy = p.y - c.y, a = v.x * v.x + v.y * v.y, b = 2 * (dx * v.x + dy * v.y), cc = dx * dx + dy * dy - R * R;
  if (cc <= 0) return 0; const disc = b * b - 4 * a * cc; if (disc < 0 || a < 1e-12) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a); return t >= 0 ? t : Infinity;
};
export function simulate(aim, delta, H) {
  const { rb, A, B, Rm, P0, T } = TABLE;
  const y0 = { x: P0.x, y: P0.y }, u = { x: Math.cos(aim), y: Math.sin(aim) };
  let hit = null, u2 = u, w2 = H ? { x: H.vx, y: H.vy } : null, yc = null, oc = null;
  const tEnter0 = hitTime(y0, u, A, Rm);                        // undisturbed entry into A
  if (H) {
    const ts = Math.max(0, H.te);
    const yp = { x: y0.x + u.x * ts, y: y0.y + u.y * ts }, op = { x: H.px + H.vx * (ts - H.te), y: H.py + H.vy * (ts - H.te) };
    const rel = { x: u.x - H.vx, y: u.y - H.vy }, dt = hitTime({ x: yp.x - op.x, y: yp.y - op.y }, rel, { x: 0, y: 0 }, 2 * rb);
    const tc = ts + dt;
    if (dt < Infinity && tc < Math.min(tEnter0, T)) {
      yc = { x: y0.x + u.x * tc, y: y0.y + u.y * tc }; oc = { x: H.px + H.vx * (tc - H.te), y: H.py + H.vy * (tc - H.te) };
      const nx = (oc.x - yc.x) / (2 * rb), ny = (oc.y - yc.y) / (2 * rb), r = (u.x - H.vx) * nx + (u.y - H.vy) * ny;
      if (r > 0) { u2 = { x: u.x - r * nx, y: u.y - r * ny }; w2 = { x: H.vx + r * nx, y: H.vy + r * ny }; hit = { t: tc, x: (yc.x + oc.x) / 2, y: (yc.y + oc.y) / 2, angle: Math.atan2(u2.y, u2.x) - aim }; }
      else yc = oc = null;
    }
  }
  let entered = null;
  if (hit) { const te = hitTime(yc, u2, A, Rm); if (te < Infinity && hit.t + te < T) { const tA = hit.t + te; entered = { tA, x: yc.x + u2.x * te, y: yc.y + u2.y * te, vx: u2.x, vy: u2.y }; } }
  else if (tEnter0 < T) entered = { tA: tEnter0, x: y0.x + u.x * tEnter0, y: y0.y + u.y * tEnter0, vx: u.x, vy: u.y };
  let R = null;
  if (entered) { const p = rot(entered.x - A.x, entered.y - A.y), v = rot(entered.vx, entered.vy); R = { te: entered.tA - delta, px: B.x + p.x, py: B.y + p.y, vx: v.x, vy: v.y }; }
  const young = (t) => { if (t < 0) return { x: y0.x, y: y0.y }; if (entered && t > entered.tA) return null; if (hit && t > hit.t) return { x: yc.x + u2.x * (t - hit.t), y: yc.y + u2.y * (t - hit.t) }; return { x: y0.x + u.x * t, y: y0.y + u.y * t }; };
  const old = (t) => { if (!H || t < H.te) return null; if (hit && t > hit.t) return { x: oc.x + w2.x * (t - hit.t), y: oc.y + w2.y * (t - hit.t) }; return { x: H.px + H.vx * (t - H.te), y: H.py + H.vy * (t - H.te) }; };
  return { R, entered, hit, young, old };
}

// Search for self-consistent histories. Any older ball must have come out of mouth B, so it is fixed
// by how its younger self entered mouth A: q = (entry offset e, entry angle θ, speed s, entry time t_A).
// Iterating q → q' (simulate, read off how the young ball actually entered) is a square 4-D problem:
// coarse scan for small residuals, then damped Newton with a finite-difference Jacobian.
function Hof(q, delta) {
  const { A, B, Rm } = TABLE, e = Math.max(-Rm + 1e-6, Math.min(Rm - 1e-6, q[0])), ex = -Math.sqrt(Rm * Rm - e * e);
  const p = rot(ex, e), v = rot(Math.cos(q[1]) * q[2], Math.sin(q[1]) * q[2]);
  return { te: q[3] - delta, px: B.x + p.x, py: B.y + p.y, vx: v.x, vy: v.y };
}
function F(aim, delta, q) {
  const sim = simulate(aim, delta, Hof(q, delta)); if (!sim.entered) return null;
  const E = sim.entered, th = Math.atan2(E.vy, E.vx);
  return [E.y - TABLE.A.y - q[0], Math.atan2(Math.sin(th - q[1]), Math.cos(th - q[1])), Math.hypot(E.vx, E.vy) - q[2], E.tA - q[3]];
}
function solve(Jm, b) {                                         // Gaussian elimination with partial pivoting
  const n = b.length, M = Jm.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
const norm = (r) => Math.hypot(...r);
function newton(aim, delta, q0) {
  let q = [...q0], r = F(aim, delta, q); if (!r) return null;
  for (let it = 0; it < 50; it++) {
    if (norm(r) < 1e-6) return q;
    const h = 1e-6, J = [[], [], [], []];
    for (let j = 0; j < 4; j++) { const qj = [...q]; qj[j] += h; const rj = F(aim, delta, qj); if (!rj) return null; for (let i = 0; i < 4; i++) J[i][j] = (rj[i] - r[i]) / h; }
    const step = solve(J, r.map((x) => -x)); if (!step) return null;
    let lam = 1, ok = false;
    while (lam > 1e-4) { const qn = q.map((x, i) => x + lam * step[i]), rn = F(aim, delta, qn); if (rn && norm(rn) < norm(r)) { q = qn; r = rn; ok = true; break; } lam /= 2; }
    if (!ok) return null;
  }
  return norm(r) < 1e-4 ? q : null;
}
export function findHistories(aim, delta) {
  const { Rm } = TABLE, out = [];
  const naive = simulate(aim, delta, null);                    // no older ball: does the young ball enter?
  if (!naive.R) return { naive, paradox: false, withOld: naive, histories: [{ H: null, kind: 'none' }] };
  const withOld = simulate(aim, delta, naive.R);
  const same = (a, b) => a && b && Math.hypot(a.te - b.te, a.px - b.px, a.py - b.py, a.vx - b.vx, a.vy - b.vy) < 0.02;
  const paradox = !same(naive.R, withOld.R);
  if (!paradox) out.push({ H: naive.R, kind: 'miss', hit: withOld.hit, deflect: 0 });
  const tA0 = naive.entered.tA, cand = [];
  for (let e = -Rm + 0.03; e < Rm; e += 0.06) for (let th = -0.8; th <= 0.8; th += 0.04) for (const sp of [0.9, 1.02, 1.1, 1.2, 1.32, 1.42]) for (let tA = tA0 - 6; tA <= tA0 + 6; tA += 0.25) {
    const q = [e, aim + th, sp, tA], r = F(aim, delta, q); if (r) cand.push([norm(r), q]);
  }
  cand.sort((p, q) => p[0] - q[0]);
  const seeds = [];
  for (const [, q] of cand) { if (seeds.length >= 16) break; if (!seeds.some((z) => Math.hypot(...z.map((x, i) => x - q[i])) < 0.12)) seeds.push(q); }
  for (const q0 of seeds) {
    const q = newton(aim, delta, q0); if (!q) continue;
    const H = Hof(q, delta), sim = simulate(aim, delta, H);
    if (!sim.hit) continue;
    if (!out.some((o) => same(o.H, H))) out.push({ H, kind: 'glancing', hit: sim.hit, deflect: (sim.hit.angle * 180) / Math.PI });
  }
  return { naive, paradox, withOld, histories: out };
}
