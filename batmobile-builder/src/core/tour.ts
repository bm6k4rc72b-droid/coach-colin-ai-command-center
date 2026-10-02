/** Narrated guided tour: drives the builder through the same actions as the buttons. Pure. */
import type { TestId } from '../scene/world';
import type { Build } from './vehicle';

export interface TourActions {
  setBuild(b: Partial<Build>): void;
  runTest(t: TestId): void;
  runAll(): void;
  highlight(selector: string | null): void;
}

export interface TourStep {
  title: string;
  text: string;
  seconds: number;
  enter: (a: TourActions) => void;
}

export const TOUR: TourStep[] = [
  {
    title: 'The brief',
    text: 'Build a night pursuit vehicle that meets eight requirements at once: acceleration, top speed, braking, a hairpin, a 20 m canal jump, a crash test, range and protection. Every part trades one against another.',
    seconds: 8,
    enter: (a) => {
      a.setBuild({ chassis: 'interceptor', engine: 'v8', armour: 'none', tyres: 'street', drive: 'rwd', springK: 60e3, travel: 0.2, damping: 0.4, wing: 0.3, rideOffset: 0 });
      a.runTest('garage');
      a.highlight(null);
    },
  },
  {
    title: 'Start with a supercar',
    text: 'A low street interceptor with a V8 is quick, brakes hard and corners flat. Check the mission panel: it has no armour, and the canal jump is a problem.',
    seconds: 8,
    enter: (a) => {
      a.runAll();
      a.highlight('#mission');
    },
  },
  {
    title: 'The canal jump',
    text: 'It clears the gap — then lands. A low car can only package ~15 cm of suspension travel, so the springs bottom out and the occupants take over 20 g. Landing g ≈ v² ÷ (2 × stopping distance).',
    seconds: 9,
    enter: (a) => {
      a.highlight(null);
      a.runTest('jump');
    },
  },
  {
    title: 'Add armour',
    text: 'Composite panels (aramid / UHMWPE) give protection 3 for 260 kg. Watch the mass and power-to-weight in the specs.',
    seconds: 7,
    enter: (a) => {
      a.setBuild({ armour: 'composite' });
      a.highlight('#specs');
    },
  },
  {
    title: 'Switch to a tumbler chassis',
    text: 'Big wheels and long-travel suspension (35 cm, stiffer springs). The same jump now lands at a few g: the suspension stores ½·k·x² and releases it gently.',
    seconds: 9,
    enter: (a) => {
      a.highlight(null);
      a.setBuild({ chassis: 'tumbler', travel: 0.35, springK: 120e3, damping: 0.6 });
      a.runTest('jump');
    },
  },
  {
    title: 'The cost: acceleration',
    text: 'The tumbler is heavier and rear-drive. 0–100 km/h is traction-limited: the rear tyres can only push with μ × the weight on them, so extra power just spins them.',
    seconds: 9,
    enter: (a) => a.runTest('drag'),
  },
  {
    title: 'All-wheel drive',
    text: 'Driving all four wheels puts the whole weight behind the tyres. Same engine, much quicker launch.',
    seconds: 8,
    enter: (a) => {
      a.setBuild({ drive: 'awd' });
      a.runTest('drag');
    },
  },
  {
    title: 'Why not steel armour?',
    text: 'Steel plate weighs 950 kg, raises the centre of gravity and is stiff. In a barrier crash it steals crumple distance, so the occupants decelerate harder. Armour is not crash safety.',
    seconds: 9,
    enter: (a) => {
      a.setBuild({ armour: 'steel' });
      a.runTest('crash');
    },
  },
  {
    title: 'Back to composite — mission check',
    text: 'Composite armour, tumbler chassis, V8, all-wheel drive, long travel. Run everything.',
    seconds: 8,
    enter: (a) => {
      a.setBuild({ armour: 'composite' });
      a.runAll();
      a.highlight('#mission');
    },
  },
  {
    title: 'Your turn',
    text: 'Try the turbine (fast and thirsty), the electric drivetrain (quick but heavy) or the urban tank (watch the hairpin — tall cars tip before they slide). Every change ripples through all eight tests.',
    seconds: 8,
    enter: (a) => {
      a.highlight(null);
      a.runTest('garage');
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
