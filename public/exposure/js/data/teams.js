/**
 * Teams, as text identifiers only.
 *
 * The desk names a club the way a newspaper agate page does: city and mascot
 * word, plus the three-letter abbreviation everyone already reads. There are
 * deliberately no logo, helmet, wordmark or colour-lockup fields anywhere in
 * this file — nothing downstream can render a mark it was never given. The
 * only colour a team carries is `tint`, a neutral chart hue picked from the
 * app's own palette so rows stay distinguishable in a dense table.
 *
 * @module exposure/data/teams
 */

/**
 * @typedef {object} Team
 * @property {string} abbr Three-letter identifier used in dense rows.
 * @property {string} city City or region name.
 * @property {string} mascot Mascot word.
 * @property {string} conf Conference identifier, for sorting only.
 * @property {string} tint App-palette hue, not a club colour.
 */

/** @type {Record<string, Team>} */
export const TEAMS = {
  ARI: { abbr: 'ARI', city: 'Arizona', mascot: 'Cardinals', conf: 'NFC', tint: '#8a6f3c' },
  ATL: { abbr: 'ATL', city: 'Atlanta', mascot: 'Falcons', conf: 'NFC', tint: '#7d6a44' },
  BAL: { abbr: 'BAL', city: 'Baltimore', mascot: 'Ravens', conf: 'AFC', tint: '#6a5f8a' },
  BUF: { abbr: 'BUF', city: 'Buffalo', mascot: 'Bills', conf: 'AFC', tint: '#4f6f8a' },
  CHI: { abbr: 'CHI', city: 'Chicago', mascot: 'Bears', conf: 'NFC', tint: '#7a6440' },
  CIN: { abbr: 'CIN', city: 'Cincinnati', mascot: 'Bengals', conf: 'AFC', tint: '#8a7040' },
  CLE: { abbr: 'CLE', city: 'Cleveland', mascot: 'Browns', conf: 'AFC', tint: '#6f5c40' },
  DAL: { abbr: 'DAL', city: 'Dallas', mascot: 'Cowboys', conf: 'NFC', tint: '#5f6a7a' },
  DEN: { abbr: 'DEN', city: 'Denver', mascot: 'Broncos', conf: 'AFC', tint: '#8a6a44' },
  DET: { abbr: 'DET', city: 'Detroit', mascot: 'Lions', conf: 'NFC', tint: '#4f7a80' },
  GB: { abbr: 'GB', city: 'Green Bay', mascot: 'Packers', conf: 'NFC', tint: '#5f7a55' },
  HOU: { abbr: 'HOU', city: 'Houston', mascot: 'Texans', conf: 'AFC', tint: '#6a5550' },
  IND: { abbr: 'IND', city: 'Indianapolis', mascot: 'Colts', conf: 'AFC', tint: '#5a6f8a' },
  JAX: { abbr: 'JAX', city: 'Jacksonville', mascot: 'Jaguars', conf: 'AFC', tint: '#4f7a72' },
  KC: { abbr: 'KC', city: 'Kansas City', mascot: 'Chiefs', conf: 'AFC', tint: '#8a5a50' },
  LAC: { abbr: 'LAC', city: 'Los Angeles', mascot: 'Chargers', conf: 'AFC', tint: '#4f7f8a' },
  LAR: { abbr: 'LAR', city: 'Los Angeles', mascot: 'Rams', conf: 'NFC', tint: '#5f6a8a' },
  LV: { abbr: 'LV', city: 'Las Vegas', mascot: 'Raiders', conf: 'AFC', tint: '#6f6f75' },
  MIA: { abbr: 'MIA', city: 'Miami', mascot: 'Dolphins', conf: 'AFC', tint: '#4f8080' },
  MIN: { abbr: 'MIN', city: 'Minnesota', mascot: 'Vikings', conf: 'NFC', tint: '#6f5a8a' },
  NE: { abbr: 'NE', city: 'New England', mascot: 'Patriots', conf: 'AFC', tint: '#5a6580' },
  NO: { abbr: 'NO', city: 'New Orleans', mascot: 'Saints', conf: 'NFC', tint: '#7f7050' },
  NYG: { abbr: 'NYG', city: 'New York', mascot: 'Giants', conf: 'NFC', tint: '#55688a' },
  NYJ: { abbr: 'NYJ', city: 'New York', mascot: 'Jets', conf: 'AFC', tint: '#557a60' },
  PHI: { abbr: 'PHI', city: 'Philadelphia', mascot: 'Eagles', conf: 'NFC', tint: '#4f7570' },
  PIT: { abbr: 'PIT', city: 'Pittsburgh', mascot: 'Steelers', conf: 'AFC', tint: '#8a7a45' },
  SEA: { abbr: 'SEA', city: 'Seattle', mascot: 'Seahawks', conf: 'NFC', tint: '#5a7a80' },
  SF: { abbr: 'SF', city: 'San Francisco', mascot: '49ers', conf: 'NFC', tint: '#8a5f55' },
  TB: { abbr: 'TB', city: 'Tampa Bay', mascot: 'Buccaneers', conf: 'NFC', tint: '#8a5f4a' },
  TEN: { abbr: 'TEN', city: 'Tennessee', mascot: 'Titans', conf: 'AFC', tint: '#5f6f8a' },
  WAS: { abbr: 'WAS', city: 'Washington', mascot: 'Commanders', conf: 'NFC', tint: '#7a5f4a' },
};

/**
 * Look a team up by abbreviation.
 *
 * @param {string} abbr Team abbreviation.
 * @returns {Team} The team, or a placeholder that renders safely.
 */
export function team(abbr) {
  return TEAMS[abbr] || { abbr: String(abbr || '--'), city: 'Unknown', mascot: 'Team', conf: '', tint: '#6b6b70' };
}

/**
 * Full text name of a club: city plus mascot word.
 *
 * @param {string} abbr Team abbreviation.
 * @returns {string} e.g. "Kansas City Chiefs".
 */
export function teamName(abbr) {
  const t = team(abbr);
  return `${t.city} ${t.mascot}`;
}

/** @returns {Team[]} Every team, sorted by city then mascot, for pickers. */
export function allTeams() {
  return Object.values(TEAMS).sort((a, b) => `${a.city} ${a.mascot}`.localeCompare(`${b.city} ${b.mascot}`));
}
