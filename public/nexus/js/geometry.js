/**
 * Procedural geometry for the command hall.
 *
 * Everything the renderer draws is generated here from maths rather than
 * loaded from a model file: the holographic receptionist, the dais, the
 * curved video wall, the marble floor and the wireframe Earth. Keeping it
 * procedural is what lets the whole app stay a few hundred kilobytes and
 * work with the signal off.
 *
 * All builders are pure and return plain typed arrays, so they can be
 * exercised in Node without a GL context.
 *
 * @module nexus/geometry
 */

import { latLonToVec3 } from './mathkit.js';

/**
 * Deterministic pseudo-random generator.
 *
 * The figure has to look identical on every load (and in screenshot tests),
 * so sampling uses a seeded generator rather than `Math.random`.
 *
 * @param {number} seed Any integer.
 * @returns {() => number} Generator yielding [0, 1).
 */
export function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/**
 * Half-width and depth of the body at a given height.
 *
 * `t` runs 0 at the soles to 1 at the crown. The profile is a hand-tuned
 * piecewise curve — ankles, calves, knees, thighs, hips, waist, ribs,
 * shoulders, neck — interpolated smoothly, which reads as a human silhouette
 * from any angle without needing a mesh.
 *
 * @param {number} t Normalised height in [0, 1].
 * @returns {{ w: number, d: number }} Half-width and half-depth, body units.
 */
export function bodyProfile(t) {
  const key = [
    [0.00, 0.052, 0.075],
    [0.06, 0.045, 0.062],
    [0.12, 0.062, 0.070],
    [0.22, 0.058, 0.062],
    [0.30, 0.070, 0.074],
    [0.42, 0.086, 0.090],
    [0.50, 0.104, 0.098],
    [0.55, 0.112, 0.100],
    [0.60, 0.090, 0.086],
    [0.64, 0.084, 0.082],
    [0.70, 0.100, 0.096],
    [0.76, 0.108, 0.092],
    [0.81, 0.116, 0.088],
    [0.855, 0.060, 0.060],
    [0.875, 0.044, 0.046],
    [0.90, 0.060, 0.066],
    [0.95, 0.070, 0.076],
    [1.00, 0.030, 0.034],
  ];
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  let i = 0;
  while (i < key.length - 2 && u > key[i + 1][0]) i += 1;
  const [t0, w0, d0] = key[i];
  const [t1, w1, d1] = key[i + 1];
  const span = t1 - t0 || 1;
  const k = (u - t0) / span;
  const s = k * k * (3 - 2 * k);
  return { w: w0 + (w1 - w0) * s, d: d0 + (d1 - d0) * s };
}

/**
 * Build the holographic figure as a point cloud.
 *
 * Points carry a per-vertex seed used by the shader for flicker and for the
 * vertical scan sweep, plus a "limb" channel so arms can be animated
 * separately from the torso.
 *
 * @param {number} [count] Approximate point count.
 * @returns {{ position: Float32Array, seed: Float32Array, count: number, height: number }}
 *   Interleave-ready buffers.
 */
