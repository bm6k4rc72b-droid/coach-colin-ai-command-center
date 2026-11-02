/**
 * The Site deck: scan any building or ranch yard from open data, rebuild it in
 * 3D, and analyse it — sunlight and shadow, occupants and evacuation, people
 * flow to the assembly point, and energy.
 *
 * Loaded lazily by app.js. Every reading carries its provenance: footprints
 * linked from OpenStreetMap or your file, heights flagged when they are an
 * assumption, and every analysis badged Modelled.
 *
 * @module black-optic-6/site/site-ui
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  bounds, fromGeoJSON, fromLocal, fromOverpass, fromTwin, metresPerDegLat, metresPerDegLon, metrics, OVERPASS, overpassQuery,
} from './buildings.js';
import { roofSunHours, sunAt, sunHoursGrid, sunTimes, clearSkyYearKWh } from './sun.js';
import { autoExits, evacuation, LOAD_FACTORS, maxTravel, occupancyFor, occupantLoad } from './egress.js';
import { distanceField, distanceFrom, obstacles, route, WALK_MPS } from './flow.js';
import { annualLoads, archiveUrl, heatLossCoefficient, pvPotential, readArchive, U_DEFAULTS } from './energy.js';
import { sampleLayout, TYPES } from '../ranch-sim.js';
import { turbo } from '../../../vision-kit/pointcloud.js';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }) : '—');
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : '—');
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or private */ } },
};

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

/**
 * @param {object} bridge state, readout, setBadge, logEvent, ranchPlace
 */
