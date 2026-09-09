/**
 * Sorting players into two teams, without knowing who anybody is.
 *
 * Everything tactical the app says — possession share, who is pressing, which
 * passing lanes are open — needs to know which of two sides each player is on,
 * and needs to work that out from the video alone. There is no team sheet, no
 * jersey number recognition and no attempt at either. A number on a shirt is
 * eight pixels tall in this footage and reading it wrong is worse than not
 * reading it: it puts a name on a stranger's distance total.
 *
 * What is available is kit colour, and it is enough, because the Laws require
 * it to be. The two teams must be distinguishable to a referee at a glance, so
 * they are distinguishable to two-means clustering over shirt chromaticity —
 * which is the same information the referee is using.
 *
 * Two decisions keep this honest rather than merely clever:
 *
 * **Outfield only.** Goalkeepers wear a colour that clashes with both sides,
 * and officials wear a third. Forcing every tracked person into one of two
 * clusters puts the referee in midfield for whichever team he happens to look
 * like, and possession figures inherit the error. Anything far from both
 * centres is labelled `other` and left out of the team statistics.
 *
 * **The label is per player, not per frame.** A shirt sample flickers when a
 * player turns, is half in shadow, or is briefly merged with an opponent.
 * Assignment is by a running vote over a player's whole history, so a team
 * label changes only when the evidence really has.
 *
 * If the two clusters end up close together — a team in white against a team in
 * yellow under floodlights — {@link clusterKits} says so through `separation`,
 * and the app reports that team assignment is unreliable instead of drawing a
 * confident possession bar out of a coin flip.
 *
 * @module touchline/teams
 */

import { kitDistance } from './track.js';

/** Team identifiers used throughout the app. */
export const TEAMS = Object.freeze(['home', 'away', 'other']);

/**
 * Cluster separation below which team assignment is not trustworthy.
 *
 * Two kits this close in chromaticity are within the frame-to-frame variation
 * of a single kit under changing light, so the split being found is lighting,
 * not teams.
 */
export const MIN_SEPARATION = 0.16;

/** Multiples of a team's own colour spread that still count as that team. */
export const OUTLIER_MARGIN = 1.6;

/**
 * Smallest tolerance used, whatever the clusters say.
 *
 * Two synthetic kits have almost no spread at all, and a tolerance computed
 * straight from that would reject the players it was fitted to the moment a
 * cloud passed over. This is the floor: about the width of a real kit's own
 * variation between sun and shadow.
 */
export const MIN_TOLERANCE = 0.08;

/**
 * Split kit samples into two clusters by two-means.
 *
 * Initialised at the two most distant samples rather than at random, so the
 * result is the same every run — a match report that changes when you open it
 * twice is not a match report.
 *
 * @param {{r: number, g: number, b: number}[]} samples Kit chromaticities.
 * @param {number} [iterations=12] Refinement passes.
 * @returns {{
 *   centres: {r: number, g: number, b: number}[],
 *   separation: number,
 *   spread: number[],
 *   counts: number[],
 *   reliable: boolean
 * }|null} The two centres and how far apart they are, or null if there are too
 *   few samples to say anything.
 */
