// NEUROLENS · Noir Luxe entrance — by Coach Colin.
//
// A 3D neural orb behind the start card: a lattice of ~900 neurons on a
// gently breathing sphere, wired to their nearest neighbours, with synaptic
// pulses running the wires; a polished gold core inside an iridescent glass
// shell; three gold orbit rings. The orb follows the pointer, spins when
// dragged (with inertia), and fires a burst of pulses on a tap.
//
// Stopped and disposed the moment the visitor enters the lab, so it never
// competes with the brain atlas for the GPU.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GOLD = new THREE.Color('#e9c27a');
const ROSE = new THREE.Color('#ff4fa3');
const CHAMPAGNE = new THREE.Color('#fff1d6');

/** Points spread evenly over a sphere (Fibonacci lattice). */
export function fibonacciSphere(n, r = 1) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts.push(new THREE.Vector3(Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r));
  }
  return pts;
}

/** Each point joined to its k nearest neighbours (undirected, de-duplicated). */
export function nearestEdges(pts, k = 3) {
  const seen = new Set();
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const near = [];
    for (let j = 0; j < pts.length; j++) if (j !== i) near.push([pts[i].distanceToSquared(pts[j]), j]);
    near.sort((a, b) => a[0] - b[0]);
    for (let m = 0; m < k; m++) {
      const j = near[m][1];
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  return edges;
}

function glow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createHero(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x07060a, 1);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.2, 8.4);

  const orb = new THREE.Group(); scene.add(orb);
  const tex = glow();
  const N = matchMedia('(max-width: 700px)').matches ? 520 : 880;
  const base = fibonacciSphere(N, 1.75);
  // Organic jitter so it reads as tissue, not a golf ball.
  base.forEach((p, i) => p.multiplyScalar(1 + 0.06 * Math.sin(i * 12.9898) * Math.cos(i * 4.1414)));
  const edges = nearestEdges(base, 3);

  // Neurons.
  const npos = new Float32Array(N * 3); const ncol = new Float32Array(N * 3);
  base.forEach((p, i) => {
    npos.set([p.x, p.y, p.z], i * 3);
    const c = GOLD.clone().lerp(CHAMPAGNE, (i * 0.618) % 1 * 0.6).lerp(ROSE, i % 11 === 0 ? 0.7 : 0);
    ncol.set([c.r, c.g, c.b], i * 3);
  });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(npos, 3));
  ng.setAttribute('color', new THREE.BufferAttribute(ncol, 3));
  const neurons = new THREE.Points(ng, new THREE.PointsMaterial({ size: 0.07, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  orb.add(neurons);

  // Axons.
  const lpos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], e) => { lpos.set([base[a].x, base[a].y, base[a].z, base[b].x, base[b].y, base[b].z], e * 6); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  const axons = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  orb.add(axons);

  // Synaptic pulses: sprites that run along random axons.
  const P = 90;
  const ppos = new Float32Array(P * 3); const pcol = new Float32Array(P * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
  const pulsePts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.16, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  orb.add(pulsePts);
  const pulses = Array.from({ length: P }, () => ({ e: (Math.random() * edges.length) | 0, u: Math.random(), v: 0.4 + Math.random() * 1.1, hot: 0 }));

  // Gold core and iridescent glass shell.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshPhysicalMaterial({ color: '#d9a85a', metalness: 1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, flatShading: true }));
  orb.add(core);
  // Iridescent glass shell. No transmission pass: on a transparent canvas it renders as a grey veil.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.08, 64, 48), new THREE.MeshPhysicalMaterial({
    color: '#1a1216', metalness: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 620], transparent: true, opacity: 0.35, depthWrite: false,
  }));
  orb.add(shell);

  // Gold orbit rings.
  const rings = [[2.35, 0.32, 0.1], [2.7, -0.42, 0.6], [3.1, 0.12, -0.5]].map(([r, tx, tz], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008 + i * 0.002, 12, 220), new THREE.MeshPhysicalMaterial({ color: i === 1 ? '#f1d9a8' : '#e2b765', metalness: 1, roughness: 0.22, emissive: '#3a2608', emissiveIntensity: 0.5 }));
    m.rotation.set(Math.PI / 2 + tx, 0, tz);
    scene.add(m);
    return m;
  });

  // Gold dust.
  const D = 700; const dpos = new Float32Array(D * 3);
  for (let i = 0; i < D; i++) dpos.set([(Math.random() - 0.5) * 22, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12 - 3], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#f3d38f', size: 0.035, map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  const key = new THREE.DirectionalLight('#fff1d6', 2.2); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#ff4fa3', 1.4); rim.position.set(-5, -1, -3); scene.add(rim);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.45, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Interaction state.
  const st = { mx: 0, my: 0, tx: 0, ty: 0, spinY: 0, spinX: 0, vy: 0.12, vx: 0, drag: null, burst: 0, running: true, t: 0 };
  const onMove = (e) => {
    st.mx = (e.clientX / innerWidth) * 2 - 1; st.my = (e.clientY / innerHeight) * 2 - 1;
    if (st.drag) {
      const dx = e.clientX - st.drag.x; const dy = e.clientY - st.drag.y;
      st.vy = dx * 0.006; st.vx = dy * 0.004; st.drag = { x: e.clientX, y: e.clientY };
    }
  };
  const onDown = (e) => {
    if (e.target.closest('.start-card, button, input, label, a')) return;
    st.drag = { x: e.clientX, y: e.clientY }; st.burst = 1;
    for (const p of pulses) { p.hot = 1; p.v = 1.2 + Math.random() * 1.6; }
  };
  const onUp = () => { st.drag = null; };
  addEventListener('pointermove', onMove);
  addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);

  const resize = () => {
    const w = innerWidth; const h = innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.resolution.set(w, h);
    camera.aspect = w / h;
    // Keep the whole orb in frame on a tall phone.
    camera.position.z = w / h < 0.8 ? 11.5 : 8.4;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  const speed = reduced ? 0.25 : 1;
  let last = performance.now();
  const tmp = new THREE.Vector3();
  function frame(now) {
    if (!st.running) return;
    const dt = Math.min(0.05, (now - last) / 1000) * speed; last = now; st.t += dt;
    // Pointer parallax with easing.
    st.tx += (st.mx - st.tx) * Math.min(1, dt * 2.5); st.ty += (st.my - st.ty) * Math.min(1, dt * 2.5);
    camera.position.x = st.tx * 0.9; camera.position.y = 0.2 - st.ty * 0.6; camera.lookAt(0, 0, 0);
    // Spin with inertia back to an idle drift.
    if (!st.drag) { st.vy += (0.12 - st.vy) * Math.min(1, dt * 0.8); st.vx += (0 - st.vx) * Math.min(1, dt * 1.5); }
    st.spinY += st.vy * dt * 4; st.spinX = Math.max(-0.6, Math.min(0.6, st.spinX + st.vx * dt * 4));
    orb.rotation.set(st.spinX + Math.sin(st.t * 0.3) * 0.08, st.spinY, 0);
    // Breathing lattice.
    const b = 1 + Math.sin(st.t * 1.1) * 0.015;
    neurons.scale.setScalar(b); axons.scale.setScalar(b); pulsePts.scale.setScalar(b);
    core.rotation.set(st.t * 0.2, st.t * 0.33, 0);
    shell.material.iridescenceThicknessRange = [180 + Math.sin(st.t * 0.5) * 60, 620 + Math.cos(st.t * 0.4) * 80];
    rings.forEach((r, i) => { r.rotation.z += dt * (0.05 + i * 0.03) * (i % 2 ? -1 : 1); });
    dust.rotation.y += dt * 0.01;
    // Pulses.
    st.burst = Math.max(0, st.burst - dt * 0.8);
    axons.material.opacity = 0.14 + st.burst * 0.25;
    bloom.strength = 0.7 + st.burst * 0.5;
    for (let i = 0; i < P; i++) {
      const p = pulses[i];
      p.u += dt * p.v;
      if (p.u >= 1) {
        // Hop to an axon that leaves the node just reached, so pulses travel as chains.
        const [, end] = edges[p.e];
        const next = edges.findIndex((ed, k) => k !== p.e && (ed[0] === end || ed[1] === end));
        p.e = next >= 0 && Math.random() < 0.85 ? next : (Math.random() * edges.length) | 0;
        if (edges[p.e][1] === end) edges[p.e].reverse();
        p.u = 0; p.hot = Math.max(0, p.hot - 0.3); p.v = Math.max(0.4, p.v * 0.92);
      }
      const [a, bb] = edges[p.e];
      tmp.copy(base[a]).lerp(base[bb], p.u);
      ppos.set([tmp.x, tmp.y, tmp.z], i * 3);
      const c = GOLD.clone().lerp(ROSE, p.hot * 0.8).multiplyScalar(0.6 + Math.sin(p.u * Math.PI) * 0.9);
      pcol.set([c.r, c.g, c.b], i * 3);
    }
    pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    composer.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    stop() {
      st.running = false;
      removeEventListener('pointermove', onMove); removeEventListener('pointerdown', onDown); removeEventListener('pointerup', onUp); removeEventListener('resize', resize);
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.(); }); });
      pmrem.dispose(); composer.dispose?.(); renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
}
