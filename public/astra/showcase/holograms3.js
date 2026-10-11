/**
 * Holograms for the International Translation Hub and Courtroom Sector 7.
 *
 * Both are Colin again, cut out of the user's own plates by the same key as
 * the receptionist: the interpreter in his sombrero, with a language network
 * spinning beside him and "hello" orbiting in twelve scripts; and the judge
 * in his robes, with a golden gavel that really strikes, scales that tip
 * with the scorecard and a jury of twelve lights.
 *
 * @module astra/showcase/holograms3
 */

import * as THREE from 'three';
import { PLATES } from './sections.js';
import { cutout, animateCutout, voiceRings } from './holograms.js';
import { CITIES, GREETINGS, HUB_LANGS } from './hub.js';
import { JURY_SIZE } from './court.js';
import { DOT, GOLD, ICE, glow, hot, label, mulberry32 } from './kit.js';

const RED = new THREE.Color('#ff5a5a');
const GREEN = new THREE.Color('#3ef0b4');

function latLon(lat, lon, r) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Points along a great-circle arc, lifted off the surface in the middle. */
function arcPoints(a, b, radius, lift = 0.3, steps = 40) {
  const ua = a.clone().normalize();
  const ub = b.clone().normalize();
  const angle = ua.angleTo(ub);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    // Slerp on the unit sphere: sin((1−u)θ)/sinθ · a + sin(uθ)/sinθ · b.
    const s = Math.sin(angle) || 1;
    const p = ua.clone().multiplyScalar(Math.sin((1 - u) * angle) / s).add(ub.clone().multiplyScalar(Math.sin(u * angle) / s));
    return p.normalize().multiplyScalar(radius * (1 + lift * Math.sin(Math.PI * u) * angle / Math.PI));
  });
}

/* =========================================================== the hub */

/**
 * Where the interpreter stands in the hub plate (UV, v up): both sombreros,
 * the man in front and his hologram behind, below the sign.
 */
const HUB_CROP = { u0: 0.37, u1: 0.63, v0: 0.0, v1: 0.885 };

