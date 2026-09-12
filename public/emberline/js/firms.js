/**
 * Satellite fire detections, drawn as what they are.
 *
 * Every fire map draws FIRMS detections as dots. A dot is a lie of omission,
 * and it is the single most consequential one in this field, because it hides
 * two separate things at once.
 *
 * **A detection is a pixel, not a point.** VIIRS resolves 375 m at nadir and
 * closer to 800 m at the edge of its 3040 km swath; MODIS runs from 1 km at
 * nadir to nearly 5 km at the edge. The coordinate in the CSV is the *centre*
 * of that pixel. The fire is somewhere in it. Drawn as a dot, a detection says
 * "the fire is here" with a precision of metres; drawn as its footprint, it
 * says "something in this 375-by-780-metre box was hot", which is the true
 * claim and is often the difference between two dots being one fire or two.
 *
 * FIRMS gives the footprint away for free in the `scan` and `track` columns —
 * the along-scan and along-track pixel dimensions in kilometres, per detection.
 * Almost nothing draws them. This module does.
 *
 * **A detection is old.** Polar orbiters look at a given place a few times a
 * day. A detection timestamped 13:42 UTC and fetched at 17:00 is three hours
 * and eighteen minutes stale, and in three hours a wind-driven fire moves
 * kilometres. So age is not metadata here, it is the primary attribute: the
 * app dims a detection as it ages, states the age in words, and points at
 * {@link module:emberline/overpass} for when the picture next refreshes.
 *
 * And one thing this module will not do: infer a fire that FIRMS did not
 * report. No detection is not the same as no fire. Cloud blocks the sensor
 * entirely, small or smouldering fires fall under the detection threshold, and
 * the gap between overpasses is hours wide. An empty map means "nothing was
 * seen from orbit in this window", and the app says that instead of leaving a
 * reader to read reassurance into blank ground.
 *
 * @module emberline/firms
 */

import { destination, distanceM, centroid, metresPerDegreeLat, metresPerDegreeLon } from './geo.js';

/** Header fields a payload must carry to count as FIRMS CSV. */
const REQUIRED_FIELDS = ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence'];

/** Nominal nadir pixel size by instrument, kilometres — the fallback when `scan`/`track` are absent. */
export const NOMINAL_PIXEL_KM = Object.freeze({
  VIIRS: 0.375,
  MODIS: 1.0,
});

/**
 * Is this actually FIRMS CSV?
 *
 * FIRMS reports failure as an HTML page or a bare sentence — "Invalid MAP_KEY"
 * — never as CSV, so a parser that returns an empty array for both cannot tell
 * "no fires" from "your key is wrong", and an app built on it shows a reassuring
 * empty map when it has no data at all.
 *
 * @param {string} text Raw response body.
 * @returns {boolean} True when the first line is a FIRMS header.
 */
export function isFirmsCsv(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trimStart();
  if (!trimmed || trimmed[0] === '<') return false;
  const end = trimmed.indexOf('\n');
  const header = (end === -1 ? trimmed : trimmed.slice(0, end)).trim().toLowerCase();
  const fields = header.split(',').map((f) => f.trim());
  return REQUIRED_FIELDS.every((required) => fields.includes(required));
}

/**
 * Parse FIRMS area CSV into detections.
 *
 * @param {string} text Raw CSV.
 * @returns {?Array<object>} Detections, or null when the payload is not CSV —
 *   which is how the caller tells an upstream failure from a quiet day.
 */
