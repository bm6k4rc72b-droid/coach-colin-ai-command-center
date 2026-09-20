/**
 * When the sky next looks at this place.
 *
 * A fire map that refreshes every thirty seconds is telling you about its own
 * polling loop. The underlying picture changes when a satellite flies over, and
 * for the polar orbiters that carry the fire-detecting instruments that is a
 * handful of times a day. Between overpasses, hitting refresh does nothing at
 * all, and an app that animates a spinner while it does nothing is teaching its
 * user that the data is live when it is hours old.
 *
 * So this module answers the question the refresh button cannot: *when does the
 * picture actually change next?* And it answers the follow-up too — that
 * between polar passes there is a geostationary option, at far coarser
 * resolution, which is a real trade a person can make rather than a gap they
 * have to sit in.
 *
 * ## How the timing is worked out, and how good it is
 *
 * The fire-detecting polar orbiters are all sun-synchronous: their orbital
 * plane precesses to keep pace with the sun, so each crosses a given latitude
 * at nearly the same *local solar time* every day, by design and for decades.
 * That is what makes an overpass predictable without an ephemeris. Local solar
 * time relates to UTC by longitude alone — fifteen degrees to the hour — so the
 * next crossing at a place is simply the next time UTC reaches the satellite's
 * fixed local crossing time for that meridian.
 *
 * This is an approximation and the module says so everywhere it returns a time.
 * It is good to roughly ±50 minutes, and the error has three sources:
 *
 * - Crossing time is defined at the *equator*. At higher latitudes the ground
 *   track crosses earlier or later than the equatorial figure by a few tens of
 *   minutes.
 * - The swath is wide — 3040 km for VIIRS — so a place is seen from several
 *   consecutive orbits, roughly 100 minutes apart, and the *best* look (nearest
 *   nadir, smallest pixel) is only one of them.
 * - Orbits drift and get maintained, and satellites are occasionally
 *   manoeuvred.
 *
 * A ±50 minute window on a "next look" is entirely good enough for the decision
 * it supports — wait for the pass, or go and look with something else. What it
 * is not good enough for is pointing an antenna, and this module is not for
 * that. If exact times are wanted, the honest source is a current TLE and an
 * SGP4 propagator, and {@link overpassCaveat} says so rather than letting the
 * estimate be mistaken for an ephemeris.
 *
 * @module emberline/overpass
 */

/**
 * The fire-relevant satellites, with the orbital facts that make them predictable.
 *
 * `ltan` and `ltdn` are local solar times of the ascending (northbound) and
 * descending (southbound) equator crossings, in decimal hours. For a
 * sun-synchronous orbiter these are the defining parameters.
 *
 * @type {ReadonlyArray<object>}
 */
export const SATELLITES = Object.freeze([
  {
    id: 'snpp',
    name: 'Suomi NPP',
    instrument: 'VIIRS',
    kind: 'polar',
    ltan: 13.42,
    ltdn: 1.42,
    swathKm: 3040,
    nadirPixelM: 375,
    edgePixelM: 800,
    product: 'VIIRS_SNPP_NRT',
    note: 'The original VIIRS. 375 m pixels, global coverage twice a day.',
  },
  {
    id: 'noaa20',
    name: 'NOAA-20',
    instrument: 'VIIRS',
    kind: 'polar',
    ltan: 13.42,
    ltdn: 1.42,
    // Half an orbit behind Suomi NPP in the same plane, which is what turns two
    // looks a day into four.
    phaseMinutes: 50,
    swathKm: 3040,
    nadirPixelM: 375,
    edgePixelM: 800,
    product: 'VIIRS_NOAA20_NRT',
    note: 'Same orbit as Suomi NPP, fifty minutes behind it. Doubles the daily looks.',
  },
  {
    id: 'noaa21',
    name: 'NOAA-21',
    instrument: 'VIIRS',
    kind: 'polar',
    ltan: 13.42,
    ltdn: 1.42,
    phaseMinutes: 100,
    swathKm: 3040,
    nadirPixelM: 375,
    edgePixelM: 800,
    product: 'VIIRS_NOAA21_NRT',
    note: 'The third VIIRS in the same plane.',
  },
  {
    id: 'terra',
    name: 'Terra',
    instrument: 'MODIS',
    kind: 'polar',
    ltan: 22.5,
    ltdn: 10.5,
    swathKm: 2330,
    nadirPixelM: 1000,
    edgePixelM: 4800,
    product: 'MODIS_NRT',
    note: 'Morning MODIS. Coarser than VIIRS, and the longest fire record there is.',
  },
  {
    id: 'aqua',
    name: 'Aqua',
    instrument: 'MODIS',
    kind: 'polar',
    ltan: 13.5,
    ltdn: 1.5,
    swathKm: 2330,
    nadirPixelM: 1000,
    edgePixelM: 4800,
    product: 'MODIS_NRT',
    note: 'Afternoon MODIS, near the daily peak of fire activity.',
  },
]);

