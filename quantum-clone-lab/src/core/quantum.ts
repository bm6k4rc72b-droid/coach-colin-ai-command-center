/**
 * A correct n-qubit state-vector simulator. Amplitudes are stored for all 2^n basis states;
 * gates are applied by iterating over the state vector (no dense 2^n × 2^n matrices).
 * Qubit 0 is the most significant bit of the basis index, so |q0 q1 … q(n-1)⟩.
 * Pure and unit tested.
 */
import { abs2, add, c, expi, mul, phase, scale, sub, type C } from './complex';

export type Amp = C;

export class State {
  amps: Amp[];
  constructor(public n: number) {
    this.amps = Array.from({ length: 1 << n }, (_, i) => (i === 0 ? c(1, 0) : c(0, 0)));
  }

  clone(): State {
    const s = new State(this.n);
    s.amps = this.amps.map((a) => ({ ...a }));
    return s;
  }

  /** Apply a single-qubit 2×2 gate [[a,b],[c,d]] to qubit q. */
  apply1(q: number, m: [C, C, C, C]): void {
    const shift = this.n - 1 - q;
    const step = 1 << shift;
    for (let i = 0; i < this.amps.length; i++) {
      if ((i & step) === 0) {
        const j = i | step;
        const x = this.amps[i];
        const y = this.amps[j];
        this.amps[i] = add(mul(m[0], x), mul(m[1], y));
        this.amps[j] = add(mul(m[2], x), mul(m[3], y));
      }
    }
  }

  /** Apply a single-qubit gate to `target` only when `control` is 1. */
  applyControlled(control: number, target: number, m: [C, C, C, C]): void {
    const cShift = 1 << (this.n - 1 - control);
    const tShift = 1 << (this.n - 1 - target);
    for (let i = 0; i < this.amps.length; i++) {
      if ((i & cShift) !== 0 && (i & tShift) === 0) {
        const j = i | tShift;
        const x = this.amps[i];
        const y = this.amps[j];
        this.amps[i] = add(mul(m[0], x), mul(m[1], y));
        this.amps[j] = add(mul(m[2], x), mul(m[3], y));
      }
    }
  }

  /** Swap two qubits. */
  swap(a: number, b: number): void {
    if (a === b) return;
    const sa = 1 << (this.n - 1 - a);
    const sb = 1 << (this.n - 1 - b);
    const next = this.amps.map((x) => ({ ...x }));
    for (let i = 0; i < this.amps.length; i++) {
      const bitA = (i & sa) !== 0;
      const bitB = (i & sb) !== 0;
      if (bitA !== bitB) {
        const j = (i ^ sa) ^ sb;
        next[j] = this.amps[i];
      }
    }
    this.amps = next;
  }

  /** Probability that qubit q reads 1. */
  prob1(q: number): number {
    const shift = 1 << (this.n - 1 - q);
    let p = 0;
    for (let i = 0; i < this.amps.length; i++) if (i & shift) p += abs2(this.amps[i]);
    return p;
  }

  /** Probability of each basis state 0..2^n-1. */
  probabilities(): number[] {
    return this.amps.map(abs2);
  }

  /** Collapse qubit q to the given outcome and renormalise. */
  collapse(q: number, outcome: 0 | 1): void {
    const shift = 1 << (this.n - 1 - q);
    let norm = 0;
    for (let i = 0; i < this.amps.length; i++) {
      const bit = (i & shift) !== 0 ? 1 : 0;
      if (bit !== outcome) this.amps[i] = c(0, 0);
      else norm += abs2(this.amps[i]);
    }
    const s = norm > 0 ? 1 / Math.sqrt(norm) : 0;
    for (let i = 0; i < this.amps.length; i++) this.amps[i] = scale(this.amps[i], s);
  }

  /** Measure qubit q, using the supplied uniform random in [0,1). Returns the outcome. */
  measure(q: number, r: number): 0 | 1 {
    const outcome: 0 | 1 = r < this.prob1(q) ? 1 : 0;
    this.collapse(q, outcome);
    return outcome;
  }

