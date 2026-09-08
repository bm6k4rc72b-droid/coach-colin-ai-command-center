/**
 * The Peptide Knowledge Graph.
 *
 * Builds the node-and-edge structure connecting compounds to their mechanisms,
 * the body systems they act on, the studies behind them and the stacks they
 * appear in, then lays it out in three dimensions with a small force
 * simulation so the renderer can fly through it.
 *
 * Layout runs deterministically from a fixed seed, so the map is in the same
 * place on every visit. That matters more than it sounds: a knowledge map you
 * can learn the shape of becomes navigable, and a map that reshuffles on every
 * load never does.
 *
 * @module astra/graph
 */

import { PEPTIDES, STACKS, SYSTEMS } from './data/peptides.js';
import { tier } from './evidence.js';
import { rng } from './mathkit.js';

/** Node kinds and how they are drawn. */
export const NODE_KINDS = {
  peptide: { size: 1.5, accentFrom: 'entry' },
  stack: { size: 1.7, accentFrom: 'entry' },
  system: { size: 1.15, accent: '#7fe6ff' },
  mechanism: { size: 0.8, accent: '#c08bff' },
  study: { size: 0.66, accentFrom: 'tier' },
};

/**
 * Build the graph.
 *
 * @returns {{ nodes: Array<object>, edges: Array<object> }} The graph.
 */
export function buildGraph() {
  const nodes = [];
  const edges = [];
  const index = new Map();

  /**
   * Add a node once.
   *
   * @param {object} node The node.
   * @returns {object} The stored node.
   */
  const add = (node) => {
    if (index.has(node.id)) return index.get(node.id);
    index.set(node.id, node);
    nodes.push(node);
    return node;
  };

  for (const system of SYSTEMS) {
    add({
      id: `system:${system.id}`, kind: 'system', label: system.label, short: system.icon,
      accent: NODE_KINDS.system.accent, size: NODE_KINDS.system.size, ref: system.id,
    });
  }

  for (const peptide of PEPTIDES) {
    add({
      id: `peptide:${peptide.id}`, kind: 'peptide', label: peptide.name, short: peptide.name,
      accent: peptide.accent, size: NODE_KINDS.peptide.size, ref: peptide.id,
    });
    for (const system of peptide.systems) {
      edges.push({ from: `peptide:${peptide.id}`, to: `system:${system}`, kind: 'acts-on', weight: 1 });
    }
    for (const mechanism of peptide.mechanisms) {
      const id = `mechanism:${peptide.id}/${mechanism.id}`;
      add({
        id, kind: 'mechanism', label: mechanism.title, short: mechanism.title,
        accent: tier(mechanism.tier).accent, size: NODE_KINDS.mechanism.size,
        ref: `${peptide.id}/${mechanism.id}`, tier: mechanism.tier,
      });
      edges.push({ from: `peptide:${peptide.id}`, to: id, kind: 'proposed-mechanism', weight: 0.7 });
    }
    for (const study of peptide.studies) {
      const id = `study:${study.id}`;
      add({
        id, kind: 'study', label: `${study.journal}, ${study.year}`, short: String(study.year),
        accent: tier(study.tier).accent, size: NODE_KINDS.study.size, ref: study.id, tier: study.tier,
      });
      edges.push({ from: `peptide:${peptide.id}`, to: id, kind: 'evidence', weight: 0.55 });
    }
  }

  for (const stack of STACKS) {
    add({
      id: `stack:${stack.id}`, kind: 'stack', label: stack.name, short: stack.name,
      accent: stack.accent, size: NODE_KINDS.stack.size, ref: stack.id,
    });
    for (const member of stack.members) {
      edges.push({ from: `stack:${stack.id}`, to: `peptide:${member}`, kind: 'contains', weight: 0.9 });
    }
  }

  // Degree drives node size and label priority: a compound connected to more
  // of the graph is more central to the field and should read that way.
  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
  }
  for (const node of nodes) node.degree = degree.get(node.id) || 0;

  return { nodes, edges };
}

/**
 * Lay the graph out in 3D.
 *
 * A short force simulation: repulsion between every pair, springs along edges,
 * and a weak pull toward the origin so the cloud stays framed. Run to a fixed
 * iteration count rather than to convergence, because a deterministic layout
 * matters more here than an optimal one.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph The graph.
 * @param {object} [options] Tuning.
 * @param {number} [options.iterations] Simulation steps.
 * @param {number} [options.seed] RNG seed.
 * @param {number} [options.radius] Initial sphere radius.
 * @returns {{ nodes: Array<object>, edges: Array<object> }} The graph, with positions.
 */
