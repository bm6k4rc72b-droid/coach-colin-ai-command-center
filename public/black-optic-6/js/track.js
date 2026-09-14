/**
 * Keeping a moving subject in frame — camera pointing, and nothing beyond it.
 *
 * A pan-tilt head under closed-loop control is genuinely useful on a perimeter:
 * a fixed camera at the gate sees a person for four seconds, and the same camera
 * on a head follows them across the yard and gives you forty. Auto-tracking
 * gimbals are an ordinary consumer product and this is that, driven by the
 * console's own contacts instead of a phone app's face detector.
 *
 * It is worth being exact about where this file stops, because the specification
 * it came from went further.
 *
 * **What this computes:** how fast to pan and tilt *right now* to bring the
 * subject back to the centre of the frame, from the error visible in this frame.
 * The derivative term damps the servo so it settles instead of oscillating —
 * that is loop stability, the same maths that stops a thermostat hunting.
 *
 * **What this does not compute, deliberately:** where a subject will be later,
 * where to point so that something arrives where they will be, or any output
 * that could drive a trigger. A firing solution is a different calculation with
 * a different purpose, and the request for one was declined rather than
 * quietly implemented — the ledger row says so in the console itself. The
 * controller here has no target-velocity extrapolation anywhere in it, so there
 * is nothing to repurpose: it can centre a camera and that is the whole of it.
 *
 * @module black-optic-6/track
 */

/** Fraction of the frame around the centre where no correction is made. */
export const DEADBAND = 0.06;

/** Degrees per second the head may be commanded to move, at most. */
export const MAX_RATE_DEG = 45;

/** Degrees per second squared the command may change by, so the picture stays watchable. */
export const MAX_SLEW_DEG = 90;

/**
 * How far off centre a contact is, as a fraction of the frame.
 *
 * @param {{x: number, y: number, width?: number, height?: number, w?: number, h?: number}} box
 *   The contact's bounding box in frame pixels.
 * @param {{width: number, height: number}} frame The frame size.
 * @returns {{x: number, y: number, magnitude: number}} Error in −1..1 per axis.
 */
export function aimError(box, frame) {
  const w = box.width ?? box.w ?? 0;
  const h = box.height ?? box.h ?? 0;
  const centreX = (box.x ?? 0) + w / 2;
  const centreY = (box.y ?? 0) + h / 2;
  const x = (centreX - frame.width / 2) / (frame.width / 2);
  const y = (centreY - frame.height / 2) / (frame.height / 2);
  return { x, y, magnitude: Math.hypot(x, y) };
}

/**
 * A pan-tilt head kept pointed at whatever the console is watching.
 *
 * Proportional-derivative on the present error. No model of the subject, no
 * prediction of where it is going.
 */
export class PanTilt {
  /**
   * @param {object} [options] Loop settings.
   * @param {number} [options.fovDeg=70] Horizontal field of view, which sets how
   *   many degrees a full-frame error corresponds to.
   * @param {number} [options.gain=0.55] Proportional gain.
   * @param {number} [options.damping=0.18] Derivative gain.
   * @param {number} [options.deadband=DEADBAND] Error below which nothing moves.
   */
  constructor(options = {}) {
    this.fovDeg = options.fovDeg ?? 70;
    this.gain = options.gain ?? 0.55;
    this.damping = options.damping ?? 0.18;
    this.deadband = options.deadband ?? DEADBAND;
    this.previous = { x: 0, y: 0 };
    this.rate = { pan: 0, tilt: 0 };
    this.angle = { pan: 0, tilt: 0 };
  }

  /** Stop the head and forget the loop's history. */
  reset() {
    this.previous = { x: 0, y: 0 };
    this.rate = { pan: 0, tilt: 0 };
  }

  /**
   * One step of the loop.
   *
   * @param {{x: number, y: number}|null} error Aim error, or null when nothing is
   *   being followed — in which case the head is commanded to stop, not to hunt.
   * @param {number} dtSec Seconds since the last step.
   * @returns {{pan: number, tilt: number, moving: boolean, reason: string}}
   *   Angular rates in degrees per second.
   */
  step(error, dtSec) {
    if (!error || dtSec <= 0) {
      this.rate = { pan: 0, tilt: 0 };
      this.previous = { x: 0, y: 0 };
      return { ...this.rate, moving: false, reason: 'Nothing to follow — the head holds still.' };
    }

    // Inside the deadband the subject is centred well enough. Correcting here
    // produces a picture that twitches constantly and is harder to watch than
    // one that is slightly off centre.
    if (Math.hypot(error.x, error.y) < this.deadband) {
      this.rate = { pan: 0, tilt: 0 };
      this.previous = { x: error.x, y: error.y };
      return { ...this.rate, moving: false, reason: 'Centred within the deadband.' };
    }

    const verticalFov = this.fovDeg * 0.75;
    const derivative = {
      x: (error.x - this.previous.x) / dtSec,
      y: (error.y - this.previous.y) / dtSec,
    };

    const wanted = {
      pan: (error.x * this.gain + derivative.x * this.damping) * (this.fovDeg / 2),
      tilt: (error.y * this.gain + derivative.y * this.damping) * (verticalFov / 2),
    };

    const slew = MAX_SLEW_DEG * dtSec;
    const pan = clamp(approach(this.rate.pan, wanted.pan, slew), -MAX_RATE_DEG, MAX_RATE_DEG);
    const tilt = clamp(approach(this.rate.tilt, wanted.tilt, slew), -MAX_RATE_DEG, MAX_RATE_DEG);

    this.rate = { pan, tilt };
    this.previous = { x: error.x, y: error.y };
    this.angle = {
      pan: this.angle.pan + pan * dtSec,
      tilt: this.angle.tilt + tilt * dtSec,
    };

    return { pan, tilt, moving: true, reason: 'Correcting toward centre.' };
  }
}

/**
 * Move a value toward a target without exceeding a step.
 *
 * @param {number} from Current value.
 * @param {number} to Desired value.
 * @param {number} step Largest change allowed.
 * @returns {number} The new value.
 */
function approach(from, to, step) {
  const delta = to - from;
  if (Math.abs(delta) <= step) return to;
  return from + Math.sign(delta) * step;
}

/**
 * Clamp a value.
 *
 * @param {number} value The value.
 * @param {number} low Lower bound.
 * @param {number} high Upper bound.
 * @returns {number} The clamped value.
 */
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * Which contact a head should follow, when there are several.
 *
 * Largest and longest-present wins, which in practice means the closest thing
 * that has been there long enough to be real. Deliberately dull: a tracker that
 * switches subject every time something bigger crosses behind produces footage
 * nobody can follow.
 *
 * @param {object[]} contacts Contacts from the watch.
 * @param {string|null} current Id currently followed.
 * @returns {object|null} The contact to follow.
 */
export function chooseSubject(contacts, current) {
  if (!contacts.length) return null;
  const held = contacts.find((contact) => String(contact.id) === String(current));
  // Stickiness: keep the current subject while it is still there and still
  // person-or-vehicle sized.
  if (held && held.ageSec > 0.5) return held;
  const ranked = [...contacts].sort((a, b) => {
    const areaA = (a.box.width ?? a.box.w ?? 0) * (a.box.height ?? a.box.h ?? 0);
    const areaB = (b.box.width ?? b.box.w ?? 0) * (b.box.height ?? b.box.h ?? 0);
    return (areaB * b.ageSec) - (areaA * a.ageSec);
  });
  return ranked[0] ?? null;
}
