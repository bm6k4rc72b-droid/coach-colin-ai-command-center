# Qubits & Clones — quantum computing and cloning lab

Two standalone educational labs in one Vite + TypeScript app.

- **Quantum lab** — a *correct* state-vector quantum-circuit simulator. Build circuits from real
  gates, watch superposition, entanglement and interference, run presets (Bell, GHZ, Grover,
  Deutsch–Jozsa, teleportation), see the Bloch sphere and measurement histograms, and explore
  decoherence across real hardware platforms.
- **Cloning lab** — a step-by-step walkthrough of somatic-cell nuclear transfer (SCNT), the
  technique behind Dolly. Real biology, a literature-anchored yield model showing why cloning is
  so inefficient, the milestones (Dolly, CC, Snuppy, the 2018 primates) and the ethics.

> **Educational and demonstration only.** The quantum simulator computes exact amplitudes. The
> cloning model uses simplified, rounded teaching numbers to explain the science and its limits —
> it is not a laboratory protocol. Human reproductive cloning is prohibited by law in most of the
> world; this lab exists to explain the biology, not to enable it. The start screen says the same.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # state vector, gates, entanglement, algorithms, decoherence, SCNT yields
npm run build
```

## Quantum lab — what's real

The simulator stores all 2ⁿ complex amplitudes and applies gates by iterating the state vector
(no shortcuts). Everything below is checked by unit tests:

| Concept | Where |
| --- | --- |
| Complex amplitudes, H/X/Y/Z/S/T, Rx/Ry/Rz rotations | `src/core/quantum.ts`, `complex.ts` |
| CNOT / CZ / SWAP, measurement + collapse | `quantum.ts` |
| Circuit grid, run, multi-shot sampling | `src/core/circuit.ts` |
| Bell, GHZ, Grover, Deutsch–Jozsa, teleportation | `src/core/algorithms.ts` |
| Bloch vector + purity (entanglement shows as a mixed single qubit) | `quantum.ts` |
| T1/T2 decoherence, platform coherence times | `src/core/decohere.ts` |

Grover finds the marked state of 4 with probability > 99% in one iteration; a Bell pair's single
qubits have purity exactly 0.5; H·H returns |0⟩ with certainty — interference, not randomness.

## Cloning lab — the biology

The SCNT walkthrough (`src/core/scnt-stages.ts`) covers oocyte collection and maturation, donor
cell culture and G0 arrest, enucleation, nuclear transfer, electrofusion and activation,
epigenetic reprogramming, culture to blastocyst, surrogate transfer, pregnancy and birth.

The yield model (`src/core/cloning.ts`) multiplies per-step survival to show overall efficiency —
typically a few percent, around 150+ reconstructed embryos per healthy birth, matching the
published reality (Dolly: 1 lamb from 277 embryos). Donor-cell arrest, activation method, HDAC
inhibitors, surrogate synchronisation and species all move the numbers. It always teaches that a
clone shares only nuclear DNA — mitochondria come from the egg, and coat colour, fingerprints and
personality differ.

A guided tour walks through both labs end to end.