export function layout(graph, { iterations = 220, seed = 20240915, radius = 12 } = {}) {
  const random = rng(seed);
  const { nodes, edges } = graph;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    // Seed on a sphere: kinds occupy shells, which gives the finished map a
    // readable structure before the forces even run.
    const shell = node.kind === 'system' ? 0.45 : node.kind === 'peptide' ? 0.7 : node.kind === 'stack' ? 0.55 : 1;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const r = radius * shell * (0.7 + random() * 0.4);
    node.x = r * Math.sin(phi) * Math.cos(theta);
    node.y = r * Math.cos(phi) * 0.6;
    node.z = r * Math.sin(phi) * Math.sin(theta);
    node.vx = 0; node.vy = 0; node.vz = 0;
  }

  const links = edges
    .map((edge) => ({ source: byId.get(edge.from), target: byId.get(edge.to), weight: edge.weight }))
    .filter((link) => link.source && link.target);

  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;

    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.01) {
          // Coincident nodes get a deterministic nudge rather than a random one.
          dx = (i - j) * 0.01 + 0.01; dy = 0.01; dz = 0.01;
          d2 = dx * dx + dy * dy + dz * dz;
        }
        const force = 5.2 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        const fz = (dz / d) * force;
        a.vx += fx; a.vy += fy; a.vz += fz;
        b.vx -= fx; b.vy -= fy; b.vz -= fz;
      }
    }

    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const dz = link.target.z - link.source.z;
      const d = Math.hypot(dx, dy, dz) || 0.001;
      const rest = 4.5;
      const force = (d - rest) * 0.045 * link.weight;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      const fz = (dz / d) * force;
      link.source.vx += fx; link.source.vy += fy; link.source.vz += fz;
      link.target.vx -= fx; link.target.vy -= fy; link.target.vz -= fz;
    }

    for (const node of nodes) {
      node.vx -= node.x * 0.006;
      node.vy -= node.y * 0.012;
      node.vz -= node.z * 0.006;
      const damping = 0.82 * cooling + 0.1;
      node.x += node.vx * damping;
      node.y += node.vy * damping;
      node.z += node.vz * damping;
      node.vx *= 0.6; node.vy *= 0.6; node.vz *= 0.6;
    }
  }

  // Normalise into a predictable box so the camera framing never has to guess.
  const extent = nodes.reduce((max, node) => Math.max(max, Math.abs(node.x), Math.abs(node.y), Math.abs(node.z)), 1);
  const scale = 14 / extent;
  for (const node of nodes) {
    node.x *= scale; node.y *= scale * 0.75; node.z *= scale;
    delete node.vx; delete node.vy; delete node.vz;
  }

  return { nodes, edges };
}

/**
 * Build and lay out the graph in one call.
 *
 * @param {object} [options] Layout options.
 * @returns {{ nodes: Array<object>, edges: Array<object>, byId: Map<string, object> }} The positioned graph.
 */
export function knowledgeGraph(options) {
  const graph = layout(buildGraph(), options);
  return { ...graph, byId: new Map(graph.nodes.map((node) => [node.id, node])) };
}

/**
 * Everything one hop from a node.
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph The graph.
 * @param {string} id Node id.
 * @returns {{ node: object|null, neighbours: Array<{ node: object, kind: string }> }} The neighbourhood.
 */
export function neighbourhood(graph, id) {
  const byId = graph.byId || new Map(graph.nodes.map((node) => [node.id, node]));
  const node = byId.get(id) || null;
  if (!node) return { node: null, neighbours: [] };
  const neighbours = [];
  for (const edge of graph.edges) {
    if (edge.from === id && byId.has(edge.to)) neighbours.push({ node: byId.get(edge.to), kind: edge.kind });
    else if (edge.to === id && byId.has(edge.from)) neighbours.push({ node: byId.get(edge.from), kind: edge.kind });
  }
  return { node, neighbours };
}

/**
 * The shortest path between two nodes, which is how the map answers
 * "what connects these two things?".
 *
 * @param {{ nodes: Array<object>, edges: Array<object> }} graph The graph.
 * @param {string} fromId Start node.
 * @param {string} toId End node.
 * @returns {Array<object>} Nodes along the path, empty if unreachable.
 */
export function path(graph, fromId, toId) {
  const byId = graph.byId || new Map(graph.nodes.map((node) => [node.id, node]));
  if (!byId.has(fromId) || !byId.has(toId)) return [];
  const adjacency = new Map();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
    adjacency.get(edge.to).push(edge.from);
  }
  const previous = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    if (current === toId) break;
    for (const next of adjacency.get(current) || []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(toId)) return [];
  const out = [];
  for (let cursor = toId; cursor !== null; cursor = previous.get(cursor)) out.unshift(byId.get(cursor));
  return out;
}
