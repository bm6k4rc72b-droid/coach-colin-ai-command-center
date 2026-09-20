/**
 * Combining sensors, where the thing that matters is independence.
 *
 * The instinct when several sensors agree is to add up the agreements. That is
 * wrong, and it is wrong in a way that manufactures confidence out of nothing.
 *
 * Forty VIIRS pixels from one overpass are **one observation**. They came from
 * one instrument, through one atmosphere, on one pass, with one calibration and
 * one geolocation solution. If that pass was mis-registered by a kilometre, all
 * forty are wrong by a kilometre together, and their unanimity tells you
 * nothing except that they came from the same place. Count them as forty and
 * the app reports near-certainty about a position that a single systematic
 * error can move wholesale.
 *
 * Two cameras on two peaks are genuinely two observations. A camera and a
 * satellite are two observations of different kinds, which is stronger still,
 * because the ways a camera fails — fog, exposure, a knocked mount — have
 * nothing to do with the ways an orbiting radiometer fails, and a burnt-out
 * network node fails in a third unrelated way. Corroboration is only worth
 * something to the extent the corroborating thing could have failed
 * differently.
 *
 * So this module groups observations by what could take them all out at once —
 * their *independence key* — and confidence is driven by how many distinct keys
 * agree, not by how many observations there are. A hypothesis backed by two
 * hundred pixels from one pass scores below one backed by a pixel and a camera
 * bearing.
 *
 * The second job is association: deciding two observations are the same fire.
 * Done naively — nearest neighbour within some radius — it merges two fires a
 * village apart and splits one long front in half. Done here, two observations
 * may be associated only if their uncertainty regions actually overlap once the
 * older one has been allowed to have *spread* over the time between them, which
 * is the physically meaningful test and is why {@link associate} takes a spread
 * rate.
 *
 * @module emberline/fuse
 */

import { bearingDeg, centroid, covarianceEllipse, destination, distanceM, toLocal } from './geo.js';

/**
 * What each kind of observation contributes, and what it shares a fate with.
 *
 * `independence` is the key that decides corroboration. Two observations with
 * the same key are not independent evidence of each other, however many of them
 * there are — the template is filled in with the specifics (which overpass,
 * which camera) when the observation is built.
 *
 * @type {Readonly<Record<string, {label: string, independence: string, weight: number, blindTo: string}>>}
 */
export const SOURCES = Object.freeze({
  satellite: {
    label: 'Satellite detection',
    independence: 'pass:{pass}',
    weight: 1.0,
    blindTo: 'Cloud, and anything smaller than its detection threshold. Hours between looks.',
  },
  camera: {
    label: 'Camera bearing',
    independence: 'camera:{id}',
    weight: 0.9,
    blindTo: 'Anything below the horizon or behind a ridge. Fog and low cloud read as smoke.',
  },
  rf: {
    label: 'Network node loss',
    independence: 'network:{segment}',
    weight: 0.8,
    blindTo: 'Ground with no hardware on it. Cannot tell fire from a backhoe or a power cut.',
  },
  report: {
    label: 'Human report',
    independence: 'reporter:{id}',
    weight: 0.7,
    blindTo: 'Position is usually the caller’s own position, not the fire’s.',
  },
});

/**
 * Build an observation from any source, in the one shape fusion works on.
 *
 * Uncertainty is always a covariance, even when the source only offers a
 * radius, so that a camera's long thin ellipse and a satellite pixel's box
 * combine correctly rather than both being flattened to a circle — which would
 * throw away the single most informative thing about a grazing camera fix.
 *
 * @param {object} input The observation.
 * @param {keyof typeof SOURCES} input.kind Which source.
 * @param {{lat: number, lon: number}} input.position Best position.
 * @param {number} [input.sigmaM] One-sigma radius, for circular uncertainty.
 * @param {{ee: number, en: number, nn: number}} [input.covariance] Full covariance.
 * @param {number} input.atMs When it was observed.
 * @param {string} input.independence What it shares a fate with.
 * @param {string} [input.label] Human label.
 * @param {number} [input.strength=1] Source-specific confidence in `[0, 1]`.
 * @param {object} [input.meta] Anything the UI wants to keep.
 * @returns {object} A normalised observation.
 */
export function observation(input) {
  const sigma = Number.isFinite(input.sigmaM) ? Math.max(1, input.sigmaM) : null;
  const covariance =
    input.covariance ?? (sigma != null ? { ee: sigma * sigma, en: 0, nn: sigma * sigma } : { ee: 1e8, en: 0, nn: 1e8 });
  return {
    kind: input.kind,
    position: input.position,
    covariance,
    atMs: input.atMs,
    independence: input.independence,
    label: input.label ?? SOURCES[input.kind]?.label ?? input.kind,
    strength: Math.min(1, Math.max(0, input.strength ?? 1)),
    meta: input.meta ?? {},
  };
}

