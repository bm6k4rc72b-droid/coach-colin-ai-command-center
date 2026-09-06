/**
 * Places that matter, and what counts as something happening in them.
 *
 * A tracker that reports every moving thing reports nothing: on a windy night
 * that is a hundred events an hour and by morning nobody reads them. Zones are
 * how the operator says which parts of the ground they actually care about —
 * the doorway, the gate, the side of the house with no windows — and the event
 * rules are how a crossing becomes worth waking someone for.
 *
 * The geometry is on the *ground plane*, in metres, not in the image. This
 * matters: an image polygon silently changes meaning the moment the camera is
 * nudged, and it treats a subject's head as being wherever their head is drawn,
 * so a tall person "enters" a zone several metres before their feet do. A
 * ground polygon tested against the ground-contact point does neither.
 *
 * Hysteresis is applied to every rule. A subject standing exactly on a boundary
 * would otherwise generate an entry and an exit per frame, which is both useless
 * as a log and the fastest way to teach an operator to ignore the app.
 *
 * @module sentry/zones
 */

/** Seconds a state must hold before entry or exit is emitted. */
export const HYSTERESIS_SEC = 0.6;

/**
 * A watched region or line.
 *
 * @typedef {object} Zone
 * @property {string} id Stable identifier.
 * @property {string} name Operator-supplied label.
 * @property {'area'|'tripwire'} kind Watched geometry.
 * @property {Array<{x: number, y: number}>} points Ground metres; a polygon for
 *   an area, two points for a tripwire.
 * @property {number} [loiterSec] Seconds inside an area before it is loitering.
 * @property {'either'|'in'|'out'} [direction] Which way a tripwire must be
 *   crossed to fire.
 */

/**
 * Whether a ground point lies inside a polygon.
 *
 * Ray casting with the standard half-open edge rule, so a point exactly on a
 * shared edge belongs to one polygon rather than both or neither.
 *
 * @param {{x: number, y: number}} point Ground position.
 * @param {Array<{x: number, y: number}>} polygon Vertices in order.
 * @returns {boolean} True when inside.
 */
