/**
 * Procedural geometry for the laboratory.
 *
 * Every vertex in the facility is generated from maths here — the vault, the
 * peptide helix, the vial plinth, the molecule clouds, the dust — which is why
 * the whole platform is a few hundred kilobytes and loads no model files.
 *
 * Two vertex formats come out of this module and only two, because the renderer
 * has only two shader programs:
 *
 * - **Points**: `{ positions: Float32Array(n*3), seeds: Float32Array(n*2) }`
 * - **Lines**: `{ positions: Float32Array(n*3), intensities: Float32Array(n) }`
 *
 * Everything is deterministic from a seed so the facility is the same room on
 * every visit, and so the tests can assert on what was built.
 *
 * @module astra/geometry
 */

import { rng } from './mathkit.js';

/**
 * Build a point cloud from a generator.
 *
 * @param {number} count How many points.
 * @param {(i: number, random: () => number) => number[]} fn Returns `[x, y, z]`.
 * @param {number} [seed] RNG seed.
 * @returns {{ positions: Float32Array, seeds: Float32Array, count: number }} The cloud.
 */
export function points(count, fn, seed = 7) {
  const random = rng(seed);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const [x, y, z] = fn(i, random);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    seeds[i * 2] = random();
    seeds[i * 2 + 1] = 0.4 + random() * 0.6;
  }
  return { positions, seeds, count };
}

/**
 * Build a line list from segments.
 *
 * @param {Array<[number[], number[], number?]>} segments `[from, to, intensity]`.
 * @returns {{ positions: Float32Array, intensities: Float32Array, count: number }} The lines.
 */
export function lines(segments) {
  const positions = new Float32Array(segments.length * 6);
  const intensities = new Float32Array(segments.length * 2);
  segments.forEach(([from, to, intensity = 1], index) => {
    positions.set(from, index * 6);
    positions.set(to, index * 6 + 3);
    intensities[index * 2] = intensity;
    intensities[index * 2 + 1] = intensity;
  });
  return { positions, intensities, count: segments.length * 2 };
}

/**
 * The vault: the room itself.
 *
 * A hexagonal chamber with a recessed floor grid, ribbed wall panels, a
 * suspended lighting ring and two console benches. Drawn entirely as lines,
 * because a wireframe room reads as a facility while costing almost nothing.
 *
 * @param {object} [options] Options.
 * @param {number} [options.radius] Chamber radius.
 * @param {number} [options.height] Wall height.
 * @returns {object} A line list.
 */
