/**
 * Route Safety view: plan a walk/run/ride, score it segment by segment from
 * open data, and track yourself live along it with GPS.
 *
 * Services (all free, keyless, called straight from the browser):
 *   - Nominatim (OSM) geocoding
 *   - FOSSGIS OSRM foot / bike routing (routing.openstreetmap.de)
 *   - Overpass API: OSM ways (surface, lit, highway), street lamps, POIs
 *   - Open-Meteo: elevation (Copernicus GLO-90 DEM) and current weather
 *
 * @module vulture/route
 */

import { haversine, pointSegmentDistance, resample } from './geometry.js';
import { band, darkness, elevationStats, routeScore, scoreSegment, sunAltitude, surfaceInfo, weatherHazard, WEIGHTS } from './risk.js';
import { lineChart } from './charts.js';

const OSRM = { foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot', bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/bike' };
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

const colorFor = (s) => (s < 30 ? '#3ddc84' : s <= 70 ? '#f5d90a' : '#ff4d4f');
const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

async function getJson(url, init, timeoutMs = 25000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`${new URL(url).host} → HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

export async function geocode(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return { lat: +m[1], lon: +m[2], name: q.trim() };
  const res = await getJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  if (!res.length) throw new Error(`No place found for “${q}”`);
  return { lat: +res[0].lat, lon: +res[0].lon, name: res[0].display_name };
}

async function osrm(from, to, profile) {
  const url = `${OSRM[profile]}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&alternatives=true&steps=false`;
  const res = await getJson(url);
  if (res.code !== 'Ok' || !res.routes?.length) throw new Error(`No ${profile} route found`);
  return res.routes.map((r) => ({ line: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]), distance: r.distance, duration: r.duration }));
}

async function elevation(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i += 100) {
    const chunk = pts.slice(i, i + 100);
    const res = await getJson(`https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p[0].toFixed(5)).join(',')}&longitude=${chunk.map((p) => p[1].toFixed(5)).join(',')}`);
    out.push(...res.elevation);
  }
  return out;
}

async function weather(lat, lon) {
  const res = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,precipitation,wind_speed_10m,weather_code,is_day`);
  return res.current;
}

