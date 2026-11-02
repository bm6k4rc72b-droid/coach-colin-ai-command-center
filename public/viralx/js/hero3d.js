/**
 * ViralX hero: a neural brain made of glowing points, wrapped in a chrome film strip, among
 * pink crystal shards, with bloom. It follows the pointer, pauses off-screen and renders one
 * still frame when the viewer prefers reduced motion.
 *
 * @module viralx/hero3d
 */
import * as THREE from 'three';
import { EffectComposer } from '../../vision-kit/vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vision-kit/vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vision-kit/vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vision-kit/vendor/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../../vision-kit/vendor/addons/environments/RoomEnvironment.js';

const PINK = new THREE.Color('#ff4fd8');
const LILAC = new THREE.Color('#c9a7ff');

/** Deterministic random so the brain looks the same on every visit. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Points on two lobes with folded (gyri-like) surface detail. */
function brainPoints(n = 5200) {
  const r = rng(11), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    let x = s * Math.cos(th), y = u, z = s * Math.sin(th);
    const fold = 1 + 0.07 * Math.sin(9 * x + 4 * y) * Math.cos(8 * z - 3 * y) + 0.04 * Math.sin(17 * y + 5 * z);
    const side = x >= 0 ? 1 : -1;
    x = (x * 0.62 + side * 0.08) * fold;
    y = y * 0.62 * fold * (z < -0.3 ? 0.9 : 1);
    z = z * 0.95 * fold;
    if (y < -0.35 && z < -0.2) { y *= 0.7; } // flatten the underside like a temporal lobe
    const k = 1.25;
    pos.set([x * k, y * k, z * k], i * 3);
    const c = PINK.clone().lerp(LILAC, r() * 0.55).multiplyScalar(0.6 + r() * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  return { pos, col };
}

/** Synapse lines between near neighbours (sparse, so it stays cheap on phones). */
function synapses(pos, max = 900, dist = 0.16) {
  const r = rng(5), out = [], n = pos.length / 3;
  for (let tries = 0; out.length < max * 6 && tries < max * 40; tries++) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    if (a !== b && dx * dx + dy * dy + dz * dz < dist * dist) out.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
  }
  return new Float32Array(out);
}

/** Film-strip texture: frames with sprocket holes, drawn once on a canvas. */
function filmTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0c0a10'; g.fillRect(0, 0, c.width, c.height);
  for (let x = 0; x < c.width; x += 32) { g.fillStyle = '#f5d9ef'; g.fillRect(x + 10, 8, 14, 12); g.fillRect(x + 10, 108, 14, 12); }
  const grd = (x) => { const l = g.createLinearGradient(x, 0, x + 150, 128); l.addColorStop(0, '#ff4fd8'); l.addColorStop(0.5, '#3a1840'); l.addColorStop(1, '#c9a7ff'); return l; };
  for (let x = 6; x < c.width; x += 170) { g.fillStyle = grd(x); g.globalAlpha = 0.55; g.fillRect(x, 28, 158, 72); g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.strokeRect(x + 0.5, 28.5, 158, 72); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function mountHero(canvas) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.15, 6.2);

  const stage = new THREE.Group(); scene.add(stage);
  const root = new THREE.Group(); stage.add(root);

  // Brain.
  const { pos, col } = brainPoints();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pm = new THREE.PointsMaterial({ size: 0.024, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const brain = new THREE.Points(pg, pm); root.add(brain);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(synapses(pos), 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PINK, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  root.add(lines);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), new THREE.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.08 }));
  core.scale.set(1.3, 0.95, 1.4); root.add(core);

  // Film ring: chrome edges + film band.
  const ring = new THREE.Group(); ring.rotation.set(0.42, 0, -0.22); root.add(ring);
  const film = filmTexture(); film.repeat.set(3, 1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.34, 160, 1, true),
    new THREE.MeshStandardMaterial({ map: film, metalness: 0.6, roughness: 0.25, side: THREE.DoubleSide, emissive: '#ff4fd8', emissiveIntensity: 0.12, emissiveMap: film }));
  ring.add(band);
  const chrome = new THREE.MeshStandardMaterial({ color: '#f4e8f2', metalness: 1, roughness: 0.12 });
  for (const y of [-0.175, 0.175]) { const tor = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.012, 8, 200), chrome); tor.rotation.x = Math.PI / 2; tor.position.y = y; ring.add(tor); }

  // Crystal shards.
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c2449e', metalness: 0.2, roughness: 0.08, transmission: 0.35, thickness: 0.5, ior: 1.7, iridescence: 1, iridescenceIOR: 1.5, clearcoat: 1, emissive: '#5a0f4a', emissiveIntensity: 0.25, envMapIntensity: 0.9, transparent: true, opacity: 0.85 });
  const r = rng(3), shards = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 + r() * 0.14, 0), glass);
    m.scale.y = 1.6 + r() * 1.2;
    const a = r() * Math.PI * 2, d = 2.6 + r() * 1.6;
    m.position.set(Math.cos(a) * d, (r() - 0.5) * 2.6, Math.sin(a) * d * 0.6 - 0.8);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.userData = { spin: 0.2 + r() * 0.6, bob: r() * 6 };
    shards.push(m); stage.add(m);
  }

  // Dust.
  const dn = 600, dp = new Float32Array(dn * 3);
  for (let i = 0; i < dn; i++) dp.set([(r() - 0.5) * 14, (r() - 0.5) * 8, (r() - 0.5) * 8 - 2], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.02, color: '#ffb3ee', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  scene.add(new THREE.AmbientLight('#ffffff', 0.3));
  const key = new THREE.PointLight('#ff4fd8', 30, 20); key.position.set(3, 2, 3); scene.add(key);
  const rim = new THREE.PointLight('#c9a7ff', 20, 20); rim.position.set(-3, -1, 2); scene.add(rim);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h;
    // Wide screens: copy on the left, brain on the right. Phones: brain above the copy.
    const wide = w / h >= 1.15 && w >= 980;
    camera.position.z = wide ? 6.4 : 9.2;
    stage.position.set(wide ? 1.75 : 0, wide ? 0.05 : 2.05, 0);
    stage.scale.setScalar(wide ? 1 : 0.82);
    camera.updateProjectionMatrix();
  };
  size(); addEventListener('resize', size);

  const ptr = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; });

  let visible = true, raf = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduced && !raf) loop(); }).observe(canvas);
  const clock = new THREE.Clock();
  const frame = (t) => {
    root.rotation.y = t * 0.18 + ptr.x * 0.5;
    root.rotation.x = ptr.y * 0.25;
    ring.rotation.y = -t * 0.35;
    film.offset.x = -t * 0.05;
    pm.size = 0.022 + 0.004 * Math.sin(t * 2.2);
    lines.material.opacity = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3.1));
    for (const s of shards) { s.rotation.y += 0.004 * s.userData.spin; s.position.y += Math.sin(t + s.userData.bob) * 0.0015; }
    dust.rotation.y = t * 0.01;
    composer.render();
  };
  // Paused while off-screen or while the on-device AI is working (body[data-busy]), so the
  // GPU goes to MediaPipe and the encoder instead of the decoration.
  const busy = () => document.body.dataset.busy === '1';
  const loop = () => { raf = 0; if (!visible || busy()) return; frame(clock.getElapsedTime()); raf = requestAnimationFrame(loop); };
  new MutationObserver(() => { if (!busy() && visible && !reduced && !raf) loop(); }).observe(document.body, { attributes: true, attributeFilter: ['data-busy'] });
  if (reduced) frame(1.2); else loop();
  return { renderer };
}
