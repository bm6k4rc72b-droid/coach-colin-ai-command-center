/** Narrated guided tour: drives the cutter through the same actions as the buttons. Pure. */
import type { Fusion, PickOptions, Weights } from './highlights';

export interface TourActions {
  loadDemo(): void;
  setWeights(w: Weights): void;
  setFusion(f: Fusion): void;
  setPick(p: Partial<PickOptions>): void;
  playReel(): void;
  stopPlayback(): void;
  highlight(selector: string | null): void;
}

export interface TourStep {
  title: string;
  text: string;
  seconds: number;
  enter: (a: TourActions) => void;
}

export const BALANCED: Weights = { audio: 0.5, motion: 0.35, cuts: 0.15, objects: 0 };

export const TOUR: TourStep[] = [
  {
    title: 'A match with an answer key',
    text: 'This 60-second synthetic match has five real highlights (green ▲ on the timeline) and two traps: an advert break with loud music, and a fast camera pan with nothing happening.',
    seconds: 9,
    enter: (a) => {
      a.stopPlayback();
      a.setWeights(BALANCED);
      a.setFusion('agree');
      a.setPick({ target: 30, pre: 3, post: 3, minGap: 6, relative: 0.4 });
      a.loadDemo();
      a.highlight('#timeline-wrap');
    },
  },
  {
    title: 'Feature 1 — loudness',
    text: 'Web Audio decodes the soundtrack, then we measure loudness (RMS, in decibels) every 50 ms. Crowds roar after big moments. Using loudness alone, the advert break wins: loud is not the same as exciting.',
    seconds: 10,
    enter: (a) => {
      a.setFusion('sum');
      a.setWeights({ audio: 1, motion: 0, cuts: 0, objects: 0 });
      a.highlight('#score-card');
    },
  },
  {
    title: 'Feature 2 — motion',
    text: 'Frame differencing: shrink each frame to 96×54 greyscale and measure how much the pixels changed since the last one. Using motion alone, the camera pan fools it and the near miss is missed.',
    seconds: 10,
    enter: (a) => {
      a.setWeights({ audio: 0, motion: 1, cuts: 0, objects: 0 });
      a.highlight('#score-card');
    },
  },
  {
    title: 'Feature 3 — scene cuts',
    text: 'A luma histogram barely changes when things move, but jumps when the shot changes. Broadcasts cut to a replay just after something big, so a cut boosts the seconds before it.',
    seconds: 10,
    enter: (a) => {
      a.setWeights(BALANCED);
      a.highlight('#timeline-wrap');
    },
  },
  {
    title: 'Fusion: add them up…',
    text: 'A weighted sum of all three still lets the advert through: its music is loud, and its edges look like cuts.',
    seconds: 9,
    enter: (a) => {
      a.setFusion('sum');
      a.highlight('#score-card');
    },
  },
  {
    title: '…or require agreement',
    text: '"Agreement" multiplies the sum by the geometric mean of the features, so a moment must be loud AND busy. 5 of 5 found, no traps. Combining weak signals well is most of the job.',
    seconds: 10,
    enter: (a) => {
      a.setFusion('agree');
      a.highlight('#score-card');
    },
  },
  {
    title: 'Picking the moments',
    text: 'Peaks are taken best-first. Peaks closer than the minimum gap count as one moment, and weak peaks under 40% of the best are dropped. Each clip keeps the build-up before the peak and the reaction after it.',
    seconds: 10,
    enter: (a) => {
      a.setPick({ pre: 4, post: 3 });
      a.highlight('#pick');
    },
  },
  {
    title: 'Watch the reel',
    text: 'The player jumps straight from clip to clip. Exporting records the same canvas and audio with MediaRecorder into a .webm file, entirely on your device.',
    seconds: 14,
    enter: (a) => {
      a.highlight('#reel-btn');
      a.playReel();
    },
  },
  {
    title: 'Your own videos',
    text: 'Load a clip from your phone. It is decoded locally and never uploaded. Turn on object detection to add a TensorFlow.js COCO-SSD model that counts people, balls, boards and bikes in each frame.',
    seconds: 10,
    enter: (a) => {
      a.stopPlayback();
      a.highlight('#source');
    },
  },
  {
    title: 'What the pros add',
    text: 'Speech-to-text (Whisper) finds commentary like "what a goal!". Image–text embeddings (CLIP) let you search for "a dunk". Audio classifiers (YAMNet) can tell applause from music. The tech panel explains each one.',
    seconds: 11,
    enter: (a) => a.highlight('#tech'),
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