export function buildVault({ radius = 16, height = 9 } = {}) {
  const segments = [];
  const sides = 6;

  /**
   * A point on the chamber's hexagonal footprint.
   *
   * @param {number} index Corner index.
   * @param {number} r Radius.
   * @param {number} y Height.
   * @returns {number[]} The vertex.
   */
  const corner = (index, r, y) => {
    const angle = (index / sides) * Math.PI * 2 + Math.PI / 6;
    return [Math.cos(angle) * r, y, Math.sin(angle) * r];
  };

  // Floor and ceiling rings, plus the uprights between them.
  for (let i = 0; i < sides; i += 1) {
    segments.push([corner(i, radius, 0), corner(i + 1, radius, 0), 0.85]);
    segments.push([corner(i, radius, height), corner(i + 1, radius, height), 0.6]);
    segments.push([corner(i, radius, 0), corner(i, radius, height), 0.5]);
    // Ribbed wall panels: three verticals per bay.
    for (let rib = 1; rib < 4; rib += 1) {
      const t = rib / 4;
      const a = corner(i, radius, 0);
      const b = corner(i + 1, radius, 0);
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      segments.push([[x, 0.2, z], [x, height * 0.82, z], 0.22]);
    }
  }

  // Floor grid, clipped to a circle so the corners do not poke through the walls.
  const step = radius / 7;
  for (let i = -7; i <= 7; i += 1) {
    const offset = i * step;
    const half = Math.sqrt(Math.max(0, radius * radius - offset * offset));
    if (half < 0.4) continue;
    const intensity = i === 0 ? 0.5 : 0.16;
    segments.push([[-half, 0, offset], [half, 0, offset], intensity]);
    segments.push([[offset, 0, -half], [offset, 0, half], intensity]);
  }

  // The lighting ring above the dais.
  const ringSegments = 48;
  for (let i = 0; i < ringSegments; i += 1) {
    const a = (i / ringSegments) * Math.PI * 2;
    const b = ((i + 1) / ringSegments) * Math.PI * 2;
    const r = 5.4;
    segments.push([
      [Math.cos(a) * r, height * 0.86, Math.sin(a) * r],
      [Math.cos(b) * r, height * 0.86, Math.sin(b) * r],
      0.95,
    ]);
  }

  // Two console benches facing the dais.
  for (const side of [-1, 1]) {
    const x = side * 9.5;
    segments.push([[x - 2.6, 1.05, -3.4], [x + 2.6, 1.05, -3.4], 0.7]);
    segments.push([[x - 2.6, 1.05, 1.4], [x + 2.6, 1.05, 1.4], 0.7]);
    segments.push([[x - 2.6, 1.05, -3.4], [x - 2.6, 1.05, 1.4], 0.7]);
    segments.push([[x + 2.6, 1.05, -3.4], [x + 2.6, 1.05, 1.4], 0.7]);
    for (const z of [-3.4, 1.4]) {
      segments.push([[x - 2.6, 0, z], [x - 2.6, 1.05, z], 0.3]);
      segments.push([[x + 2.6, 0, z], [x + 2.6, 1.05, z], 0.3]);
    }
    // A raked holographic display over each bench.
    for (let i = 0; i <= 5; i += 1) {
      const t = i / 5;
      segments.push([
        [x - 2.4 + t * 4.8, 1.4, -1.2],
        [x - 2.4 + t * 4.8, 3.5, -2.4],
        0.28,
      ]);
    }
    segments.push([[x - 2.4, 3.5, -2.4], [x + 2.4, 3.5, -2.4], 0.5]);
  }

  // The dais.
  for (const r of [3.4, 2.9]) {
    for (let i = 0; i < 40; i += 1) {
      const a = (i / 40) * Math.PI * 2;
      const b = ((i + 1) / 40) * Math.PI * 2;
      segments.push([
        [Math.cos(a) * r, 0.28, Math.sin(a) * r],
        [Math.cos(b) * r, 0.28, Math.sin(b) * r],
        r > 3 ? 0.8 : 0.45,
      ]);
    }
  }

  return lines(segments);
}

/**
 * The peptide helix at the centre of the vault.
 *
 * Two backbones wound around a shared axis with residue rungs between them, and
 * a point cloud of side-chain atoms hanging off each backbone position — the
 * visual shorthand everybody reads as "peptide" without pretending to be a real
 * structure.
 *
 * @param {object} [options] Options.
 * @param {number} [options.turns] Helical turns.
 * @param {number} [options.height] Total height.
 * @param {number} [options.radius] Helix radius.
 * @param {number} [options.residues] Residues per backbone.
 * @returns {{ backbone: object, atoms: object }} Lines and points.
 */
export function buildHelix({ turns = 4.5, height = 7.2, radius = 1.5, residues = 96 } = {}) {
  const segments = [];
  const base = 1.35;

  /**
   * A backbone position.
   *
   * @param {number} t Fraction along the helix.
   * @param {number} phase Strand phase offset.
   * @returns {number[]} The vertex.
   */
  const at = (t, phase) => {
    const angle = t * turns * Math.PI * 2 + phase;
    // The radius breathes along the length so the helix is not a perfect
    // cylinder — real molecular renderings never are.
    const r = radius * (0.82 + 0.18 * Math.sin(t * Math.PI * 2.2));
    return [Math.cos(angle) * r, base + t * height, Math.sin(angle) * r];
  };

  for (let i = 0; i < residues; i += 1) {
    const t = i / residues;
    const tNext = (i + 1) / residues;
    for (const phase of [0, Math.PI]) {
      segments.push([at(t, phase), at(tNext, phase), 0.9]);
    }
    // Rungs every fourth residue, alternating brightness so the eye reads a
    // repeating unit rather than a ladder.
    if (i % 4 === 0) segments.push([at(t, 0), at(t, Math.PI), i % 8 === 0 ? 0.75 : 0.35]);
  }

  // Side chains hug their backbone position closely. A wide scatter here is
  // what turns a double helix into a cloud of noise on screen, so the spread is
  // deliberately tight and biased outward from the axis.
  const atoms = points(residues * 6, (i, random) => {
    const residue = Math.floor(i / 6);
    const t = residue / residues;
    const phase = i % 2 ? Math.PI : 0;
    const [x, y, z] = at(t, phase);
    const spread = 0.05 + random() * 0.17;
    const axial = Math.atan2(z, x);
    const lift = (random() - 0.5) * 0.11;
    return [
      x + Math.cos(axial) * spread,
      y + lift,
      z + Math.sin(axial) * spread,
    ];
  }, 4242);

  return { backbone: lines(segments), atoms };
}

