/**
 * Mapping a reservoir from a boat or an ROV, and being honest about drift.
 *
 * The specification said "sonar SLAM". The mapping half of that is genuine and
 * implemented here: a beam returns a range, the cells in front of the return are
 * free water, the cells at it are bottom or obstacle, and enough beams from
 * enough angles build an occupancy grid. That is real, it is cheap, and for a
 * ranch dam it answers questions worth money — how deep is it now, how much silt
 * came in this winter, how much water is actually in there.
 *
 * The localisation half is where the honesty has to go. Underwater there is no
 * satellite fix. A vehicle that knows only its heading and thrust accumulates
 * position error without bound: a degree of heading bias at half a metre per
 * second is roughly nine metres of cross-track error after ten minutes, and
 * nothing in the data tells the vehicle that it happened. Every map this module
 * produces therefore carries a drift estimate, and {@link matchScan} corrects the
 * pose against the map already built rather than pretending the dead reckoning
 * was right.
 *
 * That correction is what makes this SLAM-shaped rather than SLAM. It bounds
 * drift in a place with structure to match against; in the open middle of a
 * featureless dam it cannot, and the console says so instead of drawing a
 * confident line.
 *
 * @module black-optic-6/sonar
 */

/** Log-odds added to a cell a beam passed through. */
export const FREE_UPDATE = -0.35;

/** Log-odds added to a cell a beam returned from. */
export const HIT_UPDATE = 0.85;

/** Log-odds are clamped here so a cell can always be argued out of again. */
export const LOG_ODDS_LIMIT = 6;

/** Heading bias a small compass carries, in degrees. Drives the drift estimate. */
export const HEADING_BIAS_DEG = 1.0;

/**
 * An occupancy grid.
 *
 * @typedef {object} Grid
 * @property {number} cols Cells across.
 * @property {number} rows Cells down.
 * @property {number} cellM Metres per cell.
 * @property {Float32Array} logOdds Occupancy evidence per cell.
 * @property {{x: number, y: number}} origin Metres of the grid's south-west corner.
 */

/**
 * Build an empty grid.
 *
 * @param {object} options Extent.
 * @param {number} options.widthM Width of the area in metres.
 * @param {number} options.heightM Height of the area in metres.
 * @param {number} [options.cellM=0.5] Cell size in metres.
 * @returns {Grid} A grid with no evidence in it.
 */
export function createGrid({ widthM, heightM, cellM = 0.5 }) {
  const cols = Math.max(1, Math.ceil(widthM / cellM));
  const rows = Math.max(1, Math.ceil(heightM / cellM));
  return {
    cols,
    rows,
    cellM,
    logOdds: new Float32Array(cols * rows),
    origin: { x: 0, y: 0 },
  };
}

/**
 * The probability a cell is occupied.
 *
 * @param {Grid} grid The grid.
 * @param {number} col Column.
 * @param {number} row Row.
 * @returns {number} Probability 0..1; 0.5 where nothing is known.
 */
export function occupancy(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return 0.5;
  const odds = grid.logOdds[row * grid.cols + col];
  return 1 - 1 / (1 + Math.exp(odds));
}

/**
 * The cells a single beam crosses, and the cell it returned from.
 *
 * The beam is a cone, not a line, so the returned cell is widened by the beam
 * angle at that range. A 30° beam at 20 m is ten metres across — pretending it
 * was a ray puts sharp edges on a map that has none, which is the single most
 * common way a sonar picture flatters itself.
 *
 * @param {Grid} grid The grid.
 * @param {{x: number, y: number, headingDeg: number}} pose Vehicle pose in metres.
 * @param {number} bearingDeg Beam bearing relative to the vehicle.
 * @param {number} rangeM Range returned.
 * @param {number} [beamDeg=30] Beam width.
 * @returns {{free: number[], hit: number[], spreadM: number}} Cell indices.
 */
