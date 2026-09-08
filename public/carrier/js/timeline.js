/**
 * Time: where the playhead is, and which scenes it is between.
 *
 * The renderer is a pure function of a script and a timestamp, which means the
 * one thing it must never do is guess. This module owns every answer about
 * time — when each scene starts, which scene owns a given second, how much of
 * the cut into the next one has elapsed — so that the preview, the exporter and
 * the headless check all ask the same question and get the same number.
 *
 * Cuts are dissolves taken out of the *incoming* scene's own time rather than
 * added between scenes. A five-second scene is five seconds of running time
 * whether or not it dissolves, so an author can add a cut without silently
 * lengthening the episode past the platform's limit.
 *
 * @module carrier/timeline
 */

import { CUT_SEC } from './script.js';

/**
 * A scene placed on the episode clock.
 *
 * @typedef {object} Cue
 * @property {object} scene The normalised scene.
 * @property {number} index Position in the episode.
 * @property {number} start Seconds from the top of the episode.
 * @property {number} end Seconds from the top; exclusive.
 */

/**
 * Place every scene on the clock.
 *
 * @param {object} script A parsed script.
 * @returns {{cues: Cue[], total: number}} The episode clock.
 */
export function buildTimeline(script) {
  let at = 0;
  const cues = script.scenes.map((scene, index) => {
    const cue = { scene, index, start: at, end: at + scene.seconds };
    at = cue.end;
    return cue;
  });
  return { cues, total: at };
}

/**
 * The scene playing at a moment.
 *
 * Times past the end return the last scene, held. An episode that runs one
 * frame long at the end of an export should show its final frame rather than
 * nothing, and a scrubber dragged to the far right should show the last thing
 * the viewer will see.
 *
 * @param {{cues: Cue[], total: number}} timeline The episode clock.
 * @param {number} t Seconds from the top.
 * @returns {{cue: Cue, tLocal: number, progress: number}|null} The scene and its
 *   own clock, or null for an empty episode.
 */
export function cueAt(timeline, t) {
  if (!timeline.cues.length) return null;
  const clamped = Math.max(0, Math.min(timeline.total - 1e-6, t));
  const cue = timeline.cues.find((c) => clamped >= c.start && clamped < c.end)
    ?? timeline.cues[timeline.cues.length - 1];
  const tLocal = Math.max(0, clamped - cue.start);
  return { cue, tLocal, progress: tLocal / cue.scene.seconds };
}

/**
 * The dissolve state at a moment.
 *
 * `mix` runs 0 → 1 across the first {@link CUT_SEC} of every scene after the
 * first, and is 1 everywhere else. Renderers draw the outgoing scene at
 * `1 - mix` under the incoming one, which keeps a cut from flashing the ground
 * colour between two dark frames.
 *
 * @param {{cues: Cue[], total: number}} timeline The episode clock.
 * @param {number} t Seconds from the top.
 * @param {number} [cut=CUT_SEC] Dissolve length in seconds.
 * @returns {{from: Cue|null, to: Cue, mix: number}|null} The pair being crossed.
 */
export function crossfadeAt(timeline, t, cut = CUT_SEC) {
  const here = cueAt(timeline, t);
  if (!here) return null;
  const { cue, tLocal } = here;
  const previous = cue.index > 0 ? timeline.cues[cue.index - 1] : null;
  const span = Math.min(cut, cue.scene.seconds);
  if (!previous || span <= 0 || tLocal >= span) return { from: null, to: cue, mix: 1 };
  return { from: previous, to: cue, mix: tLocal / span };
}

/**
 * Every frame timestamp in an episode.
 *
 * Used by the exporter and by the headless check, which both need the same
 * frames rather than whatever the display happened to hand them.
 *
 * @param {number} total Running time in seconds.
 * @param {number} fps Frames per second.
 * @returns {number[]} Timestamps, starting at zero.
 */
export function frameTimes(total, fps) {
  const count = Math.max(1, Math.round(total * fps));
  return Array.from({ length: count }, (_, i) => i / fps);
}
