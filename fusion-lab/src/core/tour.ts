/** Narrated guided tour of the tokamak. Pure: drives the app through an actions interface. */
import type { PartId } from './parts';

export interface TourActions {
  select(p: PartId | null): void;
  preset(id: string): void;
  explode(on: boolean): void;
  highlight(sel: string | null): void;
}

export interface TourStep {
  title: string;
  text: string;
  seconds: number;
  enter: (a: TourActions) => void;
}

export const TOUR: TourStep[] = [
  {
    title: 'A star in a magnetic bottle',
    text: 'This is a tokamak, the leading design for a fusion power plant, at the scale of ITER (being built in France). The front quarter is cut away so you can see inside. Drag to orbit, scroll to zoom, click any part.',
    seconds: 10,
    enter: (a) => {
      a.preset('iter');
      a.explode(false);
      a.select(null);
      a.highlight(null);
    },
  },
  {
    title: 'The plasma — hotter than the Sun',
    text: 'The glowing ring is plasma: deuterium and tritium heated to ~150 million °C, ten times hotter than the Sun\'s core. The Sun uses crushing gravity; we have to use extra heat instead. Each dot is a particle spiralling along a magnetic field line.',
    seconds: 12,
    enter: (a) => a.select('plasma'),
  },
  {
    title: 'The reaction',
    text: 'When a deuterium and a tritium nucleus collide hard enough, they fuse into helium and a neutron. A tiny amount of mass vanishes and becomes 17.6 MeV of energy — E = mc². Gram for gram that is about 4 million times more than burning oil.',
    seconds: 12,
    enter: (a) => a.highlight('#reaction-card'),
  },
  {
    title: 'Superconducting toroidal field coils',
    text: 'Eighteen purple D-shaped magnets, cooled to −269 °C, make a 5.3-tesla field that runs the long way round the ring. Charged particles cannot cross field lines — they spiral along them — so the plasma never touches the wall.',
    seconds: 11,
    enter: (a) => {
      a.highlight(null);
      a.select('tf');
    },
  },
  {
    title: 'Central solenoid — a giant transformer',
    text: 'The cyan stack in the middle drives 15 million amps through the plasma itself. That current twists the field into helices (watch the flowing lines). Without the twist, particles would drift up or down and escape.',
    seconds: 11,
    enter: (a) => a.select('cs'),
  },
  {
    title: 'Poloidal field coils',
    text: 'The horizontal blue rings shape the plasma into its D-shaped cross-section and hold it in place, with feedback adjusting them thousands of times a second.',
    seconds: 9,
    enter: (a) => a.select('pf'),
  },
  {
    title: 'Vacuum vessel and blanket',
    text: 'The steel vessel holds an ultra-high vacuum. The green blanket inside catches the neutrons (the white sparks) and turns their energy into heat. In a power plant, neutrons hitting lithium breed new tritium (the green flashes), so the machine makes its own fuel.',
    seconds: 13,
    enter: (a) => a.select('blanket'),
  },
  {
    title: 'Divertor — the exhaust',
    text: 'At the bottom, field lines are steered onto tungsten targets. Heat and helium "ash" land there at ~10 MW per square metre — like the surface of the Sun. The glowing orange strips are the strike points.',
    seconds: 11,
    enter: (a) => a.select('divertor'),
  },
  {
    title: 'Heating systems',
    text: 'A neutral-beam injector fires a 1 MeV beam of fast atoms (the gold beam) into the plasma, and antennas pump in radio waves at the particles\' spiral frequency. Together they take the plasma from cold gas to 150 million degrees.',
    seconds: 11,
    enter: (a) => a.select('heating'),
  },
  {
    title: 'Cold: nothing happens',
    text: 'At half a million degrees the nuclei are far too slow to beat their electric repulsion. The plasma glows dull orange and the fusion rate is essentially zero. Watch the reactivity chart: the yellow dot sits at the bottom.',
    seconds: 10,
    enter: (a) => {
      a.select(null);
      a.preset('cold');
      a.highlight('#chart-card');
    },
  },
  {
    title: 'JET, 1997: fusion, but not yet a gain',
    text: 'Heat to ~160 million °C and fusion takes off: JET made 16 MW. But it needed more heating power than it produced (Q < 1). The plasma escaped too fast — the energy confinement time was too short.',
    seconds: 11,
    enter: (a) => {
      a.preset('jet');
      a.highlight('#readouts');
    },
  },
  {
    title: 'ITER: Q = 10',
    text: 'A bigger machine confines heat for longer. On the Lawson chart, ITER\'s point crosses the Q = 10 line: about 500 MW of fusion from 50 MW of heating. Fusion\'s own helium nuclei now provide most of the heating — a burning plasma.',
    seconds: 12,
    enter: (a) => {
      a.preset('iter');
      a.highlight('#lawson-card');
    },
  },
  {
    title: 'Push too hard and it disrupts',
    text: 'Too much pressure for the magnetic field (the beta limit) or too much density (the Greenwald limit) and the plasma goes unstable, kinks and dumps its energy in milliseconds. Operating a tokamak means staying inside these limits.',
    seconds: 11,
    enter: (a) => {
      a.preset('pressure');
      a.highlight('#readouts');
    },
  },
  {
    title: 'Exploded view',
    text: 'Pull the machine apart: the central solenoid lifts out, the toroidal coils slide outward and the poloidal rings separate. ITER weighs about 23,000 tonnes — as much as three Eiffel Towers.',
    seconds: 11,
    enter: (a) => {
      a.preset('iter');
      a.highlight(null);
      a.explode(true);
    },
  },
  {
    title: 'Your turn',
    text: 'Use the sliders to find ignition: raise the confinement time and keep the temperature near 15–30 keV without breaking the limits. Fuel is abundant — deuterium from seawater, tritium bred from lithium — and the reaction makes no CO₂.',
    seconds: 12,
    enter: (a) => {
      a.explode(false);
      a.preset('demo');
      a.highlight('#controls');
    },
  },
];

export class TourRunner {
  index = -1;
  elapsed = 0;
  active = false;
  constructor(private actions: TourActions) {}
  start(): void {
    this.active = true;
    this.index = -1;
    this.next();
  }
  stop(): void {
    this.active = false;
    this.actions.highlight(null);
  }
  next(): void {
    this.index++;
    this.elapsed = 0;
    if (this.index >= TOUR.length) return this.stop();
    TOUR[this.index].enter(this.actions);
  }
  prev(): void {
    if (this.index <= 0) return;
    this.index -= 2;
    this.next();
  }
  get step(): TourStep | null {
    return this.active ? TOUR[this.index] ?? null : null;
  }
  update(dt: number, paused = false): void {
    if (!this.active || paused) return;
    this.elapsed += dt;
    if (this.elapsed >= TOUR[this.index].seconds) this.next();
  }
}
