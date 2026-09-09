/**
 * Turning tracks into the numbers a coach reads, with their caveats attached.
 *
 * A distance-covered column is only as good as the tracking under it, and the
 * tracking here is honest about being partial: players walk out of frame, blobs
 * merge, a substitute inherits nothing. So every player row carries how much of
 * the session that player was actually visible for, and the app puts it beside
 * the number rather than in a footnote.
 *
 * This matters more than it sounds. Nine kilometres is a normal match total; a
 * player tracked for a third of the session and reported as covering three
 * kilometres has not run a third as far, they were only watched for a third as
 * long. Without the coverage figure the two are indistinguishable, and coaches
 * make substitutions on that difference.
 *
 * Nothing here extrapolates. A player seen for four minutes gets four minutes
 * of measurements, not a projected ninety.
 *
 * @module touchline/metrics
 */

import { HIGH_INTENSITY_MPS, SPRINT_MPS, netDisplacement } from './track.js';

/** Shortest track that gets a row of its own, milliseconds. */
export const MIN_TRACK_MS = 3000;

/**
 * Summarise one player.
 *
 * @param {object} track A track from the tracker.
 * @param {number} sessionMs How long the session has been running.
 * @returns {{
 *   id: number, label: string, team: string,
 *   distanceM: number, highIntensityM: number, sprints: number,
 *   topSpeedKph: number, speedKph: number,
 *   seenMs: number, coverage: number,
 *   metresPerMinute: number,
 *   position: {x: number, y: number}, displacementM: number
 * }} One row of the player table.
 */
export function playerRow(track, sessionMs) {
  const seenMs = Math.max(0, (track.lastSeenMs ?? track.firstSeenMs) - track.firstSeenMs);
  const minutes = seenMs / 60000;
  return {
    id: track.id,
    label: track.label,
    team: track.team ?? 'other',
    distanceM: track.distanceM,
    highIntensityM: track.highIntensityM,
    sprints: track.sprints,
    topSpeedKph: track.topSpeedMps * 3.6,
    speedKph: track.speedMps * 3.6,
    seenMs,
    coverage: sessionMs > 0 ? Math.min(1, seenMs / sessionMs) : 0,
    // Per minute of being watched, not per minute of the match. The two differ
    // whenever tracking is partial, which is always.
    metresPerMinute: minutes > 0.05 ? track.distanceM / minutes : 0,
    position: { x: track.x, y: track.y },
    displacementM: netDisplacement(track.path),
  };
}

/**
 * Build the player table.
 *
 * @param {object[]} tracks Confirmed tracks.
 * @param {number} sessionMs Session length.
 * @param {number} [minTrackMs=MIN_TRACK_MS] Shortest track to include.
 * @returns {object[]} Rows, longest-tracked first.
 */
export function playerTable(tracks, sessionMs, minTrackMs = MIN_TRACK_MS) {
  return tracks
    .map((track) => playerRow(track, sessionMs))
    .filter((row) => row.seenMs >= minTrackMs)
    .sort((a, b) => b.distanceM - a.distanceM);
}

/**
 * Aggregate a team's rows.
 *
 * The totals are sums over the players the app actually saw, and `tracked`
 * says how many that was. A team total is not a squad total unless `tracked`
 * says eleven, and it usually does not.
 *
 * @param {object[]} rows Player rows for one team.
 * @returns {{
 *   tracked: number, distanceM: number, highIntensityM: number,
 *   sprints: number, topSpeedKph: number, meanCoverage: number
 * }} Team totals.
 */
export function teamTotals(rows) {
  const totals = {
    tracked: rows.length,
    distanceM: 0,
    highIntensityM: 0,
    sprints: 0,
    topSpeedKph: 0,
    meanCoverage: 0,
  };
  for (const row of rows) {
    totals.distanceM += row.distanceM;
    totals.highIntensityM += row.highIntensityM;
    totals.sprints += row.sprints;
    if (row.topSpeedKph > totals.topSpeedKph) totals.topSpeedKph = row.topSpeedKph;
    totals.meanCoverage += row.coverage;
  }
  if (rows.length) totals.meanCoverage /= rows.length;
  return totals;
}

/**
 * A heat map of where one player spent their time.
 *
 * Built from the path rather than from every frame, so standing still does not
 * pile a hundred samples into one cell and make a stationary player look like
 * the busiest on the pitch. Each path point carries the time until the next
 * one, and the map is in seconds.
 *
 * @param {{t: number, x: number, y: number}[]} path Path samples.
 * @param {object} [options] Grid options.
 * @param {{lengthM: number, widthM: number}} [options.dimensions] Pitch size.
 * @param {number} [options.cellM=5] Cell size, metres.
 * @returns {{cols: number, rows: number, cellM: number, seconds: Float32Array,
 *   peak: number}} Occupancy in seconds per cell.
 */
export function occupancy(path, options = {}) {
  const dimensions = options.dimensions ?? { lengthM: 105, widthM: 68 };
  const cellM = options.cellM ?? 5;
  const cols = Math.max(1, Math.round(dimensions.lengthM / cellM));
  const rows = Math.max(1, Math.round(dimensions.widthM / cellM));
  const seconds = new Float32Array(cols * rows);
  let peak = 0;
  for (let i = 0; i < path.length; i += 1) {
    const point = path[i];
    const next = path[i + 1];
    const dwell = next ? Math.min(5, (next.t - point.t) / 1000) : 0;
    const col = Math.floor(point.x / cellM);
    const row = Math.floor(point.y / cellM);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const cell = row * cols + col;
    seconds[cell] += dwell;
    if (seconds[cell] > peak) peak = seconds[cell];
  }
  return { cols, rows, cellM, seconds, peak };
}

/**
 * The thresholds the running numbers were measured against.
 *
 * Exposed so the interface can print them next to the figures. "Sprints: 4" is
 * meaningless without "a sprint is 25.2 km/h held for 0.7 s", and different
 * providers use different thresholds, which is why two systems watching the
 * same match disagree.
 *
 * @returns {{highIntensityKph: number, sprintKph: number}} The definitions.
 */
export function definitions() {
  return {
    highIntensityKph: HIGH_INTENSITY_MPS * 3.6,
    sprintKph: SPRINT_MPS * 3.6,
  };
}
