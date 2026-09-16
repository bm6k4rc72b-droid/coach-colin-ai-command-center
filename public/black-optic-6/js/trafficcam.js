/**
 * Public traffic cameras — the roads in and out.
 *
 * A ranch has two kinds of camera problem. The first is the fence line, which
 * the optics deck already owns. The second is everything between the gate and
 * the highway: whether the road out is moving, whether there is smoke over the
 * ridge, whether the crew is going to get in this morning. Transport agencies
 * publish that view for free, and it is genuinely public data — these are
 * cameras pointed at public roads by the agency that owns the road, published
 * deliberately, with no login and no expectation of privacy.
 *
 * **This module handles those and nothing else.** It takes a published catalog
 * from a named agency and reads the frames that agency publishes. It has no
 * facility for finding, scanning or opening a camera that somebody did not
 * publish, and the fact that unsecured private cameras are trivially findable
 * on the open internet is not a feature this console will grow.
 *
 * **What works where, stated once:**
 *
 * - **The frames display anywhere.** An `<img>` does not need CORS, so a
 *   Caltrans still renders on a static page with no key, no server and no relay.
 * - **The frames are not measurable that way.** Drawing a cross-origin image
 *   taints the canvas, and every measurement in this console reads pixels back
 *   off one. This is the same wall the Argus cameras hit, so it is the same
 *   function that reports it — `analysable()` in `argus.js` — rather than a
 *   second opinion that could drift from the first.
 * - **The catalog needs a proxy.** Fetching the agency's JSON is a cross-origin
 *   *read*, which CORS does govern, and these agencies do not send the header.
 *   The relay that already makes the Argus cameras measurable serves the
 *   catalog too, so there is one thing to set up rather than two.
 *
 * @module black-optic-6/trafficcam
 */

import { analysable, LOCAL_RELAY_PATH } from './argus.js';
import { greatCircleKm, bearing, compass } from './world.js';

/**
 * The agencies whose catalogs this console knows how to read.
 *
 * Attribution is carried in the record rather than in a footer somewhere,
 * because for at least one of these it is a licence condition and not a
 * courtesy: TfL's open-data terms require the credit to be shown.
 */
export const PROVIDERS = Object.freeze([
  {
    id: 'caltrans',
    name: 'Caltrans',
    region: 'California',
    credit: 'Caltrans — cwwp2.dot.ca.gov',
    creditRequired: false,
    host: 'https://cwwp2.dot.ca.gov/',
    note: 'One JSON feed per district, identical schema statewide, keyless. District 4 is the Bay Area and covers Napa.',
  },
  {
    id: 'austin',
    name: 'City of Austin',
    region: 'Austin, TX',
    credit: 'City of Austin, TX — data.austintexas.gov',
    creditRequired: false,
    host: 'https://data.austintexas.gov/',
    note: 'City open-data camera catalog.',
  },
  {
    id: 'tfl',
    name: 'TfL JamCams',
    region: 'London',
    credit: 'Powered by TfL Open Data. Contains OS data © Crown copyright and database rights',
    creditRequired: true,
    host: 'https://api.tfl.gov.uk/',
    note: 'Keyless list endpoint; frames on a public bucket. The credit is required by TfL\'s terms, not optional.',
  },
]);

/** Caltrans districts. The ranch is in District 4. */
export const CALTRANS_DISTRICTS = Object.freeze([
  { id: 1, name: 'North Coast — Eureka' },
  { id: 2, name: 'Northeast — Redding' },
  { id: 3, name: 'Sacramento Valley' },
  { id: 4, name: 'Bay Area — includes Napa', home: true },
  { id: 5, name: 'Central Coast — San Luis Obispo' },
  { id: 6, name: 'Central Valley — Fresno' },
  { id: 7, name: 'Los Angeles' },
  { id: 8, name: 'San Bernardino / Riverside' },
  { id: 9, name: 'Eastern Sierra — Bishop' },
  { id: 10, name: 'Central — Stockton' },
  { id: 11, name: 'San Diego' },
  { id: 12, name: 'Orange County' },
]);

/** The official catalog URL for a Caltrans district. */
export function catalogUrl(district) {
  const id = Number(district);
  if (!Number.isInteger(id) || id < 1 || id > 12) return null;
  return `https://cwwp2.dot.ca.gov/data/d${id}/cctv/cctvStatusD${String(id).padStart(2, '0')}.json`;
}

/**
 * The same catalog, through the local relay.
 *
 * The relay is a plain reverse proxy, so the upstream URL is handed to it as a
 * path. This is the address that actually works from a browser, and the reason
 * the console offers it first.
 */
export function catalogViaRelay(district, relayPath = LOCAL_RELAY_PATH) {
  const direct = catalogUrl(district);
  if (!direct) return null;
  return `${relayPath}/caltrans/d${Number(district)}/cctv.json`;
}

/**
 * Normalise a Caltrans district payload into camera records.
 *
 * Mirrors the filtering the parent project's server does, for the same reasons:
 * out-of-service cameras are dropped because they publish a stale or missing
 * frame, records without finite coordinates are dropped because a camera that
 * cannot be placed cannot be chosen by distance, and the image URL is pinned to
 * the official host so a malformed catalog cannot point this console at an
 * arbitrary address.
 */
