/** Every labelled part of the tokamak, with what it does and the key numbers (ITER-scale). Pure. */
export type PartId = 'plasma' | 'tf' | 'cs' | 'pf' | 'vessel' | 'blanket' | 'divertor' | 'heating' | 'cryostat';

export interface Part {
  id: PartId;
  name: string;
  color: string;
  short: string;
  body: string;
  facts: [string, string][];
}

export const PARTS: Record<PartId, Part> = {
  plasma: {
    id: 'plasma',
    name: 'Toroidal plasma ring',
    color: '#ff3df0',
    short: 'A doughnut of fuel hotter than the Sun\'s core, held by magnetism alone.',
    body: 'Deuterium and tritium are heated until their electrons are stripped away, leaving a plasma of bare nuclei. At ~150 million °C the nuclei move fast enough to overcome their electric repulsion and fuse. Nothing material can touch it, so magnetic fields hold it in a ring that never meets the wall.',
    facts: [
      ['Temperature', 'up to ~150 million °C'],
      ['Density', '~10²⁰ particles/m³ (a millionth of air)'],
      ['Volume', '~830 m³ (ITER)'],
      ['Mass of fuel', 'about 0.5 g at any moment'],
    ],
  },
  tf: {
    id: 'tf',
    name: 'Superconducting toroidal field coils',
    color: '#8b5cf6',
    short: 'Giant D-shaped magnets that make the field running the long way round the ring.',
    body: 'Eighteen D-shaped coils of niobium-tin superconductor, cooled to −269 °C with liquid helium, create the main toroidal magnetic field. Charged particles spiral tightly around field lines, so a field that loops around the doughnut keeps them from flying into the walls.',
    facts: [
      ['Field on the plasma axis', '5.3 tesla (~100,000× Earth\'s)'],
      ['Peak field on the coil', '11.8 T'],
      ['Each coil weighs', '~310 tonnes'],
      ['Stored energy', '41 GJ'],
    ],
  },
  cs: {
    id: 'cs',
    name: 'Central solenoid',
    color: '#22d3ee',
    short: 'The transformer at the heart of the machine: it drives a huge current through the plasma.',
    body: 'A stack of six superconducting modules in the hole of the doughnut. Ramping its current induces up to 15 million amps in the plasma — the plasma is the secondary winding of a transformer. That current heats the plasma and, crucially, twists the field lines into helices so particles drifting up and down cancel out.',
    facts: [
      ['Plasma current driven', '15 MA'],
      ['Height', '18 m'],
      ['Peak field', '13 T'],
      ['Weight', '~1,000 tonnes'],
    ],
  },
  pf: {
    id: 'pf',
    name: 'Poloidal field coils',
    color: '#38bdf8',
    short: 'Horizontal rings that shape the plasma and hold it in position.',
    body: 'Six ring coils outside the toroidal coils fine-tune the field. They squeeze the plasma into its D-shaped, elongated cross-section, keep it centred, and steer its edge onto the divertor. Feedback control adjusts them thousands of times a second, because an elongated plasma is vertically unstable.',
    facts: [
      ['Number of coils', '6'],
      ['Largest diameter', '~24 m'],
      ['Control loop', 'kHz feedback'],
    ],
  },
  vessel: {
    id: 'vessel',
    name: 'Vacuum vessel',
    color: '#94a3b8',
    short: 'A sealed, double-walled steel chamber holding the plasma in an ultra-high vacuum.',
    body: 'The plasma lives inside a hermetic double-walled stainless-steel torus pumped down to a millionth of atmospheric pressure, so stray gas does not cool it. Water flows between the walls to shield the magnets from neutrons and carry away heat. It is the first safety barrier.',
    facts: [
      ['Weight', '~5,200 tonnes (with ports)'],
      ['Internal vacuum', '~10⁻⁶ of an atmosphere'],
      ['Wall', 'double stainless steel with water'],
    ],
  },
  blanket: {
    id: 'blanket',
    name: 'Blanket',
    color: '#34d399',
    short: 'The inner wall that catches neutrons — and in a power plant, breeds new tritium.',
    body: 'Neutrons carry 80% of the fusion energy and are not held by the magnets. The blanket modules stop them, turning their energy into heat for a steam turbine. In future power plants the blanket contains lithium: a neutron striking lithium-6 makes new tritium, so the reactor breeds its own fuel.',
    facts: [
      ['Modules (ITER)', '440, beryllium-faced'],
      ['Breeding reaction', 'n + ⁶Li → T + ⁴He + 4.8 MeV'],
      ['Tritium breeding ratio needed', '> 1.05'],
    ],
  },
  divertor: {
    id: 'divertor',
    name: 'Divertor',
    color: '#fb923c',
    short: 'The exhaust pipe: it takes the heat and helium ash out of the plasma.',
    body: 'Magnetic field lines at the plasma edge are bent down onto tungsten targets at the bottom of the vessel. Escaping heat and helium "ash" from fusion hit them there instead of the main wall. The heat flux — about 10 MW per square metre — is like the surface of the Sun, making the divertor one of the hardest engineering problems.',
    facts: [
      ['Heat flux', '~10–20 MW/m²'],
      ['Armour', 'tungsten'],
      ['Cassettes (ITER)', '54, remotely replaceable'],
    ],
  },
  heating: {
    id: 'heating',
    name: 'Heating systems',
    color: '#facc15',
    short: 'Particle beams and radio waves that heat the plasma to fusion temperature.',
    body: 'Current heating alone cannot reach 150 million °C. Neutral beam injectors fire beams of fast neutral deuterium atoms that slip across the magnetic field and give up their energy. Radio-frequency antennas heat the ions and electrons at their natural spiral (cyclotron) frequencies, like a microwave oven tuned to the plasma.',
    facts: [
      ['Neutral beams', '2 × 16.5 MW at 1 MeV'],
      ['Ion-cyclotron waves', '20 MW, 40–55 MHz'],
      ['Electron-cyclotron waves', '20 MW at 170 GHz'],
    ],
  },
  cryostat: {
    id: 'cryostat',
    name: 'Cryostat',
    color: '#64748b',
    short: 'A giant vacuum flask around everything, keeping the magnets at −269 °C.',
    body: 'The superconducting magnets must stay a few degrees above absolute zero while a 150-million-degree plasma burns metres away. The cryostat is a huge vacuum chamber that insulates them — the coldest and hottest places in the solar system, side by side.',
    facts: [
      ['Size', '~30 m wide × 30 m tall'],
      ['Magnet temperature', '4 K (−269 °C)'],
    ],
  },
};

export const PART_ORDER: PartId[] = ['plasma', 'tf', 'cs', 'pf', 'vessel', 'blanket', 'divertor', 'heating', 'cryostat'];

export const MILESTONES: [string, string][] = [
  ['1958', 'Tokamak concept developed in the USSR (Tamm & Sakharov).'],
  ['1997', 'JET (UK) produces 16 MW of fusion power (Q ≈ 0.67).'],
  ['2021', 'NIF (USA, laser fusion) reaches a burning plasma.'],
  ['Dec 2022', 'NIF achieves ignition: 3.15 MJ out from 2.05 MJ of laser light.'],
  ['2023', 'JET sets an energy record: 69 MJ in 5 seconds.'],
  ['2030s', 'ITER (France) plans D–T operation aiming for 500 MW at Q = 10.'],
];
