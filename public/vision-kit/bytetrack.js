/**
 * Multi-object tracking in the style of ByteTrack (Zhang et al., 2022), plus the event
 * detectors built on top of it: a counting line for gates, and a fall / inactivity watch.
 *
 * ByteTrack's one idea is simple and it is what makes it robust: do not throw away
 * low-confidence detections. A person half hidden behind a post, or a sheep in long grass,
 * often scores 0.2 — below any sensible "new object" threshold — but it is exactly the
 * detection that keeps an existing track alive. So association happens twice:
 *
 *   1. high-confidence detections against every track (confirmed and recently lost), then
 *   2. the leftover low-confidence detections against the still-unmatched confirmed tracks.
 *
 * Only unmatched *high* detections are allowed to start a new track. Motion prediction is a
 * constant-velocity alpha–beta filter on box centre and size (with one sensor and no covariance
 * to propagate, a Kalman filter reduces to this pair of gains). Matching is greedy by IoU within
 * a class; the reference uses the Hungarian method, which differs only when several boxes
 * overlap the same track almost equally.
 *
 * Pure: no DOM, no camera. Boxes are [x, y, w, h] in pixels (top-left origin).
 *
 * @module vision-kit/bytetrack
 */

/** Intersection over union of two [x, y, w, h] boxes. */
export function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

const centre = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];

/** Greedy maximum-IoU assignment between tracks and detections of the same class. */
function associate(tracks, dets, minIou) {
  const pairs = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = 0; j < dets.length; j++) {
      if (tracks[i].cls !== dets[j].cls) continue;
      const s = iou(tracks[i].pred, dets[j].box);
      if (s >= minIou) pairs.push([s, i, j]);
    }
  }
  pairs.sort((p, q) => q[0] - p[0]);
  const usedT = new Set();
  const usedD = new Set();
  const matches = [];
  for (const [, i, j] of pairs) {
    if (usedT.has(i) || usedD.has(j)) continue;
    usedT.add(i);
    usedD.add(j);
    matches.push([i, j]);
  }
  return {
    matches,
    unmatchedTracks: tracks.map((_, i) => i).filter((i) => !usedT.has(i)),
    unmatchedDets: dets.map((_, j) => j).filter((j) => !usedD.has(j)),
  };
}

export const DEFAULTS = Object.freeze({
  /** Detections at or above this score may start tracks and are matched first. */
  highThresh: 0.5,
  /** Detections below this are discarded entirely. */
  lowThresh: 0.1,
  /** IoU needed to match a high detection to a predicted track box. */
  matchIou: 0.25,
  /** IoU needed in the second (low-score) pass — stricter, since the evidence is weaker. */
  lowMatchIou: 0.4,
  /** Frames a track may coast unmatched before it is removed. */
  maxLost: 30,
  /** Consecutive hits before a tentative track is confirmed. */
  minHits: 3,
  /** Alpha–beta gains for position and velocity. */
  alpha: 0.6,
  beta: 0.15,
  /** Trail points kept per track. */
  trail: 40,
});

/**
 * @typedef {object} Detection
 * @property {number[]} box [x, y, w, h]
 * @property {number} score 0..1
 * @property {string} cls class label, e.g. 'person', 'sheep'
 */

export class ByteTracker {
  /** @param {Partial<typeof DEFAULTS>} [opts] */
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    /** @type {object[]} */
    this.tracks = [];
    this.nextId = 1;
    this.frame = 0;
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
    this.frame = 0;
  }

  /** Predict every track one frame ahead (constant velocity on centre and size). */
  predict() {
    for (const t of this.tracks) {
      const [x, y, w, h] = t.box;
      const [vx, vy, vw, vh] = t.vel;
      t.pred = [x + vx, y + vy, Math.max(2, w + vw), Math.max(2, h + vh)];
    }
  }

  /**
   * Feed one frame of detections; returns the confirmed, currently-visible tracks.
   * @param {Detection[]} detections
   */
  update(detections) {
    const o = this.o;
    this.frame++;
    this.predict();
    const dets = detections.filter((d) => d.score >= o.lowThresh);
    const high = dets.filter((d) => d.score >= o.highThresh);
    const low = dets.filter((d) => d.score < o.highThresh);

    // Pass 1: high-confidence detections against all tracks.
    const a1 = associate(this.tracks, high, o.matchIou);
    for (const [i, j] of a1.matches) this.correct(this.tracks[i], high[j]);

    // Pass 2: low-confidence detections rescue confirmed tracks that pass 1 missed.
    const remaining = a1.unmatchedTracks.map((i) => this.tracks[i]).filter((t) => t.state === 'confirmed');
    const a2 = associate(remaining, low, o.lowMatchIou);
    const rescued = new Set();
    for (const [i, j] of a2.matches) {
      this.correct(remaining[i], low[j]);
      rescued.add(remaining[i]);
    }

    // Unmatched tracks coast; tentative ones that miss are dropped immediately.
    for (const i of a1.unmatchedTracks) {
      const t = this.tracks[i];
      if (rescued.has(t)) continue;
      t.lost++;
      t.hitStreak = 0;
      t.box = t.pred;
      if (t.state === 'confirmed') t.state = 'lost';
      if (t.state === 'tentative') t.dead = true;
      if (t.lost > o.maxLost) t.dead = true;
    }

    // Unmatched high detections start new tentative tracks.
    for (const j of a1.unmatchedDets) {
      const d = high[j];
      this.tracks.push({
        id: this.nextId++,
        cls: d.cls,
        box: d.box.slice(),
        pred: d.box.slice(),
        vel: [0, 0, 0, 0],
        score: d.score,
        hits: 1,
        hitStreak: 1,
        lost: 0,
        age: 0,
        born: this.frame,
        state: o.minHits <= 1 ? 'confirmed' : 'tentative',
        trail: [centre(d.box)],
      });
    }
    this.tracks = this.tracks.filter((t) => !t.dead);
    for (const t of this.tracks) t.age++;
    return this.visible();
  }

  /** Alpha–beta correction of a track toward a matched detection. */
  correct(t, d) {
    const o = this.o;
    const r = t.pred.map((p, k) => d.box[k] - p);
    t.box = t.pred.map((p, k) => p + o.alpha * r[k]);
    t.vel = t.vel.map((v, k) => v + o.beta * r[k]);
    t.score = d.score;
    t.hits++;
    t.hitStreak++;
    t.lost = 0;
    if (t.state === 'lost' || (t.state === 'tentative' && t.hitStreak >= o.minHits)) t.state = 'confirmed';
    t.trail.push(centre(t.box));
    if (t.trail.length > o.trail) t.trail.shift();
  }

  /** Confirmed tracks seen this frame. */
  visible() {
    return this.tracks.filter((t) => t.state === 'confirmed' && t.lost === 0);
  }

  /** Count of confirmed tracks per class. */
  counts() {
    const c = {};
    for (const t of this.tracks) if (t.state !== 'tentative') c[t.cls] = (c[t.cls] ?? 0) + 1;
    return c;
  }
}