/**
 * A molecule: ball-and-stick, generated as a branching walk.
 *
 * Each compound gets its own seed, so BPC-157 always looks like BPC-157 and
 * Semax always looks like Semax, without either pretending to be the real
 * structure. The card art the platform is styled after does exactly this.
 *
 * @param {object} [options] Options.
 * @param {number} [options.seed] Compound seed.
 * @param {number} [options.atoms] Atom count.
 * @param {number} [options.scale] Overall size.
 * @returns {{ atoms: object, bonds: object }} Points and lines.
 */
export function buildMolecule({ seed = 11, atoms = 46, scale = 2.6 } = {}) {
  const random = rng(seed);
  const nodes = [[0, 0, 0]];
  const bonds = [];

  for (let i = 1; i < atoms; i += 1) {
    // Attach to a recent atom most of the time, and occasionally reach back —
    // which is what produces rings rather than a straight chain.
    const anchorIndex = random() < 0.72
      ? nodes.length - 1 - Math.floor(random() * Math.min(3, nodes.length))
      : Math.floor(random() * nodes.length);
    const anchor = nodes[Math.max(0, anchorIndex)];
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const length = 0.42 + random() * 0.2;
    const node = [
      anchor[0] + Math.sin(phi) * Math.cos(theta) * length,
      anchor[1] + Math.cos(phi) * length * 0.8,
      anchor[2] + Math.sin(phi) * Math.sin(theta) * length,
    ];
    nodes.push(node);
    bonds.push([anchor, node, 0.7 + random() * 0.3]);
    // Occasional ring closure to a nearby atom.
    if (random() < 0.16 && nodes.length > 5) {
      const other = nodes[Math.floor(random() * (nodes.length - 3))];
      const distance = Math.hypot(node[0] - other[0], node[1] - other[1], node[2] - other[2]);
      if (distance < 1.3) bonds.push([node, other, 0.45]);
    }
  }

  // Centre and scale so every molecule frames identically regardless of seed.
  const centre = nodes.reduce((acc, node) => [acc[0] + node[0], acc[1] + node[1], acc[2] + node[2]], [0, 0, 0])
    .map((value) => value / nodes.length);
  const extent = nodes.reduce((max, node) => Math.max(max,
    Math.hypot(node[0] - centre[0], node[1] - centre[1], node[2] - centre[2])), 0.001);
  const factor = scale / extent;
  const place = (node) => [
    (node[0] - centre[0]) * factor,
    (node[1] - centre[1]) * factor,
    (node[2] - centre[2]) * factor,
  ];

  const atomCloud = points(nodes.length * 3, (i, rand) => {
    const node = place(nodes[Math.floor(i / 3)]);
    if (i % 3 === 0) return node;
    // Two soft satellites per atom give the sprite a nucleus-and-halo look.
    const jitter = 0.09 + rand() * 0.07;
    return [node[0] + (rand() - 0.5) * jitter, node[1] + (rand() - 0.5) * jitter, node[2] + (rand() - 0.5) * jitter];
  }, seed + 1);

  return {
    atoms: atomCloud,
    bonds: lines(bonds.map(([a, b, intensity]) => [place(a), place(b), intensity])),
  };
}

/**
 * The vial plinth: glowing containers standing on the dais.
 *
 * Each vial is a wireframe cylinder with a cap band and a fill line, arranged
 * on an arc — the arrangement the reference card art uses.
 *
 * @param {number} [count] How many vials.
 * @param {object} [options] Options.
 * @param {number} [options.radius] Arc radius.
 * @returns {{ glass: object, contents: object }} Lines and points.
 */
