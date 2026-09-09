/**
 * Who would get there first — territory as a measurement rather than a mood.
 *
 * "Controlling space" is the phrase every commentator reaches for and almost
 * nobody defines. It has a definition that can be computed from positions and
 * velocities alone, and this module uses the plainest one: a patch of grass
 * belongs to whichever player would reach it first, and a team's territory is
 * the patch of pitch its players would win.
 *
 * The refinement over drawing a Voronoi diagram of standing positions is that
 * players are moving. A full-back sprinting forward already owns the ten metres
 * in front of them in a way a stationary player does not, and a Voronoi of
 * positions says otherwise. So each player is projected forward along their
 * current velocity for a short horizon before the cells are handed out, which
 * is the cheapest honest way to put momentum into the picture.
 *
 * What this is not: it is not expected threat, it is not a probability that a
 * pass into a zone succeeds, and it does not know where the ball is going. It
 * is a map of who is closest, in time rather than in metres, and it is drawn as
 * a map rather than reduced to a single number that would hide how it was made.
 *
 * The horizon is the one free parameter and it is stated: {@link REACH_HORIZON_S}.
 * At zero it is an ordinary Voronoi diagram; too long and everyone's territory
 * is wherever they happen to be pointing.
 *
 * @module touchline/space
 */

import { FULL_PITCH } from './pitch.js';

/** How far ahead a player's momentum is projected, seconds. */
export const REACH_HORIZON_S = 0.7;

/** Default grid resolution, metres. */
export const CELL_M = 2;

/**
 * Divide the pitch between the players on it.
 *
 * @param {{id: number, x: number, y: number, vx?: number, vy?: number,
 *   team: string}[]} players Players with their team labels.
 * @param {object} [options] Grid options.
 * @param {{lengthM: number, widthM: number}} [options.dimensions=FULL_PITCH] Pitch.
 * @param {number} [options.cellM=CELL_M] Cell size, metres.
 * @param {number} [options.horizonS=REACH_HORIZON_S] Momentum horizon.
 * @returns {{
 *   cols: number, rows: number, cellM: number,
 *   owner: Int16Array, team: Uint8Array,
 *   shares: {home: number, away: number, other: number},
 *   areas: {home: number, away: number, other: number}
 * }} The grid, with 0 = unowned, 1 = home, 2 = away, 3 = other in `team`.
 */
export function controlGrid(players, options = {}) {
  const dimensions = { ...FULL_PITCH, ...(options.dimensions ?? {}) };
  const cellM = options.cellM ?? CELL_M;
  const horizonS = options.horizonS ?? REACH_HORIZON_S;
  const cols = Math.max(1, Math.round(dimensions.lengthM / cellM));
  const rows = Math.max(1, Math.round(dimensions.widthM / cellM));
  // The requested cell size rarely divides the pitch exactly, so the grid is
  // stretched to fit rather than allowed to overhang. Without this the reported
  // territory adds up to a pitch slightly larger than the one being played on.
  const cellW = dimensions.lengthM / cols;
  const cellH = dimensions.widthM / rows;
  const owner = new Int16Array(cols * rows).fill(-1);
  const team = new Uint8Array(cols * rows);

  const reach = players.map((player) => ({
    id: player.id,
    team: player.team,
    x: player.x + (player.vx ?? 0) * horizonS,
    y: player.y + (player.vy ?? 0) * horizonS,
  }));

  const counts = { home: 0, away: 0, other: 0 };
  const code = { home: 1, away: 2, other: 3 };
  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.5) * cellH;
    for (let col = 0; col < cols; col += 1) {
      const x = (col + 0.5) * cellW;
      let bestIndex = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < reach.length; i += 1) {
        const distance = Math.hypot(reach[i].x - x, reach[i].y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      }
      const cell = row * cols + col;
      if (bestIndex < 0) continue;
      owner[cell] = reach[bestIndex].id;
      const side = reach[bestIndex].team;
      team[cell] = code[side] ?? 3;
      if (side in counts) counts[side] += 1;
      else counts.other += 1;
    }
  }

  const total = cols * rows;
  const cellArea = cellW * cellH;
  return {
    cols,
    rows,
    cellM,
    cellW,
    cellH,
    owner,
    team,
    shares: {
      home: total ? counts.home / total : 0,
      away: total ? counts.away / total : 0,
      other: total ? counts.other / total : 0,
    },
    areas: {
      home: counts.home * cellArea,
      away: counts.away * cellArea,
      other: counts.other * cellArea,
    },
  };
}

