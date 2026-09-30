// RANCH OPS · the flock: boids with sheep behaviour, health and threats.
//
// Reynolds boids, per sheep i with neighbours j inside radius R:
//   separation  s = Σ (pᵢ − pⱼ)/|pᵢ − pⱼ|²             (|pᵢ − pⱼ| < r_sep)
//   alignment   a = mean(vⱼ) − vᵢ
//   cohesion    c = mean(pⱼ) − pᵢ
//   flight zone f = Σ (pᵢ − q)/|pᵢ − q| · (1 − |pᵢ − q|/R_flight)   for each threat q
//   steering    F = w_s·s + w_a·a + w_c·c + w_f·f + walls + goal,  v ← clamp(v + F·dt, v_max)
// Under threat the cohesion weight rises (Hamilton's "selfish herd": each sheep moves toward
// the centre to shrink its own domain of danger), which is why a flock bunches before it runs.

export const N_SHEEP = 120;
export const CORE_T = 39.1;              // normal core temperature of sheep (°C), range 38.5–39.9
export const FEVER_T = 40.5;             // fever threshold (°C)
export const P = { rSep: 1.3, rNb: 6, wSep: 3.2, wAli: 0.55, wCoh: 0.35, graze: 0.12, walk: 1.1, run: 4.2, dogR: 22, predR: 38, wFlee: 7 };

// Deterministic pseudo-random numbers so every run starts with the same flock.
export function rng(seed = 7) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const gauss = (R) => { let u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function makeFlock(pad, lost) {
  const R = rng(11), sheep = [];
  const cx = (pad.x0 + pad.x1) / 2, cz = (pad.z0 + pad.z1) / 2;
  for (let i = 0; i < N_SHEEP; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 18;
    sheep.push({
      id: i, tag: `NZ-${String(4100 + i * 7).padStart(4, '0')}`,
      x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, vx: 0, vz: 0, heading: R() * 6.28,
      w: Math.round(68 + gauss(R) * 7), bcs: Math.round((3 + gauss(R) * 0.4) * 2) / 2, core: CORE_T + gauss(R) * 0.25,
      mode: 'graze', modeT: R() * 20, gx: 0, gz: 0, lame: false, fever: false, lost: false, found: false, flagged: false, dead: false, phase: R() * 6.28,
    });
  }
  // A few problems to find: fever (pneumonia / fly strike), lameness (foot rot), one ewe missing.
  for (const i of [17, 58, 93]) { sheep[i].fever = true; sheep[i].core = 40.7 + R() * 0.6; }
  for (const i of [31, 76]) sheep[i].lame = true;
  const L = sheep[104]; L.lost = true; L.x = lost.x; L.z = lost.z; L.mode = 'stuck';
  return sheep;
}

// One step of the flock. `env` = { pad, threats: [{x,z,R,kind}], goal: {x,z}|null, trough: {x,z}, dt, t }
export function stepFlock(sheep, env) {
  const { pad, threats, goal, dt } = env, n = sheep.length;
  // Uniform grid for neighbour search (cell = neighbour radius).
  const cell = P.rNb, grid = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const s of sheep) { if (s.dead) continue; const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(s); }
  let alarm = 0;
  for (const s of sheep) {
    if (s.dead) continue;
    if (s.lost) { s.vx = s.vz = 0; s.phase += dt * 0.5; continue; }
    let sx = 0, sz = 0, ax = 0, az = 0, cx = 0, cz = 0, nb = 0;
    const gi = Math.floor(s.x / cell), gj = Math.floor(s.z / cell);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = grid.get(key(gi + di, gj + dj)); if (!a) continue;
      for (const o of a) {
        if (o === s) continue; const dx = s.x - o.x, dz = s.z - o.z, d2 = dx * dx + dz * dz;
        if (d2 > P.rNb * P.rNb) continue;
        nb++; ax += o.vx; az += o.vz; cx += o.x; cz += o.z;
        if (d2 < P.rSep * P.rSep && d2 > 1e-6) { sx += dx / d2; sz += dz / d2; }
      }
    }
    // Threats: flight zone.
    let fx = 0, fz = 0, fear = 0;
    for (const q of threats) {
      const dx = s.x - q.x, dz = s.z - q.z, d = Math.hypot(dx, dz);
      if (d < q.R && d > 0.01) { const k = 1 - d / q.R; fx += (dx / d) * k; fz += (dz / d) * k; fear = Math.max(fear, k); }
    }
    alarm = Math.max(alarm, fear);
    s.fear = Math.max(fear, (s.fear || 0) - dt * 0.15);
    // Mode: grazing drift ↔ walking to a new patch; goal overrides.
    s.modeT -= dt;
    if (s.modeT <= 0) {
      if (s.mode === 'graze') { s.mode = 'walk'; s.modeT = 4 + Math.random() * 6; const a = Math.random() * 6.28; s.gx = s.x + Math.cos(a) * 8; s.gz = s.z + Math.sin(a) * 8; }
      else { s.mode = 'graze'; s.modeT = 10 + Math.random() * 25; }
    }
    let tx = 0, tz = 0, vmax = s.mode === 'walk' ? P.walk : P.graze;
    const G = goal || (s.mode === 'walk' ? { x: s.gx, z: s.gz } : null);
    if (G) { const dx = G.x - s.x, dz = G.z - s.z, d = Math.hypot(dx, dz) || 1; const w = goal ? 1.6 : 0.6; tx = (dx / d) * w * Math.min(1, d / 6); tz = (dz / d) * w * Math.min(1, d / 6); if (goal) vmax = P.walk * 1.3; }
    if (s.fear > 0.05) vmax = P.walk + (P.run - P.walk) * Math.min(1, s.fear * 1.8);
    if (s.lame) vmax *= 0.45;
    const wc = P.wCoh * (1 + 5 * s.fear) + (goal ? 0.4 : 0);
    let Fx = sx * P.wSep + tx + fx * P.wFlee, Fz = sz * P.wSep + tz + fz * P.wFlee;
    if (nb) { Fx += (ax / nb - s.vx) * P.wAli * (1 + s.fear * 2) + (cx / nb - s.x) * wc * 0.12; Fz += (az / nb - s.vz) * P.wAli * (1 + s.fear * 2) + (cz / nb - s.z) * wc * 0.12; }
    // Fences: a soft wall 4 m deep (skipped while being driven through a gate).
    if (pad && !goal) {
      const m = 4, w = 3;
      if (s.x < pad.x0 + m) Fx += w * (1 - (s.x - pad.x0) / m); if (s.x > pad.x1 - m) Fx -= w * (1 - (pad.x1 - s.x) / m);
      if (s.z < pad.z0 + m) Fz += w * (1 - (s.z - pad.z0) / m); if (s.z > pad.z1 - m) Fz -= w * (1 - (pad.z1 - s.z) / m);
    }
    s.vx += Fx * dt * 2; s.vz += Fz * dt * 2;
    const sp = Math.hypot(s.vx, s.vz); if (sp > vmax) { s.vx *= vmax / sp; s.vz *= vmax / sp; }
    s.vx *= 1 - Math.min(0.9, dt * 0.8); s.vz *= 1 - Math.min(0.9, dt * 0.8);
  }
  for (const s of sheep) {
    if (s.dead || s.lost) continue;
    s.x += s.vx * dt; s.z += s.vz * dt;
    if (pad && !goal) { s.x = Math.min(pad.x1 - 0.3, Math.max(pad.x0 + 0.3, s.x)); s.z = Math.min(pad.z1 - 0.3, Math.max(pad.z0 + 0.3, s.z)); }
    const sp = Math.hypot(s.vx, s.vz);
    if (sp > 0.05) { let d = Math.atan2(s.vx, s.vz) - s.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); s.heading += d * Math.min(1, dt * 3); }
    s.phase += dt * (1 + sp * 6);
    s.speed = sp;
  }
  return { alarm, n };
}