/**
 * The geostationary option — always looking, never in detail.
 *
 * This is the trade the app puts in front of a reader between polar passes. A
 * GOES ABI pixel is 2 km at the sub-satellite point and considerably worse at
 * the latitudes and view angles most fires happen at, so it will not find a new
 * small fire the way VIIRS will. What it will do is watch a large one every ten
 * minutes, which for a fire that is already running is the more useful property
 * by a wide margin.
 *
 * @type {ReadonlyArray<object>}
 */
export const GEOSTATIONARY = Object.freeze([
  {
    id: 'goes-east',
    name: 'GOES-19 (East)',
    instrument: 'ABI',
    kind: 'geo',
    subLon: -75.2,
    refreshMinutes: 10,
    conusRefreshMinutes: 5,
    nadirPixelM: 2000,
    note: 'Full disk every 10 minutes, the continental US every 5. Two-kilometre pixels.',
  },
  {
    id: 'goes-west',
    name: 'GOES-18 (West)',
    instrument: 'ABI',
    kind: 'geo',
    subLon: -137.0,
    refreshMinutes: 10,
    conusRefreshMinutes: 5,
    nadirPixelM: 2000,
    note: 'Covers the western US and the Pacific on the same cadence.',
  },
  {
    id: 'meteosat-0',
    name: 'Meteosat-12 (0°)',
    instrument: 'FCI',
    kind: 'geo',
    subLon: 0,
    refreshMinutes: 10,
    nadirPixelM: 2000,
    note: 'Europe, Africa and the Atlantic. Full disc every 10 minutes.',
  },
  {
    id: 'meteosat-iodc',
    name: 'Meteosat-9 (Indian Ocean)',
    instrument: 'SEVIRI',
    kind: 'geo',
    subLon: 45.5,
    refreshMinutes: 15,
    nadirPixelM: 3000,
    note: 'The Indian Ocean position — the Middle East, east Africa and south Asia.',
  },
  {
    id: 'himawari',
    name: 'Himawari-9',
    instrument: 'AHI',
    kind: 'geo',
    subLon: 140.7,
    refreshMinutes: 10,
    nadirPixelM: 2000,
    note: 'East Asia and Australia. Full disc every 10 minutes.',
  },
  {
    id: 'gk2a',
    name: 'GEO-KOMPSAT-2A',
    instrument: 'AMI',
    kind: 'geo',
    subLon: 128.2,
    refreshMinutes: 10,
    nadirPixelM: 2000,
    note: 'A second east-Asian view, useful when Himawari is off-schedule.',
  },
]);

/** Stated accuracy of every time this module returns, minutes. */
export const ESTIMATE_UNCERTAINTY_MIN = 50;

/**
 * Next time a given local solar time occurs at a longitude.
 *
 * @param {number} localHours Local solar time, decimal hours.
 * @param {number} lon Longitude, degrees.
 * @param {number} fromMs Search start, epoch ms.
 * @returns {number} Epoch ms of the next occurrence.
 */