/**
 * How the space immediately around a point is divided.
 *
 * This is the figure worth putting on screen beside the player on the ball: not
 * who owns the pitch, but who owns the twenty metres they are standing in.
 *
 * @param {{x: number, y: number}} point Centre of the region.
 * @param {object[]} players Players, as for {@link controlGrid}.
 * @param {object} [options] Options.
 * @param {number} [options.radiusM=20] Radius considered.
 * @param {number} [options.cellM=1.5] Sampling resolution.
 * @param {number} [options.horizonS=REACH_HORIZON_S] Momentum horizon.
 * @param {{lengthM: number, widthM: number}} [options.dimensions=FULL_PITCH] Pitch.
 * @returns {{home: number, away: number, other: number, samples: number}}
 *   Shares of the sampled area.
 */
export function spaceAround(point, players, options = {}) {
  const radiusM = options.radiusM ?? 20;
  const cellM = options.cellM ?? 1.5;
  const horizonS = options.horizonS ?? REACH_HORIZON_S;
  const dimensions = { ...FULL_PITCH, ...(options.dimensions ?? {}) };
  const reach = players.map((player) => ({
    team: player.team,
    x: player.x + (player.vx ?? 0) * horizonS,
    y: player.y + (player.vy ?? 0) * horizonS,
  }));
  const counts = { home: 0, away: 0, other: 0 };
  let samples = 0;
  for (let dy = -radiusM; dy <= radiusM; dy += cellM) {
    for (let dx = -radiusM; dx <= radiusM; dx += cellM) {
      if (dx * dx + dy * dy > radiusM * radiusM) continue;
      const x = point.x + dx;
      const y = point.y + dy;
      // Space off the pitch is nobody's, and counting it would flatter whoever
      // happens to be defending the touchline.
      if (x < 0 || y < 0 || x > dimensions.lengthM || y > dimensions.widthM) continue;
      samples += 1;
      let best = null;
      let bestDistance = Infinity;
      for (const player of reach) {
        const distance = Math.hypot(player.x - x, player.y - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = player;
        }
      }
      if (!best) continue;
      if (best.team in counts) counts[best.team] += 1;
      else counts.other += 1;
    }
  }
  return {
    home: samples ? counts.home / samples : 0,
    away: samples ? counts.away / samples : 0,
    other: samples ? counts.other / samples : 0,
    samples,
  };
}

/**
 * The shape a team is holding: where its centre is, and how spread out it is.
 *
 * Reported from the players the app can currently see, with the count attached,
 * because a "defensive line" computed from four visible players out of eleven
 * is a different statement from one computed from all of them.
 *
 * @param {object[]} players Players of one team.
 * @param {number} [attackingTowards=1] +1 if attacking towards increasing x.
 * @returns {{
 *   count: number, centroid: {x: number, y: number}|null,
 *   widthM: number, depthM: number, lineM: number|null, compactness: number
 * }} Shape, or an empty reading when nobody is visible.
 */
export function teamShape(players, attackingTowards = 1) {
  if (!players.length) {
    return { count: 0, centroid: null, widthM: 0, depthM: 0, lineM: null, compactness: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const player of players) {
    sumX += player.x;
    sumY += player.y;
    if (player.x < minX) minX = player.x;
    if (player.x > maxX) maxX = player.x;
    if (player.y < minY) minY = player.y;
    if (player.y > maxY) maxY = player.y;
  }
  const count = players.length;
  const centroid = { x: sumX / count, y: sumY / count };
  const widthM = maxY - minY;
  const depthM = maxX - minX;
  // The defensive line is the rearmost outfield player relative to the goal
  // this team is defending.
  const lineM = attackingTowards >= 0 ? minX : maxX;
  const area = Math.max(1, widthM * depthM);
  return {
    count,
    centroid,
    widthM,
    depthM,
    lineM,
    // Players per hectare of the box they occupy: a compact block scores high,
    // a stretched one low. Stated as a density so it does not read as a grade.
    compactness: (count / area) * 10000,
  };
}