/**
 * A virtual counting line, e.g. across a gate. A track is counted once each time its centre
 * crosses the line, as "in" or "out" by the side it ends up on.
 */
export class LineCounter {
  /** @param {[number, number]} a @param {[number, number]} b */
  constructor(a, b) {
    this.a = a;
    this.b = b;
    this.side = new Map();
    this.in = 0;
    this.out = 0;
    this.byClass = {};
  }

  /** Which side of the line (sign of the cross product) a point is on. */
  sideOf(p) {
    const [ax, ay] = this.a;
    const [bx, by] = this.b;
    return Math.sign((bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax));
  }

  /** @param {{id:number, cls:string, box:number[]}[]} tracks */
  update(tracks) {
    const events = [];
    for (const t of tracks) {
      const s = this.sideOf(centre(t.box));
      const prev = this.side.get(t.id);
      if (prev !== undefined && s !== 0 && prev !== 0 && s !== prev) {
        const dir = s > 0 ? 'in' : 'out';
        this[dir]++;
        const k = this.byClass[t.cls] ?? { in: 0, out: 0 };
        k[dir]++;
        this.byClass[t.cls] = k;
        events.push({ id: t.id, cls: t.cls, dir });
      }
      if (s !== 0) this.side.set(t.id, s);
    }
    return events;
  }

  get net() {
    return this.in - this.out;
  }
}

/**
 * Fall and inactivity watch for tracked people.
 *
 * A fall in a camera view has a signature: the box's centre drops fast relative to the
 * person's own height, and the box turns from tall to wide. A fall is flagged only when both
 * happen within a short window and the person then stays low — a person sitting down drops
 * slowly, and a person bending over springs back. Inactivity is a separate alert: no
 * meaningful movement for a long time.
 */
export class FallWatch {
  constructor({ fps = 10, dropRatio = 0.35, wide = 1.15, confirmSec = 2, stillSec = 60 } = {}) {
    this.o = { fps, dropRatio, wide, confirmSec, stillSec };
    this.state = new Map();
  }

  /**
   * @param {{id:number, cls:string, box:number[]}[]} tracks
   * @param {number} t seconds
   * @returns {{id:number, type:'fall'|'inactive'|'recovered', t:number}[]}
   */
  update(tracks, t) {
    const o = this.o;
    const events = [];
    for (const tr of tracks) {
      if (tr.cls !== 'person') continue;
      const [, y, w, h] = tr.box;
      const cy = y + h / 2;
      let s = this.state.get(tr.id);
      if (!s) {
        s = { hist: [], down: null, fallen: false, lastMove: t, lastPos: [tr.box[0] + w / 2, cy], inactive: false, height: h };
        this.state.set(tr.id, s);
      }
      s.hist.push({ t, cy, h, ar: w / Math.max(1, h) });
      while (s.hist.length && t - s.hist[0].t > 1.0) s.hist.shift();
      if (h > w) s.height = s.height * 0.9 + h * 0.1; // standing height, learned while upright
      const first = s.hist[0];
      const drop = (cy - first.cy) / Math.max(1, s.height);
      const lying = w / Math.max(1, h) >= o.wide;
      if (!s.fallen && drop >= o.dropRatio && lying && s.down === null) s.down = t;
      if (s.down !== null && !s.fallen) {
        if (!lying) s.down = null;
        else if (t - s.down >= o.confirmSec) {
          s.fallen = true;
          events.push({ id: tr.id, type: 'fall', t });
        }
      }
      if (s.fallen && !lying) {
        s.fallen = false;
        s.down = null;
        events.push({ id: tr.id, type: 'recovered', t });
      }
      const pos = [tr.box[0] + w / 2, cy];
      if (Math.hypot(pos[0] - s.lastPos[0], pos[1] - s.lastPos[1]) > 0.15 * s.height) {
        s.lastMove = t;
        s.lastPos = pos;
        s.inactive = false;
      } else if (!s.inactive && t - s.lastMove >= o.stillSec) {
        s.inactive = true;
        events.push({ id: tr.id, type: 'inactive', t });
      }
    }
    return events;
  }
}
