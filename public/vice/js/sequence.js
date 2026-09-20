/**
 * The director.
 *
 * One number goes in — how far the page has been scrolled, 0 at the top and 1
 * at the bottom — and the entire state of the film comes out: which act is
 * playing, how bright the sky is, where the cars are, how many felony stars
 * are lit, how hard the camera is shaking, and which music cue should be
 * running.
 *
 * Keeping this as one pure function rather than a pile of scroll listeners is
 * what makes the production hold together. The renderer, the HUD, the audio
 * engine and the end-to-end tests all read the same table, so it is not
 * possible for the sirens to be playing while the police are off screen, or
 * for the shield to arrive before the blast it is supposed to be stopping.
 *
 * The film, in eight beats:
 *
 * | From | To   | Act          | What happens                                 |
 * |------|------|--------------|----------------------------------------------|
 * | 0.00 | 0.09 | `arrival`    | Sunset, palms, Tommy walks the strip.        |
 * | 0.09 | 0.20 | `brief`      | The operation introduces itself.             |
 * | 0.20 | 0.33 | `chase`      | Five stars. Chargers. The Rolls opens up.    |
 * | 0.33 | 0.49 | `fleet`      | The apps, on a rotating 3D rack and plates.  |
 * | 0.49 | 0.60 | `cavalry`    | Choppers and armour take the causeway.       |
 * | 0.60 | 0.72 | `agents`     | The outreach and automation swarm deploys.   |
 * | 0.72 | 0.84 | `detonation` | Gold truck, saucer, and the city goes up.    |
 * | 0.84 | 1.00 | `aftermath`  | The shield holds. Security desk opens.       |
 *
 * The three beats the brief asked for land where it asked for them: the police
 * are on you by 25%, the gunships arrive at 50%, and the detonation peaks at
 * 75%. The act boundaries above are arranged around those three marks rather
 * than around equal-sized sections, and the page's section heights are then
 * derived from this table at boot so the two can never drift apart.
 *
 * @module vice/sequence
 */

import { EASE, clamp, envelope, mix, progress, ramp } from './mathkit.js';

/**
 * The acts, in order. `from`/`to` are document progress.
 *
 * `chapter` is what the top bar prints; `cue` is the music the score should be
 * playing; `hud` is the mission line in the bottom-left of the game HUD.
 */
export const ACTS = Object.freeze([
  {
    id: 'arrival', chapter: 'ARRIVAL', from: 0, to: 0.09, cue: 'drift',
    hud: 'VICE CITY — 1986. WELCOME BACK.',
  },
  {
    id: 'brief', chapter: 'THE BRIEF', from: 0.09, to: 0.2, cue: 'drift',
    hud: 'MISSION BRIEF — COACH COLIN COMMAND CENTER',
  },
  {
    id: 'chase', chapter: 'WANTED', from: 0.2, to: 0.33, cue: 'chase',
    hud: 'LOSE THE COPS — HEAD FOR OCEAN DRIVE',
  },
  {
    id: 'fleet', chapter: 'THE FLEET', from: 0.33, to: 0.49, cue: 'chase',
    hud: 'GARAGE UNLOCKED — SELECT AN APP',
  },
  {
    id: 'cavalry', chapter: 'AIR CAVALRY', from: 0.49, to: 0.6, cue: 'cavalry',
    hud: 'THE ARMY IS IN THE AIR — KEEP MOVING',
  },
  {
    id: 'agents', chapter: 'THE SWARM', from: 0.6, to: 0.72, cue: 'cavalry',
    hud: 'DEPLOY THE AGENTS — OUTREACH IS LIVE',
  },
  {
    id: 'detonation', chapter: 'DETONATION', from: 0.72, to: 0.84, cue: 'blast',
    hud: 'INCOMING — TAKE COVER',
  },
  {
    id: 'aftermath', chapter: 'AFTERMATH', from: 0.84, to: 1, cue: 'finale',
    hud: 'YOU LIVED. NOW GET TO WORK.',
  },
]);

/** Sky colours, top of frame, keyed to document progress. */
const SKY_TOP = Object.freeze([
  { at: 0.00, rgb: [24, 12, 58] },
  { at: 0.14, rgb: [38, 14, 74] },
  { at: 0.32, rgb: [16, 8, 44] },
  { at: 0.54, rgb: [8, 8, 30] },
  { at: 0.73, rgb: [6, 6, 22] },
  { at: 0.78, rgb: [120, 40, 20] },
  { at: 0.88, rgb: [30, 14, 34] },
  { at: 1.00, rgb: [42, 26, 78] },
]);

/** Sky colours at the horizon. */
const SKY_LOW = Object.freeze([
  { at: 0.00, rgb: [255, 110, 128] },
  { at: 0.14, rgb: [255, 84, 150] },
  { at: 0.32, rgb: [180, 44, 130] },
  { at: 0.54, rgb: [72, 26, 96] },
  { at: 0.73, rgb: [40, 18, 70] },
  { at: 0.78, rgb: [255, 176, 72] },
  { at: 0.88, rgb: [200, 92, 70] },
  { at: 1.00, rgb: [255, 150, 110] },
]);

/**
 * The act playing at a given scroll position.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {object} The act record from {@link ACTS}.
 */
export function actAt(p) {
  const t = clamp(p, 0, 1);
  for (let i = ACTS.length - 1; i >= 0; i -= 1) {
    if (t >= ACTS[i].from) return ACTS[i];
  }
  return ACTS[0];
}

