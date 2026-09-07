/**
 * Telling a fall from everything else a body does on its way to the floor.
 *
 * The naive detector asks "is this person horizontal?" and it is wrong all day
 * long, because so is somebody asleep, somebody doing up a shoe, somebody
 * kneeling to reach a low cupboard and somebody who has simply sat down. Every
 * one of those is a person who is not standing, and none of them needs help.
 *
 * What separates a fall from all of them is not the posture. It is the
 * *transition* — and four properties of it, each of which alone is beatable
 * and which together are not:
 *
 * 1. **Rate.** Sitting is a controlled lowering against the legs, and it takes
 *    a second and a half. A fall is a body accelerating under gravity, and it
 *    takes under a second. This is the single strongest discriminator and it
 *    is the reason this module works on stature over time rather than on any
 *    single frame.
 *
 * 2. **Where it stops.** A sit ends at the height of a seat and stays there. A
 *    kneel ends at knee height. A fall ends on the floor. Somebody who lowers
 *    quickly but settles at chair height sat down quickly; that is a person in
 *    a hurry, not a person in trouble.
 *
 * 3. **Where it happened.** Lying down in the place you go to lie down is not
 *    an event. Rest zones are drawn over the bed and the armchair, and inside
 *    them the machine reports rest rather than collapse.
 *
 * 4. **What happens afterwards.** The shoelace is the case that defeats every
 *    posture-only system, and it is defeated here by patience: an alarm is
 *    only ever raised from a body that went down *and stayed there*. Somebody
 *    tying a lace is upright again in six seconds. This costs the system a
 *    delay before it can speak, and that delay is the price of not crying
 *    wolf. It is also why the response ladder starts by *asking*, gently,
 *    rather than by calling anybody.
 *
 * There is a fifth rule that is about honesty rather than physics. The machine
 * will not call something a fall unless it *watched the descent*. A subject
 * who is already on the floor when tracking begins, or who reappears on the
 * floor after being lost behind a wall, is reported as `found-down` — a real
 * finding, treated seriously, but never dressed up as an observation the
 * system did not make.
 *
 * Time is passed in rather than read from a clock, so the whole machine runs
 * from a fixture in Node at any speed.
 *
 * @module aegis/kinematics
 */

import { Ring, clamp, ramp } from './mathkit.js';

/** Stature at or above which somebody is standing. */
export const UPRIGHT_STATURE = 0.80;

/** Stature at or below which somebody is on the floor. */
export const FLOOR_STATURE = 0.40;

/** The band a seat puts a body in. */
export const SEAT_BAND = Object.freeze([0.42, 0.78]);

/** Stature loss per second above which a descent is not controlled. */
export const FALL_RATE = 0.85;

/** Stature loss per second below which a descent is plainly deliberate. */
export const CONTROLLED_RATE = 0.50;

/** Window the descent rate is measured over, milliseconds. */
const RATE_WINDOW_MS = 380;

/** How long a settled low body must stay there before it is called down. */
export const DWELL_MS = 7000;

/** How long a descent may take before it is no longer one event. */
const DESCENT_TIMEOUT_MS = 4000;

/** Stature rise from the floor that counts as getting back up. */
const RECOVERY_STATURE = 0.62;

/** The states a watched body can be in. */
export const STATES = Object.freeze([
  'away', 'upright', 'lowering', 'descending', 'seated', 'resting',
  'grounded', 'recovering', 'down', 'found-down', 'obscured',
]);

/**
 * Whether a normalised point lies inside any of a set of rectangles.
 *
 * @param {number} x Normalised column.
 * @param {number} y Normalised row.
 * @param {{x: number, y: number, w: number, h: number}[]} boxes The rectangles.
 * @returns {boolean} Whether the point is inside one.
 */
export function inside(x, y, boxes) {
  for (const box of boxes || []) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return true;
  }
  return false;
}

