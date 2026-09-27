import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · PROCEDURAL AIRCRAFT
// A generic large-cabin business jet built from mathematics, not a mesh file:
//   fuselage   lathe of a nose ogive + constant section + upswept tail cone
//   wing/tail  lofted NACA 4-digit symmetric sections:
//              y_t = 5t·(0.2969√x − 0.1260x − 0.3516x² + 0.2843x³ − 0.1015x⁴)
//   nacelles   lathe profiles with a spinning fan
// Axes: x forward (nose at +x), y up, z to the left wing.
// ─────────────────────────────────────────────────────────────────────────────

const L = 28, RF = 1.34;                          // reference fuselage length and radius (m), scaled per class

// Fuselage radius and centre-line height along x (x = 0 at the tail, L at the nose).
function section(x) {
  const u = x / L;
  let r;
  if (u > 0.86) { const k = (1 - u) / 0.14; r = RF * Math.sqrt(Math.max(0, 1 - Math.pow(1 - k, 2.2))); }   // nose ogive
  else if (u > 0.3) r = RF;
  else { const k = u / 0.3; r = RF * (0.28 + 0.72 * Math.pow(k, 0.75)); }                                  // tail cone
  const cy = u < 0.3 ? 0.55 * RF * Math.pow(1 - u / 0.3, 1.6) : 0;                                         // tail upsweep
  return { r: Math.max(0.02, r), cy };
}

function fuselageGeometry(phiStart = 0, phiLength = Math.PI * 2, rScale = 1, x0 = 0, x1 = L, n = 140, m = 72) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n), s = section(x);
    for (let j = 0; j <= m; j++) {
      const ph = phiStart + phiLength * (j / m);
      pos.push(x - L / 2, s.cy + Math.cos(ph) * s.r * rScale, Math.sin(ph) * s.r * rScale);
      uv.push(i / n, j / m);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// NACA 00xx half-thickness at chord fraction x (closed trailing edge variant: −0.1036).
const naca = (x, t) => 5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);

// Loft a lifting surface between a root and a tip section.
// sections: [{ le: Vector3 (leading edge), chord, t, twist? }], axis = spanwise direction for orientation.
function loft(sections, { vertical = false } = {}) {
  const N = 28, pos = [], idx = [];
  const xs = []; for (let i = 0; i <= N; i++) { const b = i / N; xs.push((1 - Math.cos(b * Math.PI)) / 2); }   // cosine spacing
  for (const s of sections) {
    // Upper surface TE→LE then lower LE→TE, as a closed ring.
    const ring = [];
    for (let i = N; i >= 0; i--) ring.push([xs[i], naca(xs[i], s.t)]);
    for (let i = 1; i <= N; i++) ring.push([xs[i], -naca(xs[i], s.t)]);
    for (const [cx, cy] of ring) {
      const dx = -cx * s.chord, th = cy * s.chord;
      if (vertical) pos.push(s.le.x + dx, s.le.y, s.le.z + th);
      else pos.push(s.le.x + dx, s.le.y + th, s.le.z);
    }
  }
  const R = 2 * N + 1;
  for (let k = 0; k < sections.length - 1; k++) for (let i = 0; i < R - 1; i++) {
    const a = k * R + i, b = a + R;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function nacelleGeometry(len = 4.4, r = 0.68) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    // Inlet lip → max diameter → nozzle taper; traced from the back to the front.
    const rad = u < 0.12 ? r * (0.82 + 0.18 * Math.sin(u / 0.12 * Math.PI / 2)) : u < 0.7 ? r : r * (1 - 0.35 * ((u - 0.7) / 0.3) ** 1.4);
    pts.push(new THREE.Vector2(rad, len / 2 - u * len));
  }
  const g = new THREE.LatheGeometry(pts, 64); g.rotateZ(-Math.PI / 2); return g;
}