function hubHologram() {
  const group = new THREE.Group();
  const { body, layers } = cutout({
    src: PLATES.hub, crop: HUB_CROP, height: 2.3, warm: 0, key: [0.05, 0.2], mask: [0.5, 0.45, 0.72, 0.68], tint: 0.1, lift: 0.55,
  });
  body.position.x = -0.18;
  group.add(body);
  const rings = voiceRings(group);

  // The network globe, beside him at chest height.
  const net = new THREE.Group();
  net.position.set(0.82, -0.25, 0.25);
  group.add(net);
  const R = 0.34;
  const spin = new THREE.Group();
  net.add(spin);
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 32, 20), new THREE.MeshBasicMaterial({ color: 0x041424, transparent: true, opacity: 0.6 })));
  const grid = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = 0; lon < 360; lon += 6) grid.push(latLon(lat, lon, R), latLon(lat, lon + 6, R));
  for (let lon = 0; lon < 360; lon += 30) for (let lat = -84; lat < 84; lat += 6) grid.push(latLon(lat, lon, R), latLon(lat + 6, lon, R));
  spin.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(grid), new THREE.LineBasicMaterial({ color: hot(ICE, 0.9), transparent: true, opacity: 0.35 })));
  const nodes = CITIES.map((city) => {
    const at = latLon(city.lat, city.lon, R * 1.01);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshBasicMaterial({ color: hot(ICE, 2) }));
    dot.position.copy(at);
    spin.add(dot);
    return { city, at, dot };
  });
  // Every city is wired to London, dimly; the active pair gets a bright arc.
  const hubNode = nodes[0];
  const web = [];
  for (const n of nodes.slice(1)) {
    const pts = arcPoints(hubNode.at, n.at, R, 0.35, 24);
    for (let i = 0; i < pts.length - 1; i += 1) web.push(pts[i], pts[i + 1]);
  }
  spin.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(web), new THREE.LineBasicMaterial({ color: hot(GOLD, 0.9), transparent: true, opacity: 0.28 })));
  const active = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: hot(GOLD, 2.4) }));
  spin.add(active);
  const packet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshBasicMaterial({ color: hot(GOLD, 3) }));
  spin.add(packet);
  let pair = '';
  let path = [];
  const halo = new THREE.Mesh(new THREE.TorusGeometry(R * 1.35, 0.006, 6, 96), new THREE.MeshBasicMaterial({ color: hot(ICE, 1.6) }));
  halo.rotation.x = Math.PI / 2.3;
  net.add(halo);

  // "Hello" in twelve scripts, orbiting him.
  const greetings = HUB_LANGS.map((lang, i) => {
    const sprite = label(GREETINGS[lang.id], { size: 40, width: 384, color: '#ffffff' });
    sprite.scale.multiplyScalar(0.62);
    group.add(sprite);
    return { lang: lang.id, sprite, base: sprite.scale.clone(), phase: (i / HUB_LANGS.length) * Math.PI * 2, y: -0.85 + (i % 4) * 0.42 };
  });
  const gold = new THREE.Color('#ffd27a');
  const ice = new THREE.Color('#bfe9ff');

  return {
    group,
    update(t, s) {
      const speak = s.speak || 0;
      const hub = s.hub || {};
      animateCutout(layers, t, speak);
      body.rotation.y = s.lookX * 0.22;
      body.position.y = 0.08 + 0.03 * Math.sin(t * 1.2);
      rings(t, speak);
      spin.rotation.y = t * 0.25 + s.lookX * 0.6;
      spin.rotation.x = 0.3 + s.lookY * 0.2;
      halo.rotation.z = t * 0.6;
      const source = hub.pairFrom || hub.from;
      const key = `${source}>${hub.to}`;
      if (key !== pair) {
        pair = key;
        const a = nodes.find((n) => n.city.lang === source) || nodes[0];
        const b = nodes.find((n) => n.city.lang === hub.to && n !== a) || nodes[2];
        path = arcPoints(a.at, b.at, R, 0.55, 48);
        active.geometry.dispose();
        active.geometry = new THREE.BufferGeometry().setFromPoints(path);
        for (const n of nodes) n.dot.scale.setScalar(n === a || n === b ? 2.2 : 1);
      }
      // A packet runs the arc; just after a translation it runs fast and bright.
      const since = t - (hub.at ?? -10);
      const fast = since < 2;
      const u = (t * (fast ? 1.2 : 0.35)) % 1;
      packet.position.copy(path[Math.floor(u * (path.length - 1))] || new THREE.Vector3());
      packet.scale.setScalar(fast ? 1.8 : 1);
      active.material.color.copy(GOLD).multiplyScalar(fast ? 3.2 : 1.8);
      greetings.forEach((g) => {
        const a = g.phase + t * 0.22;
        g.sprite.position.set(Math.cos(a) * 1.1 - 0.1, g.y + 0.05 * Math.sin(t + g.phase), Math.sin(a) * 0.55);
        const on = g.lang === source || g.lang === hub.to;
        g.sprite.material.color.copy(on ? gold : ice);
        g.sprite.material.opacity = (Math.sin(a) > -0.2 ? 1 : 0.45) * (on ? 1 : 0.75);
        g.sprite.scale.copy(g.base).multiplyScalar(on ? 1.15 : 0.95);
      });
    },
  };
}

/* ======================================================= the courtroom */

/** The judge in the court plate (UV, v up): from the bench to below the sign. */
const COURT_CROP = { u0: 0.31, u1: 0.65, v0: 0.15, v1: 0.86 };

function goldMaterial(envMap) {
  return new THREE.MeshStandardMaterial({ color: 0xf0c060, metalness: 1, roughness: 0.22, envMap, envMapIntensity: 1.4, emissive: 0x6a4210, emissiveIntensity: 0.55 });
}