export function buildVials(count = 4, { radius = 2.1 } = {}) {
  const segments = [];
  const fills = [];
  const height = 1.5;
  const bodyRadius = 0.3;

  for (let v = 0; v < count; v += 1) {
    const spread = Math.min(Math.PI * 0.9, count * 0.28);
    const angle = count === 1 ? 0 : -spread / 2 + (v / (count - 1)) * spread;
    const cx = Math.sin(angle) * radius;
    const cz = Math.cos(angle) * radius * 0.42 - 0.6;
    const base = 0.34;

    const ring = (y, r, intensity) => {
      for (let i = 0; i < 16; i += 1) {
        const a = (i / 16) * Math.PI * 2;
        const b = ((i + 1) / 16) * Math.PI * 2;
        segments.push([
          [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r],
          [cx + Math.cos(b) * r, y, cz + Math.sin(b) * r],
          intensity,
        ]);
      }
    };

    ring(base, bodyRadius, 0.7);
    ring(base + height * 0.86, bodyRadius, 0.6);
    ring(base + height, bodyRadius * 0.72, 0.95);
    ring(base + height * 0.34, bodyRadius, 0.4);

    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      segments.push([
        [cx + Math.cos(a) * bodyRadius, base, cz + Math.sin(a) * bodyRadius],
        [cx + Math.cos(a) * bodyRadius, base + height * 0.86, cz + Math.sin(a) * bodyRadius],
        0.34,
      ]);
    }
    // Neck to cap.
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      segments.push([
        [cx + Math.cos(a) * bodyRadius, base + height * 0.86, cz + Math.sin(a) * bodyRadius],
        [cx + Math.cos(a) * bodyRadius * 0.72, base + height, cz + Math.sin(a) * bodyRadius * 0.72],
        0.55,
      ]);
    }

    fills.push({ cx, cz, base, height, bodyRadius, index: v });
  }

  const perVial = 130;
  const contents = points(count * perVial, (i, random) => {
    const vial = fills[Math.floor(i / perVial)] || fills[0];
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * vial.bodyRadius * 0.82;
    return [
      vial.cx + Math.cos(angle) * r,
      vial.base + 0.05 + random() * vial.height * 0.72,
      vial.cz + Math.sin(angle) * r,
    ];
  }, 909);

  return { glass: lines(segments), contents, plinths: fills };
}

/**
 * Ambient motes: the dust that makes a volume read as a volume.
 *
 * @param {number} [count] How many.
 * @param {object} [options] Options.
 * @returns {object} A point cloud.
 */
export function buildMotes(count = 900, { radius = 15, height = 9 } = {}) {
  return points(count, (i, random) => {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * radius;
    return [Math.cos(angle) * r, random() * height, Math.sin(angle) * r];
  }, 31337);
}

/**
 * Turn a laid-out knowledge graph into renderable geometry.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph A positioned graph.
 * @returns {{ nodes: object, edges: object, colors: Float32Array }} Points, lines and per-node colours.
 */
export function buildGraphGeometry(graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const positions = new Float32Array(graph.nodes.length * 3);
  const seeds = new Float32Array(graph.nodes.length * 2);
  const colors = new Float32Array(graph.nodes.length * 3);

  graph.nodes.forEach((node, index) => {
    positions[index * 3] = node.x;
    positions[index * 3 + 1] = node.y;
    positions[index * 3 + 2] = node.z;
    seeds[index * 2] = (index % 17) / 17;
    seeds[index * 2 + 1] = node.size || 1;
    const [r, g, b] = hexToRgb(node.accent || '#7fe6ff');
    colors[index * 3] = r;
    colors[index * 3 + 1] = g;
    colors[index * 3 + 2] = b;
  });

  const segments = [];
  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    segments.push([[from.x, from.y, from.z], [to.x, to.y, to.z], edge.weight * 0.5]);
  }

  return {
    nodes: { positions, seeds, count: graph.nodes.length },
    edges: lines(segments),
    colors,
  };
}

/**
 * Parse a hex colour into normalised RGB.
 *
 * @param {string} hex A `#rrggbb` string.
 * @returns {number[]} `[r, g, b]` in [0, 1].
 */
export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  const value = clean.length === 3
    ? clean.split('').map((char) => char + char).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const int = parseInt(value, 16) || 0;
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}