export function inPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y) {
      const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

/**
 * Which side of a directed line a point falls on.
 *
 * @param {{x: number, y: number}} a Line start.
 * @param {{x: number, y: number}} b Line end.
 * @param {{x: number, y: number}} p Point.
 * @returns {number} Positive to the left of a→b, negative to the right.
 */
export function sideOf(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/**
 * Whether two segments cross.
 *
 * @param {{x: number, y: number}} p1 First segment start.
 * @param {{x: number, y: number}} p2 First segment end.
 * @param {{x: number, y: number}} q1 Second segment start.
 * @param {{x: number, y: number}} q2 Second segment end.
 * @returns {boolean} True when they properly intersect.
 */
export function segmentsCross(p1, p2, q1, q2) {
  const d1 = sideOf(q1, q2, p1);
  const d2 = sideOf(q1, q2, p2);
  const d3 = sideOf(p1, p2, q1);
  const d4 = sideOf(p1, p2, q2);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Stateful evaluation of tracks against zones.
 */
export class ZoneWatch {
  /**
   * @param {Zone[]} [zones] Initial zones.
   */
  constructor(zones = []) {
    this.zones = zones;
    /** @type {Map<string, object>} Per track-and-zone state. */
    this.state = new Map();
  }

  /** Replace the zone set, dropping state for zones that no longer exist. */
  setZones(zones) {
    this.zones = zones;
    const ids = new Set(zones.map((z) => z.id));
    for (const key of [...this.state.keys()]) {
      if (!ids.has(key.split('::')[1])) this.state.delete(key);
    }
  }

  /**
   * Evaluate one frame of tracks.
   *
   * @param {object[]} tracks Live tracks carrying ground positions and paths.
   * @param {number} timeMs Frame time.
   * @returns {Array<{type: string, zoneId: string, zoneName: string,
   *   trackId: number, timeMs: number, detail: string}>} Events raised this
   *   frame.
   */
  evaluate(tracks, timeMs) {
    const events = [];
    const seen = new Set();
    for (const track of tracks) {
      if (!track.ground) continue;
      for (const zone of this.zones) {
        const key = `${track.id}::${zone.id}`;
        seen.add(key);
        let state = this.state.get(key);
        if (!state) {
          state = {
            inside: false,
            since: timeMs,
            candidate: null,
            candidateSince: 0,
            loitered: false,
            previous: null,
            offWire: null,
          };
          this.state.set(key, state);
        }
        if (zone.kind === 'tripwire') {
          const event = this.#tripwire(zone, track, state, timeMs);
          if (event) events.push(event);
        } else {
          events.push(...this.#area(zone, track, state, timeMs));
        }
        state.previous = { x: track.ground.x, y: track.ground.y };
      }
    }
    for (const key of [...this.state.keys()]) if (!seen.has(key)) this.state.delete(key);
    return events;
  }

  /**
   * Tripwire crossing test for one track.
   *
   * @param {Zone} zone Tripwire.
   * @param {object} track Track.
   * @param {object} state Per-pair state.
   * @param {number} timeMs Frame time.
   * @returns {object|null} Crossing event, or null.
   */
  #tripwire(zone, track, state, timeMs) {
    const [a, b] = zone.points;
    const side = sideOf(a, b, track.ground);
    // A sample that lands exactly on the line has no side, and comparing it
    // with either neighbour finds no sign change — so a subject whose position
    // happens to be quantized onto the wire walks straight through it. The fix
    // is to remember the last position that was definitely on one side and
    // compare against that instead of against the previous frame.
    if (side === 0) return null;
    const previous = state.offWire;
    state.offWire = { x: track.ground.x, y: track.ground.y };
    if (!previous) return null;
    const before = sideOf(a, b, previous);
    if (before === 0 || Math.sign(before) === Math.sign(side)) return null;
    // The sides differ, so the path crossed the infinite line the wire lies on.
    // This last test is what confines the crossing to the wire's own length.
    if (!segmentsCross(previous, track.ground, a, b)) return null;
    const way = before > 0 ? 'in' : 'out';
    if (zone.direction && zone.direction !== 'either' && zone.direction !== way) return null;
    return {
      type: 'crossing',
      zoneId: zone.id,
      zoneName: zone.name,
      trackId: track.id,
      timeMs,
      detail: `crossed ${zone.name} (${way === 'in' ? 'inbound' : 'outbound'}) at ${track.speedMps.toFixed(2)} m/s`,
    };
  }

  /**
   * Entry, exit and loiter tests for one track against an area.
   *
   * @param {Zone} zone Area.
   * @param {object} track Track.
   * @param {object} state Per-pair state.
   * @param {number} timeMs Frame time.
   * @returns {object[]} Events.
   */
  #area(zone, track, state, timeMs) {
    const events = [];
    const inside = inPolygon(track.ground, zone.points);
    if (inside !== state.inside) {
      if (state.candidate !== inside) {
        state.candidate = inside;
        state.candidateSince = timeMs;
      } else if ((timeMs - state.candidateSince) / 1000 >= HYSTERESIS_SEC) {
        state.inside = inside;
        state.since = timeMs;
        state.loitered = false;
        state.candidate = null;
        events.push({
          type: inside ? 'entry' : 'exit',
          zoneId: zone.id,
          zoneName: zone.name,
          trackId: track.id,
          timeMs,
          detail: inside ? `entered ${zone.name}` : `left ${zone.name}`,
        });
      }
    } else {
      state.candidate = null;
    }
    if (state.inside && zone.loiterSec && !state.loitered) {
      const held = (timeMs - state.since) / 1000;
      if (held >= zone.loiterSec) {
        state.loitered = true;
        events.push({
          type: 'loiter',
          zoneId: zone.id,
          zoneName: zone.name,
          trackId: track.id,
          timeMs,
          detail: `stayed in ${zone.name} for ${Math.round(held)} s`,
        });
      }
    }
    return events;
  }
}