/** A gavel on its sound block; `strike(dt)` gives the head's angle at dt seconds after a blow. */
function gavel(envMap) {
  const group = new THREE.Group();
  const metal = goldMaterial(envMap);
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.07, 40), metal);
  group.add(block);
  const blockRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.006, 6, 48), new THREE.MeshBasicMaterial({ color: hot(GOLD, 2) }));
  blockRim.rotation.x = Math.PI / 2;
  blockRim.position.y = 0.036;
  group.add(blockRim);
  // The pivot sits at the end of the handle; the head swings down on to the block.
  const pivot = new THREE.Group();
  pivot.position.set(0.42, 0.13, 0);
  group.add(pivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.42, 16), metal);
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.21;
  pivot.add(handle);
  const head = new THREE.Group();
  head.position.x = -0.42;
  pivot.add(head);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 28), metal);
  head.add(barrel);
  for (const y of [-0.085, 0.085]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.057, 0.008, 8, 28), new THREE.MeshBasicMaterial({ color: hot(GOLD, 2.2) }));
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    head.add(band);
  }
  head.rotation.x = Math.PI / 2;
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.23, 48), glow(hot(GOLD, 2.4), 0));
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = 0.04;
  group.add(shock);
  return {
    group,
    update(t, gavelAt) {
      const dt = t - gavelAt;
      let angle = 0.06;
      if (dt >= 0 && dt < 0.18) angle = 0.06 + 0.9 * (dt / 0.18); // lift
      else if (dt >= 0.18 && dt < 0.26) angle = 0.96 * (1 - (dt - 0.18) / 0.08); // strike
      else if (dt >= 0.26 && dt < 0.5) angle = 0.08 * Math.sin((dt - 0.26) * 26) * (0.5 - dt) * 4; // rebound
      pivot.rotation.z = -angle;
      const after = dt - 0.26;
      shock.material.opacity = after > 0 && after < 0.6 ? 0.9 * (1 - after / 0.6) : 0;
      shock.scale.setScalar(1 + Math.max(0, after) * 4);
    },
  };
}

/** Scales of justice: the side with the higher score sinks. */
function scales(envMap) {
  const group = new THREE.Group();
  const metal = goldMaterial(envMap);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.62, 12), metal);
  post.position.y = 0.31;
  group.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.03, 32), metal);
  group.add(foot);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), metal);
  finial.position.y = 0.65;
  group.add(finial);
  const beam = new THREE.Group();
  beam.position.y = 0.6;
  group.add(beam);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 10), metal);
  bar.rotation.z = Math.PI / 2;
  beam.add(bar);
  const pans = [[-0.25, GOLD], [0.25, ICE]].map(([x, colour]) => {
    const pan = new THREE.Group();
    group.add(pan);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), metal);
    dish.position.y = -0.2;
    pan.add(dish);
    const chains = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([0, 2.1, 4.2].flatMap((a) => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 0.07, -0.2, Math.sin(a) * 0.07)])),
      new THREE.LineBasicMaterial({ color: hot(GOLD, 1.4) }),
    );
    pan.add(chains);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: hot(colour, 2.2) }));
    orb.position.y = -0.17;
    pan.add(orb);
    return { pan, x, orb };
  });
  let tilt = 0;
  return {
    group,
    update(totals) {
      const a = totals?.a ?? 0;
      const b = totals?.b ?? 0;
      // Positive z-rotation lowers the left (Defence) arm.
      const target = a + b ? THREE.MathUtils.clamp((a - b) / (a + b), -1, 1) * 0.32 : 0;
      tilt += (target - tilt) * 0.05;
      beam.rotation.z = tilt;
      for (const p of pans) {
        p.pan.position.set(p.x * Math.cos(tilt), 0.6 + p.x * Math.sin(tilt), 0);
        p.orb.scale.setScalar(1 + (p.x < 0 ? a : b) / Math.max(30, a + b));
      }
    },
  };
}

