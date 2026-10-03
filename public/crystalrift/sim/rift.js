// CRYSTAL RIFT · the science of four worlds. Every number on screen comes from these models.

export const G = 9.80665;

// ── 1 · Ferrum (the reactor city): heat engines and a living planet ─────────────
// A reactor taps the planet's Aether, a hot reservoir at T_h. No engine beats Carnot: η_C = 1 − T_c/T_h.
// Real turbines reach a fraction f of that: η = f·η_C. Electric demand P_e needs heat Q = P_e/η.
// The Aether pool regrows logistically: dA/dt = r·A·(1 − A/K) − h. Harvest above the maximum sustainable
// yield MSY = rK/4 and the pool collapses; below it, the pool settles where rA(1 − A/K) = h.
export const AETHER = { K: 2000, r: 0.1, A0: 1600 };                  // PJ, per year, PJ
export const PJ_PER_MWYR = 3.15576e13 / 1e15;                         // 1 MW for a year = 0.0316 PJ
export function reactor({ Th = 600, Tc = 300, f = 0.6, demand = 800, save = 0 }) {
  const etaC = 1 - Tc / Th, eta = f * etaC, Pe = demand * (1 - save), Q = Pe / eta, h = Q * PJ_PER_MWYR, msy = (AETHER.r * AETHER.K) / 4;
  return { etaC, eta, Pe, Q, waste: Q - Pe, h, msy, msyMW: msy / PJ_PER_MWYR, ok: h <= msy * 0.95 };
}
export function aetherRun(h, years = 80, dt = 0.05) {
  const { K, r, A0 } = AETHER; let A = A0; const pts = [[0, A]];
  for (let t = dt; t <= years + 1e-9; t += dt) { A = Math.max(0, A + (r * A * (1 - A / K) - h) * dt); if (Math.round(t / dt) % 10 === 0) pts.push([t, A]); }
  const disc = 1 - (4 * h) / (r * K), eq = disc >= 0 ? (K / 2) * (1 + Math.sqrt(disc)) : 0;
  return { pts, end: A, eq, collapse: A <= 1 };
}

// ── 2 · The Academy: Rift Cards ─────────────────────────────────────────────────
// A 3×3 board. Each card has four ranks (top, right, bottom, left; 10 written "A"). Place a card next to
// an opponent's card: if your touching rank is higher, theirs flips to you. After nine cards, whoever owns
// more of the board wins. The AI searches the game tree with minimax and alpha–beta pruning.
export const CARDS = [
  ['Vey', 6, 7, 3, 5], ['Lio', 5, 6, 6, 4], ['Pip', 3, 8, 5, 6], ['Mara', 7, 4, 4, 7], ['Wyrmling', 4, 4, 8, 3],
  ['Reactor', 8, 2, 6, 3], ['Gunbird', 2, 6, 7, 6], ['Mistmoth', 5, 3, 3, 8], ['Sphereray', 6, 5, 5, 3], ['Crystal', 10, 2, 2, 5],
];
const NB = [[[1, 1, 3], [3, 2, 0]], [[0, 3, 1], [2, 1, 3], [4, 2, 0]], [[1, 3, 1], [5, 2, 0]], [[0, 0, 2], [4, 1, 3], [6, 2, 0]], [[1, 0, 2], [3, 3, 1], [5, 1, 3], [7, 2, 0]], [[2, 0, 2], [4, 3, 1], [8, 2, 0]], [[3, 0, 2], [7, 1, 3]], [[4, 0, 2], [6, 3, 1], [8, 1, 3]], [[5, 0, 2], [7, 3, 1]]];
// NB[cell] = [neighbour, mySide, theirSide] with sides 0 top, 1 right, 2 bottom, 3 left.
export function newDuel(seed = 1) {
  let a = seed * 7919 + 17; const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const deck = CARDS.map((c, i) => i).sort(() => rnd() - 0.5);
  return { board: Array(9).fill(null), hands: [deck.slice(0, 5), deck.slice(5, 10)], turn: 0, moves: 0 };
}
export function play(S, cell, cardIdx) {
  const N = { board: S.board.slice(), hands: [S.hands[0].slice(), S.hands[1].slice()], turn: 1 - S.turn, moves: S.moves + 1 }, me = S.turn, card = N.hands[me].splice(cardIdx, 1)[0];
  N.board[cell] = { c: card, o: me }; const flips = [];
  for (const [nb, mySide, theirSide] of NB[cell]) { const q = N.board[nb]; if (q && q.o !== me && CARDS[card][1 + mySide] > CARDS[q.c][1 + theirSide]) { N.board[nb] = { c: q.c, o: me }; flips.push(nb); } }
  N.flips = flips; return N;
}
// Score from player 0's view: their board cards + cards in hand.
export const score = (S) => S.board.filter((q) => q && q.o === 0).length + S.hands[0].length;
export function minimax(S, depth, alpha = -1e9, beta = 1e9, stats = { n: 0 }) {
  stats.n++;
  if (depth === 0 || S.moves === 9) return { v: score(S) - (10 - score(S)) };
  const max = S.turn === 0; let best = { v: max ? -1e9 : 1e9 };
  for (let cell = 0; cell < 9; cell++) {
    if (S.board[cell]) continue;
    for (let k = 0; k < S.hands[S.turn].length; k++) {
      const r = minimax(play(S, cell, k), depth - 1, alpha, beta, stats);
      if (max ? r.v > best.v : r.v < best.v) best = { v: r.v, cell, k };
      if (max) alpha = Math.max(alpha, r.v); else beta = Math.min(beta, r.v);
      if (beta <= alpha) return best;
    }
  }
  return best;
}
// Number of possible move sequences if both players had all their cards: Π(cells × cards).
export function treeSize() { let n = 1; for (let m = 0; m < 9; m++) n *= (9 - m) * (5 - Math.floor(m / 2)); return n; }

