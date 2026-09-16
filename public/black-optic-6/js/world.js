/**
 * World feeds — what is happening off the ranch.
 *
 * Every other deck in this console measures something on the property. This one
 * reports what somebody else's instruments measured elsewhere, which makes the
 * provenance question sharper rather than softer: the console did not observe
 * any of it, cannot verify any of it, and must not round any of it off.
 *
 * **The rule this module is built on: report, never predict.**
 *
 * The temptation with an earthquake feed is to compute what the shaking would
 * have been at the ranch — take the magnitude, the distance and the depth, run
 * an intensity prediction equation, print a number. This console will not,
 * because doing it properly needs a regional IPE with coefficients that are
 * easy to misremember and impossible to check at three in the morning, and
 * doing it improperly produces a confident number that is wrong by two whole
 * intensity units. A wrong intensity is worse than no intensity: it is the
 * difference between "go and look at the tank foundations" and "go back to bed".
 *
 * So the console reports what USGS itself computed and what people actually
 * felt — `mmi` from ShakeMap, `cdi` and `felt` from Did You Feel It — alongside
 * the one number it can compute soundly, which is how far away the epicentre
 * was. Where the feed carries no intensity, the console says so instead of
 * filling the gap.
 *
 * **Two further honesty points that the feed itself supplies:**
 *
 * - An event's `status` is `automatic` until a seismologist reviews it.
 *   Automatic magnitudes get revised, routinely by a couple of tenths and
 *   occasionally by much more, and an automatic solution minutes after an event
 *   is the one most likely to be wrong. The console shows which it is.
 * - Depth is the least-constrained parameter in a location solution, especially
 *   for events outside a dense network. Where USGS flags a depth as fixed by
 *   the analyst rather than solved for, that is worth knowing before anybody
 *   reasons about it.
 *
 * @module black-optic-6/world
 */

/**
 * The USGS summary feeds. Keyless, CORS-enabled, and US public domain, which is
 * why this is the one world feed that works from a static page with no relay,
 * no key and no server of any kind.
 */
export const USGS_ROOT = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

/** Time windows the summary feeds are published for. */
export const WINDOWS = Object.freeze([
  { id: 'hour', label: 'Past hour', seconds: 3600 },
  { id: 'day', label: 'Past day', seconds: 86400 },
  { id: 'week', label: 'Past week', seconds: 604800 },
  { id: 'month', label: 'Past 30 days', seconds: 2592000 },
]);

/**
 * Magnitude bands the feeds are cut at.
 *
 * `all` is genuinely all of it, which near a dense network like northern
 * California means dozens of M1 events a day that nobody felt and nobody needs
 * woken for. `m25` is the usual working threshold — around M2.5 is where events
 * start being felt close in.
 */
export const BANDS = Object.freeze([
  { id: 'significant', label: 'Significant only', note: 'USGS\'s own significance score — big, shallow, populated, or widely felt.' },
  { id: '4.5', label: 'M4.5+', note: 'Worth knowing about anywhere in the state.' },
  { id: '2.5', label: 'M2.5+', note: 'The usual working threshold. Around here this is the one to leave on.' },
  { id: '1.0', label: 'M1.0+', note: 'Dozens a day near a dense network. Useful for watching a swarm, noisy otherwise.' },
  { id: 'all', label: 'Everything', note: 'Includes events too small for anyone to feel.' },
]);

/** URL for a band and window. Both are validated — a typo must not fetch nothing silently. */
export function feedUrl(band = '2.5', window = 'day') {
  const validBand = BANDS.some((entry) => entry.id === band) ? band : '2.5';
  const validWindow = WINDOWS.some((entry) => entry.id === window) ? window : 'day';
  return `${USGS_ROOT}/${validBand}_${validWindow}.geojson`;
}

/**
 * A number, or null — never a silently invented zero.
 *
 * `Number(null)` is 0 and `Number.isFinite(0)` is true, so the obvious guard
 * turns a magnitude USGS has not assigned yet into a confident **M0.0**, and an
 * absent Did You Feel It count into "0 reports" — which reads as "nobody felt
 * it" rather than "nobody was asked". Both are fabricated readings of exactly
 * the kind this console exists to refuse, and both came from one missing
 * null check.
 */
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Mean Earth radius, kilometres. */
const EARTH_KM = 6371.0088;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * `perimeter.js` already measures distance, but it does so on a flat
 * approximation with the longitude scaled by cos(latitude) — which is correct
 * to millimetres along a fence line and wrong by kilometres at the range an
 * earthquake feed covers. Different scale, different error budget, so this is a
 * second implementation on purpose rather than by accident.
 */
