/**
 * Multi-object tracker (SORT-style, without the Kalman filter): each frame's
 * detections are matched to existing tracks greedily by IoU, then by centroid
 * distance as a fallback for small, fast objects. Tracks survive a few missed
 * frames so a car briefly occluded by a pedestrian keeps its identity.
 *
 * Identity is what makes line counting and dwell time possible: a detector
 * alone only says "there is a car", a tracker says "car #14 crossed the gate".
 *
 * @module vulture/tracker
 */

import { iou } from './geometry.js';

/**
 * @typedef {object} Detection
 * @property {string} label COCO class name (car, person …).
 * @property {number} score Confidence in [0,1].
 * @property {number} x Box left, normalised.
 * @property {number} y Box top, normalised.
 * @property {number} w Box width, normalised.
 * @property {number} h Box height, normalised.
 */

/**
 * @typedef {object} Track
 * @property {number} id Stable identity.
 * @property {string} label Class.
 * @property {number} score Last confidence.
 * @property {{x:number,y:number,w:number,h:number}} box Last box.
 * @property {{x:number,y:number}} foot Ground-contact point (bottom centre).
 * @property {{x:number,y:number}|null} prevFoot Previous ground point.
 * @property {number} hits Frames matched.
 * @property {number} misses Consecutive frames unmatched.
 * @property {number} firstSeen Timestamp (ms).
 * @property {number} lastSeen Timestamp (ms).
 * @property {boolean} confirmed Seen in enough frames to trust.
 */

/** Classes that compete for the same tracks (a "truck" can flicker to "car"). */
const FAMILY = { car: 'vehicle', truck: 'vehicle', bus: 'vehicle', motorcycle: 'vehicle', bicycle: 'cycle', person: 'person' };
const familyOf = (label) => FAMILY[label] ?? label;

export class Tracker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.iouMin=0.2] Minimum IoU to associate.
   * @param {number} [opts.distMax=0.08] Fallback max centroid distance.
   * @param {number} [opts.maxMisses=8] Frames a track may go unseen.
   * @param {number} [opts.minHits=2] Frames before a track is confirmed.
   */
  constructor({ iouMin = 0.2, distMax = 0.08, maxMisses = 8, minHits = 2 } = {}) {
    Object.assign(this, { iouMin, distMax, maxMisses, minHits });
    /** @type {Track[]} */
    this.tracks = [];
    this.nextId = 1;
  }

  /**
   * Advance one frame.
   *
   * @param {Detection[]} dets Detections for this frame.
   * @param {number} t Timestamp in ms.
   * @returns {Track[]} Confirmed, currently visible tracks.
   */
  update(dets, t) {
    const pairs = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      const tr = this.tracks[ti];
      for (let di = 0; di < dets.length; di++) {
        const d = dets[di];
        if (familyOf(d.label) !== familyOf(tr.label)) continue;
        const o = iou(tr.box, d);
        if (o >= this.iouMin) { pairs.push([o + 1, ti, di]); continue; }
        const dist = Math.hypot(tr.box.x + tr.box.w / 2 - d.x - d.w / 2, tr.box.y + tr.box.h / 2 - d.y - d.h / 2);
        if (dist <= this.distMax) pairs.push([1 - dist / this.distMax, ti, di]);
      }
    }
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set();
    const usedD = new Set();
    for (const [, ti, di] of pairs) {
      if (usedT.has(ti) || usedD.has(di)) continue;
      usedT.add(ti); usedD.add(di);
      const tr = this.tracks[ti];
      const d = dets[di];
      tr.prevFoot = tr.foot;
      tr.box = { x: d.x, y: d.y, w: d.w, h: d.h };
      tr.foot = { x: d.x + d.w / 2, y: d.y + d.h };
      tr.label = d.label;
      tr.score = d.score;
      tr.hits++;
      tr.misses = 0;
      tr.lastSeen = t;
      if (tr.hits >= this.minHits) tr.confirmed = true;
    }
    this.tracks.forEach((tr, ti) => { if (!usedT.has(ti)) { tr.misses++; tr.prevFoot = tr.foot; } });
    this.tracks = this.tracks.filter((tr) => tr.misses <= this.maxMisses);
    dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      this.tracks.push({
        id: this.nextId++, label: d.label, score: d.score,
        box: { x: d.x, y: d.y, w: d.w, h: d.h },
        foot: { x: d.x + d.w / 2, y: d.y + d.h }, prevFoot: null,
        hits: 1, misses: 0, firstSeen: t, lastSeen: t, confirmed: this.minHits <= 1,
      });
    });
    return this.visible();
  }

  /** @returns {Track[]} Confirmed tracks matched this frame. */
  visible() {
    return this.tracks.filter((tr) => tr.confirmed && tr.misses === 0);
  }

  reset() {
    this.tracks = [];
  }
}

export { familyOf };
