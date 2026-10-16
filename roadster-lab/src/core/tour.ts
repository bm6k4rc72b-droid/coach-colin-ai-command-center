/** Narrated guided tour of the Roadster. Pure: drives the app through an actions interface. */
import type { PartId } from './parts';

export interface TourActions {
  select(p: PartId | null): void;
  preset(id: string): void;
  explode(on: boolean): void;
  xray(on: boolean): void;
  run(kind: 'launch' | 'brake' | null): void;
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
    title: 'A battery with wheels and a rocket problem',
    text: 'This is a teaching model of the second-generation Tesla Roadster. Its headline numbers are the targets Tesla announced in 2017, and the maths here shows what it takes to hit them. Drag to orbit, scroll to zoom, click any part.',
    seconds: 10,
    enter: (a) => {
      a.preset('gen2');
      a.explode(false);
      a.xray(false);
      a.select(null);
      a.run(null);
      a.highlight(null);
    },
  },
  {
    title: 'The body: fighting the air',
    text: 'Drag grows with speed squared, and the power to beat it with speed cubed. At 250 mph, roughly 400 kW goes into pushing air aside, so the shape matters most at the top end.',
    seconds: 11,
    enter: (a) => a.select('body'),
  },
  {
    title: 'X-ray: the 200 kWh floor',
    text: 'The body turns to glass. The pack fills the floor between the axles: low, stiff and enormous. To deliver close to a megawatt it must push about a thousand amps, and the heat it makes rises with the square of the current.',
    seconds: 12,
    enter: (a) => {
      a.xray(true);
      a.select('battery');
    },
  },
  {
    title: 'Three motors',
    text: 'One motor in front and one for each rear wheel. Electric motors give full torque from standstill, then hold constant power once the voltage runs out. Together they put an announced 10,000 N·m at the wheels.',
    seconds: 11,
    enter: (a) => a.select('motorsRear'),
  },
  {
    title: 'The real limit: four patches of rubber',
    text: '10,000 N·m on a 0.36 m tyre is about 28 kN, or 1.42 g for a 2-tonne car. The tyres must hold that without spinning, and that takes grip near μ = 1.45. Watch the acceleration chart: the flat top is the grip and torque limit.',
    seconds: 13,
    enter: (a) => {
      a.select('wheels');
      a.highlight('#launch-card');
    },
  },
  {
    title: 'Launch',
    text: 'Full throttle from standstill, in real time. Energy flows from the pack to the motors, the car squats, and the timing lights catch 60 mph, 100 mph and the quarter mile.',
    seconds: 12,
    enter: (a) => {
      a.xray(false);
      a.select(null);
      a.highlight('#hud');
      a.run('launch');
    },
  },
  {
    title: 'Street tyres',
    text: 'Same motors, ordinary tyres (μ = 1.0). Now the rubber, not the motors, sets the pace: 0–60 mph stretches to about 2.8 s. Performance claims are claims about tyres.',
    seconds: 12,
    enter: (a) => {
      a.preset('street');
      a.run('launch');
      a.highlight('#readouts');
    },
  },
  {
    title: 'The SpaceX package: beating μg',
    text: 'Thrust from cold-gas thrusters does not go through the tyres. 22 kN for about a second adds roughly 1 g. But F = ṁ·vₑ: at about 716 m/s exhaust speed, 32 kg of nitrogen is gone in about a second. That is the rocket equation in a sports car.',
    seconds: 14,
    enter: (a) => {
      a.preset('spacex');
      a.select('thrusters');
      a.run('launch');
    },
  },
  {
    title: 'Stopping',
    text: 'From 60 mph the car carries about 0.7 MJ of kinetic energy. Regeneration returns part of it to the pack; the discs turn the rest into heat. Stopping distance is v²/(2μg).',
    seconds: 11,
    enter: (a) => {
      a.preset('gen2');
      a.select('brakes');
      a.run('brake');
    },
  },
  {
    title: 'Range: where the energy goes',
    text: 'At steady speed the only losses are drag, rolling resistance and the auxiliaries. The range curve peaks at a modest speed, because drag rises with the square of speed.',
    seconds: 12,
    enter: (a) => {
      a.select(null);
      a.run(null);
      a.highlight('#range-card');
    },
  },
  {
    title: 'Exploded view',
    text: 'Pull it apart: the roof lifts, the body rises, the pack drops, and the motors and wheels slide out. Every part has its own maths in the panel on the right.',
    seconds: 11,
    enter: (a) => {
      a.highlight(null);
      a.explode(true);
    },
  },
  {
    title: 'The Roadster in orbit',
    text: 'In 2018, Falcon Heavy launched an original Roadster around the Sun. Kepler\'s laws place it on a 557-day ellipse between Earth\'s orbit and Mars\'s. The orbit panel solves Kepler\'s equation for any date you pick.',
    seconds: 13,
    enter: (a) => {
      a.explode(false);
      a.highlight('#orbit-card');
    },
  },
  {
    title: 'Your turn',
    text: 'Change the mass, grip, power, drag and thrusters, then press Launch. Every number is computed live from the physics shown.',
    seconds: 10,
    enter: (a) => {
      a.preset('gen2');
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