// Flock statistics: centroid, spread (RMS radius), polarisation (|mean unit velocity|).
export function flockStats(sheep) {
  let n = 0, cx = 0, cz = 0, ux = 0, uz = 0, moving = 0;
  for (const s of sheep) if (!s.dead && !s.lost) { n++; cx += s.x; cz += s.z; const sp = Math.hypot(s.vx, s.vz); if (sp > 0.05) { ux += s.vx / sp; uz += s.vz / sp; moving++; } }
  cx /= n; cz /= n; let r2 = 0, far = 0;
  for (const s of sheep) if (!s.dead && !s.lost) { const d2 = (s.x - cx) ** 2 + (s.z - cz) ** 2; r2 += d2; far = Math.max(far, Math.sqrt(d2)); }
  return { n, cx, cz, rms: Math.sqrt(r2 / n), far, pol: moving ? Math.hypot(ux, uz) / moving : 0, moving };
}

// Daily water need per ewe (L): ~4 L on pasture at 15 °C, +0.12 L/°C above, ×1.5 when lactating.
export const waterNeed = (w, tempC, lactating = false) => (4 * (w / 70) + Math.max(0, tempC - 15) * 0.12) * (lactating ? 1.5 : 1);
// Dry-matter intake (kg/day): 2.5–3.5 % of body weight; lactation at the top of the range.
export const intake = (w, lactating = false) => w * (lactating ? 0.035 : 0.027);
