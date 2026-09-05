/**
 * The hologram's geometry.
 *
 * Everything the hero renders is generated here from a handful of numbers —
 * there are no model files in this app, and nothing is downloaded to draw the
 * house. Each builder returns flat typed arrays ready for a buffer, plus a
 * per-vertex `order` channel in the range 0–1.
 *
 * That order channel is what makes the scene scroll-linked: the shader draws
 * a line only once the scene's progress has passed its order, so scrubbing
 * down the page builds the estate from its foundations up and scrubbing back
 * takes it apart again, deterministically, with no animation state anywhere.
 *
 * @module jose-montes/geometry
 */

import { rng } from './mathkit.js';

/**
 * Push one line segment into the accumulating arrays.
 *
 * @param {object} sink Accumulator with `pos` and `ord` arrays.
 * @param {number[]} a Start point.
 * @param {number[]} b End point.
 * @param {number} order Assembly order, 0–1.
 * @param {number} [intensity] Relative brightness, 0–1.
 */
function line(sink, a, b, order, intensity = 1) {
  sink.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  sink.ord.push(order, intensity, order, intensity);
}

/**
 * A rectangular box drawn as twelve edges.
 *
 * @param {object} sink Accumulator.
 * @param {number[]} min Minimum corner.
 * @param {number[]} max Maximum corner.
 * @param {number} order Assembly order.
 * @param {number} [intensity] Brightness.
 */
function box(sink, min, max, order, intensity = 1) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (const [i, j] of edges) line(sink, corners[i], corners[j], order, intensity);
}

/**
 * The estate: a modern coastal house, its terrace, pool and posts.
 *
 * Proportions are in metres and the origin sits at the middle of the ground
 * floor, so the camera work in the stage can be written in real distances.
 *
 * @returns {{ positions: Float32Array, order: Float32Array, count: number }}
 *   Line list, ready for `gl.LINES`.
 */
export function buildEstate() {
  const sink = { pos: [], ord: [] };

  // Foundation slab and terrace deck — the first things to appear.
  box(sink, [-7, -0.15, -5], [7, 0, 5], 0.02, 0.5);
  box(sink, [-11, -0.15, -1.5], [-7, 0, 5], 0.06, 0.4);

  // Ground floor: an open plan with a glazed western wall.
  box(sink, [-6.5, 0, -4.5], [6.5, 3.2, 4.5], 0.18, 1);
  for (let i = 1; i < 8; i += 1) {
    const x = -6.5 + (13 * i) / 8;
    line(sink, [x, 0, -4.5], [x, 3.2, -4.5], 0.24 + i * 0.008, 0.55);
  }
  // Mullions on the ocean side, closer together because that wall is glass.
  for (let i = 1; i < 14; i += 1) {
    const z = -4.5 + (9 * i) / 14;
    line(sink, [-6.5, 0, z], [-6.5, 3.2, z], 0.28 + i * 0.004, 0.45);
  }

  // Upper floor, set back from the ocean elevation.
  box(sink, [-4.5, 3.2, -4.5], [6.5, 6.1, 3], 0.42, 1);
  for (let i = 1; i < 6; i += 1) {
    const x = -4.5 + (11 * i) / 6;
    line(sink, [x, 3.2, -4.5], [x, 6.1, -4.5], 0.46 + i * 0.008, 0.5);
  }

  // The roof plane, cantilevered west over the glass.
  const roof = 6.35;
  line(sink, [-8, roof, -5], [7.5, roof, -5], 0.58, 1);
  line(sink, [-8, roof, 3.5], [7.5, roof, 3.5], 0.6, 1);
  line(sink, [-8, roof, -5], [-8, roof, 3.5], 0.62, 1);
  line(sink, [7.5, roof, -5], [7.5, roof, 3.5], 0.62, 1);
  for (let i = 1; i < 9; i += 1) {
    const x = -8 + (15.5 * i) / 9;
    line(sink, [x, roof, -5], [x, roof, 3.5], 0.64 + i * 0.004, 0.3);
  }
  // Columns carrying the cantilever.
  for (const z of [-4, 0, 3]) {
    line(sink, [-8, 0, z], [-8, roof, z], 0.54, 0.8);
  }

  // Infinity pool west of the house, its lip level with the terrace.
  box(sink, [-10.5, -1.4, -1], [-7.5, -0.1, 4.5], 0.74, 0.85);
  for (let i = 1; i < 6; i += 1) {
    const z = -1 + (5.5 * i) / 6;
    line(sink, [-10.5, -0.1, z], [-7.5, -0.1, z], 0.78 + i * 0.005, 0.35);
  }

  // Olive trees, drawn as four-stroke abstractions. Each gets a cross on the
  // ground as well as a trunk: without it the canopy reads as a mark floating
  // in mid-air rather than as something standing in the garden.
  const random = rng(20240905);
  for (let i = 0; i < 7; i += 1) {
    const x = 8 + random() * 5;
    const z = -5 + random() * 10;
    const h = 1.8 + random() * 1.4;
    const order = 0.86 + i * 0.006;
    line(sink, [x - 0.8, 0, z], [x + 0.8, 0, z], order, 0.5);
    line(sink, [x, 0, z - 0.8], [x, 0, z + 0.8], order, 0.5);
    line(sink, [x, 0, z], [x, h, z], order + 0.004, 0.45);
    line(sink, [x - 0.7, h * 0.75, z], [x + 0.7, h, z + 0.3], order + 0.008, 0.3);
    line(sink, [x - 0.4, h, z + 0.6], [x + 0.5, h * 0.8, z - 0.5], order + 0.01, 0.3);
  }

  return {
    positions: new Float32Array(sink.pos),
    order: new Float32Array(sink.ord),
    count: sink.pos.length / 3,
  };
}