export function parseDetections(text) {
  if (!isFirmsCsv(text)) return null;
  const lines = text.split('\n');
  let headerIndex = 0;
  while (headerIndex < lines.length && !lines[headerIndex].trim()) headerIndex += 1;
  const header = lines[headerIndex].trim().toLowerCase().split(',').map((f) => f.trim());
  const col = new Map(header.map((name, i) => [name, i]));
  const at = (fields, name) => {
    const index = col.get(name);
    return index == null ? undefined : fields[index]?.trim();
  };

  const detections = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = line.split(',');
    const lat = Number(at(fields, 'latitude'));
    const lon = Number(at(fields, 'longitude'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    const instrument = (at(fields, 'instrument') ?? '').toUpperCase();
    const scanKm = Number(at(fields, 'scan'));
    const trackKm = Number(at(fields, 'track'));
    const nominal = instrument.includes('MODIS') ? NOMINAL_PIXEL_KM.MODIS : NOMINAL_PIXEL_KM.VIIRS;

    detections.push({
      lat,
      lon,
      // Pixel dimensions are the whole point of this module. When FIRMS omits
      // them, the nominal nadir size stands in and `pixelKnown` says so, so the
      // footprint drawn is never mistaken for a measured one.
      scanKm: Number.isFinite(scanKm) && scanKm > 0 ? scanKm : nominal,
      trackKm: Number.isFinite(trackKm) && trackKm > 0 ? trackKm : nominal,
      pixelKnown: Number.isFinite(scanKm) && scanKm > 0 && Number.isFinite(trackKm) && trackKm > 0,
      frpMw: numberOrNull(at(fields, 'frp')),
      brightnessK: numberOrNull(at(fields, 'bright_ti4') ?? at(fields, 'brightness')),
      confidence: at(fields, 'confidence') ?? '',
      daynight: (at(fields, 'daynight') ?? '').toUpperCase(),
      satellite: at(fields, 'satellite') ?? '',
      instrument: instrument || 'VIIRS',
      acqDate: at(fields, 'acq_date') ?? '',
      acqTime: at(fields, 'acq_time') ?? '',
      acquiredMs: acquisitionMs(at(fields, 'acq_date'), at(fields, 'acq_time')),
    });
  }
  return detections;
}

/**
 * Parse a numeric field, tolerating blanks.
 *
 * @param {string|undefined} value Raw field.
 * @returns {?number} The number, or null.
 */
function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Acquisition time in epoch milliseconds, UTC.
 *
 * `acq_time` is HHMM without zero padding — "45" means 00:45 UTC, not 45
 * minutes past some hour and not 4.5 anything. Read naively it puts a
 * pre-dawn detection eleven hours out of place, which is enough to make a fresh
 * detection look stale or a stale one look fresh.
 *
 * @param {string|undefined} date `YYYY-MM-DD`.
 * @param {string|undefined} time `HHMM`, possibly unpadded.
 * @returns {?number} Epoch ms, or null when unparseable.
 */
export function acquisitionMs(date, time) {
  if (!date) return null;
  const padded = String(time ?? '0').padStart(4, '0');
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return ms + hours * 3600_000 + minutes * 60_000;
}

/**
 * The ground footprint of a detection, as a ring you can draw.
 *
 * The pixel is treated as axis-aligned to the scan, which is an approximation:
 * the true footprint is a slightly skewed quadrilateral whose orientation
 * depends on the satellite's track angle at that point, and FIRMS does not
 * publish the track angle. The approximation is right to within a few degrees
 * of rotation on a box whose size is the honest part of the claim.
 *
 * @param {object} detection A parsed detection.
 * @returns {Array<{lat: number, lon: number}>} Five vertices, closing the box.
 */
export function pixelFootprint(detection) {
  const halfScanM = (detection.scanKm * 1000) / 2;
  const halfTrackM = (detection.trackKm * 1000) / 2;
  const dLat = halfTrackM / metresPerDegreeLat();
  const dLon = halfScanM / Math.max(1, metresPerDegreeLon(detection.lat));
  const { lat, lon } = detection;
  return [
    { lat: lat - dLat, lon: lon - dLon },
    { lat: lat - dLat, lon: lon + dLon },
    { lat: lat + dLat, lon: lon + dLon },
    { lat: lat + dLat, lon: lon - dLon },
    { lat: lat - dLat, lon: lon - dLon },
  ];
}

/** Area of a detection's pixel, hectares. @param {object} d @returns {number} */
export function pixelAreaHa(d) {
  return (d.scanKm * 1000 * d.trackKm * 1000) / 10000;
}

/**
 * Confidence as a comparable number, across two instruments that disagree about
 * what confidence means.
 *
 * VIIRS reports `l`/`n`/`h`. MODIS reports 0–100. Code that sorts on the raw
 * field puts every VIIRS detection in alphabetical order and every MODIS one in
 * numeric order and produces a ranking that means nothing. The mapping here is
 * coarse on purpose and the original value is always kept beside it.
 *
 * @param {object} detection A parsed detection.
 * @returns {{score: number, label: string}} A 0–1 score and a readable label.
 */
export function confidenceScore(detection) {
  const raw = String(detection.confidence ?? '').trim().toLowerCase();
  if (raw === 'h' || raw === 'high') return { score: 0.9, label: 'high' };
  if (raw === 'n' || raw === 'nominal') return { score: 0.6, label: 'nominal' };
  if (raw === 'l' || raw === 'low') return { score: 0.25, label: 'low' };
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const score = Math.min(1, Math.max(0, numeric / 100));
    return {
      score,
      label: numeric >= 80 ? 'high' : numeric >= 50 ? 'nominal' : 'low',
    };
  }
  return { score: 0.5, label: 'unstated' };
}

