// Playback clock, outside React: the render loop advances it and the
// timeline reads it, so playback never causes per-frame React renders.

import { DURATION } from '../data/scenarios';

export const clock = {
  t: 0,
  playing: false,
  /** Playback rate relative to real time (0.25 = four times slower). */
  speed: 0.25,
  listeners: new Set<(t: number) => void>(),
  set(t: number) {
    this.t = Math.min(DURATION, Math.max(0, t));
    for (const l of this.listeners) l(this.t);
  },
  advance(dtSeconds: number) {
    if (!this.playing) return;
    const next = this.t + dtSeconds * 1000 * this.speed;
    if (next >= DURATION) {
      this.set(DURATION);
      this.playing = false;
      onStop?.();
    } else this.set(next);
  },
};

let onStop: (() => void) | null = null;
export function onClockStop(fn: () => void) {
  onStop = fn;
}
