/**
 * The Orbit deck: an open, live view of the sky above the ranch and the
 * solar system around it, built only from published data.
 *
 * - Solar system in 3D: planets from JPL's approximate elements, asteroids
 *   on their real orbits (JPL Small-Body Database), any date from a year ago
 *   to ten years ahead.
 * - Impact monitor: JPL CNEOS Sentry, every object with a computed chance of
 *   hitting Earth in the next hundred years, with the arithmetic behind the
 *   Palermo and Torino numbers written out.
 * - Close approaches: every asteroid passing within 0.05 au (19.5 lunar
 *   distances) in the next 60 days, from JPL.
 * - Earth orbit: the space stations, Starlink, GPS and more, propagated with
 *   SGP4 from CelesTrak's element sets, with passes over the ranch.
 * - Launches: SpaceX's upcoming launches (Launch Library 2), with the
 *   distance from the ranch to each pad — Vandenberg is next door to Lompoc.
 *
 * Nothing on this deck is the console's own observation: every number is
 * Linked (someone else's measurement, named) or Modelled (two-body or SGP4
 * propagation of their elements), and badged so.
 *
 * @module black-optic-6/space/orbit-ui
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AU_KM, bodyPosition, dist, fromJulian, julian, LD_KM, orbitPath, periodDays, planetElements, planetPosition, PLANETS } from './kepler.js';
import {
  cadUrl, diameterFromH, distances, impactEnergyMt, impactSpeed, JPL, NEOWS, neowsElements, oneIn, palermo, parseCad, parseNeowsFeed, parseSbdb, parseSentry, parseSentryObject, torino,
} from './neo.js';
import { ageDays, GROUPS, groupUrl, locate, look, passes, satrecs, sunlit } from './sats.js';
import { gstime } from '../../vendor/satellite/satellite.es.js';
import { countdown, fromRanch, launchesUrl, parseLaunches } from './launches.js';
import { ago, getJson } from '../intel/fetch.js';
import { compass } from '../intel/geo.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } },
};
const HOUR = 3600000;
const AU = 10; // scene units per au
const DAY_MS = 86400000;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
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
/** Ecliptic (x, y, z) au → three.js (y up). */
const v3 = (p, s = AU) => new THREE.Vector3(p[0] * s, p[2] * s, -p[1] * s);
const sizeText = (dKm) => (dKm >= 1 ? `${fmt(dKm, 1)} km` : `${fmt(dKm * 1000, 0)} m`);
const sizeRange = (h) => `${sizeText(diameterFromH(h, 0.25))}–${sizeText(diameterFromH(h, 0.05))}`;
const dateText = (d) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');

/**
 * @param {object} bridge state, readout, setBadge, logEvent, ranchPlace
 */
