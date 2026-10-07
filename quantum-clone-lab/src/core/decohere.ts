/**
 * Single-qubit decoherence on the Bloch sphere: the two ways a qubit loses its quantum state.
 * T1 (amplitude damping / relaxation) pulls it toward |0⟩ (the z-axis shrinks toward +1).
 * T2 (dephasing) shrinks the x,y components, destroying superposition/phase information.
 * Physically T2 ≤ 2·T1. Times in microseconds. Pure and unit tested.
 */
export interface Bloch {
  x: number;
  y: number;
  z: number;
}

/** Evolve a Bloch vector for time t (µs) with relaxation T1 and dephasing T2. */
export function decohere(b: Bloch, t: number, T1: number, T2: number): Bloch {
  const eT1 = Math.exp(-t / T1);
  const eT2 = Math.exp(-t / T2);
  return { x: b.x * eT2, y: b.y * eT2, z: 1 + (b.z - 1) * eT1 };
}

export const blochLength = (b: Bloch) => Math.hypot(b.x, b.y, b.z);

/** Fidelity of the decohered state with the original pure state (teaching approximation). */
export function fidelity(b0: Bloch, b: Bloch): number {
  return 0.5 * (1 + b0.x * b.x + b0.y * b.y + b0.z * b.z);
}

/** Real device coherence times (µs), rounded teaching values circa the mid-2020s. */
export const PLATFORMS = [
  { id: 'super', name: 'Superconducting (transmon)', T1: 150, T2: 120, gate: 0.03, note: 'Fast gates (tens of ns) but short coherence; needs millikelvin dilution fridges. Google, IBM, Rigetti.' },
  { id: 'ion', name: 'Trapped ion', T1: 1e7, T2: 2e6, gate: 10, note: 'Extremely long coherence and high fidelity, but slower gates. IonQ, Quantinuum.' },
  { id: 'photon', name: 'Photonic', T1: Infinity, T2: 200, gate: 1, note: 'Photons barely decohere and run at room temperature, but two-qubit gates are probabilistic. PsiQuantum, Xanadu.' },
  { id: 'neutral', name: 'Neutral atom', T1: 4e6, T2: 1500, gate: 1, note: 'Atoms held by optical tweezers; reconfigurable and scalable. QuEra, Pasqal.' },
];

/** How many error-free gates you can run before coherence is mostly lost (t = T2). */
export const gatesBeforeDecoherence = (T2: number, gateTimeNs: number) => (gateTimeNs > 0 ? (T2 * 1000) / gateTimeNs : Infinity);