export function normaliseCaltrans(payload, district) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const cameras = [];
  let skipped = 0;

  for (const row of rows) {
    const cctv = row?.cctv;
    if (!cctv) { skipped += 1; continue; }
    if (String(cctv.inService).toLowerCase() !== 'true') { skipped += 1; continue; }

    const loc = cctv.location || {};
    const lat = Number(loc.latitude);
    const lon = Number(loc.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skipped += 1; continue; }

    const imageUrl = String(cctv.imageData?.static?.currentImageURL || '');
    if (!imageUrl.startsWith('https://cwwp2.dot.ca.gov/')) { skipped += 1; continue; }

    const locationName = String(loc.locationName || '').trim();
    const codeMatch = /^([A-Za-z0-9_-]+)\s*--/.exec(locationName);
    const code = (codeMatch ? codeMatch[1] : `x${cameras.length}`).toLowerCase();
    const label = locationName.replace(/^([A-Za-z0-9_-]+)\s*--\s*/, '')
      || `Caltrans D${district} ${code}`;

    cameras.push({
      id: `ca-d${district}-${code}`,
      provider: 'caltrans',
      name: loc.nearbyPlace ? `${label} (${loc.nearbyPlace})` : label,
      route: String(loc.route || '').trim() || null,
      direction: String(loc.direction || '').trim() || null,
      place: String(loc.nearbyPlace || '').trim() || null,
      lat,
      lon,
      imageUrl,
    });
  }

  return { cameras, skipped, claimed: rows.length };
}

/**
 * A frame URL with a cache-buster.
 *
 * These cameras republish to the same address every minute or so, and a browser
 * that has the previous frame cached will happily show it for an hour. The
 * nonce is what turns a still address into a live one. It is a parameter rather
 * than `Date.now()` inside the function so a test can pin it.
 */
export function frameUrl(camera, nonce = Date.now()) {
  if (!camera?.imageUrl) return null;
  const separator = camera.imageUrl.includes('?') ? '&' : '?';
  return `${camera.imageUrl}${separator}_=${Math.floor(nonce)}`;
}

/** The same frame through the relay, which is what makes it measurable. */
export function frameViaRelay(camera, nonce = Date.now(), relayPath = LOCAL_RELAY_PATH) {
  if (!camera?.imageUrl) return null;
  let tail;
  try {
    tail = new URL(camera.imageUrl).pathname.replace(/^\//, '');
  } catch {
    return null;
  }
  return `${relayPath}/caltrans/${tail}?_=${Math.floor(nonce)}`;
}

/** Nearest cameras to a place, with range and bearing, closest first. */
export function nearest(cameras, origin, count = 6, maxKm = Infinity) {
  if (!origin || !Array.isArray(cameras)) return [];
  return cameras
    .map((camera) => ({
      ...camera,
      rangeKm: greatCircleKm(origin, camera),
      bearingDeg: bearing(origin, camera),
    }))
    .filter((camera) => Number.isFinite(camera.rangeKm) && camera.rangeKm <= maxKm)
    .sort((a, b) => a.rangeKm - b.rangeKm)
    .slice(0, Math.max(0, count));
}

/** A short human range string, matching how the rest of the console prints one. */
export function rangeLabel(camera) {
  if (!Number.isFinite(camera?.rangeKm)) return '—';
  const km = camera.rangeKm;
  const distance = km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  return `${distance} ${compass(camera.bearingDeg)}`;
}

/**
 * Whether a frame can be measured, and why not when it cannot.
 *
 * Delegates to the Argus rule rather than restating it. A traffic camera and a
 * Reolink on a fence post hit exactly the same wall, and two functions that
 * answer the same question are two functions that will eventually disagree.
 */
export function measurability(camera, { pageOrigin = '', viaRelay = false, cors = false } = {}) {
  if (!camera) return { analysable: false, display: false, reason: 'No camera selected.' };
  const url = viaRelay ? frameViaRelay(camera, 0) : camera.imageUrl;
  return analysable({ kind: 'snapshot', url, pageOrigin, cors: cors || viaRelay });
}

/**
 * What it takes to get the catalog, said plainly.
 *
 * There is no keyless client-side path to the catalog, and pretending otherwise
 * would waste somebody's evening. The relay is the answer, it is the same relay
 * the cameras already needed, and it is free.
 */
export function catalogRoute({ relayAvailable = false, district = 4 } = {}) {
  if (relayAvailable) {
    return {
      ok: true,
      url: catalogViaRelay(district),
      state: 'LINK',
      verdict: 'Fetched through the local relay, same origin as this console — so the list loads and the frames are measurable.',
    };
  }
  return {
    ok: false,
    url: catalogUrl(district),
    state: 'BLOCKED',
    verdict: 'The agency does not send CORS headers, so a browser will not let this page read the camera list directly. The relay that makes the fence cameras measurable serves this too — one setup, not two. Frames themselves still display without it.',
  };
}

/** Provider record by id. */
export function provider(id) {
  return PROVIDERS.find((entry) => entry.id === id) || null;
}

/** Every credit that must be shown for a set of cameras. */
export function credits(cameras) {
  const ids = new Set(cameras.map((camera) => camera.provider));
  return PROVIDERS.filter((entry) => ids.has(entry.id)).map((entry) => ({
    name: entry.name,
    credit: entry.credit,
    required: entry.creditRequired,
  }));
}