export function buildFigure(count = 14000) {
  const rand = rng(20260903);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  const height = 1.72;
  let n = 0;

  /**
   * Write one point.
   *
   * @param {number} x X in body units.
   * @param {number} y Y in body units.
   * @param {number} z Z in body units.
   * @param {number} kind 0 torso/legs, 1 arms, 2 head.
   */
  const put = (x, y, z, kind) => {
    if (n >= count) return;
    pos[n * 3] = x;
    pos[n * 3 + 1] = y;
    pos[n * 3 + 2] = z;
    seed[n * 2] = rand();
    seed[n * 2 + 1] = kind;
    n += 1;
  };

  // Torso, hips and legs: sample the profile of revolution, splitting into
  // two limbs below the hip line so the legs read as separate.
  const shellPoints = Math.floor(count * 0.62);
  for (let i = 0; i < shellPoints; i += 1) {
    const t = rand();
    const { w, d } = bodyProfile(t);
    const a = rand() * Math.PI * 2;
    // Shell-biased radius: most points near the surface, a few inside, which
    // gives volumetric depth without hiding the silhouette.
    const r = 0.82 + rand() * 0.18;
    let x = Math.cos(a) * w * r;
    const z = Math.sin(a) * d * r;
    let y = t * height;
    if (t < 0.48) {
      // Legs: offset each sampled point onto the near or far leg.
      const side = rand() < 0.5 ? -1 : 1;
      const spread = 0.055 * (1 - t / 0.48) + 0.028;
      x = x * 0.46 + side * spread;
    }
    if (t > 0.86 && t < 0.9) y += (rand() - 0.5) * 0.01;
    put(x, y, z, 0);
  }

  // Arms: two tapered tubes hanging just clear of the torso.
  const armPoints = Math.floor(count * 0.16);
  for (let i = 0; i < armPoints; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const t = rand();
    const shoulderY = height * 0.805;
    const y = shoulderY - t * height * 0.42;
    const bulge = Math.sin(t * Math.PI) * 0.012;
    const radius = 0.030 - t * 0.012 + bulge;
    const a = rand() * Math.PI * 2;
    // The arms hang slightly clear of the torso and drift forward toward the
    // wrist, which is what stops the figure reading as a slab.
    const outward = 0.132 + t * 0.040;
    put(
      side * (outward + Math.cos(a) * radius),
      y,
      Math.sin(a) * radius + t * 0.045,
      1,
    );
  }

  // Head and hair: an ellipsoid with a denser shell behind the crown.
  const headPoints = count - n;
  const headY = height * 0.945;
  for (let i = 0; i < headPoints; i += 1) {
    const a = rand() * Math.PI * 2;
    const b = Math.acos(2 * rand() - 1);
    const r = 0.86 + rand() * 0.14;
    const hair = rand() < 0.42;
    const rx = (hair ? 0.074 : 0.064) * r;
    const ry = (hair ? 0.090 : 0.079) * r;
    const rz = (hair ? 0.078 : 0.066) * r;
    const x = Math.sin(b) * Math.cos(a) * rx;
    const z = Math.sin(b) * Math.sin(a) * rz;
    let y = headY + Math.cos(b) * ry;
    // Hair falls past the jaw at the back and sides.
    if (hair && z < 0.01) y -= (0.09 + rand() * 0.12) * (1 - Math.abs(x) / rx * 0.4);
    put(x, y, z, 2);
  }

  return { position: pos, seed, count: n, height };
}

/**
 * Append a line segment to arrays.
 *
 * @param {number[]} out Destination position array.
 * @param {number[]} tint Destination intensity array.
 * @param {number[]} a Start point.
 * @param {number[]} b End point.
 * @param {number} i Intensity in [0, 1].
 */
function segment(out, tint, a, b, i) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  tint.push(i, i);
}

/**
 * Build the room: marble floor grid, the tiered dais, the curved video wall
 * and the chandelier armature.
 *
 * @returns {{ position: Float32Array, intensity: Float32Array, count: number }}
 *   Line-list buffers.
 */
