/**
 * Holograms for the reception pedestal and the seven tool stations.
 *
 * Each builder returns `{ group, update(t, state) }`. The group is placed on
 * its station's pedestal with its origin about 1.95 m above the floor; the
 * update reads the shared interaction state, so a choice made in a station's
 * card moves its hologram.
 *
 * @module astra/showcase/holograms
 */

import * as THREE from 'three';
import { PEPTIDES, SYSTEMS } from '../js/data/peptides.js';
import { REVIEWERS } from '../js/reviewers.js';
import { TIERS } from '../js/evidence.js';
import { PLATES, READINGS, STUDIES } from './sections.js';
import { DOT, GOLD, ICE, atomMaterial, glow, hot, label, mulberry32 } from './kit.js';

const RED = new THREE.Color('#ff5a5a');
const GREEN = new THREE.Color('#3ef0b4');

/* ============================================================ reception */

/**
 * Where the receptionist stands in the reception plate, in texture UV space
 * (u left→right, v bottom→top, as WebGL samples it).
 */
const COLIN_CROP = { u0: 0.418, u1: 0.628, v0: 0.29, v1: 0.835 };

/**
 * The receptionist: the caped figure from the reception plate, lifted off
 * the photograph by a luminance key and re-lit as a hologram — scanlines,
 * flicker, a voice ring at his feet, and a glitch band when he speaks.
 */
