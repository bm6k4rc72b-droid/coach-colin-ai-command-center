/**
 * The chamber: a circular black-and-gold laboratory, seven stations round its
 * wall, each with a curved bank of screens, a pedestal and a hologram.
 *
 * Geometry is generated in code — no model files. Station i stands at angle
 * φᵢ = i·(2π/7) round the room's vertical axis; its local −z points from the
 * centre towards it, so a camera at the origin with yaw φᵢ looks straight at
 * it.
 *
 * @module astra/showcase/room
 */

import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { SITES } from './sections.js';

export const STATION_COUNT = 7;
export const STEP = (Math.PI * 2) / STATION_COUNT;

const GOLD = new THREE.Color('#f0b75a');
const ICE = new THREE.Color('#6fd3ff');

/** Seeded PRNG so every visitor sees the same protein. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour pushed past 1 so the bloom pass picks it up. */
const hot = (color, gain) => color.clone().multiplyScalar(gain);

/** Additive glow material. */
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

/** A soft radial sprite texture, for light pools and particles. */
function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const DOT = radialTexture();

/** Text on a transparent canvas, as a sprite. */
function label(text, { color = '#f3d08a', size = 46, width = 512 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width / 96 * 0.16, 0.16, 1);
  return sprite;
}

/* =================================================================== room */

/**
 * Build the shell: reflective floor, wall, light rings, ceiling, consoles.
 *
 * @param {THREE.Scene} scene Scene to add to.
 * @param {{ reflectorSize: number }} options Quality settings.
 * @returns {{ rings: THREE.Material[], floorGlow: THREE.Mesh }} Animated parts.
 */
function buildShell(scene, { reflectorSize }) {
  // A real mirror under a smoked-glass skin: the gold rings and the screens
  // pool on the floor the way they do on polished stone.
  if (reflectorSize) {
    const mirror = new Reflector(new THREE.CircleGeometry(16, 64), {
      textureWidth: reflectorSize, textureHeight: reflectorSize, color: 0x5a5a5a, clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    scene.add(mirror);
  }
  const smoke = new THREE.Mesh(
    new THREE.CircleGeometry(16, 64),
    new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.6, roughness: 0.35, transparent: true, opacity: reflectorSize ? 0.72 : 1 }),
  );
  smoke.rotation.x = -Math.PI / 2;
  smoke.position.y = 0.004;
  scene.add(smoke);

  // Floor inlays: gold arcs radiating from the centre, as in the reference.
  const inlay = glow(hot(GOLD, 0.9), 0.35);
  for (const radius of [2.4, 4.4, 7.6]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.025, 128), inlay);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
  }
  const floorGlow = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(111,211,255,0.25)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.y = 0.012;
  scene.add(floorGlow);

  // The wall: a dark brushed-metal drum.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(10.6, 10.6, 9.4, 112, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x060608, metalness: 0.7, roughness: 0.5, side: THREE.BackSide }),
  );
  wall.position.y = 4.7;
  scene.add(wall);

  // Light rings: the gold bands that wrap the room at three heights.
  const rings = [];
  for (const [y, radius, gain] of [[0.55, 10.25, 1.5], [5.75, 10.3, 1.7], [6.6, 10.35, 1.2], [8.7, 10.0, 1.0]]) {
    const material = new THREE.MeshBasicMaterial({ color: hot(GOLD, gain) });
    rings.push(material);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.028, 6, 220), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    scene.add(ring);
  }

  // Ceiling: concentric rings, like the iris over the reference room.
  const ceiling = new THREE.Mesh(
    new THREE.CircleGeometry(10.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x060607, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 9.4;
  scene.add(ceiling);
  for (const [radius, gain] of [[2.2, 1.2], [3.6, 0.9], [5.4, 1.4], [7.4, 0.8]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 6, 160), new THREE.MeshBasicMaterial({ color: hot(GOLD, gain) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 9.25;
    scene.add(ring);
  }

  // Vertical ribs between stations, edged in gold.
  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x111114, metalness: 0.9, roughness: 0.3 });
  const ribEdge = new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.1) });
  for (let i = 0; i < STATION_COUNT; i += 1) {
    const angle = i * STEP + STEP / 2;
    const rib = new THREE.Group();
    rib.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 9.4, 0.5), ribMaterial));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 8.6, 0.03), ribEdge);
    edge.position.z = 0.27;
    rib.add(edge);
    rib.position.set(Math.sin(angle) * 10.1, 4.7, -Math.cos(angle) * 10.1);
    rib.rotation.y = -angle;
    scene.add(rib);
  }

  // Fill light. The room is lit mostly by what glows in it.
  scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x1a1206, 0.12));
  const key = new THREE.PointLight(0xffc56b, 6, 22, 1.6);
  key.position.set(0, 8.4, 0);
  scene.add(key);

  return { rings, floorGlow };
}

