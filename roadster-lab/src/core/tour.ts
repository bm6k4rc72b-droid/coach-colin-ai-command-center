/** Narrated guided tour of the Roadster. Pure: drives the app through an actions interface. */
import type { PartId } from './parts';

export interface TourActions {
  select(p: PartId | null): void;
  preset(id: string): void;
  explode(on: boolean): void;
  xray(on: boolean): void;
  run(kind: 'launch' | 'brake' | null): void;
  stunt(on: boolean): void;
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
    title: 'The Roadster, as revealed on 15 October 2026',
    text: 'Tesla finally showed the production Roadster: Ano White paint, gold visor glass, sharp geometric surfaces. In the demo it drove up a curling ramp upside down, rolled over in mid-air and landed on its wheels. This tour rebuilds every part of it with physics.',
    seconds: 11,
    enter: (a) => {
      a.stunt(false);
      a.preset('perf');
      a.explode(false);
      a.xray(false);
      a.select(null);
      a.run(null);
      a.highlight(null);
    },
  },
  {
    title: 'Suction: the atmosphere as a clamp',
    text: 'Fans pump air out from under the floor and skirts seal the edges. A pressure drop of just 1.5 kPa, 1.5 % of an atmosphere, over a 6 m² floor is 9 kN of downforce, at any speed. That is more than half the car\'s weight, without adding any mass.',
    seconds: 13,
    enter: (a) => {
      a.xray(true);
      a.select('fans');
    },
  },
  {
    title: 'Ten thrusters, 600 litres of air',
    text: 'Four rear thrusters push, four side ones roll the car, and two underneath lift it. At an assumed 300 bar, 600 litres holds about 214 kg of air. Expanding to the atmosphere, it leaves the nozzles at about 620 m/s: F = ṁ·vₑ.',
    seconds: 13,
    enter: (a) => a.select('thrusters'),
  },
  {
    title: 'The stunt: up the curl',
    text: 'The car drives into a half loop. On the curl, the track must push it toward the centre with m·v²/R. At the top, gravity points away from the track, so the car only stays on if v²/R + suction/m exceeds g. Watch the contact-force chart.',
    seconds: 14,
    enter: (a) => {
      a.xray(false);
      a.select(null);
      a.stunt(true);
      a.highlight('#stunt-card');
    },
  },
  {
    title: 'Upside down, and slow',
    text: 'At the top the car is crawling, slower than √(gR), the loop-the-loop speed. Without suction it would fall off. The fans make up the difference: F_suction > m(g − v²/R).',
    seconds: 12,
    enter: (a) => {
      a.stunt(true);
      a.highlight('#demo-maths');
    },
  },
  {
    title: 'Half-roll in mid-air',
    text: 'Released inverted, it falls. Side thrusters fire as a couple: torque τ = 2·F·r about the long axis, angular acceleration α = τ/I. Fire half the turn, brake the other half, and 180° takes well under a second.',
    seconds: 13,
    enter: (a) => {
      a.stunt(true);
      a.highlight('#stunt-chart');
    },
  },
  {
    title: 'A soft landing',
    text: 'Dropping 12 metres would mean hitting the ground at about 15 m/s. The underbody thrusters fire just in time to slow it to about 1.5 m/s, and the suspension takes the rest.',
    seconds: 13,
    enter: (a) => {
      a.stunt(true);
      a.highlight('#demo-maths');
    },
  },
  {
    title: '0–60 mph in 0.81 seconds',
    text: 'The live run averaged 3.4 g. Rear tyres plus suction give about 1.7 g at best; the rest is thrust. The reported 80 kN would make it 0.45 s, so the run used about 28 kN on average.',
    seconds: 13,
    enter: (a) => {
      a.stunt(false);
      a.preset('thrust');
      a.highlight('#hud');
      a.run('launch');
    },
  },
  {
    title: 'Performance: suction, no thrust',
    text: 'The road-going trim relies on suction and two rear tyres alone: about 1.6 s to 60 mph, still faster than almost any car ever sold.',
    seconds: 11,
    enter: (a) => {
      a.preset('perf');
      a.run('launch');
      a.highlight('#readouts');
    },
  },
  {
    title: 'How the 2017 promise changed',
    text: 'The 2017 prototype promised three motors, a 200 kWh pack and 620 miles. The 2026 car is rear-drive, quoted at over 300 miles, and gets its headline numbers from air and fans instead.',
    seconds: 12,
    enter: (a) => {
      a.preset('gen2');
      a.run(null);
      a.highlight('#range-card');
    },
  },
  {
    title: 'Exploded view',
    text: 'Pull it apart: the fans drop, the roof and body lift, the tanks rise. Every part has its own maths in the panel on the right.',
    seconds: 10,
    enter: (a) => {
      a.preset('perf');
      a.highlight(null);
      a.explode(true);
    },
  },
  {
    title: 'And the first one is still in orbit',
    text: 'The 2008 Roadster that Falcon Heavy launched in 2018 keeps circling the Sun on a 557-day ellipse. The orbit panel solves Kepler\'s equation for any date.',
    seconds: 11,
    enter: (a) => {
      a.explode(false);
      a.highlight('#orbit-card');
    },
  },
  {
    title: 'Your turn',
    text: 'Change the ramp radius, entry speed, suction and thrust, then replay the stunt. Turn suction down and watch the car fall off at the top.',
    seconds: 10,
    enter: (a) => {
      a.preset('thrust');
      a.stunt(true);
      a.highlight('#stunt-controls');
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
