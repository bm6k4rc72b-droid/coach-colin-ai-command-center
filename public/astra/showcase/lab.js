/**
 * The Black Lab — behind the vault door, the file on EX-039 (exenatide).
 *
 * A separate interface laid over the chamber: the user's goo-soaked lab
 * plates behind, black goo dripping from the top of the screen, a 3D
 * exendin-4 chain in gold and goo that drips for real, six dossier panels
 * to swipe through, and Colin as a nervous custodian who wants you out.
 *
 * The drops obey free fall: a drop released at rest falls y(t) = ½gt²,
 * so one leaving a bead 1.5 m above the floor lands after √(2h/g) ≈ 0.55 s.
 * The half-life panel removes beads at exponentially distributed times with
 * the drug's own half-life (2.4 h, one second per hour), so half the chain
 * is gone at 2.4 s and 3% is left at 12 s — the same arithmetic as a dose.
 *
 * @module astra/showcase/lab
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { el } from './cards.js';
import {
  CLAIMS, IDENTITY, LAB_PANELS, LANDMARKS, SAFETY_FILE, STUDIES, TEASER_CHECK, alignment, lifetime, simulate,
} from './classified.js';
import { line } from './colin.js';
import { label, radialTexture } from './kit.js';
import { beep, isMuted, setMuted, startDrone, stopDrone } from './sfx.js';

export const LAB_PLATES = {
  exColin: '../assets/showcase/ex-colin.webp',
  exGila: '../assets/showcase/ex-gila.webp',
  exLab: '../assets/showcase/ex-lab.webp',
  exBench: '../assets/showcase/ex-bench.webp',
  exTank: '../assets/showcase/ex-tank.webp',
  exPoster: '../assets/showcase/ex-poster.webp',
};

/** The custodian's delivery: lower, slower, close to the microphone. */
export const CUSTODIAN = { pitch: 0.7, rate: 0.86 };

const G = 9.81;
const FLOOR = -1.55;
const SCALE = 0.11; // scene units per ångström

/**
 * Schematic coordinates for the 39 residues: an extended N-terminus, an
 * α-helix for residues 9–27 (3.6 residues per turn, 1.5 Å rise, 2.3 Å
 * radius), and the C-terminal tail folding back over Trp25 as the Trp-cage.
 * Schematic — drawn from those standard dimensions, not a solved structure.
 *
 * @returns {THREE.Vector3[]} Positions, residue 1 first.
 */
export function chainPositions() {
  const pts = [];
  const helixStart = 9;
  const helixEnd = 27;
  const rise = 1.5 * SCALE;
  const radius = 2.3 * SCALE;
  const x0 = -((helixEnd - helixStart) * rise) / 2;
  const helix = (i) => {
    const a = THREE.MathUtils.degToRad((i - helixStart) * 100);
    return new THREE.Vector3(x0 + (i - helixStart) * rise, Math.cos(a) * radius, Math.sin(a) * radius);
  };
  for (let i = 1; i < helixStart; i += 1) {
    // Extended strand: 3.3 Å per residue, zigzagging, curving up and away.
    const k = helixStart - i;
    pts.push(new THREE.Vector3(x0 - k * 3.3 * SCALE * 0.85, 0.12 + k * 0.06 + (k % 2 ? 0.08 : -0.08), -k * 0.05));
  }
  for (let i = helixStart; i <= helixEnd; i += 1) pts.push(helix(i));
  const end = helix(helixEnd);
  const w25 = helix(25);
  // 28–30: a turn; 31–39: back along the helix, packed against Trp25.
  for (let i = 28; i <= 39; i += 1) {
    const u = (i - 28) / 11;
    const back = new THREE.Vector3().lerpVectors(end, w25, Math.min(1, u * 1.15));
    const lift = Math.sin(Math.PI * Math.min(1, u * 1.1)) * 0.42 + 0.3;
    back.y += lift;
    back.z += 0.32 + 0.12 * Math.sin(u * Math.PI * 3);
    back.x += 0.35 * Math.sin(u * Math.PI);
    pts.push(back);
  }
  return pts;
}

/* ------------------------------------------------------- goo overlay */

