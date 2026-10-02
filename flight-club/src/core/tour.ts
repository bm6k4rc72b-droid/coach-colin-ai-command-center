/** Narrated guided tour: drives the app through the same actions as the buttons. Pure. */
import type { EnergyId } from '../config/suit';
import type { Assist, Gains } from './control';
import type { CourseId } from './courses';

export interface TourActions {
  setCourse(c: CourseId): void;
  setSource(s: EnergyId): void;
  setAssist(a: Assist): void;
  autopilot(on: boolean): void;
  setGains(g: Gains): void;
  highlight(selector: string | null): void;
}

export interface TourStep {
  title: string;
  text: string;
  seconds: number;
  enter: (a: TourActions) => void;
}

export const TUNED: Gains = { altKp: 1.4, altKi: 0.25, altKd: 2.2 };
export const AGGRESSIVE: Gains = { altKp: 4, altKi: 0, altKd: 0.3 };

export const TOUR: TourStep[] = [
  {
    title: 'Four thrusters, 200 kg',
    text: 'Two boot jets and two palm jets lift 200 kg of suit and pilot. To hover, total thrust must equal weight: 200 kg × 9.81 = 1 962 N. Everything else is control.',
    seconds: 8,
    enter: (a) => {
      a.setGains(TUNED);
      a.setSource('reactor');
      a.setCourse('hover');
      a.autopilot(false);
      a.highlight(null);
    },
  },
  {
    title: 'The flight computer takes off',
    text: 'The autopilot asks for 10 m. An altitude PID loop turns the error into a thrust command 120 times a second. Watch altitude and vertical speed on the HUD.',
    seconds: 10,
    enter: (a) => {
      a.autopilot(true);
      a.highlight('#hud');
    },
  },
  {
    title: 'The mixer',
    text: 'Software splits one command into four jets. Pitch: the boot nozzles swivel. Roll: more thrust on one palm than the other. Yaw: the palms swivel in opposite directions. The bars show each jet.',
    seconds: 10,
    enter: (a) => a.highlight('#thrust'),
  },
  {
    title: 'Three levels of help',
    text: 'Manual: the stick commands raw torque — you balance it yourself, like a broomstick on your hand. Stability: the stick sets a lean angle. Flight computer: the stick sets a speed, and altitude holds itself.',
    seconds: 10,
    enter: (a) => a.highlight('#assist'),
  },
  {
    title: 'PID tuning lab',
    text: 'P pushes toward the target, I removes any steady offset, D brakes before you overshoot. These gains climb to 10 m quickly with ~6% overshoot.',
    seconds: 9,
    enter: (a) => {
      a.setGains(TUNED);
      a.highlight('#lab');
    },
  },
  {
    title: 'Too much P, too little D',
    text: 'Kp 4, Kd 0.3: the suit overshoots by more than 100% and bounces. This is why real control software is tuned in simulation first.',
    seconds: 9,
    enter: (a) => {
      a.setGains(AGGRESSIVE);
      a.setCourse('hover');
      a.autopilot(true);
      a.highlight('#lab');
    },
  },
  {
    title: 'Ring run — loops inside loops',
    text: 'Guidance picks a velocity toward the next ring → the velocity loop picks a lean angle → the attitude loop picks a torque → the mixer picks four jets. Each loop is faster than the one above it.',
    seconds: 12,
    enter: (a) => {
      a.setGains(TUNED);
      a.setCourse('rings');
      a.autopilot(true);
      a.highlight(null);
    },
  },
  {
    title: 'Real fuel: kerosene turbines',
    text: 'Real jet suits use micro-turbines. At ~0.14 kg of fuel per newton-hour, 24 kg of kerosene gives about five minutes of hover. Energy, not thrust, limits flight time.',
    seconds: 10,
    enter: (a) => {
      a.setSource('turbine');
      a.highlight('#energy');
    },
  },
  {
    title: 'Why not batteries?',
    text: 'Fan power grows with thrust^1.5. Lifting a person takes over 200 kW, so 24 kg of the best lithium cells lasts about 90 seconds. Only the movie\'s "arc reactor" flies forever.',
    seconds: 10,
    enter: (a) => {
      a.setSource('electric');
      a.highlight('#energy');
    },
  },
  {
    title: 'Gusty rooftop landing',
    text: 'Random gusts push the suit around. The integral and velocity loops lean into the wind, and the descent slows to a gentle touchdown on a 22 m roof.',
    seconds: 12,
    enter: (a) => {
      a.setSource('reactor');
      a.setCourse('rooftop');
      a.autopilot(true);
      a.highlight(null);
    },
  },
  {
    title: 'Your turn',
    text: 'Pick a course and fly. Keys: W/S pitch, A/D roll, Q/E yaw, Space/Shift up/down; 1/2/3 switch assist. On a phone, use the two thumb sticks. Try manual mode only once you can land in mode 3!',
    seconds: 10,
    enter: (a) => {
      a.autopilot(false);
      a.setCourse('hover');
      a.setAssist('computer');
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
