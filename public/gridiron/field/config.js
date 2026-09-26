// ─────────────────────────────────────────────────────────────────────────────
// FIELD MODE CONFIG — tune the offense, routes, coverages and physics here.
//
// Units are YARDS and seconds. Positions are written in "screen" coordinates as
// seen from behind the quarterback:
//   sx  negative = left of the ball, positive = right
//   z   downfield from the line of scrimmage (LOS = 0, backfield is negative)
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD = {
  width: 53.33,
  losYardLine: 25,          // the drive starts on your own 25
  hashX: 3.08,
  sidelineX: 26.67,
};

export const SPEED = {       // top speeds, yd/s (a 4.5 s 40-yard dash is ~9 yd/s)
  WR: 8.4, TE: 7.3, RB: 7.8, QB: 6.5,
  CB: 8.1, S: 7.9, LB: 7.2, DL: 5.6,
  bullet: 21, touch: 15,     // ball speeds
  reaction: 0.28,            // seconds a defender needs to react to a receiver's break
};

export const TIMING = {
  playClock: 25,
  pocketClean: 3.6,          // time before blocked rushers collapse the pocket
  unblockedSpeed: 6.2,
  dropBack: 0.65,            // shotgun drop (s)
};

// Offensive alignment: shotgun, 2x2 with the TE left and a slot right.
export const OFFENSE = [
  { id: 'X', pos: 'WR', sx: -20.5, z: -0.6, side: -1 },
  { id: 'TE', pos: 'TE', sx: -4.6, z: -1.0, side: -1 },
  { id: 'LT', pos: 'OL', sx: -3.2, z: -0.9 },
  { id: 'LG', pos: 'OL', sx: -1.6, z: -0.9 },
  { id: 'C', pos: 'OL', sx: 0, z: -0.9 },
  { id: 'RG', pos: 'OL', sx: 1.6, z: -0.9 },
  { id: 'RT', pos: 'OL', sx: 3.2, z: -0.9 },
  { id: 'S', pos: 'WR', sx: 12.5, z: -1.2, side: 1 },
  { id: 'Z', pos: 'WR', sx: 20.5, z: -0.6, side: 1 },
  { id: 'RB', pos: 'RB', sx: 1.5, z: -5.3, side: 1 },
  { id: 'QB', pos: 'QB', sx: 0, z: -5.0 },
];
export const RECEIVERS = ['X', 'TE', 'S', 'Z', 'RB'];

// Route library. Waypoints are [dx, dz] from the receiver's alignment, written for
// a receiver on the RIGHT (s = +1). Mirrored for the left side.
// `o` = outward (toward the sideline), `i` = inward.
export const ROUTES = {
  slant:    (s) => [[0, 1.5], [-s * 5, 7], [-s * 16, 15]],
  hitch:    (s) => [[0, 5.5], [s * 0.3, 4.6]],
  corner:   (s) => [[0, 10], [s * 7, 17], [s * 11, 22]],
  go:       ()  => [[0, 45]],
  out:      (s) => [[0, 11], [s * 9, 11.5]],
  flat:     (s) => [[s * 3, 1], [s * 9, 3], [s * 15, 3.5]],
  drag:     (s) => [[-s * 2, 2], [-s * 20, 4.5], [-s * 30, 5]],
  dig:      (s) => [[0, 14], [-s * 12, 15], [-s * 20, 15.5]],
  seam:     ()  => [[0, 40]],
  post:     (s) => [[0, 12], [-s * 8, 26]],
  sit:      ()  => [[0, 6], [0, 5.5]],
  wheel:    (s) => [[s * 5, 1], [s * 8.5, 5], [s * 9, 35]],
  check:    (s) => [[s * 3, 1.5], [s * 5, 4], [s * 5.5, 4.5]],
  comeback: (s) => [[0, 15], [s * 2.5, 12.5]],
};

// Play concepts: a route for each eligible receiver, plus the coverages each one beats.
// fit: 1 = the answer to this coverage, 0 = a bad call against it.
export const CONCEPTS = {
  slants: { routes: { X: 'slant', TE: 'flat', S: 'slant', Z: 'slant', RB: 'check' }, fit: { c0: 1, c1: 0.8, c2: 0.4, c3: 0.5, c4: 0.6 } },
  smash:  { routes: { X: 'hitch', TE: 'seam', S: 'corner', Z: 'hitch', RB: 'flat' }, fit: { c0: 0.3, c1: 0.4, c2: 1, c3: 0.6, c4: 0.4 } },
  flood:  { routes: { X: 'post', TE: 'drag', S: 'out', Z: 'go', RB: 'flat' }, fit: { c0: 0.1, c1: 0.4, c2: 0.7, c3: 1, c4: 0.6 } },
  mesh:   { routes: { X: 'drag', TE: 'sit', S: 'drag', Z: 'corner', RB: 'wheel' }, fit: { c0: 0.7, c1: 1, c2: 0.6, c3: 0.6, c4: 0.8 } },
  dagger: { routes: { X: 'comeback', TE: 'flat', S: 'seam', Z: 'dig', RB: 'check' }, fit: { c0: 0.1, c1: 0.5, c2: 0.5, c3: 0.6, c4: 1 } },
};