/** A shared console texture: rows of small instrument readouts. */
function consoleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rand = mulberry32(7);
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 5; i += 1) {
    const x = 8 + i * 101;
    ctx.strokeStyle = 'rgba(240,183,90,0.7)';
    ctx.strokeRect(x, 10, 92, 108);
    ctx.fillStyle = i % 2 ? 'rgba(111,211,255,0.8)' : 'rgba(240,183,90,0.85)';
    for (let r = 0; r < 6; r += 1) ctx.fillRect(x + 8, 22 + r * 15, 20 + rand() * 60, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* =========================================================== holograms */

/** Glass-and-light material for instanced atoms. */
function atomMaterial(envMap, { metal = 0.2, rough = 0.12, emissive = 0.55 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: metal, roughness: rough, envMap, envMapIntensity: 0.45,
    transparent: true, opacity: 0.9, emissive: 0xffffff, emissiveIntensity: emissive * 0.6,
  });
  // Drive emissive from the instance colour so each atom glows its own hue.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif',
    );
  };
  return material;
}

/** Instanced spheres at given positions, one colour each. */
function atoms(points, radius, colors, material) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 14), material, points.length);
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    const r = Array.isArray(radius) ? radius[i] : radius;
    m.makeScale(r, r, r).setPosition(p);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, colors[i]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Station 0 — a folded protein in blue-to-rose glass, as on the centre plinth. */
function proteinHologram(envMap) {
  const rand = mulberry32(42);
  const points = [];
  let p = new THREE.Vector3();
  let dir = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < 170; i += 1) {
    // A persistent random walk confined to an ellipsoid: chain-like, compact.
    dir.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.1)).normalize();
    const next = p.clone().addScaledVector(dir, 0.11);
    const e = new THREE.Vector3(next.x / 0.62, next.y / 0.78, next.z / 0.5);
    if (e.length() > 1) dir.addScaledVector(next, -2.2 / next.length()).normalize();
    p = p.clone().addScaledVector(dir, 0.11);
    points.push(p.clone());
  }
  const blue = new THREE.Color('#4f9dff');
  const rose = new THREE.Color('#ff7a8c');
  const colors = points.map((pt) => blue.clone().lerp(rose, THREE.MathUtils.smoothstep(-pt.y, -0.6, 0.6)));
  const radii = points.map(() => 0.075 + rand() * 0.03);
  const group = new THREE.Group();
  group.add(atoms(points, radii, colors, atomMaterial(envMap)));
  return { group, update: (t, s) => { group.rotation.y = t * 0.25 * s.speed; } };
}

/** Station 1 — a gold peptide backbone with a scan wave running along it. */
function chainHologram(envMap) {
  const count = 150;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const u = (i / (count - 1)) * Math.PI * 2;
    points.push(new THREE.Vector3(
      1.05 * Math.sin(u) + 0.28 * Math.sin(3 * u),
      0.42 * Math.sin(2 * u) + 0.12 * Math.cos(5 * u),
      0.5 * Math.cos(u) - 0.18 * Math.cos(2 * u),
    ));
  }
  // Side chains every few residues.
  const sides = [];
  points.forEach((pt, i) => {
    if (i % 9) return;
    const out = pt.clone().setY(0).normalize().multiplyScalar(0.13);
    sides.push(pt.clone().add(out).add(new THREE.Vector3(0, 0.1, 0)));
    sides.push(pt.clone().addScaledVector(out, 2).add(new THREE.Vector3(0, 0.17, 0)));
  });
  const all = [...points, ...sides];
  const radii = all.map((_, i) => (i < count ? 0.058 : 0.04));
  const base = GOLD.clone();
  const mesh = atoms(all, radii, all.map(() => base), atomMaterial(envMap, { metal: 0.85, rough: 0.28, emissive: 0.7 }));
  const group = new THREE.Group();
  group.add(mesh);
  const scratch = new THREE.Color();
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.2) * 0.5 + s.lookX * 0.6;
      const wave = (t * 0.35) % 1;
      for (let i = 0; i < count; i += 1) {
        const d = Math.min(Math.abs(i / count - wave), 1 - Math.abs(i / count - wave));
        scratch.copy(base).multiplyScalar(0.55 + 2.4 * Math.exp(-(d * d) / 0.0012));
        if (s.highlight) scratch.lerp(s.highlight, 0.35);
        mesh.setColorAt(i, scratch);
      }
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