function colinHologram() {
  const group = new THREE.Group();
  // The station positions `group`; he bobs inside it.
  const body = new THREE.Group();
  group.add(body);
  const texture = new THREE.TextureLoader().load(PLATES.reception);
  texture.colorSpace = THREE.SRGBColorSpace;
  const aspect = ((COLIN_CROP.u1 - COLIN_CROP.u0) * 2352) / ((COLIN_CROP.v1 - COLIN_CROP.v0) * 1008);
  const height = 2.45;
  const uniforms = {
    map: { value: texture },
    crop: { value: new THREE.Vector4(COLIN_CROP.u0, COLIN_CROP.v0, COLIN_CROP.u1, COLIN_CROP.v1) },
    time: { value: 0 },
    speak: { value: 0 },
    layer: { value: 1 },
  };
  const material = (layer) => new THREE.ShaderMaterial({
    uniforms: { ...uniforms, layer: { value: layer } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map; uniform vec4 crop; uniform float time, speak, layer;
      varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        vec2 uv = vec2(mix(crop.x, crop.z, vUv.x), mix(crop.y, crop.w, vUv.y));
        // A glitch band slides through while he talks.
        float row = floor(vUv.y * 90.0 + time * 14.0);
        uv.x += step(0.975, hash(row)) * (speak * 0.006 + 0.0008) * (hash(row + 3.0) - 0.5) * 2.0;
        vec3 c = texture2D(map, uv).rgb;
        float lum = dot(c, vec3(0.299, 0.587, 0.114));
        // Key the figure off the dark room: bright and cool survives, the
        // dim set behind him falls away.
        float key = smoothstep(0.07, 0.3, lum + max(0.0, c.b - c.r) * 0.35);
        // The room's warm light rings run behind him; drop warm light except
        // around his emblem and eye, which are meant to glow gold and red.
        float emblem = 1.0 - smoothstep(0.08, 0.16, distance(vUv * vec2(0.8, 1.0), vec2(0.27, 0.74)));
        key *= mix(1.0 - smoothstep(0.04, 0.22, c.r - c.b), 1.0, emblem);
        vec2 edge = smoothstep(vec2(0.0), vec2(0.1, 0.06), vUv) * smoothstep(vec2(0.0), vec2(0.1, 0.015), 1.0 - vUv);
        float scan = 0.8 + 0.2 * sin(vUv.y * 420.0 - time * 7.0);
        float flicker = 0.93 + 0.07 * sin(time * 31.0) * sin(time * 7.3);
        vec3 holo = mix(c, vec3(0.42, 0.78, 1.0) * (lum * 1.7 + 0.05), 0.22);
        float a = key * edge.x * edge.y * layer;
        gl_FragColor = vec4(holo * scan * flicker * (1.05 + speak * 0.45), a);
      }`,
  });
  // Three stacked layers a few centimetres apart: as the camera moves they
  // part slightly, which reads as volume rather than a poster.
  const layers = [[0, 1], [-0.06, 0.35], [-0.12, 0.18]].map(([z, layer]) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), material(layer));
    mesh.position.set(0, -0.12, z);
    body.add(mesh);
    return mesh;
  });
  // Voice rings at his feet.
  const rings = [0, 1, 2].map((i) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.52, 64), glow(hot(GOLD, 2), 0));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.3 + i * 0.002;
    group.add(ring);
    return ring;
  });
  const base = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 96), glow(hot(GOLD, 1.6), 0.8));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -1.31;
  group.add(base);
  return {
    group,
    update(t, s) {
      const speak = s.speak || 0;
      for (const mesh of layers) {
        mesh.material.uniforms.time.value = t;
        mesh.material.uniforms.speak.value = speak;
      }
      // He turns, very slightly, toward whoever is moving the room.
      body.rotation.y = s.lookX * 0.25;
      body.position.y = 0.03 * Math.sin(t * 1.3);
      rings.forEach((ring, i) => {
        const phase = (t * 0.9 + i / 3) % 1;
        ring.scale.setScalar(1 + phase * 1.6);
        ring.material.opacity = (0.15 + speak * 0.85) * (1 - phase);
      });
    },
  };
}

/* ================================================================== map */

/** Points spread evenly on a sphere (Fibonacci lattice). */
function fibonacci(count, radius) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    return new THREE.Vector3(Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius);
  });
}

/** Station 1 — compounds on an outer shell, body systems inside, a thread per link. */
function mapHologram(envMap) {
  const group = new THREE.Group();
  const compoundAt = fibonacci(PEPTIDES.length, 0.95);
  const systemAt = fibonacci(SYSTEMS.length, 0.42);
  const sysIndex = new Map(SYSTEMS.map((s, i) => [s.id, i]));
  const scoreOf = new Map(READINGS.map((r) => [r.id, r]));
  const nodeMaterial = atomMaterial(envMap, { metal: 0.6, rough: 0.25, emissive: 0.9 });
  const compounds = PEPTIDES.map((peptide, i) => {
    const reading = scoreOf.get(peptide.id);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05 + reading.score * 0.06, 20, 14), nodeMaterial.clone());
    mesh.material.color.set(reading.band.accent);
    mesh.material.emissive.set(reading.band.accent);
    mesh.position.copy(compoundAt[i]);
    group.add(mesh);
    return { id: peptide.id, mesh };
  });
  for (const at of systemAt) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: hot(ICE, 1.8) }));
    mesh.position.copy(at);
    group.add(mesh);
  }
  // One line per compound→system link, plus compound→related links.
  const positions = [];
  const owners = [];
  PEPTIDES.forEach((peptide, i) => {
    for (const system of peptide.systems) {
      const j = sysIndex.get(system);
      if (j === undefined) continue;
      positions.push(...compoundAt[i].toArray(), ...systemAt[j].toArray());
      owners.push(peptide.id, peptide.id);
    }
    for (const rel of peptide.related || []) {
      const k = PEPTIDES.findIndex((p) => p.id === rel);
      if (k < 0) continue;
      positions.push(...compoundAt[i].toArray(), ...compoundAt[k].toArray());
      owners.push(peptide.id, rel);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colors = new Float32Array(positions.length);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  group.add(lines);
  let shown = null;
  const paint = (selected) => {
    for (let v = 0; v < owners.length; v += 2) {
      const lit = !selected || owners[v] === selected || owners[v + 1] === selected;
      const c = lit ? (selected ? hot(GOLD, 1.6) : GOLD.clone().multiplyScalar(0.55)) : new THREE.Color(0.05, 0.07, 0.1);
      for (const w of [v, v + 1]) colors.set([c.r, c.g, c.b], w * 3);
    }
    geometry.attributes.color.needsUpdate = true;
  };
  paint(null);
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.12 * s.speed + s.lookX * 0.6;
      group.rotation.x = s.lookY * 0.3;
      if (shown !== s.mapSelected) { shown = s.mapSelected; paint(shown); }
      for (const node of compounds) {
        const on = node.id === s.mapSelected;
        node.mesh.scale.setScalar(on ? 1.7 + 0.15 * Math.sin(t * 5) : 1);
      }
    },
  };
}

/* ============================================================== compare */

/** Station 3 — a balance: the side with the stronger evidence sinks. */
function compareHologram(envMap) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.3, envMap, emissive: GOLD, emissiveIntensity: 0.25 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 1.5, 16), metal);
  post.position.y = -0.55;
  group.add(post);
  const pivot = new THREE.Group();
  pivot.position.y = 0.22;
  group.add(pivot);
  pivot.add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.035, 0.035), metal));
  const pans = [-0.82, 0.82].map((x) => {
    const hanger = new THREE.Group();
    hanger.position.x = x;
    pivot.add(hanger);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), metal);
    chain.position.y = -0.25;
    hanger.add(chain);
    const pan = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.8) }));
    pan.rotation.x = Math.PI / 2;
    pan.position.y = -0.5;
    hanger.add(pan);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 24), new THREE.MeshStandardMaterial({ color: ICE, emissive: ICE, emissiveIntensity: 0.7, metalness: 0.1, roughness: 0.08, envMap, transparent: true, opacity: 0.9 }));
    orb.position.y = -0.36;
    hanger.add(orb);
    const tag = label('—', { size: 40, width: 384 });
    tag.position.y = -0.82;
    hanger.add(tag);
    return { hanger, orb, tag, name: null };
  });
  let angle = 0;
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.2) * 0.2 + s.lookX * 0.4;
      const c = s.compare;
      if (!c) return;
      // Heavier evidence sinks: a stronger right pan tips the beam clockwise.
      const target = THREE.MathUtils.clamp((c.left.score - c.right.score) * 1.1, -0.34, 0.34);
      angle += (target - angle) * 0.05;
      pivot.rotation.z = angle;
      [c.left, c.right].forEach((side, i) => {
        const pan = pans[i];
        pan.hanger.rotation.z = -angle; // pans hang plumb
        pan.orb.material.color.set(side.accent);
        pan.orb.material.emissive.set(side.accent);
        pan.orb.scale.setScalar(0.55 + side.score * 0.8);
        if (pan.name !== side.name) {
          pan.name = side.name;
          const fresh = label(`${side.name} · ${Math.round(side.score * 100)}%`, { size: 38, width: 512 });
          fresh.position.copy(pan.tag.position);
          pan.hanger.remove(pan.tag);
          pan.tag.material.map.dispose();
          pan.tag = fresh;
          pan.hanger.add(fresh);
        }
      });
    },
  };
}

/* =============================================================== debate */

/** Station 4 — a round table, four reviewers, the compound in the middle. */
function debateHologram(envMap) {
  const group = new THREE.Group();
  const table = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.018, 8, 96), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.8) }));
  table.rotation.x = Math.PI / 2;
  table.position.y = -0.55;
  group.add(table);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.8, 64), new THREE.MeshBasicMaterial({ color: 0x0a1a2c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = -0.56;
  group.add(top);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.1, envMap, transparent: true, opacity: 0.9 }));
  crystal.position.y = -0.1;
  group.add(crystal);
  const seats = REVIEWERS.map((reviewer, i) => {
    const a = Math.PI / 2 + (i / REVIEWERS.length) * Math.PI * 2;
    const color = new THREE.Color(reviewer.accent);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 28, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.1, envMap }));
    orb.position.set(Math.cos(a) * 0.8, -0.28, Math.sin(a) * 0.8);
    group.add(orb);
    const tag = label(reviewer.name.replace(' Reviewer', ''), { size: 34, width: 512, color: reviewer.accent });
    tag.position.copy(orb.position).add(new THREE.Vector3(0, 0.28, 0));
    tag.scale.multiplyScalar(0.8);
    group.add(tag);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 6), glow(hot(color, 2), 0));
    beam.position.copy(orb.position).multiplyScalar(0.5).setY(-0.19);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), crystal.position.clone().sub(orb.position).normalize());
    group.add(beam);
    return { orb, beam };
  });
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.1 * s.speed + s.lookX * 0.5;
      crystal.rotation.y = t * 0.8;
      if (s.debate?.accent) {
        crystal.material.color.set(s.debate.accent);
        crystal.material.emissive.set(s.debate.accent);
      }
      seats.forEach((seat, i) => {
        const on = s.debate?.speaker === i;
        const talk = on ? 1 + 0.18 * Math.sin(t * 9) * (0.4 + (s.speak || 0)) : 1;
        seat.orb.scale.setScalar(on ? 1.35 * talk : 0.9);
        seat.orb.material.emissiveIntensity = on ? 1.4 : 0.35;
        seat.beam.material.opacity = THREE.MathUtils.lerp(seat.beam.material.opacity, on ? 0.8 : 0, 0.12);
      });
    },
  };
}

/* ================================================================= myth */

/** Station 5 — a glass sphere of shards that shatters when a claim fails. */
function mythHologram() {
  const group = new THREE.Group();
  const source = new THREE.IcosahedronGeometry(0.62, 1);
  const pos = source.attributes.position;
  const shardMaterial = new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.1), transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: hot(GOLD, 2.2), transparent: true, opacity: 0.9 });
  const rand = mulberry32(5);
  const shards = [];
  for (let f = 0; f < pos.count; f += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, f);
    const b = new THREE.Vector3().fromBufferAttribute(pos, f + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, f + 2);
    const centre = a.clone().add(b).add(c).divideScalar(3);
    const g = new THREE.BufferGeometry().setFromPoints([a.sub(centre), b.sub(centre), c.sub(centre)]);
    const mesh = new THREE.Mesh(g, shardMaterial);
    mesh.add(new THREE.LineLoop(g, edgeMaterial));
    mesh.position.copy(centre);
    group.add(mesh);
    shards.push({ mesh, home: centre.clone(), dir: centre.clone().normalize(), spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(6), speed: 0.6 + rand() * 0.9 });
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshBasicMaterial({ color: hot(ICE, 1.6) }));
  group.add(core);
  const tint = { idle: ICE, supported: GREEN, mixed: GOLD, overstated: GOLD, contradicted: RED, unsupported: RED, unknown: ICE };
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.25 * s.speed + s.lookX * 0.5;
      const myth = s.myth || { level: 'idle', at: -10 };
      const fails = ['contradicted', 'unsupported', 'overstated'].includes(myth.level);
      // Burst out over ~0.6 s, hang, then drift home over ~3 s.
      const age = t - myth.at;
      const out = fails ? (age < 0.6 ? THREE.MathUtils.smoothstep(age, 0, 0.6) : Math.max(0, 1 - (age - 2.2) / 3)) : 0;
      for (const shard of shards) {
        const d = out * shard.speed * 0.9;
        shard.mesh.position.copy(shard.home).addScaledVector(shard.dir, d);
        shard.mesh.rotation.set(shard.spin.x * out, shard.spin.y * out, shard.spin.z * out);
      }
      core.material.color.copy(hot(tint[myth.level] || ICE, 1.6 + (fails ? out * 2 : 0.4 * Math.sin(t * 3))));
      core.scale.setScalar(myth.level === 'supported' ? 1.3 + 0.08 * Math.sin(t * 4) : 1);
    },
  };
}

/* ============================================================ simulator */

/** Station 6 — 100 positive findings from your design; red ones are false. */
function simulatorHologram() {
  const group = new THREE.Group();
  const count = 100;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) mesh.setColorAt(i, color.set(0xffffff));
  group.add(mesh);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), new THREE.MeshBasicMaterial({ color: hot(ICE, 1.8) }));
  bar.position.set(0.95, 0, 0);
  group.add(bar);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.32, 0.14), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.2), wireframe: true }));
  frame.position.set(0.95, 0, 0);
  group.add(frame);
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.3) * 0.35 + s.lookX * 0.5;
      group.rotation.x = s.lookY * 0.2;
      const sim = s.sim || { fpr: 0.5, power: 0.5, at: 0 };
      const wrong = Math.round(sim.fpr * 100);
      const age = t - (sim.at || 0);
      for (let i = 0; i < count; i += 1) {
        const row = Math.floor(i / 10);
        const col = i % 10;
        // A ripple runs across the grid whenever the design changes.
        const wave = Math.max(0, 1 - Math.abs(age * 6 - (row + col) * 0.5)) * 0.25;
        m.makeTranslation((col - 4.5) * 0.13 - 0.15, (4.5 - row) * 0.13, wave);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, i < wrong ? color.copy(RED).multiplyScalar(1.6) : color.copy(GOLD).multiplyScalar(1.3));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      const h = Math.max(0.02, sim.power) * 1.3;
      bar.scale.y = h;
      bar.position.y = -0.65 + h / 2;
    },
  };
}

/* ============================================================== studies */

/** Station 7 — the archive: one floating card per study, coloured by tier. */
function studiesHologram() {
  const group = new THREE.Group();
  const cards = STUDIES.map((study, i) => {
    const tierInfo = TIERS.find((t) => t.id === study.tier) || TIERS[TIERS.length - 1];
    const rows = 3;
    const perRow = Math.ceil(STUDIES.length / rows);
    const row = i % rows;
    const k = Math.floor(i / rows);
    const a = (k / perRow) * Math.PI * 2;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(tierInfo.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    card.position.set(Math.cos(a) * 0.95, (row - 1) * 0.36, Math.sin(a) * 0.95);
    card.lookAt(0, card.position.y, 0);
    group.add(card);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(card.geometry), new THREE.LineBasicMaterial({ color: hot(GOLD, 1.6) }));
    card.add(edge);
    return { card, study };
  });
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.15 * s.speed + s.lookX * 0.6;
      for (const { card, study } of cards) {
        const match = (!s.studyTier || study.tier === s.studyTier) && (!s.studyPeptide || study.peptide === s.studyPeptide);
        const picked = s.studyPicked === study.id;
        card.material.opacity = picked ? 1 : match ? 0.6 : 0.06;
        card.scale.setScalar(picked ? 1.6 + 0.1 * Math.sin(t * 5) : 1);
      }
    },
  };
}

/* =============================================================== studio */

/** Station 8 — a holographic phone posting the current asset. */
function studioHologram() {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 480;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.16), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  group.add(screen);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.68, 1.22, 0.04)), new THREE.LineBasicMaterial({ color: hot(GOLD, 2.2) }));
  group.add(frame);
  const icons = ['▤', '▶', '✉', '⚡', '?', '✓'].map((glyph, i) => {
    const sprite = label(glyph, { size: 64, width: 128, color: i % 2 ? '#6fd3ff' : '#f3d08a' });
    sprite.scale.set(0.16, 0.16, 1);
    group.add(sprite);
    return sprite;
  });
  let drawn = null;
  const draw = (asset) => {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#04070d';
    ctx.fillRect(0, 0, 256, 480);
    ctx.fillStyle = '#f0b75a';
    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.fillText(asset ? asset.label.toUpperCase() : 'CONTENT STUDIO', 14, 30);
    ctx.fillStyle = asset?.blocked ? '#ff5a5a' : '#3ef0b4';
    ctx.fillRect(14, 40, 228, 3);
    const wrap = (text, x, y, max, lineHeight, font, color, lines) => {
      ctx.font = font;
      ctx.fillStyle = color;
      const words = String(text || '').split(/\s+/);
      let line = '';
      let n = 0;
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > max && line) {
          ctx.fillText(line, x, y + n * lineHeight);
          line = word;
          n += 1;
          if (n >= lines) return y + n * lineHeight;
        } else line = test;
      }
      if (line && n < lines) { ctx.fillText(line, x, y + n * lineHeight); n += 1; }
      return y + n * lineHeight;
    };
    const y = wrap(asset?.title || 'Pick a compound and a study.', 14, 72, 228, 22, '700 18px Inter, system-ui, sans-serif', '#ecf0f8', 4);
    wrap(asset?.body || '', 14, y + 14, 228, 17, '400 13px Inter, system-ui, sans-serif', 'rgba(214,222,238,0.8)', 17);
    texture.needsUpdate = true;
  };
  draw(null);
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.4) * 0.35 + s.lookX * 0.5;
      const asset = s.studio?.asset || null;
      const key = asset ? `${asset.id}:${asset.title}` : null;
      if (key !== drawn) { drawn = key; draw(asset); }
      icons.forEach((sprite, i) => {
        const a = t * 0.7 + (i / icons.length) * Math.PI * 2;
        sprite.position.set(Math.cos(a) * 0.62, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 0.3 + 0.1);
      });
    },
  };
}

export const EXTRA_HOLOGRAMS = {
  chamber: colinHologram,
  map: mapHologram,
  compare: compareHologram,
  debate: debateHologram,
  myth: mythHologram,
  simulator: simulatorHologram,
  studies: studiesHologram,
  studio: studioHologram,
};