/** Black goo along the top edge, dripping, with drops in free fall (px). */
function gooLayer(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let drips = [];
  const make = (x) => ({ x, len: 4 + Math.random() * 20, max: 40 + Math.random() * 120, speed: 3 + Math.random() * 10, width: 3 + Math.random() * 7, drop: null });
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drips = Array.from({ length: Math.max(10, Math.round(w / 55)) }, (_, i) => make((i + Math.random() * 0.8) * (w / Math.max(10, Math.round(w / 55)))));
  };
  // Pixels per metre for the falling drops: the screen is about 2 m tall.
  const pxPerM = () => h / 2;
  const step = (dt, t) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#020203';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, 10 + 5 * Math.sin(x * 0.03 + t * 0.6) + 3 * Math.sin(x * 0.11 - t));
    ctx.lineTo(w, 0);
    ctx.fill();
    for (const d of drips) {
      d.len = Math.min(d.max, d.len + d.speed * dt);
      const top = 10 + 5 * Math.sin(d.x * 0.03 + t * 0.6);
      // The drip: a tapering tongue with a bulb at its tip.
      const tip = top + d.len;
      ctx.beginPath();
      ctx.moveTo(d.x - d.width, top);
      ctx.quadraticCurveTo(d.x - d.width * 0.3, tip - d.width, d.x - d.width * 0.55, tip);
      ctx.arc(d.x, tip, d.width * 0.55, Math.PI, 0, true);
      ctx.quadraticCurveTo(d.x + d.width * 0.3, tip - d.width, d.x + d.width, top);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,152,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d.x - d.width * 0.25, top + 4); ctx.lineTo(d.x - d.width * 0.2, tip - 3); ctx.stroke();
      if (d.len >= d.max && !d.drop) {
        d.drop = { y0: tip, t: 0, r: d.width * 0.6 };
        d.len = 4 + Math.random() * 10;
        d.max = 40 + Math.random() * 120;
      }
      if (d.drop) {
        d.drop.t += dt;
        // y = y₀ + ½·g·t², in pixels.
        const y = d.drop.y0 + 0.5 * G * pxPerM() * d.drop.t * d.drop.t;
        const v = G * pxPerM() * d.drop.t;
        const stretch = Math.min(3, 1 + v / 900);
        ctx.beginPath();
        ctx.ellipse(d.x, y, d.drop.r, d.drop.r * stretch, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,217,152,0.35)';
        ctx.beginPath(); ctx.arc(d.x - d.drop.r * 0.35, y - d.drop.r * stretch * 0.3, d.drop.r * 0.25, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#020203';
        if (y > h + 20) d.drop = null;
      }
    }
  };
  return { resize, step };
}

/* ------------------------------------------------------------ the hero */

