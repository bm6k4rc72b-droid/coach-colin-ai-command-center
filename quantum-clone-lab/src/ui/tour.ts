/** Guided tour across both labs. Pure data + an actions interface the app implements. */
import type { Choices } from '../core/cloning';

export interface TourActions {
  setTab(t: 'quantum' | 'clone'): void;
  loadPreset(id: string): void;
  setPlatform(id: string): void;
  setChoices(c: Partial<Choices>): void;
  gotoStage(i: number): void;
  highlight(sel: string | null): void;
}

export interface TourStep {
  title: string;
  text: string;
  seconds: number;
  enter: (a: TourActions) => void;
}

export function buildTour(): TourStep[] {
  return [
    {
      title: 'One bit vs one qubit',
      text: 'A classical bit is 0 or 1. A qubit can be in a superposition of both at once. The Bloch sphere on the right shows a single qubit; |0⟩ is the north pole. We start with a simple example.',
      seconds: 9,
      enter: (a) => { a.setTab('quantum'); a.loadPreset('interfere'); a.highlight('#q-bloch'); },
    },
    {
      title: 'Superposition is not randomness',
      text: 'Two Hadamards in a row return the qubit to |0⟩ with certainty. The in-between superposition has amplitudes that interfere — paths cancel and reinforce, which a coin flip can never do.',
      seconds: 10,
      enter: (a) => { a.loadPreset('interfere'); a.highlight('#q-probs'); },
    },
    {
      title: 'Entanglement — the Bell pair',
      text: 'H then CNOT ties two qubits together. Only |00⟩ and |11⟩ appear. Neither qubit has a value of its own (each Bloch vector collapses to the centre), yet they always agree. Einstein called it "spooky".',
      seconds: 11,
      enter: (a) => { a.loadPreset('bell'); a.highlight('#q-bloch'); },
    },
    {
      title: 'Measurement and sampling',
      text: 'A real quantum computer returns one bit-string per run. Run many "shots" and the histogram builds up the probabilities. The Bell pair is always 00 or 11, never 01 or 10.',
      seconds: 10,
      enter: (a) => { a.loadPreset('bell'); a.highlight('#q-right'); },
    },
    {
      title: 'A quantum speedup — Grover',
      text: "Grover's search finds the marked item among four in a single oracle query. The oracle marks |11⟩, then a diffusion step amplifies it. The bar for |11⟩ shoots up — a quadratic speedup at its smallest scale.",
      seconds: 11,
      enter: (a) => { a.loadPreset('grover'); a.highlight('#q-probs'); },
    },
    {
      title: 'Why it is so hard — decoherence',
      text: 'Qubits leak their state into the environment. Superconducting chips are fast but lose coherence in ~100 µs; trapped ions last seconds. This is why quantum computers need extreme cold, isolation, and error correction.',
      seconds: 11,
      enter: (a) => { a.setPlatform('super'); a.highlight('#decoh'); },
    },
    {
      title: 'Now the other impossible thing — cloning',
      text: "Switching labs. Cloning a mammal uses somatic-cell nuclear transfer: put the nucleus of a body cell into an egg whose own chromosomes have been removed. It is real, it is legal for animals, and it is astonishingly inefficient.",
      seconds: 11,
      enter: (a) => { a.setChoices({ species: 'sheep', arrest: 'g0', hdac: false }); a.gotoStage(0); a.highlight('#c-scene'); },
    },
    {
      title: 'The egg and the donor cell',
      text: 'The egg supplies the cytoplasm that reprograms the nucleus — and all the clone\'s mitochondria. The donor body cell supplies the nuclear DNA. Serum-starving the donor cell into a quiet state was the trick that made Dolly possible.',
      seconds: 11,
      enter: (a) => { a.gotoStage(1); a.highlight('#c-left'); },
    },
    {
      title: 'Enucleate, insert, fuse',
      text: 'A micropipette removes the egg\'s chromosomes, the donor cell is tucked in beside it, and an electric pulse fuses them and kick-starts division. Then the hard part: the egg must rewrite the adult cell\'s epigenetic marks.',
      seconds: 11,
      enter: (a) => { a.gotoStage(4); a.highlight('#c-scene'); },
    },
    {
      title: 'The funnel: why 277 embryos made 1 Dolly',
      text: 'Each step loses most of what came before. Most reconstructed embryos never reach blastocyst; most transferred blastocysts never implant; many pregnancies fail. Overall efficiency is a few percent at best.',
      seconds: 12,
      enter: (a) => { a.setChoices({ species: 'sheep' }); a.gotoStage(5); a.highlight('#c-funnel'); },
    },
    {
      title: 'A clone is not a copy',
      text: 'The newborn shares only nuclear DNA with its donor. It carries the egg donor\'s mitochondria, develops its own coat pattern and fingerprints, and must grow up from a baby. Change the species and options on the left and watch the odds move.',
      seconds: 12,
      enter: (a) => { a.gotoStage(7); a.highlight('#c-right'); },
    },
    {
      title: 'The ethics and the alternative',
      text: 'Human reproductive cloning is banned almost everywhere. Therapeutic cloning makes only early embryos for stem cells, and induced pluripotent stem cells now reprogram cells without eggs or embryos at all. Explore both labs freely.',
      seconds: 12,
      enter: (a) => { a.setTab('clone'); a.highlight('#c-right'); },
    },
  ];
}
