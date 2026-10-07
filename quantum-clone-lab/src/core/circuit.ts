/**
 * A quantum circuit as a grid: columns of operations applied left to right. Running a circuit
 * returns the final state and the probability of each basis outcome. Pure and unit tested.
 */
import { rng } from './rng';
import { applyOp, blochVector, purity, State, type GateName, type Op } from './quantum';

export interface Circuit {
  n: number;
  /** Columns; each column holds at most one op per qubit, applied together. */
  cols: Op[][];
}

export const emptyCircuit = (n: number): Circuit => ({ n, cols: [] });

/** The qubits an op occupies (target plus control). */
export const opQubits = (op: Op): number[] => (op.control !== undefined ? [op.q, op.control] : [op.q]);

/** Can this op be placed in column `col` without clashing with an existing op's qubits? */
export function canPlace(circ: Circuit, col: number, op: Op): boolean {
  const used = new Set((circ.cols[col] ?? []).flatMap(opQubits));
  return opQubits(op).every((q) => !used.has(q));
}

export function place(circ: Circuit, col: number, op: Op): Circuit {
  const cols = circ.cols.map((c) => [...c]);
  while (cols.length <= col) cols.push([]);
  cols[col] = [...cols[col].filter((o) => !opQubits(o).some((q) => opQubits(op).includes(q))), op];
  return { ...circ, cols };
}

export function removeAt(circ: Circuit, col: number, q: number): Circuit {
  const cols = circ.cols.map((c) => c.filter((o) => !opQubits(o).includes(q)));
  while (cols.length && cols[cols.length - 1].length === 0) cols.pop();
  void col;
  return { ...circ, cols };
}

export interface RunResult {
  state: State;
  probabilities: number[];
  /** Deterministic measurement outcomes recorded where MEASURE ops sit. */
  measured: Record<number, 0 | 1>;
  bloch: [number, number, number][];
  purity: number[];
}

/** Run a circuit from |0…0⟩. Measurements collapse the state using the given seed. */
export function run(circ: Circuit, seed = 1): RunResult {
  const s = new State(circ.n);
  const r = rng(seed);
  const measured: Record<number, 0 | 1> = {};
  for (const col of circ.cols) {
    for (const op of col) {
      if (op.gate === 'MEASURE') measured[op.q] = s.measure(op.q, r());
      else applyOp(s, op);
    }
  }
  return {
    state: s,
    probabilities: s.probabilities(),
    measured,
    bloch: Array.from({ length: circ.n }, (_, q) => blochVector(s, q)),
    purity: Array.from({ length: circ.n }, (_, q) => purity(s, q)),
  };
}

/** Sample the full-register measurement distribution `shots` times. */
export function sample(circ: Circuit, shots: number, seed = 1): Record<string, number> {
  const r = rng(seed);
  const counts: Record<string, number> = {};
  for (let k = 0; k < shots; k++) {
    const res = run(circ, (r() * 1e9) | 0);
    const i = res.state.measureAll(r());
    const key = res.state.label(i);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export interface GateDef {
  name: GateName;
  label: string;
  kind: '1' | 'control' | 'measure' | 'param';
  blurb: string;
}

export const PALETTE: GateDef[] = [
  { name: 'H', label: 'H', kind: '1', blurb: 'Hadamard: puts a qubit into an equal superposition of 0 and 1. The gateway to quantum parallelism.' },
  { name: 'X', label: 'X', kind: '1', blurb: 'Pauli-X (NOT): flips 0 ↔ 1. A half-turn about the x-axis of the Bloch sphere.' },
  { name: 'Y', label: 'Y', kind: '1', blurb: 'Pauli-Y: a bit-and-phase flip; a half-turn about the y-axis.' },
  { name: 'Z', label: 'Z', kind: '1', blurb: 'Pauli-Z: flips the phase of |1⟩, leaving |0⟩ alone.' },
  { name: 'S', label: 'S', kind: '1', blurb: 'Phase gate: a quarter-turn phase (adds i to |1⟩). S² = Z.' },
  { name: 'T', label: 'T', kind: '1', blurb: 'T gate: an eighth-turn phase (π/4). With H it makes a universal gate set.' },
  { name: 'RX', label: 'Rx', kind: 'param', blurb: 'Rotation about x by an angle you choose. Continuous control of a qubit.' },
  { name: 'RY', label: 'Ry', kind: 'param', blurb: 'Rotation about y: tilts between 0 and 1 by any angle (real amplitudes).' },
  { name: 'RZ', label: 'Rz', kind: 'param', blurb: 'Rotation about z: adds an adjustable phase.' },
  { name: 'CNOT', label: '⊕', kind: 'control', blurb: 'Controlled-NOT: flips the target only if the control is 1. The entangler.' },
  { name: 'CZ', label: 'CZ', kind: 'control', blurb: 'Controlled-Z: flips the phase when both qubits are 1.' },
  { name: 'SWAP', label: '⤬', kind: 'control', blurb: 'Swaps the states of two qubits.' },
  { name: 'MEASURE', label: 'M', kind: 'measure', blurb: 'Measurement: collapses the qubit to 0 or 1 with probability set by its amplitudes.' },
];
