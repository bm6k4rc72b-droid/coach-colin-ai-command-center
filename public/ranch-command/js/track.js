/**
 * RANCH COMMAND — tracking, tripwires and zones.
 *
 * A detector says "there is a cow in this frame". Security and herd work
 * need more than that: *the same* cow as a moment ago, which way it went
 * through the gate, and how long that person has been standing by the fuel
 * tank. This module turns per-frame detections into tracks with identities,
 * and tracks into events:
 *
 * - `new` — an object seen often enough to be believed (one alert per
 *   object, not one per frame);
 * - `cross` — a track's ground point crossed a drawn tripwire, with its
 *   direction, which is what makes a gate count possible;
 * - `enter` / `dwell` — a track entered a drawn zone, or has stayed in it
 *   past the zone's loiter time.
 *
 * Everything is measured at the bottom-centre of the box — where the object
 * meets the ground — because a wire across a gateway is crossed by feet and
 * wheels, not by the middle of a body. Wires and zones are stored in
 * fractions of the frame, so they survive a change of resolution.
 *
 * Pure functions and one class; no DOM, so it is tested without a camera.
 *
 * @module ranch-command/track
 */

/** Intersection-over-union of two `{x, y, w, h}` boxes. */
export function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Signed area test: which side of the line a→b the point p is on. */
const side = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/**
 * Whether the move p→q crosses the segment a→b, and which way.
 *
 * @param {number[]} a Wire start `[x, y]`.
 * @param {number[]} b Wire end.
 * @param {number[]} p Where the object was.
 * @param {number[]} q Where it is now.
 * @returns {'in'|'out'|null} `in` when it ends on the left of a→b, `out` on the right, null if it did not cross.
 */
export function crossing(a, b, p, q) {
  const d1 = side(a, b, p);
  const d2 = side(a, b, q);
  // Standing exactly on the wire is not yet across it; the tracker waits for
  // the next point that is clear of the line and measures from the last one
  // that was.
  if (d1 === 0 || d2 === 0) return null;
  if ((d1 > 0) === (d2 > 0)) return null;
  // The path changes sides of the wire's line; it only counts if it does so
  // between the wire's ends rather than somewhere off past them.
  const d3 = side(p, q, a);
  const d4 = side(p, q, b);
  if ((d3 > 0) === (d4 > 0) && d3 !== 0 && d4 !== 0) return null;
  // In screen coordinates y grows downward, so a positive value is the
  // right-hand side of a→b as drawn; "in" is the left.
  return d2 < 0 ? 'in' : 'out';
}

/**
 * Whether a point is inside a polygon (ray casting).
 *
 * @param {number[][]} polygon Vertices `[x, y]`.
 * @param {number[]} p The point.
 * @returns {boolean} Inside.
 */
export function inside(polygon, p) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The tracker. */
export class Tracker {
  /**
   * @param {{ minHits?: number, maxAge?: number, minIou?: number, wires?: object[], zones?: object[] }} [options]
   *   `minHits` sightings before a track is believed; `maxAge` seconds unseen before it is dropped.
   */
  constructor({ minHits = 3, maxAge = 1.5, minIou = 0.2, wires = [], zones = [] } = {}) {
    Object.assign(this, { minHits, maxAge, minIou, wires, zones });
    this.tracks = [];
    this.nextId = 1;
    /** Crossings per wire id, per kind: `{ in, out }`. */
    this.counts = {};
  }

  /** Replace the drawn geometry without losing tracks. */
  setGeometry({ wires = [], zones = [] }) {
    this.wires = wires;
    this.zones = zones;
  }

  /** Forget everything (camera changed). */
  reset() {
    this.tracks = [];
    this.counts = {};
  }