/**
 * The ocean: a grid west of the house, displaced into a slow swell.
 *
 * The swell is applied here rather than in the shader so the same geometry
 * can be reasoned about in tests; the shader adds only the time-varying part.
 *
 * @param {number} [rows] Lines running north–south.
 * @param {number} [cols] Lines running east–west.
 * @returns {{ positions: Float32Array, order: Float32Array, count: number }}
 *   The grid as a line list.
 */
export function buildOcean(rows = 26, cols = 30) {
  const sink = { pos: [], ord: [] };
  const west = -14;
  const span = 70;
  const depth = 90;
  const height = (x, z) => Math.sin(x * 0.22 + z * 0.05) * 0.22 + Math.sin(z * 0.17) * 0.16 - 1.6;

  for (let r = 0; r < rows; r += 1) {
    const z = -depth / 2 + (depth * r) / (rows - 1);
    for (let c = 0; c < cols - 1; c += 1) {
      const x0 = west - (span * c) / (cols - 1);
      const x1 = west - (span * (c + 1)) / (cols - 1);
      // Distant water fades out, so the horizon does not end in a hard edge.
      const fade = 1 - c / (cols - 1);
      line(sink, [x0, height(x0, z), z], [x1, height(x1, z), z], 0.0, 0.18 + fade * 0.5);
    }
  }
  for (let c = 0; c < cols; c += 2) {
    const x = west - (span * c) / (cols - 1);
    for (let r = 0; r < rows - 1; r += 1) {
      const z0 = -depth / 2 + (depth * r) / (rows - 1);
      const z1 = -depth / 2 + (depth * (r + 1)) / (rows - 1);
      const fade = 1 - c / (cols - 1);
      line(sink, [x, height(x, z0), z0], [x, height(x, z1), z1], 0.0, 0.12 + fade * 0.3);
    }
  }

  return {
    positions: new Float32Array(sink.pos),
    order: new Float32Array(sink.ord),
    count: sink.pos.length / 3,
  };
}

/**
 * Motes of light drifting through the scene.
 *
 * @param {number} [count] How many.
 * @param {number} [seed] Deterministic seed.
 * @returns {{ positions: Float32Array, seeds: Float32Array, count: number }}
 *   Point cloud with a per-point random pair for shader animation.
 */
export function buildMotes(count = 900, seed = 7) {
  const random = rng(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = -30 + random() * 55;
    positions[i * 3 + 1] = -2 + random() * 18;
    positions[i * 3 + 2] = -25 + random() * 50;
    seeds[i * 2] = random();
    seeds[i * 2 + 1] = 0.4 + random() * 0.6;
  }
  return { positions, seeds, count };
}

/**
 * The data ring: a horizontal circle of ticks around the estate.
 *
 * It is the one purely decorative element, and it earns its place by giving
 * the eye something that reads as instrumentation rather than architecture.
 *
 * @param {number} [radius] Ring radius.
 * @param {number} [ticks] Number of ticks.
 * @returns {{ positions: Float32Array, order: Float32Array, count: number }}
 *   The ring as a line list.
 */
export function buildRing(radius = 17, ticks = 120) {
  const sink = { pos: [], ord: [] };
  const y = -1.2;
  for (let i = 0; i < ticks; i += 1) {
    const a0 = (i / ticks) * Math.PI * 2;
    const a1 = ((i + 1) / ticks) * Math.PI * 2;
    line(sink,
      [Math.cos(a0) * radius, y, Math.sin(a0) * radius],
      [Math.cos(a1) * radius, y, Math.sin(a1) * radius],
      0.0, 0.3);
    if (i % 5 === 0) {
      const long = i % 20 === 0 ? 1.4 : 0.6;
      line(sink,
        [Math.cos(a0) * radius, y, Math.sin(a0) * radius],
        [Math.cos(a0) * radius, y + long, Math.sin(a0) * radius],
        0.0, i % 20 === 0 ? 0.8 : 0.4);
    }
  }
  return {
    positions: new Float32Array(sink.pos),
    order: new Float32Array(sink.ord),
    count: sink.pos.length / 3,
  };
}
