/**
 * Holograms for the new wing: the half-life ribbon, the body holo-scan, the
 * regulatory globe, the influencer post, the debate arena and the pipeline.
 *
 * Same contract as holograms.js: `{ group, update(t, state) }`, plus an
 * optional `pickables` list and `pick(object)` for things you can tap.
 *
 * @module astra/showcase/holograms2
 */

import * as THREE from 'three';
import { PEPTIDES } from '../js/data/peptides.js';
import { READINGS } from './sections.js';
import { FUTURE, PK, REGIONS, REGULATORY, STAGES, STATUS, ZONES, simulatePK } from './wing.js';
import { DOT, GOLD, ICE, glow, hot, label, mulberry32 } from './kit.js';

const RED = new THREE.Color('#ff5a5a');
const GREEN = new THREE.Color('#3ef0b4');

/* ================================================================== PK */

/** The concentration curve as a glowing ribbon you can walk along. */
function pkHologram() {
  const group = new THREE.Group();
  const width = 2.2;
  const height = 1.2;
  const axis = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-width / 2, -0.6, 0), new THREE.Vector3(width / 2, -0.6, 0),
      new THREE.Vector3(-width / 2, -0.6, 0), new THREE.Vector3(-width / 2, -0.6 + height, 0),
    ]),
    new THREE.LineBasicMaterial({ color: hot(GOLD, 1.2) }),
  );
  group.add(axis);
  let tube = null;
  let doses = [];
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), new THREE.MeshBasicMaterial({ color: hot(ICE, 2.6) }));
  group.add(marker);
  // A cloud of "molecules" whose number follows the current concentration.
  const count = 260;
  const rand = mulberry32(9);
  const seeds = Array.from({ length: count }, () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand()]);
  const cloud = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.05, color: hot(GOLD, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  cloud.position.set(0, 0.95, 0);
  group.add(cloud);
  let key = '';
  let sim = null;
  let scaleY = 1;
  const build = (s) => {
    const drug = PK.find((d) => d.id === s.pk.drug) || PK[1];
    sim = simulatePK(drug, { interval: s.pk.interval, miss: s.pk.miss ? 2 : null, step: drug.halfLife < 1 ? 0.01 : 1, hours: drug.halfLife < 1 ? 0.5 : 24 * 7 * 6 });
    const max = Math.max(...sim.points.map((p) => p[1]), 1e-6);
    scaleY = height / max;
    const span = sim.points[sim.points.length - 1][0] || 1;
    const pts = sim.points.filter((_, i) => i % Math.max(1, Math.floor(sim.points.length / 400)) === 0)
      .map(([t, c]) => new THREE.Vector3(-width / 2 + (t / span) * width, -0.6 + c * scaleY, 0));
    if (tube) { group.remove(tube); tube.geometry.dispose(); }
    tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.018, 6, false), new THREE.MeshBasicMaterial({ color: hot(GOLD, 2) }));
    group.add(tube);
    for (const d of doses) group.remove(d);
    doses = sim.doses.map((t) => {
      const pip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 10), new THREE.MeshBasicMaterial({ color: hot(ICE, 2) }));
      pip.position.set(-width / 2 + (t / span) * width, -0.66, 0);
      group.add(pip);
      return pip;
    });
    sim.span = span;
  };
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.25) * 0.35 + s.lookX * 0.5;
      const k = `${s.pk.drug}:${s.pk.interval}:${s.pk.miss}`;
      if (k !== key) { key = k; build(s); }
      // The marker rides the curve, looping every 12 seconds.
      const f = (t / 12) % 1;
      const i = Math.min(sim.points.length - 1, Math.floor(f * sim.points.length));
      const [time, c] = sim.points[i];
      marker.position.set(-width / 2 + (time / sim.span) * width, -0.6 + c * scaleY, 0.02);
      const array = cloud.geometry.attributes.position.array;
      const shown = Math.round(count * Math.min(1, c / Math.max(1e-6, sim.peak || 1)));
      seeds.forEach(([x, y, z, d], j) => {
        const on = j < shown;
        const r = on ? 0.35 : 0;
        array[j * 3] = x * r + Math.sin(t + d * 9) * 0.03;
        array[j * 3 + 1] = y * r * 0.5;
        array[j * 3 + 2] = z * r;
      });
      cloud.geometry.attributes.position.needsUpdate = true;
    },
  };
}