export function buildAircraft(envMap) {
  const root = new THREE.Group();
  const mats = {
    paint: new THREE.MeshPhysicalMaterial({ color: '#eef0f3', metalness: 0.25, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.55 }),
    accent: new THREE.MeshPhysicalMaterial({ color: '#ff4fd8', metalness: 0.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    trim: new THREE.MeshPhysicalMaterial({ color: '#c9ced8', metalness: 1, roughness: 0.18 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#05070c', metalness: 0.2, roughness: 0.05, clearcoat: 1, envMapIntensity: 2 }),
    window: new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
    dark: new THREE.MeshStandardMaterial({ color: '#15171c', metalness: 0.6, roughness: 0.5 }),
    tyre: new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.9 }),
    fan: new THREE.MeshStandardMaterial({ color: '#8b93a3', metalness: 1, roughness: 0.3 }),
  };
  const body = new THREE.Group(); root.add(body);
  const fus = new THREE.Mesh(fuselageGeometry(), mats.paint); body.add(fus);
  // Cheatline: a thin accent band along each side, 0.5 % proud of the skin.
  const stripeA = new THREE.Mesh(fuselageGeometry(Math.PI / 2 - 0.1, 0.06, 1.004, L * 0.1, L * 0.9, 120, 3), mats.accent);
  const stripeB = new THREE.Mesh(fuselageGeometry(-Math.PI / 2 + 0.04, 0.06, 1.004, L * 0.1, L * 0.9, 120, 3), mats.accent);
  body.add(stripeA, stripeB);
  // Cockpit windscreen: a dark glass band wrapping the nose.
  const ws = new THREE.Mesh(fuselageGeometry(-0.95 + Math.PI, 1.9, 1.006, L * 0.905, L * 0.94, 20, 24), mats.glass); ws.rotation.x = 0; body.add(ws);
  // Cabin windows: large ovals down both sides, glowing with the cabin light.
  const winGeo = new THREE.CircleGeometry(0.2, 24); winGeo.scale(1.25, 1, 1);
  const windows = new THREE.Group(); body.add(windows);
  const nWin = 14;
  for (let i = 0; i < nWin; i++) {
    const x = L * 0.34 + i * (L * 0.5 / (nWin - 1)) - L / 2;
    for (const side of [1, -1]) {
      const w = new THREE.Mesh(winGeo, mats.window);
      w.position.set(x, 0.28, side * (RF + 0.012)); w.rotation.y = side > 0 ? 0 : Math.PI;
      windows.add(w);
    }
  }
  // Wings: 33° sweep, dihedral, lofted NACA sections, blended winglets.
  const wing = new THREE.Group(); body.add(wing);
  const wingMesh = (side) => {
    const sw = 33 * Math.PI / 180, dih = 3.2 * Math.PI / 180, half = 14.8;
    const secs = [];
    const stations = [0, 0.3, 0.7, 1.0];
    for (const f of stations) {
      const span = RF * 0.6 + f * half;
      const chord = 6.2 * (1 - f) + 1.45 * f - (f < 0.3 ? 0 : 0.6 * (f - 0.3) * (1 - f));
      secs.push({ le: new THREE.Vector3(1.6 - span * Math.tan(sw), -0.72 + span * Math.tan(dih), side * span), chord, t: 0.13 - 0.04 * f });
    }
    // Winglet: sweep up and back.
    const tip = secs.at(-1);
    for (const f of [0.4, 1]) secs.push({ le: new THREE.Vector3(tip.le.x - 0.9 * f, tip.le.y + 1.7 * f, side * (RF * 0.6 + half + 0.35 * f)), chord: 1.45 - 0.6 * f, t: 0.08 });
    return new THREE.Mesh(loft(secs), mats.paint);
  };
  wing.add(wingMesh(1), wingMesh(-1));
  // Winglet tips in the accent colour.
  for (const side of [1, -1]) { const tipCap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mats.accent); tipCap.position.set(1.6 - (RF * 0.6 + 14.8) * Math.tan(33 * Math.PI / 180) - 0.9, -0.72 + (RF * 0.6 + 14.8) * Math.tan(3.2 * Math.PI / 180) + 1.7, side * (RF * 0.6 + 15.15)); wing.add(tipCap); }
  // T-tail: swept fin with the stabiliser on top.
  const finSecs = [];
  for (const f of [0, 1]) finSecs.push({ le: new THREE.Vector3(-L / 2 + 5.4 - f * 2.9, 0.9 + f * 4.4, 0), chord: 5.2 - f * 2.3, t: 0.11 });
  const fin = new THREE.Mesh(loft(finSecs.map((s) => ({ ...s }))), mats.paint);
  // Fin sections are vertical: rebuild with a vertical loft.
  fin.geometry.dispose();
  fin.geometry = (() => {
    const N = 24, pos = [], idx = [];
    for (const s of finSecs) {
      for (let i = N; i >= 0; i--) { const x = (1 - Math.cos(i / N * Math.PI)) / 2; pos.push(s.le.x - x * s.chord, s.le.y, naca(x, s.t) * s.chord); }
      for (let i = 1; i <= N; i++) { const x = (1 - Math.cos(i / N * Math.PI)) / 2; pos.push(s.le.x - x * s.chord, s.le.y, -naca(x, s.t) * s.chord); }
    }
    const R = 2 * N + 1; for (let i = 0; i < R - 1; i++) idx.push(i, i + R, i + 1, i + 1, i + R, i + R + 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  })();
  body.add(fin);
  const finAccent = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.26), mats.accent); finAccent.position.set(-L / 2 + 3.2, 3.2, 0); finAccent.rotation.z = -0.55; body.add(finAccent);
  const stab = (side) => {
    const secs = [];
    for (const f of [0, 1]) secs.push({ le: new THREE.Vector3(-L / 2 + 2.6 - f * 1.8, 5.3 + f * 0.2, side * (0.05 + f * 4.6)), chord: 2.5 - f * 1.3, t: 0.1 });
    return new THREE.Mesh(loft(secs), mats.paint);
  };
  body.add(stab(1), stab(-1));
  // Rear-mounted engines on pylons, with spinning fans.
  const fans = [];
  const engines = new THREE.Group(); body.add(engines);
  for (const side of [1, -1]) {
    const nac = new THREE.Mesh(nacelleGeometry(), mats.paint); nac.position.set(-L / 2 + 7.6, 0.75, side * 2.35); engines.add(nac);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 16, 48), mats.trim); lip.rotation.y = Math.PI / 2; lip.position.set(-L / 2 + 9.8, 0.75, side * 2.35); engines.add(lip);
    const fan = new THREE.Group(); fan.position.set(-L / 2 + 9.55, 0.75, side * 2.35); engines.add(fan);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 24), mats.trim); hub.rotation.z = -Math.PI / 2; hub.position.x = 0.1; fan.add(hub);
    for (let b = 0; b < 22; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.1), mats.fan); bl.position.y = 0.3; const piv = new THREE.Group(); piv.rotation.x = b / 22 * Math.PI * 2; bl.rotation.y = 0.5; piv.add(bl); fan.add(piv); }
    fans.push(fan);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.3, 32, 1, true), mats.dark); noz.rotation.z = Math.PI / 2; noz.position.set(-L / 2 + 5.4, 0.75, side * 2.35); engines.add(noz);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 1.2), mats.paint); pylon.position.set(-L / 2 + 7.4, 0.75, side * 1.55); engines.add(pylon);
    const accentRing = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.025, 8, 48), mats.accent); accentRing.rotation.y = Math.PI / 2; accentRing.position.set(-L / 2 + 8.7, 0.75, side * 2.35); engines.add(accentRing);
  }
  // Landing gear (studio pose): nose gear and two mains.
  const gear = new THREE.Group(); body.add(gear);
  const leg = (x, z, h, wheels) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 12), mats.trim); strut.position.set(x, -RF - h / 2 + 0.2, z); gear.add(strut);
    for (const dz of wheels) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 12, 28), mats.tyre); w.position.set(x, -RF - h + 0.2, z + dz); gear.add(w); const hubc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20), mats.trim); hubc.rotation.x = Math.PI / 2; hubc.position.copy(w.position); gear.add(hubc); }
  };
  leg(L / 2 - 3.2, 0, 1.25, [-0.2, 0.2]);
  leg(-0.8, 2.3, 1.25, [0]); leg(-0.8, -2.3, 1.25, [0]);
  // Navigation / strobe lights.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a3d' })), navR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#2aff6a' }));
  navL.position.set(1.6 - (RF * 0.6 + 14.8) * Math.tan(33 * Math.PI / 180), -0.72 + (RF * 0.6 + 14.8) * Math.tan(3.2 * Math.PI / 180), RF * 0.6 + 14.8); navR.position.copy(navL.position); navR.position.z *= -1;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3355' })); beacon.position.set(-L / 2 + 1.4, 5.7, 0);
  body.add(navL, navR, beacon);

  root.userData = { mats, fans, gear, windows, beacon, body, gearHeight: RF + 1.25 + 0.14 };
  return root;
}

export const FUSELAGE = { L, RF, section };