/** A coiled α-helix as a tube. */
function helixTube(height, coil, turns, tube, material) {
  const pts = [];
  const steps = Math.round(turns * 24);
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const a = u * turns * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * coil, (u - 0.5) * height, Math.sin(a) * coil));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps * 2, tube, 8, false), material);
}

/**
 * Station 2 — the GLP-1 receptor: seven transmembrane helices in a membrane,
 * an extracellular domain, and a ligand that docks in two steps.
 */
function receptorHologram(envMap) {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.25, envMap, emissive: GOLD, emissiveIntensity: 0.45, transparent: true, opacity: 0.95 });
  // Seven helices round a pore, each tilted a little, as in the cryo-EM map.
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const h = helixTube(1.15, 0.05, 3.2, 0.024, gold);
    h.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
    h.rotation.z = Math.cos(a) * 0.16;
    h.rotation.x = Math.sin(a) * 0.16;
    group.add(h);
  }
  // Membrane: two leaflets of lipid heads.
  const lipidPositions = [];
  const rand = mulberry32(11);
  for (const y of [-0.58, 0.58]) {
    for (let i = 0; i < 520; i += 1) {
      const r = 0.46 + Math.sqrt(rand()) * 0.75;
      const a = rand() * Math.PI * 2;
      lipidPositions.push(Math.cos(a) * r, y + (rand() - 0.5) * 0.04, Math.sin(a) * r);
    }
  }
  const lipidGeometry = new THREE.BufferGeometry();
  lipidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lipidPositions, 3));
  group.add(new THREE.Points(lipidGeometry, new THREE.PointsMaterial({ map: DOT, size: 0.07, color: hot(GOLD, 0.9), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // Extracellular domain: a compact lobe above the membrane.
  const ecdPoints = [];
  for (let i = 0; i < 40; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.2;
    ecdPoints.push(new THREE.Vector3(0.22 + Math.cos(a) * r, 0.92 + (rand() - 0.5) * 0.3, Math.sin(a) * r));
  }
  group.add(atoms(ecdPoints, 0.06, ecdPoints.map(() => GOLD), atomMaterial(envMap, { metal: 0.8, rough: 0.3, emissive: 0.5 })));
  // The ligand: a blue helix.
  const ligand = helixTube(0.8, 0.04, 2.6, 0.03, new THREE.MeshStandardMaterial({ color: ICE, emissive: ICE, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.2, envMap }));
  group.add(ligand);
  // cAMP: sparks released below the membrane once the receptor is engaged.
  const sparkCount = 90;
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(sparkCount * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.06, color: hot(ICE, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(sparks);
  const seeds = Array.from({ length: sparkCount }, () => [rand() * Math.PI * 2, rand(), rand()]);
  return {
    group,
    /** Docking phase in [0, 1): descend, dock on ECD, insert, signal, release. */
    phase: 0,
    update(t, s) {
      group.rotation.y = t * 0.18 * s.speed + s.lookX * 0.5;
      const cycle = (t * 0.12) % 1;
      this.phase = cycle;
      const ease = THREE.MathUtils.smoothstep;
      // 0–.3 approach the ECD, .3–.5 N-terminus slides into the core, .5–.85 signal, .85–1 release.
      const dock = new THREE.Vector3(0.1, 1.05, 0);
      const core = new THREE.Vector3(0, 0.3, 0);
      const start = new THREE.Vector3(0.9, 2.0, 0.3);
      let pos;
      if (cycle < 0.3) pos = start.clone().lerp(dock, ease(cycle, 0, 0.3));
      else if (cycle < 0.5) pos = dock.clone().lerp(core, ease(cycle, 0.3, 0.5));
      else if (cycle < 0.85) pos = core.clone();
      else pos = core.clone().lerp(start, ease(cycle, 0.85, 1));
      ligand.position.copy(pos);
      ligand.rotation.z = cycle < 0.3 ? 0.9 * (1 - ease(cycle, 0, 0.3)) : 0;
      const signalling = cycle > 0.5 && cycle < 0.95 ? 1 : 0;
      const array = sparks.geometry.attributes.position.array;
      seeds.forEach(([a, r, d], i) => {
        const life = ((t * 0.5 + d) % 1);
        const radius = 0.1 + r * 0.6 * life;
        array[i * 3] = Math.cos(a + life) * radius;
        array[i * 3 + 1] = -0.7 - life * 0.6;
        array[i * 3 + 2] = Math.sin(a + life) * radius;
      });
      sparks.geometry.attributes.position.needsUpdate = true;
      sparks.material.opacity = THREE.MathUtils.lerp(sparks.material.opacity, signalling, 0.08);
    },
  };
}

/** Station 3 — three receptor rings and the agonist that reaches them. */
function agonistHologram(envMap) {
  const group = new THREE.Group();
  const ids = ['GLP-1R', 'GIPR', 'GCGR'];
  const anchors = ids.map((_, i) => {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    return new THREE.Vector3(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
  });
  const rings = ids.map((id, i) => {
    const material = new THREE.MeshBasicMaterial({ color: hot(GOLD, 0.6) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 10, 64), material);
    ring.position.copy(anchors[i]);
    group.add(ring);
    const tag = label(id, { size: 40, width: 320 });
    tag.position.copy(anchors[i]).add(new THREE.Vector3(0, -0.4, 0));
    tag.scale.multiplyScalar(1.2);
    group.add(tag);
    return { ring, material };
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 40, 28),
    new THREE.MeshStandardMaterial({ color: ICE, emissive: ICE, emissiveIntensity: 0.8, metalness: 0.1, roughness: 0.05, envMap, transparent: true, opacity: 0.9 }),
  );
  group.add(core);
  const beams = anchors.map((anchor) => {
    const length = anchor.length() - 0.3;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, length, 8), glow(hot(ICE, 2), 0));
    beam.position.copy(anchor).multiplyScalar((0.24 + length / 2) / anchor.length());
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().normalize());
    group.add(beam);
    return beam;
  });
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.3) * 0.35 + s.lookX * 0.5;
      group.rotation.x = s.lookY * 0.3;
      const targets = s.agonist?.targets || [];
      rings.forEach(({ ring, material }, i) => {
        const on = targets.includes(ids[i]);
        material.color.lerp(on ? hot(GOLD, 2.6) : hot(GOLD, 0.35), 0.1);
        ring.rotation.z = t * (on ? 1.4 : 0.2);
        beams[i].material.opacity = THREE.MathUtils.lerp(beams[i].material.opacity, on ? 0.65 + 0.3 * Math.sin(t * 6 + i) : 0, 0.12);
      });
      core.scale.setScalar(1 + 0.06 * Math.sin(t * 2.4));
    },
  };
}

