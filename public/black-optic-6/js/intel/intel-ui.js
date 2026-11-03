/**
 * The Intel deck: open-source intelligence about the land around the ranch.
 *
 * - Live aircraft (ADS-B) on a map centred on the ranch, with range, look
 *   angle and the two alerts that matter on a ranch.
 * - The power grid from OpenStreetMap: lines by voltage, substations, plants.
 * - Property intelligence for any US point: Census housing and income for
 *   the tract and county, the FEMA flood zone, and USGS elevation.
 *
 * Public traffic cameras live on the World deck; building-level analysis
 * (sun, evacuation, energy) on the Site deck. This deck links rather than
 * repeats them.
 *
 * Everything here is Linked: someone else's published measurement, named,
 * with the time it was fetched.
 *
 * @module black-optic-6/intel/intel-ui
 */

import { adsbLolUrl, airplanesLiveUrl, openskyUrl, parseOpenSky, parseReadsb, relate } from './adsb.js';
import { CLASS_COLOURS, kmByClass, nearestLine, OVERPASS, parsePower, plantsBySource, powerQuery } from './grid.js';
import { acsUrl, ACS_YEAR, elevationUrl, femaUrl, fccUrl, housingRatios, monthlyPayment, parseAcs, parseElevation, parseFcc, parseFema } from './property.js';
import { ago, getJson } from './fetch.js';
import { compass, toLocal } from './geo.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const usd = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString('en-US')}` : '—');
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } },
};
function row(title, body, tone = 'primary', time = '', why = '') {
  const li = document.createElement('li');
  li.className = 'row'; li.dataset.tone = tone;
  li.innerHTML = `<div class="row-head"><b></b><time></time></div><p></p>${why ? '<div class="why"></div>' : ''}`;
  li.querySelector('b').textContent = title;
  li.querySelector('time').textContent = time;
  li.querySelector('p').textContent = body;
  if (why) li.querySelector('.why').textContent = why;
  return li;
}

/**
 * @param {object} bridge state, readout, setBadge, logEvent, ranchPlace
 */
