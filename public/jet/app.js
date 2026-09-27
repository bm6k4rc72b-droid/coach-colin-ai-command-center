import * as THREE from 'three';
import { AIRFRAMES, ZONES, ZONE_IDS, PAINTS, ACCENTS, LEATHERS, VENEERS, METALS, CITIES } from './sim/data.js';
import { mission, haversineKm, initialBearing, cabinAltitudeFt, kelvinToRGB, NM, toVec } from './sim/math.js';
import { buildAircraft, FUSELAGE } from './sim/aircraft.js';
import { buildCabin, createCabinMaterials, CABIN } from './sim/cabin.js';
import { buildStudio, buildFlight, buildGlobe, setRoute } from './sim/scenes.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · the configurator: sections, option trays, build sheet, views.
// ─────────────────────────────────────────────────────────────────────────────

export const SECTIONS = ['airframe', 'exterior', 'cabin', 'materials', 'lighting', 'mission', 'summary'];
const SECTION_VIEW = { airframe: 'studio', exterior: 'studio', cabin: 'cabin', materials: 'walk', lighting: 'walk', mission: 'globe', summary: 'flight' };
const DEFAULT_LAYOUT = { mid: ['club', 'divan'], super: ['club', 'divan'], long: ['club', 'dining', 'suite'], ultra: ['club', 'dining', 'media', 'suite'] };
const fmt = (n, d = 0) => Number(n).toLocaleString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