export function clusterKits(samples, iterations = 12) {
  const usable = samples.filter(Boolean);
  if (usable.length < 4) return null;

  let seedA = usable[0];
  let seedB = usable[1];
  let best = -1;
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const gap = kitDistance(usable[i], usable[j]);
      if (gap > best) {
        best = gap;
        seedA = usable[i];
        seedB = usable[j];
      }
    }
  }
  let centres = [{ ...seedA }, { ...seedB }];
  let assignment = new Array(usable.length).fill(0);

  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = false;
    for (let i = 0; i < usable.length; i += 1) {
      const to = kitDistance(usable[i], centres[0]) <= kitDistance(usable[i], centres[1]) ? 0 : 1;
      if (to !== assignment[i]) moved = true;
      assignment[i] = to;
    }
    const sums = [
      { r: 0, g: 0, b: 0, n: 0 },
      { r: 0, g: 0, b: 0, n: 0 },
    ];
    for (let i = 0; i < usable.length; i += 1) {
      const bucket = sums[assignment[i]];
      bucket.r += usable[i].r;
      bucket.g += usable[i].g;
      bucket.b += usable[i].b;
      bucket.n += 1;
    }
    centres = sums.map((bucket, index) =>
      bucket.n
        ? { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n }
        : centres[index],
    );
    if (!moved && pass > 0) break;
  }

  const counts = [0, 0];
  const spread = [0, 0];
  for (let i = 0; i < usable.length; i += 1) {
    counts[assignment[i]] += 1;
    spread[assignment[i]] += kitDistance(usable[i], centres[assignment[i]]);
  }
  for (let k = 0; k < 2; k += 1) spread[k] = counts[k] ? spread[k] / counts[k] : 0;

  // Trim, then refit. Two-means has to put every sample somewhere, so the
  // goalkeeper in yellow and the referee in black are dragged into whichever
  // cluster they are marginally nearer and pull its centre with them. Left
  // alone that moves both centres towards the middle, which widens every
  // subsequent tolerance and lets more strangers in. One round of dropping the
  // samples that sit far outside their own cluster, and recomputing the centres
  // from what is left, keeps a centre meaning "this team's shirt".
  const trimmed = [
    { r: 0, g: 0, b: 0, n: 0 },
    { r: 0, g: 0, b: 0, n: 0 },
  ];
  // The cut is taken from the median distance rather than the mean, because the
  // outliers being removed are exactly what inflates a mean: with a keeper in
  // the cluster the mean distance is halfway to the keeper, and a cut based on
  // it keeps the keeper every time.
  const limits = [0, 1].map((k) => {
    const distances = [];
    for (let i = 0; i < usable.length; i += 1) {
      if (assignment[i] === k) distances.push(kitDistance(usable[i], centres[k]));
    }
    distances.sort((a, b) => a - b);
    const median = distances.length ? distances[Math.floor(distances.length / 2)] : 0;
    return Math.max(median * 1.5, MIN_TOLERANCE);
  });
  for (let i = 0; i < usable.length; i += 1) {
    const k = assignment[i];
    if (kitDistance(usable[i], centres[k]) > limits[k]) continue;
    trimmed[k].r += usable[i].r;
    trimmed[k].g += usable[i].g;
    trimmed[k].b += usable[i].b;
    trimmed[k].n += 1;
  }
  centres = trimmed.map((bucket, index) =>
    bucket.n >= 2
      ? { r: bucket.r / bucket.n, g: bucket.g / bucket.n, b: bucket.b / bucket.n }
      : centres[index],
  );
  for (let k = 0; k < 2; k += 1) {
    if (trimmed[k].n < 2) continue;
    let total = 0;
    let seen = 0;
    for (let i = 0; i < usable.length; i += 1) {
      if (assignment[i] !== k) continue;
      const gap = kitDistance(usable[i], centres[k]);
      if (gap > limits[k]) continue;
      total += gap;
      seen += 1;
    }
    if (seen) spread[k] = total / seen;
  }

  const separation = kitDistance(centres[0], centres[1]);
  return {
    centres,
    separation,
    spread,
    counts,
    reliable: separation >= MIN_SEPARATION && counts[0] > 0 && counts[1] > 0,
  };
}

/**
 * Which side a kit sample belongs to, or neither.
 *
 * @param {{r: number, g: number, b: number}|null} kit Sample to place.
 * @param {{centres: object[], spread: number[]}} model Result of
 *   {@link clusterKits}.
 * @returns {'home'|'away'|'other'} The side, or `other` for a goalkeeper,
 *   official, or anything the clustering has no business claiming.
 */