/**
 * How old a detection is, and what that means.
 *
 * @param {object} detection A parsed detection.
 * @param {number} [nowMs=Date.now()] Current time.
 * @returns {{ageMs: ?number, ageText: string, staleness: 'fresh'|'recent'|'stale'|'old'|'unknown',
 *   caveat: string}} Age with the interpretation attached.
 */
export function detectionAge(detection, nowMs = Date.now()) {
  const acquired = detection.acquiredMs;
  if (!Number.isFinite(acquired)) {
    return {
      ageMs: null,
      ageText: 'unknown age',
      staleness: 'unknown',
      caveat: 'This detection carries no usable timestamp, so nothing can be said about whether the fire is still there.',
    };
  }
  const ageMs = Math.max(0, nowMs - acquired);
  const minutes = ageMs / 60000;
  const ageText =
    minutes < 90
      ? `${Math.round(minutes)} min ago`
      : minutes < 60 * 36
        ? `${(minutes / 60).toFixed(1)} h ago`
        : `${Math.round(minutes / 60 / 24)} days ago`;
  let staleness;
  let caveat;
  if (minutes < 60) {
    staleness = 'fresh';
    caveat = 'Recent enough that the fire is probably close to where this pixel says.';
  } else if (minutes < 4 * 60) {
    staleness = 'recent';
    caveat = 'A wind-driven fire can have moved a kilometre or more since this was taken.';
  } else if (minutes < 24 * 60) {
    staleness = 'stale';
    caveat = 'Hours old. This says where a fire was, not where its edge is now.';
  } else {
    staleness = 'old';
    caveat = 'Over a day old. Useful for where a fire started, useless for where it is.';
  }
  return { ageMs, ageText, staleness, caveat };
}

/**
 * Group detections that plausibly belong to the same fire.
 *
 * Single-link clustering with a distance threshold, which is the right shape of
 * algorithm here: a fire perimeter is a chain of hot pixels, and any method that
 * insists on compact blobs will cut a long running fire into pieces at exactly
 * the moment it matters.
 *
 * The threshold defaults to 1.5 km, a little over two VIIRS pixels at the swath
 * edge, so adjacent pixels of one front join and two fires a village apart do
 * not. It is not a fire-detection algorithm and does not claim to be — merging
 * two fires that happen to be close is a mistake this will make, and the cluster
 * carries its own spread so a reader can see when it has happened.
 *
 * @param {Array<object>} detections Parsed detections.
 * @param {number} [thresholdM=1500] Join distance.
 * @returns {Array<{id: string, detections: Array<object>, centre: {lat: number, lon: number},
 *   totalFrpMw: number, maxFrpMw: number, spanM: number, newestMs: ?number,
 *   oldestMs: ?number, confidence: number, instruments: string[]}>} Clusters,
 *   strongest first.
 */