function hero(canvas, state) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0.2, 5.4);
  scene.add(new THREE.AmbientLight(0x404050, 0.6));
  const key = new THREE.PointLight(0xffc56b, 30, 12);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.PointLight(0x6fd3ff, 18, 12);
  rim.position.set(-2.5, -0.5, -2);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);
  const chain = new THREE.Group();
  root.add(chain);
  const { positions: align } = alignment();
  const pts = chainPositions();
  const center = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  pts.forEach((p) => p.sub(center));

  const gold = new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: 0.16, emissive: 0x3a2405, emissiveIntensity: 0.6 });
  const goo = new THREE.MeshPhysicalMaterial({ color: 0x060607, metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
  const ice = new THREE.MeshStandardMaterial({ color: 0x8fe3ff, metalness: 0.4, roughness: 0.15, emissive: 0x0c5a78, emissiveIntensity: 0.8 });
  const sphere = new THREE.SphereGeometry(0.105, 28, 20);
  const beads = pts.map((p, i) => {
    const info = align[i];
    const mesh = new THREE.Mesh(sphere, info.tail ? ice : info.same ? gold : goo);
    mesh.position.copy(p);
    mesh.userData = { i: i + 1, info, life: Infinity };
    chain.add(mesh);
    return mesh;
  });
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xc99a45, metalness: 1, roughness: 0.3 });
  const bonds = [];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = a.distanceTo(b);
    const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 8), bondMat);
    bond.position.copy(a).add(b).multiplyScalar(0.5);
    bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    chain.add(bond);
    bonds.push(bond);
  }
  // Floor: a black glossy pool, and ripple rings where drops land.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = FLOOR;
  scene.add(pool);
  const ripples = [];
  const rippleGeo = new THREE.RingGeometry(0.05, 0.065, 40);
  // Drops: hang, swell, let go, fall.
  const dropGeo = new THREE.SphereGeometry(0.045, 16, 12);
  const drops = [];
  const spawn = () => {
    const candidates = beads.filter((b) => !b.userData.info.same && !b.userData.info.tail && b.visible);
    if (!candidates.length) return;
    const bead = candidates[Math.floor(Math.random() * candidates.length)];
    const mesh = new THREE.Mesh(dropGeo, goo);
    chain.add(mesh);
    drops.push({ mesh, bead, phase: 'hang', t: 0, swell: 0.9 + Math.random() * 1.4, y0: 0, x: 0, z: 0 });
  };
  const focusTag = label(' ', { size: 40, width: 640, color: '#ffffff' });
  focusTag.scale.multiplyScalar(0.8);
  scene.add(focusTag);
  const setTag = (text, color = '#ffd998') => {
    const c = focusTag.material.map.image;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = '700 40px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 14;
    g.fillStyle = color;
    g.fillText(text, c.width / 2, 48);
    focusTag.material.map.needsUpdate = true;
  };
  let lastTag = '';
  let cycle = 0;
  let mode = '';
  let decayStart = 0;
  const resetDecay = (t) => {
    decayStart = t;
    for (const b of beads) { b.userData.life = lifetime(Math.random(), IDENTITY.halfLife); b.visible = true; }
  };
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the ~4.6-unit chain across the view: z ≥ halfWidth / (tan(fov/2)·aspect).
    camera.position.z = Math.max(5.4, 2.6 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    camera.updateProjectionMatrix();
  };
  return {
    resize,
    render(t, dt) {
      const lab = state.lab;
      const panel = LAB_PANELS[lab.panel]?.id;
      if (panel !== mode) {
        mode = panel;
        if (mode === 'halflife') resetDecay(t);
        else for (const b of beads) b.visible = true;
      }
      root.rotation.y = Math.sin(t * 0.25) * 0.5 + lab.lookX * 0.6;
      root.rotation.x = 0.15 + lab.lookY * 0.25;
      root.position.y = 0.12 * Math.sin(t * 0.7);
      // Highlight: a tapped residue, or a scan along the chain in the structure panel.
      let focus = lab.focus;
      if (!focus && mode === 'structure') { cycle += dt; focus = 1 + (Math.floor(cycle / 0.6) % beads.length); }
      if (mode === 'halflife') {
        const hours = t - decayStart;
        let left = 0;
        for (const b of beads) { b.visible = b.userData.life > hours; if (b.visible) left += 1; }
        lab.decay = { hours, left, expected: beads.length * 2 ** (-hours / IDENTITY.halfLife) };
        if (hours > 12) resetDecay(t);
      } else lab.decay = null;
      beads.forEach((b) => {
        const on = focus === b.userData.i;
        b.scale.setScalar(on ? 1.7 : 1);
      });
      bonds.forEach((bond, i) => { bond.visible = beads[i].visible && beads[i + 1].visible; });
      if (focus) {
        const b = beads[focus - 1];
        const info = b.userData.info;
        const text = `${info.ex}${info.i}${info.tail ? ' · exendin only' : info.same ? ' · same as GLP-1' : ` · GLP-1 has ${info.glp}`}`;
        if (text !== lastTag) { lastTag = text; setTag(text, info.tail ? '#9fe8ff' : info.same ? '#ffd998' : '#ff8a8a'); }
        focusTag.visible = true;
        focusTag.position.copy(b.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.38, 0));
      } else focusTag.visible = false;
      // Drops: swell at the bead, detach, fall under gravity, ripple.
      if (drops.length < 6 && Math.random() < dt * 1.4) spawn();
      for (let i = drops.length - 1; i >= 0; i -= 1) {
        const d = drops[i];
        d.t += dt;
        if (d.phase === 'hang') {
          const s = Math.min(1, d.t / d.swell);
          const p = d.bead.position;
          d.mesh.position.set(p.x, p.y - 0.1 - s * 0.06, p.z);
          d.mesh.scale.set(0.5 + s * 0.5, 0.5 + s * 1.1, 0.5 + s * 0.5);
          if (s >= 1 || !d.bead.visible) {
            d.phase = 'fall';
            d.t = 0;
            const w = d.mesh.getWorldPosition(new THREE.Vector3());
            chain.remove(d.mesh);
            scene.add(d.mesh);
            d.mesh.position.copy(w);
            d.y0 = w.y;
          }
        } else {
          // Free fall from rest: y = y₀ − ½gt²; stretched along the velocity.
          const y = d.y0 - 0.5 * G * d.t * d.t;
          d.mesh.position.y = y;
          d.mesh.scale.set(0.8, 1 + Math.min(1.5, G * d.t * 0.25), 0.8);
          if (y <= FLOOR) {
            const ring = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffd998, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(d.mesh.position.x, FLOOR + 0.004, d.mesh.position.z);
            scene.add(ring);
            ripples.push({ ring, t: 0 });
            scene.remove(d.mesh);
            drops.splice(i, 1);
          }
        }
      }
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const r = ripples[i];
        r.t += dt;
        r.ring.scale.setScalar(1 + r.t * 9);
        r.ring.material.opacity = Math.max(0, 0.7 * (1 - r.t / 1.1));
        if (r.t > 1.1) { scene.remove(r.ring); r.ring.material.dispose(); ripples.splice(i, 1); }
      }
      renderer.render(scene, camera);
    },
    pick(x, y) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(beads.filter((b) => b.visible), false)[0];
      return hit ? hit.object.userData.i : null;
    },
    dispose() { renderer.dispose(); },
  };
}