/**
 * How far through its own act the reader is.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {number} 0 at the act's first frame, 1 at its last.
 */
export function actProgress(p) {
  const act = actAt(p);
  return progress(clamp(p, 0, 1), act.from, act.to);
}

/**
 * The felony rating, the way the games count it.
 *
 * Heat climbs through the opening of the chase, holds at five while the police
 * and then the army are on you, and only clears once the city that was hunting
 * you is no longer there — which is a joke the sequence is allowed to make
 * because the blast happens on the same timeline.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {number} 0–5, whole stars.
 */
export function wantedLevel(p) {
  const t = clamp(p, 0, 1);
  if (t < 0.2) return 0;
  if (t >= 0.845) return 0;
  if (t >= 0.27) return 5;
  return Math.min(5, 1 + Math.floor(progress(t, 0.2, 0.27) * 5));
}

/**
 * How lit the *next* star is, so the HUD can flash it mid-climb.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {number} 0–1 towards the next whole star.
 */
export function starCharge(p) {
  const t = clamp(p, 0, 1);
  if (t < 0.2 || t >= 0.27) return 0;
  const scaled = progress(t, 0.2, 0.27) * 5;
  return scaled - Math.floor(scaled);
}

/**
 * How hard the camera is being shaken, in screen pixels.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {number} Shake amplitude in CSS pixels.
 */
export function cameraShake(p) {
  const t = clamp(p, 0, 1);
  const chase = envelope(t, 0.205, 0.33, 0.04) * 3.5;
  const rotors = envelope(t, 0.5, 0.6, 0.03) * 4.5;
  const impact = EASE.blast(1 - progress(t, 0.75, 0.82)) * (t >= 0.75 ? 26 : 0);
  const rumble = envelope(t, 0.725, 0.75, 0.014) * 6;
  return Math.max(chase, rotors, rumble, impact);
}

/**
 * The complete state of the frame.
 *
 * Every field is 0–1 unless noted. The renderer reads it, the HUD reads it,
 * the score reads it, and the end-to-end harness asserts on it, so this is the
 * one description of what "the page at 62%" means.
 *
 * @param {number} p Document progress, 0–1.
 * @returns {object} The scene state.
 */
export function sceneState(p) {
  const t = clamp(p, 0, 1);
  const act = actAt(t);
  const blastAt = progress(t, 0.748, 0.792);

  return {
    p: t,
    act: act.id,
    chapter: act.chapter,
    cue: act.cue,
    mission: act.hud,
    actT: progress(t, act.from, act.to),

    /** Sky, as two colours the renderer draws a gradient between. */
    skyTop: ramp(SKY_TOP, t),
    skyLow: ramp(SKY_LOW, t),
    /** Sun above the horizon early, gone by night. */
    sun: 1 - progress(t, 0.06, 0.3),
    /** Stars out once the sun has set, washed out by the fireball. */
    stars: progress(t, 0.16, 0.4) * (1 - progress(t, 0.775, 0.8)) + progress(t, 0.88, 0.97) * 0.7,
    /** How fast the world slides past, in city-metres per second. */
    speed: 2.4 * (1 + envelope(t, 0.2, 0.72, 0.05) * 6.5) * (1 - progress(t, 0.755, 0.8)),

    /** Actor presence. Each is an opacity *and* a cue to run its behaviour. */
    tommyWalking: 1 - progress(t, 0.16, 0.21),
    rolls: envelope(t, 0.2, 0.755, 0.025),
    police: envelope(t, 0.205, 0.63, 0.03),
    choppers: envelope(t, 0.49, 0.755, 0.03),
    tanks: envelope(t, 0.505, 0.75, 0.03),
    saucer: envelope(t, 0.68, 0.88, 0.03),
    goldTruck: envelope(t, 0.69, 0.77, 0.02),

    /** The blast, its shockwave, and the fire that stays behind. */
    blast: blastAt,
    fireball: EASE.blast(blastAt) * (1 - progress(t, 0.8, 0.88)),
    shock: progress(t, 0.75, 0.82),
    embers: progress(t, 0.762, 0.83) * (1 - progress(t, 0.96, 1)),
    ruin: progress(t, 0.772, 0.85),

    /** Captain Colin arrives a hair before the front does. */
    shield: progress(t, 0.735, 0.762) * (1 - progress(t, 0.95, 1)),
    shieldLock: progress(t, 0.752, 0.772),
    tommyDown: progress(t, 0.74, 0.762) * (1 - progress(t, 0.97, 1)),

    /** HUD. */
    wanted: wantedLevel(t),
    starCharge: starCharge(t),
    shake: cameraShake(t),
    /** Rain over the chase, because a wet street doubles the neon. */
    rain: envelope(t, 0.19, 0.46, 0.05) * 0.8,
  };
}

/**
 * Whether a scene state should be treated as an act change worth announcing.
 *
 * The HUD flashes a card on every act boundary. Rather than have the DOM keep
 * its own idea of "the last act", the comparison lives here so the QA harness
 * can drive it directly.
 *
 * @param {string|null} previous The act id last announced.
 * @param {string} next The act id now.
 * @returns {boolean} Whether to announce.
 */
export function shouldAnnounce(previous, next) {
  return Boolean(next) && previous !== next;
}