/**
 * The radius within which an observation could be describing a fire, allowing
 * for how long ago it was and how fast fire moves.
 *
 * @param {object} obs An observation.
 * @param {number} nowMs Current time.
 * @param {number} spreadRateMs Plausible spread rate, m/s.
 * @returns {number} Metres.
 */
export function reachRadius(obs, nowMs, spreadRateMs) {
  const ellipse = covarianceEllipse(obs.covariance, 2);
  const elapsedS = Math.max(0, (nowMs - obs.atMs) / 1000);
  return ellipse.semiMajorM + elapsedS * Math.max(0, spreadRateMs);
}

/**
 * Group observations that could be the same fire.
 *
 * Single-link again, and for the same reason as the detection clustering: a
 * front is a chain, and any method that demands compactness cuts a long fire
 * into pieces exactly when it is most important not to.
 *
 * @param {Array<object>} observations Normalised observations.
 * @param {object} [options] Tuning.
 * @param {number} [options.nowMs=Date.now()] Current time.
 * @param {number} [options.spreadRateMs=1] Plausible spread rate for the
 *   time-allowance, m/s. Pass the modelled rate when there is one.
 * @returns {Array<Array<object>>} Groups of observations.
 */
export function associate(observations, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const spreadRateMs = options.spreadRateMs ?? 1;
  const reach = observations.map((obs) => reachRadius(obs, nowMs, spreadRateMs));

  const parent = observations.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let walk = i;
    while (parent[walk] !== root) {
      const next = parent[walk];
      parent[walk] = root;
      walk = next;
    }
    return root;
  };

  for (let i = 0; i < observations.length; i += 1) {
    for (let j = i + 1; j < observations.length; j += 1) {
      const separation = distanceM(observations[i].position, observations[j].position);
      // Overlap of the two reach regions, not proximity of the two centres.
      if (separation <= reach[i] + reach[j]) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[b] = a;
      }
    }
  }

  const groups = new Map();
  observations.forEach((obs, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(obs);
  });
  return [...groups.values()];
}

/**
 * Fuse one group into a hypothesis, weighting by independence rather than count.
 *
 * The position is an inverse-variance weighted mean — the standard estimator,
 * and the right one, because it lets a tight camera fix pull the answer away
 * from a cloud of coarse satellite pixels instead of being outvoted by them.
 *
 * But each *independence key* gets one share of the weight, divided among its
 * members. Forty pixels from one pass therefore carry the weight of one pass,
 * not of forty observations, which is the whole point of the module.
 *
 * @param {Array<object>} group Observations of one fire.
 * @param {number} [nowMs=Date.now()] Current time.
 * @returns {object} A fire hypothesis.
 */