export function assignTeam(kit, model) {
  if (!kit || !model) return 'other';
  const toHome = kitDistance(kit, model.centres[0]);
  const toAway = kitDistance(kit, model.centres[1]);
  const nearest = Math.min(toHome, toAway);
  // "Nearest centre wins" would put the referee on whichever team is less
  // black. A sample has to sit inside that team's own colour spread, not merely
  // nearer to it than to the other side — a goalkeeper in yellow is nearer to
  // red than to blue and is on neither team.
  //
  // The tolerance is the team's own spread, floored so a uniform kit does not
  // reject itself in shadow, and capped at half the gap between the two teams
  // so it can never reach across and claim the other side's players.
  const side = toHome <= toAway ? 0 : 1;
  const tolerance = Math.min(
    model.separation * 0.5,
    Math.max((model.spread[side] || 0) * OUTLIER_MARGIN, MIN_TOLERANCE),
  );
  if (nearest > tolerance) return 'other';
  return toHome <= toAway ? 'home' : 'away';
}

/**
 * A running vote that turns per-frame guesses into a stable label.
 */
export class TeamVote {
  /** @param {number} [decay=0.94] How fast old frames stop counting. */
  constructor(decay = 0.94) {
    this.decay = decay;
    this.votes = new Map();
  }

  /**
   * Record one frame's opinion about one player.
   *
   * @param {number} id Track id.
   * @param {'home'|'away'|'other'} team This frame's guess.
   * @param {number} [weight=1] Confidence; a merged blob is worth less.
   * @returns {'home'|'away'|'other'} The label the vote now supports.
   */
  cast(id, team, weight = 1) {
    let tally = this.votes.get(id);
    if (!tally) {
      tally = { home: 0, away: 0, other: 0 };
      this.votes.set(id, tally);
    }
    for (const key of TEAMS) tally[key] *= this.decay;
    tally[team] += weight;
    return this.verdict(id);
  }

  /**
   * The label currently supported for a player.
   *
   * @param {number} id Track id.
   * @returns {'home'|'away'|'other'} Best-supported label.
   */
  verdict(id) {
    const tally = this.votes.get(id);
    if (!tally) return 'other';
    let bestKey = 'other';
    let bestValue = -1;
    for (const key of TEAMS) {
      if (tally[key] > bestValue) {
        bestValue = tally[key];
        bestKey = key;
      }
    }
    return bestKey;
  }

  /**
   * How firmly a player's label is held, 0 to 1.
   *
   * @param {number} id Track id.
   * @returns {number} Winning share of the vote.
   */
  confidence(id) {
    const tally = this.votes.get(id);
    if (!tally) return 0;
    const total = TEAMS.reduce((sum, key) => sum + tally[key], 0);
    if (total <= 0) return 0;
    return Math.max(...TEAMS.map((key) => tally[key])) / total;
  }

  /** Forget a player who has left. */
  forget(id) {
    this.votes.delete(id);
  }
}

/**
 * Give the two clusters names and colours for the interface.
 *
 * Nothing here knows which team is which club, so they are "Team A" and
 * "Team B" until a person types something better in. Guessing at club names
 * from shirt colour would be the first invented fact in the app.
 *
 * @param {{centres: {r: number, g: number, b: number}[]}} model Cluster model.
 * @returns {{home: {name: string, css: string}, away: {name: string, css: string}}}
 *   Display names and the kit colours to draw them in.
 */
export function palette(model) {
  const css = (centre) => {
    if (!centre) return '#9aa4b2';
    // Chromaticity has no brightness; push it back up to something visible
    // rather than drawing three near-identical greys on the overlay.
    const peak = Math.max(centre.r, centre.g, centre.b) || 1;
    const scale = 235 / peak;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * scale)));
    return `rgb(${clamp(centre.r)}, ${clamp(centre.g)}, ${clamp(centre.b)})`;
  };
  return {
    home: { name: 'Team A', css: css(model?.centres?.[0]) },
    away: { name: 'Team B', css: css(model?.centres?.[1]) },
  };
}