export function mountIntelDeck(bridge) {
  const { readout, setBadge, logEvent } = bridge;
  const deck = $('deck-intel');
  const place = bridge.ranchPlace();
  const S = {
    origin: store.get('bo6.intel.origin', { lat: place.lat, lon: place.lon }),
    radiusKm: store.get('bo6.intel.radius', 25), aircraft: [], power: null, selected: null, live: false, timer: null, elevM: null, warned: new Set(),
  };

  deck.innerHTML = `
    <div class="grid wide">
      <div class="panel">
        <div class="panel-head"><h2>Intel map · around the ranch</h2><span class="spacer"></span><span class="prov" id="int-prov" data-tone="muted">Nothing loaded</span></div>
        <p class="note">Open-source intelligence on one map: aircraft broadcasting their positions, the power grid as mapped in OpenStreetMap, and public records for the ground under the pin. Every layer is someone else's published data, named and timed below.</p>
        <div class="controls" style="margin-top:11px">
          <label class="field" style="flex:1 1 220px"><span>Find a place</span><input id="int-q" type="text" placeholder="address, town or landmark" /></label>
          <button class="ghost" id="int-find" type="button" style="align-self:flex-end">Find</button>
          <button class="ghost" id="int-ranch" type="button" style="align-self:flex-end">The ranch</button>
        </div>
        <div class="controls" style="margin-top:9px">
          <label class="field" style="flex:0 1 120px"><span>Latitude</span><input id="int-lat" type="number" step="0.0001" /></label>
          <label class="field" style="flex:0 1 120px"><span>Longitude</span><input id="int-lon" type="number" step="0.0001" /></label>
          <div class="tally seg" id="int-radius"><button type="button" data-v="10">10 km</button><button type="button" data-v="25">25 km</button><button type="button" data-v="50">50 km</button><button type="button" data-v="100">100 km</button></div>
        </div>
        <div class="twin-view" id="int-view" style="margin-top:11px"><canvas id="int-map"></canvas></div>
        <div class="controls" style="margin-top:9px">
          <button class="act" id="int-live" type="button">Track aircraft live</button>
          <button class="ghost" id="int-grid" type="button">Load the power grid</button>
          <button class="ghost" id="int-prop" type="button">Property records here</button>
        </div>
        <p class="note" id="int-note" style="margin-top:9px">Tap an aircraft, a substation or a plant for its details. Tap empty ground to move the pin there.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Selected</h2><span class="spacer"></span><span class="prov" id="int-sel-prov" data-tone="muted">None</span></div>
        <div id="int-sel"><p class="empty">Tap something on the map.</p></div>
      </div>
    </div>
    <div class="grid">
      <div class="panel">
        <div class="panel-head"><h2>Aircraft · ADS-B</h2><span class="spacer"></span><span class="prov" id="int-air-prov" data-tone="muted">Off</span></div>
        <div class="readouts" id="int-air-sum"></div>
        <ul class="rows" id="int-air" style="margin-top:11px;max-height:440px;overflow:auto"><li class="empty">Press "Track aircraft live".</li></ul>
        <p class="note" style="margin-top:9px">Positions are the aircraft's own GPS broadcasts, relayed by volunteer receivers (OpenSky Network, then adsb.lol, then airplanes.live). Aircraft that do not broadcast — many military, some private, any with the transponder off — are not here, so an empty map is not an empty sky. Refreshes every 20 s while this deck is open.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Power grid · OpenStreetMap</h2><span class="spacer"></span><span class="prov" id="int-grid-prov" data-tone="muted">Not loaded</span></div>
        <div class="readouts" id="int-grid-sum"></div>
        <ul class="rows" id="int-grid-list" style="margin-top:11px;max-height:440px;overflow:auto"><li class="empty">Press "Load the power grid".</li></ul>
        <p class="note" style="margin-top:9px">Lines coloured by voltage: <b style="color:${CLASS_COLOURS['extra-high voltage']}">500 kV+</b>, <b style="color:${CLASS_COLOURS.transmission}">230–345 kV</b>, <b style="color:${CLASS_COLOURS['sub-transmission']}">69–161 kV</b>, <b style="color:${CLASS_COLOURS.distribution}">distribution</b>, <b style="color:${CLASS_COLOURS.unknown}">voltage not mapped</b>. US transmission is mapped almost completely; local distribution only in places. © OpenStreetMap contributors.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Property intelligence</h2><span class="spacer"></span><span class="prov" id="int-prop-prov" data-tone="muted">Not loaded</span></div>
        <div class="readouts" id="int-prop-sum"></div>
        <div class="controls" style="margin-top:9px">
          <label class="field" style="flex:0 1 140px"><span>Your loan rate (%)</span><input id="int-rate" type="number" min="0" max="20" step="0.125" /></label>
          <label class="field" style="flex:0 1 120px"><span>Down payment (%)</span><input id="int-down" type="number" min="0" max="100" step="1" /></label>
        </div>
        <ul class="rows" id="int-prop-list" style="margin-top:11px"><li class="empty">Press "Property records here" (US only).</li></ul>
        <p class="note" style="margin-top:9px">Neighbourhood figures are the Census Bureau's American Community Survey ${ACS_YEAR} 5-year estimates for the census tract — survey estimates with margins of error, for a few thousand people, not for one house. No open data gives a particular home's value, its parcel lines or its owner, so this panel does not pretend to.</p>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Data and sources</h2><span class="spacer"></span><span class="prov" data-tone="primary">Open data</span></div>
      <ul class="rows" id="int-sources"></ul>
    </div>`;

  $('int-rate').value = String(store.get('bo6.intel.rate', 6.5));
  $('int-down').value = String(store.get('bo6.intel.down', 20));

  /* ------------------------------------------------------------ sources */

  const sources = {
    opensky: { name: 'OpenSky Network', url: 'https://opensky-network.org/', what: 'ADS-B state vectors. Anonymous use has a daily quota.' },
    adsblol: { name: 'adsb.lol', url: 'https://api.adsb.lol/', what: 'Open, unfiltered ADS-B feed (ODbL). Used when OpenSky refuses.' },
    airplaneslive: { name: 'airplanes.live', url: 'https://airplanes.live/', what: 'Open ADS-B feed, the last fallback. One request a second at most.' },
    overpass: { name: 'OpenStreetMap · Overpass API', url: OVERPASS, what: 'Power lines, substations and plants. ODbL 1.0.' },
    nominatim: { name: 'Nominatim', url: 'https://nominatim.openstreetmap.org/', what: 'Place search.' },
    fcc: { name: 'FCC Area API', url: 'https://geo.fcc.gov/api/census/', what: 'The census block, tract and county for a point.' },
    census: { name: `US Census Bureau · ACS ${ACS_YEAR} 5-year`, url: 'https://api.census.gov/', what: 'Median home value, rent, income, year built, tenure, vacancy, population.' },
    fema: { name: 'FEMA National Flood Hazard Layer', url: 'https://hazards.fema.gov/', what: 'The regulatory flood zone at the point.' },
    usgs: { name: 'USGS 3DEP · Elevation Point Query', url: 'https://epqs.nationalmap.gov/', what: 'Ground elevation at the point.' },
    cams: { name: 'Public traffic cameras', url: '#deck-world', what: 'Agency-published road cameras (Caltrans and others) are on the World deck — public roads only, by design.' },
  };
  const status = {};
  function renderSources() {
    $('int-sources').replaceChildren(...Object.entries(sources).map(([k, s]) => {
      const st = status[k] ?? { tone: k === 'cams' ? 'primary' : 'muted', text: k === 'cams' ? 'World deck' : 'waiting' };
      return row(s.name, `${s.what} ${st.detail ?? ''}`.trim(), st.tone, st.text, s.url);
    }));
  }
  const mark = (k, tone, text, detail = '') => { status[k] = { tone, text, detail }; renderSources(); };
  renderSources();

  /* ----------------------------------------------------------- location */

  function setOrigin(lat, lon, why = '') {
    S.origin = { lat, lon }; store.set('bo6.intel.origin', S.origin);
    $('int-lat').value = lat.toFixed(5); $('int-lon').value = lon.toFixed(5);
    S.power = null; S.prop = null; S.elevM = null;
    $('int-grid-list').replaceChildren(row('Moved', 'Load the power grid again for this place.', 'muted'));
    $('int-prop-list').replaceChildren(row('Moved', 'Fetch property records again for this place.', 'muted'));
    $('int-grid-sum').replaceChildren(); $('int-prop-sum').replaceChildren();
    if (why) $('int-note').textContent = why;
    if (S.live) pollAircraft();
    draw();
  }
  function setRadius(km) {
    S.radiusKm = km; store.set('bo6.intel.radius', km);
    for (const b of $('int-radius').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === km));
    if (S.live) pollAircraft();
    draw();
  }
  $('int-lat').value = S.origin.lat.toFixed(5); $('int-lon').value = S.origin.lon.toFixed(5);
  for (const id of ['int-lat', 'int-lon']) $(id).addEventListener('change', () => { const lat = Number($('int-lat').value); const lon = Number($('int-lon').value); if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) setOrigin(lat, lon); });
  $('int-radius').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setRadius(Number(b.dataset.v)); });
  $('int-ranch').addEventListener('click', () => { const p = bridge.ranchPlace(); setOrigin(p.lat, p.lon, 'Centred on the ranch.'); });
  async function find() {
    const q = $('int-q').value.trim(); if (!q) return;
    try {
      const { json } = await getJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, 7 * 86400000);
      if (!json[0]) { $('int-note').textContent = `Nothing found for "${q}".`; return; }
      mark('nominatim', 'confirm', 'linked');
      setOrigin(Number(json[0].lat), Number(json[0].lon), json[0].display_name);
    } catch (error) { mark('nominatim', 'alert', 'blocked', error.message); $('int-note').textContent = error.message; }
  }
  $('int-find').addEventListener('click', find);
  $('int-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
  setRadius(S.radiusKm);

  /* ---------------------------------------------------------------- map */

  let land = null;
  fetch(new URL('../../vendor/world/land-110m.json', import.meta.url)).then((r) => r.json()).then((j) => { land = j; draw(); }).catch(() => {});
  const hits = [];

  function draw() {
    const c = $('int-map'); const view = $('int-view');
    const w = view.clientWidth; const h = view.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#03080f'; g.fillRect(0, 0, w, h);
    const scale = (Math.min(w, h) / 2 - 12) / S.radiusKm; // px per km
    const P = (p) => { const [x, y] = toLocal(S.origin, p); return [w / 2 + x * scale, h / 2 - y * scale]; };
    hits.length = 0;
    // Coastline (Natural Earth 1:110m — coarse at this scale, drawn faintly for orientation).
    if (land) {
      g.strokeStyle = 'rgba(95,191,154,0.35)'; g.lineWidth = 1;
      for (const ring of land.rings) {
        g.beginPath(); let on = false;
        for (const [lon, lat] of ring) {
          if (Math.abs(lat - S.origin.lat) > 5 || Math.abs(lon - S.origin.lon) > 6) { on = false; continue; }
          const [x, y] = P({ lat, lon }); if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; }
        }
        g.stroke();
      }
    }
    // Range rings and north.
    g.strokeStyle = 'rgba(79,232,255,0.16)'; g.fillStyle = 'rgba(79,232,255,0.5)'; g.font = '10px ui-monospace, monospace';
    for (let k = 1; k <= 4; k += 1) {
      const r = (S.radiusKm * k) / 4;
      g.beginPath(); g.arc(w / 2, h / 2, r * scale, 0, Math.PI * 2); g.stroke();
      g.fillText(`${fmt(r, Number.isInteger(r) ? 0 : 1)} km`, w / 2 + 4, h / 2 - r * scale + 11);
    }
    g.fillText('N', w / 2 - 3, 12);
    // Grid.
    if (S.power) {
      const order = ['unknown', 'distribution', 'sub-transmission', 'transmission', 'extra-high voltage'];
      for (const cls of order) {
        g.strokeStyle = CLASS_COLOURS[cls]; g.lineWidth = cls === 'distribution' || cls === 'unknown' ? 1 : cls === 'sub-transmission' ? 1.6 : 2.4;
        g.globalAlpha = cls === 'unknown' ? 0.5 : 0.9;
        for (const l of S.power.lines.filter((x) => x.cls === cls)) {
          g.beginPath(); l.pts.forEach((p, k) => { const [x, y] = P(p); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
        }
      }
      g.globalAlpha = 1;
      for (const s of S.power.substations) {
        const [x, y] = P(s); g.fillStyle = '#ffd166'; g.fillRect(x - 3.5, y - 3.5, 7, 7);
        hits.push({ x, y, r: 9, kind: 'substation', item: s });
      }
      for (const p of S.power.plants) {
        const [x, y] = P(p); const r = 4 + Math.min(14, Math.sqrt(p.mw ?? 1) * 1.2);
        g.strokeStyle = p.source === 'solar' ? '#ffd166' : p.source === 'wind' ? '#9fe3e8' : /gas|oil|coal/.test(p.source) ? '#ff9f43' : '#c8d6e5';
        g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
        hits.push({ x, y, r: r + 4, kind: 'plant', item: p });
      }
    }
    // Aircraft.
    for (const a of S.aircraft) {
      const [x, y] = P(a);
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const sel = S.selected?.kind === 'aircraft' && S.selected.item.icao === a.icao;
      const colour = a.alerts.length ? '#ff3b4e' : a.onGround ? '#7f8c9a' : a.military ? '#ff9f43' : '#e8f6ff';
      g.save(); g.translate(x, y); g.rotate(((a.trackDeg ?? 0) * Math.PI) / 180);
      g.fillStyle = colour; g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath(); g.fill();
      if (sel) { g.strokeStyle = '#ffd166'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      g.fillStyle = colour; g.font = '10px ui-monospace, monospace';
      g.fillText(`${a.callsign || a.icao}${a.altM != null && !a.onGround ? ` ${fmt(a.altM / 0.3048 / 100, 0).padStart(3, '0')}` : ''}`, x + 8, y + 3);
      hits.push({ x, y, r: 12, kind: 'aircraft', item: a });
    }
    // The pin.
    g.strokeStyle = '#ff3b4e'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w / 2 - 8, h / 2); g.lineTo(w / 2 + 8, h / 2); g.moveTo(w / 2, h / 2 - 8); g.lineTo(w / 2, h / 2 + 8); g.stroke();
  }
  new ResizeObserver(draw).observe($('int-view'));

  $('int-map').addEventListener('click', (e) => {
    const r = $('int-map').getBoundingClientRect(); const x = e.clientX - r.left; const y = e.clientY - r.top;
    const hit = hits.filter((h) => Math.hypot(h.x - x, h.y - y) <= h.r).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (hit) { S.selected = hit; renderSelected(); draw(); return; }
    const scale = (Math.min(r.width, r.height) / 2 - 12) / S.radiusKm;
    const dx = (x - r.width / 2) / scale; const dy = -(y - r.height / 2) / scale;
    const lat = S.origin.lat + dy / 111.195; const lon = S.origin.lon + dx / (111.195 * Math.cos((S.origin.lat * Math.PI) / 180));
    setOrigin(lat, lon, `Pin moved ${fmt(Math.hypot(dx, dy), 1)} km.`);
  });

  function renderSelected() {
    const s = S.selected; const box = $('int-sel');
    if (!s) return;
    const items = [];
    if (s.kind === 'aircraft') {
      const a = S.aircraft.find((x) => x.icao === s.item.icao) ?? s.item;
      items.push(
        readout('Aircraft', a.callsign || a.icao.toUpperCase(), { note: [a.reg, a.type, a.desc, a.country].filter(Boolean).join(' · ') || `ICAO ${a.icao}` }),
        readout('Altitude', a.onGround ? 'on the ground' : a.altM != null ? `${fmt(a.altM, 0)} m` : '—', { note: a.altM != null ? `${fmt(a.altM / 0.3048, 0)} ft${a.vrateMs ? ` · ${a.vrateMs > 0 ? 'climbing' : 'descending'} ${fmt(Math.abs(a.vrateMs) / 0.00508, 0)} ft/min` : ''}` : '' }),
        readout('Speed', a.speedMs != null ? `${fmt(a.speedMs * 3.6, 0)} km/h` : '—', { note: a.speedMs != null ? `${fmt(a.speedMs / (1852 / 3600), 0)} kt · heading ${fmt(a.trackDeg, 0)}°` : '' }),
        readout('From the pin', `${fmt(a.km, 1)} km ${compass(a.bearing)}`, { note: a.elevDeg != null ? `${fmt(a.elevDeg, 1)}° above the horizon · slant ${fmt(a.slantKm, 1)} km` : '' }),
      );
      if (a.squawk) items.push(readout('Squawk', a.squawk, { tone: a.alerts.length ? 'alert' : 'muted', note: a.alerts.join('; ') || 'routine' }));
      setBadge('int-sel-prov', 'LINK', a.source);
    } else if (s.kind === 'substation') {
      const x = s.item;
      items.push(readout('Substation', x.name || `OSM ${x.id}`, { note: x.operator }), readout('Voltages', x.voltages.length ? x.voltages.map((v) => `${fmt(v, v < 1 ? 2 : 0)} kV`).join(' / ') : 'not mapped'));
      setBadge('int-sel-prov', 'LINK', 'OpenStreetMap');
    } else {
      const x = s.item;
      items.push(readout('Power plant', x.name || `OSM ${x.id}`, { note: x.operator }), readout('Source', x.source, { note: x.method }), readout('Rated output', x.mw != null ? `${fmt(x.mw, x.mw < 10 ? 1 : 0)} MW` : 'not mapped'));
      setBadge('int-sel-prov', 'LINK', 'OpenStreetMap');
    }
    box.replaceChildren(Object.assign(document.createElement('div'), { className: 'readouts' }));
    box.firstChild.append(...items);
  }

  /* ----------------------------------------------------------- aircraft */

  async function fetchAircraft() {
    const o = S.origin; const km = S.radiusKm;
    const tries = [
      ['opensky', openskyUrl(o, km), (j) => parseOpenSky(j)],
      ['adsblol', adsbLolUrl(o, km), (j) => parseReadsb(j, 'adsb.lol')],
      ['airplaneslive', airplanesLiveUrl(o, km), (j) => parseReadsb(j, 'airplanes.live')],
    ];
    const errors = [];
    for (const [k, url, parse] of tries) {
      try {
        const { json, at } = await getJson(url, 15000, { timeoutMs: 15000 });
        mark(k, 'confirm', 'linked', `fetched ${ago(at)}.`);
        return { list: parse(json), at, source: sources[k].name };
      } catch (error) { mark(k, 'alert', 'refused', error.message); errors.push(error.message); }
    }
    throw new Error(errors.join('; '));
  }
  async function pollAircraft() {
    if (S.polling) return;
    S.polling = true;
    try {
      const obs = { ...S.origin, elevM: S.elevM ?? 0 };
      const { list, at, source } = await fetchAircraft();
      S.aircraft = list.map((a) => relate(a, obs)).filter((a) => a.km <= S.radiusKm * 1.05).sort((a, b) => a.km - b.km);
      setBadge('int-air-prov', 'LINK', `${source} · ${new Date(at).toLocaleTimeString()}`);
      setBadge('int-prov', 'LINK', 'Live');
      const air = S.aircraft.filter((a) => !a.onGround);
      const alerts = S.aircraft.filter((a) => a.alerts.length);
      const nearest = air[0];
      $('int-air-sum').replaceChildren(
        readout('In range', String(S.aircraft.length), { note: `${air.length} airborne within ${S.radiusKm} km` }),
        readout('Nearest airborne', nearest ? `${fmt(nearest.km, 1)} km` : '—', { note: nearest ? `${nearest.callsign || nearest.icao} · ${nearest.altM != null ? `${fmt(nearest.altM, 0)} m` : 'altitude not sent'}` : '' }),
        readout('Alerts', String(alerts.length), { tone: alerts.length ? 'alert' : 'confirm', note: 'emergency squawks, or low and close' }),
        readout('Ground height', S.elevM != null ? `${fmt(S.elevM, 0)} m` : 'sea level assumed', { note: S.elevM != null ? 'USGS, used for height above you' : 'fetch property records to use the real ground height' }),
      );
      $('int-air').replaceChildren(...(S.aircraft.length ? S.aircraft.slice(0, 60).map((a) => {
        const li = row(`${a.callsign || a.icao.toUpperCase()}${a.type ? ` · ${a.type}` : ''}`,
          `${fmt(a.km, 1)} km ${compass(a.bearing)}, ${a.onGround ? 'on the ground' : a.altM != null ? `${fmt(a.altM, 0)} m (${fmt(a.altM / 0.3048, 0)} ft)` : 'altitude not sent'}${a.speedMs != null ? `, ${fmt(a.speedMs / (1852 / 3600), 0)} kt` : ''}${a.alerts.length ? ` — ${a.alerts.join('; ')}` : ''}.`,
          a.alerts.length ? 'alert' : a.onGround ? 'muted' : 'primary', a.elevDeg != null && !a.onGround ? `${fmt(a.elevDeg, 0)}° up` : '');
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => { S.selected = { kind: 'aircraft', item: a }; renderSelected(); draw(); });
        return li;
      }) : [row('No broadcasting aircraft in range', 'Nothing is reporting a position here right now. Aircraft that do not broadcast are never shown.', 'muted')]));
      for (const a of alerts) {
        const key = `${a.icao}:${a.alerts.join()}`;
        if (S.warned.has(key)) continue;
        S.warned.add(key);
        logEvent(`Aircraft: ${a.callsign || a.icao}`, `${a.alerts.join('; ')}. ${fmt(a.km, 1)} km ${compass(a.bearing)}. From ${a.source}; not observed by this console.`, 'alert');
      }
      if (S.selected?.kind === 'aircraft') renderSelected();
      draw();
    } catch (error) {
      setBadge('int-air-prov', 'BLOCKED', 'No feed');
      $('int-air').replaceChildren(row('No ADS-B feed reachable', `${error}.`, 'caution'));
    } finally { S.polling = false; }
  }
  $('int-live').addEventListener('click', () => {
    S.live = !S.live;
    $('int-live').textContent = S.live ? 'Stop tracking' : 'Track aircraft live';
    clearInterval(S.timer);
    if (S.live) { pollAircraft(); S.timer = setInterval(() => { if (deck.dataset.open === 'true') pollAircraft(); }, 20000); }
    else { setBadge('int-air-prov', 'BLOCKED', 'Off'); }
  });

  /* --------------------------------------------------------------- grid */

  async function loadGrid() {
    const r = Math.min(S.radiusKm, 50) * 1000;
    setBadge('int-grid-prov', 'LINK', 'Loading');
    try {
      const url = `${OVERPASS}?data=${encodeURIComponent(powerQuery(S.origin.lat, S.origin.lon, r))}`;
      const { json, at } = await getJson(url, 7 * 86400000, { timeoutMs: 90000 });
      S.power = parsePower(json);
      mark('overpass', 'confirm', 'linked', `fetched ${ago(at)}.`);
      setBadge('int-grid-prov', 'LINK', `OSM · ${ago(at)}`);
      const P = S.power;
      const byKm = kmByClass(P.lines);
      const nearAny = nearestLine(P.lines, S.origin);
      const nearTx = nearestLine(P.lines, S.origin, 69);
      const nearSub = P.substations.map((s) => ({ s, km: Math.hypot(...toLocal(S.origin, s)) })).sort((a, b) => a.km - b.km)[0];
      $('int-grid-sum').replaceChildren(
        readout('Mapped lines', `${fmt(P.lines.reduce((s, l) => s + l.km, 0), 0)} km`, { note: Object.entries(byKm).map(([k, v]) => `${k} ${fmt(v, 0)} km`).join(' · ') || 'none' }),
        readout('Nearest line', nearAny ? `${fmt(nearAny.km * 1000, 0)} m` : '—', { note: nearAny ? `${nearAny.line.maxKv ? `${fmt(nearAny.line.maxKv, nearAny.line.maxKv < 1 ? 2 : 0)} kV` : 'voltage not mapped'}${nearAny.line.operator ? ` · ${nearAny.line.operator}` : ''}` : '' }),
        readout('Nearest 69 kV+', nearTx ? `${fmt(nearTx.km, 2)} km` : 'none mapped', { note: nearTx ? `${fmt(nearTx.line.maxKv, 0)} kV${nearTx.line.name ? ` · ${nearTx.line.name}` : ''}` : `within ${r / 1000} km` }),
        readout('Nearest substation', nearSub ? `${fmt(nearSub.km, 2)} km` : 'none mapped', { note: nearSub ? (nearSub.s.name || `OSM ${nearSub.s.id}`) : '' }),
      );
      const bySrc = plantsBySource(P.plants);
      $('int-grid-list').replaceChildren(
        ...Object.entries(bySrc).sort((a, b) => b[1].mw - a[1].mw).map(([src, g]) => row(`${src} · ${g.count} plant${g.count === 1 ? '' : 's'}`, `${fmt(g.mw, g.mw < 10 ? 1 : 0)} MW of mapped capacity${g.unknownMw ? `; ${g.unknownMw} with no output mapped` : ''}.`, 'primary', 'generation')),
        ...P.substations.slice(0, 30).map((s) => row(s.name || `Substation ${s.id}`, `${s.voltages.length ? s.voltages.map((v) => `${fmt(v, v < 1 ? 2 : 0)} kV`).join(' / ') : 'Voltage not mapped'}${s.operator ? ` · ${s.operator}` : ''}. ${fmt(Math.hypot(...toLocal(S.origin, s)), 1)} km away.`, 'caution', 'substation')),
      );
      if (!P.lines.length && !P.substations.length && !P.plants.length) $('int-grid-list').replaceChildren(row('Nothing mapped', `OpenStreetMap has no power infrastructure within ${r / 1000} km of the pin. That says what is mapped, not what exists.`, 'muted'));
      setBadge('int-prov', 'LINK', 'Grid loaded');
      draw();
    } catch (error) {
      mark('overpass', 'alert', 'refused', error.message);
      setBadge('int-grid-prov', 'BLOCKED', 'Not reachable');
      $('int-grid-list').replaceChildren(row('Overpass not reachable', `${error.message}. The public Overpass server is busy at times; try again in a minute.`, 'caution'));
    }
  }
  $('int-grid').addEventListener('click', loadGrid);

  /* ----------------------------------------------------------- property */

  async function loadProperty() {
    const { lat, lon } = S.origin;
    setBadge('int-prop-prov', 'LINK', 'Loading');
    const out = {};
    const jobs = [
      getJson(fccUrl(lat, lon), 30 * 86400000).then(async ({ json }) => {
        const f = parseFcc(json); if (!f) throw new Error('outside the United States (no census block here)');
        mark('fcc', 'confirm', 'linked', `${f.countyName}, ${f.stateCode}, tract ${f.tract}.`);
        out.fips = f;
        const [t, c] = await Promise.all([getJson(acsUrl(f, 'tract'), 30 * 86400000), getJson(acsUrl(f, 'county'), 30 * 86400000)]);
        out.tract = parseAcs(t.json); out.county = parseAcs(c.json);
        mark('census', 'confirm', 'linked', `${out.tract?.name ?? ''}.`);
      }).catch((e) => { out.censusError = e.message; mark(out.fips ? 'census' : 'fcc', 'alert', 'refused', e.message); }),
      getJson(femaUrl(lat, lon), 30 * 86400000).then(({ json }) => { if (json.error) throw new Error(json.error.message ?? 'FEMA error'); out.flood = parseFema(json); mark('fema', 'confirm', 'linked'); })
        .catch((e) => { out.floodError = e.message; mark('fema', 'alert', 'refused', e.message); }),
      getJson(elevationUrl(lat, lon), 30 * 86400000).then(({ json }) => { out.elevM = parseElevation(json); S.elevM = out.elevM; mark('usgs', 'confirm', 'linked'); })
        .catch((e) => { out.elevError = e.message; mark('usgs', 'alert', 'refused', e.message); }),
    ];
    await Promise.all(jobs);
    S.prop = out;
    renderProperty();
  }
  function renderProperty() {
    const out = S.prop; if (!out) return;
    const t = out.tract; const c = out.county;
    const rt = t ? housingRatios(t) : null; const rc = c ? housingRatios(c) : null;
    const rate = Number($('int-rate').value) || 0; const down = Math.min(100, Math.max(0, Number($('int-down').value) || 0));
    store.set('bo6.intel.rate', rate); store.set('bo6.intel.down', down);
    const vs = (a, b, money = false) => (Number.isFinite(a) && Number.isFinite(b) ? `county ${money ? usd(b) : fmt(b, 1)} (${a >= b ? '+' : '−'}${fmt(Math.abs((100 * (a - b)) / b), 0)} %)` : '');
    const items = [];
    if (t) {
      const pay = Number.isFinite(t.medianValue) ? monthlyPayment(t.medianValue * (1 - down / 100), rate) : null;
      items.push(
        readout('Median home value', usd(t.medianValue), { note: vs(t.medianValue, c?.medianValue, true) }),
        readout('Median rent', Number.isFinite(t.medianRent) ? `${usd(t.medianRent)}/mo` : '—', { note: vs(t.medianRent, c?.medianRent, true) }),
        readout('Household income', usd(t.medianIncome), { note: vs(t.medianIncome, c?.medianIncome, true) }),
        readout('Price-to-rent', rt.priceToRent ? fmt(rt.priceToRent, 1) : '—', { note: rt.grossYieldPct ? `gross yield ${fmt(rt.grossYieldPct, 2)} % · ${rt.priceToRent > 20 ? 'renting is cheaper than owning by this measure' : rt.priceToRent < 15 ? 'owning is cheap relative to rent' : 'middle of the range'}` : '' }),
        readout('Value ÷ income', rt.valueToIncome ? `${fmt(rt.valueToIncome, 1)}×` : '—', { tone: rt.valueToIncome > 5 ? 'caution' : 'muted', note: rc?.valueToIncome ? `county ${fmt(rc.valueToIncome, 1)}× · 3× was the old rule of thumb` : '' }),
        readout('Payment on the median', pay ? `${usd(pay)}/mo` : '—', { note: `principal + interest, ${down} % down, ${rate} % for 30 years (your inputs): M = L·i / (1 − (1+i)^−360)` }),
        readout('Owners / vacancy', `${fmt(rt.ownerPct, 0)} % / ${fmt(rt.vacancyPct, 1)} %`, { note: `${fmt(t.population, 0)} people · homes built ${Number.isFinite(t.medianYearBuilt) ? `around ${t.medianYearBuilt} (median)` : '—'}` }),
      );
    }
    items.push(
      readout('Flood zone', out.flood ? (out.flood.zone ?? 'none mapped') : '—', { tone: out.flood?.high ? 'alert' : 'muted', note: out.flood ? 'FEMA NFHL at the pin' : out.floodError ?? '' }),
      readout('Ground elevation', out.elevM != null ? `${fmt(out.elevM, 1)} m` : '—', { note: out.elevM != null ? `${fmt(out.elevM / 0.3048, 0)} ft · USGS 3DEP` : out.elevError ?? '' }),
    );
    $('int-prop-sum').replaceChildren(...items);
    const rows = [];
    if (out.fips) rows.push(row(t?.name ?? `Tract ${out.fips.tract}`, `${out.fips.countyName}, ${out.fips.stateCode}. Census block ${out.fips.block}.`, 'primary', 'where'));
    if (out.censusError) rows.push(row('Census figures not available', out.censusError, 'caution'));
    if (out.flood) rows.push(row(`Flood: ${out.flood.zone ?? 'no zone mapped'}`, out.flood.text, out.flood.high ? 'alert' : 'confirm', 'FEMA'));
    rows.push(row('The building itself', 'Footprints, heights, sun-hours, evacuation and energy for the buildings at this point are on the Site deck.', 'muted', 'Site deck'));
    $('int-prop-list').replaceChildren(...rows);
    const ok = Boolean(t || out.flood || out.elevM != null);
    setBadge('int-prop-prov', ok ? 'LINK' : 'BLOCKED', ok ? 'Public records' : 'Not reachable');
  }
  $('int-prop').addEventListener('click', loadProperty);
  for (const id of ['int-rate', 'int-down']) $(id).addEventListener('change', renderProperty);

  const start = () => { if (deck.dataset.open === 'true') draw(); };
  new MutationObserver(start).observe(deck, { attributes: true, attributeFilter: ['data-open'] });
  draw();
}