// ── 3 · The Mist continent: lighter-than-air ships ─────────────────────────────
// Lift per m³ = (ρ_air − ρ_gas)·g = ρ_air(h)·(1 − M_gas/M_air)·g at equal temperature and pressure.
// Air thins with height, ρ(h) = 1.225·e^(−h/8500), so a rigid ship has a ceiling where lift = weight.
// Speed: engine power P·η_prop = ½ρ·C_D·V^(2/3)·v³ (volumetric drag coefficient C_D ≈ 0.03).
export const GASES = { hydrogen: { ratio: 2.016 / 28.96 }, helium: { ratio: 4.003 / 28.96 }, hotair: { ratio: 288 / 373 }, mist: { ratio: 0.03 } };
export const rhoAir = (h) => 1.225 * Math.exp(-h / 8500);
export function airship({ V = 60000, gas = 'helium', P = 1500, cargo = 20000 }) {
  const ratio = GASES[gas].ratio, struct = 6000 + 0.28 * V + 1.3 * P, m = struct + cargo;
  const liftKg = (h) => rhoAir(h) * (1 - ratio) * V;
  const ceiling = liftKg(0) <= m ? -1 : 8500 * Math.log((1.225 * (1 - ratio) * V) / m);
  const v = Math.cbrt((2 * P * 1000 * 0.7) / (rhoAir(1500) * 0.03 * V ** (2 / 3)));
  return { struct, m, lift0: liftKg(0), lift1500: liftKg(1500), ceiling, v, kmh: v * 3.6, length: 2.6 * Math.cbrt(V), ok: ceiling >= 1500 && v >= 20 };
}

// ── 4 · The Isles: sphere-ball in a floating ball of water ──────────────────────
// A neutrally buoyant ball (ρ = water) moving through water drags along "added mass" ½ρV, so its
// effective mass is 1.5·m. Quadratic drag: m_eff·dv/dt = −½ρ·C_D·A·v², giving v(x) = v₀·e^(−kx) with
// k = ½ρC_DA/m_eff. Pressure in the sphere: p = p₀ + ρ·g·depth.
export const BALL = { r: 0.11, Cd: 0.2 };
export function ballK() { const V = (4 / 3) * Math.PI * BALL.r ** 3, m = 1000 * V, A = Math.PI * BALL.r ** 2; return { m, meff: 1.5 * m, k: (0.5 * 1000 * BALL.Cd * A) / (1.5 * m) }; }
export function pass(v0, angle, from, steps = 400) {
  const { k } = ballK(), path = []; let x = from[0], y = from[1], v = v0, d = 0; const dx = Math.cos(angle), dy = Math.sin(angle);
  for (let i = 0; i < steps && v > 0.6; i++) { const ds = 0.05; d += ds; v = v0 * Math.exp(-k * d); x += dx * ds; y += dy * ds; path.push([x, y, v, d]); }
  return { path, range: Math.log(v0 / 0.6) / k, k };
}
export const pressureAtm = (depth) => 1 + (1000 * G * depth) / 101325;

// ── 5 · The Rift: an Active Time Battle ────────────────────────────────────────
// Each fighter's gauge fills at a rate proportional to speed: g += 0.9·SPD·dt (full at 100), so turns per
// minute = 0.54·SPD. Damage = 5·ATK²/(ATK + DEF) × power × element × (0.9…1.1) × (2 on a critical, chance LCK %).
export const PARTY = [
  { id: 'vey', hp: 1400, mp: 60, atk: 120, mag: 50, def: 70, spd: 22, lck: 8 },
  { id: 'lio', hp: 1150, mp: 80, atk: 105, mag: 70, def: 60, spd: 27, lck: 14 },
  { id: 'pip', hp: 820, mp: 180, atk: 40, mag: 135, def: 40, spd: 24, lck: 6 },
  { id: 'mara', hp: 980, mp: 160, atk: 55, mag: 105, def: 50, spd: 25, lck: 10 },
];
export const WYRM = { id: 'wyrm', hp: 16000, atk: 122, mag: 112, def: 90, mdef: 80, spd: 20, weak: { ice: 1.6, fire: -0.5, bolt: 1.0 } };
export const SPELLS = { fire: { mp: 12, pow: 1.4 }, ice: { mp: 14, pow: 1.5 }, bolt: { mp: 12, pow: 1.4 }, cure: { mp: 10, pow: 2.2 } };
export const LV = 5;                                                   // level multiplier
export function damage(atk, def, pow = 1, elem = 1, crit = false, rnd = 0.5) { return Math.round(LV * ((atk * atk) / (atk + def)) * pow * elem * (0.9 + 0.2 * rnd) * (crit ? 2 : 1)); }
export const ATB_RATE = 0.9;                                           // gauge points per second per SPD
export const turnsPerMin = (spd) => (spd * ATB_RATE * 60) / 100;