// Defensive coverages. Each defender gets a pre-snap alignment (the "tells") and
// a post-snap job:
//   { man: 'X' }                             follow that receiver
//   { zone: [sx, z, halfWidth, halfDepth], deep }   defend that area
//   { rush: laneSx }                          rush the quarterback
const DL = { DE_L: { pre: [-4.3, 0.9], job: { rush: -4.3 } }, DT_L: { pre: [-1.2, 0.9], job: { rush: -1.2 } }, DT_R: { pre: [1.2, 0.9], job: { rush: 1.2 } }, DE_R: { pre: [4.3, 0.9], job: { rush: 4.3 } } };

export const COVERAGES = {
  // Cover 0: everyone in man, no deep safety, six or seven rushers. Answer: throw hot, fast.
  c0: { blitz: true, ...DL,
    CB_L: { pre: [-20.5, 1.2], job: { man: 'X' } }, CB_R: { pre: [20.5, 1.2], job: { man: 'Z' } },
    NB: { pre: [12.5, 1.6], job: { man: 'S' } }, SS: { pre: [-5.5, 5], job: { man: 'TE' } },
    MLB: { pre: [1.5, 4.5], job: { man: 'RB' } },
    WLB: { pre: [-1.8, 2.2], job: { rush: -2.5 } }, FS: { pre: [2.6, 3.2], job: { rush: 2.4 } } },
  // Cover 1: man across with one deep safety and a robber. Answer: crossers and rubs (mesh).
  c1: { ...DL,
    CB_L: { pre: [-20.5, 1.2], job: { man: 'X' } }, CB_R: { pre: [20.5, 1.2], job: { man: 'Z' } },
    NB: { pre: [12.5, 2], job: { man: 'S' } }, SS: { pre: [-6, 7], job: { man: 'TE' } },
    MLB: { pre: [1, 5], job: { man: 'RB' } }, WLB: { pre: [-2.5, 6], job: { zone: [0, 8, 5, 3] } },
    FS: { pre: [0, 13], job: { zone: [0, 18, 13, 8], deep: true } } },
  // Cover 2: two deep halves, corners squat in the flats. Answer: hole shots (smash).
  c2: { ...DL,
    CB_L: { pre: [-19, 3], job: { zone: [-17, 5, 5, 4] } }, CB_R: { pre: [19, 3], job: { zone: [17, 5, 5, 4] } },
    NB: { pre: [12, 4], job: { zone: [10, 9, 5, 4] } }, WLB: { pre: [-4, 5], job: { zone: [-7, 8, 5, 4] } },
    MLB: { pre: [1.5, 5], job: { zone: [2, 9, 5, 4] } },
    FS: { pre: [-12, 13], job: { zone: [-12, 18, 13, 9], deep: true } }, SS: { pre: [12, 13], job: { zone: [12, 18, 13, 9], deep: true } } },
  // Cover 3: three deep thirds, four underneath. Answer: flood the flat–curl–deep levels.
  c3: { ...DL,
    CB_L: { pre: [-20, 7], job: { zone: [-17, 18, 7, 10], deep: true } }, CB_R: { pre: [20, 7], job: { zone: [17, 18, 7, 10], deep: true } },
    FS: { pre: [0, 13], job: { zone: [0, 19, 8, 10], deep: true } },
    SS: { pre: [-9, 8], job: { zone: [-13, 7, 6, 4] } }, NB: { pre: [12.5, 5], job: { zone: [13, 7, 6, 4] } },
    WLB: { pre: [-3.5, 5], job: { zone: [-5, 8, 4, 4] } }, MLB: { pre: [2, 5], job: { zone: [4, 8, 4, 4] } } },
  // Cover 4 (quarters): four deep, safeties read the #2 receivers. Answer: flat and dig (dagger).
  c4: { ...DL,
    CB_L: { pre: [-19.5, 7], job: { zone: [-18, 18, 6, 10], deep: true } }, CB_R: { pre: [19.5, 7], job: { zone: [18, 18, 6, 10], deep: true } },
    FS: { pre: [-8.5, 11], job: { zone: [-7, 17, 6, 9], deep: true } }, SS: { pre: [8.5, 11], job: { zone: [7, 17, 6, 9], deep: true } },
    NB: { pre: [13, 4], job: { zone: [14, 5, 5, 3] } }, WLB: { pre: [-4, 5], job: { zone: [-7, 7, 5, 3] } }, MLB: { pre: [2, 5], job: { zone: [4, 7, 5, 3] } } },
};
export const DEFENDER_POS = { CB_L: 'CB', CB_R: 'CB', NB: 'CB', FS: 'S', SS: 'S', WLB: 'LB', MLB: 'LB', DE_L: 'DL', DT_L: 'DL', DT_R: 'DL', DE_R: 'DL' };

export const DRIVE = { plays: 5, startYard: 25 };