/** Station 4 — a chain growing residue by residue from a resin bead. */
function synthesisHologram(envMap) {
  const group = new THREE.Group();
  const resin = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a5a1c, metalness: 0.6, roughness: 0.4, envMap, emissive: 0x3a2206, emissiveIntensity: 1 }),
  );
  resin.position.set(-0.75, -0.75, 0);
  group.add(resin);
  const max = 60;
  const path = [];
  for (let i = 0; i < max; i += 1) {
    const u = i / (max - 1);
    const a = u * Math.PI * 7;
    path.push(new THREE.Vector3(-0.75 + u * 1.5 + Math.cos(a) * 0.16, -0.42 + u * 1.25 + Math.sin(a) * 0.08, Math.sin(a) * 0.16));
  }
  const material = atomMaterial(envMap, { metal: 0.5, rough: 0.2, emissive: 0.75 });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), material, max);
  const m = new THREE.Matrix4();
  const colorA = ICE.clone();
  const colorB = GOLD.clone();
  for (let i = 0; i < max; i += 1) mesh.setColorAt(i, colorA.clone().lerp(colorB, i / max));
  group.add(mesh);
  // The yield gauge: an arc whose sweep is the full-length fraction Y.
  let arc = null;
  const arcMaterial = new THREE.MeshBasicMaterial({ color: hot(GOLD, 2.2) });
  const track = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.012, 6, 128), glow(hot(GOLD, 0.6), 0.35));
  group.add(track);
  let shownYield = -1;
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.25) * 0.3 + s.lookX * 0.5;
      const length = s.length;
      // Grow at ~6 residues a second, hold, then start again.
      const period = length / 6 + 1.6;
      const grown = Math.min(length, Math.floor(((t % period) / (period - 1.6)) * length) + 1);
      for (let i = 0; i < max; i += 1) {
        const visible = i < grown && i < length;
        const pop = i === grown - 1 ? 1.35 : 1;
        const r = visible ? 0.055 * pop : 0.00001;
        m.makeScale(r, r, r).setPosition(path[Math.round((i / Math.max(1, length - 1)) * (max - 1))] || path[max - 1]);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (Math.abs(shownYield - s.yield) > 0.0005) {
        shownYield = s.yield;
        if (arc) { group.remove(arc); arc.geometry.dispose(); }
        arc = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.035, 8, 160, Math.max(0.001, Math.PI * 2 * s.yield)), arcMaterial);
        arc.rotation.z = Math.PI / 2;
        arc.scale.x = -1;
        group.add(arc);
      }
    },
  };
}

