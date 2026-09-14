/**
 * Things in the sky, and what a single camera can honestly say about them.
 *
 * Detecting an aerial contact is easy and the console already does it: anything
 * moving above the horizon line is, by definition, not on the ground. What
 * follows from that detection is where care is needed, because the obvious
 * question — is that a drone — is the one a single camera cannot answer.
 *
 * The reason is range. A camera measures *angular* size and *angular* rate. A
 * gull at thirty metres and a quadcopter at a hundred and fifty subtend the same
 * angle and cross the frame at the same rate; there is no cue in one image
 * stream that separates them. The console therefore reports the two angles it
 * genuinely measured, names what each one is consistent with, and lists what
 * would actually settle it — a second camera for parallax, an acoustic
 * signature, or a receiver listening for the control link.
 *
 * On the ground-truth side this is much better behaved: your own drone's
 * telemetry, when it is bridged in, is a position and an altitude rather than an
 * inference, and it is tracked as such.
 *
 * @module black-optic-6/aerial
 */

import { horizonRow } from '../../sentry/js/ground.js';

/** Angular rate above which a contact is moving faster than anything walking. */
export const FAST_DEG_PER_SEC = 8;

/**
 * How many degrees across a contact is.
 *
 * @param {{width?: number, w?: number}} box The contact's box in frame pixels.
 * @param {number} frameWidth Frame width in pixels.
 * @param {number} fovDeg Horizontal field of view.
 * @returns {number} Angular width in degrees.
 */
export function angularSize(box, frameWidth, fovDeg) {
  const w = box.width ?? box.w ?? 0;
  return (w / Math.max(1, frameWidth)) * fovDeg;
}

/**
 * How fast a contact is crossing the frame, in degrees a second.
 *
 * @param {Array<{u: number, v: number, atMs: number}>} trail Recent positions in frame pixels.
 * @param {number} frameWidth Frame width in pixels.
 * @param {number} fovDeg Horizontal field of view.
 * @returns {number|null} Degrees per second, or null without enough history.
 */
export function angularRate(trail, frameWidth, fovDeg) {
  if (!Array.isArray(trail) || trail.length < 2) return null;
  const first = trail[0];
  const last = trail[trail.length - 1];
  const seconds = (last.atMs - first.atMs) / 1000;
  if (!(seconds > 0)) return null;
  const pixels = Math.hypot(last.u - first.u, last.v - first.v);
  return ((pixels / Math.max(1, frameWidth)) * fovDeg) / seconds;
}

/**
 * Which contacts are above the horizon.
 *
 * Needs a calibrated view: without a pose there is no horizon, and "above the
 * middle of the frame" is not the same thing — a camera tilted down puts the
 * horizon near the top and everything below it is ground.
 *
 * @param {object[]} contacts Contacts from the watch.
 * @param {object|null} pose Camera pose, or null when uncalibrated.
 * @param {number} frameHeight Frame height in pixels.
 * @returns {{aerial: object[], resolved: boolean, note: string}} What is in the air.
 */
export function aboveHorizon(contacts, pose, frameHeight) {
  if (!pose) {
    return {
      aerial: [],
      resolved: false,
      note: 'The view is not calibrated, so there is no horizon line and nothing can be called airborne.',
    };
  }
  const row = horizonRow(pose);
  if (!Number.isFinite(row)) {
    return { aerial: [], resolved: false, note: 'The horizon falls outside this frame at the current tilt.' };
  }
  const aerial = contacts.filter((contact) => {
    const bottom = (contact.box?.y ?? 0) + (contact.box?.height ?? contact.box?.h ?? 0);
    return bottom < row;
  });
  return {
    aerial,
    resolved: true,
    note: `Horizon at row ${Math.round(row)} of ${frameHeight}. Contacts wholly above it are airborne.`,
  };
}

/**
 * What an airborne contact's angles are consistent with.
 *
 * Deliberately returns a list of possibilities rather than a label. Every entry
 * is a thing the measured angles do not rule out, which is the strongest
 * statement one camera supports.
 *
 * @param {object} measured The angles.
 * @param {number} measured.angularSizeDeg Angular width.
 * @param {number|null} measured.angularRateDeg Angular rate, where known.
 * @returns {{consistentWith: string[], ruledOut: string[], caveat: string,
 *   wouldSettleIt: string[]}} The reading.
 */
export function consistentWith({ angularSizeDeg, angularRateDeg }) {
  const consistent = [];
  const ruledOut = [];

  if (angularSizeDeg < 0.4) {
    consistent.push('a small multirotor at a few hundred metres');
    consistent.push('a bird at some distance');
    consistent.push('an aircraft far off');
  } else if (angularSizeDeg < 2) {
    consistent.push('a multirotor within a hundred metres or so');
    consistent.push('a large bird nearby');
  } else {
    consistent.push('something close, or something large');
    ruledOut.push('a small drone at any distance where it would matter');
  }

  if (angularRateDeg !== null) {
    if (angularRateDeg < 1) {
      consistent.push('hovering, or heading almost straight at or away from the camera');
    } else if (angularRateDeg > FAST_DEG_PER_SEC) {
      consistent.push('crossing quickly — close, fast, or both');
      ruledOut.push('a station-keeping hover');
    }
  }

  return {
    consistentWith: consistent,
    ruledOut,
    // The sentence the whole module exists to make unavoidable.
    caveat: 'One camera measures angles, not range. A gull at thirty metres and a quadcopter at a hundred and fifty look identical, and nothing in this image stream separates them.',
    wouldSettleIt: [
      'A second camera a known distance away — parallax gives range, and range turns an angle into a size.',
      'A microphone: multirotors have a rotor-blade signature nothing else in the sky produces.',
      'A receiver on the common control and video bands, which is how the commercial detectors do it.',
    ],
  };
}

/**
 * Track your own drone from bridged telemetry.
 *
 * Nothing is inferred here — position, altitude and speed come from the aircraft
 * itself, so this is the one part of the deck that is a measurement rather than
 * a reading of pixels.
 *
 * @param {Array<object>} history Telemetry frames, oldest first.
 * @returns {{current: object|null, climbRateMps: number|null, groundSpeedMps: number|null,
 *   samples: number, note: string}} The track.
 */
export function telemetryTrack(history) {
  if (!Array.isArray(history) || !history.length) {
    return {
      current: null, climbRateMps: null, groundSpeedMps: null, samples: 0,
      note: 'No telemetry bridged. A drone that only talks to its controller cannot be tracked here.',
    };
  }
  const current = history[history.length - 1];
  if (history.length < 2) {
    return {
      current, climbRateMps: null, groundSpeedMps: current.speedMps ?? null, samples: 1,
      note: 'One frame of telemetry — position only, no rates yet.',
    };
  }

  const previous = history[history.length - 2];
  const seconds = (current.atMs - previous.atMs) / 1000;
  if (!(seconds > 0)) {
    return { current, climbRateMps: null, groundSpeedMps: current.speedMps ?? null, samples: history.length, note: 'Telemetry timestamps did not advance.' };
  }

  return {
    current,
    climbRateMps: ((current.altitudeM ?? 0) - (previous.altitudeM ?? 0)) / seconds,
    groundSpeedMps: current.speedMps ?? null,
    samples: history.length,
    note: `${history.length} telemetry frames. Position and altitude are reported by the aircraft, not inferred.`,
  };
}