/**
 * A reading from the machine.
 *
 * @typedef {object} Kinematics
 * @property {string} state One of {@link STATES}.
 * @property {number} sinceMs How long the body has been in this state.
 * @property {number} stature Smoothed stature.
 * @property {number} descentRate Stature lost per second, positive downward.
 * @property {number} peakRate The fastest descent rate of the current event.
 * @property {number} likelihood This channel's belief that a fall happened, 0–1.
 * @property {boolean} transitObserved Whether the descent itself was watched.
 * @property {boolean} degraded Whether the reading rests on weak measurements.
 * @property {string[]} reasons Plain-language grounds for the likelihood.
 */

/** The kinematic state machine for one watched body. */
export class FallMachine {
  /**
   * @param {object} [options] Options.
   * @param {number} [options.dwellMs] How long a body must stay down.
   * @param {{x: number, y: number, w: number, h: number}[]} [options.restZones]
   *   Places where lying down is expected, in normalised coordinates.
   */
  constructor(options = {}) {
    this.dwellMs = options.dwellMs ?? DWELL_MS;
    this.restZones = options.restZones ?? [];
    this.reset();
  }

  /** Return to the state of having seen nothing. */
  reset() {
    this.state = 'away';
    this.enteredAtMs = 0;
    this.lastMs = 0;
    this.stature = NaN;
    this.history = new Ring(48);
    this.peakRate = 0;
    this.eventStartMs = 0;
    /**
     * Whether this subject has been seen standing during the present episode.
     *
     * This, and not the descent rate, is what "we watched it happen" means. An
     * earlier version set the flag only inside the fast-descent branches, and
     * so a slow slide down a wall — watched from upright to the floor, in full
     * view, for eleven seconds — was reported as somebody merely *found* on
     * the ground and had its score capped for it.
     */
    this.sawUpright = false;
    this.lastSeenMs = 0;
    this.wasTracked = false;
  }

  /** @returns {boolean} Whether the descent itself was witnessed. */
  get transitObserved() {
    return this.sawUpright;
  }

  /**
   * Move to a new state.
   *
   * @param {string} next The state name.
   * @param {number} timeMs Now.
   */
  enter(next, timeMs) {
    if (this.state === next) return;
    this.state = next;
    this.enteredAtMs = timeMs;
  }

  /**
   * The stature lost per second over the recent window.
   *
   * Measured as a chord across the window rather than a frame-to-frame
   * difference: at 12 fps in a dim hallway a one-frame difference is mostly
   * silhouette noise, and the noise is what a naive detector fires on.
   *
   * @param {number} timeMs Now.
   * @returns {number} Stature units lost per second; positive is downward.
   */
  rate(timeMs) {
    const samples = this.history.toArray();
    if (samples.length < 2) return 0;
    let oldest = null;
    for (const sample of samples) {
      if (timeMs - sample.t <= RATE_WINDOW_MS) { oldest = sample; break; }
    }
    if (!oldest) oldest = samples[Math.max(0, samples.length - 2)];
    const dt = (timeMs - oldest.t) / 1000;
    if (!(dt > 0.05)) return 0;
    const latest = samples[samples.length - 1];
    return (oldest.s - latest.s) / dt;
  }

