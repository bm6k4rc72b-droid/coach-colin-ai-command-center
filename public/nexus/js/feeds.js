/**
 * Live feed aggregator.
 *
 * Six public sources, all reachable straight from a browser with CORS, all
 * keyless. Each one degrades in the same three steps: LIVE from the network,
 * CACHED from the last good response in local storage, then SIM — a clearly
 * labelled synthetic feed so the console still teaches when the network is
 * gone or an upstream is rate-limiting.
 *
 * Nothing here is safety-critical and the console says so: this is situational
 * awareness for a training environment, not an operational picture.
 *
 * @module nexus/feeds
 */

const CACHE_PREFIX = 'nexus.feed.';

/**
 * Fetch JSON with a timeout, so one slow upstream cannot stall the console.
 *
 * @param {string} url Endpoint.
 * @param {number} [ms] Timeout in milliseconds.
 * @returns {Promise<any>} Parsed JSON.
 */
async function getJson(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deterministic-ish jitter for simulated feeds, seeded by the clock so the
 * synthetic picture moves rather than sitting frozen.
 *
 * @param {number} i Index.
 * @param {number} span Range.
 * @returns {number} Pseudo-random value in [-span, span].
 */
function drift(i, span) {
  const t = Date.now() / 60000;
  return Math.sin(i * 12.9898 + t) * span;
}

/** Airports used as anchors for the simulated traffic picture. */
const HUBS = [
  { name: 'LHR', lat: 51.47, lon: -0.45 }, { name: 'JFK', lat: 40.64, lon: -73.78 },
  { name: 'DXB', lat: 25.25, lon: 55.36 }, { name: 'HND', lat: 35.55, lon: 139.78 },
  { name: 'LAX', lat: 33.94, lon: -118.41 }, { name: 'SIN', lat: 1.36, lon: 103.99 },
  { name: 'FRA', lat: 50.03, lon: 8.56 }, { name: 'SYD', lat: -33.94, lon: 151.18 },
];

/**
 * The source catalogue. Each entry knows how to fetch itself, how to
 * normalise the result, and what to show when it cannot.
 *
 * @type {Array<object>}
 */
export const SOURCES = [
  {
    id: 'quakes',
    label: 'Seismic',
    category: 'quake',
    ttl: 300000,
    attribution: 'USGS Earthquake Hazards Program',
    async load() {
      const data = await getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
      return (data.features || []).slice(0, 60).map((f) => ({
        id: f.id,
        title: f.properties.place || 'Unnamed epicentre',
        detail: `M${(f.properties.mag ?? 0).toFixed(1)} · depth ${Math.round(f.geometry.coordinates[2] || 0)} km`,
        at: f.properties.time,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        weight: Math.min(1, (f.properties.mag || 0) / 8),
        severity: (f.properties.mag || 0) >= 6 ? 'high' : (f.properties.mag || 0) >= 4.5 ? 'medium' : 'low',
      }));
    },
    simulate() {
      const zones = [['Off the coast of Honshu', 38.3, 142.4], ['Southern Alaska', 60.1, -152.5],
        ['Central Chile', -33.4, -71.8], ['Aegean Sea', 37.9, 26.5], ['Vanuatu', -17.6, 168.3]];
      return zones.map(([place, lat, lon], i) => ({
        id: `sim-q${i}`,
        title: place,
        detail: `M${(3.6 + Math.abs(drift(i, 2))).toFixed(1)} · depth ${Math.round(10 + Math.abs(drift(i, 60)))} km`,
        at: Date.now() - i * 1800000,
        lat: lat + drift(i, 0.4),
        lon: lon + drift(i + 3, 0.4),
        weight: 0.5,
        severity: 'low',
      }));
    },
  },
  {
    id: 'aircraft',
    label: 'Air traffic',
    category: 'aircraft',
    ttl: 30000,
    attribution: 'adsb.lol community ADS-B network',
    needsLocation: true,
    async load(ctx) {
      const lat = (ctx?.lat ?? 51.5).toFixed(3);
      const lon = (ctx?.lon ?? -0.12).toFixed(3);
      const data = await getJson(`https://api.adsb.lol/v2/point/${lat}/${lon}/150`);
      return (data.ac || []).slice(0, 80).map((a) => ({
        id: a.hex,
        title: (a.flight || a.r || a.hex || '').trim() || 'unknown',
        detail: `${a.t || 'unknown type'} · ${a.alt_baro === 'ground' ? 'on ground' : `FL${Math.round((Number(a.alt_baro) || 0) / 100)}`} · ${Math.round(Number(a.gs) || 0)} kt`,
        at: Date.now(),
        lat: a.lat,
        lon: a.lon,
        weight: Math.min(1, (Number(a.alt_baro) || 0) / 45000),
        severity: a.squawk === '7700' || a.squawk === '7600' || a.squawk === '7500' ? 'high' : 'low',
      })).filter((a) => Number.isFinite(a.lat));
    },
    simulate() {
      const out = [];
      for (let i = 0; i < 40; i += 1) {
        const from = HUBS[i % HUBS.length];
        const to = HUBS[(i * 3 + 2) % HUBS.length];
        const k = ((Date.now() / 240000 + i * 0.17) % 1);
        out.push({
          id: `sim-a${i}`,
          title: `SIM${100 + i}`,
          detail: `${from.name}–${to.name} · FL${340 + (i % 6) * 10} · ${430 + (i % 7) * 12} kt`,
          at: Date.now(),
          lat: from.lat + (to.lat - from.lat) * k,
          lon: from.lon + (to.lon - from.lon) * k,
          weight: 0.7,
          severity: 'low',
        });
      }
      return out;
    },
  },
  {
    id: 'launches',
    label: 'Launches',
    category: 'launch',
    ttl: 1800000,
    attribution: 'The Space Devs — Launch Library 2',
    async load() {
      const data = await getJson('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=8&mode=list');
      return (data.results || []).map((l) => {
        const pad = l.pad || {};
        return {
          id: l.id,
          title: l.name,
          detail: `${l.status?.abbrev || 'TBD'} · ${pad.location?.name || 'pad unknown'} · ${l.net ? new Date(l.net).toUTCString().slice(5, 22) : 'no T-0'}`,
          at: l.net ? Date.parse(l.net) : Date.now(),
          lat: Number(pad.latitude ?? pad.location?.latitude),
          lon: Number(pad.longitude ?? pad.location?.longitude),
          weight: 0.9,
          severity: l.status?.abbrev === 'Go' ? 'medium' : 'low',
        };
      });
    },
    simulate() {
      const pads = [['Falcon 9 · Starlink Group', 28.56, -80.58], ['Electron · Rideshare', -39.26, 177.86],
        ['Ariane 6 · Institutional', 5.24, -52.77], ['Long March 5 · Comms', 19.61, 110.95],
        ['Soyuz-2 · Resupply', 45.96, 63.31]];
      return pads.map(([name, lat, lon], i) => ({
        id: `sim-l${i}`,
        title: name,
        detail: `Go for launch · T-${String(Math.floor(4 + i * 7)).padStart(2, '0')}:${String(Math.floor(Math.abs(drift(i, 29)))).padStart(2, '0')}:00`,
        at: Date.now() + i * 7200000,
        lat,
        lon,
        weight: 0.9,
        severity: 'medium',
      }));
    },
  },
  {
    id: 'satellites',
    label: 'Orbital',
    category: 'satellite',
    ttl: 20000,
    attribution: 'wheretheiss.at',
    async load() {
      const iss = await getJson('https://api.wheretheiss.at/v1/satellites/25544');
      const items = [{
        id: 'iss',
        title: 'ISS (ZARYA)',
        detail: `${Math.round(iss.altitude)} km · ${Math.round(iss.velocity)} km/h · ${iss.visibility}`,
        at: (iss.timestamp || 0) * 1000,
        lat: iss.latitude,
        lon: iss.longitude,
        weight: 1,
        severity: 'low',
        category: 'station',
      }];
      // Propagate a short ground track ahead of the station so the globe shows
      // where it is going, not only where it is.
      for (let i = 1; i <= 6; i += 1) {
        items.push({
          id: `iss-t${i}`,
          title: `ISS ground track +${i * 5} min`,
          detail: 'projected',
          at: Date.now(),
          lat: iss.latitude + Math.cos((iss.longitude * Math.PI) / 180) * i * 0.9,
          lon: ((iss.longitude + i * 18.7 + 180) % 360) - 180,
          weight: 0.4,
          severity: 'low',
        });
      }
      return items;
    },
    simulate() {
      const t = Date.now() / 1000;
      const items = [];
      for (let i = 0; i < 8; i += 1) {
        const phase = (t / 5560 + i / 8) % 1;
        items.push({
          id: `sim-s${i}`,
          title: i === 0 ? 'ISS (simulated track)' : `SAT-${2200 + i}`,
          detail: `${400 + i * 30} km · 27600 km/h`,
          at: Date.now(),
          lat: Math.sin(phase * Math.PI * 2) * 51.6,
          lon: ((phase * 360 * 1.5 + i * 45 + 180) % 360) - 180,
          weight: 0.8,
          severity: 'low',
          category: i === 0 ? 'station' : 'satellite',
        });
      }
      return items;
    },
  },
  {
    id: 'space-weather',
    label: 'Space weather',
    category: 'threat',
    ttl: 900000,
    attribution: 'NOAA Space Weather Prediction Center',
    async load() {
      const rows = await getJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
      const recent = rows.slice(-8).reverse();
      return recent.map((row, i) => {
        const kp = Number(row[1]);
        return {
          id: `kp-${row[0]}`,
          title: `Planetary K-index ${kp.toFixed(1)}`,
          detail: `${row[0]} UTC · ${kp >= 7 ? 'severe storm' : kp >= 5 ? 'geomagnetic storm' : kp >= 4 ? 'unsettled' : 'quiet'}`,
          at: Date.parse(`${row[0].replace(' ', 'T')}Z`),
          // Plotted around the auroral oval rather than at a point.
          lat: 67 - i * 2,
          lon: -30 + i * 40,
          weight: Math.min(1, kp / 9),
          severity: kp >= 6 ? 'high' : kp >= 4 ? 'medium' : 'low',
        };
      });
    },
    simulate() {
      const kp = 2 + Math.abs(drift(1, 3));
      return [{
        id: 'sim-kp',
        title: `Planetary K-index ${kp.toFixed(1)}`,
        detail: 'simulated · quiet to unsettled',
        at: Date.now(),
        lat: 66,
        lon: -20,
        weight: kp / 9,
        severity: kp >= 5 ? 'medium' : 'low',
      }];
    },
  },
  {
    id: 'vulns',
    label: 'Vulnerabilities',
    category: 'threat',
    ttl: 3600000,
    attribution: 'FIRST.org EPSS',
    async load() {
      const data = await getJson('https://api.first.org/data/v1/epss?limit=12&order=!epss');
      return (data.data || []).map((row, i) => {
        const epss = Number(row.epss);
        return {
          id: row.cve,
          title: row.cve,
          detail: `${(epss * 100).toFixed(1)}% chance of exploitation in 30 days · percentile ${(Number(row.percentile) * 100).toFixed(1)}`,
          at: Date.parse(row.date) || Date.now(),
          // Vulnerabilities have no location; they are scattered across the
          // globe purely so the threat ring has something to draw.
          lat: 15 + ((i * 37) % 60) - 30,
          lon: ((i * 61) % 360) - 180,
          weight: epss,
          severity: epss > 0.6 ? 'high' : epss > 0.2 ? 'medium' : 'low',
        };
      });
    },
    simulate() {
      return [
        { id: 'CVE-SIM-0001', title: 'CVE-SIM-0001', detail: 'Simulated: unauthenticated RCE in an edge appliance', severity: 'high', weight: 0.9 },
        { id: 'CVE-SIM-0002', title: 'CVE-SIM-0002', detail: 'Simulated: authentication bypass in a VPN gateway', severity: 'high', weight: 0.8 },
        { id: 'CVE-SIM-0003', title: 'CVE-SIM-0003', detail: 'Simulated: deserialisation flaw in a logging library', severity: 'medium', weight: 0.4 },
      ].map((v, i) => ({ ...v, at: Date.now(), lat: 20 - i * 18, lon: -60 + i * 70 }));
    },
  },
];

/**
 * Polls the source catalogue and publishes normalised results.
 */
export class Feeds {
  constructor() {
    /** @type {Map<string, { status: string, items: object[], at: number, error?: string }>} */
    this.state = new Map();
    this.listeners = new Set();
    this.context = { lat: 51.5, lon: -0.12, label: 'London (default)' };
    this.timers = new Map();
    for (const source of SOURCES) {
      this.state.set(source.id, { status: 'idle', items: [], at: 0 });
    }
  }

  /**
   * Subscribe to feed updates.
   *
   * @param {(id: string, entry: object) => void} fn Listener.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Publish a state change.
   *
   * @param {string} id Source id.
   */
  #emit(id) {
    for (const fn of this.listeners) fn(id, this.state.get(id));
  }

  /**
   * Use the device's real position for location-sensitive feeds.
   *
   * @returns {Promise<{ lat: number, lon: number, label: string }>} The context in use.
   */
  async useDeviceLocation() {
    if (!navigator.geolocation) return this.context;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.context = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          };
          this.refresh('aircraft');
          resolve(this.context);
        },
        () => resolve(this.context),
        { timeout: 8000, maximumAge: 120000 },
      );
    });
  }

  /**
   * Refresh one source, falling back through cache to simulation.
   *
   * @param {string} id Source id.
   * @returns {Promise<object>} The resulting state entry.
   */
  async refresh(id) {
    const source = SOURCES.find((s) => s.id === id);
    if (!source) return null;
    const previous = this.state.get(id);
    this.state.set(id, { ...previous, status: 'loading' });
    this.#emit(id);

    try {
      const items = await source.load(this.context);
      if (!items.length) throw new Error('empty');
      const entry = { status: 'live', items, at: Date.now() };
      this.state.set(id, entry);
      try {
        localStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify({ items, at: entry.at }));
      } catch { /* storage full or blocked — the live value still stands */ }
      this.#emit(id);
      return entry;
    } catch (err) {
      const cached = this.#readCache(id);
      const entry = cached
        ? { status: 'cached', items: cached.items, at: cached.at, error: err.message }
        : { status: 'sim', items: source.simulate(), at: Date.now(), error: err.message };
      this.state.set(id, entry);
      this.#emit(id);
      return entry;
    }
  }

  /**
   * Read the last good payload for a source.
   *
   * @param {string} id Source id.
   * @returns {{ items: object[], at: number }|null} Cached payload.
   */
  #readCache(id) {
    try {
      const raw = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${id}`) || 'null');
      if (raw && Array.isArray(raw.items) && raw.items.length) return raw;
    } catch { /* fall through to simulation */ }
    return null;
  }

  /**
   * Refresh everything once.
   *
   * @returns {Promise<void>} Resolves when every source has settled.
   */
  async refreshAll() {
    await Promise.all(SOURCES.map((s) => this.refresh(s.id)));
  }

  /**
   * Start polling every source on its own cadence.
   */
  start() {
    for (const source of SOURCES) {
      this.refresh(source.id);
      const timer = setInterval(() => {
        if (!document.hidden) this.refresh(source.id);
      }, source.ttl);
      this.timers.set(source.id, timer);
    }
  }

  /** Stop all polling. */
  stop() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  /**
   * Every current item, flattened, newest first.
   *
   * @returns {object[]} Items tagged with their source.
   */
  allItems() {
    const out = [];
    for (const source of SOURCES) {
      const entry = this.state.get(source.id);
      for (const item of entry?.items || []) {
        out.push({ ...item, source: source.id, sourceLabel: source.label, category: item.category || source.category, status: entry.status });
      }
    }
    return out.sort((a, b) => (b.at || 0) - (a.at || 0));
  }

  /**
   * Markers for the globe.
   *
   * @returns {Array<{ lat: number, lon: number, category: string, weight: number }>} Markers.
   */
  markers() {
    return this.allItems()
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
      .map((item) => ({ lat: item.lat, lon: item.lon, category: item.category, weight: item.weight ?? 0.4 }));
  }

  /**
   * How many sources are genuinely live.
   *
   * @returns {{ live: number, cached: number, sim: number, total: number }} Tally.
   */
  health() {
    let live = 0;
    let cached = 0;
    let sim = 0;
    for (const entry of this.state.values()) {
      if (entry.status === 'live') live += 1;
      else if (entry.status === 'cached') cached += 1;
      else if (entry.status === 'sim') sim += 1;
    }
    return { live, cached, sim, total: SOURCES.length };
  }
}