/* ============================================================ holo-scan */

/** A full-body scan: tap an organ zone, and the compounds that touch it orbit. */
function scanHologram() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = -1.3;
  body.scale.setScalar(1.15);
  group.add(body);
  const wire = new THREE.MeshBasicMaterial({ color: hot(ICE, 0.8), wireframe: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const part = (geometry, x, y, z, rz = 0) => {
    const mesh = new THREE.Mesh(geometry, wire);
    mesh.position.set(x, y, z);
    mesh.rotation.z = rz;
    body.add(mesh);
  };
  part(new THREE.SphereGeometry(0.11, 14, 10), 0, 1.63, 0);
  part(new THREE.CapsuleGeometry(0.16, 0.42, 4, 12), 0, 1.13, 0);
  part(new THREE.CapsuleGeometry(0.14, 0.1, 4, 12), 0, 0.84, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.045, 0.28, 4, 8), side * 0.25, 1.22, 0, side * 0.18);
    part(new THREE.CapsuleGeometry(0.04, 0.26, 4, 8), side * 0.31, 0.9, 0.02, side * 0.08);
    part(new THREE.CapsuleGeometry(0.065, 0.36, 4, 8), side * 0.1, 0.5, 0);
    part(new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), side * 0.1, 0.12, 0);
  }
  // A scanning plane sweeps the figure top to bottom.
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.012), glow(hot(ICE, 2.2), 0.8));
  body.add(sweep);
  const zones = ZONES.map((zone) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(zone.r, 20, 14), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.4), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.set(...zone.at);
    mesh.userData.system = zone.id;
    body.add(mesh);
    return { id: zone.id, mesh };
  });
  // Compound orbs that orbit whichever zone is selected.
  const orbs = READINGS.map((reading) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035 + reading.score * 0.03, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(reading.band.accent).multiplyScalar(1.6) }));
    mesh.visible = false;
    group.add(mesh);
    return { id: reading.id, mesh, systems: PEPTIDES.find((p) => p.id === reading.id)?.systems || [] };
  });
  return {
    group,
    pickables: zones.map((z) => z.mesh),
    pick: (object) => object.userData.system,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.2) * 0.5 + s.lookX * 0.7;
      sweep.position.y = 0.05 + ((t * 0.35) % 1) * 1.65;
      const selected = s.scanSystem;
      for (const z of zones) {
        const on = z.id === selected;
        z.mesh.material.opacity = on ? 0.75 + 0.2 * Math.sin(t * 6) : 0.22;
        z.mesh.scale.setScalar(on ? 1.35 : 1);
      }
      const zone = ZONES.find((z) => z.id === selected);
      const lit = orbs.filter((o) => o.systems.includes(selected));
      for (const o of orbs) o.mesh.visible = false;
      if (!zone) return;
      const centre = new THREE.Vector3(...zone.at).multiplyScalar(1.15).add(new THREE.Vector3(0, -1.3, 0));
      lit.forEach((o, i) => {
        const a = t * 0.9 + (i / lit.length) * Math.PI * 2;
        o.mesh.visible = true;
        o.mesh.position.set(centre.x + Math.cos(a) * 0.45, centre.y + Math.sin(a * 1.7) * 0.12, centre.z + Math.sin(a) * 0.45);
      });
    },
  };
}

/* =============================================================== globe */