/* ------------------------------------------------------------- panels */

function halfLifeChart() {
  const canvas = el('canvas', { class: 'bl-chart', width: '640', height: '260', 'aria-label': 'Exenatide concentration over 48 hours, twice-daily dosing' });
  const sim = simulate({ interval: 12, hours: 48, step: 0.1 });
  const ctx = canvas.getContext('2d');
  const W = 640;
  const H = 260;
  const x = (t) => 40 + (t / 48) * (W - 60);
  const y = (c) => H - 30 - (c / 1.15) * (H - 60);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(40, 20); ctx.lineTo(40, H - 30); ctx.lineTo(W - 20, H - 30); ctx.stroke();
  ctx.fillStyle = 'rgba(214,222,238,0.7)';
  ctx.font = '12px Inter, system-ui, sans-serif';
  for (const t of [0, 12, 24, 36, 48]) ctx.fillText(`${t} h`, x(t) - 8, H - 12);
  // Native GLP-1 for scale: t½ ≈ 2 min — gone before the first gridline.
  ctx.strokeStyle = 'rgba(111,211,255,0.8)';
  ctx.beginPath();
  for (let t = 0; t <= 0.5; t += 0.005) { const c = 2 ** (-t / (2 / 60)); if (t === 0) ctx.moveTo(x(t), y(c)); else ctx.lineTo(x(t), y(c)); }
  ctx.stroke();
  ctx.strokeStyle = '#ffd998';
  ctx.lineWidth = 2.4;
  ctx.shadowColor = '#f0b75a';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  sim.points.forEach(([t, c], i) => (i ? ctx.lineTo(x(t), y(c)) : ctx.moveTo(x(t), y(c))));
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd998';
  ctx.fillText('exenatide, twice daily', x(25), y(1.08));
  ctx.fillStyle = '#6fd3ff';
  ctx.fillText('native GLP-1 (t½ ≈ 2 min)', x(1.2), y(0.62));
  return { canvas, sim };
}

