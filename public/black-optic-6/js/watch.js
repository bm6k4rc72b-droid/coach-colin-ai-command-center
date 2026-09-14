/**
 * The detection loop: pixels in, contacts out.
 *
 * This is the console's one real sensor chain, and it is deliberately assembled
 * from the modules the perimeter camera app already proved rather than written
 * again — the same background model, the same segmenter, the same tracker, the
 * same ground geometry, the same geometric classifier. A second implementation
 * of any of those would be a second set of bugs and a second set of numbers that
 * quietly disagree with the first.
 *
 * What this module adds is the console's posture. Every contact it emits carries
 * what was measured and how well: a height in metres with its error, a speed, a
 * class with the evidence that produced it, and — where the view was never
 * calibrated — an honest statement that the numbers are in pixels and cannot be
 * converted. A contact is a thing that moved, where it moved, and how fast. It
 * is never a verdict about a person.
 *
 * @module black-optic-6/watch
 */

import { blobs, clean, createBackground, segment, updateBackground } from '../../sentry/js/scene.js';
import { Tracker } from '../../sentry/js/tracker.js';
import { classify, describe } from '../../sentry/js/classify.js';
import { cadence, dwellSeconds, posture, sinuosity } from '../../sentry/js/behaviour.js';
import { standingHeight } from '../../sentry/js/ground.js';
import { reading } from './provenance.js';

/** Frames the background model absorbs before any detection is reported. */
export const SETTLE_FRAMES = 24;

/**
 * A watch over one camera view.
 *
 * Holds the background model and the tracker, and turns each frame into
 * contacts. Nothing is stored and no frame leaves the device.
 */
export class Watch {
  /**
   * @param {object} [options] Settings.
   * @param {object} [options.pose] Camera pose from `ground.pose()`, when calibrated.
   * @param {number} [options.sensitivity] Segmenter sensitivity.
   */
  constructor(options = {}) {
    this.pose = options.pose ?? null;
    this.sensitivity = options.sensitivity ?? 3.2;
    this.background = null;
    this.tracker = new Tracker({ pose: this.pose });
    this.frames = 0;
    this.width = 0;
    this.height = 0;
  }

  /**
   * Give the watch a calibrated camera pose, so it can report metres.
   *
   * @param {object} pose Pose from `ground.pose()`.
   * @returns {void}
   */
  setPose(pose) {
    this.pose = pose;
    this.tracker.setPose(pose);
  }

  /** @returns {boolean} Whether the background has seen enough to judge. */
  get settled() {
    return this.frames >= SETTLE_FRAMES;
  }