/** Latitude/longitude to a point on a sphere. */
function latLon(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** A gold-wire Earth with a marker per regulator, coloured by status. */
function globeHologram() {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const radius = 0.8;
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 0.985, 48, 32), new THREE.MeshBasicMaterial({ color: 0x06121f, transparent: true, opacity: 0.55 })));
  const lines = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon <= 360; lon += 4) lines.push(latLon(lat, lon, radius), latLon(lat, lon + 4, radius));
  for (let lon = 0; lon < 360; lon += 30) for (let lat = -88; lat < 88; lat += 4) lines.push(latLon(lat, lon, radius), latLon(lat + 4, lon, radius));
  spin.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: hot(GOLD, 0.9), transparent: true, opacity: 0.5 })));
  const markers = REGIONS.map((region) => {
    const at = latLon(region.lat, region.lon, radius * 1.01);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dot.position.copy(at);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), glow(hot(GOLD, 2), 0.7));
    beam.position.copy(at.clone().multiplyScalar(1.18));
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize());
    const tag = label(region.agency, { size: 40, width: 384 });
    tag.position.copy(at.clone().multiplyScalar(1.4));
    tag.scale.multiplyScalar(0.55);
    spin.add(dot, beam, tag);
    return { region, dot, beam };
  });
  // WADA: a ring round the planet — green if allowed in sport, red if banned.
  const wada = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.32, 0.012, 8, 160), new THREE.MeshBasicMaterial({ color: hot(GREEN, 1.6) }));
  wada.rotation.x = Math.PI / 2.4;
  group.add(wada);
  return {
    group,
    update(t, s) {
      spin.rotation.y = t * 0.18 * s.speed + s.lookX * 0.8;
      spin.rotation.x = 0.25 + s.lookY * 0.2;
      const table = REGULATORY[s.globeCompound] || {};
      for (const m of markers) {
        const status = STATUS[table[m.region.id] || 'untracked'];
        m.dot.material.color.set(status.color).multiplyScalar(1.6);
        m.beam.material.color.set(status.color).multiplyScalar(1.8);
        m.dot.scale.setScalar(1 + 0.25 * Math.sin(t * 4 + m.region.lat));
      }
      wada.rotation.z = t * 0.3;
      wada.material.color.copy(s.globeBanned ? RED : s.globeBanned === false ? GREEN : GOLD).multiplyScalar(1.6);
    },
  };
}

/* =============================================================== roast */

/** The influencer's post, line by line, each slab lit by its verdict. */
function roastHologram() {
  const group = new THREE.Group();
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.2, 1.7, 0.04)), new THREE.LineBasicMaterial({ color: hot(GOLD, 2) }));
  group.add(frame);
  const slabs = Array.from({ length: 6 }, (_, i) => {
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    slab.position.set(0, 0.55 - i * 0.24, 0.03);
    group.add(slab);
    return slab;
  });
  const gauge = new THREE.Group();
  gauge.position.set(0, -1.05, 0.05);
  group.add(gauge);
  gauge.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 64), glow(hot(GOLD, 0.6), 0.4)));
  let arc = null;
  let shown = -1;
  const colour = { holds: GREEN, fails: RED, hype: GOLD, neutral: ICE };
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.3) * 0.3 + s.lookX * 0.5;
      const r = s.roast;
      slabs.forEach((slab, i) => {
        const line = r?.lines?.[i];
        if (!line) { slab.material.opacity = 0; return; }
        const reading = s.roastLine === i;
        slab.material.color.copy(colour[line.verdict] || ICE).multiplyScalar(reading ? 2.2 : 1.1);
        slab.material.opacity = (reading ? 0.85 : 0.45) + 0.08 * Math.sin(t * 7 + i);
        slab.position.x = line.verdict === 'fails' ? Math.sin(t * 25 + i) * 0.01 : 0;
      });
      const score = r ? r.score / 100 : 0;
      if (Math.abs(score - shown) > 0.004) {
        shown = score;
        if (arc) { gauge.remove(arc); arc.geometry.dispose(); }
        arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 96, Math.max(0.001, Math.PI * 2 * score)), new THREE.MeshBasicMaterial({ color: (score > 0.7 ? GREEN : score > 0.4 ? GOLD : RED).clone().multiplyScalar(2) }));
        arc.rotation.z = Math.PI / 2;
        arc.scale.x = -1;
        gauge.add(arc);
      }
    },
  };
}

/* =============================================================== arena */

