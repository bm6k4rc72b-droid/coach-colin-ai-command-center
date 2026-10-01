// APEX · Neon Bay Street Circuit — a fictional night street track built from exact straights and
// constant-radius arcs (curvature κ = 1/R, positive = left), sampled every 2 m. Two straights have free
// lengths, solved so the lap closes exactly; curvature is eased over ±8 m (a short clothoid-like ramp).

export const DS = 2;
// [kind, a, b]: ['S', length] | ['A', radius, degrees] | ['F', id] (free straight)
const SEGMENTS = [
  ['F', 0],                                                     // main straight (east)
  ['A', 20, 90], ['S', 250], ['A', 85, -35], ['A', 85, 35],     // T1 (90° left) and the harbour kink
  ['S', 300],                                                   // north run
  ['A', 30, 90], ['S', 220], ['A', 160, -50], ['S', 320],       // T4, fast T5 (right)
  ['A', 45, 75], ['A', 45, -25],                                // esses
  ['S', 760],                                                   // back straight over the harbour bridge (west)
  ['A', 16, 95], ['F', 1],                                      // T8 hairpin, then the south run
  ['A', 60, 55], ['A', 35, -30], ['A', 28, 60],                 // final complex onto the main straight
];
export const CORNERS = [];

function walk(free) {
  let x = 0, z = 0, h = 0; const segs = [];
  for (const sg of SEGMENTS) {
    if (sg[0] === 'S' || sg[0] === 'F') { const L = sg[0] === 'S' ? sg[1] : free[sg[1]]; segs.push({ x, z, h, L, k: 0 }); x += Math.cos(h) * L; z += Math.sin(h) * L; }
    else { const R = sg[1], d = (sg[2] * Math.PI) / 180, L = R * Math.abs(d), k = Math.sign(d) / R; segs.push({ x, z, h, L, k }); const cx = x - Math.sin(h) * Math.sign(d) * R, cz = z + Math.cos(h) * Math.sign(d) * R; h += d; x = cx + Math.sin(h) * Math.sign(d) * R; z = cz - Math.cos(h) * Math.sign(d) * R; }
  }
  return { x, z, h, segs };
}
export function buildTrack() {
  // Solve the two free straight lengths so the end meets the start: linear in (L0, L1).
  const e0 = walk([0, 0]), ex = walk([1, 0]), ey = walk([0, 1]);
  const a = ex.x - e0.x, b = ey.x - e0.x, c = ex.z - e0.z, d = ey.z - e0.z, det = a * d - b * c;
  const L0 = (-e0.x * d + b * e0.z) / det, L1 = (-a * e0.z + c * e0.x) / det;
  const W = walk([L0, L1]);
  // Sample every DS metres with exact curvature, then ease it.
  const pts = []; let s = 0;
  for (const sg of W.segs) {
    for (let u = 0; u < sg.L; u += DS) {
      let x, z, h;
      if (sg.k === 0) { x = sg.x + Math.cos(sg.h) * u; z = sg.z + Math.sin(sg.h) * u; h = sg.h; }
      else { const R = 1 / Math.abs(sg.k), sgn = Math.sign(sg.k), cx = sg.x - Math.sin(sg.h) * sgn * R, cz = sg.z + Math.cos(sg.h) * sgn * R; h = sg.h + sg.k * u; x = cx + Math.sin(h) * sgn * R; z = cz - Math.cos(h) * sgn * R; }
      pts.push({ x, z, psi: h, k0: sg.k, s }); s += DS;
    }
  }
  const N = pts.length, Wk = 4;
  for (let i = 0; i < N; i++) { let t = 0; for (let k = -Wk; k <= Wk; k++) t += pts[(i + k + N) % N].k0; pts[i].k = t / (2 * Wk + 1); pts[i].s = i * DS; }
  for (const p of pts) p.y = 2.5 * Math.sin(p.s / 650) + 7 * Math.exp(-(((p.s - (L0 + 2900)) / 300) ** 2));
  // Corner labels at curvature peaks.
  CORNERS.length = 0; let n = 1;
  for (let i = 0; i < N; i++) { const k = Math.abs(pts[i].k); if (k > 1 / 160 && k >= Math.abs(pts[(i - 1 + N) % N].k) && k > Math.abs(pts[(i + 1) % N].k) && (!CORNERS.length || pts[i].s - CORNERS[CORNERS.length - 1].s > 90)) CORNERS.push({ s: pts[i].s, i, n: 'T' + n++, R: 1 / k }); }
  return { pts, L: N * DS, N, free: [L0, L1], closure: Math.hypot(W.x, W.z) };
}
