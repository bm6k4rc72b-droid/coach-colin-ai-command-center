// Playback position on the log timeline (0..1), outside React.
export const clock = {
  u: 0,
  playing: false,
  /** Seconds of real time for a full sweep from 1 s to 30 days. */
  sweep: 26,
  listeners: new Set<(u: number) => void>(),
  set(u: number) {
    this.u = Math.min(1, Math.max(0, u));
    for (const l of this.listeners) l(this.u);
  },
  advance(dt: number) {
    if (!this.playing) return;
    const next = this.u + dt / this.sweep;
    if (next >= 1) {
      this.set(1);
      this.playing = false;
      stopFns.forEach((f) => f());
    } else this.set(next);
  },
};

const stopFns: Array<() => void> = [];
export function onClockStop(fn: () => void) {
  stopFns.push(fn);
}