  /**
   * Advance the machine by one frame.
   *
   * @param {import('./posture.js').Posture} posture This frame's reading.
   * @param {object} context Frame context.
   * @param {number} context.timeMs Capture time.
   * @param {number} context.width Frame width, for zone tests.
   * @param {number} context.height Frame height, for zone tests.
   * @returns {Kinematics} The reading.
   */
  update(posture, context) {
    const { timeMs, width, height } = context;
    this.lastMs = timeMs;

    if (!posture.present) {
      // Losing the subject is not the same as the subject being fine. The
      // machine keeps a `down` verdict standing when somebody vanishes while
      // on the floor — the most likely reason a fallen body stops being
      // detected is that it stopped moving, not that it got up and left.
      if (this.state !== 'down' && this.state !== 'found-down') this.enter('away', timeMs);
      // Losing sight of somebody for a moment does not un-see them standing;
      // losing them for several seconds means the next body in frame may not
      // be the same body, and the claim has to be earned again.
      if (this.wasTracked) this.lastSeenMs = timeMs;
      if (timeMs - this.lastSeenMs > 3000) this.sawUpright = false;
      this.wasTracked = false;
      return this.report(timeMs, 0, ['nobody in frame']);
    }

    if (posture.headHidden || !Number.isFinite(posture.stature)) {
      this.enter('obscured', timeMs);
      return this.report(timeMs, 0, [posture.note || 'view obstructed']);
    }

    // Smoothing is deliberately light. Heavy smoothing hides exactly the thing
    // being measured — a fall is a fast event, and a filter long enough to
    // make the trace pretty is long enough to make a fall look like a sit.
    this.stature = Number.isFinite(this.stature)
      ? this.stature + (posture.stature - this.stature) * 0.45
      : posture.stature;
    this.history.push({ t: timeMs, s: this.stature });
    const descentRate = this.rate(timeMs);
    const restingHere = inside(
      posture.centreCol / width,
      posture.footRow / height,
      this.restZones,
    );

    const fresh = !this.wasTracked;
    this.wasTracked = true;
    this.lastSeenMs = timeMs;

    // A subject first seen already on the floor is a finding, not an
    // observation of a fall.
    if (fresh && !this.sawUpright && this.stature < FLOOR_STATURE && !restingHere) {
      this.peakRate = 0;
      this.eventStartMs = timeMs;
      this.enter('found-down', timeMs);
      return this.verdict(timeMs, posture, descentRate, restingHere);
    }

    switch (this.state) {
      case 'away':
      case 'upright':
      case 'seated':
      case 'resting':
      case 'recovering':
      case 'obscured': {
        if (this.stature >= UPRIGHT_STATURE) {
          this.peakRate = 0;
          this.sawUpright = true;
          this.enter('upright', timeMs);
          break;
        }
        if (descentRate >= FALL_RATE) {
          this.eventStartMs = timeMs;
          this.peakRate = descentRate;
          this.enter('descending', timeMs);
          break;
        }
        if (descentRate >= CONTROLLED_RATE) {
          this.eventStartMs = timeMs;
          this.peakRate = Math.max(this.peakRate, descentRate);
          this.enter('lowering', timeMs);
          break;
        }
        // Settled, not moving much: name where it settled.
        if (this.stature < FLOOR_STATURE) {
          this.enter(restingHere ? 'resting' : 'grounded', timeMs);
        } else if (this.stature <= SEAT_BAND[1]) {
          this.enter(restingHere ? 'resting' : 'seated', timeMs);
        }
        break;
      }

      case 'lowering':
      case 'descending': {
        this.peakRate = Math.max(this.peakRate, descentRate);
        if (this.peakRate >= FALL_RATE) this.enter('descending', timeMs);
        if (this.stature >= UPRIGHT_STATURE) {
          // Went down and came straight back up: a stoop, a reach, a lace.
          this.enter('upright', timeMs);
          this.peakRate = 0;
          this.sawUpright = true;
          break;
        }
        if (timeMs - this.eventStartMs > DESCENT_TIMEOUT_MS) {
          // Too slow to be one event; whatever this is, it is not a fall.
          this.enter(this.stature < FLOOR_STATURE ? 'grounded' : 'seated', timeMs);
          break;
        }
        // The descent has stopped when the rate collapses. Where it stopped
        // is what decides which state comes next.
        if (Math.abs(descentRate) < 0.18) {
          if (this.stature < FLOOR_STATURE) this.enter(restingHere ? 'resting' : 'grounded', timeMs);
          else if (this.stature <= SEAT_BAND[1]) this.enter(restingHere ? 'resting' : 'seated', timeMs);
        }
        break;
      }

      case 'grounded': {
        if (this.stature >= RECOVERY_STATURE) {
          this.enter('recovering', timeMs);
          break;
        }
        if (timeMs - this.enteredAtMs >= this.dwellMs) this.enter('down', timeMs);
        break;
      }

      case 'down':
      case 'found-down': {
        if (this.stature >= RECOVERY_STATURE) {
          this.enter('recovering', timeMs);
          this.peakRate = 0;
        }
        break;
      }

      default:
        this.enter('upright', timeMs);
    }

    return this.verdict(timeMs, posture, descentRate, restingHere);
  }

