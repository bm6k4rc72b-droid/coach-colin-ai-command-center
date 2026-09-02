/**
 * Row-walk mode — a ripeness transect of a whole row.
 *
 * A single framed photo tells you about one bush. Row-walk keeps the detector
 * running while the operator walks the row with the phone held out, bins the
 * readings by distance travelled, and hands back a strip showing where the ripe
 * fruit actually is. Picking crews get sent to metre 40, not "the north block".
 *
 * @module harvest-eye/rowwalk
 */

/** Mean Earth radius in metres. */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Great-circle distance between two fixes.
 *
 * @param {{lat:number, lon:number}} a First fix.
 * @param {{lat:number, lon:number}} b Second fix.
 * @returns {number} Distance in metres.
 */
export function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Accumulates geotagged maturity readings into distance-binned segments. */
export class RowWalk {
  /**
   * @param {object} [options] Walk options.
   * @param {number} [options.binMetres=5] Length of each strip segment.
   * @param {number} [options.maxAccuracy=25] Fixes worse than this are dropped;
   *   a 60 m fix under a canopy would smear the whole transect.
   */
  constructor(options = {}) {
    this.binMetres = options.binMetres ?? 5;
    this.maxAccuracy = options.maxAccuracy ?? 25;
    this.reset();
  }

  /** Start a fresh transect. */
  reset() {
    /** @type {Array<object>} */
    this.samples = [];
    /** @type {Array<object>} */
    this.bins = [];
    this.distance = 0;
    this.last = null;
    this.startedAt = null;
  }

  /**
   * Fold one reading into the transect.
   *
   * @param {object} sample Reading.
   * @param {number} sample.maturity Frame mean maturity.
   * @param {number} sample.readyShare Ripe fraction of detected fruit.
   * @param {number} sample.fruit Estimated fruit in view.
   * @param {number} [sample.lat] Latitude, when a fix is available.
   * @param {number} [sample.lon] Longitude.
   * @param {number} [sample.accuracy] Fix accuracy in metres.
   * @param {number} [sample.ts=Date.now()] Capture time.
   * @returns {object|null} The bin the sample landed in, or null if dropped.
   */
  add(sample) {
    const ts = sample.ts ?? Date.now();
    if (this.startedAt === null) this.startedAt = ts;

    const fixed = Number.isFinite(sample.lat) && Number.isFinite(sample.lon)
      && (!Number.isFinite(sample.accuracy) || sample.accuracy <= this.maxAccuracy);
    if (fixed) {
      if (this.last) {
        const step = haversine(this.last, sample);
        // Sub-metre steps are GPS jitter, not walking; counting them would
        // inflate the transect length by tens of percent over a long row.
        if (step >= 1) {
          this.distance += step;
          this.last = { lat: sample.lat, lon: sample.lon };
        }
      } else {
        this.last = { lat: sample.lat, lon: sample.lon };
      }
    }

    const record = { ...sample, ts, distance: this.distance };
    this.samples.push(record);

    const index = Math.floor(this.distance / this.binMetres);
    let bin = this.bins[index];
    if (!bin) {
      bin = {
        index,
        startMetre: index * this.binMetres,
        samples: 0,
        maturitySum: 0,
        readySum: 0,
        fruitSum: 0,
        lat: sample.lat ?? null,
        lon: sample.lon ?? null,
      };
      this.bins[index] = bin;
    }
    bin.samples += 1;
    bin.maturitySum += sample.maturity || 0;
    bin.readySum += sample.readyShare || 0;
    bin.fruitSum += sample.fruit || 0;
    return bin;
  }

  /**
   * Collapse the bins into a renderable strip.
   *
   * @returns {Array<{index:number,startMetre:number,maturity:number,readyShare:number,fruit:number,lat:number|null,lon:number|null}>}
   *   One entry per bin, gaps included as empty bins so the strip stays to scale.
   */
  strip() {
    const out = [];
    for (let i = 0; i < this.bins.length; i += 1) {
      const bin = this.bins[i];
      out.push(bin && bin.samples
        ? {
          index: i,
          startMetre: i * this.binMetres,
          maturity: bin.maturitySum / bin.samples,
          readyShare: bin.readySum / bin.samples,
          fruit: bin.fruitSum / bin.samples,
          lat: bin.lat,
          lon: bin.lon,
        }
        : {
          index: i,
          startMetre: i * this.binMetres,
          maturity: 0,
          readyShare: 0,
          fruit: 0,
          lat: null,
          lon: null,
        });
    }
    return out;
  }

  /**
   * Transect summary for the results card.
   *
   * @returns {{
   *   distance:number, samples:number, meanMaturity:number, readyShare:number,
   *   fruitPerMetre:number, hotspots:Array<object>, durationMs:number
   * }} Summary of the walk. `hotspots` are the ripest bins, richest first.
   */
  summary() {
    const strip = this.strip().filter((bin) => bin.fruit > 0 || bin.maturity > 0);
    const n = strip.length || 1;
    const meanMaturity = strip.reduce((sum, bin) => sum + bin.maturity, 0) / n;
    const readyShare = strip.reduce((sum, bin) => sum + bin.readyShare, 0) / n;
    const fruit = strip.reduce((sum, bin) => sum + bin.fruit, 0);
    const hotspots = [...strip]
      .sort((a, b) => b.readyShare * b.fruit - a.readyShare * a.fruit)
      .slice(0, 3);
    const lastTs = this.samples.length ? this.samples[this.samples.length - 1].ts : 0;
    return {
      distance: this.distance,
      samples: this.samples.length,
      meanMaturity,
      readyShare,
      fruitPerMetre: this.distance > 1 ? fruit / this.distance : 0,
      hotspots,
      durationMs: this.startedAt ? lastTs - this.startedAt : 0,
    };
  }
}