/** Station 5 — a holographic body with the incretin action sites lit. */
function bodyHologram() {
  const group = new THREE.Group();
  const shell = new THREE.MeshBasicMaterial({ color: hot(ICE, 0.9), wireframe: true, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const fill = new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending });
  const part = (geometry, x, y, z, rx = 0, rz = 0) => {
    for (const material of [shell, fill]) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      group.add(mesh);
    }
  };
  // A 1.75 m figure, built from capsules.
  part(new THREE.SphereGeometry(0.11, 16, 12), 0, 1.63, 0);
  part(new THREE.CapsuleGeometry(0.045, 0.06, 4, 10), 0, 1.47, 0);
  part(new THREE.CapsuleGeometry(0.16, 0.42, 6, 16), 0, 1.13, 0);
  part(new THREE.CapsuleGeometry(0.14, 0.1, 6, 16), 0, 0.84, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.045, 0.28, 4, 10), side * 0.25, 1.22, 0, 0, side * 0.18);
    part(new THREE.CapsuleGeometry(0.04, 0.26, 4, 10), side * 0.31, 0.9, 0.02, 0, side * 0.08);
    part(new THREE.CapsuleGeometry(0.065, 0.36, 4, 10), side * 0.1, 0.5, 0);
    part(new THREE.CapsuleGeometry(0.05, 0.36, 4, 10), side * 0.1, 0.12, 0);
  }
  const markers = SITES.map((site) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: hot(GOLD, 2.2) }));
    dot.position.set(...site.at);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 40), glow(hot(GOLD, 2.4), 0));
    halo.position.copy(dot.position);
    group.add(dot, halo);
    return { id: site.id, dot, halo };
  });
  // Feet just above the pedestal lip once the station lifts it by 1.95.
  group.position.y = -1.3;
  group.scale.setScalar(1.12);
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.22) * 0.6 + s.lookX * 0.8;
      for (const marker of markers) {
        const on = marker.id === s.site;
        const pulse = 1 + 0.35 * Math.sin(t * 5 + marker.dot.position.y * 10);
        marker.dot.scale.setScalar((on ? 1.8 : 1) * pulse);
        marker.halo.material.opacity = on ? 0.9 : 0;
        marker.halo.scale.setScalar(1 + ((t * 0.8) % 1) * 1.6);
        marker.halo.quaternion.copy(group.quaternion).invert();
      }
    },
  };
}