function buildPanels(state, hooks) {
  const { positions, identical, compared, percent } = alignment();
  const sec = (panel, kids) => el('section', { class: 'bl-sec', 'data-panel': panel.id }, [
    el('article', { class: 'bl-card' }, [
      el('p', { class: 'bl-kicker', text: `${IDENTITY.code} · ${panel.kicker}` }),
      el('h2', { text: panel.title }),
      ...kids,
    ]),
  ]);
  const row = (k, v) => el('div', { class: 'bl-row' }, [el('span', { text: k }), el('b', { text: v })]);
  const decayOut = el('p', { class: 'bl-mono' });
  const chart = halfLifeChart();
  const ke = chart.sim.ke;

  const residue = (p, which) => el('button', {
    class: `res ${p.tail ? 'tail' : p.same ? 'same' : 'diff'}${which === 'glp' ? ' glp' : ''}`, type: 'button',
    title: `Residue ${p.i}: exenatide ${p.ex}${p.glp ? `, GLP-1 ${p.glp}` : ', no GLP-1 counterpart'}`,
    text: which === 'glp' ? (p.glp || '·') : p.ex,
    onclick: () => { state.lab.focus = state.lab.focus === p.i ? null : p.i; hooks.touch(); },
  });

  const panels = {
    specimen: [
      el('div', { class: 'bl-stamps' }, [el('span', { class: 'stamp', text: 'DECLASSIFIED' }), el('span', { class: 'stamp red', text: 'EYES ONLY' })]),
      row('Designation', `${IDENTITY.code} · ${IDENTITY.name} (${IDENTITY.aka})`),
      row('Residues', `${IDENTITY.residues} amino acids, C-terminal amide`),
      row('Formula · mass', `${IDENTITY.formula} · ${IDENTITY.mass} Da`),
      row('Terminal half-life', `${IDENTITY.halfLife} h (peak at ${IDENTITY.tmax} h)`),
      row('Source', IDENTITY.source),
      row('Discovered', IDENTITY.discovered),
      ...IDENTITY.approved.map((a) => row(`${a.brand} · ${a.year}`, `${a.form} — ${a.note}`)),
      row('Licensed use', IDENTITY.use),
      el('p', { class: 'bl-note', text: IDENTITY.made }),
      el('p', { class: 'meta', text: `Source: ${IDENTITY.label}` }),
    ],
    origin: [
      el('p', { text: 'The Gila monster (Heloderma suspectum) is one of the few venomous lizards. It lives in the deserts of the south-western United States — Arizona and neighbouring corners of Nevada, Utah, California and New Mexico — and north-western Mexico, mainly Sonora.' }),
      el('ul', { class: 'facts' }, [
        el('li', { text: 'Venom comes from glands in the lower jaw and is chewed in along grooved teeth, carried in saliva — hence “Gila monster saliva”.' }),
        el('li', { text: 'It eats rarely — a few large meals a year — and spends most of its life underground.' }),
        el('li', { text: 'In 1992 John Eng, an endocrinologist at the Bronx VA, isolated exendin-4 from the venom. It switched on the same receptor as human GLP-1 and survived far longer.' }),
        el('li', { text: 'A protected species across much of its range. The drug never needed the lizard again: exenatide is built by chemical synthesis.' }),
      ]),
      el('p', { class: 'meta', text: 'Eng J et al., J Biol Chem 1992 — isolation and characterisation of exendin-4.' }),
    ],
    structure: [
      el('p', { text: `Exenatide against human GLP-1, residue by residue. Tap any residue to light it on the model. ${identical} of ${compared} aligned positions are identical — ${percent.toFixed(1)}%. Residues 31–39 exist only in the lizard peptide.` }),
      el('div', { class: 'align' }, [
        el('p', { class: 'align-label', text: 'Exenatide' }),
        el('div', { class: 'align-row' }, positions.map((p) => residue(p, 'ex'))),
        el('p', { class: 'align-label', text: 'GLP-1(7–36)' }),
        el('div', { class: 'align-row' }, positions.map((p) => residue(p, 'glp'))),
      ]),
      el('p', { class: 'legend' }, [el('span', { class: 'res same', text: 'A' }), ' identical  ', el('span', { class: 'res diff', text: 'A' }), ' different  ', el('span', { class: 'res tail', text: 'A' }), ' exendin only']),
      el('ul', { class: 'facts' }, LANDMARKS.map((l) => el('li', {}, [el('b', { text: `${l.label}: ` }), document.createTextNode(l.text)]))),
      el('p', { class: 'meta', text: 'Model: schematic α-helix (3.6 residues per turn, 1.5 Å rise) for residues 9–27 and a folded-back Trp-cage tail — drawn from standard geometry, not a solved structure. Neidigh, Fesinmeyer & Andersen, Nat Struct Biol 2002.' }),
    ],
    halflife: [
      el('p', { text: 'On the model, each bead now lives for a random time drawn from the drug’s own clearance — one second per hour. Half the chain should be gone by 2.4 s; by 12 s, only about one bead in thirty-two.' }),
      decayOut,
      chart.canvas,
      el('ul', { class: 'facts bl-math' }, [
        el('li', { text: `kₑ = ln 2 / t½ = 0.6931 / 2.4 h = ${ke.toFixed(4)} per hour` }),
        el('li', { text: `Left 12 h after a dose: e^(−kₑ·12) = 2^(−12/2.4) = 2⁻⁵ = ${(chart.sim.remaining * 100).toFixed(1)}%` }),
        el('li', { text: `Accumulation with twice-daily dosing: R = 1 / (1 − e^(−kₑ·12)) = ${chart.sim.accumulation.toFixed(3)} — essentially none` }),
        el('li', { text: `Absorption fitted to the label’s peak at ${IDENTITY.tmax} h: tmax = ln(kₐ/kₑ)/(kₐ − kₑ) gives kₐ = ${chart.sim.ka.toFixed(3)} per hour` }),
        el('li', { text: 'Why weekly Bydureon works: the same molecule in slow-dissolving polymer microspheres, released over weeks; steady state takes 6–7 weeks.' }),
      ]),
      el('p', { class: 'meta', text: 'Relative units — an illustration of the kinetics, not a dosing tool. Half-life and tmax from the BYETTA prescribing information.' }),
    ],
    evidence: [
      el('div', { class: 'bl-claims' }, CLAIMS.map((c) => el('div', { class: `bl-claim lv-${c.level}` }, [
        el('p', { class: 'claim-text', text: c.text }),
        el('p', { class: 'claim-verdict', text: c.verdict }),
        el('div', { class: 'claim-bar', title: 'How strong the studies are (ASTRA evidence engine) — not what they found' }, [el('span', { style: `width:${Math.round(c.score * 100)}%` })]),
        el('p', { class: 'meta', text: c.studies.length ? `Study strength ${Math.round(c.score * 100)}% (${c.band.label}) — the strength of the designs, not the direction of the result.` : 'No study.' }),
      ]))),
      el('details', { class: 'hub-more' }, [el('summary', { text: `The ${STUDIES.length} cited studies` }), el('ol', { class: 'bl-studies' }, STUDIES.map((s) => el('li', {}, [
        el('b', { text: s.title }), el('br'),
        el('span', { class: 'meta', text: `${s.authors}. ${s.journal}, ${s.year}. ${s.design}${s.n ? `, n = ${s.n.toLocaleString('en-GB')}` : ''}.` }), el('br'),
        document.createTextNode(s.finding), el('br'),
        el('span', { class: 'meta', text: `Limitation: ${s.limitation}` }),
      ])))]),
      el('details', { class: 'hub-more' }, [el('summary', { text: 'Safety file (from the labels)' }), el('ul', { class: 'facts' }, SAFETY_FILE.map((t) => el('li', { text: t })))]),
    ],
    truth: [
      el('p', { text: 'The teaser posters that led you here, checked line by line against the record.' }),
      el('div', { class: 'bl-truth' }, TEASER_CHECK.map((c) => el('div', { class: `truth v-${c.verdict}` }, [
        el('span', { class: 'truth-chip', text: { true: 'TRUE', partly: 'PARTLY', unverified: 'UNVERIFIED', prop: 'PROP', false: 'FALSE' }[c.verdict] }),
        el('b', { text: c.said }),
        el('p', { text: c.note }),
      ]))),
      el('button', { class: 'btn-vault bl-exit-big', type: 'button', text: '⏏ Leave the vault', onclick: () => hooks.exit() }),
    ],
  };
  const sections = LAB_PANELS.map((p) => sec(p, panels[p.id]));
  return {
    sections,
    tick() {
      const d = state.lab.decay;
      decayOut.textContent = d ? `t = ${d.hours.toFixed(1)} h   beads left ${d.left} of 39   expected 39·2^(−t/2.4) = ${d.expected.toFixed(1)}` : '';
    },
  };
}

