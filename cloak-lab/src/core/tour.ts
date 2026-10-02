/**
 * Narrated guided tour that drives the lab through the same actions the user's buttons call.
 * Pure: steps receive an actions interface; time-based advancing is handled by TourRunner.
 */
import type { CloakMode } from './cloakMath';
import type { Loadout } from './spectrum';
import type { Protection } from './emp';

export type Tab = 'stack' | 'cloak' | 'spectrum' | 'emp' | 'quiz';

export interface TourActions {
  goto(tab: Tab): void;
  useSynthetic(): void;
  capturePlate(): void;
  setCloakMode(m: CloakMode): void;
  setLightingDrift(on: boolean): void;
  setRedTeam(on: boolean): void;
  setLoadout(l: Partial<Loadout>): void;
  setLight(l: 'day' | 'dusk' | 'night'): void;
  runSpectrum(): void;
  setThreat(t: number): void;
  setProtection(deviceId: string, p: Partial<Protection>): void;
  pulse(): void;
  cloakEmpTest(): void;
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
    title: 'Welcome to Cloak Lab',
    text: 'Invisibility is two problems: fooling one sensor, and fooling all of them. This tour shows the real software you can run today, then what it cannot do.',
    seconds: 6,
    enter: (a) => {
      a.goto('stack');
      a.highlight(null);
    },
  },
  {
    title: 'The AI stack — what is real',
    text: 'Green "Shipping" cards are tools you can use right now: MediaPipe segmentation and COCO-SSD both run in this browser tab. Generative inpainting and Gaussian splats are real but too slow for live video.',
    seconds: 9,
    enter: (a) => a.highlight('[data-cat="Perception AI"]'),
  },
  {
    title: 'The latency budget',
    text: 'At 30 fps you have 33 ms per frame. A segmenter plus a clean plate fits; add a generative inpainter or a language model and you drop to a few frames per second.',
    seconds: 8,
    enter: (a) => a.highlight('#budget'),
  },
  {
    title: 'Live cloak — the raw feed',
    text: 'A synthetic actor walks through a room (switch to your webcam any time). Step 1 of every software cloak: store a clean plate of the empty scene.',
    seconds: 6,
    enter: (a) => {
      a.highlight(null);
      a.goto('cloak');
      a.useSynthetic();
      a.setCloakMode('off');
      a.setRedTeam(true);
      a.capturePlate();
    },
  },
  {
    title: 'Red team: the AI sees you',
    text: 'With the cloak off, the detector finds strong person evidence in the frame.',
    seconds: 5,
    enter: (a) => a.highlight('#redteam'),
  },
  {
    title: 'Mask → clean plate',
    text: 'The segmenter labels your pixels; the compositor pastes the stored background there. The detector now finds almost nothing — in this video.',
    seconds: 7,
    enter: (a) => {
      a.setCloakMode('plate');
      a.highlight('#stages');
    },
  },
  {
    title: 'Refraction shimmer',
    text: 'The film look: background bent along your edges. It looks great — and leaves more evidence for a detector.',
    seconds: 6,
    enter: (a) => {
      a.setCloakMode('shimmer');
      a.highlight('#redteam');
    },
  },
  {
    title: 'When the lights change',
    text: 'The plate is an old photo. Change the lighting and your silhouette reappears as a patch: clean-plate cloaks need a static camera and static light.',
    seconds: 7,
    enter: (a) => {
      a.setCloakMode('plate');
      a.setLightingDrift(true);
    },
  },
  {
    title: 'Spectrum Lab: optical cloak only',
    text: 'Now the real world. A display cloak hides you from the visible camera — but thermal, radar and Wi-Fi sensing are untouched, and the display makes you warmer.',
    seconds: 9,
    enter: (a) => {
      a.setLightingDrift(false);
      a.highlight(null);
      a.goto('spectrum');
      a.setLight('dusk');
      a.setLoadout({ visual: 'display', thermal: 'none', radar: 'none', acoustic: 'none', gait: 'walk' });
      a.runSpectrum();
    },
  },
  {
    title: 'Everything at once',
    text: 'Display skin, active cooling, radar-absorbent layer, quiet boots, creeping at night. Detection drops — but you carry kilograms and hundreds of watts, and radar still has a fair chance.',
    seconds: 10,
    enter: (a) => {
      a.setLight('night');
      a.setLoadout({ visual: 'display', thermal: 'cooling', radar: 'ram', acoustic: 'quiet', gait: 'creep' });
      a.runSpectrum();
    },
  },
  {
    title: 'EMP Lab: an unprotected suit',
    text: 'All this electronics has a weakness. A simulated pulse at moderate threat: long cables and antennas collect the most energy, and the cloak controller fails.',
    seconds: 8,
    enter: (a) => {
      a.goto('emp');
      a.setThreat(0.8);
      a.setProtection('cloak', { enclosure: 'none', filters: false, fiber: false, isolated: false });
      a.pulse();
    },
  },
  {
    title: 'Hardening',
    text: 'A tight conductive enclosure, filtered connectors and fibre links cut the induced voltage by orders of magnitude. Same pulse — the controller survives.',
    seconds: 8,
    enter: (a) => {
      a.setProtection('cloak', { enclosure: 'bag', filters: true, fiber: true, isolated: false });
      a.pulse();
    },
  },
  {
    title: 'Back to the live cloak',
    text: 'The hardened controller rides through the pulse with only a flicker. Try it unprotected yourself and watch the cloak drop.',
    seconds: 7,
    enter: (a) => {
      a.goto('cloak');
      a.setCloakMode('plate');
      a.cloakEmpTest();
    },
  },
  {
    title: 'Check yourself',
    text: 'Six questions on what you just saw. Then explore freely: switch on your webcam, build your own loadout, harden the whole house.',
    seconds: 5,
    enter: (a) => {
      a.highlight(null);
      a.goto('quiz');
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
    if (this.index >= TOUR.length) {
      this.stop();
      return;
    }
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