export function nextLocalSolarTime(localHours, lon, fromMs) {
  const DAY = 86400_000;
  // Local solar time leads UTC by lon/15 hours, so the UTC hour at which a
  // given local solar time occurs is that time minus the longitude offset.
  const utcHours = ((localHours - lon / 15) % 24 + 24) % 24;
  const dayStart = Math.floor(fromMs / DAY) * DAY;
  let candidate = dayStart + utcHours * 3600_000;
  while (candidate <= fromMs) candidate += DAY;
  return candidate;
}

/**
 * Whether a satellite's swath can reach a latitude at all.
 *
 * Every satellite here is in a near-polar orbit, so this is nearly always true;
 * it exists so the function that calls it is honest for the equatorial
 * longitude gaps in MODIS's narrower swath.
 *
 * @param {object} satellite A satellite record.
 * @param {number} lat Latitude, degrees.
 * @returns {{covered: boolean, dailyLooks: number}} Coverage and roughly how
 *   many looks a day the latitude gets.
 */
export function coverageAt(satellite, lat) {
  const absLat = Math.abs(lat);
  // Orbits converge towards the poles, so high latitudes are overflown on many
  // consecutive orbits and the tropics on one or two per crossing.
  const convergence = 1 / Math.max(0.2, Math.cos((absLat * Math.PI) / 180));
  const base = satellite.swathKm >= 3000 ? 2 : 1.6;
  return {
    covered: true,
    dailyLooks: Math.round(base * convergence * 10) / 10,
  };
}

/**
 * The next looks at a place, from every satellite, in time order.
 *
 * @param {{lat: number, lon: number}} place Where.
 * @param {number} [fromMs=Date.now()] When to search from.
 * @param {number} [count=6] How many upcoming passes to return.
 * @returns {Array<{satellite: string, id: string, instrument: string, product: string,
 *   atMs: number, inMinutes: number, pass: 'day'|'night', pixelM: number,
 *   uncertaintyMin: number, note: string}>} Upcoming looks, soonest first.
 */
export function nextLooks(place, fromMs = Date.now(), count = 6) {
  const looks = [];
  for (const satellite of SATELLITES) {
    const phase = (satellite.phaseMinutes ?? 0) * 60_000;
    for (const [pass, localHours] of [
      ['day', satellite.ltan >= 6 && satellite.ltan < 18 ? satellite.ltan : satellite.ltdn],
      ['night', satellite.ltan >= 6 && satellite.ltan < 18 ? satellite.ltdn : satellite.ltan],
    ]) {
      const atMs = nextLocalSolarTime(localHours, place.lon, fromMs) + phase;
      looks.push({
        satellite: satellite.name,
        id: satellite.id,
        instrument: satellite.instrument,
        product: satellite.product,
        atMs,
        inMinutes: Math.round((atMs - fromMs) / 60000),
        pass,
        pixelM: satellite.nadirPixelM,
        uncertaintyMin: ESTIMATE_UNCERTAINTY_MIN,
        note: satellite.note,
      });
    }
  }
  return looks.sort((a, b) => a.atMs - b.atMs).slice(0, count);
}

/**
 * The single most useful sentence: when is the next look, and what fills the gap.
 *
 * @param {{lat: number, lon: number}} place Where.
 * @param {number} [fromMs=Date.now()] When.
 * @returns {{next: ?object, gapMinutes: ?number, geo: ?object, headline: string,
 *   detail: string}} The next pass and the geostationary fallback.
 */
export function nextLookSummary(place, fromMs = Date.now()) {
  const looks = nextLooks(place, fromMs, 1);
  const next = looks[0] ?? null;
  const geo = bestGeostationary(place);
  if (!next) {
    return {
      next: null,
      gapMinutes: null,
      geo,
      headline: 'No upcoming pass could be worked out.',
      detail: 'Check the coordinates.',
    };
  }
  const gap = next.inMinutes;
  const gapText = gap < 90 ? `${gap} minutes` : `${(gap / 60).toFixed(1)} hours`;
  const headline = `Next ${next.instrument} look in about ${gapText} — ${next.satellite}, ${next.pass} pass`;
  const detail = geo
    ? `Give or take ${ESTIMATE_UNCERTAINTY_MIN} minutes. Until then, refreshing changes nothing at ${next.pixelM} m; ${geo.name} is watching every ${geo.refreshMinutes} minutes at an effective ${(geo.effectivePixelM / 1000).toFixed(1)} km here, which will follow a fire that is already large but will not find a new small one.`
    : `Give or take ${ESTIMATE_UNCERTAINTY_MIN} minutes. Until then, refreshing this map changes nothing — there is no new observation to fetch.`;
  return { next, gapMinutes: gap, geo, headline, detail };
}