export function fuseGroup(group, nowMs = Date.now()) {
  const byKey = new Map();
  for (const obs of group) {
    if (!byKey.has(obs.independence)) byKey.set(obs.independence, []);
    byKey.get(obs.independence).push(obs);
  }

  const origin = group[0].position;
  let m00 = 0;
  let m01 = 0;
  let m11 = 0;
  let b0 = 0;
  let b1 = 0;

  for (const [, members] of byKey) {
    // One key, one share. Members of a key split it between them.
    const share = 1 / members.length;
    for (const obs of members) {
      const local = toLocal(origin, obs.position);
      const { ee, en, nn } = obs.covariance;
      const det = ee * nn - en * en;
      if (!(det > 0)) continue;
      const sourceWeight = (SOURCES[obs.kind]?.weight ?? 0.5) * obs.strength * share;
      // Inverse covariance, scaled by how much this source is trusted.
      const i00 = (nn / det) * sourceWeight;
      const i01 = (-en / det) * sourceWeight;
      const i11 = (ee / det) * sourceWeight;
      m00 += i00;
      m01 += i01;
      m11 += i11;
      b0 += i00 * local.e + i01 * local.n;
      b1 += i01 * local.e + i11 * local.n;
    }
  }

  const det = m00 * m11 - m01 * m01;
  let position;
  let covariance;
  if (det > 0) {
    const e = (b0 * m11 - b1 * m01) / det;
    const n = (m00 * b1 - m01 * b0) / det;
    position = { lat: origin.lat + n / 111320, lon: origin.lon + e / (111320 * Math.cos((origin.lat * Math.PI) / 180)) };
    covariance = { ee: m11 / det, en: -m01 / det, nn: m00 / det };
  } else {
    position = centroid(group.map((o) => o.position));
    covariance = { ee: 1e8, en: 0, nn: 1e8 };
  }

  const keys = [...byKey.keys()];
  const kinds = [...new Set(group.map((o) => o.kind))];
  const newestMs = Math.max(...group.map((o) => o.atMs));
  const ellipse = covarianceEllipse(covariance, 2);

  // Confidence rises with the number of independent keys and, more sharply,
  // with the number of distinct *kinds* — because different kinds fail in
  // unrelated ways and the same kind twice can share a blind spot.
  const independentKeys = keys.length;
  const diversity = kinds.length;
  const ageMin = Math.max(0, (nowMs - newestMs) / 60000);
  const freshness = ageMin < 30 ? 1 : ageMin < 180 ? 0.8 : ageMin < 720 ? 0.55 : 0.3;
  const corroboration = 1 - 1 / (1 + 0.8 * (independentKeys - 1) + 1.4 * (diversity - 1));
  const strongest = Math.max(...group.map((o) => o.strength));
  const confidence = Math.min(0.95, (0.35 + 0.6 * corroboration) * freshness * (0.6 + 0.4 * strongest));

  return {
    position,
    covariance,
    ellipse,
    observations: group,
    independentKeys,
    diversity,
    kinds,
    newestMs,
    ageMin,
    confidence,
    note: corroborationNote(independentKeys, diversity, group.length, ellipse),
    blindSpots: kinds.map((kind) => ({ kind, label: SOURCES[kind]?.label ?? kind, blindTo: SOURCES[kind]?.blindTo ?? '' })),
    missing: missingSources(kinds),
  };
}

/**
 * The sentence explaining what the corroboration is actually worth.
 *
 * @param {number} keys Independent keys.
 * @param {number} diversity Distinct source kinds.
 * @param {number} count Raw observation count.
 * @param {object} ellipse The fused error ellipse.
 * @returns {string} What the evidence amounts to.
 */
function corroborationNote(keys, diversity, count, ellipse) {
  const size = ellipse.semiMajorM < 1000
    ? `${Math.round(ellipse.semiMajorM)} m`
    : `${(ellipse.semiMajorM / 1000).toFixed(1)} km`;
  if (keys === 1) {
    return count > 1
      ? `${count} observations, but all from one source that could fail as a unit — this counts as one look, not ${count}. Position good to about ${size}, and a systematic error in that one source moves all of it together.`
      : `A single observation from a single source. Position good to about ${size}, with nothing to check it against.`;
  }
  if (diversity === 1) {
    return `${keys} independent looks, all of the same kind. They share a blind spot, so they confirm each other's position without ruling out the thing that kind of sensor cannot see. About ${size}.`;
  }
  return `${keys} independent looks across ${diversity} different kinds of sensor, which fail in unrelated ways — this is the strongest corroboration available. Position good to about ${size}.`;
}

/**
 * Which sources are not represented, and what that leaves unchecked.
 *
 * Stated because a reader needs the shape of the hole, not just the evidence.
 * A fire confirmed by three cameras and no satellite is well located and
 * completely unquantified for intensity; one confirmed by satellite alone is
 * hours old and could have moved.
 *
 * @param {string[]} present Kinds already contributing.
 * @returns {Array<{kind: string, label: string, wouldAdd: string}>} What is absent.
 */
export function missingSources(present) {
  const set = new Set(present);
  const adds = {
    satellite: 'Radiative power, which is the only quantitative measure of how hard it is burning.',
    camera: 'A position fixed to hundreds of metres rather than a satellite pixel, refreshing in seconds rather than hours.',
    rf: 'Confirmation that the fire has physically destroyed something at a surveyed coordinate.',
    report: 'What somebody on the ground can see that no sensor here can.',
  };
  return Object.keys(SOURCES)
    .filter((kind) => !set.has(kind))
    .map((kind) => ({ kind, label: SOURCES[kind].label, wouldAdd: adds[kind] }));
}

/**
 * The whole pipeline: associate, fuse, rank.
 *
 * @param {Array<object>} observations Normalised observations.
 * @param {object} [options] As {@link associate} takes.
 * @returns {Array<object>} Hypotheses, most confident first.
 */
export function fuseAll(observations, options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  if (!observations?.length) return [];
  return associate(observations, options)
    .map((group) => fuseGroup(group, nowMs))
    .sort((a, b) => b.confidence - a.confidence);
}

export { bearingDeg, destination };