export class Atelier {
  constructor(app) {
    this.app = app;
    this.cfg = { frame: 'long', paint: 'pearl', accent: 'magenta', layout: [...DEFAULT_LAYOUT.long], leather: 'ivory', veneer: 'walnut', metal: 'gold', kelvin: 3600, from: 'TEB', to: 'LBG', pax: 8 };
    this.studio = buildStudio();
    this.flight = buildFlight(app.stage.renderer);
    this.globeS = buildGlobe();
    this.cabinM = createCabinMaterials();
    this.jet = buildAircraft(app.stage.envMap);
    this.jetFlight = buildAircraft(app.stage.envMap);
    this.jetFlight.userData.gear.visible = false;
    this.flight.scene.add(this.jetFlight);
    this.studio.scene.add(this.jet);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 30000);
    this.cam = { yaw: -0.65, pitch: 0.16, r: 46, target: new THREE.Vector3(0, 2.4, 0), goal: { yaw: -0.65, pitch: 0.16, r: 46, ty: 2.4, tx: 0 }, drag: null };
    this.view = 'studio'; this.section = 'airframe';
    this.cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.95);
    this.walkT = 0;
    this.rebuildCabin();
    this.applyAll();
    this.buildCityDots();
  }

  // ── Sections & views ────────────────────────────────
  setSection(id) {
    this.section = id; sfx.select();
    document.querySelectorAll('#nav [data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === id));
    this.setView(SECTION_VIEW[id]);
    this.renderTray();
    this.app.onSection?.(id);
  }
  setView(v) {
    this.view = v;
    const scene = v === 'flight' ? this.flight.scene : v === 'globe' ? this.globeS.scene : this.studio.scene;
    this.app.stage.use(scene, this.camera);
    this.camera.fov = v === 'walk' ? 64 : 32; this.camera.far = v === 'flight' ? 30000 : 400; this.camera.near = v === 'walk' ? 0.02 : v === 'globe' ? 0.01 : 0.1; this.camera.updateProjectionMatrix();
    const G = this.cam.goal;
    if (v === 'studio') Object.assign(G, { yaw: this.cam.yaw, pitch: 0.13, r: 54 * this.scale(), ty: 2.2 * this.scale(), tx: 0 });
    if (v === 'cabin') Object.assign(G, { yaw: 0.12, pitch: 1.32, r: 12.5 * this.scale(), ty: 0.0, tx: -1.2 * this.scale() });
    if (v === 'flight') Object.assign(G, { yaw: -2.35, pitch: 0.07, r: 48 * this.scale(), ty: 1.5, tx: 0 });
    if (v === 'globe') { const yaw = this.globeYaw(); Object.assign(G, { yaw, pitch: THREE.MathUtils.clamp(this.globePitch, -0.6, 0.9), r: 4.3, ty: 0, tx: 0 }); }
    // Cutaway roof for the cabin views.
    const cut = v === 'cabin' || v === 'walk';
    for (const m of [this.jet.userData.mats.paint, this.jet.userData.mats.accent, this.jet.userData.mats.glass]) { m.clippingPlanes = cut && v === 'cabin' ? [this.cutPlane] : []; m.side = cut ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true; }
    this.cabin.visible = cut;
    this.jet.userData.windows.visible = !cut;
    this.app.stage.bloom.strength = v === 'flight' ? 0.35 : v === 'globe' ? 0.9 : 0.4;
    this.app.stage.bloom.threshold = v === 'globe' ? 0.75 : 0.92;
    this.app.stage.renderer.toneMappingExposure = v === 'flight' ? 0.55 : v === 'walk' ? 0.8 : v === 'cabin' ? 0.72 : 0.72;
    this.walkT = 0;
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  }
  scale() { return AIRFRAMES[this.cfg.frame].scale; }
  // Camera yaw that faces the route's midpoint: the normalised sum of the two unit vectors
  // (correct across the antimeridian), then yaw = λ + π/2 for this globe's axes.
  globeYaw() {
    const a = toVec(CITIES[this.cfg.from]), b = toVec(CITIES[this.cfg.to]);
    const v = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const lon = Math.atan2(-v[2], v[0]);
    this.globePitch = Math.atan2(v[1], Math.hypot(v[0], v[2])) * 0.8;
    return lon + Math.PI / 2;
  }

  // ── Apply configuration to the 3D models ─────────────
  applyAll() {
    const c = this.cfg, s = this.scale();
    for (const j of [this.jet, this.jetFlight]) {
      j.scale.setScalar(s);
      const M = j.userData.mats, P = PAINTS[c.paint];
      M.paint.color.set(P.color); M.paint.metalness = P.metal; M.paint.roughness = P.rough;
      M.paint.iridescence = P.iridescent ? 1 : 0; M.paint.iridescenceIOR = 1.6; M.paint.iridescenceThicknessRange = [180, 520];
      const acc = ACCENTS[c.accent];
      M.accent.color.set(acc || P.color); M.accent.metalness = acc ? 0.5 : P.metal;
      const k = kelvinToRGB(c.kelvin); M.window.color.setRGB(k[0], k[1] * 0.95, k[2] * 0.85);
    }
    this.jet.position.y = this.jet.userData.gearHeight * s;
    const CM = this.cabinM;
    CM.leather.color.set(LEATHERS[c.leather]); CM.veneer.color.set(VENEERS[c.veneer]); CM.metal.color.set(METALS[c.metal]);
    CM.veneer.map.needsUpdate = true;
    const k = kelvinToRGB(c.kelvin);
    CM.cove.color.setRGB(k[0], k[1], k[2]);
    for (const l of this.cabin.userData.lights) { l.color.setRGB(k[0], k[1], k[2]); l.intensity = c.kelvin < 2500 ? 0.3 : c.kelvin > 4500 ? 0.75 : 0.55; }
    this.compute();
  }
  rebuildCabin() {
    if (this.cabin) this.jet.remove(this.cabin);
    this.cabin = buildCabin(this.cabinM, this.cfg.layout);
    this.cabin.visible = this.view === 'cabin' || this.view === 'walk';
    this.jet.add(this.cabin);
  }

  // ── Numbers: weights, seats, performance, mission, price ──
  compute() {
    const c = this.cfg, ac = AIRFRAMES[c.frame];
    const zones = c.layout.map((z) => ZONES[z]);
    const seats = zones.reduce((a, z) => a + z.seats, 0) + 2;          // + 2 crew-side jump/divan seats forward
    const berths = zones.reduce((a, z) => a + z.berths, 0);
    const interiorKg = zones.reduce((a, z) => a + z.kg, 0) + 650;       // galley, lav, lining, IFE
    c.pax = Math.min(c.pax, seats);
    const payloadKg = c.pax * 102 + 3 * 90;                             // passengers with bags + 3 crew
    const from = CITIES[c.from], to = CITIES[c.to];
    const distKm = haversineKm(from, to);
    const m = mission(ac, { distKm, payloadKg, interiorKg });
    const price = ac.base + PAINTS[c.paint].price + (ACCENTS[c.accent] ? 0.12 : 0) + zones.reduce((a, z) => a + z.price, 0)
      + ({ cognac: 0.15, oxblood: 0.18, sky: 0.12 }[c.leather] || 0) + ({ ebony: 0.3, carbon: 0.25, maple: 0.1 }[c.veneer] || 0) + ({ gold: 0.2, bronze: 0.1 }[c.metal] || 0);
    this.num = { ac, seats, berths, interiorKg, payloadKg, distKm, m, price, bearing: initialBearing(from, to), cabinAlt: cabinAltitudeFt(ac.cruiseFt, ac.dpPsi) };
    setRoute(this.globeS, from, to, m.rangeMaxKm, m.feasible);
    this.updateSheet();
  }

  set(key, value) {
    const c = this.cfg;
    if (key === 'frame') { c.frame = value; c.layout = [...DEFAULT_LAYOUT[value]]; c.pax = Math.min(c.pax, AIRFRAMES[value].maxPax); this.rebuildCabin(); this.setView(this.view); }
    else if (key.startsWith('zone')) { c.layout[+key.slice(4)] = value; this.rebuildCabin(); }
    else c[key] = value;
    sfx.select();
    this.applyAll(); this.renderTray();
    if ((key === 'from' || key === 'to') && this.view === 'globe') this.setView('globe');
    if (key.startsWith('zone')) this.walkZone = +key.slice(4);
  }

  // ── Option tray ────────────────────────────────────
  renderTray() {
    const tray = document.getElementById('tray'), c = this.cfg, t = (k) => i18n.t(k);
    tray.innerHTML = '';
    tray.dataset.sec = this.section;
    const row = (title) => { const r = document.createElement('div'); r.className = 'tray-row'; if (title) { const h = document.createElement('div'); h.className = 'tray-h mono'; h.textContent = title; r.appendChild(h); } const b = document.createElement('div'); b.className = 'tray-opts'; r.appendChild(b); tray.appendChild(r); return b; };
    const card = (box, { label, sub, swatch, active, on, cls = '' }) => {
      const b = document.createElement('button'); b.className = 'opt ' + cls + (active ? ' on' : '');
      b.innerHTML = `${swatch ? `<i style="background:${swatch}"></i>` : ''}<b></b>${sub !== undefined ? '<small></small>' : ''}`;
      b.querySelector('b').textContent = label; if (sub !== undefined) b.querySelector('small').textContent = sub;
      b.onclick = on; box.appendChild(b); return b;
    };
    if (this.section === 'airframe') {
      const box = row(t('ja.tray.airframe'));
      for (const [id, ac] of Object.entries(AIRFRAMES)) {
        const m = mission(ac, { distKm: 1000, payloadKg: 4 * 102 + 270, interiorKg: ac.zones * 560 + 650 });
        card(box, { label: t('ja.frame.' + id), sub: `${fmt(m.rangeMaxKm / NM)} nm · M${ac.mach.toFixed(2)} · ${ac.cabinL.toFixed(1)} m · ${t('ja.from')} $${ac.base}M`, active: c.frame === id, on: () => this.set('frame', id), cls: 'wide' });
      }
    }
    if (this.section === 'exterior') {
      const p = row(t('ja.tray.paint'));
      for (const id of Object.keys(PAINTS)) card(p, { label: t('ja.paint.' + id), swatch: PAINTS[id].iridescent ? 'linear-gradient(120deg,#3ff3ff,#8b5cff,#ff4fd8,#ffb86b)' : PAINTS[id].color, active: c.paint === id, on: () => this.set('paint', id) });
      const a = row(t('ja.tray.accent'));
      for (const [id, col] of Object.entries(ACCENTS)) card(a, { label: t('ja.accent.' + id), swatch: col || 'repeating-linear-gradient(45deg,#333 0 4px,#111 4px 8px)', active: c.accent === id, on: () => this.set('accent', id) });
    }
    if (this.section === 'cabin') {
      c.layout.forEach((z, i) => {
        const box = row(`${t('ja.tray.zone')} ${i + 1} · ${t(i === 0 ? 'ja.fwd' : i === c.layout.length - 1 ? 'ja.aft' : 'ja.mid')}`);
        for (const id of ZONE_IDS) card(box, { label: t('ja.zone.' + id), sub: `${ZONES[id].seats}◦ ${ZONES[id].berths}▭`, swatch: ZONES[id].color, active: z === id, on: () => this.set('zone' + i, id), cls: 'chip' });
      });
    }
    if (this.section === 'materials') {
      const l = row(t('ja.tray.leather')); for (const [id, col] of Object.entries(LEATHERS)) card(l, { label: t('ja.leather.' + id), swatch: col, active: c.leather === id, on: () => this.set('leather', id) });
      const v = row(t('ja.tray.veneer')); for (const [id, col] of Object.entries(VENEERS)) card(v, { label: t('ja.veneer.' + id), swatch: col, active: c.veneer === id, on: () => this.set('veneer', id) });
      const m = row(t('ja.tray.metal')); for (const [id, col] of Object.entries(METALS)) card(m, { label: t('ja.metal.' + id), swatch: col, active: c.metal === id, on: () => this.set('metal', id) });
    }
    if (this.section === 'lighting') {
      const box = row(t('ja.tray.light'));
      for (const [id, k] of [['night', 2200], ['sunset', 2700], ['cruise', 3600], ['daylight', 5000], ['focus', 6500]]) {
        const rgb = kelvinToRGB(k).map((x) => Math.round(x * 255));
        card(box, { label: t('ja.light.' + id), sub: `${k} K`, swatch: `rgb(${rgb})`, active: c.kelvin === k, on: () => this.set('kelvin', k) });
      }
      const s = row(t('ja.tray.kelvin'));
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = 2000; inp.max = 6500; inp.step = 50; inp.value = c.kelvin; inp.className = 'kelvin';
      const lbl = document.createElement('b'); lbl.className = 'mono'; lbl.textContent = `${c.kelvin} K`;
      inp.oninput = () => { c.kelvin = +inp.value; lbl.textContent = `${c.kelvin} K`; this.applyAll(); };
      s.append(inp, lbl);
    }
    if (this.section === 'mission') {
      const sel = (label, key) => {
        const box = row(label);
        const s = document.createElement('select'); s.className = 'city';
        for (const [code, city] of Object.entries(CITIES)) { const o = document.createElement('option'); o.value = code; o.textContent = `${code} · ${city.name}`; if (c[key] === code) o.selected = true; s.appendChild(o); }
        s.onchange = () => { this.set(key, s.value); this.setView('globe'); };
        box.appendChild(s);
      };
      sel(t('ja.tray.from'), 'from'); sel(t('ja.tray.to'), 'to');
      const p = row(t('ja.tray.pax'));
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = 1; inp.max = this.num.seats; inp.value = c.pax; inp.className = 'kelvin';
      const lbl = document.createElement('b'); lbl.className = 'mono'; lbl.textContent = String(c.pax);
      inp.oninput = () => { c.pax = +inp.value; lbl.textContent = String(c.pax); this.compute(); };
      p.append(inp, lbl);
    }
    if (this.section === 'summary') {
      const box = row('');
      card(box, { label: t('ja.sum.open'), sub: t('ja.sum.openSub'), on: () => this.app.showSummary(), cls: 'wide primaryish' });
      card(box, { label: t('ja.sum.fly'), sub: t('ja.sum.flySub'), on: () => this.setView('flight'), cls: 'wide' });
    }
  }

  // ── Build sheet (right panel) ────────────────────────
  updateSheet() {
    const n = this.num, m = n.m, c = this.cfg, q = (id) => document.getElementById(id), t = (k) => i18n.t(k);
    if (!q('bs-frame')) return;
    q('bs-frame').textContent = t('ja.frame.' + c.frame);
    q('bs-seats').textContent = `${n.seats} / ${n.berths}`;
    q('bs-range').textContent = `${fmt(m.rangeMaxKm / NM)} nm`;
    q('bs-speed').textContent = `M ${n.ac.mach.toFixed(2)} · ${fmt(m.ktas)} kt`;
    q('bs-cabin').textContent = `${fmt(n.cabinAlt)} ft @ FL${Math.round(n.ac.cruiseFt / 100)}`;
    q('bs-weights').textContent = `${fmt(n.ac.oew + n.interiorKg)} / ${fmt(n.ac.mtow)} kg`;
    q('bs-route').textContent = `${c.from} → ${c.to} · ${fmt(n.distKm / NM)} nm · ${fmt(n.bearing, 0)}°`;
    q('bs-time').textContent = `${Math.floor(m.timeH)} h ${String(Math.round((m.timeH % 1) * 60)).padStart(2, '0')} min`;
    q('bs-fuel').textContent = `${fmt(m.fuel)} kg / ${fmt(n.ac.fuelCap)} kg`;
    q('bs-co2').textContent = `${fmt(m.co2 / 1000, 1)} t`;
    const v = q('bs-verdict');
    v.textContent = m.feasible ? t('ja.ok.nonstop') : m.mtowLimited && !m.fuelLimited ? t('ja.ok.mtow') : t('ja.ok.stop');
    v.className = 'verdict ' + (m.feasible ? 'ok' : 'bad');
    q('bs-price').textContent = `US$ ${n.price.toFixed(1)} M`;
    q('bs-fuelbar').style.width = `${Math.min(100, m.fuel / n.ac.fuelCap * 100)}%`;
    q('bs-fuelbar').className = m.fuel > n.ac.fuelCap ? 'hot' : m.fuel > 0.9 * n.ac.fuelCap ? 'warm' : '';
    q('bs-pax').textContent = String(c.pax);
    this.updateMath();
  }
  updateMath() {
    const n = this.num, m = n.m, c = this.cfg, el = document.getElementById('bs-math'); if (!el) return;
    const rows = [
      ['d = 2R·asin√(sin²(Δφ/2) + cosφ₁cosφ₂sin²(Δλ/2))', `R = 6371.0088 km → ${fmt(n.distKm, 1)} km = ${fmt(n.distKm / NM, 1)} nm`],
      ['V = M·√(γ·R·T)   (ISA, FL' + Math.round(n.ac.cruiseFt / 100) + ')', `T = 216.65 K → a = 295.07 m/s → ${fmt(m.V, 1)} m/s`],
      ['R = (V/c)·(L/D)·ln(Wᵢ/W_f)', `c = ${n.ac.tsfc}/h, L/D = ${n.ac.LD} → K = ${fmt(m.K / 1000)} km`],
      ['Wᵢ = (W_zf + F_res)·e^(R/K)', `W_zf = ${fmt(m.Wzf)} kg, F_res = ${fmt(m.Fr)} kg`],
      ['p_cabin = p(FL) + Δp_max', `Δp = ${n.ac.dpPsi} psi → ${fmt(n.cabinAlt)} ft cabin`],
    ];
    el.innerHTML = rows.map(() => '<div class="eq"><code></code><span></span></div>').join('');
    [...el.children].forEach((d, i) => { d.children[0].textContent = rows[i][0]; d.children[1].textContent = rows[i][1]; });
  }

  buildCityDots() {
    const G = this.globeS;
    for (const [code, city] of Object.entries(CITIES)) {
      const v = toVec(city);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: '#cfe8ff' }));
      dot.position.set(v[0] * 1.003, v[1] * 1.003, v[2] * 1.003); G.cityDots.add(dot);
      const lab = G.textSprite(code); lab.position.set(v[0] * 1.07, v[1] * 1.07, v[2] * 1.07); G.cityDots.add(lab);
    }
  }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) { this.cam.drag = { x: e.clientX, y: e.clientY }; this.userMoved = true; }
  pointerMove(e) {
    if (!this.cam.drag) return;
    const G = this.cam.goal;
    G.yaw -= (e.clientX - this.cam.drag.x) * 0.005;
    G.pitch = THREE.MathUtils.clamp(G.pitch + (e.clientY - this.cam.drag.y) * 0.003, -0.05, 1.45);
    this.cam.drag = { x: e.clientX, y: e.clientY };
  }
  pointerUp() { this.cam.drag = null; }
  wheel(e) { const G = this.cam.goal; G.r = THREE.MathUtils.clamp(G.r * Math.exp(e.deltaY * 0.001), this.view === 'globe' ? 1.6 : 3, this.view === 'globe' ? 8 : 120); }

  // ── Frame ──────────────────────────────────────────
  update(dt, t) {
    const c = this.cam, G = c.goal, k = 1 - Math.exp(-dt * 2.6);
    if (!c.drag && (this.view === 'studio' || this.view === 'flight')) G.yaw += dt * (this.view === 'studio' ? 0.05 : 0.02);
    c.yaw += (G.yaw - c.yaw) * k; c.pitch += (G.pitch - c.pitch) * k; c.r += (G.r - c.r) * k;
    c.target.y += (G.ty - c.target.y) * k; c.target.x += (G.tx - c.target.x) * k;
    const s = this.scale();
    if (this.view === 'walk') {
      // Eye-level camera in the aisle of one zone at a time, drifting forward and panning across it.
      this.walkT += dt;
      const zones = this.cabin.userData.zones;
      const zi = this.walkZone ?? Math.floor(this.walkT / 7) % zones.length;
      const z = zones[Math.min(zi, zones.length - 1)];
      const u = (this.walkT % 7) / 7;
      const x = (z.x1 + 0.35 + u * 0.5) * s, y = this.jet.position.y + (CABIN.FLOOR + 1.5) * s;
      this.camera.position.set(x, y, -0.45 * s);
      this.camera.lookAt((z.x0 + 0.2) * s, y - 0.45 * s, (0.35 + 0.35 * Math.sin(u * Math.PI)) * s);
    } else {
      const tgt = this.view === 'cabin' ? new THREE.Vector3(c.target.x, this.jet.position.y + c.target.y, 0) : c.target;
      this.camera.position.set(tgt.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, tgt.y + Math.sin(c.pitch) * c.r, tgt.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
      this.camera.lookAt(tgt);
    }
    // Cut plane follows the aircraft's height.
    this.cutPlane.constant = this.jet.position.y + 0.95 * s;
    // Engine fans idle in the studio, spin in flight; the beacon strobes.
    for (const f of this.jet.userData.fans) f.rotation.x += dt * 2.5;
    for (const f of this.jetFlight.userData.fans) f.rotation.x += dt * 40;
    const strobe = (t % 1.2) < 0.08;
    this.jet.userData.beacon.material.color.set(strobe ? '#ff3355' : '#330008');
    this.studio.ring2.rotation.z += dt * 0.08;
    this.studio.dust.rotation.y += dt * 0.01;
    // Flight: gentle banking and pitching, clouds scroll, contrails stream back.
    if (this.view === 'flight') {
      const F = this.flight, j = this.jetFlight;
      j.rotation.x = Math.sin(t * 0.25) * 0.08; j.rotation.z = Math.sin(t * 0.17) * 0.03; j.position.y = Math.sin(t * 0.4) * 0.6;
      F.cloudMat.uniforms.uTime.value = t;
      const arr = F.trailPos, n = F.trailN;
      for (let side = 0; side < 2; side++) for (let i = 0; i < n; i++) {
        const o = (side * n + i) * 3, back = i * 1.4 + (t * 60 % 1.4);
        const p = new THREE.Vector3(-FUSELAGE.L / 2 + 5 - back, 0.75 + Math.sin(i * 0.3 + t) * 0.02 * i, (side ? 1 : -1) * (2.35 + i * 0.012)).multiplyScalar(s).applyEuler(j.rotation).add(j.position);
        arr[o] = p.x; arr[o + 1] = p.y; arr[o + 2] = p.z;
      }
      F.trail.geometry.attributes.position.needsUpdate = true;
    }
    if (this.view === 'globe') {
      const G2 = this.globeS; G2.mat.uniforms.uTime.value = t;
      if (G2.arcPts) { const u = (t * 0.12) % 1, i = Math.floor(u * (G2.arcPts.length - 1)); G2.plane.position.copy(G2.arcPts[i]); }
    }
  }
}