/** Two podiums, a tug-of-war beam between them, and the crowd. */
function arenaHologram(envMap) {
  const group = new THREE.Group();
  const sides = [[-0.75, GOLD], [0.75, ICE]].map(([x, color]) => {
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 32), new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.9, roughness: 0.3, envMap }));
    podium.position.set(x, -0.95, 0);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 20), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.1, envMap }));
    orb.position.set(x, -0.45, 0);
    group.add(podium, orb);
    return { orb };
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: hot(GOLD, 1.4) }));
  beam.position.y = -0.45;
  group.add(beam);
  const knot = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  knot.position.y = -0.45;
  group.add(knot);
  const crowd = 160;
  const rand = mulberry32(21);
  const seats = Array.from({ length: crowd }, () => [rand() * Math.PI, 0.9 + rand() * 0.35, rand() * 0.5]);
  const points = new THREE.Points(
    new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(seats.flatMap(([a, r, y]) => [Math.cos(a) * r, -0.9 + y, -Math.sin(a) * r * 0.6]), 3))
      .setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(crowd * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.06, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(points);
  let pos = 0;
  return {
    group,
    update(t, s) {
      group.rotation.y = Math.sin(t * 0.2) * 0.25 + s.lookX * 0.5;
      const a = s.arena?.totals?.a ?? 0;
      const b = s.arena?.totals?.b ?? 0;
      const target = a + b ? THREE.MathUtils.clamp((b - a) / (a + b), -1, 1) * 0.5 : 0;
      pos += (target - pos) * 0.05;
      knot.position.x = pos;
      knot.rotation.y = t * 2;
      sides[0].orb.scale.setScalar(1 + (s.arena?.turn === 'a' ? 0.15 * Math.sin(t * 8) : 0));
      sides[1].orb.scale.setScalar(1 + (s.arena?.turn === 'b' ? 0.15 * Math.sin(t * 8) : 0));
      const va = s.arena?.votes?.a || 0;
      const vb = s.arena?.votes?.b || 0;
      const share = va + vb ? va / (va + vb) : 0.5;
      const colours = points.geometry.attributes.color.array;
      for (let i = 0; i < crowd; i += 1) {
        const c = i / crowd < share ? GOLD : ICE;
        const flick = 0.6 + 0.4 * Math.sin(t * 3 + i);
        colours.set([c.r * flick * 1.6, c.g * flick * 1.6, c.b * flick * 1.6], i * 3);
      }
      points.geometry.attributes.color.needsUpdate = true;
    },
  };
}

/* ============================================================== future */

/** The pipeline: stage rings stacked upward, a capsule per candidate. */
function futureHologram() {
  const group = new THREE.Group();
  const rings = STAGES.slice().reverse().map((stage, i) => {
    const y = -0.95 + i * 0.45;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75 - i * 0.06, 0.01, 6, 96), new THREE.MeshBasicMaterial({ color: hot(i === STAGES.length - 1 ? GREEN : GOLD, 1.4) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
    const tag = label(stage.label, { size: 30, width: 512, color: i === STAGES.length - 1 ? '#3ef0b4' : '#f3d08a' });
    tag.position.set(0, y + 0.08, 0.8 - i * 0.06);
    tag.scale.multiplyScalar(0.75);
    group.add(tag);
    return { stage: stage.id, y, r: 0.75 - i * 0.06 };
  });
  const capsules = FUTURE.map((item) => {
    const ring = rings.find((r) => r.stage === item.stage);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.08, 4, 10), new THREE.MeshBasicMaterial({ color: item.stage === 'early' ? hot(ICE, 1.5) : hot(GOLD, 1.8) }));
    mesh.rotation.z = Math.PI / 2;
    group.add(mesh);
    return { item, mesh, ring };
  });
  return {
    group,
    update(t, s) {
      group.rotation.y = t * 0.12 * s.speed + s.lookX * 0.5;
      const byStage = {};
      for (const c of capsules) (byStage[c.item.stage] ||= []).push(c);
      for (const list of Object.values(byStage)) {
        list.forEach((c, i) => {
          const a = t * 0.4 + (i / list.length) * Math.PI * 2;
          const on = s.futurePicked === c.item.id;
          c.mesh.position.set(Math.cos(a) * c.ring.r, c.ring.y + (on ? 0.12 : 0), Math.sin(a) * c.ring.r);
          c.mesh.scale.setScalar(on ? 2.2 : 1);
        });
      }
    },
  };
}

export const WING_HOLOGRAMS = {
  pk: pkHologram,
  scan: scanHologram,
  globe: globeHologram,
  roast: roastHologram,
  arena: arenaHologram,
  future: futureHologram,
};