export function mountOrbitDeck(bridge) {
  const { readout, setBadge, logEvent } = bridge;
  const deck = $('deck-orbit');
  const S = {
    jd: julian(new Date()), speed: 0, sentry: [], cad: [], orbits: new Map(), selected: null, lastTick: performance.now(),
    sats: [], group: store.get('bo6.orbit.group', 'stations'), track: null, launches: [],
    key: store.get('bo6.orbit.nasaKey', 'DEMO_KEY'), sentryAt: null, cadAt: null,
  };
  const ranch = () => { const p = bridge.ranchPlace(); return { lat: p.lat, lon: p.lon, hKm: 0.03 }; };

  deck.innerHTML = `
    <div class="grid wide">
      <div class="panel">
        <div class="panel-head"><h2>Open sky · the solar system now</h2><span class="spacer"></span><span class="prov" id="orb-prov" data-tone="muted">Loading</span></div>
        <p class="note">Every planet where it really is, and the asteroids JPL is watching on their real orbits. Planets from JPL's published elements; asteroid orbits from JPL's Small-Body Database, drawn as two-body ellipses (right for the map, not for an impact prediction — that is Sentry's job, below). Sizes are not to scale; distances are.</p>
        <div class="twin-view" id="orb-view" style="margin-top:11px"><canvas id="orb-canvas"></canvas><canvas id="orb-labels" style="pointer-events:none"></canvas></div>
        <div class="controls" style="margin-top:10px">
          <label class="field" style="flex:1 1 260px"><span>Date · <b id="orb-date"></b></span><input id="orb-day" type="range" min="-365" max="3650" step="1" value="0" /></label>
          <div class="tally seg" id="orb-speed"><button type="button" data-v="0" aria-pressed="true">Pause</button><button type="button" data-v="1" aria-pressed="false">1 day/s</button><button type="button" data-v="10" aria-pressed="false">10 d/s</button><button type="button" data-v="60" aria-pressed="false">60 d/s</button></div>
          <button class="ghost" id="orb-now" type="button">Now</button>
        </div>
        <div class="controls" style="margin-top:8px">
          <div class="tally seg" id="orb-focus"><button type="button" data-v="inner" aria-pressed="true">Inner planets</button><button type="button" data-v="earth" aria-pressed="false">Around Earth</button><button type="button" data-v="outer" aria-pressed="false">Whole system</button></div>
        </div>
        <p class="note" id="orb-note" style="margin-top:9px">Drag to turn, pinch or wheel to zoom, tap an asteroid for its numbers. Red orbits are on JPL's impact-risk list; cyan ones pass Earth in the next 60 days.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Selected object</h2><span class="spacer"></span><span class="prov" id="orb-sel-prov" data-tone="muted">None</span></div>
        <div id="orb-sel"><p class="empty">Tap an asteroid in the view, or a row in the lists below.</p></div>
      </div>
    </div>
    <div class="grid">
      <div class="panel">
        <div class="panel-head"><h2>Impact monitor · JPL Sentry</h2><span class="spacer"></span><span class="prov" id="orb-sentry-prov" data-tone="muted">Not loaded</span></div>
        <p class="note">Every known object with a non-zero computed chance of hitting Earth within about a century, from JPL's Sentry system. The chances are JPL's; nearly all fall to zero as more observations come in. Sorted by the Palermo scale, which compares the risk with the natural background of impacts that size.</p>
        <div class="readouts" id="orb-sentry-sum" style="margin-top:11px"></div>
        <div class="controls" style="margin-top:9px"><div class="tally seg" id="orb-sentry-sort"><button type="button" data-v="ps" aria-pressed="true">Palermo</button><button type="button" data-v="ip" aria-pressed="false">Probability</button><button type="button" data-v="year" aria-pressed="false">Soonest</button><button type="button" data-v="size" aria-pressed="false">Largest</button></div></div>
        <ul class="rows" id="orb-sentry" style="margin-top:11px;max-height:520px;overflow:auto"><li class="empty">Loading JPL Sentry…</li></ul>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Close approaches · next 60 days</h2><span class="spacer"></span><span class="prov" id="orb-cad-prov" data-tone="muted">Not loaded</span></div>
        <p class="note">Every asteroid JPL predicts will pass within 0.05 au (19.5 times the Moon's distance) of Earth. "Between" is JPL's 3-sigma range for the closest distance.</p>
        <div class="readouts" id="orb-cad-sum" style="margin-top:11px"></div>
        <ul class="rows" id="orb-cad" style="margin-top:11px;max-height:520px;overflow:auto"><li class="empty">Loading JPL close-approach data…</li></ul>
      </div>
    </div>
    <div class="grid wide">
      <div class="panel">
        <div class="panel-head"><h2>Earth orbit · satellites now</h2><span class="spacer"></span><span class="prov" id="orb-sat-prov" data-tone="muted">Not loaded</span></div>
        <p class="note">Satellites where they are this second, propagated with SGP4 from CelesTrak's element sets. The marker on the globe is the ranch. Coastlines: Natural Earth.</p>
        <div class="controls" style="margin-top:11px">
          <label class="field" style="flex:1 1 200px"><span>Show</span><select id="orb-group">${GROUPS.map((g) => `<option value="${g.id}">${g.label}</option>`).join('')}</select></label>
          <label class="field" style="flex:1 1 200px"><span>Track for passes</span><input id="orb-track" type="text" list="orb-track-list" placeholder="ISS (ZARYA)" /><datalist id="orb-track-list"></datalist></label>
        </div>
        <div class="twin-view" id="orb-earth-view" style="margin-top:11px"><canvas id="orb-earth"></canvas></div>
        <div class="readouts" id="orb-sat-sum" style="margin-top:11px"></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Passes over the ranch</h2><span class="spacer"></span><span class="prov" id="orb-pass-prov" data-tone="muted">—</span></div>
        <p class="note">Next 48 hours, above 10°. "Visible" means the sky is dark at the ranch (Sun below −6°) and the satellite is in sunlight at its highest point — the times you can see it with your eyes.</p>
        <ul class="rows" id="orb-passes" style="margin-top:11px"><li class="empty">Load satellites first.</li></ul>
      </div>
    </div>
    <div class="grid">
      <div class="panel">
        <div class="panel-head"><h2>Launches · SpaceX</h2><span class="spacer"></span><span class="prov" id="orb-launch-prov" data-tone="muted">Not loaded</span></div>
        <div class="controls"><div class="tally seg" id="orb-lsp"><button type="button" data-v="SpaceX" aria-pressed="true">SpaceX</button><button type="button" data-v="" aria-pressed="false">Everyone</button></div></div>
        <ul class="rows" id="orb-launches" style="margin-top:11px"><li class="empty">Loading Launch Library 2…</li></ul>
        <p class="note" style="margin-top:9px">From The Space Devs' Launch Library 2 (free, 15 requests an hour, so this refreshes at most every 30 minutes). Distance and bearing are from the ranch to the pad; launches within 250 km are flagged — a Vandenberg launch can be seen and its sonic boom heard across the Central Coast.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Data and sources</h2><span class="spacer"></span><span class="prov" data-tone="primary">Open data</span></div>
        <ul class="rows" id="orb-sources"></ul>
        <div class="controls" style="margin-top:10px">
          <label class="field" style="flex:1 1 200px"><span>NASA API key (api.nasa.gov, free)</span><input id="orb-key" type="text" /></label>
          <label class="ghost file-btn" style="align-self:flex-end">Load a saved JPL file<input id="orb-file" type="file" accept=".json,application/json" hidden /></label>
        </div>
        <p class="note" id="orb-src-note" style="margin-top:9px">If a JPL server refuses this page, open its link in a new tab, save the page as a .json file, and load it here. NASA's own API key (DEMO_KEY allows about 30 requests an hour) is used for the fallback close-approach feed.</p>
      </div>
    </div>`;

  $('orb-key').value = S.key;
  $('orb-key').addEventListener('change', () => { S.key = $('orb-key').value.trim() || 'DEMO_KEY'; store.set('bo6.orbit.nasaKey', S.key); });
  $('orb-group').value = S.group;

  /* ------------------------------------------------------------ sources */

  const sources = {
    sentry: { name: 'JPL CNEOS Sentry', url: `${JPL}/sentry.api`, what: 'Impact-risk list and per-object impact solutions.' },
    cad: { name: 'JPL close-approach data', url: cadUrl(60, 0.05), what: 'Earth passes inside 0.05 au, next 60 days.' },
    sbdb: { name: 'JPL Small-Body Database', url: `${JPL}/sbdb.api`, what: 'Osculating orbital elements for each asteroid drawn.' },
    neows: { name: 'NASA NeoWs (fallback)', url: `${NEOWS}/feed`, what: 'The same JPL data through api.nasa.gov, used if JPL refuses.' },
    celestrak: { name: 'CelesTrak GP data', url: groupUrl(S.group), what: 'US Space Force element sets, republished by Dr T. S. Kelso. Fetched at most every 2 hours, as CelesTrak asks.' },
    ll2: { name: 'The Space Devs · Launch Library 2', url: launchesUrl(), what: 'Upcoming launches and pads.' },
    planets: { name: 'JPL approximate planetary elements', url: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html', what: 'Table 1 (1800–2050), built in — no download.' },
    land: { name: 'Natural Earth 1:110m land', url: 'https://www.naturalearthdata.com/', what: 'Public-domain coastlines, bundled (via world-atlas, ISC).' },
  };
  const status = {};
  function renderSources() {
    $('orb-sources').replaceChildren(...Object.entries(sources).map(([k, s]) => {
      const st = status[k] ?? { tone: k === 'planets' || k === 'land' ? 'confirm' : 'muted', text: k === 'planets' || k === 'land' ? 'built in' : 'waiting' };
      return row(s.name, `${s.what} ${st.detail ?? ''}`.trim(), st.tone, st.text, s.url);
    }));
  }
  const mark = (k, tone, text, detail = '') => { status[k] = { tone, text, detail }; renderSources(); };
  renderSources();

  /* ============================================================ 3D: SUN */

  let R = null; // renderer bundle
  function init3d() {
    if (R) return;
    const canvas = $('orb-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020409);
    const camera = new THREE.PerspectiveCamera(45, 2, 0.01, 5000);
    camera.position.set(0, 22, 26);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    // Stars: a fixed random sphere (decorative, and said so nowhere because it carries no data).
    {
      const n = 2500; const pos = new Float32Array(n * 3);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < n; i += 1) {
        const u = rnd() * 2 - 1; const t = rnd() * Math.PI * 2; const r = 1500;
        pos.set([r * Math.sqrt(1 - u * u) * Math.cos(t), r * u, r * Math.sqrt(1 - u * u) * Math.sin(t)], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8899aa, size: 1.6, sizeAttenuation: false })));
    }
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    scene.add(sun);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffb347, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(3.2, 3.2, 1); scene.add(glow);
    scene.add(new THREE.AmbientLight(0x334455, 0.6));
    scene.add(new THREE.PointLight(0xffffff, 3, 0, 0));
    // Ecliptic plane, rings every 1 au out to 5 au.
    const grid = new THREE.PolarGridHelper(5 * AU, 12, 5, 128, 0x14324a, 0x0c1c2a);
    grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    const planets = {};
    for (const [name, p] of Object.entries(PLANETS)) {
      const size = ['jupiter', 'saturn'].includes(name) ? 0.5 : ['uranus', 'neptune'].includes(name) ? 0.38 : name === 'earth' ? 0.22 : 0.16;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 24, 12), new THREE.MeshStandardMaterial({ color: p.colour, roughness: 0.8, emissive: p.colour, emissiveIntensity: 0.25 }));
      const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: p.colour, transparent: true, opacity: name === 'earth' ? 0.7 : 0.35 }));
      scene.add(mesh, line);
      planets[name] = { mesh, line };
    }
    const bodies = new THREE.Group(); scene.add(bodies);
    const ray = new THREE.Raycaster();
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(bodies.children.filter((c) => c.userData.pick), false)[0];
      if (hit) select(hit.object.userData.des);
    });
    R = { renderer, scene, camera, controls, planets, bodies, labels: $('orb-labels') };
    focus('inner');
    updatePlanetOrbits();
    loop();
  }

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,200,120,0.5)'); grad.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  let orbitEpoch = null;
  function updatePlanetOrbits() {
    // Planet orbits change slowly; redraw when the date moves more than 5 years.
    if (orbitEpoch != null && Math.abs(S.jd - orbitEpoch) < 1826) return;
    orbitEpoch = S.jd;
    for (const name of Object.keys(PLANETS)) {
      const pts = orbitPath(planetElements(name, S.jd), name === 'mercury' ? 240 : 180).map((p) => v3(p));
      R.planets[name].line.geometry.dispose();
      R.planets[name].line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
  }

  function focus(which) {
    const c = R.camera; const t = R.controls.target;
    if (which === 'outer') { c.position.set(0, 260, 300); t.set(0, 0, 0); }
    else if (which === 'earth') { const e = v3(planetPosition('earth', S.jd)); t.copy(e); c.position.copy(e).add(new THREE.Vector3(0, 2.2, 3.2)); }
    else { c.position.set(0, 22, 26); t.set(0, 0, 0); }
    R.focus = which;
    for (const b of $('orb-focus').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === which));
  }

  function addBodyMesh(des) {
    const o = S.orbits.get(des);
    if (!o || o.mesh || !R) return;
    const risk = S.sentry.find((s) => s.des === des);
    const colour = risk ? (risk.tsMax >= 1 ? 0xffb020 : 0xff4b5c) : 0x4fe8ff;
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPath(o.el, 200).map((p) => v3(p))), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.55 }));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: colour }));
    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData = { pick: true, des };
    R.bodies.add(line, mesh, pick);
    o.line = line; o.mesh = mesh; o.pick = pick; o.colour = colour;
  }

  function placeBodies() {
    for (const [name, p] of Object.entries(R.planets)) p.mesh.position.copy(v3(planetPosition(name, S.jd)));
    for (const [des, o] of S.orbits) {
      if (!o.mesh) addBodyMesh(des);
      const pos = bodyPosition(o.el, S.jd);
      if (!pos || !o.mesh) continue;
      o.mesh.position.copy(v3(pos)); o.pick.position.copy(o.mesh.position);
      const sel = S.selected === des;
      o.mesh.scale.setScalar(sel ? 2.4 : 1);
      o.line.material.opacity = sel ? 1 : S.selected ? 0.2 : 0.55;
    }
  }

  function drawLabels() {
    const c = R.labels; const r = c.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    g.font = '11px ui-monospace, monospace';
    const put = (pos, text, colour) => {
      const p = pos.clone().project(R.camera);
      if (p.z > 1) return;
      const x = (p.x + 1) / 2 * r.width; const y = (1 - p.y) / 2 * r.height;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return;
      g.fillStyle = colour; g.fillText(text, x + 7, y - 6);
    };
    for (const [name, p] of Object.entries(R.planets)) {
      if (R.focus !== 'outer' && ['uranus', 'neptune', 'saturn'].includes(name)) continue;
      put(p.mesh.position, name[0].toUpperCase() + name.slice(1), '#c8d6e5');
    }
    put(new THREE.Vector3(0, 0, 0), 'Sun', '#ffd27a');
    for (const [des, o] of S.orbits) {
      if (!o.mesh) continue;
      if (S.selected === des || (R.focus === 'earth' && o.mesh.position.distanceTo(R.planets.earth.mesh.position) < 3)) put(o.mesh.position, o.short, '#' + o.colour.toString(16).padStart(6, '0'));
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(); const dt = (now - S.lastTick) / 1000; S.lastTick = now;
    if (deck.dataset.open !== 'true') return;
    if (S.speed) {
      S.jd += S.speed * dt;
      const day = Math.round(S.jd - julian(new Date()));
      if (day > 3650) { S.jd = julian(new Date()) + 3650; setSpeed(0); }
      $('orb-day').value = String(Math.max(-365, Math.min(3650, day)));
      showDate();
    }
    const view = $('orb-view'); const w = view.clientWidth; const h = view.clientHeight;
    if (R.renderer.domElement.width !== Math.round(w * R.renderer.getPixelRatio())) { R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); }
    updatePlanetOrbits();
    placeBodies();
    if (R.focus === 'earth') {
      const e = R.planets.earth.mesh.position; const delta = e.clone().sub(R.controls.target);
      R.controls.target.add(delta); R.camera.position.add(delta);
    }
    R.controls.update();
    R.renderer.render(R.scene, R.camera);
    drawLabels();
    renderEarth();
    if (S.selected && now - (S.selAt ?? 0) > 500) { S.selAt = now; renderSelected(false); }
  }

  function showDate() {
    const d = fromJulian(S.jd);
    const day = Math.round(S.jd - julian(new Date()));
    $('orb-date').textContent = `${d.toISOString().slice(0, 10)}${day === 0 ? ' (today)' : day > 0 ? ` (+${day} d)` : ` (${day} d)`}`;
  }
  function setSpeed(v) {
    S.speed = v;
    for (const b of $('orb-speed').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v));
  }
  $('orb-day').addEventListener('input', () => { S.jd = julian(new Date()) + Number($('orb-day').value); showDate(); });
  $('orb-speed').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setSpeed(Number(b.dataset.v)); });
  $('orb-now').addEventListener('click', () => { S.jd = julian(new Date()); $('orb-day').value = '0'; setSpeed(0); showDate(); });
  $('orb-focus').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && R) focus(b.dataset.v); });
  showDate();

  /* ============================================================ SENTRY */

  let sentrySort = 'ps';
  async function loadSentry() {
    try {
      const { json, at, stale } = await getJson(sources.sentry.url, 6 * HOUR);
      useSentry(json, at, stale ? 'cache (JPL unreachable now)' : 'JPL');
    } catch (error) {
      mark('sentry', 'alert', 'blocked', error.message);
      setBadge('orb-sentry-prov', 'BLOCKED', 'Not reachable');
      $('orb-sentry').replaceChildren(row('JPL Sentry not reachable', `${error.message}. Open ${sources.sentry.url} in a new tab, save it as a .json file, and load it under Data and sources.`, 'caution'));
    }
  }
  function useSentry(json, at, via) {
    S.sentry = parseSentry(json);
    S.sentryAt = at;
    mark('sentry', 'confirm', 'linked', `${S.sentry.length} objects, fetched ${ago(at)} via ${via}.`);
    setBadge('orb-sentry-prov', 'LINK', `JPL · ${ago(at)}`);
    renderSentry();
    for (const s of S.sentry.filter((x) => (x.tsMax ?? 0) >= 1)) logEvent(`Sentry: Torino ${s.tsMax}`, `${s.name}: impact probability ${oneIn(s.ip)} over ${s.range}. JPL's computation; expected to fall as observations accumulate.`, 'caution');
    queueOrbits();
  }
  function renderSentry() {
    const list = [...S.sentry];
    if (sentrySort === 'ip') list.sort((a, b) => (b.ip ?? 0) - (a.ip ?? 0));
    if (sentrySort === 'year') list.sort((a, b) => (a.firstYear ?? 9999) - (b.firstYear ?? 9999));
    if (sentrySort === 'size') list.sort((a, b) => (b.diameterKm ?? 0) - (a.diameterKm ?? 0));
    const top = S.sentry[0];
    const ts1 = S.sentry.filter((s) => (s.tsMax ?? 0) >= 1).length;
    const big = S.sentry.filter((s) => (s.diameterKm ?? 0) >= 0.14).length;
    $('orb-sentry-sum').replaceChildren(
      readout('Objects', fmt(S.sentry.length), { note: 'with any computed impact chance' }),
      readout('Torino ≥ 1', String(ts1), { tone: ts1 ? 'caution' : 'confirm', note: ts1 ? 'meriting attention' : 'none above "no hazard"' }),
      readout('Highest Palermo', top ? fmt(top.psCum, 2) : '—', { tone: (top?.psCum ?? -9) > -2 ? 'caution' : 'confirm', note: top ? top.name : '' }),
      readout('140 m or larger', String(big), { note: 'the size NASA must find 90 % of' }),
    );
    $('orb-sentry').replaceChildren(...list.slice(0, 60).map((s) => {
      const t = torino(s.tsMax);
      const e = s.diameterKm && s.vInf ? impactEnergyMt(s.diameterKm, s.vInf) : null;
      const li = row(`${s.name} · ${s.range}`,
        `Chance of impact ${oneIn(s.ip)} (${fmt((s.ip ?? 0) * 100, s.ip < 1e-4 ? 6 : 4)} %) summed over ${s.nImp} possible dates. Palermo ${fmt(s.psCum, 2)} (cumulative), Torino ${s.tsMax ?? '—'}. About ${s.diameterKm ? sizeText(s.diameterKm) : '—'} across${e ? `; if it hit at ${fmt(impactSpeed(s.vInf), 1)} km/s it would release about ${e >= 1 ? `${fmt(e, e < 10 ? 1 : 0)} Mt` : `${fmt(e * 1000, 0)} kt`} of TNT` : ''}.`,
        (s.psCum ?? -9) > -2 || (s.tsMax ?? 0) >= 1 ? 'caution' : t.tone, `PS ${fmt(s.psCum, 2)}`,
        `Last observed ${s.lastObs}. H = ${s.h ?? '—'}. Energy assumes a stony sphere at 2,600 kg/m³ (Sentry's assumption).`);
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => select(s.des, true));
      return li;
    }));
  }
  $('orb-sentry-sort').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    sentrySort = b.dataset.v;
    for (const x of $('orb-sentry-sort').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    renderSentry();
  });

  /* ======================================================= CLOSE PASSES */

  async function loadCad() {
    try {
      const { json, at, stale } = await getJson(sources.cad.url, 6 * HOUR);
      useCad(parseCad(json), at, stale ? 'cache (JPL unreachable now)' : 'JPL', 60);
    } catch (error) {
      mark('cad', 'alert', 'blocked', error.message);
      // Fallback: NeoWs (CORS-enabled), next 7 days in one request.
      try {
        const d0 = new Date(); const d1 = new Date(+d0 + 7 * DAY_MS);
        const url = `${NEOWS}/feed?start_date=${d0.toISOString().slice(0, 10)}&end_date=${d1.toISOString().slice(0, 10)}&api_key=${encodeURIComponent(S.key)}`;
        const { json, at } = await getJson(url, 6 * HOUR);
        const rows = parseNeowsFeed(json).filter((r) => r.distAu <= 0.05 && r.at >= d0);
        mark('neows', 'confirm', 'linked', `${rows.length} passes in 7 days, fetched ${ago(at)}.`);
        useCad(rows, at, 'NASA NeoWs (JPL refused)', 7);
      } catch (e2) {
        mark('neows', 'alert', 'blocked', e2.message);
        setBadge('orb-cad-prov', 'BLOCKED', 'Not reachable');
        $('orb-cad').replaceChildren(row('Close-approach data not reachable', `${error.message}; NeoWs fallback: ${e2.message}. Open ${sources.cad.url} in a new tab, save it, and load it under Data and sources.`, 'caution'));
      }
    }
  }
  function useCad(rows, at, via, days) {
    S.cad = rows; S.cadAt = at;
    if (via.startsWith('JPL') || via.startsWith('cache') || via.startsWith('file')) mark('cad', 'confirm', 'linked', `${rows.length} passes, fetched ${ago(at)} via ${via}.`);
    setBadge('orb-cad-prov', 'LINK', `${via.split(' ')[0]} · ${ago(at)}`);
    const inside = rows.filter((r) => r.distAu * AU_KM < LD_KM);
    const closest = [...rows].sort((a, b) => a.distAu - b.distAu)[0];
    $('orb-cad-sum').replaceChildren(
      readout('Passes', String(rows.length), { note: `next ${days} days, inside 0.05 au` }),
      readout('Inside the Moon', String(inside.length), { tone: inside.length ? 'caution' : 'confirm', note: 'closer than 384,400 km' }),
      readout('Closest', closest ? `${fmt(distances(closest.distAu).ld, 2)} LD` : '—', { note: closest ? `${closest.name}, ${closest.at.toISOString().slice(0, 10)}` : '' }),
    );
    $('orb-cad').replaceChildren(...(rows.length ? rows : []).map((r) => {
      const d = distances(r.distAu);
      const size = r.diameterKm ? `${sizeText(r.diameterKm)} (measured)` : r.h != null ? `${sizeRange(r.h)} (from brightness H = ${r.h})` : '—';
      const li = row(`${r.name} · ${r.at.toISOString().slice(0, 10)}`,
        `${fmt(d.ld, 2)} lunar distances (${fmt(d.km, 0)} km)${r.minAu != null ? `, between ${fmt(distances(r.minAu).ld, 2)} and ${fmt(distances(r.maxAu).ld, 2)} LD` : ''}, at ${fmt(r.vRel, 1)} km/s. Size ${size}.`,
        d.ld < 1 ? 'caution' : 'primary', dateText(r.at).slice(11));
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => select(r.des, true));
      return li;
    }));
    if (!rows.length) $('orb-cad').replaceChildren(row('No passes inside 0.05 au', `JPL lists none in the next ${days} days. That is a statement about known objects only.`, 'confirm'));
    for (const r of inside.filter((x) => +x.at - Date.now() < 7 * DAY_MS)) logEvent('Asteroid inside the Moon’s distance', `${r.name} passes at ${fmt(distances(r.distAu).ld, 2)} LD on ${dateText(r.at)}. No impact risk is implied: JPL's closest-approach range excludes Earth.`, 'caution');
    queueOrbits();
  }

  /* ============================================================ ORBITS */

  let orbitQueue = Promise.resolve();
  let sbdbBlocked = false;
  function queueOrbits() {
    const wanted = [...S.sentry.slice(0, 12).map((s) => s.des), ...S.cad.slice(0, 30).map((c) => c.des)];
    for (const des of new Set(wanted)) fetchOrbit(des);
  }
  function fetchOrbit(des, neoId = S.cad.find((c) => c.des === des)?.neoId) {
    if (S.orbits.has(des) || sbdbBlocked && !neoId) return orbitQueue;
    orbitQueue = orbitQueue.then(async () => {
      if (S.orbits.has(des)) return;
      let el = null; let via = 'JPL SBDB';
      if (!sbdbBlocked) {
        try {
          const { json } = await getJson(`${JPL}/sbdb.api?sstr=${encodeURIComponent(des)}`, 7 * 24 * HOUR);
          el = parseSbdb(json);
          mark('sbdb', 'confirm', 'linked', `${S.orbits.size + 1} orbits loaded.`);
        } catch (error) {
          sbdbBlocked = true;
          mark('sbdb', 'alert', 'blocked', `${error.message}. Orbits come from NeoWs where it has them.`);
        }
      }
      if (!el && neoId) {
        try { el = neowsElements((await getJson(`${NEOWS}/neo/${neoId}?api_key=${encodeURIComponent(S.key)}`, 7 * 24 * HOUR)).json); via = 'NASA NeoWs'; } catch { /* no orbit */ }
      }
      if (!el) return;
      const short = (el.name || des).replace(/^\d+\s+/, '').replace(/[()]/g, '').trim() || des;
      S.orbits.set(des, { el, via, short });
      if (S.selected === des) renderSelected(true);
    });
    return orbitQueue;
  }

  /* ========================================================== SELECTED */

  async function select(des, fetchIt = false) {
    S.selected = des;
    if (fetchIt && !S.orbits.has(des)) { renderSelected(true); await fetchOrbit(des); }
    renderSelected(true);
    const s = S.sentry.find((x) => x.des === des);
    if (s && !s.detail && !s.detailTried) {
      s.detailTried = true;
      try { s.detail = parseSentryObject((await getJson(`${JPL}/sentry.api?des=${encodeURIComponent(des)}`, 6 * HOUR)).json); renderSelected(true); } catch { /* summary is enough */ }
    }
  }
  function renderSelected(full) {
    const des = S.selected; if (!des) return;
    const o = S.orbits.get(des); const s = S.sentry.find((x) => x.des === des); const c = S.cad.find((x) => x.des === des);
    const earth = planetPosition('earth', S.jd);
    const pos = o ? bodyPosition(o.el, S.jd) : null;
    const dAu = pos ? dist(pos, earth) : null;
    const items = [
      readout('From Earth', dAu != null ? `${fmt(dAu, 3)} au` : '—', { note: dAu != null ? `${fmt(distances(dAu).ld, 1)} LD on ${fromJulian(S.jd).toISOString().slice(0, 10)} · two-body` : 'orbit not loaded' }),
      readout('From the Sun', pos ? `${fmt(Math.hypot(...pos), 3)} au` : '—'),
    ];
    if (o) items.push(
      readout('Orbit', `a ${fmt(o.el.a, 3)} au · e ${fmt(o.el.e, 3)}`, { note: `i ${fmt(o.el.i, 2)}° · period ${fmt(periodDays(o.el.a) / 365.25, 2)} y` }),
      readout('Perihelion / aphelion', `${fmt(o.el.a * (1 - o.el.e), 3)} / ${fmt(o.el.a * (1 + o.el.e), 3)} au`, { note: o.el.moid != null ? `closest the orbits get (MOID): ${fmt(distances(o.el.moid).ld, 2)} LD` : '' }),
    );
    if (s) items.push(readout('Impact chance', oneIn(s.ip), { tone: (s.psCum ?? -9) > -2 ? 'caution' : 'muted', note: `Palermo ${fmt(s.psCum, 2)} · Torino ${s.tsMax ?? '—'} · ${s.range}` }));
    if (c) items.push(readout('Next pass', `${fmt(distances(c.distAu).ld, 2)} LD`, { note: `${dateText(c.at)} · ${fmt(c.vRel, 1)} km/s` }));
    const box = $('orb-sel');
    if (full || !box.querySelector('.readouts')) {
      box.replaceChildren();
      const h = el(`<h3 style="margin:0 0 8px;font-size:15px"></h3>`); h.textContent = o?.el.name || s?.name || c?.name || des; box.append(h);
      box.append(el('<div class="readouts" id="orb-sel-r"></div>'));
      if (s) {
        const e = s.detail?.energyMt ?? (s.diameterKm && s.vInf ? impactEnergyMt(s.diameterKm, s.vInf) : null);
        const imp = s.detail?.impacts?.[0];
        const years = imp ? Number(imp.date.slice(0, 4)) - new Date().getUTCFullYear() : s.firstYear ? s.firstYear - new Date().getUTCFullYear() : null;
        const ps = e && imp?.ip && years > 0 ? palermo(imp.ip, e, years) : null;
        const note = el('<p class="note" style="margin-top:10px"></p>');
        note.textContent = e
          ? `The arithmetic: a ${sizeText(s.diameterKm)} stony body (2,600 kg/m³) arriving at √(v∞² + 11.186²) = ${fmt(impactSpeed(s.vInf), 2)} km/s carries ½mv² ≈ ${e >= 1 ? `${fmt(e, e < 10 ? 1 : 0)} Mt` : `${fmt(e * 1000, 1)} kt`} of TNT. Impacts that energetic happen naturally about ${fmt(1 / (0.03 * e ** -0.8), 0)} years apart (f_B = 0.03·E^−0.8 per year).${ps != null ? ` Its most likely date (${imp.date}, chance ${oneIn(imp.ip)}) gives Palermo = log10(P / (f_B·ΔT)) = ${fmt(ps, 2)}; JPL's value for that date is ${fmt(imp.ps, 2)} (JPL uses the exact years to impact and its own energy).` : ''}`
          : 'Size or speed not published, so the energy is not computed.';
        box.append(note);
      }
      const link = el('<p class="note" style="margin-top:8px"><a target="_blank" rel="noopener">Open in JPL’s Small-Body Database</a></p>');
      link.querySelector('a').href = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(des)}`;
      box.append(link);
      setBadge('orb-sel-prov', o ? 'MODEL' : 'LINK', o ? `Orbit · ${o.via}` : 'No orbit yet');
    }
    $('orb-sel-r')?.replaceChildren(...items);
  }

  /* =========================================================== EARTH */

  let E = null;
  function initEarth() {
    if (E) return;
    const canvas = $('orb-earth');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020409);
    const camera = new THREE.PerspectiveCamera(40, 2, 0.01, 200);
    camera.position.set(0, 1.2, 3.1);
    const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.minDistance = 1.3; controls.maxDistance = 30;
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sunLight);
    const tex = new THREE.CanvasTexture(coastTexture()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    scene.add(earth);
    const ranchDot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b4e }));
    earth.add(ranchDot);
    const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x4fe8ff, size: 2.4, sizeAttenuation: false }));
    scene.add(pts);
    const tracked = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7 }));
    scene.add(tracked, trail);
    E = { renderer, scene, camera, controls, earth, ranchDot, pts, tracked, trail, sunLight, lastProp: 0 };
  }
  /** ECI km → three (Earth radii, y up). */
  const e3 = (p) => new THREE.Vector3(p.x / 6378.137, p.z / 6378.137, -p.y / 6378.137);

  function coastTexture() {
    const W = 2048; const H = 1024;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#06182b'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(79,232,255,0.12)'; g.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) { const x = ((lon + 180) / 360) * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let lat = -60; lat <= 60; lat += 30) { const y = ((90 - lat) / 180) * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (land) {
      g.fillStyle = '#1d3b33'; g.strokeStyle = '#5fbf9a'; g.lineWidth = 1.4;
      for (const ring of land.rings) {
        g.beginPath();
        ring.forEach(([lon, lat], k) => { const x = ((lon + 180) / 360) * W; const y = ((90 - lat) / 180) * H; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath(); g.fill(); g.stroke();
      }
    }
    return c;
  }
  let land = null;
  fetch(new URL('../../vendor/world/land-110m.json', import.meta.url)).then((r) => r.json()).then((j) => {
    land = j;
    if (E) { E.earth.material.map = new THREE.CanvasTexture(coastTexture()); E.earth.material.map.colorSpace = THREE.SRGBColorSpace; E.earth.material.needsUpdate = true; }
  }).catch(() => {});

  function renderEarth() {
    if (!E) return;
    const view = $('orb-earth-view'); const w = view.clientWidth; const h = view.clientHeight;
    if (E.renderer.domElement.width !== Math.round(w * E.renderer.getPixelRatio())) { E.renderer.setSize(w, h, false); E.camera.aspect = w / h; E.camera.updateProjectionMatrix(); }
    const now = new Date();
    E.earth.rotation.y = gstime(now); // same sidereal angle SGP4's TEME frame uses
    const r = ranch(); const lat = r.lat * Math.PI / 180; const lon = r.lon * Math.PI / 180;
    E.ranchDot.position.set(Math.cos(lat) * Math.cos(lon) * 1.005, Math.sin(lat) * 1.005, -Math.cos(lat) * Math.sin(lon) * 1.005);
    // Sun direction (equatorial of date) for lighting.
    const n = julian(now) - 2451545.0; const Lr = (280.460 + 0.9856474 * n) * Math.PI / 180; const gr = (357.528 + 0.9856003 * n) * Math.PI / 180;
    const lam = Lr + (1.915 * Math.sin(gr) + 0.02 * Math.sin(2 * gr)) * Math.PI / 180; const eps = 23.439 * Math.PI / 180;
    E.sunLight.position.copy(e3({ x: Math.cos(lam) * 1e5, y: Math.cos(eps) * Math.sin(lam) * 1e5, z: Math.sin(eps) * Math.sin(lam) * 1e5 }));
    if (performance.now() - E.lastProp > (S.sats.length > 2000 ? 2000 : 1000) && S.sats.length) {
      E.lastProp = performance.now();
      const arr = new Float32Array(S.sats.length * 3); let k = 0;
      for (const s of S.sats) { const p = locate(s, now); if (!p) continue; const v = e3(p.eci); arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; }
      E.pts.geometry.dispose(); E.pts.geometry = new THREE.BufferGeometry(); E.pts.geometry.setAttribute('position', new THREE.BufferAttribute(arr.subarray(0, k), 3));
      E.pts.material.size = S.sats.length > 2000 ? 1.4 : 2.6;
      renderTracked(now);
    }
    E.controls.update();
    E.renderer.render(E.scene, E.camera);
  }

  function renderTracked(now) {
    const t = S.track;
    if (!t) { E.tracked.visible = false; E.trail.visible = false; return; }
    const p = locate(t, now);
    if (!p) return;
    E.tracked.visible = true; E.tracked.position.copy(e3(p.eci));
    if (!t.trailAt || +now - t.trailAt > 60000) {
      t.trailAt = +now;
      const period = 1440 / (t.rec.no * 1440 / (2 * Math.PI)); // minutes
      const pts = [];
      for (let m = 0; m <= period; m += period / 120) { const q = locate(t, new Date(+now + m * 60000)); if (q) pts.push(e3(q.eci)); }
      E.trail.geometry.dispose(); E.trail.geometry = new THREE.BufferGeometry().setFromPoints(pts); E.trail.visible = true;
    }
    const lk = look(t, now, ranch());
    const age = ageDays(t, now);
    $('orb-sat-sum').replaceChildren(
      readout('Satellites', fmt(S.sats.length), { note: `${$('orb-group').selectedOptions[0]?.text ?? ''}` }),
      readout(t.name, `${fmt(p.altKm, 0)} km up`, { note: `${fmt(p.lat, 2)}°, ${fmt(p.lon, 2)}° · ${fmt(p.speedKms, 2)} km/s` }),
      readout('From the ranch', lk ? `${fmt(lk.rangeKm, 0)} km` : '—', { tone: lk?.el > 0 ? 'alert' : 'muted', note: lk ? `${lk.el > 0 ? 'above' : 'below'} the horizon · elevation ${fmt(lk.el, 1)}° · bearing ${fmt(lk.az, 0)}° ${compass(lk.az)}${lk.el > 0 && sunlit(lk.eci, now) ? ' · in sunlight' : ''}` : '' }),
      readout('Elements age', `${fmt(age, 1)} days`, { tone: age > 5 ? 'caution' : 'confirm', note: age > 5 ? 'SGP4 drifts a few km a day; positions are rough' : 'fresh enough for ~1 km' }),
    );
  }

  async function loadSats() {
    const group = $('orb-group').value; S.group = group; store.set('bo6.orbit.group', group);
    sources.celestrak.url = groupUrl(group);
    setBadge('orb-sat-prov', 'LINK', 'Loading');
    try {
      const { json, at, stale } = await getJson(groupUrl(group), 2 * HOUR, { timeoutMs: 45000 });
      S.sats = satrecs(json);
      mark('celestrak', 'confirm', 'linked', `${S.sats.length} element sets (${group}), fetched ${ago(at)}${stale ? ', CelesTrak unreachable now' : ''}.`);
      setBadge('orb-sat-prov', 'MODEL', `SGP4 · ${S.sats.length}`);
      $('orb-track-list').replaceChildren(...S.sats.slice(0, 400).map((s) => { const o = document.createElement('option'); o.value = s.name; return o; }));
      const want = $('orb-track').value.trim() || store.get('bo6.orbit.track', 'ISS (ZARYA)');
      setTrack(S.sats.find((s) => s.name === want) ?? S.sats.find((s) => /ISS \(ZARYA\)/.test(s.name)) ?? S.sats[0]);
      if (E) E.lastProp = 0;
    } catch (error) {
      S.sats = [];
      mark('celestrak', 'alert', 'blocked', error.message);
      setBadge('orb-sat-prov', 'BLOCKED', 'Not reachable');
      $('orb-sat-sum').replaceChildren(readout('CelesTrak', 'not reachable', { tone: 'caution', note: error.message }));
    }
  }
  function setTrack(sat) {
    S.track = sat ?? null;
    if (!sat) return;
    $('orb-track').value = sat.name; store.set('bo6.orbit.track', sat.name);
    const r = ranch();
    const list = passes(sat, r, new Date(), 48, 10);
    setBadge('orb-pass-prov', 'MODEL', `${list.filter((p) => p.visible).length} visible`);
    $('orb-passes').replaceChildren(...(list.length ? list.slice(0, 14).map((p) => row(
      `${p.visible ? 'VISIBLE · ' : ''}${p.rise.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`,
      `Rises ${compass(p.riseAz)}, highest ${fmt(p.maxEl, 0)}° in the ${compass(p.peakAz)} at ${p.peak.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}, sets ${compass(p.setAz)} at ${p.set.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`,
      p.visible ? 'confirm' : 'muted', `${Math.round((p.set - p.rise) / 60000)} min`,
    )) : [row(`No passes above 10°`, `${sat.name} does not rise above 10° at the ranch in the next 48 hours.`, 'muted')]));
    if (E) E.lastProp = 0;
  }
  $('orb-group').addEventListener('change', loadSats);
  $('orb-track').addEventListener('change', () => { const s = S.sats.find((x) => x.name.toLowerCase() === $('orb-track').value.trim().toLowerCase()); if (s) setTrack(s); });

  /* ========================================================= LAUNCHES */

  let lsp = 'SpaceX';
  async function loadLaunches() {
    const url = launchesUrl(lsp);
    sources.ll2.url = url;
    try {
      const { json, at, stale } = await getJson(url, 30 * 60000);
      S.launches = parseLaunches(json); S.launchAt = at;
      mark('ll2', 'confirm', 'linked', `${S.launches.length} launches, fetched ${ago(at)}${stale ? ' (service unreachable now)' : ''}.`);
      setBadge('orb-launch-prov', 'LINK', `LL2 · ${ago(at)}`);
      renderLaunches();
    } catch (error) {
      mark('ll2', 'alert', 'blocked', error.message);
      setBadge('orb-launch-prov', 'BLOCKED', 'Not reachable');
      $('orb-launches').replaceChildren(row('Launch Library not reachable', `${error.message}. Its free tier allows 15 requests an hour per address.`, 'caution'));
    }
  }
  function renderLaunches() {
    const r = ranch();
    $('orb-launches').replaceChildren(...S.launches.map((l) => {
      const f = fromRanch(l, r);
      return row(`${l.name}`,
        `${l.rocket || l.provider} from ${l.pad}${l.location ? `, ${l.location}` : ''}. ${l.mission ? l.mission.slice(0, 220) : ''}${l.orbit ? ` Orbit: ${l.orbit}.` : ''}${f ? ` Pad is ${fmt(f.km, 0)} km ${f.compass} of the ranch.` : ''}`,
        f?.local ? 'alert' : /go/i.test(l.status) ? 'confirm' : 'primary',
        `${countdown(l.net)} · ${l.status || '—'}`,
        l.net ? `NET ${dateText(l.net)}${l.windowEnd && l.windowStart && +l.windowEnd !== +l.windowStart ? ` (window ${Math.round((l.windowEnd - l.windowStart) / 60000)} min)` : ''}` : '');
    }));
    for (const l of S.launches.filter((x) => fromRanch(x, r)?.local && x.net && +x.net - Date.now() < 24 * HOUR && +x.net > Date.now())) {
      if (!S.warned?.has(l.id)) { (S.warned ??= new Set()).add(l.id); logEvent('Launch nearby within 24 h', `${l.name} from ${l.pad}, ${fmt(fromRanch(l, r).km, 0)} km away, NET ${dateText(l.net)}. Expect a sonic boom; it is not an incident.`, 'caution'); }
    }
  }
  $('orb-lsp').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    lsp = b.dataset.v;
    for (const x of $('orb-lsp').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    loadLaunches();
  });
  setInterval(() => { if (deck.dataset.open === 'true' && S.launches.length) renderLaunches(); }, 30000);

  /* ======================================================== FILE LOAD */

  $('orb-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const note = $('orb-src-note');
    try {
      const json = JSON.parse(await f.text());
      if (Array.isArray(json.fields) && json.fields.includes('dist')) { useCad(parseCad(json), f.lastModified || Date.now(), `file ${f.name}`, 60); note.textContent = `Loaded ${f.name} as JPL close-approach data.`; }
      else if (json.data?.[0]?.ps_cum != null || /sentry/i.test(json.signature?.source ?? '')) { useSentry(json, f.lastModified || Date.now(), `file ${f.name}`); note.textContent = `Loaded ${f.name} as JPL Sentry data.`; }
      else if (json.orbit) { const el2 = parseSbdb(json); if (el2) { const des = String(json.object?.des ?? el2.name); S.orbits.set(des, { el: el2, via: `file ${f.name}`, short: des }); select(des); note.textContent = `Loaded the orbit of ${el2.name}.`; } }
      else throw new Error('not a Sentry, close-approach or SBDB file');
    } catch (error) { note.textContent = `${f.name}: ${error.message}.`; }
    e.target.value = '';
  });

  /* ============================================================ START */

  let started = false;
  const start = () => {
    if (deck.dataset.open !== 'true' || started) return;
    started = true;
    init3d(); initEarth();
    setBadge('orb-prov', 'MODEL', 'Planets · JPL elements');
    loadSentry(); loadCad(); loadSats(); loadLaunches();
  };
  new MutationObserver(start).observe(deck, { attributes: true, attributeFilter: ['data-open'] });
  start();
}