/** Station 6 — gold B-DNA: 10.5 base pairs per turn, a reading frame sweeping it. */
function dnaHologram(envMap) {
  const group = new THREE.Group();
  const pairs = 42;
  const rise = 2.3 / pairs;
  const twist = (Math.PI * 2) / 10.5;
  const radius = 0.34;
  const strand = [];
  for (let i = 0; i < pairs; i += 1) {
    const a = i * twist;
    const y = (i - pairs / 2) * rise;
    // The second strand sits ~150° round, which opens the major and minor grooves.
    strand.push(new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius));
    strand.push(new THREE.Vector3(Math.cos(a + 2.6) * radius, y, Math.sin(a + 2.6) * radius));
  }
  const mesh = atoms(strand, 0.05, strand.map(() => GOLD), atomMaterial(envMap, { metal: 0.85, rough: 0.25, emissive: 0.6 }));
  group.add(mesh);
  const rungMaterial = new THREE.MeshStandardMaterial({ color: ICE, emissive: ICE, emissiveIntensity: 0.7, transparent: true, opacity: 0.75, envMap });
  const rungs = [];
  for (let i = 0; i < pairs; i += 1) {
    const a = strand[i * 2];
    const b = strand[i * 2 + 1];
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, a.distanceTo(b), 6), rungMaterial.clone());
    rung.position.copy(a).add(b).multiplyScalar(0.5);
    rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(rung);
    rungs.push(rung);
  }
  const bright = GOLD.clone();
  const scratch = new THREE.Color();
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.45 * s.speed + s.lookX * 0.6;
      const frame = ((t * 0.12) % 1) * pairs;
      for (let i = 0; i < pairs; i += 1) {
        const near = Math.exp(-((i - frame) ** 2) / 6);
        scratch.copy(bright).multiplyScalar(0.6 + 2.2 * near);
        mesh.setColorAt(i * 2, scratch);
        mesh.setColorAt(i * 2 + 1, scratch);
        rungs[i].material.emissiveIntensity = 0.5 + 2.5 * near;
      }
      mesh.instanceColor.needsUpdate = true;
    },
  };
}

const HOLOGRAMS = {
  chamber: proteinHologram,
  analysis: chainHologram,
  receptor: receptorHologram,
  agonists: agonistHologram,
  synthesis: synthesisHologram,
  telemetry: bodyHologram,
  genome: dnaHologram,
};

/* ============================================================== stations */

/**
 * Build one station: screen bank, consoles, pedestal, hologram.
 *
 * @returns {object} The station handle.
 */