async function overpass(pts) {
  const coords = pts.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(',');
  const q = `[out:json][timeout:25];
way(around:20,${coords})[highway];
out tags geom;
node(around:40,${coords})[highway=street_lamp];
out skel;
node(around:150,${coords})[~"^(amenity|shop|leisure|tourism)$"~"."];
out body;`;
  let lastErr;
  for (const ep of OVERPASS) {
    try {
      return await getJson(ep, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 40000);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/**
 * Score a route from fetched open data.
 *
 * @param {number[][]} line [lat, lon] polyline.
 * @param {Date} when Departure time.
 * @returns {Promise<object>} Analysis.
 */
export async function analyseRoute(line, when) {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += haversine(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  const step = Math.max(80, total / 280);
  const { pts, dist } = resample(line, step);
  const warnings = [];
  const mid = pts[Math.floor(pts.length / 2)];
  const [elevR, wxR, osmR] = await Promise.allSettled([elevation(pts), weather(mid[0], mid[1]), overpass(pts.filter((_, i) => i % Math.ceil(pts.length / 250) === 0 || i === pts.length - 1))]);
  const elev = elevR.status === 'fulfilled' ? elevR.value : pts.map(() => 0);
  if (elevR.status !== 'fulfilled') warnings.push('Elevation unavailable — slope treated as flat.');
  const wx = wxR.status === 'fulfilled' ? wxR.value : {};
  if (wxR.status !== 'fulfilled') warnings.push('Weather unavailable.');
  const osm = osmR.status === 'fulfilled' ? osmR.value.elements : [];
  if (osmR.status !== 'fulfilled') warnings.push('OpenStreetMap detail (lamps, surface) unavailable — lighting scored conservatively.');
  const ways = osm.filter((e) => e.type === 'way' && e.geometry);
  const lamps = osm.filter((e) => e.type === 'node' && !e.tags);
  const pois = osm.filter((e) => e.type === 'node' && e.tags);

  const sun = sunAltitude(when, mid[0], mid[1]);
  const ctx = { dark: darkness(sun), weather: weatherHazard(wx) };
  const segs = [];
  const surfaceLen = {};
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]; const b = pts[i];
    const lengthM = dist[i] - dist[i - 1];
    if (lengthM <= 0) continue;
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let best = null; let bestD = 30;
    for (const w of ways) {
      const g = w.geometry;
      for (let k = 1; k < g.length; k++) {
        const d = pointSegmentDistance(m, [g[k - 1].lat, g[k - 1].lon], [g[k].lat, g[k].lon]);
        if (d < bestD) { bestD = d; best = w; }
      }
    }
    const tags = best?.tags ?? {};
    const nLamps = lamps.filter((n) => pointSegmentDistance([n.lat, n.lon], a, b) <= 40).length;
    const nPois = pois.filter((n) => pointSegmentDistance([n.lat, n.lon], a, b) <= 150).length;
    const grade = (elev[i] - elev[i - 1]) / lengthM;
    const { score, factors } = scoreSegment({ lengthM, lamps: nLamps, pois: nPois, tags, grade }, ctx);
    const bucket = surfaceInfo(tags).bucket;
    surfaceLen[bucket] = (surfaceLen[bucket] ?? 0) + lengthM;
    segs.push({ a, b, lengthM, startM: dist[i - 1], score, factors, tags, lamps: nLamps, pois: nPois, grade });
  }
  const totalLamps = lamps.length;
  return {
    line, pts, dist, elev, total, segs, score: routeScore(segs), sun, ctx, wx, warnings,
    elevStats: elevationStats(elev, dist),
    surface: Object.entries(surfaceLen).map(([k, v]) => [k, (v / total) * 100]).sort((x, y) => y[1] - x[1]),
    lampsPerKm: total ? (totalLamps / total) * 1000 : 0,
    poiCount: pois.length,
    worst: [...segs].sort((x, y) => y.score - x.score)[0] ?? null,
  };
}

const WX = { 0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Rime fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail' };

/**
 * Mount the Route Safety UI.
 *
 * @param {HTMLElement} root Container.
 * @param {object} hooks { onRisk(score, text), onState(analysis) }.
 */
export function mountRoute(root, hooks = {}) {
  root.innerHTML = `
  <div class="route-grid">
    <section class="card route-form">
      <h3>Plan a route</h3>
      <label>From <input id="rt-from" placeholder="Address, place or lat,lon" autocomplete="off"></label>
      <label>To <input id="rt-to" placeholder="Address, place or lat,lon — or click the map" autocomplete="off"></label>
      <div class="row">
        <label>Mode <select id="rt-profile"><option value="foot">Walk / run</option><option value="bike">Cycle</option></select></label>
        <label>Depart <input id="rt-when" type="datetime-local"></label>
      </div>
      <div class="row">
        <button class="btn" id="rt-here">◎ Use my location</button>
        <button class="btn primary" id="rt-go">Analyse route</button>
      </div>
      <p class="hint">Tip: click the map to set start, then end. Data: OpenStreetMap, OSRM, Overpass, Open-Meteo. <a id="rt-gmaps" target="_blank" rel="noopener" hidden>Open in Google Maps ↗</a></p>
      <div id="rt-msg" class="msg" role="status"></div>
    </section>
    <section class="card map-card"><div id="rt-map"></div><div class="legend"><span style="--c:#3ddc84">Safe &lt;30</span><span style="--c:#f5d90a">Caution 30–70</span><span style="--c:#ff4d4f">High risk &gt;70</span></div></section>
    <section class="card rt-score">
      <h3>Route safety prediction</h3>
      <div class="big-score"><span id="rt-score">--</span><small id="rt-band">no route</small></div>
      <div id="rt-alts" class="alts"></div>
      <div id="rt-factors" class="factors"></div>
      <div id="rt-worst" class="note"></div>
    </section>
    <section class="card rt-terrain">
      <h3>Terrain &amp; area data</h3>
      <canvas id="rt-elev" class="chart" style="height:120px"></canvas>
      <div id="rt-terrain-stats" class="kv"></div>
      <div id="rt-surface" class="surface"></div>
    </section>
    <section class="card rt-live">
      <h3>Live GPS tracking</h3>
      <div class="row"><button class="btn" id="rt-track">▶ Start tracking</button><span id="rt-gps-state" class="mono muted">GPS idle</span></div>
      <div class="kv" id="rt-live-kv"></div>
      <div id="rt-ahead" class="note"></div>
    </section>
  </div>`;
  const $ = (id) => root.querySelector(`#${id}`);
  const when = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  $('rt-when').value = when.toISOString().slice(0, 16);

  let map = null; let layer = null; let pick = 0; let from = null; let to = null; let mFrom = null; let mTo = null;
  let analyses = []; let current = null; let watchId = null; let me = null; let trail = null; let track = [];
  const msg = (t, err = false) => { $('rt-msg').textContent = t; $('rt-msg').classList.toggle('err', err); };

  function ensureMap() {
    if (map || !window.L) return;
    map = L.map($('rt-map'), { zoomControl: true }).setView([51.505, -0.09], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on('click', (e) => {
      const p = { lat: e.latlng.lat, lon: e.latlng.lng, name: `${e.latlng.lat.toFixed(5)},${e.latlng.lng.toFixed(5)}` };
      if (pick % 2 === 0) { from = p; $('rt-from').value = p.name; } else { to = p; $('rt-to').value = p.name; }
      pick++;
      drawPins();
      if (from && to && pick % 2 === 0) plan();
    });
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 15), () => {}, { timeout: 5000 });
  }

  function drawPins() {
    if (!map) return;
    mFrom?.remove(); mTo?.remove();
    if (from) mFrom = L.circleMarker([from.lat, from.lon], { radius: 8, color: '#3ddc84', fillOpacity: 1 }).addTo(map).bindTooltip('Start');
    if (to) mTo = L.circleMarker([to.lat, to.lon], { radius: 8, color: '#ff4d4f', fillOpacity: 1 }).addTo(map).bindTooltip('End');
  }

  function draw() {
    if (!map) return;
    layer.clearLayers();
    analyses.forEach((an, i) => {
      if (an === current) return;
      L.polyline(an.line, { color: '#8aa0b8', weight: 5, opacity: 0.55, dashArray: '6 8' }).addTo(layer)
        .on('click', () => select(i)).bindTooltip(`Alternative ${i + 1}: risk ${an.score}`);
    });
    if (current) {
      for (const s of current.segs) {
        L.polyline([s.a, s.b], { color: colorFor(s.score), weight: 7, opacity: 0.95 }).addTo(layer)
          .bindTooltip(`Risk ${s.score} · ${s.tags.highway ?? 'way'}${s.tags.surface ? ` · ${s.tags.surface}` : ''} · ${s.lamps} lamps · grade ${(s.grade * 100).toFixed(1)}%`);
      }
      map.fitBounds(L.latLngBounds(current.line), { padding: [30, 30] });
    }
    drawPins();
  }

  function select(i) {
    current = analyses[i];
    render();
    draw();
  }

  function render() {
    const an = current;
    if (!an) return;
    $('rt-score').textContent = an.score;
    $('rt-score').style.color = colorFor(an.score);
    $('rt-band').textContent = `${band(an.score)} · ${fmtKm(an.total)}`;
    $('rt-alts').innerHTML = analyses.map((a, i) => `<button class="chip ${a === an ? 'on' : ''}" data-i="${i}" style="--c:${colorFor(a.score)}">Route ${i + 1}: ${a.score} · ${fmtKm(a.total)}</button>`).join('');
    $('rt-alts').querySelectorAll('button').forEach((b) => b.onclick = () => select(+b.dataset.i));
    const len = an.total || 1;
    const mean = (k) => an.segs.reduce((s, x) => s + x.factors[k] * x.lengthM, 0) / len;
    $('rt-factors').innerHTML = Object.keys(WEIGHTS).map((k) => {
      const v = Math.round(mean(k) * 100);
      return `<div class="factor"><span>${k}</span><i style="--w:${v}%;--c:${colorFor(v)}"></i><b>${v}</b></div>`;
    }).join('');
    const sunTxt = an.sun > 6 ? 'daylight' : an.sun > -6 ? 'twilight' : 'dark';
    const w = an.worst;
    $('rt-worst').innerHTML = `Sun ${an.sun.toFixed(1)}° (${sunTxt}) · ${an.wx.temperature_2m ?? '–'} °C ${WX[an.wx.weather_code] ?? ''} · wind ${an.wx.wind_speed_10m ?? '–'} km/h<br>${w ? `Worst stretch: ${fmtKm(w.startM)} in — risk ${w.score} (${w.tags.highway ?? 'unknown way'}${w.tags.lit ? `, lit=${w.tags.lit}` : ''}, ${w.lamps} lamps, ${w.pois} POIs nearby)` : ''}${an.warnings.length ? `<br><span class="warn">${an.warnings.join(' ')}</span>` : ''}`;
    const e = an.elevStats;
    lineChart($('rt-elev'), [{ data: an.elev, color: '#f5d90a', fill: true }], { xLabels: ['0', fmtKm(an.total / 2), fmtKm(an.total)], fmt: (v) => `${Math.round(v)}m` });
    $('rt-terrain-stats').innerHTML = `
      <div><span>Elevation</span><b>${Math.round(e.min)}–${Math.round(e.max)} m</b></div>
      <div><span>Ascent / descent</span><b>+${Math.round(e.ascent)} / −${Math.round(e.descent)} m</b></div>
      <div><span>Slope avg / max</span><b>${e.avgGrade.toFixed(1)}% / ${e.maxGrade.toFixed(1)}%</b></div>
      <div><span>Street lamps</span><b>${an.lampsPerKm.toFixed(1)} / km</b></div>
      <div><span>Est. time</span><b>${an.duration ? `${Math.round(an.duration / 60)} min` : '–'}</b></div>
      <div><span>Weather hazard</span><b>${Math.round(an.ctx.weather * 100)}%</b></div>`;
    $('rt-surface').innerHTML = `<h4>Surface type</h4>${an.surface.map(([k, v]) => `<div class="factor"><span>${k}</span><i style="--w:${v}%;--c:#39e0c8"></i><b>${v.toFixed(0)}%</b></div>`).join('')}`;
    const gm = $('rt-gmaps');
    gm.hidden = false;
    gm.href = `https://www.google.com/maps/dir/?api=1&origin=${an.line[0].join(',')}&destination=${an.line[an.line.length - 1].join(',')}&travelmode=${$('rt-profile').value === 'bike' ? 'bicycling' : 'walking'}`;
    hooks.onState?.(an);
  }

  async function plan() {
    msg('Routing…');
    try {
      if (!from) from = await geocode($('rt-from').value);
      if (!to) to = await geocode($('rt-to').value);
      drawPins();
      const profile = $('rt-profile').value;
      const routes = await osrm(from, to, profile);
      msg(`Scoring ${routes.length} route${routes.length > 1 ? 's' : ''} against lighting, surface, slope, traffic, isolation and weather…`);
      const t = new Date($('rt-when').value || Date.now());
      analyses = [];
      for (const r of routes.slice(0, 3)) {
        const an = await analyseRoute(r.line, t);
        an.duration = r.duration;
        analyses.push(an);
      }
      const safest = analyses.reduce((m, a) => (a.score < m.score ? a : m), analyses[0]);
      current = safest;
      msg(analyses.length > 1 ? `Selected the safest of ${analyses.length} routes. Click a grey route to compare.` : 'Route analysed.');
      render();
      draw();
      if (current.score >= 70) hooks.onRisk?.(current.score, `Planned route risk ${current.score}/100`);
    } catch (e) {
      msg(e.message || String(e), true);
    }
  }

  $('rt-go').onclick = () => {
    from = null; to = null;
    if (!$('rt-from').value || !$('rt-to').value) { msg('Enter a start and an end, or click two points on the map.', true); return; }
    plan();
  };
  $('rt-here').onclick = () => {
    if (!navigator.geolocation) { msg('Geolocation not available.', true); return; }
    msg('Locating…');
    navigator.geolocation.getCurrentPosition((pos) => {
      from = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'My location' };
      $('rt-from').value = `${from.lat.toFixed(5)},${from.lon.toFixed(5)}`;
      pick = 1; drawPins(); map?.setView([from.lat, from.lon], 15); msg('Start set to your location. Now set the end.');
    }, (e) => msg(`Location failed: ${e.message}`, true), { enableHighAccuracy: true, timeout: 10000 });
  };

  $('rt-track').onclick = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      $('rt-track').textContent = '▶ Start tracking'; $('rt-gps-state').textContent = 'GPS idle';
      return;
    }
    if (!navigator.geolocation) { msg('Geolocation not available.', true); return; }
    track = []; trail?.remove(); trail = null;
    $('rt-track').textContent = '■ Stop tracking';
    watchId = navigator.geolocation.watchPosition(onPos, (e) => { $('rt-gps-state').textContent = `GPS error: ${e.message}`; }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  };

  function onPos(pos) {
    const c = pos.coords; const t = pos.timestamp;
    const p = [c.latitude, c.longitude];
    const prev = track[track.length - 1];
    track.push({ p, t, alt: c.altitude });
    let speed = c.speed;
    if ((speed === null || Number.isNaN(speed)) && prev) speed = haversine(prev.p[0], prev.p[1], p[0], p[1]) / Math.max(0.5, (t - prev.t) / 1000);
    let distM = 0;
    for (let i = 1; i < track.length; i++) distM += haversine(track[i - 1].p[0], track[i - 1].p[1], track[i].p[0], track[i].p[1]);
    $('rt-gps-state').textContent = `GPS locked ±${Math.round(c.accuracy)} m`;
    if (map) {
      me = me ?? L.circleMarker(p, { radius: 9, color: '#39e0c8', fillColor: '#39e0c8', fillOpacity: 0.9 }).addTo(map);
      me.setLatLng(p);
      trail = trail ?? L.polyline([], { color: '#39e0c8', weight: 3 }).addTo(map);
      trail.addLatLng(p);
      if (track.length === 1) map.setView(p, 16);
    }
    let aheadTxt = 'Plan a route to get risk-ahead predictions.';
    let aheadMax = 0;
    if (current) {
      let bestI = -1; let bestD = Infinity;
      current.segs.forEach((s, i) => { const d = pointSegmentDistance(p, s.a, s.b); if (d < bestD) { bestD = d; bestI = i; } });
      if (bestD > 60) aheadTxt = `Off route by ${Math.round(bestD)} m.`;
      else {
        const here = current.segs[bestI];
        const ahead = current.segs.filter((s) => s.startM > here.startM && s.startM - here.startM <= 200);
        const worst = ahead.reduce((m, s) => (s.score > m.score ? s : m), here);
        aheadMax = worst.score;
        aheadTxt = `<b style="color:${colorFor(worst.score)}">Predicted risk ahead: ${band(worst.score)} (${worst.score})</b> within ${Math.round(worst.startM - here.startM)} m${worst.factors.lighting > 0.4 ? ' — poor lighting' : ''}${worst.factors.surface > 0.4 ? ' — loose/uneven surface' : ''}${worst.factors.slope > 0.5 ? ' — steep grade' : ''}${worst.factors.traffic > 0.5 ? ' — busy road' : ''}.`;
      }
    }
    $('rt-ahead').innerHTML = aheadTxt;
    $('rt-live-kv').innerHTML = `
      <div><span>Speed</span><b>${Number.isFinite(speed) ? `${speed.toFixed(2)} m/s · ${(speed * 3.6).toFixed(1)} km/h` : '–'}</b></div>
      <div><span>Distance</span><b>${fmtKm(distM)}</b></div>
      <div><span>Altitude</span><b>${Number.isFinite(c.altitude) && c.altitude !== null ? `${Math.round(c.altitude)} m` : '–'}</b></div>
      <div><span>Pace</span><b>${speed > 0.3 ? `${Math.floor(1000 / speed / 60)}:${String(Math.round((1000 / speed) % 60)).padStart(2, '0')} /km` : '–'}</b></div>`;
    hooks.onGps?.({ speed, distM, accuracy: c.accuracy, aheadMax });
    if (aheadMax >= 0) hooks.onRisk?.(aheadMax, 'Risk ahead on your route', true);
  }

  return {
    show() { ensureMap(); setTimeout(() => map?.invalidateSize(), 50); },
    plan,
    get analysis() { return current; },
  };
}