  /**
   * Process one frame.
   *
   * @param {ImageData} frame The captured frame.
   * @param {number} timeMs Capture time.
   * @returns {{contacts: object[], mask: Uint8Array|null, energy: Float32Array|null,
   *   settled: boolean, changedFraction: number}} What this frame contained.
   */
  push(frame, timeMs) {
    if (!this.background || this.width !== frame.width || this.height !== frame.height) {
      this.background = createBackground(frame.width, frame.height);
      this.width = frame.width;
      this.height = frame.height;
      this.frames = 0;
    }

    // The model learns fast while settling, then slowly — fast enough to absorb
    // dusk, slow enough that somebody standing still does not become scenery.
    updateBackground(this.background, frame, { rate: this.frames < 12 ? 6 : 1 });
    this.frames += 1;

    const detection = segment(this.background, frame, { sensitivity: this.sensitivity });
    const mask = clean(detection.mask, frame.width, frame.height);
    const changedFraction = detection.changed / (frame.width * frame.height);

    if (!this.settled) {
      return { contacts: [], mask, energy: detection.energy ?? null, settled: false, changedFraction };
    }

    const regions = blobs(mask, frame.width, frame.height, {
      minArea: Math.max(12, Math.round(frame.width * frame.height * 0.0006)),
      energy: detection.energy ?? null,
    });
    const { live } = this.tracker.update(regions, timeMs, { frame, width: frame.width });

    return {
      contacts: live.map((track) => this.#contact(track)),
      mask,
      energy: detection.energy ?? null,
      settled: true,
      changedFraction,
    };
  }

  /**
   * Turn a track into a contact, with provenance on every number.
   *
   * @param {object} track A live track.
   * @returns {object} A contact.
   */
  #contact(track) {
    const box = track.box ?? {};
    const boxHeight = Number(box.height ?? box.h ?? 0);
    const boxWidth = Number(box.width ?? box.w ?? 1);
    const aspect = boxWidth > 0 ? boxHeight / boxWidth : 1;

    const path = track.path ?? [];
    const calibrated = Boolean(this.pose) && Number.isFinite(track.speedMps);

    let heightM = null;
    if (this.pose && track.foot && track.head) {
      heightM = standingHeight(this.pose, track.foot, track.head);
    } else if (Number.isFinite(track.heightM)) {
      heightM = track.heightM;
    }

    const gait = Array.isArray(track.cadenceSamples) && track.cadenceSamples.length > 8
      ? cadence(track.cadenceSamples)
      : null;

    const verdict = classify({
      heightM,
      aspect,
      fill: Number(track.fill ?? 0.5),
      speedMps: Number(track.speedMps ?? 0),
      peakSpeedMps: Number(track.peakSpeedMps ?? track.speedMps ?? 0),
      cadence: gait,
    });

    return {
      id: track.id,
      firstSeenMs: track.firstSeenMs ?? null,
      ageSec: Number(track.ageSec ?? 0),
      box,
      // Uncalibrated views report pixels and say so. Silently presenting pixel
      // speeds as metres is how a console ends up describing a moth as a truck.
      calibrated,
      height: heightM !== null
        ? reading('MODEL', heightM, { unit: 'm', error: 0.12, source: 'ground geometry' })
        : reading('BLOCKED', null, { source: 'view not calibrated' }),
      speed: calibrated
        ? reading('MODEL', track.speedMps, { unit: 'm/s', error: 0.15, source: 'track over ground' })
        : reading('BLOCKED', null, { source: 'view not calibrated' }),
      classification: reading('MODEL', verdict.label, {
        source: 'geometry and motion',
        error: null,
      }),
      confidence: verdict.confidence,
      reasons: verdict.reasons,
      summary: describe(verdict),
      posture: posture(boxHeight, boxWidth),
      cadence: gait
        ? reading('MODEL', gait.stepsPerMin, { unit: 'steps/min', error: 6, source: 'gait periodicity' })
        : reading('MODEL', null, { source: 'not enough track to measure' }),
      sinuosity: path.length > 3 ? sinuosity(path) : null,
      dwellSec: path.length > 3 ? dwellSeconds(path) : 0,
      path,
    };
  }
}

/**
 * Whether a set of contacts warrants waking somebody.
 *
 * The rule is deliberately dull: something the size of a person or a vehicle,
 * moving, inside a watched area, for longer than a moment. No scoring, no
 * intent, no thresholds tuned until the demo looked exciting. A console that
 * alerts on everything is a console that is muted by the second week.
 *
 * @param {object[]} contacts Contacts this frame.
 * @param {object} [options] Alert rules.
 * @param {number} [options.minDwellSec=1.5] How long before it counts.
 * @param {string[]} [options.classes] Classes that may raise an alert.
 * @returns {{alert: boolean, contacts: object[], reason: string}} The decision.
 */
export function alertState(contacts, options = {}) {
  const minDwell = options.minDwellSec ?? 1.5;
  const classes = options.classes ?? ['person', 'vehicle'];
  const worth = contacts.filter((contact) => (
    classes.includes(contact.classification.value)
    && contact.ageSec >= minDwell
  ));
  if (!worth.length) {
    return { alert: false, contacts: [], reason: 'Nothing of a size and persistence worth reporting.' };
  }
  return {
    alert: true,
    contacts: worth,
    reason: `${worth.length} contact${worth.length > 1 ? 's' : ''} matching ${classes.join(' or ')}, present for over ${minDwell}s.`,
  };
}
