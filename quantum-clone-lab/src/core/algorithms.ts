/**
 * Preset circuits that demonstrate real quantum phenomena and algorithms. Each returns a Circuit
 * for the circuit builder, plus a short explanation of what to look for. Pure and unit tested.
 */
import { emptyCircuit, place, type Circuit } from './circuit';
import type { Op } from './quantum';

export interface Preset {
  id: string;
  name: string;
  n: number;
  blurb: string;
  expect: string;
  build: () => Circuit;
}

/** Build a circuit from a flat list of (column, op) placements. */
function make(n: number, ops: [number, Op][]): Circuit {
  let circ = emptyCircuit(n);
  for (const [col, op] of ops) circ = place(circ, col, op);
  return circ;
}

/** Oracle that flips the phase of one marked basis state of 2 qubits, built from CZ and X. */
function markOracle2(target: number): [number, Op][] {
  // target bits: q0 = high bit. Put X on qubits that should be 0 so the CZ fires on `target`.
  const b0 = (target >> 1) & 1;
  const b1 = target & 1;
  const pre: [number, Op][] = [];
  if (!b0) pre.push([1, { gate: 'X', q: 0 }]);
  if (!b1) pre.push([1, { gate: 'X', q: 1 }]);
  const post: [number, Op][] = pre.map(([, op]) => [3, op]);
  return [...pre, [2, { gate: 'CZ', q: 1, control: 0 }], ...post];
}

export const PRESETS: Preset[] = [
  {
    id: 'bell',
    name: 'Bell pair (entanglement)',
    n: 2,
    blurb: 'H on qubit 0, then CNOT. The two qubits become entangled: neither has a definite value, yet they always agree.',
    expect: 'Only |00⟩ and |11⟩ appear, each 50%. Each single qubit is maximally mixed (purity 0.5) — the information lives in the pair, not the parts.',
    build: () => make(2, [[0, { gate: 'H', q: 0 }], [1, { gate: 'CNOT', q: 1, control: 0 }]]),
  },
  {
    id: 'ghz',
    name: 'GHZ state (3-way entanglement)',
    n: 3,
    blurb: 'Entangle three qubits so they are all-0 or all-1 together.',
    expect: 'Only |000⟩ and |111⟩, each 50%. Measuring any one instantly fixes the other two.',
    build: () => make(3, [[0, { gate: 'H', q: 0 }], [1, { gate: 'CNOT', q: 1, control: 0 }], [2, { gate: 'CNOT', q: 2, control: 1 }]]),
  },
  {
    id: 'interfere',
    name: 'Interference (H·H = identity)',
    n: 1,
    blurb: 'Two Hadamards in a row. The superposition from the first is undone by the second — the amplitudes interfere.',
    expect: 'Back to |0⟩ with certainty. Superposition is not just randomness: the paths cancel and reinforce.',
    build: () => make(1, [[0, { gate: 'H', q: 0 }], [1, { gate: 'H', q: 0 }]]),
  },
  {
    id: 'grover',
    name: "Grover search (find |11⟩)",
    n: 2,
    blurb: 'Search 4 items for the marked one in a single query. Oracle marks |11⟩, then a diffusion step amplifies it.',
    expect: 'Almost all the probability lands on |11⟩ after one iteration — the quadratic speedup, at its smallest scale.',
    build: () =>
      make(2, [
        [0, { gate: 'H', q: 0 }],
        [0, { gate: 'H', q: 1 }],
        // oracle: CZ marks |11⟩
        [1, { gate: 'CZ', q: 1, control: 0 }],
        // diffusion
        [2, { gate: 'H', q: 0 }],
        [2, { gate: 'H', q: 1 }],
        [3, { gate: 'X', q: 0 }],
        [3, { gate: 'X', q: 1 }],
        [4, { gate: 'CZ', q: 1, control: 0 }],
        [5, { gate: 'X', q: 0 }],
        [5, { gate: 'X', q: 1 }],
        [6, { gate: 'H', q: 0 }],
        [6, { gate: 'H', q: 1 }],
      ]),
  },
  {
    id: 'dj',
    name: 'Deutsch–Jozsa (constant vs balanced)',
    n: 2,
    blurb: 'One query decides whether a hidden function is constant or balanced. Here the oracle is balanced (a CNOT).',
    expect: 'The top qubit reads 1 — balanced. A classical test could need two queries; the quantum test needs one.',
    build: () =>
      make(2, [
        [0, { gate: 'X', q: 1 }],
        [1, { gate: 'H', q: 0 }],
        [1, { gate: 'H', q: 1 }],
        [2, { gate: 'CNOT', q: 1, control: 0 }],
        [3, { gate: 'H', q: 0 }],
      ]),
  },
  {
    id: 'teleport',
    name: 'Teleportation (circuit)',
    n: 3,
    blurb: 'Prepare a state on qubit 0, share a Bell pair (1,2), then entangle and measure. Qubit 2 ends up carrying qubit 0’s state.',
    expect: 'A Bell measurement on qubits 0–1 plus corrections leaves the unknown state on qubit 2 — no information travelled faster than light.',
    build: () =>
      make(3, [
        [0, { gate: 'RY', q: 0, angle: Math.PI / 3 }],
        [1, { gate: 'H', q: 1 }],
        [2, { gate: 'CNOT', q: 2, control: 1 }],
        [3, { gate: 'CNOT', q: 1, control: 0 }],
        [4, { gate: 'H', q: 0 }],
        [5, { gate: 'CNOT', q: 2, control: 1 }],
        [6, { gate: 'CZ', q: 2, control: 0 }],
      ]),
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);
export { markOracle2 };