function courtHologram(envMap) {
  const group = new THREE.Group();
  const { body, layers } = cutout({
    src: PLATES.court, crop: COURT_CROP, height: 2.3, warm: 0, key: [0.08, 0.3], mask: [0.5, 0.5, 0.74, 0.78], tint: 0.1, lift: 0.35,
  });
  group.add(body);
  const rings = voiceRings(group);

  const g = gavel(envMap);
  g.group.position.set(0.78, -1.02, 0.42);
  g.group.rotation.y = -0.5;
  group.add(g.group);
  const sc = scales(envMap);
  sc.group.position.set(-0.85, -1.05, 0.35);
  group.add(sc.group);

  // Counsel: Defence (gold) and Prosecution (ice) lights at the front.
  const counsel = [[-0.42, GOLD], [0.42, ICE]].map(([x, colour]) => {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), new THREE.MeshBasicMaterial({ color: hot(colour, 2) }));
    orb.position.set(x, -1.12, 0.78);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.095, 40), glow(hot(colour, 1.8), 0.6));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -1.2, 0.78);
    group.add(orb, ring);
    return { orb, ring };
  });

  // The jury box: twelve seats on an arc behind the bench.
  const jurors = Array.from({ length: JURY_SIZE }, (_, i) => {
    const a = Math.PI * (0.18 + (0.64 * i) / (JURY_SIZE - 1));
    const seat = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0x445566, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    seat.position.set(Math.cos(a) * 1.15, -0.9 + (i % 2) * 0.12, -Math.sin(a) * 0.55);
    seat.scale.setScalar(0.12);
    group.add(seat);
    return seat;
  });

  // An objection flash: a ring round the bench, red when sustained, ice when overruled.
  const flash = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.012, 6, 120), new THREE.MeshBasicMaterial({ color: hot(RED, 2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.rotation.x = Math.PI / 2;
  flash.position.y = -1.1;
  group.add(flash);
  const rand = mulberry32(77);
  const motes = Array.from({ length: 30 }, () => [rand() * Math.PI * 2, 0.3 + rand() * 0.6, rand()]);
  const dust = new THREE.Points(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(motes.length * 3), 3)),
    new THREE.PointsMaterial({ map: DOT, size: 0.04, color: hot(GOLD, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  group.add(dust);

  return {
    group,
    update(t, s) {
      const speak = s.speak || 0;
      const kase = s.court;
      animateCutout(layers, t, speak);
      body.rotation.y = s.lookX * 0.2;
      body.position.y = 0.025 * Math.sin(t * 1.1);
      rings(t, speak);
      g.update(t, kase?.gavelAt ?? -10);
      sc.update(kase?.totals);
      counsel.forEach((c, i) => {
        const turn = kase && !kase.closed && kase.turn === (i ? 'b' : 'a');
        c.orb.scale.setScalar(1 + (turn ? 0.35 * (0.5 + 0.5 * Math.sin(t * 7)) : 0));
        c.ring.material.opacity = turn ? 0.9 : 0.35;
      });
      const seats = kase?.jury || [];
      jurors.forEach((seat, i) => {
        const v = seats[i];
        seat.material.color.copy(v === 'a' ? GOLD : v === 'b' ? ICE : new THREE.Color(0x334455)).multiplyScalar(v ? 1.8 : 1);
        seat.scale.setScalar(v ? 0.16 + 0.02 * Math.sin(t * 3 + i) : 0.1);
      });
      const o = kase?.objection;
      const since = o ? t - o.at : 99;
      flash.material.opacity = since < 1.2 ? 0.9 * (1 - since / 1.2) : 0;
      flash.material.color.copy(o?.sustained ? RED : ICE).multiplyScalar(2);
      flash.scale.setScalar(1 + Math.max(0, since) * 0.3);
      const array = dust.geometry.attributes.position.array;
      motes.forEach(([a, r, d], i) => {
        const life = (t * 0.1 + d) % 1;
        array[i * 3] = Math.cos(a + t * 0.1) * r;
        array[i * 3 + 1] = -1 + life * 2.4;
        array[i * 3 + 2] = Math.sin(a + t * 0.1) * r * 0.5;
      });
      dust.geometry.attributes.position.needsUpdate = true;
      if (kase?.verdict) {
        const w = kase.verdict.winner;
        (w === 'a' ? counsel[0] : w === 'b' ? counsel[1] : null)?.orb.material.color.copy(GREEN).multiplyScalar(2.4);
      } else {
        counsel[0].orb.material.color.copy(GOLD).multiplyScalar(2);
        counsel[1].orb.material.color.copy(ICE).multiplyScalar(2);
      }
    },
  };
}

export const COURT_HOLOGRAMS = {
  translate: hubHologram,
  arena: courtHologram,
};