  /**
   * Feed one frame of detections.
   *
   * @param {Array<{ label: string, kind?: string, score: number, box: object }>} detections This frame's detections, in pixels.
   * @param {number} t Time in seconds.
   * @param {{ width: number, height: number }} frame Frame size, to normalise ground points.
   * @returns {{ tracks: object[], events: object[] }} Believed tracks and what just happened.
   */
  update(detections, t, frame) {
    const events = [];
    const free = new Set(detections.map((_, i) => i));
    const live = this.tracks;
    const unmatched = new Set(live.map((_, i) => i));

    // Greedy matching, best overlap first.
    const pairs = [];
    live.forEach((track, ti) => detections.forEach((d, di) => {
      const overlap = iou(track.box, d.box);
      if (overlap >= this.minIou) pairs.push([overlap, ti, di]);
    }));
    pairs.sort((x, y) => y[0] - x[0]);
    const assign = (ti, di) => { unmatched.delete(ti); free.delete(di); this.#advance(live[ti], detections[di], t, frame, events); };
    for (const [, ti, di] of pairs) if (unmatched.has(ti) && free.has(di)) assign(ti, di);

    // At a few frames a second a running animal can outrun its own box, so
    // what is left is matched by distance — same kind, within a box and a half.
    for (const ti of [...unmatched]) {
      const track = live[ti];
      let best = null;
      for (const di of free) {
        const d = detections[di];
        const dist = Math.hypot(d.box.x + d.box.w / 2 - (track.box.x + track.box.w / 2), d.box.y + d.box.h / 2 - (track.box.y + track.box.h / 2));
        const reach = 1.5 * Math.max(track.box.w, track.box.h);
        if ((d.kind || 'unknown') === track.kind && dist < reach && (!best || dist < best.dist)) best = { di, dist };
      }
      if (best) assign(ti, best.di);
    }

    for (const di of free) {
      const d = detections[di];
      const track = { id: this.nextId, label: d.label, kind: d.kind || 'unknown', score: d.score, box: d.box, hits: 0, confirmed: false, firstSeen: t, lastSeen: t, trail: [], zones: {}, crossedAt: {}, clearOf: {} };
      this.nextId += 1;
      live.push(track);
      this.#advance(track, d, t, frame, events);
    }

    this.tracks = live.filter((track) => t - track.lastSeen <= this.maxAge);
    return { tracks: this.tracks.filter((track) => track.confirmed), events };
  }

  /** Move a track to its new detection and work out what that movement meant. */
  #advance(track, d, t, frame, events) {
    const ground = [(d.box.x + d.box.w / 2) / frame.width, (d.box.y + d.box.h) / frame.height];
    track.box = d.box;
    track.lastSeen = t;
    track.hits += 1;
    // The label of the most confident sighting wins, so one bad frame does
    // not rename a cow a horse.
    if (d.score >= track.score) { track.label = d.label; track.kind = d.kind || track.kind; track.score = d.score; }
    track.trail.push(ground);
    if (track.trail.length > 40) track.trail.shift();

    if (!track.confirmed && track.hits >= this.minHits) {
      track.confirmed = true;
      events.push({ type: 'new', track });
    }
    if (!track.confirmed) {
      for (const wire of this.wires) if (side(wire.a, wire.b, ground) !== 0) track.clearOf[wire.id] = ground;
      return;
    }

    for (const wire of this.wires) {
      // Measure from the last point that was clear of this wire, so a frame
      // that lands exactly on the line neither counts nor hides a crossing.
      const from = track.clearOf[wire.id];
      if (side(wire.a, wire.b, ground) !== 0) track.clearOf[wire.id] = ground;
      if (from) {
        const direction = crossing(wire.a, wire.b, from, ground);
        // One crossing a second per wire at most: a cow dithering on the
        // line is one cow, not six.
        if (!direction || t - (track.crossedAt[wire.id] ?? -Infinity) < 1) continue;
        track.crossedAt[wire.id] = t;
        const tally = ((this.counts[wire.id] ??= {})[track.kind] ??= { in: 0, out: 0 });
        tally[direction] += 1;
        events.push({ type: 'cross', track, wire, direction });
      }
    }
    for (const zone of this.zones) {
      const within = inside(zone.points, ground);
      const state = track.zones[zone.id];
      if (within && !state) {
        track.zones[zone.id] = { since: t, dwelt: false };
        events.push({ type: 'enter', track, zone });
      } else if (within && !state.dwelt && t - state.since >= (zone.dwell ?? 20)) {
        state.dwelt = true;
        events.push({ type: 'dwell', track, zone, seconds: Math.round(t - state.since) });
      } else if (!within && state) {
        delete track.zones[zone.id];
      }
    }
  }

  /**
   * Names of the zones a track is in now.
   *
   * @param {object} track A track.
   * @returns {string[]} Zone names.
   */
  zonesOf(track) {
    return this.zones.filter((zone) => track.zones[zone.id]).map((zone) => zone.name);
  }

  /**
   * Totals for one wire.
   *
   * @param {string} wireId Wire id.
   * @param {string} [kind] One kind, or all kinds summed.
   * @returns {{ in: number, out: number, net: number }} The count.
   */
  tally(wireId, kind) {
    const per = this.counts[wireId] || {};
    const rows = kind ? [per[kind] || { in: 0, out: 0 }] : Object.values(per);
    const total = rows.reduce((sum, row) => ({ in: sum.in + row.in, out: sum.out + row.out }), { in: 0, out: 0 });
    return { ...total, net: total.in - total.out };
  }
}

/**
 * Voice and typed commands: what the reader wants the dashboard to do.
 *
 * @param {string} text What was said.
 * @param {Array<{ id: string, title: string }>} slides The slides.
 * @returns {{ action: string, slide?: string }|null} The command, or null if it is a question.
 */
export function command(text, slides) {
  const q = String(text).toLowerCase().trim();
  if (/^(next|forward|siguiente|adelante)( slide| one)?[.!]?$/.test(q)) return { action: 'next' };
  if (/^(back|previous|go back|atr[aá]s|anterior)( slide| one)?[.!]?$/.test(q)) return { action: 'prev' };
  if (/\b(start|begin|arm|activa|enciende)\b.*\b(sentry|detector|watch|vigilancia)\b/.test(q)) return { action: 'sentry-on' };
  if (/\b(stop|disarm|end|apaga|det[eé]n)\b.*\b(sentry|detector|watch|vigilancia)\b/.test(q)) return { action: 'sentry-off' };
  if (/\b(quiet|silence|mute|hush|silencio|c[aá]llate)\b/.test(q)) return { action: 'mute' };
  const move = q.match(/^(?:go to|open|show(?: me)?|take me to|abre|ll[eé]vame a|ve a|muestra)\s+(?:the\s+|el\s+|la\s+|los\s+|las\s+)?(.+?)(?:\s+slide)?[.!]?$/);
  if (move) {
    const want = move[1];
    const alias = { alerts: 'events', alertas: 'events', cámaras: 'cameras', camaras: 'cameras', drone: 'drones', dron: 'drones', mapa: 'map', home: 'command', inicio: 'command', settings: 'setup', ajustes: 'setup', clima: 'weather', fuego: 'fire', ganado: 'livestock', cattle: 'livestock', radios: 'mesh', nanoowl: 'search', nanosam: 'segment', ai: 'vision', tracking: 'vision', sentry: 'vision' };
    const hit = slides.find((s) => s.id === want || s.id === alias[want]) || slides.find((s) => s.title.toLowerCase().includes(want));
    if (hit) return { action: 'go', slide: hit.id };
  }
  return null;
}