  /**
   * Score the current state as a fall likelihood, with its grounds.
   *
   * @param {number} timeMs Now.
   * @param {import('./posture.js').Posture} posture This frame's reading.
   * @param {number} descentRate Current descent rate.
   * @param {boolean} restingHere Whether the body is in a rest zone.
   * @returns {Kinematics} The reading.
   */
  verdict(timeMs, posture, descentRate, restingHere) {
    const reasons = [];
    let likelihood = 0;

    if (restingHere && this.state !== 'descending') {
      reasons.push('inside a rest zone — lying here is expected');
      return this.report(timeMs, 0, reasons, descentRate);
    }

    switch (this.state) {
      case 'descending':
        likelihood = 0.35 + 0.35 * ramp(this.peakRate, FALL_RATE, 2.2);
        reasons.push(`descending at ${this.peakRate.toFixed(2)} stature/s`);
        break;

      case 'grounded': {
        const held = timeMs - this.enteredAtMs;
        // The three terms, in the order they earn their weight: how fast the
        // body came down, how low it ended, and how long it has stayed.
        const speed = ramp(this.peakRate, CONTROLLED_RATE, 1.6);
        const depth = ramp(FLOOR_STATURE - this.stature, 0, 0.25);
        const stay = ramp(held, 1200, this.dwellMs);
        likelihood = clamp(0.25 + 0.34 * speed + 0.20 * depth + 0.28 * stay, 0, 0.94);
        reasons.push(`on the floor for ${(held / 1000).toFixed(1)} s`);
        if (this.peakRate >= FALL_RATE) reasons.push(`came down fast (${this.peakRate.toFixed(2)}/s)`);
        else if (this.transitObserved) reasons.push(`came down under control (${this.peakRate.toFixed(2)}/s)`);
        break;
      }

      case 'down':
        likelihood = 0.90 + 0.06 * ramp(this.peakRate, CONTROLLED_RATE, 1.6);
        reasons.push(`down and still for ${((timeMs - this.eventStartMs) / 1000).toFixed(0)} s`);
        break;

      case 'found-down':
        // Serious, but the descent was never seen, so it is capped below the
        // score a watched fall can reach and labelled as what it is.
        likelihood = 0.62;
        reasons.push('found already on the floor — the fall itself was not seen');
        break;

      case 'seated':
        reasons.push('settled at seat height');
        break;

      case 'resting':
        reasons.push('at rest where rest is expected');
        break;

      case 'recovering':
        reasons.push('getting back up');
        break;

      case 'lowering':
        reasons.push(`lowering under control (${descentRate.toFixed(2)}/s)`);
        break;

      default:
        reasons.push('upright');
    }

    if (!this.sawUpright && (this.state === 'grounded' || this.state === 'down')) {
      likelihood = Math.min(likelihood, 0.66);
      reasons.push('descent not observed');
    }

    // A reading built on a coasted floor reference or a distant subject is not
    // allowed to carry full weight into the fusion stage.
    const degraded = posture.confidence < 0.55 || posture.imputed;
    if (degraded) {
      likelihood *= clamp(0.45 + 0.55 * posture.confidence, 0, 1);
      reasons.push(posture.imputed
        ? `legs hidden — floor reference imputed (${Math.round(posture.occlusion * 100)}%)`
        : `view confidence ${Math.round(posture.confidence * 100)}%`);
    }

    return this.report(timeMs, clamp(likelihood, 0, 1), reasons, descentRate, degraded);
  }

  /**
   * Package the current state as a reading.
   *
   * @param {number} timeMs Now.
   * @param {number} likelihood The score.
   * @param {string[]} reasons The grounds.
   * @param {number} [descentRate] Current rate.
   * @param {boolean} [degraded] Whether measurements are weak.
   * @returns {Kinematics} The reading.
   */
  report(timeMs, likelihood, reasons, descentRate = 0, degraded = false) {
    return {
      state: this.state,
      sinceMs: timeMs - this.enteredAtMs,
      stature: this.stature,
      descentRate,
      peakRate: this.peakRate,
      likelihood,
      transitObserved: this.transitObserved,
      degraded,
      reasons,
    };
  }
}