export function mountSiteScanner(bridge) {
  const { readout, setBadge, logEvent } = bridge;
  const deck = $('deck-site');
  const place = bridge.ranchPlace();
  const today = new Date();
  const S = {
    origin: store.get('bo6.site.origin', { lat: place.lat, lon: place.lon }),
    buildings: [], source: 'none', selected: null, assembly: null,
    when: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 15, 0),
    overlay: 'none', climate: store.get('bo6.site.climate', null), sunGrid: null, flow: null, picking: null,
  };

  deck.innerHTML = `
    <div class="grid wide">
      <div class="panel">
        <div class="panel-head"><h2>Site scan · 3D</h2><span class="spacer"></span><span class="prov" id="site-prov" data-tone="muted">Nothing scanned</span></div>
        <p class="note">Scan any building on Earth from open map data, rebuild it in 3D, and see what the sun, the people and the weather do to it. Footprints come from OpenStreetMap (or your own file, or this ranch's twin); heights come from the map where mappers measured them and are flagged where they are assumed.</p>
        <div class="controls" style="margin-top:11px">
          <label class="field" style="flex:1 1 220px"><span>Find a place</span><input id="site-q" type="text" placeholder="address, town or landmark" /></label>
          <button class="ghost" id="site-find" type="button" style="align-self:flex-end">Find</button>
        </div>
        <div class="controls" style="margin-top:9px">
          <label class="field" style="flex:0 1 120px"><span>Latitude</span><input id="site-lat" type="number" step="0.0001" /></label>
          <label class="field" style="flex:0 1 120px"><span>Longitude</span><input id="site-lon" type="number" step="0.0001" /></label>
          <label class="field" style="flex:0 1 110px"><span>Radius (m)</span><input id="site-r" type="number" min="50" max="600" step="25" value="200" /></label>
        </div>
        <div class="controls" style="margin-top:9px">
          <button class="act" id="site-scan" type="button">Scan from OpenStreetMap</button>
          <button class="ghost" id="site-twin" type="button">Use the ranch twin</button>
          <label class="ghost file-btn">Import GeoJSON<input id="site-file" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden /></label>
        </div>
        <div class="twin-view" id="site-view" style="margin-top:11px"><canvas id="site-canvas"></canvas></div>
        <div id="site-legend" hidden style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:10px;color:var(--ink-faint)"><span id="site-leg-lo"></span><span style="flex:1;height:6px;background:linear-gradient(90deg,#30123b,#4686fb,#1ae4b6,#a2fc3c,#fabb39,#e4460a,#7a0403)"></span><span id="site-leg-hi"></span></div>
        <div class="controls" style="margin-top:10px">
          <label class="field" style="flex:0 1 150px"><span>Date</span><input id="site-date" type="date" /></label>
          <label class="field" style="flex:1 1 220px"><span>Time · <b id="site-time-v"></b></span><input id="site-time" type="range" min="0" max="1439" step="5" /></label>
        </div>
        <div class="controls" style="margin-top:8px">
          <div class="tally seg" id="site-overlay"><button type="button" data-v="none" aria-pressed="true">Plain</button><button type="button" data-v="sun" aria-pressed="false">Sun-hours today</button><button type="button" data-v="evac" aria-pressed="false">Walk to assembly</button></div>
          <button class="ghost" id="site-assembly" type="button">Set assembly point</button>
        </div>
        <p class="note" id="site-note" style="margin-top:9px">Drag to orbit, pinch or wheel to zoom, tap a building to analyse it.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Selected building</h2><span class="spacer"></span><span class="prov" id="site-sel-prov" data-tone="muted">None</span></div>
        <div id="site-sel"><p class="empty">Tap a building in the 3D view.</p></div>
      </div>
    </div>
    <div class="grid">
      <div class="panel">
        <div class="panel-head"><h2>Sun and shadow</h2><span class="spacer"></span><span class="prov" data-tone="caution">Modelled</span></div>
        <div class="readouts" id="site-sun"></div>
        <p class="note" style="margin-top:10px">Sun position by NOAA's algorithm, within a hundredth of a degree of NREL's reference, with refraction. Shadows in the 3D view are drawn by the GPU; the sun-hours are exact ray geometry against every building, every 15 minutes from sunrise to sunset. Trees and terrain are not in the model.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Evacuation and people flow</h2><span class="spacer"></span><span class="prov" data-tone="caution">Modelled</span></div>
        <div class="readouts" id="site-evac-sum"></div>
        <ul class="rows" id="site-evac" style="margin-top:11px"><li class="empty">Scan a site first.</li></ul>
        <p class="note" style="margin-top:10px">Occupants by IBC 2021 load factors; time out by the SFPE hydraulic model (pre-movement + travel + queueing at the narrowest doors or stairs); then the walk to the assembly point around the buildings at ${WALK_MPS} m/s. Doors are assumed at the middle of the two longest walls unless you change the count. A design-stage estimate: no smoke, no blocked doors, everyone mobile.</p>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Climate and energy</h2><span class="spacer"></span><span class="prov" id="site-clim-prov" data-tone="muted">No climate</span></div>
        <div class="controls"><button class="act" id="site-climate" type="button">Fetch last year's weather</button></div>
        <div class="readouts" id="site-clim" style="margin-top:11px"></div>
        <p class="note" id="site-clim-note" style="margin-top:10px">Daily temperature and sunshine for the whole of last year from Open-Meteo's archive. Without it the console uses the clear-sky ceiling, and says so.</p>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Data and sources</h2><span class="spacer"></span><span class="prov" data-tone="primary">Open data</span></div>
      <ul class="rows" id="site-sources"></ul>
    </div>`;

  /* ------------------------------------------------------------ inputs */

  $('site-lat').value = S.origin.lat.toFixed(5); $('site-lon').value = S.origin.lon.toFixed(5);
  const pad = (n) => String(n).padStart(2, '0');
  /**
   * The clock the time slider speaks. This device's zone when the site is
   * within two hours of it; otherwise the site's own mean solar time
   * (UTC + longitude/15 h), because a device in London looking at Napa should
   * not see Napa's noon sun at 8 pm. Both are said on the panel.
   */
  function siteClock() {
    const deviceMin = -new Date().getTimezoneOffset();
    const solarMin = Math.round((S.origin.lon / 15) * 60);
    return Math.abs(deviceMin - solarMin) <= 120
      ? { offsetMin: deviceMin, label: 'this device\u2019s time zone' }
      : { offsetMin: solarMin, label: `the site\u2019s solar time (UTC${solarMin >= 0 ? '+' : '\u2212'}${pad(Math.floor(Math.abs(solarMin) / 60))}:${pad(Math.abs(solarMin) % 60)})` };
  }
  /** Wall-clock text of an instant on the site clock. */
  const clockText = (d) => (d instanceof Date && !Number.isNaN(+d) ? new Date(+d + siteClock().offsetMin * 60000).toISOString().slice(11, 16) : '\u2014');
  {
    const local = new Date(Date.now() + siteClock().offsetMin * 60000);
    $('site-date').value = local.toISOString().slice(0, 10);
    $('site-time').value = String(15 * 60);
  }
  const readWhen = () => {
    const [y, m, d] = $('site-date').value.split('-').map(Number);
    const mins = Number($('site-time').value);
    S.when = new Date(Date.UTC(y, (m || 1) - 1, d || 1, Math.floor(mins / 60), mins % 60) - siteClock().offsetMin * 60000);
    $('site-time-v').textContent = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)} · ${siteClock().label}`;
  };
  readWhen();

  $('site-sources').replaceChildren(
    row('OpenStreetMap', 'Building footprints, names, heights and levels, through the Overpass API. © OpenStreetMap contributors, ODbL 1.0 — openstreetmap.org/copyright.', 'primary', 'footprints'),
    row('Nominatim', 'Place search, from OpenStreetMap data. One request per search, as its usage policy asks.', 'primary', 'search'),
    row('Microsoft Global ML Building Footprints', 'Import its GeoJSON (with model-estimated heights) for places OpenStreetMap has not mapped — github.com/microsoft/GlobalMLBuildingFootprints, ODbL.', 'primary', 'import'),
    row('Open-Meteo', 'Last year\'s daily temperature and solar radiation (historical archive, ERA5-based). Weather data by Open-Meteo.com, CC BY 4.0.', 'primary', 'climate'),
    row('NOAA solar position · SunCalc', 'Sun position by NOAA\'s algorithm (Meeus); sunrise and sunset by SunCalc (mourner/suncalc, BSD-2).', 'primary', 'sun'),
    row('three.js', 'The 3D rebuild: footprints extruded to their heights, real-time sun shadows (mrdoob/three.js, MIT; polygon triangulation by its bundled earcut).', 'primary', '3D'),
    row('Not available', 'Official land-parcel (cadastre) boundaries have no worldwide open source; they are not shown rather than guessed.', 'muted', 'cadastre'),
  );

  /* ---------------------------------------------------------------- 3D */

  const canvas = $('site-canvas');
  const view = $('site-view');
  let renderer = null; let scene; let camera; let controls; let sunLight; let hemi; let ground; let groundTex; let group; let markers;
  const meshes = new Map();

  function init3d() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 2, 0.5, 5000);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3326, 0.6);
    scene.add(hemi);
    sunLight = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight, sunLight.target);
    group = new THREE.Group(); markers = new THREE.Group();
    scene.add(group, markers);
    canvas.addEventListener('pointerdown', onPick);
    const loop = () => {
      requestAnimationFrame(loop);
      if (deck.dataset.open !== 'true') return;
      const w = view.clientWidth; const h = view.clientHeight;
      if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
  }

  const toThree = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

  function rebuild3d() {
    init3d();
    for (const m of meshes.values()) { m.geometry.dispose(); m.material.dispose(); }
    meshes.clear();
    group.clear();
    const box = bounds(S.buildings, 25);
    const w = box.x1 - box.x0; const h = box.y1 - box.y0;
    if (ground) { ground.geometry.dispose(); scene.remove(ground); }
    ground = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(toThree((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
    ground.receiveShadow = true;
    ground.userData.ground = true;
    scene.add(ground);
    for (const b of S.buildings) {
      const shape = new THREE.Shape(b.outer.map(([x, y]) => new THREE.Vector2(x, y)));
      for (const hole of b.holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
      const depth = Math.max(0.3, b.heightM - b.minHeightM);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, b.minHeightM, 0);
      const assumed = b.source === 'type default';
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: assumed ? 0x9aa6b8 : 0xd9dee8, roughness: 0.85, metalness: 0.05 }));
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.id = b.id;
      group.add(mesh);
      meshes.set(b.id, mesh);
    }
    const span = Math.max(w, h);
    camera.position.copy(toThree((box.x0 + box.x1) / 2 - span * 0.35, (box.y0 + box.y1) / 2 - span * 0.75, span * 0.55));
    controls.target.copy(toThree((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
    const sc = sunLight.shadow.camera;
    sc.left = -span * 0.8; sc.right = span * 0.8; sc.top = span * 0.8; sc.bottom = -span * 0.8; sc.near = 1; sc.far = span * 4;
    sc.updateProjectionMatrix();
    S.box = box;
    updateSun();
    paintOverlay();
  }

  function updateSun() {
    if (!renderer) return;
    const s = sunAt(S.when, S.origin.lat, S.origin.lon);
    const c = controls.target;
    const span = S.box ? Math.max(S.box.x1 - S.box.x0, S.box.y1 - S.box.y0) : 200;
    const up = Math.max(s.dir[2], 0);
    sunLight.position.set(c.x + s.dir[0] * span * 1.5, c.y + Math.max(0.05, s.dir[2]) * span * 1.5, c.z - s.dir[1] * span * 1.5);
    sunLight.target.position.copy(c);
    sunLight.intensity = s.altitudeDeg > 0 ? 0.6 + 2.2 * Math.min(1, up * 2) : 0;
    hemi.intensity = s.altitudeDeg > -6 ? 0.25 + 0.45 * Math.min(1, Math.max(0, (s.altitudeDeg + 6) / 30)) : 0.12;
    const day = Math.min(1, Math.max(0, (s.altitudeDeg + 4) / 20));
    scene.background = new THREE.Color().setRGB(0.02 + 0.33 * day, 0.03 + 0.48 * day, 0.07 + 0.66 * day);
    renderSunPanel(s);
  }

  /** Paint the overlay grid onto the ground as a texture. */
  function paintOverlay() {
    if (!ground) return;
    let grid = null; let values = null; let max = 1;
    if (S.overlay === 'sun') {
      if (!S.sunGrid) return computeSunGrid();
      grid = S.sunGrid; values = S.sunGrid.hours; max = S.sunGrid.dayHours || 1;
    } else if (S.overlay === 'evac') {
      if (!S.flow) computeFlow();
      if (S.flow) {
        grid = S.flow.grid; values = S.flow.field.dist.map((d) => d / WALK_MPS);
        max = Math.max(1, ...Array.from(values).filter(Number.isFinite));
      }
    }
    if (groundTex) { groundTex.dispose(); groundTex = null; }
    const legend = $('site-legend');
    legend.hidden = !grid;
    legend.style.display = grid ? 'flex' : 'none';
    if (grid) {
      $('site-leg-lo').textContent = S.overlay === 'sun' ? '0 h of sun' : 'at the assembly point';
      $('site-leg-hi').textContent = S.overlay === 'sun' ? `${max.toFixed(1)} h (all day)` : `${Math.round(max / 60)} min ${Math.round(max % 60)} s walk`;
    }
    if (!grid) { ground.material.map = null; ground.material.color.set(0x4a5a3a); ground.material.needsUpdate = true; drawMarkers(); return; }
    const c = document.createElement('canvas'); c.width = grid.cols; c.height = grid.rows;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(grid.cols, grid.rows);
    for (let r = 0; r < grid.rows; r += 1) for (let col = 0; col < grid.cols; col += 1) {
      const v = values[r * grid.cols + col];
      const y = grid.rows - 1 - r; // canvas top = north
      const t = Number.isFinite(v) ? v / max : NaN;
      const rgb = Number.isFinite(t) ? turbo(t) : [0.15, 0.15, 0.17];
      img.data.set([rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, 255], (y * grid.cols + col) * 4);
    }
    ctx.putImageData(img, 0, 0);
    groundTex = new THREE.CanvasTexture(c);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.magFilter = THREE.NearestFilter;
    // Fit the texture to the grid's extent on the ground plane.
    const gw = grid.cols * grid.cell; const gh = grid.rows * grid.cell;
    ground.geometry.dispose();
    ground.geometry = new THREE.PlaneGeometry(gw, gh);
    ground.position.copy(toThree(grid.x0 + gw / 2, grid.y0 + gh / 2));
    ground.material.map = groundTex; ground.material.color.set(0xffffff); ground.material.needsUpdate = true;
    drawMarkers();
  }

  function drawMarkers() {
    markers.clear();
    if (S.assembly) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0x3dff8a }));
      m.position.copy(toThree(S.assembly[0], S.assembly[1], 0.2));
      markers.add(m);
    }
    const b = S.buildings.find((x) => x.id === S.selected);
    if (b && S.flow) {
      const exits = autoExits(b.outer, b.exitsN ?? 2);
      const path = route(S.flow.grid, S.flow.field, exits.reduce((best, e) => (distanceFrom(S.flow.grid, S.flow.field, e) < distanceFrom(S.flow.grid, S.flow.field, best) ? e : best), exits[0]));
      if (path.length > 1) {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(([x, y]) => toThree(x, y, 0.6))), new THREE.LineBasicMaterial({ color: 0x3dff8a }));
        markers.add(line);
      }
      for (const e of exits) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 1.2), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        d.position.copy(toThree(e[0], e[1], 1.05));
        markers.add(d);
      }
    }
  }

  const ray = new THREE.Raycaster();
  function onPick(ev) {
    const rect = canvas.getBoundingClientRect();
    const p = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(p, camera);
    const start = { x: ev.clientX, y: ev.clientY };
    canvas.addEventListener('pointerup', (up) => {
      if (Math.hypot(up.clientX - start.x, up.clientY - start.y) > 6) return; // that was a drag
      if (S.picking === 'assembly') {
        const hit = ray.intersectObject(ground)[0];
        if (!hit) return;
        S.assembly = [hit.point.x, -hit.point.z];
        S.picking = null; $('site-assembly').setAttribute('aria-pressed', 'false');
        S.flow = null;
        computeFlow(); renderEvac(); paintOverlay(); renderSelected();
        return;
      }
      const hit = ray.intersectObjects(group.children)[0];
      select(hit ? hit.object.userData.id : null);
    }, { once: true });
  }

  function select(id) {
    if (S.selected && meshes.get(S.selected)) meshes.get(S.selected).material.emissive.set(0x000000);
    S.selected = id;
    if (id && meshes.get(id)) meshes.get(id).material.emissive.set(0x123a5c);
    renderSelected();
    drawMarkers();
  }

  /* ---------------------------------------------------------- analysis */

  function computeSunGrid() {
    if (!S.buildings.length) return;
    $('site-note').textContent = 'Tracing the sun across the site…';
    setTimeout(() => {
      const box = S.box;
      const area = (box.x1 - box.x0) * (box.y1 - box.y0);
      const cell = Math.max(1, Math.sqrt(area / 5000));
      const t0 = performance.now();
      S.sunGrid = sunHoursGrid(S.buildings, box, cell, S.when, S.origin.lat, S.origin.lon, 15);
      const open = Array.from(S.sunGrid.hours).filter(Number.isFinite);
      const shaded = open.filter((h) => h < S.sunGrid.dayHours * 0.5).length;
      $('site-note').textContent = `Sun-hours for ${$('site-date').value}: ${S.sunGrid.cols}×${S.sunGrid.rows} points of ${cell.toFixed(1)} m in ${(performance.now() - t0).toFixed(0)} ms. ${(100 * shaded / (open.length || 1)).toFixed(0)}% of open ground gets under half the day's ${S.sunGrid.dayHours.toFixed(1)} h of sun.`;
      paintOverlay();
    }, 30);
  }

  function computeFlow() {
    if (!S.buildings.length) return;
    const box = S.box;
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    const cell = Math.max(1, Math.sqrt(area / 12000));
    const grid = obstacles(S.buildings, box, cell);
    if (!S.assembly) S.assembly = [box.x0 + 8, box.y0 + 8];
    S.flow = { grid, field: distanceField(grid, S.assembly) };
  }

  function buildingReport(b) {
    const m = metrics(b);
    const occ = b.occupancy ?? occupancyFor(b.kind);
    const exitsN = b.exitsN ?? 2;
    const doorM = b.doorM ?? 0.91;
    const people = b.people ?? occupantLoad(m.grossFloorM2, occ);
    const exits = autoExits(b.outer, exitsN);
    const ev = evacuation({ occupants: people, exits: exitsN, doorClearM: doorM, travelM: maxTravel(b.outer, exits), floors: m.floors, stairs: 1 });
    const walkM = S.flow ? Math.min(...exits.map((e) => distanceFrom(S.flow.grid, S.flow.field, e))) : NaN;
    return { m, occ, people, exitsN, doorM, ev, walkM, walkS: walkM / WALK_MPS, totalS: ev.totalS + walkM / WALK_MPS };
  }

  function renderSelected() {
    const host = $('site-sel');
    const b = S.buildings.find((x) => x.id === S.selected);
    if (!b) { host.innerHTML = '<p class="empty">Tap a building in the 3D view.</p>'; setBadge('site-sel-prov', 'BLOCKED', 'None'); return; }
    const r = buildingReport(b);
    const roofH = roofSunHours(b, r.m.centroid, S.buildings, S.when, S.origin.lat, S.origin.lon, 15);
    const irr = S.climate?.irradiationKWhM2 ?? clearSkyCached() * 0.75;
    const pv = pvPotential({ roofM2: r.m.footprintM2, irradiationKWhM2: irr });
    const ua = heatLossCoefficient({ wallM2: r.m.wallM2, roofM2: r.m.footprintM2, floorM2: r.m.footprintM2, volumeM3: r.m.volumeM3 });
    const loads = S.climate ? annualLoads(ua.ua, S.climate.hdd, S.climate.cdd) : null;
    setBadge('site-sel-prov', b.origin === 'osm' ? 'LINK' : 'MODEL', b.origin === 'osm' ? 'OpenStreetMap' : b.origin === 'twin' ? 'Twin layout' : 'Your file');
    host.innerHTML = '';
    const title = el('<p class="note good" style="margin-bottom:9px"></p>');
    title.textContent = `${b.name || b.kind.replace(/_/g, ' ')} · ${b.id}`;
    const shape = el('<div class="readouts"></div>');
    shape.append(
      readout('Footprint', `${fmt(r.m.footprintM2)} m²`, { note: `${fmt(r.m.footprintM2 * 10.7639)} ft² · perimeter ${fmt(r.m.perimeterM, 1)} m` }),
      readout('Height', `${fmt(b.heightM, 1)} m`, { tone: b.source === 'type default' ? 'caution' : 'confirm', note: b.source === 'type default' ? `Assumed for "${b.kind}" — nobody mapped it.` : `From the ${b.source}.` }),
      readout('Floors', String(r.m.floors), { note: `${fmt(r.m.grossFloorM2)} m² gross floor area` }),
      readout('Volume', `${fmt(r.m.volumeM3)} m³`, { note: `${fmt(r.m.wallM2)} m² of wall` }),
    );
    const controls = el(`<div class="controls" style="margin-top:10px">
        <label class="field" style="flex:1 1 170px"><span>Use</span><select id="site-occ">${Object.entries(LOAD_FACTORS).map(([k, v]) => `<option value="${k}" ${k === r.occ ? 'selected' : ''}>${v.label}${v.ft2 ? ` · ${v.ft2} ft²/person` : ''}</option>`).join('')}</select></label>
        <label class="field" style="flex:0 1 90px"><span>People</span><input id="site-people" type="number" min="0" value="${r.people}" /></label>
        <label class="field" style="flex:0 1 80px"><span>Doors</span><input id="site-exits" type="number" min="1" max="8" value="${r.exitsN}" /></label>
        <label class="field" style="flex:0 1 100px"><span>Door width (m)</span><input id="site-door" type="number" min="0.6" step="0.05" value="${r.doorM}" /></label>
      </div>`);
    const evac = el('<div class="readouts" style="margin-top:10px"></div>');
    evac.append(
      readout('Out of the building', mmss(r.ev.totalS), { tone: r.ev.totalS > 180 ? 'caution' : 'confirm', note: `pre-move ${mmss(r.ev.preS)} · walk ${mmss(r.ev.travelS)} · queue ${mmss(r.ev.queueS)} at the ${r.ev.controlling}` }),
      readout('To assembly', mmss(r.walkS), { note: Number.isFinite(r.walkM) ? `${fmt(r.walkM)} m around the buildings` : 'Set an assembly point.' }),
      readout('Total', mmss(r.totalS), { tone: r.totalS > 300 ? 'alert' : 'primary', note: `${r.people} people, ${r.exitsN} × ${r.doorM} m doors` }),
    );
    const energy = el('<div class="readouts" style="margin-top:10px"></div>');
    energy.append(
      readout('Roof sun today', `${fmt(roofH, 1)} h`, { note: 'Direct sun at the roof centre; neighbours can shade it.' }),
      readout('Rooftop solar', `${fmt(pv.kWp, 1)} kWp`, { tone: 'confirm', note: `≈ ${fmt(pv.kWhYear)} kWh/yr on ${fmt(pv.usableM2)} m² usable${S.climate ? '' : ' (clear-sky × 0.75 — fetch the weather for last year\'s real sun)'}` }),
      readout('Heat loss', `${fmt(ua.ua)} W/K`, { note: loads ? `≈ ${fmt(loads.heatKWh)} kWh heating, ${fmt(loads.coolKWh)} kWh cooling a year (thermal)` : `U wall ${U_DEFAULTS.wall}, roof ${U_DEFAULTS.roof}, floor ${U_DEFAULTS.floor} W/m²K, ${U_DEFAULTS.ach} air changes/h` }),
    );
    host.append(title, shape, controls, evac, energy);
    const update = () => {
      b.occupancy = $('site-occ').value;
      b.exitsN = Math.max(1, Number($('site-exits').value) || 1);
      b.doorM = Math.max(0.6, Number($('site-door').value) || 0.91);
      renderSelected(); renderEvac(); drawMarkers();
    };
    // Changing the use resets the head count to that use's code load; typing a count overrides it.
    $('site-occ').addEventListener('change', () => { b.people = undefined; update(); });
    $('site-people').addEventListener('change', () => {
      const n = Number($('site-people').value);
      b.people = Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
      update();
    });
    for (const id of ['site-exits', 'site-door']) $(id).addEventListener('change', update);
  }

  function renderEvac() {
    const list = $('site-evac');
    if (!S.buildings.length) return;
    if (!S.flow) computeFlow();
    const reports = S.buildings.map((b) => ({ b, r: buildingReport(b) })).filter(({ r }) => r.people > 0);
    reports.sort((a, c) => c.r.totalS - a.r.totalS);
    const people = reports.reduce((s, { r }) => s + r.people, 0);
    $('site-evac-sum').replaceChildren(
      readout('People on site', fmt(people), { note: 'At code occupant load — the most a building is designed for.' }),
      readout('Slowest', reports[0] ? mmss(reports[0].r.totalS) : '—', { tone: 'caution', note: reports[0] ? `${reports[0].b.name || reports[0].b.kind}` : '' }),
      readout('Assembly', S.assembly ? `${fmt(S.assembly[0])}, ${fmt(S.assembly[1])} m` : '—', { note: 'East, north of the site origin. Tap "Set assembly point".' }),
    );
    list.replaceChildren(...reports.slice(0, 12).map(({ b, r }) => {
      const li = row(`${b.name || b.kind.replace(/_/g, ' ')} · ${mmss(r.totalS)}`, `${r.people} people (${LOAD_FACTORS[r.occ].label.toLowerCase()}), out in ${mmss(r.ev.totalS)}, then ${fmt(r.walkM)} m to assembly.`, r.totalS > 300 ? 'alert' : 'primary', `${fmt(r.m.grossFloorM2)} m²`);
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => select(b.id));
      return li;
    }));
  }

  let clearSkyMemo = null;
  function clearSkyCached() {
    const key = `${S.origin.lat.toFixed(2)},${S.origin.lon.toFixed(2)}`;
    if (clearSkyMemo?.key !== key) clearSkyMemo = { key, v: clearSkyYearKWh(S.origin.lat, S.origin.lon, new Date().getFullYear() - 1, 60) };
    return clearSkyMemo.v;
  }

  function renderSunPanel(s) {
    const t = sunTimes(S.when, S.origin.lat, S.origin.lon);
    const noon = sunAt(t.solarNoon, S.origin.lat, S.origin.lon);
    const hm = clockText;
    const shadowLen = s.altitudeDeg > 0 ? 1 / Math.tan(s.altitudeDeg * Math.PI / 180) : Infinity;
    $('site-sun').replaceChildren(
      readout('Sun now', s.altitudeDeg > 0 ? `${fmt(s.altitudeDeg, 1)}° up` : 'below horizon', { tone: s.altitudeDeg > 0 ? 'confirm' : 'muted', note: `azimuth ${fmt(s.azimuthDeg, 1)}° from north` }),
      readout('Shadows', Number.isFinite(shadowLen) ? `${fmt(shadowLen, 2)} × height` : '—', { note: 'A 3 m wall throws a shadow this many times longer.' }),
      readout('Daylight', `${fmt(t.dayLengthH, 2)} h`, { note: `sunrise ${hm(t.sunrise)} · noon ${hm(t.solarNoon)} · sunset ${hm(t.sunset)}` }),
      readout('Noon sun', `${fmt(noon.altitudeDeg, 1)}°`, { note: `declination ${fmt(noon.declinationDeg, 2)}°, equation of time ${fmt(noon.equationOfTimeMin, 1)} min` }),
    );
  }

  /* -------------------------------------------------------- data in */

  function load(buildings, source, provId, provLabel) {
    readWhen();
    S.buildings = buildings; S.source = source; S.selected = null; S.sunGrid = null; S.flow = null; S.assembly = null;
    setBadge('site-prov', provId, provLabel);
    rebuild3d();
    renderEvac();
    renderSelected();
    const assumed = buildings.filter((b) => b.source === 'type default').length;
    $('site-note').textContent = `${buildings.length} building${buildings.length === 1 ? '' : 's'} rebuilt. ${assumed ? `${assumed} have no mapped height and use an assumed one (shown in grey).` : 'Every height came from the data.'} Tap one to analyse it.`;
    logEvent('Site scanned', `${buildings.length} buildings from ${source}.`, 'confirm');
  }

  async function scanOsm() {
    const lat = Number($('site-lat').value); const lon = Number($('site-lon').value);
    const r = Math.min(600, Math.max(50, Number($('site-r').value) || 200));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) { $('site-note').textContent = 'Type a position or find a place first.'; return; }
    S.origin = { lat, lon }; store.set('bo6.site.origin', S.origin);
    const dLat = r / metresPerDegLat(lat); const dLon = r / metresPerDegLon(lat);
    const q = overpassQuery([lat - dLat, lon - dLon, lat + dLat, lon + dLon]);
    setBadge('site-prov', 'MODEL', 'Scanning');
    $('site-note').textContent = 'Asking OpenStreetMap for every building in range…';
    let lastError = null;
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
        const buildings = fromOverpass(await res.json(), S.origin);
        if (!buildings.length) { setBadge('site-prov', 'BLOCKED', 'No buildings mapped'); $('site-note').textContent = `OpenStreetMap has no buildings mapped within ${r} m here. Try the ranch twin, or import Microsoft's footprints for this area.`; return; }
        load(buildings.slice(0, 600), 'OpenStreetMap', 'LINK', `OpenStreetMap · ${buildings.length}`);
        return;
      } catch (error) { lastError = error; }
    }
    setBadge('site-prov', 'BLOCKED', 'Unreachable');
    $('site-note').textContent = `OpenStreetMap's Overpass servers did not answer (${lastError?.message}). Nothing is shown rather than a stale or made-up site.`;
  }

  async function findPlace() {
    const q = $('site-q').value.trim();
    if (!q) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      const hit = (await res.json())[0];
      if (!hit) { $('site-note').textContent = `Nothing found for "${q}".`; return; }
      $('site-lat').value = Number(hit.lat).toFixed(5); $('site-lon').value = Number(hit.lon).toFixed(5);
      $('site-note').textContent = `${hit.display_name}. Press "Scan from OpenStreetMap".`;
    } catch (error) { $('site-note').textContent = `Place search failed: ${error.message}.`; }
  }

  function useTwin() {
    let layout;
    try { layout = JSON.parse(localStorage.getItem('bo6.twin.layout.v1')); } catch { layout = null; }
    const own = Boolean(layout?.objects);
    const buildings = fromTwin(own ? layout : sampleLayout(), TYPES);
    S.origin = bridge.ranchPlace();
    load(buildings, own ? 'your twin layout' : 'the sample twin', 'MODEL', own ? 'Your twin layout' : 'Sample twin');
    $('site-note').textContent += ' The twin is a layout, not a survey: north is assumed to be up the twin.';
  }

  async function importFile(file) {
    try {
      const json = JSON.parse(await file.text());
      S.origin = { lat: Number($('site-lat').value), lon: Number($('site-lon').value) };
      const first = json.features?.[0]?.geometry?.coordinates;
      const pt = first ? (json.features[0].geometry.type === 'MultiPolygon' ? first[0][0][0] : first[0][0]) : null;
      if (pt && (!Number.isFinite(S.origin.lat) || Math.abs(pt[1] - S.origin.lat) > 0.05)) S.origin = { lat: pt[1], lon: pt[0] };
      const buildings = fromGeoJSON(json, S.origin);
      if (!buildings.length) throw new Error('no polygons in that file');
      load(buildings.slice(0, 800), file.name, 'LINK', `File · ${buildings.length}`);
    } catch (error) { $('site-note').textContent = `Could not read ${file.name}: ${error.message}.`; }
  }

  async function fetchClimate() {
    const year = new Date().getFullYear() - 1;
    setBadge('site-clim-prov', 'MODEL', 'Fetching');
    try {
      const res = await fetch(archiveUrl(S.origin.lat, S.origin.lon, year));
      if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
      S.climate = { ...readArchive(await res.json()), year, lat: S.origin.lat, lon: S.origin.lon };
      store.set('bo6.site.climate', S.climate);
      setBadge('site-clim-prov', 'LINK', `Open-Meteo · ${year}`);
    } catch (error) {
      setBadge('site-clim-prov', 'BLOCKED', 'Unreachable');
      $('site-clim-note').textContent = `${error.message}. Using the clear-sky ceiling × 0.75 instead${S.climate ? ` (or the cached ${S.climate.year} year)` : ''}.`;
    }
    renderClimate(); renderSelected();
  }

  function renderClimate() {
    const cs = clearSkyCached();
    const c = S.climate;
    const totalRoof = S.buildings.reduce((s, b) => s + metrics(b).footprintM2, 0);
    const pv = pvPotential({ roofM2: totalRoof, irradiationKWhM2: c?.irradiationKWhM2 ?? cs * 0.75 });
    $('site-clim').replaceChildren(
      readout('Sun on the ground', c ? `${fmt(c.irradiationKWhM2)} kWh/m²` : `≤ ${fmt(cs)} kWh/m²`, { tone: c ? 'confirm' : 'caution', note: c ? `${c.year}, measured-weather reanalysis (${fmt(c.irradiationKWhM2 / 365, 2)} peak-sun-hours a day)` : 'Clear-sky ceiling — real years are cloudier.' }),
      readout('Heating degree days', c ? fmt(c.hdd) : '—', { note: c ? `base 18 °C · cooling ${fmt(c.cdd)} · mean ${fmt(c.meanTempC, 1)} °C` : '' }),
      readout('Whole-site rooftop solar', `${fmt(pv.kWp)} kWp`, { tone: 'confirm', note: `≈ ${fmt(pv.kWhYear)} kWh a year on ${fmt(totalRoof)} m² of roof at 70 % usable, PR 0.8` }),
    );
  }

  /* ----------------------------------------------------------- wiring */

  $('site-scan').addEventListener('click', scanOsm);
  $('site-find').addEventListener('click', findPlace);
  $('site-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') findPlace(); });
  $('site-twin').addEventListener('click', useTwin);
  $('site-file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) importFile(f); });
  $('site-climate').addEventListener('click', fetchClimate);
  const timeChanged = () => { readWhen(); updateSun(); };
  $('site-time').addEventListener('input', timeChanged);
  $('site-date').addEventListener('change', () => { readWhen(); S.sunGrid = null; updateSun(); if (S.overlay === 'sun') paintOverlay(); renderSelected(); });
  $('site-time').addEventListener('change', () => renderSelected());
  for (const b of $('site-overlay').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      for (const o of $('site-overlay').querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
      S.overlay = b.dataset.v;
      paintOverlay();
    });
  }
  $('site-assembly').addEventListener('click', () => {
    S.picking = S.picking === 'assembly' ? null : 'assembly';
    $('site-assembly').setAttribute('aria-pressed', String(S.picking === 'assembly'));
    $('site-note').textContent = S.picking ? 'Tap open ground in the 3D view to put the assembly point there.' : '';
  });

  // Build the 3D view the first time the deck opens; until then, nothing runs.
  const start = () => { if (deck.dataset.open === 'true' && !renderer) { init3d(); useTwin(); renderClimate(); } };
  new MutationObserver(start).observe(deck, { attributes: true, attributeFilter: ['data-open'] });
  start();

  return { get buildings() { return S.buildings; } };
}