export function greatCircleKm(a, b) {
  if (!a || !b) return NaN;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, in degrees clockwise from true north. */
export function bearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** The sixteen-point compass name for a bearing. */
export function compass(deg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return points[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * Modified Mercalli intensity, as a roman numeral and a plain description.
 *
 * These are the standard MMI degree descriptions, not a scale this console
 * invented, and they are only ever applied to an intensity USGS supplied.
 */
export const MMI = Object.freeze([
  { max: 1.5, roman: 'I', text: 'Not felt' },
  { max: 2.5, roman: 'II', text: 'Felt by a few at rest, upper floors' },
  { max: 3.5, roman: 'III', text: 'Felt indoors; like a truck passing' },
  { max: 4.5, roman: 'IV', text: 'Felt by many indoors; dishes and windows rattle' },
  { max: 5.5, roman: 'V', text: 'Felt by nearly everyone; unstable objects overturn' },
  { max: 6.5, roman: 'VI', text: 'Felt by all; plaster cracks, some heavy furniture moves' },
  { max: 7.5, roman: 'VII', text: 'Damage to poorly built structures; hard to stand' },
  { max: 8.5, roman: 'VIII', text: 'Considerable damage; chimneys and tanks fall' },
  { max: 9.5, roman: 'IX', text: 'Heavy damage; foundations shift' },
  { max: Infinity, roman: 'X+', text: 'Most masonry destroyed; ground badly cracked' },
]);

/** Describe an MMI value. Returns null for anything that is not a real reading. */
export function intensity(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  const band = MMI.find((entry) => value < entry.max) ?? MMI[MMI.length - 1];
  return { value, roman: band.roman, text: band.text };
}

/**
 * Normalise one GeoJSON feature from a USGS summary feed.
 *
 * Every field that the console will later show is pulled out here and nowhere
 * else, so there is exactly one place where a feed schema change breaks, and it
 * breaks loudly rather than rendering `undefined` into a readout.
 */
export function parseQuake(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const p = feature.properties || {};
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = num(coords[0]);
  const lat = num(coords[1]);
  if (lat === null || lon === null) return null;

  const magnitude = num(p.mag);
  const depthKm = num(coords[2]);

  return {
    id: String(feature.id ?? p.code ?? `${lat},${lon},${p.time}`),
    lat,
    lon,
    depthKm,
    magnitude,
    magType: String(p.magType || '').trim() || null,
    place: String(p.place || '').trim() || 'Location not given',
    time: num(p.time),
    updated: num(p.updated),
    /** 'automatic' until a seismologist has reviewed it. */
    status: String(p.status || 'automatic').toLowerCase(),
    /** ShakeMap's maximum estimated intensity, when USGS produced one. */
    mmi: num(p.mmi),
    /** Did You Feel It community intensity, from actual reports. */
    cdi: num(p.cdi),
    /** How many people filed a report. Zero reports is not the same as not felt. */
    felt: num(p.felt),
    /** PAGER alert level, when one was issued. */
    alert: p.alert ? String(p.alert).toLowerCase() : null,
    tsunami: Number(p.tsunami) === 1,
    url: String(p.url || '') || null,
    net: String(p.net || '').trim() || null,
  };
}

/** Parse a whole feed, dropping anything malformed rather than poisoning the list. */
export function parseFeed(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const quakes = [];
  for (const feature of features) {
    const quake = parseQuake(feature);
    if (quake) quakes.push(quake);
  }
  return {
    quakes,
    generated: num(geojson?.metadata?.generated),
    title: String(geojson?.metadata?.title || '').trim() || null,
    /** How many features the feed claimed, so a silent truncation is visible. */
    claimed: num(geojson?.metadata?.count) ?? features.length,
    dropped: features.length - quakes.length,
  };
}

/**
 * Add range and bearing from a place, and sort nearest first.
 *
 * `radiusKm` filters; omit it to keep everything. The distance is to the
 * epicentre on the surface — not to the hypocentre, and not to the fault
 * rupture, which for a large event can reach tens of kilometres closer than the
 * epicentre suggests. That distinction is stated rather than smoothed over.
 */
export function near(quakes, origin, radiusKm = Infinity) {
  if (!origin) return [];
  return quakes
    .map((quake) => ({
      ...quake,
      rangeKm: greatCircleKm(origin, quake),
      bearingDeg: bearing(origin, quake),
    }))
    .filter((quake) => Number.isFinite(quake.rangeKm) && quake.rangeKm <= radiusKm)
    .sort((a, b) => a.rangeKm - b.rangeKm);
}

/**
 * What this console is willing to say about one event.
 *
 * Returns the parts separately so the panel can lay them out, and so the rule
 * stays checkable: `shaking` is populated only from a USGS-supplied intensity,
 * and `caveats` is never empty for an unreviewed solution.
 */
export function describe(quake) {
  const magnitude = quake.magnitude === null
    ? 'Magnitude not yet assigned'
    : `M${quake.magnitude.toFixed(1)}${quake.magType ? ` ${quake.magType}` : ''}`;

  const range = Number.isFinite(quake.rangeKm)
    ? `${quake.rangeKm < 10 ? quake.rangeKm.toFixed(1) : Math.round(quake.rangeKm)} km ${compass(quake.bearingDeg)}`
    : null;

  // Reported intensity first, because it is an observation; modelled second.
  const reported = intensity(quake.cdi);
  const modelled = intensity(quake.mmi);
  let shaking = null;
  if (reported) {
    shaking = {
      source: 'reported',
      state: 'LINK',
      text: `${reported.roman} — ${reported.text}`,
      note: quake.felt
        ? `Did You Feel It, from ${quake.felt} report${quake.felt === 1 ? '' : 's'}. This is what people said, not what an instrument recorded.`
        : 'Did You Feel It community intensity.',
    };
  } else if (modelled) {
    shaking = {
      source: 'modelled',
      state: 'MODEL',
      text: `${modelled.roman} — ${modelled.text}`,
      note: 'ShakeMap\'s maximum estimated intensity for the event as a whole — not an estimate for this ranch.',
    };
  }

  const caveats = [];
  if (quake.status !== 'reviewed') {
    caveats.push('Automatic solution — no seismologist has reviewed it. The magnitude will likely be revised.');
  }
  if (quake.depthKm !== null && quake.depthKm <= 0.1) {
    caveats.push('Depth is at or above zero, which usually means it was fixed by the analyst rather than solved for.');
  }
  if (!shaking) {
    caveats.push('No intensity published for this event. This console will not estimate one.');
  }
  if (quake.magnitude !== null && quake.magnitude >= 6) {
    caveats.push('At this size the rupture is tens of kilometres long, so the epicentre can be much further away than the nearest shaking.');
  }

  return {
    magnitude,
    range,
    depth: quake.depthKm === null ? 'Depth not given' : `${quake.depthKm.toFixed(1)} km deep`,
    place: quake.place,
    shaking,
    caveats,
    reviewed: quake.status === 'reviewed',
  };
}

/**
 * The feed's own freshness, and whether it can be trusted as current.
 *
 * A stale feed that still renders its last contents is the failure mode that
 * matters here: the panel looks alive and the ranch is not being watched. Age
 * is measured against the feed's own `generated` stamp rather than against when
 * the fetch returned, because a cached response returns instantly and is hours
 * old.
 */
export function freshness(feed, nowMs = Date.now(), staleAfterMs = 900000) {
  if (!feed || feed.generated === null) {
    return { known: false, ageMs: null, stale: true, verdict: 'The feed did not say when it was generated. Treat it as unknown age.' };
  }
  const ageMs = Math.max(0, nowMs - feed.generated);
  const stale = ageMs > staleAfterMs;
  const minutes = Math.round(ageMs / 60000);
  return {
    known: true,
    ageMs,
    stale,
    verdict: stale
      ? `Feed is ${minutes} minutes old. Older than it should be — the fetch may be serving a cache, or USGS may be having a bad day.`
      : `Feed generated ${minutes} minute${minutes === 1 ? '' : 's'} ago.`,
  };
}

/** Attribution USGS asks for, kept beside the data rather than in a footer. */
export const USGS_CREDIT = 'Data courtesy of the U.S. Geological Survey';