/* ------------------------------------------------------------ the lab */

export class BlackLab {
  /**
   * @param {{ state: object, say: Function, stop: Function, reduced: boolean, onClose: Function }} options Hooks.
   */
  constructor({ state, say, stop, reduced, onClose }) {
    this.state = state;
    this.say = (text) => say(text, CUSTODIAN);
    this.stop = stop;
    this.reduced = reduced;
    this.onClose = onClose;
    this.root = null;
  }

  open() {
    if (this.root) return;
    const s = this.state;
    s.lab.open = true;
    s.lab.panel = 0;
    s.lab.focus = null;
    s.lab.lookX = 0;
    s.lab.lookY = 0;
    this.entered = performance.now();
    this.lastTouch = performance.now();
    this.nag = 0;
    const plates = el('div', { class: 'bl-plates' }, LAB_PANELS.map((p, i) => el('div', { class: `bl-plate${i === 0 ? ' on' : ''}`, style: `background-image:url('${LAB_PLATES[p.plate]}')` })));
    const goo = el('canvas', { class: 'bl-goo', 'aria-hidden': 'true' });
    const heroCanvas = el('canvas', { class: 'bl-hero', 'aria-label': 'Exendin-4 model: tap a residue' });
    const timer = el('span', { class: 'bl-timer', text: '00:00' });
    const sound = el('button', { class: 'chip-btn', type: 'button', 'aria-pressed': String(!isMuted()), text: isMuted() ? '🔈 Sound off' : '🔊 Sound on' });
    const exit = el('button', { class: 'bl-leave', type: 'button', text: 'LEAVE NOW' });
    const caption = el('p', { class: 'bl-caption', dir: 'auto', 'aria-live': 'polite' });
    const track = el('main', { class: 'bl-track', 'aria-label': 'Classified file' });
    const dots = el('nav', { class: 'bl-dots', 'aria-label': 'File sections' });
    const hooks = { touch: () => { this.lastTouch = performance.now(); }, exit: () => this.leave() };
    const built = buildPanels(s, hooks);
    track.append(...built.sections);
    LAB_PANELS.forEach((p, i) => dots.append(el('button', { class: `dot${i === 0 ? ' on' : ''}`, type: 'button', 'aria-label': p.kicker, title: p.kicker, onclick: () => this.goto(i) })));
    const who = s.vault.codename ? `AGENT ${s.vault.codename}` : 'UNNAMED VISITOR';
    this.root = el('div', { class: 'blacklab', role: 'dialog', 'aria-label': `Black Lab — ${IDENTITY.code}` }, [
      plates, heroCanvas, goo,
      el('div', { class: 'bl-vignette' }), el('div', { class: 'bl-scanlines' }), el('div', { class: 'bl-alarm' }),
      el('header', { class: 'bl-hud' }, [
        el('span', { class: 'bl-brand' }, [el('b', { text: 'COLIN' }), ' BLACK LAB']),
        el('span', { class: 'bl-meta', text: `${IDENTITY.code} · LEVEL 4 · ${who} · ${s.vault.signature || ''}` }),
        timer, sound, exit,
      ]),
      el('div', { class: 'bl-custodian' }, [el('span', { class: 'bl-face', 'aria-hidden': 'true' }), el('div', {}, [el('p', { class: 'bl-name', text: 'Colin · custodian' }), caption])]),
      track,
      el('button', { class: 'nav-arrow prev bl-prev', type: 'button', 'aria-label': 'Previous', text: '‹', onclick: () => this.goto(s.lab.panel - 1) }),
      el('button', { class: 'nav-arrow next bl-next', type: 'button', 'aria-label': 'Next', text: '›', onclick: () => this.goto(s.lab.panel + 1) }),
      dots,
      el('p', { class: 'bl-fine', text: 'Educational · not medical advice · no dosing · the vault is theatre, the file is cited' }),
    ]);
    document.body.append(this.root);
    document.body.classList.add('lab-open');
    this.caption = caption;
    this.track = track;
    this.plates = [...plates.children];
    this.dots = [...dots.children];
    this.timer = timer;
    this.built = built;
    this.gooLayer = gooLayer(goo);
    this.gooLayer.resize();
    try { this.hero = hero(heroCanvas, s); this.hero.resize(); } catch (error) { this.hero = null; }
    this.onResize = () => { this.gooLayer.resize(); this.hero?.resize(); };
    addEventListener('resize', this.onResize);
    this.onMove = (e) => {
      const p = e.touches ? e.touches[0] : e;
      if (!p) return;
      s.lab.lookX = (p.clientX / innerWidth - 0.5) * 2;
      s.lab.lookY = (p.clientY / innerHeight - 0.5) * 2;
      this.lastTouch = performance.now();
    };
    addEventListener('pointermove', this.onMove, { passive: true });
    this.onKey = (e) => {
      if (e.key === 'Escape') this.leave();
      if (e.key === 'ArrowRight') this.goto(s.lab.panel + 1);
      if (e.key === 'ArrowLeft') this.goto(s.lab.panel - 1);
    };
    addEventListener('keydown', this.onKey);
    heroCanvas.addEventListener('click', (e) => { const i = this.hero?.pick(e.clientX, e.clientY); if (i) { s.lab.focus = s.lab.focus === i ? null : i; hooks.touch(); } });
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== s.lab.panel) this.arrive(i);
    }, { passive: true });
    sound.addEventListener('click', () => {
      setMuted(!isMuted());
      sound.setAttribute('aria-pressed', String(!isMuted()));
      sound.textContent = isMuted() ? '🔈 Sound off' : '🔊 Sound on';
      if (!isMuted()) startDrone();
    });
    exit.addEventListener('click', () => this.leave());
    startDrone();
    requestAnimationFrame(() => this.root.classList.add('on'));
    this.speak(line('labEnter'));
    setTimeout(() => { if (this.root && s.lab.panel === 0) this.speak(line('labPanel').specimen); }, this.reduced ? 500 : 6500);
    let last = performance.now();
    const loop = (now) => {
      if (!this.root) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      this.gooLayer.step(dt, t);
      this.hero?.render(t, dt);
      this.built.tick();
      const secs = Math.floor((now - this.entered) / 1000);
      this.timer.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
      // The custodian gets twitchy if you linger without doing anything.
      if (now - this.lastTouch > 26000) {
        this.lastTouch = now;
        const nags = line('labNag');
        this.speak(nags[this.nag % nags.length]);
        this.nag += 1;
        this.root.classList.add('alarm');
        setTimeout(() => this.root?.classList.remove('alarm'), 1600);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  speak(text) {
    this.caption.textContent = text;
    return this.say(text);
  }

  goto(i) {
    const n = LAB_PANELS.length;
    const k = Math.max(0, Math.min(n - 1, i));
    this.track.scrollTo({ left: k * this.track.clientWidth, behavior: this.reduced ? 'auto' : 'smooth' });
    setTimeout(() => { if (this.root && this.state.lab.panel !== k) { this.track.style.scrollBehavior = 'auto'; this.track.scrollLeft = k * this.track.clientWidth; this.track.style.scrollBehavior = ''; this.arrive(k); } }, 1200);
  }

  arrive(i) {
    const s = this.state;
    s.lab.panel = i;
    s.lab.focus = null;
    this.lastTouch = performance.now();
    this.plates.forEach((p, k) => p.classList.toggle('on', k === i));
    this.dots.forEach((d, k) => d.classList.toggle('on', k === i));
    beep(220, 0, 0.05, 0.05);
    clearTimeout(this.arriveTimer);
    this.arriveTimer = setTimeout(() => {
      if (this.root && s.lab.panel === i) this.speak(line('labPanel')[LAB_PANELS[i].id]);
    }, 350);
  }

  /** Leave: the custodian's send-off, a memory-wipe glitch, then the chamber. */
  async leave() {
    if (!this.root || this.leaving) return;
    this.leaving = true;
    this.stop();
    this.speak(line('labLeave'));
    this.root.classList.add('wipe');
    stopDrone();
    await new Promise((r) => setTimeout(r, this.reduced ? 300 : 1800));
    this.close();
    this.onClose?.();
  }

  close() {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.arriveTimer);
    removeEventListener('resize', this.onResize);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('keydown', this.onKey);
    this.hero?.dispose();
    this.root.remove();
    this.root = null;
    this.leaving = false;
    this.state.lab.open = false;
    document.body.classList.remove('lab-open');
    stopDrone();
  }
}