export function buildHall() {
  const pos = [];
  const tint = [];

  // Floor: a radial marble inlay rather than a square grid, matching the
  // rotunda the hall is modelled on.
  for (let ring = 1; ring <= 14; ring += 1) {
    const r = ring * 1.15;
    const steps = 96;
    const bright = ring % 4 === 0 ? 0.5 : 0.16;
    for (let i = 0; i < steps; i += 1) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      segment(pos, tint,
        [Math.cos(a0) * r, 0, Math.sin(a0) * r],
        [Math.cos(a1) * r, 0, Math.sin(a1) * r], bright);
    }
  }
  for (let spoke = 0; spoke < 24; spoke += 1) {
    const a = (spoke / 24) * Math.PI * 2;
    segment(pos, tint,
      [Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6],
      [Math.cos(a) * 16.1, 0, Math.sin(a) * 16.1], spoke % 6 === 0 ? 0.3 : 0.1);
  }

  // Dais: three stacked cylinders under the hologram.
  const tiers = [[2.55, 0.0], [2.2, 0.16], [1.85, 0.32]];
  for (const [r, y] of tiers) {
    const steps = 72;
    for (let i = 0; i < steps; i += 1) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      segment(pos, tint,
        [Math.cos(a0) * r, y, Math.sin(a0) * r],
        [Math.cos(a1) * r, y, Math.sin(a1) * r], 0.85);
      if (i % 6 === 0) {
        segment(pos, tint,
          [Math.cos(a0) * r, y, Math.sin(a0) * r],
          [Math.cos(a0) * r, Math.max(0, y - 0.16), Math.sin(a0) * r], 0.4);
      }
    }
  }

  // Curved video wall: nine panels on an arc behind the dais.
  const panels = 9;
  const wallR = 10.6;
  const arc = Math.PI * 0.78;
  for (let p = 0; p < panels; p += 1) {
    const a0 = -Math.PI / 2 - arc / 2 + (arc * p) / panels + 0.012;
    const a1 = -Math.PI / 2 - arc / 2 + (arc * (p + 1)) / panels - 0.012;
    const yTop = p % 2 === 0 ? 5.6 : 4.9;
    const yBot = 1.35;
    const corners = [
      [Math.cos(a0) * wallR, yBot, Math.sin(a0) * wallR],
      [Math.cos(a1) * wallR, yBot, Math.sin(a1) * wallR],
      [Math.cos(a1) * wallR, yTop, Math.sin(a1) * wallR],
      [Math.cos(a0) * wallR, yTop, Math.sin(a0) * wallR],
    ];
    for (let c = 0; c < 4; c += 1) segment(pos, tint, corners[c], corners[(c + 1) % 4], 0.9);
    // Content lines inside each panel read as dashboards at distance.
    for (let row = 1; row < 9; row += 1) {
      const k = row / 9;
      const y = yBot + (yTop - yBot) * k;
      const shrink = 0.06 + (row % 3) * 0.12;
      const b0 = a0 + (a1 - a0) * shrink;
      const b1 = a1 - (a1 - a0) * (shrink * (row % 2 ? 1.6 : 0.6));
      segment(pos, tint,
        [Math.cos(b0) * wallR, y, Math.sin(b0) * wallR],
        [Math.cos(b1) * wallR, y, Math.sin(b1) * wallR], row % 3 === 0 ? 0.62 : 0.30);
    }
  }

  // Chandelier: a hanging armature of concentric rings above the dais.
  for (let ring = 0; ring < 5; ring += 1) {
    const r = 1.9 - ring * 0.3;
    const y = 8.6 - ring * 0.34;
    const steps = 40;
    for (let i = 0; i < steps; i += 1) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      segment(pos, tint,
        [Math.cos(a0) * r, y, Math.sin(a0) * r],
        [Math.cos(a1) * r, y, Math.sin(a1) * r], 0.5 - ring * 0.06);
    }
  }

  return {
    position: new Float32Array(pos),
    intensity: new Float32Array(tint),
    count: tint.length,
  };
}

/**
 * Coarse continent outlines, in `[lon, lat]` pairs.
 *
 * Stylised, not survey data — enough for the eye to read "Earth" on a
 * wireframe globe at command-centre scale. Anything needing real geometry
 * uses the Cesium globe in the main app, not this.
 *
 * @type {number[][][]}
 */
export const COASTLINES = [
  // North America
  [[-168, 65], [-158, 71], [-133, 69], [-120, 70], [-95, 70], [-81, 73], [-63, 60], [-55, 52],
   [-66, 45], [-74, 40], [-81, 31], [-80, 25], [-90, 29], [-97, 26], [-105, 21], [-114, 30],
   [-124, 40], [-125, 49], [-136, 58], [-152, 59], [-165, 60], [-168, 65]],
  // South America
  [[-81, 8], [-72, 11], [-60, 10], [-50, 0], [-44, -3], [-35, -6], [-39, -18], [-48, -25],
   [-58, -35], [-62, -41], [-66, -48], [-70, -55], [-75, -47], [-73, -37], [-71, -25],
   [-76, -14], [-81, -6], [-81, 8]],
  // Africa
  [[-17, 15], [-6, 36], [10, 37], [25, 32], [33, 31], [43, 12], [51, 12], [41, -2], [40, -15],
   [35, -24], [25, -34], [18, -34], [12, -18], [9, -1], [6, 4], [-8, 4], [-16, 12], [-17, 15]],
  // Europe
  [[-10, 36], [-9, 43], [-2, 48], [2, 51], [5, 53], [8, 57], [11, 58], [18, 55], [21, 60],
   [25, 65], [30, 70], [20, 70], [12, 65], [5, 59], [-5, 58], [-10, 51], [-10, 36]],
  // Asia
  [[26, 40], [40, 42], [50, 45], [60, 55], [70, 68], [90, 76], [110, 74], [140, 72], [160, 69],
   [170, 62], [155, 55], [143, 45], [130, 35], [122, 30], [110, 20], [100, 10], [95, 16],
   [88, 21], [72, 21], [66, 25], [58, 25], [48, 29], [43, 36], [30, 36], [26, 40]],
  // Australia
  [[113, -22], [122, -18], [130, -12], [142, -11], [148, -20], [153, -28], [149, -37],
   [140, -38], [130, -32], [117, -35], [113, -26], [113, -22]],
  // Antarctica (schematic cap)
  [[-180, -72], [-140, -74], [-100, -73], [-60, -70], [-20, -70], [20, -69], [60, -67],
   [100, -66], [140, -68], [180, -72]],
  // Greenland
  [[-45, 60], [-25, 70], [-20, 76], [-30, 82], [-55, 82], [-62, 76], [-55, 66], [-45, 60]],
  // Japan / Indonesia / islands, drawn as short strokes
  [[130, 31], [136, 35], [141, 40], [143, 44]],
  [[95, 5], [105, -6], [115, -8], [130, -8], [140, -5]],
  [[173, -35], [176, -40], [170, -45]],
  [[-6, 54], [-3, 58], [-5, 50]],
];