export function clusterDetections(detections, thresholdM = 1500) {
  const parent = detections.map((_, i) => i);
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
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < detections.length; i += 1) {
    for (let j = i + 1; j < detections.length; j += 1) {
      // Cheap latitude reject before the trigonometry: at any latitude a degree
      // of latitude is at least 111 km, so anything further apart than the
      // threshold in latitude alone cannot possibly join.
      if (Math.abs(detections[i].lat - detections[j].lat) * metresPerDegreeLat() > thresholdM) continue;
      if (distanceM(detections[i], detections[j]) <= thresholdM) union(i, j);
    }
  }

  const groups = new Map();
  detections.forEach((detection, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(detection);
  });

  const clusters = [...groups.values()].map((members, index) => {
    const centre = centroid(members.map((d) => ({ lat: d.lat, lon: d.lon })));
    const frps = members.map((d) => d.frpMw).filter((f) => Number.isFinite(f));
    const times = members.map((d) => d.acquiredMs).filter((t) => Number.isFinite(t));
    let spanM = 0;
    for (const member of members) spanM = Math.max(spanM, distanceM(centre, member));
    return {
      id: `cluster-${index + 1}`,
      detections: members,
      centre,
      totalFrpMw: frps.reduce((sum, f) => sum + f, 0),
      maxFrpMw: frps.length ? Math.max(...frps) : 0,
      spanM: spanM * 2,
      newestMs: times.length ? Math.max(...times) : null,
      oldestMs: times.length ? Math.min(...times) : null,
      confidence: members.reduce((best, d) => Math.max(best, confidenceScore(d).score), 0),
      instruments: [...new Set(members.map((d) => d.instrument).filter(Boolean))],
    };
  });

  return clusters.sort((a, b) => b.totalFrpMw - a.totalFrpMw || b.detections.length - a.detections.length);
}

/**
 * What the total radiative power of a cluster does and does not tell you.
 *
 * Fire radiative power is a real measurement in megawatts and it does correlate
 * with how much fuel is being consumed. It is also the number most likely to be
 * over-read: it is the power radiating *at the instant of the overpass*, from
 * the part of the fire the satellite could see, through whatever smoke was in
 * the way. It is not fire size, and two detections with the same FRP can be a
 * small intense flaming front and a large smouldering area.
 *
 * @param {{totalFrpMw: number, detections: Array<object>}} cluster A cluster.
 * @returns {{totalFrpMw: number, band: string, note: string}} The reading with
 *   its caveat, never the reading alone.
 */
export function radiativePower(cluster) {
  const mw = cluster.totalFrpMw;
  const band = mw >= 1000 ? 'very large' : mw >= 250 ? 'large' : mw >= 50 ? 'moderate' : 'small';
  return {
    totalFrpMw: mw,
    band,
    note: `${Math.round(mw)} MW across ${cluster.detections.length} pixel${cluster.detections.length === 1 ? '' : 's'} at the moment of the overpass — a measure of how hard it was burning when it was looked at, not of how big it is or how fast it is moving.`,
  };
}

/**
 * The sentence that belongs on an empty map.
 *
 * @param {number} windowHours How far back the query looked.
 * @returns {string} What "no detections" actually means.
 */
export function emptyResultMeaning(windowHours) {
  return `No satellite detected a fire here in the last ${windowHours} hours. That is not the same as there being no fire: cloud hides the ground completely, fires under roughly a hundred square metres usually fall below the detection threshold, and there are hours between one look and the next.`;
}

/**
 * Build a FIRMS area request URL.
 *
 * @param {object} options Query.
 * @param {string} options.key FIRMS MAP_KEY.
 * @param {string} [options.source='VIIRS_SNPP_NRT'] FIRMS product.
 * @param {{south: number, north: number, west: number, east: number}} options.bounds Area.
 * @param {number} [options.days=2] Days back. FIRMS counts `days=1` as the
 *   current UTC day, which is nearly empty just after midnight UTC, so callers
 *   ask for two and clamp locally.
 * @returns {string} The request URL.
 */
export function areaRequestUrl({ key, source = 'VIIRS_SNPP_NRT', bounds, days = 2 }) {
  const area = [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((v) => v.toFixed(4))
    .join(',');
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}/${area}/${days}`;
}

/**
 * Keep only detections inside a trailing window.
 *
 * @param {Array<object>} detections Parsed detections.
 * @param {number} hours Window length.
 * @param {number} [nowMs=Date.now()] Current time.
 * @returns {Array<object>} Detections inside the window, newest first.
 */
export function withinHours(detections, hours, nowMs = Date.now()) {
  const floor = nowMs - hours * 3600_000;
  // Two hours of forward slack: the satellite's clock and the browser's clock
  // are not the same clock, and a detection from the immediate future is a skew
  // artefact, not a reason to drop the freshest data on the map.
  const ceiling = nowMs + 2 * 3600_000;
  return detections
    .filter((d) => Number.isFinite(d.acquiredMs) && d.acquiredMs >= floor && d.acquiredMs <= ceiling)
    .sort((a, b) => b.acquiredMs - a.acquiredMs);
}

export { destination };