export function beamCells(grid, pose, bearingDeg, rangeM, beamDeg = 30) {
  const angle = ((pose.headingDeg + bearingDeg) * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = Math.cos(angle);
  const free = [];
  const hit = [];
  const step = grid.cellM * 0.5;

  const toCell = (x, y) => {
    const col = Math.floor((x - grid.origin.x) / grid.cellM);
    const row = Math.floor((y - grid.origin.y) / grid.cellM);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
    return row * grid.cols + col;
  };

  for (let travelled = 0; travelled < rangeM - grid.cellM; travelled += step) {
    const index = toCell(pose.x + dx * travelled, pose.y + dy * travelled);
    if (index >= 0 && !free.includes(index)) free.push(index);
  }

  // The return, spread across the cone's width at that range.
  const spreadM = 2 * rangeM * Math.tan((beamDeg / 2) * (Math.PI / 180));
  const across = Math.max(1, Math.round(spreadM / grid.cellM));
  const px = -dy;
  const py = dx;
  for (let i = -Math.floor(across / 2); i <= Math.floor(across / 2); i += 1) {
    const offset = i * grid.cellM;
    const index = toCell(
      pose.x + dx * rangeM + px * offset,
      pose.y + dy * rangeM + py * offset,
    );
    if (index >= 0 && !hit.includes(index)) hit.push(index);
  }

  return { free, hit, spreadM };
}

/**
 * Fold a scan into the grid.
 *
 * @param {Grid} grid The grid, modified in place.
 * @param {{x: number, y: number, headingDeg: number}} pose Vehicle pose.
 * @param {Array<{bearingDeg: number, rangeM: number}>} returns Beam returns.
 * @param {object} [options] Beam geometry.
 * @param {number} [options.beamDeg=30] Beam width.
 * @param {number} [options.maxRangeM=50] Returns beyond this are treated as no return.
 * @returns {{updated: number, hits: number}} What the scan changed.
 */
export function integrateScan(grid, pose, returns, options = {}) {
  const beamDeg = options.beamDeg ?? 30;
  const maxRangeM = options.maxRangeM ?? 50;
  let updated = 0;
  let hits = 0;

  for (const beam of returns) {
    if (!(beam.rangeM > 0) || beam.rangeM > maxRangeM) continue;
    const { free, hit } = beamCells(grid, pose, beam.bearingDeg, beam.rangeM, beamDeg);
    for (const index of free) {
      grid.logOdds[index] = Math.max(-LOG_ODDS_LIMIT, grid.logOdds[index] + FREE_UPDATE);
      updated += 1;
    }
    for (const index of hit) {
      grid.logOdds[index] = Math.min(LOG_ODDS_LIMIT, grid.logOdds[index] + HIT_UPDATE);
      updated += 1;
      hits += 1;
    }
  }

  return { updated, hits };
}

/**
 * Advance a pose by thrust and heading alone.
 *
 * @param {{x: number, y: number, headingDeg: number, driftM: number, elapsedSec: number}} pose Current pose.
 * @param {object} motion How it moved.
 * @param {number} motion.speedMps Forward speed.
 * @param {number} motion.headingDeg Heading commanded.
 * @param {number} motion.dtSec Seconds elapsed.
 * @returns {object} The new pose, with its accumulated drift estimate.
 */
export function deadReckon(pose, { speedMps, headingDeg, dtSec }) {
  const angle = (headingDeg * Math.PI) / 180;
  const elapsedSec = (pose.elapsedSec ?? 0) + dtSec;
  return {
    x: pose.x + Math.sin(angle) * speedMps * dtSec,
    y: pose.y + Math.cos(angle) * speedMps * dtSec,
    headingDeg,
    elapsedSec,
    driftM: driftEstimate(elapsedSec, speedMps),
  };
}

/**
 * How far the true position may have wandered from the reckoned one.
 *
 * Cross-track error from a constant heading bias grows linearly with distance
 * travelled — it is not noise that averages out, which is the part that catches
 * people. This is the number that decides whether a map is worth trusting.
 *
 * @param {number} elapsedSec Seconds of dead reckoning since the last fix.
 * @param {number} speedMps Speed over ground.
 * @param {number} [biasDeg=HEADING_BIAS_DEG] Heading bias of the compass.
 * @returns {number} Metres of likely position error.
 */
export function driftEstimate(elapsedSec, speedMps, biasDeg = HEADING_BIAS_DEG) {
  const distance = Math.max(0, elapsedSec) * Math.max(0, speedMps);
  return distance * Math.tan((biasDeg * Math.PI) / 180);
}

/**
 * Correct a pose by matching a scan against the map already built.
 *
 * An exhaustive search over small translations, scoring each by how well the
 * returns land on cells the map already believes are occupied. Crude, and it is
 * what bounds the drift: in a dam with a wall, a bank and a jetty there is
 * something to lock onto, and the score says whether there was.
 *
 * @param {Grid} grid The map so far.
 * @param {object} pose The reckoned pose.
 * @param {Array<{bearingDeg: number, rangeM: number}>} returns The new scan.
 * @param {object} [options] Search extent.
 * @param {number} [options.radiusM=2] How far to search in each direction.
 * @param {number} [options.stepM] Search step; defaults to one cell.
 * @returns {{pose: object, score: number, improvement: number, confident: boolean}}
 *   The corrected pose and whether the match is worth taking.
 */
export function matchScan(grid, pose, returns, options = {}) {
  const radiusM = options.radiusM ?? 2;
  const stepM = options.stepM ?? grid.cellM;

  /**
   * Score a candidate pose by how well its returns agree with the map.
   *
   * @param {object} candidate Pose to score.
   * @returns {number} Total occupancy evidence under the returns.
   */
  const score = (candidate) => {
    let total = 0;
    for (const beam of returns) {
      if (!(beam.rangeM > 0)) continue;
      const angle = ((candidate.headingDeg + beam.bearingDeg) * Math.PI) / 180;
      const x = candidate.x + Math.sin(angle) * beam.rangeM;
      const y = candidate.y + Math.cos(angle) * beam.rangeM;
      const col = Math.floor((x - grid.origin.x) / grid.cellM);
      const row = Math.floor((y - grid.origin.y) / grid.cellM);
      total += occupancy(grid, col, row);
    }
    return total;
  };

  const base = score(pose);
  let best = { pose, value: base };

  for (let dx = -radiusM; dx <= radiusM; dx += stepM) {
    for (let dy = -radiusM; dy <= radiusM; dy += stepM) {
      const candidate = { ...pose, x: pose.x + dx, y: pose.y + dy };
      const value = score(candidate);
      if (value > best.value) best = { pose: candidate, value };
    }
  }

  const improvement = best.value - base;
  // A match that barely beats where you already thought you were is noise, and
  // taking it walks the map sideways one cell at a time.
  const confident = returns.length >= 8 && improvement > returns.length * 0.05;

  return {
    pose: confident ? { ...best.pose, driftM: 0, elapsedSec: 0 } : pose,
    score: best.value,
    improvement,
    confident,
  };
}

/**
 * A depth profile and the water it implies.
 *
 * The reason to put a sonar on a ranch dam at all: capacity now against capacity
 * when it was dug, which is the silt that came in.
 *
 * @param {Array<{depthM: number}>} soundings Depth readings along a track.
 * @param {number} surfaceAreaM2 Surface area of the water.
 * @returns {{count: number, meanDepthM: number, maxDepthM: number,
 *   volumeM3: number, megalitres: number, note: string}} The survey.
 */
export function capacity(soundings, surfaceAreaM2) {
  const depths = soundings.map((s) => s.depthM).filter((d) => Number.isFinite(d) && d >= 0);
  if (!depths.length || !(surfaceAreaM2 > 0)) {
    return {
      count: 0, meanDepthM: 0, maxDepthM: 0, volumeM3: 0, megalitres: 0,
      note: 'No soundings, or no surface area to multiply them by.',
    };
  }
  const meanDepthM = depths.reduce((sum, d) => sum + d, 0) / depths.length;
  const maxDepthM = Math.max(...depths);
  // Mean depth times area is the prism estimate. A dam with sloping sides holds
  // less than that, and the error is larger the steeper the banks — so the
  // number is presented as an upper bound rather than a measurement.
  const volumeM3 = meanDepthM * surfaceAreaM2;
  return {
    count: depths.length,
    meanDepthM,
    maxDepthM,
    volumeM3,
    megalitres: volumeM3 / 1000,
    note: depths.length < 20
      ? `Only ${depths.length} soundings. Run more track lines before believing the volume.`
      : 'Prism estimate — mean depth times surface area. Sloping banks make this an upper bound.',
  };
}

/**
 * How much of the grid has been surveyed.
 *
 * @param {Grid} grid The grid.
 * @returns {{known: number, fraction: number, occupied: number}} Coverage.
 */
export function coverage(grid) {
  let known = 0;
  let occupied = 0;
  for (let i = 0; i < grid.logOdds.length; i += 1) {
    if (grid.logOdds[i] === 0) continue;
    known += 1;
    if (grid.logOdds[i] > 0) occupied += 1;
  }
  return { known, fraction: known / grid.logOdds.length, occupied };
}