/**
 * Build the wireframe Earth: graticule plus coarse coastlines.
 *
 * @param {number} [radius] Sphere radius.
 * @returns {{ position: Float32Array, intensity: Float32Array, count: number }}
 *   Line-list buffers.
 */
export function buildGlobe(radius = 2.4) {
  const pos = [];
  const tint = [];

  for (let lat = -80; lat <= 80; lat += 20) {
    const bright = lat === 0 ? 0.55 : 0.14;
    for (let lon = -180; lon < 180; lon += 5) {
      segment(pos, tint,
        latLonToVec3(lat, lon, radius),
        latLonToVec3(lat, lon + 5, radius), bright);
    }
  }
  for (let lon = -180; lon < 180; lon += 20) {
    const bright = lon === 0 ? 0.45 : 0.12;
    for (let lat = -90; lat < 90; lat += 5) {
      segment(pos, tint,
        latLonToVec3(lat, lon, radius),
        latLonToVec3(lat + 5, lon, radius), bright);
    }
  }
  for (const line of COASTLINES) {
    for (let i = 0; i < line.length - 1; i += 1) {
      const [lon0, lat0] = line[i];
      const [lon1, lat1] = line[i + 1];
      // Subdivide so long strokes hug the sphere instead of cutting through it.
      const steps = 6;
      for (let s = 0; s < steps; s += 1) {
        const k0 = s / steps;
        const k1 = (s + 1) / steps;
        segment(pos, tint,
          latLonToVec3(lat0 + (lat1 - lat0) * k0, lon0 + (lon1 - lon0) * k0, radius * 1.004),
          latLonToVec3(lat0 + (lat1 - lat0) * k1, lon0 + (lon1 - lon0) * k1, radius * 1.004),
          0.95);
      }
    }
  }

  return {
    position: new Float32Array(pos),
    intensity: new Float32Array(tint),
    count: tint.length,
  };
}

/**
 * Build the dais emitter — the projected light the hologram stands in.
 *
 * Concentric rings of points on the dais top, plus a faint column rising
 * through the figure, drawn additively so it reads as light rather than as
 * geometry.
 *
 * @param {number} [count] Point budget.
 * @returns {{ position: Float32Array, seed: Float32Array, count: number }} Buffers.
 */
export function buildEmitter(count = 3000) {
  const rand = rng(4242);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  const ringCount = 4;
  for (let i = 0; i < count; i += 1) {
    const onColumn = rand() < 0.22;
    const a = rand() * Math.PI * 2;
    if (onColumn) {
      // A soft shaft of light from the dais to well above the figure's head.
      const r = 0.10 + rand() * 0.72;
      const h = rand();
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.34 + h * 3.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 2 + 1] = (1 - h) * 0.5;
    } else {
      const ring = Math.floor(rand() * ringCount);
      const r = 0.55 + ring * 0.36 + (rand() - 0.5) * 0.035;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.345 + (rand() - 0.5) * 0.012;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i * 2 + 1] = 0.75 - ring * 0.12;
    }
    seed[i * 2] = rand();
  }
  return { position: pos, seed, count };
}

/**
 * Build the ambient particle field — dust motes in the volume and a starfield
 * beyond the wall.
 *
 * @param {number} [count] Number of motes.
 * @returns {{ position: Float32Array, seed: Float32Array, count: number }} Buffers.
 */
export function buildMotes(count = 2400) {
  const rand = rng(77345);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 1.5 + rand() * 13;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rand() * 8.5;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i * 2] = rand();
    seed[i * 2 + 1] = 0.4 + rand() * 0.6;
  }
  return { position: pos, seed, count };
}