function buildStation(scene, index, id, { envMap, screenCanvas, consoleTex, logo }) {
  const group = new THREE.Group();
  group.rotation.y = -index * STEP;
  scene.add(group);

  // Main screen, slightly curved so it reads as part of the drum.
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = 4;
  const curve = new THREE.CylinderGeometry(9.7, 9.7, 3.5, 24, 1, true, Math.PI - 0.33, 0.66);
  // Viewed from inside, a cylinder's u runs right-to-left; flip it back.
  const uv = curve.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setX(i, 1 - uv.getX(i));
  const screen = new THREE.Mesh(curve, new THREE.MeshBasicMaterial({ map: screenTexture, side: THREE.BackSide, color: new THREE.Color(0.95, 0.95, 0.95) }));
  screen.position.y = 3.62;
  group.add(screen);
  // Its frame: gold edges top and bottom.
  for (const y of [1.84, 5.4]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(9.66, 0.02, 6, 48, 0.68), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.4) }));
    edge.rotation.x = Math.PI / 2;
    edge.rotation.z = Math.PI / 2 - 0.34 + Math.PI;
    edge.position.y = y;
    group.add(edge);
  }

  // A row of instrument consoles beneath it.
  for (let k = -2; k <= 2; k += 1) {
    const a = k * 0.12;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.36), new THREE.MeshBasicMaterial({ map: consoleTex, color: new THREE.Color(0.9, 0.9, 0.9) }));
    panel.position.set(Math.sin(a) * 9.1, 0.95, -Math.cos(a) * 9.1);
    panel.lookAt(0, 2.3, 0);
    group.add(panel);
  }

  // The logo over the first station, as in the reference.
  if (logo) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    sign.position.set(0, 7.3, -9.9);
    group.add(sign);
  }

  // Pedestal: dark drum, glowing lip, light pool, rising motes.
  const pedestal = new THREE.Group();
  pedestal.position.set(0, 0, -5.5);
  group.add(pedestal);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.6, 64), new THREE.MeshStandardMaterial({ color: 0x07070a, metalness: 0.9, roughness: 0.35, envMap, envMapIntensity: 0.18 }));
  drum.position.y = 0.3;
  pedestal.add(drum);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: hot(ICE, 1.6) }));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.62;
  pedestal.add(lip);
  const goldLip = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.02, 8, 96), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.4) }));
  goldLip.rotation.x = Math.PI / 2;
  goldLip.position.y = 0.06;
  pedestal.add(goldLip);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(111,211,255,0.45)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.625;
  pedestal.add(pool);
  const scan = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 2.6, 48, 1, true), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(111,211,255,0.16)', 'rgba(111,211,255,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.25 }));
  scan.position.y = 1.92;
  pedestal.add(scan);
  const moteCount = 70;
  const motes = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(moteCount * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.05, color: hot(ICE, 1.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pedestal.add(motes);
  const rand = mulberry32(100 + index);
  const moteSeeds = Array.from({ length: moteCount }, () => [rand() * Math.PI * 2, Math.sqrt(rand()) * 0.9, rand()]);

  const holo = HOLOGRAMS[id](envMap);
  holo.group.position.y += 1.95;
  pedestal.add(holo.group);

  return {
    id, index, group, pedestal, holo, screenTexture, screenCanvas, scan,
    pulse: 0,
    update(t, state) {
      const array = motes.geometry.attributes.position.array;
      moteSeeds.forEach(([a, r, d], i) => {
        const life = (t * 0.18 + d) % 1;
        array[i * 3] = Math.cos(a) * r;
        array[i * 3 + 1] = 0.64 + life * 2.6;
        array[i * 3 + 2] = Math.sin(a) * r;
      });
      motes.geometry.attributes.position.needsUpdate = true;
      holo.update(t, state);
      // Tap pulse: a quick swell that decays.
      this.pulse *= 0.93;
      holo.group.scale.setScalar(1 + this.pulse * 0.18);
      lip.material.color.copy(hot(ICE, 1.6 + this.pulse * 4));
    },
  };
}

/** The COLIN · BIOMEDICAL TECHNOLOGIES sign, drawn once. */
function logoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 40, 0, 170);
  gradient.addColorStop(0, '#fff1c4');
  gradient.addColorStop(0.5, '#e9b24f');
  gradient.addColorStop(1, '#9a6a1e');
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(240,183,90,0.8)';
  ctx.shadowBlur = 24;
  ctx.fillStyle = gradient;
  ctx.font = 'italic 800 132px Inter, system-ui, sans-serif';
  ctx.fillText('COLIN', 512, 150);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#e9c27a';
  ctx.font = '600 34px Inter, system-ui, sans-serif';
  ctx.fillText('B I O M E D I C A L   T E C H N O L O G I E S', 512, 214);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the whole chamber.
 *
 * @param {THREE.Scene} scene Target scene.
 * @param {{ envMap: THREE.Texture, ids: string[], canvases: HTMLCanvasElement[], reflectorSize: number }} options Build options.
 * @returns {{ stations: object[], update: Function }} The room.
 */
export function buildRoom(scene, { envMap, ids, canvases, reflectorSize }) {
  scene.background = new THREE.Color(0x020203);
  scene.fog = new THREE.Fog(0x020203, 14, 30);
  const shell = buildShell(scene, { reflectorSize });
  const consoleTex = consoleTexture();
  const logo = logoTexture();
  const stations = ids.map((id, index) => buildStation(scene, index, id, {
    envMap, screenCanvas: canvases[index], consoleTex, logo: index === 0 ? logo : null,
  }));
  return {
    stations,
    update(t, state) {
      shell.rings.forEach((material, i) => material.color.copy(hot(GOLD, 1.1 + 0.4 * Math.sin(t * 0.8 + i * 1.3))));
      shell.floorGlow.material.opacity = 0.6 + 0.2 * Math.sin(t * 1.1);
      for (const station of stations) station.update(t, state);
    },
  };
}
