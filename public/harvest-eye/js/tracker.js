/**
 * Frame-to-frame cluster tracking.
 *
 * Detection alone gives a fresh, anonymous set of boxes every frame, which
 * flickers and makes any per-fruit readout meaningless. The tracker matches
 * this frame's clusters to the previous frame's by box overlap, keeps a stable
 * label on each one, and smooths its maturity — so a fruit carries a readable
 * identity (`TM014`) and a settled number rather than a value that jitters with
 * every gust of wind.
 *
 * @module harvest-eye/tracker
 */

/**
 * Intersection over union of two boxes.
 *
 * @param {{x:number,y:number,w:number,h:number}} a First box.
 * @param {{x:number,y:number,w:number,h:number}} b Second box.
 * @returns {number} Overlap ratio in [0,1].
 */
export function iou(a, b) {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  const overlap = (x1 - x0) * (y1 - y0);
  return overlap / (a.w * a.h + b.w * b.h - overlap);
}

/** Tracks clusters across frames and assigns them stable identities. */
export class ClusterTracker {
  /**
   * @param {object} [options] Tracker tuning.
   * @param {string} [options.prefix='XX'] Two-letter identity prefix.
   * @param {number} [options.minIou=0.24] Overlap needed to call it the same fruit.
   * @param {number} [options.maxMissing=6] Frames a track survives unmatched.
   * @param {number} [options.smoothing=0.35] EMA weight for new measurements.
   */
  constructor(options = {}) {
    this.prefix = options.prefix || 'XX';
    this.minIou = options.minIou ?? 0.24;
    this.maxMissing = options.maxMissing ?? 6;
    this.smoothing = options.smoothing ?? 0.35;
    /** @type {Map<string, object>} */
    this.tracks = new Map();
    this.counter = 0;
  }

  /** Drop every track — used when the crop or camera changes. */
  reset() {
    this.tracks.clear();
    this.counter = 0;
  }

  /**
   * Mint the next identity, e.g. `TM007`.
   *
   * @returns {string} Stable label.
   */
  nextId() {
    this.counter += 1;
    return `${this.prefix}${String(this.counter).padStart(3, '0')}`;
  }

  /**
   * Fold a frame of detections into the track set.
   *
   * @param {import('./vision.js').Cluster[]} clusters This frame's detections.
   * @param {number} harvestAt Maturity threshold for the active crop.
   * @returns {{tracks:object[], ripened:object[]}} Live tracks (newest state)
   *   and the tracks that crossed the harvest threshold on this frame.
   */
  update(clusters, harvestAt) {
    const unmatched = new Set(this.tracks.keys());
    const ripened = [];
    const taken = new Set();

    // Greedy highest-overlap matching: with a couple of dozen boxes it is
    // indistinguishable from the Hungarian assignment and far cheaper.
    const pairs = [];
    for (let c = 0; c < clusters.length; c += 1) {
      for (const [id, track] of this.tracks) {
        const score = iou(clusters[c], track);
        if (score >= this.minIou) pairs.push({ c, id, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const claimed = new Set();
    for (const pair of pairs) {
      if (claimed.has(pair.c) || taken.has(pair.id)) continue;
      claimed.add(pair.c);
      taken.add(pair.id);
      unmatched.delete(pair.id);

      const track = this.tracks.get(pair.id);
      const cluster = clusters[pair.c];
      const wasReady = track.maturity >= harvestAt;
      const k = this.smoothing;
      track.x += (cluster.x - track.x) * 0.6;
      track.y += (cluster.y - track.y) * 0.6;
      track.w += (cluster.w - track.w) * 0.6;
      track.h += (cluster.h - track.h) * 0.6;
      track.maturity += (cluster.maturity - track.maturity) * k;
      track.confidence += (cluster.confidence - track.confidence) * k;
      track.count = cluster.count;
      track.stage = cluster.stage;
      track.color = cluster.color;
      track.hue = cluster.hue;
      track.area = cluster.area;
      track.missing = 0;
      track.age += 1;
      if (!wasReady && track.maturity >= harvestAt) ripened.push(track);
    }

    for (let c = 0; c < clusters.length; c += 1) {
      if (claimed.has(c)) continue;
      const cluster = clusters[c];
      const id = this.nextId();
      this.tracks.set(id, { ...cluster, id, missing: 0, age: 1 });
    }

    for (const id of unmatched) {
      const track = this.tracks.get(id);
      track.missing += 1;
      if (track.missing > this.maxMissing) this.tracks.delete(id);
    }

    const live = [...this.tracks.values()].filter((track) => track.missing === 0);
    return { tracks: live, ripened };
  }
}