  /** Measure all qubits; returns the basis index observed. */
  measureAll(r: number): number {
    const probs = this.probabilities();
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r < acc) {
        this.amps = this.amps.map((_, k) => (k === i ? c(1, 0) : c(0, 0)));
        return i;
      }
    }
    return probs.length - 1;
  }

  /** Total probability (should stay ≈ 1). */
  norm(): number {
    return this.amps.reduce((s, a) => s + abs2(a), 0);
  }

  label(i: number): string {
    return i.toString(2).padStart(this.n, '0');
  }
}

// ---------------------------------------------------------------- gates ----
const R2 = 1 / Math.SQRT2;
export const GATES = {
  H: [c(R2), c(R2), c(R2), c(-R2)] as [C, C, C, C],
  X: [c(0), c(1), c(1), c(0)] as [C, C, C, C],
  Y: [c(0), c(0, -1), c(0, 1), c(0)] as [C, C, C, C],
  Z: [c(1), c(0), c(0), c(-1)] as [C, C, C, C],
  S: [c(1), c(0), c(0), c(0, 1)] as [C, C, C, C],
  T: [c(1), c(0), c(0), expi(Math.PI / 4)] as [C, C, C, C],
};

export type GateName = keyof typeof GATES | 'CNOT' | 'CZ' | 'SWAP' | 'RX' | 'RY' | 'RZ' | 'MEASURE';

/** Rotation gates about each axis by angle θ. */
export const RX = (t: number): [C, C, C, C] => [c(Math.cos(t / 2)), c(0, -Math.sin(t / 2)), c(0, -Math.sin(t / 2)), c(Math.cos(t / 2))];
export const RY = (t: number): [C, C, C, C] => [c(Math.cos(t / 2)), c(-Math.sin(t / 2)), c(Math.sin(t / 2)), c(Math.cos(t / 2))];
export const RZ = (t: number): [C, C, C, C] => [expi(-t / 2), c(0), c(0), expi(t / 2)];

export interface Op {
  gate: GateName;
  q: number;
  control?: number;
  angle?: number;
}

/** Apply one operation (no measurement — those are handled by the caller). */
export function applyOp(s: State, op: Op): void {
  switch (op.gate) {
    case 'CNOT':
      s.applyControlled(op.control!, op.q, GATES.X);
      break;
    case 'CZ':
      s.applyControlled(op.control!, op.q, GATES.Z);
      break;
    case 'SWAP':
      s.swap(op.control!, op.q);
      break;
    case 'RX':
      s.apply1(op.q, RX(op.angle ?? 0));
      break;
    case 'RY':
      s.apply1(op.q, RY(op.angle ?? 0));
      break;
    case 'RZ':
      s.apply1(op.q, RZ(op.angle ?? 0));
      break;
    case 'MEASURE':
      break;
    default:
      s.apply1(op.q, GATES[op.gate]);
  }
}

/** Bloch-sphere coordinates (x,y,z) for a single qubit's reduced state (via the density matrix). */
export function blochVector(s: State, q: number): [number, number, number] {
  const shift = 1 << (s.n - 1 - q);
  // Reduced density matrix elements for qubit q, tracing out the rest.
  let r00 = 0;
  let r11 = 0;
  let r01 = c(0, 0);
  for (let i = 0; i < s.amps.length; i++) {
    if ((i & shift) === 0) {
      const j = i | shift;
      r00 += abs2(s.amps[i]);
      r11 += abs2(s.amps[j]);
      // ρ01 = Σ a_i conj(a_j)
      r01 = add(r01, mul(s.amps[i], { re: s.amps[j].re, im: -s.amps[j].im }));
    }
  }
  return [2 * r01.re, -2 * r01.im, r00 - r11];
}

/** Purity of a single qubit (1 = pure, 0.5 = maximally mixed → entangled or decohered). */
export function purity(s: State, q: number): number {
  const [x, y, z] = blochVector(s, q);
  return 0.5 * (1 + x * x + y * y + z * z);
}

export { phase, sub };
