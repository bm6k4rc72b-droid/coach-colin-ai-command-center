/**
 * How many people a building holds and how long they take to get out.
 *
 * Occupant load follows the International Building Code's load factors
 * (IBC 2021 Table 1004.5, floor area per occupant, gross unless noted),
 * converted from square feet at exactly 0.09290304 m²/ft².
 *
 * Evacuation time is the SFPE Handbook's hydraulic model (Nelson & Mowrer;
 * Gwynne & Rosenbaum), the calculation fire engineers do by hand:
 *
 *   speed        v  = k (1 − 0.266 D)  m/s,  D = persons/m² (≥ 0.54)
 *   specific flow Fs = v · D            persons/s per metre of effective width
 *   peak          Fs,max at D = 1.88 → 0.94 k − (1.40 → 1.32, stairs 7/11 → 1.02)
 *   effective width = clear width − boundary layers (0.15 m each side, doors and stairs)
 *
 * with k = 1.40 for corridors and doorways and 1.08 for 7-inch-riser / 11-inch-tread
 * stairs. Total = pre-movement + travel to the exit at free walking speed +
 * queueing through the controlling (narrowest) component.
 *
 * This is a design-stage estimate. It assumes everyone is mobile and heads for
 * the exits at once; it does not model smoke, panic, or a door that is
 * chained. The panel labels it Modelled.
 *
 * @module black-optic-6/site/egress
 */

const FT2 = 0.09290304;

/** IBC 2021 Table 1004.5 occupant load factors, m² per person. */
export const LOAD_FACTORS = Object.freeze({
  residential: { label: 'Residential', ft2: 200, m2: 200 * FT2 },
  agricultural: { label: 'Agricultural building', ft2: 300, m2: 300 * FT2 },
  storage: { label: 'Storage / warehouse / garage', ft2: 500, m2: 500 * FT2 },
  business: { label: 'Business / office', ft2: 150, m2: 150 * FT2 },
  mercantile: { label: 'Mercantile (retail floor)', ft2: 60, m2: 60 * FT2 },
  assembly: { label: 'Assembly, unconcentrated (net)', ft2: 15, m2: 15 * FT2 },
  industrial: { label: 'Industrial', ft2: 100, m2: 100 * FT2 },
  educational: { label: 'Educational classroom (net)', ft2: 20, m2: 20 * FT2 },
  unoccupied: { label: 'Not occupied (silo, tank)', ft2: null, m2: Infinity },
});

/** Map building=* to an occupancy. */
export function occupancyFor(kind) {
  const k = String(kind || '').toLowerCase();
  if (['silo', 'tank', 'storage_tank', 'water_tower', 'transformer_tower', 'bunker_silo'].includes(k)) return 'unoccupied';
  if (['house', 'detached', 'residential', 'apartments', 'farm', 'bungalow', 'cabin', 'dormitory', 'terrace', 'hotel'].includes(k)) return 'residential';
  if (['barn', 'farm_auxiliary', 'stable', 'cowshed', 'sty', 'greenhouse'].includes(k)) return 'agricultural';
  if (['shed', 'garage', 'garages', 'warehouse', 'carport', 'hut', 'roof'].includes(k)) return 'storage';
  if (['commercial', 'office', 'government'].includes(k)) return 'business';
  if (['retail', 'supermarket', 'kiosk'].includes(k)) return 'mercantile';
  if (['church', 'chapel', 'civic', 'public', 'sports_hall', 'stadium'].includes(k)) return 'assembly';
  if (['industrial', 'manufacture'].includes(k)) return 'industrial';
  if (['school', 'kindergarten', 'college', 'university'].includes(k)) return 'educational';
  return 'business';
}

/** Occupants for a floor area (rounded up, as the code requires). */
export function occupantLoad(floorM2, occupancy) {
  const f = LOAD_FACTORS[occupancy] ?? LOAD_FACTORS.business;
  if (!Number.isFinite(f.m2)) return 0;
  return Math.ceil(floorM2 / f.m2 - 1e-9);
}

/** SFPE k constants. */
export const K = Object.freeze({ door: 1.40, corridor: 1.40, stair711: 1.08, stair7510: 1.00, stair6512: 1.16, stair6513: 1.23 });

/** Speed at density D (persons/m²). Below 0.54 people walk freely. */
export function speed(D, k = K.door) {
  return k * (1 - 0.266 * Math.max(0.54, D));
}

/** Specific flow at density D, persons/s/m. */
export function specificFlow(D, k = K.door) {
  return speed(D, k) * D;
}

/** Peak specific flow, at D = 1/(2·0.266) ≈ 1.88 persons/m². */
export function maxSpecificFlow(k = K.door) {
  return specificFlow(1 / (2 * 0.266), k);
}

/** Effective width after the boundary layers. */
export function effectiveWidth(clearM, boundaryEachSideM = 0.15) {
  return Math.max(0, clearM - 2 * boundaryEachSideM);
}

/**
 * Exits placed at the midpoints of the n longest outer walls (an assumption
 * the panel states: real doors should be marked when known).
 */
export function autoExits(ring, n = 2) {
  const edges = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return { len: Math.hypot(b[0] - a[0], b[1] - a[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  }).sort((x, y) => y.len - x.len);
  return edges.slice(0, Math.max(1, n)).map((e) => e.mid);
}

/** Longest straight-line distance from any corner to its nearest exit (a lower bound on travel). */
export function maxTravel(ring, exits) {
  let worst = 0;
  for (const v of ring) worst = Math.max(worst, Math.min(...exits.map((e) => Math.hypot(v[0] - e[0], v[1] - e[1]))));
  return worst;
}

/**
 * Evacuation time.
 *
 * @param {object} o
 * @param {number} o.occupants
 * @param {number} o.exits Number of exit doors.
 * @param {number} [o.doorClearM=0.91] Clear width per door (36 in).
 * @param {number} o.travelM Longest travel to an exit.
 * @param {number} [o.floors=1]
 * @param {number} [o.stairs=1] Number of stairs (multi-storey only).
 * @param {number} [o.stairClearM=1.12] Clear stair width (44 in).
 * @param {number} [o.preMovementS=60]
 * @returns {{totalS: number, preS: number, travelS: number, queueS: number, controlling: string, doorCapacity: number, stairCapacity: number|null, freeSpeed: number}}
 */
export function evacuation({ occupants, exits, doorClearM = 0.91, travelM, floors = 1, stairs = 1, stairClearM = 1.12, preMovementS = 60 }) {
  const free = speed(0, K.door);
  const doorCapacity = exits * maxSpecificFlow(K.door) * effectiveWidth(doorClearM);
  const upper = floors > 1 ? occupants * (1 - 1 / floors) : 0; // people above ground floor
  const stairCapacity = floors > 1 ? stairs * maxSpecificFlow(K.stair711) * effectiveWidth(stairClearM) : null;
  const doorQueue = doorCapacity > 0 ? occupants / doorCapacity : Infinity;
  const stairQueue = stairCapacity ? upper / stairCapacity : 0;
  const queueS = Math.max(doorQueue, stairQueue);
  const travelS = travelM / free;
  return {
    totalS: preMovementS + travelS + queueS, preS: preMovementS, travelS, queueS,
    controlling: stairQueue > doorQueue ? 'stairs' : 'exit doors', doorCapacity, stairCapacity, freeSpeed: free,
  };
}