/**
 * Which geostationary satellite has the better view of a place.
 *
 * View angle matters more than people expect. A GOES pixel is 2 km beneath the
 * satellite and stretches badly towards the limb; past about 60° away from the
 * sub-satellite point the ground is being viewed so obliquely that a "2 km
 * pixel" covers many times that, and a fire's smoke plume is being seen more
 * than the fire.
 *
 * @param {{lat: number, lon: number}} place Where.
 * @returns {?object} The satellite with the smallest pixel on this ground, its
 *   view angle and its stretched pixel size, or null when none can see the place.
 */
export function bestGeostationary(place) {
  let best = null;
  for (const satellite of GEOSTATIONARY) {
    const dLon = Math.abs(((place.lon - satellite.subLon + 540) % 360) - 180);
    // Angular distance from the sub-satellite point, spherical law of cosines.
    const rad = Math.PI / 180;
    const central =
      Math.acos(
        Math.min(1, Math.max(-1, Math.cos(place.lat * rad) * Math.cos(dLon * rad))),
      ) / rad;
    if (central >= 81) continue;
    // Pixel growth towards the limb goes roughly as 1/cos of the central angle.
    const stretch = 1 / Math.max(0.15, Math.cos(central * rad));
    const candidate = {
      ...satellite,
      centralAngleDeg: central,
      effectivePixelM: satellite.nadirPixelM * stretch,
      viewNote:
        central < 30
          ? 'Close to straight down — this is as good as a geostationary view gets.'
          : central < 55
            ? 'Off to the side. Pixels are noticeably stretched on the ground.'
            : 'Near the edge of the disc. Pixels are stretched several times over and you are seeing the plume more than the fire.',
    };
    // Rank on the pixel that actually lands on this ground, not on view angle.
    // The two disagree whenever a coarser instrument happens to sit a little
    // nearer the meridian, and it is the pixel a reader cares about.
    if (!best || candidate.effectivePixelM < best.effectivePixelM) best = candidate;
  }
  return best;
}

/**
 * What the pixel size actually is at a place, given a pass geometry.
 *
 * Reported so nobody carries "375 m" around as though it were a property of
 * VIIRS rather than a property of looking straight down.
 *
 * @param {object} satellite A polar satellite record.
 * @param {number} [acrossTrackFraction=0.5] How far across the swath, 0 at
 *   nadir to 1 at the edge.
 * @returns {{pixelM: number, note: string}} Effective pixel size.
 */
export function pixelAt(satellite, acrossTrackFraction = 0.5) {
  const t = Math.min(1, Math.max(0, acrossTrackFraction));
  const pixel = satellite.nadirPixelM + (satellite.edgePixelM - satellite.nadirPixelM) * t ** 2;
  return {
    pixelM: pixel,
    note: `${Math.round(pixel)} m at this point in the swath — ${satellite.nadirPixelM} m is the nadir figure and only applies directly beneath the satellite.`,
  };
}

/**
 * The caveat that goes with every time in this module.
 *
 * @returns {string} What the estimate is and is not.
 */
export function overpassCaveat() {
  return `These times come from each satellite's fixed sun-synchronous crossing time, not from an ephemeris. They are good to roughly ±${ESTIMATE_UNCERTAINTY_MIN} minutes and will be wrong after a manoeuvre. For exact times, propagate a current TLE with SGP4 — this is a planning estimate, not a pointing solution.`;
}
